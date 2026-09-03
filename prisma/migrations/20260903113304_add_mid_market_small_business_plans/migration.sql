-- CreateEnum
CREATE TYPE "BillingTerm" AS ENUM ('MONTHLY_12', 'MONTHLY_24');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PlanType" ADD VALUE 'MID_MARKET';
ALTER TYPE "PlanType" ADD VALUE 'SMALL_BUSINESS';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "billingTerm" "BillingTerm";
