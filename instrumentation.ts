import { EventEmitter } from "node:events";
import * as Sentry from "@sentry/nextjs";

// Sentry's Node SDK (via its OpenTelemetry-based HTTP instrumentation)
// attaches a "close" listener per request/response — a long-standing,
// widely-reported Sentry SDK behavior (getsentry/sentry-javascript#3247,
// open since 2021), not something specific to this app. In dev mode,
// Turbopack's hot-reload re-runs this file on every file change, and each
// reload adds another listener without removing the previous one, so the
// count climbs past Node's default cap of 10 and logs
// MaxListenersExceededWarning. It's a diagnostic warning, not a real leak —
// production only starts the server once per deployment (no hot-reload
// loop), so this doesn't accumulate there the way it does in dev. Raising
// the cap here just silences the noise; it doesn't address Sentry's root
// cause, which isn't something this app's code can fix.
EventEmitter.defaultMaxListeners = 20;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
