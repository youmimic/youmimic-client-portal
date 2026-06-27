# HANDOFF.md

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

| File | Change |
|---|---|
| `components/marketing/marketing-header-config.ts` | Created — shared height constants |
| `components/marketing/marketing-header.tsx` | Import + use `HEADER_HEIGHT` |
| `components/marketing/marketing-nav.tsx` | Import + use `HEADER_OFFSET` (2 occurrences) |

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

| State | Mobile header row |
|---|---|
| Closed | Logo — ☰ — ThemeToggle + auth CTAs |
| Open | Logo — ✕ — ThemeToggle + auth CTAs + dropdown panel below |

### Files changed

| File | Change |
|---|---|
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

| File | Change |
|---|---|
| `components/marketing/marketing-nav.tsx` | **Created** — `"use client"` nav with `usePathname()` active state |
| `components/marketing/marketing-header.tsx` | Replaced inline nav with `<MarketingNav />` |

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

| Breakpoint | Layout |
|---|---|
| `< sm` (mobile) | Logo — ThemeToggle + auth CTAs (nav hidden) |
| `sm+` (tablet/desktop) | Logo — Solutions · Pricing · Contact — ThemeToggle + auth CTAs |

### Files changed

| File | Change |
|---|---|
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

| File | Change |
|---|---|
| `components/marketing/pricing-plans.tsx` | **Created** — plans data + card grid extracted from homepage |
| `app/(marketing)/page.tsx` | Removed inline `plans` array, `CheckCircle2`/`Card*` imports; replaced grid with `<PricingPlans />` |
| `app/(marketing)/pricing/page.tsx` | Replaced simple three-card stub with `<PricingPlans />`; aligned heading/layout style with homepage; kept `isGated` subscription banner |

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

| File | Change |
|---|---|
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

| File | Change |
|---|---|
| `lib/validations/contact.ts` | **Created** — Zod schema for contact form |
| `emails/templates/contact-notification-email.tsx` | **Created** — React Email notification template |
| `lib/mailer.ts` | Added `sendContactNotificationEmail` |
| `app/api/contact/route.ts` | **Created** — POST handler |
| `components/marketing/contact-form.tsx` | **Created** — client form component |
| `app/(marketing)/contact/page.tsx` | **Created** — marketing contact page |
| `app/(marketing)/page.tsx` | Enterprise + Custom pricing `href` → `/contact` |

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

| File | Change |
|---|---|
| `app/login/layout.tsx` | **Created** — injects `MarketingHeader` for all `/login` renders |
| `app/signup/layout.tsx` | **Created** — injects `MarketingHeader` for all `/signup` renders |
| `app/login/login-form.tsx` | `min-h-screen` → `flex-1` on `<main>` |
| `app/login/page.tsx` | `min-h-screen` → `flex-1` on `<main>` (logged-in state) |
| `app/signup/page.tsx` | `min-h-screen` → `flex-1` on `<main>` |

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

| File | Change |
|---|---|
| `components/ui/select.tsx` | Full rewrite — exports `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` as Base UI Select wrappers |
| `components/dashboard/new-booking-dialog.tsx` | capturesCount field uses new components; `onValueChange={(val) => field.onChange(Number(val))}` |
| `components/dashboard/booking-actions.tsx` | Same change in `EditDialog` capturesCount field |

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

| File | Change |
|---|---|
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

| File | Change |
|---|---|
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

| File | Change |
|---|---|
| `prisma/schema.prisma` | `capturesCount` on `Booking`; new `BookingCaptureParticipant` model |
| `prisma/migrations/20260622130000_.../migration.sql` | New safe-additive migration |
| `lib/booking-time.ts` | **Created** — `addHoursToTime` utility |
| `lib/validations/booking.ts` | `capturesCount`, `participants` array, updated refines |
| `components/ui/select.tsx` | **Created** — styled native select |
| `components/ui/tooltip.tsx` | **Created** — base-ui tooltip wrappers |
| `components/dashboard/new-booking-dialog.tsx` | Full form update + debug log removed |
| `components/dashboard/booking-actions.tsx` | EditDialog + `BookingForActions` type extended |
| `app/api/bookings/route.ts` | `capturesCount`, participants, server-side timeEnd |
| `app/api/bookings/[id]/route.ts` | Same + atomic participant replacement |
| `app/(dashboard)/dashboard/bookings/page.tsx` | Query + table extended |

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

| File | Purpose |
|---|---|
| `.github/workflows/check-prisma-migration.yml` | PR guard |
| `.github/workflows/prisma-migrate-prod.yml` | Production migration |
| `docs/migrations.md` | Team migration process doc |

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

