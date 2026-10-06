# Meridian Flow — 5-minute demo guide

**Open:** https://meridian-flow-drab.vercel.app
A short "How this works" guide opens on load (the ❓ button brings it back), and a blue **Next step** bar always suggests what to do next. Everything is a simulation with synthetic data — please use invented details only. If the state ever looks odd, press **↺ Restart demo** (top right) for a clean start.

The app is one shared clinic (Meridian Hospital Orthopaedics OPD, Tue 6 Oct 2026) seen from three sides: **🧑 Patient**, **🏥 Operations**, **🩺 Clinician**. Actions on one tab show up on the others.

## Try this, in order

1. **Patient tab** — click the example message (*"My knee has been hurting for three weeks"*). A live language model identifies the OPD department and classifies the request; for routine needs the app shows the earliest slots for the next 3 days. Pick one. (Try "I can't put weight on my leg" in a second conversation — it routes to clinician review instead, with no slots offered; a vague "I twisted my leg" gets exactly one screening question first.)
2. **Pay ₹600 (simulated)** — payment confirms the booking. Note the card: the doctor is revealed only now (first visits are doctor-assigned by availability) and the rule *"arrive 15 minutes before."*
3. **Day-before call** — consent, then "Simulate tomorrow's call," then press **1** to confirm attendance.
4. Top bar → **⏭ Jump to clinic day** (it becomes Tuesday 16:20).
5. **Operations → Today's clinic** — the board is sorted by who needs action: red = past time not arrived, amber = due now / readiness pending, green = checked in, purple = on hold, cancelled greyed at the bottom. The recommended **Next action** on each row is a one-click button (flag non-arrival, call "are you coming?", verify readiness, collect payment); everything else sits in **More ▾**, where each option explains what it does (check in → issues a token — an identifier, not the queueing mechanism; hold keeps their place without blocking the queue).
6. **Clinician tab** (Dr Mehta) — click **"Report: running 20 min late."** Then **Operations → Approvals**: the engine has drafted per-patient proposals with a "Why." **Approve** Meera's.
7. **Patient tab** — accept the revised time. Notice the original promise stays on record.
8. **Operations → scenario controls** — fire **🚨 Emergency patient arrives**: separate E-token queue, always seen first, payment never a precondition. Also try **"Dr Shah unavailable → draft recovery plan"** — it drafts per-patient proposals; nothing moves until you approve and the patient accepts.
9. **Clinician tab** — finish Aisha Khan's consultation: record diagnosis/plan/prescription and tick the follow-up + X-ray orders. Then check the **Patient tab**: the next steps are bookable in one tap.
10. Explore freely — reschedule, cancel, upload a report (Operations links it), book a second consultation, the works.

## What's real vs simulated

Real: the intake conversations (live language model), the scheduling engine, forecasts, proposals, consent loops, tokens, and all three synchronized views. Simulated and labelled: the clinic and patients (synthetic), payments, calls/WhatsApp, ambulance dispatch, and hospital-system integration. The model can extract, draft, and explain — it cannot diagnose, assign urgency, invent availability, or change the schedule.
