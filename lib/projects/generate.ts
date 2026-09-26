import type { VideoEngine, VideoGenerationStatus, VideoProjectStatus } from "@/app/generated/prisma/enums";
import prisma from "@/lib/prisma";
import {
  createHeyGenStudioVideo,
  getHeyGenAvatarLook,
  HeyGenApiError,
  type HeyGenEngine,
  type HeyGenStudioScene,
} from "@/lib/heygen";
import { projectContentHash } from "@/lib/projects/hash";
import { DEFAULT_MEDIA_DURATION, evaluateProject, resolveScene, sceneLabel, type SceneData, type SceneIssue } from "@/lib/projects/rules";
import { listAvatarOptions, ProjectError, type SnapshotScene } from "@/lib/projects/service";
import { releaseReservation, reserveCreditsForGeneration } from "@/lib/usage/ledger";

export type GenerateProjectResult =
  | { ok: true; generatedVideoId: string }
  | { ok: false; code: "NOT_READY"; error: string; issues: SceneIssue[] }
  | { ok: false; code: "AVATAR_NOT_READY" | "NO_VOICE" | "BAD_MEDIA" | "HEYGEN_ERROR"; error: string }
  | {
      ok: false;
      code: "OVER_LIMIT";
      error: string;
      creditsUsedMilli: number;
      creditsLimitMilli: number;
      periodEnd: string;
    };

const ENGINE_TO_API: Record<VideoEngine, HeyGenEngine> = {
  AVATAR_III: "avatar_iii",
  AVATAR_IV: "avatar_iv",
  AVATAR_V: "avatar_v",
};

function callbackUrl(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || appUrl.includes("localhost")) return undefined; // the provider can't reach a local URL
  return `${appUrl}/api/webhooks/heygen`;
}

