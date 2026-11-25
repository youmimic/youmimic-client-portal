// Prisma CLI config for an ISOLATED local database only (for example
// `npx prisma dev`). Deliberately does not load .env, whose DIRECT_URL is
// the live database, and refuses any non-local host, so a migration run
// with this config can never touch production.
//
//   ISOLATED_DATABASE_URL=postgres://postgres:postgres@localhost:51214/template1?sslmode=disable \
//     npx prisma migrate deploy --config prisma.isolated.config.ts
import { defineConfig } from "prisma/config";

const url = process.env.ISOLATED_DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error("ISOLATED_DATABASE_URL must point at localhost. Refusing to run against any other database.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
