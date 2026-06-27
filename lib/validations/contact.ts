import { z } from "zod";

const emailRegex =
  /^(?!\.)(?!.*\.\.)([a-z0-9_'+\-\.]*)[a-z0-9_'+\-]@([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$/i;

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const contactSchema = z.object({
  name: z
    .string()
    .transform(normalizeName)
    .refine((value) => value.length >= 2, {
      message: "Name must be at least 2 characters",
    })
    .refine((value) => value.length <= 100, {
      message: "Name must be 100 characters or less",
    }),

  email: z
    .string()
    .transform(normalizeEmail)
    .refine((value) => value.length >= 6, {
      message: "Email is required",
    })
    .refine((value) => emailRegex.test(value), {
      message: "Invalid email address",
    }),

  companyName: z
    .string()
    .min(1, "Company name is required")
    .max(200, "Company name must be 200 characters or less"),

  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be 2000 characters or less"),
});

export type ContactInput = z.infer<typeof contactSchema>;
