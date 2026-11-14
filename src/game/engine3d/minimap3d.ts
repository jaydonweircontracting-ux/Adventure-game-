// BUILD 1053: 3D minimap — pure mapping + painting (no React, no DOM).
//
// The 2D game has had a circular minimap since BUILD 609 (MiniMap in
// App.tsx, mapping in minimapIcons.ts / minimapRadar.ts); the 3D view
// had none — zero minimap hits in src/game/engine3d/. This module ports
// the 2D minimap's approach to the 3D world model instead of copying
// the whole file and building a second minimap system beside the first:
//   - Same canvas (120px), same north-up orientation, same player-dot
//     in the centre, same white 2px circle border, same terrain palette
//     neighbors (meadow green, path tan, water blue, stone grey —
//     terrainColorFor in minimapIcons.ts), same tap-outside-circle
//     rejection as the 2D onClick.
//   - Different coordinate model: the 2D minimap works in chunk-local
//     field units (0..280 per chunk, 0.214 px/unit, ~2 chunks visible).
//     The 3D world is one authored 200x200 tile map plus wild terrain
//     past the edge (effTerrain in wildTerrain.ts), so the mapping here
//     is tile-based: 2 px per tile, ±30 tiles visible (a 60-tile span
//     covers the plaza and the streets around it; the whole town is
//     200 tiles, so this is a neighborhood map, not a world map).
//   - Different data sources: terrain comes from one effTerrain
//     closure (placed water > placed paths as dirt > stored map
//     terrain > wild terrain — the same definition the renderer
//     uses, so the minimap can never disagree with the ground);
//     buildings come from world.huts / world.stalls / world.placements
//     / world.landmarks; NPCs from the live NPC actor list; the car
//     from its session state. Only what the 3D world state actually
//     has is drawn — no invented markers. Animals and transients are
//     NOT drawn: they are session-only wanderers with no stable
//     identity on the map, and the resident NPCs + car already cover
//     the "who is near me" question. Trees, rocks, crates, lanterns
//     and farm tiles are NOT drawn either: at 2 px/tile a tree is a
//     sub-pixel speckle and the 2D minimap likewise draws terrain,
//     not individual trees (its forest is a terrain colour).
//   - Performance (the BUILD 1050 lesson): the frame builder samples
//     ONE effTerrain closure over a 61x61 window (3,721 lookups, each
//     two Set hits + a Map hit) and groups terrain into one fill path
//     per colour (the BUILD 980 lesson — per-cell fillRects left seam
//     grids). The view redraws at most every 250ms plus immediately
//     when the player's tile changes — never per frame, never a
//     per-call scan of the terrain record.

import type { Terrain, HutRect, StallRect, PlacedItem, IsoWorld } from '../iso/isoWorld';

/** Minimap canvas size (px) — matches the 2D minimap (120px). */
export const MINIMAP3D_SIZE = 120;
/** Canvas center (px). */
export const MINIMAP3D_CENTER = MINIMAP3D_SIZE / 2;
/** Tiles shown from the player to the rim (half the visible span). */
export const MINIMAP3D_RANGE_TILES = 30;
/** Pixels per tile (120px / 60 tiles). */
export const MINIMAP3D_PX_PER_TILE = MINIMAP3D_SIZE / (MINIMAP3D_RANGE_TILES * 2);
/** Clip-circle radius (matches the 2D minimap's R - 2). */
export const MINIMAP3D_CLIP_RADIUS = MINIMAP3D_CENTER - 2;
/** Redraw throttle (ms) — the view's interval; tile changes redraw immediately. */
export const MINIMAP3D_REDRAW_MS = 250;

/** Terrain colour for a 3D terrain value. Neighbours of the 2D palette
 *  (minimapIcons.ts terrainColorFor): meadow #3a6a3a, desert/sand
 *  #c2a86a, ocean #2a5aaa, rock #6a6a6a. Dirt (placed paths / roads)
 *  is a darker tan so paths read against grass. Anything unknown
 *  falls back to meadow green — never an unpainted hole. */
