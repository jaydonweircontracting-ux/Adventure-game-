// BUILD 1055: 3D overworld map — pure mapping + painting (no React, no DOM).
//
// The user asked for a map button that shows the overworld map and
// displays accurately what the surface looks like. The 2D game has had
// a world-map modal since the early builds (WorldMap in App.tsx, data
// in worldMap.ts — a WFC chunk world, a DIFFERENT world model); the 3D
// view had none — the 1053 minimap comment said so outright. This
// module ports the 2D modal's UX pattern to the 3D world model instead
// of copying either file:
//   - Same UX as the 2D modal: opens centered on the player, zoom
//     buttons, drag to pan (tap = select/travel), close button, the
//     minimap hides while it is open (BUILD 691), game keeps running
//     (the 2D map only locks input; it does not pause).
//   - Same mapping approach as the 1053 minimap: terrain from
//     renderTerrain over one effTerrain closure — the DISPLAY terrain,
//     i.e. the colour the ground actually renders as (shore sand,
//     high-ground stone, foam edges included) — so the map can never
//     disagree with the surface. Terrain colours from terrainColor3d
//     (the 2D palette neighbours), one fill path per colour (the
//     BUILD 980 seam fix), north-up with an N.
//   - Different scope: the minimap is a 120px player-centred window
//     (±30 tiles). This is the WHOLE world: the authored 200x200 map
//     plus a 32-tile wild margin (the fringe the player actually walks
//     in past the edge), drawn once at 2 px/tile onto a 528px canvas
//     and CSS-scaled by the view's zoom — exactly how the 2D modal
//     draws its atlas once and scales the wrapper.
//   - Different content (BUILD 1054): the world is empty wilderness
//     now — trees, terrain, water, rocks only. The frame carries NO
//     buildings, NO NPCs, NO car, NO landmarks by construction: the
//     frame type has no such fields, so the map cannot draw a town
//     that is not there. Trees read as a forest tint on grass
//     (the world IS "just trees and terrain" — a forest that painted
//     as plain meadow would be a lie at this scale). Rocks are not
//     drawn individually — sub-pixel at 2 px/tile, the same call the
//     minimap makes; stone high ground still reads grey through the
//     terrain colour. Player-placed paths/water (Build mode) DO show
//     through effTerrain as dirt/water — they are the actual surface,
//     and hiding them would be the inaccuracy the user asked us not
//     to make.
//   - Performance (the BUILD 1050 lesson): the frame samples ONE
//     effTerrain closure over the 264x264 extent (~70k lookups) plus
//     one tree Set / wildTreeAt check per tile, ONCE per open or zoom
//     change — never per frame. Pan is a CSS transform (no rebuild).
//     The player dot repaints only when the player's tile changes.

import type { Terrain } from '../iso/isoWorld';
import type { RenderTerrain } from './wildTerrain';
import { terrainColor3d, type Minimap3dDrawCtx } from './minimap3d';

/** Authored world size (tiles) — isoWorld's 200x200 map. */
export const WORLDMAP3D_WORLD_TILES = 200;
/** Wild margin (tiles) around the authored map shown on the map. */
export const WORLDMAP3D_MARGIN_TILES = 32;
/** Extent origin (tiles): the authored map starts at 0,0. */
export const WORLDMAP3D_MIN_X = -WORLDMAP3D_MARGIN_TILES;
export const WORLDMAP3D_MIN_Y = -WORLDMAP3D_MARGIN_TILES;
/** Extent size (tiles): authored world + margin on both sides. */
export const WORLDMAP3D_TILES_X = WORLDMAP3D_WORLD_TILES + WORLDMAP3D_MARGIN_TILES * 2;
export const WORLDMAP3D_TILES_Y = WORLDMAP3D_WORLD_TILES + WORLDMAP3D_MARGIN_TILES * 2;
/** Base canvas scale (px per tile) — the 2D atlas draws at a fixed px
 *  and CSS-scales, and the minimap uses 2 px/tile; same here. */
export const WORLDMAP3D_PX_PER_TILE = 2;
/** Canvas size (px). */
export const WORLDMAP3D_SIZE = WORLDMAP3D_TILES_X * WORLDMAP3D_PX_PER_TILE;
/** Zoom scales (CSS scale on the wrapper), 2D-modal style. */
export const WORLDMAP3D_ZOOM_SCALES = [0.5, 0.75, 1, 1.5, 2, 3] as const;
/** Default zoom index (1.5x): ~120 tiles across a 360px phone stage. */
export const WORLDMAP3D_DEFAULT_ZOOM = 3;
/** Forest tint: a grass tile holding a tree. Darker than meadow
 *  (#3a6a3a) so forest reads against meadow at every zoom. */
