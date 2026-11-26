import type { VideoEngine, VideoGenerationStatus, VideoProjectStatus, WatermarkPosition } from "@/app/generated/prisma/enums";
import prisma from "@/lib/prisma";
import {
  createHeyGenStudioVideo,
  getHeyGenAvatarLook,
  HeyGenApiError,
  PUBLIC_AVATAR_VOICE_LOCALE,
  type HeyGenEngine,
  type HeyGenStudioScene,
  type HeyGenWatermarkPosition,
} from "@/lib/heygen";
import { projectContentHash } from "@/lib/projects/hash";
import { DEFAULT_MEDIA_DURATION, evaluateProject, resolveScene, sceneLabel, type SceneData, type SceneIssue } from "@/lib/projects/rules";
import { listAvatarOptions, listPublicAvatarOptions, ProjectError, toSceneData, type SnapshotScene } from "@/lib/projects/service";
import { releaseReservation, reserveCreditsForGeneration } from "@/lib/usage/ledger";
import { avatarAccessWhere } from "@/lib/avatar-access";
import { mapWithConcurrency } from "@/lib/concurrency";
import { SlideImageError, slideRenditionUrl } from "@/lib/slides/images";
import { BackgroundMediaError, isBackgroundRemovalRejection, markLookBackgroundUnsupported } from "@/lib/backgrounds/media";
import { adjustedBackgroundUrl } from "@/lib/backgrounds/renditions";

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

const WATERMARK_POSITION_TO_API: Record<WatermarkPosition, HeyGenWatermarkPosition> = {
  TOP_LEFT: "top_left",
  TOP_RIGHT: "top_right",
  BOTTOM_LEFT: "bottom_left",
  BOTTOM_RIGHT: "bottom_right",
};

type AvatarRow = {
  id: string;
  name: string;
  heygenAvatarId: string | null;
  looks: { id: string; heygenLookId: string | null; status: string }[];
};

