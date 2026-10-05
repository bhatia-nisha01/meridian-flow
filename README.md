# Meridian Flow

AI-native OPD (outpatient) access & patient-flow prototype. Built for the devx labs candidate assignment — **all data is synthetic; this is a simulation.**

**Live demo:** https://meridian-flow-drab.vercel.app

## Design principle

> Probabilistic AI understands unstructured language and drafts explanations.
> Deterministic software owns availability, scheduling, and state transitions.
> Humans retain authority over medical decisions and every consequential change.

## Architecture

```
Patient language
      ↓
Intake LLM  (src/app/api/intake/route.ts)
bounded routing contract — no availability, no calendar access
      ↓
Deterministic routing gate  (src/lib/store.tsx → CHAT_AGENT)
   ↙            ↓               ↘
routine    clinical review    emergency
   ↓        (clinician owns)   (bypasses booking + payment)
availability adapter  (src/lib/availability.ts — synthetic HIS)
   ↓
scheduling / flow engine  (src/lib/engine.ts)
forecasts · recovery proposals · feasibility
   ↓
proposal (with "why" facts)
   ↓
Operations approval
   ↓
Patient consent
   ↓
state mutation  (guards in the reducer, not in buttons)
```

## What the AI does

- Understands the patient's own words and classifies the **operating lane**: `routine | clinical_review | emergency | clarify`
- Captures volunteered scheduling constraints and doctor preferences (captured, never promised)
- Replies briefly (1–2 sentences), one clarifying question max

## What it cannot do

- Diagnose, prescribe, or assign clinical urgency (clinician-owned escalation policy routes those lanes)
- See, state, or invent availability — slots come only from the availability adapter
- Create, move, or cancel any booking — only the state machine mutates state, behind approval + consent

## Key invariants (enforced in the state layer, tested in `tests/`)

- `originalWindow` (the promised time) is immutable once set — lateness is reported, never hidden
- A confirmed booking never changes without staff approval **and** patient acceptance
- `clinical_review`-lane requests receive **zero** appointment offers until a clinician decides
- Emergency flow never waits on payment or routine approvals
- Consultations cannot start unless the patient is checked in, ready, pathway-approved, and the doctor is free
- Stale proposals (drafted against an outdated plan version) cannot be applied
- Capacity offers cannot double-book; declining preserves the patient's position

## Evals & tests

```bash
npm test        # deterministic invariant tests against the reducer/engine
npm run eval    # LLM routing evals against a running instance (EVAL_URL, default http://localhost:3200)
```

## Real vs simulated

**Real:** live LLM intake (Claude Opus 4.8, schema-validated), the scheduling engine, forecasts, proposals, consent loops, tokens, holds, and all three synchronized views.
**Simulated & labelled:** the clinic/patients (synthetic seed), payments, calls/WhatsApp, ambulance dispatch, identity (demo persona; production = phone + OTP), and HIS integration (synthetic adapter). Telemetry stores anonymous session transcripts for prototype evaluation — disclosed in-app.

## Run locally

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev     # http://localhost:3000
```

Docs: see `/docs` — POV, walkthrough script, demo guide, and the AI system-design note.
