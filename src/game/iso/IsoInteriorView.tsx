// Isometric interiors for the 2.5D world (BUILD 366).
//
// Renders enterable building interiors in iso projection: wooden/stone floors,
// back walls with windows, a door gap, and per-room-type furniture (beds,
// tables, bar counters, forges, altars, barrels...) drawn as depth-sorted iso
// boxes. The player tap-to-moves inside; NPCs already INTERIOR are shown.
//
// Room types mirror the 2D InteriorRoom: guild | inn | chapel | building |
// tavern | cellar | prison. Layouts are deterministic per room id.
import React, { useEffect, useRef } from 'react';
import {
  isoToScreen, screenToTileInt, depthKey, findPath, TILE_W, TILE_H,
  type TilePoint,
} from './projection';
import {
  preloadMsSprites,
  type Face4,
} from './isoSprites';
import { CharacterAnimator, drawIsoCharacter, type LookRef } from './characterSystem';

export type IsoRoomType = 'guild' | 'inn' | 'chapel' | 'building' | 'tavern' | 'cellar' | 'prison';

export interface IsoInteriorNpc {
  id: string;
  name: string;
  tx: number; ty: number;
  facing: Face4;
  look: LookRef;
}

interface IsoInteriorViewProps {
  roomId: string;
  roomType: IsoRoomType;
  npcs: IsoInteriorNpc[];
  onExit: () => void;
  onTalkTo?: (npcId: string) => void;
  // Live directional input (D-pad / keyboard) from the app shell. When a
  // direction is held the player steps tile-by-tile; manual input cancels
  // tap-to-move. Screen up = tile north, matching the iso demo.
  getHeldDir?: () => { x: number; y: number };
}

const ROOM_W = 12;
const ROOM_H = 10;
const WALL_H = 64;

