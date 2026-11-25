import { describe, expect, it } from "vitest";
import { planImportedScenes } from "@/lib/projects/import-plan";

describe("planImportedScenes", () => {
  it("makes one scene per page in order, keeping the page number", () => {
    const r = planImportedScenes(
      [
        { scripts: ["Intro."], slideImageId: "i1" },
        { scripts: ["Pricing."], slideImageId: "i2" },
      ],
      "Slide",
      "SLIDE",
    );
    expect(r.scenes).toEqual([
      { title: "Slide 1", script: "Intro.", kind: "SLIDE", slideImageId: "i1", sourcePageNumber: 1 },
      { title: "Slide 2", script: "Pricing.", kind: "SLIDE", slideImageId: "i2", sourcePageNumber: 2 },
    ]);
  });

  it("splits a dense slide into labelled parts that share one image", () => {
    const r = planImportedScenes([{ scripts: ["One.", "Two."], slideImageId: "i4" }], "Slide", "SLIDE");
    expect(r.scenes.map((s) => [s.title, s.slideImageId, s.sourcePageNumber])).toEqual([
      ["Slide 1 · Part 1", "i4", 1],
      ["Slide 1 · Part 2", "i4", 1],
    ]);
  });

  it("keeps an image-only page with empty narration, and counts it as needing narration", () => {
    const r = planImportedScenes([{ scripts: ["  "], slideImageId: "chart" }], "Page", "SLIDE");
    expect(r.scenes).toEqual([{ title: "Page 1", script: "", kind: "SLIDE", slideImageId: "chart", sourcePageNumber: 1 }]);
    expect(r.scenesNeedingNarration).toBe(1);
    expect(r.pagesSkipped).toBe(0);
  });

  it("skips only pages with neither text nor an image", () => {
    const r = planImportedScenes(
      [
        { scripts: [""], slideImageId: null },
        { scripts: ["Text."], slideImageId: null },
      ],
      "Slide",
      "AVATAR",
    );
    expect(r.pagesSkipped).toBe(1);
    expect(r.scenes.map((s) => s.sourcePageNumber)).toEqual([2]);
  });

  it("keeps slide images on Avatar imports so scenes can switch later", () => {
    const r = planImportedScenes([{ scripts: ["Hi."], slideImageId: "i1" }], "Page", "AVATAR");
    expect(r.scenes[0]).toMatchObject({ kind: "AVATAR", slideImageId: "i1" });
  });
});
