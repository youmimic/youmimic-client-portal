// src/lib/mailer.ts
import "server-only";
import { resend } from "./resend";
import { VerifyEmailTemplate } from "@/emails/templates/verify-email";
import { ForgotPasswordEmail } from "@/emails/templates/forgot-password-email";

type SendVerifyEmailParams = {
  to: string;
  name: string;
  verifyUrl: string;
  idempotencyKey: string;
};

type SendForgotPasswordEmailParams = {
  to: string;
  resetUrl: string;
};

function getFromEmail() {
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error("EMAIL_FROM is not configured");
  }

  return `youmimic <${emailFrom}>`;
}

export async function sendVerifyEmail({
  to,
  name,
  verifyUrl,
  idempotencyKey,
}: SendVerifyEmailParams) {
  const from = getFromEmail();

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject: "Verify your email",
      react: VerifyEmailTemplate({
        name,
        verifyUrl,
      }),
      tags: [{ name: "category", value: "email_verification" }],
    },
    {
      idempotencyKey: idempotencyKey,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function sendForgotPasswordEmail({
  to,
  resetUrl,
}: SendForgotPasswordEmailParams) {
  const from = getFromEmail();

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject: "Reset your youmimic password",
      react: ForgotPasswordEmail({ resetUrl }),
      tags: [{ name: "category", value: "password_reset" }],
    },
    {
      idempotencyKey: `forgot-password/${to}`,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
