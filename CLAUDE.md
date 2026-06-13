# CLAUDE.md

## Purpose

This repository is a Next.js App Router client portal for YouMimic, built with TypeScript, Prisma, Neon PostgreSQL, Auth.js/NextAuth, Zod, Resend/email templates, and shadcn UI.[1]

Your job is to continue the project from its current state without re-litigating already-set foundations or inventing a new architecture.[2]

## Permanent rules

- Use TypeScript everywhere.
- Preserve the App Router structure already in the repository.
- Reuse the current project conventions before introducing new abstractions.
- Do not perform broad architectural rewrites unless explicitly asked.
- Do not delete or replace existing auth, Prisma, validation, or email infrastructure without a concrete reason observed in the code.
- Use environment variables for secrets and deploy-specific configuration.
- Do not hardcode secrets, tokens, base URLs, or credentials.
- Prefer small, reviewable changes over large sweeping refactors.[3][1]

## Project structure expectations

Work within the existing top-level structure unless there is a compelling reason not to:

- `app/` for routes, layouts, pages, API routes, and generated Prisma client output.
- `components/` for reusable UI and app components.
- `emails/` for mail templates and email-related components/config.
- `lib/` for auth helpers, mailer logic, validation, Prisma access, and utilities.
- `middleware/` and/or root middleware-related files for route protection behavior.
- `prisma/` for schema and migrations.
- `public/` for static assets and public documents.

Use the existing alias/import patterns already present in the codebase.

## Existing repository signals

The repository already contains strong evidence of these established areas:

- `auth.ts`
- `next-auth.d.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/api/register/route.ts`
- `app/api/verify-email/route.ts`
- `lib/auth/register-user.ts`
- `lib/validations/auth.ts`
- `emails/templates/*`
- `prisma/schema.prisma`
- `middleware` folder / middleware-related structure

Treat these as first-class existing systems to inspect and extend rather than replace blindly.[4]

## Working method

For any substantial task, follow this sequence:

1. Inspect the relevant files first.
2. Summarize the current implementation and any gaps.
3. Make a short plan.
4. Implement the smallest coherent milestone.
5. Verify the result with commands and route-level checks.
6. End with a concise summary of files changed, what was done, and what remains.[5][6][7]

If a prompt conflicts with the live codebase, the live codebase wins after inspection.[2]

## Scope discipline

Do not treat this project like a blank slate.

If a feature already exists in some form, extend or refine it.
If a feature does not exist, implement it in a way that matches current patterns.
If a task is too broad, split it into milestones and finish one milestone completely before starting the next.[8][9]

## UI expectations

When building authenticated product UI, use shadcn UI components and keep layouts stable across mobile and desktop breakpoints.[10]

When working on the dashboard shell, support light and dark mode with system default behavior, and keep the layout resilient during scaling.[11]

Prefer a clean app-shell approach using route groups/layouts over ad hoc duplicated wrappers, as long as it matches the current repository structure.[12][11]

## Auth and security expectations

Preserve the existing auth flow unless a concrete issue is found during inspection.[3][1]

Do not create parallel login/signup patterns if the project already uses Auth.js/NextAuth credentials flow.[4]

Keep validation aligned with the existing Zod schemas unless requirements explicitly change.[3][13]

Never expose API keys, secrets, or service credentials to the client.[1]

## Verification requirements

Before considering any milestone complete, run the relevant checks and report the result:

```bash
npm run lint
npm run typecheck
npm run build
```

If one of these scripts does not exist, inspect `package.json`, use the closest equivalent, and explicitly report the substitution.[5]

For UI work, also verify the affected route renders and basic interactions work.
For auth or middleware work, verify protected-route behavior and negative cases, not only the happy path.[5][7]

## Output expectations for each session

At the end of each session, always provide:

- what was inspected,
- what changed,
- files changed,
- checks run and their results,
- unresolved issues,
- recommended next milestone.

If the session changes the current project state materially, update `HANDOFF.md` before stopping.[9][14]
