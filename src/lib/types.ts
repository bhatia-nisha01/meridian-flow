// Meridian Flow v2 — domain types.
// All data is synthetic. Times are minutes-since-midnight IST on the clinic day.

export type JourneyPhase =
  | "REQUESTED"
  | "AWAITING_SCHEDULING_APPROVAL" // Ops lane
  | "AWAITING_CLINICAL_REVIEW" // clinician lane
  | "OFFERED"
  | "AWAITING_PAYMENT"
  | "BOOKED"
  | "IN_CONSULT"
  | "COMPLETE"
  | "CANCELLED";

export type Arrival = "NOT_ARRIVED" | "ARRIVED";

export interface ClinicianDef {
  id: string;
  name: string;
  capability: string;
  staffedFrom: number;
  staffedTo: number;
  breakFrom: number;
  breakTo: number;
  room: string;
}

export interface HistoryEntry {
  date: string;
  doctor: string;
  reason: string;
  outcome: string;
  prescription?: string;
}

export interface DocumentRec {
  id: string;
  name: string;
  status: "uploaded" | "linked" | "available";
  note?: string;
}

export interface PaymentItem {
  id: string;
  label: string;
  amount: number; // ₹
  status: "due" | "paid" | "refunded" | "transferred";
  at?: string;
}

export interface NextStepOrder {
  id: string;
  kind: "test" | "referral" | "follow_up";
  label: string;
  instruction: string; // explicit constraints from the clinician
  fee: number;
  booked: boolean;
  bookedLabel?: string;
}

export type CallStatus = "not_offered" | "consented" | "declined_consent" | "confirmed" | "cannot_attend" | "no_answer" | "callback_requested";

export type PatientType = "first_visit" | "follow_up" | "walk_in" | "emergency";

export interface PatientRecord {
  id: string;
  name: string;
  patientType: PatientType;
  token?: string;
  clinicianId: string | null;
  originalWindow: [number, number] | null; // immutable promise
  agreedWindow: [number, number] | null;
  phase: JourneyPhase;
  arrival: Arrival;
  arrivedAt?: number;
  reportedNeed: string;
  seedNote: string;
  review: { status: "none" | "pending" | "approved" | "escalated"; lane: "scheduling" | "clinical" | null; pathway: string | null; reviewer: string | null };
  readiness: { id: string; label: string; status: "needed" | "provided" | "verified" | "blocked" | "not_required"; blockingReason?: string }[];
  durationEstimate: number;
  waitlist?: boolean;
  walkIn?: boolean;
  assisted?: boolean;
  consultStartedAt?: number;
  consultEndedAt?: number;
  // v2
  confirmationCall: CallStatus;
  callTranscript?: string[];
  nonArrivalFlagged?: boolean;
  onHold?: { reason: string; since: number } | null;
  visitDate?: string; // defaults to the simulated clinic day "Tue 6 Oct"

  lateReply?: { comingAt: number | null; note: string };
  history: HistoryEntry[];
  documents: DocumentRec[];
  payments: PaymentItem[];
  outcome?: { notes: string; diagnosis: string; plan: string; prescription: string };
  orders: NextStepOrder[];
  languagePref?: string;
  channelPref?: string;
  familyAuthorized?: string;
}

export type ProposalStatus = "pending_staff" | "awaiting_patient" | "accepted" | "rejected_staff" | "declined_patient" | "stale";

export interface Proposal {
  id: string;
  createdAtVersion: number;
  sourceEvent: string;
  patientId: string;
  kind: "time_change" | "capacity_offer" | "doctor_change";
  summary: string;
  beforeLabel: string;
  afterLabel: string;
  newAgreedWindow?: [number, number];
  newClinicianId?: string;
  facts: string[];
  requires: string;
  status: ProposalStatus;
}

export interface ExceptionTask {
  id: string;
  category: string;
  patientId?: string;
  owner: string;
  deadline: string;
  detail: string;
  nextStep: string;
  status: "open" | "resolved";
}

export interface EventLogEntry {
  id: string;
  clock: number;
  phase: "booking" | "clinic";
  actor: string;
  text: string;
}

export interface ChatMsg {
  role: "user" | "agent";
  text: string;
}

export interface IntakeExtract {
  patientReportedNeed: string | null;
  preferredLocalDate: string | null;
  earliestTime: string | null;
  latestTime: string | null;
  travelMinutes: number | null;
  preferredClinician: string | null;
  missingFields: string[];
  contradictions: string[];
  requiresStaffReview: boolean;
  nextQuestion: string | null;
  intakeComplete: boolean;
}

export interface Offer {
  id: string;
  clinicianId: string;
  clinicianName: string;
  window: [number, number];
  dateLabel: string; // e.g. "Tue 6 Oct"
  differentClinician: boolean;
  note: string;
}

export interface EmergencyState {
  status: "none" | "requested" | "dispatched";
  etaMin?: number;
  paid?: boolean;
}

export interface FlowState {
  v: 2;
  planVersion: number;
  simPhase: "booking" | "clinic";
  clock: number;
  clinicians: ClinicianDef[];
  patients: PatientRecord[];
  proposals: Proposal[];
  exceptions: ExceptionTask[];
  events: EventLogEntry[];
  clinicianDelays: Record<string, number>;
  imagingDown: boolean;
  staffActions: number;
  chat: ChatMsg[];
  intakeExtract: IntakeExtract | null;
  intakeDone: boolean;
  offers: Offer[] | null;
  disruptionsUsed: string[];
  emergency: EmergencyState;
  cancelledDoctors: string[];
  tokenCounter: number;
  emergencyTokenCounter: number;
  recordsQueue: { id: string; patientId: string; docName: string; linked: boolean }[];
}

export interface ForecastEntry {
  patientId: string;
  forecastStart: number;
  forecastEnd: number;
  expectedArrival: number | null;
  onsiteWaitMin: number | null;
  breachesOriginal: boolean;
}

export const fmt = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

export const fmtWin = (w: [number, number]) => `${fmt(w[0])}–${fmt(w[1])}`;

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
