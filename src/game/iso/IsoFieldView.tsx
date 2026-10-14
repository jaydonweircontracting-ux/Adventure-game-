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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isoToScreen, screenToTile, TILE_W, TILE_H } from './projection';
import {
  preloadLpcSprites, isoPlayerFaceForScreenDeltaSticky, type Face4, type Face8,
} from './isoSprites';
import { preloadBarbarian } from './barbarian';
import type { BarbarianOutfit, BarbarianWeapon } from './barbarian';
import { BARBARIAN_ATTACK_MS } from './barbarian';
import { CharacterAnimator, drawIsoCharacter, type LookRef } from './characterSystem';
import { artUrl } from '../artCache';
import { computeDirtPathGeometry, buildDirtPath2D, DIRT_LAYER_STYLE } from './dirtPaths';
// BUILD 389: user-supplied landscape tileset + ambient critters.
import {
  preloadIsoTiles, isoTilesReady, drawGroundTile, drawDecor,
  groundTileFor, decorTileFor, mosslightSandAt,
} from './isoTiles';
import {
  preloadCritters, crittersReady, crittersForChunk, critterPose, drawCritter,
  type AmbientCritter,
} from './critters';
import {
  buildingDoorwaysFor, fieldTreesFor, fieldOresFor, mapTileFor, fieldPalettes, FIELD_SIZE,
  isStartingArea, ORE_COLORS, settlementDecorFor, cottageVariantForRect,
  type Point, type Doorway, type FieldTree, type FieldOre, type MapTile,
} from '../../App';
import type { Townsperson } from '../townsfolk';
// BUILD 692: district-appropriate art variants for the engine's filler lots.
import { mosslightFillerLots, fillerVariantForLot } from '../mosslightLayout';
// BUILD 684: single authoritative building asset catalog (was: hardcoded
// kind->path maps duplicated in this file). Anchor/scale conventions documented
// in src/game/buildingRig.ts.
import { BUILDING_ASSET_META } from '../buildingRig';
// BUILD 369 (Phase 2b): authoritative water/bridges in the iso field.
import { waterGridForChunk, waterGridAt, type WaterGrid } from '../landscape';
// BUILD 376: multi-chunk rendering so generated terrain fills the whole
// screen at every zoom level — no blue void where nothing was generated.
import {
  ISO_CHUNK_RENDER_RADIUS, isoTileChunkOffset, isoChunkGridBounds, clampChunkOffset,
  isoVisibleTileRange,
} from './isoChunks';

// BUILD 692: cached textured dirt-path layers per decor chunk. Lanes are
// static world geometry (seed-pinned town), so the Path2D layers are built
// once per chunk key and re-stroked every frame — zero per-frame allocation.
type DirtPathCacheEntry = ReturnType<typeof buildDirtPath2D>;
const dirtPathCache = new Map<string, DirtPathCacheEntry>();

interface IsoFieldViewProps {
  chunk: Point;
  position: Point; // player, field units (0..FIELD_SIZE)
  townsfolk: Townsperson[];
  goats?: Array<{ id: number; kind: string; position: Point; facing: string; disposition: string }>; // BUILD 458: critter kinds
  onExit: () => void; // back to the 2D field
  onTapMove?: (point: Point) => void; // BUILD 366: tap-to-move target
  onTalkTo?: (npc: Townsperson) => void; // BUILD 366: tap an NPC to talk
  // BUILD 684: loot drops — rendered in iso (were 2D-DOM only, invisible here).
  droppedLoot?: Array<{ id: number; position: Point }>;
  onPickupDrop?: (drop: { id: number; position: Point }) => void;
  // BUILD 684: floating combat text — rendered in iso (were 2D-DOM only).
  damageTexts?: Array<{ id: number; text: string; position: Point; kind: string }>;
  zoom: number; // BUILD 372: zoom is owned by App so the main zoom buttons drive it
  onZoomChange: (z: number) => void;
  // BUILD 390: barbarian player equipment -> iso sprite variant + attack anim.
  barbOutfit?: BarbarianOutfit;
  barbWeapon?: BarbarianWeapon;
  barbHair?: string;
  barbAttackSequence?: number;
  // BUILD 422: debug direction test — when set, the player shows this facing's
  // sprite sheet with the walk cycle playing, ignoring movement deltas.
  debugFacing?: Face8 | null;
  // BUILD 459: collision box debug — red = current box, green = draggable proposed box
  collisionDebug?: boolean;
}

interface Drawable { depth: number; draw: (g: CanvasRenderingContext2D, now: number) => void }

// BUILD 376: one rendered scene per chunk in the chunk grid around the
// player's chunk. Tiles are addressed relative to the current chunk origin:
// the home chunk occupies [0, N), neighbor (ox, oy) occupies
// [ox*N, (ox+1)*N). The iso projection is linear, so neighbor diamonds tile
// seamlessly and generated terrain fills the whole screen at every zoom.
interface IsoChunkScene {
  ox: number; oy: number;
  buildings: Doorway[]; trees: FieldTree[]; ores: FieldOre[];
  tile: MapTile; water: WaterGrid;
  palette: { field: string; path: string; glow: string };
  road: string;
}

const MARGIN = 48; // world-px background margin around the map
const ROAD_HALF = 5; // road band half-width in tiles

