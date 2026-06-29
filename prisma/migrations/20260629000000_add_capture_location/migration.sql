-- Safe additive migration: add capture location fields to bookings.
-- All new columns are nullable so existing rows get NULL without any default;
-- the application handles NULL gracefully (displayed as "—", required only in
-- new-booking and edit-booking forms going forward).

CREATE TYPE "CaptureLocationType" AS ENUM ('capital_city', 'regional_other', 'multi_location');
CREATE TYPE "AustralianCapitalCity" AS ENUM ('sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'hobart', 'canberra', 'darwin');

ALTER TABLE "bookings"
  ADD COLUMN "captureLocationType" "CaptureLocationType",
  ADD COLUMN "capitalCity"         "AustralianCapitalCity",
  ADD COLUMN "suburbOrTown"        TEXT,
  ADD COLUMN "stateOrTerritory"    TEXT,
  ADD COLUMN "postcode"            TEXT,
  ADD COLUMN "addressLine1"        TEXT,
  ADD COLUMN "addressLine2"        TEXT,
  ADD COLUMN "locationNotes"       TEXT;
