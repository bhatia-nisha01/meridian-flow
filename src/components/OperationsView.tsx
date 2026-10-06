"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { ARRIVE_EARLY, computeForecasts, computeMetrics } from "@/lib/engine";
import { fmt, fmtWin, rupees } from "@/lib/types";
import { MEERA_ID } from "@/lib/seed";

type OpsTab = "approvals" | "clinic" | "tasks" | "money";

const TAB_CAPTIONS: Record<OpsTab, string> = {
  approvals: "Decisions waiting for your yes/no — scheduling requests and change proposals, each with the reason attached. Nothing moves without approval.",
  clinic: "Everyone due today, sorted by who needs action first (red = past their time, amber = due now). Use Actions ▾ on a row to check in, call, or hold.",
  tasks: "Every exception in one list — each has an owner, a deadline, and a stated next step.",
  money: "Payments due at the desk and uploaded reports waiting to be linked.",
};

export default function OperationsView() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<OpsTab>("approvals");
  const m = computeMetrics(state);

  const approvalsCount =
    state.patients.filter((p) => p.phase === "AWAITING_SCHEDULING_APPROVAL").length +
    state.proposals.filter((p) => p.status === "pending_staff" || p.status === "awaiting_patient").length;
  const clinicalCount = state.patients.filter((p) => p.phase === "AWAITING_CLINICAL_REVIEW").length;
  const tasksCount = state.exceptions.filter((x) => x.status === "open").length;
  const moneyCount = state.patients.reduce((a, p) => a + p.payments.filter((pm) => pm.status === "due").length, 0) + state.recordsQueue.filter((r) => !r.linked).length;

  // How many patients on today's board need desk action right now (mirrors the
  // rank-0 conditions in ClinicBoard).
  const needsActionNow =
    state.simPhase === "clinic"
      ? state.patients.filter((p) => {
          if (p.phase === "CANCELLED" || p.onHold) return false;
          if (p.visitDate && p.visitDate !== "Tue 6 Oct") return false;
          const win = p.agreedWindow;
          const notArrivedDue = p.phase === "BOOKED" && !!win && p.arrival !== "ARRIVED" && state.clock >= win[0] - ARRIVE_EARLY;
          const readinessPending = p.arrival === "ARRIVED" && p.readiness.some((t) => ["needed", "provided", "blocked"].includes(t.status));
          const payDue = p.arrival === "ARRIVED" && p.payments.some((pm) => pm.status === "due");
          return notArrivedDue || readinessPending || payDue;
        }).length
      : 0;

  // One-line orientation: the single most urgent place to look, with a jump.
  const opsHint: { text: string; go?: OpsTab; goLabel?: string } =
    needsActionNow > 0
      ? { text: `${needsActionNow} patient${needsActionNow > 1 ? "s" : ""} on today's board need${needsActionNow > 1 ? "" : "s"} action right now — the Next action column on each row tells you exactly what to do.`, go: "clinic", goLabel: "Open Today's clinic" }
      : approvalsCount + clinicalCount > 0
      ? { text: `${approvalsCount + clinicalCount} decision${approvalsCount + clinicalCount > 1 ? "s are" : " is"} waiting — nothing moves until you approve (and the patient accepts).`, go: "approvals", goLabel: "Open Approvals" }
      : state.simPhase === "booking"
      ? { text: "The clinic day hasn't started yet. New booking requests land in Approvals; to see the day in motion, go to 🧑 Patient and press ⏭ Jump to clinic day." }
      : tasksCount > 0
      ? { text: `${tasksCount} open task${tasksCount > 1 ? "s" : ""} — each has an owner, a deadline, and a next step.`, go: "tasks", goLabel: "Open Tasks" }
      : { text: "All quiet. Fire a scenario below (🚨 emergency arrival, a doctor delay, a cancellation) to watch the system respond." };

  return (
    <div className="space-y-4">
      {/* Orientation: where to look first */}
      <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-3.5 py-2 text-sm">
        <div>
          <span className="font-semibold">Start here:</span> {opsHint.text}
        </div>
        {opsHint.go && tab !== opsHint.go && (
          <button onClick={() => setTab(opsHint.go!)} className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">
            {opsHint.goLabel}
          </button>
        )}
      </div>
      {/* Outcome strip */}
      <div className="grid grid-cols-5 gap-3">
        <Kpi label="Median onsite wait (forecast)" value={`${m.medianWait}m`} sub="synthetic forecast" />
        <Kpi label="Original-time breaches" value={String(m.breaches)} warn={m.breaches > 0} sub="vs promised windows" />
        <Kpi label="Doctor utilization" value={`${m.utilization}%`} sub="completed consult minutes" />
        <Kpi label="Open tasks" value={String(m.openExceptions)} warn={m.openExceptions > 0} sub="each has an owner + deadline" />
        <Kpi label="Staff actions" value={String(m.staffActions)} sub="approvals, calls, reviews" />
      </div>

      {/* Emergency — always visible */}
      <EmergencyStrip />

      {/* Queue tabs */}
      <div className="flex gap-1.5">
        <QTab label={`Approvals ${approvalsCount ? `(${approvalsCount})` : ""}`} active={tab === "approvals"} onClick={() => setTab("approvals")} />
        <QTab label="Today's clinic" active={tab === "clinic"} onClick={() => setTab("clinic")} />
        <QTab label={`Tasks ${tasksCount ? `(${tasksCount})` : ""}`} active={tab === "tasks"} onClick={() => setTab("tasks")} />
        <QTab label={`Money & records ${moneyCount ? `(${moneyCount})` : ""}`} active={tab === "money"} onClick={() => setTab("money")} />
      </div>

      <div className="text-xs text-slate-500 -mt-2 px-0.5">{TAB_CAPTIONS[tab]}</div>

      {tab === "approvals" && <ApprovalsQueue />}
      {tab === "clinic" && <ClinicBoard />}
      {tab === "tasks" && <TasksQueue />}
      {tab === "money" && <MoneyRecords />}

      <Simulator />
      <EventFeed />
    </div>
  );
}

