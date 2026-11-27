import { z } from "zod";

// Photo background adjustments, shared by the editor preview (an SVG colour
// matrix + CSS blur) and the server (sharp recomb + blur on the real photo),
// so the preview matches what is rendered. Every colour change folds into ONE
// 3x3 matrix applied in sRGB:
//   - darken: a black overlay at alpha a, i.e. every channel x (1 - a);
//   - warmth: red up / blue down (or the reverse for cooler);
//   - saturation: the standard luminance-weighted saturate matrix (the same
//     constants SVG feColorMatrix type="saturate" uses).
// Blur is stored relative to the image width, so it looks the same on the
// small preview and the full-size photo.

export type BackgroundAdjust = {
  // Black overlay strength, 0 to 70 (%).
  darken: number;
  // -100 (cooler) to 100 (warmer).
  warmth: number;
  // Colour intensity, 0 (greyscale) to 150 (%); 100 is unchanged.
  saturation: number;
  // 0 to 10; the blur radius is (blur / 1000) x the image width.
  blur: number;
};

export const DEFAULT_ADJUST: BackgroundAdjust = { darken: 0, warmth: 0, saturation: 100, blur: 0 };

export const backgroundAdjustSchema = z
  .object({
    darken: z.number().int().min(0).max(70),
    warmth: z.number().int().min(-100).max(100),
    saturation: z.number().int().min(0).max(150),
    blur: z.number().min(0).max(10),
  })
  .strict();

export function isDefaultAdjust(a: BackgroundAdjust | null | undefined): boolean {
  return !a || (a.darken === 0 && a.warmth === 0 && a.saturation === 100 && a.blur === 0);
}

// Reads a stored JSON value defensively: anything invalid counts as no adjustment.
export function readAdjust(value: unknown): BackgroundAdjust | null {
  const parsed = backgroundAdjustSchema.safeParse(value);
  return parsed.success && !isDefaultAdjust(parsed.data) ? parsed.data : null;
}

// Stable cache key for an adjusted copy.
export function adjustKey(a: BackgroundAdjust): string {
  return `d${a.darken}-w${a.warmth}-s${a.saturation}-b${a.blur}`;
}

// Luminance weights used by SVG feColorMatrix type="saturate".
const LR = 0.213;
const LG = 0.715;
const LB = 0.072;
// Strongest warmth shifts red/blue by this fraction.
const WARMTH_MAX = 0.2;

type Matrix3 = [[number, number, number], [number, number, number], [number, number, number]];

// Row i gives output channel i (R, G, B) as a mix of the input channels.
export function colourMatrix(a: BackgroundAdjust): Matrix3 {
  const s = a.saturation / 100;
  const sat: Matrix3 = [
    [LR + (1 - LR) * s, LG - LG * s, LB - LB * s],
    [LR - LR * s, LG + (1 - LG) * s, LB - LB * s],
    [LR - LR * s, LG - LG * s, LB + (1 - LB) * s],
  ];
  const w = (a.warmth / 100) * WARMTH_MAX;
  const channelScale = [1 + w, 1, 1 - w];
  const dark = 1 - a.darken / 100;
  return sat.map((row, i) => row.map((v) => v * channelScale[i] * dark)) as Matrix3;
}

// feColorMatrix type="matrix" values: 4x5 row-major (RGBA, plus offset).
export function svgColourMatrixValues(a: BackgroundAdjust): string {
  const m = colourMatrix(a);
  const r = (n: number) => Number(n.toFixed(5));
  return [...m.map((row) => [...row.map(r), 0, 0]), [0, 0, 0, 1, 0]].map((row) => row.join(" ")).join(" ");
}

export function blurSigma(a: BackgroundAdjust, imageWidth: number): number {
  return (a.blur / 1000) * imageWidth;
}

// The same adjustment as an ffmpeg -vf chain for video backgrounds: bound the
// long edge to 1920, blur (width-relative, like photos), then the same colour
// matrix via colorchannelmixer (rr = row R / column R, and so on), in RGB.
export function ffmpegVideoFilter(a: BackgroundAdjust, width: number, height: number): string {
  const scale = Math.min(1, 1920 / Math.max(width, height));
  // Even dimensions, as yuv420p output requires.
  const w = Math.max(2, Math.round((width * scale) / 2) * 2);
  const h = Math.max(2, Math.round((height * scale) / 2) * 2);
  const steps = [`scale=${w}:${h}:flags=bicubic`];
  const sigma = blurSigma(a, w);
  if (sigma >= 0.3) steps.push(`gblur=sigma=${sigma.toFixed(2)}`);
  const m = colourMatrix(a);
  const f = (n: number) => n.toFixed(5);
  steps.push(
    "format=gbrp",
    `colorchannelmixer=rr=${f(m[0][0])}:rg=${f(m[0][1])}:rb=${f(m[0][2])}:gr=${f(m[1][0])}:gg=${f(m[1][1])}:gb=${f(m[1][2])}:br=${f(m[2][0])}:bg=${f(m[2][1])}:bb=${f(m[2][2])}`,
    "format=yuv420p",
  );
  return steps.join(",");
}
