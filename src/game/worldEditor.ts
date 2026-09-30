// Debug world editor (BUILD 274): user-placed objects (houses, trees, rocks,
// roads) and removal flags. Pure helpers live here so scripts/simulate.ts can
// unit-test them without importing the React app.

export type EditorPlaceKind = 'house' | 'tree' | 'pine' | 'rock' | 'roadH' | 'roadV';
export type PlacedObject = { id: string; kind: EditorPlaceKind; x: number; y: number; chunk: string };
// Items flagged for removal: generated trees/houses the user marked, plus
// placed objects. The removal list is copied to the clipboard for the dev.
export type FlaggedItem = { id: string; kind: 'tree' | 'house' | 'placed'; label: string; x: number; y: number; chunk: string };
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

export function editorRemovalList(flags: FlaggedItem[]): string {
  if (flags.length === 0) return 'REMOVE: (nothing flagged)';
  return 'REMOVE:\n' + flags.map((f) => f.kind + ' "' + f.label + '" at (' + f.x.toFixed(1) + ', ' + f.y.toFixed(1) + ') chunk ' + f.chunk).join('\n');
}
