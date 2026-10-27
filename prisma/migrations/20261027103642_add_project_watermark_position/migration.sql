-- CreateEnum
CREATE TYPE "WatermarkPosition" AS ENUM ('TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT');

-- AlterTable
ALTER TABLE "generated_videos" ADD COLUMN     "watermarkPosition" "WatermarkPosition";

-- AlterTable
ALTER TABLE "video_projects" ADD COLUMN     "watermarkPosition" "WatermarkPosition" NOT NULL DEFAULT 'BOTTOM_RIGHT';
