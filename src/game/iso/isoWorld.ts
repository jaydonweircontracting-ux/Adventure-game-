// Data model + persistence + edit ops for the isometric demo world (?iso=1).
// The world is fully data-driven so the in-game map builder can reshape it.
import type { TilePoint } from './projection';

export type Terrain = 'grass' | 'dirt' | 'sand' | 'stone' | 'water';

export interface HutRect { x0: number; y0: number; x1: number; y1: number }
export interface StallRect { x0: number; y0: number; x1: number }
export interface WallTile { x: number; y: number; h: boolean } // h=true: horizontal (north-wall style); false: vertical
export interface WallRun { x0: number; y0: number; x1: number; y1: number; h: boolean }
export interface NpcSpawn { name: string; look: number; x: number; y: number; waypoints: TilePoint[] }

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
  npcSpawns: Array<{ name: string; look: number; dx: number; dy: number; waypoints: Array<{ dx: number; dy: number }> }>;
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

function hash2(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = (h * 1274126177) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export function defaultWorld(): IsoWorld {
  // 200x200 with the town in the middle (center tile 100,100).
  const w = 200, h = 200;
  const C = 100; // town center
  const terrain: Record<string, Terrain> = {};
  const T = (x: number, y: number, t: Terrain) => { terrain[terrainKey(x, y)] = t; };
  // sand plaza around the courtyard center
  for (let x = C - 4; x <= C + 3; x++) for (let y = C - 4; y <= C + 3; y++) T(x, y, 'sand');
  // dirt cross roads (full span)
  for (let y = 0; y < h; y++) { T(C - 1, y, 'dirt'); T(C, y, 'dirt'); }
  for (let x = 0; x < w; x++) { T(x, C - 1, 'dirt'); T(x, C, 'dirt'); }
  // pond (north-east of town)
  for (let x = C + 19; x <= C + 23; x++) for (let y = C - 19; y <= C - 15; y++) T(x, y, 'water');

  const walls: WallTile[] = [];
  for (let x = C - 8; x <= C + 7; x++) {
    if (x === C - 1 || x === C) continue; // door gap
    walls.push({ x, y: C - 8, h: true });
  }
  for (let y = C - 8; y <= C + 7; y++) walls.push({ x: C - 8, y, h: false });

  const trees: TilePoint[] = [
    wp(76, 76), wp(122, 76), wp(76, 122), wp(122, 122),
    wp(80, 102), wp(120, 92), wp(102, 78), wp(92, 120),
    wp(117, 80), wp(84, 116), wp(110, 124), wp(124, 110),
    wp(118, 80), wp(124, 82),
  ];
  const rocks: TilePoint[] = [wp(87, 102), wp(112, 84), wp(97, 117), wp(120, 120), wp(78, 92)];
  // deterministic wilderness scatter outside the town
  for (let x = 3; x < w - 3; x++) for (let y = 3; y < h - 3; y++) {
    const inTown = Math.abs(x - C) <= 24 && Math.abs(y - C) <= 24;
    const onRoad = x === C - 1 || x === C || y === C - 1 || y === C;
    const inPond = x >= C + 18 && x <= C + 24 && y >= C - 20 && y <= C - 14;
    if (inTown || onRoad || inPond) continue;
    const r = hash2(x, y, 7);
    if (r < 0.006) trees.push(wp(x, y));
    else if (r < 0.008) rocks.push(wp(x, y));
  }

  return {
    v: 4, w, h, terrain, walls,
    huts: [
      { x0: C - 4, y0: C - 5, x1: C - 2, y1: C - 3 },
      { x0: C + 2, y0: C + 2, x1: C + 4, y1: C + 4 },
      { x0: C - 18, y0: C - 18, x1: C - 16, y1: C - 16 },
      { x0: C + 16, y0: C + 12, x1: C + 18, y1: C + 14 },
    ],
    stalls: [
      { x0: C - 6, y0: C - 4, x1: C - 5 },
      { x0: C + 5, y0: C + 1, x1: C + 6 },
      { x0: C - 14, y0: C - 16, x1: C - 13 },
      { x0: C + 12, y0: C + 16, x1: C + 13 },
    ],
    trees,
    rocks,
    crates: [wp(C - 2, C - 2), wp(C + 3, C + 5), wp(C - 16, C - 17), wp(C + 15, C + 13)],
    npcSpawns: [
      { name: 'Bram', look: 1, x: C - 3, y: C - 6, waypoints: [wp(C - 6, C - 6), wp(C, C - 6), wp(C - 3, C - 2)] },
      { name: 'Wren', look: 2, x: C + 5, y: C + 3, waypoints: [wp(C + 2, C + 2), wp(C + 7, C + 4), wp(C + 5, C)] },
      { name: 'Odo', look: 3, x: C - 17, y: C - 14, waypoints: [wp(C - 19, C - 15), wp(C - 15, C - 13), wp(C - 17, C - 12)] },
      { name: 'Sella', look: 4, x: C + 14, y: C + 14, waypoints: [wp(C + 12, C + 13), wp(C + 16, C + 15), wp(C + 14, C + 17)] },
    ],
    playerStart: wp(C - 1, C + 5),
  };
}

export function loadWorld(): IsoWorld {
  try {
    const raw = localStorage.getItem(WORLD_KEY);
    if (raw) {
      const w = JSON.parse(raw) as IsoWorld;
      if (w && (w.v === 2 || w.v === 3 || w.v === 4) && w.w >= 10 && w.h >= 10) {
        // migrate v2 npc color looks (tunic/hair) to v3 sprite look indices
        if (w.v === 2 && Array.isArray(w.npcSpawns)) {
          w.npcSpawns = w.npcSpawns.map((s: NpcSpawn, i: number) => ({
            name: s.name, look: 1 + (i % 4), x: s.x, y: s.y, waypoints: s.waypoints || [],
          }));
          w.v = 3;
          saveWorld(w);
        }
        // migrate v3 -> v4: grow to 200x200 and shift the old town to the center
        if (w.v === 3) {
          const dx = Math.floor((200 - w.w) / 2), dy = Math.floor((200 - w.h) / 2);
          const sh = (x: number, y: number) => ({ tx: x + dx, ty: y + dy });
          const terrain: Record<string, Terrain> = {};
          for (const [k, t] of Object.entries(w.terrain)) {
            const [x, y] = k.split(',').map(Number);
            terrain[terrainKey(x + dx, y + dy)] = t as Terrain;
          }
          const moved: IsoWorld = {
            ...w, v: 4, w: 200, h: 200, terrain,
            walls: w.walls.map(t => ({ x: t.x + dx, y: t.y + dy, h: t.h })),
            huts: w.huts.map(hh => ({ x0: hh.x0 + dx, y0: hh.y0 + dy, x1: hh.x1 + dx, y1: hh.y1 + dy })),
            stalls: w.stalls.map(s => ({ x0: s.x0 + dx, y0: s.y0 + dy, x1: s.x1 + dx })),
            trees: w.trees.map(t => sh(t.tx, t.ty)),
            rocks: w.rocks.map(t => sh(t.tx, t.ty)),
            crates: w.crates.map(t => sh(t.tx, t.ty)),
            npcSpawns: w.npcSpawns.map(s => ({
              ...s, x: s.x + dx, y: s.y + dy,
              waypoints: (s.waypoints || []).map(p => sh(p.tx, p.ty)),
            })),
            playerStart: sh(w.playerStart.tx, w.playerStart.ty),
          };
          saveWorld(moved);
          return moved;
        }
        return w;
      }
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
        name: s.name, look: s.look, dx: s.x - r.x0, dy: s.y - r.y0,
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
        name: e.name, look: e.look, x, y,
        waypoints: e.waypoints.map(p => ({ tx: tx + p.dx, ty: ty + p.dy })).filter(p => inBounds(nw, p.tx, p.ty)),
      });
    }
  }
  return nw;
}
