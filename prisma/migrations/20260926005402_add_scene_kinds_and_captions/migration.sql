-- CreateEnum
CREATE TYPE "SceneKind" AS ENUM ('AVATAR', 'IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "video_projects" ADD COLUMN     "captionsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "video_scenes" ADD COLUMN     "kind" "SceneKind" NOT NULL DEFAULT 'AVATAR',
ADD COLUMN     "mediaDurationSeconds" DOUBLE PRECISION,
ADD COLUMN     "mediaUrl" TEXT,
ADD COLUMN     "motionPrompt" TEXT;
