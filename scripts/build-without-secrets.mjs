// Runs `npm run build` with NO real credentials, mirroring .github/workflows/
// ci.yml. Use it to check a build locally without production access.
//
//   node scripts/build-without-secrets.mjs
//
// How: every key in .env (names only; values are never read into the build
// or printed) is overridden. Keys CI also sets get the same inert placeholder;
// all others are set to "", which @next/env treats as unset AND does not
// refill from .env (its reset step deletes empty variables, then only loads
// .env keys absent from the original environment). Prisma's config uses
// dotenv, which never overrides a variable that already exists, so it sees
// the placeholders too. Next.js telemetry and Prisma update checks are off.
//
// Still reaches the network: next/font/google downloads public font files.
// It refuses to run if the build script ever regains a migration command.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (/prisma\s+(migrate|db\s+(push|execute|seed))/i.test(pkg.scripts.build ?? "")) {
  console.error("Refusing: the build script changes a database. See docs/migrations.md.");
  process.exit(1);
}

// Same inert values as ci.yml (none are real credentials).
const PLACEHOLDERS = {
  DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
  DIRECT_URL: "postgresql://ci:ci@localhost:5432/ci",
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_MRR_LIVE_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_dummy",
  STRIPE_CREATOR_PRICE_ID: "price_dummy",
  STRIPE_ENTERPRISE_PRICE_ID: "price_dummy",
  STRIPE_AVATAR_CAPTURE_PRICE_ID: "price_dummy",
  STRIPE_AVATAR_STORAGE_PRICE_ID: "price_dummy",
  NEXTAUTH_SECRET: "ci-dummy-secret-value-not-real",
  AUTH_SECRET: "ci-dummy-secret-value-not-real",
  NEXTAUTH_URL: "http://localhost:3000",
  RESEND_API_KEY: "re_dummy",
  HEYGEN_API_KEY: "dummy",
  HEYGEN_WEBHOOK_SECRET: "dummy",
  BASE_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  DASHBOARD_PATH: "/dashboard",
  CONTACT_EMAIL: "ci@example.com",
  NEXT_PUBLIC_ACCOUNTS_EMAIL: "ci@example.com",
  NEXT_PUBLIC_ENTERPRISE_EMAIL: "ci@example.com",
  NEXT_PUBLIC_SALES_EMAIL: "ci@example.com",
  EMAIL_FROM: "ci@example.com",
  LOG_LEVEL: "info",
  CRON_SECRET: "dummy",
  // The Sanity client validates these when its module loads during build
  // (createClient throws without a projectId). Inert values; no CMS request
  // is made at build time.
  NEXT_PUBLIC_SANITY_PROJECT_ID: "cidummy",
  NEXT_PUBLIC_SANITY_DATASET: "ci",
};

let envKeys = [];
try {
  envKeys = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
    .filter(Boolean);
} catch {
  // No .env: nothing to mask.
}

const env = { ...process.env };
for (const key of new Set([...envKeys, ...Object.keys(PLACEHOLDERS)])) env[key] = PLACEHOLDERS[key] ?? "";
Object.assign(env, { NEXT_TELEMETRY_DISABLED: "1", CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" });

console.log(`Masked ${new Set([...envKeys, ...Object.keys(PLACEHOLDERS)]).size} environment keys; running: npm run build`);
const result = spawnSync("npm", ["run", "build"], { env, stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
