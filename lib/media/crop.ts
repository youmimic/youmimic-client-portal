// Pure crop-box math — no I/O, so it's unit-tested directly (see
// crop.test.ts) separately from the route that actually fetches/crops/
// uploads an image.

export function parseAspectRatio(aspectRatio: string): number | null {
  const match = /^(\d+):(\d+)$/.exec(aspectRatio.trim());
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!w || !h) return null;
  return w / h;
}

export type CropBox = { left: number; top: number; width: number; height: number };

// Largest box matching targetRatio that fits inside the source image,
// centered on the chosen focal point (0-1 normalized) and clamped so it
// never runs outside the source's bounds. Never upscales — the result is
// always the same resolution or smaller than the source.
export function computeCropBox(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: number,
  focusX: number,
  focusY: number,
): CropBox {
  const sourceRatio = sourceWidth / sourceHeight;

  let width: number;
  let height: number;
  if (sourceRatio > targetRatio) {
    height = sourceHeight;
    width = Math.round(sourceHeight * targetRatio);
  } else {
    width = sourceWidth;
    height = Math.round(sourceWidth / targetRatio);
  }
  width = Math.min(width, sourceWidth);
  height = Math.min(height, sourceHeight);

  const clampedFocusX = Math.min(Math.max(focusX, 0), 1);
  const clampedFocusY = Math.min(Math.max(focusY, 0), 1);

  const idealLeft = clampedFocusX * sourceWidth - width / 2;
  const idealTop = clampedFocusY * sourceHeight - height / 2;

  const left = Math.round(Math.min(Math.max(idealLeft, 0), sourceWidth - width));
  const top = Math.round(Math.min(Math.max(idealTop, 0), sourceHeight - height));

  return { left, top, width, height };
}
