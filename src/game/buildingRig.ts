// Building rig — one authoritative instance record per placed building.
//
// A "rig" ties together everything the engine already knows about a building
// but keeps in separate places: the rect (fieldHouseRects / settlements),
// the doorway (buildingDoorwaysFor / cottageDoorways), the sprite variant
// (cottageVariantForRect / hash assignment), the interior id, and collision.
// The rig does NOT duplicate any of those systems: it is assembled FROM them,
// so the renderer, collision, doors, NPC nav and the audit all agree by
// construction.
//
// Pure module: no React, no App.tsx imports. The assembler takes plain data
// shapes so both the game and scripts/simulate.ts can use it.

import { BUILDING_VARIANTS } from './settlements';

export type FieldRect = { left: number; top: number; right: number; bottom: number };
export type NavPoint = { x: number; y: number };

export type BuildingKind =
  | 'cottage'
  | 'stone-house'
  | 'shop'
  | 'inn-tavern'
  | 'farmhouse'
  | 'civic';

/** Minimal structural shape of a doorway. Compatible with DoorwayLink
 *  (npcNavigation) and Doorway (App.tsx) without importing either. */
export type RigDoorwayInput = {
  id: string;
  /** Field point just outside the door (enter lineup point). */
  exterior: NavPoint;
  /** Interior point just inside the door. */
  interior: NavPoint;
  /** Building footprint rect (field units). */
  rect: FieldRect;
};

/** Audited sprite metadata for public/buildings/*.png.
 *  Dimensions audited 2026-10-13 from the actual PNG files.
 *  Anchor convention matches IsoFieldView: base-center, scaled to fit
 *  the footprint width (BUILD 602). */
export interface BuildingAssetMeta {
  /** Variant key, e.g. 'blue-cottage'. */
  variant: string;
  /** Asset path relative to base, e.g. 'buildings/blue-cottage.png'. */
  file: string;
  /** PNG dimensions in pixels. */
  w: number;
  h: number;
  /** Render anchor convention. */
  anchor: 'base-center';
  /** Building family for variant control. */
  kind: BuildingKind;
}

export const BUILDING_ASSET_META: Record<string, BuildingAssetMeta> = {
  'blue-cottage':  { variant: 'blue-cottage',  file: 'buildings/blue-cottage.png',  w: 2240, h: 1120, anchor: 'base-center', kind: 'cottage' },
  'red-cottage':   { variant: 'red-cottage',   file: 'buildings/red-cottage.png',   w: 2240, h: 1120, anchor: 'base-center', kind: 'cottage' },
  'hut-thatched':  { variant: 'hut-thatched',  file: 'buildings/hut-thatched.png',  w: 1600, h: 1600, anchor: 'base-center', kind: 'cottage' },
  'blue-house':    { variant: 'blue-house',    file: 'buildings/blue-house.png',    w: 2240, h: 1120, anchor: 'base-center', kind: 'stone-house' },
  'starting-house-exterior': { variant: 'starting-house-exterior', file: 'assets/starting-house/interior-build786.jpeg', w: 1596, h: 1024, anchor: 'base-center', kind: 'cottage' },
  'house-timber':  { variant: 'house-timber',  file: 'buildings/house-timber.png',  w: 1920, h: 1280, anchor: 'base-center', kind: 'stone-house' },
  'red-shop':      { variant: 'red-shop',      file: 'buildings/red-shop.png',      w: 2240, h: 1120, anchor: 'base-center', kind: 'shop' },
  'shop-awning':   { variant: 'shop-awning',   file: 'buildings/shop-awning.png',   w: 1920, h: 1280, anchor: 'base-center', kind: 'shop' },
  'tavern':        { variant: 'tavern',         file: 'buildings/tavern.png',        w: 2240, h: 1120, anchor: 'base-center', kind: 'inn-tavern' },
  'inn-large':     { variant: 'inn-large',      file: 'buildings/inn-large.png',     w: 1920, h: 1280, anchor: 'base-center', kind: 'inn-tavern' },
  'gatehouse':     { variant: 'gatehouse',      file: 'buildings/gatehouse.png',     w: 1920, h: 1280, anchor: 'base-center', kind: 'civic' },
  // BUILD 692: new art variants for the engine's roadside filler lots.
  // Doors verified on the south face (left of image, ~38% width) like the
  // flipped 689 set. Dimensions audited from the actual PNG files.
  'green-shop':    { variant: 'green-shop',     file: 'buildings/green-shop.png',     w: 2240, h: 1120, anchor: 'base-center', kind: 'shop' },
  'brick-shop':    { variant: 'brick-shop',     file: 'buildings/brick-shop.png',     w: 2240, h: 1120, anchor: 'base-center', kind: 'shop' },
  'green-cottage': { variant: 'green-cottage',  file: 'buildings/green-cottage.png',  w: 2240, h: 1120, anchor: 'base-center', kind: 'cottage' },
  'stone-cottage': { variant: 'stone-cottage',  file: 'buildings/stone-cottage.png',  w: 2240, h: 1120, anchor: 'base-center', kind: 'cottage' },
  'plaster-house': { variant: 'plaster-house',  file: 'buildings/plaster-house.png',  w: 2240, h: 1120, anchor: 'base-center', kind: 'stone-house' },
  // BUILD 694: storybook civic tower (grey stone, crenellations, orange cone
  // roof). Door painted on the south-west face, left of center (~46% width;
  // the tower body spans 41-59% of the canvas so 38% would fall outside the
  // tower). Dimensions audited from the actual PNG file.
  'story-tower':   { variant: 'story-tower',    file: 'buildings/story-tower.png',    w: 2240, h: 1120, anchor: 'base-center', kind: 'civic' },
  // BUILD 982: Mosslight Bank — dims audited from the actual PNG
  // (baked by scripts/bake-bank-png.py, a faithful drawKenneyHouse
  // port). The bank carries its OWN correct meta; the 5 959 variants
  // still lack meta (the 684 rig crash) — that fix is a separate user
  // decision and is deliberately untouched here.
  'bank':          { variant: 'bank',           file: 'buildings/bank.png',           w: 1138, h: 597, anchor: 'base-center', kind: 'civic' },
};

