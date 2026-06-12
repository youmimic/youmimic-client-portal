// src/emails/templates/forgot-password-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";

type ForgotPasswordEmailProps = {
  resetUrl: string;
};

export function ForgotPasswordEmail({ resetUrl }: ForgotPasswordEmailProps) {
  return (
    <EmailLayout
      previewText="Reset your password"
      heading="Reset your password"
      message="We received a request to reset your youmimic password."
      actionLabel="Reset Password"
      actionUrl={resetUrl}
      footerNote="If you did not request a password reset, you can safely ignore this email."
    >
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#191818",
          margin: 0,
        }}
      >
        Use the button below to choose a new password. For security, this link
        should expire after a short time.
      </Text>
    </EmailLayout>
  );
}
