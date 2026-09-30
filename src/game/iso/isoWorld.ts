// Data model + persistence + edit ops for the isometric demo world (?iso=1).
// The world is fully data-driven so the in-game map builder can reshape it.
import type { TilePoint } from './projection';

export type Terrain = 'grass' | 'dirt' | 'sand' | 'stone' | 'water';

export interface HutRect { x0: number; y0: number; x1: number; y1: number }
export interface StallRect { x0: number; y0: number; x1: number }
export interface WallTile { x: number; y: number; h: boolean } // h=true: horizontal (north-wall style); false: vertical
export interface WallRun { x0: number; y0: number; x1: number; y1: number; h: boolean }
export interface NpcSpawn { name: string; tunic: string; hair: string; x: number; y: number; waypoints: TilePoint[] }

export interface IsoWorld {
  v: number;
  w: number;
  h: number;
  terrain: Record<string, Terrain>; // "x,y" -> terrain (grass is the default, not stored)
  walls: WallTile[];
  huts: HutRect[];
  stalls: StallRect[];
  trees: TilePoint[];
  rocks: TilePoint[];
  crates: TilePoint[];
  npcSpawns: NpcSpawn[];
  playerStart: TilePoint;
}

export interface Clipboard {
  terrain: Array<{ dx: number; dy: number; t: Terrain }>;
  walls: Array<{ dx: number; dy: number; h: boolean }>;
  huts: Array<{ dx0: number; dy0: number; dx1: number; dy1: number }>;
  stalls: Array<{ dx0: number; dy: number; dx1: number }>;
  trees: Array<{ dx: number; dy: number }>;
  rocks: Array<{ dx: number; dy: number }>;
  crates: Array<{ dx: number; dy: number }>;
  npcSpawns: Array<{ name: string; tunic: string; hair: string; dx: number; dy: number; waypoints: Array<{ dx: number; dy: number }> }>;
}

const WORLD_KEY = 'iso-world-v2';
export const WALL_H = 46;
export const HUT_H = 64;

export function terrainKey(x: number, y: number): string { return `${x},${y}`; }
export function terrainAt(w: IsoWorld, x: number, y: number): Terrain {
  return w.terrain[terrainKey(x, y)] || 'grass';
}
export function inBounds(w: IsoWorld, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w.w && y < w.h;
}

export function hutAt(w: IsoWorld, x: number, y: number): HutRect | null {
  for (const h of w.huts) {
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h;
  }
  return null;
}

export function isWalkableWorld(w: IsoWorld, crates: TilePoint[], x: number, y: number): boolean {
  if (!inBounds(w, x, y)) return false;
  if (terrainAt(w, x, y) === 'water') return false;
  for (const wl of w.walls) if (wl.x === x && wl.y === y) return false;
  const hut = hutAt(w, x, y);
  if (hut) {
    // only the doorway tile (SE corner) is enterable
    if (!(x === hut.x1 && y === hut.y1)) return false;
  }
  for (const s of w.stalls) if (y === s.y0 && x >= s.x0 && x <= s.x1) return false;
  for (const t of w.trees) if (t.tx === x && t.ty === y) return false;
  for (const r of w.rocks) if (r.tx === x && r.ty === y) return false;
  for (const c of crates) if (c.tx === x && c.ty === y) return false;
  return true;
}

// Merge single wall tiles into runs for drawing.
export function mergeWallRuns(walls: WallTile[]): WallRun[] {
  const runs: WallRun[] = [];
  const hh = walls.filter(t => t.h).sort((a, b) => a.y - b.y || a.x - b.x);
  let cur: WallRun | null = null;
  for (const t of hh) {
    if (cur && cur.y0 === t.y && t.x === cur.x1 + 1) cur.x1 = t.x;
    else { cur = { x0: t.x, y0: t.y, x1: t.x, y1: t.y, h: true }; runs.push(cur); }
  }
  const vv = walls.filter(t => !t.h).sort((a, b) => a.x - b.x || a.y - b.y);
  cur = null;
  for (const t of vv) {
    if (cur && cur.x0 === t.x && t.y === cur.y1 + 1) cur.y1 = t.y;
    else { cur = { x0: t.x, y0: t.y, x1: t.x, y1: t.y, h: false }; runs.push(cur); }
  }
  return runs;
}

function wp(x: number, y: number): TilePoint { return { tx: x, ty: y }; }

