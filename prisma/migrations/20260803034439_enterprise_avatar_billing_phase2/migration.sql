-- Phase 2 avatar billing automation (additive, no data loss)

-- CreateEnum
CREATE TYPE "ProvisioningMode" AS ENUM ('SALES_ASSISTED', 'SELF_SERVE');

-- AlterTable
ALTER TABLE "enterprises" ADD COLUMN "provisioningMode" "ProvisioningMode" NOT NULL DEFAULT 'SALES_ASSISTED';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "provisioningFailedAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "provisioningFailureMsg" TEXT;
