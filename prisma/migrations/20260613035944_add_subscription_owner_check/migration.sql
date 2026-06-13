/*
  Warnings:

  - The `planType` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[stripeInvoiceId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripePaymentIntentId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeCustomerId]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ownerType` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'CREATOR', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'CANCELED', 'PAUSED');

-- CreateEnum
CREATE TYPE "BillingOwnerType" AS ENUM ('USER', 'ENTERPRISE');

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_enterpriseId_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_userId_fkey";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'usd',
ADD COLUMN     "stripeInvoiceId" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN     "ownerType" "BillingOwnerType" NOT NULL,
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "stripeProductId" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "stripeSubscriptionId" DROP NOT NULL,
DROP COLUMN "planType",
ADD COLUMN     "planType" "PlanType" NOT NULL DEFAULT 'FREE',
DROP COLUMN "status",
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
ALTER COLUMN "currentPeriodEnd" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "admin_logs_adminUserId_idx" ON "admin_logs"("adminUserId");

-- CreateIndex
CREATE INDEX "avatars_userId_idx" ON "avatars"("userId");

-- CreateIndex
CREATE INDEX "avatars_enterpriseId_idx" ON "avatars"("enterpriseId");

-- CreateIndex
CREATE INDEX "bookings_userId_idx" ON "bookings"("userId");

-- CreateIndex
CREATE INDEX "bookings_enterpriseId_idx" ON "bookings"("enterpriseId");

-- CreateIndex
CREATE INDEX "email_logs_userId_idx" ON "email_logs"("userId");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE INDEX "enterprises_ownerUserId_idx" ON "enterprises"("ownerUserId");

-- CreateIndex
CREATE INDEX "invites_enterpriseId_idx" ON "invites"("enterpriseId");

-- CreateIndex
CREATE INDEX "invites_roleId_idx" ON "invites"("roleId");

-- CreateIndex
CREATE INDEX "invites_invitedById_idx" ON "invites"("invitedById");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripeInvoiceId_key" ON "payments"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "payments"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "payments_subscriptionId_idx" ON "payments"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeCustomerId_key" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "subscriptions_userId_idx" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX "subscriptions_enterpriseId_idx" ON "subscriptions"("enterpriseId");

-- CreateIndex
CREATE INDEX "subscriptions_ownerType_idx" ON "subscriptions"("ownerType");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_planType_idx" ON "subscriptions"("planType");

-- CreateIndex
CREATE INDEX "system_events_userId_idx" ON "system_events"("userId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "enterprises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Making sure exactly either userId or enterpriseId is owner not none or both
ALTER TABLE "subscriptions"
ADD CONSTRAINT "subscriptions_exactly_one_owner_check"
CHECK (("userId" IS NOT NULL) <> ("enterpriseId" IS NOT NULL));