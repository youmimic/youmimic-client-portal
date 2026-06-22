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
