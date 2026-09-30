// Isometric demo (BUILD 365): data-driven world + in-game map builder (?iso=1).
// Play mode: explore, move crates, wandering NPCs. Edit mode: full map builder
// (select/move/delete, paint terrain, place objects, copy/paste regions, resize
// up to 200x200, undo). World persists in localStorage.
import React, { useEffect, useRef, useState } from 'react';
import {
  isoToScreen, screenToTile, screenToTileInt, depthKey, findPath, TILE_W, TILE_H,
  type TilePoint,
} from './projection';
import {
  loadWorld, saveWorld, defaultWorld, resizeWorld, copyRegion, pasteClipboard,
  clipboardSize, terrainAt, terrainKey, inBounds, isWalkableWorld,
  mergeWallRuns, WALL_H, HUT_H,
  type IsoWorld, type Clipboard, type Terrain, type Region,
  type HutRect, type WallRun,
} from './isoWorld';

const STEP_MS = 170;
const NPC_STEP_MS = 420;
const MAX_UNDO = 30;

const TERRAIN_COLORS: Record<Terrain, [string, string]> = {
  grass: ['#7cc24a', '#74b843'],
  dirt: ['#c9a86b', '#c09a62'],
  sand: ['#e8d89a', '#dfcf8d'],
  stone: ['#9aa0a8', '#9298a0'],
  water: ['#4aa3df', '#3f97d4'],
};
const TERRAIN_LIST: Terrain[] = ['grass', 'dirt', 'sand', 'stone', 'water'];

type Mode = 'play' | 'edit';
type Tool = 'select' | 'pan' | 'paint' | 'place' | 'copy' | 'paste' | 'erase';
type PlaceKind = 'tree' | 'rock' | 'crate' | 'hut' | 'stall' | 'wallH' | 'wallV' | 'npc' | 'start';
type SelKind = 'tree' | 'rock' | 'crate' | 'npc' | 'stall' | 'hut' | 'wall' | 'start';
interface Selection { kind: SelKind; index: number }

import {
  preloadMsSprites, msReady, msSprite, NPC_LOOKS, MS_ROW, MS_CELL, MS_WALK_FRAMES, MS_FEET_ROW, msLookKeys,
  preloadFoodSprites, foodReady, foodSprite, FOOD_KEYS,
  type Face4,
} from './isoSprites';

interface CharState { tx: number; ty: number; fx: number; fy: number }
interface PlayNpc extends CharState {
  name: string; look: number;
  waypoints: TilePoint[]; path: TilePoint[]; stepT: number; thinkT: number;
  from: { x: number; y: number }; moving: boolean; facing: Face4;
}

interface Drawable { depth: number; tx: number; ty: number; draw: (g: CanvasRenderingContext2D) => void }

// Character + food sprite loading now lives in ./isoSprites (shared with IsoFieldView).

