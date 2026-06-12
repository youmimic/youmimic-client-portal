// emails/templates/verify-email.tsx
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type VerifyEmailTemplateProps = {
  name: string;
  verifyUrl: string;
};

export function VerifyEmailTemplate({
  name,
  verifyUrl,
}: VerifyEmailTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify your email address</Preview>
      <Body
        style={{
          backgroundColor: "#ECEAE9",
          padding: "24px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <Container
          style={{
            maxWidth: "640px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            overflow: "hidden",
          }}
        >
          <Section
            style={{
              background: "linear-gradient(135deg, #608982 0%, #9AB5C7 100%)",
              padding: "40px",
            }}
          >
            <Text
              style={{
                fontSize: "32px",
                lineHeight: "40px",
                fontWeight: "700",
                color: "#ffffff",
                margin: 0,
              }}
            >
              Verify your email
            </Text>
            <Text
              style={{
                fontSize: "16px",
                lineHeight: "28px",
                color: "#F7F6F5",
                margin: "12px 0 0",
              }}
            >
              Welcome to youmimic, {name}.
            </Text>
          </Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text
              style={{ fontSize: "16px", lineHeight: "28px", color: "#191818" }}
            >
              Please verify your email address by clicking the button below.
              This link expires in 24 hours.
            </Text>

            <Button
              href={verifyUrl}
              style={{
                backgroundColor: "#608982",
                color: "#ffffff",
                padding: "16px 28px",
                borderRadius: "999px",
                textDecoration: "none",
                fontWeight: "700",
                display: "inline-block",
                marginTop: "12px",
              }}
            >
              Verify Email
            </Button>

            <Text
              style={{
                fontSize: "14px",
                lineHeight: "24px",
                color: "#5f5a5a",
                marginTop: "20px",
              }}
            >
              If the button does not work, use this link:
              <br />
              <a href={verifyUrl} style={{ color: "#608982" }}>
                {verifyUrl}
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
