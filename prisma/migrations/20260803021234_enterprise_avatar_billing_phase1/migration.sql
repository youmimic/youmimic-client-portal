-- CreateEnum
CREATE TYPE "BillingComponent" AS ENUM ('STANDARD', 'PLATFORM_FEE', 'AVATAR_STORAGE');

-- CreateEnum
CREATE TYPE "AvatarBillingMode" AS ENUM ('SEPARATE', 'CONSOLIDATED');

-- CreateEnum
CREATE TYPE "EnterpriseContactType" AS ENUM ('BILLING', 'KEY_CONTACT');

-- CreateEnum
CREATE TYPE "AvatarBillingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- AlterTable: Subscription gains avatar-billing columns. Defaults preserve
-- every existing row's behavior (billingComponent = STANDARD, currency = AUD).
ALTER TABLE "subscriptions"
  ADD COLUMN "billingComponent" "BillingComponent" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "avatarId" TEXT,
  ADD COLUMN "unitAmountCents" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'AUD';

-- AlterTable: Enterprise gains avatarBillingMode.
ALTER TABLE "enterprises"
  ADD COLUMN "avatarBillingMode" "AvatarBillingMode" NOT NULL DEFAULT 'SEPARATE';

-- AlterTable: Avatar gains billing status + per-avatar contact fields.
ALTER TABLE "avatars"
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "billingStatus" "AvatarBillingStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "enterprise_contacts" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "type" "EnterpriseContactType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one Subscription row per avatar (multiple NULLs allowed for
-- every non-avatar-billing row).
CREATE UNIQUE INDEX "subscriptions_avatarId_key" ON "subscriptions"("avatarId");

-- CreateIndex
CREATE INDEX "subscriptions_billingComponent_idx" ON "subscriptions"("billingComponent");

-- CreateIndex
CREATE INDEX "enterprise_contacts_enterpriseId_idx" ON "enterprise_contacts"("enterpriseId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "avatars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_contacts" ADD CONSTRAINT "enterprise_contacts_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "enterprises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
