// Prisma CLI config for a Neon DEV BRANCH only. Reads DATABASE_URL from
// .env.local (never .env, whose URLs are the live database), uses the
// branch's direct (non-pooled) endpoint for migrations, and refuses to run
// if that endpoint is the same as either production URL in .env.
//
//   npx prisma migrate status --config prisma.branch.config.ts
//   npx prisma migrate deploy --config prisma.branch.config.ts
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "prisma/config";

function readEnv(file: string): Record<string, string> {
  try {
    return parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

const endpoint = (url: string | undefined) => {
  try {
    return new URL(url ?? "").hostname.replace("-pooler", "");
  } catch {
    return "";
  }
};

const branchUrl = readEnv(".env.local").DATABASE_URL ?? "";
const prod = readEnv(".env");
const branchEndpoint = endpoint(branchUrl);
const prodEndpoints = [endpoint(prod.DATABASE_URL), endpoint(prod.DIRECT_URL)].filter(Boolean);

if (!branchEndpoint.endsWith(".neon.tech")) {
  throw new Error(".env.local DATABASE_URL must be a Neon branch URL. Refusing to run.");
}
if (prodEndpoints.length === 0 || prodEndpoints.includes(branchEndpoint)) {
  throw new Error(".env.local DATABASE_URL is the production endpoint (or .env is missing). Refusing to run.");
}

// Migrations need a direct connection, not the pooler.
const direct = new URL(branchUrl);
direct.hostname = branchEndpoint;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: direct.toString() },
});