| Table | Column / Type | Change |
|---|---|---|
| `bookings` | `status` | `TEXT` → `BookingStatus` enum (USING cast) |
| `bookings` | `paymentStatus` | **Added** `PaymentStatus NOT NULL DEFAULT 'unpaid'` |
| `payments` | `status` | `TEXT` → `PaymentStatus` enum (USING cast) |
| `payments` | `subscriptionId` | `NOT NULL` → nullable |
| `payments` | `type` | **Added** `PaymentType NOT NULL` (backfilled 'subscription') |
| `payments` | `updatedAt` | **Added** `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `payments` | `bookingId` | **Added** nullable `TEXT` FK → `bookings.id` + index |

### Files changed

| File | Change |
|---|---|
| `prisma/migrations/20260622120000_.../migration.sql` | New handwritten migration |
| `app/(dashboard)/dashboard/bookings/page.tsx` | Explicit `select` on `findMany` |
| `package.json` | `build` script includes `prisma migrate deploy` |

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

| File | Change |
|---|---|
| `app/generated/prisma/*` | Regenerated — `PaymentType`/`PaymentStatus` enums added; `PaymentCreateInput` now requires `type` |
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

| File | Change |
|---|---|
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

| File | Change |
|---|---|
| `app/api/bookings/route.ts` | Added `userHasActiveSubscription` import + 403 entitlement guard on POST |
| `app/api/bookings/[id]/route.ts` | Added `userHasActiveSubscription` import + 403 entitlement guard on PATCH |
| `app/api/stripe/invoice-redirect/[invoiceId]/route.ts` | **Created** — receipt redirect with auth + ownership verification |
| `app/(dashboard)/dashboard/billing/page.tsx` | Invoice column: TODO text → `<a>` link to invoice-redirect route |

### Checks run

```
npm run lint      → 0 errors, 1 pre-existing warning in lib/prisma.ts (unchanged)
npm run typecheck → clean
npm run build     → clean; 22 routes; /api/stripe/invoice-redirect/[invoiceId] ƒ Dynamic; ƒ Proxy (Middleware) confirmed
```

### Authorization model — complete picture

| Layer | Mechanism | Staleness risk |
|---|---|---|
| Page routing (`proxy.ts`) | JWT `hasActiveSubscription` — no DB | Yes — stale until re-auth after Stripe events |
| API write protection | Fresh `userHasActiveSubscription()` DB call | None — always current |
| Receipt access | Prisma ownership check per request | None |

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

| File | Change |
|---|---|
| `next-auth.d.ts` | Added `hasActiveSubscription: boolean` to Session.user; `hasActiveSubscription?: boolean` to JWT |
| `auth.ts` | SubscriptionStatus import; DB lookup + `token.hasActiveSubscription` in jwt callback; `Boolean(token.hasActiveSubscription)` in session callback |
| `proxy.ts` | Removed lib/subscription import; replaced DB call with `!user.hasActiveSubscription` token read |
| `app/(dashboard)/dashboard/billing/page.tsx` | Payment history query, formatAmount, PAYMENT_STATUS_STYLES, PaymentHistorySection, page section |

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

| File | Status |
|---|---|
| `proxy.ts` | Updated — async callback, email-verified + subscription guards added |
| `lib/subscription.ts` | Created — `userHasActiveSubscription` Prisma helper |
| `app/verify-email/page.tsx` | Created — email verification gate landing page |
| `app/(marketing)/pricing/page.tsx` | Created — pricing stub with subscription-gate banner |

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

| File | Status |
|---|---|
| `components/branding/site-logo.tsx` | **Created** — `"use client"`, `SiteLogoProps`, `useSyncExternalStore` mount guard, `forceVariant` logic |
| `components/marketing/marketing-header.tsx` | Updated — replaced `next/image` + `Link` logo block with `<SiteLogo forceVariant="dark" />`; removed `Image` import |
| `components/dashboard/dashboard-header.tsx` | Updated — replaced `<span md:hidden>YouMimic</span>` with `<SiteLogo className="flex items-center md:hidden" forceVariant="auto" />` |
| `components/dashboard/app-sidebar.tsx` | Updated — replaced text `Link` wordmark with `<SiteLogo href="/dashboard" onClick={onMobileClose} forceVariant="auto" />` |

### Behavior expectations

| Location | Variant | Light mode | Dark mode |
|---|---|---|---|
| Marketing header (`/`) | `forceVariant="dark"` | White logo | White logo |
| Dashboard header (mobile) | `forceVariant="auto"` | Green logo | White logo |
| Sidebar wordmark | `forceVariant="auto"` | Green logo | White logo |

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
