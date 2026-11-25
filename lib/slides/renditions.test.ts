import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

// slideRenditionUrl across aspect-ratio changes, with real image processing.
// The database row and Blob storage are in-memory fakes; fetch serves the
// "uploaded" files back from memory.

const store = vi.hoisted(() => ({ files: new Map<string, Buffer>(), row: null as null | { id: string; url: string; renditions: Record<string, string> | null } }));

vi.mock("@/lib/prisma", () => ({
  default: {
    slideImage: {
      findFirst: vi.fn(async () => store.row),
      update: vi.fn(async ({ data }: { data: { renditions: Record<string, string> } }) => {
        if (store.row) store.row.renditions = data.renditions;
        return store.row;
      }),
    },
  },
}));
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: Buffer) => {
    const url = `https://blob.example/${pathname}`;
    store.files.set(url, body);
    return { url };
  }),
  del: vi.fn(async () => {}),
}));

import { put } from "@vercel/blob";
import { slideRenditionUrl } from "@/lib/slides/images";

const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
  const body = store.files.get(url);
  if (!body) return { ok: false, status: 404 } as Response;
  return { ok: true, status: 200, arrayBuffer: async () => (init?.method === "HEAD" ? new ArrayBuffer(0) : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)) } as unknown as Response;
});

// Width/height of the non-black content inside a letterboxed frame.
async function contentBox(buffer: Buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y += 2) {
    for (let x = 0; x < info.width; x += 2) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] + data[i + 1] + data[i + 2] > 600) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  return { frame: [info.width, info.height], width: maxX - minX + 2, height: maxY - minY + 2 };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  store.files.clear();
  // A white 4:3 original (1600x1200), as imported.
  const original = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
  store.files.set("https://blob.example/slides/u1/original.jpg", original);
  store.row = { id: "img1", url: "https://blob.example/slides/u1/original.jpg", renditions: null };
});

describe("slide copies when the project's aspect ratio changes", () => {
  it("16:9 -> 9:16 -> 1:1 -> 16:9: each copy comes from the original, never from another copy", async () => {
    const u169 = await slideRenditionUrl("u1", "img1", "16:9");
    const u916 = await slideRenditionUrl("u1", "img1", "9:16");
    const u11 = await slideRenditionUrl("u1", "img1", "1:1");

    // Every full download was of the original, so nothing is letterboxed twice
    // or recompressed more than once.
    const downloads = fetchMock.mock.calls.filter(([, init]) => init?.method !== "HEAD").map(([url]) => url);
    expect(downloads).toEqual([store.row!.url, store.row!.url, store.row!.url]);

    // Correct canvas for each, whole slide visible (4:3 kept, so no stretch or
    // crop), black bars filling the rest.
    const b169 = await contentBox(store.files.get(u169)!);
    expect(b169.frame).toEqual([1920, 1080]);
    expect(b169.height).toBeGreaterThanOrEqual(1078);
    expect(b169.width / b169.height).toBeCloseTo(4 / 3, 1);

    const b916 = await contentBox(store.files.get(u916)!);
    expect(b916.frame).toEqual([1080, 1920]);
    expect(b916.width).toBeGreaterThanOrEqual(1078);
    expect(b916.width / b916.height).toBeCloseTo(4 / 3, 1);

    const b11 = await contentBox(store.files.get(u11)!);
    expect(b11.frame).toEqual([1080, 1080]);
    expect(b11.width / b11.height).toBeCloseTo(4 / 3, 1);

    // The original is untouched, and each ratio has its own copy.
    expect(store.row!.url).toBe("https://blob.example/slides/u1/original.jpg");
    expect(store.row!.renditions).toEqual({ "16:9": u169, "9:16": u916, "1:1": u11 });

    // Switching back to 16:9 reuses the existing copy (checked with HEAD).
    vi.mocked(put).mockClear();
    expect(await slideRenditionUrl("u1", "img1", "16:9")).toBe(u169);
    expect(put).not.toHaveBeenCalled();
  });

  it("remakes a copy from the original if the cached one has gone", async () => {
    const first = await slideRenditionUrl("u1", "img1", "16:9");
    store.files.delete(first);
    const second = await slideRenditionUrl("u1", "img1", "16:9");
    expect(second).not.toBe(first);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method !== "HEAD").every(([url]) => url === store.row!.url)).toBe(true);
  });

  it("refuses an image that isn't on the user's account", async () => {
    store.row = null;
    await expect(slideRenditionUrl("u1", "someone-elses", "16:9")).rejects.toThrow(/isn't available/);
  });
});
