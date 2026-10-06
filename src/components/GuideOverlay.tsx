"use client";

// First-visit orientation overlay. Shown once (localStorage flag), reopenable
// from the header "❓ How this works" button. Pure UI — touches no clinic state.

import { getRole } from "@/lib/session";

export default function GuideOverlay({ onClose }: { onClose: () => void }) {
  const role = getRole();
  const close = () => {
    window.localStorage.setItem("mf-guide-seen", "1");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4" onClick={close}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 text-sm" onClick={(e) => e.stopPropagation()}>
        {role === "patient" ? (
          <>
            <div className="text-lg font-semibold">Welcome — book a hospital visit 🧑</div>
            <p className="text-slate-600">
              Describe what&apos;s wrong in the chat, pick a time, pay (simulated), and manage your visit from this page. Staff and clinician
              responses are simulated automatically.
            </p>
            <p className="text-slate-600">
              Everything here is a <b>simulation with synthetic data</b> — please use invented details only.
            </p>
          </>
        ) : (
          <>
            <div className="text-lg font-semibold">One clinic, three sides</div>
            <p className="text-slate-600">This is a single hospital OPD, and the tabs at the top show it from three perspectives — actions on one tab show up on the others.</p>
            <div className="space-y-2">
              <div className="flex gap-3 items-start border border-slate-200 rounded-lg p-2.5">
                <div className="text-xl">🧑</div>
                <div><b>Patient</b> — book a visit by describing your problem in the chat. <span className="text-blue-700 font-medium">Start here.</span></div>
              </div>
              <div className="flex gap-3 items-start border border-slate-200 rounded-lg p-2.5">
                <div className="text-xl">🏥</div>
                <div><b>Operations</b> — the front desk: run the clinic day, check patients in, approve changes.</div>
              </div>
              <div className="flex gap-3 items-start border border-slate-200 rounded-lg p-2.5">
                <div className="text-xl">🩺</div>
                <div><b>Clinician</b> — the doctor&apos;s screen: review requests, consult, record outcomes.</div>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700">
              <b>Suggested path:</b> ① book as a patient → ② press <b>⏭ Jump to clinic day</b> (top bar) → ③ run the day from Operations →
              ④ consult from Clinician. A hint bar above the page always suggests your next step.
            </div>
            <p className="text-slate-500 text-xs">
              Everything is a simulation with synthetic data — invent any details. <b>↺ Restart demo</b> (top right) wipes your test data and
              starts fresh anytime.
            </p>
          </>
        )}
        <button onClick={close} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 font-semibold">
          Got it — let&apos;s go
        </button>
      </div>
    </div>
  );
}
