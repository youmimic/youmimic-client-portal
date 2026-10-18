import dns from "dns/promises";
import net from "net";

// Guards against SSRF when this app fetches a URL *supplied by the user*
// (see app/api/dashboard/media/crop-image/route.ts) — without this, "crop
// this image" would let anyone make our server issue a request to any host,
// including internal/private infrastructure. Checking the resolved IP, not
// just the hostname string, matters: a hostname denylist alone is
// bypassable via DNS (nothing stops "evil.example.com" from resolving to
// 169.254.169.254).
const PRIVATE_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // shared address space (CGNAT)
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, including cloud metadata endpoints
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const target = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (target & mask) === (ipv4ToInt(base) & mask);
  });
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" || // loopback
    normalized === "::" ||
    normalized.startsWith("fe80:") || // link-local
    normalized.startsWith("fc") || // unique local fc00::/7
    normalized.startsWith("fd")
  );
}

export type UrlSafetyResult = { ok: true } | { ok: false; error: string };

// Resolves the hostname and rejects anything pointing at private, loopback,
// link-local, or cloud-metadata address space. Only http/https are allowed.
export async function checkUrlIsSafeToFetch(rawUrl: string): Promise<UrlSafetyResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Not a valid URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http/https links are supported." };
  }

  const hostname = parsed.hostname;

  // A literal IP in the URL — net.isIP tells us which family to check
  // without a DNS round trip.
  const literalFamily = net.isIP(hostname);
  if (literalFamily === 4) {
    if (isPrivateIpv4(hostname)) return { ok: false, error: "That address isn't reachable." };
    return { ok: true };
  }
  if (literalFamily === 6) {
    if (isPrivateIpv6(hostname)) return { ok: false, error: "That address isn't reachable." };
    return { ok: true };
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    return { ok: false, error: "Couldn't resolve that host." };
  }

  if (addresses.length === 0) {
    return { ok: false, error: "Couldn't resolve that host." };
  }

  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateIpv4(address)) return { ok: false, error: "That address isn't reachable." };
    if (family === 6 && isPrivateIpv6(address)) return { ok: false, error: "That address isn't reachable." };
  }

  return { ok: true };
}