// screen-space facing for a tile step (isoToScreen imported from projection.ts)
function faceForMove(ax: number, ay: number, bx: number, by: number): Face4 {
  const a = isoToScreen(ax, ay), b = isoToScreen(bx, by);
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export default function IsoRoom(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef({ hold: (_d: string, _on: boolean) => { }, zoomIn: () => { }, zoomOut: () => { }, back: () => { }, enterEdit: () => { }, exitEdit: () => { } });
  const toastTimer = useRef(0);
  const [mode, setMode] = useState<Mode>('play');
  const [, setVer] = useState(0); // bump to refresh editor UI
  const [coords, setCoords] = useState('');
  const [carrying, setCarrying] = useState(false);
  const [toast, setToast] = useState('');
  const [tool, setTool] = useState<Tool>('select');
  const [paintTerrain, setPaintTerrain] = useState<Terrain>('dirt');
  const [placeKind, setPlaceKind] = useState<PlaceKind>('tree');
  const [resizeOpen, setResizeOpen] = useState(false);
  const [resizeW, setResizeW] = useState(56);
  const [resizeH, setResizeH] = useState(56);
  const [worldSize, setWorldSize] = useState('56×56');
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => { preloadMsSprites(); preloadFoodSprites(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  };
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxOrNull = canvas.getContext('2d');
    if (!ctxOrNull) return;
    const ctx: CanvasRenderingContext2D = ctxOrNull;

    const worldRef = { current: loadWorld() };
    const W = () => worldRef.current;
    const modeRef = { current: 'play' as Mode };
    const bump = () => { setVer(v => v + 1); setWorldSize(`${W().w}×${W().h}`); };

    // ---------- editor state ----------
    const ed = {
      tool: 'select' as Tool,
      paintTerrain: 'dirt' as Terrain,
      placeKind: 'tree' as PlaceKind,
      sel: null as Selection | null,
      copyA: null as TilePoint | null,
      clipboard: null as Clipboard | null,
      hover: null as TilePoint | null,
      cam: { x: 0, y: 0 },
      zoom: 1,
      pan: null as { sx: number; sy: number; cx: number; cy: number; moved: boolean } | null,
      stroke: false,
      moving: null as { kind: SelKind; index: number; ox: number; oy: number } | null,
      undo: [] as string[],
      npcCount: 0,
    };

    const pushUndo = () => {
      ed.undo.push(JSON.stringify(worldRef.current));
      if (ed.undo.length > MAX_UNDO) ed.undo.shift();
    };
    const doUndo = () => {
      const s = ed.undo.pop();
      if (!s) { showToastRef.current('Nothing to undo'); return; }
      worldRef.current = JSON.parse(s) as IsoWorld;
      saveWorld(worldRef.current);
      ed.sel = null;
      bump();
    };
    const mutate = (fn: (w: IsoWorld) => void) => {
      pushUndo();
      fn(worldRef.current);
      saveWorld(worldRef.current);
      bump();
    };

    // ---------- play state ----------
    const player: CharState = { tx: 0, ty: 0, fx: 0, fy: 0 };
    const npcs: PlayNpc[] = [];
    let playerPath: TilePoint[] = [];
    const pFrom = { x: 0, y: 0 };
    const pStepT = { t: 0 };
    let playerMoving = false;
    let playerFacing: Face4 = 'down';
    let carryingIdx = -1;
    const held = new Set<string>();
    const cam = { x: 0, y: 0 };
    let zoom = 1;
    // Keep the play camera on the map, centered on the player whenever possible.
    // Per axis: overflow > 0 means the map is bigger than the view (clamp to map
    // edges); overflow < 0 means slack (follow the player inside the slack so the
    // character stays centered instead of snapping to the map center).
    const clampCamToMap = (c: { x: number; y: number }, zm: number, wpx: number, hpx: number) => {
      const w = W();
      const m = 48; // world-px margin of background around the map
      const minX = -(w.h - 1) * (TILE_W / 2) - m, maxX = (w.w - 1) * (TILE_W / 2) + m;
      const minY = -m, maxY = (w.w + w.h - 2) * (TILE_H / 2) + m;
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const hw = wpx / (2 * zm), hh = hpx / (2 * zm);
      const ox = (maxX - minX) / 2 - hw, oy = (maxY - minY) / 2 - hh;
      c.x = Math.max(cx - Math.abs(ox), Math.min(cx + Math.abs(ox), c.x));
      c.y = Math.max(cy - Math.abs(oy), Math.min(cy + Math.abs(oy), c.y));
    };
    // Zoom level that fits the entire map in the viewport (never above 1).
    const fitZoom = () => {
      const w = W();
      const wpx = canvas.clientWidth || 1, hpx = canvas.clientHeight || 1;
      const mapW = (w.w + w.h) * (TILE_W / 2) + 96;
      const mapH = (w.w + w.h) * (TILE_H / 2) + 96;
      return Math.min(1, wpx / mapW, hpx / mapH);
    };
    const savePlay = () => {
      try {
        localStorage.setItem('iso-player-v2', JSON.stringify({ x: player.tx, y: player.ty }));
        localStorage.setItem('iso-npcs-v2', JSON.stringify(npcs.map(n => ({ x: n.tx, y: n.ty }))));
      } catch { /* ignore */ }
      saveWorld(worldRef.current);
    };

    const initPlay = () => {
      const w = W();
      let px = w.playerStart.tx, py = w.playerStart.ty;
      try {
        const raw = localStorage.getItem('iso-player-v2');
        if (raw) {
          const s = JSON.parse(raw);
          if (inBounds(w, s.x, s.y) && isWalkableWorld(w, w.crates, s.x, s.y)) { px = s.x; py = s.y; }
        }
      } catch { /* ignore */ }
      player.tx = px; player.ty = py; player.fx = px; player.fy = py;
      pFrom.x = px; pFrom.y = py;
      playerPath = []; carryingIdx = -1; setCarrying(false);
      npcs.length = 0;
      let saved: Array<{ x: number; y: number }> = [];
      try {
        const raw = localStorage.getItem('iso-npcs-v2');
        if (raw) saved = JSON.parse(raw);
      } catch { /* ignore */ }
      w.npcSpawns.forEach((s, i) => {
        const sv = saved[i];
        const sx = sv && inBounds(w, sv.x, sv.y) ? sv.x : s.x;
        const sy = sv && inBounds(w, sv.x, sv.y) ? sv.y : s.y;
        const wps = s.waypoints.filter(p => inBounds(w, p.tx, p.ty) && isWalkableWorld(w, w.crates, p.tx, p.ty));
        npcs.push({
          name: s.name, look: s.look,
          tx: sx, ty: sy, fx: sx, fy: sy,
          waypoints: wps.length > 0 ? wps : [{ tx: s.x, ty: s.y }],
          path: [], stepT: 0, thinkT: 500 + i * 900,
          from: { x: sx, y: sy }, moving: false, facing: 'down',
        });
      });
      const c = isoToScreen(player.fx, player.fy);
      cam.x = c.x; cam.y = c.y - 24; // center the character's body, not its feet
      clampCamToMap(cam, zoom, canvas.clientWidth, canvas.clientHeight);
      setCoords(`${player.tx}, ${player.ty}`);
    };

    // ---------- canvas sizing ----------
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const wpx = canvas.clientWidth, hpx = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(wpx * dpr));
      canvas.height = Math.max(1, Math.round(hpx * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---------- draw helpers ----------
    function wallQuad(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number,
      h: number, face: string, cap: string) {
      g.beginPath();
      g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1, y1 - h); g.lineTo(x0, y0 - h);
      g.closePath();
      g.fillStyle = face; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.stroke();
      const bx = -9, by = -5;
      g.beginPath();
      g.moveTo(x0 + bx, y0 - h + by); g.lineTo(x1 + bx, y1 - h + by);
      g.lineTo(x1, y1 - h); g.lineTo(x0, y0 - h);
      g.closePath();
      g.fillStyle = cap; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.stroke();
    }

    function wallRunDrawables(run: WallRun): Drawable[] {
      const out: Drawable[] = [];
      if (run.h) {
        const n = isoToScreen(run.x0, run.y0); const p0 = { x: n.x - TILE_W / 2, y: n.y - TILE_H / 2 };
        const e = isoToScreen(run.x1, run.y0); const p1 = { x: e.x + TILE_W / 2, y: e.y };
        out.push({
          depth: depthKey(run.x1, run.y0), tx: run.x1, ty: run.y0, draw: (g) => {
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
        for (const ex of [run.x0, run.x1 + 1]) {
          const nn = isoToScreen(ex, run.y0);
          const px = ex === run.x0 ? nn.x - TILE_W / 2 + 6 : nn.x + TILE_W / 2 - 6;
          const py = ex === run.x0 ? nn.y : nn.y - TILE_H;
          out.push({
            depth: depthKey(ex, run.y0) + 1, tx: ex, ty: run.y0, draw: (g) => {
              g.fillStyle = '#6e4526';
              g.fillRect(px - 4, py - WALL_H - 8, 8, WALL_H + 8);
              g.fillStyle = '#8a5a33';
              g.fillRect(px - 4, py - WALL_H - 8, 8, 4);
            },
          });
        }
      } else {
        const n = isoToScreen(run.x0, run.y0); const p0 = { x: n.x - TILE_W / 2, y: n.y - TILE_H / 2 };
        const s = isoToScreen(run.x0, run.y1); const p1 = { x: s.x - TILE_W / 2, y: s.y };
        out.push({
          depth: depthKey(run.x0, run.y1), tx: run.x0, ty: run.y1, draw: (g) => {
            wallQuad(g, p0.x, p0.y, p1.x, p1.y, WALL_H, '#8b9098', '#b9bfc7');
          },
        });
      }
      return out;
    }

    function hutDrawables(h: HutRect): Drawable[] {
      const out: Drawable[] = [];
      {
        const n = isoToScreen(h.x0, h.y0); const p0 = { x: n.x - TILE_W / 2, y: n.y - TILE_H / 2 };
        const e = isoToScreen(h.x1, h.y0); const p1 = { x: e.x + TILE_W / 2, y: e.y };
        out.push({
          depth: depthKey(h.x1, h.y0), tx: h.x1, ty: h.y0, draw: (g) => {
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
      {
        const n = isoToScreen(h.x0, h.y0 + 1); const p0 = { x: n.x - TILE_W / 2, y: n.y - TILE_H / 2 };
        const wpt = isoToScreen(h.x0, h.y1); const p1 = { x: wpt.x - TILE_W / 2, y: wpt.y };
        out.push({
          depth: depthKey(h.x0, h.y1), tx: h.x0, ty: h.y1, draw: (g) => {
            wallQuad(g, p0.x, p0.y, p1.x, p1.y, HUT_H, '#75502c', '#9a7448');
          },
        });
      }
      {
        const e = isoToScreen(h.x1, h.y0 + 1); const p0 = { x: e.x + TILE_W / 2, y: e.y };
        const s = isoToScreen(h.x1, h.y1); const p1 = { x: s.x, y: s.y + TILE_H / 2 };
        out.push({
          depth: depthKey(h.x1, h.y1), tx: h.x1, ty: h.y1, draw: (g) => {
            wallQuad(g, p0.x, p0.y, p1.x, p1.y, HUT_H, '#75502c', '#9a7448');
          },
        });
      }
      {
        const c = isoToScreen(h.x1 + 0.5, h.y1 + 0.7);
        out.push({
          depth: depthKey(h.x1, h.y1) + 2, tx: h.x1, ty: h.y1, draw: (g) => {
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

    function stallDrawable(s: { x0: number; y0: number; x1: number }, stallIdx: number): Drawable {
      const wpt = isoToScreen(s.x0, s.y0); const p0 = { x: wpt.x - TILE_W / 2, y: wpt.y };
      const e = isoToScreen(s.x1, s.y0); const p1 = { x: e.x + TILE_W / 2, y: e.y };
      return {
        depth: depthKey(s.x0, s.y0), tx: s.x0, ty: s.y0, draw: (g) => {
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
          // Ghostpixxells pixel food sitting on the counter (3 per stall, varies by stall)
          if (foodReady()) {
            for (let i = 0; i < 3; i++) {
              const t = 0.25 + i * 0.25;
              const fx = p0.x + (p1.x - p0.x) * t, fy = p0.y + (p1.y - p0.y) * t;
              const key = FOOD_KEYS[(stallIdx + i * 2) % FOOD_KEYS.length];
              const im = foodSprite(key);
              if (!im) continue;
              const sz = 20;
              g.drawImage(im, fx - sz / 2, fy - ch - sz + 2, sz, sz);
            }
          }
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
      };
    }

    function treeDrawable(t: TilePoint): Drawable {
      const c = isoToScreen(t.tx, t.ty);
      return {
        depth: depthKey(t.tx, t.ty), tx: t.tx, ty: t.ty, draw: (g) => {
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
        depth: depthKey(t.tx, t.ty), tx: t.tx, ty: t.ty, draw: (g) => {
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

    function crateDrawable(t: TilePoint): Drawable {
      const p = isoToScreen(t.tx, t.ty);
      const s = 15, h = 22;
      return {
        depth: depthKey(t.tx, t.ty), tx: t.tx, ty: t.ty, draw: (g) => {
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

    function personDrawable(px: number, py: number, moving: boolean, facing: Face4,
      look: number, depth: number, nowMs: number): Drawable {
      const c = isoToScreen(px, py);
      const L = NPC_LOOKS[((look % NPC_LOOKS.length) + NPC_LOOKS.length) % NPC_LOOKS.length];
      const keys = msLookKeys(L);
      return {
        depth, tx: px, ty: py, draw: (g) => {
          // Feet anchor: MS_FEET_ROW of the 64px cell lands on the tile point.
          const lift = moving ? Math.abs(Math.sin(nowMs / 130)) * 2 : 0;
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.beginPath(); g.ellipse(c.x, c.y + 3, 12, 5, 0, 0, 7); g.fill();
          const ready = msReady(keys);
          if (ready) {
            // Mana Seed sheet: 64x64 cells; stand = col 0 of the facing stand
            // row, walk = 6 frames (cols 0-5) of the facing walk row.
            const rows = MS_ROW[facing];
            const frame = moving ? Math.floor(nowMs / 150) % MS_WALK_FRAMES : 0;
            const sx = frame * MS_CELL, sy = (moving ? rows.walk : rows.stand) * MS_CELL;
            const size = 52;
            const dx = c.x - size / 2, dy = c.y - (MS_FEET_ROW / MS_CELL) * size - lift;
            for (const k of keys) {
              const im = msSprite(k);
              if (!im) continue;
              g.drawImage(im, sx, sy, MS_CELL, MS_CELL, dx, dy, size, size);
            }
            return;
          }
          // vector fallback while sprites load
          g.save();
          g.translate(c.x, c.y - lift);
          const legSwing = moving ? Math.sin(nowMs / 130) * 4 : 0;
          g.fillStyle = '#4a3220';
          g.fillRect(-7, -12 + legSwing * 0.4, 6, 12);
          g.fillRect(1, -12 - legSwing * 0.4, 6, 12);
          g.fillStyle = '#3b6fd4';
          g.beginPath();
          g.moveTo(-10, -12); g.lineTo(10, -12); g.lineTo(8, -30); g.lineTo(-8, -30);
          g.closePath(); g.fill();
          g.fillRect(-13, -28, 4, 14); g.fillRect(9, -28, 4, 14);
          g.fillStyle = '#f2c89b';
          g.beginPath(); g.arc(0, -38, 9, 0, 7); g.fill();
          g.fillStyle = '#5a3a22';
          g.beginPath(); g.arc(0, -40, 9, Math.PI, 0); g.fill();
          g.fillRect(-9, -40, 4, 8);
          g.restore();
        },
      };
    }

    function startMarkerDrawable(t: TilePoint): Drawable {
      const c = isoToScreen(t.tx, t.ty);
      return {
        depth: depthKey(t.tx, t.ty) + 0.5, tx: t.tx, ty: t.ty, draw: (g) => {
          g.strokeStyle = '#ffd23d'; g.lineWidth = 3;
          g.beginPath();
          g.moveTo(c.x, c.y - 18); g.lineTo(c.x + 16, c.y - 9);
          g.lineTo(c.x, c.y); g.lineTo(c.x - 16, c.y - 9);
          g.closePath(); g.stroke();
          g.fillStyle = '#ffd23d'; g.font = 'bold 10px monospace'; g.textAlign = 'center';
          g.fillText('START', c.x, c.y - 24);
        },
      };
    }
    // ---------- viewport culling ----------
    function tileRange(cx: number, cy: number, zm: number, wpx: number, hpx: number) {
      const hw = wpx / 2 / zm, hh = hpx / 2 / zm;
      const corners = [
        [cx - hw, cy - hh], [cx + hw, cy - hh], [cx - hw, cy + hh], [cx + hw, cy + hh],
      ];
      let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
      for (const [wx, wy] of corners) {
        const t = screenToTile(wx, wy);
        mnx = Math.min(mnx, t.tx); mxx = Math.max(mxx, t.tx);
        mny = Math.min(mny, t.ty); mxy = Math.max(mxy, t.ty);
      }
      return {
        x0: Math.max(0, Math.floor(mnx) - 2), x1: Math.min(W().w - 1, Math.ceil(mxx) + 2),
        y0: Math.max(0, Math.floor(mny) - 2), y1: Math.min(W().h - 1, Math.ceil(mxy) + 2),
      };
    }

    function diamond(g: CanvasRenderingContext2D, cx: number, cy: number) {
      g.beginPath();
      g.moveTo(cx, cy - TILE_H / 2); g.lineTo(cx + TILE_W / 2, cy);
      g.lineTo(cx, cy + TILE_H / 2); g.lineTo(cx - TILE_W / 2, cy);
      g.closePath();
    }

    // ---------- scene render ----------
    function renderScene(now: number, wpx: number, hpx: number) {
      const w = W();
      const isEdit = modeRef.current === 'edit';
      const c = isEdit ? ed.cam : cam;
      const zm = isEdit ? ed.zoom : zoom;
      const r = tileRange(c.x, c.y, zm, wpx, hpx);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grad = ctx.createLinearGradient(0, 0, 0, hpx);
      grad.addColorStop(0, '#9fd9f2'); grad.addColorStop(1, '#d9f2df');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, wpx, hpx);
      ctx.save();
      ctx.translate(wpx / 2, hpx / 2);
      ctx.scale(zm, zm);
      ctx.translate(-c.x, -c.y);

      // floor
      if (zm < 0.3) {
        // Far LOD: one grass silhouette for the whole map + non-grass tiles only,
        // so fully zoomed-out stays fast even on huge maps.
        const c0 = isoToScreen(-1, -1), c1 = isoToScreen(w.w + 1, -1);
        const c2 = isoToScreen(w.w + 1, w.h + 1), c3 = isoToScreen(-1, w.h + 1);
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y);
        ctx.closePath();
        ctx.fillStyle = TERRAIN_COLORS.grass[0];
        ctx.fill();
        for (const k of Object.keys(w.terrain)) {
          const ci = k.indexOf(',');
          const x = +k.slice(0, ci), y = +k.slice(ci + 1);
          const p = isoToScreen(x, y);
          diamond(ctx, p.x, p.y);
          ctx.fillStyle = TERRAIN_COLORS[w.terrain[k]][0];
          ctx.fill();
        }
      } else {
        for (let y = r.y0; y <= r.y1; y++) {
          for (let x = r.x0; x <= r.x1; x++) {
            const p = isoToScreen(x, y);
            const t = terrainAt(w, x, y);
            const cols = TERRAIN_COLORS[t];
            diamond(ctx, p.x, p.y);
            ctx.fillStyle = ((x + y) % 2 === 0) ? cols[0] : cols[1];
            ctx.fill();
            if (zm >= 0.6) {
              ctx.strokeStyle = 'rgba(0,0,0,0.06)';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
      }

      const inR = (tx: number, ty: number) => tx >= r.x0 - 3 && tx <= r.x1 + 3 && ty >= r.y0 - 3 && ty <= r.y1 + 3;
      const draws: Drawable[] = [];
      for (const run of mergeWallRuns(w.walls)) {
        if (run.h ? inR(run.x1, run.y0) : inR(run.x0, run.y1)) draws.push(...wallRunDrawables(run));
      }
      for (const h of w.huts) if (inR(h.x1, h.y1)) draws.push(...hutDrawables(h));
      for (let si = 0; si < w.stalls.length; si++) { const s = w.stalls[si]; if (inR(s.x1, s.y0)) draws.push(stallDrawable(s, si)); }
      for (const t of w.trees) if (inR(t.tx, t.ty)) draws.push(treeDrawable(t));
      for (const t of w.rocks) if (inR(t.tx, t.ty)) draws.push(rockDrawable(t));
      for (const t of w.crates) if (inR(t.tx, t.ty)) draws.push(crateDrawable(t));

      if (isEdit) {
        for (const s of w.npcSpawns) {
          if (!inR(s.x, s.y)) continue;
          draws.push(personDrawable(s.x, s.y, false, 'down', s.look, depthKey(s.x, s.y, 1), 0));
        }
        if (inR(w.playerStart.tx, w.playerStart.ty)) draws.push(startMarkerDrawable(w.playerStart));
      } else {
        for (const n of npcs) {
          if (!inR(n.fx, n.fy)) continue;
          draws.push(personDrawable(n.fx, n.fy, n.moving, n.facing, n.look,
            depthKey(n.fx, n.fy, 1), now));
        }
        draws.push(personDrawable(player.fx, player.fy, playerMoving, playerFacing, 0,
          depthKey(player.fx, player.fy, 1), now));
        if (carryingIdx >= 0) {
          const cp = isoToScreen(player.fx, player.fy);
          draws.push({
            depth: depthKey(player.fx, player.fy, 2), tx: player.fx, ty: player.fy, draw: (g) => {
              const s = 10, h = 13;
              g.save(); g.translate(cp.x, cp.y - 58);
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
      }
      draws.sort((a, b) => a.depth - b.depth);
      for (const d of draws) d.draw(ctx);

      if (!isEdit && playerPath.length > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (const p of playerPath) {
          const cp = isoToScreen(p.tx, p.ty);
          ctx.beginPath(); ctx.arc(cp.x, cp.y, 3, 0, 7); ctx.fill();
        }
      }

      // ---------- editor overlays ----------
      if (isEdit) {
        if (ed.hover && inBounds(w, ed.hover.tx, ed.hover.ty)) {
          const p = isoToScreen(ed.hover.tx, ed.hover.ty);
          diamond(ctx, p.x, p.y);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
        }
        if (ed.sel) {
          ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 3;
          const outline = (x0: number, y0: number, x1: number, y1: number) => {
            const a = isoToScreen(x0, y0), b = isoToScreen(x1, y0), cc = isoToScreen(x1, y1), d = isoToScreen(x0, y1);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y - TILE_H / 2); ctx.lineTo(b.x + TILE_W / 2, b.y);
            ctx.lineTo(cc.x, cc.y + TILE_H / 2); ctx.lineTo(d.x - TILE_W / 2, d.y);
            ctx.closePath(); ctx.stroke();
          };
          const s = ed.sel;
          if (s.kind === 'tree') { const t = w.trees[s.index]; if (t) outline(t.tx, t.ty, t.tx, t.ty); }
          else if (s.kind === 'rock') { const t = w.rocks[s.index]; if (t) outline(t.tx, t.ty, t.tx, t.ty); }
          else if (s.kind === 'crate') { const t = w.crates[s.index]; if (t) outline(t.tx, t.ty, t.tx, t.ty); }
          else if (s.kind === 'npc') { const t = w.npcSpawns[s.index]; if (t) outline(t.x, t.y, t.x, t.y); }
          else if (s.kind === 'wall') { const t = w.walls[s.index]; if (t) outline(t.x, t.y, t.x, t.y); }
          else if (s.kind === 'start') outline(w.playerStart.tx, w.playerStart.ty, w.playerStart.tx, w.playerStart.ty);
          else if (s.kind === 'stall') { const t = w.stalls[s.index]; if (t) outline(t.x0, t.y0, t.x1, t.y0); }
          else if (s.kind === 'hut') { const t = w.huts[s.index]; if (t) outline(t.x0, t.y0, t.x1, t.y1); }
        }
        if (ed.copyA && ed.hover) {
          const x0 = Math.min(ed.copyA.tx, ed.hover.tx), x1 = Math.max(ed.copyA.tx, ed.hover.tx);
          const y0 = Math.min(ed.copyA.ty, ed.hover.ty), y1 = Math.max(ed.copyA.ty, ed.hover.ty);
          const a = isoToScreen(x0, y0), b = isoToScreen(x1, y0), cc = isoToScreen(x1, y1), d = isoToScreen(x0, y1);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - TILE_H / 2); ctx.lineTo(b.x + TILE_W / 2, b.y);
          ctx.lineTo(cc.x, cc.y + TILE_H / 2); ctx.lineTo(d.x - TILE_W / 2, d.y);
          ctx.closePath();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 2; ctx.stroke();
          ctx.setLineDash([]);
        }
        if (ed.tool === 'paste' && ed.clipboard && ed.hover) {
          const c = ed.clipboard;
          const items: Array<{ dx: number; dy: number }> = [
            ...c.trees, ...c.rocks, ...c.crates, ...c.walls,
            ...c.terrain.map(e => ({ dx: e.dx, dy: e.dy })),
          ];
          ctx.fillStyle = 'rgba(255,210,61,0.35)';
          for (const it of items) {
            const x = ed.hover.tx + it.dx, y = ed.hover.ty + it.dy;
            if (!inBounds(w, x, y)) continue;
            const p = isoToScreen(x, y);
            diamond(ctx, p.x, p.y); ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    // ---------- editor object ops ----------
    function pickObject(tx: number, ty: number): Selection | null {
      const w = W();
      const ni = w.npcSpawns.findIndex(s => s.x === tx && s.y === ty);
      if (ni >= 0) return { kind: 'npc', index: ni };
      const ci = w.crates.findIndex(c => c.tx === tx && c.ty === ty);
      if (ci >= 0) return { kind: 'crate', index: ci };
      const ti = w.trees.findIndex(t => t.tx === tx && t.ty === ty);
      if (ti >= 0) return { kind: 'tree', index: ti };
      const ri = w.rocks.findIndex(t => t.tx === tx && t.ty === ty);
      if (ri >= 0) return { kind: 'rock', index: ri };
      const si = w.stalls.findIndex(s => ty === s.y0 && tx >= s.x0 && tx <= s.x1);
      if (si >= 0) return { kind: 'stall', index: si };
      const hi = w.huts.findIndex(h => tx >= h.x0 && tx <= h.x1 && ty >= h.y0 && ty <= h.y1);
      if (hi >= 0) return { kind: 'hut', index: hi };
      const wi = w.walls.findIndex(t => t.x === tx && t.y === ty);
      if (wi >= 0) return { kind: 'wall', index: wi };
      if (w.playerStart.tx === tx && w.playerStart.ty === ty) return { kind: 'start', index: 0 };
      return null;
    }

    function eraseAt(tx: number, ty: number): boolean {
      const w = W();
      let changed = false;
      const drop = <T extends { tx: number; ty: number }>(arr: T[]) => {
        const i = arr.findIndex(t => t.tx === tx && t.ty === ty);
        if (i >= 0) { arr.splice(i, 1); changed = true; }
      };
      drop(w.trees); drop(w.rocks); drop(w.crates);
      const ni = w.npcSpawns.findIndex(s => s.x === tx && s.y === ty);
      if (ni >= 0) { w.npcSpawns.splice(ni, 1); changed = true; }
      const si = w.stalls.findIndex(s => ty === s.y0 && tx >= s.x0 && tx <= s.x1);
      if (si >= 0) { w.stalls.splice(si, 1); changed = true; }
      const hi = w.huts.findIndex(h => tx >= h.x0 && tx <= h.x1 && ty >= h.y0 && ty <= h.y1);
      if (hi >= 0) { w.huts.splice(hi, 1); changed = true; }
      const wi = w.walls.findIndex(t => t.x === tx && t.y === ty);
      if (wi >= 0) { w.walls.splice(wi, 1); changed = true; }
      if (terrainKey(tx, ty) in w.terrain) { delete w.terrain[terrainKey(tx, ty)]; changed = true; }
      return changed;
    }

    function placeAt(tx: number, ty: number) {
      const w = W();
      if (!inBounds(w, tx, ty)) return;
      const kind = ed.placeKind;
      if (kind === 'tree') w.trees.push({ tx, ty });
      else if (kind === 'rock') w.rocks.push({ tx, ty });
      else if (kind === 'crate') w.crates.push({ tx, ty });
      else if (kind === 'wallH') { if (!w.walls.some(t => t.x === tx && t.y === ty)) w.walls.push({ x: tx, y: ty, h: true }); }
      else if (kind === 'wallV') { if (!w.walls.some(t => t.x === tx && t.y === ty)) w.walls.push({ x: tx, y: ty, h: false }); }
      else if (kind === 'hut') {
        const x0 = tx - 1, y0 = ty - 1, x1 = tx + 1, y1 = ty + 1;
        if (inBounds(w, x0, y0) && inBounds(w, x1, y1)) w.huts.push({ x0, y0, x1, y1 });
      }
      else if (kind === 'stall') {
        if (inBounds(w, tx + 1, ty)) w.stalls.push({ x0: tx, y0: ty, x1: tx + 1 });
      }
      else if (kind === 'npc') {
        const look = 1 + (ed.npcCount % 4);
        ed.npcCount++;
        const wps = [{ tx: tx - 2, ty }, { tx: tx + 2, ty }, { tx, ty: ty + 2 }]
          .filter(p => inBounds(w, p.tx, p.ty));
        w.npcSpawns.push({ name: `Villager ${ed.npcCount}`, look, x: tx, y: ty, waypoints: wps });
      }
      else if (kind === 'start') w.playerStart = { tx, ty };
      saveWorld(w);
      bump();
    }

    function deleteSelection() {
      const s = ed.sel;
      if (!s) return;
      mutate((w) => {
        if (s.kind === 'tree') w.trees.splice(s.index, 1);
        else if (s.kind === 'rock') w.rocks.splice(s.index, 1);
        else if (s.kind === 'crate') w.crates.splice(s.index, 1);
        else if (s.kind === 'npc') w.npcSpawns.splice(s.index, 1);
        else if (s.kind === 'stall') w.stalls.splice(s.index, 1);
        else if (s.kind === 'hut') w.huts.splice(s.index, 1);
        else if (s.kind === 'wall') w.walls.splice(s.index, 1);
        // 'start' cannot be deleted
      });
      ed.sel = null;
      showToastRef.current('Deleted');
    }

    function copySelection() {
      const s = ed.sel;
      if (!s) return;
      const w = W();
      let r: Region | null = null;
      if (s.kind === 'tree') { const t = w.trees[s.index]; r = { x0: t.tx, y0: t.ty, x1: t.tx, y1: t.ty }; }
      else if (s.kind === 'rock') { const t = w.rocks[s.index]; r = { x0: t.tx, y0: t.ty, x1: t.tx, y1: t.ty }; }
      else if (s.kind === 'crate') { const t = w.crates[s.index]; r = { x0: t.tx, y0: t.ty, x1: t.tx, y1: t.ty }; }
      else if (s.kind === 'npc') { const t = w.npcSpawns[s.index]; r = { x0: t.x, y0: t.y, x1: t.x, y1: t.y }; }
      else if (s.kind === 'wall') { const t = w.walls[s.index]; r = { x0: t.x, y0: t.y, x1: t.x, y1: t.y }; }
      else if (s.kind === 'stall') { const t = w.stalls[s.index]; r = { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y0 }; }
      else if (s.kind === 'hut') { const t = w.huts[s.index]; r = { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 }; }
      if (!r) return;
      ed.clipboard = copyRegion(w, r);
      ed.tool = 'paste';
      setTool('paste');
      showToastRef.current(`Copied ${clipboardSize(ed.clipboard)} items — tap to paste`);
    }

    function applyEditorDown(tx: number, ty: number) {
      const w = W();
      if (!inBounds(w, tx, ty)) return;
      if (ed.tool === 'pan') return;
      if (ed.tool === 'select') {
        const s = pickObject(tx, ty);
        ed.sel = s;
        if (s) {
          let ox = tx, oy = ty;
          if (s.kind === 'hut') { const h = w.huts[s.index]; ox = tx - h.x0; oy = ty - h.y0; }
          if (s.kind === 'stall') { const st = w.stalls[s.index]; ox = tx - st.x0; oy = 0; }
          ed.moving = { kind: s.kind, index: s.index, ox, oy };
        }
        bump();
        return;
      }
      if (ed.tool === 'paint') {
        pushUndo();
        ed.stroke = true;
        if (ed.paintTerrain === 'grass') delete w.terrain[terrainKey(tx, ty)];
        else w.terrain[terrainKey(tx, ty)] = ed.paintTerrain;
        saveWorld(w); bump();
        return;
      }
      if (ed.tool === 'erase') {
        pushUndo();
        ed.stroke = true;
        eraseAt(tx, ty);
        saveWorld(w); bump();
        return;
      }
      if (ed.tool === 'place') {
        pushUndo();
        placeAt(tx, ty);
        return;
      }
      if (ed.tool === 'copy') {
        if (!ed.copyA) {
          ed.copyA = { tx, ty };
          showToastRef.current('Corner A set — tap corner B');
        } else {
          const r: Region = {
            x0: Math.min(ed.copyA.tx, tx), y0: Math.min(ed.copyA.ty, ty),
            x1: Math.max(ed.copyA.tx, tx), y1: Math.max(ed.copyA.ty, ty),
          };
          ed.clipboard = copyRegion(w, r);
          ed.copyA = null;
          ed.tool = 'paste';
          setTool('paste');
          showToastRef.current(`Copied ${clipboardSize(ed.clipboard)} items — tap to paste`);
        }
        bump();
        return;
      }
      if (ed.tool === 'paste') {
        if (!ed.clipboard) { showToastRef.current('Clipboard is empty — use Copy first'); return; }
        pushUndo();
        worldRef.current = pasteClipboard(w, ed.clipboard, tx, ty);
        saveWorld(worldRef.current);
        bump();
        return;
      }
    }

    function applyEditorMove(tx: number, ty: number) {
      const w = W();
      if (ed.moving && inBounds(w, tx, ty)) {
        const m = ed.moving;
        const nx = tx - m.ox, ny = ty - m.oy;
        if (m.kind === 'tree') { const t = w.trees[m.index]; t.tx = tx; t.ty = ty; }
        else if (m.kind === 'rock') { const t = w.rocks[m.index]; t.tx = tx; t.ty = ty; }
        else if (m.kind === 'crate') { const t = w.crates[m.index]; t.tx = tx; t.ty = ty; }
        else if (m.kind === 'npc') {
          const t = w.npcSpawns[m.index];
          const dx = tx - t.x, dy = ty - t.y;
          t.x = tx; t.y = ty;
          t.waypoints = t.waypoints.map(p => ({ tx: p.tx + dx, ty: p.ty + dy })).filter(p => inBounds(w, p.tx, p.ty));
        }
        else if (m.kind === 'wall') { const t = w.walls[m.index]; t.x = tx; t.y = ty; }
        else if (m.kind === 'start') w.playerStart = { tx, ty };
        else if (m.kind === 'stall') { const t = w.stalls[m.index]; t.x0 = nx; t.x1 = nx + (t.x1 - t.x0); t.y0 = ty; }
        else if (m.kind === 'hut') {
          const h = w.huts[m.index];
          const hw = h.x1 - h.x0, hh = h.y1 - h.y0;
          if (inBounds(w, nx, ny) && inBounds(w, nx + hw, ny + hh)) {
            h.x0 = nx; h.y0 = ny; h.x1 = nx + hw; h.y1 = ny + hh;
          }
        }
        saveWorld(w);
        bump();
        return;
      }
      if (ed.stroke && inBounds(w, tx, ty)) {
        if (ed.tool === 'paint') {
          if (ed.paintTerrain === 'grass') delete w.terrain[terrainKey(tx, ty)];
          else w.terrain[terrainKey(tx, ty)] = ed.paintTerrain;
          saveWorld(w); bump();
        } else if (ed.tool === 'erase') {
          if (eraseAt(tx, ty)) { saveWorld(w); bump(); }
        }
      }
    }

    // ---------- play tap ----------
    const tapPlay = (tx: number, ty: number) => {
      const w = W();
      if (carryingIdx >= 0) {
        if (isWalkableWorld(w, w.crates, tx, ty) && !(tx === player.tx && ty === player.ty)) {
          w.crates[carryingIdx] = { tx, ty };
          carryingIdx = -1;
          setCarrying(false);
          savePlay();
          showToastRef.current('Placed the crate');
        } else {
          showToastRef.current("Can't place that there");
        }
        return;
      }
      const ci = w.crates.findIndex(c => c.tx === tx && c.ty === ty);
      if (ci >= 0) {
        carryingIdx = ci;
        setCarrying(true);
        playerPath = [];
        showToastRef.current('Picked up the crate — tap a tile to place it');
        return;
      }
      const path = findPath({ tx: player.tx, ty: player.ty }, { tx, ty },
        (x, y) => isWalkableWorld(w, w.crates, x, y));
      if (!path) showToastRef.current("Can't get there");
      else if (path.length > 0) { playerPath = path; pStepT.t = 0; pFrom.x = player.tx; pFrom.y = player.ty; }
    };

    // ---------- pointer events ----------
    const toTile = (e: PointerEvent): TilePoint => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const isEdit = modeRef.current === 'edit';
      const c = isEdit ? ed.cam : cam;
      const zm = isEdit ? ed.zoom : zoom;
      const wx = (px - rect.width / 2) / zm + c.x;
      const wy = (py - rect.height / 2) / zm + c.y;
      return screenToTileInt(wx, wy);
    };

    let pDown: { x: number; y: number; t: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      pDown = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (modeRef.current === 'edit') {
        const rect = canvas.getBoundingClientRect();
        if (ed.tool === 'pan') {
          ed.pan = { sx: e.clientX, sy: e.clientY, cx: ed.cam.x, cy: ed.cam.y, moved: false };
        } else {
          const t = toTile(e);
          ed.hover = t;
          applyEditorDown(t.tx, t.ty);
        }
        void rect;
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (modeRef.current !== 'edit') return;
      const t = toTile(e);
      ed.hover = t;
      if (ed.pan) {
        const rect = canvas.getBoundingClientRect();
        const dx = (e.clientX - ed.pan.sx) / ed.zoom;
        const dy = (e.clientY - ed.pan.sy) / ed.zoom;
        if (Math.abs(e.clientX - ed.pan.sx) + Math.abs(e.clientY - ed.pan.sy) > 6) ed.pan.moved = true;
        ed.cam.x = ed.pan.cx - dx;
        ed.cam.y = ed.pan.cy - dy;
        void rect;
      } else {
        applyEditorMove(t.tx, t.ty);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (modeRef.current === 'play') {
        if (!pDown) return;
        const dx = e.clientX - pDown.x, dy = e.clientY - pDown.y;
        const dtap = performance.now() - pDown.t;
        pDown = null;
        if (dx * dx + dy * dy > 100 || dtap > 600) return;
        const t = toTile(e);
        tapPlay(t.tx, t.ty);
      } else {
        if (ed.pan && !ed.pan.moved) {
          // treat as tap with current tool
          const t = toTile(e);
          if (ed.tool !== 'pan') applyEditorDown(t.tx, t.ty);
        }
        ed.pan = null;
        ed.stroke = false;
        ed.moving = null;
        pDown = null;
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    // ---------- keyboard ----------
    const DIRS: Record<string, { dx: number; dy: number }> = {
      up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
    };
    const keymap: Record<string, string> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const d = keymap[e.code];
      if (d && modeRef.current === 'play') { e.preventDefault(); held.add(d); }
      if (e.code === 'KeyZ' && (e.metaKey || e.ctrlKey) && modeRef.current === 'edit') { e.preventDefault(); doUndo(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const d = keymap[e.code];
      if (d) held.delete(d);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== 'edit') return;
      e.preventDefault();
      ed.zoom = Math.min(2.5, Math.max(0.4, ed.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ---------- api ----------
    const centerEditCam = () => {
      const w = W();
      const c = isoToScreen(w.w / 2, w.h / 2);
      ed.cam.x = c.x; ed.cam.y = c.y;
      ed.zoom = Math.min(1, 900 / ((w.w + w.h) * TILE_W / 2));
    };
    apiRef.current = {
      hold: (d: string, on: boolean) => { if (on) held.add(d); else held.delete(d); },
      zoomIn: () => {
        if (modeRef.current === 'edit') ed.zoom = Math.min(2.5, ed.zoom * 1.2);
        else zoom = Math.min(2.5, zoom * 1.2);
      },
      zoomOut: () => {
        if (modeRef.current === 'edit') ed.zoom = Math.max(0.4, ed.zoom / 1.2);
        else zoom = Math.max(fitZoom(), zoom / 1.2);
      },
      back: () => { window.location.href = window.location.pathname; },
      enterEdit: () => {
        savePlay();
        modeRef.current = 'edit';
        centerEditCam();
        ed.sel = null; ed.copyA = null;
        setResizeW(W().w); setResizeH(W().h);
        setMode('edit');
      },
      exitEdit: () => {
        saveWorld(W());
        modeRef.current = 'play';
        initPlay();
        setMode('play');
      },
    };
    (apiRef.current as unknown as { setEdTool: (t: Tool) => void }).setEdTool = (t: Tool) => { ed.tool = t; ed.copyA = null; };
    (apiRef.current as unknown as { setEdPaint: (t: Terrain) => void }).setEdPaint = (t: Terrain) => { ed.paintTerrain = t; };
    (apiRef.current as unknown as { setEdPlace: (k: PlaceKind) => void }).setEdPlace = (k: PlaceKind) => { ed.placeKind = k; };
    (apiRef.current as unknown as { doUndo: () => void }).doUndo = doUndo;
    (apiRef.current as unknown as { deleteSelection: () => void }).deleteSelection = deleteSelection;
    (apiRef.current as unknown as { copySelection: () => void }).copySelection = copySelection;
    (apiRef.current as unknown as { resetWorld: () => void }).resetWorld = () => {
      if (!window.confirm('Reset the demo world to the default? Your edits will be lost.')) return;
      pushUndo();
      worldRef.current = defaultWorld();
      saveWorld(worldRef.current);
      ed.sel = null; ed.copyA = null; ed.clipboard = null;
      bump();
    };
    (apiRef.current as unknown as { applyResize: (w: number, h: number) => void }).applyResize = (nw: number, nh: number) => {
      pushUndo();
      worldRef.current = resizeWorld(worldRef.current, nw, nh);
      saveWorld(worldRef.current);
      ed.sel = null;
      centerEditCam();
      bump();
    };

    initPlay();

    // ---------- main loop ----------
    let lastDt = 0;
    const stepChar = (
      ch: CharState, path: TilePoint[], stepT: { t: number }, from: { x: number; y: number },
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

    let destroyed = false;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (destroyed) return;
      lastDt = Math.min(50, now - last);
      last = now;
      const dt = lastDt;
      const wpx = canvas.clientWidth, hpx = canvas.clientHeight;

      if (modeRef.current === 'play') {
        const w = W();
        if (playerPath.length === 0) {
          const arr = [...held];
          const hd = arr.length > 0 ? DIRS[arr[arr.length - 1]] : null;
          if (hd) {
            const nx = player.tx + hd.dx, ny = player.ty + hd.dy;
            if (isWalkableWorld(w, w.crates, nx, ny)) {
              playerPath = [{ tx: nx, ty: ny }];
              pStepT.t = 0;
              pFrom.x = player.tx; pFrom.y = player.ty;
            }
          }
        }
        {
          const r = stepChar(player, playerPath, pStepT, pFrom, STEP_MS, () => {
            setCoords(`${player.tx}, ${player.ty}`);
            savePlay();
          });
          playerPath = r.path; playerMoving = r.moving;
          if (r.moving && playerPath.length > 0) {
            const n = playerPath[0];
            playerFacing = faceForMove(player.tx, player.ty, n.tx, n.ty);
          }
        }
        for (let i = 0; i < npcs.length; i++) {
          const n = npcs[i];
          n.thinkT -= dt;
          if (n.path.length === 0 && n.thinkT <= 0) {
            n.thinkT = 2000 + Math.random() * 3000;
            const wpick = n.waypoints[Math.floor(Math.random() * n.waypoints.length)];
            const p = findPath({ tx: n.tx, ty: n.ty }, wpick, (x, y) => isWalkableWorld(w, w.crates, x, y));
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
            n.facing = faceForMove(n.tx, n.ty, nxt.tx, nxt.ty);
          }
        }
        {
          const c = isoToScreen(player.fx, player.fy);
          c.y -= 24; // center the character's body on screen, not its feet
          const k = Math.min(1, dt / 90);
          cam.x += (c.x - cam.x) * k;
          cam.y += (c.y - cam.y) * k;
          clampCamToMap(cam, zoom, wpx, hpx);
        }
      }

      renderScene(now, wpx, hpx);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      ro.disconnect();
      window.clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep editor tool refs in sync with React state
  const edSync = (t: Tool) => {
    setTool(t);
    // the effect reads tool via its own ed object; sync through a custom event on apiRef
    (apiRef.current as unknown as { setEdTool: (t: Tool) => void }).setEdTool?.(t);
  };

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
  const toolBtn = (active: boolean): React.CSSProperties => ({
    ...btn, background: active ? 'rgba(255,210,61,0.9)' : btn.background,
    color: active ? '#222' : '#fff', fontSize: 12, padding: '6px 9px',
  });

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

  const api = apiRef.current as unknown as {
    back: () => void; zoomIn: () => void; zoomOut: () => void;
    enterEdit: () => void; exitEdit: () => void; doUndo: () => void;
    deleteSelection: () => void; copySelection: () => void;
    resetWorld: () => void; applyResize: (w: number, h: number) => void;
    setEdTool: (t: Tool) => void; setEdPaint: (t: Terrain) => void; setEdPlace: (k: PlaceKind) => void;
  };

  const TOOL_HINTS: Record<Tool, string> = {
    select: 'Tap an object to select · drag to move it',
    pan: 'Drag to pan the map',
    paint: 'Drag to paint terrain',
    place: 'Tap a tile to place',
    copy: 'Tap corner A, then corner B',
    paste: 'Tap a tile to paste',
    erase: 'Drag to erase objects and terrain',
  };
  const PLACE_LABELS: Record<PlaceKind, string> = {
    tree: '🌳 Tree', rock: '🪨 Rock', crate: '📦 Crate', hut: '🛖 Hut',
    stall: '🏪 Stall', wallH: '🧱 Wall —', wallV: '🧱 Wall |', npc: '🧍 NPC', start: '🚩 Start',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#9fd9f2', fontFamily: 'system-ui, sans-serif', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />

      {mode === 'play' ? (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 12px', gap: 8 }}>
            <div style={chip}>⛰️ Isometric demo · build 365 · {worldSize} · tile {coords}{carrying ? ' · carrying crate' : ''}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn} onClick={() => api.enterEdit()}>🔨 Builder</button>
              <button style={btn} onClick={() => setInfoOpen(true)}>ℹ Info</button>
              <button style={btn} onClick={() => api.back()}>← Back to game</button>
            </div>
          </div>
          <div style={{
            position: 'absolute', left: 14, bottom: 14, display: 'grid',
            gridTemplateColumns: 'repeat(3, 52px)', gridTemplateRows: 'repeat(3, 52px)', gap: 6,
          }}>
            <span /><PadButton d="up" label="⬆" /><span />
            <PadButton d="left" label="⬅" /><span /><PadButton d="right" label="➡" />
            <span /><PadButton d="down" label="⬇" /><span />
          </div>
          <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button style={{ ...padBtn }} onClick={() => api.zoomIn()}>+</button>
            <button style={{ ...padBtn }} onClick={() => api.zoomOut()}>−</button>
          </div>
          <div style={{
            position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(20,30,40,0.55)', color: '#fff', borderRadius: 8,
            padding: '6px 10px', fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>Tap a tile to walk · tap a crate to pick it up</div>
        </>
      ) : (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={toolBtn(tool === 'select')} onClick={() => edSync('select')}>✋ Select</button>
              <button style={toolBtn(tool === 'pan')} onClick={() => edSync('pan')}>🖐 Pan</button>
              <button style={toolBtn(tool === 'paint')} onClick={() => edSync('paint')}>🖌 Paint</button>
              <button style={toolBtn(tool === 'place')} onClick={() => edSync('place')}>➕ Place</button>
              <button style={toolBtn(tool === 'copy')} onClick={() => edSync('copy')}>⧉ Copy</button>
              <button style={toolBtn(tool === 'paste')} onClick={() => edSync('paste')}>📋 Paste</button>
              <button style={toolBtn(tool === 'erase')} onClick={() => edSync('erase')}>🧽 Erase</button>
              <span style={{ ...chip, maxWidth: 'none' }}>{worldSize}</span>
            </div>
            {tool === 'paint' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TERRAIN_LIST.map(t => (
                  <button key={t} style={toolBtn(paintTerrain === t)} onClick={() => {
                    setPaintTerrain(t);
                    (apiRef.current as unknown as { setEdPaint: (x: Terrain) => void }).setEdPaint?.(t);
                  }}>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: TERRAIN_COLORS[t][0], marginRight: 4 }} />{t}
                  </button>
                ))}
              </div>
            )}
            {tool === 'place' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(PLACE_LABELS) as PlaceKind[]).map(k => (
                  <button key={k} style={toolBtn(placeKind === k)} onClick={() => {
                    setPlaceKind(k);
                    (apiRef.current as unknown as { setEdPlace: (x: PlaceKind) => void }).setEdPlace?.(k);
                  }}>{PLACE_LABELS[k]}</button>
                ))}
              </div>
            )}
            {tool === 'select' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={btn} onClick={() => api.deleteSelection()}>🗑 Delete</button>
                <button style={btn} onClick={() => api.copySelection()}>⧉ Copy selection</button>
              </div>
            )}
          </div>
          <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button style={{ ...padBtn }} onClick={() => api.zoomIn()}>+</button>
            <button style={{ ...padBtn }} onClick={() => api.zoomOut()}>−</button>
          </div>
          <div style={{ position: 'absolute', left: 14, bottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button style={btn} onClick={() => api.exitEdit()}>← Demo</button>
            <button style={btn} onClick={() => api.back()}>← Game</button>
            <button style={btn} onClick={() => setInfoOpen(true)}>ℹ Info</button>
          </div>
          <div style={{ position: 'absolute', right: 14, bottom: 140, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button style={btn} onClick={() => api.doUndo()}>↩ Undo</button>
            <button style={btn} onClick={() => { setResizeW(56); setResizeH(56); setResizeOpen(true); }}>📐 Resize</button>
            <button style={btn} onClick={() => api.resetWorld()}>♻ Reset</button>
          </div>
          <div style={{
            position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(20,30,40,0.55)', color: '#fff', borderRadius: 8,
            padding: '6px 10px', fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', maxWidth: '92vw', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{TOOL_HINTS[tool]}</div>
          {resizeOpen && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
            }}>
              <div style={{ background: '#fff', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 240 }}>
                <div style={{ fontWeight: 700 }}>Map size (10–200)</div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Width
                  <input type="number" min={10} max={200} value={resizeW}
                    onChange={(e) => setResizeW(Number(e.target.value))}
                    style={{ width: 80, padding: 6, borderRadius: 6, border: '1px solid #999' }} />
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Height
                  <input type="number" min={10} max={200} value={resizeH}
                    onChange={(e) => setResizeH(Number(e.target.value))}
                    style={{ width: 80, padding: 6, borderRadius: 6, border: '1px solid #999' }} />
                </label>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button style={{ ...btn, color: '#222', background: '#eee' }} onClick={() => setResizeOpen(false)}>Cancel</button>
                  <button style={btn} onClick={() => { setResizeOpen(false); api.applyResize(resizeW, resizeH); }}>Apply</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {infoOpen && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: 16,
        }} onClick={() => setInfoOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: '#fffdf6', borderRadius: 14, padding: '18px 20px', maxWidth: 520, width: '100%',
            maxHeight: '84vh', overflowY: 'auto', color: '#222', fontSize: 13, lineHeight: 1.5,
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-18px -20px 8px',
              padding: '12px 20px', borderRadius: '14px 14px 0 0',
              backgroundImage: `url(${import.meta.env.BASE_URL}iso-ui/wood-panel.png)`,
              backgroundSize: 'cover', color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.7)',
            }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>⛰️ Isometric Demo — Info</div>
              <button style={{ ...btn, background: 'rgba(20,30,40,0.7)' }} onClick={() => setInfoOpen(false)}>✕ Close</button>
            </div>
            <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>About</div>
            <div>
              A vertical slice of the game's isometric 2.5D direction. Walk the demo town,
              pick up crates, talk-free wandering villagers — then open the 🔨 Builder to paint
              terrain and place objects on maps up to 200×200. Your edits are saved on this device.
            </div>
            <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>Controls</div>
            <div>
              Tap a tile to walk · tap a crate to pick it up, tap again to set it down ·
              D-pad or WASD / arrow keys · + / − to zoom. In the Builder: ✋ select & drag to move,
              🖌 paint terrain, ➕ place objects, ⧉ copy / 📋 paste areas, 🧽 erase, ↩ undo.
            </div>
            <div style={{ fontWeight: 700, margin: '12px 0 4px' }}>Sprite credits</div>
            <div style={{ fontWeight: 700 }}>Characters — Mana Seed Character Base (demo)</div>
            <div>
              Paper-doll character sprites by Seliel the Shaper — body, outfit,
              hair and hat layers with 4-directional walk animations. The free
              demo is usable commercially and non-commercially; the full pack
              (15+ animation pages: farming, fishing, bow, spear, combat) is on
              itch.io. Thank you, Seliel!
            </div>
            <div style={{ marginTop: 4 }}>
              <a href="https://seliel-the-shaper.itch.io/character-base" target="_blank" rel="noreferrer">Mana Seed Character Base on itch.io</a>
            </div>
            <div style={{ fontWeight: 700, marginTop: 10 }}>Market food — Ghostpixxells pixel food</div>
            <div>
              The bread, burgers, pies and more on the market stalls come from the
              "pixelfood" sprite set by Ghostpixxells. Thank you!
            </div>
            <div style={{ fontWeight: 700, marginTop: 10 }}>UI art — free pixel UI sprite sheet</div>
            <div>
              The wooden panels and UI icons (supplied by the user, original author unknown).
            </div>
            <div style={{ fontWeight: 700, marginTop: 10 }}>MSCA — Mana Seed Character Animator for Godot 4</div>
            <div>
              Animation plugin for the Mana Seed sprite systems by Nadine Schwingler
              (feendrache), MIT License. A Godot-side companion tool — the web demo uses the
              same Mana Seed art directly.
            </div>
            <div style={{ marginTop: 4 }}>
              <a href="https://github.com/feendrache/Godot4_msca" target="_blank" rel="noreferrer">MSCA on GitHub</a>
            </div>
            <div style={{ fontWeight: 700, marginTop: 10 }}>little_world_generator</div>
            <div>
              A standalone world-map generator tool (Windows). Not part of the browser demo,
              but a fun companion for drawing your own worlds.
            </div>
            <div style={{ fontWeight: 700, marginTop: 10 }}>Mana Seed sprite packs — Seliel the Shaper</div>
            <div>
              "Mana Seed Farmer Sprite System" and "Mana Seed Character Base Demo" assets are used
              in the main game. Thank you!
            </div>
            <div style={{ marginTop: 4 }}>
              <a href="https://seliel-the-shaper.itch.io/" target="_blank" rel="noreferrer">seliel-the-shaper.itch.io</a>
            </div>
          </div>
        </div>
      )}

      {toast !== '' && (
        <div style={{
          position: 'absolute', top: mode === 'edit' ? 120 : 64, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(20,30,40,0.85)', color: '#fff', borderRadius: 10,
          padding: '8px 14px', fontSize: 13, pointerEvents: 'none', maxWidth: '80vw', textAlign: 'center',
        }}>{toast}</div>
      )}
    </div>
  );
}
