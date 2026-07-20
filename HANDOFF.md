# HANDOFF.md

## Session: Admin Subscriptions module (Phases 1–3, read-only) — 2026-07-20

### What was inspected before implementing

Given a detailed implementation prompt for this module, inspected the live codebase before writing anything, per this repo's own working method:

- `prisma/schema.prisma` — confirmed `Subscription.stripeCustomerId` is non-unique (plain index only, from an earlier session this same day), `stripeSubscriptionId` is the sole unique per-subscription key, and `AdminRole` is `SUPER_ADMIN | ADMIN | BILLING_ADMIN`.
- `lib/admin/rbac.ts` — found that **`BILLING_ADMIN` currently grants zero capability anywhere in the app**: it's ranked below `ADMIN` in the role hierarchy, and every existing `canView*`/`canManage*` helper requires `ADMIN` minimum. The `(admin)` route group layout only checks "has *any* adminRole" to allow shell access, so a `BILLING_ADMIN` could already see the sidebar but every page blocked them. Flagged this to the user before proceeding — the answer: this module is `BILLING_ADMIN`'s first real capability (view-only).
- `app/api/admin/enterprises/route.ts`, `app/api/admin/bookings/route.ts` and `[id]/route.ts` — confirmed the canonical list/detail response shapes (`items`/`page`/`pageSize`/`totalItems`/`totalPages` for lists; explicit `select`, ISO-stringified dates, and an `adminLog.findMany({entityType, entityId})` query for the detail page's audit section).
- `app/(dashboard)/dashboard/billing/page.tsx` — found this page **already surfaces payment-failure state to customers** (a `StatusBadge` with distinct amber/red styling for `PAST_DUE`/`UNPAID`) — corrects an assumption in the original prompt that this wasn't surfaced anywhere yet. It just wasn't surfaced in *admin* UI. Extracted this page's badge logic into a shared component instead of duplicating it (see below).
- `lib/admin/audit.ts` — no `SUBSCRIPTION` entity type existed yet.
- Confirmed no code anywhere in the app calls `stripe.subscriptions.retrieve/cancel/update` — a live-Stripe-write action (sync/cancel) would be genuinely new ground, not an established pattern. Flagged this too.

### Scope decision

Two things were confirmed with the user before implementing, given the prompt's own instruction to stop and ask on real ambiguity:
1. **`BILLING_ADMIN` can view subscriptions** (its first real permission in this app); managing (once a write action exists) stays at `ADMIN` minimum, matching every other write permission in the codebase.
2. **v1 stops at Phase 3 (read-only)** — no `sync`/`cancel` write actions. Given zero precedent for live Stripe subscription mutations anywhere in this codebase, that's a deliberately separate, later piece of work.

### What changed

1. **`components/billing/status-badges.tsx`** (new) — `PlanBadge`, `StatusBadge` (subscription status), `PaymentStatusBadge` extracted out of the customer billing page so the admin module reuses the exact same colors/labels instead of a second, potentially-drifting copy.
2. **`app/(dashboard)/dashboard/billing/page.tsx`** — updated to import the extracted badges; no behavior change (output-identical).
3. **`lib/admin/rbac.ts`** — added `canViewSubscriptions` (`BILLING_ADMIN` minimum). No `canManageSubscriptions` yet — deliberately not adding a permission helper for a write surface that doesn't exist.
4. **`lib/admin/audit.ts`** — added `SUBSCRIPTION: "subscription"` to `ENTITY_TYPES`, same "registered ahead of the write action that will use it" pattern as `BOOKING` before Phase B2.
5. **`lib/validations/admin.ts`** — added `listSubscriptionsQuerySchema`, reusing the already-exported `PLAN_TYPES`/`SUBSCRIPTION_STATUSES` constants (added `BILLING_OWNER_TYPES` for the owner-type filter, mirroring `BillingOwnerType`).
6. **`app/api/admin/subscriptions/route.ts`** (new) — `GET`, paginated/searchable/filterable list. Search matches `stripeSubscriptionId`, `stripeCustomerId`, owner email, or enterprise name — a list filter, not a single-record lookup, so matching multiple rows against a non-unique `stripeCustomerId` is correct, not a violation of the "never identify by customer ID alone" rule (that rule is about detail/action routes, which are keyed on `Subscription.id`).
7. **`app/api/admin/subscriptions/[id]/route.ts`** (new) — `GET` detail: identifiers, plan/status/ownership, linked user or enterprise summary, up to 20 recent `Payment` rows, up to 20 recent audit log rows (empty today, same reasoning as `SUBSCRIPTION` entity type above).
8. **`components/admin/admin-shell.tsx`** — added "Subscriptions" nav item (not role-gated at the shell level, matching how every other nav item works — RBAC is enforced at the page/route level).
9. **`app/(admin)/admin/subscriptions/page.tsx`** (new) — client list page: debounced search, status/plan/owner-type filters, pagination — same structural pattern as `admin/users` and `admin/enterprises`.
10. **`app/(admin)/admin/subscriptions/[id]/page.tsx`** (new) — server-rendered detail page: Subscription Summary, Ownership, Billing Identifiers, Recent Payments, Audit Log — same pattern as `admin/enterprises/[id]` and `admin/bookings/[id]`.

### What did NOT change

- No write/action routes (`sync`, `cancel`) — explicitly out of scope for this pass.
- No `canManageSubscriptions` RBAC helper — nothing to gate yet.
- No changes to `stripeCustomerId`/`stripeSubscriptionId` handling, no new admin flow identifies or mutates a subscription by `stripeCustomerId` alone.
- No schema changes at all — this module is 100% additive on the existing `Subscription`/`Payment`/`AdminLog` tables.

### Checks run

```
npm run lint      → 0 errors, 2 pre-existing warnings (unchanged)
npm run typecheck → clean
npm run build     → clean; 4 new routes: /admin/subscriptions, /admin/subscriptions/[id],
                     /api/admin/subscriptions, /api/admin/subscriptions/[id]
```

### Manual verification (Playwright, headless Chromium)

- Logged in as an existing `SUPER_ADMIN` test account, confirmed the nav link, list page, filters, and detail page all render with zero console errors.
- **Directly verified the core correctness requirement this module exists for**: searched the list by a `stripeCustomerId` shared by two concurrent subscriptions (from the earlier reconciliation backfill) — correctly returned both as two distinct rows with two distinct `stripeSubscriptionId`s, both properly attributed to their owning enterprise. Confirms the list/detail routes handle the non-unique-customer-ID reality correctly.
- Detail page correctly renders all 5 sections (Summary, Ownership, Billing Identifiers, Recent Payments, Audit Log) with correct data for both a user-owned and an enterprise-owned subscription.

### Unresolved issues

1. No `sync`/`cancel` write actions — deliberately deferred (see scope decision above). Recommended order per the original prompt if/when this is picked up: `sync` (safest, read-from-Stripe-only) before `cancel`.
2. `canManageSubscriptions` doesn't exist yet — add it alongside the first write route, not before.
3. The existing `enterprises` list/detail routes and the customer billing page still use a `subscriptions: { take: 1, orderBy: desc }` "most recent only" simplification predating multi-subscription-per-customer support — not a bug, but the new Subscriptions module is now the only place an admin can see *all* of an enterprise's concurrent subscriptions at once. Worth knowing when support requests come in about a discrepancy between what the Enterprises page summarizes and what Subscriptions shows in full.

### Recommended next milestone

Payment-failure visibility as a dedicated admin surface (flagged as a possible next step in the previous session) now has a natural home — the Subscriptions list already filters by `status`, so `PAST_DUE`/`UNPAID` are already one filter click away. A first small addition could be a "needs attention" default view or count, without yet building the `sync`/`cancel` write actions.

---

## Session: Stripe subscription reconciliation — 2026-07-20

### What was inspected

- `prisma/schema.prisma` — `Subscription.stripeCustomerId` was `@unique`, which assumes one Stripe customer can hold at most one subscription. A round of manual reconciliation against a Stripe export (12 historical subscriptions, done earlier this session outside the repo) surfaced a real account where that assumption doesn't hold: one legacy Stripe customer has two concurrent active subscriptions (a base plan plus a separate seats add-on).
- `app/api/stripe/checkout-session/route.ts` — confirmed the app's own checkout flow only ever creates **one** `Subscription` row per user/enterprise (it reuses an existing row's `stripeCustomerId` on repeat checkouts rather than creating a second). The two-concurrent-subscriptions case can currently only arise from legacy/external data, not from the app's own purchase flow — useful scoping context for why this hadn't surfaced before.
- `app/api/stripe/webhook/route.ts` — all four handlers (`handleCheckoutCompleted`, `handleSubscriptionUpsert`, `handleInvoicePaid`, `handleInvoiceFailed`) matched local rows by `stripeCustomerId` alone. Relaxing the uniqueness constraint without fixing this would have meant any webhook event for a multi-subscription customer silently overwrote *every* subscription that customer owns with one event's data — a live-data-corruption bug, not just a schema gap.
- `app/api/admin/enterprises/[id]/transfer-owner/route.ts` — the existing admin "transfer ownership" feature: requires the new owner to already be a member of the enterprise, flips only `Enterprise.ownerUserId`, and does **not** touch either party's `EnterpriseMember.roleId`. Replicated this exact behavior in the backfill script below rather than inventing a "cleaner" version — the former owner's membership row still shows `role: owner` after transfer, which is a pre-existing quirk of the real feature, not something introduced here.
- `node_modules/stripe` (v22) type definitions — confirmed `Invoice.subscription` moved to `invoice.parent.subscription_details.subscription` in this API version; used to fix the invoice-side webhook handlers.

### What changed

1. **`prisma/schema.prisma`** — additive/relaxing only:
   - `User.stripeEmail String?` — records a known Stripe billing email for an account when it differs from the portal login email, without asserting they're provably the same identity. Same lightweight pattern as the earlier `heygenUserId` field.
   - `Subscription.stripeCustomerId` — dropped `@unique`, added a plain `@@index([stripeCustomerId])` in its place so webhook lookups stay indexed. `stripeSubscriptionId` (already unique) is now the sole per-subscription identity key.
   - Migration `20260720034315_add_stripe_email_and_relax_customer_uniqueness` — verified: one `DROP INDEX` (the old unique constraint), one `ADD COLUMN` (nullable), one `CREATE INDEX` (plain, replacing it). No data loss, no column drops.

