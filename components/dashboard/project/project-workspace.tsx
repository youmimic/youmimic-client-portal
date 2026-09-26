"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GenerationPanel, type GenerateError } from "@/components/dashboard/project/generation-panel";
import { FinalView } from "@/components/dashboard/project/final-view";
import { ProjectStatusBadge } from "@/components/dashboard/project/project-status-badge";
import { SceneEditor } from "@/components/dashboard/project/scene-editor";
import { SceneSidebar } from "@/components/dashboard/project/scene-sidebar";
import { Thumb } from "@/components/dashboard/project/avatar-look-picker";
import {
  SettingsPanel,
  type ProjectSettingsPatch,
  type SceneSettingsPatch,
} from "@/components/dashboard/project/settings-panel";
import type { HeyGenEngine } from "@/lib/heygen";
import { moveItem } from "@/lib/projects/ordering";
import { evaluateProject, PROJECT_TITLE_MAX, resolveScene, type AvatarOption, type SceneData } from "@/lib/projects/rules";
import type { ProjectView } from "@/lib/projects/service";
import { formatCents, formatDuration, type VideoEngineValue } from "@/lib/video-display";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "unsaved" | "saving" | "failed" | "conflict";

type Patch = Record<string, unknown>;

function messageFor(status: number, json: { error?: string }): string {
  return json.error ?? `Request failed (${status})`;
}

