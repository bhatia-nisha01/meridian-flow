// Synthetic HIS adapter — the availability boundary.
// In production this reads from the hospital scheduling system (HIS/EHR).
// Nothing else in the app — and never the language model — invents slots.

import { Offer } from "./types";

const T = (h: number, m = 0) => h * 60 + m;

/** Earliest bookable first-visit slots over the next 3 days (doctor assigned by availability). */
export function getBookableSlots(): Offer[] {
  return [
    { id: "offer-tue-1730", clinicianId: "dr-mehta", clinicianName: "Dr Mehta", window: [T(17, 30), T(17, 50)], dateLabel: "Tue 6 Oct", differentClinician: false, note: "Earliest available" },
    { id: "offer-tue-1820", clinicianId: "dr-shah", clinicianName: "Dr Shah", window: [T(18, 20), T(18, 40)], dateLabel: "Tue 6 Oct", differentClinician: false, note: "" },
    { id: "offer-wed-0930", clinicianId: "dr-mehta", clinicianName: "Dr Mehta", window: [T(9, 30), T(9, 50)], dateLabel: "Wed 7 Oct", differentClinician: false, note: "" },
  ];
}
