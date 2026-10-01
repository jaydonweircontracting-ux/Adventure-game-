// BUILD 389: ambient iso critters (user-supplied pack: badger / stag / boar).
//
// Visual-only wildlife for the iso field: deterministic per-chunk residents
// that wander smoothly around a home tile (sine wander, no collision, no sim
// state). Facing snaps to the nearest of the pack's NE/NW/SE/SW directions.
// Nothing here touches game logic, saves, or NPC simulation.

export type CritterSpecies = 'badger' | 'stag' | 'boar';
export type CritterDir = 'NE' | 'NW' | 'SE' | 'SW';
export type CritterAnim = 'idle' | 'walk';

export const CRITTER_SPECIES: CritterSpecies[] = ['badger', 'stag', 'boar'];
export const CRITTER_DIRS: CritterDir[] = ['NE', 'NW', 'SE', 'SW'];

// Per-file strip metadata (cell w/h in source px, frame count). Generated
// from the normalized strips by work script; frames are uniform cells.
export const CRITTER_CELLS: Record<string, { w: number; h: number; frames: number }> = {
  'badger_NE_idle.png': { w: 26, h: 32, frames: 22 },
  'badger_NE_walk.png': { w: 25, h: 32, frames: 9 },
  'badger_NW_idle.png': { w: 26, h: 32, frames: 22 },
  'badger_NW_walk.png': { w: 25, h: 32, frames: 9 },
  'badger_SE_idle.png': { w: 24, h: 32, frames: 22 },
  'badger_SE_walk.png': { w: 25, h: 32, frames: 9 },
  'badger_SW_idle.png': { w: 24, h: 32, frames: 22 },
  'badger_SW_walk.png': { w: 25, h: 32, frames: 9 },
  'boar_NE_idle.png': { w: 46, h: 32, frames: 7 },
  'boar_NE_walk.png': { w: 46, h: 32, frames: 4 },
  'boar_NW_idle.png': { w: 46, h: 32, frames: 7 },
  'boar_NW_walk.png': { w: 46, h: 32, frames: 4 },
  'boar_SE_idle.png': { w: 46, h: 32, frames: 7 },
  'boar_SE_walk.png': { w: 46, h: 32, frames: 4 },
  'boar_SW_idle.png': { w: 46, h: 32, frames: 7 },
  'boar_SW_walk.png': { w: 46, h: 32, frames: 4 },
  'stag_NE_idle.png': { w: 30, h: 41, frames: 24 },
  'stag_NE_walk.png': { w: 27, h: 41, frames: 11 },
  'stag_NW_idle.png': { w: 30, h: 41, frames: 24 },
  'stag_NW_walk.png': { w: 27, h: 41, frames: 11 },
  'stag_SE_idle.png': { w: 29, h: 41, frames: 24 },
  'stag_SE_walk.png': { w: 28, h: 41, frames: 11 },
  'stag_SW_idle.png': { w: 29, h: 41, frames: 24 },
  'stag_SW_walk.png': { w: 28, h: 41, frames: 11 },
};

export function critterFile(species: CritterSpecies, dir: CritterDir, anim: CritterAnim): string {
  return `${species}_${dir}_${anim}.png`;
}

/**
 * Tile-space velocity -> nearest pack direction. Screen mapping: tile +x is
 * screen right-down, tile +y is screen left-down, so screen x = vx - vy and
 * screen y = vx + vy; NE is screen up-right.
 */
export function critterDirFor(vx: number, vy: number): CritterDir {
  const sx = vx - vy, sy = vx + vy;
  if (sx >= 0 && sy < 0) return 'NE';
  if (sx < 0 && sy < 0) return 'NW';
  if (sx >= 0) return 'SE';
  return 'SW';
}

// ---------------------------------------------------------------------------
// Deterministic per-chunk residents
// ---------------------------------------------------------------------------

export interface AmbientCritter {
  species: CritterSpecies;
  /** Home tile (chunk-local, field units). */
  homeX: number; homeY: number;
  phase: number;
  /** Wander angular speed (rad/sec) and radius (tiles). */
  speed: number; radius: number;
}

