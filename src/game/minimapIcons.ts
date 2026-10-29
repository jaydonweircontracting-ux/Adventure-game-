// Minimap icons + detail layers (BUILD 961).
//
// Pure and deterministic — no React, no DOM. The MiniMap component in App.tsx
// gathers location data (doorways, stalls, decor props, landmarks, carriage
// points) and this module projects it into minimap pixels and draws it.
//
// Coordinate contract (audited 961): the field view works in CHUNK-LOCAL
// field units (0..280 per chunk) plus a chunk coordinate. The player position
// is chunk-local, so a thing in chunk (cx, cy) at local (lx, ly) sits at
// player-relative field units dx = (cx - playerChunk.x) * 280 + lx - pos.x
// (same for y). The minimap scale is the EXISTING tap scale — 120 / 280 / 2
// px per unit — so icons, terrain, water, roads and taps all agree. (The old
// terrain pass drew 7 chunks at 0.061 px/unit while buildings and taps used
// 0.214, so terrain and icons were misaligned; 961 unifies everything on
// the tap scale. Visible span is now ~2 chunks instead of 7 — more detail,
// less area, and the tap mapping itself is unchanged.)
//
// Icon art: the uploaded Isometric TRPG Asset Pack ships NO shop/guild/
// blacksmith glyphs — its MapIndicators sheet holds six plain diamonds
// (solid green/yellow/red/blue + silver/gold outlines). Icon bases below
// reuse that diamond silhouette and indicator palette (deepened slightly
// for contrast on terrain); the per-type glyphs are drawn, because the pack
// has none. The five pack sheets ship verbatim in public/sprites/minimap/
// (NO license file in the zip — no terms claimed). Never claim a drawn
// glyph is pack art.
//
// Location-data rule: every icon type below has backing game data. Types
// with no field position are NOT icon'd, and the reasons are recorded:
//  - blacksmith: no smithy building exists; smiths Tom/Jory work the forge
//    at the guild doorstep in Mosslight, so the guild icon carries a small
//    forge badge instead of a second pin at the same point.
//  - caves (pre-964): no field entrance point established (POI caves are
//    scattered generated content; landmark caves had no (50,44)-style stand
//    point). BUILD 964 gives landmark caves the 947 stand point + Enter
//    flow, so caves ARE icon'd from 964 on (see 'cave' below).
//  - ruins: buildingDoorwaysFor returns [] for ruin chunks — no entrance.
//  - BUILD 930 dungeon shop vaults: dungeon-interior only; the field
//    minimap does not render inside dungeons.
//  - merchant NPC wares (BUILD 955): no fixed location (NPCs wander).

import { waterGridForChunk } from './landscape';

/** Minimap canvas size (px) — matches the MiniMap component. */
export const MINIMAP_SIZE = 120;
/** Canvas center (px). */
export const MINIMAP_CENTER = MINIMAP_SIZE / 2;
/** Field units per chunk — matches FIELD_SIZE. */
export const MINIMAP_CHUNK_UNITS = 280;
/**
 * Pixels per field unit. Identical to the pre-961 tap mapping
 * (size / 280 / 2), so taps land on the icons they point at.
 */
export const MINIMAP_PX_PER_UNIT = MINIMAP_SIZE / MINIMAP_CHUNK_UNITS / 2;
/** Clip-circle radius used by the MiniMap component. */
export const MINIMAP_CLIP_RADIUS = MINIMAP_CENTER - 2;
/** Icons must sit inside this radius to draw (same margin as pre-961). */
export const MINIMAP_ICON_RADIUS = MINIMAP_CENTER - 4;
/** Dungeon entrance stand point, chunk-local (BUILD 947 convention). */
export const DUNGEON_ENTRANCE_POINT = { x: 50, y: 44 };
/** Water grid resolution for the minimap (10-unit cells -> ~2.1px each). */
export const MINIMAP_WATER_CELLS = 28;

export type MinimapIconType =
  | 'shop'
  | 'tavern'
  | 'guild'
  | 'chapel'
  | 'inn'
  | 'house'
  | 'dungeon'
  | 'cave'
  | 'carriage'
  | 'well'
  | 'windmill'
  | 'bank';