export function defaultWorld(): IsoWorld {
  // 56x56 = 3136 tiles ~ 8x the old 20x20 demo (400 tiles).
  const w = 56, h = 56;
  const terrain: Record<string, Terrain> = {};
  const T = (x: number, y: number, t: Terrain) => { terrain[terrainKey(x, y)] = t; };
  // sand plaza around the courtyard center
  for (let x = 24; x <= 31; x++) for (let y = 24; y <= 31; y++) T(x, y, 'sand');
  // dirt cross roads
  for (let y = 0; y < h; y++) { T(27, y, 'dirt'); T(28, y, 'dirt'); }
  for (let x = 0; x < w; x++) { T(x, 27, 'dirt'); T(x, 28, 'dirt'); }
  // pond
  for (let x = 47; x <= 51; x++) for (let y = 9; y <= 13; y++) T(x, y, 'water');

  const walls: WallTile[] = [];
  for (let x = 20; x <= 35; x++) {
    if (x === 27 || x === 28) continue; // door gap
    walls.push({ x, y: 20, h: true });
  }
  for (let y = 20; y <= 35; y++) walls.push({ x: 20, y, h: false });

  return {
    v: 2, w, h, terrain, walls,
    huts: [
      { x0: 24, y0: 23, x1: 26, y1: 25 },
      { x0: 30, y0: 30, x1: 32, y1: 32 },
      { x0: 10, y0: 10, x1: 12, y1: 12 },
      { x0: 44, y0: 40, x1: 46, y1: 42 },
    ],
    stalls: [
      { x0: 22, y0: 24, x1: 23 },
      { x0: 33, y0: 29, x1: 34 },
      { x0: 14, y0: 12, x1: 15 },
      { x0: 40, y0: 44, x1: 41 },
    ],
    trees: [
      wp(4, 4), wp(50, 4), wp(4, 50), wp(50, 50),
      wp(8, 30), wp(48, 20), wp(30, 6), wp(20, 48),
      wp(45, 8), wp(12, 44), wp(38, 52), wp(52, 38),
      wp(46, 8), wp(52, 10),
    ],
    rocks: [wp(15, 30), wp(40, 12), wp(25, 45), wp(48, 48), wp(6, 20)],
    crates: [wp(26, 26), wp(31, 33), wp(12, 11), wp(43, 41)],
    npcSpawns: [
      { name: 'Bram', tunic: '#3b6fd4', hair: '#5a3a22', x: 25, y: 22, waypoints: [wp(22, 22), wp(28, 22), wp(25, 26)] },
      { name: 'Wren', tunic: '#b44a3c', hair: '#222222', x: 33, y: 31, waypoints: [wp(30, 30), wp(35, 32), wp(33, 28)] },
      { name: 'Odo', tunic: '#4a8b5c', hair: '#8a5a2a', x: 11, y: 14, waypoints: [wp(9, 13), wp(13, 15), wp(11, 16)] },
      { name: 'Sella', tunic: '#8b5aa0', hair: '#d9c08a', x: 42, y: 42, waypoints: [wp(40, 41), wp(44, 43), wp(42, 45)] },
    ],
    playerStart: wp(27, 33),
  };
}

export function loadWorld(): IsoWorld {
  try {
    const raw = localStorage.getItem(WORLD_KEY);
    if (raw) {
      const w = JSON.parse(raw) as IsoWorld;
      if (w && w.v === 2 && w.w >= 10 && w.h >= 10) return w;
    }
  } catch { /* fall through to default */ }
  const w = defaultWorld();
  // migrate old v1 demo save: keep crate + player positions
  try {
    const raw = localStorage.getItem('iso-room-v1');
    if (raw) {
      const old = JSON.parse(raw);
      if (old && old.crates && Array.isArray(old.crates)) {
        const cs = old.crates.filter((c: TilePoint) => inBounds(w, c.tx + 21, c.ty + 12))
          .map((c: TilePoint) => wp(c.tx + 21, c.ty + 12));
        if (cs.length > 0) w.crates = cs;
      }
    }
  } catch { /* ignore */ }
  return w;
}

export function saveWorld(w: IsoWorld): void {
  try { localStorage.setItem(WORLD_KEY, JSON.stringify(w)); } catch { /* ignore */ }
}

export function resizeWorld(w: IsoWorld, nw: number, nh: number): IsoWorld {
  nw = Math.max(10, Math.min(200, Math.round(nw)));
  nh = Math.max(10, Math.min(200, Math.round(nh)));
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < nw && y < nh;
  const terrain: Record<string, Terrain> = {};
  for (const [k, t] of Object.entries(w.terrain)) {
    const [x, y] = k.split(',').map(Number);
    if (ok(x, y)) terrain[k] = t;
  }
  return {
    ...w, w: nw, h: nh, terrain,
    walls: w.walls.filter(t => ok(t.x, t.y)),
    huts: w.huts.filter(h => ok(h.x0, h.y0) && ok(h.x1, h.y1)),
    stalls: w.stalls.filter(s => ok(s.x0, s.y0) && ok(s.x1, s.y0)),
    trees: w.trees.filter(t => ok(t.tx, t.ty)),
    rocks: w.rocks.filter(t => ok(t.tx, t.ty)),
    crates: w.crates.filter(t => ok(t.tx, t.ty)),
    npcSpawns: w.npcSpawns.filter(s => ok(s.x, s.y)),
    playerStart: ok(w.playerStart.tx, w.playerStart.ty) ? w.playerStart : wp(Math.floor(nw / 2), Math.floor(nh / 2)),
  };
}

