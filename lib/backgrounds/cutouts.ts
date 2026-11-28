import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { del, put } from "@vercel/blob";
import prisma from "@/lib/prisma";
import {
  createHeyGenTransparentClip,
  deleteHeyGenVideo,
  getHeyGenAvatarLook,
  getHeyGenVideoStatus,
  HeyGenApiError,
} from "@/lib/heygen";
import { runFfmpeg } from "@/lib/backgrounds/renditions";
import { getSetting } from "@/lib/settings";

// Cut-out previews: one transparent frame per look, layered over a chosen
// background in the editor so clients see what the render will look like.
// Verified 2026-11-26: the provider's transparent clip (output_format webm,
// Avatar III) works for digital twins and photo avatars, and the layered
// frame matched the real background render. It also proves the look can be
// cut out, so a ready cut-out turns "Backgrounds: supported" on for a look
// that was still "not checked" (an admin's own choice is never changed).
//
// Worked through by the cut-out cron (app/api/internal/looks/cutouts): each
// run collects finished clips, then starts a few queued ones. Looks are
// queued by an admin (one look, or all without a cut-out), or automatically
// when the "autoCutouts" switch is on.

const STARTS_PER_RUN = 10;
const MAX_ATTEMPTS = 3;
// A clip that hasn't finished in this long counts as a failed attempt.
const RENDER_TIMEOUT_MS = 30 * 60 * 1000;

// The provider's refusal for a look that can't be cut out (2026-11-26 docs):
// "This video avatar does not support webm output. The avatar must be
// trained with matting enabled." Free: no clip is created.
export function isCutoutRefusal(message: string): boolean {
  return /does not support (webm|background removal)|trained with matting|native alpha/i.test(message);
}

// First frame of a transparent VP9 WebM as a PNG with alpha. The libvpx-vp9
// decoder must be forced: ffmpeg's default vp9 decoder silently drops the
// alpha side-channel (found in the 2026-10-25 feasibility test). The first
// frame is taken because the avatar hasn't started speaking yet, so the
// face is neutral.
export async function extractCutoutFrame(webm: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "cutout-"));
  try {
    const inPath = path.join(dir, "in.webm");
    const outPath = path.join(dir, "out.png");
    await writeFile(inPath, webm);
    const { code, stderr } = await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      "-c:v", "libvpx-vp9",
      "-i", inPath,
      "-frames:v", "1",
      "-pix_fmt", "rgba",
      outPath,
    ]);
    if (code !== 0) throw new Error(`ffmpeg failed: ${stderr.slice(-500)}`);
    const png = await readFile(outPath);
    const { channels } = await sharp(png).metadata();
    if (channels !== 4) throw new Error("The cut-out frame has no transparency.");
    return await sharp(png).png({ compressionLevel: 9 }).toBuffer();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

type LookRow = {
  id: string;
  name: string;
  heygenLookId: string;
  defaultVoiceId: string | null;
  backgroundRemoval: "UNKNOWN" | "SUPPORTED" | "UNSUPPORTED";
  cutoutUrl: string | null;
  cutoutHeygenVideoId: string | null;
  cutoutAttempts: number;
  cutoutUpdatedAt: Date | null;
};

const LOOK_SELECT = {
  id: true,
  name: true,
  heygenLookId: true,
  defaultVoiceId: true,
  backgroundRemoval: true,
  cutoutUrl: true,
  cutoutHeygenVideoId: true,
  cutoutAttempts: true,
  cutoutUpdatedAt: true,
} as const;

async function failAttempt(look: LookRow, error: string): Promise<"retry" | "failed"> {
  const attempts = look.cutoutAttempts + 1;
  const status = attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED";
  await prisma.avatarLook.update({
    where: { id: look.id },
    data: { cutoutStatus: status, cutoutAttempts: attempts, cutoutError: error.slice(0, 500), cutoutHeygenVideoId: null, cutoutUpdatedAt: new Date() },
  });
  return status === "FAILED" ? "failed" : "retry";
}