/** Doorway room types (subset of App's InteriorArea roomType union). */
export type MinimapRoomType =
  | 'guild'
  | 'inn'
  | 'chapel'
  | 'building'
  | 'prison'
  | 'tavern'
  | 'cellar';

/**
 * Map a doorway room type to its minimap icon. Interiors (prison, cellar)
 * never appear as field doorways, so they map to null — never an icon
 * without a field position.
 */
export function iconTypeForRoomType(roomType: MinimapRoomType): MinimapIconType | null {
  switch (roomType) {
    case 'guild': return 'guild';
    case 'tavern': return 'tavern';
    case 'chapel': return 'chapel';
    case 'inn': return 'inn';
    case 'building': return 'house';
    case 'prison':
    case 'cellar':
      return null;
  }
}

export interface MinimapIconDef {
  /** Diamond fill — sampled from the pack's indicator palette, deepened for contrast. */
  fill: string;
  /** Diamond outline (dark, for contrast on every terrain). */
  stroke: string;
  /** Player-facing name (legend/report use, not drawn on the 120px canvas). */
  label: string;
}

export const MINIMAP_ICON_DEFS: Record<MinimapIconType, MinimapIconDef> = {
  shop: { fill: '#d9bd00', stroke: '#3a3200', label: 'Market stall (shop)' },
  tavern: { fill: '#d81800', stroke: '#3a0a00', label: 'Tavern / bar' },
  guild: { fill: '#0050d8', stroke: '#061e3a', label: 'Guild hall (+ forge)' },
  chapel: { fill: '#dfe9e7', stroke: '#2c3a38', label: 'Chapel' },
  inn: { fill: '#4cc400', stroke: '#1d3a00', label: 'Inn' },
  house: { fill: '#e8c87a', stroke: '#4a3410', label: 'House' },
  dungeon: { fill: '#1a1a1a', stroke: '#000000', label: 'Dungeon entrance' },
  cave: { fill: '#3a2c1a', stroke: '#120c06', label: 'Cave entrance' },
  carriage: { fill: '#d8b878', stroke: '#4a3410', label: 'Carriage station / stop' },
  well: { fill: '#6fc4d8', stroke: '#12303a', label: 'Well' },
  windmill: { fill: '#f5f5f0', stroke: '#3a3a30', label: 'Windmill' },
  // BUILD 982: Mosslight Bank — gold diamond, top-tier priority.
  bank: { fill: '#c9a227', stroke: '#3a2c00', label: 'Bank' },
};

/** One icon source: player-relative field units (see coordinate contract). */
export interface MinimapIconSource {
  type: MinimapIconType;
  dx: number;
  dy: number;
  /** Guild icons in Mosslight carry a forge badge (smiths work there). */
  forgeBadge?: boolean;
}

export interface PlacedMinimapIcon {
  type: MinimapIconType;
  x: number;
  y: number;
  forgeBadge: boolean;
}

/** Project player-relative field units to minimap canvas px. */
export function minimapProject(dx: number, dy: number): { x: number; y: number } {
  return {
    x: MINIMAP_CENTER + dx * MINIMAP_PX_PER_UNIT,
    y: MINIMAP_CENTER + dy * MINIMAP_PX_PER_UNIT,
  };
}

/** Keep only sources inside the icon circle, projected to canvas px. */
export function placeMinimapIcons(sources: MinimapIconSource[]): PlacedMinimapIcon[] {
  const out: PlacedMinimapIcon[] = [];
  for (const s of sources) {
    const p = minimapProject(s.dx, s.dy);
    if (Math.hypot(p.x - MINIMAP_CENTER, p.y - MINIMAP_CENTER) >= MINIMAP_ICON_RADIUS) continue;
    out.push({ type: s.type, x: p.x, y: p.y, forgeBadge: s.forgeBadge === true });
  }
  return out;
}

/** Minimal 2d-context surface the icon painter needs (mockable in tests). */
export interface MinimapDrawCtx {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
}

const DIAMOND_R = 5;

/**
 * Draw order: generic houses first, special places last, so a tavern or
 * guild pin is never buried under neighboring houses. Mosslight houses sit
 * ~15 units apart (3px on the minimap) while icons are 10px wide, so
 * without this ordering the special pins vanished under house pins.
 */
