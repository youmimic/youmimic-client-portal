-- CreateTable
CREATE TABLE "watermarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watermarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watermarks_userId_createdAt_idx" ON "watermarks"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "watermarks" ADD CONSTRAINT "watermarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