export function terrainColor3d(t: Terrain): string {
  switch (t) {
    case 'grass': return '#3a6a3a';
    case 'dirt': return '#a98d55';
    case 'sand': return '#c2a86a';
    case 'stone': return '#6a6a6a';
    case 'water': return '#2a5aaa';
    default: return '#3a6a3a';
  }
}

/** Building-dot colours (2D neighbours: house #e8c87a, shop #d9bd00). */
export const MINIMAP3D_BUILDING_COLORS = {
  house: '#e8c87a',
  stall: '#d9bd00',
  landmark: '#6a5a4a',
  outline: '#4a3410',
} as const;

/** NPC dot colour (2D radar npc: white). */
export const MINIMAP3D_NPC_COLOR = '#ffffff';
/** Car dot colour (the car is red in-world; orange reads on green). */
export const MINIMAP3D_CAR_COLOR = '#ff7f2a';
/** Player dot colour (2D: white, centre). */
export const MINIMAP3D_PLAYER_COLOR = '#ffffff';
/** Background (2D terrain mode: dark green). */
export const MINIMAP3D_BG_COLOR = '#1a2a1a';
/** Circle border (2D: white, 2px). */
export const MINIMAP3D_BORDER_COLOR = '#ffffff';

/** Project a player-relative tile offset to minimap canvas px.
 *  North-up: canvas -y is north, and world -y is north (y grows
 *  southward, the shared field convention), so dy maps straight down. */
export function minimap3dProject(dx: number, dy: number): { x: number; y: number } {
  return {
    x: MINIMAP3D_CENTER + dx * MINIMAP3D_PX_PER_TILE,
    y: MINIMAP3D_CENTER + dy * MINIMAP3D_PX_PER_TILE,
  };
}

/**
 * Convert a canvas tap to a world position (float tile coords).
 * Returns null for taps outside the clip circle — the 2D minimap
 * rejects those too (its onClick ignores radius > 58). The caller
 * rounds / validates walkability, exactly like a field tap.
 */
export function minimap3dTapToWorld(
  px: number,
  py: number,
  playerX: number,
  playerY: number,
): { x: number; y: number } | null {
  const dx = px - MINIMAP3D_CENTER;
  const dy = py - MINIMAP3D_CENTER;
  if (Math.hypot(dx, dy) > MINIMAP3D_CLIP_RADIUS) return null;
  return {
    x: playerX + dx / MINIMAP3D_PX_PER_TILE,
    y: playerY + dy / MINIMAP3D_PX_PER_TILE,
  };
}

/** Hide conditions. The 2D minimap hides inside buildings (609),
 *  while the world map is open (691), while Options is open (663),
 *  and while a shop is open (697). The 3D view has no world-map
 *  overlay and no shop overlay, and its Options dialog lives in the
 *  host at the top-right — clear of this map's top-left corner — so
 *  the only two conditions that exist here are inside-a-hut and
 *  Hide UI (the map is HUD, like the status strip). */
export function shouldShowMinimap3d(opts: { insideHut: boolean; hideUi: boolean }): boolean {
  return !opts.insideHut && !opts.hideUi;
}

/** Placement kinds that read as buildings on the map. Paths, trees,
 *  rocks, water, lanterns, bushes, ore, bridges, farm land, fences
 *  and grass are ground/decor at this scale, not buildings. */
const BUILDING_PLACEMENT_KINDS: ReadonlySet<string> = new Set([
  'house', 'stall', 'wall', 'windmill', 'mine', 'custom',
]);

export interface Minimap3dBuilding {
  /** Canvas px (top-left of the projected rect). */
  x: number;
  y: number;
  /** Canvas px size (at least 3px so a 1-tile wall still reads). */
  w: number;
  h: number;
  fill: string;
}

export interface Minimap3dFrame {
  /** Terrain cells grouped by colour (one fill path per colour). */
  terrainByColor: { color: string; cells: { x: number; y: number }[] }[];
  buildings: Minimap3dBuilding[];
  /** NPC dots in canvas px. */
  npcs: { x: number; y: number }[];
  /** Car dot in canvas px, or null when there is no car. */
  car: { x: number; y: number } | null;
}

