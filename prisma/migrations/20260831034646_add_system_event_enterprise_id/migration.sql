-- AlterTable
ALTER TABLE "system_events" ADD COLUMN     "enterpriseId" TEXT;

-- CreateIndex
CREATE INDEX "system_events_enterpriseId_idx" ON "system_events"("enterpriseId");

-- AddForeignKey
ALTER TABLE "system_events" ADD CONSTRAINT "system_events_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "enterprises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
