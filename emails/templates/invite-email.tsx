// emails/templates/invite-email.tsx
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

type InviteEmailProps = {
  enterpriseName: string;
  inviterName: string;
  acceptUrl: string;
};

export function InviteEmail({
  enterpriseName,
  inviterName,
  acceptUrl,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        You&apos;ve been invited to join {enterpriseName} on youmimic
      </Preview>
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
              You&apos;ve been invited
            </Text>
            <Text
              style={{
                fontSize: "16px",
                lineHeight: "28px",
                color: "#F7F6F5",
                margin: "12px 0 0",
              }}
            >
              {inviterName} has invited you to join {enterpriseName} on
              youmimic.
            </Text>
          </Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text
              style={{
                fontSize: "16px",
                lineHeight: "28px",
                color: "#191818",
              }}
            >
              Click the button below to accept the invitation and set up your
              account. This invitation expires in 7 days.
            </Text>

            <Button
              href={acceptUrl}
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
              Accept invitation
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
              <a href={acceptUrl} style={{ color: "#608982" }}>
                {acceptUrl}
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
