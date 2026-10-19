-- AlterTable
ALTER TABLE "checkout_drafts" ADD COLUMN     "avatarCount" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "avatarAllowance" INTEGER;