async function collect(look: LookRow, now: Date): Promise<"ready" | "waiting" | "retry" | "failed"> {
  const videoId = look.cutoutHeygenVideoId as string;
  let status;
  try {
    status = await getHeyGenVideoStatus(videoId);
  } catch (err) {
    return (await failAttempt(look, err instanceof Error ? err.message : "Status check failed"));
  }
  if (status.status === "failed") return failAttempt(look, "The provider couldn't render the clip.");
  if (status.status !== "completed" || !status.video_url) {
    const started = look.cutoutUpdatedAt?.getTime() ?? now.getTime();
    if (now.getTime() - started > RENDER_TIMEOUT_MS) return failAttempt(look, "The clip took too long to render.");
    return "waiting";
  }

  let png: Buffer;
  try {
    const res = await fetch(status.video_url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    png = await extractCutoutFrame(Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    return failAttempt(look, err instanceof Error ? err.message : "Couldn't make the cut-out");
  }

  const blob = await put(`cutouts/${look.id}-${randomUUID()}.png`, png, { access: "public", contentType: "image/png" });
  await prisma.avatarLook.update({
    where: { id: look.id },
    data: {
      cutoutStatus: "READY",
      cutoutUrl: blob.url,
      cutoutHeygenVideoId: null,
      cutoutError: null,
      cutoutUpdatedAt: now,
      // A successful cut-out proves the look can be shown on a background.
      ...(look.backgroundRemoval === "UNKNOWN" ? { backgroundRemoval: "SUPPORTED" as const } : {}),
    },
  });
  if (look.cutoutUrl) await del(look.cutoutUrl).catch(() => {});
  // The clip has served its purpose; keep the provider's library tidy.
  await deleteHeyGenVideo(videoId).catch(() => {});
  return "ready";
}

async function start(look: LookRow, now: Date): Promise<"started" | "not_possible" | "retry" | "failed"> {
  try {
    const voiceId = look.defaultVoiceId ?? (await getHeyGenAvatarLook(look.heygenLookId)).default_voice_id;
    if (!voiceId) return failAttempt(look, "This look has no default voice.");
    const { video_id } = await createHeyGenTransparentClip({ avatarId: look.heygenLookId, voiceId, title: `Cut-out preview: ${look.name}` });
    await prisma.avatarLook.update({
      where: { id: look.id },
      data: { cutoutStatus: "RENDERING", cutoutHeygenVideoId: video_id, cutoutUpdatedAt: now, cutoutError: null },
    });
    return "started";
  } catch (err) {
    const message = err instanceof HeyGenApiError || err instanceof Error ? err.message : "Couldn't start the clip";
    if (isCutoutRefusal(message)) {
      await prisma.avatarLook.update({
        where: { id: look.id },
        data: {
          cutoutStatus: "NOT_POSSIBLE",
          cutoutError: message.slice(0, 500),
          cutoutUpdatedAt: now,
          ...(look.backgroundRemoval === "UNKNOWN" ? { backgroundRemoval: "UNSUPPORTED" as const } : {}),
        },
      });
      return "not_possible";
    }
    return failAttempt(look, message);
  }
}

export type CutoutRunResult = { autoQueued: number; collected: number; waiting: number; started: number; notPossible: number; retrying: number; failed: number };

// One cron run: queue new looks (if automatic), collect finished clips,
// then start up to STARTS_PER_RUN queued ones.
export async function processCutoutQueue(now: Date = new Date()): Promise<CutoutRunResult> {
  const result: CutoutRunResult = { autoQueued: 0, collected: 0, waiting: 0, started: 0, notPossible: 0, retrying: 0, failed: 0 };

  if (await getSetting("autoCutouts")) {
    const { count } = await prisma.avatarLook.updateMany({
      where: { status: "ready", cutoutStatus: "NONE" },
      data: { cutoutStatus: "QUEUED", cutoutAttempts: 0, cutoutUpdatedAt: now },
    });
    result.autoQueued = count;
  }

  const rendering = await prisma.avatarLook.findMany({ where: { cutoutStatus: "RENDERING", cutoutHeygenVideoId: { not: null } }, select: LOOK_SELECT });
  for (const look of rendering) {
    const r = await collect(look, now);
    if (r === "ready") result.collected += 1;
    else if (r === "waiting") result.waiting += 1;
    else if (r === "retry") result.retrying += 1;
    else result.failed += 1;
  }

  const queued = await prisma.avatarLook.findMany({
    where: { cutoutStatus: "QUEUED", status: "ready" },
    orderBy: { cutoutUpdatedAt: "asc" },
    take: STARTS_PER_RUN,
    select: LOOK_SELECT,
  });
  for (const look of queued) {
    const r = await start(look, now);
    if (r === "started") result.started += 1;
    else if (r === "not_possible") result.notPossible += 1;
    else if (r === "retry") result.retrying += 1;
    else result.failed += 1;
  }
  return result;
}

// Admin: queue one look (also "make again").
export async function queueLookCutout(lookId: string): Promise<boolean> {
  const { count } = await prisma.avatarLook.updateMany({
    where: { id: lookId, cutoutStatus: { not: "RENDERING" } },
    data: { cutoutStatus: "QUEUED", cutoutAttempts: 0, cutoutError: null, cutoutUpdatedAt: new Date() },
  });
  return count === 1;
}

// Admin: queue every ready look without a cut-out (the backfill), including
// ones that failed before. Looks that can't be cut out aren't retried.
export async function queueAllMissingCutouts(): Promise<number> {
  const { count } = await prisma.avatarLook.updateMany({
    where: { status: "ready", cutoutStatus: { in: ["NONE", "FAILED"] } },
    data: { cutoutStatus: "QUEUED", cutoutAttempts: 0, cutoutError: null, cutoutUpdatedAt: new Date() },
  });
  return count;
}

export async function cutoutSummary() {
  const grouped = await prisma.avatarLook.groupBy({ by: ["cutoutStatus"], where: { status: "ready" }, _count: { _all: true } });
  const counts = Object.fromEntries(grouped.map((g) => [g.cutoutStatus, g._count._all])) as Partial<Record<string, number>>;
  return {
    none: counts.NONE ?? 0,
    queued: counts.QUEUED ?? 0,
    rendering: counts.RENDERING ?? 0,
    ready: counts.READY ?? 0,
    failed: counts.FAILED ?? 0,
    notPossible: counts.NOT_POSSIBLE ?? 0,
  };
}
