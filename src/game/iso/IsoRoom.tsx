/**
 * BUILD 357: Isometric 2.5D vertical slice — one 20x20 chunk
 * (four 10x10 quadrants merged into a single area).
 *
 * Separate from the main game renderer: the world model here is a tiny
 * tile grid (integer tile coords, tile collision). Reached via ?iso=1;
 * the main game's systems are untouched.
 *
 * Contents: diamond floor, stone walls with a real doorway, two enterable
 * huts, two market stalls, trees, rocks, movable crates (tap to pick up /
 * tap a tile to place), wandering NPCs, tile-based player movement with
 * smooth interpolation, depth-sorted canvas rendering, smooth camera,
 * zoom, D-pad + keyboard, tap-to-move pathfinding, localStorage save/load.
 */
import { useEffect, useRef, useState } from 'react';
import {
  TILE_W, TILE_H, WALL_H,
  isoToScreen, screenToTileInt, depthKey, findPath,
  type TilePoint,
} from './projection';

// ---------- room model ----------
// One 20x20 chunk (four 10x10 quadrants as one area).
const BX0 = 0, BX1 = 19, BY0 = -3, BY1 = 19; // walkable bounds (courtyard + meadow apron)
const DOOR_FROM = 9, DOOR_TO = 10;           // door gap tiles in the north wall
const HUT_H = 64;

interface HutRect { x0: number; x1: number; y0: number; y1: number; }
const HUTS: HutRect[] = [
  { x0: 6, x1: 8, y0: 5, y1: 7 },     // hut footprint; south side open (door)
  { x0: 12, x1: 14, y0: 12, y1: 14 },
];
interface StallRect { x0: number; x1: number; y: number; }
const STALLS: StallRect[] = [
  { x0: 2, x1: 3, y: 4 },
  { x0: 15, x1: 16, y: 12 },
];
const TREES: TilePoint[] = [
  { tx: 2, ty: -2 }, { tx: 17, ty: -2 }, { tx: 16, ty: 3 }, { tx: 4, ty: 15 },
];
const ROCKS: TilePoint[] = [
  { tx: 7, ty: -2 }, { tx: 12, ty: -2 }, { tx: 3, ty: 12 },
];
const CRATE_STARTS: TilePoint[] = [{ tx: 5, ty: 5 }, { tx: 13, ty: 8 }];
const PLAYER_START: TilePoint = { tx: 9, ty: 16 };

interface NpcDef {
  start: TilePoint; waypoints: TilePoint[];
  tunic: string; hair: string; facing: 'left' | 'right';
}
const NPC_DEFS: NpcDef[] = [
  {
    start: { tx: 1, ty: 1 }, tunic: '#3fa34d', hair: '#7a4a21', facing: 'left',
    waypoints: [{ tx: 1, ty: 1 }, { tx: 8, ty: 2 }, { tx: 5, ty: 12 }, { tx: 2, ty: 16 }],
  },
  {
    start: { tx: 14, ty: 2 }, tunic: '#b5651d', hair: '#2b2b2b', facing: 'right',
    waypoints: [{ tx: 14, ty: 2 }, { tx: 17, ty: 8 }, { tx: 12, ty: 16 }, { tx: 16, ty: 15 }],
  },
];

const SAVE_KEY = 'isoRoomV1';
const STEP_MS = 170;   // player ms per tile
const NPC_STEP_MS = 300;

type FloorKind = 'grass' | 'path' | 'wood' | 'meadow';
function floorAt(tx: number, ty: number): FloorKind {
  if (ty < 0) return 'meadow';
  for (const h of HUTS) if (tx >= h.x0 && tx <= h.x1 && ty >= h.y0 && ty <= h.y1) return 'wood';
  if (tx === 9 || tx === 10) return 'path';  // door path, north-south
  if (ty === 9) return 'path';               // cross path, east-west
  return 'grass';
}

interface SliceState {
  player: TilePoint; npcs: TilePoint[]; crates: TilePoint[];
}

function loadSaved(): SliceState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SliceState;
    if (!s || !s.player || !Array.isArray(s.crates)) return null;
    return s;
  } catch { return null; }
}

interface NpcState {
  tx: number; ty: number; fx: number; fy: number;
  from: { x: number; y: number };
  path: TilePoint[]; stepT: number; facing: 'left' | 'right';
  moving: boolean; thinkT: number;
  waypoints: TilePoint[]; tunic: string; hair: string;
}

