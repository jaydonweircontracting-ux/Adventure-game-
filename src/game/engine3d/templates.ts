// BUILD 996 — named chunk templates ("build templates") for the 3D
// mode Build tool. Pure module: no React, no WebGL. The 3D view owns
// the UI; this file owns the template rules so they can be asserted
// standalone.
//
// A chunk is a NAMED rectangle of ground saved from the world. It
// captures PLACED items only, with coordinates relative to the
// rectangle's min corner (its origin). Generated items inside the
// rectangle are NOT captured in V1: they regenerate from layout, and
// capturing them would need moved-set semantics (the same reason 995
// leaves generated items unmovable) — that is the follow-up, not a
// silent partial capture. An item is captured only when its WHOLE
// rect lies inside the selection rect; a house straddling the edge is
// left out rather than clipped, because a clipped house is not a house.
//
// Pasting stamps the chunk at a ground anchor: the chunk's origin
// corner lands on the tapped tile, and every item lands at
// anchor + relative offset. PASTE RULE (one rule, stated plainly):
// each item is validated with the NORMAL placement rules
// (validatePlacement) against the world as it stands — including items
// already landed by this same paste — and invalid items are SKIPPED
// individually, never refusing the whole paste. The caller reports
// landed vs skipped, so a paste onto a half-blocked area still lands
// everything that fits. A paste is ONE undo entry (the `paste` entry
// in placements.ts): one Undo removes the whole pasted chunk, one
// Redo re-pastes it. Saving a chunk is NOT a world change and is NOT
// an undo entry; deleting a chunk is not one either.
//
// Templates persist in localStorage under TEMPLATES_KEY, separate
// from world saves (iso-world-v2) and player/NPC saves. Old worlds
// load with no templates (empty list), never corrupted. Templates
// are free: no cost gating, like every other Build-panel action.

import type { IsoWorld, PlacedItem } from '../iso/isoWorld';
import { addPlacement, housePlacementKind, isHouseKind, placementsOf, validatePlacement, HOUSE_VARIANT_KINDS, type PaletteKind, type Rotation } from './placements';
import { validateCustomPlacement, type CustomAsset } from './customAssets';

/** localStorage key for saved chunks. Versioned (v1); separate from
 *  the world save so a world reset never wipes the user's library. */
export const TEMPLATES_KEY = 'ag-3d-templates-v1';

/** One placed item inside a chunk, rect relative to the chunk origin
 *  (the selection rect's min corner). rx0/ry0 is the item's min tile,
 *  rx1/ry1 its max tile, both >= 0 for a well-formed chunk.
 *  BUILD 1036: rot rides along (house/stall only, absent = 0) so a
 *  rotated house pastes with its door on the same face it was saved
 *  with — paste validates with the rotation, and the shape guard
 *  compares against the rotated rect.
 *  BUILD 1041: a chunk carries no growth state — a captured farm
 *  tile pastes as a FRESH planting (the view stamps farmPlantedAt
 *  at paste time), never as the growth stage it was captured at.
 *  BUILD 1048: a captured custom item carries its assetId (+ rot,
 *  like a house) — paste validates it through
 *  validateCustomPlacement against the live library, and skips it
 *  with a reason when the model is no longer in the library. */
export type ChunkItem = { kind: PaletteKind | 'custom'; rx0: number; ry0: number; rx1: number; ry1: number; rot?: Rotation; assetId?: string };

/** A saved chunk: a name plus its captured items, in source list
 *  order (so a path-before-grass stack pastes in the same order it
 *  was placed, which the grass rule needs). */
export type ChunkTemplate = { name: string; items: ChunkItem[] };

/** Every kind captureChunk can emit (see captureChunk below): the
 *  eight base placed kinds plus every house variant. BUILD 1029:
 *  the variant tail is derived from HOUSE_VARIANT_KINDS (placements
 *  .ts) instead of hand-listed — the 1015 gap was exactly this drift:
 *  the three commercial buildings ('house-inn' / 'house-smith' /
 *  'house-store') joined the palette and the Build menu but were
 *  never added here, so validChunkItem silently dropped them on load
 *  and a saved chunk holding one came back empty. Deriving the tail
 *  means a future variant cannot be forgotten the same way.
 *  'custom' is here since BUILD 1048: captureChunk emits it (with
 *  its assetId), so a saved chunk holding an imported model comes
 *  back whole. Before 1048 it was deliberately NOT here (BUILD 997),
 *  because paste validated through the built-in kinds only. */
const PALETTE_KINDS: Array<PaletteKind | 'custom'> = ['path', 'house', 'tree', 'stall', 'grass', 'rock', 'water', 'wall', 'lantern', 'bush', 'ore', 'bridge', 'farm', 'fence', 'custom', ...HOUSE_VARIANT_KINDS];

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && Math.floor(n) === n;
}

