import { describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
vi.mock("dns/promises", () => ({
  default: { lookup: (...args: unknown[]) => lookup(...args) },
  lookup: (...args: unknown[]) => lookup(...args),
}));

import { checkUrlIsSafeToFetch } from "@/lib/media/safe-fetch";

describe("checkUrlIsSafeToFetch", () => {
  it("rejects non-http(s) schemes", async () => {
    const result = await checkUrlIsSafeToFetch("file:///etc/passwd");
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid URL", async () => {
    const result = await checkUrlIsSafeToFetch("not a url");
    expect(result.ok).toBe(false);
  });

  it("rejects a literal private IPv4 address with no DNS lookup needed", async () => {
    const result = await checkUrlIsSafeToFetch("http://169.254.169.254/latest/meta-data/");
    expect(result.ok).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a literal loopback address", async () => {
    const result = await checkUrlIsSafeToFetch("http://127.0.0.1:8080/internal");
    expect(result.ok).toBe(false);
  });

  it("rejects a hostname that resolves to a private address", async () => {
    lookup.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    const result = await checkUrlIsSafeToFetch("https://internal.example.com/image.png");
    expect(result.ok).toBe(false);
  });

  it("allows a hostname that resolves to a public address", async () => {
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    const result = await checkUrlIsSafeToFetch("https://example.com/image.png");
    expect(result.ok).toBe(true);
  });

  it("rejects when DNS resolution fails", async () => {
    lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    const result = await checkUrlIsSafeToFetch("https://does-not-exist.invalid/image.png");
    expect(result.ok).toBe(false);
  });
});
