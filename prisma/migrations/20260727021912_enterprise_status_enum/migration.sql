-- CreateEnum
CREATE TYPE "EnterpriseStatus" AS ENUM ('active', 'suspended');

-- AlterTable: convert enterprises.status from free-text (only ever "active"
-- in practice) to the new enum, preserving existing values via USING cast.
ALTER TABLE "enterprises" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "enterprises" ALTER COLUMN "status" TYPE "EnterpriseStatus" USING (status::"EnterpriseStatus");
ALTER TABLE "enterprises" ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable: suspension metadata, mirroring users.suspendedAt / users.suspensionReason
ALTER TABLE "enterprises" ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspensionReason" TEXT;
