# Walkthrough Script — Meridian Flow (45-minute interview)

**Demo link:** https://meridian-flow-drab.vercel.app · press **↺ Reset** before starting for the clean seed.
Present as a pitch to Meridian's COO + devx co-CEOs; demo live; defend choices.

## Timing

| Segment | Time |
|---|---|
| 1. Problem & reframe | 4 min |
| 2. Live demo — the 8-minute journey | 8 min |
| 3. Product framing (users, north star, adoption) | 7 min |
| 4. Why AI-native, architecture of authority | 6 min |
| 5. Honesty: real vs simulated, production work | 5 min |
| 6. Commercial shape | 3 min |
| 7. Q&A buffer | 12 min |

---

## 1. Open (4 min)

> "Every OPD in this region runs the same sixty-year-old protocol: show up, take a token, wait. The diagnosis underneath is simple: **the patient's time is the hospital's buffer.** Doctors late, consults overrunning, machines down — every bit of that uncertainty is absorbed by people in plastic chairs, because the queue is the only coordination tool the OPD has. And the leak runs both ways — specialist minutes die on no-shows while the waitlist grows.
>
> We didn't digitize the token. We asked what access looks like designed today, natively around a language model. Three answers: **the front door becomes a conversation; the appointment becomes a kept promise; and when reality shifts, a plan changes instead of a patient waiting.** Let me show you one patient's day."

## 2. Live demo (8 min) — follow this exactly