export const MINIMAP_ICON_PRIORITY: Record<MinimapIconType, number> = {
  house: 0,
  well: 1,
  windmill: 2,
  carriage: 3,
  dungeon: 4,
  cave: 4,
  shop: 5,
  inn: 6,
  chapel: 7,
  tavern: 8,
  guild: 9,
  bank: 9,
};

/** Sort placed icons for drawing (lowest priority first). Stable copy. */
export function sortMinimapIconsForDraw(icons: PlacedMinimapIcon[]): PlacedMinimapIcon[] {
  return [...icons].sort((a, b) => MINIMAP_ICON_PRIORITY[a.type] - MINIMAP_ICON_PRIORITY[b.type]);
}

/** Draw one icon: pack-silhouette diamond + drawn per-type glyph. */
export function drawMinimapIcon(
  g: MinimapDrawCtx,
  x: number,
  y: number,
  type: MinimapIconType,
  forgeBadge = false,
): void {
  const def = MINIMAP_ICON_DEFS[type];
  if (type === 'house') {
    // Generic dwellings are small dots, not full diamonds: Mosslight
    // houses sit ~15 units apart (3px on the minimap), so full-size
    // house diamonds buried the special pins. Dots keep the town
    // texture (as pre-961) while specials stay readable.
    g.fillStyle = def.fill;
    g.fillRect(x - 2, y - 2, 4, 4);
    g.strokeStyle = def.stroke;
    g.lineWidth = 1;
    g.strokeRect(x - 2, y - 2, 4, 4);
    return;
  }
  // Diamond base.
  g.beginPath();
  g.moveTo(x, y - DIAMOND_R);
  g.lineTo(x + DIAMOND_R, y);
  g.lineTo(x, y + DIAMOND_R);
  g.lineTo(x - DIAMOND_R, y);
  g.closePath();
  g.fillStyle = def.fill;
  g.fill();
  g.strokeStyle = def.stroke;
  g.lineWidth = 1;
  g.stroke();
  // Glyph: dark on light fills, white on dark fills.
  const lightFills: MinimapIconType[] = ['chapel', 'house', 'carriage', 'well', 'windmill', 'bank'];
  const glyph = lightFills.includes(type) ? '#20241e' : '#ffffff';
  switch (type) {
    case 'shop':
      // Stall awning bar + counter (dark: white would vanish on yellow).
      g.fillStyle = '#3a3200';
      g.fillRect(x - 3.5, y - 2.5, 7, 2);
      g.fillRect(x - 2, y + 1, 4, 3);
      break;
    case 'tavern':
      // Mug: body + handle.
      g.fillStyle = glyph;
      g.fillRect(x - 2.5, y - 3, 4, 5.5);
      g.fillRect(x + 1.5, y - 2, 2, 3.5);
      break;
    case 'guild':
      // Shield chevron.
      g.strokeStyle = glyph;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - 3, y + 2);
      g.lineTo(x, y - 2.5);
      g.lineTo(x + 3, y + 2);
      g.stroke();
      break;
    case 'bank':
      // BUILD 982: classical facade — lintel + three columns
      // (dark glyph on the gold fill).
      g.fillStyle = glyph;
      g.fillRect(x - 3.5, y - 3, 7, 1.5);
      g.fillRect(x - 3, y - 1.5, 1.5, 4.5);
      g.fillRect(x - 0.75, y - 1.5, 1.5, 4.5);
      g.fillRect(x + 1.5, y - 1.5, 1.5, 4.5);
      break;
    case 'chapel':
      // Cross.
      g.fillStyle = glyph;
      g.fillRect(x - 1, y - 3.5, 2, 7);
      g.fillRect(x - 3.5, y - 1, 7, 2);
      break;
    case 'inn':
      // Four-point star.
      g.strokeStyle = glyph;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y - 3.5);
      g.lineTo(x, y + 3.5);
      g.moveTo(x - 3.5, y);
      g.lineTo(x + 3.5, y);
      g.stroke();
      break;
    case 'dungeon':
      // Arch (squared at this size).
      g.strokeStyle = glyph;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - 3, y + 3);
      g.lineTo(x - 3, y - 1);
      g.lineTo(x + 3, y - 1);
      g.lineTo(x + 3, y + 3);
      g.stroke();
      break;
    case 'cave':
      // Rounded mouth (arch + dark fill, distinct from the dungeon arch).
      g.fillStyle = '#120c06';
      g.beginPath();
      g.moveTo(x - 3, y + 3);
      g.lineTo(x - 3, y - 1);
      g.arc(x, y - 1, 3, Math.PI, 0);
      g.lineTo(x + 3, y + 3);
      g.closePath();
      g.fill();
      break;
    case 'carriage':
      // Wheel.
      g.strokeStyle = glyph;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 2.5, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = glyph;
      g.fillRect(x - 0.5, y - 0.5, 1, 1);
      break;
    case 'well':
      // Dark center dot.
      g.fillStyle = glyph;
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
      break;
    case 'windmill':
      // Blades.
      g.strokeStyle = glyph;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - 3, y - 3);
      g.lineTo(x + 3, y + 3);
      g.moveTo(x + 3, y - 3);
      g.lineTo(x - 3, y + 3);
      g.stroke();
      break;
  }
  if (forgeBadge) {
    // Forge badge: small dark square pinned to the icon's lower-right
    // corner — smiths work the forge at the guild, so the guild pin
    // carries the anvil mark instead of a second pin at the same point.
    g.fillStyle = '#1a1a1a';
    g.fillRect(x + 3, y + 3, 4, 4);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.strokeRect(x + 3, y + 3, 4, 4);
  }
}

