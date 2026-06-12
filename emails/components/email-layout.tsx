// src/emails/components/email-layout.tsx
import type { PropsWithChildren } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { brandConfig } from "../config";
import type { BaseEmailProps } from "../types";

export function EmailLayout({
  previewText,
  heading,
  message,
  actionLabel,
  actionUrl,
  footerNote,
  children,
}: PropsWithChildren<BaseEmailProps>) {
  const c = brandConfig.colors;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: c.bg,
          margin: 0,
          padding: "32px 16px",
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
              background: `linear-gradient(135deg, ${c.primary} 0%, ${c.secondary} 100%)`,
              padding: "40px 40px 28px",
            }}
          >
            <Img
              src={brandConfig.logoDarkUrl || brandConfig.logoLightUrl}
              alt={brandConfig.brandName}
              width="160"
              style={{ marginBottom: "24px" }}
            />
            <Text
              style={{
                margin: "0 0 10px",
                fontSize: "12px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "#ECEAE9",
              }}
            >
              {brandConfig.brandName}
            </Text>
            <Text
              style={{
                margin: 0,
                fontSize: "32px",
                lineHeight: "40px",
                fontWeight: "700",
                color: "#ffffff",
              }}
            >
              {heading}
            </Text>
            <Text
              style={{
                margin: "14px 0 0",
                fontSize: "16px",
                lineHeight: "28px",
                color: "#F7F6F5",
              }}
            >
              {message}
            </Text>
          </Section>

          <Section style={{ padding: "32px 40px" }}>
            {children}

            {actionLabel && actionUrl ? (
              <Button
                href={actionUrl}
                style={{
                  backgroundColor: c.primary,
                  color: "#ffffff",
                  borderRadius: "999px",
                  padding: "16px 28px",
                  fontSize: "16px",
                  fontWeight: "700",
                  textDecoration: "none",
                  display: "inline-block",
                  marginTop: "12px",
                }}
              >
                {actionLabel}
              </Button>
            ) : null}

            {actionUrl ? (
              <Text
                style={{
                  fontSize: "14px",
                  color: c.muted,
                  lineHeight: "24px",
                  marginTop: "18px",
                }}
              >
                If the button does not work, copy and paste this link into your
                browser:
                <br />
                <a href={actionUrl} style={{ color: c.primary }}>
                  {actionUrl}
                </a>
              </Text>
            ) : null}
          </Section>

          <Section style={{ padding: "0 40px 32px" }}>
            <Hr style={{ borderColor: "#e3e0de" }} />
            <Text
              style={{ fontSize: "14px", lineHeight: "24px", color: c.muted }}
            >
              {footerNote ??
                `You are receiving this email from ${brandConfig.brandName}.`}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
