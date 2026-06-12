// src/emails/types.ts
export type BaseEmailProps = {
  previewText: string;
  heading: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  footerNote?: string;
};

export type BrandConfig = {
  brandName: string;
  supportEmail: string;
  logoLightUrl: string;
  logoDarkUrl?: string;
  colors: {
    primary: string;
    bg: string;
    text: string;
    muted: string;
    accentSoft: string;
    secondary: string;
    brown: string;
  };
};