/**
 * Terrain color for a mapTileFor terrain value. Keeps the pre-961 palette
 * for the five old values exactly; tundra/shore get sensible neighbors;
 * anything else falls back to meadow green (never an unpainted hole).
 */
export function terrainColorFor(terrain: string): string {
  switch (terrain) {
    case 'forest': return '#2a5a2a';
    case 'desert': return '#c2a86a';
    case 'ocean': return '#2a5aaa';
    case 'rock': return '#6a6a6a';
    case 'tundra': return '#8a8a7a';
    case 'shore': return '#7a9a6a';
    default: return '#3a6a3a';
  }
}

export interface MinimapWaterCell {
  /** Player-relative field units (cell center). */
  dx: number;
  dy: number;
  kind: 'river' | 'lake';
}

// Per-chunk water cells in chunk-local coords (deterministic data, cached
// so the minimap never recomputes a chunk's water grid twice).
const waterCellCache = new Map<string, { lx: number; ly: number; kind: 'river' | 'lake' }[]>();

function waterCellsForChunkLocal(cx: number, cy: number): { lx: number; ly: number; kind: 'river' | 'lake' }[] {
  const key = cx + ',' + cy;
  const cached = waterCellCache.get(key);
  if (cached) return cached;
  const grid = waterGridForChunk(cx, cy, MINIMAP_WATER_CELLS);
  const out: { lx: number; ly: number; kind: 'river' | 'lake' }[] = [];
  for (let gy = 0; gy < grid.cells; gy++) {
    for (let gx = 0; gx < grid.cells; gx++) {
      const i = gy * grid.cells + gx;
      if (grid.depths[i] <= 0) continue;
      out.push({
        lx: (gx + 0.5) * grid.cellSize,
        ly: (gy + 0.5) * grid.cellSize,
        kind: grid.kinds[i] === 1 ? 'river' : 'lake',
      });
    }
  }
  waterCellCache.set(key, out);
  return out;
}

/**
 * Water cells for the player's chunk and its neighbors, as player-relative
 * field units. Callers project with minimapProject (same as icons).
 */
export function minimapWaterCells(
  playerChunk: { x: number; y: number },
  playerPos: { x: number; y: number },
): MinimapWaterCell[] {
  const out: MinimapWaterCell[] = [];
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      for (const c of waterCellsForChunkLocal(playerChunk.x + ox, playerChunk.y + oy)) {
        out.push({
          dx: ox * MINIMAP_CHUNK_UNITS + c.lx - playerPos.x,
          dy: oy * MINIMAP_CHUNK_UNITS + c.ly - playerPos.y,
          kind: c.kind,
        });
      }
    }
  }
  return out;
}

export const MINIMAP_WATER_COLORS = {
  river: '#3f7fd0',
  lake: '#2a5aaa',
} as const;
