// src/emails/config.ts
import type { BrandConfig } from "./types";

// Fallback logic ensures image paths remain valid in your local development environment
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

export const brandConfig: BrandConfig = {
  brandName: "youmimic",
  supportEmail: "support@youmimic.com",
  logoLightUrl: `${baseUrl}/youmimic-green-transparent.png`,
  logoDarkUrl: `${baseUrl}/youmimic-white-transparent.png`,
  colors: {
    primary: "#608982",
    bg: "#ECEAE9",
    text: "#191818",
    muted: "#5f5a5a",
    accentSoft: "#ACC8CE",
    secondary: "#9AB5C7",
    brown: "#604B33",
  },
};
