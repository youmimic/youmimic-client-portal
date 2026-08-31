// src/lib/mailer.ts
import "server-only";
import { resend } from "./resend";
import { VerifyEmailTemplate } from "@/emails/templates/verify-email";
import { ForgotPasswordEmail } from "@/emails/templates/forgot-password-email";
import { AdminWelcomeEmail } from "@/emails/templates/admin-welcome-email";
import { ContactNotificationEmail } from "@/emails/templates/contact-notification-email";
import { InviteEmail } from "@/emails/templates/invite-email";
import { SubscriptionStartedEmail } from "@/emails/templates/subscription-started-email";
import { SubscriptionChangedEmail } from "@/emails/templates/subscription-changed-email";
import { PaymentFailedEmail } from "@/emails/templates/payment-failed-email";
import { AdminBillingEventEmail } from "@/emails/templates/admin-billing-event-email";
import type { ContactInput } from "@/lib/validations/contact";

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

type SendAdminWelcomeEmailParams = {
  to: string;
  name: string;
  setPasswordUrl: string;
};

export async function sendAdminWelcomeEmail({
  to,
  name,
  setPasswordUrl,
}: SendAdminWelcomeEmailParams) {
  const from = getFromEmail();

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject: "Your youmimic account is ready — set your password",
      react: AdminWelcomeEmail({ name, setPasswordUrl }),
      tags: [{ name: "category", value: "admin_welcome" }],
    },
    {
      idempotencyKey: `admin-welcome/${to}`,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function sendContactNotificationEmail(data: ContactInput) {
  const from = getFromEmail();
  const to = process.env.CONTACT_EMAIL ?? process.env.EMAIL_FROM;

  if (!to) {
    throw new Error("No recipient configured for contact notifications");
  }

  const { data: emailData, error } = await resend.emails.send({
    from,
    to: [to],
    subject: `New demo inquiry from ${data.name} (${data.companyName})`,
    react: ContactNotificationEmail(data),
    tags: [{ name: "category", value: "contact_inquiry" }],
  });

  if (error) {
    throw new Error(error.message);
  }

  return emailData;
}

type SendInviteEmailParams = {
  to: string;
  inviterName: string;
  enterpriseName: string;
  acceptUrl: string;
  idempotencyKey: string;
};

export async function sendInviteEmail({
  to,
  inviterName,
  enterpriseName,
  acceptUrl,
  idempotencyKey,
}: SendInviteEmailParams) {
  const from = getFromEmail();

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject: `You've been invited to join ${enterpriseName} on youmimic`,
      react: InviteEmail({ enterpriseName, inviterName, acceptUrl }),
      tags: [{ name: "category", value: "team_invite" }],
    },
    { idempotencyKey },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

type SendSubscriptionStartedEmailParams = {
  to: string;
  name: string;
  planLabel: string;
  dashboardUrl: string;
  idempotencyKey: string;
};

export async function sendSubscriptionStartedEmail({
  to,
  name,
  planLabel,
  dashboardUrl,
  idempotencyKey,
}: SendSubscriptionStartedEmailParams) {
  const from = getFromEmail();

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject: "Your youmimic subscription is active",
      react: SubscriptionStartedEmail({ name, planLabel, dashboardUrl }),
      tags: [{ name: "category", value: "subscription_started" }],
    },
    { idempotencyKey },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

type SendSubscriptionChangedEmailParams = {
  to: string;
  name: string;
  planLabel: string;
  canceled: boolean;
  billingUrl: string;
  idempotencyKey: string;
};

export async function sendSubscriptionChangedEmail({
  to,
  name,
  planLabel,
  canceled,
  billingUrl,
  idempotencyKey,
}: SendSubscriptionChangedEmailParams) {
  const from = getFromEmail();

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject: canceled
        ? "Your youmimic subscription has been canceled"
        : "Your youmimic subscription was updated",
      react: SubscriptionChangedEmail({ name, planLabel, canceled, billingUrl }),
      tags: [{ name: "category", value: "subscription_changed" }],
    },
    { idempotencyKey },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

type SendPaymentFailedEmailParams = {
  to: string;
  name: string;
  portalUrl: string;
  idempotencyKey: string;
};

export async function sendPaymentFailedEmail({
  to,
  name,
  portalUrl,
  idempotencyKey,
}: SendPaymentFailedEmailParams) {
  const from = getFromEmail();

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject: "Action needed: your youmimic payment failed",
      react: PaymentFailedEmail({ name, portalUrl }),
      tags: [{ name: "category", value: "payment_failed" }],
    },
    { idempotencyKey },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

type SendAdminBillingEventEmailParams = {
  to: string[];
  eventLabel: string;
  summary: string;
  detailsUrl: string;
  idempotencyKey: string;
};

// Sent to every BILLING_ADMIN+ admin in a single message (internal team
// distribution, not customer-facing — see lib/billing/system-events.ts for
// why exposing admin addresses to each other in the To: header is an
// accepted tradeoff here).
export async function sendAdminBillingEventEmail({
  to,
  eventLabel,
  summary,
  detailsUrl,
  idempotencyKey,
}: SendAdminBillingEventEmailParams) {
  const from = getFromEmail();

  const { data, error } = await resend.emails.send(
    {
      from,
      to,
      subject: `[youmimic billing] ${eventLabel}`,
      react: AdminBillingEventEmail({ eventLabel, summary, detailsUrl }),
      tags: [{ name: "category", value: "admin_billing_event" }],
    },
    { idempotencyKey },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
