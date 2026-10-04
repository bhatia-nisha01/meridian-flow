// Meridian Flow — conversational intake endpoint.
// The model extracts scheduling facts and drafts the next question.
// It has no calendar authority; the engine owns availability.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { logBlob } from "@/lib/logging";

const client = new Anthropic();

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    patientReportedNeed: { type: ["string", "null"] },
    preferredLocalDate: { type: ["string", "null"], description: "ISO date the patient means; booking clock is Mon 2026-10-05, so 'tomorrow' = 2026-10-06" },
    earliestTime: { type: ["string", "null"], description: "HH:MM local" },
    latestTime: { type: ["string", "null"] },
    travelMinutes: { type: ["number", "null"], description: "Always null — never ask about travel" },
    preferredClinician: { type: ["string", "null"] },
    missingFields: { type: "array", items: { type: "string" } },
    contradictions: { type: "array", items: { type: "string" } },
    requiresStaffReview: { type: "boolean" },
    nextQuestion: { type: ["string", "null"] },
    intakeComplete: { type: "boolean", description: "True as soon as the reported need is understood — do not ask date/time questions" },
    assistantMessage: { type: "string", description: "Your reply to the patient this turn — 1-2 short sentences, under 40 words" },
  },
  required: [
    "patientReportedNeed",
    "preferredLocalDate",
    "earliestTime",
    "latestTime",
    "travelMinutes",
    "preferredClinician",
    "missingFields",
    "contradictions",
    "requiresStaffReview",
    "nextQuestion",
    "intakeComplete",
    "assistantMessage",
  ],
  additionalProperties: false,
} as const;

export async function POST(req: NextRequest) {
  const { messages, sessionId, tester } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    sessionId?: string;
    tester?: string;
  };

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as Record<string, unknown> } },
    system:
      "You are a medical appointment assistant for Meridian Hospital (a simulation — all details are invented). Help patients complete their task quickly, using brief, clear replies.\n\n" +
      "RESPONSE STYLE\n" +
      "- Default to 1–2 short sentences, under 40 words.\n" +
      "- Answer the question or give the next action first.\n" +
      "- Ask only one necessary question at a time.\n" +
      "- Reuse information already provided.\n" +
      "- Skip greetings, lengthy acknowledgements, repeated summaries, and unnecessary explanations.\n" +
      "- Offer short choices when helpful.\n" +
      "- Provide more detail only when asked or necessary for safety.\n\n" +
      "BOOKING\n" +
      "- The only required information is the reported need. Do NOT ask for a preferred date or time — as soon as the need is clear, set intakeComplete=true and tell the patient the earliest available slots are shown below for them to pick (the app renders the buttons).\n" +
      "- Earliest availability (booking clock: Mon 5 Oct 2026, Asia/Kolkata): Tue 6 Oct 17:30 and 18:20, Wed 7 Oct 09:30. You may mention these briefly (e.g. 'earliest is tomorrow 5:30 PM').\n" +
      "- If the patient asks for a specific day or time outside these slots, do not promise it: say they can pick from the available slots below, or our staff will call to arrange their preferred day. Still set intakeComplete=true.\n" +
      "- Never ask about travel time, departure time, location tracking, or whether the patient has left. Travel information is never a booking requirement; set travelMinutes to null always.\n" +
      "- Do not name or promise a specific doctor: for first visits the doctor is assigned by availability. If the patient asks for a specific doctor, note it in preferredClinician and say the system assigns doctors by availability for first visits.\n" +
      "- Availability comes from the system, not you — never invent times beyond the listed availability. The visit is not booked until a slot is chosen and paid; confirm bookings and payments only after the system verifies success.\n" +
      "- Once a booking is confirmed by the system, the app shows the doctor, date, time, and: 'Please arrive 15 minutes before your appointment.'\n\n" +
      "MEDICAL SAFETY\n" +
      "- Do not diagnose, prescribe, or invent medical facts.\n" +
      "- Route medical uncertainty to an authorized clinician (set requiresStaffReview=true); Operations handles scheduling.\n" +
      "- For urgent safety concerns (e.g. crushing chest pain, severe bleeding, inability to bear weight with severe swelling), give the immediate emergency action first — Emergency Department / call 112 — and do not continue routine booking questions or mention payment.\n\n" +
      "When the needed fields are known, set intakeComplete=true and nextQuestion=null. Return only the requested schema.",
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json({ error: "declined" }, { status: 502 });
  }
  const text = response.content.find((b) => b.type === "text");
  try {
    const parsed = JSON.parse(text && text.type === "text" ? text.text : "{}");
    await logBlob("intake", String(sessionId ?? "unknown").slice(0, 40), String(tester ?? "").slice(0, 60), {
      conversation: messages,
      reply: parsed,
    });
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "invalid model output" }, { status: 502 });
  }
}
