import {
  CAPITAL_CITY_LABELS,
  type AustralianCapitalCity,
  type CaptureLocationType,
} from "@/lib/validations/booking";

/**
 * Adds whole hours to an HH:mm time string, wrapping around midnight.
 * e.g. addHoursToTime("22:00", 3) → "01:00"
 */
export function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = h * 60 + m + hours * 60;
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

type BookingLocationFields = {
  captureLocationType: CaptureLocationType | string | null;
  capitalCity?: AustralianCapitalCity | string | null;
  suburbOrTown?: string | null;
  stateOrTerritory?: string | null;
};

/**
 * Renders a booking's location fields as a single display string, e.g.
 * "Sydney", "Newtown, NSW", or "Multi-location".
 */
export function formatLocationSummary(booking: BookingLocationFields): string {
  const type = booking.captureLocationType as CaptureLocationType | null;
  if (!type) return "—";
  if (type === "capital_city") {
    const city = booking.capitalCity as AustralianCapitalCity | null;
    return city ? (CAPITAL_CITY_LABELS[city] ?? city) : "Capital city";
  }
  if (type === "regional_other") {
    const parts = [booking.suburbOrTown, booking.stateOrTerritory].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Regional";
  }
  if (type === "multi_location") {
    return "Multi-location";
  }
  return "—";
}