export interface Minimap3dFrameInput {
  terrainAt: (x: number, y: number) => Terrain;
  playerX: number;
  playerY: number;
  huts: readonly HutRect[];
  stalls: readonly StallRect[];
  placements: readonly PlacedItem[];
  landmarks: NonNullable<IsoWorld['landmarks']>;
  /** Live NPC positions (already filtered to alive by the caller). */
  npcs: readonly { x: number; y: number }[];
  car: { x: number; y: number } | null;
}

function insideCircle(x: number, y: number): boolean {
  return Math.hypot(x - MINIMAP3D_CENTER, y - MINIMAP3D_CENTER) <= MINIMAP3D_CLIP_RADIUS;
}

/**
 * Build one minimap frame: the terrain window around the player
 * (61x61 tiles, one effTerrain lookup each), the building rects in
 * range, the NPC dots in range, and the car dot. Pure — the view
 * supplies the terrain closure and the live positions, so this is
 * fully testable without React or a canvas.
 */
export function buildMinimap3dFrame(input: Minimap3dFrameInput): Minimap3dFrame {
  const { terrainAt, playerX, playerY } = input;
  const px = Math.round(playerX);
  const py = Math.round(playerY);
  const byColor = new Map<string, { x: number; y: number }[]>();
  for (let ty = py - MINIMAP3D_RANGE_TILES; ty <= py + MINIMAP3D_RANGE_TILES; ty++) {
    for (let tx = px - MINIMAP3D_RANGE_TILES; tx <= px + MINIMAP3D_RANGE_TILES; tx++) {
      // Tile centre in canvas px; the tile paints as one 2px square.
      const c = minimap3dProject(tx - playerX + 0.5, ty - playerY + 0.5);
      if (!insideCircle(c.x, c.y)) continue;
      const color = terrainColor3d(terrainAt(tx, ty));
      let cells = byColor.get(color);
      if (!cells) { cells = []; byColor.set(color, cells); }
      cells.push({ x: c.x - MINIMAP3D_PX_PER_TILE / 2, y: c.y - MINIMAP3D_PX_PER_TILE / 2 });
    }
  }
  const terrainByColor = [...byColor.entries()].map(([color, cells]) => ({ color, cells }));

  const buildings: Minimap3dBuilding[] = [];
  const pushRect = (x0: number, y0: number, x1: number, y1: number, fill: string) => {
    // Project the rect corners; skip rects wholly outside the circle.
    const tl = minimap3dProject(x0 - playerX, y0 - playerY);
    const br = minimap3dProject(x1 + 1 - playerX, y1 + 1 - playerY);
    const cx = (tl.x + br.x) / 2, cy = (tl.y + br.y) / 2;
    if (Math.hypot(cx - MINIMAP3D_CENTER, cy - MINIMAP3D_CENTER) > MINIMAP3D_CLIP_RADIUS + 8) return;
    buildings.push({
      x: tl.x, y: tl.y,
      w: Math.max(3, br.x - tl.x), h: Math.max(3, br.y - tl.y),
      fill,
    });
  };
  for (const h of input.huts) pushRect(h.x0, h.y0, h.x1, h.y1, MINIMAP3D_BUILDING_COLORS.house);
  for (const s of input.stalls) pushRect(s.x0, s.y0, s.x1, s.y0, MINIMAP3D_BUILDING_COLORS.stall);
  for (const p of input.placements) {
    if (!BUILDING_PLACEMENT_KINDS.has(p.kind)) continue;
    const fill = p.kind === 'stall' ? MINIMAP3D_BUILDING_COLORS.stall : MINIMAP3D_BUILDING_COLORS.house;
    pushRect(p.x0, p.y0, p.x1, p.y1, fill);
  }
  for (const l of input.landmarks) pushRect(l.x0, l.y0, l.x1, l.y1, MINIMAP3D_BUILDING_COLORS.landmark);

  const npcs: { x: number; y: number }[] = [];
  for (const n of input.npcs) {
    if (Math.abs(n.x - playerX) > MINIMAP3D_RANGE_TILES || Math.abs(n.y - playerY) > MINIMAP3D_RANGE_TILES) continue;
    const p = minimap3dProject(n.x - playerX, n.y - playerY);
    if (!insideCircle(p.x, p.y)) continue;
    npcs.push(p);
  }
  let car: { x: number; y: number } | null = null;
  if (input.car) {
    if (Math.abs(input.car.x - playerX) <= MINIMAP3D_RANGE_TILES && Math.abs(input.car.y - playerY) <= MINIMAP3D_RANGE_TILES) {
      const p = minimap3dProject(input.car.x - playerX, input.car.y - playerY);
      if (insideCircle(p.x, p.y)) car = p;
    }
  }
  return { terrainByColor, buildings, npcs, car };
}

