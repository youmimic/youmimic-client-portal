import { z } from "zod";

const emailRegex =
  /^(?!\.)(?!.*\.\.)([a-z0-9_'+\-\.]*)[a-z0-9_'+\-]@([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$/i;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const inviteSchema = z.object({
  email: z
    .string()
    .transform(normalizeEmail)
    .refine((value) => value.length >= 6, { message: "Email is required" })
    .refine((value) => emailRegex.test(value), {
      message: "Invalid email address",
    }),
});

export type InviteInput = z.infer<typeof inviteSchema>;
