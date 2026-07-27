-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'GOCARDLESS');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "billingProvider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
ADD COLUMN     "gocardlessCustomerId" TEXT,
ALTER COLUMN "stripeCustomerId" DROP NOT NULL;