// The provider look a scene's avatar resolves to (its chosen look, else the
// first ready one, else the avatar itself when it has no looks). Used for a
// SLIDE scene's "avatar's own voice"; avatar scenes keep their own lookup.
function avatarLookFor(
  rows: AvatarRow[],
  resolved: { avatarId: string | null; avatarLookId: string | null },
): { ok: true; heygenLookId: string; avatarName: string } | { ok: false } {
  const avatar = rows.find((a) => a.id === resolved.avatarId);
  if (!avatar) return { ok: false };
  if (avatar.looks.length > 0) {
    const look = resolved.avatarLookId
      ? avatar.looks.find((l) => l.id === resolved.avatarLookId)
      : avatar.looks.find((l) => l.status === "ready");
    if (!look || look.status !== "ready" || !look.heygenLookId) return { ok: false };
    return { ok: true, heygenLookId: look.heygenLookId, avatarName: avatar.name };
  }
  return avatar.heygenAvatarId ? { ok: true, heygenLookId: avatar.heygenAvatarId, avatarName: avatar.name } : { ok: false };
}

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
    include: {
      scenes: {
        orderBy: { orderIndex: "asc" },
        include: {
          slideImage: { select: { id: true, url: true, width: true, height: true } },
          backgroundMedia: { select: { id: true, kind: true, url: true } },
        },
      },
    },
  });
  if (!project) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that project.");

  const [ownedAvatars, publicAvatars] = await Promise.all([listAvatarOptions(userId), listPublicAvatarOptions()]);
  const avatars = [...ownedAvatars, ...publicAvatars];
  const scenes: SceneData[] = toSceneData(project.scenes);
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

  // Resolve each AVATAR-kind scene to the provider's look. A SLIDE scene with
  // no voice of its own also needs its avatar, for the avatar's own voice.
  // IMAGE/VIDEO scenes don't use an avatar at all.
  const avatarRows = await prisma.avatar.findMany({
    where: {
      ...avatarAccessWhere(userId),
      id: {
        in: scenes
          .filter((s) => s.kind === "AVATAR" || (s.kind === "SLIDE" && !resolveScene(s, defaults).voiceId))
          .map((s) => resolveScene(s, defaults).avatarId)
          .filter((x): x is string => !!x),
      },
    },
    select: {
      id: true,
      name: true,
      heygenAvatarId: true,
      isPublic: true,
      looks: { select: { id: true, heygenLookId: true, status: true }, orderBy: { name: "asc" } },
    },
  });

  const providerScenes: HeyGenStudioScene[] = [];
  const snapshot: SnapshotScene[] = [];
  const defaultVoiceCache = new Map<string, string | null>();
  const defaultVoiceFor = async (heygenLookId: string): Promise<string | null> => {
    if (!defaultVoiceCache.has(heygenLookId)) {
      const look = await getHeyGenAvatarLook(heygenLookId);
      defaultVoiceCache.set(heygenLookId, look.default_voice_id);
    }
    return defaultVoiceCache.get(heygenLookId) ?? null;
  };
  // The first avatar scene's avatar is what this render is linked to. Null
  // when the video is made only of Slide + narration scenes.
  let firstAvatarId: string | null = null;
  // Looks (our AvatarLook ids) sent with a custom background, so a provider
  // "doesn't support background removal" rejection can be pinned on one.
  const backgroundLookIds = new Set<string>();

  // Letterboxed copies of every slide shown, prepared before submitting so a
  // missing or unreachable image is reported now rather than as a failed
  // render later. A few at a time to bound memory and Blob traffic.
  const slideUrls = new Map<string, string>();
  const slideIds = [...new Set(scenes.filter((s) => s.kind === "SLIDE" && s.slideImageId).map((s) => s.slideImageId as string))];
  try {
    await mapWithConcurrency(slideIds, 4, async (id) => {
      slideUrls.set(id, await slideRenditionUrl(userId, id, project.aspectRatio));
    });
  } catch (err) {
    await revert();
    if (!(err instanceof SlideImageError)) console.error("Preparing slide images failed:", err);
    return {
      ok: false,
      code: "BAD_MEDIA",
      error: err instanceof SlideImageError ? err.message : "Couldn't prepare the slide images. Please try again.",
    };
  }

  try {
    for (const [i, scene] of scenes.entries()) {
      const resolved = resolveScene(scene, defaults);

      if (scene.kind === "SLIDE") {
        const imageUrl = scene.slideImageId ? slideUrls.get(scene.slideImageId) : undefined;
        if (!imageUrl) {
          await revert();
          return { ok: false, code: "BAD_MEDIA", error: `${sceneLabel(scene, i + 1)} has no slide image. Add one, or switch it to Avatar.` };
        }
        // Scene or project voice first; otherwise the scene's avatar's own
        // voice, resolved exactly as for an avatar scene.
        let voiceId = resolved.voiceId;
        let voiceName = resolved.voiceName;
        if (!voiceId) {
          const look = avatarLookFor(avatarRows, resolved);
          if (look.ok) {
            voiceId = await defaultVoiceFor(look.heygenLookId);
            voiceName = `${look.avatarName}'s voice`;
          }
        }
        if (!voiceId) {
          await revert();
          return { ok: false, code: "NO_VOICE", error: `${sceneLabel(scene, i + 1)} needs a voice for its narration. Choose one or set a project voice.` };
        }
        const script = scene.script.trim();
        providerScenes.push({ kind: "image", mediaUrl: imageUrl, script, voiceId });
        snapshot.push({
          order: i + 1,
          kind: "SLIDE",
          title: scene.title,
          script,
          avatarName: null,
          voiceName,
          backgroundColor: null,
          mediaUrl: imageUrl,
        });
        continue;
      }

      if (scene.kind === "AVATAR") {
        const avatar = avatarRows.find((a) => a.id === resolved.avatarId);
        if (!avatar) {
          await revert();
          return { ok: false, code: "AVATAR_NOT_READY", error: `${sceneLabel(scene, i + 1)} uses an avatar that isn't available.` };
        }

        let heygenLookId: string | null = null;
        let lookRowId: string | null = null;
        if (avatar.looks.length > 0) {
          const look = resolved.avatarLookId
            ? avatar.looks.find((l) => l.id === resolved.avatarLookId)
            : avatar.looks.find((l) => l.status === "ready");
          if (!look || look.status !== "ready") {
            await revert();
            return { ok: false, code: "AVATAR_NOT_READY", error: `${sceneLabel(scene, i + 1)} needs a ready look. Pick one and try again.` };
          }
          heygenLookId = look.heygenLookId;
          lookRowId = look.id;
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

        // Readiness (lookSupportsBackground) already refused looks not marked
        // as supporting it; legacy looks-less avatars can't reach here with one.
        // A photo with adjustments goes out as its adjusted copy (made once
        // and cached); videos and unadjusted photos as uploaded.
        let background: { kind: "image" | "video"; url: string } | null = null;
        if (scene.backgroundMedia && lookRowId) {
          try {
            background = {
              kind: scene.backgroundMedia.kind === "VIDEO" ? "video" : "image",
              url: await adjustedBackgroundUrl(userId, scene.backgroundMedia.id, scene.backgroundAdjust),
            };
          } catch (err) {
            await revert();
            if (!(err instanceof BackgroundMediaError)) console.error("Preparing a background failed:", err);
            return {
              ok: false,
              code: "BAD_MEDIA",
              error: err instanceof BackgroundMediaError ? err.message : "Couldn't prepare a background. Please try again.",
            };
          }
        }
        if (background && lookRowId) backgroundLookIds.add(lookRowId);

        providerScenes.push({
          kind: "avatar",
          avatarId: heygenLookId,
          script: scene.script.trim(),
          voiceId,
          // Left out entirely when unset, so scenes without a background
          // send exactly what they did before this feature.
          ...(background ? { background } : {}),
          backgroundColor: scene.backgroundColor,
          // Schema-valid only on Avatar V per the provider's docs — sending
          // it on another engine would be rejected, so it's left out.
          motionPrompt: engineValue === "AVATAR_V" ? scene.motionPrompt : null,
          voiceLocale: avatar.isPublic ? PUBLIC_AVATAR_VOICE_LOCALE : null,
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
          ...(background ? { backgroundUrl: background.url, backgroundKind: scene.backgroundMedia!.kind } : {}),
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
    avatarId: firstAvatarId,
    projectId,
    script: combinedScript,
    engine: engineValue,
    title: project.title.trim() || undefined,
    aspectRatio: project.aspectRatio,
    resolution: project.resolution ?? undefined,
    watermarkUrl: project.watermarkUrl ?? undefined,
    watermarkPosition: project.watermarkUrl ? project.watermarkPosition : undefined,
    sceneSnapshot: snapshot,
  };

  // Created before calling the provider, not after — so the row (and the
  // ledger entry's link to it) already exists by the time any webhook could
  // possibly reference it. heygenVideoId/status only arrive once the
  // provider actually accepts the job, via the update below. See
  // app/api/webhooks/heygen/route.ts's own comment on the matching half of
  // this fix.
  const video = await prisma.generatedVideo.create({
    data: { ...baseData, status: "PENDING" as VideoGenerationStatus },
    select: { id: true },
  });
  await prisma.usageLedgerEntry.update({ where: { id: reservation.ledgerEntryId }, data: { videoId: video.id } });

  try {
    const { video_id } = await createHeyGenStudioVideo({
      scenes: providerScenes,
      engine: ENGINE_TO_API[engineValue],
      callbackUrl: callbackUrl(),
      title: project.title.trim() || undefined,
      aspectRatio: project.aspectRatio,
      resolution: project.resolution ?? undefined,
      captions: project.captionsEnabled,
      watermarkUrl: project.watermarkUrl ?? undefined,
      watermarkPosition: WATERMARK_POSITION_TO_API[project.watermarkPosition],
    });

    await prisma.generatedVideo.update({
      where: { id: video.id },
      data: { status: "PROCESSING" as VideoGenerationStatus, heygenVideoId: video_id },
    });
    await prisma.videoProject.updateMany({
      where: { id: projectId, userId },
      data: { lastGeneratedHash: projectContentHash({ ...project, engine: engineValue }, scenes) },
    });
    return { ok: true, generatedVideoId: video.id };
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
    // The provider never accepted the job: give the credits back and keep a
    // failed record so the reason shows on the project. Updates the row
    // created above rather than creating a second one — it already exists
    // (and is already linked from the ledger entry).
    await releaseReservation(reservation.ledgerEntryId);
    await prisma.generatedVideo.update({
      where: { id: video.id },
      data: { status: "FAILED" as VideoGenerationStatus, errorMessage: message },
    });
    await prisma.videoProject.updateMany({ where: { id: projectId, userId }, data: { status: "FAILED" } });
    if (isBackgroundRemovalRejection(message) && backgroundLookIds.size > 0) {
      // Only pinned on a look when exactly one look used a background;
      // otherwise there's no telling which one the provider meant.
      if (backgroundLookIds.size === 1) await markLookBackgroundUnsupported([...backgroundLookIds][0]);
      return {
        ok: false,
        code: "HEYGEN_ERROR",
        error: "One of the avatar looks in this video can't be shown on a custom background. Set that scene's background back to Original, or choose another look.",
      };
    }
    return { ok: false, code: "HEYGEN_ERROR", error: message };
  }
}
