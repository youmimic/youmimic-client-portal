# HANDOFF.md

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

| File | Status |
|---|---|
| `components/dashboard/billing-actions.tsx` | Created |
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

| File | Status |
|---|---|
| `lib/stripe.ts` | Created |
| `app/api/stripe/checkout-session/route.ts` | Created |
| `app/api/stripe/customer-portal/route.ts` | Created |
| `app/api/stripe/webhook/route.ts` | Created |
| `.env` | Updated — `STRIPE_CREATOR_PRICE_ID` added, stale stubs removed |
| `app/generated/prisma/*` | Regenerated via `prisma generate` |

### Required environment variables

| Variable | Purpose | Source |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe API key | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature secret | `stripe listen --forward-to localhost:3000/api/stripe/webhook` (local) or Stripe Dashboard (prod) |
| `STRIPE_CREATOR_PRICE_ID` | Price ID for the CREATOR plan | Stripe Dashboard → Products |
| `STRIPE_ENTERPRISE_PRICE_ID` | Price ID for the ENTERPRISE plan | Stripe Dashboard → Products |
| `NEXT_PUBLIC_APP_URL` | Base URL for checkout redirect URLs | Already set |

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

| File | Status |
|---|---|
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

| File | Status |
|---|---|
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

| File | Status |
|---|---|
| `lib/validations/booking.ts` | Updated — past-date guard, NOTES_MAX, updateBookingSchema |
| `app/api/bookings/[id]/route.ts` | Created — PATCH update handler |
| `app/api/bookings/[id]/cancel/route.ts` | Created — POST cancel handler |
| `components/dashboard/new-booking-dialog.tsx` | Updated — min date attr, notes counter |
| `components/dashboard/booking-actions.tsx` | Created — edit + cancel dialogs |
| `app/(dashboard)/dashboard/bookings/page.tsx` | Updated — Actions column, toBookingForActions |

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
