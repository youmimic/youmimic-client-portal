// src/emails/templates/checkout-reminder-2d-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";

type CheckoutReminder2dEmailProps = {
  name: string;
  planLabel: string;
  priceDisplay: string;
  resumeUrl: string;
};

export function CheckoutReminder2dEmail({
  name,
  planLabel,
  priceDisplay,
  resumeUrl,
}: CheckoutReminder2dEmailProps) {
  return (
    <EmailLayout
      previewText={`Finish setting up your ${planLabel} plan`}
      heading="Still there?"
      message={`Hi ${name}, you started setting up your ${planLabel} plan but didn't finish checking out.`}
      actionLabel="Complete your purchase"
      actionUrl={resumeUrl}
      footerNote="If you no longer want to proceed, you can safely ignore this email."
    >
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#333333",
          margin: 0,
        }}
      >
        Your details are saved — {planLabel} at {priceDisplay}. Pick up right where you left
        off whenever you&apos;re ready.
      </Text>
    </EmailLayout>
  );
}
