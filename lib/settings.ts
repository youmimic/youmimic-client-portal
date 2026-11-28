import { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";

// Admin-controlled switches stored in app_settings. Each key has a fixed type
// and a safe default, used whenever the row is missing or holds the wrong type.
const DEFAULTS = {
  // Launch switch: while off, only admins see and can use custom avatar
  // backgrounds (so they can be tried on the live site quietly).
  backgroundsForClients: false,
  // While on, every look that becomes ready is queued for a cut-out preview
  // automatically (lib/backgrounds/cutouts.ts).
  autoCutouts: false,
} as const;

export type SettingKey = keyof typeof DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof DEFAULTS)[K] extends boolean ? boolean : never;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } }).catch(() => null);
  const value = row?.value;
  return (typeof value === typeof DEFAULTS[key] ? value : DEFAULTS[key]) as SettingValue<K>;
}

export async function getSettings(): Promise<{ [K in SettingKey]: SettingValue<K> }> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.keys(DEFAULTS) } } }).catch(() => []);
  const out = { ...DEFAULTS } as { [K in SettingKey]: SettingValue<K> };
  for (const r of rows) {
    const key = r.key as SettingKey;
    if (typeof r.value === typeof DEFAULTS[key]) (out as Record<string, unknown>)[key] = r.value;
  }
  return out;
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>, updatedById: string | null): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedById },
    update: { value: value as Prisma.InputJsonValue, updatedById },
  });
}

export const SETTING_KEYS = Object.keys(DEFAULTS) as SettingKey[];
