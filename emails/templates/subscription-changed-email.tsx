// src/emails/templates/subscription-changed-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";

type SubscriptionChangedEmailProps = {
  name: string;
  planLabel: string;
  canceled: boolean;
  billingUrl: string;
};

export function SubscriptionChangedEmail({
  name,
  planLabel,
  canceled,
  billingUrl,
}: SubscriptionChangedEmailProps) {
  const heading = canceled
    ? "Your subscription has been canceled"
    : "Your subscription was updated";
  const message = canceled
    ? `Hi ${name}, your ${planLabel} subscription has been canceled.`
    : `Hi ${name}, your ${planLabel} subscription has been updated.`;

  return (
    <EmailLayout
      previewText={heading}
      heading={heading}
      message={message}
      actionLabel="View billing details"
      actionUrl={billingUrl}
      footerNote="If you did not expect this change, please contact our support team."
    >
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#191818",
          margin: 0,
        }}
      >
        {canceled
          ? "You'll continue to have access until the end of your current billing period, after which your account will lose access to subscription features."
          : "You can review the details of this change on your billing page at any time."}
      </Text>
    </EmailLayout>
  );
}
