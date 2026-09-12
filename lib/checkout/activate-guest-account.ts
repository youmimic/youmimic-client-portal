import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { sendAdminWelcomeEmail } from "@/lib/mailer";

export type ActivateGuestAccountResult = { subscriptionId: string } | null;

// Fires once a guest Mid Market / Small Business checkout session actually
// completes on Stripe's side. Idempotent via draft.userId — a Stripe retry
// of the same webhook event (or a redelivery after this ran but the
// response was lost) sees a draft that already has a user and does nothing
// further, rather than trying to create a second account for the same
// email or send a second welcome email.
//
// Reuses the exact account-provisioning pattern already established for
// admin-created users (app/api/admin/users/route.ts): an unusable random
// password hash nobody knows, plus a PasswordResetToken emailed via the
// existing sendAdminWelcomeEmail template — the same "set your password to
// finish setting up your account" flow, not a new one.
//
// The Subscription row is created HERE, not by the guest-checkout-session
// route — "subscriptions" has a DB check constraint requiring exactly one
// of userId/enterpriseId to be set at all times, so it can't be
// pre-created with userId null the way the authenticated checkout route's
// placeholder row can (that route always already has a real, logged-in
// user). Creating the User and the Subscription together, in the same
// transaction, is what satisfies that constraint for a guest.
export async function activateGuestAccountForDraft(
  draftId: string,
  stripeSubscriptionId: string | null,
): Promise<ActivateGuestAccountResult> {
  const draft = await prisma.checkoutDraft.findUnique({
    where: { id: draftId },
  });
  if (!draft) return null;
  if (draft.userId) return null; // already activated — safe no-op on retry/redelivery

  const unusablePasswordHash = await bcrypt.hash(crypto.randomUUID(), 12);
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour, same as forgot-password

  const result = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction — two webhook deliveries racing each
    // other both pass the outer check above before either has committed.
    const current = await tx.checkoutDraft.findUnique({
      where: { id: draftId },
      select: { userId: true },
    });
    if (current?.userId) {
      return { user: null, subscriptionId: null };
    }

    // Guest checkout already refused to create a draft for an email with an
    // existing account (see lib/checkout/create-draft.ts) — but that check
    // ran before payment, and someone else could have registered with this
    // email in the meantime. Treat that the same way: don't silently attach
    // a paid subscription to an account the buyer never proved they own.
    const existing = await tx.user.findUnique({
      where: { email: draft.email },
      select: { id: true },
    });
    if (existing) {
      await tx.checkoutDraft.update({
        where: { id: draftId },
        data: { status: "FAILED" },
      });
      console.error(
        `Guest checkout draft ${draftId}: email ${draft.email} was registered after the draft was created — refusing to auto-attach. Needs manual review.`,
      );
      return { user: null, subscriptionId: null };
    }

    const createdUser = await tx.user.create({
      data: {
        name: draft.fullName,
        email: draft.email,
        companyName: draft.companyName,
        passwordHash: unusablePasswordHash,
        emailVerified: false,
      },
      select: { id: true, name: true, email: true },
    });

    await tx.passwordResetToken.create({
      data: { userId: createdUser.id, token, expiresAt, used: false },
    });

    const createdSubscription = await tx.subscription.create({
      data: {
        ownerType: "USER",
        userId: createdUser.id,
        stripeCustomerId: draft.stripeCustomerId,
        stripeSubscriptionId,
        planType: draft.planType,
        billingTerm: draft.billingTerm,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    await tx.checkoutDraft.update({
      where: { id: draftId },
      data: { status: "COMPLETED", userId: createdUser.id, subscriptionId: createdSubscription.id },
    });

    return { user: createdUser, subscriptionId: createdSubscription.id };
  });

  if (!result.user) return null;
  const { user, subscriptionId } = result;

  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) {
    console.error("NEXTAUTH_URL is not configured — cannot send account activation email");
    return { subscriptionId };
  }

  const setPasswordUrl = new URL("/reset-password", appUrl);
  setPasswordUrl.searchParams.set("token", token);

  try {
    await sendAdminWelcomeEmail({
      to: user.email,
      name: user.name,
      setPasswordUrl: setPasswordUrl.toString(),
    });
  } catch (err) {
    console.error(`Account activation email failed for checkout draft ${draftId}:`, err);
  }

  return { subscriptionId };
}