/** The authoritative per-instance building record. */
export interface BuildingRig {
  /** Unique instance id, e.g. 'cottage-1'. One id per placed building. */
  id: string;
  kind: BuildingKind;
  /** Chunk coords the building lives in. */
  chunk: { x: number; y: number };
  /** Logical footprint in field units. Sprite size is independent. */
  rect: FieldRect;
  /** Sprite variant key into BUILDING_ASSET_META. */
  spriteVariant: string;
  /** Doorway linkage: exterior lineup point, interior point, doorway id. */
  doorwayId: string;
  doorExterior: NavPoint;
  doorInterior: NavPoint;
  /** Interior id to load on enter, e.g. '4-7-building-5'. */
  interiorId: string;
  /** Where the player/NPC appears on exit. Must be walkable. */
  exteriorSpawn: NavPoint;
}

export interface RigAssemblyInput {
  /** Instance id for the rig (caller owns uniqueness). */
  id: string;
  kind: BuildingKind;
  chunk: { x: number; y: number };
  doorway: RigDoorwayInput;
  /** Sprite variant key. */
  spriteVariant: string;
  /** Interior id resolver result for this doorway. */
  interiorId: string | null;
  /** Exit spawn point (usually doorway.exterior pushed clear of the rect). */
  exteriorSpawn: NavPoint;
}

/**
 * Assemble one authoritative rig from the engine's existing sources.
 * Returns the rig plus non-fatal warnings (unknown variant etc.).
 * Never throws on bad input — the audit reports hard failures.
 */
export function assembleBuildingRig(input: RigAssemblyInput): { rig: BuildingRig; warnings: string[] } {
  const warnings: string[] = [];
  const meta = BUILDING_ASSET_META[input.spriteVariant];
  if (!meta) warnings.push(`Unknown sprite variant '${input.spriteVariant}' for rig ${input.id}`);
  const rig: BuildingRig = {
    id: input.id,
    kind: input.kind,
    chunk: { x: input.chunk.x, y: input.chunk.y },
    rect: { ...input.doorway.rect },
    spriteVariant: input.spriteVariant,
    doorwayId: input.doorway.id,
    doorExterior: { ...input.doorway.exterior },
    doorInterior: { ...input.doorway.interior },
    interiorId: input.interiorId ?? '',
    exteriorSpawn: { ...input.exteriorSpawn },
  };
  if (!input.interiorId) warnings.push(`No interior id for rig ${input.id} (doorway ${input.doorway.id})`);
  return { rig, warnings };
}

/** Asset metadata lookup. Returns null for unknown variants (audit flags it). */
export function assetMetaFor(variant: string): BuildingAssetMeta | null {
  return BUILDING_ASSET_META[variant] ?? null;
}