/** Minimal 2d-context surface the painter needs (mockable in tests). */
export interface Minimap3dDrawCtx {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  clip(): void;
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: string;
}

/**
 * Paint one frame onto a 120x120 canvas context. Draw order: dark
 * background, terrain (one batched path per colour, 2.6px squares for
 * overlap margin — the BUILD 980 seam fix), buildings (houses first,
 * stalls/landmarks last so a stall pin is never buried), NPC dots,
 * car dot, player dot, north indicator, circle border. The whole
 * paint is clipped to the circle first, like the 2D minimap.
 */
export function paintMinimap3d(g: Minimap3dDrawCtx, frame: Minimap3dFrame): void {
  const R = MINIMAP3D_CENTER;
  g.clearRect(0, 0, MINIMAP3D_SIZE, MINIMAP3D_SIZE);
  g.save();
  g.beginPath();
  g.arc(R, R, MINIMAP3D_CLIP_RADIUS, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = MINIMAP3D_BG_COLOR;
  g.fillRect(0, 0, MINIMAP3D_SIZE, MINIMAP3D_SIZE);
  // Terrain: one path per colour, squares slightly oversized (2.6px
  // on a 2px pitch) so antialiasing leaves no seam grid.
  for (const group of frame.terrainByColor) {
    if (group.cells.length === 0) continue;
    g.fillStyle = group.color;
    g.beginPath();
    for (const c of group.cells) g.rect(c.x - 0.3, c.y - 0.3, MINIMAP3D_PX_PER_TILE + 0.6, MINIMAP3D_PX_PER_TILE + 0.6);
    g.fill();
  }
  // Buildings.
  for (const b of frame.buildings) {
    g.fillStyle = b.fill;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = MINIMAP3D_BUILDING_COLORS.outline;
    g.lineWidth = 1;
    g.strokeRect(b.x, b.y, b.w, b.h);
  }
  // NPC dots (white, like the 2D radar).
  for (const n of frame.npcs) {
    g.fillStyle = MINIMAP3D_NPC_COLOR;
    g.beginPath();
    g.arc(n.x, n.y, 2.5, 0, Math.PI * 2);
    g.fill();
  }
  // Car dot.
  if (frame.car) {
    g.fillStyle = MINIMAP3D_CAR_COLOR;
    g.beginPath();
    g.arc(frame.car.x, frame.car.y, 3, 0, Math.PI * 2);
    g.fill();
  }
  // Player: white dot in the centre with a dark ring, like the 2D map.
  g.fillStyle = MINIMAP3D_PLAYER_COLOR;
  g.beginPath();
  g.arc(R, R, 4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1a2a1a';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(R, R, 4, 0, Math.PI * 2);
  g.stroke();
  // North indicator: 'N' at the top, inside the circle.
  g.fillStyle = '#ffffff';
  g.font = 'bold 10px sans-serif';
  g.textAlign = 'center';
  g.fillText('N', R, 12);
  g.restore();
  // Circle border (2D: white, 2px).
  g.strokeStyle = MINIMAP3D_BORDER_COLOR;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(R, R, MINIMAP3D_CLIP_RADIUS, 0, Math.PI * 2);
  g.stroke();
}
