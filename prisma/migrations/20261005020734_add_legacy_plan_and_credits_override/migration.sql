-- AlterEnum
ALTER TYPE "PlanType" ADD VALUE 'LEGACY';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "creditsLimitMilliOverride" INTEGER;
