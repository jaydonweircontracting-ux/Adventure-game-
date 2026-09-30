// IsoFieldView (BUILD 365): the live game's field rendered through the isometric
// 2.5D engine. This is a PURE RENDERER — it reads live GameField state (player
// position, townsfolk simulation) and draws the REAL chunk: real buildings from
// buildingDoorwaysFor, real trees from fieldTreesFor, real terrain/roads from
// mapTileFor, in the game's own field palette. All game logic, input, HUD,
// quests, persistence and saves are untouched — only the presentation changes.
// Beta scope: visual field replacement. DOM interaction overlays (door prompts,
// talk buttons) stay on the 2D renderer for now.
import React, { useEffect, useMemo, useRef } from 'react';
import { isoToScreen, screenToTile, TILE_W, TILE_H } from './projection';
import {
  preloadLpcSprites, lpcReady, lpcSprite, NPC_LOOKS, LPC_ROW, type Face4,
} from './isoSprites';
import {
  buildingDoorwaysFor, fieldTreesFor, mapTileFor, fieldPalettes, FIELD_SIZE,
  type Point,
} from '../../App';
import type { Townsperson } from '../townsfolk';

interface IsoFieldViewProps {
  chunk: Point;
  position: Point; // player, field units (0..FIELD_SIZE)
  townsfolk: Townsperson[];
  onExit: () => void; // back to the 2D field
  onTapMove?: (point: Point) => void; // BUILD 366: tap-to-move target
  onTalkTo?: (npc: Townsperson) => void; // BUILD 366: tap an NPC to talk
}

interface Drawable { depth: number; draw: (g: CanvasRenderingContext2D, now: number) => void }

const MARGIN = 48; // world-px background margin around the map
const ROAD_HALF = 5; // road band half-width in tiles

function faceForDelta(dx: number, dy: number): Face4 {
  // screen-space facing from a tile-space delta
  const sx = (dx - dy) * (TILE_W / 2), sy = (dx + dy) * (TILE_H / 2);
  if (Math.abs(sx) > Math.abs(sy)) return sx > 0 ? 'right' : 'left';
  return sy > 0 ? 'down' : 'up';
}

