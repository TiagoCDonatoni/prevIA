export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickVariant<T>(items: T[], seed: string, maxVariants: number): T {
  if (!items.length) {
    throw new Error("pickVariant requires at least one item");
  }

  const capped = items.slice(0, Math.max(1, Math.min(items.length, maxVariants)));
  const idx = stableHash(seed) % capped.length;
  return capped[idx] as T;
}