/* ---------- Approvals ---------- */
function ApprovalsQueue() {
  const { state, dispatch } = useStore();
  const schedulingQueue = state.patients.filter((p) => p.phase === "AWAITING_SCHEDULING_APPROVAL");
  const clinicalQueue = state.patients.filter((p) => p.phase === "AWAITING_CLINICAL_REVIEW");

  return (
    <div className="grid md:grid-cols-2 gap-4 items-start">
      <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-2">
        <div className="font-semibold">Scheduling approvals <span className="text-xs text-slate-400 font-normal">— coordination only; medical questions go to a clinician</span></div>
        {schedulingQueue.length === 0 && <div className="text-xs text-slate-400">Nothing waiting.</div>}
        {schedulingQueue.map((p) => (
          <div key={p.id} className="border border-amber-300 bg-amber-50 rounded-lg p-3">
            <div className="font-medium">{p.name} {p.walkIn && <span className="text-xs text-slate-500">(walk-in)</span>}</div>
            <div className="text-xs text-slate-600 mb-2">{p.reportedNeed || p.seedNote}{p.review.reviewer ? ` · clinician review: ${p.review.reviewer}` : ""}</div>
            <button
              onClick={() => (p.id.startsWith("p-meera") ? dispatch({ type: "OPS_APPROVE_SCHEDULING" }) : dispatch({ type: "OPS_APPROVE_WALKIN", patientId: p.id }))}
              className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 font-semibold"
            >
              Approve &amp; {p.id === MEERA_ID ? "offer times" : "slot in"}
            </button>
          </div>
        ))}
        {clinicalQueue.length > 0 && (
          <div className="text-xs text-slate-500 border-t border-slate-100 pt-2">
            {clinicalQueue.map((p) => (
              <div key={p.id}>🩺 {p.name}: waiting on <b>clinical</b> review — in the Clinician view, not here.</div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-2">
        <div className="font-semibold">Change proposals <span className="text-xs text-slate-400 font-normal">— nothing applies without approval + patient consent</span></div>
        {state.proposals.length === 0 && <div className="text-xs text-slate-400">None. Doctor delays and cancellations create proposals here.</div>}
        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {[...state.proposals].reverse().map((pr) => {
            const p = state.patients.find((q) => q.id === pr.patientId);
            return (
              <div key={pr.id} className={`border rounded-lg p-2.5 text-xs ${pr.status === "pending_staff" ? "border-blue-300 bg-blue-50" : pr.status === "awaiting_patient" ? "border-amber-300 bg-amber-50" : pr.status === "accepted" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50 opacity-75"}`}>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{pr.summary}</span>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">{pr.status.replace(/_/g, " ")}</span>
                </div>
                <div className="text-slate-500 mt-0.5">{pr.beforeLabel} → {pr.afterLabel}</div>
                <details className="mt-1 text-slate-500">
                  <summary className="cursor-pointer">Why</summary>
                  <ul className="list-disc ml-4 mt-1">{pr.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </details>
                {pr.status === "pending_staff" && (
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => dispatch({ type: "APPROVE_PROPOSAL", id: pr.id })} className="bg-blue-600 text-white rounded px-2.5 py-1 font-semibold">Approve</button>
                    <button onClick={() => dispatch({ type: "REJECT_PROPOSAL", id: pr.id, reason: "manager judgment" })} className="border border-slate-300 rounded px-2.5 py-1">Reject</button>
                  </div>
                )}
                {pr.status === "awaiting_patient" && pr.patientId !== MEERA_ID && (
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => dispatch({ type: "PATIENT_ACCEPT", id: pr.id, assisted: true })} className="bg-emerald-600 text-white rounded px-2.5 py-1">Record phone acceptance ({p?.name})</button>
                    <button onClick={() => dispatch({ type: "PATIENT_DECLINE", id: pr.id, assisted: true })} className="border border-slate-300 rounded px-2.5 py-1">Record refusal</button>
                  </div>
                )}
                {pr.status === "awaiting_patient" && pr.patientId === MEERA_ID && <div className="text-amber-700 mt-1">Sent to Meera — she responds in the Patient view.</div>}
                {pr.status === "stale" && <div className="text-slate-500 mt-1">Stale — plan changed after drafting; recompute.</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Clinic board ---------- */
function ClinicBoard() {
  const { state, dispatch } = useStore();
  const forecasts = computeForecasts(state);
  const emergencies = state.patients.filter((p) => p.patientType === "emergency" && p.phase !== "REQUESTED" && p.phase !== "CANCELLED");

  return (
    <div className="space-y-4">
      {/* Emergency queue — always separate, always first */}
      {emergencies.length > 0 && (
        <div className="bg-red-50 rounded-xl border border-red-300 p-4">
          <div className="font-semibold text-sm text-red-800 mb-1">🚨 Emergency queue — separate from OPD, always seen first</div>
          {emergencies.map((p) => (
            <div key={p.id} className="text-xs text-red-900">
              <b>{p.token}</b> · {p.name} — {p.reportedNeed} · assigned {state.clinicians.find((c) => c.id === p.clinicianId)?.name} ·{" "}
              {p.phase === "IN_CONSULT" ? "with the doctor now" : p.phase === "COMPLETE" ? "treated" : "next in line (payment never blocks emergency care)"}
            </div>
          ))}
        </div>
      )}

      {/* Capacity actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 text-xs flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-500">Capacity actions:</span>
        <button onClick={() => dispatch({ type: "REBALANCE_FIRST_VISITS" })} className="border border-blue-300 text-blue-700 rounded px-2.5 py-1 hover:bg-blue-50">
          ⚖ Generate load-balancing plan (proposals, not moves)
        </button>
        {state.clinicians.filter((c) => !state.cancelledDoctors.includes(c.id)).map((c) => (
          <button
            key={c.id}
            onClick={() => {
              if (confirm(`${c.name} unavailable for the rest of the session?\n\nThe system drafts a recovery proposal per affected patient (new doctor/time + a drafted message). Nothing moves until you approve each one and the patient accepts. Cancellation + refund only where nothing feasible fits.`))
                dispatch({ type: "CANCEL_DOCTOR_SESSION", clinicianId: c.id });
            }}
            className="border border-amber-300 text-amber-800 bg-amber-50 rounded px-2.5 py-1 hover:bg-amber-100"
          >
            {c.name} unavailable → draft recovery plan
          </button>
        ))}
        {state.cancelledDoctors.length > 0 && <span className="text-red-600">Cancelled: {state.cancelledDoctors.map((id) => state.clinicians.find((c) => c.id === id)?.name).join(", ")}</span>}
      </div>

      <ArrivalWatch />

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="font-semibold text-sm mb-2">Patients today <span className="text-[11px] font-normal text-slate-400">— patients come in their given slot and are tokenised on arrival</span></div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 text-left">
              <th className="py-1 pr-2">Patient</th>
              <th className="pr-2">Type</th>
              <th className="pr-2">Token</th>
              <th className="pr-2">Status</th>
              <th className="pr-2">Booked</th>
              <th className="pr-2">Forecast</th>
              <th className="pr-2">Arrival</th>
              <th className="pr-2">Call</th>
              <th className="pr-2">Next action</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.patients
              .filter((p) => (p.agreedWindow || ["AWAITING_SCHEDULING_APPROVAL", "AWAITING_CLINICAL_REVIEW"].includes(p.phase)) && (!p.visitDate || p.visitDate === "Tue 6 Oct"))
              .map((p) => {
                const f = forecasts.get(p.id);
                const win = p.agreedWindow;
                const dueSoon = state.simPhase === "clinic" && p.phase === "BOOKED" && win && p.arrival !== "ARRIVED" && !p.onHold && state.clock >= win[0] - ARRIVE_EARLY && state.clock < win[0];
                const overdue = state.simPhase === "clinic" && p.phase === "BOOKED" && win && p.arrival !== "ARRIVED" && !p.onHold && state.clock >= win[0];
                const arrivedLate = p.arrival === "ARRIVED" && win && p.arrivedAt != null && p.arrivedAt > win[0] - ARRIVE_EARLY;
                const readinessPending = p.readiness.some((t) => ["needed", "provided"].includes(t.status));
                const readinessBlocked = p.readiness.some((t) => t.status === "blocked");
                const payDue = p.payments.some((pm) => pm.status === "due") && p.arrival === "ARRIVED";

                let action = "—";
                let rank = 3;
                if (p.phase === "CANCELLED") { rank = 5; action = "none — cancelled & refunded"; }
                else if (p.onHold) { rank = 2; action = "▶ release when they're back"; }
                else if (overdue && !p.nonArrivalFlagged) { rank = 0; action = "⚑ flag non-arrival & follow up"; }
                else if (overdue && p.nonArrivalFlagged) { rank = 0; action = "desk following up (no auto-cancel)"; }
                else if (dueSoon && !p.callTranscript) { rank = 0; action = "📞 call: are you coming?"; }
                else if (dueSoon) { rank = 0; action = "called — awaiting reply"; }
                else if (p.arrival === "ARRIVED" && readinessBlocked) { rank = 0; action = "⛔ resource blocked — see Tasks"; }
                else if (p.arrival === "ARRIVED" && readinessPending) { rank = 0; action = "☑ verify readiness (or hold)"; }
                else if (payDue) { rank = 0; action = "₹ collect payment at desk"; }
                else if (p.phase === "IN_CONSULT") { rank = 1; action = "with the doctor"; }
                else if (p.arrival === "ARRIVED") { rank = 1; action = "ready — doctor will call token"; }
                else if (p.phase === "COMPLETE") { rank = 4; action = "done"; }

                const rowCls =
                  p.phase === "CANCELLED" ? "bg-slate-50 text-slate-400 line-through" :
                  rank === 0 ? (overdue || readinessBlocked ? "bg-red-50" : "bg-amber-50") :
                  p.onHold ? "bg-purple-50" :
                  p.phase === "IN_CONSULT" ? "bg-blue-50" :
                  p.arrival === "ARRIVED" ? "bg-emerald-50/60" : "";

                return { p, f, rank, action, rowCls, dueSoon, overdue, arrivedLate };
              })
              .sort((a, b) => a.rank - b.rank || (a.p.agreedWindow?.[0] ?? 0) - (b.p.agreedWindow?.[0] ?? 0))
              .map(({ p, f, action, rowCls, overdue, dueSoon, arrivedLate }) => (
                <tr key={p.id} className={`border-t border-slate-100 ${rowCls}`}>
                  <td className="py-1.5 pr-2 font-medium">{p.name}{p.assisted && <span className="text-slate-400 font-normal"> (assisted)</span>}</td>
                  <td className="pr-2"><TypeBadge t={p.patientType} /></td>
                  <td className="pr-2">{p.token ?? "—"}</td>
                  <td className="pr-2">{p.phase === "CANCELLED" ? "cancelled" : p.phase.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="pr-2">{p.agreedWindow ? fmtWin(p.agreedWindow) : "—"}</td>
                  <td className="pr-2">{f && p.phase === "BOOKED" ? <span className={f.breachesOriginal ? "text-amber-700 font-semibold" : ""}>{fmt(f.forecastStart)}{f.breachesOriginal && " ⚠"}</span> : "—"}</td>
                  <td className="pr-2">
                    {p.onHold ? <span className="text-purple-700 font-medium">⏸ hold: {p.onHold.reason}</span>
                      : overdue ? <span className="text-red-700 font-semibold">past time — not arrived</span>
                      : dueSoon ? <span className="text-amber-700 font-semibold">due now — not arrived</span>
                      : p.arrival === "ARRIVED" ? <span>✓ {p.arrivedAt != null ? fmt(p.arrivedAt) : ""}{arrivedLate && <span className="text-amber-700"> (late)</span>}</span>
                      : p.lateReply ? (p.lateReply.comingAt ? `coming ~${fmt(p.lateReply.comingAt)}` : "can't come")
                      : "not arrived"}
                  </td>
                  <td className="pr-2">
                    {p.confirmationCall === "confirmed" ? "✓" : p.confirmationCall === "no_answer" ? "no answer" : p.confirmationCall === "callback_requested" ? "callback" : p.confirmationCall === "cannot_attend" ? "can't attend" : "—"}
                  </td>
                  <td className="pr-2 text-[11px]">{action}</td>
                  <td className="whitespace-nowrap">
                    {p.phase !== "CANCELLED" && <ActionsMenu patientId={p.id} dueForNudge={!!dueSoon} nonArrival={!!overdue} />}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="font-semibold text-sm mb-2">Doctor timelines (16:00–20:00)</div>
        {state.clinicians.map((c) => (
          <div key={c.id} className="mb-2">
            <div className="text-xs text-slate-500 mb-0.5">
              {c.name} · {c.room} {state.clinicianDelays[c.id] ? <span className="text-amber-700 font-semibold">· running {state.clinicianDelays[c.id]}m late</span> : ""}
            </div>
            <div className="relative h-7 bg-slate-100 rounded">
              <Bar from={c.breakFrom} to={c.breakTo} color="bg-slate-300" label="break" />
              {state.patients
                .filter((p) => p.clinicianId === c.id && forecasts.get(p.id))
                .map((p) => {
                  const f = forecasts.get(p.id)!;
                  return <Bar key={p.id} from={f.forecastStart} to={f.forecastEnd} color={p.phase === "IN_CONSULT" ? "bg-blue-600" : p.phase === "COMPLETE" ? "bg-slate-400" : f.breachesOriginal ? "bg-amber-400" : "bg-emerald-400"} label={p.name.split(" ")[0]} />;
                })}
            </div>
          </div>
        ))}
        <div className="text-[11px] text-slate-400">Blue = in consult (locked) · green = on track · amber = past the promised window · grey = done/break.</div>
      </div>
    </div>
  );
}

function EmergencyStrip() {
  const { state, dispatch } = useStore();
  const active = state.patients.filter((p) => p.patientType === "emergency" && !["REQUESTED", "CANCELLED", "COMPLETE"].includes(p.phase));
  const ambulance = state.emergency.status !== "none";
  const hot = active.length > 0 || state.emergency.status === "requested";
  return (
    <div className={`rounded-xl border p-3 text-sm flex items-center justify-between gap-3 ${hot ? "bg-red-50 border-red-400" : "bg-white border-slate-200"}`}>
      <div className="flex items-center gap-2 min-w-0 text-xs">
        <span className={`font-bold ${hot ? "text-red-700" : "text-slate-400"}`}>🚨 Emergency</span>
        {active.length === 0 && !ambulance && <span className="text-slate-400">— none active. Separate queue; always seen first; payment never a precondition.</span>}
        {active.map((p) => (
          <span key={p.id} className="text-red-800 truncate">
            <b>{p.token}</b> {p.name} · {state.clinicians.find((c) => c.id === p.clinicianId)?.name} · {p.phase === "IN_CONSULT" ? "with doctor" : "front of queue"}
          </span>
        ))}
        {ambulance && (
          <span className="text-red-800">
            Ambulance: {state.emergency.status === "dispatched" ? `dispatched · ETA ${state.emergency.etaMin}m` : "requested"}
          </span>
        )}
      </div>
      {state.emergency.status === "requested" && (
        <button onClick={() => dispatch({ type: "OPS_DISPATCH_AMBULANCE" })} className="bg-red-600 text-white rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
          Confirm dispatch
        </button>
      )}
    </div>
  );
}

function ArrivalWatch() {
  const { state, dispatch } = useStore();
  if (state.simPhase !== "clinic") return null;
  const bookedUnarrived = state.patients.filter((p) => p.phase === "BOOKED" && p.agreedWindow && p.arrival !== "ARRIVED" && !p.onHold);
  const dueSoon = bookedUnarrived.filter((p) => state.clock >= p.agreedWindow![0] - ARRIVE_EARLY && state.clock < p.agreedWindow![0]);
  const overdue = bookedUnarrived.filter((p) => state.clock >= p.agreedWindow![0]);
  if (dueSoon.length === 0 && overdue.length === 0) return null;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-amber-300 p-4 text-sm">
        <div className="font-semibold text-amber-800 mb-1">⏰ Due now, not arrived <span className="text-[11px] font-normal text-slate-400">(inside the 15-min arrival window)</span></div>
        {dueSoon.length === 0 && <div className="text-xs text-slate-400">Nobody.</div>}
        {dueSoon.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs border-t border-slate-100 py-1.5">
            <span><b>{p.name}</b> · slot {fmtWin(p.agreedWindow!)}{p.lateReply?.comingAt ? ` · said coming ~${fmt(p.lateReply.comingAt)}` : ""}</span>
            {!p.callTranscript ? (
              <button onClick={() => dispatch({ type: "SEND_ARRIVAL_NUDGE", patientId: p.id })} className="border border-amber-300 bg-amber-50 text-amber-900 rounded px-2 py-0.5 whitespace-nowrap">
                Next: 📞 are you coming?
              </button>
            ) : (
              <span className="text-slate-400">called — awaiting reply</span>
            )}
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-red-300 p-4 text-sm">
        <div className="font-semibold text-red-700 mb-1">⏱ Past appointment time, not arrived</div>
        {overdue.length === 0 && <div className="text-xs text-slate-400">Nobody.</div>}
        {overdue.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs border-t border-slate-100 py-1.5">
            <span><b>{p.name}</b> · was {fmtWin(p.agreedWindow!)}{p.lateReply ? (p.lateReply.comingAt ? ` · coming ~${fmt(p.lateReply.comingAt)}` : " · can't come") : ""}</span>
            {!p.nonArrivalFlagged ? (
              <button onClick={() => dispatch({ type: "FLAG_NON_ARRIVAL", patientId: p.id })} className="border border-red-300 bg-red-50 text-red-700 rounded px-2 py-0.5 whitespace-nowrap">
                Next: ⚑ flag for follow-up
              </button>
            ) : (
              <span className="text-red-600">flagged — desk following up (no auto-cancel)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Tasks ---------- */
function TasksQueue() {
  const { state, dispatch } = useStore();
  const open = state.exceptions.filter((x) => x.status === "open");
  const resolved = state.exceptions.filter((x) => x.status === "resolved");
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-2">
      <div className="font-semibold">Open tasks — every one has an owner and a deadline</div>
      {open.length === 0 && <div className="text-xs text-slate-400">All clear.</div>}
      {open.map((x) => (
        <div key={x.id} className={`border rounded-lg p-2.5 text-xs ${x.category.startsWith("EMERGENCY") ? "border-red-400 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex justify-between gap-2">
            <span className="font-medium">{x.category}</span>
            <span className="text-slate-500 whitespace-nowrap">owner: {x.owner} · due: {x.deadline}</span>
          </div>
          <div className="text-slate-600 mt-0.5">{x.detail}</div>
          <div className="text-blue-800 mt-1"><b>Next step:</b> {x.nextStep}</div>
          <div className="flex gap-2 mt-1.5">
            {x.category === "Patient unhappy with offered slots" && (
              <button onClick={() => dispatch({ type: "STAFF_IMMEDIATE_OFFER" })} className="bg-blue-600 text-white rounded px-2.5 py-1 font-semibold">
                Scheduling callback complete → offer earliest feasible slot
              </button>
            )}
            {x.category.startsWith("EMERGENCY") && state.emergency.status === "requested" && (
              <button onClick={() => dispatch({ type: "OPS_DISPATCH_AMBULANCE" })} className="bg-red-600 text-white rounded px-2.5 py-1 font-semibold">Confirm ambulance dispatch (ETA 12m)</button>
            )}
            <button onClick={() => dispatch({ type: "RESOLVE_EXCEPTION", id: x.id })} className="border border-slate-300 rounded px-2.5 py-1">Mark resolved</button>
          </div>
        </div>
      ))}
      {resolved.length > 0 && (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer">Resolved ({resolved.length})</summary>
          {resolved.map((x) => (
            <div key={x.id} className="py-0.5">✓ {x.category} — {x.owner}</div>
          ))}
        </details>
      )}
    </div>
  );
}

/* ---------- Money & records ---------- */
function MoneyRecords() {
  const { state, dispatch } = useStore();
  const duePayments = state.patients.flatMap((p) => p.payments.filter((pm) => pm.status === "due").map((pm) => ({ p, pm })));
  const others = state.patients.flatMap((p) => p.payments.filter((pm) => pm.status !== "due").map((pm) => ({ p, pm })));
  return (
    <div className="grid md:grid-cols-2 gap-4 items-start">
      <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-2">
        <div className="font-semibold">Payments</div>
        {duePayments.length === 0 && <div className="text-xs text-slate-400">No outstanding balances.</div>}
        {duePayments.map(({ p, pm }) => (
          <div key={pm.id} className="flex items-center justify-between border border-amber-200 bg-amber-50 rounded-lg px-2.5 py-1.5 text-xs">
            <span>
              <b>{p.name}</b> · {pm.label} · {rupees(pm.amount)}
            </span>
            <button onClick={() => dispatch({ type: "RECONCILE_PAYMENT", patientId: p.id, paymentId: pm.id, to: "paid" })} className="border border-emerald-300 text-emerald-700 rounded px-2 py-0.5">
              Mark paid at desk
            </button>
          </div>
        ))}
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer">Settled / refunded ({others.length})</summary>
          {others.map(({ p, pm }) => (
            <div key={pm.id} className="py-0.5">
              {p.name} · {pm.label} · {rupees(pm.amount)} · {pm.status}
            </div>
          ))}
        </details>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-2">
        <div className="font-semibold">Uploaded reports to link</div>
        {state.recordsQueue.filter((r) => !r.linked).length === 0 && <div className="text-xs text-slate-400">Nothing waiting. Patient uploads appear here for identity-checked linking.</div>}
        {state.recordsQueue.filter((r) => !r.linked).map((r) => (
          <div key={r.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
            <span>
              “{r.docName}” → <b>{state.patients.find((p) => p.id === r.patientId)?.name}</b>
            </span>
            <button onClick={() => dispatch({ type: "LINK_RECORD", recordId: r.id })} className="border border-blue-300 text-blue-700 rounded px-2 py-0.5">
              Link to record
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Simulator + feed ---------- */
function Simulator() {
  const { state, dispatch } = useStore();
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-300 p-3 text-xs">
      <span className="font-semibold text-slate-500 mr-2" title="These buttons fire disruptions so you can watch the system recover — they are part of the demo, not the product">Scenario controls — make something go wrong, watch the recovery:</span>
      <span className="inline-flex flex-wrap gap-1.5">
        <SBtn onClick={() => dispatch({ type: "CLINICIAN_DELAY", clinicianId: "dr-mehta", minutes: 35, reason: "earlier case overran" })} label="Dr Mehta +35 min" />
        <SBtn onClick={() => dispatch({ type: "WALKIN_ARRIVES", which: "routine" })} label="Routine walk-in (Tara)" />
        <SBtn onClick={() => dispatch({ type: "WALKIN_ARRIVES", which: "clinical" })} label="Walk-in needing clinical review (Sameer)" />
        <SBtn onClick={() => dispatch({ type: "INJECT_CANCELLATION" })} label="Nikhil cancels" />
        <SBtn onClick={() => dispatch({ type: "INJECT_IMAGING" })} label="Imaging down" />
        <SBtn onClick={() => dispatch({ type: "EMERGENCY_WALKIN" })} label="🚨 Emergency patient arrives (Rohan)" />
      </span>
    </div>
  );
}

function SBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 rounded px-2 py-1">
      ⚡ {label}
    </button>
  );
}

function EventFeed() {
  const { state } = useStore();
  return (
    <details className="bg-white rounded-xl border border-slate-200 p-4 text-sm">
      <summary className="font-semibold cursor-pointer">Activity log ({state.events.length})</summary>
      <div className="space-y-1 max-h-[240px] overflow-y-auto text-[11px] text-slate-600 mt-2">
        {[...state.events].reverse().map((e) => (
          <div key={e.id} className="border-b border-slate-100 pb-1">
            <span className="text-slate-400">{e.phase === "booking" ? "Mon" : fmt(e.clock)}</span> · <b>{e.actor}</b>: {e.text}
          </div>
        ))}
      </div>
    </details>
  );
}

function ActionsMenu({ patientId, dueForNudge, nonArrival }: { patientId: string; dueForNudge: boolean; nonArrival: boolean }) {
  const { state, dispatch } = useStore();
  const p = state.patients.find((x) => x.id === patientId)!;
  const [open, setOpen] = useState(false);

  const items: { label: string; danger?: boolean; fn: () => void }[] = [];
  if (state.simPhase === "clinic" && p.arrival !== "ARRIVED" && p.phase === "BOOKED") items.push({ label: "✓ Check in (issue token)", fn: () => dispatch({ type: "CHECK_IN", patientId }) });
  if (p.readiness.some((t) => ["needed", "provided"].includes(t.status)) && ["BOOKED"].includes(p.phase)) items.push({ label: "☑ Verify readiness", fn: () => dispatch({ type: "VERIFY_ALL_TASKS", patientId }) });
  if (p.phase === "BOOKED" && !p.onHold && p.arrival === "ARRIVED" && p.readiness.some((t) => !["verified", "not_required"].includes(t.status)))
    items.push({ label: "⏸ Put on hold — arranging checklist item", fn: () => dispatch({ type: "HOLD_PATIENT", patientId, reason: p.readiness.find((t) => !["verified", "not_required"].includes(t.status))?.label ?? "pending item" }) });
  if (p.phase === "BOOKED" && !p.onHold) items.push({ label: "⏸ Put on hold — other reason", fn: () => dispatch({ type: "HOLD_PATIENT", patientId, reason: "patient arranging a pending item" }) });
  if (p.onHold) items.push({ label: "▶ Release hold (patient is back & ready)", fn: () => { dispatch({ type: "RELEASE_HOLD", patientId }); dispatch({ type: "VERIFY_ALL_TASKS", patientId }); } });
  if (dueForNudge && !p.callTranscript) items.push({ label: "📞 Call: are you coming?", fn: () => dispatch({ type: "SEND_ARRIVAL_NUDGE", patientId }) });
  if (nonArrival && !p.nonArrivalFlagged) items.push({ label: "⚑ Flag non-arrival", danger: true, fn: () => dispatch({ type: "FLAG_NON_ARRIVAL", patientId }) });
  if (items.length === 0) return <span className="text-[11px] text-slate-300">—</span>;
  return (
    <span className="relative inline-block">
      <button onClick={() => setOpen((v) => !v)} className="text-[11px] border border-slate-300 rounded px-2 py-0.5 text-slate-600 hover:bg-slate-50">
        Actions ▾
      </button>
      {open && (
        <span className="absolute right-0 z-20 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg block">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => {
                setOpen(false);
                it.fn();
              }}
              className={`block w-full text-left text-[11px] px-3 py-1.5 hover:bg-slate-50 ${it.danger ? "text-red-600" : "text-slate-700"}`}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function TypeBadge({ t }: { t: string }) {
  const map: Record<string, string> = {
    first_visit: "bg-blue-50 text-blue-700 border-blue-200",
    follow_up: "bg-slate-100 text-slate-600 border-slate-200",
    walk_in: "bg-amber-50 text-amber-700 border-amber-200",
    emergency: "bg-red-100 text-red-700 border-red-300",
  };
  return <span className={`border rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap ${map[t] ?? ""}`}>{t.replace("_", " ")}</span>;
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border p-3 ${warn ? "border-amber-300" : "border-slate-200"}`}>
      <div className={`text-xl font-bold ${warn ? "text-amber-700" : "text-slate-800"}`}>{value}</div>
      <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}

function QTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-sm rounded-lg px-3.5 py-1.5 border ${active ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {label}
    </button>
  );
}

function Bar({ from, to, color, label }: { from: number; to: number; color: string; label: string }) {
  const DAY_START = 16 * 60;
  const DAY_END = 20 * 60;
  const left = Math.max(0, ((from - DAY_START) / (DAY_END - DAY_START)) * 100);
  const width = Math.min(100 - left, ((to - from) / (DAY_END - DAY_START)) * 100);
  if (width <= 0) return null;
  return (
    <div className={`absolute top-0.5 bottom-0.5 ${color} rounded text-[9px] text-white overflow-hidden whitespace-nowrap px-1 leading-6`} style={{ left: `${left}%`, width: `${width}%` }} title={label}>
      {label}
    </div>
  );
}
