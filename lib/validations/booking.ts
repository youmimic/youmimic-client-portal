import { z } from "zod";

const TIME_REGEX = /^\d{2}:\d{2}$/;

export const NOTES_MAX = 500;

function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

function notInPast(val: string) {
  return val >= todayISODate();
}

const bookingBaseSchema = z
  .object({
    requestedDate: z
      .string()
      .min(1, "Date is required")
      .refine((val) => !isNaN(Date.parse(val)), "Invalid date")
      .refine(notInPast, "Date cannot be in the past"),
    timeStart: z
      .string()
      .regex(TIME_REGEX, "Enter a valid start time"),
    timeEnd: z
      .string()
      .regex(TIME_REGEX, "Enter a valid end time"),
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
