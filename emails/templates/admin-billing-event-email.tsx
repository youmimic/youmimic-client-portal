// src/emails/templates/admin-billing-event-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";

type AdminBillingEventEmailProps = {
  eventLabel: string;
  summary: string;
  detailsUrl: string;
};

export function AdminBillingEventEmail({
  eventLabel,
  summary,
  detailsUrl,
}: AdminBillingEventEmailProps) {
  return (
    <EmailLayout
      previewText={`Billing event: ${eventLabel}`}
      heading={eventLabel}
      message={summary}
      actionLabel="View in admin"
      actionUrl={detailsUrl}
      footerNote="You're receiving this because you have billing admin access on youmimic."
    >
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#191818",
          margin: 0,
        }}
      >
        This is an automated notification triggered by a Stripe billing
        event.
      </Text>
    </EmailLayout>
  );
}