interface Furniture {
  kind: string;
  tx: number; ty: number; w: number; h: number;
  solid: boolean;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Deterministic furniture layouts per room type.
function furnitureFor(roomType: IsoRoomType): Furniture[] {
  switch (roomType) {
    case 'guild':
      return [
        { kind: 'rug', tx: 4, ty: 4, w: 4, h: 3, solid: false },
        { kind: 'forge', tx: 4, ty: 1, w: 3, h: 1, solid: true },
        { kind: 'anvil', tx: 5, ty: 5, w: 1, h: 1, solid: true },
        { kind: 'workbench', tx: 8, ty: 2, w: 2, h: 1, solid: true },
        { kind: 'weaponrack', tx: 1, ty: 1, w: 1, h: 1, solid: true },
        { kind: 'crate', tx: 10, ty: 7, w: 1, h: 1, solid: true },
        { kind: 'lamp', tx: 1, ty: 8, w: 1, h: 1, solid: true },
        { kind: 'lamp', tx: 10, ty: 1, w: 1, h: 1, solid: true },
      ];
    case 'tavern':
    case 'inn':
      return [
        { kind: 'rug', tx: 4, ty: 5, w: 4, h: 3, solid: false },
        { kind: 'bar', tx: 4, ty: 1, w: 4, h: 1, solid: true },
        { kind: 'roundtable', tx: 3, ty: 4, w: 1, h: 1, solid: true },
        { kind: 'stool', tx: 2, ty: 4, w: 1, h: 1, solid: true },
        { kind: 'stool', tx: 4, ty: 4, w: 1, h: 1, solid: true },
        { kind: 'roundtable', tx: 8, ty: 5, w: 1, h: 1, solid: true },
        { kind: 'stool', tx: 7, ty: 5, w: 1, h: 1, solid: true },
        { kind: 'stool', tx: 9, ty: 5, w: 1, h: 1, solid: true },
        { kind: 'barrel', tx: 10, ty: 2, w: 1, h: 1, solid: true },
        { kind: 'barrel', tx: 10, ty: 3, w: 1, h: 1, solid: true },
        { kind: 'fireplace', tx: 1, ty: 4, w: 1, h: 2, solid: true },
        { kind: 'lamp', tx: 1, ty: 1, w: 1, h: 1, solid: true },
        { kind: 'lamp', tx: 10, ty: 8, w: 1, h: 1, solid: true },
      ];
    case 'chapel':
      return [
        { kind: 'rug', tx: 5, ty: 3, w: 2, h: 4, solid: false },
        { kind: 'altar', tx: 5, ty: 1, w: 2, h: 1, solid: true },
        { kind: 'candle', tx: 4, ty: 1, w: 1, h: 1, solid: true },
        { kind: 'candle', tx: 7, ty: 1, w: 1, h: 1, solid: true },
        { kind: 'pew', tx: 3, ty: 4, w: 2, h: 1, solid: true },
        { kind: 'pew', tx: 7, ty: 4, w: 2, h: 1, solid: true },
        { kind: 'pew', tx: 3, ty: 6, w: 2, h: 1, solid: true },
        { kind: 'pew', tx: 7, ty: 6, w: 2, h: 1, solid: true },
        { kind: 'lamp', tx: 1, ty: 1, w: 1, h: 1, solid: true },
        { kind: 'lamp', tx: 10, ty: 1, w: 1, h: 1, solid: true },
      ];
    case 'cellar':
      return [
        { kind: 'barrel', tx: 2, ty: 1, w: 1, h: 1, solid: true },
        { kind: 'barrel', tx: 3, ty: 1, w: 1, h: 1, solid: true },
        { kind: 'barrel', tx: 9, ty: 2, w: 1, h: 1, solid: true },
        { kind: 'crate', tx: 8, ty: 6, w: 1, h: 1, solid: true },
        { kind: 'crate', tx: 9, ty: 6, w: 1, h: 1, solid: true },
        { kind: 'sacks', tx: 2, ty: 7, w: 1, h: 1, solid: true },
        { kind: 'sacks', tx: 5, ty: 2, w: 1, h: 1, solid: true },
        { kind: 'lamp', tx: 6, ty: 5, w: 1, h: 1, solid: true },
      ];
    case 'prison':
      return [
        { kind: 'bars', tx: 2, ty: 4, w: 8, h: 1, solid: true },
        { kind: 'strawbed', tx: 8, ty: 6, w: 2, h: 1, solid: true },
        { kind: 'lamp', tx: 1, ty: 1, w: 1, h: 1, solid: true },
      ];
    case 'building':
    default:
      return [
        { kind: 'rug', tx: 4, ty: 4, w: 4, h: 3, solid: false },
        { kind: 'bed', tx: 1, ty: 1, w: 2, h: 1, solid: true },
        { kind: 'table', tx: 5, ty: 4, w: 2, h: 1, solid: true },
        { kind: 'chair', tx: 5, ty: 5, w: 1, h: 1, solid: true },
        { kind: 'chair', tx: 6, ty: 5, w: 1, h: 1, solid: true },
        { kind: 'shelf', tx: 9, ty: 1, w: 2, h: 1, solid: true },
        { kind: 'fireplace', tx: 10, ty: 5, w: 1, h: 2, solid: true },
        { kind: 'lamp', tx: 1, ty: 8, w: 1, h: 1, solid: true },
      ];
  }
}

function faceForMove(ax: number, ay: number, bx: number, by: number): Face4 {
  const a = isoToScreen(ax, ay), b = isoToScreen(bx, by);
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export default function IsoInteriorView({ roomId, roomType, npcs, onExit, onTalkTo, getHeldDir }: IsoInteriorViewProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const talkRef = useRef(onTalkTo);
  talkRef.current = onTalkTo;
  const npcsRef = useRef(npcs);
  npcsRef.current = npcs;
  const heldDirRef = useRef(getHeldDir);
  heldDirRef.current = getHeldDir;

  useEffect(() => { preloadMsSprites(); }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const furn = furnitureFor(roomType);
    const solidAt = (tx: number, ty: number): boolean => {
      if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return true;
      return furn.some((f) => f.solid && tx >= f.tx && tx < f.tx + f.w && ty >= f.ty && ty < f.ty + f.h);
    };
    const doorTile: TilePoint = { tx: Math.floor(ROOM_W / 2), ty: ROOM_H - 1 };

    const state = {
      px: doorTile.tx, py: doorTile.ty - 1,
      fx: doorTile.tx, fy: doorTile.ty - 1,
      path: [] as TilePoint[], stepT: 0, moving: false, facing: 'up' as Face4,
      tapPath: false,
      zoom: 1, camX: 0, camY: 0, w: 0, h: 0, dpr: 1,
    };
    // Per-character animation controllers (pruned each frame).
    const charAnims = new Map<string, CharacterAnimator>();
    const seenAnims = new Set<string>();

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      state.dpr = Math.min(2, window.devicePixelRatio || 1);
      state.w = Math.max(1, r.width); state.h = Math.max(1, r.height);
      canvas.width = state.w * state.dpr;
      canvas.height = state.h * state.dpr;
      canvas.style.width = state.w + 'px';
      canvas.style.height = state.h + 'px';
    };
    resize();
    window.addEventListener('resize', resize);

    const toScreen = (tx: number, ty: number, z = 0) => {
      const p = isoToScreen(tx, ty, z);
      return {
        x: (p.x - state.camX) * state.zoom + state.w / 2,
        y: (p.y - state.camY) * state.zoom + state.h / 2,
      };
    };
    const fromScreen = (sx: number, sy: number) => {
      const wx = (sx - state.w / 2) / state.zoom + state.camX;
      const wy = (sy - state.h / 2) / state.zoom + state.camY;
      return screenToTileInt(wx, wy);
    };

    // Center camera on room.
    const rc = isoToScreen(ROOM_W / 2, ROOM_H / 2);
    state.camX = rc.x; state.camY = rc.y;
    state.zoom = Math.min(state.w / (ROOM_W * TILE_W * 0.62), state.h / (ROOM_H * TILE_H * 1.7), 1.4);

    const walkable = (tx: number, ty: number) => !solidAt(tx, ty);
    const goTo = (tx: number, ty: number) => {
      if (tx === doorTile.tx && ty === doorTile.ty) { exitRef.current(); return; }
      const path = findPath({ tx: Math.round(state.px), ty: Math.round(state.py) }, { tx, ty }, walkable);
      if (path && path.length > 1) {
        state.path = path.slice(1);
        state.tapPath = true;
        state.moving = true;
        state.stepT = performance.now();
      }
    };

    const onTap = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const t = fromScreen(e.clientX - r.left, e.clientY - r.top);
      // Tap an NPC -> talk.
      const npc = npcsRef.current.find((n) => Math.round(n.tx) === t.tx && Math.round(n.ty) === t.ty);
      if (npc && talkRef.current) { talkRef.current(npc.id); return; }
      if (t.tx >= 0 && t.ty >= 0 && t.tx < ROOM_W && t.ty < ROOM_H && !solidAt(t.tx, t.ty)) {
        goTo(t.tx, t.ty);
      }
    };
    canvas.addEventListener('pointerdown', onTap);

    let raf = 0;
    let last = performance.now();
    const STEP_MS = 280;

    const drawFurniture = (g: CanvasRenderingContext2D, f: Furniture, nowMs: number) => {
      const c = toScreen(f.tx + f.w / 2, f.ty + f.h / 2);
      const z = state.zoom;
      const tw = TILE_W * z, th = TILE_H * z;
      const wpx = f.w * tw, hpx = f.h * th;
      // iso box helper: top diamond + two side faces (2:1 dimetric ratio)
      const box = (x: number, yBase: number, w: number, hgt: number, top: string, left: string, right: string) => {
        const hh = w / 4; // diamond half-height for 2:1 iso
        // top diamond
        g.fillStyle = top;
        g.beginPath();
        g.moveTo(x, yBase - hgt - hh);
        g.lineTo(x + w / 2, yBase - hgt);
        g.lineTo(x, yBase - hgt + hh);
        g.lineTo(x - w / 2, yBase - hgt);
        g.closePath(); g.fill();
        // left face
        g.fillStyle = left;
        g.beginPath();
        g.moveTo(x - w / 2, yBase - hgt); g.lineTo(x, yBase - hgt + hh);
        g.lineTo(x, yBase + hh); g.lineTo(x - w / 2, yBase);
        g.closePath(); g.fill();
        // right face
        g.fillStyle = right;
        g.beginPath();
        g.moveTo(x + w / 2, yBase - hgt); g.lineTo(x, yBase - hgt + hh);
        g.lineTo(x, yBase + hh); g.lineTo(x + w / 2, yBase);
        g.closePath(); g.fill();
      };
      const yB = c.y;
      switch (f.kind) {
        case 'rug':
          g.fillStyle = roomType === 'chapel' ? 'rgba(140,40,50,0.55)' : 'rgba(150,60,40,0.45)';
          g.beginPath();
          g.moveTo(c.x, yB - hpx / 2); g.lineTo(c.x + wpx / 2, yB);
          g.lineTo(c.x, yB + hpx / 2); g.lineTo(c.x - wpx / 2, yB);
          g.closePath(); g.fill();
          g.strokeStyle = 'rgba(90,30,20,0.5)'; g.lineWidth = 2; g.stroke();
          break;
        case 'bed': {
          const bw = wpx, bh = 34 * z;
          box(c.x, yB, bw, bh, '#8a5a34', '#6e4526', '#7d5029');
          // mattress + pillow
          g.fillStyle = '#e8e0d0';
          g.beginPath();
          g.moveTo(c.x, yB - bh - hpx / 2 + 6 * z);
          g.lineTo(c.x + bw / 2 - 6 * z, yB - bh);
          g.lineTo(c.x, yB - bh + hpx / 2 - 6 * z);
          g.lineTo(c.x - bw / 2 + 6 * z, yB - bh);
          g.closePath(); g.fill();
          g.fillStyle = '#f5f0e0';
          const pc = toScreen(f.tx + 0.5, f.ty + f.h / 2);
          g.beginPath();
          g.ellipse(pc.x, yB - bh - 2 * z, 12 * z, 7 * z, 0, 0, 7); g.fill();
          break;
        }
        case 'table':
          box(c.x, yB, wpx, 26 * z, '#9a6a3c', '#7a5230', '#875e35');
          break;
        case 'chair':
        case 'stool': {
          const s = f.kind === 'stool' ? 18 * z : 24 * z;
          box(c.x, yB, tw * 0.7, s, '#8a5a34', '#6e4526', '#7d5029');
          break;
        }
        case 'shelf': {
          const sh = 52 * z;
          box(c.x, yB, wpx, sh, '#7a5230', '#5e3f24', '#6b482a');
          // books / jars on shelves
          for (let i = 0; i < 3; i++) {
            g.fillStyle = ['#a33', '#3a6', '#36c'][i % 3];
            const bx = c.x - wpx / 4 + i * (wpx / 5);
            g.fillRect(bx, yB - sh - hpx / 2 + 8 * z + i * 12 * z, 8 * z, 10 * z);
          }
          break;
        }
        case 'fireplace': {
          const fh = 56 * z;
          box(c.x, yB, wpx, fh, '#8d8fa3', '#5b5d70', '#74768a');
          const flick = 0.7 + 0.3 * Math.sin(nowMs / 180);
          g.fillStyle = `rgba(255,${Math.floor(120 * flick)},30,0.9)`;
          g.beginPath();
          g.ellipse(c.x, yB - 8 * z, 10 * z * flick, 14 * z * flick, 0, 0, 7); g.fill();
          g.fillStyle = '#3a2a1c';
          g.fillRect(c.x - 12 * z, yB - 4 * z, 24 * z, 5 * z);
          break;
        }
        case 'bar': {
          const bh = 34 * z;
          box(c.x, yB, wpx, bh, '#9a6a3c', '#6e4526', '#7d5029');
          // mugs on the counter
          for (let i = 0; i < 3; i++) {
            const mx = c.x - wpx / 3 + i * (wpx / 3);
            g.fillStyle = '#c9a86b';
            g.fillRect(mx - 4 * z, yB - bh - hpx / 2 - 8 * z, 8 * z, 10 * z);
          }
          break;
        }
        case 'roundtable': {
          const rh = 24 * z;
          g.fillStyle = '#7a5230';
          g.beginPath(); g.ellipse(c.x, yB - rh, tw * 0.45, th * 0.45, 0, 0, 7); g.fill();
          g.fillStyle = '#9a6a3c';
          g.beginPath(); g.ellipse(c.x, yB - rh - 3 * z, tw * 0.45, th * 0.45, 0, 0, 7); g.fill();
          g.fillStyle = '#5e3f24';
          g.fillRect(c.x - 3 * z, yB - rh, 6 * z, rh);
          // candle
          g.fillStyle = '#f5f0e0';
          g.fillRect(c.x - 2 * z, yB - rh - 12 * z, 4 * z, 8 * z);
          g.fillStyle = '#ffca3a';
          g.beginPath(); g.arc(c.x, yB - rh - 14 * z, 3 * z, 0, 7); g.fill();
          break;
        }
        case 'barrel': {
          const bh = 30 * z;
          g.fillStyle = '#7a5230';
          g.beginPath(); g.ellipse(c.x, yB - bh, tw * 0.32, th * 0.32, 0, 0, 7); g.fill();
          g.fillRect(c.x - tw * 0.32, yB - bh, tw * 0.64, bh);
          g.fillStyle = '#5e3f24';
          g.beginPath(); g.ellipse(c.x, yB, tw * 0.32, th * 0.32, 0, 0, 7); g.fill();
          g.fillStyle = '#8a5a34';
          g.beginPath(); g.ellipse(c.x, yB - bh, tw * 0.32, th * 0.32, 0, 0, 7); g.fill();
          break;
        }
        case 'crate':
          box(c.x, yB, tw * 0.8, 26 * z, '#a87f4e', '#7a5a36', '#93703f');
          g.strokeStyle = 'rgba(60,40,20,0.6)'; g.lineWidth = 2 * z;
          g.beginPath();
          g.moveTo(c.x - tw * 0.4, yB - 26 * z); g.lineTo(c.x, yB - 26 * z + th * 0.4);
          g.lineTo(c.x + tw * 0.4, yB - 26 * z); g.stroke();
          break;
        case 'sacks': {
          g.fillStyle = '#c9b184';
          g.beginPath(); g.ellipse(c.x - 8 * z, yB - 8 * z, 12 * z, 10 * z, 0, 0, 7); g.fill();
          g.beginPath(); g.ellipse(c.x + 10 * z, yB - 6 * z, 10 * z, 8 * z, 0, 0, 7); g.fill();
          g.fillStyle = '#a8926a';
          g.fillRect(c.x - 12 * z, yB - 16 * z, 8 * z, 4 * z);
          break;
        }
        case 'forge': {
          const fh = 40 * z;
          box(c.x, yB, wpx, fh, '#6b6d7d', '#4a4c58', '#5b5d6b');
          const flick = 0.7 + 0.3 * Math.sin(nowMs / 150 + f.tx);
          g.fillStyle = `rgba(255,${Math.floor(110 * flick)},25,0.95)`;
          g.beginPath();
          g.ellipse(c.x, yB - fh + 4 * z, wpx * 0.3 * flick, 10 * z * flick, 0, 0, 7); g.fill();
          break;
        }
        case 'anvil': {
          g.fillStyle = '#3d3f4a';
          g.fillRect(c.x - 14 * z, yB - 26 * z, 28 * z, 8 * z);
          g.fillRect(c.x - 4 * z, yB - 18 * z, 8 * z, 18 * z);
          g.fillStyle = '#565864';
          g.fillRect(c.x - 14 * z, yB - 26 * z, 28 * z, 3 * z);
          break;
        }
        case 'workbench':
          box(c.x, yB, wpx, 26 * z, '#8a6a42', '#6b4f30', '#7d5c38');
          g.fillStyle = '#555';
          g.fillRect(c.x - 10 * z, yB - 26 * z - hpx / 2 - 6 * z, 20 * z, 6 * z);
          break;
        case 'weaponrack': {
          const rh = 48 * z;
          g.fillStyle = '#5e3f24';
          g.fillRect(c.x - tw * 0.3, yB - rh, 5 * z, rh);
          g.fillRect(c.x + tw * 0.3 - 5 * z, yB - rh, 5 * z, rh);
          for (let i = 0; i < 3; i++) {
            g.strokeStyle = '#9aa0a8'; g.lineWidth = 3 * z;
            const sx = c.x - tw * 0.2 + i * tw * 0.2;
            g.beginPath(); g.moveTo(sx, yB - rh + 4 * z); g.lineTo(sx + 4 * z, yB - 6 * z); g.stroke();
          }
          break;
        }
        case 'altar': {
          const ah = 30 * z;
          box(c.x, yB, wpx, ah, '#d8d4c8', '#a8a498', '#c0bcb0');
          g.fillStyle = '#f5f0e0';
          g.fillRect(c.x - 3 * z, yB - ah - hpx / 2 - 14 * z, 6 * z, 12 * z);
          break;
        }
        case 'pew': {
          const ph = 20 * z;
          box(c.x, yB, wpx, ph, '#7a5230', '#5e3f24', '#6b482a');
          g.fillStyle = '#5e3f24';
          g.fillRect(c.x - wpx / 2, yB - ph - hpx / 2 - 14 * z, 5 * z, 14 * z);
          g.fillRect(c.x + wpx / 2 - 5 * z, yB - ph - hpx / 2 - 14 * z, 5 * z, 14 * z);
          break;
        }
        case 'candle': {
          g.fillStyle = '#e8dcc0';
          g.fillRect(c.x - 3 * z, yB - 18 * z, 6 * z, 18 * z);
          const flick = 0.7 + 0.3 * Math.sin(nowMs / 200 + f.tx * 2);
          g.fillStyle = `rgba(255,200,60,${0.9 * flick})`;
          g.beginPath(); g.arc(c.x, yB - 22 * z, 4 * z * flick, 0, 7); g.fill();
          break;
        }
        case 'lamp': {
          g.fillStyle = '#4a3220';
          g.fillRect(c.x - 2 * z, yB - 30 * z, 4 * z, 30 * z);
          const flick = 0.75 + 0.25 * Math.sin(nowMs / 220 + f.ty);
          g.fillStyle = `rgba(255,190,70,${0.85 * flick})`;
          g.beginPath(); g.arc(c.x, yB - 36 * z, 7 * z * flick, 0, 7); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.15)';
          g.beginPath(); g.ellipse(c.x, yB + 2, 12 * z, 5 * z, 0, 0, 7); g.fill();
          break;
        }
        case 'bars': {
          const bh = 72 * z;
          for (let i = 0; i <= f.w * 2; i++) {
            const bx = c.x - wpx / 2 + (i * wpx) / (f.w * 2);
            g.fillStyle = '#3d3f4a';
            g.fillRect(bx - 2 * z, yB - bh, 4 * z, bh);
          }
          g.fillStyle = '#2c2e36';
          g.fillRect(c.x - wpx / 2, yB - bh, wpx, 5 * z);
          break;
        }
        case 'strawbed': {
          g.fillStyle = '#c9a86b';
          g.beginPath(); g.ellipse(c.x, yB - 8 * z, wpx * 0.45, th * 0.4, 0, 0, 7); g.fill();
          g.fillStyle = '#a8895a';
          for (let i = 0; i < 8; i++) {
            const sx = c.x - wpx * 0.35 + (i * wpx * 0.7) / 8;
            g.fillRect(sx, yB - 14 * z, 2 * z, 10 * z);
          }
          break;
        }
      }
    };