/** Validate one parsed chunk item; null when malformed. Bounds are
 *  lenient (a chunk's relative coords never exceed the 200-tile map,
 *  but a future map could be bigger) — only shape is enforced. */
export function validChunkItem(raw: unknown): ChunkItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== 'string' || !(PALETTE_KINDS as string[]).includes(r.kind)) return null;
  if (!isInt(r.rx0) || !isInt(r.ry0) || !isInt(r.rx1) || !isInt(r.ry1)) return null;
  if ((r.rx0 as number) > (r.rx1 as number) || (r.ry0 as number) > (r.ry1 as number)) return null;
  if (Math.abs(r.rx0 as number) > 400 || Math.abs(r.ry0 as number) > 400 || Math.abs(r.rx1 as number) > 400 || Math.abs(r.ry1 as number) > 400) return null;
  // BUILD 1036: rot is optional (absent = 0, the old chunks); when
  // present it must be an integer quarter-turn 0–3.
  let rot: Rotation | undefined;
  if (r.rot !== undefined) {
    if (!isInt(r.rot) || (r.rot as number) < 0 || (r.rot as number) > 3) return null;
    rot = r.rot as Rotation;
  }
  // BUILD 1048: a custom chunk item must name its model — a chunk
  // item with kind 'custom' and no assetId is malformed (it could
  // never paste, because paste looks the model up by id). Other
  // kinds never carry one.
  let assetId: string | undefined;
  if (r.kind === 'custom') {
    if (typeof r.assetId !== 'string' || (r.assetId as string).length === 0) return null;
    assetId = r.assetId as string;
  }
  return { kind: r.kind as ChunkItem['kind'], rx0: r.rx0 as number, ry0: r.ry0 as number, rx1: r.rx1 as number, ry1: r.ry1 as number, ...(rot !== undefined ? { rot } : {}), ...(assetId !== undefined ? { assetId } : {}) };
}

/** Load saved chunks. Malformed entries are dropped, never fatal:
 *  a corrupt template store degrades to an empty library, never a
 *  broken Build panel. Templates with zero usable items are dropped
 *  (the save path never creates one). */
export function loadTemplates(): ChunkTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ChunkTemplate[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.name !== 'string' || e.name.trim().length === 0) continue;
      if (!Array.isArray(e.items)) continue;
      const items: ChunkItem[] = [];
      for (const it of e.items) {
        const v = validChunkItem(it);
        if (v) items.push(v);
      }
      if (items.length === 0) continue;
      out.push({ name: e.name.slice(0, 60), items });
    }
    return out;
  } catch {
    return [];
  }
}

/** Persist the chunk library. Failures are swallowed (quota, private
 *  mode): the in-memory library still works for the session. */
export function saveTemplates(templates: ChunkTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    /* ignore */
  }
}

/** A name that does not collide with any existing template name.
 *  Empty/blank input becomes 'Chunk N' (N = library size + 1); a
 *  taken name gains ' 2', ' 3', ... — saving never silently
 *  overwrites a chunk and never refuses. */
export function uniquifyName(existing: string[], base: string): string {
  const trimmed = base.trim();
  const stem = trimmed.length > 0 ? trimmed.slice(0, 60) : 'Chunk ' + (existing.length + 1);
  if (!existing.includes(stem)) return stem;
  let n = 2;
  while (existing.includes(stem + ' ' + n)) n++;
  return stem + ' ' + n;
}

/** Capture the placed items fully inside a selection rect, as chunk
 *  items relative to the rect's min corner. The rect is normalized
 *  (drag direction does not matter). Generated content is never
 *  captured — only w.placements is scanned. BUILD 1048: custom-upload
 *  items ARE captured now, with their assetId (+ rot, like a house) —
 *  paste validates them against the live library, so a chunk holding
 *  an imported model round-trips exactly as long as the model is
 *  still in the library, and skips honestly when it is not. BUILD
 *  1012: a placed house is captured under its own kind (variant kind,
 *  or legacy 'house') — the kind IS the variant, so no separate
 *  variant field is needed and paste reconstructs the design through
 *  validatePlacement. BUILD 1036: a rotated house/stall captures its
 *  rot, so paste reproduces the door face (a 90° cottage pastes as a
 *  3x4 with its door west, not as a 4x3 with its door south). */
