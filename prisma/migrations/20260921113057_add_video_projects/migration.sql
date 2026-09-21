-- CreateEnum
CREATE TYPE "VideoProjectStatus" AS ENUM ('DRAFT', 'GENERATING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "generated_videos" ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "sceneSnapshot" JSONB;

-- CreateTable
CREATE TABLE "video_projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "status" "VideoProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "resolution" TEXT,
    "engine" "VideoEngine" NOT NULL DEFAULT 'AVATAR_III',
    "defaultAvatarId" TEXT,
    "defaultAvatarLookId" TEXT,
    "defaultVoiceId" TEXT,
    "defaultVoiceName" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastGeneratedHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_scenes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "script" TEXT NOT NULL DEFAULT '',
    "avatarId" TEXT,
    "avatarLookId" TEXT,
    "voiceId" TEXT,
    "voiceName" TEXT,
    "backgroundColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_projects_userId_updatedAt_idx" ON "video_projects"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "video_scenes_projectId_orderIndex_idx" ON "video_scenes"("projectId", "orderIndex");

-- CreateIndex
CREATE INDEX "generated_videos_projectId_idx" ON "generated_videos"("projectId");

-- AddForeignKey
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_scenes" ADD CONSTRAINT "video_scenes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "video_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "video_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
