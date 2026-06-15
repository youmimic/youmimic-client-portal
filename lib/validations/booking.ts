import { z } from "zod";

const TIME_REGEX = /^\d{2}:\d{2}$/;

export const NOTES_MAX = 500;

function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

function notInPast(val: string) {
  return val >= todayISODate();
}

function isAtLeastAWeekAway(val: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(val);
  date.setHours(0, 0, 0, 0);

  const diffMs = date.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= 7;
}

function isWeekday(val: string) {
  const date = new Date(val);
  const day = date.getDay(); // 0 Sun, 6 Sat
  return day !== 0 && day !== 6;
}

const bookingBaseSchema = z
  .object({
    requestedDate: z
      .string()
      .min(1, "Date is required")
      .refine((val) => !isNaN(Date.parse(val)), "Invalid date")
      .refine(notInPast, "Date cannot be in the past")
      .refine(isAtLeastAWeekAway, "Date must be at least 7 days from today")
      .refine(isWeekday, "Date must be a weekday (Mon–Fri)"),
    timeStart: z.string().regex(TIME_REGEX, "Enter a valid start time"),
    timeEnd: z.string().regex(TIME_REGEX, "Enter a valid end time"),
    notes: z
      .string()
      .max(NOTES_MAX, `Notes must be ${NOTES_MAX} characters or less`)
      .optional(),
  })
  .refine((data) => data.timeEnd > data.timeStart, {
    message: "End time must be after start time",
    path: ["timeEnd"],
  });

export const createBookingSchema = bookingBaseSchema;
export const updateBookingSchema = bookingBaseSchema;

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
