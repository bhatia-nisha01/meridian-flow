"use client";

import { useRef, useState } from "react";
import { useStore, meeraVisits } from "@/lib/store";
import { ARRIVE_EARLY, findFeasibleSlot } from "@/lib/engine";
import { IntakeExtract, PatientRecord, fmt, fmtWin, rupees } from "@/lib/types";
import { getSessionId, getTester } from "@/lib/session";

const EXAMPLE = "My knee has been hurting for three weeks.";

export default function PatientView() {
  const { state, dispatch } = useStore();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visits = meeraVisits(state).filter((p) => p.phase !== "OFFERED");
  const offered = meeraVisits(state).find((p) => p.phase === "OFFERED");

  async function send(text: string) {
    if (!text.trim() || busy || state.intakeDone) return;
    dispatch({ type: "CHAT_USER", text: text.trim() });
    setInput("");
    setBusy(true);
    setError(null);
    const history = [...state.chat, { role: "user" as const, text: text.trim() }]
      .filter((_, i) => i > 0)
      .map((m) => ({ role: m.role === "agent" ? ("assistant" as const) : ("user" as const), content: m.text }));
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, sessionId: getSessionId(), tester: getTester() }),
      });
      if (!res.ok) throw new Error(`The booking assistant is unavailable (${res.status}). Your text is saved — retry or ask staff for help.`);
      const data = (await res.json()) as IntakeExtract & { assistantMessage: string };
      dispatch({ type: "CHAT_AGENT", text: data.assistantMessage, extract: data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto grid md:grid-cols-[380px_1fr] gap-5 items-start">
      <div className="space-y-4">
        <EmergencyCard />

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="font-semibold">Book a consultation</div>
            <div className="text-[11px] text-slate-400">Meridian Hospital, Indiranagar · Simulation — invented details only</div>
          </div>

          <div className="p-3 space-y-2 max-h-[340px] overflow-y-auto">
            {state.chat.map((m, i) => (
              <div key={i} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "ml-auto bg-blue-600 text-white rounded-br-sm" : "bg-slate-100 text-slate-800 rounded-bl-sm"}`}>
                {m.text}
              </div>
            ))}
            {busy && <div className="text-xs text-slate-400">Reading your message…</div>}
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
            <div ref={bottomRef} />
          </div>

          {!state.intakeDone ? (
            <div className="border-t border-slate-100 p-3 space-y-2">
              {state.chat.length === 1 && visits.length === 0 && (
                <button onClick={() => send(EXAMPLE)} className="w-full text-left text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50">
                  Try: "{EXAMPLE}"
                </button>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex gap-2"
              >
                <input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} placeholder="Describe what you need…" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <button type="submit" disabled={busy || !input.trim()} className="bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40">
                  Send
                </button>
              </form>
              <div className="text-[11px] text-slate-400">
                <button className="underline" onClick={() => send("I am not sure")}>I&apos;m not sure</button> ·{" "}
                <button className="underline" onClick={() => send("I would like staff help please")}>Talk to staff</button>
              </div>
            </div>
          ) : offered && state.offers ? (
            <div className="m-3 space-y-2">
              <div className="text-sm font-semibold">Earliest available slots (next 3 days)</div>
              <div className="text-[11px] text-slate-500">Doctor is assigned by availability and shown on confirmation — you choose the time.</div>
              {state.offers.map((o) => (
                <button key={o.id} onClick={() => dispatch({ type: "CONFIRM_OFFER", offerId: o.id })} className="w-full text-left border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg p-3 text-sm">
                  <div className="font-semibold">{o.dateLabel} · {fmtWin(o.window)}{o.note && <span className="ml-2 text-[10px] text-emerald-700 font-medium">{o.note}</span>}</div>
                </button>
              ))}
              {state.exceptions.some((x) => x.category === "Patient unhappy with offered slots" && x.status === "open") ? (
                <div className="border border-amber-300 bg-amber-50 rounded-lg p-2.5 text-xs text-amber-900">
                  ✓ Our staff will call you shortly to understand the urgency and find you a better option.
                </div>
              ) : (
                <button onClick={() => dispatch({ type: "UNHAPPY_SLOTS" })} className="w-full border border-slate-300 rounded-lg py-2 text-xs text-slate-600 hover:bg-slate-50">
                  I need a different day/time — ask staff to call me
                </button>
              )}
            </div>
          ) : (
            <div className="border-t border-slate-100 p-3">
              <button onClick={() => dispatch({ type: "CHAT_RESET" })} className="w-full border border-blue-300 text-blue-700 rounded-lg py-2 text-sm font-semibold hover:bg-blue-50">
                ➕ Book another consultation
              </button>
            </div>
          )}
        </div>

        {!state.patients.some((p) => p.id === "p-meera-fu") && (
          <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-4 text-sm">
            <div className="font-semibold">Recommended for you</div>
            <div className="text-xs text-slate-500 mt-1">
              Dr Rao recommended a knee follow-up in <b>Mar 2025</b> — it was never booked. Follow-ups book instantly under your doctor&apos;s existing instruction.
            </div>
            <button onClick={() => dispatch({ type: "BOOK_MISSED_FOLLOWUP" })} className="mt-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 text-sm font-semibold">
              Book follow-up with Dr Rao · {rupees(400)}
            </button>
          </div>
        )}

        <FamilyCard />
      </div>

      <div className="space-y-4">
        {visits.length > 0 && <div className="text-sm font-semibold text-slate-600">My appointments ({visits.length})</div>}
        {visits.map((v) => (
          <VisitCard key={v.id} visitId={v.id} />
        ))}
        {visits.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-sm text-slate-500">
            <div className="font-semibold text-slate-700 mb-1">No appointments yet</div>
            Describe your need in the chat, pick a slot, pay, and your appointment appears here. You can book as many consultations and follow-ups as you need.
          </div>
        )}
        <HistoryCard />
      </div>
    </div>
  );
}

function VisitCard({ visitId }: { visitId: string }) {
  const { state, dispatch } = useStore();
  const [showReschedule, setShowReschedule] = useState(false);
  const me = state.patients.find((p) => p.id === visitId)!;
  const clinician = me.clinicianId ? state.clinicians.find((c) => c.id === me.clinicianId) : null;
  const myProposals = state.proposals.filter((p) => p.patientId === visitId && ["awaiting_patient", "accepted", "declined_patient"].includes(p.status));
  const duePayment = me.payments.find((p) => p.status === "due");
  const isToday = !me.visitDate || me.visitDate === "Tue 6 Oct";
  const lateNow = me.phase === "BOOKED" && isToday && state.simPhase === "clinic" && me.agreedWindow && me.arrival !== "ARRIVED" && state.clock >= me.agreedWindow[0] - ARRIVE_EARLY;
  const veryLate = me.lateReply?.comingAt != null && me.agreedWindow && me.lateReply.comingAt > me.agreedWindow[1] + 15;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-sm space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-base font-semibold">{me.reportedNeed.split(" (")[0] || "Consultation"}</div>
          <div className="text-slate-600 mt-0.5">
            {clinician?.name} · Meridian Hospital, Indiranagar · {me.visitDate ?? "Tue 6 Oct"} 2026 · <b>{me.agreedWindow ? fmtWin(me.agreedWindow) : "time being rearranged"}</b>
          </div>
        </div>
        <StatusChip phase={me.phase} />
      </div>

      {me.agreedWindow && me.phase === "BOOKED" && !me.token && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 text-blue-900">
          Please arrive <b>15 minutes before</b> your appointment — by <b>{fmt(me.agreedWindow[0] - ARRIVE_EARLY)}</b>. You&apos;ll receive a token when you check in.
        </div>
      )}
      {me.token && me.phase === "BOOKED" && (
        <div className="border border-emerald-300 bg-emerald-50 rounded-lg p-3 text-emerald-900">
          ✓ Checked in — your token is <b>{me.token}</b>. You&apos;ll be called in token order for your slot.
        </div>
      )}
      {me.onHold && (
        <div className="border border-purple-300 bg-purple-50 rounded-lg p-3 text-purple-900 text-xs">
          ⏸ You&apos;re on hold while you arrange: <b>{me.onHold.reason}</b>. Return to the front desk when done — you keep your token.
        </div>
      )}

      {duePayment && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-3">
          <div className="font-medium">{duePayment.label}: {rupees(duePayment.amount)}</div>
          <div className="text-xs text-slate-600 mb-2">Shown before payment — paying confirms your appointment.</div>
          <button onClick={() => dispatch({ type: "PAY", patientId: me.id, paymentId: duePayment.id })} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">
            Pay {rupees(duePayment.amount)} &amp; confirm (simulated)
          </button>
        </div>
      )}

      {me.phase === "BOOKED" && me.readiness.some((t) => t.status === "needed") && (
        <div className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
          <span>Prepare: {me.readiness.find((t) => t.status === "needed")?.label}</span>
          <button onClick={() => dispatch({ type: "VERIFY_ALL_TASKS", patientId: me.id })} className="text-xs bg-blue-600 text-white rounded px-2 py-1">
            Confirm
          </button>
        </div>
      )}

      {me.phase === "BOOKED" && (
        <div className="flex gap-2">
          <button onClick={() => setShowReschedule((v) => !v)} className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50">
            Reschedule
          </button>
          <button
            onClick={() => {
              if (confirm("Cancel this appointment? Your fee will be refunded (simulated).")) dispatch({ type: "REQUEST_CANCEL", patientId: me.id });
            }}
            className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50"
          >
            Cancel
          </button>
        </div>
      )}
      {showReschedule && me.phase === "BOOKED" && <RescheduleOptions patientId={me.id} onDone={() => setShowReschedule(false)} />}

      {me.phase === "BOOKED" && state.simPhase === "booking" && <ConfirmationCall patientId={me.id} />}

      {lateNow && !me.onHold && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-2">
          <div className="font-medium text-amber-900">You haven&apos;t checked in and your time is close.</div>
          {me.callTranscript && me.callTranscript.length === 1 && !me.lateReply ? (
            <>
              <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs italic">"{me.callTranscript[0]}"</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => dispatch({ type: "LATE_REPLY", patientId: me.id, comingAt: state.clock + 25 })} className="text-xs bg-blue-600 text-white rounded px-3 py-1.5">
                  I&apos;m coming — about {fmt(state.clock + 25)}
                </button>
                <button onClick={() => dispatch({ type: "LATE_REPLY", patientId: me.id, comingAt: null })} className="text-xs border border-slate-300 rounded px-3 py-1.5 text-slate-600">
                  I can&apos;t come today
                </button>
              </div>
            </>
          ) : !me.lateReply ? (
            <div className="text-xs text-amber-800">The clinic may call or message to check if you&apos;re coming.</div>
          ) : me.lateReply.comingAt ? (
            <div className="text-xs text-slate-600">You said you&apos;ll arrive about {fmt(me.lateReply.comingAt)}. Your original slot isn&apos;t guaranteed.</div>
          ) : null}
          {veryLate && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-amber-900">You&apos;ll arrive well past your slot. Options:</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => dispatch({ type: "LATE_OPTION", patientId: me.id, choice: "wait" })} className="text-xs border border-slate-300 rounded px-2.5 py-1.5">
                  Wait for {state.clinicians.find((c) => c.id === me.clinicianId)?.name}
                </button>
                <button onClick={() => dispatch({ type: "LATE_OPTION", patientId: me.id, choice: "switch_doctor" })} className="text-xs border border-slate-300 rounded px-2.5 py-1.5">
                  See another doctor (I consent)
                </button>
                <button onClick={() => dispatch({ type: "LATE_OPTION", patientId: me.id, choice: "reschedule" })} className="text-xs border border-slate-300 rounded px-2.5 py-1.5">
                  Reschedule
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {myProposals.map((pr) => (
        <div key={pr.id} className={`border rounded-lg p-3 ${pr.status === "awaiting_patient" ? "border-amber-300 bg-amber-50" : pr.status === "accepted" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
          <div className="font-medium">{pr.kind === "doctor_change" ? "Your doctor isn&apos;t available." : "The clinic is running behind."}</div>
          <div className="text-xs text-slate-600 mt-0.5">{pr.afterLabel}. Does this work for you?</div>
          {pr.status === "awaiting_patient" ? (
            <div className="flex gap-2 mt-2">
              <button onClick={() => dispatch({ type: "PATIENT_ACCEPT", id: pr.id })} className="text-xs bg-emerald-600 text-white rounded px-3 py-1.5 font-semibold">
                That works
              </button>
              <button onClick={() => dispatch({ type: "PATIENT_DECLINE", id: pr.id })} className="text-xs border border-slate-300 rounded px-3 py-1.5 text-slate-600">
                Doesn&apos;t work for me
              </button>
            </div>
          ) : pr.status === "declined_patient" ? (
            <div className="text-[11px] text-slate-500 mt-1">Your booking stands; staff will call with alternatives.</div>
          ) : null}
        </div>
      ))}

      {me.phase === "COMPLETE" && me.outcome && (
        <div className="border border-emerald-300 bg-emerald-50 rounded-lg p-3 space-y-2">
          <div className="font-semibold text-emerald-900">✓ Consultation complete</div>
          <div className="text-xs text-slate-700">
            <b>{me.outcome.diagnosis}</b> — {me.outcome.plan}
            {me.outcome.prescription && <div>Prescription: {me.outcome.prescription}</div>}
          </div>
          {me.orders.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-600">Your next steps</div>
              {me.orders.map((o) => (
                <div key={o.id} className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-medium">{o.label}</div>
                    <div className="text-slate-500">{o.instruction}</div>
                    {o.booked && <div className="text-emerald-700 mt-0.5">✓ {o.bookedLabel}</div>}
                  </div>
                  {!o.booked && (
                    <button onClick={() => dispatch({ type: "BOOK_ORDER", patientId: me.id, orderId: o.id })} className="bg-blue-600 text-white rounded px-2.5 py-1 whitespace-nowrap">
                      Book{o.fee ? ` · ${rupees(o.fee)}` : ""}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {me.phase === "CANCELLED" && <div className="text-slate-500">This appointment was cancelled. Your fee was refunded.</div>}
    </div>
  );
}

function StatusChip({ phase }: { phase: string }) {
  const map: Record<string, [string, string]> = {
    AWAITING_PAYMENT: ["Payment pending", "bg-amber-100 text-amber-800 border-amber-300"],
    BOOKED: ["Confirmed", "bg-emerald-100 text-emerald-800 border-emerald-300"],
    IN_CONSULT: ["With the doctor", "bg-blue-100 text-blue-800 border-blue-300"],
    COMPLETE: ["Complete", "bg-emerald-100 text-emerald-800 border-emerald-300"],
    CANCELLED: ["Cancelled", "bg-slate-100 text-slate-500 border-slate-300"],
  };
  const [label, cls] = map[phase] ?? [phase, "bg-slate-100 text-slate-600 border-slate-200"];
  return <span className={`text-xs border rounded-full px-2.5 py-1 font-medium whitespace-nowrap ${cls}`}>{label}</span>;
}

function RescheduleOptions({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const { state, dispatch } = useStore();
  const me = state.patients.find((p) => p.id === patientId)!;
  const same = me.clinicianId ? findFeasibleSlot(state, me.clinicianId) : null;
  const other = state.clinicians.filter((c) => c.id !== me.clinicianId).map((c) => ({ c, slot: findFeasibleSlot(state, c.id) })).find((x) => x.slot);
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2 text-xs bg-slate-50">
      <div className="font-medium text-sm">Available alternatives</div>
      <div className="text-slate-500">Your current appointment stays until you confirm a new one. Your payment transfers — any difference is refunded.</div>
      {same && (
        <button
          onClick={() => {
            dispatch({ type: "CONFIRM_RESCHEDULE", patientId, clinicianId: me.clinicianId!, window: same.window });
            onDone();
          }}
          className="w-full text-left border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg p-2"
        >
          Same doctor ({state.clinicians.find((c) => c.id === me.clinicianId)?.name}) · Tue {fmtWin(same.window)}
        </button>
      )}
      {other && other.slot && (
        <button
          onClick={() => {
            dispatch({ type: "CONFIRM_RESCHEDULE", patientId, clinicianId: other.c.id, window: other.slot!.window });
            onDone();
          }}
          className="w-full text-left border border-slate-200 bg-white hover:bg-slate-50 rounded-lg p-2"
        >
          {other.c.name} · Tue {fmtWin(other.slot.window)} <span className="text-amber-700">(different doctor)</span>
        </button>
      )}
      <button onClick={onDone} className="text-slate-400 underline">Keep my current time</button>
    </div>
  );
}

function ConfirmationCall({ patientId }: { patientId: string }) {
  const { state, dispatch } = useStore();
  const me = state.patients.find((p) => p.id === patientId)!;
  if (me.confirmationCall === "confirmed") return <div className="text-xs text-emerald-700">✓ Attendance confirmed on the day-before call. No repeat calls.</div>;
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2 text-xs bg-slate-50">
      <div className="font-medium text-sm">Day-before confirmation call</div>
      {me.confirmationCall === "not_offered" && (
        <div className="flex gap-2">
          <span className="text-slate-500">May we call you tomorrow morning (9 AM–12 PM) to confirm?</span>
          <button onClick={() => dispatch({ type: "CONSENT_CALL", patientId, consent: true })} className="text-blue-700 underline">Yes</button>
          <button onClick={() => dispatch({ type: "CONSENT_CALL", patientId, consent: false })} className="text-slate-400 underline">No</button>
        </div>
      )}
      {me.confirmationCall === "declined_consent" && <div className="text-slate-500">No call will be made (you declined). A WhatsApp reminder is sent instead.</div>}
      {me.confirmationCall === "consented" && !me.callTranscript && (
        <button onClick={() => dispatch({ type: "SIMULATE_CONFIRM_CALL", patientId })} className="bg-slate-800 text-white rounded px-3 py-1.5">
          ▶ Simulate tomorrow&apos;s call
        </button>
      )}
      {me.confirmationCall === "consented" && me.callTranscript && (
        <div className="space-y-1.5">
          {me.callTranscript.map((t, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-2 italic">"{t}"</div>
          ))}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => dispatch({ type: "RESPOND_CALL", patientId, response: "confirm" })} className="bg-emerald-600 text-white rounded px-2.5 py-1">1 · Confirm</button>
            <button onClick={() => dispatch({ type: "RESPOND_CALL", patientId, response: "cannot" })} className="border border-slate-300 rounded px-2.5 py-1">2 · Can&apos;t attend</button>
            <button onClick={() => dispatch({ type: "RESPOND_CALL", patientId, response: "callback" })} className="border border-slate-300 rounded px-2.5 py-1">3 · Staff callback</button>
          </div>
        </div>
      )}
      {me.confirmationCall === "cannot_attend" && <div className="text-amber-700">You said you can&apos;t attend — staff will help reschedule. Your booking is held meanwhile.</div>}
      {me.confirmationCall === "callback_requested" && <div className="text-amber-700">Staff callback requested — someone will reach you shortly.</div>}
    </div>
  );
}

function HistoryCard() {
  const { state, dispatch } = useStore();
  const visits = meeraVisits(state);
  const primary = visits[0];
  const history = visits.flatMap((v) => v.history);
  const docs = visits.flatMap((v) => v.documents);
  const payments = visits.flatMap((v) => v.payments);
  const [docName, setDocName] = useState("");

  const fallbackHistory: PatientRecord["history"] = [
    { date: "14 Mar 2025", doctor: "Dr Rao", reason: "Knee strain (left) after trek", outcome: "Rest + physio; follow-up recommended — never booked", prescription: "Ibuprofen 400mg PRN" },
    { date: "02 Nov 2024", doctor: "Dr Kavita Menon", reason: "Annual health check", outcome: "Normal; Vitamin D low", prescription: "Vit D3 weekly × 8" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-sm space-y-4">
      <div className="text-base font-semibold">My health record — Meera Shah</div>

      <div>
        <div className="text-xs font-semibold text-slate-500 mb-1.5">Previous consultations</div>
        {(history.length ? history : fallbackHistory).map((h, i) => (
          <div key={i} className="border-b border-slate-100 py-1.5 text-xs">
            <div className="font-medium">{h.date} · {h.doctor} — {h.reason}</div>
            <div className="text-slate-500">{h.outcome}{h.prescription && h.prescription !== "—" ? ` · Rx: ${h.prescription}` : ""}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-500 mb-1.5">Reports &amp; documents</div>
        <div className="space-y-1">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-xs border border-slate-200 rounded-lg px-2.5 py-1.5">
              <span>
                {d.name} <span className="text-slate-400">· {d.status === "uploaded" ? "uploaded — being linked by staff" : d.status === "linked" ? "linked to record" : "available"}</span>
              </span>
              {d.status !== "uploaded" && <button className="text-blue-600 underline">Download</button>}
            </div>
          ))}
          {docs.length === 0 && <div className="text-xs text-slate-400">Your reports appear here once you have a booking.</div>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (docName.trim() && primary) {
              dispatch({ type: "UPLOAD_DOC", patientId: primary.id, name: docName.trim() });
              setDocName("");
            }
          }}
          className="flex gap-2 mt-2"
        >
          <input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="e.g. Physio report — Oct 2026.pdf" className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs" disabled={!primary} />
          <button type="submit" disabled={!primary || !docName.trim()} className="text-xs border border-slate-300 rounded-lg px-3 text-slate-600 disabled:opacity-40">
            Upload (simulated)
          </button>
        </form>
      </div>

      {payments.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Payments</div>
          {payments.map((pm, i) => (
            <div key={`${pm.id}-${i}`} className="flex justify-between text-xs border-b border-slate-100 py-1">
              <span>{pm.label}{pm.at ? ` · ${pm.at}` : ""}</span>
              <span className={pm.status === "paid" ? "text-emerald-700" : pm.status === "due" ? "text-amber-700 font-semibold" : "text-slate-500"}>
                {rupees(pm.amount)} · {pm.status}{pm.status === "paid" ? " ✓ receipt" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FamilyCard() {
  const { state, dispatch } = useStore();
  const me = meeraVisits(state)[0];
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-sm">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left font-semibold flex justify-between">
        Family &amp; preferences <span className="text-slate-400">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-xs">
          {me?.familyAuthorized ? (
            <div className="text-emerald-700">✓ {me.familyAuthorized} is authorized to book for you · updates via {me.channelPref} in {me.languagePref}</div>
          ) : (
            <>
              <div className="text-slate-500">Authorize a family member to book for you, and choose how we contact you.</div>
              <button onClick={() => dispatch({ type: "FAMILY_PREFS", member: "Asha Shah (mother)", channel: "WhatsApp", language: "Hindi" })} className="w-full border border-slate-300 rounded-lg py-1.5 text-slate-600 hover:bg-slate-50" disabled={!me}>
                Authorize Asha Shah (mother) · WhatsApp · Hindi
              </button>
            </>
          )}
          <div className="text-slate-400">Need help? <button className="underline">Message staff</button> — assisted booking by phone follows the same rules.</div>
        </div>
      )}
    </div>
  );
}

function EmergencyCard() {
  const { state, dispatch } = useStore();
  const e = state.emergency;
  return (
    <div className={`rounded-xl border p-3 text-sm ${e.status === "none" ? "bg-white border-red-200" : "bg-red-50 border-red-400"}`}>
      {e.status === "none" ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-600">
            <b className="text-red-600">Emergency?</b> Call <b>112</b> (simulated) or request the hospital ambulance.
          </div>
          <button onClick={() => dispatch({ type: "EMERGENCY_REQUEST" })} className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
            🚨 Request ambulance
          </button>
        </div>
      ) : (
        <div className="space-y-1.5 text-xs">
          <div className="font-semibold text-red-700">🚨 Emergency assistance {e.status === "dispatched" ? "— ambulance dispatched" : "requested"}</div>
          {e.status === "requested" && <div className="text-slate-600">Emergency team alerted. This never waits for payment or routine approvals.</div>}
          {e.status === "dispatched" && <div className="text-slate-700">✓ Confirmed dispatch · <b>ETA {e.etaMin} minutes</b>. Stay on the line if you called 112.</div>}
          {!e.paid ? (
            <button onClick={() => dispatch({ type: "EMERGENCY_PAY" })} className="border border-red-300 text-red-700 rounded px-2.5 py-1">
              Pay ambulance fee now (optional — never required for dispatch)
            </button>
          ) : (
            <div className="text-emerald-700">✓ Payment done alongside coordination</div>
          )}
        </div>
      )}
    </div>
  );
}
