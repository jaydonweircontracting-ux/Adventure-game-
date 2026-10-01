// IsoFieldView (BUILD 365, multi-chunk render BUILD 376): the live game's
// field rendered through the isometric 2.5D engine. This is a PURE RENDERER —
// it reads live GameField state (player position, townsfolk simulation) and
// draws the REAL chunks: real buildings from buildingDoorwaysFor, real trees
// from fieldTreesFor, real terrain/roads from mapTileFor, in the game's own
// field palette. BUILD 376 renders a 3x3 chunk grid around the player's chunk
// so generated terrain fills the whole screen at every zoom level (the old
// single-chunk render left the blue background visible around the map
// diamond). All game logic, input, HUD, quests, persistence and saves are
// untouched — only the presentation changes.
// Beta scope: visual field replacement. DOM interaction overlays (door prompts,
// talk buttons) stay on the 2D renderer for now.
import React, { useEffect, useMemo, useRef } from 'react';
import { isoToScreen, screenToTile, TILE_W, TILE_H } from './projection';
import {
  preloadLpcSprites, tileFaceForDelta, type Face4,
} from './isoSprites';
import { CharacterAnimator, drawIsoCharacter, type LookRef } from './characterSystem';
import {
  buildingDoorwaysFor, fieldTreesFor, mapTileFor, fieldPalettes, FIELD_SIZE,
  type Point, type Doorway, type FieldTree, type MapTile,
} from '../../App';
import type { Townsperson } from '../townsfolk';
// BUILD 369 (Phase 2b): authoritative water/bridges in the iso field.
import { waterGridForChunk, waterGridAt, type WaterGrid } from '../landscape';
// BUILD 376: multi-chunk rendering so generated terrain fills the whole
// screen at every zoom level — no blue void where nothing was generated.
import {
  ISO_CHUNK_RENDER_RADIUS, isoTileChunkOffset, isoChunkGridBounds, clampChunkOffset,
  isoVisibleTileRange,
} from './isoChunks';

interface IsoFieldViewProps {
  chunk: Point;
  position: Point; // player, field units (0..FIELD_SIZE)
  townsfolk: Townsperson[];
  onExit: () => void; // back to the 2D field
  onTapMove?: (point: Point) => void; // BUILD 366: tap-to-move target
  onTalkTo?: (npc: Townsperson) => void; // BUILD 366: tap an NPC to talk
  zoom: number; // BUILD 372: zoom is owned by App so the main zoom buttons drive it
  onZoomChange: (z: number) => void;
}

interface Drawable { depth: number; draw: (g: CanvasRenderingContext2D, now: number) => void }

// BUILD 376: one rendered scene per chunk in the chunk grid around the
// player's chunk. Tiles are addressed relative to the current chunk origin:
// the home chunk occupies [0, N), neighbor (ox, oy) occupies
// [ox*N, (ox+1)*N). The iso projection is linear, so neighbor diamonds tile
// seamlessly and generated terrain fills the whole screen at every zoom.
interface IsoChunkScene {
  ox: number; oy: number;
  buildings: Doorway[]; trees: FieldTree[];
  tile: MapTile; water: WaterGrid;
  palette: { field: string; path: string; glow: string };
  road: string;
}

const MARGIN = 48; // world-px background margin around the map
const ROAD_HALF = 5; // road band half-width in tiles