    // Shared character renderer: one animator per character id (pruned per
    // frame); the draw is feet-anchored with speed-tied walk phase.
    const drawCharacter = (g: CanvasRenderingContext2D, fx: number, fy: number, facing: Face4, moving: boolean, look: LookRef, nowMs: number, animKey: string) => {
      const c = toScreen(fx, fy);
      const depth = depthKey(Math.round(fx), Math.round(fy));
      let anim = charAnims.get(animKey);
      if (!anim) { anim = new CharacterAnimator(animKey); charAnims.set(animKey, anim); }
      seenAnims.add(animKey);
      anim.update({ x: fx, y: fy, moving, facing, nowMs });
      const draw = (g2: CanvasRenderingContext2D) => {
        drawIsoCharacter({ g: g2, x: c.x, y: c.y, look, nowMs, animator: anim });
      };
      return { depth, draw };
    };

    const frame = (nowMs: number) => {
      const dt = Math.min(50, nowMs - last);
      last = nowMs;
      // D-pad / keyboard held input: step tile-by-tile; manual input cancels
      // an in-flight tap-to-move path.
      const hd = heldDirRef.current ? heldDirRef.current() : { x: 0, y: 0 };
      if (hd.x !== 0 || hd.y !== 0) {
        if (state.tapPath) { state.path = []; state.tapPath = false; }
        if (state.path.length === 0) {
          const dx = hd.x !== 0 ? Math.sign(hd.x) : 0;
          const dy = hd.x !== 0 ? 0 : Math.sign(hd.y);
          const nx = Math.round(state.px) + dx, ny = Math.round(state.py) + dy;
          if (nx === doorTile.tx && ny === doorTile.ty) { exitRef.current(); }
          else if (walkable(nx, ny)) {
            state.facing = faceForMove(state.px, state.py, nx, ny);
            state.path = [{ tx: nx, ty: ny }];
            state.tapPath = false;
            state.moving = true;
          }
        }
      }
      // movement interpolation
      if (state.moving && state.path.length > 0) {
        const target = state.path[0];
        const speed = dt / STEP_MS;
        const dx = target.tx - state.fx, dy = target.ty - state.fy;
        const dist = Math.hypot(dx, dy);
        if (dist <= speed) {
          state.fx = target.tx; state.fy = target.ty;
          state.px = target.tx; state.py = target.ty;
          state.path.shift();
          if (state.path.length === 0) { state.moving = false; state.tapPath = false; }
          else state.facing = faceForMove(state.fx, state.fy, state.path[0].tx, state.path[0].ty);
        } else {
          state.facing = faceForMove(state.fx, state.fy, target.tx, target.ty);
          state.fx += (dx / dist) * speed;
          state.fy += (dy / dist) * speed;
        }
      }

      const g = ctx;
      g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      g.clearRect(0, 0, state.w, state.h);
      // backdrop
      g.fillStyle = '#14181f';
      g.fillRect(0, 0, state.w, state.h);

      const wood = roomType === 'guild' || roomType === 'cellar' || roomType === 'prison';
      const f1 = wood ? '#8d8fa3' : '#a87f4e';
      const f2 = wood ? '#83858f' : '#9c7443';

      // floor
      for (let ty = 0; ty < ROOM_H; ty++) {
        for (let tx = 0; tx < ROOM_W; tx++) {
          const p = toScreen(tx, ty);
          const hw = (TILE_W * state.zoom) / 2, hh = (TILE_H * state.zoom) / 2;
          g.beginPath();
          g.moveTo(p.x, p.y - hh); g.lineTo(p.x + hw, p.y);
          g.lineTo(p.x, p.y + hh); g.lineTo(p.x - hw, p.y);
          g.closePath();
          g.fillStyle = (tx + ty) % 2 === 0 ? f1 : f2;
          g.fill();
          if (!wood && tx % 3 === 0) {
            // plank seams
            g.strokeStyle = 'rgba(60,40,20,0.25)';
            g.lineWidth = 1;
            g.beginPath(); g.moveTo(p.x - hw, p.y); g.lineTo(p.x + hw, p.y); g.stroke();
          }
          if (tx === doorTile.tx && ty === doorTile.ty) {
            g.fillStyle = 'rgba(255,210,90,0.35)';
            g.fill();
          }
        }
      }

      interface Drawable { depth: number; draw: (g: CanvasRenderingContext2D) => void }
      const drawables: Drawable[] = [];

      // back walls (north ty=0, west tx=0) with windows
      const wallCol = wood ? '#6e6f7a' : '#b08d5a';
      const wallDark = wood ? '#54555e' : '#8a6c42';
      for (let tx = 0; tx < ROOM_W; tx++) {
        const p = toScreen(tx, 0);
        const hw = (TILE_W * state.zoom) / 2;
        const wh = WALL_H * state.zoom;
        drawables.push({
          depth: depthKey(tx, -1),
          draw: (g2) => {
            g2.fillStyle = wallCol;
            g2.beginPath();
            g2.moveTo(p.x - hw, p.y); g2.lineTo(p.x, p.y + (TILE_H * state.zoom) / 2);
            g2.lineTo(p.x, p.y + (TILE_H * state.zoom) / 2 - wh);
            g2.lineTo(p.x - hw, p.y - wh);
            g2.closePath(); g2.fill();
            if (tx % 3 === 1) {
              // window
              g2.fillStyle = '#2a3a4a';
              g2.fillRect(p.x - hw * 0.5, p.y - wh * 0.75, hw * 0.5, wh * 0.4);
              g2.fillStyle = 'rgba(180,220,255,0.5)';
              g2.fillRect(p.x - hw * 0.5, p.y - wh * 0.75, hw * 0.5, wh * 0.15);
            }
          },
        });
      }
      for (let ty = 0; ty < ROOM_H; ty++) {
        const p = toScreen(0, ty);
        const hw = (TILE_W * state.zoom) / 2;
        const wh = WALL_H * state.zoom;
        drawables.push({
          depth: depthKey(-1, ty),
          draw: (g2) => {
            g2.fillStyle = wallDark;
            g2.beginPath();
            g2.moveTo(p.x + hw, p.y); g2.lineTo(p.x, p.y + (TILE_H * state.zoom) / 2);
            g2.lineTo(p.x, p.y + (TILE_H * state.zoom) / 2 - wh);
            g2.lineTo(p.x + hw, p.y - wh);
            g2.closePath(); g2.fill();
          },
        });
      }

      // furniture
      for (const f of furn) {
        drawables.push({
          depth: depthKey(f.tx + f.w - 1, f.ty + f.h - 1) + 0.1,
          draw: (g2) => drawFurniture(g2, f, nowMs),
        });
      }

      // NPCs
      seenAnims.clear();
      for (const n of npcsRef.current) {
        const d = drawCharacter(g, n.tx, n.ty, n.facing, false, n.look, nowMs, n.id);
        drawables.push(d);
        // nameplate
        const c = toScreen(n.tx, n.ty);
        drawables.push({
          depth: d.depth + 0.01,
          draw: (g2) => {
            g2.font = '600 11px system-ui';
            const w = g2.measureText(n.name).width;
            g2.fillStyle = 'rgba(10,14,20,0.65)';
            g2.fillRect(c.x - w / 2 - 4, c.y - 66, w + 8, 16);
            g2.fillStyle = '#ffe9a8';
            g2.textAlign = 'center';
            g2.fillText(n.name, c.x, c.y - 54);
          },
        });
      }

      // player
      drawables.push(drawCharacter(g, state.fx, state.fy, state.facing, state.moving, 0, nowMs, 'player'));
      for (const k of charAnims.keys()) if (!seenAnims.has(k)) charAnims.delete(k);

      drawables.sort((a, b) => a.depth - b.depth);
      for (const d of drawables) d.draw(g);

      // exit hint
      const dp = toScreen(doorTile.tx, doorTile.ty);
      g.font = '600 12px system-ui';
      g.textAlign = 'center';
      g.fillStyle = '#ffd98a';
      g.fillText('🚪 tap the door to exit', dp.x, dp.y + 34);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onTap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomType]);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#14181f', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <button
        type="button"
        onClick={onExit}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 5,
          background: 'rgba(20,30,38,0.78)', color: '#ffd98a', fontSize: 13, fontWeight: 700,
          border: '1px solid rgba(255,217,138,0.4)', borderRadius: 8, padding: '8px 12px',
        }}
      >
        🚪 Exit
      </button>
    </div>
  );
}
