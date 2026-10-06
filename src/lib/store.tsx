"use client";

// Meridian Flow v2 — one shared store powers Patient, Operations, and Clinician.
// Guards live here, not in buttons. Operations coordinates; clinicians decide medicine.

import React, { createContext, useContext, useEffect, useReducer, useRef } from "react";
import { buildSeed, MEERA_ID, MEERA_HISTORY, MEERA_DOCS } from "./seed";
import { draftTimeChangeProposals, draftCapacityOffer, findFeasibleSlot, remainingLoad } from "./engine";
import { ChatMsg, FlowState, IntakeDecision, NextStepOrder, PatientRecord, fmt, fmtWin, rupees } from "./types";
import { getBookableSlots } from "./availability";

const T = (h: number, m = 0) => h * 60 + m;

export type Action =
  | { type: "CHAT_USER"; text: string }
  | { type: "CHAT_AGENT"; text: string; decision: IntakeDecision | null }
  | { type: "OPS_APPROVE_SCHEDULING" }
  | { type: "CONFIRM_OFFER"; offerId: string }
  | { type: "BOOK_MISSED_FOLLOWUP" }
  | { type: "PAY"; patientId: string; paymentId: string }
  | { type: "REQUEST_CANCEL"; patientId: string }
  | { type: "CONFIRM_RESCHEDULE"; patientId: string; clinicianId: string; window: [number, number] }
  | { type: "CONSENT_CALL"; patientId: string; consent: boolean }
  | { type: "SIMULATE_CONFIRM_CALL"; patientId: string }
  | { type: "RESPOND_CALL"; patientId: string; response: "confirm" | "cannot" | "callback" }
  | { type: "CHECK_IN"; patientId: string }
  | { type: "SEND_ARRIVAL_NUDGE"; patientId: string }
  | { type: "LATE_REPLY"; patientId: string; comingAt: number | null }
  | { type: "LATE_OPTION"; patientId: string; choice: "wait" | "switch_doctor" | "reschedule" }
  | { type: "FLAG_NON_ARRIVAL"; patientId: string }
  | { type: "VERIFY_ALL_TASKS"; patientId: string }
  | { type: "JUMP_TO_CLINIC" }
  | { type: "ADVANCE_CLOCK"; minutes: number }
  | { type: "CLINICIAN_DELAY"; clinicianId: string; minutes: number; reason: string }
  | { type: "INJECT_CANCELLATION" }
  | { type: "INJECT_IMAGING" }
  | { type: "WALKIN_ARRIVES"; which: "clinical" | "routine" }
  | { type: "OPS_APPROVE_WALKIN"; patientId: string }
  | { type: "CLINICAL_REVIEW_RESOLVE"; patientId: string; outcome: "approve" | "escalate" }
  | { type: "APPROVE_PROPOSAL"; id: string }
  | { type: "REJECT_PROPOSAL"; id: string; reason: string }
  | { type: "PATIENT_ACCEPT"; id: string; assisted?: boolean }
  | { type: "PATIENT_DECLINE"; id: string; assisted?: boolean }
  | { type: "START_CONSULT"; patientId: string }
  | { type: "EXTEND_CONSULT"; patientId: string }
  | { type: "FINISH_CONSULT"; patientId: string; outcome: { notes: string; diagnosis: string; plan: string; prescription: string }; orders: Omit<NextStepOrder, "id" | "booked">[] }
  | { type: "BOOK_ORDER"; patientId: string; orderId: string }
  | { type: "UPLOAD_DOC"; patientId: string; name: string }
  | { type: "LINK_RECORD"; recordId: string }
  | { type: "EMERGENCY_REQUEST" }
  | { type: "OPS_DISPATCH_AMBULANCE" }
  | { type: "EMERGENCY_PAY" }
  | { type: "FAMILY_PREFS"; member: string; channel: string; language: string }
  | { type: "RESOLVE_EXCEPTION"; id: string }
  | { type: "RECONCILE_PAYMENT"; patientId: string; paymentId: string; to: "paid" | "refunded" }
  | { type: "UNHAPPY_SLOTS" }
  | { type: "STAFF_IMMEDIATE_OFFER" }
  | { type: "CANCEL_DOCTOR_SESSION"; clinicianId: string }
  | { type: "REBALANCE_FIRST_VISITS" }
  | { type: "EMERGENCY_WALKIN" }
  | { type: "HOLD_PATIENT"; patientId: string; reason: string }
  | { type: "RELEASE_HOLD"; patientId: string }
  | { type: "CHAT_RESET" }
  | { type: "RESET" };

let eid = 1000;
let xid = 500;
let oid = 50;

function log(s: FlowState, actor: string, text: string): FlowState {
  return { ...s, events: [...s.events, { id: `e${eid++}`, clock: s.clock, phase: s.simPhase, actor, text }] };
}

function patient(s: FlowState, id: string) {
  return s.patients.find((p) => p.id === id);
}

export function meeraVisits(s: FlowState) {
  return s.patients.filter((p) => p.id.startsWith("p-meera"));
}

function latestOffered(s: FlowState) {
  return meeraVisits(s).filter((p) => p.phase === "OFFERED").slice(-1)[0];
}

function up(s: FlowState, id: string, fn: (p: PatientRecord) => PatientRecord): FlowState {
  return { ...s, patients: s.patients.map((p) => (p.id === id ? fn(p) : p)) };
}

function addException(s: FlowState, category: string, owner: string, deadline: string, detail: string, patientId?: string, nextStep?: string): FlowState {
  return { ...s, exceptions: [...s.exceptions, { id: `x${xid++}`, category, owner, deadline, detail, nextStep: nextStep ?? "Review, act, and resolve; escalate to the OPD manager if blocked.", status: "open", patientId }] };
}

function markStale(s: FlowState): FlowState {
  return { ...s, proposals: s.proposals.map((p) => (p.status === "pending_staff" && p.createdAtVersion < s.planVersion ? { ...p, status: "stale" } : p)) };
}

function bumpPlan(s: FlowState): FlowState {
  return markStale({ ...s, planVersion: s.planVersion + 1 });
}

function makeMeera(extra: Partial<PatientRecord>): PatientRecord {
  return {
    id: MEERA_ID,
    name: "Meera Shah",
    patientType: "first_visit",
    clinicianId: null,
    originalWindow: null,
    agreedWindow: null,
    phase: "REQUESTED",
    arrival: "NOT_ARRIVED",
    reportedNeed: "Knee discomfort for three weeks (reported — not a diagnosis)",
    seedNote: "Main demonstration patient",
    review: { status: "none", lane: null, pathway: null, reviewer: null },
    readiness: [],
    durationEstimate: 20,
    confirmationCall: "not_offered",
    history: MEERA_HISTORY,
    documents: [...MEERA_DOCS],
    payments: [],
    orders: [],
    ...extra,
  };
}

