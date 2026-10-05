// Meridian Flow v2 — deterministic scheduling engine.
// Arrival rule: patients are asked to arrive 15 minutes before their window.
// We never track departure or travel — only check-in (per product decision).

import { FlowState, ForecastEntry, PatientRecord, Proposal, fmt, fmtWin } from "./types";

export const ARRIVE_EARLY = 15;
const UNCERTAINTY_BUFFER = 5;

export function expectedArrival(p: PatientRecord): number | null {
  if (p.arrival === "ARRIVED" && p.arrivedAt != null) return p.arrivedAt;
  if (p.lateReply?.comingAt != null) return p.lateReply.comingAt;
  if (!p.agreedWindow) return null;
  return p.agreedWindow[0] - ARRIVE_EARLY;
}

const ACTIVE_PHASES = ["BOOKED", "IN_CONSULT", "COMPLETE"];

export function computeForecasts(state: FlowState): Map<string, ForecastEntry> {
  const out = new Map<string, ForecastEntry>();
  for (const c of state.clinicians) {
    const delay = state.clinicianDelays[c.id] ?? 0;
    const roster = state.patients
      .filter((p) => p.clinicianId === c.id && p.agreedWindow && ACTIVE_PHASES.includes(p.phase) && !p.onHold && (!p.visitDate || p.visitDate === "Tue 6 Oct"))
      .sort((a, b) => {
        // Emergency cases jump every queue (never interrupt an active consult).
        const ea = a.patientType === "emergency" ? 0 : 1;
        const eb = b.patientType === "emergency" ? 0 : 1;
        return ea !== eb ? ea - eb : a.agreedWindow![0] - b.agreedWindow![0];
      });

    let anchor = c.staffedFrom;
    for (const p of roster) {
      if ((p.phase === "IN_CONSULT" || p.phase === "COMPLETE") && p.consultStartedAt != null) {
        anchor = Math.max(anchor, p.consultEndedAt ?? p.consultStartedAt + p.durationEstimate);
      }
    }
    let cursor = anchor + delay;

    for (const p of roster) {
      let start: number;
      let end: number;
      if ((p.phase === "IN_CONSULT" || p.phase === "COMPLETE") && p.consultStartedAt != null) {
        start = p.consultStartedAt;
        end = p.consultEndedAt ?? start + p.durationEstimate;
      } else {
        start = Math.max(cursor, p.agreedWindow![0]);
        const arr = expectedArrival(p);
        if (arr != null) start = Math.max(start, arr + (p.arrival === "ARRIVED" ? 0 : ARRIVE_EARLY));
        if (start < c.breakTo && start + p.durationEstimate > c.breakFrom) start = Math.max(start, c.breakTo);
        end = start + p.durationEstimate + UNCERTAINTY_BUFFER;
      }
      cursor = Math.max(cursor, end);

      const arr = expectedArrival(p);
      out.set(p.id, {
        patientId: p.id,
        forecastStart: start,
        forecastEnd: end,
        expectedArrival: arr,
        onsiteWaitMin: p.arrival === "ARRIVED" && arr != null ? Math.max(0, start - arr) : null,
        breachesOriginal: p.originalWindow ? start > p.originalWindow[1] : false,
      });
    }
  }
  return out;
}

let proposalCounter = 100;
const pid = () => `prop-${proposalCounter++}`;

/** After a doctor delay/overrun: draft revised-time notifications for affected, not-yet-arrived patients. */
export function draftTimeChangeProposals(state: FlowState, clinicianId: string, sourceEvent: string): Proposal[] {
  const forecasts = computeForecasts(state);
  const proposals: Proposal[] = [];
  for (const p of state.patients) {
    if (p.clinicianId !== clinicianId || !p.agreedWindow || p.phase !== "BOOKED") continue;
    if (p.arrival === "ARRIVED") continue; // already onsite — staff speaks to them at the desk
    const f = forecasts.get(p.id);
    if (!f) continue;
    const shift = f.forecastStart - p.agreedWindow[0];
    if (shift < 10) continue;
    const newWin: [number, number] = [f.forecastStart, f.forecastStart + 20];
    proposals.push({
      id: pid(),
      createdAtVersion: state.planVersion,
      sourceEvent,
      patientId: p.id,
      kind: "time_change",
      summary: `${p.name}: notify revised time ${fmtWin(newWin)}`,
      beforeLabel: `Booked ${fmtWin(p.agreedWindow)} (arrive ${fmt(p.agreedWindow[0] - ARRIVE_EARLY)})`,
      afterLabel: `Revised ${fmtWin(newWin)} (arrive ${fmt(newWin[0] - ARRIVE_EARLY)})`,
      newAgreedWindow: newWin,
      facts: [
        `Forecast start moved ${shift} min past the booked window because of: ${sourceEvent}.`,
        p.originalWindow && f.forecastStart > p.originalWindow[1]
          ? `Original promise ${fmtWin(p.originalWindow)} will be breached — recorded for reporting either way.`
          : `Original promise still holds under this forecast.`,
        `Patient has not checked in, so a revised arrival time saves them waiting onsite.`,
        `Until the patient agrees, their existing booking stands.`,
      ],
      requires: "Operations approval, then patient consent",
      status: "pending_staff",
    });
  }
  return proposals;
}