// Renders the whole project as one provider job. The provider returns a single
// video id and status for the full video, so this is all-or-nothing: there is
// no per-scene render, retry or preview. Completion, failure and URL refresh
// then run through the existing GeneratedVideo webhook and refresh paths.
//
// Double-submit safety: the project is moved to GENERATING with one
// conditional update before anything else happens, so two clicks (or two tabs)
// cannot both start a render. Any failure afterwards puts the status back.
export async function generateProject(userId: string, projectId: string, expectedVersion: number): Promise<GenerateProjectResult> {
  const project = await prisma.videoProject.findFirst({
    where: { id: projectId, userId },
    include: { scenes: { orderBy: { orderIndex: "asc" } } },
  });
  if (!project) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that project.");

  const avatars = await listAvatarOptions(userId);
  const scenes: SceneData[] = project.scenes;
  const defaults = {
    defaultAvatarId: project.defaultAvatarId,
    defaultAvatarLookId: project.defaultAvatarLookId,
    defaultVoiceId: project.defaultVoiceId,
    defaultVoiceName: project.defaultVoiceName,
  };
  const engineValue = project.engine;

  const readiness = evaluateProject(scenes, defaults, avatars, engineValue);
  if (!readiness.canGenerate) {
    return { ok: false, code: "NOT_READY", error: readiness.summary, issues: readiness.issues.filter((i) => i.severity === "error") };
  }

  // The claim. version must still match, and nothing else may be rendering.
  const previousStatus = project.status;
  const claimed = await prisma.videoProject.updateMany({
    where: { id: projectId, userId, version: expectedVersion, status: { not: "GENERATING" } },
    data: { status: "GENERATING", version: { increment: 1 } },
  });
  if (claimed.count === 0) {
    const current = await prisma.videoProject.findFirst({ where: { id: projectId, userId }, select: { status: true } });
    if (current?.status === "GENERATING") {
      throw new ProjectError("GENERATING", 409, "This video is already being generated.");
    }
    throw new ProjectError("VERSION_CONFLICT", 409, "This project was changed somewhere else. Reload to see the latest version, then try again.");
  }

  const revert = () =>
    prisma.videoProject.updateMany({ where: { id: projectId, userId }, data: { status: previousStatus as VideoProjectStatus } });

  // Resolve each AVATAR-kind scene to the provider's look. IMAGE/VIDEO scenes
  // don't use an avatar at all, so they're left out of this lookup.
  const avatarRows = await prisma.avatar.findMany({
    where: {
      userId,
      id: {
        in: scenes
          .filter((s) => s.kind === "AVATAR")
          .map((s) => resolveScene(s, defaults).avatarId)
          .filter((x): x is string => !!x),
      },
    },
    select: { id: true, name: true, heygenAvatarId: true, looks: { select: { id: true, heygenLookId: true, status: true }, orderBy: { name: "asc" } } },
  });

  const providerScenes: HeyGenStudioScene[] = [];
  const snapshot: SnapshotScene[] = [];
  const defaultVoiceCache = new Map<string, string | null>();
  // The first avatar scene's avatar is what this render is linked to
  // (GeneratedVideo.avatarId is required) — readiness already guarantees
  // there is at least one, via the "needs at least one avatar scene" check.
  let firstAvatarId: string | null = null;

  try {
    for (const [i, scene] of scenes.entries()) {
      const resolved = resolveScene(scene, defaults);

      if (scene.kind === "AVATAR") {
        const avatar = avatarRows.find((a) => a.id === resolved.avatarId);
        if (!avatar) {
          await revert();
          return { ok: false, code: "AVATAR_NOT_READY", error: `${sceneLabel(scene, i + 1)} uses an avatar that isn't available.` };
        }

        let heygenLookId: string | null = null;
        if (avatar.looks.length > 0) {
          const look = resolved.avatarLookId
            ? avatar.looks.find((l) => l.id === resolved.avatarLookId)
            : avatar.looks.find((l) => l.status === "ready");
          if (!look || look.status !== "ready") {
            await revert();
            return { ok: false, code: "AVATAR_NOT_READY", error: `${sceneLabel(scene, i + 1)} needs a ready look. Pick one and try again.` };
          }
          heygenLookId = look.heygenLookId;
        } else {
          heygenLookId = avatar.heygenAvatarId;
        }
        if (!heygenLookId) {
          await revert();
          return { ok: false, code: "AVATAR_NOT_READY", error: `${sceneLabel(scene, i + 1)} uses an avatar that isn't ready yet.` };
        }

        let voiceId = resolved.voiceId;
        if (!voiceId) {
          if (!defaultVoiceCache.has(heygenLookId)) {
            const look = await getHeyGenAvatarLook(heygenLookId);
            defaultVoiceCache.set(heygenLookId, look.default_voice_id);
          }
          voiceId = defaultVoiceCache.get(heygenLookId) ?? null;
        }
        if (!voiceId) {
          await revert();
          return { ok: false, code: "NO_VOICE", error: `${sceneLabel(scene, i + 1)} has no voice. Choose a voice for it or set a project voice.` };
        }

        if (firstAvatarId === null) firstAvatarId = resolved.avatarId;

        providerScenes.push({
          kind: "avatar",
          avatarId: heygenLookId,
          script: scene.script.trim(),
          voiceId,
          backgroundColor: scene.backgroundColor,
          // Schema-valid only on Avatar V per the provider's docs — sending
          // it on another engine would be rejected, so it's left out.
          motionPrompt: engineValue === "AVATAR_V" ? scene.motionPrompt : null,
        });
        snapshot.push({
          order: i + 1,
          kind: "AVATAR",
          title: scene.title,
          script: scene.script.trim(),
          avatarName: avatar.name,
          voiceName: resolved.voiceName,
          backgroundColor: scene.backgroundColor,
          mediaUrl: null,
        });
        continue;
      }

      // IMAGE / VIDEO
      const mediaUrl = (scene.mediaUrl ?? "").trim();
      if (!mediaUrl) {
        await revert();
        return { ok: false, code: "BAD_MEDIA", error: `${sceneLabel(scene, i + 1)} is missing its image or video link.` };
      }
      const script = scene.script.trim();
      let voiceId: string | null = null;
      if (script) {
        voiceId = resolved.voiceId;
        if (!voiceId) {
          await revert();
          return { ok: false, code: "NO_VOICE", error: `${sceneLabel(scene, i + 1)} needs a voice for its narration.` };
        }
      }

      providerScenes.push(
        scene.kind === "IMAGE"
          ? {
              kind: "image",
              mediaUrl,
              script: script || undefined,
              voiceId: script ? voiceId : undefined,
              durationSeconds: script ? undefined : (scene.mediaDurationSeconds ?? DEFAULT_MEDIA_DURATION),
            }
          : {
              kind: "video",
              mediaUrl,
              script: script || undefined,
              voiceId: script ? voiceId : undefined,
            },
      );
      snapshot.push({
        order: i + 1,
        kind: scene.kind,
        title: scene.title,
        script,
        avatarName: null,
        voiceName: script ? resolved.voiceName : null,
        backgroundColor: null,
        mediaUrl,
      });
    }
  } catch (err) {
    await revert();
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
    return { ok: false, code: "HEYGEN_ERROR", error: `Couldn't look up an avatar: ${message}` };
  }

  // Reserve once for the whole video, using the same combined script the
  // readiness panel estimated from.
  const combinedScript = scenes.map((s) => s.script.trim()).join("\n");
  const reservation = await reserveCreditsForGeneration({ userId, engine: engineValue, script: combinedScript });
  if (!reservation.ok) {
    await revert();
    return {
      ok: false,
      code: "OVER_LIMIT",
      error: `You've used all your video credits for this billing period (resets ${reservation.periodEnd.toDateString()}).`,
      creditsUsedMilli: reservation.creditsUsedMilli,
      creditsLimitMilli: reservation.creditsLimitMilli,
      periodEnd: reservation.periodEnd.toISOString(),
    };
  }

  const baseData = {
    userId,
    // Guaranteed non-null: readiness requires at least one avatar scene.
    avatarId: firstAvatarId as string,
    projectId,
    script: combinedScript,
    engine: engineValue,
    title: project.title.trim() || undefined,
    aspectRatio: project.aspectRatio,
    resolution: project.resolution ?? undefined,
    sceneSnapshot: snapshot,
  };

  try {
    const { video_id } = await createHeyGenStudioVideo({
      scenes: providerScenes,
      engine: ENGINE_TO_API[engineValue],
      callbackUrl: callbackUrl(),
      title: project.title.trim() || undefined,
      aspectRatio: project.aspectRatio,
      resolution: project.resolution ?? undefined,
      captions: project.captionsEnabled,
    });

    const video = await prisma.generatedVideo.create({
      data: { ...baseData, status: "PROCESSING" as VideoGenerationStatus, heygenVideoId: video_id },
      select: { id: true },
    });
    await prisma.usageLedgerEntry.update({ where: { id: reservation.ledgerEntryId }, data: { videoId: video.id } });
    await prisma.videoProject.updateMany({
      where: { id: projectId, userId },
      data: { lastGeneratedHash: projectContentHash({ ...project, engine: engineValue }, scenes) },
    });
    return { ok: true, generatedVideoId: video.id };
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
    // The provider never accepted the job: give the credits back and keep a
    // failed record so the reason shows on the project.
    await releaseReservation(reservation.ledgerEntryId);
    await prisma.generatedVideo.create({
      data: { ...baseData, status: "FAILED" as VideoGenerationStatus, errorMessage: message },
    });
    await prisma.videoProject.updateMany({ where: { id: projectId, userId }, data: { status: "FAILED" } });
    return { ok: false, code: "HEYGEN_ERROR", error: message };
  }
}
