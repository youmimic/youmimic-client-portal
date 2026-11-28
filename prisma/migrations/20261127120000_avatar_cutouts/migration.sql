-- CreateEnum
CREATE TYPE "CutoutStatus" AS ENUM ('NONE', 'QUEUED', 'RENDERING', 'READY', 'FAILED', 'NOT_POSSIBLE');

-- AlterTable
ALTER TABLE "avatar_looks" ADD COLUMN     "cutoutAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cutoutError" TEXT,
ADD COLUMN     "cutoutHeygenVideoId" TEXT,
ADD COLUMN     "cutoutStatus" "CutoutStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "cutoutUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "cutoutUrl" TEXT;

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

