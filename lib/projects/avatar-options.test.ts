import { describe, expect, it, vi } from "vitest";

// Shared (public) avatars never offer an intro clip anywhere; own avatars
// keep theirs. listAvatarOptions/listPublicAvatarOptions feed the project
// editor's avatar and look picker.
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ default: { avatar: { findMany } } }));

import { listAvatarOptions, listPublicAvatarOptions } from "@/lib/projects/service";

const row = {
  id: "a1",
  name: "Neil",
  status: "ready",
  previewUrl: "https://img/a1.jpg",
  heygenAvatarId: "hg-a1",
  avatarType: null,
  looks: [
    { id: "l1", name: "Suit", status: "ready", previewUrl: "https://img/l1.jpg", videoUrl: "https://vid/l1.mp4", defaultVoiceId: "v1", avatarType: null },
  ],
};

describe("avatar options: intro clips", () => {
  it("drops the intro clip for shared avatars", async () => {
    findMany.mockResolvedValueOnce([row]);
    const [shared] = await listPublicAvatarOptions();
    expect(shared.isPublic).toBe(true);
    expect(shared.looks[0]).toMatchObject({ id: "l1", previewUrl: "https://img/l1.jpg", videoUrl: null });
  });

  it("keeps the intro clip for the user's own avatars", async () => {
    findMany.mockResolvedValueOnce([row]);
    const [own] = await listAvatarOptions("u1");
    expect(own.isPublic).toBe(false);
    expect(own.looks[0].videoUrl).toBe("https://vid/l1.mp4");
  });
});
