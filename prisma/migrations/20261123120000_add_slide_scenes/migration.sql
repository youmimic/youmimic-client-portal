-- AlterEnum
ALTER TYPE "SceneKind" ADD VALUE 'SLIDE';

-- AlterTable
ALTER TABLE "video_scenes" ADD COLUMN     "slideImageId" TEXT,
ADD COLUMN     "sourcePageNumber" INTEGER;

-- CreateTable
CREATE TABLE "slide_images" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "renditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slide_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "slide_images_userId_createdAt_idx" ON "slide_images"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "video_scenes_slideImageId_idx" ON "video_scenes"("slideImageId");

-- AddForeignKey
ALTER TABLE "slide_images" ADD CONSTRAINT "slide_images_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_scenes" ADD CONSTRAINT "video_scenes_slideImageId_fkey" FOREIGN KEY ("slideImageId") REFERENCES "slide_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