export interface Region { x0: number; y0: number; x1: number; y1: number }

export function copyRegion(w: IsoWorld, r: Region): Clipboard {
  const inR = (x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const clip: Clipboard = { terrain: [], walls: [], huts: [], stalls: [], trees: [], rocks: [], crates: [], npcSpawns: [] };
  for (const [k, t] of Object.entries(w.terrain)) {
    const [x, y] = k.split(',').map(Number);
    if (inR(x, y)) clip.terrain.push({ dx: x - r.x0, dy: y - r.y0, t });
  }
  for (const wl of w.walls) if (inR(wl.x, wl.y)) clip.walls.push({ dx: wl.x - r.x0, dy: wl.y - r.y0, h: wl.h });
  for (const h of w.huts) {
    if (inR(h.x0, h.y0) && inR(h.x1, h.y1)) {
      clip.huts.push({ dx0: h.x0 - r.x0, dy0: h.y0 - r.y0, dx1: h.x1 - r.x0, dy1: h.y1 - r.y0 });
    }
  }
  for (const s of w.stalls) {
    if (inR(s.x0, s.y0) && inR(s.x1, s.y0)) clip.stalls.push({ dx0: s.x0 - r.x0, dy: s.y0 - r.y0, dx1: s.x1 - r.x0 });
  }
  for (const t of w.trees) if (inR(t.tx, t.ty)) clip.trees.push({ dx: t.tx - r.x0, dy: t.ty - r.y0 });
  for (const t of w.rocks) if (inR(t.tx, t.ty)) clip.rocks.push({ dx: t.tx - r.x0, dy: t.ty - r.y0 });
  for (const t of w.crates) if (inR(t.tx, t.ty)) clip.crates.push({ dx: t.tx - r.x0, dy: t.ty - r.y0 });
  for (const s of w.npcSpawns) {
    if (inR(s.x, s.y)) {
      clip.npcSpawns.push({
        name: s.name, tunic: s.tunic, hair: s.hair, dx: s.x - r.x0, dy: s.y - r.y0,
        waypoints: s.waypoints.filter(p => inR(p.tx, p.ty)).map(p => ({ dx: p.tx - r.x0, dy: p.ty - r.y0 })),
      });
    }
  }
  return clip;
}

export function clipboardSize(c: Clipboard | null): number {
  if (!c) return 0;
  return c.terrain.length + c.walls.length + c.huts.length + c.stalls.length +
    c.trees.length + c.rocks.length + c.crates.length + c.npcSpawns.length;
}

export function pasteClipboard(w: IsoWorld, c: Clipboard, tx: number, ty: number): IsoWorld {
  const nw = { ...w, walls: [...w.walls], huts: [...w.huts], stalls: [...w.stalls], trees: [...w.trees], rocks: [...w.rocks], crates: [...w.crates], npcSpawns: [...w.npcSpawns], terrain: { ...w.terrain } };
  for (const e of c.terrain) {
    const x = tx + e.dx, y = ty + e.dy;
    if (inBounds(nw, x, y)) nw.terrain[terrainKey(x, y)] = e.t;
  }
  for (const e of c.walls) {
    const x = tx + e.dx, y = ty + e.dy;
    if (inBounds(nw, x, y) && !nw.walls.some(t => t.x === x && t.y === y)) nw.walls.push({ x, y, h: e.h });
  }
  for (const e of c.huts) {
    const x0 = tx + e.dx0, y0 = ty + e.dy0, x1 = tx + e.dx1, y1 = ty + e.dy1;
    if (inBounds(nw, x0, y0) && inBounds(nw, x1, y1)) nw.huts.push({ x0, y0, x1, y1 });
  }
  for (const e of c.stalls) {
    const x0 = tx + e.dx0, y = ty + e.dy, x1 = tx + e.dx1;
    if (inBounds(nw, x0, y) && inBounds(nw, x1, y)) nw.stalls.push({ x0, y0: y, x1 });
  }
  const stamp = (list: TilePoint[], e: { dx: number; dy: number }) => {
    const x = tx + e.dx, y = ty + e.dy;
    if (inBounds(nw, x, y)) list.push({ tx: x, ty: y });
  };
  for (const e of c.trees) stamp(nw.trees, e);
  for (const e of c.rocks) stamp(nw.rocks, e);
  for (const e of c.crates) stamp(nw.crates, e);
  for (const e of c.npcSpawns) {
    const x = tx + e.dx, y = ty + e.dy;
    if (inBounds(nw, x, y)) {
      nw.npcSpawns.push({
        name: e.name, tunic: e.tunic, hair: e.hair, x, y,
        waypoints: e.waypoints.map(p => ({ tx: tx + p.dx, ty: ty + p.dy })).filter(p => inBounds(nw, p.tx, p.ty)),
      });
    }
  }
  return nw;
}
