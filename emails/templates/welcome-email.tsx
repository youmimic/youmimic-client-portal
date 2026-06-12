// src/emails/templates/welcome-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";

type WelcomeEmailProps = {
  name?: string;
  verificationUrl: string;
};

export function WelcomeEmail({ name, verificationUrl }: WelcomeEmailProps) {
  return (
    <EmailLayout
      previewText="Verify your email to get started"
      heading={`Welcome${name ? `, ${name}` : ""}`}
      message="Thanks for joining youmimic. Verify your email to activate your account and start using the platform."
      actionLabel="Verify Email"
      actionUrl={verificationUrl}
      footerNote="If you did not create this account, you can safely ignore this email."
    >
      <Text style={{ fontSize: "16px", lineHeight: "28px", color: "#191818" }}>
        You’re one click away from getting started.
      </Text>
    </EmailLayout>
  );
}
