-- Migration: 20260622120000_add_booking_payment_status_and_payment_enums
--
-- Applies all schema.prisma changes that exist in code but were never
-- migrated to production:
--   - BookingStatus, PaymentStatus, PaymentType enum types
--   - bookings.paymentStatus  (the immediate P2022 cause)
--   - bookings.status TEXT → BookingStatus enum (USING cast, no data loss)
--   - payments.status TEXT → PaymentStatus enum (USING cast, no data loss)
--   - payments.type NOT NULL (backfilled to 'subscription'; default dropped after)
--   - payments.updatedAt NOT NULL (backfilled to CURRENT_TIMESTAMP; default kept)
--   - payments.bookingId nullable FK + index
--   - payments.subscriptionId made nullable
--
-- Production safety:
--   • Every cast is done with USING to avoid DROP+ADD data loss.
--   • Data is validated BEFORE any structural change; bad values raise an
--     error inside the transaction so nothing is left in a partial state.
--   • payments.type and payments.updatedAt use a temporary DEFAULT for the
--     3 existing rows; the type default is dropped after the backfill.
--   • The whole migration runs inside an explicit transaction.

BEGIN;

-- ============================================================
-- 1. Create the three missing enum types
-- ============================================================

CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'paid', 'refunded', 'failed');
CREATE TYPE "PaymentType"   AS ENUM ('booking', 'subscription', 'other');

-- ============================================================
-- 2. Pre-flight: validate existing string values before casting
--    Any unexpected value raises inside this transaction so no
--    structural change has happened yet and rollback is clean.
-- ============================================================

DO $$
DECLARE
  bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT "status", ', ')
  INTO   bad
  FROM   "bookings"
  WHERE  "status" NOT IN ('pending', 'confirmed', 'cancelled', 'completed');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'bookings.status contains values that cannot be cast to BookingStatus: [%]. '
      'Fix the data before re-running this migration.', bad;
  END IF;
END $$;

DO $$
DECLARE
  bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT "status", ', ')
  INTO   bad
  FROM   "payments"
  WHERE  "status" NOT IN ('unpaid', 'paid', 'refunded', 'failed');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'payments.status contains values that cannot be cast to PaymentStatus: [%]. '
      'Fix the data before re-running this migration.', bad;
  END IF;
END $$;

-- ============================================================
-- 3. bookings: convert status TEXT → BookingStatus enum
--    Drop the TEXT default first so PostgreSQL does not try to
--    coerce the old default expression during the type change;
--    restore the enum default immediately after.
-- ============================================================

ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "bookings"
  ALTER COLUMN "status" TYPE "BookingStatus"
  USING "status"::"BookingStatus";

ALTER TABLE "bookings"
  ALTER COLUMN "status" SET DEFAULT 'pending';

-- ============================================================
-- 4. bookings: add paymentStatus (the column missing from prod)
-- ============================================================

ALTER TABLE "bookings"
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid';

-- ============================================================
-- 5. payments: convert status TEXT → PaymentStatus enum
-- ============================================================

ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "payments"
  ALTER COLUMN "status" TYPE "PaymentStatus"
  USING "status"::"PaymentStatus";

ALTER TABLE "payments"
  ALTER COLUMN "status" SET DEFAULT 'unpaid';

-- ============================================================
-- 6. payments: make subscriptionId nullable
--    Was NOT NULL in the init migration; schema.prisma has it
--    as String? to allow booking-type payments with no sub.
-- ============================================================

ALTER TABLE "payments"
  ALTER COLUMN "subscriptionId" DROP NOT NULL;

-- ============================================================
-- 7. payments: add type column
--    All 3 existing rows are subscription invoice payments, so
--    DEFAULT 'subscription' is the correct backfill value.
--    The default is dropped after backfill: schema has no
--    @default on this field and the application always sets it.
-- ============================================================

ALTER TABLE "payments"
  ADD COLUMN "type" "PaymentType" NOT NULL DEFAULT 'subscription';

ALTER TABLE "payments"
  ALTER COLUMN "type" DROP DEFAULT;

-- ============================================================
-- 8. payments: add updatedAt column
--    DEFAULT CURRENT_TIMESTAMP is kept (not dropped) because
--    @updatedAt is Prisma-managed on writes; the DB-level
--    default is a safety net for any direct SQL access.
-- ============================================================

ALTER TABLE "payments"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- 9. payments: add bookingId nullable FK + index
-- ============================================================

ALTER TABLE "payments"
  ADD COLUMN "bookingId" TEXT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_bookingId_fkey"
  FOREIGN KEY ("bookingId")
  REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "payments_bookingId_idx" ON "payments"("bookingId");

COMMIT;
