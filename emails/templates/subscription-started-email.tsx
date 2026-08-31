// src/emails/templates/subscription-started-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";

type SubscriptionStartedEmailProps = {
  name: string;
  planLabel: string;
  dashboardUrl: string;
};

export function SubscriptionStartedEmail({
  name,
  planLabel,
  dashboardUrl,
}: SubscriptionStartedEmailProps) {
  return (
    <EmailLayout
      previewText="Your subscription is active"
      heading="You're all set!"
      message={`Hi ${name}, your ${planLabel} subscription is now active.`}
      actionLabel="Go to your dashboard"
      actionUrl={dashboardUrl}
      footerNote="If you did not expect this email, please contact our support team."
    >
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#191818",
          margin: 0,
        }}
      >
        Thanks for subscribing to youmimic. You now have full access to your
        plan&apos;s features.
      </Text>
    </EmailLayout>
  );
}
