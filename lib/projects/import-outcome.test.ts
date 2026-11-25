import { describe, expect, it } from "vitest";
import { cancelledImportMessage } from "@/lib/projects/import-outcome";

describe("cancelledImportMessage", () => {
  it("only says nothing changed when both reloads show the same version", () => {
    expect(cancelledImportMessage({ reloaded: true, versionBefore: 3, versionAfter: 3 })).toBe("Import cancelled. Nothing was changed.");
  });

  it("never claims a cancel undid a save that had already landed", () => {
    const message = cancelledImportMessage({ reloaded: true, versionBefore: 3, versionAfter: 4 });
    expect(message).toMatch(/may have finished/);
    expect(message).not.toMatch(/Nothing was changed/);
  });

  it("asks for a reload rather than guessing when the project couldn't be checked", () => {
    const message = cancelledImportMessage({ reloaded: false, versionBefore: 3, versionAfter: 3 });
    expect(message).toMatch(/couldn't check/);
    expect(message).not.toMatch(/Nothing was changed/);
  });
});
