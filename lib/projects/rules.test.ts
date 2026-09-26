import { describe, expect, it } from "vitest";
import { insertAfter, isPermutation, moveItem } from "@/lib/projects/ordering";
import { projectContentHash } from "@/lib/projects/hash";
import {
  evaluateProject,
  resolveScene,
  sceneDurationSeconds,
  validateScene,
  type AvatarOption,
  type ProjectDefaults,
  type SceneData,
} from "@/lib/projects/rules";
import { updateProjectSchema, updateSceneSchema } from "@/lib/projects/schemas";

const avatars: AvatarOption[] = [
  {
    id: "a1",
    name: "Neil",
    previewUrl: null,
    usable: true,
    looks: [
      { id: "l1", name: "Suit", ready: true, previewUrl: null, videoUrl: null },
      { id: "l2", name: "Casual", ready: false, previewUrl: null, videoUrl: null },
    ],
  },
  { id: "a2", name: "Chris", previewUrl: null, usable: false, looks: [] },
];

const defaults: ProjectDefaults = {
  defaultAvatarId: "a1",
  defaultAvatarLookId: "l1",
  defaultVoiceId: "v-default",
  defaultVoiceName: "Emma",
};

function scene(over: Partial<SceneData> & { id: string; orderIndex: number }): SceneData {
  return {
    title: "",
    script: "Hello there",
    kind: "AVATAR",
    avatarId: null,
    avatarLookId: null,
    voiceId: null,
    voiceName: null,
    backgroundColor: null,
    mediaUrl: null,
    mediaDurationSeconds: null,
    motionPrompt: null,
    ...over,
  };
}

describe("resolveScene", () => {
  it("inherits the project avatar, look and voice when the scene sets none", () => {
    const r = resolveScene(scene({ id: "s", orderIndex: 0 }), defaults);
    expect(r).toMatchObject({ avatarId: "a1", avatarLookId: "l1", voiceId: "v-default", avatarInherited: true, voiceInherited: true });
  });

  it("uses the scene's own avatar and voice as overrides", () => {
    const r = resolveScene(scene({ id: "s", orderIndex: 0, avatarId: "a2", avatarLookId: null, voiceId: "v-own", voiceName: "Liam" }), defaults);
    expect(r).toMatchObject({ avatarId: "a2", avatarLookId: null, voiceId: "v-own", voiceName: "Liam", avatarInherited: false, voiceInherited: false });
  });
});

describe("validateScene", () => {
  it("requires a script", () => {
    const issues = validateScene(scene({ id: "s", orderIndex: 0, script: "   " }), 2, defaults, avatars, "AVATAR_III");
    expect(issues[0]).toMatchObject({ code: "EMPTY_SCRIPT", severity: "error" });
    expect(issues[0].message).toBe("Scene 2 needs a script before it can be generated.");
  });

  it("rejects scripts over the limit", () => {
    const issues = validateScene(scene({ id: "s", orderIndex: 0, script: "a".repeat(5001) }), 1, defaults, avatars, "AVATAR_III");
    expect(issues.some((i) => i.code === "SCRIPT_TOO_LONG")).toBe(true);
  });

  it("warns, but does not block, on long scenes", () => {
    const script = Array.from({ length: 200 }, () => "word").join(" "); // about 80 seconds
    const issues = validateScene(scene({ id: "s", orderIndex: 0, script }), 3, defaults, avatars, "AVATAR_III");
    const long = issues.find((i) => i.code === "LONG_SCENE");
    expect(long?.severity).toBe("warning");
    expect(long?.message).toContain("consider splitting");
  });

  it("flags a missing or unready avatar", () => {
    const none = validateScene(scene({ id: "s", orderIndex: 0 }), 1, { ...defaults, defaultAvatarId: null, defaultAvatarLookId: null }, avatars, "AVATAR_III");
    expect(none.some((i) => i.code === "NO_AVATAR")).toBe(true);

    const notReady = validateScene(scene({ id: "s", orderIndex: 0, avatarId: "a2" }), 1, defaults, avatars, "AVATAR_III");
    expect(notReady.some((i) => i.code === "AVATAR_NOT_READY")).toBe(true);

    const badLook = validateScene(scene({ id: "s", orderIndex: 0, avatarId: "a1", avatarLookId: "l2" }), 1, defaults, avatars, "AVATAR_III");
    expect(badLook.some((i) => i.code === "AVATAR_NOT_READY")).toBe(true);
  });

  it("rejects an invalid background colour", () => {
    const issues = validateScene(scene({ id: "s", orderIndex: 0, backgroundColor: "red" }), 1, defaults, avatars, "AVATAR_III");
    expect(issues.some((i) => i.code === "BAD_COLOR")).toBe(true);
  });
});

