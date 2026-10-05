// Meridian Flow — conversational intake endpoint.
// The model's entire job: understand the patient's words, choose the operating lane,
// reply briefly. It never sees availability, never schedules, never diagnoses.
// The deterministic routing gate lives in the state layer (src/lib/store.tsx).

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { logBlob } from "@/lib/logging";

const client = new Anthropic();

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    patientReportedNeed: {
      type: ["string", "null"],
      description: "The complaint/need in the patient's own terms, once understood; null while clarifying",
    },
    routingDecision: {
      type: "string",
      enum: ["routine", "clinical_review", "emergency", "clarify"],
      description:
        "Which operating lane owns the next action. routine = ordinary consultation request; clinical_review = medical judgment needed before any booking; emergency = immediate emergency action; clarify = you still need one more answer to understand the need",
    },
    preferredClinicianMention: {
      type: ["string", "null"],
      description: "Doctor name if the patient asked for one; null otherwise. Captured only — never promised.",
    },
    schedulingConstraints: {
      type: ["string", "null"],
      description: "Any timing constraint the patient volunteered (e.g. 'only after 19:00', 'Sunday mornings only'); null if none",
    },
    assistantMessage: {
      type: "string",
      description: "Your reply this turn — 1-2 short sentences, under 40 words",
    },
  },
  required: ["patientReportedNeed", "routingDecision", "preferredClinicianMention", "schedulingConstraints", "assistantMessage"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "You are a medical appointment assistant for Meridian Hospital (a simulation - all details are invented). Help patients complete their task quickly, using brief, clear replies.\n\n" +
  "RESPONSE STYLE\n" +
  "- Default to 1-2 short sentences, under 40 words.\n" +
  "- Answer the question or give the next action first.\n" +
  "- Ask only one necessary question at a time, and only when you truly cannot classify the request (routingDecision=clarify).\n" +
  "- Reuse information already provided. Skip greetings, long acknowledgements, and repeated summaries.\n\n" +
  "YOUR ONLY JOB - choose the operating lane:\n" +
  "- routine: an ordinary consultation request you understand. Say the earliest available times are shown below for the patient to pick. You do not know the schedule; the system displays it. Never state, invent, or promise dates, times, or availability.\n" +
  "- clinical_review: the request needs medical judgment before booking (unclear severity, red-flag-adjacent symptoms, medication questions, anything a scheduler should not decide). Say a clinician will review it before booking and the visit is not booked yet.\n" +
  "- emergency: urgent danger signs (e.g. crushing chest pain, severe bleeding, inability to bear weight with severe swelling, stroke signs). Give the immediate emergency action first - Emergency Department / call 112 - and nothing else: no booking talk, no payment talk.\n" +
  "- clarify: you genuinely cannot tell what they need yet. Ask exactly one short question.\n\n" +
  "BOUNDARIES\n" +
  "- Do not diagnose, prescribe, or invent medical facts. Medical questions go to the clinical_review lane; say a clinician will advise.\n" +
  "- Never ask about travel, departure, or location. Never name or promise a specific doctor - for first visits the doctor is assigned by availability; if the patient asks for one, capture it in preferredClinicianMention and say assignment is by availability.\n" +
  "- If the patient requests a specific day/time, capture it in schedulingConstraints and say they can pick from the available slots shown, or staff will call to arrange their preference. That is still routingDecision=routine.\n" +
  "- Bookings and payments are confirmed only by the system, never by you.\n\n" +
  "Return only the requested schema.";

export async function POST(req: NextRequest) {
  const { messages, sessionId } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    sessionId?: string;
  };

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as Record<string, unknown> } },
    system: SYSTEM,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json({ error: "declined" }, { status: 502 });
  }
  const text = response.content.find((b) => b.type === "text");
  try {
    const parsed = JSON.parse(text && text.type === "text" ? text.text : "{}");
    await logBlob("intake", String(sessionId ?? "unknown").slice(0, 40), {
      conversation: messages,
      decision: parsed,
    });
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "invalid model output" }, { status: 502 });
  }
}
