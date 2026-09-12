-- CreateEnum
CREATE TYPE "CheckoutDraftStatus" AS ENUM ('CREATED', 'OPEN', 'COMPLETED', 'EXPIRED', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "companyName" TEXT;

-- CreateTable
CREATE TABLE "checkout_drafts" (
    "id" TEXT NOT NULL,
    "status" "CheckoutDraftStatus" NOT NULL DEFAULT 'CREATED',
    "planType" "PlanType" NOT NULL,
    "billingTerm" "BillingTerm" NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "companyName" TEXT,
    "userId" TEXT,
    "subscriptionId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_drafts_stripeCheckoutSessionId_key" ON "checkout_drafts"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_drafts_stripeSubscriptionId_key" ON "checkout_drafts"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "checkout_drafts_email_idx" ON "checkout_drafts"("email");

-- CreateIndex
CREATE INDEX "checkout_drafts_status_idx" ON "checkout_drafts"("status");

-- CreateIndex
CREATE INDEX "checkout_drafts_userId_idx" ON "checkout_drafts"("userId");
