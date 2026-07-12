import { z } from "zod";
import { registerSchema } from "@/lib/validations/auth";

export const confirmPasswordSchema = registerSchema.extend({
  confirmPassword: z.string().min(1, "Confirm password is required"),
});

export type ConfirmPasswordInput = z.infer<typeof confirmPasswordSchema>;