export const WORLDMAP3D_FOREST_COLOR = '#2a5a2a';
/** Player dot colour (2D/minimap: white, centre). */
export const WORLDMAP3D_PLAYER_COLOR = '#ffffff';
/** Player dot radius on the canvas (px) — big enough to read at the
 *  0.5x whole-world zoom, small enough not to swallow tiles at 3x. */
export const WORLDMAP3D_PLAYER_RADIUS = 5;
/** Background (same dark green as the minimap). */
export const WORLDMAP3D_BG_COLOR = '#1a2a1a';

/** Display colour for one tile: forest tint wins on grass holding a
 *  tree, otherwise the terrain colour (the minimap's palette). Foam
 *  is display-only water (the shoreline edge) — it paints water blue:
 *  at whole-world scale the foam edge is a sub-pixel detail, and it
 *  IS water. 'sand' here is shore sand from renderTerrain. */
export function worldmap3dTileColor(t: RenderTerrain, hasTree: boolean): string {
  if (t === 'foam') return terrainColor3d('water');
  if (t === 'grass' && hasTree) return WORLDMAP3D_FOREST_COLOR;
  return terrainColor3d(t);
}

/** Human label for a terrain (toolbar "you are here" line). Foam is
 *  water for labelling too. */
export function worldmap3dTerrainLabel(t: RenderTerrain): string {
  switch (t) {
    case 'grass': return 'Meadow';
    case 'water':
    case 'foam': return 'Water';
    case 'stone': return 'Rocky highland';
    case 'dirt': return 'Path';
    case 'sand': return 'Shore';
    default: return 'Meadow';
  }
}

/** Project a world tile to canvas px (top-left corner of the tile).
 *  North-up: canvas -y is north, world -y is north, so dy maps
 *  straight down — the same convention as the minimap. */
export function worldmap3dProject(tx: number, ty: number): { x: number; y: number } {
  return {
    x: (tx - WORLDMAP3D_MIN_X) * WORLDMAP3D_PX_PER_TILE,
    y: (ty - WORLDMAP3D_MIN_Y) * WORLDMAP3D_PX_PER_TILE,
  };
}

/** True when a canvas point is inside the map extent. */
export function worldmap3dInsideExtent(px: number, py: number): boolean {
  return px >= 0 && py >= 0 && px < WORLDMAP3D_SIZE && py < WORLDMAP3D_SIZE;
}

/**
 * Convert a canvas point to a world position (float tile coords).
 * Returns null outside the extent — the caller validates walkability,
 * exactly like a field tap or a minimap tap.
 */
export function worldmap3dCanvasToWorld(px: number, py: number): { x: number; y: number } | null {
  if (!worldmap3dInsideExtent(px, py)) return null;
  return {
    x: WORLDMAP3D_MIN_X + px / WORLDMAP3D_PX_PER_TILE,
    y: WORLDMAP3D_MIN_Y + py / WORLDMAP3D_PX_PER_TILE,
  };
}

/** Clamp a pan so the canvas never leaves the stage: the canvas may
 *  be smaller than the stage (whole world at 0.5x) or larger (zoomed
 *  in) — the same rule as the 2D modal's clampPan. */
