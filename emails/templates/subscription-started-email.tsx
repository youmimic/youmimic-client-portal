// src/emails/templates/subscription-started-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";

type SubscriptionStartedEmailProps = {
  name: string;
  planLabel: string;
  dashboardUrl: string;
  bookingUrl: string;
};

export function SubscriptionStartedEmail({
  name,
  planLabel,
  dashboardUrl,
  bookingUrl,
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
          color: "#333333",
          margin: 0,
        }}
      >
        Thanks for subscribing to youmimic. You now have full access to your
        plan&apos;s features.
      </Text>
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#333333",
          marginTop: "16px",
        }}
      >
        Next step: your avatar is built from footage filmed in a real capture
        session.{" "}
        <a href={bookingUrl} style={{ color: "#4C9997" }}>
          Book your session
        </a>{" "}
        to get started.
      </Text>
    </EmailLayout>
  );
}
