# Meridian Flow — Point of View
### Reimagining OPD access & patient flow (Option 3) · devx labs candidate assignment

**Prototype:** https://meridian-flow-drab.vercel.app · synthetic data only

---

## 1. The problem, from first principles

An outpatient department runs on a sixty-year-old protocol: show up, take a token, and wait — 2–6 hours in large public hospitals, 30–90 minutes even in private ones. The deeper diagnosis is that **the patient's time is used as the hospital's buffer**. Every source of operational uncertainty — doctors running late, consultations overrunning, no-shows, walk-ins, a broken X-ray machine — is absorbed by rows of people in plastic chairs, because the queue is the only coordination mechanism the OPD has. Meanwhile the hospital leaks the other way too: specialist minutes evaporate on no-shows nobody predicted, follow-ups that were recommended but never booked, and front-desk staff reconciling every disruption by hand.

**The first-principles reframe:** if you designed OPD access today, natively around a language model, the token stops being the coordination mechanism. Three things change:

1. **The front door becomes a conversation.** A patient describes the problem in their own words; the system understands it, identifies the right OPD department, routes it, and offers real bookable times — in one turn, with no forms, no department-picking, and no questions the patient shouldn't have to answer. What used to require a trained human on every call becomes a low-marginal-cost automated interaction, so *every request gets routed* at the point of booking — to a bookable slot, to a clinician's review, or straight to emergency care.
2. **The appointment becomes a care commitment.** The system records the promise it made (the *original window*, immutable) separately from the current plan. When reality shifts — a doctor delayed, a consult overrunning — the engine drafts an explainable, consent-gated change: staff approve it, the patient accepts or declines it, and the original promise stays on the record so the hospital reports its lateness instead of hiding it. The patient is no longer the buffer; the *plan* is.
3. **Coordination and medicine split cleanly.** Operations approves scheduling; clinicians decide everything medical; the model classifies and drafts under a clinician-authored escalation policy — it never diagnoses, never invents availability, never touches the calendar. Every actionable exception has an owner, a deadline, and a stated next step.

**The journey, before and after:**

> **Today:** decide to visit → travel → register → take a token → wait (hours, open-ended) → doctor → tests → maybe return → repeat for follow-up.
>
> **Meridian Flow:** describe the need in your own words → routed (bookable slot / clinician review / emergency) → pay & confirm → arrive 15 minutes before a promised time → token on arrival (an identifier, not a queue) → consultation → next steps ordered by the doctor, bookable in one tap.

This is not the existing workflow automated. The existing workflow has no routing at booking, no promise-keeping ledger, no consent loop, and no exception ownership — its only mechanism is the queue.

## 2. The product

**Meridian Flow** is one shared clinic state powering three faces:

- **Patient:** a chat that books ("My knee has been hurting for three weeks" → earliest slots across 3 days, doctor assigned by availability, fee shown, payment confirms). Then a live appointment card: arrive-15-minutes-before guidance, a token issued on arrival (an identifier, not the queueing mechanism), a day-before confirmation call (consent-gated), lateness recovery ("are you coming, and when?" — never "have you left"), reschedule/cancel with transparent payment transfer, consult outcomes with bookable next steps, visit history & documents, family-member authorization and language preference, and an always-available emergency path that bypasses everything including payment.
- **Operations:** four plain-language queues — Approvals (scheduling lane only; medical questions route to clinicians), Today's clinic (color-coded board sorted by who-needs-action, tokens, per-patient action menus incl. hold/release), Tasks (every exception with owner + deadline + next step), Money & records. Capacity tools: doctor-unavailable recovery plans and first-visit load balancing (both draft per-patient proposals with a prepared message — nothing moves without approval and patient acceptance), and cancellation→waitlist offers with exclusions explained.
- **Clinician:** today's schedule with the next ready patient, a brief that separates patient-reported from verified, clinical-review requests, start/finish with guards (onsite + ready + reviewed + doctor free), outcome recording (diagnosis, plan, prescription), explicit next-step orders, and availability reporting that triggers the whole replanning chain.

**Users & jobs-to-be-done**