export default function IsoRoomDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef({
    hold: (_d: string, _on: boolean) => { /* replaced in effect */ },
    zoomIn: () => { /* replaced in effect */ },
    zoomOut: () => { /* replaced in effect */ },
    back: () => { window.location.href = window.location.pathname; },
  });
  const [toast, setToast] = useState('');
  const [carrying, setCarrying] = useState(false);
  const [coords, setCoords] = useState(`${PLAYER_START.tx}, ${PLAYER_START.ty}`);
  const toastTimer = useRef<number>(0);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ----- mutable sim state (refs, not React state) -----
    const saved = loadSaved();
    const player = {
      tx: saved?.player.tx ?? PLAYER_START.tx,
      ty: saved?.player.ty ?? PLAYER_START.ty,
      fx: 0, fy: 0,
    };
    player.fx = player.tx; player.fy = player.ty;
    const npcs: NpcState[] = NPC_DEFS.map((d, i) => {
      const sp = saved?.npcs?.[i] ?? d.start;
      return {
        tx: sp.tx, ty: sp.ty, fx: sp.tx, fy: sp.ty,
        from: { x: sp.tx, y: sp.ty },
        path: [] as TilePoint[], stepT: 0, facing: d.facing,
        moving: false, thinkT: 1500 + i * 1200,
        waypoints: d.waypoints, tunic: d.tunic, hair: d.hair,
      };
    });
    let crates: TilePoint[] = (saved?.crates ?? CRATE_STARTS).map(c => ({ tx: c.tx, ty: c.ty }));
    let carryingIdx = -1;
    let playerPath: TilePoint[] = [];
    let playerStepT = 0;
    let playerFacing: 'left' | 'right' = 'right';
    let playerMoving = false;
    const held = new Set<string>();
    const cam = { x: 0, y: 0 };
    let zoom = 1;
    let destroyed = false;

    const isHutWall = (h: HutRect, tx: number, ty: number) =>
      (ty === h.y0 && tx >= h.x0 && tx <= h.x1) ||                 // north wall row
      ((tx === h.x0 || tx === h.x1) && ty > h.y0 && ty <= h.y1);  // side walls

    const isWalkable = (tx: number, ty: number, forNpc: boolean, npcIdx = -1) => {
      if (tx < BX0 || tx > BX1 || ty < BY0 || ty > BY1) return false;
      for (const h of HUTS) if (isHutWall(h, tx, ty)) return false;
      for (const s of STALLS) if (ty === s.y && tx >= s.x0 && tx <= s.x1) return false;
      for (const t of TREES) if (tx === t.tx && ty === t.ty) return false;
      for (const t of ROCKS) if (tx === t.tx && ty === t.ty) return false;
      for (let i = 0; i < crates.length; i++) {
        if (i !== carryingIdx && tx === crates[i].tx && ty === crates[i].ty) return false;
      }
      if (forNpc) {
        if (tx === player.tx && ty === player.ty) return false;
        for (let i = 0; i < npcs.length; i++) {
          if (i !== npcIdx && tx === npcs[i].tx && ty === npcs[i].ty) return false;
        }
      } else {
        for (const n of npcs) if (tx === n.tx && ty === n.ty) return false;
      }
      return true;
    };

    const save = () => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          player: { tx: player.tx, ty: player.ty },
          npcs: npcs.map(n => ({ tx: n.tx, ty: n.ty })),
          crates,
        }));
      } catch { /* noop */ }
    };

    // ----- canvas sizing -----
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ----- static floor cache (offscreen, world coords at zoom 1) -----
    let floorCache: HTMLCanvasElement | null = null;
    let cacheZoom = 0;
    const FLOOR_COLORS: Record<FloorKind, [string, string]> = {
      grass: ['#7ec850', '#75bd49'],
      meadow: ['#93d765', '#8acf5c'],
      path: ['#cfa96b', '#c69e60'],
      wood: ['#a9744f', '#9d6a44'],
    };
    const buildFloorCache = () => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let ty = BY0; ty <= BY1; ty++) for (let tx = BX0; tx <= BX1; tx++) {
        const c = isoToScreen(tx, ty);
        minX = Math.min(minX, c.x - TILE_W / 2); maxX = Math.max(maxX, c.x + TILE_W / 2);
        minY = Math.min(minY, c.y - TILE_H / 2); maxY = Math.max(maxY, c.y + TILE_H / 2);
      }
      const M = 40;
      minX -= M; minY -= M; maxX += M; maxY += M;
      floorCache = document.createElement('canvas');
      floorCache.width = Math.ceil(maxX - minX);
      floorCache.height = Math.ceil(maxY - minY);
      const g = floorCache.getContext('2d')!;
      g.translate(-minX, -minY);
      for (let ty = BY0; ty <= BY1; ty++) for (let tx = BX0; tx <= BX1; tx++) {
        const kind = floorAt(tx, ty);
        const [c1, c2] = FLOOR_COLORS[kind];
        const c = isoToScreen(tx, ty);
        g.beginPath();
        g.moveTo(c.x, c.y - TILE_H / 2);
        g.lineTo(c.x + TILE_W / 2, c.y);
        g.lineTo(c.x, c.y + TILE_H / 2);
        g.lineTo(c.x - TILE_W / 2, c.y);
        g.closePath();
        g.fillStyle = ((tx + ty) & 1) === 0 ? c1 : c2;
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.08)';
        g.lineWidth = 1;
        g.stroke();
        if (kind === 'wood') {
          g.strokeStyle = 'rgba(60,30,10,0.35)';
          g.beginPath();
          g.moveTo(c.x - TILE_W / 2 + 8, c.y - 4); g.lineTo(c.x + TILE_W / 2 - 8, c.y - 4);
          g.moveTo(c.x - TILE_W / 2 + 8, c.y + 4); g.lineTo(c.x + TILE_W / 2 - 8, c.y + 4);
          g.stroke();
        }
        if (kind === 'meadow' && ((tx * 7 + ty * 13) % 5 === 0)) {
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(c.x + 6, c.y - 2, 2, 0, 7); g.fill();
          g.fillStyle = '#ff6b9d';
          g.beginPath(); g.arc(c.x - 8, c.y + 4, 2, 0, 7); g.fill();
        }
      }
      (floorCache as unknown as { _ox: number })._ox = minX;
      (floorCache as unknown as { _oy: number })._oy = minY;
      cacheZoom = zoom;
    };
    // ----- draw helpers (screen space = world iso coords, camera applied by caller) -----
    interface Drawable { depth: number; draw: (g: CanvasRenderingContext2D) => void; }

    function wallQuad(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number,
      h: number, face: string, cap: string) {
      g.beginPath();
      g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1, y1 - h); g.lineTo(x0, y0 - h);
      g.closePath();
      g.fillStyle = face; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.stroke();
      const bx = -9, by = -5; // top cap = wall thickness illusion
      g.beginPath();
      g.moveTo(x0 + bx, y0 - h + by); g.lineTo(x1 + bx, y1 - h + by);
      g.lineTo(x1, y1 - h); g.lineTo(x0, y0 - h);
      g.closePath();
      g.fillStyle = cap; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.stroke();
    }

    // courtyard north wall: from N(BX0,0) to E(BX1,0), door gap at DOOR_FROM..DOOR_TO
    function northWallDrawables(): Drawable[] {
      const out: Drawable[] = [];
      const segs: Array<[number, number]> = [[BX0, DOOR_FROM - 1], [DOOR_TO + 1, BX1]];
      for (const [a, b] of segs) {
        if (a > b) continue;
        const n = isoToScreen(a, 0); const p0 = { x: n.x, y: n.y - TILE_H / 2 };
        const e = isoToScreen(b, 0); const p1 = { x: e.x + TILE_W / 2, y: e.y };
        const depth = depthKey(b, 0);
        out.push({
          depth, draw: (g) => {
            wallQuad(g, p0.x, p0.y, p1.x, p1.y, WALL_H, '#9aa0a8', '#c6ccd4');
            g.strokeStyle = 'rgba(0,0,0,0.12)';
            for (let i = 1; i < 3; i++) {
              const t = i / 3;
              g.beginPath();
              g.moveTo(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t - WALL_H * 0.33);
              g.lineTo(p0.x + (p1.x - p0.x) * t + 14, p0.y + (p1.y - p0.y) * t - WALL_H * 0.33 + 7);
              g.stroke();
            }
          },
        });
      }
      for (const tx of [DOOR_FROM, DOOR_TO + 1]) {
        const n = isoToScreen(tx, 0);
        const px = tx <= DOOR_FROM ? n.x - TILE_W / 2 + 6 : n.x + TILE_W / 2 - 6;
        const py = tx <= DOOR_FROM ? n.y : n.y - TILE_H;
        out.push({
          depth: depthKey(tx, 0) + 1, draw: (g) => {
            g.fillStyle = '#6e4526';
            g.fillRect(px - 4, py - WALL_H - 8, 8, WALL_H + 8);
            g.fillStyle = '#8a5a33';
            g.fillRect(px - 4, py - WALL_H - 8, 8, 4);
          },
        });
      }
      return out;
    }

    function westWallDrawables(): Drawable[] {
      const n = isoToScreen(BX0, 0); const p0 = { x: n.x, y: n.y - TILE_H / 2 };
      const w = isoToScreen(BX0, BY1); const p1 = { x: w.x - TILE_W / 2, y: w.y };
      return [{
        depth: depthKey(BX0, BY1), draw: (g) => {
          wallQuad(g, p0.x, p0.y, p1.x, p1.y, WALL_H, '#8b9098', '#b9bfc7');
        },
      }];
    }

    function hutDrawables(h: HutRect): Drawable[] {
      const out: Drawable[] = [];
      { // north wall (south face, lit)
        const n = isoToScreen(h.x0, h.y0); const p0 = { x: n.x, y: n.y - TILE_H / 2 };
        const e = isoToScreen(h.x1, h.y0); const p1 = { x: e.x + TILE_W / 2, y: e.y };
        out.push({
          depth: depthKey(h.x1, h.y0), draw: (g) => {
            wallQuad(g, p0.x, p0.y, p1.x, p1.y, HUT_H, '#8a5a33', '#b08a5a');
            g.strokeStyle = 'rgba(40,20,5,0.4)';
            for (let i = 1; i < 4; i++) {
              const t = i / 4;
              g.beginPath();
              g.moveTo(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t);
              g.lineTo(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t - HUT_H);
              g.stroke();
            }
          },
        });
      }
      { // west wall (east face, darker)
        const n = isoToScreen(h.x0, h.y0 + 1); const p0 = { x: n.x, y: n.y - TILE_H / 2 };
        const w = isoToScreen(h.x0, h.y1); const p1 = { x: w.x - TILE_W / 2, y: w.y };
        out.push({
          depth: depthKey(h.x0, h.y1), draw: (g) => {
            wallQuad(g, p0.x, p0.y, p1.x, p1.y, HUT_H, '#75502c', '#9a7448');
          },
        });
      }
      { // east wall (east face)
        const e = isoToScreen(h.x1, h.y0 + 1); const p0 = { x: e.x + TILE_W / 2, y: e.y };
        const s = isoToScreen(h.x1, h.y1); const p1 = { x: s.x, y: s.y + TILE_H / 2 };
        out.push({
          depth: depthKey(h.x1, h.y1), draw: (g) => {
            wallQuad(g, p0.x, p0.y, p1.x, p1.y, HUT_H, '#75502c', '#9a7448');
          },
        });
      }
      { // sign by the door
        const c = isoToScreen(h.x1 + 0.5, h.y1 + 0.7);
        out.push({
          depth: depthKey(h.x1, h.y1) + 2, draw: (g) => {
            g.fillStyle = '#6e4526'; g.fillRect(c.x - 2, c.y - 26, 4, 26);
            g.fillStyle = '#c9a86b'; g.fillRect(c.x - 14, c.y - 40, 28, 14);
            g.strokeStyle = '#6e4526'; g.strokeRect(c.x - 14, c.y - 40, 28, 14);
            g.fillStyle = '#4a2f16'; g.font = '9px monospace'; g.textAlign = 'center';
            g.fillText('HUT', c.x, c.y - 29);
          },
        });
      }
      return out;
    }

    function stallDrawables(s: StallRect): Drawable[] {
      const w = isoToScreen(s.x0, s.y); const p0 = { x: w.x - TILE_W / 2, y: w.y };
      const e = isoToScreen(s.x1, s.y); const p1 = { x: e.x + TILE_W / 2, y: e.y };
      return [{
        depth: depthKey(s.x0, s.y), draw: (g) => {
          const ch = 26, ah = 58;
          g.beginPath();
          g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y);
          g.lineTo(p1.x, p1.y - ch); g.lineTo(p0.x, p0.y - ch);
          g.closePath(); g.fillStyle = '#8a5a33'; g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke();
          g.beginPath();
          g.moveTo(p0.x - 6, p0.y - ch - 4); g.lineTo(p1.x + 6, p1.y - ch - 4);
          g.lineTo(p1.x, p1.y - ch); g.lineTo(p0.x, p0.y - ch);
          g.closePath(); g.fillStyle = '#c9a86b'; g.fill(); g.stroke();
          g.fillStyle = '#d94f3d';
          g.beginPath(); g.arc((p0.x + p1.x) / 2 - 20, p0.y - ch - 10, 6, 0, 7); g.fill();
          g.fillStyle = '#e8a13d';
          g.beginPath(); g.arc((p0.x + p1.x) / 2 + 18, p0.y - ch - 10, 6, 0, 7); g.fill();
          g.fillStyle = '#6e4526';
          for (const [px, py] of [[p0.x, p0.y], [p1.x, p1.y]] as Array<[number, number]>) {
            g.fillRect(px - 3, py - ah, 6, ah);
          }
          const stripes = 8;
          for (let i = 0; i < stripes; i++) {
            const t0 = i / stripes, t1 = (i + 1) / stripes;
            const ax0 = p0.x + (p1.x - p0.x) * t0, ay0 = p0.y + (p1.y - p0.y) * t0;
            const ax1 = p0.x + (p1.x - p0.x) * t1, ay1 = p0.y + (p1.y - p0.y) * t1;
            g.beginPath();
            g.moveTo(ax0 - 8, ay0 - ah - 6); g.lineTo(ax1 - 8, ay1 - ah - 6);
            g.lineTo(ax1 + 8, ay1 - ah + 6); g.lineTo(ax0 + 8, ay0 - ah + 6);
            g.closePath();
            g.fillStyle = i % 2 === 0 ? '#d94f3d' : '#f5f0e6';
            g.fill();
          }
        },
      }];
    }

    function treeDrawable(t: TilePoint): Drawable {
      const c = isoToScreen(t.tx, t.ty);
      return {
        depth: depthKey(t.tx, t.ty), draw: (g) => {
          g.fillStyle = 'rgba(0,0,0,0.2)';
          g.beginPath(); g.ellipse(c.x, c.y + 4, 20, 8, 0, 0, 7); g.fill();
          g.fillStyle = '#6b4a2a';
          g.fillRect(c.x - 5, c.y - 30, 10, 32);
          const layers: Array<[number, number, number, string]> = [
            [30, -52, 26, '#2f7d3a'], [24, -70, 22, '#3a9147'], [16, -86, 17, '#46a355'],
          ];
          for (const [rx, yy, ry, col] of layers) {
            g.fillStyle = col;
            g.beginPath(); g.ellipse(c.x, c.y + yy, rx, ry, 0, 0, 7); g.fill();
          }
        },
      };
    }

    function rockDrawable(t: TilePoint): Drawable {
      const c = isoToScreen(t.tx, t.ty);
      return {
        depth: depthKey(t.tx, t.ty), draw: (g) => {
          g.fillStyle = 'rgba(0,0,0,0.18)';
          g.beginPath(); g.ellipse(c.x, c.y + 3, 18, 7, 0, 0, 7); g.fill();
          g.beginPath();
          g.moveTo(c.x - 18, c.y); g.lineTo(c.x - 10, c.y - 20); g.lineTo(c.x + 4, c.y - 24);
          g.lineTo(c.x + 16, c.y - 10); g.lineTo(c.x + 18, c.y); g.closePath();
          g.fillStyle = '#8d8d94'; g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke();
          g.beginPath();
          g.moveTo(c.x - 10, c.y - 20); g.lineTo(c.x + 4, c.y - 24); g.lineTo(c.x + 2, c.y - 12);
          g.closePath(); g.fillStyle = '#a9a9b0'; g.fill();
        },
      };
    }

    function crateDrawable(c: TilePoint): Drawable {
      const p = isoToScreen(c.tx, c.ty);
      const s = 15, h = 22;
      return {
        depth: depthKey(c.tx, c.ty), draw: (g) => {
          g.beginPath();
          g.moveTo(p.x, p.y - h - 8); g.lineTo(p.x + s, p.y - h); g.lineTo(p.x, p.y - h + 8); g.lineTo(p.x - s, p.y - h);
          g.closePath(); g.fillStyle = '#c9a86b'; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke();
          g.beginPath();
          g.moveTo(p.x - s, p.y - h); g.lineTo(p.x, p.y - h + 8); g.lineTo(p.x, p.y + 8); g.lineTo(p.x - s, p.y);
          g.closePath(); g.fillStyle = '#a97e4e'; g.fill(); g.stroke();
          g.beginPath();
          g.moveTo(p.x + s, p.y - h); g.lineTo(p.x, p.y - h + 8); g.lineTo(p.x, p.y + 8); g.lineTo(p.x + s, p.y);
          g.closePath(); g.fillStyle = '#8f6a3f'; g.fill(); g.stroke();
        },
      };
    }

    function personDrawable(px: number, py: number, moving: boolean, facing: 'left' | 'right',
      tunic: string, hair: string, depth: number, bob: number): Drawable {
      const c = isoToScreen(px, py);
      return {
        depth, draw: (g) => {
          const lift = moving ? Math.abs(Math.sin(bob)) * 3 : 0;
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.beginPath(); g.ellipse(c.x, c.y + 3, 12, 5, 0, 0, 7); g.fill();
          g.save();
          g.translate(c.x, c.y - lift);
          if (facing === 'left') g.scale(-1, 1);
          const legSwing = moving ? Math.sin(bob) * 4 : 0;
          g.fillStyle = '#4a3220';
          g.fillRect(-7, -12 + legSwing * 0.4, 6, 12);
          g.fillRect(1, -12 - legSwing * 0.4, 6, 12);
          g.fillStyle = tunic;
          g.beginPath();
          g.moveTo(-10, -12); g.lineTo(10, -12); g.lineTo(8, -30); g.lineTo(-8, -30);
          g.closePath(); g.fill();
          g.fillRect(-13, -28, 4, 14); g.fillRect(9, -28, 4, 14);
          g.fillStyle = '#f2c89b';
          g.beginPath(); g.arc(0, -38, 9, 0, 7); g.fill();
          g.fillStyle = hair;
          g.beginPath(); g.arc(0, -40, 9, Math.PI, 0); g.fill();
          g.fillRect(-9, -40, 4, 8);
          g.restore();
        },
      };
    }
    // ----- tap-to-move / crate interaction -----
    const pFrom = { x: player.tx, y: player.ty };
    const tap = (tx: number, ty: number) => {
      if (carryingIdx >= 0) {
        if (isWalkable(tx, ty, false) && !(tx === player.tx && ty === player.ty)) {
          crates[carryingIdx] = { tx, ty };
          carryingIdx = -1;
          setCarrying(false);
          save();
          showToast('Placed the crate');
        } else {
          showToast("Can't place that there");
        }
        return;
      }
      const ci = crates.findIndex(c => c.tx === tx && c.ty === ty);
      if (ci >= 0) {
        carryingIdx = ci;
        setCarrying(true);
        playerPath = [];
        showToast('Picked up the crate — tap a tile to place it');
        return;
      }
      const path = findPath({ tx: player.tx, ty: player.ty }, { tx, ty },
        (x, y) => isWalkable(x, y, false));
      if (!path) showToast("Can't get there");
      else if (path.length > 0) { playerPath = path; playerStepT = 0; pFrom.x = player.tx; pFrom.y = player.ty; }
    };

    // ----- input -----
    const DIRS: Record<string, { dx: number; dy: number }> = {
      up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
    };
    const keymap: Record<string, string> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const d = keymap[e.code];
      if (d) { e.preventDefault(); held.add(d); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const d = keymap[e.code];
      if (d) held.delete(d);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let pDown: { x: number; y: number; t: number } | null = null;
    const onPointerDown = (e: PointerEvent) => { pDown = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const onPointerUp = (e: PointerEvent) => {
      if (!pDown) return;
      const dx = e.clientX - pDown.x, dy = e.clientY - pDown.y;
      const dtap = performance.now() - pDown.t;
      pDown = null;
      if (dx * dx + dy * dy > 100 || dtap > 600) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const wx = (px - rect.width / 2) / zoom + cam.x;
      const wy = (py - rect.height / 2) / zoom + cam.y;
      const t = screenToTileInt(wx, wy);
      tap(t.tx, t.ty);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    apiRef.current = {
      hold: (d: string, on: boolean) => { if (on) held.add(d); else held.delete(d); },
      zoomIn: () => { zoom = Math.min(2.5, zoom * 1.2); },
      zoomOut: () => { zoom = Math.max(0.5, zoom / 1.2); },
      back: () => { window.location.href = window.location.pathname; },
    };

    // ----- camera init -----
    {
      const c = isoToScreen(player.tx, player.ty);
      cam.x = c.x; cam.y = c.y;
    }

    // ----- main loop -----
    let lastDt = 0;
    const pStepT = { t: 0 };

    const stepChar = (
      ch: { tx: number; ty: number; fx: number; fy: number },
      path: TilePoint[], stepT: { t: number }, from: { x: number; y: number },
      ms: number, onStep: () => void,
    ): { path: TilePoint[]; moving: boolean } => {
      if (path.length === 0) { ch.fx = ch.tx; ch.fy = ch.ty; return { path, moving: false }; }
      stepT.t += lastDt;
      const next = path[0];
      if (stepT.t >= ms) {
        stepT.t = 0;
        ch.tx = next.tx; ch.ty = next.ty;
        path.shift();
        from.x = ch.tx; from.y = ch.ty;
        ch.fx = ch.tx; ch.fy = ch.ty;
        onStep();
      } else {
        const t = stepT.t / ms;
        ch.fx = from.x + (next.tx - from.x) * t;
        ch.fy = from.y + (next.ty - from.y) * t;
      }
      return { path, moving: true };
    };

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (destroyed) return;
      lastDt = Math.min(50, now - last);
      last = now;
      const dt = lastDt;

      // --- player ---
      if (playerPath.length === 0) {
        const arr = [...held];
        const hd = arr.length > 0 ? DIRS[arr[arr.length - 1]] : null;
        if (hd) {
          const nx = player.tx + hd.dx, ny = player.ty + hd.dy;
          if (isWalkable(nx, ny, false)) {
            playerPath = [{ tx: nx, ty: ny }];
            pStepT.t = 0;
            pFrom.x = player.tx; pFrom.y = player.ty;
          }
        }
      }
      {
        const r = stepChar(player, playerPath, pStepT, pFrom, STEP_MS, () => {
          setCoords(`${player.tx}, ${player.ty}`);
          save();
        });
        playerPath = r.path; playerMoving = r.moving;
        if (r.moving && playerPath.length > 0) {
          const n = playerPath[0];
          if (n.tx !== player.tx) playerFacing = n.tx > player.tx ? 'right' : 'left';
        }
      }

      // --- npcs wander ---
      for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        n.thinkT -= dt;
        if (n.path.length === 0 && n.thinkT <= 0) {
          n.thinkT = 2000 + Math.random() * 3000;
          const w = n.waypoints[Math.floor(Math.random() * n.waypoints.length)];
          const p = findPath({ tx: n.tx, ty: n.ty }, w, (x, y) => isWalkable(x, y, true, i));
          if (p && p.length > 0) {
            n.path = p;
            n.stepT = 0;
            n.from.x = n.tx; n.from.y = n.ty;
          }
        }
        const st = { t: n.stepT };
        const r = stepChar(n, n.path, st, n.from, NPC_STEP_MS, () => undefined);
        n.stepT = st.t; n.path = r.path; n.moving = r.moving;
        if (r.moving && n.path.length > 0) {
          const nxt = n.path[0];
          if (nxt.tx !== n.tx) n.facing = nxt.tx > n.tx ? 'right' : 'left';
        }
      }

      // --- camera ---
      {
        const c = isoToScreen(player.fx, player.fy);
        const k = Math.min(1, dt / 90);
        cam.x += (c.x - cam.x) * k;
        cam.y += (c.y - cam.y) * k;
      }

      // --- render ---
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wpx = canvas.clientWidth, hpx = canvas.clientHeight;
      const grad = ctx.createLinearGradient(0, 0, 0, hpx);
      grad.addColorStop(0, '#9fd9f2'); grad.addColorStop(1, '#d9f2df');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, wpx, hpx);
      if (!floorCache || Math.abs(zoom - cacheZoom) > 0.001) buildFloorCache();
      ctx.save();
      ctx.translate(wpx / 2, hpx / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-cam.x, -cam.y);
      const fc = floorCache!;
      ctx.drawImage(fc, (fc as unknown as { _ox: number })._ox, (fc as unknown as { _oy: number })._oy);

      const draws: Drawable[] = [...northWallDrawables(), ...westWallDrawables()];
      for (const h of HUTS) draws.push(...hutDrawables(h));
      for (const s of STALLS) draws.push(...stallDrawables(s));
      for (const t of TREES) draws.push(treeDrawable(t));
      for (const r of ROCKS) draws.push(rockDrawable(r));
      for (let i = 0; i < crates.length; i++) {
        if (i !== carryingIdx) draws.push(crateDrawable(crates[i]));
      }
      for (const n of npcs) {
        draws.push(personDrawable(n.fx, n.fy, n.moving, n.facing, n.tunic, n.hair,
          depthKey(n.fx, n.fy, 1), now / 280));
      }
      draws.push(personDrawable(player.fx, player.fy, playerMoving, playerFacing, '#3b6fd4', '#5a3a22',
        depthKey(player.fx, player.fy, 1), now / 130));
      if (carryingIdx >= 0) {
        const c = isoToScreen(player.fx, player.fy);
        draws.push({
          depth: depthKey(player.fx, player.fy, 2), draw: (g) => {
            const s = 10, h = 13;
            g.save(); g.translate(c.x, c.y - 58);
            g.beginPath();
            g.moveTo(0, -h - 6); g.lineTo(s, -h); g.lineTo(0, -h + 6); g.lineTo(-s, -h);
            g.closePath(); g.fillStyle = '#c9a86b'; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke();
            g.beginPath();
            g.moveTo(-s, -h); g.lineTo(0, -h + 6); g.lineTo(0, 6); g.lineTo(-s, 0);
            g.closePath(); g.fillStyle = '#a97e4e'; g.fill(); g.stroke();
            g.beginPath();
            g.moveTo(s, -h); g.lineTo(0, -h + 6); g.lineTo(0, 6); g.lineTo(s, 0);
            g.closePath(); g.fillStyle = '#8f6a3f'; g.fill(); g.stroke();
            g.restore();
          },
        });
      }
      draws.sort((a, b) => a.depth - b.depth);
      for (const d of draws) d.draw(ctx);

      if (playerPath.length > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (const p of playerPath) {
          const c = isoToScreen(p.tx, p.ty);
          ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, 7); ctx.fill();
        }
      }
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
      window.clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chip: React.CSSProperties = {
    background: 'rgba(20,30,40,0.72)', color: '#fff', borderRadius: 10,
    padding: '8px 12px', fontSize: 13, pointerEvents: 'none', maxWidth: '62vw',
  };
  const btn: React.CSSProperties = {
    background: 'rgba(20,30,40,0.72)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', pointerEvents: 'auto',
  };
  const padBtn: React.CSSProperties = {
    width: 52, height: 52, borderRadius: 12, fontSize: 20,
    background: 'rgba(20,30,40,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)',
    touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
  };

  const PadButton = ({ d, label }: { d: string; label: string }) => (
    <button
      style={padBtn}
      onPointerDown={(e) => { e.preventDefault(); apiRef.current.hold(d, true); }}
      onPointerUp={() => apiRef.current.hold(d, false)}
      onPointerLeave={() => apiRef.current.hold(d, false)}
      onPointerCancel={() => apiRef.current.hold(d, false)}
      onContextMenu={(e) => e.preventDefault()}
    >{label}</button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#9fd9f2', fontFamily: 'system-ui, sans-serif' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 12px', gap: 8 }}>
        <div style={chip}>⛰️ Isometric demo · build 357 · tile {coords}{carrying ? ' · carrying crate' : ''}</div>
        <button style={btn} onClick={() => apiRef.current.back()}>← Back to game</button>
      </div>
      {toast !== '' && (
        <div style={{
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(20,30,40,0.85)', color: '#fff', borderRadius: 10,
          padding: '8px 14px', fontSize: 13, pointerEvents: 'none', maxWidth: '80vw', textAlign: 'center',
        }}>{toast}</div>
      )}
      <div style={{
        position: 'absolute', left: 14, bottom: 14, display: 'grid',
        gridTemplateColumns: 'repeat(3, 52px)', gridTemplateRows: 'repeat(3, 52px)', gap: 6,
      }}>
        <span /><PadButton d="up" label="⬆" /><span />
        <PadButton d="left" label="⬅" /><span /><PadButton d="right" label="➡" />
        <span /><PadButton d="down" label="⬇" /><span />
      </div>
      <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button style={{ ...padBtn }} onClick={() => apiRef.current.zoomIn()}>+</button>
        <button style={{ ...padBtn }} onClick={() => apiRef.current.zoomOut()}>−</button>
      </div>
      <div style={{
        position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(20,30,40,0.55)', color: '#fff', borderRadius: 8,
        padding: '6px 10px', fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>Tap a tile to walk · tap a crate to pick it up</div>
    </div>
  );
}