export function ProjectWorkspace({ initial, avatars }: { initial: ProjectView; avatars: AvatarOption[] }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectView>(initial);
  const [activeId, setActiveId] = useState(initial.scenes[0]?.id ?? "");
  const [mode, setMode] = useState<"editor" | "result">(
    initial.finalVideo && initial.status !== "DRAFT" ? "result" : "editor",
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [scenesOpen, setScenesOpen] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [genError, setGenError] = useState<GenerateError | null>(null);
  const [deleteSceneId, setDeleteSceneId] = useState<string | null>(null);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  const projectId = initial.id;
  const versionRef = useRef(initial.version);
  const queueRef = useRef<Map<string, Patch>>(new Map());
  const timerRef = useRef<number | undefined>(undefined);
  const flushingRef = useRef<Promise<boolean> | null>(null);

  const engineLower = project.engine.toLowerCase() as HeyGenEngine;
  const generating = project.status === "GENERATING";
  const locked = generating;

  // Thumbnail for the whole project: the look used by the first scene.
  const firstScene = project.scenes[0];
  const firstResolved = firstScene ? resolveScene(firstScene, project.defaults) : null;
  const firstAvatar = avatars.find((a) => a.id === firstResolved?.avatarId) ?? null;
  const firstLook =
    firstAvatar?.looks.find((l) => l.id === firstResolved?.avatarLookId) ?? firstAvatar?.looks.find((l) => l.ready) ?? null;
  const projectThumb = firstLook?.previewUrl ?? firstAvatar?.previewUrl ?? null;

  const activeIndex = Math.max(0, project.scenes.findIndex((s) => s.id === activeId));
  const activeScene: SceneData | undefined = project.scenes[activeIndex];

  const readiness = useMemo(
    () => evaluateProject(project.scenes, project.defaults, avatars, project.engine as VideoEngineValue),
    [project.scenes, project.defaults, project.engine, avatars],
  );

  // ---- Saving ---------------------------------------------------------

  const runFlush = useCallback((): Promise<boolean> => {
    if (flushingRef.current) return flushingRef.current;
    const job = (async () => {
      setSaveState("saving");
      while (queueRef.current.size > 0) {
        const [key, patch] = queueRef.current.entries().next().value as [string, Patch];
        queueRef.current.delete(key);
        const url =
          key === "p"
            ? `/api/dashboard/projects/${projectId}`
            : `/api/dashboard/projects/${projectId}/scenes/${key.slice(2)}`;
        const requeue = () => {
          queueRef.current.set(key, { ...patch, ...(queueRef.current.get(key) ?? {}) });
        };
        try {
          const res = await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedVersion: versionRef.current, ...patch }),
          });
          const json = (await res.json().catch(() => ({}))) as { version?: number; error?: string; code?: string };
          if (res.ok && typeof json.version === "number") {
            versionRef.current = json.version;
            continue;
          }
          if (json.code === "VERSION_CONFLICT" || json.code === "GENERATING") {
            queueRef.current.clear();
            setSaveError(messageFor(res.status, json));
            setSaveState("conflict");
            return false;
          }
          requeue();
          setSaveError(messageFor(res.status, json));
          setSaveState("failed");
          return false;
        } catch {
          requeue();
          setSaveError("We couldn't reach the server. Your changes are kept here and will save when you retry.");
          setSaveState("failed");
          return false;
        }
      }
      setSaveState("saved");
      setSaveError(null);
      return true;
    })();
    flushingRef.current = job.finally(() => {
      flushingRef.current = null;
    });
    return flushingRef.current;
  }, [projectId]);

  // Waits until every pending edit has been saved. Used before structural
  // actions so the server sees the latest text and the right version.
  const settle = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timerRef.current);
    // Loop: an edit can land while a save is already running.
    for (let i = 0; i < 20; i++) {
      if (queueRef.current.size === 0 && !flushingRef.current) return true;
      const ok = await runFlush();
      if (!ok) return false;
    }
    return queueRef.current.size === 0;
  }, [runFlush]);

  const schedule = useCallback(() => {
    setSaveState((s) => (s === "conflict" ? s : "unsaved"));
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void runFlush();
    }, 700);
  }, [runFlush]);

  const queuePatch = useCallback(
    (key: string, patch: Patch) => {
      queueRef.current.set(key, { ...(queueRef.current.get(key) ?? {}), ...patch });
      schedule();
    },
    [schedule],
  );

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Short-lived messages clear themselves.
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Warn before leaving with edits that haven't reached the server.
  useEffect(() => {
    if (saveState === "saved") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  const reload = useCallback(
    async (selectSceneId?: string) => {
      try {
        const res = await fetch(`/api/dashboard/projects/${projectId}`, { cache: "no-store" });
        if (!res.ok) return false;
        const fresh = (await res.json()) as ProjectView;
        versionRef.current = fresh.version;
        setProject(fresh);
        setActiveId((cur) =>
          selectSceneId && fresh.scenes.some((s) => s.id === selectSceneId)
            ? selectSceneId
            : fresh.scenes.some((s) => s.id === cur)
              ? cur
              : (fresh.scenes[0]?.id ?? ""),
        );
        return true;
      } catch {
        return false;
      }
    },
    [projectId],
  );

  // ---- Local edits ----------------------------------------------------

  function editScene(sceneId: string, patch: Partial<SceneData>) {
    setProject((p) => ({ ...p, scenes: p.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)) }));
    queuePatch(`s:${sceneId}`, patch as Patch);
  }

  function editSceneSettings(sceneId: string, patch: SceneSettingsPatch) {
    editScene(sceneId, patch);
  }

  function editProject(patch: ProjectSettingsPatch & { title?: string }) {
    setProject((p) => {
      const next = { ...p };
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.aspectRatio !== undefined) next.aspectRatio = patch.aspectRatio;
      if (patch.resolution !== undefined) next.resolution = patch.resolution;
      if (patch.engine !== undefined) next.engine = patch.engine.toUpperCase() as ProjectView["engine"];
      if (patch.captionsEnabled !== undefined) next.captionsEnabled = patch.captionsEnabled;
      next.defaults = {
        ...p.defaults,
        defaultVoiceId: patch.defaultVoiceId !== undefined ? patch.defaultVoiceId : p.defaults.defaultVoiceId,
        defaultVoiceName: patch.defaultVoiceName !== undefined ? patch.defaultVoiceName : p.defaults.defaultVoiceName,
      };
      return next;
    });
    queuePatch("p", patch as Patch);
  }

  // ---- Structural actions --------------------------------------------

  async function structural(
    request: (version: number) => Promise<Response>,
    after: (json: Record<string, unknown>) => Promise<void> | void,
    announce: string,
  ) {
    setBusy(true);
    try {
      if (!(await settle())) return;
      const res = await request(versionRef.current);
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string };
      if (!res.ok) {
        if (json.code === "VERSION_CONFLICT" || json.code === "GENERATING") {
          setSaveError(messageFor(res.status, json));
          setSaveState("conflict");
        } else {
          setNotice(messageFor(res.status, json));
        }
        return;
      }
      await after(json);
      setNotice(announce);
    } catch {
      setNotice("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function post(path: string, body: Record<string, unknown>, method = "POST") {
    return (version: number) =>
      fetch(`/api/dashboard/projects/${projectId}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version, ...body }),
      });
  }

  function addScene() {
    void structural(
      post("/scenes", { afterSceneId: activeId || undefined }),
      async (json) => {
        await reload(json.sceneId as string);
      },
      "Scene added.",
    );
  }

  function duplicateScene(id: string) {
    void structural(
      post(`/scenes/${id}/duplicate`, {}),
      async (json) => {
        await reload(json.sceneId as string);
      },
      "Scene duplicated.",
    );
  }

  function requestDelete(id: string) {
    const scene = project.scenes.find((s) => s.id === id);
    // Only ask when there is work to lose.
    if (scene && (scene.script.trim() || scene.title.trim())) setDeleteSceneId(id);
    else void confirmDeleteScene(id);
  }

  async function confirmDeleteScene(id: string) {
    setDeleteSceneId(null);
    const idx = project.scenes.findIndex((s) => s.id === id);
    const neighbour = project.scenes[idx + 1] ?? project.scenes[idx - 1];
    await structural(
      post(`/scenes/${id}`, {}, "DELETE"),
      async () => {
        await reload(neighbour?.id);
      },
      "Scene deleted.",
    );
  }

  function reorder(orderedIds: string[]) {
    const previous = project.scenes;
    const byId = new Map(previous.map((s) => [s.id, s]));
    setProject((p) => ({
      ...p,
      scenes: orderedIds.map((id, i) => ({ ...(byId.get(id) as SceneData), orderIndex: i })),
    }));
    void structural(
      post("/scenes/reorder", { orderedSceneIds: orderedIds }),
      () => {},
      "Scene order updated.",
    ).then(() => {
      // If the save failed the server order is unchanged, so pull it back.
      void reload();
    });
  }

  function moveScene(id: string, direction: -1 | 1) {
    const ids = project.scenes.map((s) => s.id);
    const from = ids.indexOf(id);
    reorder(moveItem(ids, from, from + direction));
  }

  // ---- Generation -----------------------------------------------------

  async function generate() {
    setShowIssues(true);
    setGenError(null);
    setSubmitting(true);
    try {
      if (!(await settle())) {
        setGenError({ kind: "conflict", message: "Your latest changes couldn't be saved yet. Fix that, then try again." });
        return;
      }
      const res = await fetch(`/api/dashboard/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: versionRef.current }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.status === 201) {
        await reload();
        setMode("result");
        setShowIssues(false);
        setNotice("Your video is being generated.");
        return;
      }
      const message = messageFor(res.status, json);
      if (res.status === 402 || json.code === "OVER_LIMIT") setGenError({ kind: "over_limit", message });
      else if (res.status === 403) setGenError({ kind: "no_subscription", message });
      else if (json.code === "NOT_READY") setGenError({ kind: "not_ready", message });
      else if (res.status === 409) {
        setGenError({ kind: "conflict", message });
        await reload();
      } else setGenError({ kind: "service", message });
    } catch {
      setGenError({ kind: "network", message: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  // Poll the render while it runs. The refresh route asks the provider for
  // the latest state, then the project is reloaded so its status follows.
  const videoId = project.finalVideo?.id;
  const checkProgress = useCallback(async () => {
    if (!videoId) return;
    try {
      const res = await fetch(`/api/dashboard/videos/${videoId}/refresh`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      setPollError(null);
      await reload();
    } catch (e) {
      setPollError(e instanceof Error ? e.message : "Could not check progress.");
    }
  }, [videoId, reload]);

  useEffect(() => {
    if (!generating || !videoId) return;
    const startedAt = Date.now();
    let timer: number | undefined;
    const tick = () => {
      timer = window.setTimeout(
        async () => {
          if (document.visibilityState === "visible") await checkProgress();
          tick();
        },
        Date.now() - startedAt < 120_000 ? 6000 : 15000,
      );
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [generating, videoId, checkProgress]);

  async function manualCheck() {
    setChecking(true);
    await checkProgress();
    setChecking(false);
  }

  async function refreshLink() {
    if (!videoId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboard/videos/${videoId}/refresh-url`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(json.error ?? "Could not refresh the video link.");
      } else {
        await reload();
        setNotice("Video link refreshed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function duplicateProject() {
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboard/projects/${projectId}/duplicate`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { projectId?: string; error?: string };
      if (res.status === 201 && json.projectId) {
        router.push(`/dashboard/videos/projects/${json.projectId}`);
        return;
      }
      setNotice(json.error ?? "Could not duplicate the project.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    setBusy(true);
    // Nothing should try to save into a project that is being deleted.
    window.clearTimeout(timerRef.current);
    queueRef.current.clear();
    try {
      const res = await fetch(`/api/dashboard/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/dashboard/videos?deleted=1");
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setNotice(json.error ?? "Could not delete the project.");
      setDeleteProjectOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function jumpToScene(sceneId: string) {
    setMode("editor");
    setActiveId(sceneId);
    setScenesOpen(false);
    window.requestAnimationFrame(() => document.getElementById("scene-script")?.focus());
  }

  function editSceneByNumber(number: number) {
    const scene = project.scenes[number - 1] ?? project.scenes[0];
    if (scene) jumpToScene(scene.id);
  }

  // ---- Render ---------------------------------------------------------

  const saveLabel: Record<SaveState, string> = {
    saved: "Saved",
    saving: "Saving...",
    unsaved: "Unsaved changes",
    failed: "Failed to save",
    conflict: "Not saved",
  };

  const sceneToDelete = project.scenes.find((s) => s.id === deleteSceneId);

  return (
    <div className="space-y-4">
      <div aria-live="polite" role="status" className="sr-only">
        {notice}
      </div>

      <header className="space-y-3">
        <Link
          href="/dashboard/videos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to videos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Thumb
            src={projectThumb}
            className="h-12 w-12 rounded-lg ring-1 ring-foreground/10"
            iconClass="h-6 w-6"
          />
          <div className="min-w-0 flex-1">
            <label htmlFor="project-title" className="sr-only">
              Video title
            </label>
            <Input
              id="project-title"
              value={project.title}
              maxLength={PROJECT_TITLE_MAX}
              disabled={locked}
              placeholder="Untitled video"
              onChange={(e) => editProject({ title: e.target.value })}
              className="h-10 border-transparent bg-transparent px-2 text-xl font-semibold tracking-tight hover:border-input focus-visible:border-ring md:text-xl"
            />
          </div>
          <ProjectStatusBadge status={project.status} />
          {!generating && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => setDeleteProjectOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {project.status === "DRAFT" ? "Delete draft" : "Delete project"}
            </Button>
          )}
          <p
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs",
              saveState === "failed" || saveState === "conflict" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {saveState === "saved" && <Check className="h-3 w-3" aria-hidden="true" />}
            {(saveState === "failed" || saveState === "conflict") && <TriangleAlert className="h-3 w-3" aria-hidden="true" />}
            {saveLabel[saveState]}
          </p>
        </div>
      </header>

      {(saveState === "failed" || saveState === "conflict") && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
        >
          <span>{saveError}</span>
          {saveState === "failed" ? (
            <Button type="button" variant="outline" size="xs" onClick={() => void runFlush()}>
              Retry saving
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={async () => {
                if (await reload()) {
                  setSaveState("saved");
                  setSaveError(null);
                }
              }}
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Reload latest
            </Button>
          )}
        </div>
      )}

      {notice && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" aria-hidden="true">
          {notice}
        </p>
      )}

      {mode === "result" && project.finalVideo ? (
        <FinalView
          project={project}
          checking={checking}
          pollError={pollError}
          busy={busy}
          onCheckNow={manualCheck}
          onEdit={() => setMode("editor")}
          onEditScene={editSceneByNumber}
          onDuplicate={duplicateProject}
          onDelete={() => setDeleteProjectOpen(true)}
          onRefreshLink={refreshLink}
        />
      ) : (
        <>
          {project.status === "COMPLETED" && project.finalVideo && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {project.isOutdated
                  ? "You've changed scenes since your video was made. Generate again to include your edits."
                  : "You're editing a project that already has a finished video."}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("result")}>
                View finished video
              </Button>
            </div>
          )}

          {/* Small screens: the scene list folds away behind one button. */}
          <div className="lg:hidden">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              aria-expanded={scenesOpen}
              aria-controls="scene-list-panel"
              onClick={() => setScenesOpen((o) => !o)}
            >
              <span>
                Scene {activeIndex + 1} of {project.scenes.length}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Manage scenes
                <ChevronDown className={cn("h-4 w-4 transition-transform", scenesOpen && "rotate-180")} aria-hidden="true" />
              </span>
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
            <div id="scene-list-panel" className={cn(scenesOpen ? "block" : "hidden", "lg:block")}>
              <div className="lg:sticky lg:top-6">
                <SceneSidebar
                  scenes={project.scenes}
                  activeSceneId={activeScene?.id ?? ""}
                  avatars={avatars}
                  defaults={project.defaults}
                  readiness={readiness.sceneStatus}
                  engine={project.engine as VideoEngineValue}
                  disabled={locked}
                  busy={busy}
                  onSelect={(id) => {
                    setActiveId(id);
                    setScenesOpen(false);
                  }}
                  onAdd={addScene}
                  onDuplicate={duplicateScene}
                  onDelete={requestDelete}
                  onMove={moveScene}
                  onReorder={reorder}
                />
                <p className="mt-2 hidden text-xs text-muted-foreground lg:block">
                  Drag a scene to reorder it, or use the arrow buttons on the selected scene.
                </p>
              </div>
            </div>

            <div className="min-w-0">
              {activeScene ? (
                <SceneEditor
                  key={activeScene.id}
                  scene={activeScene}
                  number={activeIndex + 1}
                  totalScenes={project.scenes.length}
                  defaults={project.defaults}
                  avatars={avatars}
                  engine={project.engine as VideoEngineValue}
                  issues={readiness.issues.filter((i) => i.sceneId === activeScene.id)}
                  disabled={locked}
                  showIssues={showIssues}
                  onChange={(patch) => editScene(activeScene.id, patch)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">This project has no scenes yet.</p>
              )}
            </div>

            <div className="space-y-4" id="generate-panel">
              <GenerationPanel
                readiness={readiness}
                submitting={submitting}
                disabled={locked || saveState === "conflict"}
                hasRender={!!project.finalVideo}
                error={genError}
                onGenerate={() => void generate()}
                onJump={jumpToScene}
                onDismissError={() => setGenError(null)}
              />
              {activeScene && (
                <SettingsPanel
                  scene={activeScene}
                  sceneNumber={activeIndex + 1}
                  defaults={project.defaults}
                  avatars={avatars}
                  aspectRatio={project.aspectRatio}
                  resolution={project.resolution}
                  engine={engineLower}
                  captionsEnabled={project.captionsEnabled}
                  disabled={locked}
                  onSceneChange={(patch) => editSceneSettings(activeScene.id, patch)}
                  onProjectChange={editProject}
                />
              )}
            </div>
          </div>

          {/* Small screens: a summary that stays in reach and jumps to the generate panel. */}
          <div className="sticky bottom-0 -mx-6 border-t bg-background/95 px-6 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm">
                <span className="font-medium">{readiness.sceneCount}</span> {readiness.sceneCount === 1 ? "scene" : "scenes"}
                {readiness.totalDurationSeconds > 0 && (
                  <>
                    {" "}
                    · {formatDuration(readiness.totalDurationSeconds)} · ~{formatCents(readiness.totalCostCents)}
                  </>
                )}
              </p>
              <Button
                type="button"
                onClick={() => document.getElementById("generate-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                Review and generate
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!deleteSceneId} onOpenChange={(o) => !o && setDeleteSceneId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this scene?</DialogTitle>
            <DialogDescription>
              {sceneToDelete?.title.trim() ? `"${sceneToDelete.title.trim()}"` : "This scene"} and its script will be
              removed from the video. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteSceneId(null)}>
              Keep scene
            </Button>
            <Button type="button" variant="destructive" onClick={() => deleteSceneId && void confirmDeleteScene(deleteSceneId)}>
              Delete scene
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{project.status === "DRAFT" ? "Delete this draft?" : "Delete this project?"}</DialogTitle>
            <DialogDescription>
              {project.status === "DRAFT"
                ? `"${project.title.trim() || "Untitled video"}" and all ${project.scenes.length} ${project.scenes.length === 1 ? "scene" : "scenes"} will be removed. This can't be undone.`
                : "The project and all of its scenes will be removed. A finished video stays in your videos list until you delete it there."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteProjectOpen(false)} disabled={busy}>
              {project.status === "DRAFT" ? "Keep draft" : "Keep project"}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteProject()} disabled={busy}>
              {busy ? "Deleting..." : project.status === "DRAFT" ? "Delete draft" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
