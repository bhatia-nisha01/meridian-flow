"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { computeForecasts } from "@/lib/engine";
import { fmt, fmtWin } from "@/lib/types";

export default function ClinicianView() {
  const { state, dispatch } = useStore();
  const [clinId, setClinId] = useState("dr-mehta");
  const forecasts = computeForecasts(state);
  const clin = state.clinicians.find((c) => c.id === clinId)!;

  const current = state.patients.find((p) => p.clinicianId === clinId && p.phase === "IN_CONSULT");
  const roster = state.patients
    .filter((p) => p.clinicianId === clinId && p.agreedWindow && !["CANCELLED"].includes(p.phase))
    .sort((a, b) => a.agreedWindow![0] - b.agreedWindow![0]);
  const clinicalReviews = state.patients.filter((p) => p.phase === "AWAITING_CLINICAL_REVIEW");

  const blockReason = (p: (typeof roster)[number]): string | null => {
    if (current) return `${current.name}'s consultation is still active — finish it first`;
    if (p.phase === "COMPLETE") return null;
    if (p.onHold) return `On hold — arranging: ${p.onHold.reason} (front desk releases when resolved)`;
    if (p.arrival !== "ARRIVED") return "Not checked in yet (front desk checks in on arrival)";
    const un = p.readiness.find((t) => !["verified", "not_required"].includes(t.status));
    if (un) return `Readiness: ${un.label} is ${un.status}${un.status === "blocked" ? " (resource outage)" : ""}`;
    return null;
  };
  const sortedRoster = [...roster].sort((a, b) => ((a.patientType === "emergency" ? 0 : 1) - (b.patientType === "emergency" ? 0 : 1)) || (a.agreedWindow?.[0] ?? 0) - (b.agreedWindow?.[0] ?? 0));
  const next = sortedRoster.find((p) => p.phase === "BOOKED" && !blockReason(p)) ?? sortedRoster.find((p) => p.phase === "BOOKED");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">Simulated clinician role (labelled — not real sign-in):</span>
        {state.clinicians.map((c) => (
          <button key={c.id} onClick={() => setClinId(c.id)} className={`text-sm rounded-lg px-3 py-1.5 border ${clinId === c.id ? "bg-slate-800 text-white border-slate-800" : "border-slate-300 text-slate-600"}`}>
            {c.name}
          </button>
        ))}
        <span className="flex-1" />
        <AvailabilityControls clinId={clinId} />
      </div>

      {/* Clinical review queue */}
      {clinicalReviews.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 p-4 text-sm space-y-2">
          <div className="font-semibold">Clinical review requests <span className="text-xs font-normal text-slate-400">— medical judgment only a clinician can give</span></div>
          {clinicalReviews.map((p) => (
            <div key={p.id} className="border border-slate-200 rounded-lg p-3">
              <div className="font-medium">{p.name} <span className="text-xs text-slate-500">(walk-in)</span></div>
              <div className="text-xs text-slate-600 mb-2">Reported: {p.reportedNeed}</div>
              <div className="flex gap-2">
                <button onClick={() => dispatch({ type: "CLINICAL_REVIEW_RESOLVE", patientId: p.id, outcome: "approve" })} className="text-xs bg-blue-600 text-white rounded px-3 py-1.5">
                  Suitable for routine consult → send to scheduling
                </button>
                <button onClick={() => dispatch({ type: "CLINICAL_REVIEW_RESOLVE", patientId: p.id, outcome: "escalate" })} className="text-xs border border-red-300 text-red-700 rounded px-3 py-1.5">
                  Escalate to emergency team
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 items-start">
        {/* Current consultation */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 text-sm space-y-3">
          <div className="font-semibold text-base">Current consultation — {clin.name} ({clin.room})</div>
          {current ? (
            <>
              <div className="border border-blue-200 bg-blue-50 rounded-lg p-3">
                <div className="font-semibold">{current.name}</div>
                <div className="text-xs text-slate-600">Started {current.consultStartedAt != null ? fmt(current.consultStartedAt) : "—"} · estimate {current.durationEstimate} min</div>
              </div>
              <PatientInfo patientId={current.id} />
              <OutcomeForm patientId={current.id} />
            </>
          ) : (
            <div className="text-slate-400 text-xs">No active consultation.</div>
          )}
        </div>

        {/* Schedule */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 text-sm space-y-3">
          <div className="font-semibold text-base">Today&apos;s schedule</div>
          {next && (
            <div className="border border-slate-200 bg-slate-50 rounded-lg p-3 space-y-2">
              <div className="font-semibold">
                Next: {next.name}
                {next.patientType === "emergency" && <span className="ml-2 text-xs bg-red-600 text-white rounded px-1.5 py-0.5">🚨 EMERGENCY — always first</span>}
                <span className="text-xs text-slate-400 font-normal"> booked {next.agreedWindow ? fmtWin(next.agreedWindow) : ""}{next.token ? ` · token ${next.token}` : ""}</span>
              </div>
              <PatientInfo patientId={next.id} />
              {blockReason(next) ? (
                <div className="border border-amber-300 bg-amber-50 rounded-lg p-2 text-xs text-amber-900">⛔ Cannot start yet: {blockReason(next)}</div>
              ) : (
                <button onClick={() => dispatch({ type: "START_CONSULT", patientId: next.id })} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-semibold">
                  Start consultation
                </button>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            {sortedRoster.map((p) => {
              const reason = p.phase === "BOOKED" ? blockReason(p) : null;
              const f = forecasts.get(p.id);
              const isEmergency = p.patientType === "emergency";
              const statusChip =
                p.phase === "COMPLETE" ? ["Done", "bg-slate-100 text-slate-500"] :
                p.phase === "IN_CONSULT" ? ["In consult", "bg-blue-600 text-white"] :
                p.onHold ? ["On hold", "bg-purple-100 text-purple-700"] :
                p.arrival === "ARRIVED" ? ["Ready" + (reason ? " soon" : ""), reason ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"] :
                ["Not arrived", "bg-slate-100 text-slate-500"];
              return (
                <div key={p.id} className={`rounded-lg border p-2.5 ${isEmergency ? "border-red-300 bg-red-50" : p.phase === "IN_CONSULT" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-slate-500 w-[76px] shrink-0">{p.agreedWindow ? fmtWin(p.agreedWindow) : "—"}</span>
                      <span className="font-semibold text-sm truncate">{isEmergency && "🚨 "}{p.name}</span>
                      {p.token && <span className="text-[10px] font-mono bg-slate-100 border border-slate-200 rounded px-1">{p.token}</span>}
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{p.patientType.replace("_", " ")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${statusChip[1]}`}>{statusChip[0]}</span>
                      {p.phase === "BOOKED" && !reason && (
                        <button onClick={() => dispatch({ type: "START_CONSULT", patientId: p.id })} className="text-[11px] bg-blue-600 text-white rounded px-2.5 py-1 font-semibold">Start</button>
                      )}
                    </div>
                  </div>
                  {reason && p.phase === "BOOKED" && <div className="text-[10px] text-amber-700 mt-1 ml-[84px]">{reason}</div>}
                  {f?.breachesOriginal && p.phase === "BOOKED" && <div className="text-[10px] text-amber-700 mt-0.5 ml-[84px]">Forecast {fmt(f.forecastStart)} — past the promised window</div>}
                </div>
              );
            })}
            {roster.length === 0 && <div className="text-slate-400 text-xs">No patients on this roster.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PatientInfo({ patientId }: { patientId: string }) {
  const { state } = useStore();
  const p = state.patients.find((x) => x.id === patientId)!;
  return (
    <details className="text-xs text-slate-600 border border-slate-200 rounded-lg p-2 bg-white">
      <summary className="cursor-pointer font-medium">Patient information</summary>
      <div className="mt-1.5 space-y-1">
        <div><b>Reason (patient-reported, unverified):</b> {p.reportedNeed || p.seedNote}</div>
        <div><b>Pathway:</b> {p.review.pathway ?? "—"} {p.review.reviewer && `· ${p.review.reviewer}`}</div>
        {p.history.length > 0 && (
          <div>
            <b>History:</b>
            {p.history.slice(0, 3).map((h, i) => (
              <div key={i} className="ml-2">· {h.date} {h.doctor}: {h.reason} → {h.outcome}</div>
            ))}
          </div>
        )}
        {p.documents.length > 0 && <div><b>Reports:</b> {p.documents.map((d) => `${d.name} (${d.status})`).join(" · ")}</div>}
        <div><b>Readiness:</b> {p.readiness.map((t) => `${t.label}: ${t.status}`).join(" · ") || "—"}</div>
        <div className="text-slate-400">Automated summary from recorded facts — no diagnosis is ever generated.</div>
      </div>
    </details>
  );
}

function AvailabilityControls({ clinId }: { clinId: string }) {
  const { state, dispatch } = useStore();
  const name = state.clinicians.find((c) => c.id === clinId)?.name;
  return (
    <div className="flex gap-1.5 text-xs">
      <button onClick={() => dispatch({ type: "CLINICIAN_DELAY", clinicianId: clinId, minutes: 20, reason: "running behind" })} className="border border-amber-300 bg-amber-50 text-amber-900 rounded px-2.5 py-1.5">
        Report: {name} running 20 min late
      </button>
      <button onClick={() => dispatch({ type: "CLINICIAN_DELAY", clinicianId: clinId, minutes: 45, reason: "called to emergency duty" })} className="border border-red-300 bg-red-50 text-red-800 rounded px-2.5 py-1.5">
        Called to emergency duty (45 min)
      </button>
    </div>
  );
}

function OutcomeForm({ patientId }: { patientId: string }) {
  const { dispatch } = useStore();
  const [notes, setNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState("Patellofemoral pain syndrome");
  const [plan, setPlan] = useState("Physiotherapy 3×/week for 3 weeks; review after");
  const [rx, setRx] = useState("Paracetamol 500mg PRN");
  const [orderTest, setOrderTest] = useState(false);
  const [orderFollowUp, setOrderFollowUp] = useState(true);
  const [orderReferral, setOrderReferral] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
      <div className="font-semibold text-sm">Record outcome &amp; next steps</div>
      <label className="block">
        Diagnosis
        <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 mt-0.5" />
      </label>
      <label className="block">
        Treatment plan
        <input value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 mt-0.5" />
      </label>
      <label className="block">
        Prescription
        <input value={rx} onChange={(e) => setRx(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 mt-0.5" />
      </label>
      <label className="block">
        Clinical notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" className="w-full border border-slate-300 rounded px-2 py-1 mt-0.5" />
      </label>
      <div className="space-y-1">
        <div className="font-medium">Order next steps (booked by the patient, strictly within your instruction):</div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={orderFollowUp} onChange={(e) => setOrderFollowUp(e.target.checked)} /> Follow-up: 20–21 Oct, after 17:00, same clinician · ₹400</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={orderTest} onChange={(e) => setOrderTest(e.target.checked)} /> Knee X-ray before follow-up · ₹900</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={orderReferral} onChange={(e) => setOrderReferral(e.target.checked)} /> Referral: sports-medicine physiotherapist</label>
      </div>
      <button
        onClick={() =>
          dispatch({
            type: "FINISH_CONSULT",
            patientId,
            outcome: { notes, diagnosis, plan, prescription: rx },
            orders: [
              ...(orderFollowUp ? [{ kind: "follow_up" as const, label: "Follow-up consultation", instruction: "20–21 Oct 2026, after 17:00, same clinician", fee: 400 }] : []),
              ...(orderTest ? [{ kind: "test" as const, label: "Knee X-ray", instruction: "Before the follow-up; any Meridian imaging centre", fee: 900 }] : []),
              ...(orderReferral ? [{ kind: "referral" as const, label: "Sports-medicine physio referral", instruction: "Referral desk coordinates; bring consult summary", fee: 0 }] : []),
            ],
          })
        }
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-sm font-semibold"
      >
        Finish consultation &amp; record
      </button>
    </div>
  );
}
