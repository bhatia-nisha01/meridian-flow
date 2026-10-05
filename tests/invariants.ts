// Deterministic invariant tests — run with: npm test
// These exercise the real reducer and engine (no mocks, no UI).

import { reducer, meeraVisits, Action } from "../src/lib/store";
import { buildSeed } from "../src/lib/seed";
import { computeForecasts } from "../src/lib/engine";
import { FlowState, IntakeDecision } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}`);
  if (!cond) failures++;
}

const D = (s: FlowState, a: Action) => reducer(s, a);
const decision = (routingDecision: IntakeDecision["routingDecision"], need = "Knee pain, 3 weeks"): IntakeDecision => ({
  patientReportedNeed: need,
  routingDecision,
  preferredClinicianMention: null,
  schedulingConstraints: null,
  assistantMessage: "ok",
});

// ---------- 1. routine lane produces offers; clinical lane produces none ----------
{
  let s = buildSeed();
  s = D(s, { type: "CHAT_USER", text: "knee pain" });
  s = D(s, { type: "CHAT_AGENT", text: "ok", decision: decision("routine") });
  check("routine lane → bookable offers shown", !!s.offers && s.offers.length > 0 && meeraVisits(s)[0].phase === "OFFERED");
}
{
  let s = buildSeed();
  s = D(s, { type: "CHAT_AGENT", text: "ok", decision: decision("clinical_review", "Can't bear weight on leg") });
  const v = meeraVisits(s)[0];
  check("clinical_review lane → zero offers, AWAITING_CLINICAL_REVIEW", s.offers == null && v.phase === "AWAITING_CLINICAL_REVIEW");
  // clinician approves → ops → offers
  s = D(s, { type: "CLINICAL_REVIEW_RESOLVE", patientId: v.id, outcome: "approve" });
  check("clinician approval moves to scheduling, still no offers", meeraVisits(s)[0].phase === "AWAITING_SCHEDULING_APPROVAL" && s.offers == null);
  s = D(s, { type: "OPS_APPROVE_SCHEDULING" });
  check("ops approval then yields offers", meeraVisits(s)[0].phase === "OFFERED" && !!s.offers);
}

// ---------- 2. emergency lane creates no booking and no payment ----------
{
  let s = buildSeed();
  s = D(s, { type: "CHAT_AGENT", text: "go to ED now", decision: decision("emergency", "Crushing chest pain") });
  check("emergency lane → no patient record, no offers, emergency-team task", meeraVisits(s).length === 0 && s.offers == null && s.exceptions.some((x) => x.category.startsWith("EMERGENCY")));
}

// ---------- helper: a booked Meera ----------
function bookedMeera(): FlowState {
  let s = buildSeed();
  s = D(s, { type: "CHAT_AGENT", text: "ok", decision: decision("routine") });
  s = D(s, { type: "CONFIRM_OFFER", offerId: "offer-tue-1730" });
  s = D(s, { type: "PAY", patientId: "p-meera", paymentId: "pay-consult" });
  return s;
}

// ---------- 3. payment confirms booking ----------
{
  let s = buildSeed();
  s = D(s, { type: "CHAT_AGENT", text: "ok", decision: decision("routine") });
  s = D(s, { type: "CONFIRM_OFFER", offerId: "offer-tue-1730" });
  check("before payment: AWAITING_PAYMENT", meeraVisits(s)[0].phase === "AWAITING_PAYMENT");
  s = D(s, { type: "PAY", patientId: "p-meera", paymentId: "pay-consult" });
  check("payment confirms booking", meeraVisits(s)[0].phase === "BOOKED");
}

// ---------- 4. originalWindow never mutates through a consented time change ----------
{
  let s = bookedMeera();
  s = D(s, { type: "JUMP_TO_CLINIC" });
  const orig = JSON.stringify(meeraVisits(s)[0].originalWindow);
  s = D(s, { type: "CLINICIAN_DELAY", clinicianId: "dr-mehta", minutes: 35, reason: "overran" });
  const pr = s.proposals.find((p) => p.patientId === "p-meera" && p.status === "pending_staff");
  check("delay drafts a proposal (no direct mutation)", !!pr && JSON.stringify(meeraVisits(s)[0].agreedWindow) !== "null");
  if (pr) {
    const before = JSON.stringify(meeraVisits(s)[0].agreedWindow);
    s = D(s, { type: "APPROVE_PROPOSAL", id: pr.id });
    check("staff approval alone does NOT change the booking", JSON.stringify(meeraVisits(s)[0].agreedWindow) === before);
    s = D(s, { type: "PATIENT_ACCEPT", id: pr.id });
    check("patient acceptance applies the change", JSON.stringify(meeraVisits(s)[0].agreedWindow) !== before);
    check("originalWindow is immutable", JSON.stringify(meeraVisits(s)[0].originalWindow) === orig);
  }
}

// ---------- 5. patient decline preserves the booking ----------
{
  let s = bookedMeera();
  s = D(s, { type: "JUMP_TO_CLINIC" });
  s = D(s, { type: "CLINICIAN_DELAY", clinicianId: "dr-mehta", minutes: 35, reason: "overran" });
  const pr = s.proposals.find((p) => p.patientId === "p-meera" && p.status === "pending_staff")!;
  const before = JSON.stringify(meeraVisits(s)[0].agreedWindow);
  s = D(s, { type: "APPROVE_PROPOSAL", id: pr.id });
  s = D(s, { type: "PATIENT_DECLINE", id: pr.id });
  check("decline keeps the existing booking + creates an owned task", JSON.stringify(meeraVisits(s)[0].agreedWindow) === before && s.exceptions.some((x) => x.category === "Change declined"));
}

// ---------- 6. stale proposal cannot apply ----------
{
  let s = bookedMeera();
  s = D(s, { type: "JUMP_TO_CLINIC" });
  s = D(s, { type: "CLINICIAN_DELAY", clinicianId: "dr-mehta", minutes: 35, reason: "overran" });
  const pr = s.proposals.find((p) => p.patientId === "p-meera" && p.status === "pending_staff")!;
  s = D(s, { type: "INJECT_IMAGING" }); // plan version bump
  s = D(s, { type: "APPROVE_PROPOSAL", id: pr.id });
  check("stale proposal is rejected, not applied", s.proposals.find((p) => p.id === pr.id)?.status === "stale");
}

// ---------- 7. consult guards ----------
{
  let s = buildSeed();
  s = D(s, { type: "JUMP_TO_CLINIC" });
  s = D(s, { type: "START_CONSULT", patientId: "p-nikhil" }); // not arrived
  check("cannot start consult before check-in", s.patients.find((p) => p.id === "p-nikhil")!.phase === "BOOKED");
  s = D(s, { type: "START_CONSULT", patientId: "p-raj" }); // arrived but X-ray pending + doctor busy
  check("cannot start with unresolved readiness / busy doctor", s.patients.find((p) => p.id === "p-raj")!.phase === "BOOKED");
  s = D(s, { type: "HOLD_PATIENT", patientId: "p-raj", reason: "X-ray" });
  s = D(s, { type: "START_CONSULT", patientId: "p-raj" });
  check("on-hold patient cannot start", s.patients.find((p) => p.id === "p-raj")!.phase === "BOOKED");
}

// ---------- 8. doctor outage drafts proposals, never silent moves ----------
{
  let s = buildSeed();
  s = D(s, { type: "JUMP_TO_CLINIC" });
  const before = s.patients.filter((p) => p.clinicianId === "dr-shah" && p.phase === "BOOKED").map((p) => `${p.id}:${p.clinicianId}:${JSON.stringify(p.agreedWindow)}`).join("|");
  s = D(s, { type: "CANCEL_DOCTOR_SESSION", clinicianId: "dr-shah" });
  const after = s.patients.filter((p) => before.includes(p.id) && p.phase === "BOOKED").map((p) => `${p.id}:${p.clinicianId}:${JSON.stringify(p.agreedWindow)}`).join("|");
  const drafted = s.proposals.filter((p) => p.sourceEvent.includes("session cancelled")).length;
  check("doctor outage: bookings unchanged until consent; proposals drafted", before === after && drafted > 0);
}

// ---------- 9. load balancing drafts proposals only ----------
{
  let s = buildSeed();
  s = D(s, { type: "JUMP_TO_CLINIC" });
  const snapshot = JSON.stringify(s.patients.map((p) => [p.id, p.clinicianId, p.agreedWindow]));
  s = D(s, { type: "REBALANCE_FIRST_VISITS" });
  check("load balancing never silently moves patients", JSON.stringify(s.patients.map((p) => [p.id, p.clinicianId, p.agreedWindow])) === snapshot);
}

// ---------- 10. capacity offer cannot double-book ----------
{
  let s = buildSeed();
  s = D(s, { type: "JUMP_TO_CLINIC" });
  s = D(s, { type: "INJECT_CANCELLATION" });
  const offer = s.proposals.find((p) => p.kind === "capacity_offer")!;
  s = D(s, { type: "APPROVE_PROPOSAL", id: offer.id });
  s = D(s, { type: "PATIENT_ACCEPT", id: offer.id, assisted: true });
  const anil = s.patients.find((p) => p.id === "p-anil")!;
  check("waitlist acceptance books exactly once", anil.phase === "BOOKED");
  s = D(s, { type: "PATIENT_ACCEPT", id: offer.id, assisted: true }); // replay
  check("replayed acceptance is a no-op", s.patients.filter((p) => p.agreedWindow?.[0] === anil.agreedWindow?.[0] && p.clinicianId === anil.clinicianId && p.phase === "BOOKED").length === 1);
}

// ---------- 11. emergency walk-in: front of queue, no payment precondition ----------
{
  let s = buildSeed();
  s = D(s, { type: "JUMP_TO_CLINIC" });
  s = D(s, { type: "EMERGENCY_WALKIN" });
  const rohan = s.patients.find((p) => p.id === "p-rohan")!;
  const fc = computeForecasts(s);
  const peers = s.patients.filter((p) => p.clinicianId === rohan.clinicianId && p.phase === "BOOKED" && p.id !== rohan.id);
  check("emergency: separate token + no fee due", (rohan.token ?? "").startsWith("E-") && !rohan.payments.some((pm) => pm.status === "due"));
  check("emergency is sequenced before all booked peers", peers.every((p) => (fc.get(p.id)?.forecastStart ?? 0) >= (fc.get(rohan.id)?.forecastStart ?? 0)));
}

// ---------- 12. reset restores the identical seed ----------
{
  let s = bookedMeera();
  s = D(s, { type: "RESET" });
  check("reset restores seed (no Meera, seed patient count)", meeraVisits(s).length === 0 && s.patients.length === buildSeed().patients.length);
}

console.log(failures === 0 ? "\nALL INVARIANTS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
