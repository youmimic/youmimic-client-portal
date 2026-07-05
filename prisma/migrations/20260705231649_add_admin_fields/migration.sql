-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'BILLING_ADMIN');

-- AlterTable
ALTER TABLE "admin_logs" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "targetUserId" TEXT;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "currency" SET DEFAULT 'aud',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "adminRole" "AdminRole",
ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT;

-- CreateIndex
CREATE INDEX "admin_logs_targetUserId_idx" ON "admin_logs"("targetUserId");

-- AddForeignKey
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
