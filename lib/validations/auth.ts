// lib/validations/auth.ts
import { z } from "zod";

const emailRegex =
  /^(?!\.)(?!.*\.\.)([a-z0-9_'+\-\.]*)[a-z0-9_'+\-]@([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$/i;

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeEmail = (value: string) => value.trim().toLowerCase();

const passwordSchema = z
  .string()
  .refine((value) => value === value.trim(), {
    message: "Password must not start or end with spaces",
  })
  .refine((value) => value.length >= 8, {
    message: "Password must be at least 8 characters",
  })
  .refine((value) => value.length <= 100, {
    message: "Password must be 100 characters or less",
  })
  .refine((value) => /[A-Z]/.test(value), {
    message: "Password must contain at least one uppercase letter",
  })
  .refine((value) => /[a-z]/.test(value), {
    message: "Password must contain at least one lowercase letter",
  })
  .refine((value) => /[0-9]/.test(value), {
    message: "Password must contain at least one number",
  });

export const registerSchema = z.object({
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

  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z
    .string()
    .transform(normalizeEmail)
    .refine((value) => value.length >= 6, {
      message: "Email is required",
    })
    .refine((value) => emailRegex.test(value), {
      message: "Invalid email address",
    }),

  password: z
    .string()
    .refine((value) => value === value.trim(), {
      message: "Password must not start or end with spaces",
    })
    .refine((value) => value.length >= 8, {
      message: "Password must be at least 8 characters",
    })
    .refine((value) => value.length <= 100, {
      message: "Password must be 100 characters or less",
    }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
