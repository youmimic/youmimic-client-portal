import prisma from "@/lib/prisma";
import { sendCheckoutReminder2dEmail, sendCheckoutReminder7dEmail } from "@/lib/mailer";
import { CHECKOUT_PLANS, type CheckoutPlanKey } from "@/lib/checkout/plan-keys";
import type { BillingTermKey } from "@/lib/pricing/plans";
import { deleteDraftAndStripeCustomer } from "@/lib/checkout/delete-draft";

const DAY_MS = 24 * 60 * 60 * 1000;

// Cron-driven (see app/api/internal/billing/retry-failed-provisioning —
// bundled into that existing daily cron rather than given its own, since
// Vercel's Hobby plan caps this project at 2 scheduled cron jobs and both
// slots are already used) lifecycle for abandoned guest Mid Market / Small
// Business checkouts: a day-2 reminder, a day-7 reminder, and permanent
// deletion 30 days after the draft was created if the buyer never
// completed payment.
//
// Deliberately excludes any draft that's COMPLETED (converted — a real
// User exists) or that has a stripeSubscriptionId set despite not being
// COMPLETED (payment actually succeeded but account creation needs manual
// review — see lib/checkout/activate-guest-account.ts's FAILED path).
// Neither case is "abandoned"; reminding or deleting either would be wrong.
const ABANDONED_DRAFT_FILTER = {
  status: { not: "COMPLETED" as const },
  stripeSubscriptionId: null,
};

function planLabel(planType: string): string {
  return CHECKOUT_PLANS[planType as CheckoutPlanKey]?.name ?? planType;
}

function priceDisplay(planType: string, billingTerm: string): string {
  const plan = CHECKOUT_PLANS[planType as CheckoutPlanKey];
  return plan?.byTerm[billingTerm as BillingTermKey]?.priceDisplay ?? "";
}

function resumeUrl(draft: { id: string; planType: string; billingTerm: string }): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL("/checkout", appUrl);
  url.searchParams.set("plan", draft.planType);
  url.searchParams.set("term", draft.billingTerm);
  url.searchParams.set("draftId", draft.id);
  return url.toString();
}

async function sendReminders(): Promise<{ sent2d: number; sent7d: number }> {
  const now = Date.now();

  const due2d = await prisma.checkoutDraft.findMany({
    where: {
      ...ABANDONED_DRAFT_FILTER,
      reminder2dSentAt: null,
      createdAt: { lte: new Date(now - 2 * DAY_MS) },
    },
    select: { id: true, email: true, fullName: true, planType: true, billingTerm: true },
  });

  let sent2d = 0;
  for (const draft of due2d) {
    try {
      await sendCheckoutReminder2dEmail({
        to: draft.email,
        name: draft.fullName,
        planLabel: planLabel(draft.planType),
        priceDisplay: priceDisplay(draft.planType, draft.billingTerm),
        resumeUrl: resumeUrl(draft),
        idempotencyKey: `checkout-reminder-2d/${draft.id}`,
      });
      await prisma.checkoutDraft.update({
        where: { id: draft.id },
        data: { reminder2dSentAt: new Date() },
      });
      sent2d++;
    } catch (err) {
      console.error(`2-day checkout reminder failed for draft ${draft.id}:`, err);
    }
  }

  const due7d = await prisma.checkoutDraft.findMany({
    where: {
      ...ABANDONED_DRAFT_FILTER,
      reminder7dSentAt: null,
      createdAt: { lte: new Date(now - 7 * DAY_MS) },
    },
    select: { id: true, email: true, fullName: true, planType: true, billingTerm: true },
  });

  let sent7d = 0;
  for (const draft of due7d) {
    try {
      await sendCheckoutReminder7dEmail({
        to: draft.email,
        name: draft.fullName,
        planLabel: planLabel(draft.planType),
        priceDisplay: priceDisplay(draft.planType, draft.billingTerm),
        resumeUrl: resumeUrl(draft),
        idempotencyKey: `checkout-reminder-7d/${draft.id}`,
      });
      await prisma.checkoutDraft.update({
        where: { id: draft.id },
        data: { reminder7dSentAt: new Date() },
      });
      sent7d++;
    } catch (err) {
      console.error(`7-day checkout reminder failed for draft ${draft.id}:`, err);
    }
  }

  return { sent2d, sent7d };
}

async function purgeExpiredDrafts(): Promise<{ deleted: number }> {
  const now = Date.now();

  const expired = await prisma.checkoutDraft.findMany({
    where: {
      ...ABANDONED_DRAFT_FILTER,
      createdAt: { lte: new Date(now - 30 * DAY_MS) },
    },
    select: { id: true, stripeCustomerId: true },
  });

  for (const draft of expired) {
    await deleteDraftAndStripeCustomer(draft);
  }

  return { deleted: expired.length };
}

export async function processCheckoutDraftLifecycle() {
  const { sent2d, sent7d } = await sendReminders();
  const { deleted } = await purgeExpiredDrafts();
  return { sent2d, sent7d, deleted };
}