export default function IsoFieldView({ chunk, position, townsfolk, goats, onExit, onTapMove, onTalkTo, droppedLoot, onPickupDrop, damageTexts, zoom, onZoomChange, barbOutfit, barbWeapon, barbHair, barbAttackSequence, debugFacing, collisionDebug }: IsoFieldViewProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef({ px: position.x, py: position.y, folk: townsfolk, goats, barbOutfit, barbWeapon, barbHair, barbAttackSequence, debugFacing, droppedLoot, damageTexts });
  liveRef.current = { px: position.x, py: position.y, folk: townsfolk, goats, barbOutfit, barbWeapon, barbHair, barbAttackSequence, debugFacing, droppedLoot, damageTexts };
  // BUILD 684: first-seen timestamps for floating combat text (float-up anim).
  const dmgSeenRef = useRef(new Map<number, number>());
  // BUILD 624: Preload all building/prop sprites on mount so there's no
  // "old house" flash — sprites are cached before the render loop needs them.
  // BUILD 684: building paths from the single asset catalog.
  // BUILD 690: artUrl cache-busting (?v=build) so iOS Safari fetches fresh
  // sprites after art changes (e.g. the 689 door flip).
  useEffect(() => {
    const urls = [
      ...Object.values(BUILDING_ASSET_META).map((m) => m.file),
      'props/market-stall.png', 'props/stall-red.png', 'props/stall-blue.png',
      'props/stall-green.png', 'props/barrel.png', 'props/well.png',
      'props/fountain.png', 'props/lamp.png',
    ];
    for (const src of urls) {
      const img = new Image();
      img.src = artUrl(src);
    }
  }, []);
  // BUILD 460: collision debug selection — tap a critter to select, drag green box to reposition
  const [selectedCritterId, setSelectedCritterId] = useState<number | null>(null);
  const greenBoxRef = useRef({ dx: 0, dy: 0, hw: 0.35, hh: 0.4 }); // offset and size in world units
  // tap callbacks via ref so the canvas listener always calls the latest
  const tapRef = useRef({ onTapMove, onTalkTo, onPickupDrop });
  tapRef.current = { onTapMove, onTalkTo, onPickupDrop };

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
          ores: fieldOresFor(cp),
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
    preloadBarbarian(); // BUILD 389: user-supplied player sprite
    preloadIsoTiles(); // BUILD 389: landscape tileset
    preloadCritters(); // BUILD 389: ambient critters
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
    const playerFace = { f: 'down' as Face8 };
    const prevP = { x: liveRef.current.px, y: liveRef.current.py };
    // Per-character animation controllers (no React state — plain map in the
    // render loop; pruned each frame so removed NPCs don't leak).
    const charAnims = new Map<string, CharacterAnimator>();
    const seenAnims = new Set<string>(); // reset each frame; prunes charAnims
    // BUILD 390: track the player's attack sequence -> swing start time so the
    // barbarian attack clip plays once per swing.
    let lastAttackSeq = -1;
    let attackStartMs = -1e9;

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
    const drawPerson = (d: Drawable[], tx: number, ty: number, facing: Face8, moving: boolean, look: LookRef, now: number, animKey: string, barb?: { attackT?: number }) => {
      const c = isoToScreen(tx, ty);
      let anim = charAnims.get(animKey);
      if (!anim) { anim = new CharacterAnimator(animKey); charAnims.set(animKey, anim); }
      seenAnims.add(animKey);
      anim.update({ x: tx, y: ty, moving, facing, nowMs: now });
      d.push({
        depth: tx + ty + 0.01, draw: (g2) => {
          drawIsoCharacter({
            g: g2, x: c.x, y: c.y, look, nowMs: now, animator: anim,
            barbOutfit: liveRef.current.barbOutfit,
            barbWeapon: liveRef.current.barbWeapon,
            barbHair: liveRef.current.barbHair,
            barbAttackT: barb?.attackT,
          });
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
      // Perf-debug hook (?nodirt=1): skip textured dirt paths for A/B timing.
      const skipDirt = (frame as unknown as { __skipDirt?: boolean }).__skipDirt
        ?? ((frame as unknown as { __skipDirt?: boolean }).__skipDirt =
          new URLSearchParams(location.search).get('nodirt') === '1');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const live = liveRef.current;
      // BUILD 390: a new attack sequence starts the barbarian swing timer.
      const seq = live.barbAttackSequence ?? 0;
      if (seq !== lastAttackSeq) { lastAttackSeq = seq; attackStartMs = nowMs; }
      const swingT = nowMs - attackStartMs;
      const playerAttackT = swingT < BARBARIAN_ATTACK_MS ? swingT : -1;
      // player facing from movement delta
      const mdx = live.px - prevP.x, mdy = live.py - prevP.y;
      // BUILD 422: debug direction test overrides facing and forces the walk
      // cycle so each numbered arrow shows its direction's sprite sheet.
      const dbgFace = live.debugFacing ?? null;
      let playerMoving = Math.abs(mdx) + Math.abs(mdy) > 0.01;
      if (dbgFace) { playerFace.f = dbgFace; playerMoving = true; }
      else if (playerMoving) playerFace.f = isoPlayerFaceForScreenDeltaSticky(mdx, mdy, playerFace.f);
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
      // BUILD 620: green base when in chunk-LOD mode (max zoom-out), so the
      // screen isn't black beyond the 3x3 chunk diamonds.
      const useChunkLOD = zm < 0.35;
      g.fillStyle = useChunkLOD ? '#3a6a3a' : '#0e1713';
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
      // BUILD 389: user-supplied landscape tileset replaces the procedural
      // diamond fill (falls back to it while tiles load).
      // BUILD 608: LOD — when max zoomed out, draw per-chunk instead of per-tile.
      const showDetail = zm > 0.45;
      const tilesOn = isoTilesReady();
      if (useChunkLOD) {
        // BUILD 682: Chunk LOD with grass texture. Instead of one flat diamond
        // per chunk (which looked like solid green paint), subdivide each chunk
        // into an 8x8 coarse grid with subtle deterministic color variation.
        // 576 diamonds for 9 chunks — still cheap, but looks like grass.
        const SUB = 8;
        const subN = N / SUB;
        // BUILD 695: sandy base color inside the Mosslight town mask.
        const desertCol = fieldPalettes.desert.field;
        const sdr = parseInt(desertCol.slice(1, 3), 16);
        const sdg = parseInt(desertCol.slice(3, 5), 16);
        const sdb = parseInt(desertCol.slice(5, 7), 16);
        for (const sc of scenes) {
          const cx0 = (chunk.x + sc.ox) * N, cy0 = (chunk.y + sc.oy) * N;
          const baseCol = sc.palette.field;
          // Parse base color to RGB for variation.
          const br = parseInt(baseCol.slice(1, 3), 16);
          const bg = parseInt(baseCol.slice(3, 5), 16);
          const bb = parseInt(baseCol.slice(5, 7), 16);
          for (let sy = 0; sy < SUB; sy++) {
            for (let sx = 0; sx < SUB; sx++) {
              const tx0 = cx0 + sx * subN, ty0 = cy0 + sy * subN;
              // BUILD 695: sandy ground inside the Mosslight town mask
              // (the mask is 0 outside town, so no chunk check needed).
              const isSand = mosslightSandAt(tx0 + subN / 2, ty0 + subN / 2) > 0.5;
              const cr = isSand ? sdr : br, cg = isSand ? sdg : bg, cb = isSand ? sdb : bb;
              const p00 = isoToScreen(tx0, ty0);
              const p10 = isoToScreen(tx0 + subN, ty0);
              const p11 = isoToScreen(tx0 + subN, ty0 + subN);
              const p01 = isoToScreen(tx0, ty0 + subN);
              // Deterministic hash for subtle brightness variation (±8%).
              const h = Math.abs(Math.sin((tx0 * 12.9898 + ty0 * 78.233) * 43758.5453) % 1);
              const v = 0.92 + h * 0.16;
              const r = Math.min(255, Math.round(cr * v));
              const gg = Math.min(255, Math.round(cg * v));
              const b2 = Math.min(255, Math.round(cb * v));
              g.fillStyle = `rgb(${r},${gg},${b2})`;
              g.beginPath();
              g.moveTo(p00.x, p00.y); g.lineTo(p10.x, p10.y);
              g.lineTo(p11.x, p11.y); g.lineTo(p01.x, p01.y);
              g.closePath(); g.fill();
            }
          }
        }
      } else {
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
          // BUILD 369 (Phase 2b): authoritative rivers/lakes; road crossings draw as bridges.
          let wet = false;
          if (!isOcean) {
            // BUILD 610: Never render water in starting town area (chunks 3-5, 6-8).
            // Town should be dry land; lakes were flooding the town.
            const inTownArea = (chunk.x + sc.ox) >= 3 && (chunk.x + sc.ox) <= 5 &&
                               (chunk.y + sc.oy) >= 6 && (chunk.y + sc.oy) <= 8;
            if (!inTownArea) {
              const wq = waterGridAt(sc.water, (chunk.x + sc.ox) * FIELD_SIZE + lx + 0.5, (chunk.y + sc.oy) * FIELD_SIZE + ly + 0.5);
              // BUILD 583: require deeper water before overriding land tiles.
              // Shallow depth (0.25-0.5) was causing false water rendering on meadows.
              wet = wq.depth > 0.5;
            }
          }
          let tileDrawn = false;
          // BUILD 695: storybook sandy ground inside Mosslight — radial mask
          // in world coords. Roads/plaza/water keep their own tiles (branch
          // order below); everything else inside the mask gets sand.
          const absCxS = chunk.x + sc.ox, absCyS = chunk.y + sc.oy;
          const sandy = absCxS >= 3 && absCxS <= 5 && absCyS >= 6 && absCyS <= 8 &&
            mosslightSandAt(lx + absCxS * 280, ly + absCyS * 280) > 0.5;
          if (tilesOn) {
            let tn: number;
            // BUILD 604: Cobblestone plaza in starting town (124-164, 124-164).
            const absCx = chunk.x + sc.ox, absCy = chunk.y + sc.oy;
            const wx = lx + absCx * 280, wy = ly + absCy * 280; // world coords
            const inPlaza = absCx === 0 && absCy === 0 && wx >= 124 && wx < 164 && wy >= 124 && wy < 164;
            if (isOcean || wet) tn = groundTileFor('ocean', lx, ly, sc.ox, sc.oy);
            else if (inPlaza) tn = groundTileFor('cobble', lx, ly, sc.ox, sc.oy);
            else if (roadHere) tn = groundTileFor('road', lx, ly, sc.ox, sc.oy);
            else if (sandy) tn = groundTileFor('desert', lx, ly, sc.ox, sc.oy);
            else tn = groundTileFor(terr, lx, ly, sc.ox, sc.oy);
            tileDrawn = drawGroundTile(g, tn, p.x, p.y);
          }
          if (!tileDrawn) {
            let col = sc.palette.field;
            if (roadHere) col = sc.palette.path;
            // BUILD 695: sandy fallback color inside the Mosslight mask.
            else if (sandy && !wet) col = fieldPalettes.desert.field;
            // BUILD 604: plaza fallback color (cobblestone gray)
            const absCx2 = chunk.x + sc.ox, absCy2 = chunk.y + sc.oy;
            const wx2 = lx + absCx2 * 280, wy2 = ly + absCy2 * 280;
            if (absCx2 === 0 && absCy2 === 0 && wx2 >= 124 && wx2 < 164 && wy2 >= 124 && wy2 < 164) {
              col = '#9a9a9a';
            }
            if (wet) {
              if (roadHere) col = '#8a6a44'; // bridge planks
              else {
                const wq = waterGridAt(sc.water, (chunk.x + sc.ox) * FIELD_SIZE + lx + 0.5, (chunk.y + sc.oy) * FIELD_SIZE + ly + 0.5);
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
            g.fillStyle = col;
            g.fill();
          }
          // BUILD 366: deterministic per-tile detail (chunk-gen video techniques).
          // (chunk offset mixed into the hash so neighbor chunks don't repeat
          // the home chunk's pattern; home chunk hash is unchanged.)
          // BUILD 389: tileset decor sprites replace the rect-based bits.
          if (showDetail && !isOcean && !roadHere && !wet) {
            if ((lx + ly) % 2 === 1) {
              g.fillStyle = 'rgba(0,0,0,0.05)';
              g.fill();
            }
            // BUILD 695: clean sandy streets — no decor sprites on town sand
            // (desert rocks would litter the market square).
            const dn = sandy ? -1 : decorTileFor(terr, lx, ly, sc.ox, sc.oy);
            if (dn >= 0) drawDecor(g, dn, p.x, p.y);
          }
        }
      }
      } // end useChunkLOD else

      // BUILD 683: Settlement decor (plazas, lanes) — ground decals drawn
      // after terrain, before depth-sorted drawables. Only chunk (4,7) has any.
      for (const sc of scenes) {
        const decor = settlementDecorFor({ x: chunk.x + sc.ox, y: chunk.y + sc.oy });
        if (!decor.plazas.length && !decor.lanes.length) continue;
        const bx = sc.ox * N, by = sc.oy * N;
        for (const p of decor.plazas) {
          const c = isoToScreen(p.x + bx, p.y + by);
          // BUILD 695: sandy plaza decal (was village green) — matches the
          // storybook sandy streets.
          g.fillStyle = 'rgba(216, 186, 132, 0.35)'; // sandy plaza
          g.beginPath();
          g.ellipse(c.x, c.y, p.r * 32, p.r * 16, 0, 0, 7);
          g.fill();
        }
        // BUILD 692: textured dirt paths — layered strokes from cached Path2D
        // (soft dark fringe, dirt body, worn center, pebble speckles).
        // BUILD 693: strokes, not filled polygons — v1's filled ribbons
        // rasterized into screen-spanning streaks on sharp road joints, and
        // filling one Path2D holding thousands of ellipse subpaths corrupts
        // Chromium's rasterizer (reproduced in isolation). Stroked polylines
        // with round joins are spike-proof; speckles are fillRect dots.
        // Geometry is precomputed per decor chunk; lanes are static.
        {
          const dcx = chunk.x + sc.ox, dcy = chunk.y + sc.oy;
          const dkey = `${dcx},${dcy}`;
          let paths = dirtPathCache.get(dkey);
          if (!paths) {
            const geo = computeDirtPathGeometry(
              decor.lanes,
              (x, y) => isoToScreen(x + bx, y + by),
              `dirt:${dkey}`,
            );
            paths = buildDirtPath2D(geo);
            dirtPathCache.set(dkey, paths);
          }
          if (!skipDirt) {
          g.lineCap = 'round';
          g.lineJoin = 'round';
          // Viewport culling (BUILD 693 perf): only stroke/fill what's visible.
          const vx0 = cam.x - wpx / (2 * zm) - 120, vx1 = cam.x + wpx / (2 * zm) + 120;
          const vy0 = cam.y - hpx / (2 * zm) - 120, vy1 = cam.y + hpx / (2 * zm) + 120;
          for (const lane of paths.lanes) {
            const bb = lane.bbox;
            if (bb[1] < vx0 || bb[0] > vx1 || bb[3] < vy0 || bb[2] > vy1) continue;
            for (let li = 0; li < 3; li++) {
              g.lineWidth = lane.widths[li];
              g.strokeStyle = DIRT_LAYER_STYLE[li];
              g.stroke(lane.path);
            }
          }
          // Speckles as fillRect dots, NOT a Path2D: filling one Path2D that
          // holds thousands of ellipse subpaths corrupts Chromium's
          // rasterizer (reproduced in isolation — full-canvas triangle
          // explosion). Individual fillRects are cheap and always safe.
          for (const s of paths.speckles) {
            if (s.x < vx0 || s.x > vx1 || s.y < vy0 || s.y > vy1) continue;
            g.fillStyle = s.dark ? 'rgba(92, 66, 40, 0.55)' : 'rgba(205, 175, 120, 0.50)';
            g.fillRect(s.x - s.rx, s.y - s.rx * 0.55, s.rx * 2, s.rx * 1.1);
          }
          }
        }
        // BUILD 686: town walls — stone grey strokes with a lighter cap.
        for (const w of decor.walls || []) {
          if (w.points.length < 2) continue;
          g.lineWidth = Math.max(3, w.width * 16);
          g.strokeStyle = 'rgba(105, 105, 115, 0.9)';
          g.beginPath();
          w.points.forEach((pt, i) => {
            const s = isoToScreen(pt.x + bx, pt.y + by);
            if (i === 0) g.moveTo(s.x, s.y); else g.lineTo(s.x, s.y);
          });
          g.stroke();
          g.lineWidth = Math.max(1.5, w.width * 8);
          g.strokeStyle = 'rgba(150, 150, 160, 0.9)';
          g.stroke();
        }
      }

      const drawables: Drawable[] = [];

      // buildings: real rects -> iso boxes with pitched roofs. BUILD 376:
      // drawn for every chunk in the scene grid; neighbor rects are offset
      // into current-chunk-relative tile space so they tile seamlessly.
      // BUILD 601: Building sprites — Exiled Kingdoms style.
      // Cache building images on window.
      // BUILD 684: paths from the single asset catalog (no duplicated map).
      const bldImgs = (window as unknown as { __bldImgs?: Record<string, HTMLImageElement> }).__bldImgs || {};
      const bldSrc: Record<string, string> = {};
      for (const [variant, meta] of Object.entries(BUILDING_ASSET_META)) bldSrc[variant] = meta.file;
      for (const [kind, src] of Object.entries(bldSrc)) {
        if (!bldImgs[kind]) {
          const img = new Image();
          img.src = artUrl(src);
          bldImgs[kind] = img;
        }
      }
      (window as unknown as { __bldImgs?: Record<string, HTMLImageElement> }).__bldImgs = bldImgs;
      // BUILD 692: district-appropriate new art variants for filler lots.
      // Matches the rect against the engine's filler lots, then picks from
      // the district pool via the pure fillerVariantForLot (stable, no flicker).
      const fillerVariantForRect = (rect: { left: number; top: number; right: number; bottom: number }): string | null => {
        for (const f of mosslightFillerLots()) {
          if (Math.abs(f.rect.left - rect.left) < 0.01 && Math.abs(f.rect.top - rect.top) < 0.01 &&
              Math.abs(f.rect.right - rect.right) < 0.01 && Math.abs(f.rect.bottom - rect.bottom) < 0.01) {
            return fillerVariantForLot(f.rect, f.district);
          }
        }
        return null;
      };
      // BUILD 603: Stable sprite assignment using absolute chunk + local coords.
      // Previous BUILD 602 used r.left/r.top which include scene offset that
      // changes as player moves between chunks → flicker.
      const bldKindForBuilding = (b: { rect: { left: number; top: number; right: number; bottom: number } }, scOx: number, scOy: number): string => {
        const absCx = chunk.x + scOx, absCy = chunk.y + scOy;
        const lx = b.rect.left, ly = b.rect.top;
        // Special buildings: starting chunk (0,0) by local positions
        if (absCx === 0 && absCy === 0) {
          if (Math.abs(lx - 85.9) < 1 && Math.abs(ly - 108.8) < 1) return 'tavern';
          if (Math.abs(lx - 192.1) < 1 && Math.abs(ly - 111.0) < 1) return 'blue-house';
          if (Math.abs(lx - 84.1) < 1 && Math.abs(ly - 172.6) < 1) return 'red-shop';
          if (Math.abs(lx - 179.7) < 1 && Math.abs(ly - 173.4) < 1) return 'blue-cottage';
        }
        // BUILD 683: Mosslight cottages (chunk 4,7) use the settlement
        // layout's roof variants, not the position hash.
        // BUILD 692: the engine's roadside filler lots use district-appropriate
        // new art variants (commercial -> shops, residential -> cottages),
        // picked by stable hash so the assignment never flickers.
        if (absCx === 4 && absCy === 7 && b.rect) {
          const v = cottageVariantForRect(b.rect);
          if (v) return v;
          const fv = fillerVariantForRect(b.rect);
          if (fv) return fv;
        }
        // Stable hash: absolute chunk + local coords (both stable)
        // BUILD 614: expanded to 10 varieties for town diversity.
        const h = Math.abs(Math.sin((absCx * 1000 + lx) * 12.9898 + (absCy * 1000 + ly) * 78.233) * 43758.5453) % 1;
        const kinds = ['blue-cottage', 'red-cottage', 'blue-house', 'red-shop', 'hut-thatched', 'shop-awning', 'house-timber', 'inn-large', 'tavern', 'gatehouse'];
        return kinds[Math.floor(h * kinds.length)];
      };
      for (const sc of scenes) {
        const bx = sc.ox * N, by = sc.oy * N;
        for (const b of sc.buildings) {
          const r = { left: b.rect.left + bx, top: b.rect.top + by, right: b.rect.right + bx, bottom: b.rect.bottom + by };
          const bpos = { x: b.position.x + bx, y: b.position.y + by };
        const p00 = isoToScreen(r.left, r.top), p10 = isoToScreen(r.right, r.top);
        const p11 = isoToScreen(r.right, r.bottom), p01 = isoToScreen(r.left, r.bottom);
        // BUILD 597: Viewport culling — skip buildings entirely outside view.
        // Visible world rect centered on cam.
        const vhw = (wpx / 2) / zm, vhh = (hpx / 2) / zm;
        const minX = Math.min(p00.x, p10.x, p11.x, p01.x), maxX = Math.max(p00.x, p10.x, p11.x, p01.x);
        const minY = Math.min(p00.y, p10.y, p11.y, p01.y) - 64, maxY = Math.max(p00.y, p10.y, p11.y, p01.y);
        if (maxX < cam.x - vhw || minX > cam.x + vhw || maxY < cam.y - vhh || minY > cam.y + vhh) continue;
        const wallH = 64;
        const top = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - wallH });
        const t00 = top(p00), t10 = top(p10), t11 = top(p11), t01 = top(p01);
        // BUILD 530: Fix depth sorting — when the player is south of (in front of)
        // the building, the building must draw BEHIND the player, not over them.
        // The old single depth (right+bottom) was larger than the player's x+y
        // when standing at the door, so the wall covered the sprite.
        // Use a small tolerance so players standing in the doorway (at the
        // south edge) also get the building drawn behind them.
        const playerSouthOfBuilding = live.py > r.bottom - 1;
        const buildingDepth = playerSouthOfBuilding ? (r.left + r.top - 10) : (r.right + r.bottom);
        drawables.push({
          depth: buildingDepth, draw: (g2) => {
            // BUILD 603: stable sprite by absolute chunk + local coords.
            const kind = bldKindForBuilding(b, sc.ox, sc.oy);
            const sprite = bldImgs[kind];
            if (sprite && sprite.complete && sprite.naturalWidth > 0) {
              // Draw sprite anchored at building base center
              const cx = (p00.x + p11.x) / 2;
              const baseY = Math.max(p00.y, p10.y, p11.y, p01.y);
              // BUILD 602: Scale to fit building footprint (was 1.2x, caused overlap)
              const targetW = Math.hypot(p10.x - p00.x, p10.y - p00.y) * 0.95;
              const scale = targetW / sprite.naturalWidth;
              const sw = sprite.naturalWidth * scale;
              const sh = sprite.naturalHeight * scale;
              g2.drawImage(sprite, cx - sw / 2, baseY - sh, sw, sh);
              return;
            }
            // shadow (fallback procedural)
            g2.fillStyle = 'rgba(0,0,0,0.18)';
            g2.beginPath();
            g2.moveTo(p00.x, p00.y); g2.lineTo(p10.x, p10.y);
            g2.lineTo(p11.x, p11.y); g2.lineTo(p01.x, p01.y);
            g2.closePath(); g2.fill();
            // walls: Tudor half-timbered style — cream plaster with dark timber frame
            // South-east face (lighter plaster)
            g2.fillStyle = '#e8dcc0';
            g2.beginPath();
            g2.moveTo(p10.x, p10.y); g2.lineTo(p11.x, p11.y);
            g2.lineTo(t11.x, t11.y); g2.lineTo(t10.x, t10.y);
            g2.closePath(); g2.fill();
            // South-west face (slightly darker plaster for depth)
            g2.fillStyle = '#d8c8a8';
            g2.beginPath();
            g2.moveTo(p11.x, p11.y); g2.lineTo(p01.x, p01.y);
            g2.lineTo(t01.x, t01.y); g2.lineTo(t11.x, t11.y);
            g2.closePath(); g2.fill();
            // Timber framing: dark wooden beams on both faces
            g2.strokeStyle = '#4a3520';
            g2.lineWidth = 3;
            // Vertical beams on SE face
            for (let i = 1; i < 4; i++) {
              const t = i / 4;
              const bx0 = p10.x + (p11.x - p10.x) * t, by0 = p10.y + (p11.y - p10.y) * t;
              const bx1 = t10.x + (t11.x - t10.x) * t, by1 = t10.y + (t11.y - t10.y) * t;
              g2.beginPath(); g2.moveTo(bx0, by0); g2.lineTo(bx1, by1); g2.stroke();
            }
            // Vertical beams on SW face
            for (let i = 1; i < 4; i++) {
              const t = i / 4;
              const bx0 = p11.x + (p01.x - p11.x) * t, by0 = p11.y + (p01.y - p11.y) * t;
              const bx1 = t11.x + (t01.x - t11.x) * t, by1 = t11.y + (t01.y - t11.y) * t;
              g2.beginPath(); g2.moveTo(bx0, by0); g2.lineTo(bx1, by1); g2.stroke();
            }
            // Horizontal beam at top of walls
            g2.lineWidth = 4;
            g2.beginPath(); g2.moveTo(t10.x, t10.y); g2.lineTo(t11.x, t11.y); g2.lineTo(t01.x, t01.y); g2.stroke();
            // pitched roof: blue slate (Exiled Kingdoms style)
            const ridge = 34;
            const r0 = { x: (t00.x + t10.x) / 2, y: (t00.y + t10.y) / 2 - ridge };
            const r1 = { x: (t01.x + t11.x) / 2, y: (t01.y + t11.y) / 2 - ridge };
            // back slopes first (darker slate blue)
            g2.fillStyle = '#2e3d4d';
            g2.beginPath();
            g2.moveTo(t00.x, t00.y); g2.lineTo(t10.x, t10.y);
            g2.lineTo(r0.x, r0.y); g2.closePath(); g2.fill();
            g2.fillStyle = '#25303d';
            g2.beginPath();
            g2.moveTo(t01.x, t01.y); g2.lineTo(t00.x, t00.y);
            g2.lineTo(r0.x, r0.y); g2.lineTo(r1.x, r1.y);
            g2.closePath(); g2.fill();
            // front slopes (slate blue)
            g2.fillStyle = '#3a4a5c';
            g2.beginPath();
            g2.moveTo(t10.x, t10.y); g2.lineTo(t11.x, t11.y);
            g2.lineTo(r1.x, r1.y); g2.lineTo(r0.x, r0.y);
            g2.closePath(); g2.fill();
            g2.fillStyle = '#44566a';
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

      // BUILD 600: Town walls — stone perimeter with gates (Exiled Kingdoms style).
      // Only in starting area. Wall segments with gaps for N/S/E/W gates.
      if (isStartingArea(chunk)) {
        const wallH = 28;
        const wallColor = '#8a7a6a', wallDark = '#6e5f52';
        // Wall bounds (field units)
        const wx0 = 20, wx1 = 256, wy0 = 36, wy1 = 237;
        const gateHalf = 8; // gate opening half-width
        const cx = 144; // town center x
        const cy = 144; // town center y
        // Helper to draw a wall segment
        const drawWall = (x0: number, y0: number, x1: number, y1: number) => {
          const a = isoToScreen(x0, y0), b = isoToScreen(x1, y1);
          // Simple wall: draw as a thick line with stone texture
          drawables.push({
            depth: (x0 + x1) / 2 + (y0 + y1) / 2,
            draw: (g2) => {
              g2.strokeStyle = wallColor;
              g2.lineWidth = 10;
              g2.beginPath(); g2.moveTo(a.x, a.y - wallH); g2.lineTo(b.x, b.y - wallH); g2.stroke();
              g2.strokeStyle = wallDark;
              g2.lineWidth = 10;
              g2.beginPath(); g2.moveTo(a.x, a.y - wallH + 5); g2.lineTo(b.x, b.y - wallH + 5); g2.stroke();
              // Crenellations (battlements)
              g2.fillStyle = wallColor;
              const len = Math.hypot(b.x - a.x, b.y - a.y);
              const steps = Math.floor(len / 16);
              for (let i = 0; i <= steps; i++) {
                const t = i / Math.max(1, steps);
                const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t - wallH - 6;
                g2.fillRect(px - 4, py, 8, 8);
              }
            },
          });
        };
        // North wall (two segments with gate gap)
        drawWall(wx0, wy0, cx - gateHalf, wy0);
        drawWall(cx + gateHalf, wy0, wx1, wy0);
        // South wall
        drawWall(wx0, wy1, cx - gateHalf, wy1);
        drawWall(cx + gateHalf, wy1, wx1, wy1);
        // West wall
        drawWall(wx0, wy0, wx0, cy - gateHalf);
        drawWall(wx0, cy + gateHalf, wx0, wy1);
        // East wall
        drawWall(wx1, wy0, wx1, cy - gateHalf);
        drawWall(wx1, cy + gateHalf, wx1, wy1);
      }

      // trees: real positions — BUILD 376: every chunk in the scene grid,
      // offset into current-chunk-relative tile space.
      // BUILD 683: settlement props (wells, barrels) — billboard sprites,
      // depth-sorted like trees. Only chunk (4,7) has any.
      const propImgs = (window as unknown as { __propImgs?: Record<string, HTMLImageElement> }).__propImgs || {};
      const propSrc: Record<string, string> = {
        'props/well.png': 'props/well.png',
        'props/barrel.png': 'props/barrel.png',
        // BUILD 686: town plan assets (lamps, garden well, gatehouse).
        'props/lamp.png': 'props/lamp.png',
        'buildings/gatehouse.png': 'buildings/gatehouse.png',
        // BUILD 690: engine market assets (fountain + stalls from the
        // procedural layout; the 613 hardcoded block is retired).
        'props/fountain.png': 'props/fountain.png',
        'props/stall-red.png': 'props/stall-red.png',
        'props/stall-blue.png': 'props/stall-blue.png',
        'props/stall-green.png': 'props/stall-green.png',
        'props/market-stall.png': 'props/market-stall.png',
        // BUILD 694: storybook props (angel statue, hedge maze wall, cart).
        'props/statue-angel.png': 'props/statue-angel.png',
        'props/hedge-straight.png': 'props/hedge-straight.png',
        'props/cart-wood.png': 'props/cart-wood.png',
      };
      for (const [key, src] of Object.entries(propSrc)) {
        if (!propImgs[key]) {
          const img = new Image();
          img.src = artUrl(src);
          propImgs[key] = img;
        }
      }
      (window as unknown as { __propImgs?: Record<string, HTMLImageElement> }).__propImgs = propImgs;
      for (const sc of scenes) {
        const decor = settlementDecorFor({ x: chunk.x + sc.ox, y: chunk.y + sc.oy });
        if (!decor.props.length) continue;
        const bx = sc.ox * N, by = sc.oy * N;
        const pvhw = (wpx / 2) / zm, pvhh = (hpx / 2) / zm;
        for (const pr of decor.props) {
          const px = pr.x + bx, py = pr.y + by;
          const c = isoToScreen(px, py);
          if (c.x < cam.x - pvhw - 100 || c.x > cam.x + pvhw + 100 || c.y < cam.y - pvhh - 150 || c.y > cam.y + pvhh + 50) continue;
          const img = propImgs[pr.asset];
          drawables.push({
            depth: px + py,
            draw: (g2) => {
              if (img && img.complete && img.naturalWidth > 0) {
                const sw = pr.r * 2 * 32;
                // BUILD 686: natural aspect (well/barrel/lamp are 2:1 natively;
                // fountain is 1:1, stalls/gatehouse 1.5:1 — no squish).
                const sh = sw / (img.naturalWidth / img.naturalHeight);
                g2.drawImage(img, c.x - sw / 2, c.y - sh, sw, sh);
              } else {
                g2.fillStyle = '#8a8a8a';
                g2.beginPath();
                g2.ellipse(c.x, c.y - 4, pr.r * 32, pr.r * 16, 0, 0, 7);
                g2.fill();
              }
            },
          });
        }
      }
      // BUILD 608: skip trees when max zoomed out (sub-pixel, saves draw calls).
      const skipTrees = zm < 0.35;
      for (const sc of scenes) {
        const bx = sc.ox * N, by = sc.oy * N;
        if (skipTrees) continue;
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

      // BUILD 612: ore nodes for mining — rock piles with ore-colored veins.
      for (const sc of scenes) {
        const bx = sc.ox * N, by = sc.oy * N;
        if (skipTrees) continue; // also skip ores when max zoomed out
        for (const o of sc.ores) {
          const ox2 = o.fx + bx, oy2 = o.fy + by;
          // Skip depleted nodes (checked via window.__depletedOres)
          const depKey = o.id;
          const depleted = (window as unknown as { __depletedOres?: Set<string> }).__depletedOres;
          if (depleted && depleted.has(depKey)) continue;
          const c = isoToScreen(ox2, oy2);
          const oreCol = ORE_COLORS[o.kind] || '#8a8a8a';
          drawables.push({
            depth: ox2 + oy2, draw: (g2) => {
              // Rock base (gray)
              g2.fillStyle = 'rgba(0,0,0,0.15)';
              g2.beginPath(); g2.ellipse(c.x, c.y + 2, 12, 5, 0, 0, 7); g2.fill();
              g2.fillStyle = '#6a6a6a';
              g2.beginPath();
              g2.moveTo(c.x - 10, c.y); g2.lineTo(c.x - 4, c.y - 14);
              g2.lineTo(c.x + 6, c.y - 12); g2.lineTo(c.x + 10, c.y);
              g2.closePath(); g2.fill();
              // Ore veins (colored)
              g2.fillStyle = oreCol;
              g2.fillRect(c.x - 6, c.y - 10, 4, 4);
              g2.fillRect(c.x + 1, c.y - 7, 3, 3);
              g2.fillRect(c.x - 2, c.y - 12, 3, 3);
            },
          });
        }

        // BUILD 684: loot drops — visible in iso (were 2D-DOM only, invisible
        // in the default view). Pulsing gold diamond, depth-sorted. Drops are
        // pre-filtered to the home chunk by the caller.
        if (sc.ox === 0 && sc.oy === 0) {
          const drops = liveRef.current.droppedLoot || [];
          for (const d of drops) {
            const dx2 = d.position.x + bx, dy2 = d.position.y + by;
            const dc = isoToScreen(dx2, dy2);
            drawables.push({
              depth: dx2 + dy2 + 0.001, draw: (g2, now) => {
                const pulse = 1 + Math.sin(now / 300 + d.id) * 0.12;
                const s = 9 * pulse;
                g2.fillStyle = 'rgba(255, 215, 100, 0.35)';
                g2.beginPath(); g2.arc(dc.x, dc.y - 6, s * 1.6, 0, 7); g2.fill();
                g2.fillStyle = '#ffd764';
                g2.beginPath();
                g2.moveTo(dc.x, dc.y - 6 - s); g2.lineTo(dc.x + s * 0.7, dc.y - 6);
                g2.lineTo(dc.x, dc.y - 6 + s); g2.lineTo(dc.x - s * 0.7, dc.y - 6);
                g2.closePath(); g2.fill();
                g2.strokeStyle = '#8a6a20'; g2.lineWidth = 1.5; g2.stroke();
              },
            });
          }
        }
      }

      // BUILD 389: ambient critters (badger/stag/boar) — deterministic home-
      // chunk residents, visual only. Homes are filtered to dry land.
      if (crittersReady()) {
        const isLand = (lx: number, ly: number): boolean => {
          if (homeScene.tile.terrain === 'ocean') return false;
          if (isRoadTileFor(homeScene, lx, ly)) return false;
          const wq = waterGridAt(homeScene.water, chunk.x * FIELD_SIZE + lx + 0.5, chunk.y * FIELD_SIZE + ly + 0.5);
          return wq.depth <= 0.25;
        };
        for (const c of crittersForChunk(chunk.x, chunk.y, N, isLand)) {
          const pose = critterPose(c, nowMs);
          drawables.push({
            depth: pose.x + pose.y + 0.005,
            draw: (g2) => { drawCritter(g2, c, nowMs, isoToScreen); },
          });
        }
      }

      // townsfolk: the live NPC simulation, right where the 2D game has them.
      // look = npc.id -> deterministic per-NPC variant (same villager, same
      // face, every session).
      seenAnims.clear();
      // BUILD 597: Viewport culling for NPCs — only draw when in sight.
      const npcVhw = (wpx / 2) / zm, npcVhh = (hpx / 2) / zm;
      for (const npc of live.folk) {
        const nc = isoToScreen(npc.position.x, npc.position.y);
        if (nc.x < cam.x - npcVhw - 50 || nc.x > cam.x + npcVhw + 50 || nc.y < cam.y - npcVhh - 100 || nc.y > cam.y + npcVhh + 50) continue;
        drawPerson(drawables, npc.position.x, npc.position.y, npc.facing as Face4, npc.moving, npc.id, nowMs, npc.id);
      }
      // BUILD 451: goats in the iso view — simple canvas goat (body, head,
      // BUILD 457: deer (stag sprite) replaces the canvas goat. Uses the
      // provided critter sprites from public/critters/stag/.
      const liveGoats = (live as { goats?: Array<{ id: number; kind: string; position: Point; facing: string; disposition: string }> }).goats;
      // BUILD 458: critter sprites per kind. Cache images.
      const critterImgs = (window as unknown as { __critterImgs?: Record<string, HTMLImageElement> }).__critterImgs || {};
      const critterSrc: Record<string, string> = {
        deer: 'critters/stag/critter_stag_SE_idle.png',
        boar: 'critters/boar/boar_SE_idle_strip.png',
        badger: 'critters/badger/critter_badger_SE_idle.png',
        direwolf: 'critters/wolf/wolf-idle.png',
        // BUILD 575: goat uses deer sprite as placeholder (similar quadruped)
        goat: 'critters/stag/critter_stag_SE_idle.png',
      };
      for (const [kind, src] of Object.entries(critterSrc)) {
        if (!critterImgs[kind]) {
          const img = new Image();
          img.src = artUrl(src);
          critterImgs[kind] = img;
        }
      }
      (window as unknown as { __critterImgs?: Record<string, HTMLImageElement> }).__critterImgs = critterImgs;
      if (liveGoats) {
        for (const goat of liveGoats) {
          const kind = goat.kind || 'deer';
          const img = critterImgs[kind];
          if (!img || !img.complete || img.naturalWidth === 0) continue;
          const gx = goat.position.x, gy = goat.position.y;
          const c = isoToScreen(gx, gy);
          // BUILD 597: Viewport culling for animals.
          const vhw = (wpx / 2) / zm, vhh = (hpx / 2) / zm;
          if (c.x < cam.x - vhw - 50 || c.x > cam.x + vhw + 50 || c.y < cam.y - vhh - 50 || c.y > cam.y + vhh + 50) continue;
          const sx = c.x, sy = c.y;
          const s = 36 * zoomRef.current;
          const depth = gx + gy;
          // Sprite dimensions per kind (strips animate, wolf is a single image)
          let frameW = 32, frameH = 41, isStrip = true;
          if (kind === 'direwolf') { frameW = 32; frameH = 32; isStrip = false; }
          else if (kind === 'boar') { frameW = 41; frameH = 25; }
          else if (kind === 'badger') { frameW = 33; frameH = 32; }
          const frameCount = isStrip ? Math.max(1, Math.floor(img.naturalWidth / frameW)) : 1;
          const frameIdx = isStrip ? Math.floor(nowMs / 150) % frameCount : 0;
          drawables.push({
            depth,
            draw: (g: CanvasRenderingContext2D) => {
              // shadow
              g.fillStyle = 'rgba(0,0,0,0.25)';
              g.beginPath(); g.ellipse(sx, sy, s * 0.6, s * 0.15, 0, 0, Math.PI * 2); g.fill();
              // critter sprite (feet-anchored)
              const dw = frameW * (s / 24), dh = frameH * (s / 24);
              if (isStrip) {
                g.drawImage(img, frameIdx * frameW, 0, frameW, frameH, sx - dw / 2, sy - dh, dw, dh);
              } else {
                g.drawImage(img, sx - dw / 2, sy - dh, dw, dh);
              }
              // BUILD 576: goats get distinctive curved horns (deer sprite is placeholder)
              if (kind === 'goat') {
                g.strokeStyle = '#d4c4a8';
                g.lineWidth = Math.max(1, s * 0.06);
                g.lineCap = 'round';
                const hx = sx, hy = sy - dh * 0.95;
                // Left horn (curved)
                g.beginPath();
                g.moveTo(hx - dw * 0.15, hy);
                g.quadraticCurveTo(hx - dw * 0.25, hy - dh * 0.15, hx - dw * 0.18, hy - dh * 0.25);
                g.stroke();
                // Right horn (curved)
                g.beginPath();
                g.moveTo(hx + dw * 0.15, hy);
                g.quadraticCurveTo(hx + dw * 0.25, hy - dh * 0.15, hx + dw * 0.18, hy - dh * 0.25);
                g.stroke();
                // White tint to distinguish from brown deer
                g.fillStyle = 'rgba(255,255,255,0.25)';
                g.fillRect(sx - dw / 2, sy - dh, dw, dh);
              }
              // aggro marker
              if (goat.disposition === 'aggressive') {
                g.fillStyle = '#ff4444'; g.font = `bold ${Math.max(10, s * 0.4)}px sans-serif`;
                g.textAlign = 'center'; g.fillText('!', sx, sy - dh - 4);
              }
            },
          });
        }
      }
      // BUILD 459: collision box debug — red rectangles show current boxes
      if (collisionDebug && liveGoats) {
        const boxSizes: Record<string, { hw: number; hh: number }> = {
          deer: { hw: 0.35, hh: 0.4 },
          boar: { hw: 0.4, hh: 0.45 },
          badger: { hw: 0.3, hh: 0.35 },
          direwolf: { hw: 0.45, hh: 0.5 },
        };
        for (const goat of liveGoats) {
          const kind = goat.kind || 'deer';
          const box = boxSizes[kind] || { hw: 0.5, hh: 0.6 };
          const gx = goat.position.x, gy = goat.position.y;
          const c = isoToScreen(gx, gy);
          const s = 36 * zoomRef.current;
          const w = box.hw * 2 * (s / 24);
          const h = box.hh * 2 * (s / 24);
          drawables.push({
            depth: gx + gy + 0.01,
            draw: (g: CanvasRenderingContext2D) => {
              g.strokeStyle = '#ff0000';
              g.lineWidth = 2;
              g.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
            },
          });
        }
      }
      // BUILD 460: green box for selected critter — draggable to propose new position/size
      if (collisionDebug && selectedCritterId !== null && liveGoats) {
        const goat = liveGoats.find(g => g.id === selectedCritterId);
        if (goat) {
          const gb = greenBoxRef.current;
          const gx = goat.position.x + gb.dx, gy = goat.position.y + gb.dy;
          const c = isoToScreen(gx, gy);
          const s = 36 * zoomRef.current;
          const w = gb.hw * 2 * (s / 24);
          const h = gb.hh * 2 * (s / 24);
          drawables.push({
            depth: gx + gy + 0.02,
            draw: (g: CanvasRenderingContext2D) => {
              g.strokeStyle = '#00ff00';
              g.lineWidth = 2;
              g.setLineDash([5, 5]);
              g.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
              g.setLineDash([]);
              // label with offset
              g.fillStyle = '#00ff00';
              g.font = '12px sans-serif';
              g.textAlign = 'center';
              g.fillText(`dx:${gb.dx.toFixed(1)} dy:${gb.dy.toFixed(1)}`, c.x, c.y - h / 2 - 8);
            },
          });
        }
      }
      // player — BUILD 427: depth-sorted with the world instead of layered
      // on top. When the player is behind a house (smaller x+y than the
      // house's front corner), the house draws over them; when in front,
      // the player draws over the house.
      drawPerson(drawables, live.px, live.py, playerFace.f, playerMoving, 0, nowMs, 'player', { attackT: playerAttackT });
      for (const k of charAnims.keys()) if (!seenAnims.has(k)) charAnims.delete(k);

      drawables.sort((a, b) => a.depth - b.depth);
      for (const d of drawables) d.draw(g, nowMs);

      // BUILD 684: floating combat text in iso (damage numbers were 2D-DOM
      // only). World-space, floats up and fades over ~0.9s (matches the
      // 2D lifetime). Drawn last so it sits above the world.
      {
        const texts = liveRef.current.damageTexts || [];
        const seen = dmgSeenRef.current;
        for (const t of texts) {
          if (!seen.has(t.id)) seen.set(t.id, nowMs);
        }
        for (const id of [...seen.keys()]) {
          if (!texts.some((t) => t.id === id)) seen.delete(id);
        }
        for (const t of texts) {
          const born = seen.get(t.id) ?? nowMs;
          const age = (nowMs - born) / 900; // 0..1
          if (age >= 1) continue;
          const w = isoToScreen(t.position.x, t.position.y);
          const rise = age * 34;
          const alpha = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
          const col = t.kind === 'critical' ? '#ffd23f' : t.kind === 'reward' ? '#7dff8a' : '#ff6b5e';
          g.save();
          g.globalAlpha = Math.max(0, alpha);
          g.font = `bold ${t.kind === 'critical' ? 22 : 17}px sans-serif`;
          g.textAlign = 'center';
          g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.75)';
          const ty = w.y - 46 - rise;
          g.strokeText(t.text, w.x, ty);
          g.fillStyle = col;
          g.fillText(t.text, w.x, ty);
          g.restore();
        }
      }

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
      // BUILD 460: collision debug — tap a critter to select it (green box).
      // Player does not move in debug mode.
      if (collisionDebug) {
        const zm = zoomRef.current;
        const wpx = rect.width || 1, hpx = rect.height || 1;
        let bestId: number | null = null; let bestD = 40;
        for (const goat of liveRef.current.goats || []) {
          const w = isoToScreen(goat.position.x, goat.position.y);
          const px = (w.x - cam.x) * zm + wpx / 2;
          const py = (w.y - cam.y) * zm + hpx / 2;
          const d = Math.hypot(px - sx, py - sy);
          if (d < bestD) { bestD = d; bestId = goat.id; }
        }
        if (bestId !== null) {
          setSelectedCritterId(bestId);
          // Reset green box to critter's current box
          const goat = (liveRef.current.goats || []).find(g => g.id === bestId);
          const kind = goat?.kind || 'deer';
          const sizes: Record<string, { hw: number; hh: number }> = {
            deer: { hw: 0.35, hh: 0.4 }, boar: { hw: 0.4, hh: 0.45 },
            badger: { hw: 0.3, hh: 0.35 }, direwolf: { hw: 0.45, hh: 0.5 },
          };
          const sz = sizes[kind] || { hw: 0.5, hh: 0.6 };
          greenBoxRef.current = { dx: 0, dy: 0, hw: sz.hw, hh: sz.hh };
        } else {
          setSelectedCritterId(null);
        }
        return; // don't move player in debug mode
      }
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
        // BUILD 684: loot drop hit test — tap a drop to pick it up when close
        // (same 16-unit rule as the 2D pickup button), else walk toward it.
        {
          const drops = liveRef.current.droppedLoot || [];
          const { onPickupDrop: pickUp } = tapRef.current;
          let bestDrop: { id: number; position: Point } | null = null; let bestDD = 48;
          for (const d of drops) {
            const w = isoToScreen(d.position.x, d.position.y);
            const px = (w.x - cam.x) * zm + wpx / 2;
            const py = (w.y - cam.y) * zm + hpx / 2;
            const dd = Math.hypot(px - sx, py - sy);
            if (dd < bestDD) { bestDD = dd; bestDrop = d; }
          }
          if (bestDrop && pickUp) {
            const pl = liveRef.current;
            const dist = Math.hypot(bestDrop.position.x - pl.px, bestDrop.position.y - pl.py);
            if (dist <= 16) { pickUp(bestDrop); return; }
            tapMove({ x: bestDrop.position.x, y: bestDrop.position.y }); return;
          }
        }
        // otherwise walk to the tapped tile (field units == tile space)
        const t = screenToTile(wx, wy);
        const tx = Math.min(N - 1, Math.max(0, t.tx));
        const ty = Math.min(N - 1, Math.max(0, t.ty));
        tapMove({ x: tx, y: ty });
      }
    };
    canvas.addEventListener('pointerdown', onTap);
    // BUILD 598: Hold-to-move — while finger is held down and moving on the
    // field, continuously update the move target. Quick taps (no drag) use
    // the existing tap logic above; drags steer the character.
    let holdActive = false;
    let holdLastX = 0, holdLastY = 0;
    const onHoldMove = (e: PointerEvent) => {
      if (!holdActive) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      // Only update if finger moved significantly (avoid jitter).
      if (Math.hypot(sx - holdLastX, sy - holdLastY) < 8) return;
      holdLastX = sx; holdLastY = sy;
      const { onTapMove: tapMove } = tapRef.current;
      if (!tapMove) return;
      const zm = zoomRef.current;
      const wpx = rect.width || 1, hpx = rect.height || 1;
      const wx = (sx - wpx / 2) / zm + cam.x;
      const wy = (sy - hpx / 2) / zm + cam.y;
      const t = screenToTile(wx, wy);
      const tx = Math.min(N - 1, Math.max(0, t.tx));
      const ty = Math.min(N - 1, Math.max(0, t.ty));
      tapMove({ x: tx, y: ty });
    };
    const onHoldStart = (e: PointerEvent) => {
      holdActive = true;
      const rect = canvas.getBoundingClientRect();
      holdLastX = e.clientX - rect.left; holdLastY = e.clientY - rect.top;
    };
    const onHoldEnd = () => { holdActive = false; };
    canvas.addEventListener('pointerdown', onHoldStart);
    canvas.addEventListener('pointermove', onHoldMove);
    canvas.addEventListener('pointerup', onHoldEnd);
    canvas.addEventListener('pointercancel', onHoldEnd);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); canvas.removeEventListener('pointerdown', onTap); canvas.removeEventListener('pointerdown', onHoldStart); canvas.removeEventListener('pointermove', onHoldMove); canvas.removeEventListener('pointerup', onHoldEnd); canvas.removeEventListener('pointercancel', onHoldEnd); };
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
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0e1713', touchAction: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
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
      {/* BUILD 460: collision debug controls — move/resize the green box */}
      {collisionDebug && selectedCritterId !== null && (
        <div style={{
          position: 'absolute', right: 12, top: 12, zIndex: 6,
          background: 'rgba(0,0,0,0.8)', borderRadius: 10, padding: 10,
          display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
        }}>
          <div style={{ color: '#00ff00', fontSize: 12, fontWeight: 700 }}>Green Box</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 36px)', gap: 4 }}>
            <div />
            <button style={btn} onClick={() => { greenBoxRef.current.dy -= 0.1; }}>↑</button>
            <div />
            <button style={btn} onClick={() => { greenBoxRef.current.dx -= 0.1; }}>←</button>
            <button style={btn} onClick={() => { greenBoxRef.current.dx = 0; greenBoxRef.current.dy = 0; }}>•</button>
            <button style={btn} onClick={() => { greenBoxRef.current.dx += 0.1; }}>→</button>
            <div />
            <button style={btn} onClick={() => { greenBoxRef.current.dy += 0.1; }}>↓</button>
            <div />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: 12 }} onClick={() => { greenBoxRef.current.hw = Math.max(0.1, greenBoxRef.current.hw - 0.05); }}>W-</button>
            <button style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: 12 }} onClick={() => { greenBoxRef.current.hw += 0.05; }}>W+</button>
            <button style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: 12 }} onClick={() => { greenBoxRef.current.hh = Math.max(0.1, greenBoxRef.current.hh - 0.05); }}>H-</button>
            <button style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: 12 }} onClick={() => { greenBoxRef.current.hh += 0.05; }}>H+</button>
          </div>
          <div style={{ color: '#888', fontSize: 10 }}>Values show on canvas</div>
        </div>
      )}
    </div>
  );
}
