// src/emails/templates/checkout-reminder-7d-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";

type CheckoutReminder7dEmailProps = {
  name: string;
  planLabel: string;
  priceDisplay: string;
  resumeUrl: string;
};

export function CheckoutReminder7dEmail({
  name,
  planLabel,
  priceDisplay,
  resumeUrl,
}: CheckoutReminder7dEmailProps) {
  return (
    <EmailLayout
      previewText={`Last reminder: your ${planLabel} plan is waiting`}
      heading="Last reminder"
      message={`Hi ${name}, it's been a week since you started setting up your ${planLabel} plan.`}
      actionLabel="Complete your purchase"
      actionUrl={resumeUrl}
      footerNote="If you no longer want to proceed, you can safely ignore this email — no further reminders will be sent."
    >
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#333333",
          margin: 0,
        }}
      >
        Your details are saved — {planLabel} at {priceDisplay}. This is the last reminder
        we&apos;ll send. If we don&apos;t hear from you, we&apos;ll remove your saved details
        30 days after you started checkout.
      </Text>
    </EmailLayout>
  );
}
