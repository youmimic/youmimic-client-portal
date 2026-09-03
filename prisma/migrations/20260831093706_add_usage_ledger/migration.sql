-- CreateEnum
CREATE TYPE "UsageLedgerStatus" AS ENUM ('RESERVED', 'RECONCILED', 'RELEASED');

-- CreateTable
CREATE TABLE "usage_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "videoId" TEXT,
    "engine" "VideoEngine" NOT NULL,
    "status" "UsageLedgerStatus" NOT NULL DEFAULT 'RESERVED',
    "estimatedDurationSeconds" DOUBLE PRECISION NOT NULL,
    "creditsReservedMilli" INTEGER NOT NULL,
    "actualDurationSeconds" DOUBLE PRECISION,
    "creditsChargedMilli" INTEGER,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "usage_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_ledger_entries_userId_periodStart_periodEnd_idx" ON "usage_ledger_entries"("userId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "usage_ledger_entries_videoId_idx" ON "usage_ledger_entries"("videoId");

-- AddForeignKey
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "generated_videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