/**
 * Estimated rendered height for a sprite whose width is already projected to
 * screen space. Used by viewport culling so tall buildings are not dropped
 * while their footprint is still off-screen but their roof is visible.
 * Unknown variants use a square bound as a conservative fallback.
 */
export function buildingSpriteHeightForWidth(projectedWidth: number, variant: string): number {
  if (!Number.isFinite(projectedWidth) || projectedWidth <= 0) return 0;
  const meta = assetMetaFor(variant);
  const aspect = meta ? meta.h / meta.w : 1;
  return projectedWidth * aspect;
}

// ---------------------------------------------------------------------------
// Consistency audit — the prompt's 16 checks, adapted to real engine
// capabilities. Each check returns 0+ error strings with file-grade paths.
// ---------------------------------------------------------------------------

export interface RigAuditContext {
  /** Field size in field units (default 280). */
  fieldSize?: number;
  /** Max allowed footprint dimension in field units. */
  maxFootprint?: number;
  /** Resolve an interior id -> true if it loads. Null = skip check 8. */
  interiorResolves?: ((interiorId: string) => boolean) | null;
  /** Optional real pathfinding spot-check: (from, to, obstacles, viaDoor) -> reachable.
   *  viaDoor is passed so the door's own cell is walkable, exactly like the
   *  real pathToDoor (npcNavigation) does. */
  pathExists?: ((from: NavPoint, to: NavPoint, obstacles: FieldRect[],
    viaDoor?: { id: string; exterior: NavPoint }) => boolean) | null;
}

function pointInRect(p: NavPoint, r: FieldRect, margin = 0): boolean {
  return p.x >= r.left - margin && p.x <= r.right + margin && p.y >= r.top - margin && p.y <= r.bottom + margin;
}

function rectsOverlap(a: FieldRect, b: FieldRect, margin = 0): boolean {
  return a.left < b.right + margin && b.left < a.right + margin &&
         a.top < b.bottom + margin && b.top < a.bottom + margin;
}

/**
 * Run the full building consistency audit over a set of rigs.
 * Returns a list of human-readable errors; empty = pass.
 */
