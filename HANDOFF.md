# HANDOFF.md

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
