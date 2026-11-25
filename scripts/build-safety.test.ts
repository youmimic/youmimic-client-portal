import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards against database migrations creeping back into any build path.
// Application builds (npm run build, Vercel, CI) must only compile; the
// production database is migrated only by the manually started, confirmed
// .github/workflows/prisma-migrate-prod.yml. See docs/migrations.md.

const root = path.resolve(import.meta.dirname, "..");
const DB_CHANGING = /prisma\s+(migrate\s+(deploy|dev|reset|resolve)|db\s+(push|execute|seed))/i;

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };

// Scripts npm or Vercel run implicitly around installs and builds.
const IMPLICIT = [
  "preinstall", "install", "postinstall", "prepare", "prepublish", "prepack", "postpack",
  "prebuild", "build", "postbuild", "vercel-build", "prestart", "start", "poststart", "predev", "dev",
];

// Every script reachable from the implicit ones through `npm run <name>`.
function reachableScripts(): string[] {
  const seen = new Set<string>();
  const queue = IMPLICIT.filter((s) => pkg.scripts[s]);
  while (queue.length) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const m of pkg.scripts[name].matchAll(/npm\s+run(?:-script)?\s+([\w:.-]+)/g)) {
      if (pkg.scripts[m[1]]) queue.push(m[1]);
    }
  }
  return [...seen];
}

// The top-level `on:` block of a workflow, as raw lines.
function triggerBlock(yaml: string): string {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^on:\s*(#.*)?$/.test(l) || /^"?on"?:/.test(l));
  if (start === -1) return "";
  const block = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // next top-level key
    block.push(line);
  }
  return block.join("\n");
}

describe("build safety: no build path migrates a database", () => {
  it("the build script only generates the Prisma client and compiles", () => {
    expect(pkg.scripts.build).toBe("prisma generate && next build");
  });

  it("no script run implicitly by npm or Vercel (or reachable from one) changes a database", () => {
    for (const name of reachableScripts()) {
      expect(pkg.scripts[name], `script "${name}"`).not.toMatch(DB_CHANGING);
    }
  });

  it("vercel.json doesn't override the build or install command with a migration", () => {
    const file = path.join(root, "vercel.json");
    if (!existsSync(file)) return;
    const config = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    for (const key of ["buildCommand", "installCommand", "devCommand"]) {
      if (typeof config[key] === "string") expect(config[key] as string, key).not.toMatch(DB_CHANGING);
    }
  });

  it("any workflow that migrates is manual-only, from main, behind a typed confirmation", () => {
    const dir = path.join(root, ".github", "workflows");
    const migrating = readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => ({ f, text: readFileSync(path.join(dir, f), "utf8") }))
      // Comments and echoed advice (check-prisma-migration.yml prints a
      // "run prisma migrate dev" hint) don't execute anything.
      .filter(({ text }) => text.split(/\r?\n/).some((l) => !/^\s*(#|echo\b)/.test(l) && DB_CHANGING.test(l)));

    expect(migrating.map((m) => m.f)).toEqual(["prisma-migrate-prod.yml"]);
    for (const { f, text } of migrating) {
      const on = triggerBlock(text);
      expect(on, f).toMatch(/workflow_dispatch/);
      expect(on, f).not.toMatch(/\b(push|pull_request|pull_request_target|schedule|workflow_run|release)\s*:/);
      expect(text, f).toMatch(/if:\s*github\.ref == 'refs\/heads\/main' && inputs\.confirm == 'apply production migrations'/);
    }
  });

  it("the CI build step never runs a migrating command", () => {
    const ci = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    for (const line of ci.split(/\r?\n/).filter((l) => !l.trim().startsWith("#"))) {
      expect(line).not.toMatch(DB_CHANGING);
    }
  });
});
