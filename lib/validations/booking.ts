import { z } from "zod";

const TIME_REGEX = /^\d{2}:\d{2}$/;

export const NOTES_MAX = 500;
export const MAX_CAPTURES = 10;

export const CAPTURE_LOCATION_TYPES = [
  "capital_city",
  "regional_other",
  "multi_location",
] as const;
export type CaptureLocationType = (typeof CAPTURE_LOCATION_TYPES)[number];

export const AUSTRALIAN_CAPITAL_CITIES = [
  "sydney",
  "melbourne",
  "brisbane",
  "perth",
  "adelaide",
  "hobart",
  "canberra",
  "darwin",
] as const;
export type AustralianCapitalCity = (typeof AUSTRALIAN_CAPITAL_CITIES)[number];

export const CAPITAL_CITY_LABELS: Record<AustralianCapitalCity, string> = {
  sydney: "Sydney",
  melbourne: "Melbourne",
  brisbane: "Brisbane",
  perth: "Perth",
  adelaide: "Adelaide",
  hobart: "Hobart",
  canberra: "Canberra",
  darwin: "Darwin",
};

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
    // timeEnd is auto-computed server-side; included so the form can track it as display state.
    timeEnd: z.string().regex(TIME_REGEX, "Enter a valid end time"),
    notes: z
      .string()
      .max(NOTES_MAX, `Notes must be ${NOTES_MAX} characters or less`)
      .optional(),
    participants: z
      .array(participantSchema)
      .min(1, "At least one participant is required"),
    captureLocationType: z.enum(CAPTURE_LOCATION_TYPES, {
      error: "Location type is required",
    }),
    capitalCity: z.enum(AUSTRALIAN_CAPITAL_CITIES).nullable().optional(),
    suburbOrTown: z.string().max(200).nullable().optional(),
    stateOrTerritory: z.string().max(100).nullable().optional(),
    postcode: z.string().max(10).nullable().optional(),
    addressLine1: z.string().max(200).nullable().optional(),
    addressLine2: z.string().max(200).nullable().optional(),
    locationNotes: z
      .string()
      .max(NOTES_MAX, `Location notes must be ${NOTES_MAX} characters or less`)
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.participants.length !== data.capturesCount) {
      ctx.addIssue({
        code: "custom",
        message: "Number of participants must match captures count",
        path: ["participants"],
      });
    }
    if (data.captureLocationType === "capital_city" && !data.capitalCity) {
      ctx.addIssue({
        code: "custom",
        message: "Capital city is required",
        path: ["capitalCity"],
      });
    }
    if (data.captureLocationType === "regional_other") {
      if (!data.suburbOrTown?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Suburb or town is required",
          path: ["suburbOrTown"],
        });
      }
      if (!data.stateOrTerritory?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "State or territory is required",
          path: ["stateOrTerritory"],
        });
      }
      if (!data.postcode?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Postcode is required",
          path: ["postcode"],
        });
      }
    }
    if (data.captureLocationType === "multi_location" && !data.locationNotes?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Please list the planned locations or describe the rollout",
        path: ["locationNotes"],
      });
    }
  });

export const createBookingSchema = bookingBaseSchema;
export const updateBookingSchema = bookingBaseSchema;

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
