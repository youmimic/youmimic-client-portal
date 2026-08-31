// Pure constants — deliberately no "server-only" import, unlike
// lib/stripe/notifications.ts. This file is shared by both the webhook
// route (server) and the admin activity page (client, for displaying
// human-readable labels), so it can't pull in any server-only dependency.

// Canonical SystemEvent.type values for Stripe-webhook-triggered events.
// Always use these constants when calling recordSystemEvent so entityType
// stays consistent and queryable — same pattern as lib/admin/audit.ts's
// ENTITY_TYPES for AdminLog.
export const SYSTEM_EVENT_TYPE = {
  SUBSCRIPTION_STARTED: "stripe_subscription_started",
  SUBSCRIPTION_UPDATED: "stripe_subscription_updated",
  SUBSCRIPTION_CANCELED: "stripe_subscription_canceled",
  PAYMENT_FAILED: "stripe_payment_failed",
  // Pre-existing type, written from app/api/stripe/webhook/route.ts's
  // ambiguous-invoice edge case — included here so every SystemEvent type
  // this app writes has one canonical constant and label, even though that
  // call site isn't wired up to send a notification email.
  AMBIGUOUS_INVOICE: "stripe_webhook_ambiguous_invoice",
} as const;

export type SystemEventType =
  (typeof SYSTEM_EVENT_TYPE)[keyof typeof SYSTEM_EVENT_TYPE];

export const SYSTEM_EVENT_TYPE_VALUES = Object.values(SYSTEM_EVENT_TYPE);

export const SYSTEM_EVENT_LABEL: Record<SystemEventType, string> = {
  [SYSTEM_EVENT_TYPE.SUBSCRIPTION_STARTED]: "Subscription started",
  [SYSTEM_EVENT_TYPE.SUBSCRIPTION_UPDATED]: "Subscription updated",
  [SYSTEM_EVENT_TYPE.SUBSCRIPTION_CANCELED]: "Subscription canceled",
  [SYSTEM_EVENT_TYPE.PAYMENT_FAILED]: "Payment failed",
  [SYSTEM_EVENT_TYPE.AMBIGUOUS_INVOICE]: "Ambiguous invoice event",
};
