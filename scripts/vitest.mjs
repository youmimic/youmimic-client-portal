// Starts vitest from a drive-letter-normalised working directory.
//
// On Windows a terminal can open in "d:\..." while Node resolves modules as
// "D:\...". Vitest then loads two copies of itself and every suite fails
// with "Cannot read properties of undefined (reading 'config')". The fix has
// to happen before vitest starts, so it can't live in vitest.config.mts.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const upperDrive = (p) => (process.platform === "win32" ? p.replace(/^[a-z]:/, (drive) => drive.toUpperCase()) : p);
const vitestBin = upperDrive(path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs"));
const cwd = upperDrive(process.cwd());

const result = spawnSync(process.execPath, [vitestBin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(result.status ?? 1);
