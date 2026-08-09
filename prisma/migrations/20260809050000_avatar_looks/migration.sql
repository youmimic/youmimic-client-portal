-- Avatar identity vs. HeyGen "look" fix: a look is a specific outfit/pose
-- variant of one avatar identity, not a distinct avatar. This adds the real
-- identity key (heygenGroupId) to avatars and a new avatar_looks table to
-- hold the individual looks underneath it.

ALTER TABLE "avatars" ADD COLUMN "heygenGroupId" TEXT;
CREATE UNIQUE INDEX "avatars_heygenGroupId_key" ON "avatars"("heygenGroupId");

CREATE TABLE "avatar_looks" (
    "id" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,
    "heygenLookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "previewUrl" TEXT,
    "videoUrl" TEXT,
    "defaultVoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avatar_looks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "avatar_looks_heygenLookId_key" ON "avatar_looks"("heygenLookId");
CREATE INDEX "avatar_looks_avatarId_idx" ON "avatar_looks"("avatarId");

ALTER TABLE "avatar_looks" ADD CONSTRAINT "avatar_looks_avatarId_fkey"
    FOREIGN KEY ("avatarId") REFERENCES "avatars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_videos" ADD COLUMN "avatarLookId" TEXT;
CREATE INDEX "generated_videos_avatarLookId_idx" ON "generated_videos"("avatarLookId");
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_avatarLookId_fkey"
    FOREIGN KEY ("avatarLookId") REFERENCES "avatar_looks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
