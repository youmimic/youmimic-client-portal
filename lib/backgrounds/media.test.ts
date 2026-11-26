import { beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ head: vi.fn(), del: vi.fn(async () => {}) }));
const db = vi.hoisted(() => ({
  backgroundMedia: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  generatedVideo: { findMany: vi.fn() },
}));
vi.mock("@vercel/blob", () => blob);
vi.mock("@/lib/prisma", () => ({ default: db }));

import {
  BackgroundMediaError,
  backgroundUploadTokenOptions,
  registerBackgroundMedia,
  removeUnusedBackgroundMedia,
  UNUSED_BACKGROUND_GRACE_MS,
} from "@/lib/backgrounds/media";

const STORE = "https://abc123.public.blob.vercel-storage.com";
const mine = (name: string) => `${STORE}/backgrounds/u1/${name}`;

beforeEach(() => {
  vi.clearAllMocks();
  db.backgroundMedia.findFirst.mockResolvedValue(null);
  db.backgroundMedia.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "bg1", ...data }));
});

describe("upload tokens", () => {
  it("only allow this user's folder, the allowed types and the size cap", () => {
    const opts = backgroundUploadTokenOptions("u1", "backgrounds/u1/office.jpg");
    expect(opts.allowedContentTypes).toEqual(["image/jpeg", "image/png", "image/webp", "video/mp4"]);
    expect(opts.maximumSizeInBytes).toBe(50 * 1024 * 1024);
    expect(opts.addRandomSuffix).toBe(true);
    expect(() => backgroundUploadTokenOptions("u1", "backgrounds/u2/x.jpg")).toThrow(BackgroundMediaError);
    expect(() => backgroundUploadTokenOptions("u1", "slides/u1/x.jpg")).toThrow(BackgroundMediaError);
    expect(() => backgroundUploadTokenOptions("u1", "backgrounds/u1/../u2/x.jpg")).toThrow(BackgroundMediaError);
  });
});

describe("registering an upload", () => {
  it("records a photo or video from the user's own folder", async () => {
    blob.head.mockResolvedValueOnce({ contentType: "image/jpeg", size: 600_000 });
    expect(await registerBackgroundMedia("u1", mine("office-x1.jpg"))).toMatchObject({ kind: "IMAGE", sizeBytes: 600_000 });
    blob.head.mockResolvedValueOnce({ contentType: "video/mp4", size: 11_000_000 });
    expect(await registerBackgroundMedia("u1", mine("sea-x2.mp4"))).toMatchObject({ kind: "VIDEO" });
  });

  it("refuses files outside the user's folder or our store, without touching them", async () => {
    for (const url of [`${STORE}/backgrounds/u2/x.jpg`, `${STORE}/slides/u1/x.jpg`, "https://evil.example/backgrounds/u1/x.jpg", "http://abc.public.blob.vercel-storage.com/backgrounds/u1/x.jpg", "not a url"]) {
      await expect(registerBackgroundMedia("u1", url)).rejects.toBeInstanceOf(BackgroundMediaError);
    }
    expect(blob.head).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("deletes and refuses a wrong type or an oversized photo", async () => {
    blob.head.mockResolvedValueOnce({ contentType: "image/gif", size: 1000 });
    await expect(registerBackgroundMedia("u1", mine("a.gif"))).rejects.toThrow(/JPG, PNG or WebP/);
    blob.head.mockResolvedValueOnce({ contentType: "image/png", size: 21 * 1024 * 1024 });
    await expect(registerBackgroundMedia("u1", mine("big.png"))).rejects.toThrow(/too large/);
    expect(blob.del).toHaveBeenCalledTimes(2);
    expect(db.backgroundMedia.create).not.toHaveBeenCalled();
  });

  it("returns the existing record when the same file is registered twice", async () => {
    blob.head.mockResolvedValueOnce({ contentType: "image/jpeg", size: 10 });
    db.backgroundMedia.findFirst.mockResolvedValueOnce({ id: "bg-old", kind: "IMAGE", url: mine("a.jpg"), contentType: "image/jpeg", sizeBytes: 10 });
    expect(await registerBackgroundMedia("u1", mine("a.jpg"))).toMatchObject({ id: "bg-old" });
    expect(db.backgroundMedia.create).not.toHaveBeenCalled();
  });
});

describe("removing unused backgrounds", () => {
  const now = new Date("2026-11-27T04:00:00Z");

  it("only asks for unused rows older than a day, and spares ones a recent render may need", async () => {
    db.backgroundMedia.findMany.mockResolvedValue([
      { id: "a", userId: "u1", url: mine("a.jpg") },
      { id: "b", userId: "u1", url: mine("b.mp4") },
      { id: "c", userId: "u1", url: mine("c.jpg") },
    ]);
    db.generatedVideo.findMany.mockResolvedValue([
      { backgroundUrl: mine("b.mp4"), sceneSnapshot: null },
      { backgroundUrl: null, sceneSnapshot: [{ order: 1, backgroundUrl: mine("c.jpg") }] },
    ]);
    db.backgroundMedia.deleteMany.mockResolvedValue({ count: 1 });

    expect(await removeUnusedBackgroundMedia(now)).toEqual({ deleted: 1 });

    const where = db.backgroundMedia.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ scenes: { none: {} }, createdAt: { lt: new Date(now.getTime() - UNUSED_BACKGROUND_GRACE_MS) } });
    expect(db.backgroundMedia.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.backgroundMedia.deleteMany).toHaveBeenCalledWith({ where: { id: "a", scenes: { none: {} } } });
    expect(blob.del).toHaveBeenCalledWith(mine("a.jpg"));
  });

  it("keeps the file when a scene picked the background up in the meantime", async () => {
    db.backgroundMedia.findMany.mockResolvedValue([{ id: "a", userId: "u1", url: mine("a.jpg") }]);
    db.generatedVideo.findMany.mockResolvedValue([]);
    db.backgroundMedia.deleteMany.mockResolvedValue({ count: 0 });
    expect(await removeUnusedBackgroundMedia(now)).toEqual({ deleted: 0 });
    expect(blob.del).not.toHaveBeenCalled();
  });
});
