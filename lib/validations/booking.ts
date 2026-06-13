import { z } from "zod";

const TIME_REGEX = /^\d{2}:\d{2}$/;

export const createBookingSchema = z
  .object({
    requestedDate: z
      .string()
      .min(1, "Date is required")
      .refine((val) => !isNaN(Date.parse(val)), "Invalid date"),
    timeStart: z
      .string()
      .regex(TIME_REGEX, "Enter a valid start time"),
    timeEnd: z
      .string()
      .regex(TIME_REGEX, "Enter a valid end time"),
    notes: z
      .string()
      .max(500, "Notes must be 500 characters or less")
      .optional(),
  })
  .refine((data) => data.timeEnd > data.timeStart, {
    message: "End time must be after start time",
    path: ["timeEnd"],
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
