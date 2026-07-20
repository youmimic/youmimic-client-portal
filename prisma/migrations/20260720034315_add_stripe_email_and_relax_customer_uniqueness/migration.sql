-- DropIndex
DROP INDEX "subscriptions_stripeCustomerId_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "stripeEmail" TEXT;

-- CreateIndex
CREATE INDEX "subscriptions_stripeCustomerId_idx" ON "subscriptions"("stripeCustomerId");
