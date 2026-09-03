// src/emails/templates/admin-welcome-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";

type AdminWelcomeEmailProps = {
  name: string;
  setPasswordUrl: string;
};

export function AdminWelcomeEmail({ name, setPasswordUrl }: AdminWelcomeEmailProps) {
  return (
    <EmailLayout
      previewText="Set up your youmimic account"
      heading={`Welcome to youmimic, ${name}`}
      message="An account has been created for you on the youmimic portal."
      actionLabel="Set Your Password"
      actionUrl={setPasswordUrl}
      footerNote="If you weren't expecting this, you can safely ignore this email."
    >
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#333333",
          margin: 0,
        }}
      >
        Use the button below to set a password and log in. For security, this
        link should expire after a short time.
      </Text>
    </EmailLayout>
  );
}