describe("evaluateProject", () => {
  it("blocks generation until every scene is ready and says how many are", () => {
    const scenes = [
      scene({ id: "a", orderIndex: 0 }),
      scene({ id: "b", orderIndex: 1, script: "" }),
      scene({ id: "c", orderIndex: 2 }),
    ];
    const r = evaluateProject(scenes, defaults, avatars, "AVATAR_III");
    expect(r.canGenerate).toBe(false);
    expect(r.readyCount).toBe(2);
    expect(r.attentionCount).toBe(1);
    expect(r.summary).toBe("2 of 3 scenes are ready. Complete the remaining scene to generate the full video.");
    expect(r.sceneStatus.b).toBe("draft");
  });

  it("marks a scene with content but a problem as needing attention", () => {
    const r = evaluateProject([scene({ id: "a", orderIndex: 0, avatarId: "a2" })], defaults, avatars, "AVATAR_III");
    expect(r.sceneStatus.a).toBe("needs_attention");
  });

  it("allows generation when everything is ready and totals the estimate", () => {
    const r = evaluateProject(
      [scene({ id: "a", orderIndex: 0 }), scene({ id: "b", orderIndex: 1, script: "One more scene for you" })],
      defaults,
      avatars,
      "AVATAR_III",
    );
    expect(r.canGenerate).toBe(true);
    expect(r.sceneCount).toBe(2);
    expect(r.totalDurationSeconds).toBeGreaterThan(0);
    expect(r.totalCredits).toBeGreaterThan(0);
  });

  it("does not allow an empty project", () => {
    expect(evaluateProject([], defaults, avatars, "AVATAR_III").canGenerate).toBe(false);
  });

  it("costs more on a higher-rate engine", () => {
    const scenes = [scene({ id: "a", orderIndex: 0, script: Array.from({ length: 150 }, () => "w").join(" ") })];
    const cheap = evaluateProject(scenes, defaults, avatars, "AVATAR_III");
    const dear = evaluateProject(scenes, defaults, avatars, "AVATAR_IV");
    expect(dear.totalCostCents).toBeGreaterThan(cheap.totalCostCents);
  });
});

describe("ordering", () => {
  it("detects valid and invalid reorders", () => {
    expect(isPermutation(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    expect(isPermutation(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(isPermutation(["a", "b", "c"], ["a", "a", "b"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "x"])).toBe(false);
  });

  it("moves an item and clamps at the ends", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -5)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 99)).toEqual(["a", "c", "b"]);
  });

  it("inserts after an index, or at the end", () => {
    expect(insertAfter(["a", "b"], 0, "x")).toEqual(["a", "x", "b"]);
    expect(insertAfter(["a", "b"], null, "x")).toEqual(["a", "b", "x"]);
  });
});

describe("projectContentHash (outdated detection)", () => {
  const project = { ...defaults, aspectRatio: "16:9", resolution: null, engine: "AVATAR_III", captionsEnabled: false };
  const base = [scene({ id: "a", orderIndex: 0 }), scene({ id: "b", orderIndex: 1, script: "Second" })];

  it("is stable for the same content and ignores scene titles", () => {
    const renamed = base.map((s) => ({ ...s, title: "Renamed" }));
    expect(projectContentHash(project, renamed)).toBe(projectContentHash(project, base));
  });

  it("changes when a script, order or setting changes", () => {
    const original = projectContentHash(project, base);
    expect(projectContentHash(project, [{ ...base[0], script: "Changed" }, base[1]])).not.toBe(original);
    expect(projectContentHash(project, [{ ...base[0], orderIndex: 1 }, { ...base[1], orderIndex: 0 }])).not.toBe(original);
    expect(projectContentHash({ ...project, aspectRatio: "9:16" }, base)).not.toBe(original);
    expect(projectContentHash({ ...project, defaultVoiceId: "other" }, base)).not.toBe(original);
  });

  it("treats a scene inheriting a default the same as one that sets it explicitly", () => {
    const explicit = [{ ...base[0], avatarId: "a1", avatarLookId: "l1", voiceId: "v-default" }, base[1]];
    expect(projectContentHash(project, explicit)).toBe(projectContentHash(project, base));
  });
});

describe("request schemas", () => {
  it("requires the version on every edit", () => {
    expect(updateSceneSchema.safeParse({ script: "hi" }).success).toBe(false);
    expect(updateSceneSchema.safeParse({ expectedVersion: 1, script: "hi" }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ title: "x" }).success).toBe(false);
  });

  it("rejects unknown fields so clients cannot set columns like status", () => {
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, status: "COMPLETED" }).success).toBe(false);
    expect(updateSceneSchema.safeParse({ expectedVersion: 1, projectId: "other" }).success).toBe(false);
  });

  it("validates colours and formats", () => {
    expect(updateSceneSchema.safeParse({ expectedVersion: 1, backgroundColor: "#123abc" }).success).toBe(true);
    expect(updateSceneSchema.safeParse({ expectedVersion: 1, backgroundColor: "blue" }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, aspectRatio: "3:2" }).success).toBe(false);
  });

  it("accepts the new scene-kind and captions fields", () => {
    expect(updateSceneSchema.safeParse({ expectedVersion: 1, kind: "IMAGE", mediaUrl: "https://example.com/a.png" }).success).toBe(true);
    expect(updateSceneSchema.safeParse({ expectedVersion: 1, kind: "SLIDESHOW" }).success).toBe(false);
    expect(updateSceneSchema.safeParse({ expectedVersion: 1, mediaDurationSeconds: 301 }).success).toBe(false);
    expect(updateSceneSchema.safeParse({ expectedVersion: 1, mediaDurationSeconds: 10 }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ expectedVersion: 1, captionsEnabled: true }).success).toBe(true);
  });
});

