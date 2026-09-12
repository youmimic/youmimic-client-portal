-- AlterTable
ALTER TABLE "checkout_drafts" ADD COLUMN     "reminder2dSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder7dSentAt" TIMESTAMP(3);