export function reducer(state: FlowState, action: Action): FlowState {
  let s = state;
  switch (action.type) {
    case "RESET":
      eid = 1000;
      xid = 500;
      oid = 50;
      return buildSeed();

    case "CHAT_USER":
      return { ...s, chat: [...s.chat, { role: "user", text: action.text } as ChatMsg] };

    case "CHAT_AGENT": {
      const d = action.decision;
      s = { ...s, chat: [...s.chat, { role: "agent", text: action.text }], lastIntake: d ?? s.lastIntake };
      if (!d || s.intakeDone) return s;

      // Deterministic routing gate: the model recommends a lane; the state machine
      // decides which transitions that lane permits. (clarify → stay in conversation.)
      switch (d.routingDecision) {
        case "routine": {
          s = { ...s, intakeDone: true };
          const n = meeraVisits(s).length;
          const id = n === 0 ? MEERA_ID : `${MEERA_ID}-${n + 1}`;
          s = {
            ...s,
            patients: [
              ...s.patients,
              makeMeera({
                ...( { id } as object ),
                reportedNeed: `${d.patientReportedNeed ?? "New consultation request"} (reported — not a diagnosis)`,
                department: d.department ?? undefined,
                constraintNote: d.schedulingConstraints ?? undefined,
                phase: "OFFERED",
                review: { status: "approved", lane: "scheduling", pathway: `${d.department ?? "Routine"} consult (approved booking rules)`, reviewer: "Approved booking rules" },
                history: n === 0 ? MEERA_HISTORY : [],
                documents: n === 0 ? [...MEERA_DOCS] : [],
              }),
            ],
            offers: getBookableSlots(),
          };
          return log(s, "routing gate", `Routine lane: bookable slots fetched from the availability adapter.${d.preferredClinicianMention ? ` Preference noted (${d.preferredClinicianMention}) — doctor remains availability-assigned for first visits.` : ""}`);
        }
        case "clinical_review": {
          s = { ...s, intakeDone: true };
          const n = meeraVisits(s).length;
          const id = n === 0 ? MEERA_ID : `${MEERA_ID}-${n + 1}`;
          s = {
            ...s,
            patients: [
              ...s.patients,
              makeMeera({
                ...( { id } as object ),
                reportedNeed: `${d.patientReportedNeed ?? "Request needing clinical review"} (reported — not a diagnosis)`,
                department: d.department ?? undefined,
                constraintNote: d.schedulingConstraints ?? undefined,
                phase: "AWAITING_CLINICAL_REVIEW",
                review: { status: "pending", lane: "clinical", pathway: null, reviewer: null },
                history: n === 0 ? MEERA_HISTORY : [],
                documents: n === 0 ? [...MEERA_DOCS] : [],
              }),
            ],
          };
          s = addException(s, "Clinical review required (intake)", "Clinician on duty", "15 min", `Patient request routed to clinical review: "${d.patientReportedNeed}". No appointment offers until a clinician records a disposition.`, id, "Review the reported need; approve a routine pathway, request information, or escalate.");
          return log(s, "routing gate", "Clinical-review lane: booking blocked until a clinician decides. Zero slots offered.");
        }
        case "emergency": {
          s = { ...s, intakeDone: true };
          s = addException(s, "EMERGENCY guidance given at intake", "Emergency team", "Immediate", `Intake conversation showed urgent danger signs: "${d.patientReportedNeed ?? "see transcript"}". Emergency instruction given; routine booking stopped.`, undefined, "Confirm the patient reached emergency care; follow up via the emergency team, not routine scheduling.");
          return log(s, "routing gate", "Emergency lane: routine booking stopped; emergency instruction shown.");
        }
        case "clarify":
        default:
          return s; // stay in conversation
      }
    }

    case "CHAT_RESET":
      return {
        ...s,
        intakeDone: false,
        lastIntake: null,
        offers: null,
        chat: [{ role: "agent", text: "What else can we help you book? Describe what you need — invented details only." }],
      };

    case "OPS_APPROVE_SCHEDULING": {
      const m = meeraVisits(s).filter((p) => p.phase === "AWAITING_SCHEDULING_APPROVAL").slice(-1)[0];
      if (!m) return s;
      s = up(s, m.id, (p) => ({ ...p, phase: "OFFERED", review: { ...p.review, status: "approved", pathway: p.review.pathway ?? "Routine consult", reviewer: p.review.reviewer ?? "Operations" } }));
      s = { ...s, offers: getBookableSlots(), staffActions: s.staffActions + 1, exceptions: s.exceptions.map((x) => (x.patientId === m.id && x.status === "open" && x.category.includes("Scheduling") ? { ...x, status: "resolved" } : x)) };
      return log(s, "Operations", "Scheduling approved. Bookable slots fetched from the availability adapter and offered.");
    }

    case "CONFIRM_OFFER": {
      const offer = s.offers?.find((o) => o.id === action.offerId);
      const m = latestOffered(s);
      if (!offer || !m) return s;
      s = up(s, m.id, (p) => ({
        ...p,
        clinicianId: offer.clinicianId,
        originalWindow: offer.window,
        agreedWindow: offer.window,
        visitDate: offer.dateLabel,
        phase: "AWAITING_PAYMENT",
        readiness: [{ id: "r-med", label: "Medication list confirmed", status: "needed" }],
        payments: [...p.payments, { id: "pay-consult", label: `First consultation fee — ${offer.clinicianName}`, amount: 600, status: "due" }],
      }));
      s = { ...s, offers: null };
      return log(s, "engine", `Meera chose ${offer.dateLabel} ${fmtWin(offer.window)} (${offer.clinicianName}, assigned by availability). Fee ${rupees(600)} shown — payment confirms.`);
    }

    case "BOOK_MISSED_FOLLOWUP": {
      if (patient(s, "p-meera-fu")) return log(s, "system", "This follow-up is already booked.");
      const win: [number, number] = [T(17, 30), T(17, 50)];
      s = {
        ...s,
        patients: [
          ...s.patients,
          makeMeera({
            ...( { id: "p-meera-fu" } as object ),
            clinicianId: "dr-rao",
            originalWindow: win,
            agreedWindow: win,
            phase: "AWAITING_PAYMENT",
            patientType: "follow_up",
            reportedNeed: "Follow-up for knee strain (recommended Mar 2025, never booked)",
            review: { status: "approved", lane: "scheduling", pathway: "Follow-up under existing instruction (Dr Rao)", reviewer: "Approved booking rules" },
            readiness: [{ id: "r-med", label: "Medication list confirmed", status: "needed" }],
            payments: [{ id: "pay-consult", label: "Follow-up fee — Dr Rao", amount: 400, status: "due" }],
          }),
        ],
      };
      return log(s, "engine", `Missed follow-up booked directly under approved rules: Dr Rao ${fmtWin(win)} (existing instruction determines doctor and timing). Fee ${rupees(400)} due.`);
    }

    case "PAY": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      s = up(s, action.patientId, (q) => ({
        ...q,
        payments: q.payments.map((pm) => (pm.id === action.paymentId ? { ...pm, status: "paid", at: s.simPhase === "booking" ? "Mon 5 Oct" : `Tue ${fmt(s.clock)}` } : pm)),
        phase: q.phase === "AWAITING_PAYMENT" ? "BOOKED" : q.phase,
        confirmationCall: q.phase === "AWAITING_PAYMENT" && q.confirmationCall === "not_offered" ? "not_offered" : q.confirmationCall,
        orders: q.orders.map((o) => (o.id === action.paymentId.replace("pay-", "") ? { ...o, booked: true } : o)),
      }));
      const p2 = patient(s, action.patientId)!;
      return log(s, p.name, `Payment received (${p.payments.find((x) => x.id === action.paymentId)?.label}). ${p2.phase === "BOOKED" && p.phase === "AWAITING_PAYMENT" ? "Booking confirmed — receipt issued. Please arrive 15 minutes before your appointment." : "Receipt issued."}`);
    }

    case "REQUEST_CANCEL": {
      const p = patient(s, action.patientId);
      if (!p || !p.agreedWindow || p.phase === "CANCELLED") return s;
      const freed = p.agreedWindow;
      const clinId = p.clinicianId!;
      s = up(s, action.patientId, (q) => ({
        ...q,
        phase: "CANCELLED",
        payments: q.payments.map((pm) => (pm.status === "paid" && pm.label.toLowerCase().includes("fee") ? { ...pm, status: "refunded" } : pm)),
      }));
      s = bumpPlan(s);
      s = log(s, p.name, `Cancelled (patient-initiated). Consultation fee refunded. Capacity released once.`);
      if (s.simPhase === "clinic") {
        const offer = draftCapacityOffer(s, freed, clinId, "Cancellation released capacity");
        if (offer) {
          s = { ...s, proposals: [...s.proposals, offer] };
          s = log(s, "engine", `Capacity offer drafted: ${offer.summary}.`);
        }
      }
      return s;
    }

    case "CONFIRM_RESCHEDULE": {
      const p = patient(s, action.patientId);
      if (!p || !p.agreedWindow) return s;
      const cname = s.clinicians.find((c) => c.id === action.clinicianId)?.name;
      s = up(s, action.patientId, (q) => ({
        ...q,
        clinicianId: action.clinicianId,
        agreedWindow: action.window,
        payments: q.payments.map((pm) => (pm.label.includes("fee") && pm.status === "paid" ? { ...pm, status: "transferred" } : pm)),
      }));
      s = bumpPlan(s);
      return log(s, p.name, `Rescheduled to ${cname} ${fmtWin(action.window)}. Previous payment transferred — no extra charge. The earlier booking was held until this confirmation.`);
    }

    case "CONSENT_CALL": {
      s = up(s, action.patientId, (q) => ({ ...q, confirmationCall: action.consent ? "consented" : "declined_consent" }));
      return s;
    }

    case "SIMULATE_CONFIRM_CALL": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      if (p.confirmationCall === "confirmed") return log(s, "call agent", `${p.name} already confirmed — duplicate call skipped.`);
      const transcript = [
        `Call agent: Good morning, this is Meridian Hospital's automated assistant. Am I speaking with ${p.name}?`,
        `Call agent: You have an appointment tomorrow with ${s.clinicians.find((c) => c.id === p.clinicianId)?.name} at ${p.agreedWindow ? fmt(p.agreedWindow[0]) : ""}. Press 1 to confirm, 2 if you cannot attend, or 3 to speak with our staff.`,
      ];
      s = up(s, action.patientId, (q) => ({ ...q, callTranscript: transcript }));
      return log(s, "call agent", `Day-before confirmation call placed to ${p.name} (9–12 AM window, consented).`);
    }

    case "RESPOND_CALL": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      if (action.response === "confirm") {
        s = up(s, action.patientId, (q) => ({ ...q, confirmationCall: "confirmed" }));
        return log(s, p.name, "Confirmed attendance on the call. No further calls will be made.");
      }
      if (action.response === "cannot") {
        s = up(s, action.patientId, (q) => ({ ...q, confirmationCall: "cannot_attend" }));
        s = addException(s, "Cannot attend — reschedule assistance", "Operations", "Today", `${p.name} said they cannot attend. Booking stays until a replacement is confirmed — offer alternatives.`, p.id);
        return log(s, p.name, "Said they cannot attend. Booking held; Operations will assist with rescheduling.");
      }
      s = up(s, action.patientId, (q) => ({ ...q, confirmationCall: "callback_requested" }));
      s = addException(s, "Staff callback requested", "Front desk", "Before the visit", `${p.name} asked to speak with staff on the confirmation call.`, p.id);
      return log(s, p.name, "Requested a staff callback.");
    }

    case "CHECK_IN": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      const token = p.token ?? `T-${String(s.tokenCounter + 1).padStart(2, "0")}`;
      s = { ...s, tokenCounter: p.token ? s.tokenCounter : s.tokenCounter + 1, staffActions: s.staffActions + 1 };
      s = up(s, action.patientId, (q) => ({ ...q, arrival: "ARRIVED", arrivedAt: s.clock, nonArrivalFlagged: false, token }));
      return log(s, "front desk", `${p.name} checked in at ${fmt(s.clock)} — token ${token}. Patients are seen in token order within their slot.`);
    }

    case "SEND_ARRIVAL_NUDGE": {
      const p = patient(s, action.patientId);
      if (!p || p.arrival === "ARRIVED") return s;
      s = up(s, action.patientId, (q) => ({
        ...q,
        callTranscript: [
          `Call agent: Hello ${p.name}, this is Meridian Hospital. Your appointment with ${s.clinicians.find((c) => c.id === p.clinicianId)?.name} is at ${p.agreedWindow ? fmt(p.agreedWindow[0]) : ""} and you haven't checked in yet. Are you coming — and if so, what time will you arrive?`,
        ],
      }));
      s = { ...s, staffActions: s.staffActions + 1 };
      return log(s, "call agent", `Arrival check call/WhatsApp sent to ${p.name} (no departure questions — just "are you coming, and when?").`);
    }

    case "LATE_REPLY": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      if (action.comingAt == null) {
        s = up(s, action.patientId, (q) => ({ ...q, lateReply: { comingAt: null, note: "cannot come" } }));
        s = addException(s, "Cannot attend — reschedule assistance", "Operations", "Today", `${p.name} replied they cannot come. Offer alternatives; distinguish from cancellation.`, p.id);
        return log(s, p.name, "Replied: cannot come today. Operations to assist.");
      }
      s = up(s, action.patientId, (q) => ({ ...q, lateReply: { comingAt: action.comingAt, note: `arriving ${fmt(action.comingAt!)}` } }));
      s = bumpPlan(s);
      return log(s, p.name, `Replied: on the way, arriving about ${fmt(action.comingAt)}. Forecast updated; original slot not guaranteed.`);
    }

    case "LATE_OPTION": {
      const p = patient(s, action.patientId);
      if (!p || !p.agreedWindow) return s;
      if (action.choice === "wait") {
        const slot = findFeasibleSlot(s, p.clinicianId!);
        if (!slot) return log(s, "engine", "No feasible slot left with this doctor today.");
        s = up(s, action.patientId, (q) => ({ ...q, agreedWindow: slot.window }));
        s = bumpPlan(s);
        return log(s, p.name, `Chose to wait: next feasible time with the same doctor is ${fmtWin(slot.window)}.`);
      }
      if (action.choice === "switch_doctor") {
        const others = s.clinicians.filter((c) => c.id !== p.clinicianId);
        for (const c of others) {
          const slot = findFeasibleSlot(s, c.id);
          if (slot) {
            s = up(s, action.patientId, (q) => ({ ...q, clinicianId: c.id, agreedWindow: slot.window }));
            s = bumpPlan(s);
            return log(s, p.name, `Consented to see ${c.name} instead — ${fmtWin(slot.window)}.`);
          }
        }
        return log(s, "engine", "No alternative doctor has feasible time today.");
      }
      s = up(s, action.patientId, (q) => ({ ...q, agreedWindow: null, clinicianId: q.clinicianId, phase: "BOOKED" }));
      s = addException(s, "Reschedule to another day", "Operations", "48h", `${p.name} chose to reschedule. Offer alternative days; payment transfers.`, p.id);
      return log(s, p.name, "Chose to reschedule to another day. Operations task created; payment will transfer.");
    }

    case "FLAG_NON_ARRIVAL": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      s = up(s, action.patientId, (q) => ({ ...q, nonArrivalFlagged: true }));
      s = addException(s, "Non-arrival at appointment time", "Front desk", "15 min", `${p.name} has not arrived at appointment time. Follow up; do not cancel automatically.`, p.id);
      return log(s, "Operations", `${p.name} flagged for non-arrival follow-up.`);
    }

    case "VERIFY_ALL_TASKS": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      s = up(s, action.patientId, (q) => ({
        ...q,
        readiness: q.readiness.map((t) => (t.status === "blocked" || t.status === "not_required" ? t : { ...t, status: "verified" })),
      }));
      s = { ...s, staffActions: s.staffActions + 1 };
      return log(s, "front desk", `${p.name}: readiness verified where possible.`);
    }

    case "JUMP_TO_CLINIC":
      s = { ...s, simPhase: "clinic", clock: T(16, 5) };
      return log(s, "system", "Clock jumped to clinic day: Tue 6 Oct 2026, 16:05 IST.");

    case "ADVANCE_CLOCK":
      s = { ...s, clock: s.clock + action.minutes };
      return log(s, "system", `Clock advanced to ${fmt(s.clock)}.`);

    case "CLINICIAN_DELAY": {
      const c = s.clinicians.find((x) => x.id === action.clinicianId)!;
      s = bumpPlan({ ...s, clinicianDelays: { ...s.clinicianDelays, [action.clinicianId]: (s.clinicianDelays[action.clinicianId] ?? 0) + action.minutes }, disruptionsUsed: [...s.disruptionsUsed, "delay"] });
      s = log(s, c.name, `Reported ${action.minutes}-minute delay (${action.reason}). Operations notified; affected patients reforecast.`);
      const proposals = draftTimeChangeProposals(s, action.clinicianId, `${c.name}: ${action.reason}`);
      s = { ...s, proposals: [...s.proposals, ...proposals] };
      const arrivedAffected = s.patients.filter((p) => p.clinicianId === action.clinicianId && p.arrival === "ARRIVED" && p.phase === "BOOKED");
      for (const p of arrivedAffected) {
        s = addException(s, "Onsite patient affected by delay", "Front desk", "Now", `${p.name} is already onsite. Explain the delay in person and offer options.`, p.id);
      }
      return s;
    }

    case "INJECT_CANCELLATION": {
      const nik = patient(s, "p-nikhil");
      if (!nik || nik.phase === "CANCELLED") return s;
      return reducer(s, { type: "REQUEST_CANCEL", patientId: "p-nikhil" });
    }

    case "INJECT_IMAGING": {
      s = bumpPlan({ ...s, imagingDown: true, disruptionsUsed: [...s.disruptionsUsed, "imaging"] });
      s = up(s, "p-raj", (q) => ({
        ...q,
        readiness: q.readiness.map((t) => (t.id === "r-img" ? { ...t, status: "blocked", blockingReason: "Imaging unavailable — doctor-ordered test blocked; no invented completion" } : t)),
      }));
      s = addException(s, "Resource outage — imaging", "Operations", "Until restored", "Imaging unavailable. Raj Verma's ordered X-ray blocked; clinical orders unchanged.", "p-raj");
      return log(s, "simulator", "Imaging resource unavailable. Affected patients identified.");
    }

    case "WALKIN_ARRIVES": {
      const id = action.which === "clinical" ? "p-sameer" : "p-tara";
      const p = patient(s, id)!;
      const lane = action.which === "clinical" ? "clinical" : "scheduling";
      s = up(s, id, (q) => ({
        ...q,
        arrival: "ARRIVED",
        arrivedAt: s.clock,
        phase: lane === "clinical" ? "AWAITING_CLINICAL_REVIEW" : "AWAITING_SCHEDULING_APPROVAL",
        review: { status: "pending", lane, pathway: null, reviewer: null },
      }));
      s = addException(
        s,
        lane === "clinical" ? "Clinical review required (walk-in)" : "Scheduling approval (walk-in)",
        lane === "clinical" ? "Clinician on duty" : "Operations",
        "15 min",
        lane === "clinical"
          ? `${p.name}: "${p.reportedNeed}" — medical judgment needed before any booking. Routed to a clinician.`
          : `${p.name}: "${p.reportedNeed}" — routine; needs scheduling approval and a feasible slot. Arrival alone gives no queue position.`,
        id
      );
      return log(s, "front desk", `Walk-in: ${p.name}. ${lane === "clinical" ? "Clinical question → clinician queue." : "Routine → Operations queue."}`);
    }

    case "OPS_APPROVE_WALKIN": {
      const p = patient(s, action.patientId);
      if (!p || p.phase !== "AWAITING_SCHEDULING_APPROVAL") return s;
      const slot = findFeasibleSlot(s);
      s = { ...s, staffActions: s.staffActions + 1 };
      if (!slot) {
        s = addException(s, "No feasible capacity today", "Operations", "EOD", `${p.name}: approved but no feasible slot — offer tomorrow; never invent a slot.`, p.id);
        return log(s, "Operations", `${p.name}: approved, but no feasible capacity today. Exception owned.`);
      }
      const cname = s.clinicians.find((c) => c.id === slot.clinicianId)!.name;
      s = up(s, action.patientId, (q) => ({
        ...q,
        phase: "BOOKED",
        clinicianId: slot.clinicianId,
        originalWindow: slot.window,
        agreedWindow: slot.window,
        review: { status: "approved", lane: "scheduling", pathway: "Routine orthopaedic consult", reviewer: "Operations" },
        readiness: [{ id: "r1", label: "Visit information confirmed", status: "verified" }],
        payments: [...q.payments, { id: `${q.id}-fee`, label: "Consultation fee (walk-in)", amount: 600, status: "due" }],
      }));
      s = { ...s, exceptions: s.exceptions.map((x) => (x.patientId === action.patientId && x.status === "open" ? { ...x, status: "resolved" } : x)) };
      return log(s, "Operations", `${p.name}: scheduling approved — ${cname} ${fmtWin(slot.window)}. Fee due at desk.`);
    }

    case "CLINICAL_REVIEW_RESOLVE": {
      const p = patient(s, action.patientId);
      if (!p || p.phase !== "AWAITING_CLINICAL_REVIEW") return s;
      s = { ...s, staffActions: s.staffActions + 1 };
      if (action.outcome === "escalate") {
        s = up(s, action.patientId, (q) => ({ ...q, review: { status: "escalated", lane: "clinical", pathway: null, reviewer: "Dr Shah" } }));
        s = { ...s, exceptions: s.exceptions.map((x) => (x.patientId === action.patientId && x.status === "open" ? { ...x, status: "resolved" } : x)) };
        s = addException(s, "Emergency handoff", "Emergency team", "Immediate", `${p.name}: possible acute injury — directed to emergency care. Handoff tracked; outside routine OPD.`, p.id);
        return log(s, "Dr Shah", `${p.name}: escalated to the emergency team. No routine booking.`);
      }
      s = up(s, action.patientId, (q) => ({ ...q, phase: "AWAITING_SCHEDULING_APPROVAL", review: { status: "approved", lane: "clinical", pathway: "Routine orthopaedic consult (clinician-confirmed)", reviewer: "Dr Shah" } }));
      s = { ...s, exceptions: s.exceptions.map((x) => (x.patientId === action.patientId && x.status === "open" ? { ...x, status: "resolved" } : x)) };
      s = addException(s, "Scheduling approval (walk-in)", "Operations", "15 min", `${p.name}: clinician confirmed routine pathway — needs a feasible slot from Operations.`, p.id);
      return log(s, "Dr Shah", `${p.name}: clinically suitable for routine consult. Sent to Operations for scheduling.`);
    }

    case "APPROVE_PROPOSAL": {
      const pr = s.proposals.find((x) => x.id === action.id);
      if (!pr) return s;
      if (pr.status === "stale" || pr.createdAtVersion < s.planVersion) {
        s = { ...s, proposals: s.proposals.map((x) => (x.id === action.id ? { ...x, status: "stale" } : x)) };
        return log(s, "engine", `Proposal is stale — the plan changed since drafting. Recompute instead of applying.`);
      }
      if (pr.status !== "pending_staff") return s;
      s = { ...s, staffActions: s.staffActions + 1, proposals: s.proposals.map((x) => (x.id === action.id ? { ...x, status: "awaiting_patient" } : x)) };
      return log(s, "Operations", `Approved: ${pr.summary}. Awaiting patient consent — existing booking stands until then.`);
    }

    case "REJECT_PROPOSAL": {
      const pr = s.proposals.find((x) => x.id === action.id);
      if (!pr) return s;
      s = { ...s, staffActions: s.staffActions + 1, proposals: s.proposals.map((x) => (x.id === action.id ? { ...x, status: "rejected_staff" } : x)) };
      return log(s, "Operations", `Rejected: ${pr.summary} (${action.reason}).`);
    }

    case "PATIENT_ACCEPT": {
      const pr = s.proposals.find((x) => x.id === action.id);
      if (!pr || pr.status !== "awaiting_patient") return s;
      const p = patient(s, pr.patientId);
      if (!p) return s;
      if (pr.kind === "capacity_offer") {
        const stillFree = !s.patients.some((q) => q.id !== p.id && q.clinicianId === pr.newClinicianId && q.agreedWindow?.[0] === pr.newAgreedWindow?.[0] && !["CANCELLED", "COMPLETE"].includes(q.phase));
        if (!stillFree) return log(s, "engine", "Offer expired — capacity was taken. No double booking.");
        s = up(s, p.id, (q) => ({
          ...q,
          waitlist: false,
          phase: "BOOKED",
          clinicianId: pr.newClinicianId!,
          originalWindow: pr.newAgreedWindow!,
          agreedWindow: pr.newAgreedWindow!,
          review: { status: "approved", lane: "scheduling", pathway: "Routine orthopaedic consult", reviewer: "Operations" },
          readiness: [{ id: "r1", label: "Visit information confirmed", status: "verified" }],
          payments: [...q.payments, { id: `${q.id}-fee`, label: "Consultation fee", amount: 600, status: "due" }],
        }));
        s = { ...s, proposals: s.proposals.map((x) => (x.id === action.id ? { ...x, status: "accepted" } : x)) };
        return log(s, action.assisted ? "front desk (assisted)" : p.name, `${p.name} accepted the freed slot. Booked once; fee due.`);
      }
      s = up(s, p.id, (q) => ({
        ...q,
        agreedWindow: pr.newAgreedWindow ?? q.agreedWindow,
        clinicianId: pr.kind === "doctor_change" && pr.newClinicianId ? pr.newClinicianId : q.clinicianId,
      }));
      s = { ...s, proposals: s.proposals.map((x) => (x.id === action.id ? { ...x, status: "accepted" } : x)) };
      return log(s, action.assisted ? "front desk (assisted)" : p.name, `${p.name} agreed: ${pr.afterLabel}. Original promise unchanged for reporting.`);
    }

    case "PATIENT_DECLINE": {
      const pr = s.proposals.find((x) => x.id === action.id);
      if (!pr || pr.status !== "awaiting_patient") return s;
      const p = patient(s, pr.patientId);
      s = { ...s, proposals: s.proposals.map((x) => (x.id === action.id ? { ...x, status: "declined_patient" } : x)) };
      s = addException(s, "Change declined", "Front desk", "Today", `${p?.name} declined the proposed change. Existing booking stands; contact to find another option.`, pr.patientId);
      return log(s, p?.name ?? "patient", "Declined the proposed change. Existing booking stands; staff contact task created.");
    }

    case "START_CONSULT": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      if (p.arrival !== "ARRIVED") return log(s, "system", `Blocked start: ${p.name} is not checked in.`);
      if (p.onHold) return log(s, "system", `Blocked start: ${p.name} is on hold (${p.onHold.reason}).`);
      const unresolved = p.readiness.find((t) => !["verified", "not_required"].includes(t.status));
      if (unresolved) return log(s, "system", `Blocked start: ${p.name} — ${unresolved.label} is ${unresolved.status}.`);
      if (p.review.status !== "approved") return log(s, "system", `Blocked start: ${p.name} does not have an approved pathway.`);
      const busy = s.patients.find((q) => q.clinicianId === p.clinicianId && q.phase === "IN_CONSULT");
      if (busy) return log(s, "system", `Blocked start: ${busy.name}'s consultation is still active.`);
      s = up(s, action.patientId, (q) => ({ ...q, phase: "IN_CONSULT", consultStartedAt: s.clock }));
      return log(s, "clinician", `Consultation started: ${p.name} at ${fmt(s.clock)}. Clinician and room reserved.`);
    }

    case "EXTEND_CONSULT": {
      const p = patient(s, action.patientId);
      if (!p || p.phase !== "IN_CONSULT") return s;
      s = bumpPlan(s);
      s = up(s, action.patientId, (q) => ({ ...q, durationEstimate: q.durationEstimate + 10 }));
      s = log(s, "clinician", `Flagged more time needed for ${p.name} (+10 min). Later patients reforecast.`);
      const proposals = draftTimeChangeProposals(s, p.clinicianId!, "Consultation running long");
      return { ...s, proposals: [...s.proposals, ...proposals] };
    }

    case "FINISH_CONSULT": {
      const p = patient(s, action.patientId);
      if (!p || p.phase !== "IN_CONSULT") return s;
      const newOrders: NextStepOrder[] = action.orders.map((o) => ({ ...o, id: `ord-${oid++}`, booked: false }));
      s = up(s, action.patientId, (q) => ({
        ...q,
        phase: "COMPLETE",
        consultEndedAt: s.clock,
        outcome: action.outcome,
        orders: [...q.orders, ...newOrders],
        history: [
          { date: "06 Oct 2026", doctor: s.clinicians.find((c) => c.id === q.clinicianId)?.name ?? "", reason: q.reportedNeed || q.seedNote, outcome: `${action.outcome.diagnosis} — ${action.outcome.plan}`, prescription: action.outcome.prescription || "—" },
          ...q.history,
        ],
      }));
      s = log(s, "clinician", `Consultation finished: ${p.name}. Outcome recorded (${action.outcome.diagnosis || "notes"}). ${newOrders.length ? `${newOrders.length} next step(s) ordered.` : "No follow-up ordered."}`);
      if (newOrders.length === 0) return s;
      return log(s, "engine", `Next steps are now bookable from ${p.name}'s view, strictly within the recorded instruction.`);
    }

    case "BOOK_ORDER": {
      const p = patient(s, action.patientId);
      const o = p?.orders.find((x) => x.id === action.orderId);
      if (!p || !o || o.booked) return s;
      const label =
        o.kind === "follow_up" ? "Tue 20 Oct 2026, 17:30 — per instruction" : o.kind === "test" ? "Tomorrow 09:30, Imaging level 1" : "Referral desk will call within 24h";
      s = up(s, action.patientId, (q) => ({
        ...q,
        orders: q.orders.map((x) => (x.id === action.orderId ? { ...x, booked: true, bookedLabel: label } : x)),
        payments: o.fee > 0 ? [...q.payments, { id: `pay-${o.id}`, label: o.label, amount: o.fee, status: "due" }] : q.payments,
      }));
      return log(s, p.name, `Booked next step: ${o.label} → ${label}.${o.fee ? ` Fee ${rupees(o.fee)} due.` : ""}`);
    }

    case "UPLOAD_DOC": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      const docId = `doc-${Date.now() % 100000}`;
      s = up(s, action.patientId, (q) => ({ ...q, documents: [...q.documents, { id: docId, name: action.name, status: "uploaded" }] }));
      s = { ...s, recordsQueue: [...s.recordsQueue, { id: docId, patientId: p.id, docName: action.name, linked: false }] };
      return log(s, p.name, `Uploaded "${action.name}". Operations will link it to the record.`);
    }

    case "LINK_RECORD": {
      const r = s.recordsQueue.find((x) => x.id === action.recordId);
      if (!r) return s;
      s = { ...s, recordsQueue: s.recordsQueue.map((x) => (x.id === action.recordId ? { ...x, linked: true } : x)), staffActions: s.staffActions + 1 };
      s = up(s, r.patientId, (q) => ({ ...q, documents: q.documents.map((d) => (d.id === r.id ? { ...d, status: "linked" } : d)) }));
      return log(s, "Operations", `Linked "${r.docName}" to ${patient(s, r.patientId)?.name}'s record.`);
    }

    case "EMERGENCY_REQUEST": {
      s = { ...s, emergency: { status: "requested" } };
      s = addException(s, "EMERGENCY — ambulance requested", "Emergency team", "Immediate", "Patient requested emergency assistance. Escalation does not wait for payment or routine approval.", MEERA_ID);
      return log(s, "patient", "EMERGENCY assistance requested. Emergency team alerted immediately — bypasses all routine queues.");
    }

    case "OPS_DISPATCH_AMBULANCE": {
      if (s.emergency.status !== "requested") return s;
      s = {
        ...s,
        emergency: { ...s.emergency, status: "dispatched", etaMin: 12 },
        staffActions: s.staffActions + 1,
        exceptions: s.exceptions.map((x) => (x.category.startsWith("EMERGENCY") ? { ...x, status: "resolved" } : x)),
      };
      return log(s, "Emergency team", "Ambulance dispatched — confirmed, ETA 12 minutes. Patient notified.");
    }

    case "EMERGENCY_PAY": {
      s = { ...s, emergency: { ...s.emergency, paid: true } };
      return log(s, "patient", "Emergency payment completed alongside coordination (never a precondition for dispatch).");
    }

    case "FAMILY_PREFS": {
      s = up(s, MEERA_ID, (q) => ({ ...q, familyAuthorized: action.member, channelPref: action.channel, languagePref: action.language }));
      return log(s, "patient", `Preferences saved: authorized ${action.member} for bookings; updates via ${action.channel} in ${action.language}.`);
    }

    case "UNHAPPY_SLOTS": {
      const m = latestOffered(s);
      if (!m) return s;
      s = addException(
        s,
        "Patient unhappy with offered slots",
        "Front desk",
        "Within 15 min",
        "Meera Shah: none of the offered times work. Call to understand her scheduling constraints; any medical concern routes to a clinician.",
        m.id,
        "Call patient; capture scheduling constraints; offer the earliest feasible slot or waitlist. Medical concerns → clinical review."
      );
      return log(s, "Meera Shah", "None of the offered slots work — asked to speak with staff.");
    }

    case "STAFF_IMMEDIATE_OFFER": {
      const m = latestOffered(s);
      if (!m) return s;
      const slot = findFeasibleSlot(s);
      if (!slot) return log(s, "Operations", "No immediate capacity available — patient stays on the assisted waitlist.");
      const cname = s.clinicians.find((c) => c.id === slot.clinicianId)?.name;
      s = up(s, m.id, (q) => ({
        ...q,
        clinicianId: slot.clinicianId,
        originalWindow: slot.window,
        agreedWindow: slot.window,
        phase: "AWAITING_PAYMENT",
        readiness: [{ id: "r-med", label: "Medication list confirmed", status: "needed" }],
        payments: [...q.payments, { id: "pay-consult", label: `First consultation fee — ${cname}`, amount: 600, status: "due" }],
      }));
      s = { ...s, offers: null, staffActions: s.staffActions + 1, exceptions: s.exceptions.map((x) => (x.patientId === m.id && x.status === "open" ? { ...x, status: "resolved" } : x)) };
      return log(s, "front desk", `Scheduling callback complete: offered the earliest feasible slot — ${cname} ${fmtWin(slot.window)} (accepted on call). Fee due to confirm.`);
    }

    case "CANCEL_DOCTOR_SESSION": {
      const c = s.clinicians.find((x) => x.id === action.clinicianId);
      if (!c || s.cancelledDoctors.includes(action.clinicianId)) return s;
      s = bumpPlan({ ...s, cancelledDoctors: [...s.cancelledDoctors, action.clinicianId], staffActions: s.staffActions + 1 });
      s = log(s, "Operations", `${c.name} is unavailable for the rest of the session. Drafting a recovery plan — nothing moves without approval and patient acceptance.`);
      const affected = s.patients.filter((p) => p.clinicianId === action.clinicianId && p.phase === "BOOKED");
      let drafted = 0, refunds = 0;
      for (const p of affected) {
        const slot = findFeasibleSlot(s);
        if (slot) {
          const nn = s.clinicians.find((x) => x.id === slot.clinicianId)?.name;
          const firstVisit = p.patientType === "first_visit" || p.patientType === "walk_in";
          s = {
            ...s,
            proposals: [
              ...s.proposals,
              {
                id: `prop-dc-${p.id}`,
                createdAtVersion: s.planVersion,
                sourceEvent: `${c.name}'s session cancelled`,
                patientId: p.id,
                kind: "doctor_change",
                summary: `${p.name}: offer ${nn} ${fmtWin(slot.window)} (${c.name} unavailable)`,
                beforeLabel: `${c.name} ${p.agreedWindow ? fmtWin(p.agreedWindow) : ""}`,
                afterLabel: `${nn} ${fmtWin(slot.window)}`,
                newAgreedWindow: slot.window,
                newClinicianId: slot.clinicianId,
                facts: firstVisit
                  ? [
                      `${c.name} is unavailable for the rest of the session.`,
                      `${p.name} is a ${p.patientType === "walk_in" ? "walk-in" : "first visit"} — the doctor is availability-assigned, but the time change still needs their acceptance.`,
                      `Message drafted: "Hello ${p.name}, your doctor today is unavailable. Your consultation can move to ${nn} at ${fmt(slot.window[0])} — reply 1 to accept, 2 for other options. Your payment carries over."`,
                    ]
                  : [
                      `${c.name} is unavailable for the rest of the session.`,
                      `${p.name} is a follow-up patient — changing their doctor needs their explicit consent.`,
                      `Message drafted: "Hello ${p.name}, ${c.name} is unavailable today. You can see ${nn} at ${fmt(slot.window[0])} instead, or reschedule with ${c.name} another day — your payment carries over either way. Reply 1 or 2."`,
                      `If they must see ${c.name} only: reschedule to the doctor's next session; cancellation + refund is the last resort.`,
                    ],
                requires: "Operations approval, then patient acceptance",
                status: "pending_staff",
              },
            ],
          };
          drafted++;
        } else {
          s = up(s, p.id, (q) => ({ ...q, phase: "CANCELLED", payments: q.payments.map((pm) => (pm.status === "paid" ? { ...pm, status: "refunded" } : pm)) }));
          refunds++;
        }
      }
      s = addException(
        s,
        `Doctor session cancelled — ${c.name}`,
        "Operations",
        "Before end of day",
        `${affected.length} patient(s) affected: ${drafted} recovery proposal(s) drafted (approve, then patients accept), ${refunds} refunded (no feasible slot).`,
        undefined,
        "Approve the drafted proposals; record phone acceptances for assisted patients; call refunded patients with next-day options."
      );
      return s;
    }

    case "REBALANCE_FIRST_VISITS": {
      const load = remainingLoad(s);
      const active = s.clinicians.filter((c) => !s.cancelledDoctors.includes(c.id));
      if (active.length < 2) return log(s, "Operations", "Not enough active doctors to rebalance.");
      const sorted = [...active].sort((a, b) => load[b.id] - load[a.id]);
      const busiest = sorted[0];
      const lightest = sorted[sorted.length - 1];
      if (load[busiest.id] - load[lightest.id] < 30) {
        return log(s, "Operations", `Load already balanced (${busiest.name} ${load[busiest.id]}m vs ${lightest.name} ${load[lightest.id]}m). No plan needed.`);
      }
      const movable = s.patients
        .filter((p) => p.clinicianId === busiest.id && p.phase === "BOOKED" && p.patientType === "first_visit" && p.arrival === "NOT_ARRIVED" && !p.onHold)
        .sort((a, b) => (b.agreedWindow?.[0] ?? 0) - (a.agreedWindow?.[0] ?? 0));
      if (movable.length === 0) return log(s, "Operations", `No movable first-visit patients on ${busiest.name}'s list (follow-ups keep their doctor; arrived patients stay).`);
      s = bumpPlan({ ...s, staffActions: s.staffActions + 1 });
      let n = 0;
      for (const p of movable.slice(0, 2)) {
        const slot = findFeasibleSlot(s, lightest.id);
        if (!slot) break;
        s = {
          ...s,
          proposals: [
            ...s.proposals,
            {
              id: `prop-lb-${p.id}`,
              createdAtVersion: s.planVersion,
              sourceEvent: "Load-balancing plan",
              patientId: p.id,
              kind: "doctor_change",
              summary: `${p.name}: move to ${lightest.name} ${fmtWin(slot.window)} (load balancing)`,
              beforeLabel: `${busiest.name} ${p.agreedWindow ? fmtWin(p.agreedWindow) : ""}`,
              afterLabel: `${lightest.name} ${fmtWin(slot.window)}`,
              newAgreedWindow: slot.window,
              newClinicianId: lightest.id,
              facts: [
                `${busiest.name} has ${load[busiest.id]} booked minutes remaining vs ${lightest.name}'s ${load[lightest.id]} — the imbalance delays ${busiest.name}'s later patients.`,
                `${p.name} is a first visit (doctor availability-assigned) and has not arrived — the move needs only their acceptance of the new time.`,
                `Message drafted: "Hello ${p.name}, we can see you earlier/on-time at ${fmt(slot.window[0])} with ${lightest.name}. Reply 1 to accept, 2 to keep your current time."`,
              ],
              requires: "Operations approval, then patient acceptance",
              status: "pending_staff",
            },
          ],
        };
        n++;
      }
      return log(s, "engine", `Load-balancing plan drafted: ${n} proposal(s) in Approvals. Nothing moves without approval and patient acceptance.`);
    }

    case "EMERGENCY_WALKIN": {
      const p = patient(s, "p-rohan");
      if (!p || p.phase !== "REQUESTED") return s;
      const load = remainingLoad(s);
      const doc = s.clinicians.filter((c) => !s.cancelledDoctors.includes(c.id)).sort((a, b) => load[a.id] - load[b.id])[0];
      const token = `E-${String(s.emergencyTokenCounter + 1).padStart(2, "0")}`;
      const win: [number, number] = [s.clock, s.clock + 30];
      s = { ...s, emergencyTokenCounter: s.emergencyTokenCounter + 1 };
      s = bumpPlan(s);
      s = up(s, "p-rohan", (q) => ({
        ...q,
        arrival: "ARRIVED",
        arrivedAt: s.clock,
        token,
        clinicianId: doc.id,
        originalWindow: win,
        agreedWindow: win,
        phase: "BOOKED",
        durationEstimate: 30,
        review: { status: "approved", lane: "clinical", pathway: "Emergency protocol", reviewer: "Triage nurse" },
      }));
      s = addException(s, "EMERGENCY — walk-in", "Emergency team + " + doc.name, "Immediate", `${p.name}: ${p.reportedNeed}. Token ${token}. Separate emergency queue — always seen first; payment is never a precondition.`, "p-rohan", "Stabilize; doctor sees next (after current consult); billing follows later.");
      return log(s, "triage nurse", `EMERGENCY arrival: ${p.name} — token ${token}, assigned ${doc.name}, goes to the front of the queue (payment never blocks emergency care).`);
    }

    case "HOLD_PATIENT": {
      const p = patient(s, action.patientId);
      if (!p || p.onHold || p.phase !== "BOOKED") return s;
      s = bumpPlan({ ...s, staffActions: s.staffActions + 1 });
      s = up(s, action.patientId, (q) => ({ ...q, onHold: { reason: action.reason, since: s.clock } }));
      s = addException(
        s,
        "Patient on hold",
        "Front desk",
        `${fmt(s.clock + 45)} (45 min)`,
        `${p.name}${p.token ? ` (${p.token})` : ""} is on hold: ${action.reason}. They keep their token; ready patients behind them will be seen meanwhile.`,
        p.id,
        "When they return, release the hold (they re-enter the queue). If not resolved by the deadline, call them — offer reschedule or refund."
      );
      return log(s, "front desk", `${p.name} put on hold (${action.reason}). Removed from the callable queue; token retained; doctor's queue flows past them.`);
    }

    case "RELEASE_HOLD": {
      const p = patient(s, action.patientId);
      if (!p || !p.onHold) return s;
      s = bumpPlan({ ...s, staffActions: s.staffActions + 1 });
      let note = "resumes in their original position";
      if (p.agreedWindow && s.clock > p.agreedWindow[0]) {
        const slot = findFeasibleSlot(s, p.clinicianId ?? undefined) ?? findFeasibleSlot(s);
        if (slot) {
          s = up(s, action.patientId, (q) => ({ ...q, agreedWindow: slot.window, clinicianId: slot.clinicianId }));
          note = `re-slotted to ${fmtWin(slot.window)} (original window passed while on hold; original promise still on record)`;
        }
      }
      s = up(s, action.patientId, (q) => ({ ...q, onHold: null }));
      s = { ...s, exceptions: s.exceptions.map((x) => (x.patientId === action.patientId && x.category === "Patient on hold" && x.status === "open" ? { ...x, status: "resolved" } : x)) };
      return log(s, "front desk", `${p.name}'s hold released — ${note}.`);
    }

    case "RESOLVE_EXCEPTION": {
      s = { ...s, exceptions: s.exceptions.map((x) => (x.id === action.id ? { ...x, status: "resolved" } : x)), staffActions: s.staffActions + 1 };
      return log(s, "Operations", `Task resolved: ${s.exceptions.find((x) => x.id === action.id)?.category}.`);
    }

    case "RECONCILE_PAYMENT": {
      const p = patient(s, action.patientId);
      if (!p) return s;
      s = up(s, action.patientId, (q) => ({ ...q, payments: q.payments.map((pm) => (pm.id === action.paymentId ? { ...pm, status: action.to } : pm)) }));
      s = { ...s, staffActions: s.staffActions + 1 };
      return log(s, "Operations", `Payment ${action.to} for ${p.name}: ${p.payments.find((x) => x.id === action.paymentId)?.label}.`);
    }

    default:
      return s;
  }
}

const StoreCtx = createContext<{ state: FlowState; dispatch: React.Dispatch<Action> } | null>(null);

import { getSessionId } from "./session";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem("meridian-flow-v2");
        if (saved) {
          const parsed = JSON.parse(saved) as FlowState;
          if (parsed.v === 2 && Array.isArray(parsed.cancelledDoctors)) return parsed;
        }
      } catch {}
    }
    return buildSeed();
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("meridian-flow-v2", JSON.stringify(state));
    } catch {}
  }, [state]);

  const sentRef = useRef(0);
  useEffect(() => {
    if (state.events.length <= sentRef.current) {
      sentRef.current = Math.min(sentRef.current, state.events.length);
      return;
    }
    const fresh = state.events.slice(sentRef.current);
    sentRef.current = state.events.length;
    fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId(), events: fresh }),
      keepalive: true,
    }).catch(() => {});
  }, [state.events]);

  return <StoreCtx.Provider value={{ state, dispatch }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}
