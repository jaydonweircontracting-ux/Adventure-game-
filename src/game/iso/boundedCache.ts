/**
 * Small bounded insertion-order cache for deterministic render data.
 *
 * Keep this module independent of React and world-generation code so render
 * systems can share the cache policy without importing the app entry point.
 * Eviction is oldest-inserted-first; cache hits do not mutate ordering.
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