describe("image and video scenes", () => {
  function mediaScene(kind: "IMAGE" | "VIDEO", over: Partial<SceneData> = {}) {
    return scene({ id: "m", orderIndex: 0, kind, script: "", ...over });
  }

  it("requires a media link", () => {
    const issues = validateScene(mediaScene("IMAGE"), 1, defaults, avatars, "AVATAR_III");
    expect(issues.some((i) => i.code === "NO_MEDIA")).toBe(true);
  });

  it("rejects a link that isn't a real URL", () => {
    const issues = validateScene(mediaScene("IMAGE", { mediaUrl: "not-a-link" }), 1, defaults, avatars, "AVATAR_III");
    expect(issues.some((i) => i.code === "BAD_MEDIA_URL")).toBe(true);
  });

  it("an image scene needs either a script or a length", () => {
    const noDuration = validateScene(mediaScene("IMAGE", { mediaUrl: "https://example.com/a.png" }), 1, defaults, avatars, "AVATAR_III");
    expect(noDuration.some((i) => i.code === "NO_DURATION")).toBe(true);

    const withDuration = validateScene(
      mediaScene("IMAGE", { mediaUrl: "https://example.com/a.png", mediaDurationSeconds: 8 }),
      1,
      defaults,
      avatars,
      "AVATAR_III",
    );
    expect(withDuration).toHaveLength(0);
  });

  it("a video scene needs no duration and is valid silent, as long as it has a link", () => {
    const issues = validateScene(mediaScene("VIDEO", { mediaUrl: "https://example.com/a.mp4" }), 1, defaults, avatars, "AVATAR_III");
    expect(issues).toHaveLength(0);
  });

  it("narration on an image or video scene needs a resolvable voice", () => {
    const issues = validateScene(
      mediaScene("IMAGE", { mediaUrl: "https://example.com/a.png", script: "Hello" }),
      1,
      { ...defaults, defaultVoiceId: null, defaultVoiceName: null },
      avatars,
      "AVATAR_III",
    );
    expect(issues.some((i) => i.code === "NO_VOICE")).toBe(true);
  });

  it("does not require an avatar for image or video scenes", () => {
    const issues = validateScene(
      mediaScene("VIDEO", { mediaUrl: "https://example.com/a.mp4", script: "Hello", voiceId: "v-own", voiceName: "Liam" }),
      1,
      defaults,
      avatars,
      "AVATAR_III",
    );
    expect(issues.some((i) => i.code === "NO_AVATAR" || i.code === "AVATAR_NOT_READY")).toBe(false);
  });
});

describe("evaluateProject with image/video scenes", () => {
  it("blocks generation for a project with no avatar scene at all", () => {
    const scenes = [scene({ id: "a", orderIndex: 0, kind: "IMAGE", script: "", mediaUrl: "https://example.com/a.png", mediaDurationSeconds: 5 })];
    const r = evaluateProject(scenes, defaults, avatars, "AVATAR_III");
    expect(r.canGenerate).toBe(false);
    expect(r.projectIssue).toContain("avatar scene");
    expect(r.summary).toBe(r.projectIssue);
  });

  it("allows generation once at least one scene is an avatar scene", () => {
    const scenes = [
      scene({ id: "a", orderIndex: 0 }),
      scene({ id: "b", orderIndex: 1, kind: "IMAGE", script: "", mediaUrl: "https://example.com/a.png", mediaDurationSeconds: 5 }),
    ];
    const r = evaluateProject(scenes, defaults, avatars, "AVATAR_III");
    expect(r.canGenerate).toBe(true);
    expect(r.projectIssue).toBeNull();
    expect(r.hasMediaScenes).toBe(true);
  });

  it("adds a silent image scene's set length to the total, and flags an unknown-length silent video scene", () => {
    const scenes = [
      scene({ id: "a", orderIndex: 0, script: "" }),
      scene({ id: "b", orderIndex: 1, kind: "IMAGE", script: "", mediaUrl: "https://example.com/a.png", mediaDurationSeconds: 8 }),
      scene({ id: "c", orderIndex: 2, kind: "VIDEO", script: "", mediaUrl: "https://example.com/a.mp4" }),
    ];
    // Scene "a" is blank (draft), not an error, so this project is otherwise ready.
    const r = evaluateProject(scenes, defaults, avatars, "AVATAR_III");
    expect(r.totalDurationSeconds).toBeGreaterThanOrEqual(8);
    expect(r.hasUnknownDuration).toBe(true);
  });

  it("reports a scene-level duration of null for a silent video scene", () => {
    const v = scene({ id: "c", orderIndex: 0, kind: "VIDEO", script: "", mediaUrl: "https://example.com/a.mp4" });
    expect(sceneDurationSeconds(v, "AVATAR_III")).toBeNull();
  });
});
