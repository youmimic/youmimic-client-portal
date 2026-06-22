-- Safe additive migration — no drops, no data loss.
-- 1. Add capturesCount to bookings (DEFAULT 1 covers every existing row).
-- 2. Create booking_capture_participants (purely new table, no impact on existing data).

ALTER TABLE "bookings" ADD COLUMN "capturesCount" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "booking_capture_participants" (
    "id"            TEXT         NOT NULL,
    "bookingId"     TEXT         NOT NULL,
    "sortOrder"     INTEGER      NOT NULL,
    "firstName"     TEXT         NOT NULL,
    "contactNumber" TEXT         NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_capture_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_capture_participants_bookingId_sortOrder_key"
    ON "booking_capture_participants"("bookingId", "sortOrder");

CREATE INDEX "booking_capture_participants_bookingId_idx"
    ON "booking_capture_participants"("bookingId");

ALTER TABLE "booking_capture_participants"
    ADD CONSTRAINT "booking_capture_participants_bookingId_fkey"
    FOREIGN KEY ("bookingId")
    REFERENCES "bookings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
