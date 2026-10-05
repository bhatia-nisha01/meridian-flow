// Meridian Flow v2 — synthetic seed. Clinic: Meridian Hospital, Indiranagar.
// Clinic day: Tuesday 6 October 2026, 16:00–20:00 IST. All synthetic.

import { FlowState, PatientRecord } from "./types";

const T = (h: number, m = 0) => h * 60 + m;

function basePatient(id: string, name: string, extra: Partial<PatientRecord> = {}): PatientRecord {
  return {
    id,
    name,
    patientType: "first_visit",
    clinicianId: null,
    originalWindow: null,
    agreedWindow: null,
    phase: "REQUESTED",
    arrival: "NOT_ARRIVED",
    reportedNeed: "",
    seedNote: "",
    review: { status: "none", lane: null, pathway: null, reviewer: null },
    readiness: [],
    durationEstimate: 25,
    confirmationCall: "not_offered",
    history: [],
    documents: [],
    payments: [],
    orders: [],
    ...extra,
  };
}

function booked(id: string, name: string, clinicianId: string, start: number, seedNote: string, extra: Partial<PatientRecord> = {}): PatientRecord {
  return basePatient(id, name, {
    clinicianId,
    originalWindow: [start, start + 20],
    agreedWindow: [start, start + 20],
    phase: "BOOKED",
    seedNote,
    review: { status: "approved", lane: "scheduling", pathway: "Routine orthopaedic consult", reviewer: "Operations" },
    readiness: [{ id: "r1", label: "Visit information confirmed", status: "verified" }],
    payments: [{ id: `${id}-fee`, label: "Consultation fee", amount: 600, status: "paid", at: "Mon 5 Oct" }],
    confirmationCall: "confirmed",
    ...extra,
  });
}

