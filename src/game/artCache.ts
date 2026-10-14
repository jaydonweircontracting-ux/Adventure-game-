// Art cache-busting (BUILD 690). Files under public/ are copied to dist
// WITHOUT content hashing, so their URLs never change between builds — iOS
// Safari caches them aggressively and can show stale sprites (e.g. the
// pre-689 unflipped door art). Appending ?v=<build> to art URLs forces a
// refetch on every build. Use for public/ image assets only; code bundles
// already have content hashes.
export function artUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  const build =
    (typeof window !== 'undefined' &&
      (window as unknown as { __AG_BUILD?: string }).__AG_BUILD) || '690';
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}v=${build}`;
}