/** Cancellation → one expiring capacity offer to the most suitable waitlist patient, with exclusions explained. */
export function draftCapacityOffer(state: FlowState, freedWindow: [number, number], clinicianId: string, sourceEvent: string): Proposal | null {
  const clin = state.clinicians.find((c) => c.id === clinicianId)!;
  const waitlist = state.patients.filter((p) => p.waitlist && p.phase === "REQUESTED");
  const facts: string[] = [`Freed capacity: ${clin.name} ${fmtWin(freedWindow)}.`];
  let chosen: PatientRecord | null = null;
  for (const w of waitlist) {
    const timeOk = w.availabilityEarliest == null || freedWindow[0] >= w.availabilityEarliest;
    if (timeOk && !chosen) {
      chosen = w;
      facts.push(`${w.name} selected: flexible timing; contacted ${w.assisted ? "by phone (assisted)" : "on WhatsApp"}.`);
    } else {
      facts.push(`${w.name} excluded: ${timeOk ? "an earlier offer is already out (one at a time)" : `available only after ${fmt(w.availabilityEarliest!)}`}.`);
    }
  }
  if (!chosen) return null;
  return {
    id: pid(),
    createdAtVersion: state.planVersion,
    sourceEvent,
    patientId: chosen.id,
    kind: "capacity_offer",
    summary: `Offer freed ${fmtWin(freedWindow)} (${clin.name}) to ${chosen.name} (waitlist)`,
    beforeLabel: `${chosen.name}: waitlisted`,
    afterLabel: `${clin.name} ${fmtWin(freedWindow)} · arrive ${fmt(freedWindow[0] - ARRIVE_EARLY)}`,
    newAgreedWindow: freedWindow,
    newClinicianId: clinicianId,
    facts,
    requires: "Operations approval, then patient acceptance",
    status: "pending_staff",
  };
}

/** First feasible slot for an approved walk-in or late re-slot. */
export function findFeasibleSlot(state: FlowState, preferClinicianId?: string): { clinicianId: string; window: [number, number] } | null {
  const forecasts = computeForecasts(state);
  const candidates = state.clinicians
    .filter((c) => !state.cancelledDoctors.includes(c.id))
    .filter((c) => !preferClinicianId || c.id === preferClinicianId)
    .map((c) => {
      let end = c.staffedFrom + (state.clinicianDelays[c.id] ?? 0);
      for (const p of state.patients) {
        if (p.clinicianId === c.id && forecasts.get(p.id)) end = Math.max(end, forecasts.get(p.id)!.forecastEnd);
      }
      let start = Math.max(end, state.clock + 15);
      if (start < c.breakTo && start + 20 > c.breakFrom) start = c.breakTo;
      return { clinicianId: c.id, window: [start, start + 20] as [number, number], fits: start + 25 <= c.staffedTo };
    })
    .filter((x) => x.fits)
    .sort((a, b) => a.window[0] - b.window[0]);
  return candidates[0] ?? null;
}

/** Remaining booked minutes per doctor — the "bandwidth" view. */
export function remainingLoad(state: FlowState): Record<string, number> {
  const load: Record<string, number> = {};
  for (const c of state.clinicians) load[c.id] = 0;
  for (const p of state.patients) {
    if (p.clinicianId && p.phase === "BOOKED") load[p.clinicianId] += p.durationEstimate;
  }
  return load;
}

export function computeMetrics(state: FlowState) {
  const forecasts = computeForecasts(state);
  const waits: number[] = [];
  let breaches = 0;
  for (const p of state.patients) {
    const f = forecasts.get(p.id);
    if (!f) continue;
    if (f.onsiteWaitMin != null && p.phase !== "COMPLETE" && p.phase !== "CANCELLED") waits.push(f.onsiteWaitMin);
    if (f.breachesOriginal) breaches++;
  }
  waits.sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : 0;
  let busy = 0;
  let staffed = 0;
  for (const c of state.clinicians) {
    staffed += c.staffedTo - c.staffedFrom - (c.breakTo - c.breakFrom);
    for (const p of state.patients) {
      if (p.clinicianId !== c.id) continue;
      if (p.phase === "COMPLETE" && p.consultStartedAt != null && p.consultEndedAt != null) {
        busy += p.consultEndedAt - p.consultStartedAt; // measured, not estimated
      } else if (p.phase === "IN_CONSULT" && p.consultStartedAt != null) {
        busy += Math.max(0, state.clock - p.consultStartedAt); // elapsed so far
      }
    }
  }
  return {
    medianWait: median,
    breaches,
    utilization: staffed ? Math.round((busy / staffed) * 100) : 0,
    openExceptions: state.exceptions.filter((e) => e.status === "open").length,
    staffActions: state.staffActions,
  };
}
