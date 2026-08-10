-- Protects the 4 seeded Quick Links (HeyGen, Brevo, Stripe, GoCardless) from
-- deletion — marks them isDefault so the DELETE route can reject removing them.

ALTER TABLE "quick_links" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "quick_links" SET "isDefault" = true
WHERE "label" IN ('HeyGen', 'Brevo', 'Stripe', 'GoCardless');
