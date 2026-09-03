import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type ContactNotificationEmailProps = {
  name: string;
  email: string;
  companyName: string;
  message: string;
};

export function ContactNotificationEmail({
  name,
  email,
  companyName,
  message,
}: ContactNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        New demo inquiry from {name} at {companyName}
      </Preview>
      <Body
        style={{
          backgroundColor: "#EDEDED",
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
              backgroundColor: "#4C9997",
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
              New demo inquiry
            </Text>
            <Text
              style={{
                fontSize: "16px",
                lineHeight: "28px",
                color: "#EDEDED",
                margin: "12px 0 0",
              }}
            >
              {name} from {companyName} wants to learn more.
            </Text>
          </Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "24px",
                color: "#333333",
                margin: "0 0 4px",
              }}
            >
              <strong>Name:</strong> {name}
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "24px",
                color: "#333333",
                margin: "0 0 4px",
              }}
            >
              <strong>Email:</strong> {email}
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "24px",
                color: "#333333",
                margin: "0 0 24px",
              }}
            >
              <strong>Company:</strong> {companyName}
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "24px",
                color: "#333333",
                margin: "0 0 8px",
                fontWeight: "600",
              }}
            >
              Message:
            </Text>
            <Text
              style={{
                fontSize: "15px",
                lineHeight: "26px",
                color: "#333333",
                backgroundColor: "#EDEDED",
                padding: "16px 20px",
                borderRadius: "12px",
                margin: 0,
              }}
            >
              {message}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
