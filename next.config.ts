import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// The contact page embeds a Calendly inline widget (assets.calendly.com script,
// calendly.com iframe + XHR) — see app/(marketing)/contact/page.tsx. That's the
// only third-party origin the app talks to client-side; Sentry is tunneled
// through the same-origin /monitoring rewrite below, so it needs no CSP entry.
//
// img-src/media-src allow any https: host rather than a fixed list because
// avatar thumbnails and generated videos are served directly from HeyGen's CDN
// with URLs that aren't a stable, enumerable set of hostnames.
//
// script-src/style-src keep 'unsafe-inline' because Next.js App Router injects
// inline hydration/RSC payload scripts and Tailwind/Radix inject inline styles;
// a stricter nonce-based CSP would need per-request nonce plumbing through
// middleware and the root layout, which is out of scope for this pass.
//
// 'unsafe-eval' is added to script-src ONLY outside production — React's dev
// mode uses eval() for Fast Refresh / reconstructing component stack traces
// (see https://react.dev, this is dev-only instrumentation). Production
// React never calls eval(), so prod keeps the tighter policy.
const isDev = process.env.NODE_ENV !== "production";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://assets.calendly.com`,
  "style-src 'self' 'unsafe-inline' https://assets.calendly.com",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "font-src 'self' data:",
  "connect-src 'self' https://calendly.com https://*.calendly.com",
  "frame-src https://calendly.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "youmimic",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
