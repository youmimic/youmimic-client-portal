// app/(auth)/login/actions.ts
"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validations/auth";

type LoginResult = {
  error?: string;
  fieldErrors?: {
    email?: string[];
    password?: string[];
  };
  success?: boolean;
};

export async function loginUser(
  _: unknown,
  formData: FormData,
): Promise<LoginResult> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      const code =
        typeof (error as { code?: string }).code === "string"
          ? (error as { code?: string }).code
          : "";

      if (code === "email_not_verified") {
        return {
          error: "Validation failed",
          fieldErrors: {
            email: ["Please verify your email before logging in"],
          },
        };
      }

      return {
        error: "Validation failed",
        fieldErrors: {
          email: ["Invalid email or password"],
        },
      };
    }

    return {
      error: "Something went wrong",
    };
  }
}