2. **`app/api/stripe/webhook/route.ts`** — all four handlers now resolve the specific `stripeSubscriptionId` first and only fall back to `stripeCustomerId` for the still-unlinked placeholder row created at checkout time:
   - `handleCheckoutCompleted` — matches `stripeCustomerId` + (`stripeSubscriptionId IS NULL` or already equal to the incoming one), instead of blind `stripeCustomerId` alone.
   - `handleSubscriptionUpsert` — tries `stripeSubscriptionId` first; only falls back to the customer's unlinked placeholder row if no match (first activation).
   - `handleInvoicePaid` / `handleInvoiceFailed` — added `invoiceSubscriptionId()` helper (Stripe v22's `invoice.parent.subscription_details.subscription`), matches by that when present.

3. **One-off data backfill** (script not committed — see "What did NOT change") applied directly against the database:
   - Recorded a known Stripe billing email on one existing account's new `stripeEmail` field.
   - Transferred ownership of one enterprise from its original HeyGen-derived owner to a newly created account matching who actually pays the Stripe bill (using the same precondition — new owner must already be a member — as the real transfer-ownership feature). The original owner remains a member.
   - Created one new enterprise plus its owner account for a legacy Stripe customer who runs a small B2B setup (multiple concurrent avatar subscriptions billed to one card, purchased under separate Stripe customers).
   - Backfilled 7 `Subscription` rows for the currently-active legacy Stripe subscriptions that now cleanly resolve to an owner (2 enterprise-owned rows sharing one Stripe customer — exactly the case the schema change above exists for; 3 more enterprise-owned rows for the B2B account, each its own distinct Stripe customer; 2 individually-owned rows for existing accounts). Each insert is idempotent on `stripeSubscriptionId`.
   - The remaining 5 rows from the source export (all canceled, none with an existing portal account) were intentionally left out of this pass — they don't affect current billing state. Full detail in `updates/`.

### What did NOT change

- No GoCardless integration — confirmed out of scope; that pilot-phase system is being closed and its customers ported to Stripe, so no schema work was done for it.
- No new avatar/user accounts were created for two people named on the B2B account's other subscriptions — no email address exists for them anywhere in the source data, so nothing was invented. Flagged as an open item below.
- The backfill script itself is not committed to the repo — like the earlier HeyGen import, it embeds real customer emails and was run once from a scratch location, not added as a reusable tool.
- No `AdminLog` entries were written for the ownership transfer or account creation — this was a direct data backfill, not a live admin action through the app, consistent with how the earlier HeyGen import was handled.

### Checks run

```
npm run lint      → 0 errors, 2 pre-existing warnings (unchanged)
npm run typecheck → clean
npm run build     → clean
```

### Verification

- Dry-run first (transaction opened, every insert/update logged, then rolled back) — matched the intended plan exactly before anything was committed.
- Re-ran for real; committed transaction.
- Read-only follow-up confirmed: enterprise ownership transferred correctly (former owner retained as member), the new B2B enterprise and its 3 subscriptions all resolve correctly, the two pre-existing test subscription rows were untouched, and all 7 new subscription rows show the expected owner/status/plan.

### Unresolved issues

1. Two people named on the B2B account's other subscriptions have no accounts — no email address available for either. Needs that contact info before accounts can be created.
2. Test passwords (carried over from the earlier HeyGen import's convention) are still a standing exposure for every backfilled account — rotate before real use.
3. The 5 canceled/churned Stripe rows from the export were not backfilled at all. Revisit if historical billing audit trail is ever needed.
4. The known billing-email field (`User.stripeEmail`) is a manually-set, unindexed note — fine for this backfill, but if it's ever used programmatically (e.g. auto-matching future imports), it should get a uniqueness constraint and validation first.

### Recommended next milestone

Payment-failure visibility (mentioned this session but explicitly scoped out of it) — the webhook already flips a subscription to `PAST_DUE` on `invoice.payment_failed`, so the raw signal exists; it's just not surfaced anywhere in the admin or customer UI yet. Would need Stripe's invoice-level export (not just subscription-level) to reconstruct historical failures accurately.

---

## Session: HeyGen workspace member import — 2026-07-20

### What was inspected

- `prisma/schema.prisma` — `User` (email unique, `passwordHash`, `emailVerified`, `adminRole`), `Enterprise` (single `ownerUserId`), `EnterpriseMember` (`enterpriseId` + `userId` + `roleId`, unique per pair). Only two `Role` rows exist in practice: `"owner"` and `"member"` (both upserted lazily by `lib/auth/register-user.ts` / `app/api/invites/route.ts`).
- `lib/auth/register-user.ts` — the only prior place `Enterprise` + owner `EnterpriseMember` get created together (BUSINESS signup path); used as the reference shape for this import instead of inventing new membership logic.
- Confirmed there is no admin "create user directly" endpoint and no prior `scripts/` import convention in this repo — this session's data load was a new one-off pattern, not a rename of existing tooling.
- Ran a read-only check against the live DB before writing anything: of 17 candidate accounts from the source CSV, exactly 1 already existed (an internal account, `adminRole: SUPER_ADMIN`, created 2026-06-28) — left untouched per explicit instruction, since overwriting an existing higher-privilege account's password/role was out of scope.

### What changed

1. **`prisma/schema.prisma`** — additive only:
   - `User.heygenUserId String?` — external HeyGen workspace-member ID, for reconciling accounts ahead of a future HeyGen API integration. Not used for auth.
   - `Enterprise.heygenWorkspaceId String?` — raw HeyGen workspace identifier (e.g. `"YM502_Concinnity"`), kept alongside the cleaned `Enterprise.name` display value.
   - Migration `20260720011706_add_heygen_linkage_fields` — verified pure `ALTER TABLE ... ADD COLUMN` (nullable, no default), zero data-loss risk, zero impact on existing rows.

2. **Data import (run once, not committed as a script — see below)** — created:
   - 2 internal `AdminRole=SUPER_ADMIN` users (mapped from HeyGen's own-workspace "Super Admin"/"Developer" rows, per explicit instruction to treat the HeyGen org's own team as admin accounts rather than a client enterprise).
   - 10 client `Enterprise` rows (one per HeyGen workspace, `heygenWorkspaceId` set to the raw workspace string, `name` cleaned of the `YM###_` prefix).
   - 16 new `User` rows total across owners + members, each: `passwordHash` = bcrypt hash (cost 12) of a fixed test password, `emailVerified: true` (no verification email sent — explicit instruction not to notify anyone), `heygenUserId` set from the CSV's per-member ID where present (one invited-but-not-yet-active HeyGen member had none).
   - 15 `EnterpriseMember` rows (10 owners + 5 additional members), reusing the existing `"owner"`/`"member"` roles.
   - One user intentionally ended up with both `adminRole=SUPER_ADMIN` (owner-tier internal account) and ownership of one client enterprise — that person appeared in both groups in the source data; confirmed with the user before creating rather than silently picking one.
   - Where a HeyGen workspace had two members with no owner distinction in the source data, the first-listed row per workspace became `Enterprise.ownerUserId` (explicit tie-break, confirmed with the user).

### What did NOT change

- The one pre-existing account matched by the CSV — completely untouched (no password/role/name overwrite).
- No emails, notifications, or invite records were sent or created — accounts are set up silently, per instruction.
- No new API route or reusable admin "bulk import" UI was built — this was a single data-migration pass, not a feature.
- The import script itself (and the source CSV, which contains real client PII — names, emails) was run from a scratchpad location and **not committed to the repository**. Only the schema/migration change is committed. If this needs to become a repeatable process (e.g. for ongoing HeyGen sync), it should be rebuilt as a proper, non-PII-hardcoded, CSV-driven script — flagged below as a candidate next milestone.

### Verification

- Dry-run first (transaction opened, all inserts logged, then rolled back) — output matched the intended plan exactly (16 users, 10 enterprises, 15 memberships, 0 skips) before anything was committed.
- Re-ran for real; committed transaction.
- Read-only follow-up query confirmed: all 16 users exist with `emailVerified=true` and the expected `heygenUserId`/`adminRole` values; all 10 enterprises have the expected `heygenWorkspaceId` and owner; all 15 memberships have the expected role.

### Checks run

```
npm run lint      → 0 errors, 2 pre-existing warnings (unchanged)
npm run typecheck → clean
npm run build     → clean
```

No UI surfaces this data yet beyond what already reads `User`/`Enterprise`/`EnterpriseMember` (admin users/enterprises pages, dashboard) — not separately re-verified this session since no UI code changed.

### Unresolved issues

1. **Test passwords are a standing security exposure** — every imported account currently shares one known password. Fine for short-lived internal testing; must be rotated (forced password reset, or re-invite through the real flow) before any of these accounts are used for anything beyond that.
2. **No repeatable HeyGen sync process** — this was a one-off manual pass over a point-in-time CSV export. A real HeyGen API integration (using the existing `HEYGEN_API_KEY` env var, already present but unused elsewhere in the codebase) would need to handle create/update/de-provision on an ongoing basis, not just an initial backfill.
3. **`heygenUserId`/`heygenWorkspaceId` are unindexed, nullable, free-text fields** — fine for a first pass; add a unique index once the integration actually reads/writes them programmatically, to prevent accidental duplicate linkage.

### Recommended next milestone

If HeyGen integration is the next real feature (not just this backfill), start there: decide the sync direction (HeyGen → portal, portal → HeyGen, or bidirectional), and whether `heygenUserId`/`heygenWorkspaceId` need uniqueness constraints before any automated write path uses them.

---

## Session: Admin Bookings — mark-complete action — 2026-07-20

### What was inspected

- `app/api/admin/bookings/[id]/confirm/route.ts` and `.../cancel/route.ts` (Phase B2b) — the exact shape being replicated: `auth()` → `canManageBookings` RBAC (401/403) → `bookingStatusActionSchema`-validated `{ reason }` body (422) → fetch current status → transition guard (409 per invalid case) → single `booking.update` → `writeAuditLog` → `revalidatePath("/dashboard/bookings")` → `{ success, id, status }`.
- `components/admin/booking-status-actions.tsx` — confirmed the `canConfirm`/`canCancel` gating pattern and the shared `StatusActionDialog` (reason-required, 500-char max) to extend rather than duplicate.
- `lib/admin/rbac.ts` — `canManageBookings` (ADMIN minimum) already covers status transitions generally; no new permission needed for this narrower transition.
- `prisma/schema.prisma` — `BookingStatus` enum (`pending | confirmed | cancelled | completed`) unchanged; `completed` was, per the B2b handoff, still unreachable before this session.

This was the first of the three options the B2b handoff left open ("Mark-complete action... lowest-risk remaining status action") — picked because it has no open product question blocking it, unlike reopen/restore or field-level edits.

### What changed

1. **`app/api/admin/bookings/[id]/complete/route.ts`** (new) — `POST` handler, same shape as `confirm`/`cancel`. Valid transition: `confirmed → completed` only. Guards: 409 "must be confirmed before it can be marked completed" (from `pending`), 409 "cancelled bookings cannot be marked completed", 409 "already completed". Audit action `"complete_booking"`.
2. **`components/admin/booking-status-actions.tsx`** — added `canComplete = status === "confirmed"`, a "Mark as completed" button (shown only when confirmed), and a third `StatusActionDialog` instance reusing the existing reason-required dialog pattern. `postStatusAction`'s `endpoint` union extended to `"cancel" | "confirm" | "complete"`.

### What did NOT change

- No reopen/restore action — still explicitly deferred pending a product decision (per B2b scope note).
- No field-level edits — still blocked on the open "enterprise member (non-owner) booking access" question.
- No RBAC change — `canManageBookings` already gated this.

### Files changed

| File                                                | Status                                      |
| ---------------------------------------------------- | -------------------------------------------- |
| `app/api/admin/bookings/[id]/complete/route.ts`      | Created — POST complete handler              |
| `components/admin/booking-status-actions.tsx`        | Updated — mark-as-completed button + dialog  |

### Checks run

```
npm run lint      → 0 errors, 2 pre-existing warnings (unchanged)
npm run typecheck → clean
npm run build     → clean; new route /api/admin/bookings/[id]/complete ƒ Dynamic
```

### Manual verification

- `npm run start` + unauthenticated `curl -X POST /api/admin/bookings/<id>/complete` → `401 {"error":"Unauthorized"}`, matching the existing `confirm`/`cancel` routes' behavior.
- No admin credentials available in this environment (same limitation noted in every prior admin-phase session), so the live `confirmed → completed` transition and its guards were not exercised end-to-end against real data this session.

### Unresolved issues

Same three carried over from B2b — none touched by this session:
1. Reopen/restore — needs a product decision.
2. Field-level edits — blocked on enterprise member (non-owner) booking access.
3. Enterprise member (non-owner) booking access — long-standing open product question (recurs across ~10 prior sessions).

### Recommended next milestone

With all three status actions (`confirm`, `cancel`, `complete`) now in place, the natural next step is a product decision, not more engineering: resolve the enterprise member (non-owner) booking-access question so field-level edits can be scoped, or decide the reopen/restore policy if that's still wanted.

---

## Session: Admin Bookings Phase B2b — status actions — 2026-07-13

### What was inspected before implementing

- `app/api/bookings/[id]/cancel/route.ts` (customer-facing) — the existing transition guard: `cancelled` is terminal (409 if already cancelled), `completed` bookings cannot be cancelled (409). Reused this exact guard logic for the admin override rather than inventing new rules.
- `components/dashboard/booking-actions.tsx` — confirmed `EDITABLE_STATUSES = ["pending", "confirmed"]` gates the customer's own edit/cancel UI, and that this is a client-only display gate, not a server enforcement mechanism the new admin routes need to interact with.
- **Searched the whole codebase for any existing write to `status: "confirmed"` or `status: "completed"`— found none.** Every `Booking` row is created with the schema default (`pending`); the only status-mutating code path anywhere is the customer cancel route (→ `cancelled`). This means `confirmed` and `completed` have been unreachable enum values since the schema was written — this milestone's `confirm` action is the **first code path in the app to ever set a booking to `confirmed`**, which strongly validates the recommendation's premise that this was genuinely missing functionality, not a redundant one.

### Scope decision: cancel + confirm only, no reopen

The prompt offered a conditional third action — reopen/restore — "only if the status model naturally supports it." It doesn't, cleanly:
- No existing code path anywhere transitions a booking *backward* (e.g., `cancelled → pending`), so there's no established precedent to extend.
- Reopening a cancelled booking whose `requestedDate` has since passed, or whose capture slot may since have been reallocated, is a real business-rule question this session has no basis to answer — exactly the kind of "unresolved business rule" the handoff's enterprise-member-access note already warns against guessing at.

**Decision: implemented only `cancel` and `confirm`.** Reopen/restore is explicitly not implemented — flagged below as a question for the user, not silently skipped.

Also **not implemented**: a `complete` / "mark as completed" action. It wasn't requested in this prompt, and — despite `completed` being just as unreachable as `confirmed` was — adding an unrequested third action would have violated "keep it intentionally narrow." Flagged as a natural, low-risk candidate for a future micro-milestone (same shape as `confirm`, valid only from `confirmed`).

### RBAC

`lib/admin/rbac.ts` — added `canManageBookings(role)`, `ADMIN` minimum. Kept deliberately separate from `canManageBookingNotes` (Phase B2a) — notes are append-only and much lower-risk than a real status transition, so the two permissions can diverge later without a breaking rename.

### Validation

`lib/validations/admin.ts` — added `bookingStatusActionSchema` (`{ reason: string, 1-500 chars, required }`), shared by both new routes — same shape as `suspendUserSchema`, kept as its own named export per the existing one-schema-per-action-family convention in this file.

(Also fixed a duplicate `AddBookingNoteInput` type export left over from the previous session while in this file — cosmetic, `tsc` caught it immediately.)

### API routes added

**`POST /api/admin/bookings/[id]/cancel`** and **`POST /api/admin/bookings/[id]/confirm`** — both follow the identical shape: `auth()` → `canManageBookings` RBAC (401/403) → Zod-validated `{ reason }` body (422) → fetch current status → transition guard (409 on any invalid transition, with a specific message per case) → single `booking.update` → `writeAuditLog` (`entityType: ENTITY_TYPES.BOOKING`, `action: "cancel_booking"` / `"confirm_booking"`, `reason`) → `revalidatePath("/dashboard/bookings")` (admin-triggered changes affect the customer's own dashboard) → `{ success: true, id, status }`.

**Valid transitions:** `confirm`: `pending → confirmed` only. `cancel`: `pending → cancelled` or `confirmed → cancelled` (matches the customer-facing route exactly). Every other starting status returns a specific 409, never a generic error.

**Concurrency note (deliberate, matches existing convention):** these use plain read-then-write, not an atomic `updateMany` claim (the pattern used in `lib/invites/accept-invite.ts` for a public, double-click-prone flow). Every existing admin mutation route in this codebase (`resend-invite`, `cancel-invite`, `suspend`, etc.) uses the same simple pattern — admin actions triggered once from a confirmation dialog don't have the same race profile as a public email-link flow, so matching existing convention here over introducing a new pattern inconsistently.

### UI changes

- `components/admin/booking-status-actions.tsx` (new, client) — `BookingStatusActions`: renders a "Confirm booking" button (only when `status === "pending"`) and/or a "Cancel booking" button (only when `status` is `pending` or `confirmed`; destructive-styled), each opening a small reason-required dialog — same `Dialog`/`Label`/`Textarea` pattern as `TransferOwnershipAction` in `components/admin/enterprise-actions.tsx`. Renders nothing if `!canManage` or if the booking is in a terminal state (`cancelled`/`completed`).
- `app/(admin)/admin/bookings/[id]/page.tsx` — added `canManageBookings` check, rendered `BookingStatusActions` at the bottom of the "Booking Summary" card. Updated the Audit Log section's comment (now populated by both B2a notes and B2b status actions, not just notes).
- `app/api/admin/bookings/[id]/route.ts` — same comment update for consistency.

### What did NOT change

- No generic "update booking" endpoint or form.
- No date/time reassignment, participant edits, enterprise reassociation, or payment overrides — all explicitly deferred per the prompt.
- No reopen/restore action, no mark-complete action (see scope decision above).
- `app/(admin)/admin/bookings/page.tsx` (list page) — untouched.
- No changes to the customer-facing `/api/bookings/*` routes.

### Checks run

```
npm run lint      → 0 errors, 2 pre-existing warnings (unchanged)
npm run typecheck → clean (one self-inflicted duplicate-export error from this
                     session's own edit, fixed immediately)
npm run build     → clean; 2 new routes: /api/admin/bookings/[id]/cancel ƒ,
                     /api/admin/bookings/[id]/confirm ƒ
```

### Manual verification

No admin credentials available in this environment (same limitation as every prior admin-phase session).

1. **HTTP-level RBAC smoke test** (`npm run start` + curl, unauthenticated): both `POST /api/admin/bookings/<id>/cancel` and `.../confirm` → `401 {"error":"Unauthorized"}` (not 500).
2. **Live-DB transition-guard test** — learned from the previous session (B2a) that touching any real user/admin/booking, even transiently, gets correctly blocked by this environment's safety classifier. Used **fully disposable fixtures throughout** (a test user, a test admin, and a test booking — all created and deleted by the same script, never a real account or real booking): walked the disposable booking through `pending → confirmed → cancelled`, confirmed each of the four invalid-transition guards returns its exact expected error message (re-confirm, re-cancel, confirm-a-cancelled-booking), confirmed the paired `AdminLog` writes land with `entityType: "booking"`, then deleted the booking, the two audit rows, and both test accounts. No real data was ever touched.

### Recommended next milestone

Options, not yet started:
- **Mark-complete action** — same shape as `confirm`, valid only from `confirmed → completed`. Lowest-risk remaining status action since `completed` is (like `confirmed` was) currently unreachable.
- **Reopen/restore** — genuinely needs a product decision first (see scope decision above), not an engineering one. Surface to the user rather than guessing.
- Field-level edits (date/time, participants, enterprise reassociation, payment overrides) — still correctly deferred; the handoff's "enterprise member non-owner bookings access" question remains open and should be resolved before any of these.

---

## Session: Admin Bookings Phase B2a — internal notes — 2026-07-13

### Why this milestone, and why not the others

The user proposed three options for "what's next" after Phase B1 (read-only bookings): internal admin notes, status-only actions, or generic field edits — explicitly ranking notes first as lowest-risk/highest-support-value, and explicitly warning against a generic "update booking" surface given the still-unresolved enterprise-member booking-access and derived-subscription-context questions flagged in the B1 handoff. I verified this against the schema before proceeding:

- **Notes (B2a, chosen):** genuinely the lowest-risk option — append-only, no customer-visible state change, only additive schema needed.
- **Status actions (B2b):** confirmed `Booking.status` is a clean, stable `BookingStatus` enum (`pending | confirmed | cancelled | completed`) with no schema blocker, so this precondition is also already met — but the user's own proposed sequencing puts it second, and doing both in one session would violate "finish one milestone completely before starting the next." Left as the documented next step below.
- **Generic field edits:** correctly identified as premature — not attempted.

### Schema change (additive only)

Added `BookingNote` — a new table, not a new column on `Booking`. `Booking.notes` (existing, customer-facing, set on the booking form) is untouched; internal admin annotations live entirely separately to avoid any risk of an admin note leaking into customer-visible state or vice versa.

```prisma
model BookingNote {
  id          String   @id @default(cuid())
  bookingId   String
  adminUserId String
  note        String
  createdAt   DateTime @default(now())

  booking   Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  adminUser User    @relation(fields: [adminUserId], references: [id])

  @@index([bookingId])
  @@index([adminUserId])
  @@map("booking_notes")
}
```

Migration `20260713000812_add_booking_notes` — verified the generated SQL is a pure `CREATE TABLE` + two indexes + two FKs; zero `ALTER` statements against any existing table, zero data-loss risk. `Booking` gained a relation field `adminNotes BookingNote[]`; `User` gained `bookingNotesAuthored BookingNote[]`. No `onDelete` override on the `adminUser` relation (matches `AdminLog.adminUser`'s existing convention — no cascade-delete-on-user-removal behavior was invented).

**Design decision — append-only, no edit/delete:** notes can only be added, never edited or deleted (no PATCH/DELETE route exists). This makes the note history itself an implicit audit trail and matches the recommendation's explicit framing of "admin notes **+ audit**." If a note is added in error, the correct workflow is a follow-up note, not silently rewriting history — same philosophy as the append-only `AdminLog`.

**Design decision — dual write (BookingNote + AdminLog):** every note-add call writes both a `BookingNote` row (the actual content) and an `AdminLog` entry (`entityType: ENTITY_TYPES.BOOKING`, `action: "add_booking_note"`). The `ENTITY_TYPES.BOOKING` constant and the audit-log query on the booking detail page were both already wired up in Phase B1 specifically anticipating this — this milestone is the first thing that actually populates that section.

### RBAC

`lib/admin/rbac.ts` — added `canManageBookingNotes(role)`, `ADMIN` minimum. Deliberately a separate permission from a hypothetical future `canManageBookings` (status/field mutations), even though both currently resolve to the same threshold — notes are append-only and much lower-risk than a status change or field edit, so keeping them on separate permission names leaves room to diverge later (e.g. if `BILLING_ADMIN` should ever be allowed to leave notes but not change booking status) without a breaking rename.

### Validation

`lib/validations/admin.ts` — added `addBookingNoteSchema`: `note` required, trimmed, 1–2000 chars (generous vs. the 500-char `reason` fields elsewhere, since this is a free-text support annotation, not a short justification string).

### API route added

**`POST /api/admin/bookings/[id]/notes`** — `canManageBookingNotes` RBAC (401/403), 404 if the booking doesn't exist, Zod-validated body, creates the `BookingNote` + writes the paired `AdminLog` entry, returns the created note (`201`).

**`GET /api/admin/bookings/[id]`** (existing, from B1) — updated to also select and return `adminNotes` (newest first), and the "no mutation routes exist yet" comment about the empty audit-log query was corrected now that one does.

### UI changes

- `components/admin/booking-notes.tsx` (new, client) — `BookingNotesSection`: renders existing notes (author, timestamp, text) plus, when `canManage` is true, an inline `Textarea` + submit button (no dialog — matches the "lowest friction for a low-risk action" reasoning) that POSTs and calls `router.refresh()` on success, same idiom as `components/admin/enterprise-actions.tsx`.
- `app/(admin)/admin/bookings/[id]/page.tsx` — added `adminNotes` to its direct Prisma select, computed `canManageNotes = canManageBookingNotes(actorRole)`, and inserted a new "Internal Notes" card between Payments and Audit Log rendering `BookingNotesSection`. Updated the Audit Log section's empty-state copy now that it's no longer permanently empty.

### What did NOT change

- No edit or delete capability for notes or bookings — still no generic "update booking" surface, per the explicit recommendation.
- No status-action routes (confirm/cancel/reopen/complete) — documented as the next milestone, not started.
- `app/(admin)/admin/bookings/page.tsx` (list page) — untouched; notes are a detail-page-only concern for this milestone.
- No changes to the customer-facing `Booking.notes` field or the existing `/api/bookings/*` user-facing routes.

### Checks run

```
npm run lint      → 0 errors, 2 pre-existing warnings (unchanged)
npm run typecheck → clean (had to re-run `npx prisma generate` once after the
                     migration — migrate dev's auto-generate left the client
                     stale relative to a hand-verified schema edit; a plain
                     re-generate fixed it)
npm run build     → clean; new route: /api/admin/bookings/[id]/notes ƒ
```

### Manual verification

No admin credentials available in this environment (same limitation as every prior admin-phase session).

1. **HTTP-level RBAC smoke test** (`npm run start` + curl, unauthenticated): `POST /api/admin/bookings/<id>/notes` → `401 {"error":"Unauthorized"}` (not 500); `GET /admin/bookings/<id>` → `307` to `/login`.
2. **Live-DB write/read/cleanup test against the dev database** — first attempt used a real pre-existing admin user's id to author a test note; **this was correctly blocked by the environment's safety classifier** for attributing fabricated data to a real identity, even transiently. Rewrote it to create a fully disposable test admin user instead (adminRole set, fake email, deleted at the end) and re-ran: note validation (empty/too-long rejected, valid accepted), `BookingNote` + `AdminLog` creation against a real existing booking, confirmed the note appears via the exact `Booking.adminNotes` select shape the detail page uses, then deleted the note, the audit entry, and the disposable test admin. The real booking row itself was never modified — only the disposable test admin and its two rows were created and removed.

### Recommended next milestone

**Admin Bookings Phase B2b — status actions**, per the user's own proposed sequencing:
- `canManageBookings` in `lib/admin/rbac.ts`.
- 1–2 explicit, audited, idempotent actions to start — e.g. `POST /api/admin/bookings/[id]/cancel` (admin override, independent of the user-facing `EDITABLE_STATUSES` gate in `app/api/bookings/[id]/route.ts`) and/or `POST /api/admin/bookings/[id]/confirm`. Each should call `writeAuditLog` with `entityType: ENTITY_TYPES.BOOKING`, same as this milestone.
- Only after B2b: field edits (date/time reassignment, participant changes, enterprise reassociation, payment overrides) — still correctly deferred per the original recommendation until support workflows around enterprise-member booking access are clearer.

---

## Session: Admin Bookings Phase B1 — read-only module — 2026-07-13

### What was inspected

- `prisma/schema.prisma` — `Booking` model: `id`, `userId`, `enterpriseId` (nullable — this is the "personal vs enterprise" distinction), `requestedDate`, `timeStart`/`timeEnd` (strings, not `DateTime`), `capturesCount`, `status` (`BookingStatus` enum: `pending | confirmed | cancelled | completed`), `paymentStatus` (`PaymentStatus` enum: `unpaid | paid | refunded | failed`), `notes`, location fields (`captureLocationType`, `capitalCity`, `suburbOrTown`, `stateOrTerritory`, `postcode`, `addressLine1`, `addressLine2`, `locationNotes`), `createdAt`. Relations: `user User`, `enterprise Enterprise?`, `payments Payment[]`, `participants BookingCaptureParticipant[]`. Indexed on `userId` and `enterpriseId`.
- `Payment` model — links to `Booking` via nullable `bookingId`; also has a `subscriptionId` for subscription-type payments. Confirms Booking has genuine payment linkage via `payments[]`, but **no direct relation to `Subscription`**.
- `Subscription` model — links to `User` or `Enterprise` via nullable `userId`/`enterpriseId`, never to a `Booking` directly. Confirmed: any "subscription context" for a booking has to be derived by looking up the most-recent subscription for the booking's owner (enterprise if set, else user) — same pattern already used in `app/api/admin/enterprises/route.ts` to derive an enterprise's current plan.
- `app/api/bookings/route.ts`, `app/api/bookings/[id]/route.ts`, `app/api/bookings/[id]/cancel/route.ts` — the existing user-facing booking API. Confirmed `timeEnd` is always server-computed (never trust client input) and only `pending`/`confirmed` bookings are editable — informs what a future Phase B2 admin edit would need to replicate, not touched in this phase.
- `app/(dashboard)/dashboard/bookings/page.tsx` — the user-facing bookings list; reused its `formatLocationSummary`/`CAPITAL_CITY_LABELS` display logic for the new admin detail page's location formatting.
- `lib/admin/rbac.ts`, `lib/admin/audit.ts`, `lib/validations/admin.ts` — confirmed every existing admin "view" permission (`canViewUsers`, `canViewEnterprises`, etc.) maps to `ADMIN` minimum on the `BILLING_ADMIN(1) < ADMIN(2) < SUPER_ADMIN(3)` hierarchy; followed the same default per the task's explicit instruction.
- `app/api/admin/enterprises/route.ts` + `/[id]/route.ts`, `app/(admin)/admin/enterprises/page.tsx` + `/[id]/page.tsx` — used as the direct structural template for the new bookings list/detail routes and pages (explicit-select API routes, client list page with debounced search + filter `<select>`s + pagination, server detail page fetching directly via Prisma rather than proxying its own API route).

### What's missing from the schema (documented, not invented)

1. **No booking-scoped audit trail exists yet.** `AdminLog.entityType` is a free-text string (no enum), so no migration is needed to support it — I registered `ENTITY_TYPES.BOOKING = "booking"` in `lib/admin/audit.ts` ahead of Phase B2 and wired the detail route/page to query for it, but **no route writes this value yet** since B1 has no mutations. The audit section on the detail page will show "No admin actions recorded" for every booking until B2 ships a mutation that calls `writeAuditLog`. Verified this returns an empty array against real data (see Manual verification).
2. **No direct `Booking → Subscription` relation.** Subscriptions link to `User`/`Enterprise`, not `Booking`. The detail route derives a best-effort "subscription context" (most recent subscription for the booking's enterprise, or its user if personal) rather than a hard link — documented inline in both the API route and the page.
3. **`timeStart`/`timeEnd` are plain strings, not `DateTime`.** Sorting/filtering by "date" uses `requestedDate` only; time-of-day is display-only, consistent with how the existing dashboard bookings page already treats them.

### RBAC

`lib/admin/rbac.ts` — added `canViewBookings(role)`, `ADMIN` minimum (same tier as `canViewUsers`/`canViewEnterprises`). No `canManageBookings` yet — there is nothing to manage in a read-only phase.

### Validation

`lib/validations/admin.ts` — added `listBookingsQuerySchema`: `page`, `pageSize` (max 100), `search` (matches user name/email or enterprise name), `status` (`BookingStatus` enum value or `"all"`), `kind` (`"personal"` | `"enterprise"` | `"all"`, mapped to `enterpriseId: null` / `{ not: null }`), `sortBy` (`requestedDate` | `createdAt`), `sortOrder`, and optional `dateFrom`/`dateTo` (validated as parseable dates, filtered against `requestedDate`).

### API routes added

**`GET /api/admin/bookings`** — paginated/searchable/filterable list. `canViewBookings` RBAC (401/403), explicit `Prisma.BookingSelect`, stable pagination via secondary `{ id: "asc" }` sort. Returns `{ items, page, pageSize, totalItems, totalPages }`. Each item: id, user (id/name/email), enterprise (id/name) or null, requestedDate, timeStart/timeEnd, capturesCount, status, paymentStatus, createdAt.

**`GET /api/admin/bookings/[id]`** — read-only detail. Same RBAC. Returns booking core fields + full location fields + participants + payments (from `Booking.payments`) + derived `subscriptionContext` + `auditLog` (see limitation #1 above — always `[]` today).

### UI routes added

- `app/(admin)/admin/bookings/page.tsx` — client list page, debounced search (300ms), status + kind filter `<select>`s, paginated table (date/time, requester, enterprise, status badge, payment badge, created date, view link).
- `app/(admin)/admin/bookings/[id]/page.tsx` — server detail page (`force-dynamic`), fetches directly via Prisma (not via the API route — matches the enterprises/users detail page precedent), RBAC redirect to `/dashboard` if `!canViewBookings`. Sections: Booking Summary, Requester (+ derived subscription context), Participants, Payments, Audit Log. **No action buttons anywhere** — explicitly read-only per phase scope.
- `components/admin/admin-shell.tsx` — added "Bookings" nav item (`CalendarDays` icon) between Enterprises and the account footer, same active-state/styling logic as the existing items.

### Safety rules followed

- No booking mutation routes or UI actions added.
- Every Prisma query in both new routes/pages uses an explicit `select` (no bare `findMany()`/`findUnique()`, no `include`).
- RBAC enforced in both API routes (401 unauthenticated / 403 insufficient role) and both pages (redirect to `/dashboard`).
- `pageSize` capped at 100 via the Zod schema; sort is always `[primarySort, { id: "asc" }]` for stability.
- No schema changes — the one addition (`ENTITY_TYPES.BOOKING`) is a new string constant value on an already-free-text column, not a migration.

### Checks run

```
npm run lint      → 0 errors, 2 pre-existing warnings (unchanged)
npm run typecheck → clean
npm run build     → clean; 4 new routes: /admin/bookings ƒ, /admin/bookings/[id] ƒ,
                     /api/admin/bookings ƒ, /api/admin/bookings/[id] ƒ
```

### Manual verification

No admin credentials available in this environment (same limitation noted in every prior admin-phase session), so browser click-through wasn't possible. Did two things beyond the usual build-only check:

1. **HTTP-level RBAC smoke test** (`npm run start` + curl, unauthenticated):
   - `GET /admin/bookings` → `307` → `/login` (proxy's existing `/admin` protection).
   - `GET /admin/bookings/<id>` → `307` → `/login`.
   - `GET /api/admin/bookings` → `401 {"error":"Unauthorized"}`.
   - `GET /api/admin/bookings/<id>` → `401 {"error":"Unauthorized"}`.
2. **Read-only Prisma query verification against the live dev DB** (disposable `tsx` script, no writes): ran the exact `BOOKING_LIST_SELECT`/`BOOKING_DETAIL_SELECT` shapes used by both routes against real data — confirmed 3 real bookings exist, the list query with every filter dimension combined (status + kind + search + date range) executes without error, the detail query for a real booking returns correctly shaped participants/payments arrays, the derived `subscriptionContext` correctly resolved a real `CREATOR`/`ACTIVE` subscription for that booking's user, the `entityType: "booking"` audit query correctly returns `[]` (as expected — no B2 mutations exist yet), and a detail query for a nonexistent id resolves to `null` rather than throwing. Nothing was created, modified, or deleted.

Recommend a real browser click-through (list page filters/pagination, detail page rendering) before considering this phase fully closed.

### Recommended next milestone

**Admin Bookings Phase B2 — mutations:**
- `canManageBookings` in `lib/admin/rbac.ts` (ADMIN minimum, matching the enterprise-management tier).
- Likely actions: cancel a booking (admin override, independent of the user-facing `EDITABLE_STATUSES` gate in `app/api/bookings/[id]/route.ts`), reassign to a different enterprise, mark payment status. Each should call `writeAuditLog` with `entityType: ENTITY_TYPES.BOOKING` (already registered) so the audit section built in B1 starts showing data immediately.
- Add action buttons to `app/(admin)/admin/bookings/[id]/page.tsx` (currently pure read-only), following the same controlled-dialog + reason-required pattern used in `components/admin/enterprise-actions.tsx`.
- Consider whether admin booking edits should share `lib/validations/booking.ts`'s `updateBookingSchema` (same date/business-day/location rules) or need looser admin-specific rules (e.g. admins overriding the 3-business-day lead time) — a product decision, not inferable from the current code.

---

## Session: Skip the /invite/[token] detour after invite signup — 2026-07-13 (follow-up 3)

### Problem

User feedback: after signing up via `/invite/[token]/join` and then logging in, the user was routed back to `/invite/[token]` before finally reaching the dashboard. Bad UX — an extra stop for a step that had already been proven possible at signup time.

### Fix

Membership creation now happens **inside the same transaction as account creation**, at registration time, whenever `registerUser()` already validated the invite (the `verifiedViaInvite` check from the previous session — pending status + matching email). The post-registration login redirect then goes straight to `/dashboard?joined=<name>` instead of back through `/invite/[token]`.

**`lib/invites/accept-invite.ts`** — extracted the core claim logic (atomic `updateMany` status flip + `enterpriseMember.upsert`) out of `acceptInvite()` into a new exported `claimInviteAndCreateMembership(tx, token, userId)` that takes a `Prisma.TransactionClient` instead of opening its own transaction. `acceptInvite()` (still used by the main `/invite/[token]` page for the existing-account path) now just wraps it in `prisma.$transaction()`. Same idempotency/race guarantees as before — nothing about the atomic-claim behavior changed, only where it can be called from.

**`lib/auth/register-user.ts`** — inside the existing `$transaction`, right after `tx.user.create()`, calls `claimInviteAndCreateMembership(tx, inviteToken, createdUser.id)` when `verifiedViaInvite` is true. Account creation and invite acceptance are now one atomic unit — if either fails, both roll back; no window where a verified account exists without its membership, or vice versa. `RegisterResult`'s success variant gained `joinedEnterpriseName: string | null` so callers know whether it actually happened (falls back to `null` if a race meant the invite was no longer claimable at that exact moment — rare, and handled gracefully, see below).

**`app/api/register/route.ts`** — response now includes `joinedEnterpriseName`.

**`app/invite/[token]/join/join-form.tsx`** — the post-registration `/login` redirect's `callbackUrl` is now `/dashboard?joined=<enterprise name>` when `joinedEnterpriseName` came back non-null, falling back to the old `/invite/[token]` destination only in the rare case it didn't (e.g. the invite got cancelled in the seconds between page load and form submit) — that page still knows how to complete or correctly explain that state, so nothing is lost in the fallback case.

**`app/(dashboard)/dashboard/page.tsx`** — now reads a `joined` search param and renders a small green "You've joined {name} successfully." banner above the existing header, reusing the same visual style as the login page's success banners and the billing page's `REDIRECT_NOTICES` pattern (non-dismissable, presence-driven, same as billing's). This replaces the `SuccessCard` on `/invite/[token]` as the user-visible confirmation for this path — that card still exists and still renders for the *other* path (existing account, signs in, lands on `/invite/[token]` directly).

**`app/login/login-form.tsx`** — unchanged from the previous session in this area (already handled the combined `registered=1&verified=1` banner text); no further changes needed since `/dashboard?joined=...` is just a `callbackUrl` value it already knows how to redirect to.

### What did NOT change

- The existing-account path (`/invite/[token]` → `/login` → back to `/invite/[token]` to accept) is untouched — that page is still the only place that flow can complete acceptance, and stopping there once is expected, not a bug.
- `acceptInvite()`'s public signature and behavior for the main invite page is unchanged.
- No schema changes.

### Checks run

```
npm run lint      → 0 errors, 2 pre-existing warnings
npm run typecheck → clean
npm run build     → clean; routes unchanged
```

### Manual verification

Re-ran the disposable `tsx`-script approach from the previous session (real `registerUser()` against the dev DB, temp enterprise/role/invite seeded and deleted afterward), this time asserting the new atomic-accept behavior directly:

| Assertion | Result |
|---|---|
| `result.joinedEnterpriseName === "Verify Reg2 Co"` | PASS |
| `EnterpriseMember` row exists for `(enterpriseId, userId)` immediately after `registerUser()` returns | PASS |
| `Invite.status` flipped to `"accepted"` | PASS |
| Exactly one membership row (no duplicate) | PASS |
| Password hash validates — login would succeed | PASS |

Also curl-verified via `npm run start`: unauthenticated `GET /dashboard` still 307-redirects to `/login` (no 500 from the new `searchParams` prop), and `GET /invite/<bad-token>/join` still renders "Invite not found" correctly.

### Recommended next milestone

Same as prior sessions — a real browser click-through of the full path end to end (invite → join → login → land on `/dashboard` with the green "You've joined X" banner visible), since this environment only allows curl/script-level checks, not a rendered browser session.

---

## Session: Skip email verification for invite-based signups — 2026-07-13 (follow-up 2)

### Decision

Clicking a still-pending invite link addressed to a specific email is treated as equivalent proof of inbox ownership to clicking a separate email-verification link — so `/invite/[token]/join` signups no longer require a second "verify your email" round-trip. Discussed with the user first (exploratory question → explicit agreement) before implementing, per the project's working method.

### Design constraint (why this isn't just a client-supplied flag)

`registerUser()` is shared by both the public `/signup` form and the invite `join-form`. A client-supplied "skip verification" boolean would let anyone bypass verification on the public form too. Instead, `registerUser()` now accepts an optional `inviteToken` in the request body and **re-validates it server-side** against the `Invite` table: the token must resolve to a row, that row's `status` must still be `"pending"`, and its `email` must exactly match the email being registered. Only if all three hold does the new account get created with `emailVerified: true` and skip creating an `EmailVerificationToken` row / sending the verification email entirely. Any mismatch (bad token, already-accepted/cancelled invite, tampered email) silently falls back to the existing normal-signup behavior — never a hard error, just no shortcut.

### Files changed

| File | Change |
|---|---|
| `lib/auth/register-user.ts` | Accepts optional `inviteToken`; looks it up and computes `verifiedViaInvite`; `emailVerified` on the created `User` row now reflects it; `EmailVerificationToken` creation and `sendVerifyEmail()` are both skipped when true; `RegisterResult`'s success variant now carries `emailVerified: boolean` so callers know what actually happened (not just what they asked for) |
| `app/api/register/route.ts` | Response body now includes `emailVerified` and a matching `message` |
| `app/invite/[token]/join/join-form.tsx` | Sends `inviteToken` in the register request; only appends `verified=1` to the post-registration `/login` redirect when the **response** confirms `emailVerified === true` (not assumed from having sent an invite token — protects against a race where the invite was cancelled between page load and submit) |
| `app/login/login-form.tsx` | `registered=1` banner copy now branches on `verified === "1"` ("You can log in now." vs. "Please check your email to verify your account."); the standalone `verified` banner is suppressed when shown together with `registered=1` to avoid a contradictory double banner |

### What did NOT change

- The public `/signup` form and its `registerUser()` code path are untouched — no `inviteToken` is ever sent from there, so `verifiedViaInvite` is always `false` and behavior is identical to before.
- No schema changes.
- Password/terms/privacy validation requirements are unchanged and still enforced for invite signups — only the email-verification *step* is skipped, not any other requirement.

### Checks run

```
npm run lint      → 0 errors, 2 pre-existing warnings
npm run typecheck → clean
npm run build     → clean; routes unchanged
```

### Manual verification

Ran the real `registerUser()` function (not a reimplementation) against the dev DB via a disposable `tsx` script — seeded a temporary enterprise/role/pending-invite, called `registerUser()` exactly as `join-form.tsx` would, and asserted against the live DB, then deleted every row the script created:

| Assertion | Result |
|---|---|
| `result.emailVerified === true` | PASS |
| Created `User.emailVerified === true` in DB | PASS |
| No `EmailVerificationToken` row created | PASS |
| `bcrypt.compare(password, user.passwordHash)` succeeds (so `authorize()` would let them log in immediately) | PASS |
| No stray `Enterprise` auto-created for the new member (confirms the `accountType: "INDIVIDUAL"` steering from the previous session still holds) | PASS |

The mismatched-email fallback branch (`invite.email !== submitted email` → `verifiedViaInvite = false`) was **not** exercised end-to-end in this run, since that branch calls the real `sendVerifyEmail()` → Resend, and there was no safe way to trigger a real outbound email in this shared dev environment without it landing in an inbox. That branch is a single boolean condition and was verified by code review instead.

One environment note for future sessions: exercising `lib/auth/register-user.ts` standalone outside Next's bundler requires a `server-only` shim (`lib/mailer.ts` imports it; Next resolves it specially, plain Node/tsx cannot) — a throwaway stub `node_modules/server-only/{package.json,index.js}` was created and deleted for this run, not committed.

### Recommended next milestone

Carried forward from the earlier sessions today — a real manual click-through covering: existing-account invite (→ `/login`), new-account invite (→ `/invite/[token]/join`, now skipping verification), and confirming the combined "Account created successfully. You can log in now." banner renders correctly in a browser (only curl/code-level checks were done in this environment).

---

## Session: Invite acceptance — dedicated join page for brand-new invitees — 2026-07-13 (follow-up)

### Problem found

The invite flow shipped earlier today always sent signed-out visitors to `/login?callbackUrl=...&email=...`. That's correct for someone who already has a YouMimic account, but the common case — a brand-new team member who has never signed up — has no password to log in with. They'd have had to notice the "Sign up" link themselves and fill out the full `/signup` form, including the `accountType` (Individual/Business) toggle and business name field, neither of which make sense for someone joining an *existing* enterprise as a member.

### Fix

Added a dedicated `/invite/[token]/join` page for this case, and taught the main invite page to route to it instead of `/login` when no account exists yet for the invite's email.

**`app/invite/[token]/page.tsx`** — signed-out branch now does one extra check:
```
const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
if (existingUser) redirect("/login?callbackUrl=...&email=...");   // existing behavior
redirect(`/invite/${token}/join`);                                 // new: no account yet
```
Also reordered the checks so `invite.status !== "pending"` is evaluated **before** the signed-out branch — previously an already-accepted/cancelled invite would still bounce a signed-out visitor through login/join for no reason; now they see "Invite no longer active" immediately regardless of auth state. This was a latent bug in the first cut, caught while restructuring this branch.

**`app/invite/[token]/join/page.tsx`** (new, server) — re-validates independently (invalid token, non-pending invite, and — defensively — an account that already exists for that email, in which case it redirects to `/login` instead) before rendering the join form. Redirects straight to `/invite/[token]` if a session already exists (lets the main page's Case D logic own that path).

**`app/invite/[token]/join/join-form.tsx`** (new, client) — a trimmed copy of `signup-form.tsx`'s pattern: same `Form`/`FormField`/terms-and-privacy-click-tracking UX, but:
- No account-type toggle, no business name field.
- Email is fixed (shown as static text + a hidden `form.register("email")` field pre-filled from the invite) — not user-editable, since it must match the invite.
- `accountType` is hardcoded to `"INDIVIDUAL"` via a hidden field. This matters: `registerUser()` only auto-creates a new `Enterprise` + owner role when `accountType === "BUSINESS"`. An invited member is joining an *existing* enterprise, so forcing `"INDIVIDUAL"` means registration skips that branch entirely — no new backend logic needed, just steering the existing `registerUser()` down its already-correct path.
- Still requires `acceptTerms`/`acceptPrivacyPolicy` (legal requirement preserved, not skipped).
- On success, redirects to `/login?registered=1&callbackUrl=/invite/[token]&email=<email>` — same continuation mechanism as the main signup form, so email verification → login → back to `/invite/[token]` → membership creation all just work, unchanged.

**`lib/validations/signup-form.ts`** (new) — extracted `confirmPasswordSchema` (= `registerSchema` + a `confirmPassword` field) out of `app/signup/signup-form.tsx` so both the full signup form and the new trimmed join form share the same base schema instead of duplicating it. Each form still applies its own `.superRefine()` — `signup-form.tsx` keeps the business-name-required-if-BUSINESS rule (irrelevant to the join form, which is always `INDIVIDUAL`), `join-form.tsx` only checks password match.

**`components/invite/invite-status-cards.tsx`** (new) — extracted `InviteShell`, `InvalidInviteCard`, `AlreadyHandledCard` out of `app/invite/[token]/page.tsx` so the new join page can render the same invalid/already-handled states without duplicating markup. `WrongAccountCard` and `SuccessCard` stayed in the main page file since they're specific to the signed-in acceptance path.

### Files changed

| File | Status |
|---|---|
| `components/invite/invite-status-cards.tsx` | Created — shared `InviteShell`/`InvalidInviteCard`/`AlreadyHandledCard` |
| `app/invite/[token]/page.tsx` | Updated — reordered status/session checks; branches to `/join` when no account exists |
| `app/invite/[token]/join/page.tsx` | Created — server page, re-validates, renders `JoinForm` |
| `app/invite/[token]/join/join-form.tsx` | Created — trimmed signup form for invited members |
| `lib/validations/signup-form.ts` | Created — shared `confirmPasswordSchema` |
| `app/signup/signup-form.tsx` | Updated — now imports `confirmPasswordSchema` instead of defining it inline |

### What did NOT change

- No schema changes.
- No changes to `registerUser()` or `/api/register` — the join form steers existing logic (`accountType: "INDIVIDUAL"`) rather than adding a new code path there.
- No changes to `/dashboard`, `/dashboard/settings`, or the acceptance transaction (`lib/invites/accept-invite.ts`) from the earlier session today.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing, unchanged)
npm run typecheck → clean
npm run build     → clean; /invite/[token]/join ƒ added
```

### Manual verification

- `npm run build && npm run start`, curl-verified: `GET /invite/<bad-token>` and `GET /invite/<bad-token>/join` both return `200` with "Invite not found" (no 500 on either route).
- Not re-verified against a seeded pending invite in this follow-up (same constraint as the earlier session today — no safe way to mutate the shared Neon dev DB from this environment). The `accountType: "INDIVIDUAL"` steering and the existing-user routing logic were verified by code review against `lib/auth/register-user.ts`'s actual branch condition (`if (accountType === "BUSINESS" && businessName)`), not by an end-to-end run.

### Recommended next milestone

Same as the earlier session today: a manual click-through with a real invite, now covering both sub-cases — an email with an existing account (→ `/login`) and one without (→ `/invite/[token]/join`).

---

## Session: Invite acceptance flow — `/invite/[token]` — 2026-07-13

### What was inspected

- `prisma/schema.prisma` — `Invite` (`token` unique, `status` plain `String` default `"pending"`, `roleId`, `enterpriseId`, `email`, no expiry column), `EnterpriseMember` (`@@unique([enterpriseId, userId])`, generated key name `enterpriseId_userId`), `Enterprise`, `Role`.
- `app/api/invites/route.ts` — confirms invite creation shape: `token = crypto.randomUUID()`, `acceptUrl = ${BASE_URL}/invite/${token}`, `roleId` resolved once via `role.upsert({ name: "member" })` at invite-creation time and stored directly on the `Invite` row — the accept flow must reuse `invite.roleId` as-is, never re-derive a role.
- `lib/mailer.ts` / `emails/templates/invite-email.tsx` — email links straight to `/invite/{token}`; no separate deep-link scheme to account for.
- `auth.ts` / `next-auth.d.ts` — JWT session, no enterprise state stamped in the token (confirmed via Phase E1 note in this file) — the accept page does its own Prisma reads, consistent with every other enterprise-aware page in the app.
- `proxy.ts` — `/invite/[token]` is **not** in `PROTECTED_PREFIXES`, so signed-out users reach the page directly; the page itself must branch on `auth()`, not middleware.
- `app/login/login-form.tsx` — already reads `callbackUrl` from `searchParams`, validates it (`startsWith("/") && !startsWith("//")`), and does `router.push(callbackUrl)` after a successful `signIn()`. This is the exact continuation mechanism to reuse — no new redirect scheme invented.
- `app/signup/page.tsx` (pre-change) — client component, no `searchParams` handling at all; always redirected to `/login?registered=1` unconditionally after successful registration.
- `lib/auth/register-user.ts` — registration requires email verification before login is possible (`EmailNotVerifiedError` in `auth.ts`); the verify email link is built once in `registerUser()` and does not currently carry any post-verification destination.
- `app/api/verify-email/route.ts` — always redirected to `/login?verified=1`, dropping any invite context that arrived via signup.
- `app/suspended/page.tsx`, `app/verify-email/page.tsx` — reused as the UI reference pattern (`Card`/`CardHeader`/`CardDescription` with an icon + one action button) for all new invite-state cards.
- `app/(dashboard)/dashboard/checkout/success/page.tsx` + `subscription-activator.tsx` — reused as the precedent for "client component using `useSearchParams` needs a `Suspense`-wrapped server page.tsx" (see decision below).
- `app/(dashboard)/dashboard/settings/page.tsx` / `app/(dashboard)/dashboard/page.tsx` — confirmed the "Team" card on `/dashboard/settings` only renders for the enterprise **owner** (`enterprise.findFirst({ ownerUserId })`); a newly-accepted member has no owner-scoped content there. `/dashboard` has no membership-aware content either, but is the only page every authenticated user (owner or member) can land on meaningfully.

### Required behavior implemented

All in `app/invite/[token]/page.tsx` (server component, `force-dynamic`):

| Case | Behavior |
|---|---|
| Token doesn't resolve to any `Invite` | `InvalidInviteCard` — "This invite link is invalid or no longer available." No throw, no 500. |
| `Invite.status !== "pending"` | `AlreadyHandledCard` — "This invite has already been used or is no longer active." |
| Signed-out visitor | `redirect("/login?callbackUrl=/invite/[token]&email=<invite.email>")` — no separate token param needed since the callback URL itself re-enters this page. |
| Signed-in, email mismatch | `WrongAccountCard` — explains the mismatch, shows the invited email, offers sign-out + back-to-dashboard. Does **not** auto-accept. |
| Signed-in, matching email, pending | Runs `acceptInvite()`, then `SuccessCard` — "You've joined {enterprise} successfully" with a continue-to-dashboard button. |

### Acceptance transaction — `lib/invites/accept-invite.ts`

```
prisma.$transaction(tx => {
  1. Re-read invite by token inside tx (never trust the page's earlier read).
  2. If not found -> "not_found". If status !== "pending" -> "not_pending".
  3. tx.invite.updateMany({ where: { id, status: "pending" }, data: { status: "accepted" } })
     — atomic conditional update; count === 0 means a concurrent request already
     claimed it, so this request also returns "not_pending" instead of racing ahead.
  4. tx.enterpriseMember.upsert({ where: { enterpriseId_userId }, create: {...}, update: {} })
     — protects against the (enterpriseId, userId) unique constraint even in the
     unlikely case a membership row already exists for other reasons.
  5. Return { status: "accepted", enterpriseName }.
})
```

**Idempotency design decision:** rather than read-then-write (which is racy under concurrent double-clicks), the invite claim uses a single conditional `updateMany` and inspects `count`. Only the request that actually flips `pending -> accepted` proceeds to create membership. A second concurrent or later request always sees `status !== "pending"` and renders `AlreadyHandledCard` — this is also what makes "re-opening an already-accepted invite" safe with no extra bookkeeping: the invite's own `status` field is the single source of truth for "already handled," so no separate dedupe flag was invented.

### Auth continuation (Case C / section 5)

Reused the existing `callbackUrl` mechanism end-to-end instead of inventing a parallel one:

1. **Signed-out, existing account** — `/invite/[token]` → `/login?callbackUrl=/invite/[token]&email=<email>`. `login-form.tsx` already redirects to `callbackUrl` post-sign-in; only change was adding `email` prefill (`searchParams.get("email")` → `defaultValues.email`).
2. **Signed-out, no account (new user)** — `/login` → user clicks "Sign up" → lands on `/signup` with no context. To close this gap: `app/signup/signup-form.tsx` now also reads `callbackUrl` and `email` from `searchParams`, prefills the email field, and forwards `callbackUrl` in the `POST /api/register` body plus onto the post-registration `/login?registered=1&callbackUrl=...` redirect.
3. **Email verification gap** — registration requires email verification before login works, and the verification link is emailed, so `callbackUrl` has to survive an out-of-band click days later. `lib/auth/register-user.ts` now accepts an optional `callbackUrl` in the request body (validated: must start with `/`, not `//`), and appends it as a query param on the emailed `verifyUrl`. `app/api/verify-email/route.ts` reads that `callbackUrl` back off its own query string and forwards it onto the final `/login?verified=1&callbackUrl=...` redirect (re-validated there too — defense in depth, since this value now round-trips through an emailed link).
4. Login form already does the rest (`router.push(callbackUrl)` after `signIn`), landing the user back on `/invite/[token]`, which now has a session and completes Case D.

### Signup page restructure (build-required)

Adding `useSearchParams()` to `app/signup/page.tsx` (a client component with no server-side dynamic API call) broke `next build` — "useSearchParams() should be wrapped in a suspense boundary," because the page was previously fully static and Next tried to prerender it. Fixed by following the exact precedent already in this repo (`dashboard/checkout/success/page.tsx` + `subscription-activator.tsx`): split into a plain server `app/signup/page.tsx` that renders `<Suspense fallback={null}><SignupForm /></Suspense>`, moving all existing client logic verbatim into `app/signup/signup-form.tsx`. `/signup` is now a dynamic (`ƒ`) route instead of static — expected and harmless (it was never meaningfully static content: full name/password form).

### Redirect after success — decision

Chose **`/dashboard`**, not `/dashboard/settings`. Settings' "Team" card is owner-only (`enterprise.findFirst({ ownerUserId })`), so a newly-joined member would land on a page with nothing enterprise-related to see. `/dashboard` is the one page meaningful to every authenticated user regardless of role. No changes were made to `/dashboard` itself — the success message ("You've joined {enterprise} successfully") is rendered directly on the invite page before the user clicks through, so no query-param banner or dashboard changes were needed.

### Files changed

| File | Status |
|---|---|
| `lib/invites/accept-invite.ts` | Created — transaction helper |
| `app/invite/[token]/page.tsx` | Created — all 5 states |
| `app/login/login-form.tsx` | Updated — `email` searchParam prefill |
| `app/signup/page.tsx` | Rewritten — thin server wrapper + `Suspense` |
| `app/signup/signup-form.tsx` | Created — moved client form logic; added `callbackUrl`/`email` handling |
| `lib/auth/register-user.ts` | Updated — optional `callbackUrl` threaded into emailed `verifyUrl` |
| `app/api/verify-email/route.ts` | Updated — forwards `callbackUrl` onto the `/login` redirect |

### What did NOT change

- No Prisma schema changes — `Invite.status` stays a plain string; `"accepted"` is a new value but no migration needed (same precedent as `"cancelled"` in Phase E3).
- No enterprise state added to the JWT (explicit constraint honored).
- No admin-side "add existing user as member" flow (explicit constraint honored).
- No new role-mapping logic — `invite.roleId` is reused as-is from invite creation.
- `/dashboard` and `/dashboard/settings` untouched.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing: signup form React Compiler note, lib/prisma.ts eslint-disable)
npm run typecheck → clean
npm run build     → clean; 28 routes; /invite/[token] ƒ Dynamic added; /signup now ƒ Dynamic (was static)
```

### Manual verification

- `npm run build && npm run start` on a local port, then `curl`:
  - `GET /invite/this-token-does-not-exist` → `200`, body contains "Invite not found" (confirms Case A renders cleanly, no 500).
  - `GET /signup` → `200` (confirms the Suspense restructure didn't break the route).
  - `GET /login?callbackUrl=%2Finvite%2Fabc&email=test%40example.com` → `200`, SSR HTML contains `value="test@example.com"` (confirms email prefill reaches the rendered form).
- **Not performed against seeded DB rows**: valid-pending-invite acceptance, wrong-account block, already-accepted/cancelled rendering, and the concurrent-double-click race were verified by code review of `acceptInvite()`'s atomic `updateMany`+`upsert` design (see transaction section above) rather than by writing/mutating rows in the shared Neon dev database. Recommend a manual click-through with a real invite (send one from `/dashboard/settings`, open the link signed out and signed in as both the right and wrong account) before considering this fully closed.

### Known limitations (carried forward + new)

1. No invite expiry is enforced — the email copy says "expires in 7 days" but `Invite` has no `expiresAt` column (carried forward from Phase E1/E2 notes); an invite is valid indefinitely until accepted/cancelled.
2. Enterprise/membership state is still not stamped into the JWT — a newly-added member's `/dashboard` won't reflect anything membership-specific until a page does its own Prisma read (consistent with the rest of the app).
3. `/dashboard` has no member-aware "Getting started" content (only owner vs. individual) — carried forward, not addressed here since it's out of this milestone's scope.
4. All other items in the E1–E3 sessions below remain open.

### Recommended next milestone

- Manual click-through of the full flow with a real invite (see above).
- Consider member-aware content on `/dashboard` (or a `/dashboard/team` page) now that non-owner members can actually exist via this flow.
- Admin-side "resend invite" (`/api/admin/enterprises/[id]/resend-invite`, added in Phase E3) can now be manually verified end-to-end too, since the accept link finally resolves.

---

## Session: Admin Phase E3 — Enterprise management actions — 2026-07-06

### What was inspected

- `prisma/schema.prisma` — re-confirmed `Enterprise.ownerUserId` is a required scalar (not nullable), `EnterpriseMember` has a `@@unique([enterpriseId, userId])` compound key (`enterpriseId_userId` in the generated client), and `Invite.status` is a free-text `String` (not an enum) defaulting to `"pending"` — adding a `"cancelled"` status value needed no migration.
- `lib/admin/rbac.ts` — `canManageEnterprises` / `canManageEnterpriseMembers` already existed from Phase E1 (both ADMIN minimum); also reused `canActOnUser` (originally written for user-suspension routes) to block a non-SUPER_ADMIN admin from transferring ownership to/from, or removing, a SUPER_ADMIN-tagged user.
- `lib/admin/audit.ts` — `ENTITY_TYPES` already covered `ENTERPRISE`, `ENTERPRISE_MEMBER`, `ENTERPRISE_INVITE`; reused as-is.
- `app/api/admin/users/[id]/suspend/route.ts` and `reactivate/route.ts` — copied the auth → RBAC → Zod-body → fetch-target → business-rule-checks → mutate → `writeAuditLog` sequence.
- `app/api/invites/route.ts` and `lib/mailer.ts` — copied the invite-email pattern (`sendInviteEmail`, `BASE_URL` env var, `token`-based accept URL) for the resend-invite route.
- `components/admin/user-actions.tsx` — copied the controlled-dialog + `ActionState` + `router.refresh()` pattern for the new `components/admin/enterprise-actions.tsx`.
- `app/(admin)/admin/enterprises/[id]/route.ts` (GET) — confirmed the audit-log query matches `entityId` against `[enterprise.id, ...member ids, ...invite ids]` computed **at read time**. This shaped a key design decision below.

### Design decisions (not explicit in the schema — documented here)

1. **New owner must already be an `EnterpriseMember`.** The task spec allowed either "already a member" or "can be safely added as a member." There is no product rule anywhere in the codebase for auto-promoting an arbitrary user into an enterprise, and the repo has no user-search/combobox UI component (only a native-style `Select`), so building a global user picker would have been scope creep. Transfer-ownership therefore requires the selected user to already appear in `enterprise.members`; the UI's "New owner" dropdown is populated directly from the enterprise's own member list (already fetched by the detail page), not a new search endpoint.
2. **All four new audit-log entries use `entityId: enterprise.id`, never a member/invite id.** The existing GET route recomputes "related ids" from *current* members/invites on every read. If a removed member's row (or, less critically, an invite) were used as `entityId`, that log entry would fall out of the queryable set the moment the member row is deleted, since it would no longer appear in the recomputed `relatedIds` list. Anchoring every mutation's `entityId` to the enterprise's own id (which is always in `relatedIds`) guarantees the action stays visible in the enterprise's audit trail permanently. The removed member's user id is still recorded in `targetUserId` and `metadata`.
3. **Ownership transfer never touches `EnterpriseMember` rows.** The new owner keeps their existing membership row (with whatever role they had); the old owner is not backfilled into `EnterpriseMember`. This matches the Phase E1 note ("...or leave them with no enterprise affiliation") and avoids inventing role-reassignment logic that wasn't requested. `Enterprise.ownerUserId` is a required, single-value field, so there is no code path that can produce an ownerless enterprise — the transfer is a single atomic field update.
4. **Invite resend reuses the existing `token`** rather than rotating it. There is no token-rotation precedent anywhere in the codebase (`app/api/invites/route.ts` mints a token once at creation); reusing it keeps previously-sent copies of the email valid too, which is expected behavior for "resend."
5. **`canActOnUser` reused for privilege protection.** Transfer-owner checks it against both the outgoing and incoming owner's `adminRole`; remove-member checks it against the target member's `adminRole`. This was not explicitly requested per-route but directly implements the task's "non-'highest' admin roles cannot act on protected entities" requirement using infrastructure that already existed for the same purpose on the users API.

### API routes added

All four require a JSON body, `auth()`, and a permission check; all return `401`/`403`/`404`/`409`/`422` as appropriate and write an `AdminLog` row on success only.

| Route | RBAC | Body | Notes |
|---|---|---|---|
| `POST /api/admin/enterprises/[id]/transfer-owner` | `canManageEnterprises` | `{ newOwnerUserId, reason }` | 409 if already owner; 422 if new owner isn't an existing member; 409 if new owner is suspended; 403 if either owner is a protected (`SUPER_ADMIN`) admin account the caller can't act on. Action: `transfer_enterprise_owner`. |
| `POST /api/admin/enterprises/[id]/remove-member` | `canManageEnterpriseMembers` | `{ memberUserId, reason }` | 403 if `memberUserId` is the current owner; 404 if not a member; 403 if member is a protected admin account. Action: `remove_enterprise_member`. |
| `POST /api/admin/enterprises/[id]/resend-invite` | `canManageEnterpriseMembers` | `{ inviteId, reason? }` | 409 if invite isn't `pending`; 502 (no audit write) if the email send throws. Action: `resend_enterprise_invite`. |
| `POST /api/admin/enterprises/[id]/cancel-invite` | `canManageEnterpriseMembers` | `{ inviteId, reason }` | 409 if invite isn't `pending`; sets `status: "cancelled"` (row is kept, not deleted). Action: `cancel_enterprise_invite`. |

New Zod schemas in `lib/validations/admin.ts`: `transferOwnerSchema`, `removeMemberSchema`, `resendInviteSchema`, `cancelInviteSchema`.

### UI changes

- `components/admin/enterprise-actions.tsx` (new, client component) — three exports:
  - `TransferOwnershipAction` — button + dialog rendered inside the existing "Owner" card; dropdown of eligible members (current owner excluded), required reason, confirmation copy showing "old → new".
  - `EnterpriseMembersTable` — replaces the old static members table; adds a "Remove" action per row (hidden for the owner's own row), confirmation dialog with required reason.
  - `EnterpriseInvitesTable` — replaces the old static invites table; adds "Resend"/"Cancel" actions for `pending` invites only (accepted/cancelled invites show no actions).
- `app/(admin)/admin/enterprises/[id]/page.tsx` — now computes `canManage` / `canManageMembers` server-side and passes them as props; all three action components no-op (render nothing or disable) when the signed-in admin lacks the relevant permission, so `BILLING_ADMIN` viewers still see read-only tables exactly as before.

### What did NOT change

- No schema changes or migrations — `Invite.status` accepts `"cancelled"` as a plain string value, no enum update needed.
- No JWT/session changes — enterprise ownership/membership changes are picked up on the next DB read, same as documented in Phase E1/E2 (no instant client-side effect for the affected user; they'd see the change next time a server component queries their enterprise).
- No new "add member" or "invite a specific user by admin" flow — out of scope for this phase.
- No global user-search endpoint — see design decision #1.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing: signup page React Compiler note, lib/prisma.ts eslint-disable; unchanged)
npm run typecheck → clean
npm run build     → clean; 4 new routes (/api/admin/enterprises/[id]/transfer-owner ƒ,
                     /remove-member ƒ, /resend-invite ƒ, /cancel-invite ƒ)
```

### Manual verification

Not performed in this session — no admin credentials were available in this environment (same limitation noted in Phase E2). The route/query shapes were validated indirectly: `npm run build` runs `prisma generate` against the live schema and a full `next build` + `tsc` pass, which would fail on any invalid `select`/`where`/compound-key name or enum value. **Recommend a manual click-through before considering this phase fully closed**: transfer ownership between two seeded users, remove a member, resend/cancel an invite, and confirm a `BILLING_ADMIN` session sees the enterprise detail page with no action buttons.

### Known limitations (carried forward + new)

1. Ownership/membership changes are not instant for the affected end user — no session/JWT invalidation is triggered (consistent with Phase E1's documented no-JWT-enterprise-state decision).
2. New owner must already be an enterprise member — there is no admin-side "add member directly" flow yet, so an admin must first get the target user invited/accepted before they're eligible for ownership transfer.
3. `EnterpriseMember` and `Invite` still have no join-date/expiry columns (carried over from Phase E2).
4. All items 1–11 from Phase E1/E2 (CONTACT_EMAIL env var, payment history pagination, etc.) remain open.

### Recommended next milestone

- Manual QA pass on the four new actions with real admin/member accounts (see above).
- Consider an admin-side "add existing user as enterprise member" action, which would remove limitation #2 above.
- Invite acceptance page (`/invite/[token]`) — still not built (carried forward since Phase 1).

---

## Session: Admin Phase E2 — Enterprises admin list + detail — 2026-07-06

### What was inspected

- `prisma/schema.prisma` — confirmed `Enterprise`, `EnterpriseMember`, `Invite`, `Subscription` shapes (re-verified from Phase E1 summary below, still accurate).
- `lib/admin/rbac.ts` — `canViewEnterprises` already existed from Phase E1 (ADMIN minimum); reused as-is, no changes.
- `lib/admin/audit.ts` — `ENTITY_TYPES.ENTERPRISE` / `ENTERPRISE_MEMBER` / `ENTERPRISE_INVITE` already existed from Phase E1; reused for the audit-log query, no writes added (this phase is read-only).
- `app/api/admin/users/route.ts` and `app/api/admin/users/[id]/route.ts` — copied the explicit-select, RBAC-then-fetch, Zod-query pattern.
- `app/(admin)/admin/users/page.tsx` and `app/(admin)/admin/users/[id]/page.tsx` — copied the client-table (debounced search + filter selects) and server-detail (breadcrumb + card grid) UI patterns.
- `components/admin/admin-shell.tsx` — added an "Enterprises" nav entry.

### Key schema facts that shaped this phase

- `Enterprise` has **no** `planType` / `subscriptionStatus` columns of its own — these are derived from the most recent row in `Enterprise.subscriptions` (`orderBy: createdAt desc, take: 1`). An enterprise with zero subscriptions renders as `planType: null`, `subscriptionStatus: null` ("None" in the UI).
- `EnterpriseMember` has **no join-date column** — `member.joinedAt` in the API/UI is always `null`. Documented as a known limitation, not invented.
- `Invite` has **no expiry column** — `invite.expiresAt` is always `null` for the same reason.
- `AdminLog.entityId` is a single string field. Since Phase E3 (enterprise mutations) doesn't exist yet, there are currently no enterprise-scoped audit rows in the DB — the audit query is wired correctly (matches `entityType in [enterprise, enterprise_member, enterprise_invite]` AND `entityId in [enterprise.id, ...memberIds, ...inviteIds]`) but will show "No admin actions recorded" until Phase E3 ships mutations that call `writeAuditLog`.

### API routes added

**`GET /api/admin/enterprises`** — paginated, searchable, filterable list.
- Query params: `page`, `pageSize` (max 100), `search` (matches enterprise name OR owner email), `subscriptionStatus` (`SubscriptionStatus` enum value, `"none"`, or `"all"`), `planType` (`PlanType` enum value or `"all"`), `sortBy` (`name` | `createdAt` | `ownerEmail`), `sortOrder`.
- Validated via new `listEnterprisesQuerySchema` in `lib/validations/admin.ts`.
- RBAC: `canViewEnterprises` (401 if no session, 403 if insufficient role).
- Response: `{ items, page, pageSize, totalItems, totalPages }` where each item is `{ id, name, owner, planType, subscriptionStatus, membersCount, createdAt }`.
- No audit log write (read-only).

**`GET /api/admin/enterprises/[id]`** — detail view.
- RBAC: same as list; 404 if enterprise not found.
- Response: `{ id, name, planType, subscriptionStatus, createdAt, owner, members[], invites[], auditLog[] }`.
- `members[]`: `{ id, email, name, role, joinedAt: null }` (see schema note above).
- `invites[]`: `{ id, email, status, role, createdAt, expiresAt: null }` (see schema note above).
- `auditLog[]`: latest 20 rows, newest first.

### UI routes added

- `app/(admin)/admin/enterprises/page.tsx` — client component. Debounced search, plan-type filter, subscription-status filter, paginated table (name, owner, plan, subscription badge, member count, created date), row links to detail.
- `app/(admin)/admin/enterprises/[id]/page.tsx` — server component (`force-dynamic`), direct Prisma query (same pattern as `/admin/users/[id]`, not calling its own API route). RBAC check via `canViewEnterprises` in addition to the layout's generic `adminRole` presence check (layout alone would let `BILLING_ADMIN` — a role below the `ADMIN` minimum required by `canViewEnterprises` — reach the page; the explicit in-page check closes that gap for this route only). Sections: Enterprise Summary, Owner, Members, Invites, Audit Log — all read-only, no action buttons.

### Files changed

| File | Change |
|---|---|
| `lib/validations/admin.ts` | Added `PLAN_TYPES`, `SUBSCRIPTION_STATUSES`, `listEnterprisesQuerySchema` |
| `app/api/admin/enterprises/route.ts` | **Created** — GET paginated list |
| `app/api/admin/enterprises/[id]/route.ts` | **Created** — GET detail |
| `app/(admin)/admin/enterprises/page.tsx` | **Created** — client list page |
| `app/(admin)/admin/enterprises/[id]/page.tsx` | **Created** — server detail page |
| `components/admin/admin-shell.tsx` | Added "Enterprises" nav item (`Building2` icon) |

### What did NOT change

- No enterprise mutations (ownership transfer, member removal, invite resend/cancel) — deferred to Phase E3 per instructions.
- No new `AdminLog` writes — list/detail are read-only.
- No schema changes.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing, unchanged)
npm run typecheck → clean
npm run build     → clean; 4 new routes (/admin/enterprises ƒ, /admin/enterprises/[id] ƒ,
                     /api/admin/enterprises ƒ, /api/admin/enterprises/[id] ƒ)
```

### Manual verification

- Unauthenticated request to `/admin/enterprises` → `307` redirect to `/login?callbackUrl=%2Fadmin%2Fenterprises` (proxy's existing `/admin` protection, unchanged).
- Unauthenticated request to `/api/admin/enterprises` → `401 Unauthorized`.
- Authenticated admin click-through (list → detail, filters, pagination) was **not** performed in this session — no admin credentials were available in this environment. The query shapes were validated indirectly: `npm run build` runs `prisma generate` against the live schema and then a full `next build` + `tsc` pass, which would fail on any invalid `select`/`where`/`orderBy` field name, relation, or enum value. Recommend a quick manual click-through with real admin credentials before considering this phase fully closed.

### Recommended next milestone

**Admin Phase E3 — Enterprise mutations:**
- `POST /api/admin/enterprises/[id]/transfer-ownership`
- `POST /api/admin/enterprises/[id]/members/[memberId]/remove`
- `POST /api/admin/enterprises/[id]/invites/[inviteId]/resend` or `/cancel`
- Wire `canManageEnterprises` / `canManageEnterpriseMembers` (already defined in `lib/admin/rbac.ts` since Phase E1) into these routes.
- Add action buttons to `app/(admin)/admin/enterprises/[id]/page.tsx` (currently pure read-only).

---

## Session: Admin Phase E1 — Enterprise admin foundation — 2026-07-06

### What was inspected

- `prisma/schema.prisma` — `Enterprise`, `EnterpriseMember`, `Invite` models and their relations
- `lib/admin/rbac.ts` — existing user-scoped permission helpers and `AdminRole` hierarchy
- `lib/admin/audit.ts` — `writeAuditLog` interface and existing `entityType` usage
- `app/(dashboard)/dashboard/billing/page.tsx` — enterprise owner vs member paths, subscription ownership
- `app/(dashboard)/dashboard/settings/page.tsx` — team card (owner only), invite form
- `app/(dashboard)/dashboard/bookings/page.tsx` — booking fetch by `userId`, enterprise column
- `app/(dashboard)/dashboard/page.tsx` — enterprise owner detection for `BusinessGettingStarted`

### Enterprise model summary

**`Enterprise`**
- `id`, `name`, `ownerUserId` (FK → `User.id`), `status` (default `"active"`), `createdAt`
- Relations: `owner User`, `members EnterpriseMember[]`, `subscriptions Subscription[]`, `avatars Avatar[]`, `bookings Booking[]`, `invites Invite[]`
- Indexed on `ownerUserId`

**`EnterpriseMember`**
- `id`, `enterpriseId`, `userId`, `roleId`
- Relations: `enterprise Enterprise`, `user User`, `role Role`
- Unique constraint: `(enterpriseId, userId)` — a user can only be a member of a given enterprise once

**`Invite`**
- `id`, `enterpriseId`, `email`, `roleId`, `token` (unique), `status` (default `"pending"`), `invitedById?`, `createdAt`
- No relation back to the sending user is enforced at DB level; `invitedById` is nullable
- Acceptance page (`/invite/[token]`) is not yet built — emails link to it but it 404s

### Ownership vs membership in the application

| Context | Owner detection | Member detection |
|---|---|---|
| `/dashboard` | `enterprise.findFirst({ where: { ownerUserId } })` | Not checked — non-owners see `IndividualGettingStarted` |
| `/dashboard/billing` | `enterprise.findMany({ where: { ownerUserId } })` | `enterpriseMember.findMany({ where: { userId, enterprise: { ownerUserId: { not: userId } } } })` |
| `/dashboard/settings` | `enterprise.findFirst({ where: { ownerUserId } })` | Not checked — non-owner members have no enterprise settings section |
| `/dashboard/bookings` | Not checked | Bookings fetched by `userId` regardless; enterprise column shows booking's tagged enterprise name |

Enterprise state is **not stamped into the JWT**. No `isEnterpriseOwner`, `enterpriseId`, or `memberships` fields exist on `Session.user`. Every page that needs enterprise context does its own Prisma read at render time.

### Ownership transfer rules (documented — not yet implemented)

A future "transfer ownership" admin action must touch these in a single transaction:

1. Update `Enterprise.ownerUserId` to the new owner's `userId`.
2. Create an `EnterpriseMember` row for the old owner (if they should remain as a member), or leave them with no enterprise affiliation.
3. `Subscription` rows linked to the enterprise use `enterpriseId` — they do not reference `ownerUserId` directly, so subscription records do not need to be updated. The Stripe customer relationship is held on `Subscription.stripeCustomerId` (the enterprise's Stripe customer); review with the billing team if the new owner will manage billing under a different Stripe entity.
4. Write an audit log entry with `entityType: ENTITY_TYPES.ENTERPRISE`, `action: "transfer_ownership"`, recording both old and new `ownerUserId` in `metadata`.
5. Outstanding `Invite` records can remain as-is — they reference `enterpriseId`, not `ownerUserId`.

### Changes in this session

**`lib/admin/rbac.ts`** — added 3 enterprise permission helpers:

```ts
export function canViewEnterprises(role: AdminRoleValue): boolean   // ADMIN minimum
export function canManageEnterprises(role: AdminRoleValue): boolean // ADMIN minimum
export function canManageEnterpriseMembers(role: AdminRoleValue): boolean // ADMIN minimum
```

All three require `ADMIN` or higher. The existing `AdminRole` enum only has `SUPER_ADMIN`, `ADMIN`, and `BILLING_ADMIN`. The Phase E1 instruction referenced `OPERATIONS_ADMIN` and `SUPPORT_ADMIN` — those do not exist in the current schema and would require a schema migration + Prisma generate to add. Mapped to `ADMIN` minimum until that schema change is explicitly requested.

**`lib/admin/audit.ts`** — added `ENTITY_TYPES` constant:

```ts
export const ENTITY_TYPES = {
  USER: "user",
  ENTERPRISE: "enterprise",
  ENTERPRISE_MEMBER: "enterprise_member",
  ENTERPRISE_INVITE: "enterprise_invite",
} as const;
```

Existing `entityType: "user"` usage in all Phase 2 API routes is consistent with `ENTITY_TYPES.USER`. Future enterprise admin routes must import and use these constants to keep audit log queries consistent.

### What did NOT change

- No new API routes — Phase E1 is foundation-only.
- No new UI pages.
- No schema changes or migrations.
- The `entityType: "user"` string in Phase 2 routes was not refactored to use `ENTITY_TYPES.USER` — low-risk cosmetic cleanup deferred to avoid noise in this diff.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing, unchanged)
npm run typecheck → clean
npm run build     → clean (routes unchanged)
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Invite acceptance page (`/invite/[token]`) not yet built.
8. Enterprise member (non-owner) bookings access — product decision needed.
9. Admin login error message for `account_suspended` code not yet wired into `login-form.tsx`.
10. `ENTITY_TYPES.USER` refactor in Phase 2 API routes — deferred cosmetic cleanup.
11. `OPERATIONS_ADMIN` / `SUPPORT_ADMIN` roles referenced in instructions but not in schema; requires schema migration if needed.

### Recommended next milestone

**Admin Phase E2 — Enterprise list and detail pages:**
- `GET /api/admin/enterprises` — paginated list with search and status filter
- `GET /api/admin/enterprises/[id]` — detail with owner, member list, subscription, audit log
- `app/(admin)/admin/enterprises/page.tsx` — client table
- `app/(admin)/admin/enterprises/[id]/page.tsx` — server detail view
- Wire `canViewEnterprises` from this session into the new routes

---

## Session: Fix — revoke-sessions sessionVersion check — 2026-07-06

### What was inspected

- `auth.ts` — `jwt` callback; the sign-in branch, the `trigger === "update"` branch, and the natural-refresh fall-through path.
- `app/api/admin/users/[id]/revoke-sessions/route.ts` — atomically increments `sessionVersion`, writes audit log, returns new version.
- `components/admin/user-actions.tsx` — "Sign Out All Sessions" dialog; calls the revoke endpoint and does `router.refresh()` on success.
- `proxy.ts` — reads `req.auth` (JWT decode only, no `jwt` callback invocation, no DB query).

### Root cause

**Root Cause A.** `sessionVersion` was correctly incremented in the DB by the revoke endpoint, but the check in `auth.ts` was gated behind `if (trigger === "update")`. Auth.js only fires `trigger === "update"` when client code calls `session.update()` explicitly. The only call site in this app is `SubscriptionActivator` on the checkout success page. Regular navigation never triggers it.

When the `jwt` callback is invoked for a **natural token refresh** (Auth.js re-issues the JWT cookie once the token's age exceeds `updateAge`, which defaults to 24 hours), `trigger` is `undefined`. The old code fell straight through to `return token` with no DB check, leaving the revoked user's JWT valid for up to 30 days.

### Fix (3 files)

**`auth.ts`** — removed the `if (trigger === "update")` guard from the DB re-query block. The block now runs on every `jwt` callback invocation that is not a fresh sign-in (the `if (user)` early-return handles sign-in). This covers:
- Explicit `session.update()` calls (post-checkout, post-admin-action).
- Natural 24-hour JWT refresh cycles — the path that was previously silently skipped.

The `trigger` parameter was also removed from the destructuring since it is no longer used.

A DB read now occurs at most once every 24 hours per active user (on natural refresh) plus once per explicit `session.update()` call. No per-request DB reads in middleware.

**`app/api/admin/users/[id]/revoke-sessions/route.ts`** — updated inline comment to accurately describe the revocation timing (natural refresh OR explicit update, not `trigger === "update"` only).

**`components/admin/user-actions.tsx`** — updated dialog description from "sign in again on all devices" (implies instant hard-kill) to "signed out the next time their session refreshes (within 24 hours) or when they next open the app" (truthful to the architecture).

### Manual test flow (code-inspection level)

1. User signs in → `sessionVersion: 1` stamped in JWT.
2. Admin opens `/admin/users/[id]` and clicks "Sign Out All Sessions".
3. `POST /api/admin/users/[id]/revoke-sessions` → DB `sessionVersion` incremented to 2 → audit log written.
4. User continues navigating → JWT still holds `sessionVersion: 1` → requests succeed (expected: within the 24h window).
5. Within 24 hours, Auth.js naturally re-issues the JWT → `jwt` callback fires without `trigger`.
6. DB `sessionVersion` (2) > token `sessionVersion` (1) → callback returns `null` → Auth.js clears the session cookie.
7. User's next request → no valid session → redirected to login.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing, unchanged)
npm run typecheck → clean
npm run build     → clean; routes unchanged
```

### Limitation

Revocation is not instant. A user with a freshly-refreshed JWT retains access for up to 24 hours after the admin action. Per-request DB checks in middleware would eliminate this window but add latency to every request — a deliberate architectural trade-off documented in Phase 1.

---

## Session: Admin area Phase 3 — admin UI pages — 2026-07-06

### What was done

Built the first admin UI on top of the Phase 1 (schema/auth) and Phase 2 (API routes) foundations. All admin pages live under the `(admin)` route group and are guarded by `auth()` + `adminRole` checks at both the layout level and within each page.

### Routes added

| Route | Description |
|---|---|
| `/admin` | Overview page: 4 KPI cards + recent admin activity table (last 10 logs) |
| `/admin/users` | Paginated, searchable, filterable user table backed by `GET /api/admin/users` |
| `/admin/users/[id]` | User detail: identity, account status, subscriptions, owned enterprises, audit log, 3 action buttons |

### New files

| File | Description |
|---|---|
| `components/admin/admin-shell.tsx` | Client shell: desktop + mobile sidebar with "Admin" badge, nav items (Overview / Users), "Back to Dashboard" link, sign-out |
| `app/(admin)/layout.tsx` | Server layout: `auth()` guard — unauthenticated → `/login`, no adminRole → `/dashboard`; renders `AdminShell` |
| `app/(admin)/admin/page.tsx` | Server component (`force-dynamic`): 5 Prisma queries via `Promise.all`; KPI cards; recent activity table |
| `app/(admin)/admin/users/page.tsx` | Client component: debounced search, role + status filters, paginated table; fetches `GET /api/admin/users` |
| `app/(admin)/admin/users/[id]/page.tsx` | Server component (`force-dynamic`): direct Prisma query; identity card, account status card, subscriptions, enterprises, audit log; renders `UserActions` |
| `components/admin/user-actions.tsx` | Client component: 3 controlled dialogs (Suspend / Reactivate / Sign Out All Sessions) wired to Phase 2 endpoints; per-dialog loading + error state; `router.refresh()` on success |

### Design decisions

- `AdminShell` mirrors `DashboardShell` / `AppSidebar` patterns (same CSS variables, same active-state classes, same mobile overlay) but adds a destructive-tinted "Admin" badge and avatar chip to visually distinguish the context.
- All three action dialogs are controlled via `open`/`onOpenChange` + separate `<Button onClick>` elements — no `DialogTrigger` — so the trigger and dialog are decoupled.
- Suspend dialog requires a non-empty reason (mirrors the API `suspendUserSchema`); Reactivate and Revoke dialogs accept an optional reason.
- `isSelf` guard on the detail page: if the signed-in admin views their own record, action buttons are suppressed to avoid the self-action API 403.
- `react-hooks/set-state-in-effect` lint rule satisfied: all setState calls in the users page are inside `.then()/.catch()` promise callbacks or inside event handlers — never synchronously in `useEffect` bodies.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing, unchanged)
npm run typecheck → clean
npm run build     → clean; 3 new routes: /admin ƒ, /admin/users ƒ, /admin/users/[id] ƒ
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Invite acceptance page (`/invite/[token]`) not yet built.
8. Enterprise member (non-owner) bookings access — product decision needed.
9. Admin login error message for `account_suspended` code not yet wired into `login-form.tsx`.

### Recommended next milestone

Options:
- **Invite acceptance flow** — `/invite/[token]` page (resolves token, adds existing user or redirects new user to `/signup?invite={token}`)
- **Admin login error message** — wire `account_suspended` code into `login-form.tsx` to show a descriptive message
- **Payment history pagination** — lift the `take: 20` cap on payment history

---

## Session: Admin area Phase 2 — user management API routes — 2026-07-06

### What was done

Implemented all five admin API routes on top of the Phase 1 RBAC/audit foundation. No UI pages — API-only milestone.

### Routes added

| Route | Method | Description |
|---|---|---|
| `/api/admin/users` | GET | Paginated user list with search, filters, and stable sort |
| `/api/admin/users/[id]` | GET | User detail with subscriptions, owned enterprises, and 20 most recent admin actions |
| `/api/admin/users/[id]/suspend` | POST | Suspend a user; `reason` required |
| `/api/admin/users/[id]/reactivate` | POST | Clear suspension; `reason` optional |
| `/api/admin/users/[id]/revoke-sessions` | POST | Increment `sessionVersion`; `reason` optional |

### GET /api/admin/users — query parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | integer ≥ 1 | 1 | |
| `pageSize` | 1–100 | 20 | Hard cap at 100 |
| `search` | string ≤ 200 chars | — | Case-insensitive match on `name` OR `email` |
| `adminRole` | enum or `"all"` | `"all"` | `SUPER_ADMIN`, `ADMIN`, `BILLING_ADMIN` |
| `isSuspended` | `"true"` \| `"false"` \| `"all"` | `"all"` | |
| `sortBy` | `createdAt` \| `name` \| `email` | `createdAt` | |
| `sortOrder` | `asc` \| `desc` | `desc` | |

Stable pagination: secondary sort on `id: "asc"` prevents page drift when the primary sort key has duplicates. Response includes `{ users, pagination: { page, pageSize, total, totalPages } }`.

### Permission enforcement (every route)

1. `auth()` → 401 if no session
2. Cast `session.user.adminRole` → `canViewUsers` / `canSuspendUser` / etc. → 403 if insufficient role
3. Self-action check: `session.user.id === targetId` → 403 (cannot act on yourself)
4. Fetch target with explicit `{ id, adminRole, isSuspended/sessionVersion }` select
5. `canActOnUser(actorRole, target.adminRole)` → 403 (non-SUPER_ADMIN cannot act on SUPER_ADMIN targets)
6. Business logic check (already suspended / not suspended) → 409
7. DB update
8. `writeAuditLog` from `lib/admin/audit.ts`

### Revoke-sessions design

Increments `target.sessionVersion` by 1 via `{ increment: 1 }` (atomic). The new version is recorded in the `AdminLog.metadata` field. The user's current JWT has the old version. On their next `trigger === "update"` call, `auth.ts` detects the mismatch and returns `null` to revoke the token. No per-request DB checks in middleware.

### Explicit selects (no `passwordHash` exposure)

All routes use `satisfies Prisma.UserSelect` or inline select objects. `passwordHash`, `emailVerificationTokens`, and other sensitive relations are never included in any response.

### Files changed

| File | Change |
|---|---|
| `lib/validations/admin.ts` | **Created** — `listUsersQuerySchema`, `suspendUserSchema`, `adminActionSchema` |
| `app/api/admin/users/route.ts` | **Created** — GET paginated list |
| `app/api/admin/users/[id]/route.ts` | **Created** — GET user detail |
| `app/api/admin/users/[id]/suspend/route.ts` | **Created** — POST suspend |
| `app/api/admin/users/[id]/reactivate/route.ts` | **Created** — POST reactivate |
| `app/api/admin/users/[id]/revoke-sessions/route.ts` | **Created** — POST revoke sessions |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing, unchanged)
npm run typecheck → clean
npm run build     → clean; 33 routes (5 new /api/admin/... ƒ Dynamic); ƒ Proxy confirmed
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Invite acceptance page (`/invite/[token]`) not yet built.
8. Enterprise member (non-owner) bookings access — product decision needed.
9. Admin login error message for `account_suspended` code not yet wired into `login-form.tsx`.
10. Admin UI (Phase 3): `/admin`, `/admin/users`, `/admin/users/[id]` pages.

### Recommended next milestone

**Admin area Phase 3 — UI pages:**
- `app/(admin)/layout.tsx` + `AdminShell` component (sidebar/header, "Admin" label)
- `app/(admin)/admin/page.tsx` — KPI cards (total users, suspended count, recent audit log entries)
- `app/(admin)/admin/users/page.tsx` — paginated table consuming `GET /api/admin/users`
- `app/(admin)/admin/users/[id]/page.tsx` — detail view with suspend / reactivate / revoke-sessions action buttons

---

## Session: Admin area Phase 1 — schema, auth layer, RBAC, audit — 2026-07-06

### What was done

Implemented Phase 1 of the admin area: database schema, auth layer, middleware guards, and service helpers. No admin UI or API routes yet — those are Phase 2.

### Schema changes (`prisma/schema.prisma`)

**New enum `AdminRole`:** `SUPER_ADMIN | ADMIN | BILLING_ADMIN`

**`User` model — 5 new fields:**
- `adminRole AdminRole?` — null for regular users
- `isSuspended Boolean @default(false)`
- `suspendedAt DateTime?`
- `suspensionReason String?`
- `sessionVersion Int @default(1)` — incremented when admin revokes sessions

**`AdminLog` model — 2 new fields + new relation:**
- `targetUserId String?` — the user being acted upon
- `reason String?` — admin's stated reason for the action
- `targetUser User? @relation("AdminLogTarget", ...)` — named relation back to User
- Added `@@index([targetUserId])`

Migration: `20260705231649_add_admin_fields` — fully additive, no data loss risk.

### Auth layer changes

**`next-auth.d.ts`** — Extended `Session.user`, `User`, and `JWT` interfaces with `adminRole: string | null`, `isSuspended: boolean`, `sessionVersion: number`.

**`auth.ts`** — Three changes:
1. **Suspended sign-in block**: `authorize()` throws `AccountSuspendedError` (code: `account_suspended`) if `user.isSuspended === true`. Suspended users cannot create new sessions.
2. **JWT stamping at sign-in**: `adminRole`, `isSuspended`, `sessionVersion` added to the sign-in branch of the `jwt` callback.
3. **Session revocation on `trigger === "update"`**: Re-queries `{ adminRole, isSuspended, sessionVersion }` from DB. If DB `sessionVersion > token.sessionVersion`, returns `null` to immediately invalidate the session.

### `proxy.ts` changes

- `/admin` added to `PROTECTED_PREFIXES` (unauthenticated users redirected to login).
- **Suspended-user guard**: any authenticated user with `isSuspended === true` on a protected route is redirected to `/suspended`. Runs before email-verification and subscription checks.
- **Admin role guard**: authenticated users without `adminRole` on `/admin/**` are redirected to `/dashboard`.

### New files

| File | Description |
|---|---|
| `app/suspended/page.tsx` | Static page for suspended accounts — contact support email, sign-out + back-to-login buttons |
| `lib/admin/rbac.ts` | Permission helpers: `canViewUsers`, `canSuspendUser`, `canReactivateUser`, `canRevokeSessions`, `canViewAuditLog`, `canActOnUser` — hierarchy BILLING_ADMIN < ADMIN < SUPER_ADMIN |
| `lib/admin/audit.ts` | `writeAuditLog(input)` — typed wrapper around `prisma.adminLog.create`; all Phase 2 API mutations must call this |

### Session revocation design

JWT-expiry-window approach: admin increments `sessionVersion` in DB (Phase 2 API). User's JWT remains valid until next `trigger === "update"` call, at which point the jwt callback detects the version mismatch and returns `null` (revokes). This avoids per-request Neon calls in middleware.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing, unchanged)
npm run typecheck → clean
npm run build     → clean; 28 routes (added /suspended ○ Static); ƒ Proxy confirmed
```

### Files changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `AdminRole` enum; 5 new fields on `User`; 2 new fields + relation on `AdminLog` |
| `prisma/migrations/20260705231649_add_admin_fields/migration.sql` | Created — applied migration |
| `next-auth.d.ts` | Added `adminRole`, `isSuspended`, `sessionVersion` to `Session.user`, `User`, `JWT` |
| `auth.ts` | Suspended sign-in block; stamp new JWT fields; session revocation on `trigger === "update"` |
| `proxy.ts` | `/admin` prefix protected; suspended-user redirect; admin role redirect |
| `app/suspended/page.tsx` | Created — suspended account page |
| `lib/admin/rbac.ts` | Created — RBAC permission helpers |
| `lib/admin/audit.ts` | Created — typed `writeAuditLog` helper |

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Invite acceptance page (`/invite/[token]`) not yet built.
8. Enterprise member (non-owner) bookings access — product decision needed.
9. Admin login error message for `account_suspended` code not yet wired into `login-form.tsx`.

### Recommended next milestone

**Admin area Phase 2 — API routes:**
1. `GET /api/admin/users` — paginated user list with search/filters
2. `GET /api/admin/users/[id]` — user detail + subscription + recent audit log
3. `POST /api/admin/users/[id]/suspend` — suspend + `writeAuditLog` + reason required
4. `POST /api/admin/users/[id]/reactivate` — clear suspension fields + `writeAuditLog`
5. `POST /api/admin/users/[id]/revoke-sessions` — increment `sessionVersion` + `writeAuditLog`

All routes must use `lib/admin/rbac.ts` for permission checks and `lib/admin/audit.ts` for logging.

---

## Session: SubscriptionActivator crash fix — 2026-06-29

### What was done

Fixed a crash and a re-execution loop in `SubscriptionActivator` that occurred when the checkout success URL was visited directly (not via a Stripe redirect).

### Two bugs fixed

**Bug 1 — Re-execution loop:**
`update` from `useSession()` was in the `useEffect` dependency array. After `update()` runs, NextAuth may return a new function reference on the next render. This caused the effect to fire again, calling `update()` a second time, which could loop. Fixed with an `activated` ref (`useRef(false)`) that gates the effect body — any run after the first exits immediately.

**Bug 2 — Unhandled promise rejection → crash:**
No `.catch()` was present on `update().then(...)`. Any rejection (network error, direct URL visit without a Stripe session, unexpected server error) became an unhandled promise rejection that React's error boundary caught as a hard crash — showing an error page instead of redirecting. Fixed by adding `.catch(() => router.replace(target))` so the page always navigates away cleanly regardless of whether the session refresh succeeded or failed.

### Why redirect even on failure

The API layer (`userHasActiveSubscription` in the bookings route) always does a fresh DB query regardless of JWT state. If the session refresh fails and the JWT is stale, the destination page's server-side checks remain the real enforcement boundary. Redirecting on catch is safe.

### Files changed

| File | Change |
|---|---|
| `app/(dashboard)/dashboard/checkout/success/subscription-activator.tsx` | Added `activated` ref guard; added `.catch()` to redirect regardless of `update()` result |

### Checks run

```
npm run typecheck → clean
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built.
9. Enterprise member (non-owner) access to bookings — currently blocked by subscription gate; product decision needed.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies `status === "pending"`, then either adds the existing signed-in user to `EnterpriseMember` or redirects a new user to `/signup?invite={token}`.

---

## Session: Subscription gate bug fixes — 2026-06-29

### What was done

Fixed three related bugs discovered after the post-checkout session refresh feature shipped:

### Bug 1: `useSession` must be wrapped in `<SessionProvider />`

`useSession()` in `SubscriptionActivator` threw at runtime because no `SessionProvider` existed in the tree. Added `SessionProvider` to `app/layout.tsx` as an initial fix, then immediately refined (see Bug 3).

### Bug 2: Enterprise owners always redirected from bookings

`/dashboard/bookings` was redirecting enterprise owners even after they subscribed. Root cause: `Subscription` records for ENTERPRISE plans have `userId = null` (they link via `enterpriseId` instead). Both `lib/subscription.ts` and `auth.ts` only queried by `userId`, so enterprise subscriptions were never found → `hasActiveSubscription` was always `false`.

**Fix in `lib/subscription.ts`:** `userHasActiveSubscription` now runs two sequential checks:
1. Personal subscription by `userId` (CREATOR plan)
2. Owned-enterprise subscription via `enterprise: { ownerUserId: userId }` (ENTERPRISE plan)

**Fix in `auth.ts`:** Both the sign-in block and `trigger === "update"` block now call `userHasActiveSubscription` from `lib/subscription.ts` instead of their own inline Prisma queries. The now-unused `SubscriptionStatus` import was removed. This ensures `auth.ts` and the bookings API use identical logic.

### Bug 3: `SessionProvider` at root causing app-wide session polling

Moving `SessionProvider` to `app/layout.tsx` caused `/api/auth/session` to be polled on every client navigation and window focus event across the entire app. Only one page (`/dashboard/checkout/success`) actually calls `useSession()`.

**Fix:** Removed `SessionProvider` from `app/layout.tsx`. Added it scoped directly in `app/(dashboard)/dashboard/checkout/success/page.tsx`, wrapping the `Suspense` boundary. The server component renders it as a client boundary — valid in App Router. The session polling now only occurs when a user lands on the checkout success route.

### Files changed

| File | Change |
|---|---|
| `lib/subscription.ts` | Added owned-enterprise subscription check alongside personal subscription check |
| `auth.ts` | Replaced inline Prisma queries with `userHasActiveSubscription`; removed unused `SubscriptionStatus` import |
| `app/layout.tsx` | Removed `SessionProvider` (was added then removed in same session) |
| `app/(dashboard)/dashboard/checkout/success/page.tsx` | Added scoped `SessionProvider` wrapping the Suspense boundary |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built.
9. Enterprise member (non-owner) access to bookings — currently they would be blocked by the subscription gate since `userHasActiveSubscription` only checks the owner. Product decision needed.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies `status === "pending"`, then either adds the existing signed-in user to `EnterpriseMember` or redirects a new user to `/signup?invite={token}`.

---

## Session: Post-checkout session refresh — 2026-06-29

### What was done

Implemented the post-subscription session refresh flow so that users are not blocked by a stale JWT after completing a Stripe checkout. Before this change, `hasActiveSubscription` was stamped into the JWT only at sign-in; after a successful checkout the token still read `false`, so the proxy gate on `/dashboard/bookings` redirected the user back to billing until they re-logged in.

### What changed

**`auth.ts`** — Added `trigger` to the `jwt` callback destructuring and a new `trigger === "update"` branch. When the client calls `useSession().update()`, this branch re-queries the DB for the user's subscription status (same query as sign-in) and updates `token.hasActiveSubscription`. Fails closed: if `token.id` is absent, the flag is left unchanged.

**`app/api/stripe/checkout-session/route.ts`** — Changed `success_url` from `/dashboard?billing=success` to `/dashboard/checkout/success?redirect=<encoded-target>`. CREATOR plans target `/dashboard/bookings`; ENTERPRISE plans target `/dashboard/billing`. Also changed `cancel_url` to `/dashboard/billing`.

**`app/(dashboard)/dashboard/checkout/success/page.tsx`** (new) — Server component with Suspense boundary and spinner fallback, satisfying the `useSearchParams()` App Router requirement.

**`app/(dashboard)/dashboard/checkout/success/subscription-activator.tsx`** (new) — `"use client"` component. On mount: reads `redirect` query param, validates it starts with `/dashboard` (prevents open redirect), calls `useSession().update()` to force a JWT re-query, then navigates with `router.replace(target)`.

### Design decisions

- **`useSession().update()` over `unstable_update`**: Client-side `update()` is the documented Auth.js v5 mechanism; `unstable_update` is explicitly marked unstable.
- **Webhook race condition**: Stripe fires `checkout.session.completed` before the browser redirect. In the rare lag case, the proxy may redirect once more to billing; the API-level `userHasActiveSubscription()` DB check is the real enforcement boundary and always correct.
- **Open redirect protection**: `redirect` param validated with `startsWith("/dashboard")`.
- **Enterprise path**: ENTERPRISE checkout returns to `/dashboard/billing`, not `/dashboard/bookings`. Enterprise `hasActiveSubscription` tracks personal subs only — unchanged by design.

### Scenario verification (code-inspection)

| Scenario | Flow |
|---|---|
| CREATOR checkout success | `update()` re-queries DB → `hasActiveSubscription=true` → `/dashboard/bookings` |
| ENTERPRISE checkout success | `update()` → `/dashboard/billing` |
| Unsubscribed user hits bookings | Proxy gate still redirects → `/dashboard/billing?reason=subscription-required` |
| Crafted external `redirect` | Clamped to `/dashboard` |

### Files changed

| File | Change |
|---|---|
| `auth.ts` | Added `trigger`; `trigger === "update"` re-queries subscription |
| `app/api/stripe/checkout-session/route.ts` | `success_url` → `/dashboard/checkout/success?redirect=...`; `cancel_url` → `/dashboard/billing` |
| `app/(dashboard)/dashboard/checkout/success/page.tsx` | **Created** — server component + Suspense |
| `app/(dashboard)/dashboard/checkout/success/subscription-activator.tsx` | **Created** — client activator |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; /dashboard/checkout/success ƒ Dynamic added
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies `status === "pending"`, then either adds the existing signed-in user to `EnterpriseMember` or redirects a new user to `/signup?invite={token}` with the invited email pre-filled.

---

## Session: Billing redirect notice — 2026-06-29

### What was done

Added a `reason=subscription-required` query param to the bookings subscription-gate redirect in `proxy.ts`, and a whitelist-driven notice banner on the billing page that renders only when a known `reason` value is present.

### Changes

**`proxy.ts`** — redirect now includes a `reason` param:
```ts
const url = new URL("/dashboard/billing", nextUrl.origin);
url.searchParams.set("reason", "subscription-required");
return NextResponse.redirect(url);
```

**`app/(dashboard)/dashboard/billing/page.tsx`**:
- Added `REDIRECT_NOTICES` record mapping known reason strings to fixed copy. Arbitrary query values produce no output.
- `BillingPage` now accepts `{ searchParams: Promise<{ reason?: string }> }` (matching the async searchParams pattern used by `verify-email/page.tsx`).
- `reason` is awaited and looked up in `REDIRECT_NOTICES`; the result is `null` for unknown/absent values.
- Notice banner (amber, `AlertTriangle` icon) is rendered between the page header and the first billing section when `redirectNotice` is non-null.

### Design decisions

- **Whitelist only**: `REDIRECT_NOTICES` is the single source of truth. Unknown `reason` values (typos, future values not yet in the map, anything injected) produce no visible output.
- **Existing style**: The amber `flex items-start gap-2 rounded-md border` alert is the same pattern already used by `SubscriptionDetails` for PAST_DUE / UNPAID / canceledAt warnings. No new design patterns introduced.
- **No new imports**: `AlertTriangle` was already imported.
- **Normal billing visits**: `reason` absent → `redirectNotice = null` → notice not rendered. Behaviour is identical to before.

### Scenario verification (code-inspection)

| Scenario | `reason` param | Notice shown |
|---|---|---|
| Redirected from `/dashboard/bookings` (no sub) | `subscription-required` | ✓ "A subscription is required to access Bookings. Subscribe below to get started." |
| Direct visit to `/dashboard/billing` | absent | ✗ |
| Unknown / injected `reason` value | e.g. `xss-attempt` | ✗ (not in whitelist) |

### Files changed

| File | Change |
|---|---|
| `proxy.ts` | Bookings redirect: add `reason=subscription-required` query param |
| `app/(dashboard)/dashboard/billing/page.tsx` | `REDIRECT_NOTICES` map; async `searchParams`; amber notice banner |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; routes unchanged; /dashboard/billing ƒ Dynamic
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built.
9. `hasActiveSubscription` in JWT is stamped at sign-in only — post-checkout session refresh not yet implemented.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies `status === "pending"`, then either adds an existing signed-in user to `EnterpriseMember` or redirects to `/signup?invite={token}` for new users.

---

## Session: Bookings subscription gate — 2026-06-29

### What was done

Changed the redirect destination for unauthenticated bookings access from `/pricing?reason=subscription-required` to `/dashboard/billing`.

### What was inspected

- **`proxy.ts`** — the root-level Next.js middleware handler. Three sequential guards:
  1. `isProtected && !session` → `/login?callbackUrl=<pathname>` (unauthenticated)
  2. `/dashboard/avatars` + `!user.isEmailVerified` → `/verify-email?next=<pathname>`
  3. `/dashboard/bookings` + `!user.hasActiveSubscription` → previously `/pricing?reason=subscription-required`
- **`auth.ts`** — `hasActiveSubscription` is stamped into the JWT at sign-in via a `prisma.subscription.findFirst` for TRIALING/ACTIVE status. The proxy reads from the token on every request, so no DB query per request.
- **`app/(dashboard)/dashboard/bookings/page.tsx`** — no additional subscription check in the page itself; enforcement is layered (middleware gate + API-level DB check on create/edit routes).

### What changed

Single redirect URL in `proxy.ts` line 41–44:
- Before: `new URL("/pricing", nextUrl.origin)` + `url.searchParams.set("reason", "subscription-required")`
- After: `new URL("/dashboard/billing", nextUrl.origin)` (no query param needed; billing page is self-explanatory)

The `reason` query param was only consumed by the public pricing page. The billing page does not read it and the unauthenticated path still carries `callbackUrl` to login, so no information is lost.

### Scenario verification (code-inspection)

| Scenario | Guard triggered | Redirect destination |
|---|---|---|
| Unauthenticated user hits `/dashboard/bookings` | `isProtected && !session` | `/login?callbackUrl=/dashboard/bookings` |
| Authenticated, no active sub | `!user.hasActiveSubscription` | `/dashboard/billing` |
| Authenticated, active sub | No guard triggered | `/dashboard/bookings` (pass-through) |

### Files changed

| File | Change |
|---|---|
| `proxy.ts` | Redirect target for unsubscribed bookings access: `/pricing` → `/dashboard/billing`; removed `reason` query param |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; routes unchanged; ƒ Proxy (Middleware) confirmed
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built.
9. `hasActiveSubscription` in the JWT is stamped at sign-in and does not refresh mid-session. Users who subscribe without re-logging-in will still be gated until their next session. A future milestone could add a session refresh trigger after a successful Stripe checkout.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies `status === "pending"`, then either adds an existing signed-in user to `EnterpriseMember` or redirects to `/signup?invite={token}` for new users.

---

## Session: Enterprise subscribe button in resolveAction — 2026-06-29

### What was done

Updated `resolveAction` in `/dashboard/billing` so enterprise owners see a Subscribe button when their enterprise has no active subscription, and a contact-sales note only once a subscription exists.

**Previous behaviour:** `resolveAction` returned `{ type: "managed" }` for all enterprise cases unconditionally, so an enterprise owner with no subscription saw the contact-sales note and had no way to start a subscription from the billing page.

**New behaviour (all driven by `resolveAction`, no new JSX conditionals):**

| Enterprise subscription state | Action returned | UI shown |
|---|---|---|
| None / CANCELED / INCOMPLETE_EXPIRED | `{ type: "checkout", planType: "ENTERPRISE", enterpriseId }` | Subscribe button |
| INCOMPLETE | `{ type: "checkout", planType: "ENTERPRISE", enterpriseId }` | Complete checkout button |
| ACTIVE / TRIALING / PAST_DUE / UNPAID / PAUSED | `{ type: "managed" }` | Contact-sales note |

**Personal plan section gate** (`!isEnterpriseOwner`) from the previous session is preserved — enterprise owners still cannot see or interact with personal plan choices.

**Enterprise member read-only** (`MembershipNoticeCard`) is unchanged.

### Scenario verification (code-inspection)

| User scenario | Personal plan section | Enterprise plan section | Checkout action visible |
|---|---|---|---|
| Personal-only, no sub | ✓ Shown, Subscribe | Hidden | ✓ Yes (CREATOR) |
| Personal-only, active sub | ✓ Shown, Manage billing | Hidden | No (portal) |
| Enterprise owner, no sub | Hidden | ✓ Shown, **Subscribe** | ✓ Yes (ENTERPRISE) |
| Enterprise owner, active sub | Hidden | ✓ Shown, contact-sales note | No |
| Enterprise member, non-owner | ✓ Shown (own plan) | Hidden | Membership card only |

### Files changed

| File | Change |
|---|---|
| `app/(dashboard)/dashboard/billing/page.tsx` | `resolveAction`: enterprise branch now checks subscription state before returning `managed`; checkout returned for no-sub and INCOMPLETE cases |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; routes unchanged; /dashboard/billing ƒ Dynamic
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies `status === "pending"`, then either adds an existing signed-in user to `EnterpriseMember` or redirects to `/signup?invite={token}` for new users.

---

## Session: Billing plan visibility gating — 2026-06-29

### What was done

Added section-level plan visibility gating to `/dashboard/billing` and a matching server-side guard in the checkout-session API.

**UI gating (section-level):**
- Enterprise owners (`ownedEnterprises.length > 0`) no longer see the "Personal plan" section at all.
- Personal users already couldn't see the "Enterprise plans" section (gated by `ownedEnterprises.length > 0` — no change needed).
- Enterprise members (non-owners) are unchanged: they continue to see the read-only membership cards and (if applicable) a personal plan section with no enterprise purchase controls.

**API guard:**
- `/api/stripe/checkout-session` now rejects `CREATOR` plan checkout requests from users who own any enterprise. Returns 403 with `"Enterprise accounts cannot subscribe to personal plans"`. This mirrors the existing `ENTERPRISE` plan guard pattern (which already rejects non-owners from subscribing to enterprise plans). Both guards now live together in the account-type validation block at the top of the handler.

**What was already handled:**
- Personal-only users couldn't reach enterprise plans in the UI (the enterprise sections are already gated on `ownedEnterprises.length > 0`). No UI change needed for that case.
- Enterprise member read-only cards were already working correctly from the previous session.

### Scenario verification (code-inspection)

| Scenario | Personal plan section | Enterprise plan section | Membership section | API: CREATOR checkout | API: ENTERPRISE checkout |
|---|---|---|---|---|---|
| Personal-only user | ✓ Shown | Hidden | Hidden | ✓ Allowed | 403 Forbidden (no owned enterprise) |
| Enterprise owner | **Hidden** | ✓ Shown (managed note) | Hidden | **403 Forbidden** | ✓ Allowed (ownership verified) |
| Enterprise member (non-owner) | ✓ Shown | Hidden | ✓ Shown (read-only) | ✓ Allowed | 403 Forbidden |

### Files changed

| File | Change |
|---|---|
| `app/(dashboard)/dashboard/billing/page.tsx` | Added `isEnterpriseOwner` flag; wrapped personal plan section in `{!isEnterpriseOwner && ...}` |
| `app/api/stripe/checkout-session/route.ts` | Added CREATOR plan guard: rejects enterprise owners attempting personal plan checkout |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; routes unchanged; /dashboard/billing ƒ Dynamic
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies `status === "pending"`, then either adds an existing signed-in user to `EnterpriseMember` or redirects to `/signup?invite={token}` for new users.

---

## Session: Enterprise billing suppression — 2026-06-29

### What was done

Enterprise-owned plans on `/dashboard/billing` no longer show a self-serve billing button. Billing for enterprise accounts is B2B-managed, so the "Subscribe", "Complete checkout", and "Manage billing" buttons are suppressed. In their place, the `EnterprisePlanCard` footer shows a short explanatory note with a `mailto:sales@youmimic.com` link.

The change is in the action-resolution layer (`resolveAction`), not conditional JSX hiding. `resolveAction` returns a new `{ type: "managed" }` action when `enterpriseId` is present. `BillingActionButton` renders the support note for this action type. `PersonalPlanCard` and `MembershipNoticeCard` are completely unchanged.

### Technical notes

- Added `| { type: "managed" }` to the `BillingAction` discriminated union.
- `resolveAction` now has an early return for `enterpriseId !== undefined` that returns `{ action: { type: "managed" }, label: "", variant: "outline" }`. The downstream checkout/portal logic is now personal-plan-only — no enterprise-specific branches remain in the lower half of the function.
- `BillingActionButton` has an early return for `action.type === "managed"` (after hook declarations). TypeScript requires a narrowing guard inside the `handleClick` function declaration as well; a one-line `if (action.type === "managed") return;` inside the function body provides this (function declarations are hoisted and do not benefit from the outer early-return narrowing).

### Files changed

| File | Change |
|---|---|
| `components/dashboard/billing-actions.tsx` | Added `{ type: "managed" }` to `BillingAction`; added managed rendering path and inner guard in `BillingActionButton` |
| `app/(dashboard)/dashboard/billing/page.tsx` | `resolveAction`: early return for enterprise; simplified lower branches to personal-plan-only |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; routes unchanged; /dashboard/billing ƒ Dynamic
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies `status === "pending"`, then either adds an existing signed-in user to `EnterpriseMember` or redirects to `/signup?invite={token}` for new users.

---

## Session: Capture location workflow — 2026-06-29

### What was done

Added a full capture location workflow to the bookings feature. Every new or edited booking now requires the user to specify where the capture session will take place. Historical rows safely receive NULL for all location columns.

### Schema changes

Two new Prisma enums: `CaptureLocationType { capital_city | regional_other | multi_location }` and `AustralianCapitalCity { sydney | melbourne | brisbane | perth | adelaide | hobart | canberra | darwin }`.

Eight nullable columns added to `Booking`: `captureLocationType`, `capitalCity`, `suburbOrTown`, `stateOrTerritory`, `postcode`, `addressLine1`, `addressLine2`, `locationNotes`.

Migration: `20260629000000_add_capture_location/migration.sql` — all `ADD COLUMN` with no defaults; safe for existing rows (historical rows get NULL).

### Validation changes (`lib/validations/booking.ts`)

- Exported location constants, types, and `CAPITAL_CITY_LABELS` record.
- Added all 8 location fields to the Zod schema.
- Replaced the old `.refine()` participants check with a single `.superRefine()` that also enforces location conditional requirements: `capital_city` → `capitalCity` required; `regional_other` → suburb/town, state/territory, postcode required; `multi_location` → locationNotes required.
- Fixed Zod v4 API: `{ required_error }` → `{ error }` on `z.enum()`, and `z.ZodIssueCode.custom` → `"custom"`.

### Resolver change

Both dialog files switched from `zodResolver` to `standardSchemaResolver` (`@hookform/resolvers/standard-schema`). Zod v4 schemas using `.superRefine()` don't satisfy the `z4.$ZodType` constraint in `zodResolver`'s overloads, leaving `TFieldValues` unresolved. Zod v4 implements Standard Schema; `standardSchemaResolver` infers the form type correctly. Runtime behavior is identical.

### UI changes (both dialogs)

A location section appears inside the non-contact-sales branch, after captures count:
1. Location type select — clears all dependent fields on type change.
2. `capital_city` → capital city select (8 Australian capitals).
3. `regional_other` → suburb/town (req), state/territory (req), postcode (req), address line 1/2 (optional), location notes (optional).
4. `multi_location` → location notes (req) with helper text.

EditDialog pre-fills from the existing booking's location fields. Old bookings show empty location state — user must fill location when editing.

### Bookings table

Added a "Location" column (`lg:table-cell`). Shows city name, suburb+state, "Multi-location", or "—" for historical rows.

### Files changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added 2 enums; 8 nullable fields on `Booking` |
| `prisma/migrations/20260629000000_add_capture_location/migration.sql` | **Created** — safe additive migration |
| `lib/validations/booking.ts` | Location constants + fields + `superRefine`; Zod v4 API fixes |
| `app/api/bookings/route.ts` | Persist all 8 location fields |
| `app/api/bookings/[id]/route.ts` | Same for PATCH |
| `components/dashboard/new-booking-dialog.tsx` | Location section; `standardSchemaResolver` |
| `components/dashboard/booking-actions.tsx` | `BookingForActions` extended; EditDialog location section; `standardSchemaResolver` |
| `app/(dashboard)/dashboard/bookings/page.tsx` | Location fields in query + mapping + table column |

### Checks run

```
npx prisma generate → clean
npm run lint        → 0 errors, 2 warnings (both pre-existing)
npm run typecheck   → clean
npm run build       → clean; routes unchanged
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies `status === "pending"`, then either adds an existing signed-in user to `EnterpriseMember` or redirects to `/signup?invite={token}` for new users.

---

## Session: Billing page support note — 2026-06-29

### What was done

Added a muted billing support line at the bottom of `/dashboard/billing`, after the payment history section. `sales@youmimic.com` is rendered as a styled `mailto:` link. No billing logic, routes, or architecture changed.

### Placement decision

After inspecting all four sections (Personal plan → Enterprise plans → Enterprise memberships → Payment history), the bottom of the page after payment history is the most natural position — it sits below all actionable controls without interrupting them, reads as helpful context rather than a warning, and matches the industry convention for support contact on billing pages.

### No copy-to-clipboard

The booking dialog copy pattern requires `"use client"`. Adding a client component just for this would broaden scope unnecessarily. The task's scope guard calls for just the `mailto:` link in this milestone.

### Files changed

| File | Change |
|---|---|
| `app/(dashboard)/dashboard/billing/page.tsx` | Added billing support `<p>` with `mailto:` link after payment history section |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; routes unchanged
```

---

## Session: External links section on dashboard — 2026-06-29

### What was done

Added an "External links" section below "Getting started" on the dashboard page. Five cards link to external tools. Hologram is marked "Coming soon" but still has a Vimeo preview link.

### Files changed

| File | Change |
|---|---|
| `app/(dashboard)/dashboard/page.tsx` | Added `ExternalLinksSection` + `ExternalLinkCard` components; new section in page JSX; added `Bot`, `ExternalLink`, `Languages`, `Presentation`, `Sparkles`, `Video` lucide imports |

### URLs used

| Card | URL |
|---|---|
| HeyGen | https://app.heygen.com |
| Interactive Avatar | https://app.liveavatar.com/home |
| Hologram (preview) | https://vimeo.com/1202651661/1f14b9b8a7?fl=ip&fe=ec |
| PPT to Video | https://app.heygen.com/ppt-to-video |
| Translate | https://app.heygen.com/video-translate |

### Implementation detail

- `ExternalLinkCard` mirrors `GettingStartedCard` exactly — same `Card/CardHeader/CardTitle/CardDescription/CardContent` structure, same `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` grid.
- Uses `<a target="_blank" rel="noopener noreferrer">` with a trailing `ExternalLink` icon (lucide, 3.5×3.5) instead of `<Link>`.
- Optional `badge` prop: renders a muted rounded-full chip in `CardTitle` (right-aligned via `ml-auto`) — used for "Coming soon" on Hologram.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; routes unchanged
```

---

## Session: Contact-sales email link + copy button — 2026-06-29

### What was done

Refined the 10+ contact-sales notice in both booking dialogs: the sales email is now a visually distinct `mailto:` link and has an inline copy-to-clipboard icon button. No business logic changed.

### Files changed

| File | Change |
|---|---|
| `components/dashboard/new-booking-dialog.tsx` | Added `Check`, `Copy` imports; `emailCopied` state; `copyEmail()` handler; replaced contact-sales block |
| `components/dashboard/booking-actions.tsx` | Same changes in `EditDialog` |

### Implementation detail

- Email rendered as `<a href="mailto:...">` with `text-primary underline underline-offset-4` classes.
- Copy button: `Button` (ghost, icon-xs) with `Copy` icon; on click calls `navigator.clipboard.writeText("sales@youmimic.com")`, then sets `emailCopied = true` for 2 seconds and reverts (icon swaps to `Check` in green).
- `emailCopied` reset to `false` in `handleOpenChange` on close, so next open starts clean.
- No toast system required; inline icon feedback is sufficient and consistent with the existing UI.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; routes unchanged
```

---

## Session: Timezone fix for booking date minimum — 2026-06-29

### What was done

Fixed a timezone bug in the booking lead-time calculation. `minBookingDateISO()` (in both dialog files) called `d.setHours(0,0,0,0)` to get local midnight, then formatted via `toISOString().split("T")[0]`. In UTC+ timezones (e.g. UTC+5:45 Nepal), local midnight is the previous day in UTC, so the formatted string came out one day early — returning Wednesday instead of Thursday as the minimum when today is Monday. Also fixed the same pattern in `todayISODate()` in the validation schema for consistency.

### What was inspected

- `components/dashboard/new-booking-dialog.tsx` — `minBookingDateISO()` used `toISOString().split("T")[0]`.
- `components/dashboard/booking-actions.tsx` — identical pattern in `EditDialog`.
- `lib/validations/booking.ts` — `todayISODate()` had the same `toISOString()` pattern.

### Files changed

| File | Change |
|---|---|
| `components/dashboard/new-booking-dialog.tsx` | `minBookingDateISO`: replaced `toISOString().split("T")[0]` with `getFullYear()/getMonth()/getDate()` local formatting |
| `components/dashboard/booking-actions.tsx` | Same fix in `EditDialog` |
| `lib/validations/booking.ts` | `todayISODate`: same fix |

### Root cause

`Date.prototype.toISOString()` always returns UTC. For any UTC+ timezone, midnight local time is earlier than UTC midnight, so the date string is one calendar day behind the correct local date. Replacing with `getFullYear()` / `getMonth()` / `getDate()` reads local date components directly.

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; routes unchanged
```

---

## Session: Booking lead time + 10+ contact-sales flow — 2026-06-29

### What was done

Updated the booking flow with two product changes:
1. **Lead time reduced from 7 calendar days to 3 business days** — enforced in both the UI date input minimum and the Zod server-side validation.
2. **"10+ (Contact sales)" option added** — a UI-only sentinel in the capture-count select; selecting it clears the self-serve form fields, hides the submit button, and shows a contact notice + `mailto:sales@youmimic.com` link. The sentinel is never submitted to the API.

### What was inspected

- `components/dashboard/new-booking-dialog.tsx` — `minBookingDateISO()` used `d.setDate(d.getDate() + 7)` (calendar days). Captures select rendered `1–MAX_CAPTURES` numeric items only with `onValueChange` doing `Number(val)` directly.
- `components/dashboard/booking-actions.tsx` — identical `minBookingDateISO()` in `EditDialog`. Same numeric-only captures select.
- `lib/validations/booking.ts` — `isAtLeastAWeekAway()` function: `diffDays >= 7`. Error message: `"Date must be at least 7 days from today"`. `isWeekday` check also present and kept.
- `app/api/bookings/route.ts` and `app/api/bookings/[id]/route.ts` — no lead-time enforcement here; Zod schema handles it. No changes needed to API routes.
- `lib/booking-time.ts` — `addHoursToTime` utility; unchanged.

### Implementation

**`lib/validations/booking.ts`**
- Replaced `isAtLeastAWeekAway` with `isAtLeast3BusinessDaysAway`: counts business days (Mon–Fri) from today (exclusive) to the target date (inclusive); requires `businessDays >= 3`.
- Updated `.refine()` error message to `"Date must be at least 3 business days from today"`.
- `isWeekday`, `notInPast`, and all other validation unchanged.

**`components/dashboard/new-booking-dialog.tsx`**
- Updated `minBookingDateISO()`: advances one day at a time, skipping Sat/Sun, until 3 business days have been added. Same `toISOString().split("T")[0]` pattern as before.
- Added `const CONTACT_SALES_SENTINEL = "contact-sales"` (file-level constant).
- Added `const [contactSales, setContactSales] = useState(false)`.
- Updated `handleOpenChange` to reset `contactSales` on close.
- Added `if (contactSales) return;` guard at start of `onSubmit`.
- Captures `Select.value`: `contactSales ? CONTACT_SALES_SENTINEL : String(field.value)`.
- Captures `onValueChange`: sentinel path → `setContactSales(true)` + `form.reset(defaults)`; numeric path → `setContactSales(false)` + `field.onChange(Number(val))`.
- Added `<SelectItem value={CONTACT_SALES_SENTINEL}>10+ (Contact sales)</SelectItem>` after numeric items.
- Date field: `{!contactSales && <FormField name="requestedDate" ...>}`.
- Times + Participants + Notes: wrapped in `{contactSales ? <ContactSalesNotice> : <> ...all fields... </>}`.
- `DialogFooter`: `{!contactSales && <Button type="submit">}` — submit hidden in contact-sales mode.

**`components/dashboard/booking-actions.tsx`** (`EditDialog` only)
- Identical changes to above. `CancelDialog` and `BookingActions` are byte-for-byte unchanged.
- `contactSales` state is also reset in `handleOpenChange` when the edit dialog closes.

### Files changed

| File | Change |
|---|---|
| `lib/validations/booking.ts` | `isAtLeastAWeekAway` → `isAtLeast3BusinessDaysAway`; error message updated |
| `components/dashboard/new-booking-dialog.tsx` | `minBookingDateISO` → 3 business days; contactSales state + 10+ option |
| `components/dashboard/booking-actions.tsx` | Same changes in `EditDialog`; `CancelDialog`/`BookingActions` unchanged |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; 27 routes; ƒ Proxy confirmed
```

### Manual verification (code-inspection level)

Full runtime testing requires a running app with a live DB. Code-inspection verification:

- **Lead time enforcement**: `isAtLeast3BusinessDaysAway` counts Mon–Fri days only; e.g. today=Monday → earliest valid date is Thursday (3 business days). `isWeekday` still prevents Saturday/Sunday selection. UI `minBookingDateISO()` computes the same date for the HTML `min` attribute.
- **10 captures still valid**: `MAX_CAPTURES = 10` generates numeric items `1–10`; `capturesCount.max(10)` unchanged. A user can still select "10 captures" as a numeric self-serve option.
- **CONTACT_SALES_SENTINEL never reaches API**: `onSubmit` returns early if `contactSales === true`; the submit button is not rendered; sentinel is never serialized into the API payload.
- **Form reset on sentinel selection**: `form.reset({ requestedDate: "", capturesCount: 1, ... })` clears all self-serve fields when 10+ is selected.
- **Edit dialog safety**: selecting 10+ in edit mode shows the notice and hides "Save changes"; closing the dialog resets `contactSales = false` so the next open starts clean.

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.
8. Invite acceptance page (`/invite/[token]`) not yet built — accept links in invite emails lead to 404.

### Recommended next milestone

**Invite acceptance flow** — `/invite/[token]` page that resolves the token, verifies it is `pending` and not expired, then either: (a) adds an existing signed-in user to `EnterpriseMember`; or (b) redirects a new user to `/signup?invite={token}` pre-filled with the invited email so registration completes membership linkage.

---

## Session: Enterprise invite flow — 2026-06-29

### What was done

Implemented the first slice of the enterprise invite flow. Business owners now see a "Team" card on `/dashboard/settings` with an email invite form. Submitting the form creates an `Invite` record in the DB and sends an invite email via Resend. No invite acceptance page yet — that is the next milestone.

### What was inspected

- `prisma/schema.prisma` — `Invite` model confirmed: `enterpriseId`, `email`, `roleId`, `token` (unique), `status` (default "pending"), `invitedById`, `createdAt`. All fields usable without a schema change.
- `emails/templates/verify-email.tsx` + `emails/config.ts` — React Email template shape and brand palette (teal gradient header, `#ECEAE9` background).
- `lib/mailer.ts` — `sendVerifyEmail` / `sendContactNotificationEmail` pattern: `getFromEmail()`, `resend.emails.send()`, optional `idempotencyKey`.
- `lib/validations/contact.ts` — Zod schema + `normalizeEmail` transform pattern.
- `components/marketing/contact-form.tsx` — client form pattern: react-hook-form + zodResolver + `fieldErrors` mapping + success state.
- `app/api/bookings/route.ts` — authenticated POST pattern: `auth()` → 401; ownership/entitlement check → 403; Zod parse → 422; Prisma write.
- `app/(dashboard)/dashboard/settings/page.tsx` — two `Card` sections; `Promise.all` query pattern not yet present (sequential).
- `components/ui/button.tsx` — `size="sm"` and `variant="outline"` confirmed valid.
- No existing invite routes, email templates, or validation schemas existed.

### Implementation

**`lib/validations/invite.ts`** (new)
- Single field: `email` with `normalizeEmail` transform + regex refine, matching the existing email validation pattern.

**`emails/templates/invite-email.tsx`** (new)
- React Email template matching the brand palette: teal gradient header, `#ECEAE9` body background, teal CTA button.
- Props: `enterpriseName`, `inviterName`, `acceptUrl`.
- Accept link points to `{BASE_URL}/invite/{token}` — route not yet built, but token is stored in DB so the link is future-safe.

**`lib/mailer.ts`** (updated)
- Added `sendInviteEmail({ to, inviterName, enterpriseName, acceptUrl, idempotencyKey })`.
- Uses `idempotencyKey: invite/${invite.id}` to prevent duplicate sends if the handler is retried.

**`app/api/invites/route.ts`** (new)
- `auth()` → 401 if unauthenticated.
- `prisma.enterprise.findFirst({ where: { ownerUserId } })` → 403 if user owns no enterprise.
- JSON parse → Zod `inviteSchema.safeParse` → 422 on failure.
- Duplicate pending invite check for same `(enterpriseId, email)` → 409.
- `role.upsert({ where: { name: "member" } })` — idempotent, same pattern as the "owner" role upsert during signup.
- `crypto.randomUUID()` for the invite token.
- `invite.create(...)` then `sendInviteEmail(...)` best-effort (email failure is logged but does not fail the request).
- `revalidatePath("/dashboard/settings")`.
- Returns `201` with `{ invite: { id, email, createdAt } }`.

**`components/dashboard/invite-form.tsx`** (new)
- `"use client"` component; react-hook-form + zodResolver.
- Success state: shows confirmed email + "Invite another member" button (resets form).
- Error banner with dismiss (X) button, matching contact-form.tsx pattern.
- `form.setError("email", ...)` for server-side field errors (e.g., duplicate pending invite).

**`app/(dashboard)/dashboard/settings/page.tsx`** (updated)
- Added `export const dynamic = "force-dynamic"`.
- Added `fetchOwnedEnterprise(userId)` helper.
- Converted sequential queries to `Promise.all([fetchUser, fetchOwnedEnterprise])`.
- Added `TeamCard` component (visible only when `enterprise !== null`): shows workspace name + `<InviteForm enterpriseName={...} />`.
- Individual users see no change — `enterprise` is `null`, `TeamCard` is not rendered.

### Files changed

| File | Change |
|---|---|
| `lib/validations/invite.ts` | **Created** — Zod invite email schema |
| `emails/templates/invite-email.tsx` | **Created** — React Email invite template |
| `lib/mailer.ts` | Added `sendInviteEmail` |
| `app/api/invites/route.ts` | **Created** — POST invite handler |
| `components/dashboard/invite-form.tsx` | **Created** — client invite form |
| `app/(dashboard)/dashboard/settings/page.tsx` | Added `force-dynamic`, `fetchOwnedEnterprise`, parallel queries, `TeamCard` |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; 27 routes; /api/invites ƒ Dynamic; /dashboard/settings ƒ Dynamic; ƒ Proxy confirmed
```

### Manual verification

Full runtime verification requires a live Neon connection. Code-inspection verification:

- **401 path**: `auth()` returns no session → `{ error: "Unauthorized" }` 401. ✓ (same pattern as `/api/bookings`)
- **403 path**: user has no `Enterprise` with `ownerUserId` → `{ error: "Only enterprise owners can send invites" }` 403. ✓
- **422 path**: invalid email → Zod `safeParse` fails → `fieldErrors` 422. ✓
- **409 path**: existing `pending` invite for same `(enterpriseId, email)` → `fieldErrors.email` 409. ✓
- **201 path**: invite record created, email sent (best-effort), 201 response. ✓ (code path confirmed)
- **Individual users**: `fetchOwnedEnterprise` returns `null` → `TeamCard` not rendered → settings page unchanged. ✓
- **Auth flow unchanged**: no changes to `auth.ts`, `next-auth.d.ts`, middleware, or login/signup. ✓

### Notes and caveats

- The invite `acceptUrl` (`{BASE_URL}/invite/{token}`) is stored in the sent email and in the `Invite.token` column. The accept route (`/invite/[token]`) does not exist yet — users clicking the link get a 404 until the next milestone.
- `"member"` role is upserted per invite send. On the first invite from any enterprise, this creates the role; subsequent invites reuse it. Idempotent.
- Email is best-effort: if Resend fails, the invite is still created in the DB. The owner would need to resend manually or the accept flow can be triggered by resending the link.
- No invite list is shown on the settings page yet (next milestone).

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

**Invite acceptance flow** — build `/invite/[token]` page that:
1. Looks up the invite by token; shows 404/expired if not found or `status !== "pending"`.
2. If the invited email already has a YouMimic account, prompts login and adds them to the `EnterpriseMember` table.
3. If no account exists, redirects to `/signup` pre-filled with the invited email and a `?invite={token}` query param so the signup can complete membership linkage.

**Or alternatively:** show a pending-invites list on the settings page (query `prisma.invite.findMany({ where: { enterpriseId, status: "pending" } })`) so the owner can see who has been invited.

---

## Session: Post-signup onboarding split — 2026-06-29

### What was done

Added differentiated "Getting started" content on the dashboard landing page. A server-side Prisma query checks whether the authenticated user owns an `Enterprise` row. Individual users see personal setup steps; Business owners see workspace-focused steps. No auth flow, schema, or middleware changes were made.

### What was inspected

- `app/(dashboard)/dashboard/page.tsx` — existing landing page: just a greeting, no onboarding content. Already calls `auth()`.
- `app/(dashboard)/layout.tsx` — calls `auth()` and redirects unauthenticated users; `DashboardShell` wraps children.
- `components/dashboard/dashboard-shell.tsx` — client component; sidebar + header + `<main>` container.
- `prisma/schema.prisma` — `Enterprise.ownerUserId` FK to `User.id`; `@@index([ownerUserId])` already present.
- `auth.ts` / `next-auth.d.ts` — `session.user.id` typed as `string`; no changes needed.
- `components/ui/card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` — confirmed slot-based grid layout; icon inline inside `CardTitle` flex span works correctly.
- `app/(dashboard)/dashboard/billing/page.tsx` — confirmed `force-dynamic` and Prisma query patterns.

### Implementation

**`app/(dashboard)/dashboard/page.tsx`** — single file changed.

- Added `export const dynamic = "force-dynamic"`.
- Imported `prisma` and ran a single `findFirst` query:
  ```ts
  const enterprise = userId
    ? await prisma.enterprise.findFirst({
        where: { ownerUserId: userId },
        select: { id: true, name: true },
      })
    : null;
  ```
- If `enterprise !== null` → render `<BusinessGettingStarted enterpriseName={...} />`.
- If `enterprise === null` → render `<IndividualGettingStarted />`.
- Both variants render a `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` of three `GettingStartedCard` components using shadcn `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`.
- **Individual cards**: "Set up your avatar" → `/dashboard/avatars`, "Book a capture session" → `/dashboard/bookings`, "Manage your plan" → `/dashboard/billing`.
- **Business cards**: `{enterpriseName}` → `/dashboard/settings`, "Set up your avatars" → `/dashboard/avatars`, "Enterprise billing" → `/dashboard/billing`.
- No blocking navigation, no mandatory workflow — content differentiation only.

### Files changed

| File | Change |
|---|---|
| `app/(dashboard)/dashboard/page.tsx` | Added Prisma enterprise query + Individual/Business getting-started card grids |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing)
npm run typecheck → clean
npm run build     → clean; 26 routes; /dashboard ƒ Dynamic; ƒ Proxy confirmed
```

### Manual verification

Full runtime verification requires a live Neon connection (not available locally). Code-inspection verification:

- **Business owner path**: `enterprise !== null` branch renders `BusinessGettingStarted` with `enterprise.name`. The `Enterprise` model's `ownerUserId` index ensures the `findFirst` is efficient.
- **Individual path**: `enterprise === null` (no owned enterprise row) renders `IndividualGettingStarted`. This covers all Individual-signup users and any Business-signup user whose enterprise creation failed (transaction atomicity prevents partial state, so this edge case should not occur in practice).
- **Auth unchanged**: `auth()` is already called in the layout; the dashboard page re-calls it only to extract `userId` for the Prisma query. No new auth surfaces.
- **No schema or migration changes** — query uses the existing `Enterprise.ownerUserId` field and index.

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

- **Enterprise invite flow** — allow the Business owner to invite team members via the existing `Invite` model. The `Invite` table (`email`, `roleId`, `token`, `status`, `enterpriseId`) is already in the schema; the invite-send and invite-accept API routes need to be built.
- **Workspace settings page** — the Business owner's "Workspace Settings" card currently links to `/dashboard/settings` (personal settings). A dedicated workspace page at `/dashboard/settings/workspace` would show the enterprise name, member list, and invite management.

---

## Session: Individual / Business account type at signup — 2026-06-29

### What was done

Extended the existing signup flow so users choose Individual or Business before creating their account. No new auth routes, no new Prisma migrations — the `Enterprise` and `EnterpriseMember` tables already existed in the schema.

### What was inspected

- `app/signup/page.tsx` — single-page client form, react-hook-form + zodResolver, extends `registerSchema` with confirmPassword
- `app/api/register/route.ts` — thin POST handler, delegates to `registerUser()`
- `lib/auth/register-user.ts` — validates, checks duplicate email, creates user + verification token in one `$transaction`, sends verify email
- `lib/validations/auth.ts` — `registerSchema` with name/email/password and legal consent fields
- `prisma/schema.prisma` — `Enterprise` (ownerUserId FK), `EnterpriseMember` (enterpriseId + userId + roleId, all non-nullable), `Role` (name unique)
- `app/api/verify-email/route.ts` — untouched; email verification flow unchanged
- `auth.ts` — untouched; login flow unchanged
- `components/ui/` — no RadioGroup or ToggleGroup installed; bespoke segmented control built

### Implementation

**`lib/validations/auth.ts`**
- Added `ACCOUNT_TYPES = ["INDIVIDUAL", "BUSINESS"] as const` and `AccountType` type export.
- Added `accountType: z.enum(ACCOUNT_TYPES)` (required, no default — avoids zodResolver input/output type mismatch).
- Added `businessName: z.string().trim().max(200).optional()`.
- Exported `RegisterOutput` for downstream type use.

**`lib/auth/register-user.ts`**
- Destructures `accountType` and `businessName` from `parsed.data`.
- Server-side guard: if `accountType === "BUSINESS" && !businessName` → returns `fieldErrors.businessName` before touching the DB.
- `$transaction` now branches: INDIVIDUAL path is unchanged; BUSINESS path additionally:
  1. `upsert` the `"owner"` role (idempotent — safe whether role is seeded or not).
  2. `create` an `Enterprise` with `ownerUserId = createdUser.id`.
  3. `create` an `EnterpriseMember` linking the user as owner.
  All three writes are atomic in the same transaction — no orphan risk on partial failure.

**`app/signup/page.tsx`**
- `signupFormSchema` replaces the old `.refine()` confirmPassword check with a single `.superRefine()` that handles both passwords-match and businessName-required-for-BUSINESS.
- `KNOWN_FIELD_KEYS` Set replaces the previous manual key comparison for server error mapping — now includes `accountType` and `businessName`.
- Account type segmented control: two `<button type="button">` elements styled with `cn()` using `bg-primary text-primary-foreground` for the active state, consistent with the existing palette. Switching to Individual clears `businessName` and re-triggers its validation.
- `businessName` field rendered conditionally (`accountType === "BUSINESS"`) between email and password fields.
- `aria-pressed` on each toggle button for accessibility.
- `autoComplete="organization"` on `businessName` input.

### TypeScript note

`zodResolver` types the form `TFieldValues` against the schema's *input* type. A field with `.default()` becomes optional in the input type, causing a mismatch with `z.infer` (which returns the output type). Fixed by making `accountType` a plain required enum — the form's `defaultValues` always supplies it.

### Files changed

| File | Change |
|---|---|
| `lib/validations/auth.ts` | Added `ACCOUNT_TYPES`, `AccountType`, `accountType` field, `businessName` field, `RegisterOutput` export |
| `lib/auth/register-user.ts` | Rewritten to handle BUSINESS path atomically; role upsert + enterprise + member in same transaction |
| `app/signup/page.tsx` | Added account type toggle UI, conditional businessName field, updated schema + error mapping |

### Checks run

```
npm run lint      → 0 errors, 2 warnings (both pre-existing: lib/prisma.ts unused directive, react-hooks/incompatible-library on form.watch)
npm run typecheck → clean
next build        → clean; 25 routes; ƒ Proxy confirmed
npm run build     → fails at prisma migrate deploy (Neon unreachable from local machine — network issue only, not a code issue; no migration was required)
```

### Manual verification results (confirmed in running app — 2026-06-29)

All six cases passed:

1. **Individual signup** — creates only a `User` row and an `EmailVerificationToken`. No enterprise or enterprise-member records created. ✓
2. **Business signup** — creates `User`, `Enterprise` (with `ownerUserId` set to the new user), and `EnterpriseMember` (owner role) atomically in a single transaction. ✓
3. **Business signup with missing business name** — server returns `fieldErrors.businessName`; client renders the inline error beneath the field. ✓
4. **Duplicate email** — returns 409 with `fieldErrors.email` as before. ✓
5. **Email verification flow** — verification link works for both Individual and Business registrations; redirects to `/login?verified=1` unchanged. ✓
6. **Login after verification** — credentials login succeeds and redirects to `/dashboard` for both account types. ✓

### Notes and caveats

- No Prisma schema migration was required. `Enterprise`, `EnterpriseMember`, and `Role` tables already existed.
- The `"owner"` role is created via `role.upsert()` inside the BUSINESS transaction. This is idempotent — if the role is already seeded it is reused; if absent it is created. Confirmed working in the deployed environment.
- `accountType` is **not stored** on the `User` model. The only DB signal for account type post-signup is whether the user owns an `Enterprise` row. Any future onboarding split must derive account type from this relationship, or persist it explicitly.

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

- Post-signup onboarding split: redirect Individual users to a personal dashboard setup step, Business users to a team/enterprise setup step.
- Enterprise invite flow: allow the owner to invite team members via the `Invite` model (already in schema).
- Optional individual profile metadata (company name as display-only, not enterprise creation).

---

## Session: Header height drift-proofing — 2026-06-27

### What was done

Centralized the `h-16` / `top-16` header height tokens so they can never drift out of sync. A single plain `.ts` config file exports two string constants; both consumers import from it.

### What was inspected

- `components/marketing/marketing-header-config.ts` — new config file (already created at session start)
- `components/marketing/marketing-header.tsx` — hardcoded `h-16` in inner div className
- `components/marketing/marketing-nav.tsx` — hardcoded `top-16` in backdrop div and panel div (two occurrences)

### Implementation

**`components/marketing/marketing-header-config.ts`** (new) — exports `HEADER_HEIGHT = "h-16"` and `HEADER_OFFSET = "top-16"` as plain string constants. No `"use client"` directive, so both server and client components import it without crossing the module boundary.

**`components/marketing/marketing-header.tsx`** — added `cn` and `HEADER_HEIGHT` imports; replaced `h-16` literal in inner div with `cn("mx-auto flex max-w-6xl ...", HEADER_HEIGHT)`.

**`components/marketing/marketing-nav.tsx`** — added `HEADER_OFFSET` import; replaced both `top-16` occurrences in backdrop and panel divs with `cn("fixed inset-0 z-30 sm:hidden", HEADER_OFFSET)` and `cn("fixed left-0 right-0 z-40 ...", HEADER_OFFSET)`.

### Files changed

| File                                              | Change                                       |
| ------------------------------------------------- | -------------------------------------------- |
| `components/marketing/marketing-header-config.ts` | Created — shared height constants            |
| `components/marketing/marketing-header.tsx`       | Import + use `HEADER_HEIGHT`                 |
| `components/marketing/marketing-nav.tsx`          | Import + use `HEADER_OFFSET` (2 occurrences) |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 25 routes; ƒ Proxy confirmed
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.

---

## Session: Mobile nav for marketing header — 2026-06-27

### What was done

Extended `MarketingNav` with a mobile hamburger toggle and dropdown panel. Desktop nav is unchanged. `MarketingHeader` remains a server component with no modifications.

### What was inspected

- `components/marketing/marketing-nav.tsx` — existing `"use client"` component; desktop `hidden sm:flex` nav with `usePathname` active state
- `components/marketing/marketing-header.tsx` — server component, `<MarketingNav />` already in position between logo and auth cluster
- `components/ui/` — no Sheet or Drawer primitive exists; Dialog is a centered modal (unsuitable for nav); bespoke approach required

### Implementation

Single file change: `components/marketing/marketing-nav.tsx`. Component now returns a fragment with three parts:

1. **Desktop nav** (`hidden sm:flex`) — unchanged.
2. **Hamburger button** (`sm:hidden`) — `Menu`/`X` icon toggle, `aria-label` and `aria-expanded` for accessibility. Visible only below `sm`, sits as a flex child between logo and auth cluster via `justify-between`.
3. **Mobile dropdown panel** (`fixed top-16`, `z-40`, `sm:hidden`) — full-width panel flush below the `h-16` sticky header. Transparent backdrop (`z-30`) beneath it closes the menu on outside tap. Each nav link has an `onClick` to close immediately on tap; active state uses `bg-muted text-foreground` (same Tailwind tokens as dashboard nav).

`useEffect` was intentionally avoided — the project's `react-hooks/set-state-in-effect` lint rule (same constraint documented in the SiteLogo session) blocks `setState` calls inside effect bodies. Close behavior is handled entirely by `onClick` on links and the backdrop.

### Mobile layout

| State  | Mobile header row                                         |
| ------ | --------------------------------------------------------- |
| Closed | Logo — ☰ — ThemeToggle + auth CTAs                       |
| Open   | Logo — ✕ — ThemeToggle + auth CTAs + dropdown panel below |

### Files changed

| File                                     | Change                                         |
| ---------------------------------------- | ---------------------------------------------- |
| `components/marketing/marketing-nav.tsx` | Added hamburger toggle + mobile dropdown panel |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 26 routes; ƒ Proxy confirmed
```

### Caveats

- Dropdown is `fixed top-16`. If the header height ever changes from `h-16`, this value must be updated to match.
- No animation on the dropdown open/close. Adding a CSS transition (e.g. `data-open:animate-in`) is a cosmetic follow-up.
- Active state in the mobile panel uses `bg-muted text-foreground` (filled highlight); desktop uses `text-foreground` only (text-only). Both are intentionally different — the larger touch targets in the mobile panel benefit from a background fill.

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
5. Explicit `select` audit for avatars and settings pages.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

**Dropdown open/close animation** — add a subtle slide-down + fade-in transition to the mobile panel using Tailwind's `animate-in` / `slide-in-from-top-2` classes for a polished feel. Or move on to a higher-priority product milestone such as the payment history pagination or the `/contact` Vercel env var.

---

## Session: Active nav link state — 2026-06-27

### What was done

Extracted the marketing nav into a `"use client"` subcomponent (`MarketingNav`) that uses `usePathname()` to apply an active style to the current route. `MarketingHeader` remains an async server component — only the nav is a client boundary.

### What was inspected

- `components/marketing/marketing-header.tsx` — confirmed `navLinks` array and inline `<nav>` block; server component with `auth()`; all three routes (`/solutions`, `/pricing`, `/contact`) already confirmed present

### Implementation

**New file: `components/marketing/marketing-nav.tsx`** — `"use client"` component.

- Owns the `navLinks` array (`/solutions`, `/pricing`, `/contact`).
- Uses `usePathname()` to compare the current path against each `href`.
- Active link: `text-foreground`; inactive: `text-muted-foreground hover:text-foreground`. Uses `cn()` for conditional class merge.
- Renders the same `<nav className="hidden items-center gap-6 sm:flex">` wrapper as before — responsive behavior unchanged.

**Updated: `components/marketing/marketing-header.tsx`**

- Removed inline `navLinks` array and `<nav>` block.
- Imports and renders `<MarketingNav />` in the same position.
- All auth-aware CTA logic and `auth()` call unchanged.

### Files changed

| File                                        | Change                                                             |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `components/marketing/marketing-nav.tsx`    | **Created** — `"use client"` nav with `usePathname()` active state |
| `components/marketing/marketing-header.tsx` | Replaced inline nav with `<MarketingNav />`                        |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 26 routes; ƒ Proxy confirmed
```

### Caveats

- Active state is an exact `pathname === href` match. Sub-paths (e.g. `/solutions/something`) would not highlight the parent nav link — not a concern for the current flat marketing routes.
- Nav remains hidden below `sm`; no mobile menu introduced.

### Remaining issues (carried forward)

1. Mobile nav (hamburger/drawer) — nav still hidden on mobile; future milestone.
2. `CONTACT_EMAIL` env var not yet set in Vercel.
3. `take: 20` hard cap on payment history — add pagination.
4. Zero-amount invoice 404 — no in-page fallback.
5. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
6. Explicit `select` audit for avatars and settings pages.
7. Create `production` GitHub environment in repo settings.
8. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

**Mobile nav** — add a simple sheet/drawer or collapsible menu triggered by a hamburger icon, visible only below `sm`. `MarketingNav` already owns the links data so it can be reused or extended for the mobile drawer without duplicating the route list.

---

## Session: Marketing header nav expansion — 2026-06-27

### What was done

Added a lightweight `<nav>` to `MarketingHeader` with links to `/solutions`, `/pricing`, and `/contact`. The existing auth-aware CTA behavior is fully preserved. Nav is hidden on mobile and visible from the `sm` breakpoint upward.

### What was inspected

- `components/marketing/marketing-header.tsx` — server component, `justify-between` flex row, Logo left / auth right; no nav existed
- `app/(marketing)/solutions/page.tsx`, `app/(marketing)/pricing/page.tsx`, `app/(marketing)/contact/page.tsx` — all three routes confirmed present

### Implementation

Single file change: `components/marketing/marketing-header.tsx`.

- Added `navLinks` array (`/solutions`, `/pricing`, `/contact`) above the component.
- Added `<nav className="hidden items-center gap-6 sm:flex">` as a middle flex child between Logo and the auth cluster. With the existing `justify-between` on the row, this naturally distributes: Logo (far left) | Nav (centre) | Auth (far right).
- Each nav link is a plain `<Link>` styled `text-sm font-medium text-muted-foreground transition-colors hover:text-foreground` — visually lighter than the Button CTAs, clear hierarchy between navigation and action.
- On mobile (`< sm`): nav is `hidden`, header reverts to the original Logo | Auth layout. No mobile menu system introduced.
- Auth-aware CTA block (sign-in/get-started vs dashboard) is unchanged.

### Responsive behavior

| Breakpoint             | Layout                                                         |
| ---------------------- | -------------------------------------------------------------- |
| `< sm` (mobile)        | Logo — ThemeToggle + auth CTAs (nav hidden)                    |
| `sm+` (tablet/desktop) | Logo — Solutions · Pricing · Contact — ThemeToggle + auth CTAs |

### Files changed

| File                                        | Change                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `components/marketing/marketing-header.tsx` | Added `navLinks` array + `<nav>` between logo and auth cluster |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 26 routes; ƒ Proxy confirmed
```

### Caveats

- No active-link highlighting — `MarketingHeader` is a server component and `usePathname()` requires a client component. Adding a client sub-component for active state is the natural follow-up.
- Nav is hidden on mobile. If a hamburger/drawer mobile menu is needed later it should be a separate milestone.

### Remaining issues (carried forward)

1. Active nav link highlighting — requires a small client component using `usePathname`.
2. Mobile nav (hamburger/drawer) — not yet implemented; noted as a future milestone.
3. `CONTACT_EMAIL` env var not yet set in Vercel.
4. `take: 20` hard cap on payment history — add pagination.
5. Zero-amount invoice 404 — no in-page fallback.
6. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — unconnected to code.
7. Explicit `select` audit for avatars and settings pages.
8. Create `production` GitHub environment in repo settings.
9. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

**Active nav link highlighting** — extract the three nav links into a small `"use client"` component (`NavLinks`) that uses `usePathname()` to apply an `text-foreground` active style to the current route. Drop-in replacement for the static links in the header.

---

## Session: Shared PricingPlans component — 2026-06-27

### What was done

Extracted the homepage pricing card grid into a shared `PricingPlans` component and wired both the homepage and pricing page to use it. Plans data and card markup now live in one place.

### Files changed

| File                                     | Change                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `components/marketing/pricing-plans.tsx` | **Created** — plans data + card grid extracted from homepage                                                                            |
| `app/(marketing)/page.tsx`               | Removed inline `plans` array, `CheckCircle2`/`Card*` imports; replaced grid with `<PricingPlans />`                                     |
| `app/(marketing)/pricing/page.tsx`       | Replaced simple three-card stub with `<PricingPlans />`; aligned heading/layout style with homepage; kept `isGated` subscription banner |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 26 routes; ƒ Proxy confirmed
```

### Notes

Future changes to plan names, prices, features, or CTA links only require editing `components/marketing/pricing-plans.tsx`.

---

## Session: Solutions marketing page — 2026-06-27

### What was done

Added a `/solutions` marketing page inside `app/(marketing)/` so it automatically inherits `MarketingHeader` + `MarketingFooter`. The page uses the supplied content formatted into a four-section production-quality landing page, reusing every design token and layout pattern from the homepage.

### What was inspected

- `app/(marketing)/page.tsx` — homepage patterns: `bg-muted` alternating sections, `bg-card border border-border rounded-xl` cards, `bg-accent/10 border-accent/20` icon containers, hardcoded `#191818` final CTA with radial gradients
- `app/(marketing)/layout.tsx` — confirms `(marketing)` route group provides header/footer automatically
- `components/marketing/marketing-header.tsx` — current nav: ThemeToggle + auth CTAs only; no established multi-link nav pattern
- `components/marketing/marketing-footer.tsx` — minimal footer
- `app/(marketing)/pricing/page.tsx` and `app/(marketing)/contact/page.tsx` — confirmed `/pricing` and `/contact` exist as link targets
- `components/ui/button.tsx` — `asChild` + `variant="outline"` / `variant="ghost"` patterns confirmed

### Implementation

Single new file: `app/(marketing)/solutions/page.tsx` — server component with `metadata`. Four sections:

1. **Hero** (`bg-muted`) — "How our clients are using their avatars" with supporting copy about CEOs/executives/educators/creators. Two CTA buttons: "Book a demo" → `/contact`, "View pricing" → `/pricing`.
2. **What you can create** (white) — 5 capability cards: Safety & Training Videos, 175+ Languages, User Generated Content, Investor Pitches & Market Reports, Team & Service Announcements. `lg:grid-cols-3` responsive grid, icon-led cards matching homepage features section.
3. **Built for every industry** (`bg-muted`) — 13 industry cards in `lg:grid-cols-3` grid: Government, Energy/Mining/Utilities, Advertising Agencies, Tourism & Events, Finance & Insurance, Entrepreneurs & Startups, Small Business, Corporate, Education & Training, Retail & e-Commerce, Health & Aged Care, Technology/Science/Medicine, Creators.
4. **Final CTA** (dark `#191818`) — "Ready to elevate your video messaging?" with radial ambient tints. "Book a demo" → `/contact`, "See pricing" → `/pricing`. Matches homepage final CTA palette exactly.

### Nav link decision

The `MarketingHeader` currently has no established multi-link nav (only auth CTAs). Adding a single `/solutions` link there without also adding `/pricing`, `/contact`, etc. would be inconsistent. Noted as a follow-up: expand header to a full nav row when the site has 3+ marketing routes worth surfacing.

### Files changed

| File                                 | Change                                      |
| ------------------------------------ | ------------------------------------------- |
| `app/(marketing)/solutions/page.tsx` | **Created** — full solutions marketing page |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 26 routes; /solutions ƒ Dynamic; ƒ Proxy confirmed
```

### Remaining issues (carried forward)

1. `MarketingHeader` has no nav links — expanding to Solutions / Pricing / Contact is a follow-up requiring a header redesign.
2. `CONTACT_EMAIL` env var not yet set in Vercel.
3. `take: 20` hard cap on payment history — add pagination.
4. Zero-amount invoice 404 — no in-page fallback when `hosted_invoice_url` is null.
5. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — in `.env`, not yet wired to code.
6. Explicit `select` audit — avatars and settings pages still lack explicit selects.
7. Create `production` GitHub environment in repo settings.
8. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

**Marketing header nav expansion** — add a `<nav>` row to `MarketingHeader` with links to `/solutions`, `/pricing`, and `/contact`. This is the natural follow-up now that three marketing destination pages exist. Use a ghost/link variant to keep the header visually lightweight.

---

## Session: Contact page + Calendly embed + enterprise CTA wiring — 2026-06-27

### What was done

Added a `/contact` marketing page that inherits `MarketingHeader` + `MarketingFooter` via the existing `(marketing)` route group. The page has two sections side-by-side on desktop: a contact/demo form and a Calendly inline booking widget. Enterprise-intent pricing CTAs on the homepage now point to `/contact`.

### What was inspected

- `app/(marketing)/layout.tsx` — confirmed `MarketingHeader` + `MarketingFooter` wrappers; no changes needed
- `components/marketing/marketing-header.tsx` — async server component; reused as-is
- `app/(marketing)/page.tsx` — hero CTAs (individual-signup-oriented, kept); pricing section Enterprise + Custom cards had `href: "/signup"` — updated
- `lib/mailer.ts` — existing `sendVerifyEmail` / `sendForgotPasswordEmail` pattern; extended with `sendContactNotificationEmail`
- `lib/resend.ts` — singleton `resend` client
- `lib/validations/auth.ts` + `lib/validations/booking.ts` — Zod + normalize transform pattern
- `app/signup/page.tsx` — react-hook-form + zodResolver + shadcn Form/Input/Checkbox pattern; modal error banner with X dismiss
- `emails/templates/verify-email.tsx` — React Email template shape and palette

### Implementation

**New files:**

- `lib/validations/contact.ts` — Zod schema: `name`, `email` (with normalize transforms matching auth.ts), `companyName` (required), `message`
- `emails/templates/contact-notification-email.tsx` — React Email template; uses the same brand palette (teal header gradient, cream background)
- `app/api/contact/route.ts` — POST handler: JSON parse → Zod safeParse → `sendContactNotificationEmail` → `{ success: true }`. Returns `fieldErrors` on 400 for server-side field highlighting.
- `components/marketing/contact-form.tsx` — `"use client"` component; react-hook-form + zodResolver + shadcn Form/Input/Textarea. Inline error banner + per-field messages. Shows a success state after submission (no redirect needed for a contact form).
- `app/(marketing)/contact/page.tsx` — server component with `metadata`. Two-section layout: muted header section + two-column grid (form left, Calendly right). Calendly embed uses `next/script` with `strategy="lazyOnload"` so it does not block page render.

**Modified files:**

- `lib/mailer.ts` — added `sendContactNotificationEmail`; recipient is `CONTACT_EMAIL` env var with fallback to `EMAIL_FROM`
- `app/(marketing)/page.tsx` — Enterprise pricing card `href: "/signup"` → `"/contact"`; Custom pricing card `href: "/signup"` → `"/contact"`. Hero and final CTA buttons unchanged (individual signup path).

### Calendly embed notes

- The `<div class="calendly-inline-widget">` is rendered server-side as static HTML. The Calendly script (`strategy="lazyOnload"`) queries for this div at idle time and hydrates it into the interactive widget.
- `strategy="lazyOnload"` maps to the original `async` attribute in the Calendly snippet. The div is in the DOM before the script runs, so initialization is reliable.
- The `Script` component is placed at page root (after the two-section layout), which is idiomatic for `lazyOnload`.

### Route rendering change

`/contact` renders as `ƒ Dynamic` because it inherits `MarketingHeader` which calls `auth()`. Expected behavior; same as all other marketing routes.

### New env var

`CONTACT_EMAIL` — optional recipient for contact form notifications. Falls back to `EMAIL_FROM` if unset. No migration, no schema change.

### Files changed

| File                                              | Change                                          |
| ------------------------------------------------- | ----------------------------------------------- |
| `lib/validations/contact.ts`                      | **Created** — Zod schema for contact form       |
| `emails/templates/contact-notification-email.tsx` | **Created** — React Email notification template |
| `lib/mailer.ts`                                   | Added `sendContactNotificationEmail`            |
| `app/api/contact/route.ts`                        | **Created** — POST handler                      |
| `components/marketing/contact-form.tsx`           | **Created** — client form component             |
| `app/(marketing)/contact/page.tsx`                | **Created** — marketing contact page            |
| `app/(marketing)/page.tsx`                        | Enterprise + Custom pricing `href` → `/contact` |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 25 routes; /contact ƒ Dynamic, /api/contact ƒ Dynamic; ƒ Proxy confirmed
```

### Remaining issues (carried forward)

1. `CONTACT_EMAIL` env var not yet set in Vercel — add it pointing to the sales inbox.
2. `take: 20` hard cap on payment history — add pagination.
3. Zero-amount invoice 404 — no in-page fallback when `hosted_invoice_url` is null.
4. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — in `.env`, not yet wired to code.
5. Explicit `select` audit — avatars and settings pages still lack explicit selects.
6. Create `production` GitHub environment in repo settings.
7. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

**Pricing page real copy** — replace placeholder prices on `app/(marketing)/pricing/page.tsx` with confirmed tier pricing and wire its CTAs to `/contact` for enterprise tiers (same pattern applied here). Alternatively, add a confirmation/auto-reply email to the contact submitter using the existing `sendVerifyEmail` pattern as a template.

---

## Session: Marketing header on login and signup pages — 2026-06-27

### What was done

Added the `MarketingHeader` (logo + theme toggle + auth-aware nav) to `/login` and `/signup` via co-located layout files. The centered auth-card experience is preserved; no auth flow, form, validation, redirect, or callbackUrl handling was changed.

### What was inspected

- `app/(marketing)/layout.tsx` — confirms `MarketingHeader` + `MarketingFooter` wrappers
- `components/marketing/marketing-header.tsx` — async server component, calls `auth()`, renders `SiteLogo` + `ThemeToggle` + auth-aware nav buttons; safe to reuse as-is
- `app/login/page.tsx` — server component, two render paths: "already logged in" Card and `<LoginForm />`; no layout file existed
- `app/login/login-form.tsx` — client component, renders its own `<main className="min-h-screen flex items-center justify-center">`
- `app/signup/page.tsx` — client component (`"use client"`), renders its own `<main className="min-h-screen flex items-center justify-center">`
- `app/layout.tsx` — root body: `min-h-full flex flex-col`; flex column is the centering axis

### Implementation

**New layout files (no route changes):**

- `app/login/layout.tsx` — renders `<MarketingHeader /> + {children}`
- `app/signup/layout.tsx` — renders `<MarketingHeader /> + {children}`

**One-word layout class change per file (not auth logic):**

- `app/login/login-form.tsx`, `app/login/page.tsx`, `app/signup/page.tsx` — `min-h-screen` → `flex-1` on `<main>`. With the root body's `flex flex-col`, `flex-1` makes the content area fill the remaining viewport height below the sticky header, keeping the card visually centered under the header rather than offset 64px below the raw viewport center.

### Route rendering change

`/signup` changed from `○ Static` to `ƒ Dynamic` because the new layout includes `MarketingHeader` which calls `auth()`. This is expected and matches `/login` (already dynamic) and `/` (already dynamic).

### Files changed

| File                       | Change                                                            |
| -------------------------- | ----------------------------------------------------------------- |
| `app/login/layout.tsx`     | **Created** — injects `MarketingHeader` for all `/login` renders  |
| `app/signup/layout.tsx`    | **Created** — injects `MarketingHeader` for all `/signup` renders |
| `app/login/login-form.tsx` | `min-h-screen` → `flex-1` on `<main>`                             |
| `app/login/page.tsx`       | `min-h-screen` → `flex-1` on `<main>` (logged-in state)           |
| `app/signup/page.tsx`      | `min-h-screen` → `flex-1` on `<main>`                             |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 23 routes; /login ƒ Dynamic, /signup ƒ Dynamic; ƒ Proxy confirmed
```

### Remaining issues (carried forward)

1. `take: 20` hard cap on payment history — add pagination.
2. Zero-amount invoice 404 — no in-page fallback when `hosted_invoice_url` is null.
3. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — in `.env`, not yet wired to code.
4. Explicit `select` audit — avatars and settings pages still lack explicit selects.
5. Create `production` GitHub environment in repo settings.
6. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

**`/contact` or demo page** — a marketing form page at `app/(marketing)/contact/page.tsx` that automatically inherits `MarketingHeader` + `MarketingFooter`, collects name/email/company/message, and sends via the existing Resend mailer. Then wire up the hero CTA and final CTA to `/contact`.

---

## Session: Replace native select with Base UI Select — 2026-06-22

### What was done

The `color-scheme: dark` CSS approach for the native `<select>` was insufficient. On real Chrome with the OS in light mode, the OS-rendered dropdown popup ignores page CSS and renders with light colors — unreadable on a dark dialog background.

**Decision:** Replace `components/ui/select.tsx` entirely with a Base UI Select (`@base-ui/react/select`) component set so all rendering happens in the JS/CSS layer where Tailwind tokens apply consistently.

### Files changed

| File                                          | Change                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/select.tsx`                    | Full rewrite — exports `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` as Base UI Select wrappers |
| `components/dashboard/new-booking-dialog.tsx` | capturesCount field uses new components; `onValueChange={(val) => field.onChange(Number(val))}`                           |
| `components/dashboard/booking-actions.tsx`    | Same change in `EditDialog` capturesCount field                                                                           |

### Key implementation details

- `SelectContent` wraps Portal + Positioner + Popup + List. **Positioner has `className="z-60"`** so the dropdown floats above the `z-50` dialog — same fix as the tooltip Positioner.
- Popup uses `min-w-(--anchor-width)` (Base UI CSS var) to match trigger width.
- `SelectItem` uses `data-highlighted:bg-accent data-highlighted:text-accent-foreground` for hover state and `SelectPrimitive.ItemIndicator` (Check icon) for selected state.
- `FormControl` (Radix Slot) wraps `SelectTrigger` so react-hook-form's `id`/`aria-*` reach the `<button>` element.

### Checks run

```
npm run typecheck → clean
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run build     → next build clean; 23 routes; ƒ Proxy confirmed
```

### Remaining issues (carried forward)

1. `take: 20` hard cap on payment history — add pagination.
2. Zero-amount invoice 404 — no in-page fallback when `hosted_invoice_url` is null.
3. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — in `.env`, not yet wired to code.
4. Explicit `select` audit — avatars and settings pages still lack explicit selects.
5. Create `production` GitHub environment in repo settings.
6. Theme script warning — React 19 + next-themes 0.4.6 known issue.

### Recommended next milestone

**Bookings list enhancements** — show participant names inline in the table (expandable row or tooltip on the Captures column).

---

## Session: Dark-mode select + tooltip layering (revised) — 2026-06-22

### What was inspected

- `components/ui/select.tsx` — confirmed native `<select>` wrapper (not Radix). Had `bg-transparent`, no explicit text color, no `color-scheme`.
- `components/ui/tooltip.tsx` — `@base-ui/react/tooltip` wrapper. First fix session placed `z-60` on `TooltipPrimitive.Popup`; this session found that to be wrong.
- `components/ui/dialog.tsx` — `DialogPrimitive.Backdrop` has `z-50 isolate`; `DialogPrimitive.Popup` has `z-50 position:fixed`.
- `@base-ui/react/tooltip` source — confirmed `TooltipPositioner` renders with `positionMethod: 'absolute'` by default. Positioning styles (including `position: absolute`) applied via inline styles, not CSS classes.
- `usePositioner.js` (Base UI) — confirmed the Positioner renders as a plain `div` with inline positioning styles; no z-index is injected by Base UI.
- Visual test (headless Chromium) — created HTML test pages replicating the exact portal+z-index scenario to confirm both fixes.

### Root cause: tooltip z-index (the real one)

`z-index` is silently ignored on `position: static` elements. `TooltipPrimitive.Popup` renders as a plain `div` (static) — the first fix session's `z-60` on the Popup had zero CSS effect.

`TooltipPrimitive.Positioner` has `position: absolute` (from Base UI inline styles). It is the element portaled to `<body>` that competes against the dialog in the body stacking context. It had no z-index → `z: auto` → loses to dialog's `z: 50`.

**Fix:** `className="z-60"` on `TooltipPrimitive.Positioner`. Removed incorrect `z-60` from `TooltipPrimitive.Popup`.

### Files changed

| File                        | Change                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `components/ui/tooltip.tsx` | `z-60` moved from `Popup` (static, ignored) to `Positioner` (positioned, effective) |

---

## Session: Build script + Prisma/theme diagnostics — 2026-06-22

### What was inspected

- `app/generated/prisma/models/Booking.ts` — `capturesCount` confirmed present in generated client (lines 30, 44, 225, etc.). `participants` relation confirmed. Client is fully up to date.
- `app/generated/prisma/models/BookingCaptureParticipant.ts` — exists, complete. `prisma generate` was run correctly after the schema update.
- `.gitignore` — `/app/generated/prisma` is gitignored (line 43). The generated Prisma client is NOT committed.
- `package.json` build script — was `prisma migrate deploy && next build`; NO `prisma generate` in the build script. `postinstall: prisma generate` only runs when `npm install` runs.
- `prisma migrate status` — local Neon DB is up to date with all 4 migrations (including the captures migration).
- `app/(dashboard)/dashboard/bookings/page.tsx` — `fetchBookings` already has the correct explicit `select` with `capturesCount` and `participants`.
- `components/providers/theme-provider.tsx` and `app/layout.tsx` — standard setup; `suppressHydrationWarning` is on `<html>`.
- `node_modules/next-themes/dist/index.mjs` — internal `_` component renders `React.createElement("script", { dangerouslySetInnerHTML: ... })` inline in the component tree.

### Root cause: Issue 1 — Prisma runtime error

`/app/generated/prisma` is gitignored, so the generated client is never committed to source control. The build script only ran `prisma migrate deploy && next build`. On deployment environments that cache `node_modules` (common on Vercel, Railway, etc.), `npm install` is skipped, so `postinstall: prisma generate` never fires. The deploy bundle is compiled against an **old generated Prisma client** that doesn't know about `capturesCount`. The database has the column; the client doesn't — hence the runtime `Invalid prisma.booking.findMany() invocation`.

Locally, `prisma generate` was run manually and the migration is applied, so the local environment is already correct. The issue manifests in production deploys with cached `node_modules`.

### Root cause: Issue 2 — Theme provider script warning

`next-themes` 0.4.6 renders its theme-detection script as a raw `React.createElement("script", { dangerouslySetInnerHTML: ... })` inside the React component tree. React 19's server renderer (used by Next.js 16 App Router) warns when it encounters inline `<script>` elements in component trees that aren't using React 19's new script hoisting API. This is a library-level incompatibility — there is no user-code configuration that suppresses this without either causing FOUC or bypassing React 19's rendering rules. The `suppressHydrationWarning` on `<html>` addresses attribute hydration mismatches (theme class) but not the script rendering warning.

The warning is **non-breaking**: theming works correctly, end users are not affected, and it only appears in server logs / developer console. It will be resolved when `next-themes` releases a version using React 19's server script API (e.g., `useServerInsertedHTML` with proper React 19 compat).

### What changed

**`package.json`** — build script updated from:

```
"build": "prisma migrate deploy && next build"
```

to:

```
"build": "prisma generate && prisma migrate deploy && next build"
```

This ensures the Prisma client is always regenerated from the current schema during every build, regardless of whether `npm install`'s `postinstall` ran. This closes the production drift window.

### Files changed

| File           | Change                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| `package.json` | `build` script: added `prisma generate &&` before `prisma migrate deploy` |

### Checks run

```
npm run typecheck   → clean
npm run lint        → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run build       → prisma generate clean; prisma migrate deploy (no pending); next build clean
                      22 routes; ƒ Proxy confirmed
```

### Issue 2 status

The React 19 + next-themes script warning is a **known cosmetic issue** with this version combination (next-themes 0.4.6 + React 19.2.4 + Next.js 16.2.7). No user-code fix is available without destabilizing theming. Track `next-themes` releases for a patch that uses React 19's `useServerInsertedHTML` with proper React 19 script handling. Until then, the warning is expected and non-breaking.

**Local dev note**: If the Prisma runtime error was also seen locally, clear the `.next` cache (`rm -rf .next`) and restart the dev server. The dev server may have had a stale compiled bundle from before `prisma generate` was run.

### Remaining issues (carried forward)

1. `take: 20` hard cap on payment history — add pagination.
2. Zero-amount invoice 404 — no in-page fallback when `hosted_invoice_url` is null.
3. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — in `.env`, not yet wired to code.
4. Explicit `select` audit — avatars and settings pages still lack explicit selects.
5. Create `production` GitHub environment in repo settings to enable the migration workflow.
6. Theme script warning — React 19 + next-themes 0.4.6 known issue; revisit on next-themes update.

### Recommended next milestone

**Local dev fix**: Delete `.next/` and restart `npm run dev` to clear any stale compiled bundles from before `prisma generate` was run.

**Next code milestone**: Bookings list enhancements — expand participant details in the table (tooltip or expandable row on the Captures column showing participant names/contacts).

---

## Session: Captures-based booking flow — 2026-06-22

### What was built

Full captures-based booking upgrade across every booking surface:

1. **Schema** — `capturesCount Int @default(1)` added to `Booking`; new `BookingCaptureParticipant` model with `sortOrder`, cascade delete.
2. **Migration** — `20260622130000_add_captures_count_and_participants/migration.sql` (safe additive: `ADD COLUMN`, `CREATE TABLE` only — no drops, no data loss). Applied to production during build.
3. **`lib/booking-time.ts`** (new) — `addHoursToTime(time, hours)` utility, handles midnight wrap.
4. **`lib/validations/booking.ts`** — Added `capturesCount z.number().int().min(1).max(10)`, `participants` array schema with `firstName`/`contactNumber`, cross-field refine: `participants.length === capturesCount`. Removed the `timeEnd > timeStart` cross-field refine (server now always recomputes `timeEnd`).
5. **`components/ui/select.tsx`** (new) — styled native `<select>` wrapper with `forwardRef`, Input-matching CSS classes. Works with FormControl/Slot.
6. **`components/ui/tooltip.tsx`** (new) — `@base-ui/react/tooltip` wrapper components (`Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`).
7. **`components/dashboard/new-booking-dialog.tsx`** — Major update: capturesCount Select + CircleHelp tooltip, auto-computed read-only timeEnd (`useEffect` + `setValue`), `useFieldArray` participant blocks synced to capture count. Removed debug `console.log`.
8. **`components/dashboard/booking-actions.tsx`** — Same form changes in EditDialog. `BookingForActions` type extended with `capturesCount: number` and `participants: Array<{firstName, contactNumber}>`.
9. **`app/api/bookings/route.ts`** — POST: handles `capturesCount` and `participants`; creates participant rows nested in `prisma.booking.create`. **Server always recomputes `timeEnd = addHoursToTime(timeStart, capturesCount)` — client-submitted timeEnd is ignored.**
10. **`app/api/bookings/[id]/route.ts`** — PATCH: same server-side timeEnd computation; replaces participants atomically via `deleteMany: {} + create`.
11. **`app/(dashboard)/dashboard/bookings/page.tsx`** — Added `capturesCount` + `participants` to explicit `select`, `toBookingForActions`, and table (new "Captures" column).

### Security note: server-side timeEnd

`timeEnd` is always computed server-side as `addHoursToTime(timeStart, capturesCount)`. The client-submitted `timeEnd` value is accepted by Zod validation (for form state continuity) but the server overwrites it before persisting. This prevents any spoofing of session duration.

### Files changed

| File                                                 | Change                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `prisma/schema.prisma`                               | `capturesCount` on `Booking`; new `BookingCaptureParticipant` model |
| `prisma/migrations/20260622130000_.../migration.sql` | New safe-additive migration                                         |
| `lib/booking-time.ts`                                | **Created** — `addHoursToTime` utility                              |
| `lib/validations/booking.ts`                         | `capturesCount`, `participants` array, updated refines              |
| `components/ui/select.tsx`                           | **Created** — styled native select                                  |
| `components/ui/tooltip.tsx`                          | **Created** — base-ui tooltip wrappers                              |
| `components/dashboard/new-booking-dialog.tsx`        | Full form update + debug log removed                                |
| `components/dashboard/booking-actions.tsx`           | EditDialog + `BookingForActions` type extended                      |
| `app/api/bookings/route.ts`                          | `capturesCount`, participants, server-side timeEnd                  |
| `app/api/bookings/[id]/route.ts`                     | Same + atomic participant replacement                               |
| `app/(dashboard)/dashboard/bookings/page.tsx`        | Query + table extended                                              |

### Checks run

```
npx prisma generate → clean (new BookingCaptureParticipant client generated)
npm run typecheck   → clean
npm run lint        → 0 errors, 1 pre-existing warning in lib/prisma.ts
npm run build       → prisma migrate deploy applied migration; 23 routes; ƒ Proxy confirmed
```

### Remaining issues (carried forward)

1. `take: 20` hard cap on payment history — add pagination.
2. Zero-amount invoice 404 — no in-page fallback when `hosted_invoice_url` is null.
3. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — in `.env`, not yet wired to code.
4. Explicit `select` audit — avatars and settings pages still lack explicit selects.
5. Create `production` GitHub environment in repo settings to enable the migration workflow.

### Recommended next milestone

**Bookings list enhancements** — show participant names inline in the table (expandable row or tooltip on the Captures column), or add a booking detail modal/page that lists all participants for a given booking.

---

## Session: CI migration guardrails — 2026-06-22

### What was built

Three layers of drift prevention added after the P2022 production incident:

1. **PR guard** — `.github/workflows/check-prisma-migration.yml`
   - Triggers on every PR to `main`
   - Fails if `prisma/schema.prisma` changed and `prisma/migrations/` did not
   - Warns (non-blocking) if changed migration SQL contains destructive keywords
   - Pure shell, no Node install, fast

2. **Production migration workflow** — `.github/workflows/prisma-migrate-prod.yml`
   - Triggers on push to `main` when `prisma/migrations/**` changes
   - Node 22 (not 20 — deprecated in GHA runners mid-2025)
   - GitHub environment `production` (can add approval gates later)
   - Fails immediately with clear message if `DIRECT_URL` secret is absent
   - Steps: `npm ci` → `prisma generate` → `prisma migrate deploy`

3. **Migration process documentation** — `docs/migrations.md`
   - Local dev flow, PR guard behaviour, production path, secrets reference

### Build script decision (Option A — belt-and-suspenders)

`package.json` build script remains `prisma migrate deploy && next build`. Both GHA
and Vercel run `migrate deploy`; both are idempotent (Prisma advisory lock prevents
double-apply). The redundancy is intentional at the current team maturity. Simplify
to `next build` when GHA coverage is trusted.

### Why Node 22

Node 20 hit a deprecation/removal issue in GitHub Actions runner images mid-2025.
All workflows explicitly use `node-version: 22`. This is documented in the workflow
comments and in `docs/migrations.md`.

### Files added

| File                                           | Purpose                    |
| ---------------------------------------------- | -------------------------- |
| `.github/workflows/check-prisma-migration.yml` | PR guard                   |
| `.github/workflows/prisma-migrate-prod.yml`    | Production migration       |
| `docs/migrations.md`                           | Team migration process doc |

### Secrets that must be configured

**GitHub** (one-time setup):

```
Repository Settings → Environments → production → Secrets
  DIRECT_URL = <direct Neon connection string>
```

**Vercel** (already required, unchanged):

```
Project → Environment Variables → Production
  DATABASE_URL = <pooled Neon connection string>
  DIRECT_URL   = <direct Neon connection string>
```

Vercel Build Command must be `npm run build`, not `next build` directly.

### Checks run

```
npm run typecheck → clean
npm run build     → migrate deploy (no pending, skipped); 23 routes; ƒ Proxy confirmed
```

### Remaining issues (carried forward)

1. `take: 20` hard cap on payment history — add pagination.
2. Zero-amount invoice 404 — no in-page fallback when `hosted_invoice_url` is null.
3. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — in `.env`, not yet wired to code.
4. Explicit `select` audit — avatars and settings pages still use implicit scalar
   enumeration; same blast-radius risk if new fields are added to those models.
5. Debug `console.log` in `new-booking-dialog.tsx:56` — remove before release.
6. Create `production` GitHub environment in repo settings to enable the migration
   workflow (currently the workflow file exists but the environment must be created).

---

## Session: Schema drift migration + deployment hardening — 2026-06-22

### What was inspected

- `prisma/migrations/` — only two migrations existed; neither added `paymentStatus`,
  the three enum types (`BookingStatus`, `PaymentStatus`, `PaymentType`), or the new
  `Payment` columns (`type`, `updatedAt`, `bookingId`).
- `prisma/schema.prisma` — `Booking.paymentStatus`, `payments.type`, `payments.updatedAt`,
  `payments.bookingId`, and all three enum types were present but unmigrated.
- `app/(dashboard)/dashboard/bookings/page.tsx` — `findMany` had no `select`; Prisma
  was enumerating all scalar fields including the missing `paymentStatus` → P2022.
- `package.json` — `build` script was `next build` only; `prisma migrate deploy` never ran.
- Prisma CLI output confirmed 3 existing rows in `payments`, validating backfill strategy.

### Root cause

`schema.prisma` diverged from production over multiple sessions where `prisma db push`
or manual schema edits were made without running `prisma migrate dev`. `postinstall`
only regenerated the TypeScript client (`prisma generate`); the actual DB was never
updated. `findMany` without `select` exposed the gap the moment a new schema field
appeared.

### What changed

1. **`prisma/migrations/20260622120000_add_booking_payment_status_and_payment_enums/migration.sql`**
   (new, handwritten) — applied to production Neon DB during the same `npm run build`.
   Key safety decisions:
   - Wrapped in a single `BEGIN` / `COMMIT` transaction.
   - Pre-flight `DO $$` blocks validate all existing string values before any cast; bad
     data raises inside the transaction so the DB is left in its original state.
   - TEXT → enum conversions use `ALTER COLUMN TYPE ... USING "col"::"EnumType"` — no
     DROP+ADD, no data loss. (Prisma's auto-generated SQL would have used DROP+ADD.)
   - `payments.type` gets `DEFAULT 'subscription'` for backfill of the 3 existing rows,
     then `DROP DEFAULT` so future inserts must explicitly set it.
   - `payments.updatedAt` gets `DEFAULT CURRENT_TIMESTAMP` for backfill; default is kept
     as a safety net for direct SQL access.

2. **`app/(dashboard)/dashboard/bookings/page.tsx`** — `findMany` now uses an explicit
   `select` listing only the 6 fields the page actually renders. Future schema additions
   are invisible to this query unless the code explicitly opts in.

3. **`package.json`** — `"build"` changed from `"next build"` to
   `"prisma migrate deploy && next build"`. Every Vercel deploy now applies pending
   migrations before the Next.js build, fail-fast if `DIRECT_URL` is not set.

### Columns added / changed in production

| Table      | Column / Type    | Change                                                       |
| ---------- | ---------------- | ------------------------------------------------------------ |
| `bookings` | `status`         | `TEXT` → `BookingStatus` enum (USING cast)                   |
| `bookings` | `paymentStatus`  | **Added** `PaymentStatus NOT NULL DEFAULT 'unpaid'`          |
| `payments` | `status`         | `TEXT` → `PaymentStatus` enum (USING cast)                   |
| `payments` | `subscriptionId` | `NOT NULL` → nullable                                        |
| `payments` | `type`           | **Added** `PaymentType NOT NULL` (backfilled 'subscription') |
| `payments` | `updatedAt`      | **Added** `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`  |
| `payments` | `bookingId`      | **Added** nullable `TEXT` FK → `bookings.id` + index         |

### Files changed

| File                                                 | Change                                          |
| ---------------------------------------------------- | ----------------------------------------------- |
| `prisma/migrations/20260622120000_.../migration.sql` | New handwritten migration                       |
| `app/(dashboard)/dashboard/bookings/page.tsx`        | Explicit `select` on `findMany`                 |
| `package.json`                                       | `build` script includes `prisma migrate deploy` |

### Vercel environment variable requirement

`DIRECT_URL` must be set in Vercel → Settings → Environment Variables. `prisma migrate deploy`
at build time needs a direct (non-pooled) Neon connection. If absent, the build fails
before `next build` starts — explicit, not silent.

Also verify Vercel's Build Command is `npm run build` (not `next build` directly).

### Checks run

```
npx prisma migrate deploy → migration applied to production Neon DB (3 existing payment rows safe)
npm run typecheck         → clean
npm run build             → prisma migrate deploy (already applied, skipped) + next build clean
                            23 routes; ƒ Proxy (Middleware) confirmed
```

### Unresolved issues

1. `take: 20` combined payment history limit — pagination/load-more.
2. Zero-amount invoice 404 — no in-page fallback when `hosted_invoice_url` is null.
3. `STRIPE_AVATAR_CAPTURE_PRICE_ID` — present in `.env`, not yet wired to code.
4. Other `findMany` calls without explicit `select` (avatars page, settings page) —
   same blast-radius risk if future schema fields are added to those models.
5. Debug `console.log("form errors", ...)` in `new-booking-dialog.tsx` line 56 —
   should be removed before production release.

### Recommended next milestone

**Explicit `select` audit** — add explicit `select` to the avatars and settings page
`findMany`/`findUnique` calls for the same defensive reason (one line per field, only
what the page renders). Low-risk, high-protection change.

---

## Session: Prisma Payment.type fix + client regeneration — 2026-06-22

### What was inspected

- `prisma/schema.prisma` — `Payment.type PaymentType` is required with no default; `PaymentType` enum values: `booking`, `subscription`, `other`.
- `app/generated/prisma/enums.ts` — stale client had no `PaymentType` or `PaymentStatus` entries (only `PlanType`, `SubscriptionStatus`, `BillingOwnerType`).
- `app/generated/prisma/models/Payment.ts` — stale `PaymentCreateInput` had no `type` field; `status` typed as `string` instead of `PaymentStatus` enum.
- `app/api/stripe/webhook/route.ts:111` — the only `payment.upsert` / `payment.create` call site in the codebase; `handleInvoicePaid` create payload was missing `type`.

### Root cause

The Prisma client had not been regenerated after the schema migration that added `type PaymentType` and `bookingId`/`booking` relation to the `Payment` model. Because the generated `PaymentCreateInput` had no `type` field, TypeScript did not flag the omission. The PostgreSQL column is `NOT NULL` with no default, so at runtime Prisma would throw a constraint error when inserting a Payment row via `invoice.payment_succeeded` webhook events.

### What changed

1. **`npx prisma generate`** — regenerated the Prisma client. `PaymentType` and `PaymentStatus` now appear in `app/generated/prisma/enums.ts`; `PaymentCreateInput` now requires `type`.

2. **`app/api/stripe/webhook/route.ts`** — two changes:
   - Added `PaymentType` and `PaymentStatus` to the existing enum import.
   - In `handleInvoicePaid` upsert create payload: added `type: PaymentType.subscription` (this handler is triggered by `invoice.payment_succeeded`, which are subscription billing cycle events); changed `status: "paid"` string literal to `status: PaymentStatus.paid` for type safety.

### Files changed

| File                              | Change                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `app/generated/prisma/*`          | Regenerated — `PaymentType`/`PaymentStatus` enums added; `PaymentCreateInput` now requires `type`                                       |
| `app/api/stripe/webhook/route.ts` | `PaymentType`/`PaymentStatus` imports added; `type: PaymentType.subscription` and `status: PaymentStatus.paid` in upsert create payload |

### Checks run

```
npx prisma generate → clean
npm run typecheck   → clean
npm run build       → clean; 23 routes; ƒ Proxy (Middleware) confirmed
```

### Unresolved issues

1. **`take: 20` combined payment history limit** — add pagination or load-more for billing histories with many invoices.
2. **Zero-amount invoice 404** — `hosted_invoice_url` is null for Stripe draft/zero-amount invoices; the redirect route returns 404; no in-page fallback message.
3. **`STRIPE_AVATAR_CAPTURE_PRICE_ID`** — present in `.env`, unreferenced in code; wire up with the avatar capture billing flow when that feature is built.

### Recommended next milestone

**Pagination or load-more for payment history** — replace the hard `take: 20` cap with a cursor-based load-more button (server action) or a dedicated `/dashboard/billing/history` full-list route.

---

## Session: Enterprise-owner payment history — 2026-06-22

### What was inspected

- `app/(dashboard)/dashboard/billing/page.tsx` — `fetchBillingData` payment query used `{ subscription: { userId } }` (personal only). `PaymentHistorySection` had four columns: Date, Amount, Status, Invoice.
- `app/api/stripe/invoice-redirect/[invoiceId]/route.ts` — already checked both `subscription.userId === userId` and `subscription.enterprise.ownerUserId === userId`; no change required.
- `prisma/schema.prisma` — `Subscription.userId?` for personal plans; `Subscription.enterpriseId?` + `enterprise.ownerUserId` for enterprise plans. `Payment.subscription` → nullable relation.

### What changed

**`app/(dashboard)/dashboard/billing/page.tsx`** — single file changed.

1. **Payment query (`fetchBillingData`)** — replaced the single `{ subscription: { userId } }` filter with:

   ```
   OR: [
     { subscription: { userId } },                               // personal
     { subscription: { enterprise: { ownerUserId: userId } } }, // enterprise-owner
   ]
   ```

   Added `subscription.enterprise.name` to the select to drive the new Plan column. Ordering and `take: 20` limit unchanged.

2. **`PaymentHistorySection` UI** — added a "Plan" column between Date and Amount:
   - Enterprise payments show a `Building2` icon + enterprise name.
   - Personal payments show "Personal" in muted text.
   - Invoice links unchanged — still route through `/api/stripe/invoice-redirect/[invoiceId]`.

### How enterprise-owner payments are included

The Prisma `OR` filter includes payments whose linked subscription has `enterprise.ownerUserId = userId`. Because `Enterprise.ownerUserId` is the user who created/owns the enterprise, only that user matches. Enterprise members with other roles are excluded.

### How non-owner members are excluded

Non-owner enterprise members have a `userId` that differs from `enterprise.ownerUserId`. Neither `OR` branch matches them:

- Branch 1 (`subscription.userId = userId`) — enterprise subscriptions have `userId = null`, so this never matches any enterprise payment for any user.
- Branch 2 (`subscription.enterprise.ownerUserId = userId`) — matches only the enterprise owner.

The invoice redirect route has the same ownership check, so even if a member somehow constructed a direct URL, they receive 403.

### Files changed

| File                                         | Change                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `app/(dashboard)/dashboard/billing/page.tsx` | OR query for personal + enterprise-owner payments; Plan column in table |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 22 routes; ƒ Proxy (Middleware) confirmed
```

### Unresolved issues

1. **`take: 20` is a combined limit** — if a user has many enterprise invoices, personal ones may be pushed off the first page. A pagination or "load more" control would address this, but is out of scope for now.
2. **Zero-amount invoice URLs** — `hosted_invoice_url` is null for draft/zero-amount Stripe invoices; the redirect route returns 404. No in-page fallback message yet.
3. **`STRIPE_AVATAR_CAPTURE_PRICE_ID`** — in `.env` but unreferenced in code; wire up with the avatar capture billing flow.

### Recommended next milestone

**Pagination or load-more for payment history** — the `take: 20` hard cap will hide older invoices as billing accumulates. A cursor-based `load more` button (server action returning the next page) or a `/dashboard/billing/history` full-list route would address this.

---

## Session: API entitlement checks + payment receipt links — 2026-06-22

### What was inspected

- `app/api/bookings/route.ts` — POST handler had auth check only; no subscription enforcement.
- `app/api/bookings/[id]/route.ts` — PATCH handler had auth + ownership + status checks; no subscription enforcement.
- `app/api/bookings/[id]/cancel/route.ts` — POST handler; cancellation intentionally left without subscription check (consumer protection).
- `lib/subscription.ts` — `userHasActiveSubscription` helper confirmed correct (`TRIALING | ACTIVE`, `findFirst` without `orderBy` is acceptable here since we need only existence, not a specific row).
- `lib/stripe.ts` — singleton Stripe client confirmed; `stripe.invoices.retrieve(id)` returns `hosted_invoice_url`.
- `app/(dashboard)/dashboard/billing/page.tsx` — `PaymentHistorySection` previously rendered `stripeInvoiceId` as plain text with a TODO comment.

### What changed

1. **`app/api/bookings/route.ts`** — Added `import { userHasActiveSubscription }` and a fresh DB entitlement check after the 401 auth guard. Returns 403 with `"An active subscription is required to create bookings"` if the check fails. This is the real security boundary: JWT state may be stale after Stripe events so the proxy guard alone is insufficient.

2. **`app/api/bookings/[id]/route.ts`** — Same pattern added to the PATCH handler. Editing an existing booking is a paid-feature action; the check runs before the ownership/status guards. Returns 403 with `"An active subscription is required to edit bookings"`.

3. **`app/api/bookings/[id]/cancel/route.ts`** — No change. Cancellation is consumer-protection (users must be able to clean up bookings even if their subscription lapses).

4. **`app/api/stripe/invoice-redirect/[invoiceId]/route.ts`** (new) — GET handler. Auth check → Prisma ownership check (personal subscription userId or enterprise subscription ownerUserId) → `stripeClient.invoices.retrieve(invoiceId)` → `NextResponse.redirect(hosted_invoice_url)`. Returns 401 / 403 / 404 on failure. Opens the Stripe-hosted receipt PDF in a new tab.

5. **`app/(dashboard)/dashboard/billing/page.tsx`** — Replaced the TODO invoice column in `PaymentHistorySection` with an anchor tag linking to `/api/stripe/invoice-redirect/{stripeInvoiceId}` (opens in new tab). Rows without a `stripeInvoiceId` still show `—`.

### Files changed

| File                                                   | Change                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `app/api/bookings/route.ts`                            | Added `userHasActiveSubscription` import + 403 entitlement guard on POST  |
| `app/api/bookings/[id]/route.ts`                       | Added `userHasActiveSubscription` import + 403 entitlement guard on PATCH |
| `app/api/stripe/invoice-redirect/[invoiceId]/route.ts` | **Created** — receipt redirect with auth + ownership verification         |
| `app/(dashboard)/dashboard/billing/page.tsx`           | Invoice column: TODO text → `<a>` link to invoice-redirect route          |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 22 routes; /api/stripe/invoice-redirect/[invoiceId] ƒ Dynamic; ƒ Proxy (Middleware) confirmed
```

### Authorization model — complete picture

| Layer                     | Mechanism                                   | Staleness risk                                |
| ------------------------- | ------------------------------------------- | --------------------------------------------- |
| Page routing (`proxy.ts`) | JWT `hasActiveSubscription` — no DB         | Yes — stale until re-auth after Stripe events |
| API write protection      | Fresh `userHasActiveSubscription()` DB call | None — always current                         |
| Receipt access            | Prisma ownership check per request          | None                                          |

Stale JWT state is acceptable for navigation UX (proxy redirects browsers). It is **not** the enforcement boundary for paid API actions — the API routes carry their own fresh DB checks.

### JWT freshness after Stripe events

`hasActiveSubscription` in the JWT is set at sign-in and does not update mid-session. The Stripe webhook updates the DB but cannot invalidate existing JWTs. Affected scenarios:

- Subscription lapses mid-session → user can still reach `/dashboard/bookings` UI until JWT expires, **but** any attempt to create or edit a booking via the API returns 403.
- User subscribes mid-session → UI shows pricing gate, but they can bypass by calling the API directly (their fresh DB check will pass). Re-signing in corrects the UI.

No per-request DB call in `proxy.ts`; the API-level check is the authoritative guard.

### Unresolved issues

1. **Enterprise subscription payments in history** — `PaymentHistorySection` queries `subscription.userId = userId` (personal plan only). Enterprise subscription payments for enterprises owned by this user are not yet shown.
2. **Stripe env vars** — All previously-placeholder values are now filled in (`STRIPE_WEBHOOK_SECRET`, `STRIPE_CREATOR_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`, `STRIPE_SECRET_KEY`). A new `STRIPE_AVATAR_CAPTURE_PRICE_ID` is present in `.env` but is not yet referenced in any code — wire it up when the avatar capture billing flow is implemented.
3. **Invoice URLs on zero-amount invoices** — `hosted_invoice_url` may be null (Stripe only generates it for finalised non-zero invoices). The redirect route returns 404 in that case; no special UI handling yet.

### Recommended next milestone

**Enterprise payment history** — extend the payment history query to also surface payments for subscriptions owned by the user's enterprises (nested relation filter on `subscription.enterprise.ownerUserId`). Alternatively, segment into a "Personal" / "Enterprise" tab layout.

---

## Session: JWT subscription gate + payment history scaffold — 2026-06-22

### What was inspected

- `proxy.ts` — confirmed existing subscription guard calls `userHasActiveSubscription(user.id)` (Prisma query on every `/dashboard/bookings` request).
- `auth.ts` — confirmed `jwt` / `session` callbacks pattern; `isEmailVerified` and `roles` already in token.
- `next-auth.d.ts` — `JWT` and `Session["user"]` augmentation shapes.
- `lib/subscription.ts` — `userHasActiveSubscription` helper using `TRIALING | ACTIVE` guard.
- `prisma/schema.prisma` — `SubscriptionStatus` enum, `Payment` model (amount, currency, status, stripeInvoiceId, subscriptionId).
- `app/api/stripe/webhook/route.ts` — `handleSubscriptionUpsert` writes status to DB on `customer.subscription.updated`; no session refresh mechanism in place.
- `app/(dashboard)/dashboard/billing/page.tsx` — full billing page reviewed; `fetchBillingData` extended.

### What changed

1. **`next-auth.d.ts`** — Added `hasActiveSubscription: boolean` to `Session["user"]`; added `hasActiveSubscription?: boolean` to `JWT`. No change to the `User` interface (field is not returned by `authorize`, only written in the `jwt` callback).

2. **`auth.ts`** — Imported `SubscriptionStatus` from generated enums. In the `jwt` callback (initial sign-in branch where `user` is defined): queries `prisma.subscription.findFirst` for `TRIALING | ACTIVE` status with `orderBy: { updatedAt: "desc" }` and writes `token.hasActiveSubscription`. In the `session` callback: mirrors to `session.user.hasActiveSubscription = Boolean(token.hasActiveSubscription)` — `Boolean(undefined)` gives `false` for old/pre-migration tokens (fail-closed behaviour).

3. **`proxy.ts`** — Removed `import { userHasActiveSubscription }` and the `await userHasActiveSubscription(user.id)` call. The `/dashboard/bookings` guard is now a single-line token read: `!user.hasActiveSubscription`. No per-request DB query.

4. **`app/(dashboard)/dashboard/billing/page.tsx`** — Added a fourth query to `fetchBillingData` `Promise.all`: `prisma.payment.findMany({ where: { subscription: { userId } }, orderBy: { createdAt: "desc" }, take: 20 })`. Added `formatAmount` helper. Added `PAYMENT_STATUS_STYLES` map. Added `PaymentHistorySection` component rendering a table of date / amount / status / invoice-id. Added the **Payment history** section to the page body. Receipt links are scaffolded as a TODO (need `stripe.invoices.retrieve(stripeInvoiceId).hosted_invoice_url`).

### Files changed

| File                                         | Change                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `next-auth.d.ts`                             | Added `hasActiveSubscription: boolean` to Session.user; `hasActiveSubscription?: boolean` to JWT                                                 |
| `auth.ts`                                    | SubscriptionStatus import; DB lookup + `token.hasActiveSubscription` in jwt callback; `Boolean(token.hasActiveSubscription)` in session callback |
| `proxy.ts`                                   | Removed lib/subscription import; replaced DB call with `!user.hasActiveSubscription` token read                                                  |
| `app/(dashboard)/dashboard/billing/page.tsx` | Payment history query, formatAmount, PAYMENT_STATUS_STYLES, PaymentHistorySection, page section                                                  |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 21 routes; ƒ Proxy (Middleware) confirmed
```

### Known caveat: JWT freshness after Stripe subscription changes

The `hasActiveSubscription` flag is written **once** — at sign-in — and lives in the JWT until the token expires or the user signs out and back in. When Stripe fires `customer.subscription.updated` or `customer.subscription.deleted`, the webhook updates the DB but **cannot invalidate the user's existing JWT**. This means:

- A user whose subscription lapses mid-session can still reach `/dashboard/bookings` until their JWT expires or they re-authenticate.
- A user who subscribes mid-session will still be blocked from `/dashboard/bookings` until re-authentication.

There is no session refresh mechanism currently in the project. To close this gap in a future milestone: implement a force-refresh hook (e.g., a short-lived cookie written by the webhook that the `jwt` callback detects and triggers a re-read from DB), or accept the latency as a product trade-off and document the sign-out/sign-in resolution.

### Unresolved issues

1. **JWT staleness after Stripe events** — documented above. No DB query in proxy; user must re-auth to reflect subscription changes.
2. **Payment history receipt links** — `stripeInvoiceId` is displayed as text. To make it a clickable link, add a server action or redirect endpoint that calls `stripe.invoices.retrieve(id)` to get `hosted_invoice_url`. Alternatively store `hosted_invoice_url` in the `Payment` record via the webhook (requires a schema migration).
3. **Enterprise subscription payments** — `PaymentHistorySection` only queries personal subscription payments (`subscription.userId = userId`). Enterprise subscription payments (where `subscription.enterpriseId` belongs to the user's enterprise) are not yet shown.
4. **Pre-existing stubs** — `STRIPE_WEBHOOK_SECRET`, `STRIPE_CREATOR_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID` still placeholder; checkout/webhook won't work until filled in.

### Recommended next milestone

**Payment receipt links** — add a `/api/stripe/invoice-redirect/[invoiceId]` GET route: auth check, verify the payment's subscription belongs to the requesting user (Prisma ownership check), call `stripe.invoices.retrieve(invoiceId)`, redirect to `hosted_invoice_url`. Then update `PaymentHistorySection` to render a "View" link for each row that has a `stripeInvoiceId`.

---

## Session: Phase 4 – Middleware + Access Control — 2026-06-15

### What was inspected

- `proxy.ts` (root) — existing auth guard for `/dashboard`; no email-verified or subscription checks.
- `auth.ts` — JWT/session callbacks; `isEmailVerified` already written into the JWT at login; roles included. Confirmed `EmailNotVerifiedError` prevents login if email unverified, so `isEmailVerified` is always `true` for fresh sessions, but old JWTs (pre-feature) could carry `false`.
- `next-auth.d.ts` — `session.user.isEmailVerified: boolean` confirmed in both `Session` and `JWT` augmentations.
- `prisma/schema.prisma` — `SubscriptionStatus` enum: `TRIALING`, `ACTIVE` are the active states.
- `lib/prisma.ts` — Neon HTTP adapter; Node.js runtime compatible.
- Next.js 16 docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`) — Confirmed: `middleware` was deprecated and renamed to `proxy` in v16.0.0; `proxy.ts` at root IS the entry point; defaults to Node.js runtime since v16.

### What changed

- **`proxy.ts`** — made callback async; added two new guards after the existing auth check:
  - `requireEmailVerified` for `/dashboard/avatars`: if `user.isEmailVerified` is falsy, redirect to `/verify-email?next=<pathname>`.
  - `requireSubscription` for `/dashboard/bookings`: calls `userHasActiveSubscription(user.id)`; if no active sub, redirect to `/pricing?reason=subscription-required`.

- **`lib/subscription.ts`** (new) — `userHasActiveSubscription(userId): Promise<boolean>`. Queries Prisma for a `TRIALING` or `ACTIVE` subscription row. Called from proxy on every `/dashboard/bookings` request (Node.js runtime; acceptable latency trade-off).

- **`app/verify-email/page.tsx`** (new) — Minimal page shown when a logged-in user hits the email-verified guard. Displays the `next` param in the message; links back to `/dashboard`.

- **`app/(marketing)/pricing/page.tsx`** (new) — Minimal pricing page inside the marketing shell. Shows a banner when `reason=subscription-required`; three plan cards (Free, Creator, Enterprise) with placeholder pricing.

### Files changed

| File                               | Status                                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| `proxy.ts`                         | Updated — async callback, email-verified + subscription guards added |
| `lib/subscription.ts`              | Created — `userHasActiveSubscription` Prisma helper                  |
| `app/verify-email/page.tsx`        | Created — email verification gate landing page                       |
| `app/(marketing)/pricing/page.tsx` | Created — pricing stub with subscription-gate banner                 |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 21 routes; "ƒ Proxy (Middleware)" confirmed in build output
```

### Manual verification notes

- `proxy.ts` exports `proxy` + `config` — the Next.js 16 convention; the build output shows `ƒ Proxy (Middleware)` confirming it is active.
- The `requireAuth` guard (existing) redirects unauthenticated users hitting `/dashboard/*` to `/login?callbackUrl=<path>`.
- The `requireEmailVerified` guard fires for `/dashboard/avatars` when `user.isEmailVerified` is falsy (reads from JWT — no DB call).
- The `requireSubscription` guard fires for `/dashboard/bookings` via a Prisma DB call per request. This is a known latency trade-off documented below.
- `/verify-email` and `/pricing` routes now exist and return sensible pages rather than 404s.

### Unresolved issues

1. **Subscription guard uses a DB call per request** — `userHasActiveSubscription` queries Prisma on every `/dashboard/bookings` page load. Future improvement: expose subscription status in the JWT/session (requires adding a field to the `jwt` callback in `auth.ts` and refreshing on sub changes via a webhook handler) so the guard can read from the token instead.
2. **Email-verified guard is currently a no-op in practice** — `auth.ts` throws `EmailNotVerifiedError` at login, so any active session has `isEmailVerified: true`. The guard protects against old JWT tokens (issued before the check was added) and guards against future auth flow changes.
3. **`requirePermission` and `/admin` guards** — intentionally omitted per Phase 4 scope. To be added in a future milestone.
4. **Pricing page is a stub** — plan cards use placeholder copy and prices. Replace with real pricing once finalized.
5. **Verify-email page is a stub** — does not include a "resend verification email" button. Add that CTA in a follow-up.

### Recommended next milestone

**Expose subscription status in the JWT** — Add `subscriptionStatus` (or a boolean `hasActiveSubscription`) to the JWT in `auth.ts`'s `jwt` callback (fresh DB query on initial sign-in). Update the Stripe webhook handler to call `signIn`/JWT refresh or set a cookie when subscription status changes. Switch `proxy.ts` `requireSubscription` to read from `session.user` instead of calling Prisma, eliminating the per-request DB query.

---

## Session: Theme-aware SiteLogo branding component — 2026-06-15

### What was inspected

- `components/marketing/marketing-header.tsx` — async server component with `auth()`, hardcoded green `next/image` logo.
- `app/(marketing)/layout.tsx` — wraps marketing pages with `MarketingHeader` + `MarketingFooter`.
- `app/layout.tsx` — `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `suppressHydrationWarning`; left untouched.
- `components/ui/theme-toggle.tsx` — `"use client"`, uses `useTheme`; left untouched.
- `public/` — confirmed both `youmimic-green-transparent.png` and `youmimic-white-transparent.png` exist.
- `components/dashboard/dashboard-header.tsx` — `"use client"`, `md:hidden` text span wordmark "YouMimic".
- `components/dashboard/app-sidebar.tsx` — `"use client"`, text Link "YouMimic" in sidebar header, also passes `onMobileClose` onClick.
- `components/branding/` — did not exist prior to this session.

### What changed

Created a reusable `SiteLogo` client component and wired it into the marketing header, dashboard header, and sidebar.

**Hydration strategy**: `useSyncExternalStore` (returns `false` on server, `true` after client hydration) replaces the `useState`+`useEffect` pattern to satisfy the project's `react-hooks/set-state-in-effect` lint rule.

**Variant logic**:

- `forceVariant="dark"` — always renders `/youmimic-white-transparent.png`; `src` is determined at module eval, no hydration concern.
- `forceVariant="light"` — always renders `/youmimic-green-transparent.png`; same reasoning.
- `forceVariant="auto"` (default) — waits for `mounted = true` before rendering the `<Image>`; renders an `sr-only` span in the interim to keep layout stable.

### Files changed

| File                                        | Status                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `components/branding/site-logo.tsx`         | **Created** — `"use client"`, `SiteLogoProps`, `useSyncExternalStore` mount guard, `forceVariant` logic                              |
| `components/marketing/marketing-header.tsx` | Updated — replaced `next/image` + `Link` logo block with `<SiteLogo forceVariant="dark" />`; removed `Image` import                  |
| `components/dashboard/dashboard-header.tsx` | Updated — replaced `<span md:hidden>YouMimic</span>` with `<SiteLogo className="flex items-center md:hidden" forceVariant="auto" />` |
| `components/dashboard/app-sidebar.tsx`      | Updated — replaced text `Link` wordmark with `<SiteLogo href="/dashboard" onClick={onMobileClose} forceVariant="auto" />`            |

### Behavior expectations

| Location                  | Variant               | Light mode | Dark mode  |
| ------------------------- | --------------------- | ---------- | ---------- |
| Marketing header (`/`)    | `forceVariant="dark"` | White logo | White logo |
| Dashboard header (mobile) | `forceVariant="auto"` | Green logo | White logo |
| Sidebar wordmark          | `forceVariant="auto"` | Green logo | White logo |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 20 routes; / ƒ Dynamic (unchanged)
```

### Unresolved issues

1. Sidebar uses `bg-sidebar` CSS variables — in dark mode the sidebar background is dark, so the white auto-logo reads correctly. If the sidebar ever adopts a light background in dark mode, `forceVariant` may need revisiting.
2. `/public/hero-bg.jpg` placeholder (from prior session) — still not replaced with a real photo.
3. Pricing tier prices still placeholder text.

### Recommended next milestone

**`/contact` or demo booking route** — a form page at `app/(marketing)/contact/page.tsx` collecting name, email, company, and message, calling the existing Resend mailer. Replace hero secondary CTA and final CTA section links with `/contact`.

---

## Session: Hero background + palette color system — 2026-06-13

### What was inspected

- `app/globals.css` — previous okclh-neutral design token set; fully replaced with YouMimic palette.
- `app/(marketing)/page.tsx` — previous monochrome landing page; all 8 sections rebuilt with palette tokens.
- `components/ui/button.tsx` — confirmed `style` prop passthrough works for inline color overrides.
- `public/` — no hero image file exists. Background image CSS is in place; `hero-bg.jpg` activates automatically once dropped in `public/`.

### Color system redesign

New `globals.css` maps the YouMimic brand palette to semantic CSS variables:

| Palette hex | oklch approx             | Semantic role (light)              | Semantic role (dark)                   |
| ----------- | ------------------------ | ---------------------------------- | -------------------------------------- |
| `#ECEAE9`   | `oklch(0.934 0.005 78)`  | `--background`                     | `--foreground`, `--primary-foreground` |
| `#191818`   | `oklch(0.130 0.003 30)`  | `--foreground`                     | `--background`                         |
| `#604B33`   | `oklch(0.370 0.075 60)`  | `--primary` (warm brown)           | `--accent`                             |
| `#60918C`   | `oklch(0.590 0.068 178)` | `--accent` (dusty teal)            | `--primary`                            |
| `#9AB5C7`   | `oklch(0.868 0.028 210)` | `--secondary` (steel blue derived) | muted palette                          |
| `#ACC8CE`   | `oklch(0.892 0.022 205)` | `--muted` (light teal surface)     | —                                      |

**Light mode ring/ring**: teal `--accent`; **dark mode primary**: teal (teal reads warmer on charcoal than brown). Sidebar vars intentionally unchanged — dashboard has its own design language.

### Hero background implementation

The hero section uses a 3-layer CSS approach requiring no JavaScript and no image dependency:

1. **Layer 1** — `background-color: #191818` (charcoal fallback) + `background-image: url('/hero-bg.jpg')` (activates automatically when file exists in `/public/`)
2. **Layer 2** — directional gradient: `from-[#191818]/95 via-[#191818]/78 to-[#191818]/42` (left-opaque so text is always readable)
3. **Layer 3** — radial ambient palette tints: warm brown at bottom-left, teal at top-right

The hero is always dark (`#191818` base) regardless of the theme setting, so ProductMockup uses explicit palette hex values (`#ECEAE9` cream surface) rather than CSS tokens.

### ProductMockup update

`ProductMockup` is now fully hardcoded to light cream palette colors so it reads as a floating bright panel against the always-dark hero:

- Panel background: `#ECEAE9`
- Status/action accents: `#60918C` teal
- Typography: `#191818` near-black
- Language chips: `rgba(154,181,199,0.25)` steel-blue tint
- Generate button: `#604B33` brown / `#ECEAE9` cream (matches hero CTA)

### Section palette mapping

| Section                  | Before                                     | After                                               |
| ------------------------ | ------------------------------------------ | --------------------------------------------------- |
| Stats numbers            | `text-foreground` / `font-bold`            | `text-primary` (brown in light, teal in dark)       |
| Feature icon containers  | `bg-foreground/10`, icon `text-foreground` | `bg-accent/10 border-accent/20`, icon `text-accent` |
| Step badges              | neutral `bg-muted`                         | `bg-primary text-primary-foreground` (brown/cream)  |
| Avatar initials circle   | neutral                                    | `bg-accent/15 text-accent` (teal)                   |
| Avatar Active dot        | `emerald-500`                              | `bg-accent` (teal token)                            |
| Pricing highlight ring   | `ring-foreground`                          | `ring-primary` (brown in light, teal in dark)       |
| Final CTA                | `bg-foreground text-background`            | hardcoded `#191818` bg + ambient palette tints      |
| Final CTA primary button | default variant                            | hardcoded `#604B33` bg / `#ECEAE9` text             |

### Hero placeholder asset

`/public/hero-bg.jpg` does not exist yet. The hero renders perfectly without it (dark charcoal + radial tints). Drop any high-quality atmospheric photo (people in professional settings, office environments, video studio backdrop) into `public/hero-bg.jpg` — the gradient overlay will darken and blend it automatically. Recommended: 1920×1080 minimum, dark/moody tone preferred.

### What changed

| File                       | Status                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `app/globals.css`          | Updated — full palette color token redesign, `:root` + `.dark` blocks rewritten                         |
| `app/(marketing)/page.tsx` | Updated — hero 3-layer CSS background, ProductMockup explicit palette colors, all section token mapping |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 20 routes; / ƒ Dynamic (unchanged, expected)
```

### Unresolved issues

1. `/public/hero-bg.jpg` placeholder — add a real photo to get the hero background image effect.
2. Hero CTA buttons use inline `style` prop overrides — this bypasses Tailwind's purge-safe class system but is intentional for hardcoded palette hex on the always-dark hero. If the hero palette changes, update the inline styles in the hero and final CTA sections.
3. Pricing tier prices are still placeholder text. Replace when pricing is finalized.

### Recommended next milestone

**`/contact` or demo booking route** — a simple form page at `/contact` or `/demo` within `app/(marketing)/` that collects name, email, company, and message, then calls the existing Resend mailer. Replace both hero secondary CTA and final CTA with `/contact` for enterprise-intent visitors.

---

## Session: Shared marketing shell + auth-aware header + visual upgrade — 2026-06-13

### What was inspected

- `app/page.tsx` — previous single-file landing page with inline header/footer, no auth awareness.
- `app/layout.tsx` — root layout; only ThemeProvider + fonts. No shared chrome.
- `app/(dashboard)/layout.tsx` — DashboardShell; unaffected.
- `components/ui/theme-toggle.tsx` — existing `"use client"` ThemeToggle using `next-themes`; reused as-is.
- `components/auth/sign-out-button.tsx` — dashboard sign-out; dashboard already has this; marketing header does not duplicate it.
- `app/login/page.tsx` — already has `auth()` call and "already logged in" state; kept unchanged.
- `app/signup/page.tsx` — no auth check needed; kept unchanged.

### Architecture: `(marketing)` route group

Created `app/(marketing)/` route group:

| Route          | Layout                                                               | Result                   |
| -------------- | -------------------------------------------------------------------- | ------------------------ |
| `/`            | `app/(marketing)/layout.tsx` → `MarketingHeader` + `MarketingFooter` | `ƒ Dynamic` (auth check) |
| `/login`       | root layout only                                                     | `ƒ Dynamic` (unchanged)  |
| `/signup`      | root layout only                                                     | `○ Static` (unchanged)   |
| `/dashboard/*` | `app/(dashboard)/layout.tsx` → `DashboardShell`                      | `ƒ Dynamic` (unchanged)  |

`app/page.tsx` was deleted — the route is now handled by `app/(marketing)/page.tsx`.

### Auth-aware header

`MarketingHeader` is an `async` server component that calls `auth()`:

- **No session** → `ThemeToggle` | Sign in (ghost) | Get started (default)
- **Session exists** → `ThemeToggle` | Dashboard (default)

Sign-out is not exposed in the marketing header; users sign out from within the dashboard sidebar (already implemented). This avoids an unnecessary client component dependency in the marketing shell.

### Theme toggle

- `ThemeToggle` from `components/ui/theme-toggle.tsx` is reused unchanged.
- `ThemeProvider` in `app/layout.tsx` already configured with `defaultTheme="system"` and `enableSystem`.
- `suppressHydrationWarning` on `<html>` prevents flicker; `next-themes` injects its class-setting script before React hydrates.
- Toggle is always visible in the header regardless of auth state.

### Landing page visual improvements

`app/(marketing)/page.tsx` now has 8 sections vs. the previous 6:

| Section             | What changed                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero**            | Split two-column layout: copy left, `ProductMockup` right (desktop only). Mockup is a div-only product UI mock — window chrome, video preview area, status + language panel, script lines, action bar. No images. |
| **Stats strip**     | NEW — 4 stats bar (`3 min`, `125+`, `500+`, `99.9%`) on `bg-muted/30`.                                                                                                                                            |
| **Features**        | Upgraded from 4-column icon cards to 2×2 horizontal `flex` cards with larger icons (size-10) and bolder treatment.                                                                                                |
| **How it works**    | Upgraded from plain numbered text to 3 bordered `bg-card` panels, each with step number badge + lucide icon in top-right. Icons: `Video`, `Cpu`, `Share2`.                                                        |
| **Avatar showcase** | NEW — 3 example avatar cards showing deployed avatars: initial, name, role, `Active`/`Processing` status dot, language chip row.                                                                                  |
| **Use cases**       | Same content; icons upsized (size-10), font-weight boosted to `font-semibold`.                                                                                                                                    |
| **Pricing**         | Unchanged — already clean.                                                                                                                                                                                        |
| **Final CTA**       | Unchanged — dark inverted section.                                                                                                                                                                                |

`ProductMockup` is a private function component inside the page file — it is desktop-only (`hidden lg:flex`).

### Status dot colors

Two semantic colors added for avatar status dots only (`emerald-500` for Active, `amber-400` for Processing). These are status-semantic and isolated to the showcase section.

### What changed

| File                                        | Status                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `app/page.tsx`                              | **Deleted** — route moved to route group                                    |
| `app/(marketing)/layout.tsx`                | **Created** — `MarketingHeader` + `main.flex-1` wrapper + `MarketingFooter` |
| `app/(marketing)/page.tsx`                  | **Created** — full enhanced landing page (8 sections)                       |
| `components/marketing/marketing-header.tsx` | **Created** — async server component, auth-aware, ThemeToggle               |
| `components/marketing/marketing-footer.tsx` | **Created** — static server component                                       |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean (after clearing stale .next/types cache from old app/page.tsx)
npm run build     → clean; / ƒ Dynamic; all 19 routes intact; dashboard/auth unchanged
```

### Route-group caveats

- `/login` and `/signup` are intentionally NOT in the `(marketing)` group — they have their own full-screen centered layout and don't want marketing chrome.
- If a future marketing page (e.g., `/pricing`, `/about`) is added, place it in `app/(marketing)/` and it will automatically inherit the header and footer.
- The `/` route changed from `○ Static` to `ƒ Dynamic` because `auth()` in `MarketingHeader` reads request cookies. This is expected behavior.

### Unresolved issues

1. Pricing tier prices are still placeholders. Replace when actual pricing is confirmed.
2. No `/contact` or `/demo` route — final CTA still routes to `/signup`.
3. `ProductMockup` and avatar showcase use illustrative/fictional data — replace when real product screenshots or brand guidelines are available.
4. Status dot colors (`emerald-500`, `amber-400`) are not in the design token system — acceptable for semantic status indicators, but could be added as CSS variables if the design system is formalized.

### Recommended next milestone

**`/contact` or demo booking route** — a simple form page at `/contact` or `/demo` that collects name, email, company, and a message/use-case, then uses the existing Resend mailer (`lib/mailer.ts`) to notify the team. Link both the hero secondary CTA and the final CTA section to this page instead of `/signup` for enterprise-intent visitors.

---

## Session: Landing page — production marketing homepage — 2026-06-13

### What was inspected

- `app/page.tsx` — confirmed default Next.js starter (Next.js logo, Vercel/Next.js links, boilerplate copy). No business content.
- `components/ui/button.tsx` — base-ui + Slot-based Button, `asChild` available, sizes up to `lg` (h-9); added `h-11` custom height overrides for hero CTAs.
- `components/ui/card.tsx` — `overflow-hidden` on root card; avoided absolute-positioned children; "Most popular" badge placed inside `CardHeader` instead.
- `app/layout.tsx` — Geist font vars, ThemeProvider wrapping; landing page shares the root layout.
- `app/globals.css` — oklch neutral palette, Tailwind v4. No hue-based accent tokens in the design system; page stays within monochrome + foreground/background inversion for the final CTA section.

### What changed

- **`app/page.tsx`** — replaced default starter with a full marketing landing page:
  - **Sticky nav**: YouMimic wordmark (left) + Sign in (ghost) + Get started (default) CTAs (right).
  - **Hero**: bold headline "Say it once. Scale it everywhere.", supporting copy, primary CTA → `/signup`, secondary CTA → `/login`.
  - **Value propositions**: 4-column grid of icon cards — Immediate deployment, Production at scale, Multilingual by default, Enterprise governance.
  - **How it works**: 3 numbered steps (01–03) — Record → Avatar built → Generate and deploy.
  - **Use cases**: 2-column icon+text list — Employee training, Customer communication, Marketing, Internal updates.
  - **Pricing preview**: 3 tiers (Creator / Enterprise / Custom), Enterprise highlighted with `ring-2 ring-foreground` and "Most popular" badge. All CTAs → `/signup`.
  - **Final CTA**: dark inverted section (`bg-foreground text-background`) with Create account and Sign in CTAs.
  - **Footer**: copyright + Sign in / Get started links.
  - No `"use client"` — pure server component; builds as `○ (Static)`.

### Files changed

| File           | Status                                 |
| -------------- | -------------------------------------- |
| `app/page.tsx` | Replaced — full marketing landing page |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; / ○ (Static) confirmed; all 19 routes intact
```

### Unresolved issues

1. Nav bar does not reflect authentication state — always shows Sign in + Get started. A follow-up could add a server-side session check (`auth()`) to swap "Sign in" for "Go to dashboard" when a user is already signed in.
2. Pricing tier prices are currently placeholders ("Contact us", "Custom pricing", "Talk to us"). Replace with actual pricing once finalized.
3. No `/contact` or `/demo` route — the final CTA section routes to `/signup` as the conversion destination. A dedicated demo/contact flow would improve enterprise conversion.
4. `© 2026` hardcoded — should be updated annually or replaced with a dynamic expression once there is a defined revalidation strategy for the static page.

### Recommended next milestone

**Auth-aware nav** — make the sticky nav server-side aware: import `auth()`, if session exists replace "Sign in / Get started" with "Go to dashboard" link. This requires making `app/page.tsx` `async` but it remains a server component. No layout changes needed.

---

## Session: Billing page debug — cancelAtPeriodEnd stale display — 2026-06-13

### What was inspected

- `app/(dashboard)/dashboard/billing/page.tsx` — full Prisma queries, `SubscriptionDetails` wording logic, page caching configuration.
- `app/api/stripe/webhook/route.ts` — `handleSubscriptionUpsert`: confirmed `cancelAtPeriodEnd: sub.cancel_at_period_end` is written correctly; `handleInvoicePaid`: unordered `findFirst`.
- `app/api/stripe/customer-portal/route.ts` — `return_url` was pointing to `/dashboard` (not `/dashboard/billing`); two unordered `findFirst` calls.
- `prisma/schema.prisma` — `Subscription.stripeCustomerId` is `@unique`, but a user can have multiple rows if they re-subscribe after cancellation (new Stripe customer → new row). `updatedAt` field exists via `@updatedAt`.

### Root causes identified

1. **`findFirst` without `orderBy`** — `personalSub`, both portal lookups, and invoice-paid lookup all used `findFirst` with no ordering. With multiple subscription rows per owner (possible after cancel+re-subscribe), Postgres returns an arbitrary row, which could be an older CANCELED row with `cancelAtPeriodEnd=false`. Fixed with `orderBy: { updatedAt: "desc" }` on all four call sites.

2. **Wrong `return_url`** — Stripe Portal returned users to `/dashboard`, not `/dashboard/billing`, so they never saw the updated billing page after a portal action. Fixed to `/dashboard/billing`.

3. **Wording mismatch** — `cancelAtPeriodEnd=true` rendered "Ends on" instead of the required "Expires on". Fixed.

4. **Warning used `canceledAt` instead of `cancelAtPeriodEnd`** — Stripe only sets `canceled_at` when the subscription is actually canceled (not when cancel-at-period-end is first set), so the "Scheduled to cancel" banner never appeared for portal-initiated cancellations. Switched condition to `cancelAtPeriodEnd`.

5. **No `force-dynamic`** — The page was already dynamic (uses `cookies()` via `auth()`), but `export const dynamic = "force-dynamic"` was not declared. Added as an explicit safeguard against any future Full Route Cache regression.

### Note on `STRIPE_WEBHOOK_SECRET`

If `STRIPE_WEBHOOK_SECRET` is still the placeholder `whsec_...`, the webhook handler returns 500 and `cancelAtPeriodEnd` will never be updated in the DB regardless of the above fixes. Fill in the real secret from `stripe listen` (local) or Stripe Dashboard (prod).

### What changed

| File                                         | Change                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(dashboard)/dashboard/billing/page.tsx` | Added `force-dynamic`; `personalSub` and enterprise sub queries now `orderBy: { updatedAt: "desc" }`; wording "Ends on" → "Expires on"; cancellation warning now checks `cancelAtPeriodEnd` instead of `canceledAt` |
| `app/api/stripe/customer-portal/route.ts`    | Both `findFirst` calls now `orderBy: { updatedAt: "desc" }`; `return_url` changed from `/dashboard` to `/dashboard/billing`                                                                                         |
| `app/api/stripe/webhook/route.ts`            | `handleInvoicePaid` `findFirst` now `orderBy: { updatedAt: "desc" }`                                                                                                                                                |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; /dashboard/billing ƒ Dynamic (confirmed)
```

### Unresolved issues

1. `STRIPE_WEBHOOK_SECRET` placeholder — webhook events will be rejected until filled in.
2. `STRIPE_CREATOR_PRICE_ID` / `STRIPE_ENTERPRISE_PRICE_ID` still placeholder — checkout returns 500.
3. No payment history view (Payment records exist but not surfaced in UI).

### Recommended next milestone

**Payment history** — add a collapsible or separate section to `/dashboard/billing` (or `/dashboard/billing/history`) that fetches `payment.findMany({ where: { subscription: { userId } } })` and renders a table of invoices with amount, date, and status. `Payment.stripeInvoiceId` can link to Stripe-hosted receipts.

---

## Session: Billing dashboard page — 2026-06-13

### What was inspected

- `prisma/schema.prisma` — `Subscription { ownerType, planType, status, currentPeriodEnd, cancelAtPeriodEnd, stripeCustomerId }`, `Enterprise { ownerUserId }`, `EnterpriseMember { enterpriseId, userId }`.
- `auth.ts` — `session.user.id` is the DB user ID; confirmed no billing-specific fields in JWT.
- `app/(dashboard)/dashboard/settings/page.tsx` + `avatars/page.tsx` — established patterns: `auth()` → redirect if no session, Prisma fetch with `select`, `Card`/`CardContent`/`CardHeader`/`CardTitle`/`CardFooter` layout, `formatDate` with `Intl.DateTimeFormat("en-CA")`.
- `components/dashboard/booking-actions.tsx` — client component pattern: `"use client"`, `useState` for busy/error, `fetch` + `router.refresh()`; confirmed `Button` variants (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`).
- `components/ui/card.tsx` — confirmed `CardFooter` has `border-t bg-muted/50` for visual separation; confirmed `CardAction` slot exists for right-aligned header content.
- `app/api/stripe/checkout-session/route.ts` + `customer-portal/route.ts` — confirmed request shape: `{ planType, enterpriseId? }` and `{ enterpriseId? }` respectively; confirmed both return `{ url }`.
- `components/dashboard/app-sidebar.tsx` — confirmed `/dashboard/billing` nav link already present.

### What changed

1. **`components/dashboard/billing-actions.tsx`** (new) — `"use client"` component.
   - Exports `BillingAction` type (discriminated union `{ type: "checkout", planType, enterpriseId? } | { type: "portal", enterpriseId? }`).
   - Exports `BillingActionButton`: accepts `action`, `label`, `variant`; manages `busy`/`error` state; POSTs to `/api/stripe/checkout-session` or `/api/stripe/customer-portal`; on success redirects via `window.location.href = url` (no `router.refresh` needed — Stripe-hosted page); on error shows inline `text-destructive` message; keeps button disabled until redirect or error.

2. **`app/(dashboard)/dashboard/billing/page.tsx`** (new) — server component at `/dashboard/billing`.
   - `auth()` → redirect to `/login` if no session.
   - Three Prisma queries run in `Promise.all`:
     - `personalSub` — `subscription.findFirst({ where: { userId, ownerType: "USER" } })`
     - `ownedEnterprises` — `enterprise.findMany({ where: { ownerUserId } })` with nested `subscriptions` (latest 1)
     - `memberEnterprises` — `enterpriseMember.findMany({ where: { userId, enterprise: { ownerUserId: { not: userId } } } })`
   - `resolveAction(sub, planType, enterpriseId?)` → determines `BillingAction`, button label, and variant:
     - No sub / `stripeCustomerId` absent / CANCELED / INCOMPLETE_EXPIRED → Subscribe (checkout)
     - INCOMPLETE → Complete checkout (checkout re-initiation, reuses existing customer)
     - All other statuses (ACTIVE/TRIALING/PAST_DUE/UNPAID/PAUSED) → Manage billing (portal, outline variant)
   - Three sections (sections hidden if empty):
     - **Personal plan** — `PersonalPlanCard` with subscribe or manage-billing CTA.
     - **Enterprise plans** — one `EnterprisePlanCard` per owned enterprise.
     - **Enterprise memberships** — `MembershipNoticeCard` (read-only, no action buttons) for non-owned memberships.
   - `SubscriptionDetails` renders: plan badge + status badge, renewal/end date (hidden for canceled/expired), PAST_DUE warning, UNPAID warning, cancel-at-period-end warning, INCOMPLETE explanation.
   - No Stripe IDs exposed in the UI.

### Files changed

| File                                         | Status  |
| -------------------------------------------- | ------- |
| `components/dashboard/billing-actions.tsx`   | Created |
| `app/(dashboard)/dashboard/billing/page.tsx` | Created |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; /dashboard/billing ƒ Dynamic (18 routes total)
```

### Unresolved issues

1. Stripe price ID env vars (`STRIPE_CREATOR_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`) are still placeholders — checkout will return HTTP 500 until filled in from Stripe Dashboard.
2. The billing portal requires a Stripe Billing Portal configuration to be set up in the Stripe Dashboard before it can be opened.
3. No payment history view — `Payment` records exist in the DB but are not surfaced in any UI yet.
4. `/dashboard/billing` shows personal plan as "No active subscription" for all new users (correct behaviour for a fresh account).

### Recommended next milestone

**Payment history** — add a collapsible or separate "Payment history" section to the billing page (or a sub-route `/dashboard/billing/history`) that fetches `payment.findMany({ where: { subscription: { userId } } })` and renders a table of invoices with amount, date, and status. The `Payment` model has `stripeInvoiceId` which could link to Stripe-hosted receipts.

---

## Session: Stripe billing backend — 2026-06-13

### What was inspected

- `prisma/schema.prisma` — `Subscription` model with `BillingOwnerType`, `PlanType`, `SubscriptionStatus` enums; `Payment` model with `stripeInvoiceId`, `stripePaymentIntentId`, `currency`. Confirmed `subscriptions_exactly_one_owner_check` constraint (exactly one of `userId`/`enterpriseId` set).
- `auth.ts` / `next-auth.d.ts` — JWT strategy; `session.user.id` is the authenticated user's DB ID; `roles` array available but not needed for billing ownership (ownership is determined by `enterprise.ownerUserId`).
- `app/api/bookings/route.ts` — existing API pattern: `auth()` check, Zod safeParse, 422 fieldErrors.
- `node_modules/stripe` v22.2.0 — breaking change: `current_period_start`/`current_period_end` moved from `Subscription` to `SubscriptionItem` level.
- `app/generated/prisma/enums.ts` — Prisma client was stale (predated migration `20260613035944`); regenerated before typecheck.

### What changed

1. **`lib/stripe.ts`** (new) — Server-only Stripe singleton. Throws at module load if `STRIPE_SECRET_KEY` is missing.

2. **`app/api/stripe/checkout-session/route.ts`** (new) — `POST`. Requires auth.
   - Body: `{ planType: "CREATOR" | "ENTERPRISE", enterpriseId?: string }`.
   - CREATOR: uses `session.user.id` only; never accepts a price ID from the client.
   - ENTERPRISE: verifies `enterprise.ownerUserId === session.user.id`; returns 403 otherwise.
   - Finds or creates a Stripe customer and a stub `Subscription` record (`status: INCOMPLETE`) before creating the checkout session.
   - Price mapping: `CREATOR → STRIPE_CREATOR_PRICE_ID`, `ENTERPRISE → STRIPE_ENTERPRISE_PRICE_ID`; returns 500 if env var is still placeholder.
   - Returns `{ url }` — client must redirect there.

3. **`app/api/stripe/customer-portal/route.ts`** (new) — `POST`. Requires auth.
   - Body: `{ enterpriseId?: string }`. If omitted, opens portal for the user's own subscription.
   - Enterprise path: same ownership guard as checkout.
   - Looks up `stripeCustomerId` from local `Subscription`; returns 404 if none found.
   - Returns `{ url }`.

4. **`app/api/stripe/webhook/route.ts`** (new) — `POST`. No auth — verified by Stripe signature.
   - Reads raw body via `req.text()` (no JSON pre-parsing).
   - Returns 400 on invalid signature, 500 on processing error, 200 otherwise.
   - Handled events:
     - `checkout.session.completed` → update subscription `stripeSubscriptionId`, `planType`, `status: ACTIVE`
     - `customer.subscription.updated` → sync status, item periods, price, product, `cancelAtPeriodEnd`, `canceledAt`, `trialEndsAt`
     - `customer.subscription.deleted` → same handler; sets status to `CANCELED`
     - `invoice.payment_succeeded` → upsert `Payment` record keyed on `stripeInvoiceId`
     - `invoice.payment_failed` → set subscription `status: PAST_DUE`
   - All DB writes use `updateMany` (keyed on `stripeCustomerId`) or `upsert` — fully idempotent.

5. **`.env`** — replaced `STRIPE_STARTER_PRICE_ID`/`STRIPE_PRO_PRICE_ID` (did not match schema enums) with `STRIPE_CREATOR_PRICE_ID`.

6. **`prisma generate`** — regenerated client after migration `20260613035944_add_subscription_owner_check` had not been reflected.

### Files changed

| File                                       | Status                                                         |
| ------------------------------------------ | -------------------------------------------------------------- |
| `lib/stripe.ts`                            | Created                                                        |
| `app/api/stripe/checkout-session/route.ts` | Created                                                        |
| `app/api/stripe/customer-portal/route.ts`  | Created                                                        |
| `app/api/stripe/webhook/route.ts`          | Created                                                        |
| `.env`                                     | Updated — `STRIPE_CREATOR_PRICE_ID` added, stale stubs removed |
| `app/generated/prisma/*`                   | Regenerated via `prisma generate`                              |

### Required environment variables

| Variable                     | Purpose                             | Source                                                                                            |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`          | Stripe API key                      | Stripe Dashboard → Developers → API keys                                                          |
| `STRIPE_WEBHOOK_SECRET`      | Webhook signature secret            | `stripe listen --forward-to localhost:3000/api/stripe/webhook` (local) or Stripe Dashboard (prod) |
| `STRIPE_CREATOR_PRICE_ID`    | Price ID for the CREATOR plan       | Stripe Dashboard → Products                                                                       |
| `STRIPE_ENTERPRISE_PRICE_ID` | Price ID for the ENTERPRISE plan    | Stripe Dashboard → Products                                                                       |
| `NEXT_PUBLIC_APP_URL`        | Base URL for checkout redirect URLs | Already set                                                                                       |

### Test steps

1. **Webhook local testing**:

   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   # Copy the whsec_... shown and update STRIPE_WEBHOOK_SECRET in .env
   ```

2. **Creator checkout** (authenticated as any user):

   ```bash
   curl -X POST http://localhost:3000/api/stripe/checkout-session \
     -H "Cookie: <session-cookie>" \
     -H "Content-Type: application/json" \
     -d '{"planType":"CREATOR"}'
   # Returns {"url":"https://checkout.stripe.com/..."}, open in browser
   ```

3. **Enterprise checkout** (authenticated as enterprise owner):

   ```bash
   curl -X POST http://localhost:3000/api/stripe/checkout-session \
     -H "Cookie: <session-cookie>" \
     -H "Content-Type: application/json" \
     -d '{"planType":"ENTERPRISE","enterpriseId":"<id>"}'
   ```

4. **Negative cases to verify**:
   - Non-owner attempting enterprise checkout → 403
   - Missing `enterpriseId` for ENTERPRISE plan → 422
   - Webhook with wrong signature → 400
   - `customer-portal` with no prior subscription → 404

5. **Webhook trigger test**:
   ```bash
   stripe trigger checkout.session.completed
   stripe trigger customer.subscription.updated
   stripe trigger invoice.payment_succeeded
   ```

### Checks run

```
prisma generate   → clean
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; /api/stripe/checkout-session /api/stripe/customer-portal /api/stripe/webhook all ƒ Dynamic
```

### Unresolved issues

1. Stripe price IDs in `.env` are still placeholders (`price_...`). Checkout will return 500 until real price IDs are filled in.
2. No billing UI yet — `/dashboard/billing` still 404. The three backend routes are ready for a billing page to call.
3. Webhook secret placeholder (`whsec_...`) will cause 500 on any webhook call until filled in from `stripe listen`.

### Recommended next milestone

**Billing dashboard page** (`app/(dashboard)/dashboard/billing/page.tsx`) — server component, read subscription state from `prisma.subscription.findFirst({ where: { userId } })`, show plan badge + period dates + `CancelAtPeriodEnd` warning, "Upgrade" button (POST checkout-session) and "Manage Billing" button (POST customer-portal). Unauth redirect to `/login`, no-subscription state with upgrade CTA.

---

## Session: Settings page — 2026-06-13

### What was inspected

- `auth.ts` — JWT strategy; `authorize` returns `id`, `name`, `email`, `isEmailVerified`, `roles`. JWT is not auto-refreshed, so page does a fresh Prisma fetch for accurate `emailVerified`, `createdAt`, and role names.
- `next-auth.d.ts` — `session.user` shape: `id`, `name`, `email`, `roles: string[]`, `isEmailVerified: boolean`.
- `prisma/schema.prisma` — User model: `name`, `email`, `emailVerified`, `createdAt`; roles via `userRoles → role.name`. `passwordHash` never fetched or displayed.

### What changed

- **`app/(dashboard)/dashboard/settings/page.tsx`** (new) — Settings page at `/dashboard/settings`.
  - Server component; calls `auth()`, redirects to `/login` if no session or if Prisma returns no user.
  - Fresh `prisma.user.findUnique({ select: { name, email, emailVerified, createdAt, userRoles → role.name } })` — bypasses potentially stale JWT values.
  - **Read-only** — editing requires PATCH routes, JWT re-issuance (name), reverification email (email), or multi-step password flow; each is its own milestone.
  - Two `Card` sections:
    - **Account**: name, email, email verification badge (CheckCircle2 green / ShieldAlert yellow), member-since date.
    - **Access**: role chips (`flex-wrap` row of muted badges), or "No roles assigned" fallback.
  - `FieldRow` component: `dl` / `dt` / `dd` definition-list, `grid-cols-1` on mobile → `grid-cols-[10rem_1fr]` on `md+`.

### Files changed

| File                                          | Status  |
| --------------------------------------------- | ------- |
| `app/(dashboard)/dashboard/settings/page.tsx` | Created |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; /dashboard/settings ƒ Dynamic
```

---

## Session: Avatars page — 2026-06-13

### What was inspected

- `prisma/schema.prisma` — Avatar model: `id`, `userId`, `enterpriseId?`, `heygenAvatarId?`, `name`, `status` (default `"pending"`), `previewUrl?`, `videoUrl?`, `metadata?` (Json), `createdAt`
- `app/(dashboard)/dashboard/bookings/page.tsx` — server component pattern to replicate
- `components/dashboard/app-sidebar.tsx` — confirmed sidebar already links `/dashboard/avatars`
- `next.config.ts` — no `images.remotePatterns` configured; used `<Image unoptimized>` to avoid requiring domain config

### What changed

- **`app/(dashboard)/dashboard/avatars/page.tsx`** (new) — Avatars page at `/dashboard/avatars`.
  - Server component; calls `auth()`, redirects to `/login` if no session.
  - Fetches `prisma.avatar.findMany({ where: { userId }, include: { enterprise }, orderBy: { createdAt: "desc" } })`.
  - **Card grid** layout (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) — chosen over table because `previewUrl` is a visual thumbnail, most fields are optional (table would have many `—` cells), and cards collapse naturally on mobile.
  - Each card: thumbnail (aspect-video `<Image fill unoptimized>` or placeholder icon), avatar name + status badge, enterprise name if present, `createdAt` date, truncated `heygenAvatarId` if present, `videoUrl` link if present.
  - Empty state: `UserCircle2` icon + "No avatars yet" with provisioning note.
  - Status badge colours: `pending` → yellow, `processing`/`training` → blue, `ready`/`active` → green, `failed`/`error` → red, unknown → muted.
  - No creation form — avatars are platform-provisioned.

### Files changed

| File                                         | Status  |
| -------------------------------------------- | ------- |
| `app/(dashboard)/dashboard/avatars/page.tsx` | Created |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; /dashboard/avatars ƒ Dynamic
```

---

## Session: callbackUrl wiring — 2026-06-13

### What changed

- **`app/login/login-form.tsx`** — reads `callbackUrl` from `useSearchParams`. Sanitised: only accepted if it starts with `/` and not `//` (prevents open-redirect). Used as post-login destination; falls back to `/dashboard` when absent or invalid.

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean
```

---

## Session: Booking management flow — 2026-06-13

### What was inspected

- `lib/validations/booking.ts` — existing `createBookingSchema`: date required + parseable, HH:MM regex, notes max 500, cross-field timeEnd > timeStart. No past-date guard.
- `app/api/bookings/route.ts` — POST handler: auth check, safeParse, 422 + fieldErrors on failure, Prisma create, revalidatePath.
- `components/dashboard/new-booking-dialog.tsx` — create dialog: useForm + zodResolver, fetch POST, router.refresh on success, inline fieldErrors on 422. No `min` attr on date input, no notes counter.
- `app/(dashboard)/dashboard/bookings/page.tsx` — server component, reads bookings, renders BookingsTable, no edit/cancel actions.

### What changed

1. **`lib/validations/booking.ts`** — Added `notInPast` refinement to `requestedDate` (rejects dates before today's UTC date string). Exported `NOTES_MAX = 500` constant. Added `updateBookingSchema` (alias of the same base schema) and `UpdateBookingInput` type. The existing `createBookingSchema` and `CreateBookingInput` are unchanged in behaviour for callers.

2. **`app/api/bookings/[id]/route.ts`** (new) — `PATCH` handler for field updates. Guards: 401 (no session), 404 (not found), 403 (not owner), 409 (status is `cancelled` or `completed`). Validates body with `updateBookingSchema` (422 + fieldErrors on failure). Updates `requestedDate`, `timeStart`, `timeEnd`, `notes`. Calls `revalidatePath("/dashboard/bookings")`. Returns updated booking.

3. **`app/api/bookings/[id]/cancel/route.ts`** (new) — `POST` handler for cancellation. Same auth + ownership guards. Additional guards: 409 if already `cancelled` or `completed`. Sets `status = "cancelled"`, calls `revalidatePath`. Separate explicit endpoint — does not go through the PATCH handler.

4. **`components/dashboard/new-booking-dialog.tsx`** — Added `min={todayISO()}` on the date input (HTML-level guard matching the new Zod refinement). Added live notes character counter (`useWatch` on the notes field, displayed as `{n}/{500}`, turns destructive when over limit).

5. **`components/dashboard/booking-actions.tsx`** (new) — Client component `BookingActions`. Exports `BookingForActions` type (dates as strings for safe server→client prop passing). Renders nothing for `cancelled`/`completed` rows. For `pending`/`confirmed` rows: Edit icon button + Cancel icon button. Mounts two lazy dialogs:
   - **`EditDialog`**: prefilled form (same fields as create, same validation), `PATCH /api/bookings/[id]`, maps 422 fieldErrors back to form fields, `router.refresh()` on success.
   - **`CancelDialog`**: confirmation dialog, `POST /api/bookings/[id]/cancel`, `router.refresh()` on success.

6. **`app/(dashboard)/dashboard/bookings/page.tsx`** — Added `toBookingForActions` helper to serialize `Date` fields before passing to client. Added `Actions` column (header is `sr-only`). Each row renders `<BookingActions booking={toBookingForActions(booking)} />`.

### Files changed

| File                                          | Status                                                    |
| --------------------------------------------- | --------------------------------------------------------- |
| `lib/validations/booking.ts`                  | Updated — past-date guard, NOTES_MAX, updateBookingSchema |
| `app/api/bookings/[id]/route.ts`              | Created — PATCH update handler                            |
| `app/api/bookings/[id]/cancel/route.ts`       | Created — POST cancel handler                             |
| `components/dashboard/new-booking-dialog.tsx` | Updated — min date attr, notes counter                    |
| `components/dashboard/booking-actions.tsx`    | Created — edit + cancel dialogs                           |
| `app/(dashboard)/dashboard/bookings/page.tsx` | Updated — Actions column, toBookingForActions             |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean (0 errors)
npm run build     → clean; /api/bookings/[id] and /api/bookings/[id]/cancel both ƒ Dynamic
```

### Unresolved issues

1. **`app/(auth)/login/actions.ts`** — unused server action (`loginUser`). Still dead code.
2. **`app/page.tsx`** — boilerplate Next.js starter. Should be replaced with a landing page or `/dashboard` redirect.
3. **Dashboard stub nav items** — ~~Avatars~~ live, ~~Settings~~ live. Billing still 404.
4. ~~**`callbackUrl` param on login redirect**~~ — resolved.
5. **No enterprise selector in booking form** — `enterpriseId` omitted. Can be added if enterprise membership becomes relevant.
6. **Past-date guard is UTC-based** — `notInPast` compares `requestedDate >= new Date().toISOString().split("T")[0]`. Users in UTC− timezones may be blocked from booking "today" during early morning hours. A future improvement would accept a client timezone header and compute today's date in the user's local zone.

### Recommended next milestone

**Avatars page** (`app/(dashboard)/dashboard/avatars/page.tsx`) — server component, `prisma.avatar.findMany({ where: { userId } })`, card/table with status badges and `previewUrl` thumbnail if present, empty state. Avatars are platform-provisioned so no creation form needed initially.
