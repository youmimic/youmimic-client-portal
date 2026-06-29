import { z } from "zod";

const TIME_REGEX = /^\d{2}:\d{2}$/;

export const NOTES_MAX = 500;
export const MAX_CAPTURES = 10;

function todayISODate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function notInPast(val: string) {
  return val >= todayISODate();
}

function isAtLeast3BusinessDaysAway(val: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(val);
  date.setHours(0, 0, 0, 0);

  // Count business days from today (exclusive) to date (inclusive).
  let businessDays = 0;
  const cursor = new Date(today);
  while (cursor < date) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) {
      businessDays++;
    }
  }
  return businessDays >= 3;
}

function isWeekday(val: string) {
  const date = new Date(val);
  const day = date.getDay(); // 0 Sun, 6 Sat
  return day !== 0 && day !== 6;
}

const participantSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  contactNumber: z.string().min(1, "Contact number is required"),
});

export type ParticipantInput = z.infer<typeof participantSchema>;

const bookingBaseSchema = z
  .object({
    requestedDate: z
      .string()
      .min(1, "Date is required")
      .refine((val) => !isNaN(Date.parse(val)), "Invalid date")
      .refine(notInPast, "Date cannot be in the past")
      .refine(isAtLeast3BusinessDaysAway, "Date must be at least 3 business days from today")
      .refine(isWeekday, "Date must be a weekday (Mon–Fri)"),
    capturesCount: z
      .number()
      .int()
      .min(1, "At least 1 capture required")
      .max(MAX_CAPTURES, `Maximum ${MAX_CAPTURES} captures`),
    timeStart: z.string().regex(TIME_REGEX, "Enter a valid start time"),
    // timeEnd is auto-computed server-side from timeStart + capturesCount;
    // included in the schema so the form can track it as read-only display state.
    timeEnd: z.string().regex(TIME_REGEX, "Enter a valid end time"),
    notes: z
      .string()
      .max(NOTES_MAX, `Notes must be ${NOTES_MAX} characters or less`)
      .optional(),
    participants: z
      .array(participantSchema)
      .min(1, "At least one participant is required"),
  })
  .refine((data) => data.participants.length === data.capturesCount, {
    message: "Number of participants must match captures count",
    path: ["participants"],
  });

export const createBookingSchema = bookingBaseSchema;
export const updateBookingSchema = bookingBaseSchema;

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
