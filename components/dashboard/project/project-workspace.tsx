"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GenerationPanel, type GenerateError, type SettingTarget } from "@/components/dashboard/project/generation-panel";
import { FinalView } from "@/components/dashboard/project/final-view";
import { ProjectStatusBadge } from "@/components/dashboard/project/project-status-badge";
import { SceneEditor, type SceneSettingsPatch } from "@/components/dashboard/project/scene-editor";
import { SceneSidebar } from "@/components/dashboard/project/scene-sidebar";
import { Thumb } from "@/components/dashboard/project/avatar-look-picker";
import {
  VideoSettingsPanel,
  type ProjectSettingsPatch,
  type WatermarkPosition,
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

export function ProjectWorkspace({
  initial,
  avatars,
  canViewCost,
}: {
  initial: ProjectView;
  avatars: AvatarOption[];
  canViewCost: boolean;
}) {
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
  const watermarkPositionLower = project.watermarkPosition.toLowerCase() as WatermarkPosition;
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

  // Scenes ticked in the sidebar for bulk avatar/look/voice changes.
  const [rawSelectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  // Filtered against the live scene list on every render, so an id for a
  // scene that's since been deleted (or replaced by an import) never shows
  // as selected or receives a bulk change.
  const selectedSceneIds = useMemo(() => {
    const valid = new Set(project.scenes.map((s) => s.id));
    return new Set([...rawSelectedSceneIds].filter((id) => valid.has(id)));
  }, [rawSelectedSceneIds, project.scenes]);

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

  // When the scene being edited is one of several ticked scenes, its avatar,
  // look and voice go to every ticked scene. Each one still saves through
  // the normal per-scene autosave queue, which runs saves one at a time.
  function editSceneSettings(sceneId: string, patch: SceneSettingsPatch) {
    if (!(selectedSceneIds.size > 1 && selectedSceneIds.has(sceneId))) {
      editScene(sceneId, patch);
      return;
    }
    const { avatarId, avatarLookId, voiceId, voiceName, ...own } = patch;
    const shared = Object.fromEntries(
      Object.entries({ avatarId, avatarLookId, voiceId, voiceName }).filter(([, v]) => v !== undefined),
    ) as SceneSettingsPatch;
    if (Object.keys(shared).length > 0) {
      for (const id of selectedSceneIds) editScene(id, shared);
    }
    if (Object.keys(own).length > 0) editScene(sceneId, own);
  }

  function editProject(patch: ProjectSettingsPatch & { title?: string }) {
    setProject((p) => {
      const next = { ...p };
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.aspectRatio !== undefined) next.aspectRatio = patch.aspectRatio;
      if (patch.resolution !== undefined) next.resolution = patch.resolution;
      if (patch.engine !== undefined) next.engine = patch.engine.toUpperCase() as ProjectView["engine"];
      if (patch.captionsEnabled !== undefined) next.captionsEnabled = patch.captionsEnabled;
      if (patch.watermarkUrl !== undefined) next.watermarkUrl = patch.watermarkUrl;
      if (patch.watermarkPosition !== undefined) next.watermarkPosition = patch.watermarkPosition.toUpperCase() as ProjectView["watermarkPosition"];
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
    // A plain string for the common case; a function when the message
    // depends on what the response actually says (e.g. how many scenes a
    // PDF import added) — resolved after `after` runs, so it can't be
    // computed up front like the static callers' strings are.
    announce: string | ((json: Record<string, unknown>) => string),
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
      setNotice(typeof announce === "function" ? announce(json) : announce);
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

  const [importingDocument, setImportingDocument] = useState(false);
  // Live status text streamed from the import route (one AI rewrite call
  // per page/slide makes this slow enough that a plain spinner isn't
  // enough — see the route's own comment). Bespoke, not routed through
  // structural() above, since that helper assumes one JSON response, not a
  // stream of progress events ending in its own "done"/"error" line.
  const [importProgress, setImportProgress] = useState<string | null>(null);
  // A picked file waits here until the user says whether to add to the
  // current scenes or replace them entirely — asked every time rather than
  // assumed, since "replace" deletes existing scenes and can't be undone.
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  // Lets cancelImport() below abort the in-flight fetch — the import can
  // take a while (one AI call per slide), so someone who started it on the
  // wrong file shouldn't be stuck waiting it out.
  const importAbortRef = useRef<AbortController | null>(null);

  function cancelImport() {
    importAbortRef.current?.abort();
  }

  async function runImportDocument(file: File, replaceExisting: boolean) {
    setPendingImportFile(null);
    setImportingDocument(true);
    setImportProgress(null);
    setBusy(true);
    const controller = new AbortController();
    importAbortRef.current = controller;
    try {
      if (!(await settle())) return;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("expectedVersion", String(versionRef.current));
      formData.append("replaceExisting", String(replaceExisting));
      const res = await fetch(`/api/dashboard/projects/${projectId}/scenes/import-document`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string };
        if (json.code === "VERSION_CONFLICT" || json.code === "GENERATING") {
          setSaveError(messageFor(res.status, json));
          setSaveState("conflict");
        } else {
          setNotice(messageFor(res.status, json));
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setNotice("We couldn't reach the server. Check your connection and try again.");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.trim()) continue;

          const event = JSON.parse(line) as Record<string, unknown> & { type: string };
          if (event.type === "progress") {
            setImportProgress(event.message as string);
          } else if (event.type === "done") {
            await reload((event.firstSceneId as string | null) ?? undefined);
            const added = event.scenesAdded as number;
            const skipped = event.pagesSkipped as number;
            setNotice(
              `${replaceExisting ? "Replaced the project with" : "Added"} ${added} ${added === 1 ? "scene" : "scenes"} from the file.` +
                (skipped > 0
                  ? ` ${skipped} ${skipped === 1 ? "page had" : "pages had"} no readable text and ${skipped === 1 ? "was" : "were"} skipped.`
                  : ""),
            );
            finished = true;
            break;
          } else if (event.type === "error") {
            if (event.code === "VERSION_CONFLICT" || event.code === "GENERATING") {
              setSaveError(event.message as string);
              setSaveState("conflict");
            } else {
              setNotice((event.message as string) ?? "Something went wrong.");
            }
            finished = true;
            break;
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Cancelling only stops the client from waiting on it — the
        // request already in flight server-side may have completed the
        // import anyway (the work isn't itself interruptible mid-way), so
        // reload rather than assume nothing happened.
        setNotice("Import cancelled.");
        await reload();
      } else {
        setNotice("We couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      importAbortRef.current = null;
      setBusy(false);
      setImportingDocument(false);
      setImportProgress(null);
    }
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

  // ---- Bulk scene selection and avatar/look/voice edit ----------------

  function toggleSceneSelected(id: string) {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedSceneIds(
      selectedSceneIds.size === project.scenes.length ? new Set() : new Set(project.scenes.map((s) => s.id)),
    );
  }

  function clearSelection() {
    setSelectedSceneIds(new Set());
  }

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  async function confirmDeleteSelected() {
    setBulkDeleteOpen(false);
    const ids = project.scenes.filter((s) => selectedSceneIds.has(s.id)).map((s) => s.id);
    if (ids.length === 0) return;
    // Stay on the open scene if it survives, otherwise move to the nearest
    // one that does, preferring the next scene like a single delete.
    const activeIdx = project.scenes.findIndex((s) => s.id === activeId);
    const survives = (s: SceneData) => !selectedSceneIds.has(s.id);
    const nextActive = survives(project.scenes[activeIdx] ?? project.scenes[0])
      ? activeId
      : (project.scenes.slice(activeIdx + 1).find(survives) ?? project.scenes.slice(0, activeIdx).reverse().find(survives))?.id;
    await structural(
      post("/scenes/bulk-delete", { sceneIds: ids }),
      async () => {
        clearSelection();
        await reload(nextActive);
      },
      `${ids.length} ${ids.length === 1 ? "scene" : "scenes"} deleted.`,
    );
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
      // The copy is made server-side, so pending edits must land first.
      if (!(await settle())) return;
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

  // Briefly highlights a project-level setting — triggered from
  // GenerationPanel's per-setting summary row/warnings, same idea as
  // jumpToScene but for a setting rather than a scene, so there's no scene
  // to select. The actual scrollIntoView lives inside SettingsPanel itself
  // (not here), since resolution/engine sit behind its own collapsed
  // "Advanced settings" toggle that only it knows how to expand first.
  const [settingHighlight, setSettingHighlight] = useState<SettingTarget | null>(null);

  function jumpToSetting(target: SettingTarget) {
    // Title lives in this page's own header, not SettingsPanel — focusing
    // it is its own clear visual highlight (the input's normal focus ring),
    // so this doesn't need the ring-flash treatment the others get below.
    if (target === "title") {
      const el = document.getElementById("project-title");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLInputElement | null)?.focus();
      return;
    }
    setSettingHighlight(target);
    window.setTimeout(() => setSettingHighlight((cur) => (cur === target ? null : cur)), 2000);
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
      {/* Short confirmations float in a corner instead of pushing the page
          down for a few seconds. Also the screen-reader live region. */}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {notice && (
          <div className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="flex-1">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
              className="-mr-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <header className="space-y-2">
        <Link
          href="/dashboard/videos"
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to videos
        </Link>
        <div className="flex items-center gap-3">
          <Thumb
            src={projectThumb}
            className="h-12 w-12 rounded-lg ring-1 ring-foreground/10"
            iconClass="h-6 w-6"
          />
          <div className="min-w-0 flex-1">
            <label htmlFor="project-title" className="sr-only">
              Video title
            </label>
            <div className="group/title relative">
              <Input
                id="project-title"
                value={project.title}
                maxLength={PROJECT_TITLE_MAX}
                disabled={locked}
                placeholder="Untitled video"
                onChange={(e) => editProject({ title: e.target.value })}
                className="h-10 border-transparent bg-transparent px-2 pr-9 text-xl font-semibold tracking-tight hover:border-input focus-visible:border-ring md:text-xl"
              />
              {!locked && (
                <Pencil
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-60 transition-opacity group-hover/title:opacity-100 group-focus-within/title:opacity-0"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2">
              <ProjectStatusBadge status={project.status} />
              <span className="text-xs text-muted-foreground">
                {project.scenes.length} {project.scenes.length === 1 ? "scene" : "scenes"}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  saveState === "failed" || saveState === "conflict" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {saveState === "saved" && <Check className="h-3 w-3" aria-hidden="true" />}
                {(saveState === "failed" || saveState === "conflict") && <TriangleAlert className="h-3 w-3" aria-hidden="true" />}
                {saveLabel[saveState]}
              </span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More project actions"
              disabled={busy}
              className={buttonVariants({ variant: "outline", size: "icon" })}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => void duplicateProject()}>
                <Copy aria-hidden="true" />
                Duplicate project
              </DropdownMenuItem>
              {!generating && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteProjectOpen(true)}>
                    <Trash2 aria-hidden="true" />
                    {project.status === "DRAFT" ? "Delete draft" : "Delete project"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
          canViewCost={canViewCost}
        />
      ) : (
        <>
          {project.status === "COMPLETED" && project.finalVideo && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
              <span className="flex items-start gap-2 text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {project.isOutdated
                  ? "You've changed scenes since your video was made. Generate again to include your edits."
                  : "You're editing a project that already has a finished video."}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setMode("result")}>
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

          {/* Three columns only from xl: below that the app sidebar leaves too
              little room, so the whole-video panels drop under the editor. */}
          <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem] 2xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
            <div
              id="scene-list-panel"
              className={cn(scenesOpen ? "block" : "hidden", "lg:row-span-2 lg:block xl:row-span-1")}
            >
              {/* Pinned with its own scroll, so a long scene list stays
                  reachable. The padding keeps focus rings from being clipped. */}
              <div className="lg:sticky lg:top-5 lg:-m-1 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:p-1">
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
                  onImportDocument={setPendingImportFile}
                  importingDocument={importingDocument}
                  importProgress={importProgress}
                  onCancelImport={cancelImport}
                  onDuplicate={duplicateScene}
                  onDelete={requestDelete}
                  onMove={moveScene}
                  onReorder={reorder}
                  selectedSceneIds={selectedSceneIds}
                  onToggleSceneSelected={toggleSceneSelected}
                  onToggleSelectAll={toggleSelectAll}
                  onClearSelection={clearSelection}
                  onDeleteSelected={() => setBulkDeleteOpen(true)}
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
                  aspectRatio={project.aspectRatio}
                  selection={
                    selectedSceneIds.size > 0
                      ? { count: selectedSceneIds.size, includesThisScene: selectedSceneIds.has(activeScene.id) }
                      : null
                  }
                  onChange={(patch) => editScene(activeScene.id, patch)}
                  onSettingsChange={(patch) => editSceneSettings(activeScene.id, patch)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">This project has no scenes yet.</p>
              )}
            </div>

            <div className="min-w-0 space-y-4" id="generate-panel">
              <GenerationPanel
                readiness={readiness}
                submitting={submitting}
                disabled={locked || saveState === "conflict"}
                hasRender={!!project.finalVideo}
                error={genError}
                onGenerate={() => void generate()}
                onJump={jumpToScene}
                onDismissError={() => setGenError(null)}
                canViewCost={canViewCost}
                watermarkUrl={project.watermarkUrl}
                captionsEnabled={project.captionsEnabled}
                onJumpToSetting={jumpToSetting}
                title={project.title}
                aspectRatio={project.aspectRatio}
                resolution={project.resolution}
                engine={project.engine as VideoEngineValue}
                voiceName={project.defaults.defaultVoiceName}
              />
              <VideoSettingsPanel
                defaults={project.defaults}
                highlight={settingHighlight}
                avatars={avatars}
                aspectRatio={project.aspectRatio}
                resolution={project.resolution}
                engine={engineLower}
                captionsEnabled={project.captionsEnabled}
                watermarkUrl={project.watermarkUrl}
                watermarkPosition={watermarkPositionLower}
                disabled={locked}
                onProjectChange={editProject}
                canViewCost={canViewCost}
              />
            </div>
          </div>

          {/* Until the three-column layout (xl), the generate panel sits below
              the editor, so keep a summary in reach that jumps to it. The
              negative margin matches the page padding (p-4, then sm:p-6) so
              the bar spans edge to edge without overflowing sideways. */}
          <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 xl:hidden">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm">
                <span className="font-medium">{readiness.sceneCount}</span> {readiness.sceneCount === 1 ? "scene" : "scenes"}
                {readiness.totalDurationSeconds > 0 && (
                  <>
                    {" "}
                    · {formatDuration(readiness.totalDurationSeconds)}
                    {canViewCost && <> · ~{formatCents(readiness.totalCostCents)}</>}
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

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedSceneIds.size} {selectedSceneIds.size === 1 ? "scene" : "scenes"}?
            </DialogTitle>
            <DialogDescription>
              {selectedSceneIds.size === 1 ? "This scene and its script" : "These scenes and their scripts"} will be
              removed from the video. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-muted/60 p-3 text-sm">
            {project.scenes.map((s, i) =>
              selectedSceneIds.has(s.id) ? (
                <li key={s.id} className="truncate">
                  <span className="text-muted-foreground">{i + 1}.</span> {s.title.trim() || "Untitled scene"}
                </li>
              ) : null,
            )}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDeleteOpen(false)}>
              Keep scenes
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirmDeleteSelected()}>
              Delete {selectedSceneIds.size} {selectedSceneIds.size === 1 ? "scene" : "scenes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingImportFile} onOpenChange={(o) => !o && setPendingImportFile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import scenes from this file?</DialogTitle>
            <DialogDescription>
              {project.scenes.length === 1 && !project.scenes[0].script.trim() && !project.scenes[0].title.trim()
                ? "You can add the imported scenes after the current one, or replace it since it's still empty."
                : `This project already has ${project.scenes.length} ${project.scenes.length === 1 ? "scene" : "scenes"}. Add the imported ones after ${project.scenes.length === 1 ? "it" : "them"}, or remove everything and start fresh from this file.`}
            </DialogDescription>
          </DialogHeader>
          {/* Three real choices with genuinely long labels don't fit on one
              row inside this dialog's default (narrow, sm:max-w-sm) width —
              confirmed live: the row overflowed past the dialog's edge.
              Stacked full-width at every breakpoint instead of the default
              sm:flex-row, which only ever has to fit two short labels
              everywhere else this component is used. */}
          <DialogFooter className="sm:flex-col-reverse sm:items-stretch sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setPendingImportFile(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => pendingImportFile && void runImportDocument(pendingImportFile, true)}
            >
              Remove everything, start fresh
            </Button>
            <Button type="button" onClick={() => pendingImportFile && void runImportDocument(pendingImportFile, false)}>
              Add to current scenes
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
