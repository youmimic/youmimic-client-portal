# HANDOFF.md

## Session: Hero background + palette color system — 2026-06-13

### What was inspected

- `app/globals.css` — previous okclh-neutral design token set; fully replaced with YouMimic palette.
- `app/(marketing)/page.tsx` — previous monochrome landing page; all 8 sections rebuilt with palette tokens.
- `components/ui/button.tsx` — confirmed `style` prop passthrough works for inline color overrides.
- `public/` — no hero image file exists. Background image CSS is in place; `hero-bg.jpg` activates automatically once dropped in `public/`.

### Color system redesign

New `globals.css` maps the YouMimic brand palette to semantic CSS variables:

| Palette hex | oklch approx | Semantic role (light) | Semantic role (dark) |
|---|---|---|---|
| `#ECEAE9` | `oklch(0.934 0.005 78)` | `--background` | `--foreground`, `--primary-foreground` |
| `#191818` | `oklch(0.130 0.003 30)` | `--foreground` | `--background` |
| `#604B33` | `oklch(0.370 0.075 60)` | `--primary` (warm brown) | `--accent` |
| `#60918C` | `oklch(0.590 0.068 178)` | `--accent` (dusty teal) | `--primary` |
| `#9AB5C7` | `oklch(0.868 0.028 210)` | `--secondary` (steel blue derived) | muted palette |
| `#ACC8CE` | `oklch(0.892 0.022 205)` | `--muted` (light teal surface) | — |

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

| Section | Before | After |
|---|---|---|
| Stats numbers | `text-foreground` / `font-bold` | `text-primary` (brown in light, teal in dark) |
| Feature icon containers | `bg-foreground/10`, icon `text-foreground` | `bg-accent/10 border-accent/20`, icon `text-accent` |
| Step badges | neutral `bg-muted` | `bg-primary text-primary-foreground` (brown/cream) |
| Avatar initials circle | neutral | `bg-accent/15 text-accent` (teal) |
| Avatar Active dot | `emerald-500` | `bg-accent` (teal token) |
| Pricing highlight ring | `ring-foreground` | `ring-primary` (brown in light, teal in dark) |
| Final CTA | `bg-foreground text-background` | hardcoded `#191818` bg + ambient palette tints |
| Final CTA primary button | default variant | hardcoded `#604B33` bg / `#ECEAE9` text |

### Hero placeholder asset

`/public/hero-bg.jpg` does not exist yet. The hero renders perfectly without it (dark charcoal + radial tints). Drop any high-quality atmospheric photo (people in professional settings, office environments, video studio backdrop) into `public/hero-bg.jpg` — the gradient overlay will darken and blend it automatically. Recommended: 1920×1080 minimum, dark/moody tone preferred.

### What changed

| File | Status |
|---|---|
| `app/globals.css` | Updated — full palette color token redesign, `:root` + `.dark` blocks rewritten |
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

| Route | Layout | Result |
|---|---|---|
| `/` | `app/(marketing)/layout.tsx` → `MarketingHeader` + `MarketingFooter` | `ƒ Dynamic` (auth check) |
| `/login` | root layout only | `ƒ Dynamic` (unchanged) |
| `/signup` | root layout only | `○ Static` (unchanged) |
| `/dashboard/*` | `app/(dashboard)/layout.tsx` → `DashboardShell` | `ƒ Dynamic` (unchanged) |

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

| Section | What changed |
|---|---|
| **Hero** | Split two-column layout: copy left, `ProductMockup` right (desktop only). Mockup is a div-only product UI mock — window chrome, video preview area, status + language panel, script lines, action bar. No images. |
| **Stats strip** | NEW — 4 stats bar (`3 min`, `12+`, `500+`, `99.9%`) on `bg-muted/30`. |
| **Features** | Upgraded from 4-column icon cards to 2×2 horizontal `flex` cards with larger icons (size-10) and bolder treatment. |
| **How it works** | Upgraded from plain numbered text to 3 bordered `bg-card` panels, each with step number badge + lucide icon in top-right. Icons: `Video`, `Cpu`, `Share2`. |
| **Avatar showcase** | NEW — 3 example avatar cards showing deployed avatars: initial, name, role, `Active`/`Processing` status dot, language chip row. |
| **Use cases** | Same content; icons upsized (size-10), font-weight boosted to `font-semibold`. |
| **Pricing** | Unchanged — already clean. |
| **Final CTA** | Unchanged — dark inverted section. |

`ProductMockup` is a private function component inside the page file — it is desktop-only (`hidden lg:flex`).

### Status dot colors

Two semantic colors added for avatar status dots only (`emerald-500` for Active, `amber-400` for Processing). These are status-semantic and isolated to the showcase section.

### What changed

| File | Status |
|---|---|
| `app/page.tsx` | **Deleted** — route moved to route group |
| `app/(marketing)/layout.tsx` | **Created** — `MarketingHeader` + `main.flex-1` wrapper + `MarketingFooter` |
| `app/(marketing)/page.tsx` | **Created** — full enhanced landing page (8 sections) |
| `components/marketing/marketing-header.tsx` | **Created** — async server component, auth-aware, ThemeToggle |
| `components/marketing/marketing-footer.tsx` | **Created** — static server component |

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

| File             | Status                                   |
| ---------------- | ---------------------------------------- |
| `app/page.tsx`   | Replaced — full marketing landing page   |

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
