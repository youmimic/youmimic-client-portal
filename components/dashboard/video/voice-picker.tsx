"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pause, Play, Search, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type VoiceOption = {
  voice_id: string;
  name: string;
  language: string | null;
  gender: string | null;
  preview_audio_url: string | null;
  // Whether this voice honours a `<break time="1s"/>` pause tag in the
  // script. Shown as a badge here, at the point of choosing a voice, rather
  // than trying to re-check it later wherever the script is written.
  support_pause?: boolean;
};

// Confirmed live against the real voice catalogue (2026-09-28): every value
// here is an exact match the provider recognises for its `language` filter.
// This is a curated list rather than free text on purpose — the provider
// doesn't reject an unrecognised language, it silently falls back to a
// generic "Multilingual" set, so a typo would look like a real result
// instead of an error. The raw catalogue also has junk values (blanks,
// "unknown", stray "en" codes, inconsistent trailing spaces) not worth
// exposing here.
const LANGUAGE_OPTIONS = [
  "Arabic",
  "Chinese",
  "Czech",
  "Danish",
  "Dutch",
  "English",
  "Filipino",
  "French",
  "German",
  "Hindi",
  "Hungarian",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Norwegian",
  "Polish",
  "Portuguese",
  "Romanian",
  "Russian",
  "Slovak",
  "Spanish",
  "Turkish",
  "Ukrainian",
  "Vietnamese",
] as const;

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export type SelectedVoice = { id: string; name: string } | null;

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

// Voice choice with a preview button on every row. The list only loads when
// the panel is first opened, so the workspace itself stays quick. A null
// selection means "use the avatar's own voice", which is the safe default.
export function VoicePicker({
  value,
  onChange,
  defaultLabel = "Avatar's own voice (default)",
  disabled = false,
}: {
  value: SelectedVoice;
  onChange: (voice: SelectedVoice) => void;
  // What "no voice chosen" means in the current context, for example
  // "Using project voice: Emma".
  defaultLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // "" means every language, same as leaving the filter off entirely.
  const [language, setLanguage] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadVoices = useCallback(async (opts: { token?: string; language?: string } = {}) => {
    setLoad({ kind: "loading" });
    try {
      const qs = new URLSearchParams();
      if (opts.token) qs.set("token", opts.token);
      if (opts.language) qs.set("language", opts.language);
      const res = await fetch(`/api/dashboard/voices${qs.toString() ? `?${qs}` : ""}`);
      const json = (await res.json().catch(() => ({}))) as {
        voices?: VoiceOption[];
        hasMore?: boolean;
        nextToken?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setVoices((prev) => (opts.token ? [...prev, ...(json.voices ?? [])] : (json.voices ?? [])));
      setNextToken(json.hasMore ? (json.nextToken ?? null) : null);
      setLoad({ kind: "ready" });
    } catch (e) {
      setLoad({ kind: "error", message: e instanceof Error ? e.message : "Could not load voices." });
    }
  }, []);

  // Switching language starts a fresh, server-side filtered list rather than
  // just re-filtering whatever page happened to load already — otherwise a
  // language spoken further down the catalogue (most of it is English)
  // would look like it doesn't exist until "Load more" was clicked enough
  // times to reach it.
  function handleLanguageChange(next: string) {
    setLanguage(next);
    setVoices([]);
    setNextToken(null);
    void loadVoices({ language: next || undefined });
  }

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  function togglePreview(voice: VoiceOption) {
    if (!voice.preview_audio_url) return;
    if (playingId === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(voice.preview_audio_url);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(voice.voice_id);
    void audio.play().catch(() => setPlayingId(null));
  }

  const q = query.trim().toLowerCase();
  const visible = q
    ? voices.filter((v) => `${v.name} ${v.language ?? ""} ${v.gender ?? ""}`.toLowerCase().includes(q))
    : voices;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Voice</p>
          <p className="truncate text-xs text-muted-foreground">
            {value ? value.name : defaultLabel}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls="voice-picker-panel"
          disabled={disabled}
          onClick={() => {
            // Load lazily the first time the panel opens.
            if (!open && load.kind === "idle") void loadVoices();
            setOpen((o) => !o);
          }}
        >
          {open ? "Hide voices" : "Change voice"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </Button>
      </div>

      {open && (
        <div id="voice-picker-panel" className="space-y-2 rounded-lg border p-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or gender"
                aria-label="Search voices"
                className="pl-8"
              />
            </div>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              aria-label="Filter voices by language"
              className={selectClass}
            >
              <option value="">All languages</option>
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Available voices">
            <li>
              <button
                type="button"
                aria-pressed={value === null}
                onClick={() => onChange(null)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                  value === null ? "border-primary ring-2 ring-primary" : "border-transparent hover:bg-muted",
                )}
              >
                <span>{defaultLabel}</span>
                {value === null && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
              </button>
            </li>

            {load.kind === "loading" &&
              voices.length === 0 &&
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-10 w-full" />
                </li>
              ))}

            {visible.map((voice) => {
              const selected = value?.id === voice.voice_id;
              const playing = playingId === voice.voice_id;
              return (
                <li key={voice.voice_id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange({ id: voice.voice_id, name: voice.name })}
                    className={cn(
                      "flex min-w-0 flex-1 items-center justify-between rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                      selected ? "border-primary ring-2 ring-primary" : "border-transparent hover:bg-muted",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{voice.name}</span>
                        {voice.support_pause && (
                          <span
                            title="Supports pauses in the script"
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            <Timer className="h-2.5 w-2.5" aria-hidden="true" />
                            Pauses
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[voice.language, voice.gender].filter(Boolean).join(" · ") || "No details"}
                      </span>
                    </span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!voice.preview_audio_url}
                    aria-label={
                      !voice.preview_audio_url
                        ? `No preview available for ${voice.name}`
                        : `${playing ? "Pause" : "Play"} preview of ${voice.name}`
                    }
                    onClick={() => togglePreview(voice)}
                  >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                </li>
              );
            })}
          </ul>

          {load.kind === "ready" && visible.length === 0 && (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              {q
                ? "No voices match your search."
                : language
                  ? `No ${language} voices are available right now.`
                  : "No voices are available right now."}
            </p>
          )}

          {load.kind === "error" && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-2.5 py-2 text-sm text-destructive"
            >
              <span>{load.message}</span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void loadVoices({ language: language || undefined })}
              >
                Try again
              </Button>
            </div>
          )}

          {nextToken && load.kind === "ready" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => void loadVoices({ token: nextToken, language: language || undefined })}
            >
              Load more voices
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
