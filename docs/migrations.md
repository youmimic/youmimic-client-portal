# Database Migration Workflow

Prisma migrations follow a PR gate, then a **separate, explicit, approved
production step**. Nothing migrates a database as a side effect of building,
merging or deploying. This document is the authoritative reference.

---

## Quick reference

```
Edit schema → create migration against an ISOLATED database → commit both
  → PR guard + CI (no database) → merge → Vercel builds (no migrations)
  → [approval] run "Apply Prisma Migrations (Production)" by hand
```

Changed on 2026-11-23. Before that, `npm run build` ran `prisma migrate deploy`
on every Vercel deployment (Preview included), and the production workflow ran
automatically on every push to `main` that touched `prisma/migrations/`. A
Preview build of any pushed branch could therefore migrate production if its
`DIRECT_URL` pointed there. Both automatic paths were removed;
`scripts/build-safety.test.ts` fails if either comes back.

---

## Local development

### ⚠ `.env` points at the live database

The local `.env` holds the production `DATABASE_URL` / `DIRECT_URL`, and
`prisma.config.ts` loads `.env`. **Any Prisma CLI command run with the default
config (`migrate dev`, `migrate deploy`, `migrate reset`, `db push`) targets
production.** `migrate dev` can offer to reset the database. Don't run them.

### Isolated local database (verified 2026-11-23)

```bash
# Start a local Postgres (PGlite, no account, nothing leaves the machine)
npx prisma dev --name youmimic-isolated --detach
npx prisma dev ls     # shows its URL, by default on localhost:51214

# prisma.isolated.config.ts never reads .env and refuses any non-localhost URL
export ISOLATED_DATABASE_URL="postgres://postgres:postgres@localhost:51214/template1?sslmode=disable"
npx prisma migrate status --config prisma.isolated.config.ts
npx prisma migrate deploy --config prisma.isolated.config.ts
```

### Creating a migration

1. Edit `prisma/schema.prisma`.
2. With the isolated database migrated to the current history, generate the
   SQL from the difference and save it as a new migration:

   ```bash
   mkdir -p prisma/migrations/<YYYYMMDDHHMMSS>_<change_name>
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma \
     --script --config prisma.isolated.config.ts \
     > prisma/migrations/<YYYYMMDDHHMMSS>_<change_name>/migration.sql
   npx prisma migrate deploy --config prisma.isolated.config.ts   # apply locally
   npx prisma generate
   ```

   Never edit a migration that has already been applied anywhere; add a new
   one instead.
3. Review the SQL: enum/type changes use `ALTER COLUMN TYPE ... USING`;
   `NOT NULL` columns on non-empty tables have a backfill default; no
   unintended `DROP`.
4. Commit `schema.prisma` and the migration together.

The app itself uses Neon's serverless driver, so it can't run against the
local database. Service-level checks against it live in
`lib/projects/isolated-db.integration.test.ts` (skipped unless
`ISOLATED_DATABASE_URL` is set). Running the whole app on isolated data needs
a Neon development branch (see `updates/2026-11-23-slide-narration-scenes.md`).

### Neon dev branch (full-app testing on a copy of production's schema)

1. In the Neon console, create a branch from production (schema-only, or with anonymised data).
2. Put that branch's **pooled** connection string as `DATABASE_URL` in `.env.local`. The app reads it ahead of `.env`. At runtime only `DATABASE_URL` is used, so the app talks to the branch.
3. Migrate with `prisma.branch.config.ts`. It reads only `.env.local`, uses the branch's direct endpoint, and refuses production's endpoint:

   ```bash
   npx prisma migrate status --config prisma.branch.config.ts
   npx prisma migrate deploy --config prisma.branch.config.ts
   ```

   **Never** run plain `npx prisma migrate ...` here: `prisma.config.ts` reads `DIRECT_URL` from `.env`, which is production.
4. A **schema-only** branch copies the tables but not the rows of `_prisma_migrations`, so every migration shows as pending. Before deploying, mark the migrations production has already applied as applied on the branch: `npx prisma migrate resolve --applied <name> --config prisma.branch.config.ts`, once per migration. Then `migrate deploy` applies only the new ones.
5. Check: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --config prisma.branch.config.ts` should print an empty migration.

---

## PR guard (GitHub Actions)

`.github/workflows/check-prisma-migration.yml` runs on every PR to `main`.

**It fails the PR if** `prisma/schema.prisma` changed and nothing under
`prisma/migrations/` changed in the same PR.

**It warns (but does not block) if** a changed migration file contains
`DROP TABLE`, `DROP COLUMN`, `DROP TYPE`, `TRUNCATE`, or `DELETE FROM`.

`.github/workflows/ci.yml` runs lint, typecheck, unit tests and a build with
inert placeholder environment values. It never connects to a database.

---

## Application builds never migrate

`package.json`: `"build": "prisma generate && next build"`.

`prisma generate` only writes the TypeScript client from the schema; it
doesn't connect to a database. Vercel, CI and local builds therefore compile
only. Deploying new application code does **not** change the database
schema: apply the matching migrations first (below), in the agreed order.

Not verifiable from the repository: Vercel's dashboard **Build Command**
setting. It must be `npm run build` (the default) or `next build`, never a
command that includes `prisma migrate`.

---

## Production migrations (explicit, approved release step)

`.github/workflows/prisma-migrate-prod.yml`, **"Apply Prisma Migrations
(Production)". This changes the production database.** Never run it casually.

- Started only by hand: GitHub → Actions → Apply Prisma Migrations
  (Production) → Run workflow.
- Runs only from the `main` branch.
- Requires typing exactly `apply production migrations`.
- Uses the `production` GitHub environment's `DIRECT_URL` secret. Add
  required reviewers to that environment for a second approval (whether this
  is configured isn't visible from the repository).
- Steps: `npm ci` → `npx prisma generate` → `npx prisma migrate status`
  (read-only, records what's pending) → `npx prisma migrate deploy`.

Before running it: get explicit approval, confirm the pending list matches
the release plan, and read the release checklist for that change.

### `migrate deploy` vs `migrate dev`

| Command | Use | Never against |
|---|---|---|
| `prisma migrate dev` | Not used (it can reset a database) | Production |
| `prisma migrate diff` | Generating SQL against the isolated database | (read-only) |
| `prisma migrate deploy` | Isolated database (`--config prisma.isolated.config.ts`), or production via the manual workflow only | Production from a laptop |

---

## Required secrets and environment variables

### GitHub

| Secret | Where | Value |
|---|---|---|
| `DIRECT_URL` | Environments → production → Secrets | Direct (non-pooled) Neon connection string |

### Vercel (runtime)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Neon connection used by the app at runtime |
| `DIRECT_URL` | Read by `prisma.config.ts`. No longer needed by the build, which doesn't migrate |

Preview deployments must not use production values; see the isolated
preview plan in `updates/2026-11-23-slide-narration-scenes.md`.

---

## Node version

All GitHub Actions workflows use **Node 22**.

---

## What to do when a migration fails in production

1. Read the "Apply Prisma Migrations (Production)" run log for the SQL error.
2. Don't revert or edit the migration file: `_prisma_migrations` may hold a
   partial record.
3. Fix the data or SQL issue, then:
   - never recorded: fix with a new migration and re-run the workflow;
   - recorded as failed: `prisma migrate resolve` after manual remediation,
     itself an approved production step.
4. For handwritten enum conversions, use the pre-flight
   `DO $$ ... RAISE EXCEPTION` validation pattern from the June 2026
   `add_booking_payment_status_and_payment_enums` migration.
