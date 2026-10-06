"use client";

import { useEffect, useState } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import PatientView from "@/components/PatientView";
import OperationsView from "@/components/OperationsView";
import ClinicianView from "@/components/ClinicianView";
import GuideOverlay from "@/components/GuideOverlay";
import { fmt, FlowState } from "@/lib/types";
import { getRole } from "@/lib/session";

// One line telling a first-time tester what to do next; first match wins.
function nextHint(state: FlowState, tab: string): string | null {
  const meera = state.patients.filter((p) => p.id.startsWith("p-meera"));
  if (meera.some((p) => p.phase === "AWAITING_PAYMENT")) return "Pay (simulated) to confirm your booking.";
  if (meera.some((p) => p.phase === "AWAITING_CLINICAL_REVIEW")) return "A clinician must review this request — open the 🩺 Clinician tab and act as the reviewer.";
  if (state.simPhase === "booking" && meera.length === 0) return "Start here: tell the assistant what you need in the chat below.";
  if (state.simPhase === "booking" && meera.some((p) => p.phase === "BOOKED")) return "Your visit is booked. Press ⏭ Jump to clinic day (top bar) to see the clinic running.";
  if (state.simPhase !== "booking" && tab === "patient") return "Now run the clinic: open 🏥 Operations to check patients in, or 🩺 Clinician to consult.";
  return null;
}

function Shell() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<"patient" | "ops" | "clin">("patient");
  const [role, setRole] = useState<"all" | "patient" | "ops" | "clinician">("all");
  const [showGuide, setShowGuide] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  useEffect(() => {
    const r = getRole();
    setRole(r);
    if (r === "ops") setTab("ops");
    if (r === "clinician") setTab("clin");
    setShowGuide(true);
  }, []);

  // Patient-only mode: staff steps happen automatically (labelled as simulated staff)
  // so a solo tester is never stuck waiting for a reviewer who doesn't exist.
  const awaitingClinical = state.patients.find((p) => p.id.startsWith("p-meera") && p.phase === "AWAITING_CLINICAL_REVIEW");
  const awaitingScheduling = state.patients.find((p) => p.id.startsWith("p-meera") && p.phase === "AWAITING_SCHEDULING_APPROVAL");
  useEffect(() => {
    if (role !== "patient" || !awaitingClinical) return;
    const t = setTimeout(() => dispatch({ type: "CLINICAL_REVIEW_RESOLVE", patientId: awaitingClinical.id, outcome: "approve" }), 6000);
    return () => clearTimeout(t);
  }, [role, awaitingClinical?.id, dispatch]);
  useEffect(() => {
    if (role !== "patient" || !awaitingScheduling) return;
    const t = setTimeout(() => dispatch({ type: "OPS_APPROVE_SCHEDULING" }), 5000);
    return () => clearTimeout(t);
  }, [role, awaitingScheduling?.id, dispatch]);
  useEffect(() => {
    if (role !== "patient") return;
    const pending = state.proposals.find((p) => p.status === "pending_staff" && p.patientId.startsWith("p-meera"));
    if (pending) {
      const t = setTimeout(() => dispatch({ type: "APPROVE_PROPOSAL", id: pending.id }), 4000);
      return () => clearTimeout(t);
    }
  }, [role, state.proposals, dispatch]);
  useEffect(() => {
    if (role !== "patient") return;
    if (state.emergency.status === "requested") {
      const t = setTimeout(() => dispatch({ type: "OPS_DISPATCH_AMBULANCE" }), 4000);
      return () => clearTimeout(t);
    }
  }, [role, state.emergency.status, dispatch]);

  const visibleTabs = (
    [
      ["patient", "🧑 Patient", "Book and manage your visit"],
      ["ops", "🏥 Operations", "Front desk: run the clinic day"],
      ["clin", "🩺 Clinician", "The doctor's screen"],
    ] as const
  ).filter(([k]) => role === "all" || (role === "patient" && k === "patient") || (role === "ops" && k !== "clin") || (role === "clinician" && k !== "ops"));

  const hint = role === "all" && !hintDismissed ? nextHint(state, tab) : null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white px-6 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold">
              Meridian Flow <span className="text-amber-400 text-xs font-medium align-middle border border-amber-400/50 rounded px-1.5 py-0.5 ml-1">SIMULATION</span>
            </h1>
            <p className="text-slate-400 text-xs">
              Orthopaedics OPD · {state.simPhase === "booking" ? "Booking evening — Mon 5 Oct 2026" : `Clinic day — Tue 6 Oct 2026, ${fmt(state.clock)}`} (Asia/Kolkata) · plan v{state.planVersion} · recommend mode
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {visibleTabs.map(([k, label, tip]) => (
                <button key={k} onClick={() => setTab(k)} title={tip} className={`px-3 py-1.5 font-medium ${tab === k ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                  {label}
                </button>
              ))}
            </div>
            {state.simPhase === "booking" ? (
              <button onClick={() => dispatch({ type: "JUMP_TO_CLINIC" })} className="border border-amber-500/60 text-amber-300 rounded-lg px-3 py-1.5 hover:bg-slate-800">
                ⏭ Jump to clinic day
              </button>
            ) : tab === "ops" ? (
              <button onClick={() => dispatch({ type: "ADVANCE_CLOCK", minutes: 10 })} className="border border-slate-600 text-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-800" title="Simulation clock control">
                ⏩ clock +10 min
              </button>
            ) : null}
            <button onClick={() => setShowGuide(true)} title="What is this and what should I try?" className="border border-slate-600 text-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-800">
              ❓ How this works
            </button>
            <button
              onClick={() => {
                if (confirm("Restart the demo? This clears your test bookings and restores the original synthetic data.")) dispatch({ type: "RESET" });
              }}
              title="Wipes your test bookings and restores the original demo data"
              className="border border-amber-500/60 text-amber-300 rounded-lg px-3 py-1.5 hover:bg-slate-800"
            >
              ↺ Restart demo
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-5">
        {hint && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-3.5 py-2 text-sm">
            <div>
              <span className="font-semibold">Next step:</span> {hint}
            </div>
            <button onClick={() => setHintDismissed(true)} title="Hide hints" className="text-blue-400 hover:text-blue-700 font-bold px-1">
              ×
            </button>
          </div>
        )}
        {tab === "patient" && <PatientView />}
        {tab === "ops" && <OperationsView />}
        {tab === "clin" && <ClinicianView />}
      </main>

      <footer className="max-w-[1400px] mx-auto px-5 pb-6 text-[11px] text-slate-400">
        Simulation — synthetic data only. Conversational intake runs live on a large language model; it cannot diagnose or change the
        schedule. Interactions are recorded for prototype evaluation.
      </footer>

      {showGuide && <GuideOverlay onClose={() => setShowGuide(false)} />}

    </div>
  );
}

export default function Page() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