export function buildSeed(): FlowState {
  const patients: PatientRecord[] = [
    booked("p-aisha", "Aisha Khan", "dr-mehta", T(16, 0), "In consultation when the day opens", {
      phase: "IN_CONSULT",
      arrival: "ARRIVED",
      arrivedAt: T(15, 48),
      consultStartedAt: T(16, 0),
      history: [{ date: "12 Jun 2026", doctor: "Dr Mehta", reason: "Shoulder stiffness", outcome: "Physiotherapy, improved", prescription: "—" }],
    }),
    booked("p-raj", "Raj Verma", "dr-mehta", T(16, 30), "Arrived late; doctor-ordered X-ray still pending", {
      arrival: "ARRIVED",
      arrivedAt: T(16, 19),
      token: "T-01",
      readiness: [
        { id: "r1", label: "Visit information confirmed", status: "verified" },
        { id: "r-img", label: "Knee X-ray (doctor-ordered)", status: "needed" },
      ],
    }),
    booked("p-nikhil", "Nikhil Sen", "dr-mehta", T(17, 0), "Cancellation scenario target"),
    // Meera books through the live intake journey.
    booked("p-arjun", "Arjun Rao", "dr-mehta", T(18, 0), "Has not confirmed the day-before call", {
      confirmationCall: "no_answer",
    }),
    booked("p-priya", "Priya Das", "dr-mehta", T(19, 0), "Prefers Dr Mehta only", { patientType: "follow_up" }),
    booked("p-kavita", "Kavita Iyer", "dr-shah", T(16, 0), "Past appointment time — has not arrived", {
      patientType: "follow_up",
      confirmationCall: "callback_requested",
    }),
    booked("p-harish", "Harish Patel", "dr-shah", T(16, 30), "Due now — not arrived yet", {
      assisted: true,
    }),
    booked("p-leena", "Leena Bose", "dr-shah", T(17, 0), "Checked in; referral letter to verify", {
      arrival: "ARRIVED",
      arrivedAt: T(16, 12),
      token: "T-02",
      readiness: [
        { id: "r1", label: "Visit information confirmed", status: "verified" },
        { id: "r-doc", label: "Referral letter verification", status: "provided" },
      ],
    }),
    booked("p-dev", "Dev Menon", "dr-shah", T(17, 30), "Late-arrival scenario target"),
    booked("p-fatima", "Fatima Noor", "dr-rao", T(16, 30), "Checked in on time; fully ready", {
      arrival: "ARRIVED",
      arrivedAt: T(16, 10),
      token: "T-03",
      readiness: [
        { id: "r1", label: "Visit information confirmed", status: "verified" },
        { id: "r-acc", label: "Accessible room reserved", status: "verified" },
      ],
    }),
    booked("p-omar", "Omar Aziz", "dr-rao", T(17, 0), "Routine follow-up (booked directly under approved rules)", {
      patientType: "follow_up",
      payments: [{ id: "p-omar-fee", label: "Follow-up fee", amount: 400, status: "paid", at: "Sun 4 Oct" }],
      history: [{ date: "08 Sep 2026", doctor: "Dr Rao", reason: "Ankle sprain", outcome: "Review in 4 weeks", prescription: "Analgesics PRN" }],
    }),
    // Walk-ins
    basePatient("p-sameer", "Sameer Ali", {
      walkIn: true,
      patientType: "walk_in",
      seedNote: "Walk-in — clinical review required",
      reportedNeed: "Shoulder pain after a fall this morning (reported)",
    }),
    basePatient("p-tara", "Tara Kapoor", {
      walkIn: true,
      patientType: "walk_in",
      seedNote: "Walk-in — routine, needs scheduling approval",
      reportedNeed: "Knee brace review; ran out of refills (reported)",
    }),
    // Emergency walk-in (enters via scenario control; separate queue, always first)
    basePatient("p-rohan", "Rohan Iyer", {
      patientType: "emergency",
      seedNote: "Emergency arrival — separate queue, always priority",
      reportedNeed: "Severe leg injury from a road accident (reported at the gate)",
    }),
    // Waitlist
    basePatient("p-anil", "Anil Sethi", { waitlist: true, seedNote: "Waitlist — flexible timing" }),
    basePatient("p-sana", "Sana Mir", { waitlist: true, assisted: true, availabilityEarliest: 18 * 60, seedNote: "Waitlist — only after 18:00, assisted contact" }),
  ];

  return {
    v: 2,
    planVersion: 1,
    simPhase: "booking",
    clock: T(16, 20),
    clinicians: [
      { id: "dr-mehta", name: "Dr Mehta", capability: "Knee & general orthopaedics", staffedFrom: T(16), staffedTo: T(20), breakFrom: T(18, 30), breakTo: T(18, 40), room: "R1" },
      { id: "dr-shah", name: "Dr Shah", capability: "General orthopaedics & follow-ups", staffedFrom: T(16), staffedTo: T(20), breakFrom: T(18, 10), breakTo: T(18, 20), room: "R2" },
      { id: "dr-rao", name: "Dr Rao", capability: "Follow-ups & general consults", staffedFrom: T(16, 30), staffedTo: T(19, 30), breakFrom: T(18, 0), breakTo: T(18, 10), room: "R3" },
    ],
    patients,
    proposals: [],
    exceptions: [
      {
        id: "x-kavita",
        category: "Staff callback requested",
        patientId: "p-kavita",
        owner: "Front desk",
        deadline: "Before 16:00 today",
        detail: "Kavita Iyer asked for a staff callback during the confirmation call. Call her back before her 16:00 visit.",
        nextStep: "Call back; answer her question; reconfirm attendance.",
        status: "open",
      },
      {
        id: "x-arjun",
        category: "Confirmation call unanswered",
        patientId: "p-arjun",
        owner: "Front desk",
        deadline: "By 17:00 today",
        detail: "Arjun Rao (18:00) did not answer the day-before call. No answer does not cancel the appointment — try once more, then flag for arrival watch.",
        nextStep: "Retry once this morning; keep booking; watch arrival at 17:45.",
        status: "open",
      },
    ],
    events: [{ id: "e0", clock: T(16, 20), phase: "booking", actor: "system", text: "Synthetic seed loaded — Mon 5 Oct 2026, Meridian Hospital Indiranagar (Asia/Kolkata)" }],
    clinicianDelays: {},
    imagingDown: false,
    staffActions: 0,
    chat: [
      {
        role: "agent",
        text: "Hello! I can help you book a consultation at Meridian Hospital. Tell me what you need in your own words — this is a simulation, so please use invented details only.",
      },
    ],
    lastIntake: null,
    intakeDone: false,
    offers: null,
    disruptionsUsed: [],
    emergency: { status: "none" },
    cancelledDoctors: [],
    tokenCounter: 3,
    emergencyTokenCounter: 0,
    recordsQueue: [],
  };
}

export const MEERA_ID = "p-meera";

// Meera's seeded identity as a returning patient (history + an unbooked recommended follow-up).
export const MEERA_HISTORY = [
  { date: "14 Sep 2026", doctor: "Dr Rao", reason: "Knee strain (left) after trek", outcome: "Rest + physio; follow-up recommended in 3–4 weeks — never booked", prescription: "Ibuprofen 400mg PRN" },
  { date: "02 Nov 2024", doctor: "Dr Kavita Menon (Gen Med)", reason: "Annual health check", outcome: "Normal; Vitamin D low", prescription: "Vit D3 60k weekly × 8" },
];

export const MEERA_DOCS = [
  { id: "d-old-xray", name: "Knee X-ray — Sep 2026.pdf", status: "available" as const, note: "From previous visit" },
  { id: "d-health-check", name: "Health check report — Nov 2024.pdf", status: "available" as const },
];
