// Scene ordering helpers. Positions are plain 0-based integers that get
// renumbered as a whole whenever the order changes. At the 20-scene cap that
// is cheap and avoids gaps or fractional ranks.

export function isPermutation(current: readonly string[], next: readonly string[]): boolean {
  if (current.length !== next.length) return false;
  const seen = new Set(next);
  return seen.size === next.length && current.every((id) => seen.has(id));
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  const clamped = Math.max(0, Math.min(items.length - 1, to));
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(clamped, 0, moved);
  return copy;
}

export function insertAfter<T>(items: readonly T[], afterIndex: number | null, item: T): T[] {
  const copy = [...items];
  const at = afterIndex === null || afterIndex < 0 ? copy.length : Math.min(afterIndex + 1, copy.length);
  copy.splice(at, 0, item);
  return copy;
}
