# How this was built — AI process note

*Included because the brief invites it: "we want to see how you work with AI, including your prompts and process."*

**Stack:** Next.js + TypeScript on Vercel; Claude (Opus 4.8) as the live conversational engine inside the product; Claude (Fable 5, via Claude Code) as the build partner for everything else — code, tests, deployment, and documentation.

**Process, honestly:**

1. **Explored before committing.** I first built a complete prototype for Option 4 (OR/theatre utilization), then deliberately pivoted to Option 3 when I judged the problem statement stronger. The Option 4 build is archived in the working folder — kept as evidence that the choice was a decision, not a default.
2. **Specified before building.** Option 3 went through a written build specification (three role definitions — patient, operations, clinician — plus a feature backlog, an edge-case catalogue, and explicit authority rules like "Operations manages coordination; clinicians own medical decisions"). The AI built *to the spec*; when my product decisions changed mid-build (e.g., dropping travel-tracking in favour of arrival-only, tokens issued at check-in, no doctor choice for first visits), the spec and backlog were updated first and the system refactored to match.
3. **The model in the product is deliberately caged.** The intake assistant's full system prompt lives in the repo (`src/app/api/intake/route.ts`): it may extract scheduling facts, draft one question at a time, and reference listed availability — it may not diagnose, assign urgency, invent slots, ask travel questions, or touch the calendar. Every model response is schema-validated; a deterministic engine (`src/lib/engine.ts`) owns all scheduling; state-transition guards live in the reducer (`src/lib/store.tsx`), not in buttons.
4. **Tested behaviour, not just rendering.** Each build round ran scripted end-to-end tests through the real reducer and engine (booking → payment → delay → consent → reallocation → emergency priority), plus live checks of the deployed model endpoint — including adversarial ones (urgent-symptom messages must produce an emergency instruction, never a booking).
5. **Iterated against real usage.** The deployed prototype logs every tester conversation and action (anonymously, with a disclosure line); several UI decisions — action-sorted queues, per-patient action menus, inline block-reasons — came directly from watching someone get stuck.

**Where to look:** the repository (`github.com/bhatia-nisha01/meridian-flow`) contains the production prompt, the engine, the guards, and these documents under `/docs`.
