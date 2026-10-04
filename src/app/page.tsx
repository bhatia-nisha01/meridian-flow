"use client";

import { useEffect, useState } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import PatientView from "@/components/PatientView";
import OperationsView from "@/components/OperationsView";
import ClinicianView from "@/components/ClinicianView";
import { fmt } from "@/lib/types";
import { getRole } from "@/lib/session";

function Shell() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<"patient" | "ops" | "clin">("patient");
  const [role, setRole] = useState<"all" | "patient" | "ops" | "clinician">("all");

  useEffect(() => {
    const r = getRole();
    setRole(r);
    if (r === "ops") setTab("ops");
    if (r === "clinician") setTab("clin");
  }, []);

  // Patient-only mode: staff steps happen automatically (labelled as simulated staff)
  // so a solo tester is never stuck waiting for a reviewer who doesn't exist.
  const meera = state.patients.find((p) => p.id === "p-meera");
  useEffect(() => {
    if (role !== "patient") return;
    if (meera?.phase === "AWAITING_SCHEDULING_APPROVAL") {
      const t = setTimeout(() => dispatch({ type: "OPS_APPROVE_SCHEDULING" }), 5000);
      return () => clearTimeout(t);
    }
  }, [role, meera?.phase, dispatch]);
  useEffect(() => {
    if (role !== "patient") return;
    const pending = state.proposals.find((p) => p.status === "pending_staff" && p.patientId === "p-meera");
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
      ["patient", "🧑 Patient"],
      ["ops", "🏥 Operations"],
      ["clin", "🩺 Clinician"],
    ] as const
  ).filter(([k]) => role === "all" || (role === "patient" && k === "patient") || (role === "ops" && k !== "clin") || (role === "clinician" && k !== "ops"));

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
              {visibleTabs.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 font-medium ${tab === k ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
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
            <button
              onClick={() => {
                if (confirm("Reset the simulation to the original seed?")) dispatch({ type: "RESET" });
              }}
              className="border border-slate-600 text-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-800"
            >
              ↺ Reset
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-5">
        {tab === "patient" && <PatientView />}
        {tab === "ops" && <OperationsView />}
        {tab === "clin" && <ClinicianView />}
      </main>

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
