-- Heygen-Event-Id dedup for the webhook receiver (additive, no data loss)

-- AlterTable
ALTER TABLE "generated_videos" ADD COLUMN "lastWebhookEventId" TEXT;