export function captureChunk(w: IsoWorld, rect: { x0: number; y0: number; x1: number; y1: number }): ChunkItem[] {
  const x0 = Math.min(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y1 = Math.max(rect.y0, rect.y1);
  const out: ChunkItem[] = [];
  for (const p of placementsOf(w)) {
    if (p.x0 >= x0 && p.y0 >= y0 && p.x1 <= x1 && p.y1 <= y1) {
      if (p.kind === 'custom') {
        // BUILD 1048: a custom item without an assetId cannot paste
        // (paste looks the model up by id), so it is never captured
        // — the save preview count stays honest.
        if (!p.assetId) continue;
        out.push({ kind: 'custom', rx0: p.x0 - x0, ry0: p.y0 - y0, rx1: p.x1 - x0, ry1: p.y1 - y0, ...(p.rot !== undefined ? { rot: p.rot } : {}), assetId: p.assetId });
        continue;
      }
      out.push({ kind: p.kind === 'house' ? housePlacementKind(p) : p.kind, rx0: p.x0 - x0, ry0: p.y0 - y0, rx1: p.x1 - x0, ry1: p.y1 - y0, ...(p.rot !== undefined && (p.kind === 'house' || p.kind === 'stall') ? { rot: p.rot } : {}) });
    }
  }
  return out;
}

/** The tap tile validatePlacement needs for an item whose pasted rect
 *  is known: house (legacy or any variant kind) = rect centre, stall
 *  = west tile, everything else = the rect's min tile. This is the
 *  same anchor math placing and moving already use, so a validated
 *  paste reproduces the stored rect exactly — and the caller asserts
 *  that below. */
function pasteTapTile(kind: PaletteKind, nx0: number, ny0: number, nx1: number, ny1: number): { x: number; y: number } {
  if (isHouseKind(kind)) return { x: Math.round((nx0 + nx1) / 2), y: Math.round((ny0 + ny1) / 2) };
  return { x: nx0, y: ny0 };
}

/** Paste a chunk at an anchor tile: the chunk's origin corner lands
 *  on the anchor, every item at anchor + relative offset. Each item
 *  is validated with the normal placement rules against the live
 *  world (including items this paste already landed) and skipped
 *  individually on failure — the paste never refuses wholesale.
 *  Landed items are appended to w.placements in template order.
 *  BUILD 1048: a custom item is validated through
 *  validateCustomPlacement against `customAssets` (the live library
 *  — id + footprint is all paste needs); when the model is not in
 *  the library it is skipped with a reason, never pasted blind and
 *  never silently dropped. A caller that passes no library gets
 *  that same skip for every custom item, honestly. Returns exactly
 *  what landed (the undo entry's contents) and what was skipped
 *  with the placement rule's reason. */
export function pasteChunk(
  w: IsoWorld,
  template: ChunkTemplate,
  anchor: { x: number; y: number },
  playerTile: { x: number; y: number },
  npcTiles: Array<{ x: number; y: number }>,
  customAssets?: Array<Pick<CustomAsset, 'id' | 'width' | 'height'>>,
): { landed: PlacedItem[]; skipped: Array<{ item: ChunkItem; reason: string }> } {
  const landed: PlacedItem[] = [];
  const skipped: Array<{ item: ChunkItem; reason: string }> = [];
  for (const ci of template.items) {
    const nx0 = anchor.x + ci.rx0;
    const ny0 = anchor.y + ci.ry0;
    const nx1 = anchor.x + ci.rx1;
    const ny1 = anchor.y + ci.ry1;
    if (ci.kind === 'custom') {
      const asset = (customAssets ?? []).find((a) => a.id === ci.assetId);
      if (!asset) {
        skipped.push({ item: ci, reason: 'that model is no longer in your library' });
        continue;
      }
      const res = validateCustomPlacement(w, asset, nx0, ny0, playerTile, npcTiles, ci.rot ?? 0);
      if (!res.ok) {
        skipped.push({ item: ci, reason: res.reason });
        continue;
      }
      if (res.item.x0 !== nx0 || res.item.y0 !== ny0 || res.item.x1 !== nx1 || res.item.y1 !== ny1) {
        skipped.push({ item: ci, reason: 'shape mismatch' });
        continue;
      }
      addPlacement(w, res.item);
      landed.push(res.item);
      continue;
    }
    const tap = pasteTapTile(ci.kind, nx0, ny0, nx1, ny1);
    // BUILD 1036: paste validates with the captured rotation, so a
    // rotated house lands with its door on the saved face — and the
    // shape guard below compares against the rotated rect.
    const res = validatePlacement(w, ci.kind, tap.x, tap.y, playerTile, npcTiles, ci.rot ?? 0);
    if (!res.ok) {
      skipped.push({ item: ci, reason: res.reason });
      continue;
    }
    // Guard against anchor-math drift: the validated item must be
    // exactly the target rect, or the paste is not reproducing the
    // chunk the user saved. A mismatch skips, never lands wrong.
    if (res.item.x0 !== nx0 || res.item.y0 !== ny0 || res.item.x1 !== nx1 || res.item.y1 !== ny1) {
      skipped.push({ item: ci, reason: 'shape mismatch' });
      continue;
    }
    addPlacement(w, res.item);
    landed.push(res.item);
  }
  return { landed, skipped };
}
