-- CreateEnum
CREATE TYPE "VideoEngine" AS ENUM ('AVATAR_III', 'AVATAR_IV', 'AVATAR_V');

-- AlterTable
ALTER TABLE "generated_videos" ADD COLUMN     "engine" "VideoEngine" NOT NULL DEFAULT 'AVATAR_IV';