**Beat 1 — Book by talking (Patient tab).**
Click the example: *"My knee has been hurting for three weeks."* While it thinks: "Live language model, not a decision tree." It replies in one turn with the earliest availability. Point out: no department picker, no time interrogation, no travel questions. **Pick Tue 17:30.** The fee appears *before* payment — **Pay ₹600 & confirm**. Read the card: doctor now revealed (assigned by availability — "first visits don't pick doctors, a real policy"), *"arrive 15 minutes before — by 17:15."*
Then: consent to the day-before call → **Simulate tomorrow's call** → press 1 to confirm. "No-show prevention that respects consent — and it never calls twice."
*(10 seconds: point at "Recommended for you" — the follow-up Dr Rao ordered in March that was never booked. One tap, books under the doctor's standing instruction. Missed follow-ups are revenue and care both.)*

**Beat 2 — The clinic day (top bar → ⏭ Jump to clinic day).**
Open **Operations → Today's clinic**: "It's 16:20 and the board already triages itself — **sorted by who needs action**." Walk the colors top-down: Kavita red (past her time, not arrived → *flag non-arrival*), Harish amber (due now → *call: are you coming?* — we ask if he's coming, never whether he's left), Raj arrived late with an X-ray pending (→ *verify readiness or put on hold*). Click **Actions ▾** on Raj → **Put on hold**: "He keeps his token, the queue flows past him, a 45-minute deadline task is created. Nobody's time waits on him."
Point at the token column: "Patients are tokenised **on arrival**, not at booking — the token is a place in the room, not a promise."

**Beat 3 — Reality shifts (Clinician tab).**
As Dr Mehta: click **"Report: running 20 min late."** Switch to **Operations → Approvals**: the engine has drafted per-patient proposals — open **Why** on Meera's: forecast math, the breach of the original promise recorded either way, "existing booking stands until she agrees." **Approve.** Switch to **Patient tab**: *"The clinic is running behind — does the revised time work?"* → **That works.** "Three authorities just cooperated: the engine computed, staff approved, the patient consented. And the original 17:30 promise stays on the record — our north-star metric is measured against it, so the hospital can't game its numbers by moving promises."

**Beat 4 — The two hard cases (Operations).**
Scenario controls → **🚨 Emergency patient arrives**: the always-visible emergency strip lights up — token **E-01**, separate queue, front of the line without interrupting the active consult, *"payment never blocks emergency care."*
Then **"Dr Shah unavailable → reallocate"**: first visits move automatically (they never chose a doctor); the follow-up patient gets a drafted, consented choice — read the drafted message aloud. "Cancellation with a refund is the documented last resort, not the first button."

**Beat 5 — Close the loop (Clinician → Patient).**
Finish Aisha's consult: diagnosis, plan, prescription, and tick the follow-up + X-ray orders. Flip to Patient: the outcome is in her record and the **next steps are bookable in one tap, priced, strictly within the doctor's instruction**. "The journey ends with the next step arranged — not with a patient holding a paper slip."

**Fallback:** if the live model ever stalls mid-demo, say so plainly ("the live model call is slow — this is a real call, not a script"), retry once, and continue from the Operations beats, which are deterministic.

## 3. Product framing (7 min)

From the POV: the four users and their jobs; **north star = Right-Care-On-Time rate** (consult starts inside the original promised window *and* ≤15 min onsite wait) — "the one number the patient and the COO both feel, and it's un-gameable because promises are immutable." Supports: breach count, no-show + slot-rescue rate, specialist idle minutes, staff actions per visit, missed-follow-up recovery. Adoption: **shadow mode → one-department pilot in recommend mode → scale-out** with assisted/IVR and multilingual intake. Stress: every threshold in the demo (15-min arrival, 45-min hold, fees) is a *proposed* setting the hospital's owners approve before any pilot.

## 4. Why AI-native (6 min)

> "The model does the two things only a language model can do: understand a patient's own words at the front door, and draft explainable changes with reasoning attached when the day shifts. Everything else is deliberately boring: a deterministic engine owns the calendar; Operations approves coordination; clinicians own every medical judgment; the model **cannot** diagnose, assign urgency, invent a slot, or touch the schedule. That division of authority isn't a safety disclaimer — it's the architecture, and it's what makes this deployable in a hospital rather than impressive in a demo."

## 5. Honesty (5 min)

Plainly: "Every conversation you watched ran live on the model. The engine, guards, consent loops, and all three synchronized views are real. The clinic is synthetic; payments, calls, and the ambulance are simulated UI; forecasts are heuristics where production needs locally trained models. The genuinely hard production work is HIS integration and write-back, clinically validated routing protocols with escalation-sensitivity testing, and the messaging rails — we've scoped them, not hand-waved them." Regional posture: in-region inference, DPDP/PDPA/AIHGle 2.0/PDPL as deployment review topics, audit trail of every proposal and decision.

## 6. Commercial close (3 min)

> "Price it on the outcome: base co-build plus a success fee per sustained point of Right-Care-On-Time and no-show improvement against a pre-agreed baseline. The capacity this recovers already exists on your payroll — we're paid out of minutes that currently die in the waiting room. Shadow mode in four weeks; first live department inside the quarter."

## Hard questions — prepared answers

- **"Isn't this just a nicer booking system?"** — Booking is the entry ticket. The product is what happens *after* booking: the kept-promise ledger, the consent-gated replanning, exception ownership, and a front door that triages every request in natural language. None of that exists in a slot-picker.
- **"What if the model routes someone wrong?"** — It routes to a *staff-approved pathway*, never to a diagnosis; anything clinically uncertain lands in a clinician's review queue; urgent language triggers the emergency action before any booking talk. Shadow mode measures routing accuracy on local case mix before anyone relies on it — and the failure mode is a human re-routing, same as today's token desk, which triages nobody.
- **"Patients will game urgency / staff will play favourites."** — Urgency comes from clinician-owned protocols, not self-declaration; the scheduler can't take priority from payment status or response speed; every override is logged with a reason.
- **"What about patients without smartphones?"** — Same rules, assisted channel: front desk and phone intake write into the identical state; the board marks them "(assisted)" and they're never deprioritized for being offline.
- **"Doctors will resist."** — Doctors get three buttons and a prepared patient. Their authority expands (clinical reviews route *to* them), their interruptions drop, and availability reporting replaces hallway firefighting.
- **"Why no login?"** — Deliberate: the phone number is the identity (OTP in production). Sign-up friction is precisely what a front door exists to remove.
- **"What proves the number?"** — The original-window ledger makes Right-Care-On-Time auditable from day one of shadow mode; the pilot's baseline is the hospital's own, with exclusions agreed before go-live.