| User | Job to be done |
|---|---|
| Patient / caregiver | "Get appropriate care at a workable time, know exactly when to show up, and never discover changes by sitting in a waiting room." |
| Front desk / OPD manager | "Keep the day flowing — know who needs action right now, and what the next step is, without working the phones blind." |
| Clinician | "A full, well-prepared list: patients who are present, ready, and reviewed — and my medical judgment asked only for medical questions." |
| Hospital COO | "More completed consultations per specialist-hour, fewer dead slots, a front door that wins patients — with auditable promises, not vanity metrics." |

**North-star metric: Promise-Kept Visit Rate** — the share of confirmed visits where the consultation starts within the originally promised window *and* the patient spent ≤15 minutes onsite before it. It is the one number both sides feel — the patient's wait and the hospital's kept promises — it is objectively measurable from day one, and it cannot be gamed by quietly moving appointments (the original window is immutable by design).

Supporting metrics: onsite wait (median/P90) · original-promise breach count · no-show rate and slot-rescue rate (confirmation calls + waitlist refills) · specialist idle minutes · staff actions per completed visit (the coordination burden the system should be absorbing) · missed-follow-up recovery rate.

**Adoption path**

1. **Shadow mode (weeks 1–4):** the conversational front door runs alongside the token desk; staff see the board but act on nothing. Calibrates routing accuracy and wait forecasts on local case mix; builds trust with named clinical owners.
2. **One-department pilot (weeks 5–12):** one OPD (e.g., Orthopaedics evening clinic) goes live end-to-end — recommend mode, every change staff-approved and patient-consented. Weekly governance review of every escalation and misroute.
3. **Scale-out:** remaining departments, assisted/IVR channel for non-smartphone patients under identical rules, multilingual intake (the same model natively speaks the patient population's languages), then cross-site load balancing.

## 3. Why AI-native (and not a booking app)

A booking app digitizes the token; it cannot do the two cognitive jobs that create the queue. (a) *Understanding messy human language at intake* — mapping "my knee hurts and I can only come after work" to the right operating lane used to require a human on every call, so no one did it; the model does it conversationally, in any register, under a clinician-authored escalation policy (urgent symptoms → the emergency action first, never a booking question), and a deterministic gate enforces what each lane may do. (b) *Continuous replanning with human authority intact* — when the day shifts, the engine computes who is affected and drafts the change with its reasoning attached ("Why" facts on every proposal), staff approve, patients consent, refusals create owned tasks. The language model is the interface; a deterministic engine owns the calendar; named humans own every consequential decision. That division is the design, not a disclaimer.

## 4. What's real and what's simulated (honesty)

**Real:** every intake conversation runs live on Claude Opus 4.8 under a strict contract (extract and draft only; no diagnosis, no urgency assignment, no invented availability — the engine owns the calendar). The scheduling engine, forecasts, proposals, consent loops, token issuance, holds, reallocation, and all three synchronized views are genuinely computed, with guards enforced in the state layer rather than hidden buttons.

**Simulated and labelled:** the clinic, doctors, patients, and schedules are synthetic; payments, confirmation calls, WhatsApp/SMS, and ambulance dispatch are simulated UI; identity is a demo persona (production: phone + OTP, no accounts); there is no EHR/HIS integration. The wait forecasts are engine heuristics — production needs duration/no-show models trained on local data, with the LLM orchestrating rather than predicting.

**Genuinely hard in production:** HIS/EHR integration and write-back (the hospital system stays authoritative); clinically validated routing protocols with systematic escalation-sensitivity testing before any patient relies on them; locally trained forecasting models; messaging rails (WhatsApp Business/IVR); and the operational change of no longer telling everyone to come at 9 a.m. Regulatory posture per region (India DPDP, Singapore PDPA + AIHGle 2.0, UAE/KSA PDPL): in-region inference, minimum-necessary data in prompts, clinician-owned protocols, human approval on every consequential action, full audit trail — designed for, not around.

## 5. Commercial shape

Price the devx way — on the outcome: a base co-build fee plus a success fee per sustained point of Promise-Kept Visit Rate improvement and no-show reduction against a pre-agreed baseline, measured quarterly with agreed exclusions and audit rights. The upside case for the hospital is volume and capacity it already owns: a front door that books the right visit in under a minute in the patient's own language grows OPD throughput and everything downstream of it, paid for out of specialist minutes that currently evaporate. Shadow mode in four weeks; first live department inside the quarter.
