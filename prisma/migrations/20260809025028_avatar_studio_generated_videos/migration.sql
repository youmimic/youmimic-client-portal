-- Avatar Studio (v1): script-to-video generation via HeyGen (additive, no data loss)

-- CreateEnum
CREATE TYPE "VideoGenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "generated_videos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "status" "VideoGenerationStatus" NOT NULL DEFAULT 'PROCESSING',
    "heygenVideoId" TEXT,
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "generated_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generated_videos_heygenVideoId_key" ON "generated_videos"("heygenVideoId");

-- CreateIndex
CREATE INDEX "generated_videos_userId_idx" ON "generated_videos"("userId");

-- CreateIndex
CREATE INDEX "generated_videos_avatarId_idx" ON "generated_videos"("avatarId");

-- AddForeignKey
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "avatars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
