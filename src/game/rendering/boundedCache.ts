/**
 * Bounded insertion-order cache for deterministic renderer data.
 * Independent of React, world generation, and the application entry point.
 */
export function createBoundedCache<K, V>(maxEntries: number) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError('maxEntries must be a positive integer');
  }
  const entries = new Map<K, V>();
  return {
    get(key: K): V | undefined {
      return entries.get(key);
    },
    set(key: K, value: V): V {
      entries.set(key, value);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
      return value;
    },
    get size(): number {
      return entries.size;
    },
    clear(): void {
      entries.clear();
    },
  };
}