function hashChunk(cx: number, cy: number, salt: number): number {
  let h = (Math.imul(cx | 0, 73856093) ^ Math.imul(cy | 0, 19349663) ^ Math.imul(salt | 0, 83492791)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h;
}

/**
 * Ambient critters for a chunk. isLand filters homes to walkable ground
 * (the view passes terrain/water knowledge). Deterministic: same chunk and
 * same land always yields the same residents.
 */
export function crittersForChunk(
  cx: number, cy: number, fieldSize: number,
  isLand: (lx: number, ly: number) => boolean,
): AmbientCritter[] {
  const out: AmbientCritter[] = [];
  const count = hashChunk(cx, cy, 5) % 3; // 0-2 residents
  for (let i = 0; i < count; i++) {
    const h = hashChunk(cx, cy, 100 + i);
    const species = CRITTER_SPECIES[h % CRITTER_SPECIES.length];
    const margin = 6;
    const homeX = margin + (h >>> 8) % Math.max(1, fieldSize - margin * 2);
    const homeY = margin + (h >>> 20) % Math.max(1, fieldSize - margin * 2);
    if (!isLand(homeX, homeY)) continue;
    out.push({
      species,
      homeX, homeY,
      phase: ((h >>> 3) % 628) / 100,
      speed: 0.25 + ((h >>> 11) % 40) / 100,
      radius: 2 + ((h >>> 17) % 40) / 10,
    });
  }
  return out;
}

export interface CritterPose {
  x: number; y: number;
  dir: CritterDir;
  moving: boolean;
}

/** Smooth bounded wander around home; velocity picks the facing. */
export function critterPose(c: AmbientCritter, nowMs: number): CritterPose {
  const t = nowMs / 1000;
  const w1 = c.speed, w2 = c.speed * 0.77;
  const x = c.homeX + Math.sin(t * w1 + c.phase) * c.radius;
  const y = c.homeY + Math.sin(t * w2 + c.phase * 1.7) * c.radius;
  const vx = Math.cos(t * w1 + c.phase) * w1 * c.radius;
  const vy = Math.cos(t * w2 + c.phase * 1.7) * w2 * c.radius;
  return { x, y, dir: critterDirFor(vx, vy), moving: Math.hypot(vx, vy) > 0.12 };
}

// ---------------------------------------------------------------------------
// Loading + canvas draw
// ---------------------------------------------------------------------------

const imgs = new Map<string, HTMLImageElement>();
const warned = new Set<string>();
const failedImgs = new Set<HTMLImageElement>();
let preloadStarted = false;

export function preloadCritters(): void {
  if (preloadStarted || typeof window === 'undefined') return;
  preloadStarted = true;
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  for (const key of Object.keys(CRITTER_CELLS)) {
    const url = `${base}iso-critters/${key}`;
    const im = new Image();
    im.onerror = () => { if (!warned.has(url)) { warned.add(url); console.warn(`[critters] missing: ${url}`); } failedImgs.add(im); };
    im.src = url;
    imgs.set(key, im);
  }
}

function imgReady(im: HTMLImageElement | undefined): im is HTMLImageElement {
  return !!im && im.complete && im.naturalWidth > 0;
}

export function crittersReady(): boolean {
  if (!preloadStarted) return false;
  for (const im of imgs.values()) {
    if (!imgReady(im) && !failedImgs.has(im)) return false;
  }
  return true;
}

/**
 * Draw one critter, bottom-anchored at the screen point of its tile position.
 * toScreen maps tile space -> screen px (feet anchor).
 */
export function drawCritter(
  g: CanvasRenderingContext2D,
  c: AmbientCritter,
  nowMs: number,
  toScreen: (tx: number, ty: number) => { x: number; y: number },
): void {
  const pose = critterPose(c, nowMs);
  const anim: CritterAnim = pose.moving ? 'walk' : 'idle';
  const key = critterFile(c.species, pose.dir, anim);
  const im = imgs.get(key);
  const meta = CRITTER_CELLS[key];
  if (!imgReady(im) || !meta) return;
  const fps = anim === 'walk' ? 8 : 5;
  const f = (Math.floor(nowMs / 1000 * fps + c.phase * 2) % meta.frames + meta.frames) % meta.frames;
  const p = toScreen(pose.x, pose.y);
  const dw = meta.w * 2, dh = meta.h * 2;
  // soft shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.ellipse(p.x, p.y + 2, dw * 0.28, 5, 0, 0, 7); g.fill();
  const s = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  try {
    g.drawImage(im, f * meta.w, 0, meta.w, meta.h, Math.round(p.x - dw / 2), Math.round(p.y - dh), dw, dh);
  } finally {
    g.imageSmoothingEnabled = s;
  }
}
