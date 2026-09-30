// Debug world editor (BUILD 274): user-placed objects (houses, trees, rocks,
// roads) and removal flags. Pure helpers live here so scripts/simulate.ts can
// unit-test them without importing the React app.

export type EditorPlaceKind = 'house' | 'tree' | 'pine' | 'rock' | 'roadH' | 'roadV';
export type PlacedObject = { id: string; kind: EditorPlaceKind; x: number; y: number; chunk: string };
// Items flagged for removal: generated trees/houses the user marked, placed
// objects, and map-builder painted tiles. The removal list is copied to the
// clipboard for the dev.
export type FlaggedItem = { id: string; kind: 'tree' | 'house' | 'placed' | 'paint'; label: string; x: number; y: number; chunk: string };
// Solid footprint for the module-level collision check (roads are walkable).
export type EditorSolid = { chunk: string; x: number; y: number; w: number; h: number };

// Solid footprint (field units, centered on x,y) for each placeable kind.
export function editorSolidSize(kind: EditorPlaceKind): { w: number; h: number } | null {
  switch (kind) {
    case 'house': return { w: 13, h: 9 };
    case 'tree': return { w: 4.5, h: 5 };
    case 'pine': return { w: 6, h: 7 };
    case 'rock': return { w: 5, h: 4 };
    default: return null; // roads are walkable
  }
}

export function editorPlaceObject(objects: PlacedObject[], kind: EditorPlaceKind, x: number, y: number, chunk: string): PlacedObject[] {
  const id = 'placed-' + Math.round(x * 10) + '-' + Math.round(y * 10) + '-' + objects.length + '-' + (Date.now() % 100000);
  return [...objects, { id, kind, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, chunk }];
}

export function editorToggleFlag(flags: FlaggedItem[], item: FlaggedItem): FlaggedItem[] {
  return flags.some((f) => f.id === item.id) ? flags.filter((f) => f.id !== item.id) : [...flags, item];
}

export function editorSolidsFor(objects: PlacedObject[]): EditorSolid[] {
  return objects.flatMap((o) => {
    const size = editorSolidSize(o.kind);
    return size ? [{ chunk: o.chunk, x: o.x, y: o.y, w: size.w, h: size.h }] : [];
  });
}

// BUILD 305: generated trees/rocks deleted via the Erase tool, keyed by
// chunk ("x,y") -> generated tree ids. Ids are deduped per chunk.
export type DeletedGenTrees = Record<string, number[]>;

export function editorDeleteGenTree(deleted: DeletedGenTrees, chunkKey: string, treeId: number): DeletedGenTrees {
  const existing = deleted[chunkKey] ?? [];
  if (existing.includes(treeId)) return deleted;
  return { ...deleted, [chunkKey]: [...existing, treeId] };
}

export function editorRestoreGenTrees(deleted: DeletedGenTrees, chunkKey: string): DeletedGenTrees {
  if (!(chunkKey in deleted)) return deleted;
  const next = { ...deleted };
  delete next[chunkKey];
  return next;
}

// BUILD 305: split flagged items into the concrete deletions the
// "Delete flagged" button performs (generated houses can't be deleted).
// BUILD 352: painted map-builder tiles are flaggable too.
export function editorFlaggedDeletions(flags: FlaggedItem[], chunkKey: string): { placedIds: string[]; treeIds: number[]; paintKeys: Array<{ tx: number; ty: number }> } {
  const here = flags.filter((f) => f.chunk === chunkKey);
  const placedIds = here.filter((f) => f.kind === 'placed').map((f) => f.id);
  const treeIds = here
    .filter((f) => f.kind === 'tree')
    .map((f) => parseInt(f.id.split('-').pop() || '', 10))
    .filter((n) => !isNaN(n));
  const paintKeys = here
    .filter((f) => f.kind === 'paint')
    .map((f) => {
      const parts = f.id.split('-');
      const ty = parseInt(parts.pop() || '', 10);
      const tx = parseInt(parts.pop() || '', 10);
      return { tx, ty };
    })
    .filter((k) => !isNaN(k.tx) && !isNaN(k.ty));
  return { placedIds, treeIds, paintKeys };
}

export function editorRemovalList(flags: FlaggedItem[]): string {
  if (flags.length === 0) return 'REMOVE: (nothing flagged)';
  return 'REMOVE:\n' + flags.map((f) => f.kind + ' "' + f.label + '" at (' + f.x.toFixed(1) + ', ' + f.y.toFixed(1) + ') chunk ' + f.chunk).join('\n');
}

// BUILD 353: persistent red ✕ markers. A marker pins a chunk + coordinate the
// user flagged as "needs fixing / I deleted something here", so no requested
// change gets missed. Rendered as a red ✕ badge in the world editor.
// Pure helpers (localStorage + React state live in App.tsx).
export type EditorXMark = { id: string; chunk: string; x: number; y: number };

export function editorAddXMark(marks: EditorXMark[], chunk: string, x: number, y: number): EditorXMark[] {
  const id = 'xmark-' + chunk.replace(',', '-') + '-' + Math.round(x * 10) + '-' + Math.round(y * 10) + '-' + Date.now().toString(36);
  return [...marks, { id, chunk, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }];
}

export function editorRemoveXMark(marks: EditorXMark[], id: string): EditorXMark[] {
  return marks.filter((m) => m.id !== id);
}

export function editorXMarksFor(marks: EditorXMark[], chunk: string): EditorXMark[] {
  return marks.filter((m) => m.chunk === chunk);
}

// BUILD 353: editor change log. Every editor mutation (stamp, erase, flag,
// move, paint, clear, undo, marker) appends an entry so the user can open the
// log in the debug panel, screenshot it, or copy it as text. Capped so the
// persisted log can't grow unbounded.
export type EditorLogEntry = { t: number; build: string; action: string; detail: string; chunk: string; x?: number; y?: number };
export const EDITOR_LOG_MAX = 300;

export function editorAppendLog(log: EditorLogEntry[], entry: Omit<EditorLogEntry, 't'>): EditorLogEntry[] {
  const next = [...log, { ...entry, t: Date.now() }];
  return next.length > EDITOR_LOG_MAX ? next.slice(next.length - EDITOR_LOG_MAX) : next;
}

export function editorLogText(log: EditorLogEntry[]): string {
  if (log.length === 0) return 'EDITOR CHANGE LOG: (no entries yet)';
  return 'EDITOR CHANGE LOG:\n' + log.map((e) => {
    const d = new Date(e.t);
    const ts = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    const pos = (typeof e.x === 'number' && typeof e.y === 'number') ? ' @(' + e.x.toFixed(1) + ',' + e.y.toFixed(1) + ')' : '';
    return ts + ' | build ' + e.build + ' | ' + e.action + ' | chunk ' + e.chunk + pos + ' | ' + e.detail;
  }).join('\n');
}