export default function IsoFieldView({ chunk, position, townsfolk, onExit, onTapMove, onTalkTo, zoom, onZoomChange }: IsoFieldViewProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef({ px: position.x, py: position.y, folk: townsfolk });
  liveRef.current = { px: position.x, py: position.y, folk: townsfolk };
  // tap callbacks via ref so the canvas listener always calls the latest
  const tapRef = useRef({ onTapMove, onTalkTo });
  tapRef.current = { onTapMove, onTalkTo };

  const R = ISO_CHUNK_RENDER_RADIUS;
  const GRID = 2 * R + 1;

  // Real chunk scenes — same pure world-gen the 2D renderer uses, built for
  // the home chunk plus its neighbors.
  const scenes = useMemo(() => {
    const list: IsoChunkScene[] = [];
    for (let oy = -R; oy <= R; oy++) {
      for (let ox = -R; ox <= R; ox++) {
        const cp = { x: chunk.x + ox, y: chunk.y + oy };
        const tile = mapTileFor(cp);
        list.push({
          ox, oy,
          buildings: buildingDoorwaysFor(cp),
          trees: fieldTreesFor(cp),
          tile,
          water: waterGridForChunk(cp.x, cp.y, 70),
          palette: fieldPalettes[tile.terrain] || fieldPalettes.meadow,
          road: tile.road,
        });
      }
    }
    return list;
  }, [chunk.x, chunk.y]);
  const homeScene = scenes[R * GRID + R];
  const sceneFor = (ox: number, oy: number): IsoChunkScene => {
    const c = clampChunkOffset(ox, oy, R);
    return scenes[(c.oy + R) * GRID + (c.ox + R)];
  };

  // BUILD 372: zoom lives in App (the main black zoom buttons drive it);
  // mirror to a ref for the rAF loop and canvas listeners.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    preloadLpcSprites();
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const g = canvas.getContext('2d')!;
    const N = FIELD_SIZE;
    // BUILD 376: map bounds in world px (tile space == field units, 1:1)
    // covering the whole rendered chunk grid, so the camera never reveals
    // ungenerated void — the old single-chunk bounds are what left the blue
    // background visible around the map diamond.
    const gb = isoChunkGridBounds(R, N, MARGIN);
    const minX = gb.minX, maxX = gb.maxX, minY = gb.minY, maxY = gb.maxY;
    const cx = gb.cx, cy = gb.cy;

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
    // Per-character animation controllers (no React state — plain map in the
    // render loop; pruned each frame so removed NPCs don't leak).
    const charAnims = new Map<string, CharacterAnimator>();
    const seenAnims = new Set<string>(); // reset each frame; prunes charAnims

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

    // BUILD 376: per-chunk road check (each chunk has its own road string).
    const isRoadTileFor = (sc: IsoChunkScene, lx: number, ly: number): boolean => {
      const rd = sc.road;
      if (rd === 'none') return false;
      const c = N / 2;
      const ew = (rd.includes('e') || rd.includes('w')) && Math.abs(ly - c) <= ROAD_HALF;
      const ns = (rd.includes('n') || rd.includes('s')) && Math.abs(lx - c) <= ROAD_HALF;
      return ew || ns;
    };

    // Shared character renderer: one animator per character id drives facing,
    // walk/idle state and speed-tied walk phase; the draw is feet-anchored.
    const drawPerson = (d: Drawable[], tx: number, ty: number, facing: Face4, moving: boolean, look: LookRef, now: number, animKey: string) => {
      const c = isoToScreen(tx, ty);
      let anim = charAnims.get(animKey);
      if (!anim) { anim = new CharacterAnimator(animKey); charAnims.set(animKey, anim); }
      seenAnims.add(animKey);
      anim.update({ x: tx, y: ty, moving, facing, nowMs: now });
      d.push({
        depth: tx + ty + 0.01, draw: (g2) => {
          drawIsoCharacter({ g: g2, x: c.x, y: c.y, look, nowMs: now, animator: anim });
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
      if (playerMoving) playerFace.f = tileFaceForDelta(mdx, mdy);
      prevP.x = live.px; prevP.y = live.py;

      // camera follows the player
      const target = isoToScreen(live.px, live.py);
      target.y -= 24;
      const k = Math.min(1, dt / 90);
      cam.x += (target.x - cam.x) * k;
      cam.y += (target.y - cam.y) * k;
      clampCam(cam, zm, wpx, hpx);

      // background — BUILD 376: dark neutral fallback. Generated terrain now
      // covers the whole viewport at every zoom, so this should never show;
      // the old light blue is what used to read as "not generated".
      g.fillStyle = '#0e1713';
      g.fillRect(0, 0, wpx, hpx);
      g.save();
      g.translate(wpx / 2, hpx / 2);
      g.scale(zm, zm);
      g.translate(-cam.x, -cam.y);

      // visible tile range (culled) — BUILD 376: spans into neighbor chunks,
      // so zooming out shows real generated terrain instead of blue void.
      // BUILD 385: four-corner range via isoVisibleTileRange (the old
      // two-corner range missed the tiles covering the viewport's top and
      // bottom edges, leaving black bars). Out-of-grid tiles reuse the
      // edge-clamped scene, so the view fills the whole screen at every zoom.
      const { x0, x1, y0, y1 } = isoVisibleTileRange(cam.x, cam.y, wpx, hpx, zm);

      // ground — per-tile chunk lookup into the scene grid
      // BUILD 376: tile detail is sub-pixel when zoomed out, so skip it there.
      const showDetail = zm > 0.45;
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const { ox, oy, lx, ly } = isoTileChunkOffset(tx, ty, N);
          const sc = sceneFor(ox, oy);
          const terr = sc.tile.terrain;
          const p = isoToScreen(tx, ty);
          const hw = TILE_W / 2, hh = TILE_H / 2;
          g.beginPath();
          g.moveTo(p.x, p.y - hh); g.lineTo(p.x + hw, p.y);
          g.lineTo(p.x, p.y + hh); g.lineTo(p.x - hw, p.y);
          g.closePath();
          const isOcean = terr === 'ocean';
          const roadHere = isOcean ? false : isRoadTileFor(sc, lx, ly);
          let col = sc.palette.field;
          if (roadHere) col = sc.palette.path;
          // BUILD 369 (Phase 2b): authoritative rivers/lakes; road crossings draw as bridges.
          if (!isOcean) {
            const wq = waterGridAt(sc.water, (chunk.x + sc.ox) * FIELD_SIZE + lx + 0.5, (chunk.y + sc.oy) * FIELD_SIZE + ly + 0.5);
            if (wq.depth > 0.25) {
              if (roadHere) col = '#8a6a44'; // bridge planks
              else {
                const t = Math.min(1, wq.depth);
                const deep = wq.kind === 2 ? '#2a64b0' : '#2f6cb8';
                const shal = wq.kind === 2 ? '#5aa3de' : '#55a0dd';
                // mix shallow->deep by depth (hex lerp)
                const sd = parseInt(shal.slice(1), 16), dd = parseInt(deep.slice(1), 16);
                const r = Math.round(((sd >> 16) & 255) + (((dd >> 16) & 255) - ((sd >> 16) & 255)) * t);
                const gg = Math.round(((sd >> 8) & 255) + (((dd >> 8) & 255) - ((sd >> 8) & 255)) * t);
                const b = Math.round((sd & 255) + ((dd & 255) - (sd & 255)) * t);
                col = '#' + ((1 << 24) + (r << 16) + (gg << 8) + b).toString(16).slice(1);
              }
            }
          }
          g.fillStyle = col;
          g.fill();
          // BUILD 366: deterministic per-tile detail (chunk-gen video techniques).
          // (chunk offset mixed into the hash so neighbor chunks don't repeat
          // the home chunk's pattern; home chunk hash is unchanged.)
          if (showDetail && !isOcean && !roadHere) {
            const h = (lx * 73856093) ^ (ly * 19349663) ^ (terr.length * 83492791) ^ ((sc.ox * 31 + sc.oy * 57) * 2654435761);
            const hh2 = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
            const r1 = (hh2 % 1000) / 1000;
            const r2 = (((hh2 >>> 10) ^ hh2) % 1000) / 1000;
            if ((lx + ly) % 2 === 1) {
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

      // buildings: real rects -> iso boxes with pitched roofs. BUILD 376:
      // drawn for every chunk in the scene grid; neighbor rects are offset
      // into current-chunk-relative tile space so they tile seamlessly.
      for (const sc of scenes) {
        const bx = sc.ox * N, by = sc.oy * N;
        for (const b of sc.buildings) {
          const r = { left: b.rect.left + bx, top: b.rect.top + by, right: b.rect.right + bx, bottom: b.rect.bottom + by };
          const bpos = { x: b.position.x + bx, y: b.position.y + by };
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
            // pitched roof: ridge runs tile-north/south; four closed planes so
            // no terrain shows through. Back slopes darker, front lighter.
            const ridge = 34;
            const r0 = { x: (t00.x + t10.x) / 2, y: (t00.y + t10.y) / 2 - ridge };
            const r1 = { x: (t01.x + t11.x) / 2, y: (t01.y + t11.y) / 2 - ridge };
            // back slopes first
            g2.fillStyle = '#93391f';
            g2.beginPath();
            g2.moveTo(t00.x, t00.y); g2.lineTo(t10.x, t10.y);
            g2.lineTo(r0.x, r0.y); g2.closePath(); g2.fill();
            g2.fillStyle = '#7c2f22';
            g2.beginPath();
            g2.moveTo(t01.x, t01.y); g2.lineTo(t00.x, t00.y);
            g2.lineTo(r0.x, r0.y); g2.lineTo(r1.x, r1.y);
            g2.closePath(); g2.fill();
            // front slopes
            g2.fillStyle = '#a8442f';
            g2.beginPath();
            g2.moveTo(t10.x, t10.y); g2.lineTo(t11.x, t11.y);
            g2.lineTo(r1.x, r1.y); g2.lineTo(r0.x, r0.y);
            g2.closePath(); g2.fill();
            g2.fillStyle = '#b05038';
            g2.beginPath();
            g2.moveTo(t11.x, t11.y); g2.lineTo(t01.x, t01.y);
            g2.lineTo(r1.x, r1.y); g2.closePath(); g2.fill();
            // door: project the doorway trigger onto the nearest VISIBLE wall
            // face (south or east) instead of drawing the interior point.
            const dpx = bpos.x, dpy = bpos.y;
            const southDist = r.bottom - dpy, eastDist = r.right - dpx;
            let dg: { x: number; y: number };
            if (southDist <= eastDist) {
              const t = Math.min(0.92, Math.max(0.08, (dpx - r.left) / Math.max(1, r.right - r.left)));
              dg = { x: p01.x + (p11.x - p01.x) * t, y: p01.y + (p11.y - p01.y) * t };
            } else {
              const t = Math.min(0.92, Math.max(0.08, (dpy - r.top) / Math.max(1, r.bottom - r.top)));
              dg = { x: p10.x + (p11.x - p10.x) * t, y: p10.y + (p11.y - p10.y) * t };
            }
            const doorW = 12, doorH = 26;
            g2.fillStyle = '#4a3524';
            g2.fillRect(dg.x - doorW / 2 - 1, dg.y - doorH - 1, doorW + 2, doorH + 2);
            g2.fillStyle = '#2a1c12';
            g2.fillRect(dg.x - doorW / 2, dg.y - doorH, doorW, doorH);
          },
        });
        } // end neighbor-chunk building loop
      }

      // trees: real positions — BUILD 376: every chunk in the scene grid,
      // offset into current-chunk-relative tile space.
      for (const sc of scenes) {
        const bx = sc.ox * N, by = sc.oy * N;
        for (const t of sc.trees) {
          const tx2 = t.x + bx, ty2 = t.y + by;
          const c = isoToScreen(tx2, ty2);
        const s = 0.7 + t.scale * 0.6;
        drawables.push({
          depth: tx2 + ty2, draw: (g2) => {
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
        } // end neighbor-chunk tree loop
      }

      // townsfolk: the live NPC simulation, right where the 2D game has them.
      // look = npc.id -> deterministic per-NPC variant (same villager, same
      // face, every session).
      seenAnims.clear();
      for (const npc of live.folk) {
        drawPerson(drawables, npc.position.x, npc.position.y, npc.facing as Face4, npc.moving, npc.id, nowMs, npc.id);
      }
      // player
      drawPerson(drawables, live.px, live.py, playerFace.f, playerMoving, 0, nowMs, 'player');
      for (const k of charAnims.keys()) if (!seenAnims.has(k)) charAnims.delete(k);

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
      // door hit test: tap near a doorway walks the player to it.
      // BUILD 376: home-chunk doors only (neighbor-chunk doors belong to the
      // 2D game's chunk-crossing flow, unchanged).
      if (tapMove) {
        let bestDoor: { x: number; y: number } | null = null; let bestD = 40;
        for (const b of homeScene.buildings) {
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
  }, [scenes]);

  const btn: React.CSSProperties = {
    userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
    width: 52, height: 52, borderRadius: 14, border: '2px solid rgba(255,255,255,0.25)',
    background: 'rgba(40,60,70,0.78)', color: '#fff', fontSize: 24,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    touchAction: 'manipulation',
  };

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0e1713' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {/* BUILD 372: zoom is driven by the main black zoom buttons (App), so the
          duplicate in-canvas zoom controls were removed. */}
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