export default function IsoFieldView({ chunk, position, townsfolk, onExit, onTapMove, onTalkTo }: IsoFieldViewProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef({ px: position.x, py: position.y, folk: townsfolk });
  liveRef.current = { px: position.x, py: position.y, folk: townsfolk };
  // tap callbacks via ref so the canvas listener always calls the latest
  const tapRef = useRef({ onTapMove, onTalkTo });
  tapRef.current = { onTapMove, onTalkTo };

  // Real chunk scene — same pure world-gen the 2D renderer uses.
  const scene = useMemo(() => {
    const buildings = buildingDoorwaysFor(chunk);
    const trees = fieldTreesFor(chunk);
    const tile = mapTileFor(chunk);
    return { buildings, trees, tile };
  }, [chunk.x, chunk.y]);

  const zoomRef = useRef(1);
  const [, setZoomTick] = React.useState(0);

  useEffect(() => {
    preloadLpcSprites();
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const g = canvas.getContext('2d')!;
    const N = FIELD_SIZE;
    const palette = fieldPalettes[scene.tile.terrain] || fieldPalettes.meadow;
    const road = scene.tile.road;

    // map bounds in world px (tile space == field units, 1:1)
    const minX = -(N - 1) * (TILE_W / 2) - MARGIN, maxX = (N - 1) * (TILE_W / 2) + MARGIN;
    const minY = -MARGIN, maxY = (2 * N - 2) * (TILE_H / 2) + MARGIN;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    const clampCam = (c: { x: number; y: number }, zm: number, wpx: number, hpx: number) => {
      const hw = wpx / (2 * zm), hh = hpx / (2 * zm);
      const ox = (maxX - minX) / 2 - hw, oy = (maxY - minY) / 2 - hh;
      c.x = Math.max(cx - Math.abs(ox), Math.min(cx + Math.abs(ox), c.x));
      c.y = Math.max(cy - Math.abs(oy), Math.min(cy + Math.abs(oy), c.y));
    };

    const cam = { x: 0, y: 0 };
    {
      const p = isoToScreen(liveRef.current.px, liveRef.current.py);
      cam.x = p.x; cam.y = p.y - 24; // character body centered, not feet
    }
    const playerFace = { f: 'down' as Face4 };
    const prevP = { x: liveRef.current.px, y: liveRef.current.py };

    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);

    const isRoadTile = (tx: number, ty: number): boolean => {
      if (road === 'none') return false;
      const c = N / 2;
      const ew = (road.includes('e') || road.includes('w')) && Math.abs(ty - c) <= ROAD_HALF;
      const ns = (road.includes('n') || road.includes('s')) && Math.abs(tx - c) <= ROAD_HALF;
      return ew || ns;
    };

    const drawPerson = (d: Drawable[], tx: number, ty: number, facing: Face4, moving: boolean, look: number, now: number) => {
      const c = isoToScreen(tx, ty);
      const L = NPC_LOOKS[((look % NPC_LOOKS.length) + NPC_LOOKS.length) % NPC_LOOKS.length];
      const keys = [L.body, 'pants-m', L.shirt, L.head, L.hair];
      d.push({
        depth: tx + ty + 0.01, draw: (g2) => {
          const lift = moving ? Math.abs(Math.sin(now / 130)) * 3 : 0;
          g2.fillStyle = 'rgba(0,0,0,0.22)';
          g2.beginPath(); g2.ellipse(c.x, c.y + 3, 12, 5, 0, 0, 7); g2.fill();
          if (lpcReady(keys)) {
            const frame = moving ? Math.floor(now / 150) % 9 : 0;
            const sx = frame * 64, sy = LPC_ROW[facing] * 64;
            const size = 52;
            const dx = c.x - size / 2, dy = c.y - size + 6 - lift;
            for (const k of keys) {
              const im = lpcSprite(k);
              if (!im) continue;
              g2.drawImage(im, sx, sy, 64, 64, dx, dy, size, size);
            }
            return;
          }
          // vector fallback while sprites load
          g2.save(); g2.translate(c.x, c.y - lift);
          g2.fillStyle = '#4a3220';
          g2.fillRect(-7, -12, 6, 12); g2.fillRect(1, -12, 6, 12);
          g2.fillStyle = '#3b6fd4';
          g2.beginPath();
          g2.moveTo(-10, -12); g2.lineTo(10, -12); g2.lineTo(8, -30); g2.lineTo(-8, -30);
          g2.closePath(); g2.fill();
          g2.fillStyle = '#e8b98a';
          g2.beginPath(); g2.arc(0, -36, 7, 0, 7); g2.fill();
          g2.restore();
        },
      });
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const nowMs = performance.now();
      const dt = Math.min(100, nowMs - last); last = nowMs;
      const zm = zoomRef.current;
      const wpx = canvas.clientWidth || 1, hpx = canvas.clientHeight || 1;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const live = liveRef.current;
      // player facing from movement delta
      const mdx = live.px - prevP.x, mdy = live.py - prevP.y;
      const playerMoving = Math.abs(mdx) + Math.abs(mdy) > 0.01;
      if (playerMoving) playerFace.f = faceForDelta(mdx, mdy);
      prevP.x = live.px; prevP.y = live.py;

      // camera follows the player
      const target = isoToScreen(live.px, live.py);
      target.y -= 24;
      const k = Math.min(1, dt / 90);
      cam.x += (target.x - cam.x) * k;
      cam.y += (target.y - cam.y) * k;
      clampCam(cam, zm, wpx, hpx);

      // background
      g.fillStyle = '#bfe3ef';
      g.fillRect(0, 0, wpx, hpx);
      g.save();
      g.translate(wpx / 2, hpx / 2);
      g.scale(zm, zm);
      g.translate(-cam.x, -cam.y);

      // visible tile range (culled)
      const tl = screenToTile(cam.x - wpx / 2 / zm - TILE_W, cam.y - hpx / 2 / zm - TILE_H);
      const br = screenToTile(cam.x + wpx / 2 / zm + TILE_W, cam.y + hpx / 2 / zm + TILE_H);
      const x0 = Math.max(0, Math.floor(tl.tx) - 1), x1 = Math.min(N - 1, Math.ceil(br.tx) + 1);
      const y0 = Math.max(0, Math.floor(tl.ty) - 1), y1 = Math.min(N - 1, Math.ceil(br.ty) + 1);

      // ground
      const ocean = scene.tile.terrain === 'ocean';
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const p = isoToScreen(tx, ty);
          const hw = TILE_W / 2, hh = TILE_H / 2;
          g.beginPath();
          g.moveTo(p.x, p.y - hh); g.lineTo(p.x + hw, p.y);
          g.lineTo(p.x, p.y + hh); g.lineTo(p.x - hw, p.y);
          g.closePath();
          let col = palette.field;
          if (ocean) col = palette.field;
          else if (isRoadTile(tx, ty)) col = palette.path;
          else if ((tx + ty) % 2 === 0) col = palette.field;
          else col = palette.field; // base; dither below adds variety
          g.fillStyle = col;
          g.fill();
          // BUILD 366: deterministic per-tile detail (chunk-gen video techniques).
          const h = (tx * 73856093) ^ (ty * 19349663) ^ (scene.tile.terrain.length * 83492791);
          const hh2 = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
          const r1 = (hh2 % 1000) / 1000;
          const r2 = (((hh2 >>> 10) ^ hh2) % 1000) / 1000;
          const terr = scene.tile.terrain;
          if (!ocean && !isRoadTile(tx, ty)) {
            if ((tx + ty) % 2 === 1) {
              g.fillStyle = 'rgba(0,0,0,0.05)';
              g.fill();
            }
            if (r1 < 0.10) {
              // sparse grass tuft
              g.fillStyle = 'rgba(0,0,0,0.10)';
              g.fillRect(p.x - 1, p.y - 3, 2, 5);
            } else if (terr === 'forest' && r1 < 0.14) {
              // mushroom
              g.fillStyle = '#c23b2e';
              g.fillRect(p.x - 2, p.y - 4, 5, 3);
              g.fillStyle = '#f5f0e0';
              g.fillRect(p.x - 1, p.y - 3, 1, 1);
              g.fillRect(p.x + 1, p.y - 3, 1, 1);
              g.fillStyle = '#e8dcc0';
              g.fillRect(p.x - 1, p.y - 1, 2, 2);
            } else if ((terr === 'desert' || terr === 'shore') && r1 < 0.16) {
              // pebble / shell
              g.fillStyle = terr === 'shore' ? '#f2e4d8' : '#b9a67f';
              g.fillRect(p.x - 2, p.y - 1, 4, 2);
              g.fillStyle = 'rgba(255,255,255,0.5)';
              g.fillRect(p.x - 1, p.y - 1, 1, 1);
            } else if (terr === 'rock' && r1 < 0.15) {
              // stone chip
              g.fillStyle = 'rgba(0,0,0,0.12)';
              g.fillRect(p.x - 2, p.y - 2, 4, 3);
            } else if (r2 < 0.06) {
              // flower dot (meadow)
              g.fillStyle = r2 < 0.02 ? '#f2d06b' : r2 < 0.04 ? '#e07856' : '#f5f4e6';
              g.fillRect(p.x - 1, p.y - 2, 2, 2);
            }
          }
        }
      }

      const drawables: Drawable[] = [];

      // buildings: real rects -> iso boxes with pitched roofs
      for (const b of scene.buildings) {
        const r = b.rect;
        const p00 = isoToScreen(r.left, r.top), p10 = isoToScreen(r.right, r.top);
        const p11 = isoToScreen(r.right, r.bottom), p01 = isoToScreen(r.left, r.bottom);
        const wallH = 64;
        const top = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - wallH });
        const t00 = top(p00), t10 = top(p10), t11 = top(p11), t01 = top(p01);
        drawables.push({
          depth: r.right + r.bottom, draw: (g2) => {
            // shadow
            g2.fillStyle = 'rgba(0,0,0,0.18)';
            g2.beginPath();
            g2.moveTo(p00.x, p00.y); g2.lineTo(p10.x, p10.y);
            g2.lineTo(p11.x, p11.y); g2.lineTo(p01.x, p01.y);
            g2.closePath(); g2.fill();
            // walls: south-east face (lighter) and south-west face (darker)
            g2.fillStyle = '#8a6a4a';
            g2.beginPath();
            g2.moveTo(p10.x, p10.y); g2.lineTo(p11.x, p11.y);
            g2.lineTo(t11.x, t11.y); g2.lineTo(t10.x, t10.y);
            g2.closePath(); g2.fill();
            g2.fillStyle = '#6e5238';
            g2.beginPath();
            g2.moveTo(p11.x, p11.y); g2.lineTo(p01.x, p01.y);
            g2.lineTo(t01.x, t01.y); g2.lineTo(t11.x, t11.y);
            g2.closePath(); g2.fill();
            // pitched roof: two parallelograms meeting at a ridge
            const ridge = 34;
            const r0 = { x: (t00.x + t10.x) / 2, y: (t00.y + t10.y) / 2 - ridge };
            const r1 = { x: (t01.x + t11.x) / 2, y: (t01.y + t11.y) / 2 - ridge };
            g2.fillStyle = '#a8442f';
            g2.beginPath();
            g2.moveTo(t00.x, t00.y); g2.lineTo(t10.x, t10.y);
            g2.lineTo(r0.x, r0.y); g2.closePath(); g2.fill();
            g2.fillStyle = '#93391f';
            g2.beginPath();
            g2.moveTo(t10.x, t10.y); g2.lineTo(t11.x, t11.y);
            g2.lineTo(r1.x, r1.y); g2.lineTo(r0.x, r0.y);
            g2.closePath(); g2.fill();
            g2.fillStyle = '#7c2f22';
            g2.beginPath();
            g2.moveTo(t11.x, t11.y); g2.lineTo(t01.x, t01.y);
            g2.lineTo(r1.x, r1.y); g2.closePath(); g2.fill();
            // door marker at the real doorway position
            const dp = isoToScreen(b.position.x, b.position.y);
            g2.fillStyle = '#3a2a1c';
            g2.fillRect(dp.x - 5, dp.y - 22, 10, 22);
          },
        });
      }

      // trees: real positions
      for (const t of scene.trees) {
        const c = isoToScreen(t.x, t.y);
        const s = 0.7 + t.scale * 0.6;
        drawables.push({
          depth: t.x + t.y, draw: (g2) => {
            g2.fillStyle = 'rgba(0,0,0,0.15)';
            g2.beginPath(); g2.ellipse(c.x, c.y + 2, 10 * s, 4 * s, 0, 0, 7); g2.fill();
            g2.fillStyle = '#5a4128';
            g2.fillRect(c.x - 3 * s, c.y - 18 * s, 6 * s, 18 * s);
            g2.fillStyle = '#3f7a35';
            g2.beginPath();
            g2.moveTo(c.x, c.y - 58 * s);
            g2.lineTo(c.x + 20 * s, c.y - 14 * s);
            g2.lineTo(c.x - 20 * s, c.y - 14 * s);
            g2.closePath(); g2.fill();
            g2.fillStyle = '#4c8a3f';
            g2.beginPath();
            g2.moveTo(c.x, c.y - 48 * s);
            g2.lineTo(c.x + 14 * s, c.y - 14 * s);
            g2.lineTo(c.x - 14 * s, c.y - 14 * s);
            g2.closePath(); g2.fill();
          },
        });
      }

      // townsfolk: the live NPC simulation, right where the 2D game has them
      for (const npc of live.folk) {
        const seed = npc.seed || 1;
        const look = npc.gender === 'female' ? (seed % 2 === 0 ? 1 : 3) : (seed % 2 === 0 ? 2 : 4);
        drawPerson(drawables, npc.position.x, npc.position.y, npc.facing as Face4, npc.moving, look, nowMs);
      }
      // player
      drawPerson(drawables, live.px, live.py, playerFace.f, playerMoving, 0, nowMs);

      drawables.sort((a, b) => a.depth - b.depth);
      for (const d of drawables) d.draw(g, nowMs);

      g.restore();
    };
    raf = requestAnimationFrame(frame);

    // BUILD 366: tap-to-move + tap-to-talk. Hit-test NPCs first (screen
    // distance), then doors (walk to the doorway — the game loop's existing
    // doorway check fires entry), else walk to the tapped field point.
    const onTap = (e: PointerEvent) => {
      const { onTapMove: tapMove, onTalkTo: talk } = tapRef.current;
      if (!tapMove && !talk) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const zm = zoomRef.current;
      const wpx = rect.width || 1, hpx = rect.height || 1;
      // inverse of the frame()'s translate/scale/translate camera transform
      const wx = (sx - wpx / 2) / zm + cam.x;
      const wy = (sy - hpx / 2) / zm + cam.y;
      // NPC hit test in screen space (generous 34px radius for touch)
      if (talk) {
        let best: Townsperson | null = null; let bestD = 34;
        for (const npc of liveRef.current.folk) {
          if (npc.indoors) continue;
          const w = isoToScreen(npc.position.x, npc.position.y);
          const px = (w.x - cam.x) * zm + wpx / 2;
          const py = (w.y - cam.y) * zm + hpx / 2 - 24; // sprite center-ish
          const d = Math.hypot(px - sx, py - sy);
          if (d < bestD) { bestD = d; best = npc; }
        }
        if (best) { talk(best); return; }
      }
      // door hit test: tap near a doorway walks the player to it
      if (tapMove) {
        let bestDoor: { x: number; y: number } | null = null; let bestD = 40;
        for (const b of scene.buildings) {
          const w = isoToScreen(b.position.x, b.position.y);
          const px = (w.x - cam.x) * zm + wpx / 2;
          const py = (w.y - cam.y) * zm + hpx / 2;
          const d = Math.hypot(px - sx, py - sy);
          if (d < bestD) { bestD = d; bestDoor = b.position; }
        }
        if (bestDoor) { tapMove({ x: bestDoor.x, y: bestDoor.y }); return; }
        // otherwise walk to the tapped tile (field units == tile space)
        const t = screenToTile(wx, wy);
        const tx = Math.min(N - 1, Math.max(0, t.tx));
        const ty = Math.min(N - 1, Math.max(0, t.ty));
        tapMove({ x: tx, y: ty });
      }
    };
    canvas.addEventListener('pointerdown', onTap);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); canvas.removeEventListener('pointerdown', onTap); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const btn: React.CSSProperties = {
    userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
    width: 52, height: 52, borderRadius: 14, border: '2px solid rgba(255,255,255,0.25)',
    background: 'rgba(40,60,70,0.78)', color: '#fff', fontSize: 24,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    touchAction: 'manipulation',
  };

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#bfe3ef' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {/* zoom controls (bottom-right) */}
      <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5 }}>
        <button aria-label="Zoom in" style={btn}
          onPointerDown={(e) => { e.preventDefault(); zoomRef.current = Math.min(2.5, zoomRef.current * 1.2); setZoomTick(t => t + 1); }}>+</button>
        <button aria-label="Zoom out" style={btn}
          onPointerDown={(e) => { e.preventDefault(); zoomRef.current = Math.max(0.15, zoomRef.current / 1.2); setZoomTick(t => t + 1); }}>−</button>
      </div>
      {/* beta badge + exit */}
      <div style={{
        position: 'absolute', left: 12, top: 12, zIndex: 5, display: 'flex', gap: 8, alignItems: 'center',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}>
        <span style={{
          background: 'rgba(20,30,38,0.78)', color: '#ffd98a', fontSize: 12, fontWeight: 700,
          padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(255,217,138,0.4)',
        }}>2.5D BETA</span>
        <button aria-label="Back to 2D view" onClick={onExit} style={{
          ...btn, width: 'auto', padding: '0 14px', fontSize: 14, fontWeight: 700, height: 40,
        }}>2D view</button>
      </div>
    </div>
  );
}