export function worldmap3dClampPan(
  x: number, y: number, zoomScale: number, stageW: number, stageH: number,
): { x: number; y: number } {
  const maxX = Math.max(0, (WORLDMAP3D_SIZE * zoomScale - stageW) / 2);
  const maxY = Math.max(0, (WORLDMAP3D_SIZE * zoomScale - stageH) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
}

/**
 * Pan that centers the player tile in the stage (the 2D modal opens
 * centered on the player's chunk the same way). The canvas wrapper is
 * centered in the stage (margin -size/2), so the pan is the negated
 * offset of the player's canvas point from the canvas centre, scaled.
 */
export function worldmap3dPanForPlayer(
  playerX: number, playerY: number, zoomScale: number, stageW: number, stageH: number,
): { x: number; y: number } {
  const p = worldmap3dProject(playerX + 0.5, playerY + 0.5);
  const targetX = -zoomScale * (p.x - WORLDMAP3D_SIZE / 2);
  const targetY = -zoomScale * (p.y - WORLDMAP3D_SIZE / 2);
  return worldmap3dClampPan(targetX, targetY, zoomScale, stageW, stageH);
}

export interface WorldMap3dFrame {
  /** Terrain cells grouped by colour (one fill path per colour). */
  terrainByColor: { color: string; cells: { x: number; y: number }[] }[];
  /** Player dot in canvas px. */
  player: { x: number; y: number };
  // BUILD 1081: live deposits in canvas px. Deposits are wild
  // natural resources, not town content — the NOTE below (no
  // buildings / NPCs / car / landmarks) still holds; a deposit dot
  // draws a resource that is actually there, never a town.
  deposits: { x: number; y: number; color: string }[];
  // NOTE: deliberately no buildings / NPCs / car / landmarks fields.
  // The wilderness world has none, and the frame type must make it
  // impossible to draw a town that is not there.
}

export interface WorldMap3dFrameInput {
  /** Display terrain at a tile — renderTerrain over effTerrainFor,
   *  i.e. the colour the ground actually renders as (shore sand,
   *  high-ground stone, foam edges included). */
  terrainAt: (x: number, y: number) => RenderTerrain;
  /** True when the tile holds a tree (in-map trees + wild trees). */
  treeAt: (x: number, y: number) => boolean;
  playerX: number;
  playerY: number;
  // BUILD 1081: live mineral deposits (tile coords + mineral tint)
  // — the full deposit inventory at a glance.
  deposits?: readonly { x: number; y: number; color: string }[];
}

/**
 * Build one world-map frame: the whole 264x264 extent, one
 * effTerrain lookup + one tree check per tile, terrain grouped by
 * colour, the player dot. Pure — the view supplies the terrain/tree
 * closures and the live position, so this is fully testable without
 * React or a canvas.
 */
export function buildWorldMap3dFrame(input: WorldMap3dFrameInput): WorldMap3dFrame {
  const { terrainAt, treeAt, playerX, playerY } = input;
  const byColor = new Map<string, { x: number; y: number }[]>();
  for (let ty = WORLDMAP3D_MIN_Y; ty < WORLDMAP3D_MIN_Y + WORLDMAP3D_TILES_Y; ty++) {
    for (let tx = WORLDMAP3D_MIN_X; tx < WORLDMAP3D_MIN_X + WORLDMAP3D_TILES_X; tx++) {
      const color = worldmap3dTileColor(terrainAt(tx, ty), treeAt(tx, ty));
      let cells = byColor.get(color);
      if (!cells) { cells = []; byColor.set(color, cells); }
      const p = worldmap3dProject(tx, ty);
      cells.push({ x: p.x, y: p.y });
    }
  }
  const terrainByColor = [...byColor.entries()].map(([color, cells]) => ({ color, cells }));
  const pp = worldmap3dProject(playerX + 0.5, playerY + 0.5);
  // BUILD 1081: live deposits, mineral-tinted.
  const deposits: WorldMap3dFrame['deposits'] = [];
  for (const d of input.deposits ?? []) deposits.push({ ...worldmap3dProject(d.x, d.y), color: d.color });
  return { terrainByColor, player: { x: pp.x, y: pp.y }, deposits };
}

/**
 * Paint one frame onto the map canvas. Draw order: dark background,
 * terrain (one batched path per colour, 2.6px squares for overlap
 * margin — the BUILD 980 seam fix, same as the minimap), player dot
 * with a dark ring. The north indicator lives in the overlay HTML
 * (like the 2D modal's atlas-compass), not on the panning canvas.
 */
export function paintWorldMap3d(g: Minimap3dDrawCtx, frame: WorldMap3dFrame): void {
  g.clearRect(0, 0, WORLDMAP3D_SIZE, WORLDMAP3D_SIZE);
  g.fillStyle = WORLDMAP3D_BG_COLOR;
  g.fillRect(0, 0, WORLDMAP3D_SIZE, WORLDMAP3D_SIZE);
  for (const group of frame.terrainByColor) {
    if (group.cells.length === 0) continue;
    g.fillStyle = group.color;
    g.beginPath();
    for (const c of group.cells) g.rect(c.x - 0.3, c.y - 0.3, WORLDMAP3D_PX_PER_TILE + 0.6, WORLDMAP3D_PX_PER_TILE + 0.6);
    g.fill();
  }
  // BUILD 1081: live deposits — 4px mineral-tinted squares.
  for (const d of frame.deposits) {
    g.fillStyle = d.color;
    g.fillRect(d.x - 2, d.y - 2, 4, 4);
  }
  // Player: white dot with a dark ring, like the minimap.
  g.fillStyle = WORLDMAP3D_PLAYER_COLOR;
  g.beginPath();
  g.arc(frame.player.x, frame.player.y, WORLDMAP3D_PLAYER_RADIUS, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1a2a1a';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(frame.player.x, frame.player.y, WORLDMAP3D_PLAYER_RADIUS, 0, Math.PI * 2);
  g.stroke();
}
