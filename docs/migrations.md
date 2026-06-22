# Database Migration Workflow

Prisma migrations for this project follow a strict PR-gate → CI-apply
pattern. This document is the authoritative reference for the full flow.

---

## Quick reference

```
Edit schema  →  migrate dev  →  commit both  →  PR guard  →  merge  →  GHA applies to prod
```

---

## Local development

### 1. Edit `prisma/schema.prisma`

Make your model or enum changes in the schema file.

### 2. Generate the migration

```bash
npx prisma migrate dev --name <change-name>
```

Use a short, lowercase, underscore-separated name that describes the change:

```bash
npx prisma migrate dev --name add_user_display_name
npx prisma migrate dev --name add_booking_payment_status
npx prisma migrate dev --name make_avatar_enterprise_nullable
```

This command:
- Connects to the database via `DIRECT_URL` (from `.env`)
- Generates a new timestamped directory under `prisma/migrations/`
- Applies the migration to your local/dev database
- Regenerates the Prisma TypeScript client

### 3. Commit both files together

```bash
git add prisma/schema.prisma
git add prisma/migrations/
git commit -m "migration: <change-name>"
```

**Never commit `schema.prisma` alone.** The PR guard will block the PR if you do.

### 4. Review the generated SQL before pushing

Open `prisma/migrations/<timestamp>_<name>/migration.sql` and verify:
- Enum/type conversions use `ALTER COLUMN TYPE ... USING` (not DROP+ADD)
- `NOT NULL` columns on non-empty tables have a backfill `DEFAULT`
- No unintended `DROP TABLE` or `DROP COLUMN` statements

If Prisma generated destructive SQL (drop+recreate for an enum change), edit
the migration file manually. See the June 2026 `BookingStatus` migration as an
example of a safely handwritten enum conversion.

---

## PR guard (GitHub Actions)

`.github/workflows/check-prisma-migration.yml` runs on every PR to `main`.

**It fails the PR if:**
- `prisma/schema.prisma` changed in the PR, AND
- nothing under `prisma/migrations/` changed in the same PR.

**It warns (but does not block) if:**
- A changed migration file contains `DROP TABLE`, `DROP COLUMN`, `DROP TYPE`,
  `TRUNCATE`, or `DELETE FROM`.

The guard has no false negatives: if a schema change ships without a migration,
the check catches it before merge.

**Edge case:** If you edit a comment or formatting in `schema.prisma` without
any structural change, the guard will still fire. Options:
- Add a trivial no-op migration (`-- no structural change`), or
- Note in the PR description and have a reviewer approve manually.

---

## Production deployment

### Primary path: GitHub Actions

`.github/workflows/prisma-migrate-prod.yml` triggers on every push to `main`
when any file under `prisma/migrations/**` changed.

Steps:
1. `npm ci` — clean install
2. `npx prisma generate` — regenerate TypeScript client
3. `npx prisma migrate deploy` — apply all pending migrations

This is the **canonical** migration step. It runs before Vercel starts building
the Next.js app (GHA and Vercel deployments are independent parallel processes,
but `migrate deploy` is idempotent and safe to run from both).

### Fallback: Vercel build script (belt-and-suspenders)

`package.json` currently has:

```json
"build": "prisma migrate deploy && next build"
```

This means every Vercel deploy also runs `prisma migrate deploy` as a fallback.
If GHA applies the migration first, Vercel's run sees it already recorded and
skips it. If GHA has not yet run (or failed), Vercel catches it.

**This is intentional redundancy** for the current maturity of the project.
When the team is confident that GHA is reliable and always runs before
user-facing traffic, the build script can be simplified back to `next build`.

### `migrate deploy` vs `migrate dev`

| Command | Use case | Safe in CI/prod? |
|---|---|---|
| `prisma migrate dev` | Local development only | No — prompts for confirmation, resets state |
| `prisma migrate deploy` | CI and production | Yes — applies pending migrations, no prompts |

---

## Required secrets and environment variables

### GitHub

| Secret | Where | Value |
|---|---|---|
| `DIRECT_URL` | Environments → production → Secrets | Direct (non-pooled) Neon connection string |

To add: GitHub → Repository Settings → Environments → `production` →
Environment secrets → New secret.

### Vercel

| Variable | Value |
|---|---|
| `DATABASE_URL` | Pooled Neon connection string (runtime) |
| `DIRECT_URL` | Direct Neon connection string (build-time migrate deploy) |

Both must be set in Vercel → Project Settings → Environment Variables for the
**Production** environment.

Also verify that Vercel's **Build Command** is `npm run build` (not `next build`
directly), so the `package.json` script runs and `prisma migrate deploy` is
included.

---

## Node version

All GitHub Actions workflows use **Node 22**. Node 20 hit a deprecation issue
in GitHub Actions runner images in mid-2025 and should not be used.

The `node-version: 22` setting is explicit in every workflow step that uses
`actions/setup-node@v4`.

---

## What to do when a migration fails in production

1. Check the GitHub Actions run log for the specific SQL error.
2. Do **not** revert the migration file — the `_prisma_migrations` table may
   have a partial record.
3. Fix the data or SQL issue, then:
   - If the migration was never recorded: fix the SQL and re-deploy.
   - If it was recorded as failed: use `prisma migrate resolve` to mark it
     resolved after manual remediation.
4. For handwritten enum-conversion migrations, always run the pre-flight
   `DO $$ ... RAISE EXCEPTION` validation block pattern used in the June 2026
   `add_booking_payment_status_and_payment_enums` migration.
