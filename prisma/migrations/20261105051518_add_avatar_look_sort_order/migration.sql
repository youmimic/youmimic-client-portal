-- DropIndex
DROP INDEX "avatar_looks_avatarId_idx";

-- AlterTable
ALTER TABLE "avatar_looks" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "avatar_looks_avatarId_sortOrder_idx" ON "avatar_looks"("avatarId", "sortOrder");