export function auditBuildingRigs(rigs: BuildingRig[], ctx: RigAuditContext = {}): string[] {
  const errors: string[] = [];
  const fieldSize = ctx.fieldSize ?? 280;
  const maxFootprint = ctx.maxFootprint ?? 60;

  // 1. Unique instance ids.
  const seen = new Set<string>();
  for (const r of rigs) {
    if (seen.has(r.id)) errors.push(`Duplicate building id '${r.id}'`);
    seen.add(r.id);
  }

  for (const r of rigs) {
    const tag = `Building '${r.id}'`;
    const { rect } = r;
    const w = rect.right - rect.left, h = rect.bottom - rect.top;

    // 2. Footprint within field bounds.
    if (rect.left < 0 || rect.top < 0 || rect.right > fieldSize || rect.bottom > fieldSize) {
      errors.push(`${tag}: rect out of bounds (field ${fieldSize})`);
    }
    // 3. Footprint dimensions sane and within allowed maximum.
    if (!(w > 0 && h > 0)) errors.push(`${tag}: degenerate rect ${w}x${h}`);
    if (w > maxFootprint || h > maxFootprint) {
      errors.push(`${tag}: footprint ${w.toFixed(1)}x${h.toFixed(1)} exceeds max ${maxFootprint}`);
    }
    // 4. Sprite variant is a known catalogued asset.
    if (!(BUILDING_VARIANTS as readonly string[]).includes(r.spriteVariant)) {
      errors.push(`${tag}: sprite variant '${r.spriteVariant}' not in BUILDING_VARIANTS catalog`);
    }
    // 5. Asset metadata exists (file, dimensions, anchor).
    const meta = assetMetaFor(r.spriteVariant);
    if (!meta) {
      errors.push(`${tag}: no asset metadata for variant '${r.spriteVariant}'`);
    } else if (!(meta.w > 0 && meta.h > 0)) {
      errors.push(`${tag}: asset metadata has invalid dimensions`);
    }
    // 6. Door exterior must be at/near the rect edge — never deep inside the
    //    building's own collision footprint (would be unreachable).
    const edgeMargin = 2.5;
    const deepInside = pointInRect(r.doorExterior, {
      left: rect.left + edgeMargin, top: rect.top + edgeMargin,
      right: rect.right - edgeMargin, bottom: rect.bottom - edgeMargin,
    });
    if (deepInside) {
      errors.push(`${tag}: door exterior is deep inside its own footprint (unreachable door)`);
    }
    if (!pointInRect(r.doorExterior, rect, 3)) {
      errors.push(`${tag}: door exterior is not at the building edge`);
    }
    // 7. Door exterior must not be inside ANOTHER building's footprint.
    for (const o of rigs) {
      if (o.id === r.id) continue;
      if (pointInRect(r.doorExterior, o.rect, 0.5)) {
        errors.push(`${tag}: door exterior is inside building '${o.id}' footprint (blocked entrance)`);
      }
    }
    // 8. Interior id resolves (when a resolver is provided).
    if (!r.interiorId) {
      errors.push(`${tag}: missing interior id`);
    } else if (ctx.interiorResolves && !ctx.interiorResolves(r.interiorId)) {
      errors.push(`${tag}: interior id '${r.interiorId}' does not resolve`);
    }
    // 9. Exterior spawn is in bounds and walkable (not inside any footprint).
    if (r.exteriorSpawn.x < 0 || r.exteriorSpawn.y < 0 ||
        r.exteriorSpawn.x > fieldSize || r.exteriorSpawn.y > fieldSize) {
      errors.push(`${tag}: exterior spawn out of bounds`);
    }
    for (const o of rigs) {
      if (pointInRect(r.exteriorSpawn, o.rect, 0.5)) {
        errors.push(`${tag}: exterior spawn is inside building '${o.id}' footprint (would trap player)`);
        break;
      }
    }
    // 10. Kind must be a known family.
    const kinds: BuildingKind[] = ['cottage', 'stone-house', 'shop', 'inn-tavern', 'farmhouse', 'civic'];
    if (!kinds.includes(r.kind)) errors.push(`${tag}: unknown kind '${r.kind}'`);
  }

  // 11. No overlapping footprints between rigs.
  for (let i = 0; i < rigs.length; i++) {
    for (let j = i + 1; j < rigs.length; j++) {
      if (rectsOverlap(rigs[i].rect, rigs[j].rect, 1)) {
        errors.push(`Buildings '${rigs[i].id}' and '${rigs[j].id}' overlap`);
      }
    }
  }

  // 12. NPC navigation spot-check: from each door exterior, an NPC must be
  //     able to walk away from the door in SOME direction without crossing
  //     footprints. Probes the outward normal plus the other three cardinals
  //     (a single fixed probe can land inside a neighboring building even
  //     when the door itself is fine). Uses real pathfinding when provided —
  //     with the doorway passed as viaDoor, exactly like the real pathToDoor —
  //     otherwise a segment-sampling fallback.
  if (rigs.length > 0) {
    const obstacles = rigs.map((r) => r.rect);
    for (const r of rigs) {
      const from = r.doorExterior;
      const rcx = (r.rect.left + r.rect.right) / 2;
      const rcy = (r.rect.top + r.rect.bottom) / 2;
      let ox = from.x - rcx, oy = from.y - rcy;
      const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
      // Outward normal first, then 90° rotations.
      const dirs = [[ox, oy], [-oy, ox], [oy, -ox], [-ox, -oy]];
      let ok = false;
      for (const [dx, dy] of dirs) {
        const to = {
          x: Math.max(2, Math.min(fieldSize - 2, from.x + dx * 18)),
          y: Math.max(2, Math.min(fieldSize - 2, from.y + dy * 18)),
        };
        if (ctx.pathExists) {
          if (ctx.pathExists(from, to, obstacles, { id: r.doorwayId, exterior: r.doorExterior })) { ok = true; break; }
        } else {
          ok = true;
          for (let t = 0; t <= 1.0001; t += 0.05) {
            const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
            if (obstacles.some((o) => o !== r.rect && pointInRect(p, o, 0.5))) { ok = false; break; }
          }
          if (ok) break;
        }
      }
      if (!ok) errors.push(`Building '${r.id}': NPC cannot path away from door exterior (navigation blocked)`);
    }
  }

  return errors;
}

/**
 * Serialize the identity-critical subset of a rig for save/load round-trip
 * checks. Identity must survive: id, chunk, rect, doorway, interior, variant.
 */
export function serializeRigIdentity(rig: BuildingRig): string {
  return JSON.stringify({
    id: rig.id, kind: rig.kind, chunk: rig.chunk, rect: rig.rect,
    spriteVariant: rig.spriteVariant, doorwayId: rig.doorwayId,
    doorExterior: rig.doorExterior, interiorId: rig.interiorId,
  });
}
