-- CreateEnum
CREATE TYPE "BackgroundRemovalSupport" AS ENUM ('UNKNOWN', 'SUPPORTED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "BackgroundMediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "avatar_looks" ADD COLUMN     "backgroundRemoval" "BackgroundRemovalSupport" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "generated_videos" ADD COLUMN     "backgroundUrl" TEXT;

-- AlterTable
ALTER TABLE "video_scenes" ADD COLUMN     "backgroundMediaId" TEXT;

-- CreateTable
CREATE TABLE "background_media" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "BackgroundMediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "background_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "background_media_userId_createdAt_idx" ON "background_media"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "video_scenes_backgroundMediaId_idx" ON "video_scenes"("backgroundMediaId");

-- AddForeignKey
ALTER TABLE "background_media" ADD CONSTRAINT "background_media_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_scenes" ADD CONSTRAINT "video_scenes_backgroundMediaId_fkey" FOREIGN KEY ("backgroundMediaId") REFERENCES "background_media"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data: looks verified to support background removal by owner-approved test
-- renders on 2026-11-26 (Neil McGregor L04: photo background; L03: video
-- background). Matches nothing on databases without these looks.
UPDATE "avatar_looks" SET "backgroundRemoval" = 'SUPPORTED'
WHERE "heygenLookId" IN ('2c55840f0c0f402c99aeda781127857a', 'aecff5ac1ad34b43b01b4fc053e689f0');
