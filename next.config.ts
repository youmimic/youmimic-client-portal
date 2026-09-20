import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// The contact page embeds a Calendly inline widget (assets.calendly.com script,
// calendly.com iframe + XHR) and a Brevo Conversations chat widget
// (conversations-widget.brevo.com script, which renders its actual chat UI
// in an iframe from the same host) — see app/(marketing)/contact/page.tsx.
// The footer's newsletter signup posts directly (plain HTML form, no JS)
// to Brevo's forms host — needs a form-action allowance, not script/connect,
// since the browser navigates there rather than fetching it.
// Sentry is tunneled through the same-origin /monitoring rewrite below, so
// it needs no CSP entry.
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
  // Google Tag Manager (app/layout.tsx, site-wide) can load arbitrary tags
  // from inside its container config without a code deploy — this is the
  // GA4 Configuration tag added inside GTM's own console, which needed its
  // own CSP entries beyond just googletagmanager.com: the actual pageview
  // "collect" beacon goes to google-analytics.com, with www.google.com as a
  // secondary relay endpoint GA4 also attempts (cross-domain/consent-mode
  // signal forwarding) — any further tag added later inside the GTM
  // container (Ads conversion tracking, etc.) may need its own entry too.
  // https://core.sanity-cdn.com/bridge.js is Sanity Studio's Presentation
  // tool bridge script (the postMessage handshake between Studio and the
  // preview iframe) — a different host than the *.sanity.io domains below.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://assets.calendly.com https://conversations-widget.brevo.com https://www.googletagmanager.com https://*.sanity-cdn.com`,
  "style-src 'self' 'unsafe-inline' https://assets.calendly.com",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  // design-system-static.sanity.io serves Studio's own UI font (Inter).
  "font-src 'self' data: https://*.sanity.io",
  // Sanity Studio (app/admin/studio, admin-gated) is bundled and served
  // from this same origin, but its runtime data/asset calls go to Sanity's
  // cloud — *.sanity.io covers api.sanity.io (content) and cdn.sanity.io
  // (images), wss:// is its realtime collaborative-editing connection, and
  // sanity-cdn.com is a separate domain Studio pings in the background to
  // check for package updates (harmless if blocked, but noisy in the
  // console — allowed here to keep that quiet).
  "connect-src 'self' https://calendly.com https://*.calendly.com https://conversations-widget.brevo.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://www.google.com https://*.sanity.io wss://*.sanity.io https://sanity-cdn.com",
  // 'self' — Sanity's Presentation tool (the live-preview split view in
  // Studio) loads the actual site in an iframe on the same origin (e.g. to
  // hit /api/draft-mode/enable) to power click-to-edit; without 'self'
  // here that same-origin iframe load is blocked exactly like a
  // third-party one would be.
  "frame-src 'self' https://calendly.com https://conversations-widget.brevo.com https://www.googletagmanager.com",
  // GA4's own script spins up a background Web Worker via a blob: URL;
  // with no worker-src set this falls back to script-src, which doesn't
  // permit blob: workers — set explicitly rather than relying on fallback.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.sibforms.com",
  // 'self' (not 'none'): Studio framing the live site for preview (see
  // frame-src above) only works if the framed page itself also permits
  // being framed by its own origin. External sites still can't frame us
  // either way — this only opens same-origin framing, not third-party.
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    // Off by default in Next.js since an SVG can embed a <script>; the
    // client-logo wall includes a vector logo (Tasmanian Leaders), so this
    // is scoped down with Next's own documented mitigation: served SVGs get
    // their own locked-down CSP (no script execution) and are forced to
    // download rather than navigate-to directly, regardless of this app's
    // own page-level CSP above.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Homepage logo grids render Sanity-hosted images through next/image
    // (app/(marketing)/page.tsx); next/image refuses any host not listed
    // here. Scoped to Sanity's image path only, not the whole CDN host.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.sanity.io", pathname: "/images/**" },
    ],
  },
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
          // SAMEORIGIN (not DENY): matches the CSP frame-ancestors 'self'
          // change above, for browsers that honor X-Frame-Options over/
          // instead of CSP's frame-ancestors. Sanity Studio's Presentation
          // tool needs to frame the live site from the same origin;
          // third-party sites still can't frame us either way.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
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
