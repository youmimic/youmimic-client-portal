// src/emails/templates/payment-failed-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";

type PaymentFailedEmailProps = {
  name: string;
  portalUrl: string;
};

export function PaymentFailedEmail({ name, portalUrl }: PaymentFailedEmailProps) {
  return (
    <EmailLayout
      previewText="Action needed: your payment failed"
      heading="We couldn't process your payment"
      message={`Hi ${name}, we were unable to charge your card for your youmimic subscription.`}
      actionLabel="Update payment method"
      actionUrl={portalUrl}
      footerNote="If you've already updated your payment details, you can safely ignore this email."
    >
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#191818",
          margin: 0,
        }}
      >
        Please update your payment method to avoid any interruption to your
        subscription.
      </Text>
    </EmailLayout>
  );
}
