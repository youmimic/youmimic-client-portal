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
    // YouMimic brand palette: Black #333333, White #FFFFFF, White Carbon
    // #EDEDED, Green Teal #4C9997. secondary/brown kept only because
    // BrandConfig's type requires them (see emails/types.ts) — nothing
    // reads them for a distinct hue anymore now that the header gradient
    // in email-layout.tsx is a solid teal fill instead of a two-color
    // gradient. accentSoft is a light tint of the teal (teal mixed toward
    // white), used where a softer/lighter accent reads better than the
    // full-strength teal.
    primary: "#4C9997",
    bg: "#EDEDED",
    text: "#333333",
    muted: "#333333",
    accentSoft: "#B9D9D8",
    secondary: "#4C9997",
    brown: "#4C9997",
  },
};
