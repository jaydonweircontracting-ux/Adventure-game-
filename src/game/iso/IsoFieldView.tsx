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
import { startBrowserGameLoop, type BrowserGameLoop } from '../engine/browserGameEngine';
import { drawProceduralGroundAccent, drawProceduralTree, drawProceduralTreeLod, drawProceduralPathDetail, drawBuildingGroundDress, drawProceduralBoulder } from '../engine/proceduralWorldArt';
import { isoToScreen as isoToScreenBase, screenToTile, TILE_W, TILE_H } from './projection';
import { rotateIsoScreen, unrotateIsoScreen, rotatedDepth, rotateFace8, rotatedGridBounds, rotatedVisibleTileRange, type IsoRotation } from './rotation';
import { RODWAN_SLICES, RODWAN_SHEET_PATH, rodwanTreeIndexFor, rodwanIsoHeightPx, drawRodwanTree } from '../rodwanTrees';
import { createBoundedCache } from '../rendering/boundedCache';
import { FrameMetrics } from '../rendering/frameMetrics';
import {
  isoPlayerFaceForScreenDeltaSticky, type Face4, type Face8,
} from './isoSprites';
import { CharacterAnimator, drawIsoCharacter, preloadCharacterSprites, variantLook, type LookRef } from './characterSystem';
import { SNEAK_PLAYER_OPACITY } from '../sneak';
import { lookWithoutLootedGear } from '../npcGear';
import { artUrl } from '../artCache';
import { computeDirtPathGeometry, buildDirtPath2D, DIRT_LAYER_STYLE } from './dirtPaths';
// BUILD 389: user-supplied landscape tileset + ambient critters.
import {
  preloadIsoTiles, isoTilesReady, drawDecor,
  decorTileFor, mosslightSandAt,
  farmlandPlotAt, farmlandDetailAt, FARM_BASE_COLORS, FARM_TRACK,
  FARM_OCHRE, FARM_GREEN, FARM_SOIL,
  FARM_DET_HEDGE, FARM_DET_FENCE, FARM_DET_HOUSE, FARM_DET_BARN,
  lodGroundClassAt, groundToneAt,
  type GroundTone,
} from './isoTiles';
import {
  preloadCritters, crittersReady, crittersForChunk, critterPose, drawCritter,
  type AmbientCritter,
} from './critters';
import {
  drawIsoHorse, drawIsoCart, horseCoat, horsePoseForFace, horseFace8ForDelta,
  horseFacingVector, HORSE_SEAT_LIFT, HORSE_CART_SEAT_LIFT, HORSE_CART_TRAIL,
} from './horseArt';
import {
  buildingDoorwaysFor, fieldTreesFor, fieldOresFor, mapTileFor, fieldPalettes, FIELD_SIZE,
  isStartingArea, isStartingSettlementSafetyZone, ORE_COLORS, settlementDecorFor, cottageVariantForRect,
  type Point, type Doorway, type FieldTree, type FieldOre, type MapTile,
} from '../../App';
import type { Townsperson } from '../townsfolk';
import { marketStallsFromDecor, npcMaxHp } from '../townsfolk';
// BUILD 886: disposition-colored overhead name labels (EO-style).
import { dispositionNameColor, defaultDisposition } from '../dialogue';
// BUILD 692: district-appropriate art variants for the engine's filler lots.
import { mosslightFillerLots, fillerVariantForLot, mosslightPinnedRects } from '../mosslightLayout';
// BUILD 684: single authoritative building asset catalog (was: hardcoded
// kind->path maps duplicated in this file). Anchor/scale conventions documented
// in src/game/buildingRig.ts.
import { BUILDING_ASSET_META, buildingSpriteHeightForWidth } from '../buildingRig';
// BUILD 801: one shared uploaded sprite for every rendered building.
import sharedHouseSpriteUrl from '../../../game sprites/starting house/IMG_5422.png';
// BUILD 823: Exact authored transparent overlay for the starter-house exterior.
import startingHouseOverlayUrl from '../../../game sprites/starting house/IMG_5424.png';
// BUILD 910 (Phase A2): the BUILD 769 in-world cutaway imports were removed
// with the cutaway itself; interiors in the field are the authored two-layer
// starter-house art for every building now.
import { spriteDefFor, animForMonsterState, monsterAnimFrameFor, type MonsterAnim, type MonsterSpriteDef } from '../monsterSprites';
// BUILD 369 (Phase 2b): authoritative water/bridges in the iso field.
import { waterGridForChunk, waterDepthAt, waterKindAt, waterGridAt, type WaterGrid } from '../landscape';
// BUILD 376: multi-chunk rendering so generated terrain fills the whole
// screen at every zoom level — no blue void where nothing was generated.
import {
  ISO_CHUNK_RENDER_RADIUS, isoTileChunkOffset, clampChunkOffset,
} from './isoChunks';

// BUILD 692: cached textured dirt-path layers per decor chunk. Lanes are
// static world geometry (seed-pinned town), so the Path2D layers are built
// once per chunk key and re-stroked every frame — zero per-frame allocation.
type DirtPathCacheEntry = ReturnType<typeof buildDirtPath2D>;
const dirtPathCache = createBoundedCache<string, DirtPathCacheEntry>(64);

// BUILD 715: cache deterministic settlement geometry and sprite variants.
// These were being rebuilt/reselected inside the 60 Hz draw loop.
// BUILD 791: Remove the JPEG's black matte from the starter-house interior.
const starterHouseCutoutCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function starterHouseCutout(image: HTMLImageElement): HTMLCanvasElement {
  const cached = starterHouseCutoutCache.get(image);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = frame;
  const total = width * height;
  const seen = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0, tail = 0;
  const isMatte = (i: number) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < 52;
  const seed = (x: number, y: number) => {
    const i = y * width + x;
    if (!seen[i] && isMatte(i)) { seen[i] = 1; queue[tail++] = i; }
  };
  for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
  for (let y = 0; y < height; y++) { seed(0, y); seed(width - 1, y); }
  while (head < tail) {
    const i = queue[head++], x = i % width, y = (i / width) | 0;
    if (x > 0) seed(x - 1, y);
    if (x + 1 < width) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y + 1 < height) seed(x, y + 1);
  }
  // Fully clear the edge-connected black matte, then soften its JPEG fringe.
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    if (seen[i]) { data[p + 3] = 0; continue; }
    const x = i % width, y = (i / width) | 0;
    let touchesMatte = false;
    if (x > 0 && seen[i - 1]) touchesMatte = true;
    else if (x + 1 < width && seen[i + 1]) touchesMatte = true;
    else if (y > 0 && seen[i - width]) touchesMatte = true;
    else if (y + 1 < height && seen[i + width]) touchesMatte = true;
    if (touchesMatte) {
      const brightness = Math.max(data[p], data[p + 1], data[p + 2]);
      if (brightness < 105) data[p + 3] = Math.min(data[p + 3], Math.max(0, Math.round((brightness - 28) * 255 / 77)));
    }
  }
  ctx.putImageData(frame, 0, 0);
  starterHouseCutoutCache.set(image, canvas);
  return canvas;
}
const settlementDecorCache = createBoundedCache<string, ReturnType<typeof settlementDecorFor>>(32);
const buildingKindCache = new WeakMap<object, string>();
const ambientCritterCache = createBoundedCache<string, AmbientCritter[]>(32);

// BUILD 723: speech lines and per-NPC deterministic seeds are stable data; keep
// them outside the animation loop to avoid rebuilding arrays and re-hashing IDs
// on every frame. The cache is bounded because generated towns can be endless.
const NPC_CHATTER_LINES = ['Lovely day!', 'Any news?', 'Fair prices!', 'Stay safe.', 'Busy today…', 'Heard the rumors?', 'Need supplies?', 'Good morning!', 'Fine weather.', 'Safe travels!'] as const;
const npcSpeechSeedCache = createBoundedCache<string, number>(512);
function npcSpeechSeedFor(id: string): number {
  const cached = npcSpeechSeedCache.get(id);
  if (cached !== undefined) return cached;
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  return npcSpeechSeedCache.set(id, seed);
}
function cachedCrittersForChunk(
  cx: number, cy: number, fieldSize: number,
  isLand: (lx: number, ly: number) => boolean,
): AmbientCritter[] {
  const key = `${cx},${cy},${fieldSize}`;
  const cached = ambientCritterCache.get(key);
  if (cached) return cached;
  return ambientCritterCache.set(key, crittersForChunk(cx, cy, fieldSize, isLand));
}
function cachedSettlementDecorFor(chunk: { x: number; y: number }): ReturnType<typeof settlementDecorFor> {
  const key = `${chunk.x},${chunk.y}`;
  const cached = settlementDecorCache.get(key);
  if (cached) return cached;
  // Bound cache size as the player explores an effectively unbounded world.
  return settlementDecorCache.set(key, settlementDecorFor(chunk));
}

// ---------------------------------------------------------------------------
// BUILD 698 helpers
// ---------------------------------------------------------------------------

/** (BUILD 916: shadeOf removed with the discrete shade palettes it fed —
 * ground shading now comes from shadeHexColor/groundToneAt in isoTiles.) */

/**
 * Pre-tinted goat sprite. Goats reuse the deer strip as a placeholder; the
 * old per-frame white fillRect over the whole bounding box read as a broken
 * white rectangle. Tint once at load (source-atop on the deer strip),
 * cache on the window, draw like any other sprite afterwards.
 */
function goatTintedImg(): HTMLCanvasElement | null {
  const w = window as unknown as {
    __goatTinted?: HTMLCanvasElement;
    __critterImgs?: Record<string, HTMLImageElement>;
  };
  if (w.__goatTinted) return w.__goatTinted;
  const deer = w.__critterImgs?.deer;
  if (!deer || !deer.complete || deer.naturalWidth === 0) return null;
  const c = document.createElement('canvas');
  c.width = deer.naturalWidth; c.height = deer.naturalHeight;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(deer, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, 0, c.width, c.height);
  w.__goatTinted = c;
  return c;
}

/**
 * Procedural fence tile sprite, pre-rendered once (no fence art exists in
 * props/). Wood posts + rails sized to one iso diamond; drawn with a single
 * drawImage per boundary tile.
 */
function farmFenceSprite(): HTMLCanvasElement {
  const w = window as unknown as { __farmFence?: HTMLCanvasElement };
  if (w.__farmFence) return w.__farmFence;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const x = c.getContext('2d')!;
  x.strokeStyle = '#7a5c3a'; x.lineWidth = 5; x.lineCap = 'round';
  x.beginPath(); x.moveTo(2, 9); x.lineTo(62, 9); x.moveTo(2, 23); x.lineTo(62, 23); x.stroke();
  x.fillStyle = '#5e4429';
  x.fillRect(7, 2, 7, 28); x.fillRect(50, 2, 7, 28);
  w.__farmFence = c;
  return c;
}

type IsoMonster = { id: number; kind: string; position: Point; facing: string; disposition: string; hp: number; maxHp: number; variant?: string; moving?: boolean; attacking?: boolean; hitFlash?: boolean; stray?: boolean };

/**
 * The live monster array belongs to the player's active chunk and stores
 * chunk-local field coordinates. Do not replicate these entities into each
 * terrain scene in the 3x3 render grid. Keep one drawable per entity ID and
 * reject invalid/out-of-chunk coordinates before both drawing and hit tests.
 */
function liveMonstersForActiveChunk(monsters: readonly IsoMonster[] | undefined, chunk: Point): IsoMonster[] {
  // BUILD 917: the settlement safety zone hides every hostile — except
  // deliberate town-edge strays (flagged at spawn), which are real,
  // visible participants in townsfolk combat.
  const inSafetyZone = isStartingSettlementSafetyZone(chunk);
  const seenIds = new Set<number>();
  return (monsters ?? []).filter((monster) => {
    if (inSafetyZone && !monster.stray) return false;
    const { x, y } = monster.position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= FIELD_SIZE || y >= FIELD_SIZE) return false;
    if (seenIds.has(monster.id)) return false;
    seenIds.add(monster.id);
    return true;
  });
}
const isoMonsterDefCache = new Map<string, MonsterSpriteDef | undefined>();
function isoMonsterDef(kind: string): MonsterSpriteDef | undefined {
  if (isoMonsterDefCache.has(kind)) return isoMonsterDefCache.get(kind);
  const def = spriteDefFor(kind);
  isoMonsterDefCache.set(kind, def);
  return def;
}

interface IsoFieldViewProps {
  // BUILD 826: explicit interior state gates the exterior house overlay even while iso field stays mounted.
  inInterior?: boolean;
  // BUILD 722: render lightweight ambient speech above visible NPCs when enabled.
  npcSpeechEnabled?: boolean;
  // BUILD 886: per-NPC disposition (0-100) colors overhead name labels.
  dispositions?: Record<string, number>;
  chunk: Point;
  position: Point; // player, field units (0..FIELD_SIZE)
  townsfolk: Townsperson[];
  goats?: Array<{ id: number; kind: string; position: Point; facing: string; disposition: string }>; // BUILD 458: critter kinds
  monsters?: IsoMonster[];
  selectedMonsterId?: number | null;
  onSelectMonster?: (monster: IsoMonster | null) => void;
  onExit: () => void; // back to the 2D field
  onTapMove?: (point: Point) => void; // BUILD 366: tap-to-move target
  onTapMine?: (ore: FieldOre) => void; // BUILD 738: tap a rock to approach and auto-mine it
  onTalkTo?: (npc: Townsperson) => void;
  // BUILD 719: target selection is separate from interaction. Talking is only
  // triggered by the visible chat affordance once the selected NPC is in range.
  selectedNpcId?: string | null;
  onSelectNpc?: (npc: Townsperson | null) => void;
  selectedGoatId?: number | null;
  onSelectGoat?: (goat: { id: number; kind: string; position: Point; facing: string; disposition: string } | null) => void;
  // BUILD 697: tap a market stall to open its shop UI (stall index into
  // marketStallsFromDecor(decor.props) — stable decor order, never hardcoded).
  onShopStall?: (stallIndex: number) => void;
  // BUILD 684: loot drops — rendered in iso (were 2D-DOM only, invisible here).
  droppedLoot?: Array<{ id: number; position: Point }>;
  onPickupDrop?: (drop: { id: number; position: Point }) => void;
  // BUILD 731: lootable NPC corpses are also rendered/interacted with in iso mode.
  lootableBodies?: Array<{ id: string; npcName: string; position: Point }>;
  onLootBody?: (body: { id: string; position: Point }) => void;
  // BUILD 921: gear already looted off each corpse, by NPC id (base ids from
  // App's corpseLootedBases memo). Dead NPCs render with exactly these
  // layers removed, so looting visibly unequips the corpse. Living NPCs
  // are never stripped — the lookup below applies only to dead ones.
  corpseLootedBases?: Record<string, string[]>;
  // BUILD 912: horses in iso — the player's mount state plus the analytic
  // world horses (src/game/horses.ts) for the home chunk. Until this build
  // the iso view drew no horses at all: mounting changed speed and the HUD
  // but the player visibly stayed on foot, and NPC horses existed only in
  // the 2D DOM view.
  playerMounted?: boolean;
  /** The player's parked horse in the home chunk (null when mounted or in another chunk). */
  playerHorse?: { position: Point; facing: string } | null;
  worldHorses?: Array<{ id: string; name: string; color: string; activity: string; owner: string; position: Point }>;
  // BUILD 684: floating combat text — rendered in iso (were 2D-DOM only).
  damageTexts?: Array<{ id: number; text: string; position: Point; kind: string }>;
  zoom: number; // BUILD 372: zoom is owned by App so the main zoom buttons drive it
  // BUILD 944: camera rotation (0..3, 90 deg steps) owned by App; iso field view only.
  rotation?: IsoRotation;
  // BUILD 720: selected new-model RPG appearance for the live player.
  playerLook?: LookRef;
  onZoomChange: (z: number) => void;
  // BUILD 390: barbarian player equipment -> iso sprite variant + attack anim.
  // BUILD 702: deprecated (RPG sprite system) — kept for App.tsx compat, ignored.
  barbOutfit?: unknown;
  barbWeapon?: unknown;
  barbHair?: string;
  barbAttackSequence?: number;
  // BUILD 422: debug direction test — when set, the player shows this facing's
  // sprite sheet with the walk cycle playing, ignoring movement deltas.
  debugFacing?: Face8 | null;
  // BUILD 704: explicit player run state (from the stamina system in App).
  // When set, overrides the animator's speed heuristic for the player.
  playerRunning?: boolean;
  // BUILD 933: player is sneaking — the player figure draws dimmed.
  playerSneaking?: boolean;
  // BUILD 459: collision box debug — red = current box, green = draggable proposed box
  collisionDebug?: boolean;
  // BUILD 851: user-placed Asset Studio sprites rendered in the live isometric world.
  placedAssets?: Array<{ id: string; name: string; src: string; chunk: string; x: number; y: number; width: number; height: number; scale: number; rotation: number; flipX: boolean; flipY: boolean; visible?: boolean; layer?: number }>;
  // BUILD 852: houses stamped with the World Editor/Map Builder must also render in isometric mode.
  editorPlacedObjects?: Array<{ id: string; kind: string; chunk: string; x: number; y: number }>;
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

// BUILD 945: Rodwan tree sheet, loaded once and drawn from the live loop.
// Until the sheet finishes loading, trees fall back to the procedural draw
// (first frames only) so no tree ever renders blank.
let rodwanSheetImg: HTMLImageElement | null = null;
function rodwanSheetImage(): HTMLImageElement {
  if (!rodwanSheetImg) {
    rodwanSheetImg = new Image();
    rodwanSheetImg.decoding = 'async';
    rodwanSheetImg.src = artUrl(RODWAN_SHEET_PATH);
  }
  return rodwanSheetImg;
}

// BUILD 851: cache uploaded Asset Studio images once; draw them from the live world loop.
const placedAssetImageCache = new Map<string, HTMLImageElement>();
function placedAssetImage(src: string): HTMLImageElement {
  let image = placedAssetImageCache.get(src);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = src;
    placedAssetImageCache.set(src, image);
  }
  return image;
}

const MARGIN = 48; // world-px background margin around the map
const ROAD_HALF = 5; // road band half-width in tiles

// BUILD 701: hoisted color parsing for the chunk-LOD ground path. Scene
// palettes come from a small fixed set of hex strings, so parse each once.
// The desert/farm base colors are constants — parsed once at module load.
const lodHexCache = new Map<string, [number, number, number]>();
function lodHexRgb(hex: string): [number, number, number] {
  let c = lodHexCache.get(hex);
  if (!c) {
    c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    lodHexCache.set(hex, c);
  }
  return c;
}
// BUILD 916: the LOD town-mask color is the packed-earth town tone (the
// 695 sand read as a beach); matches the near pass's townGroundFill.
const LOD_TOWN_RGB: [number, number, number] = [164, 141, 96];
// BUILD 707: static critter source entries (was rebuilt per frame).
const CRITTER_SRC_ENTRIES: Array<[string, string]> = [
  ['deer', 'critters/stag/critter_stag_SE_idle.png'],
  ['boar', 'critters/boar/boar_SE_idle_strip.png'],
  ['badger', 'critters/badger/critter_badger_SE_idle.png'],
  ['direwolf', 'critters/wolf/wolf-idle.png'],
  // BUILD 575: goat uses deer sprite as placeholder (similar quadruped)
  ['goat', 'critters/stag/critter_stag_SE_idle.png'],
];

// BUILD 707: static building source entries (was rebuilt per frame).
const BLD_SRC_ENTRIES: Array<[string, string]> = [
  ...Object.keys(BUILDING_ASSET_META).map(
    (variant) => [variant, sharedHouseSpriteUrl] as [string, string],
  ),
  // Load the starter exterior explicitly so its sprite never depends on a generic variant.
  ['starting-house-exterior', sharedHouseSpriteUrl],
  ['starting-house-overlay', startingHouseOverlayUrl],
];

const LOD_FARM_RGB: Array<[number, number, number]> = FARM_BASE_COLORS.map(
  (fc) => [parseInt(fc.slice(1, 3), 16), parseInt(fc.slice(3, 5), 16), parseInt(fc.slice(5, 7), 16)] as [number, number, number],
);

// BUILD 916: the BUILD 698/707 discrete shade palettes (sand %8, farm %4
// hash buckets) are gone — they were the checkerboard. All ground surfaces
// now shade from the continuous groundToneAt field in isoTiles.

// BUILD 701: memoized final fill strings for chunk-LOD subtiles. The
// classification (lodGroundClassAt) is already cached, but the per-frame
// Math.round x3 + template-literal fillStyle build for 576 subtiles was the
// remaining cost. The fill string is fully static per (world subtile, scene
// palette, skipFarm), so it's memoized too — the hot loop becomes two Map
// lookups and a fillStyle assignment. Nested numeric maps avoid per-frame
// string-key allocation. Palette hex is validated on hit so a palette change
// can never serve a stale color.

// BUILD 701: smooth value-noise brightness for the chunk-LOD grass. This
// replaces the BUILD 682 per-subtile hash (every 8x8 diamond got an
// independent random brightness, so neighboring diamonds had hard brightness
// edges — it read as TV static, not grass). Three octaves over a GLOBAL
// tile-unit lattice, so the pattern is seamless across chunk borders and
// deterministic forever:
//   coarse: ~140-tile spacing, ±4% — large soft mottling, like real turf
//   mid:    ~70-tile spacing,  ±4% — medium variation
//   fine:   ~35-tile spacing,  ±4% — gentle per-diamond texture, no edges
// Smoothstep interpolation means neighboring diamonds agree in brightness,
// so no hard diamond-edge quilt lines. Mean stays 1.0 (same overall
// brightness as before); only the spatial character changes.
function lodValueNoise(u: number, v: number, seed: number): number {
  const ix = Math.floor(u), iy = Math.floor(v);
  const fx = u - ix, fy = v - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n = (x: number, y: number): number => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const a = n(ix, iy), b = n(ix + 1, iy), c = n(ix, iy + 1), d = n(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function lodGrassBrightness(tx0: number, ty0: number, subN: number): number {
  // Subtile center in world tiles. The lattice is in tile units, so the
  // texture scale is independent of the SUB subdivision: ~140-tile soft
  // blobs + ~70-tile variation + ~35-tile mottling. Smoothstep
  // interpolation means neighboring diamonds agree — no hard quilt edges.
  const cx = tx0 + subN / 2, cy = ty0 + subN / 2;
  const coarse = lodValueNoise(cx / 140, cy / 140, 1);
  const mid = lodValueNoise(cx / 70, cy / 70, 2);
  const fine = lodValueNoise(cx / 35, cy / 35, 3);
  return 1.0 + (coarse - 0.5) * 0.08 + (mid - 0.5) * 0.08 + (fine - 0.5) * 0.08;
}

const lodFillCache = new Map<number, Map<number, { fill: string; pal: string; sf: boolean }>>();
const LOD_FILL_CACHE_MAX_ROWS = 2048;
function lodFillFor(tx0: number, ty0: number, subN: number, skipFarm: boolean, baseHex: string): string {
  let row = lodFillCache.get(ty0);
  let e = row?.get(tx0);
  if (!e || e.pal !== baseHex || e.sf !== skipFarm) {
    const cls = lodGroundClassAt(tx0, ty0, subN, skipFarm);
    const [br, bg, bb] = lodHexRgb(baseHex);
    let cr: number, cg: number, cb: number;
    if (cls.kind === 1) { const dr = LOD_TOWN_RGB; cr = dr[0]; cg = dr[1]; cb = dr[2]; }
    else if (cls.kind >= 2) {
      const fc = LOD_FARM_RGB[cls.kind - 2];
      cr = fc[0]; cg = fc[1]; cb = fc[2];
    } else { cr = br; cg = bg; cb = bb; }
    // BUILD 701: smooth value-noise brightness (was: independent per-subtile
    // hash, which read as static). Deterministic per world subtile, so the
    // memoization below stays valid.
    const v = lodGrassBrightness(tx0, ty0, subN);
    const r = Math.min(255, Math.round(cr * v));
    const gg = Math.min(255, Math.round(cg * v));
    const b2 = Math.min(255, Math.round(cb * v));
    e = { fill: `rgb(${r},${gg},${b2})`, pal: baseHex, sf: skipFarm };
    if (!row) {
      // Evict one old scanline at a time instead of invalidating the whole LOD cache.
      while (lodFillCache.size >= LOD_FILL_CACHE_MAX_ROWS) {
        const oldest = lodFillCache.keys().next();
        if (oldest.done) break;
        lodFillCache.delete(oldest.value);
      }
      row = new Map();
      lodFillCache.set(ty0, row);
    }
    row.set(tx0, e);
  }
  return e.fill;
}

// ---------------------------------------------------------------------------
// BUILD 916: procedural ground fills. The tileset ground blocks and the
// per-tile hash shade buckets are retired for base ground: every surface is
// a flat fill driven by the continuous groundToneAt value-noise field, so
// tones vary smoothly across tiles and nothing can read as a checkerboard
// quilt. Ramps are [deep, light] tone pairs per surface; the patch channel
// mixes between them at ~170-tile scale, the shade channel brightens at
// ~120/41/11-tile scales. All pure in world coords — the ground cache stays
// valid forever per position.
// ---------------------------------------------------------------------------

const BIOME_GROUND_RAMPS: Record<string, [string, string]> = {
  meadow: ['#5f9247', '#93bc67'],
  grass: ['#5f9247', '#93bc67'],
  forest: ['#3e6b41', '#649157'],
  desert: ['#bd9257', '#dcb87e'],
  shore: ['#a3a068', '#c9b57e'],
  rock: ['#75816c', '#9aa48b'],
  tundra: ['#9db8ad', '#c6d6cd'],
  ocean: ['#2a6f8d', '#3d84a3'],
};

// Hot-loop color math on RGB tuples (no per-tile hex parsing/formatting —
// ground cache rebuilds touch tens of thousands of tiles at far zoom).
type Rgb = [number, number, number];
const rgbOf = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const rgbStr = (c: Rgb): string => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const BIOME_RAMPS_RGB: Record<string, [Rgb, Rgb]> = Object.fromEntries(
  Object.entries(BIOME_GROUND_RAMPS).map(([k, [a, b]]) => [k, [rgbOf(a), rgbOf(b)] as [Rgb, Rgb]]),
);
const FARM_RGB: Rgb[] = FARM_BASE_COLORS.map(rgbOf);
const TOWN_EARTH_RGB: [Rgb, Rgb] = [rgbOf('#8f7a54'), rgbOf('#a68f61')];
const ROAD_RGB: [Rgb, Rgb] = [rgbOf('#a8895a'), rgbOf('#c2a878')];
const PLAZA_RGB: [Rgb, Rgb] = [rgbOf('#82827b'), rgbOf('#a4a49b')];
const BANK_RGB: Rgb = rgbOf('#8f7a52');
const WATER_DEEP_RGB: Rgb = rgbOf('#2f6cb8');
const WATER_DEEP_LAKE_RGB: Rgb = rgbOf('#2a64b0');
const WATER_SHAL_RGB: Rgb = rgbOf('#55a0dd');
const WATER_SHAL_LAKE_RGB: Rgb = rgbOf('#5aa3de');
const WATER_SHORE_RGB: Rgb = rgbOf('#a8cddd');
const WATER_TEAL_RGB: Rgb = rgbOf('#2e7fa8');
const BRIDGE_RGB: Rgb = rgbOf('#8a6a44');
const SOIL_DARK_RGB: Rgb = rgbOf('#77572f');
const OCHRE_LIGHT_RGB: Rgb = rgbOf('#cbb26a');
const CROP_DARK_RGB: Rgb = rgbOf('#679c46');

// Allocation-free variants writing into caller scratch tuples: a ground
// cache rebuild touches tens of thousands of tiles, and per-tile array
// churn showed up as a walking-FPS cost. S2/S3 are helper-internal slots.
const S2: Rgb = [0, 0, 0];
const S3: Rgb = [0, 0, 0];
function mixInto(out: Rgb, a: Rgb, b: Rgb, t: number): void {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}
function shadeInto(out: Rgb, c: Rgb, f: number): void {
  out[0] = c[0] * f; out[1] = c[1] * f; out[2] = c[2] * f;
}
function copyInto(out: Rgb, c: Rgb): void {
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

function biomeGroundInto(out: Rgb, terrain: string, fallbackHex: string, tone: GroundTone): void {
  const ramp = BIOME_RAMPS_RGB[terrain];
  if (!ramp) { shadeInto(out, rgbOf(fallbackHex), tone.shade); return; }
  mixInto(out, ramp[0], ramp[1], tone.patch);
  shadeInto(out, out, tone.shade);
}

/** Town ground: worn grass blending to packed earth toward the town mask. */
function townGroundInto(out: Rgb, townM: number, tone: GroundTone): void {
  biomeGroundInto(S2, 'meadow', '#77a45b', tone); // grass in S2
  mixInto(S3, TOWN_EARTH_RGB[0], TOWN_EARTH_RGB[1], tone.patch);
  shadeInto(S3, S3, tone.shade); // earth in S3
  // Patchy wear: even at the mask center much of the ground stays grassy;
  // streets and the plaza carry the earth look, yards keep worn grass.
  const worn = townM * (0.3 + 0.55 * tone.patch);
  mixInto(out, S2, S3, worn);
}

/** Farmland plot fill: retuned base colors, smooth tone, 1D furrow rows. */
function farmGroundInto(out: Rgb, code: number, tone: GroundTone, wy: number): void {
  const base = FARM_RGB[code - 1];
  if (code === FARM_SOIL) mixInto(out, base, SOIL_DARK_RGB, tone.patch * 0.35);
  else if (code === FARM_OCHRE) mixInto(out, base, OCHRE_LIGHT_RGB, tone.patch * 0.3);
  else if (code === FARM_GREEN) mixInto(out, base, CROP_DARK_RGB, tone.patch * 0.3);
  else copyInto(out, base);
  let f = tone.shade;
  // Furrows: gentle one-dimensional row striping (period 2 tiles). Rows
  // read as plough lines; a 1D stripe can never checker.
  if (code === FARM_SOIL || code === FARM_GREEN) f *= 1 + Math.sin(wy * Math.PI) * 0.04;
  shadeInto(out, out, f);
}

/** Packed-dirt road tone. */
function roadGroundInto(out: Rgb, tone: GroundTone): void {
  mixInto(out, ROAD_RGB[0], ROAD_RGB[1], tone.patch);
  shadeInto(out, out, tone.shade);
}

/**
 * How strongly a road tile renders as dirt, from its depth inside the
 * chunk's road band: 0.3 at the verge, 1 at the centerline. Roads keep
 * their full width in the navigation/collision graph — only the visual
 * weight feathers at the edges so bands stop streaking across fields.
 */
function roadBlendFor(road: string, lx: number, ly: number): number {
  if (road === 'none') return 0;
  const c = FIELD_SIZE / 2;
  let d = 0;
  if (road.includes('e') || road.includes('w')) d = Math.max(d, ROAD_HALF - Math.abs(ly - c));
  if (road.includes('n') || road.includes('s')) d = Math.max(d, ROAD_HALF - Math.abs(lx - c));
  return 0.3 + 0.7 * Math.min(1, Math.max(0, d) / 2.5);
}

export default function IsoFieldView({ inInterior = false, npcSpeechEnabled = false, dispositions, chunk, position, townsfolk, goats, placedAssets = [], editorPlacedObjects = [], onExit, onTapMove, onTapMine, onTalkTo, selectedNpcId, onSelectNpc, selectedGoatId, onSelectGoat, monsters, selectedMonsterId, onSelectMonster, onShopStall, droppedLoot, onPickupDrop, lootableBodies, onLootBody, corpseLootedBases, playerMounted, playerHorse, worldHorses, damageTexts, zoom, rotation = 0, onZoomChange, barbOutfit, barbWeapon, barbHair, barbAttackSequence, debugFacing, collisionDebug, playerRunning, playerSneaking, playerLook }: IsoFieldViewProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef({ chunk, px: position.x, py: position.y, folk: townsfolk, goats, placedAssets, editorPlacedObjects, monsters, selectedNpcId, selectedGoatId, selectedMonsterId, barbOutfit, barbWeapon, barbHair, barbAttackSequence, debugFacing, droppedLoot, lootableBodies, corpseLootedBases, damageTexts, playerRunning, playerSneaking, playerLook, npcSpeechEnabled, inInterior, dispositions, playerMounted, playerHorse, worldHorses });
  liveRef.current = { chunk, px: position.x, py: position.y, folk: townsfolk, goats, placedAssets, editorPlacedObjects, monsters, selectedNpcId, selectedGoatId, selectedMonsterId, barbOutfit, barbWeapon, barbHair, barbAttackSequence, debugFacing, droppedLoot, lootableBodies, corpseLootedBases, damageTexts, playerRunning, playerSneaking, playerLook, npcSpeechEnabled, inInterior, dispositions, playerMounted, playerHorse, worldHorses };
  // BUILD 711: render-time interpolation between the 30 Hz authoritative
  // position samples. A render buffer (previous/current sample + timestamps)
  // lets the canvas draw intermediate positions at the display refresh rate,
  // instead of applying a lagging exponential filter to every new sample.
  // This affects presentation only: movement, collision, and pathfinding in
  // App remain authoritative and unchanged.
  const playerRenderRef = useRef({
    previousX: position.x, previousY: position.y,
    currentX: position.x, currentY: position.y,
    previousAt: 0, currentAt: 0,
  });
  if (playerRenderRef.current.currentX !== position.x || playerRenderRef.current.currentY !== position.y) {
    const sample = playerRenderRef.current;
    const sampleAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dx = position.x - sample.currentX;
    const dy = position.y - sample.currentY;
    // Large changes are teleports/chunk restores, not walk movement. Snap
    // both endpoints so interpolation never slides across the entire map.
    if (Math.abs(dx) + Math.abs(dy) > 8 || sample.currentAt === 0) {
      sample.previousX = position.x;
      sample.previousY = position.y;
      sample.previousAt = sampleAt;
    } else {
      sample.previousX = sample.currentX;
      sample.previousY = sample.currentY;
      sample.previousAt = sample.currentAt;
    }
    sample.currentX = position.x;
    sample.currentY = position.y;
    sample.currentAt = sampleAt;
  }
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
      'props/fountain.png', 'props/lamp.png', 'props/hedge-straight.png',
      'props/cart-wood.png',
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
  const tapRef = useRef({ onTapMove, onTapMine, onTalkTo, onSelectNpc, onSelectGoat, onSelectMonster, onPickupDrop, onLootBody, onShopStall });
  tapRef.current = { onTapMove, onTapMine, onTalkTo, onSelectNpc, onSelectGoat, onSelectMonster, onPickupDrop, onLootBody, onShopStall };

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
          // BUILD 910 (Phase A2): all buildings share one draw depth (just
          // behind the player, BUILD 811), so their relative painter order is
          // their push order. Sort by position sum so southern buildings are
          // pushed (and therefore drawn) after northern ones — with every
          // building wearing the oversized two-layer art, unsorted overlaps
          // painted northern interiors over southern roofs.
          buildings: buildingDoorwaysFor(cp).slice().sort((a, b2) => (a.position.x + a.position.y) - (b2.position.x + b2.position.y)),
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
  // BUILD 697: market-stall positions from the LIVE settlement decor (same
  // source as the NPC browsers) — never hardcoded. Ref-mirrored so the tap
  // listener always hit-tests the current chunk's stalls.
  const homeStalls = useMemo(() => {
    try {
      return marketStallsFromDecor(cachedSettlementDecorFor({ x: chunk.x, y: chunk.y }).props);
    } catch {
      return [];
    }
  }, [chunk.x, chunk.y]);
  const stallsRef = useRef(homeStalls);
  stallsRef.current = homeStalls;
  const sceneFor = (ox: number, oy: number): IsoChunkScene => {
    const c = clampChunkOffset(ox, oy, R);
    return scenes[(c.oy + R) * GRID + (c.ox + R)];
  };

  // BUILD 372: zoom lives in App (the main black zoom buttons drive it);
  // mirror to a ref for the rAF loop and canvas listeners.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // BUILD 944: camera rotation lives in App; mirror to a ref for the rAF loop and canvas listeners.
  const rotationRef = useRef<IsoRotation>(rotation);
  rotationRef.current = rotation;

  useEffect(() => {
    preloadCharacterSprites(); // BUILD 702: RPG character sprite pack
    preloadIsoTiles(); // BUILD 389: landscape tileset
    preloadCritters(); // BUILD 389: ambient critters
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    // BUILD 710: favor low-latency opaque canvas composition on mobile GPUs.
    const g = canvas.getContext('2d', { alpha: false, desynchronized: true })!;
    const N = FIELD_SIZE;
    // BUILD 944: rotation is view-only. Shadow isoToScreen inside this effect
    // so every anchor (ground, buildings, actors, tap hit-tests) renders
    // through the rotated projection; sprite images still draw upright at
    // rotated anchors. dep() is the rotated painter depth.
    const isoToScreen = (tx: number, ty: number) => {
      const p = isoToScreenBase(tx, ty);
      return rotateIsoScreen(p.x, p.y, rotationRef.current);
    };
    const dep = (x: number, y: number) => rotatedDepth(x, y, rotationRef.current);
    let lastRotK = rotationRef.current;
    // BUILD 376: map bounds in world px (tile space == field units, 1:1)
    // covering the whole rendered chunk grid, so the camera never reveals
    // ungenerated void — the old single-chunk bounds are what left the blue
    // background visible around the map diamond.
    // BUILD 944: the clamp bounds are recomputed per frame from the ROTATED
    // grid bounds (the rotated diamond's own bounds, not the rotated
    // bounding box). At k = 0 this equals the old isoChunkGridBounds.
    const clampCam = (c: { x: number; y: number }, zm: number, wpx: number, hpx: number, b: { minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number }) => {
      const hw = wpx / (2 * zm), hh = hpx / (2 * zm);
      const ox = (b.maxX - b.minX) / 2 - hw, oy = (b.maxY - b.minY) / 2 - hh;
      c.x = Math.max(b.cx - Math.abs(ox), Math.min(b.cx + Math.abs(ox), c.x));
      c.y = Math.max(b.cy - Math.abs(oy), Math.min(b.cy + Math.abs(oy), c.y));
    };

    const cam = { x: 0, y: 0 };
    {
      const p = isoToScreen(liveRef.current.px, liveRef.current.py);
      cam.x = p.x; cam.y = p.y - 24; // character body centered, not feet
    }
    const playerFace = { f: 'down' as Face8 };
    const prevP = { x: liveRef.current.px, y: liveRef.current.py };
    // BUILD 709: props publish player coordinates at 30 Hz to keep React cheap,
    // but the canvas runs at display refresh. Hold the walk state briefly after
    // each real movement sample so the animator does not alternate walk/idle
    // on the 30 Hz update boundary. Ignore tiny collision/deceleration noise
    // when changing facing, which was causing wrong-way sprite flicker.
    let lastPlayerMovementAt = 0;
    // Per-character animation controllers (no React state — plain map in the
    // render loop; pruned each frame so removed NPCs don't leak).
    const charAnims = new Map<string, CharacterAnimator>();
    const seenAnims = new Set<string>(); // reset each frame; prunes charAnims
    // BUILD 707: NPC render-position interpolation. The AI ticks at 8Hz
    // (120ms) but the canvas renders at 60fps — drawing NPCs at their raw
    // sim position made them move in visible steps ("glitchy walking" near
    // the village where all 40 NPCs are). We track each NPC's previous and
    // current sim position plus the tick timestamp, and lerp between them
    // per frame. The animator also receives the interpolated position, so
    // its speed measurement stays smooth instead of spiky.
    const npcInterp = new Map<string, { px: number; py: number; cx: number; cy: number; t: number; duration: number }>();
    // BUILD 912: world-horse render interpolation + facing memory. Horse
    // positions resolve analytically from the world clock and are only
    // republished when App's clock string changes, so — exactly like NPCs
    // above — lerp between samples and derive facing from the travel delta.
    const horseInterp = new Map<string, { px: number; py: number; cx: number; cy: number; t: number; duration: number }>();
    const horseFace = new Map<string, Face8>();
    // BUILD 710: reuse hot-loop buffers instead of allocating new arrays every
    // frame. This reduces garbage collection pauses while walking through town.
    const drawables: Drawable[] = [];
    const farmsteadQueue: Array<{ x: number; y: number; barn: boolean }> = [];
    // BUILD 716: reusable membership set avoids O(n²) damage-text pruning and
    // a per-frame spread allocation while keeping the seen-time Map intact.
    const activeDamageIds = new Set<number>();
    // BUILD 717: viewport-sized static terrain surface. Moving actors/effects
    // remain on the main canvas and keep their normal depth ordering.
    const groundCacheCanvas = document.createElement('canvas');
    const groundCacheG = groundCacheCanvas.getContext('2d')!;
    let groundCacheKey = '';
    let groundCacheBounds: { originX: number; originY: number; worldW: number; worldH: number } | null = null;
    let groundCacheFarmsteadQueue: Array<{ x: number; y: number; barn: boolean }> = [];
    // BUILD 390: track the player's attack sequence -> swing start time so the
    // barbarian attack clip plays once per swing.
    let lastAttackSeq = -1;

    let gameLoop: BrowserGameLoop | null = null;
    let last = performance.now();
    // Adaptive quality governor: lower tree-detail cost only when sustained frame work is high,
    // then restore full canopies after the renderer has headroom again.
    let adaptiveTreeLod = false;
    let qualityProbeFrames = 0;
    let renderCostEma = 16;
    // BUILD 716: opt-in frame timing; no summary allocation or overlay unless
    // ?perf=1 is enabled. Use the same loop users actually play.
    const perfEnabled = new URLSearchParams(location.search).get('perf') === '1';
    const frameMetrics = perfEnabled ? new FrameMetrics() : null;
    let perfOverlayTick = 0;

    // Static prop asset registry: build once per renderer mount, not on every
    // animation frame. The previous loop recreated this object and its entries
    // array at display refresh rate even though the asset list never changes.
    const propSrc: Record<string, string> = {
      'props/well.png': 'props/well.png',
      'props/barrel.png': 'props/barrel.png',
      'props/lamp.png': 'props/lamp.png',
      'buildings/gatehouse.png': 'buildings/gatehouse.png',
      'props/fountain.png': 'props/fountain.png',
      'props/stall-red.png': 'props/stall-red.png',
      'props/stall-blue.png': 'props/stall-blue.png',
      'props/stall-green.png': 'props/stall-green.png',
      'props/market-stall.png': 'props/market-stall.png',
      'props/statue-angel.png': 'props/statue-angel.png',
      'props/hedge-straight.png': 'props/hedge-straight.png',
      'props/cart-wood.png': 'props/cart-wood.png',
    };
    const propWindow = window as unknown as { __propImgs?: Record<string, HTMLImageElement> };
    const propImgs = propWindow.__propImgs || {};
    for (const [key, src] of Object.entries(propSrc)) {
      if (propImgs[key]) continue;
      const img = new Image();
      img.src = artUrl(src);
      propImgs[key] = img;
    }
    propWindow.__propImgs = propImgs;

    // Adaptive backing-store scale keeps the 2.5D scene responsive on
    // thermally constrained phones without permanently blurring high-end screens.
    let adaptiveResolutionScale = 1;
    let adaptiveResolutionLastChange = 0;
    const baseDpr = () => Math.min(window.innerWidth < 900 ? 1 : 1.25, window.devicePixelRatio || 1);
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = baseDpr() * adaptiveResolutionScale;
      const width = Math.max(1, Math.round(r.width * dpr));
      const height = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        // Ground cache pixels must match the new backing-store resolution.
        groundCacheKey = '';
      }
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
    // BUILD 704: explicit `running` overrides the animator's speed heuristic
    // (NPC fleeing, player sprinting). Undefined = heuristic as before.
    const drawPerson = (d: Drawable[], tx: number, ty: number, facing: Face8, moving: boolean, look: LookRef, now: number, animKey: string, size?: number, running?: boolean, dead = false, liftPx = 0, attacking = false, alpha?: number) => {
      const c = isoToScreen(tx, ty);
      let anim = charAnims.get(animKey);
      // Dead NPCs play the Death clip and hold its last frame. Recreate the
      // animator on respawn because the dead state is intentionally terminal.
      if (!anim || (!dead && anim.state === 'dead')) { anim = new CharacterAnimator(animKey); charAnims.set(animKey, anim); }
      seenAnims.add(animKey);
      if (dead) anim.setState('dead');
      // BUILD 912: an NPC in its fight-back stance (BUILD 879 sim: in range,
      // not moving) plays the real Attack clip. setState is a no-op while
      // the one-shot is mid-swing, and the animator returns to idle/walk
      // when the clip ends — so holding this flag yields a readable swing
      // cadence instead of damage ticking off a standing sprite.
      if (attacking && !dead) anim.setState('attack');
      anim.update({ x: tx, y: ty, moving: dead ? false : moving, facing: rotateFace8(facing, rotationRef.current), nowMs: now, running: dead ? false : running });
      d.push({
        // BUILD 812: Keep the player above oversized house artwork. Sorting
        // only by world feet coordinates is insufficient for tall sprites whose
        // visible pixels extend well beyond their logical footprint.
        depth: animKey === 'player' ? Number.POSITIVE_INFINITY : dep(tx, ty) + 0.01, draw: (g2) => {
          drawIsoCharacter({
            g: g2, x: c.x, y: c.y - liftPx, look, nowMs: now, animator: anim,
            // BUILD 699: children render smaller.
            size,
            // BUILD 912: a lifted character (rider/driver) casts no ground
            // shadow of its own — the horse/cart below draws it.
            shadow: liftPx > 0 ? false : undefined,
            // BUILD 933: only the sneaking player passes an alpha.
            alpha,
          });
        },
      });
    };

    const frame = (scheduledNowMs?: number) => {
      // Reuse the RAF timestamp from the browser engine instead of sampling the clock twice per frame.
      const nowMs = scheduledNowMs ?? performance.now();
      // Measure work time separately from RAF scheduling delay; including the
      // frame interval here falsely classified healthy 60Hz frames as slow.
      const frameStartedAt = performance.now();
      const dt = Math.min(50, Math.max(0, nowMs - last)); last = nowMs;
      const zm = zoomRef.current;
      const wpx = canvas.clientWidth || 1, hpx = canvas.clientHeight || 1;
      // Keep draw resolution aligned with the adaptive backing-store scale.
      const dpr = baseDpr() * adaptiveResolutionScale;
      // BUILD 710: don't burn CPU/GPU redrawing a hidden game tab.
      if (document.hidden) { last = nowMs; return; }
      // Perf-debug hook (?nodirt=1): skip textured dirt paths for A/B timing.
      const skipDirt = (frame as unknown as { __skipDirt?: boolean }).__skipDirt
        ?? ((frame as unknown as { __skipDirt?: boolean }).__skipDirt =
          new URLSearchParams(location.search).get('nodirt') === '1');
      // BUILD 698: perf-debug hook (?nofarm=1): skip the farmland ring for A/B timing.
      const skipFarm = (frame as unknown as { __skipFarm?: boolean }).__skipFarm
        ?? ((frame as unknown as { __skipFarm?: boolean }).__skipFarm =
          new URLSearchParams(location.search).get('nofarm') === '1');
      // BUILD 698: precomputed shade palettes — seeded per-tile brightness
      // variation for sand (±2%, subtle like the reference) and farmland
      // plots (±5%). BUILD 707: hoisted to lazy module scope (was rebuilt
      // every frame — static data, zero reason for per-frame allocation).
      // Reset reusable per-frame buffers; retain their backing storage.
      drawables.length = 0;
      farmsteadQueue.length = 0;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // BUILD 714: keep pixel-art sampling mode set once per frame. Tile
      // helpers now fast-path this state instead of toggling canvas smoothing
      // off/on for every single ground and decor sprite.
      g.imageSmoothingEnabled = false;

      const live = liveRef.current;
      // BUILD 711: render 1 simulation sample (~33 ms) behind real time and
      // interpolate linearly between the two most recent positions. This is
      // the correct reconstruction for 30 Hz snapshots on a 60 Hz canvas:
      // constant-speed movement stays constant-speed instead of easing/lagging
      // at every snapshot boundary. Large teleports were snapped above.
      const interp = playerRenderRef.current;
      const renderAt = nowMs - 34;
      const sampleSpan = interp.currentAt - interp.previousAt;
      const alpha = sampleSpan > 0
        ? Math.max(0, Math.min(1, (renderAt - interp.previousAt) / sampleSpan))
        : 1;
      const playerX = interp.previousX + (interp.currentX - interp.previousX) * alpha;
      const playerY = interp.previousY + (interp.currentY - interp.previousY) * alpha;
      // BUILD 702: a new attack sequence triggers the RPG attack animation
      // via the animator state machine (one-shot, returns to idle/walk).
      const seq = live.barbAttackSequence ?? 0;
      if (seq !== lastAttackSeq) {
        lastAttackSeq = seq;
        const pa = charAnims.get('player');
        if (pa) pa.setState('attack');
      }
      // player facing from movement delta
      const mdx = playerX - prevP.x, mdy = playerY - prevP.y;
      // BUILD 422: debug direction test overrides facing and forces the walk
      // cycle so each numbered arrow shows its direction's sprite sheet.
      const dbgFace = live.debugFacing ?? null;
      const movedX = Math.abs(mdx) > 0.025;
      const movedY = Math.abs(mdy) > 0.025;
      const hasMovementSample = movedX || movedY;
      if (hasMovementSample) {
        lastPlayerMovementAt = nowMs;
        playerFace.f = isoPlayerFaceForScreenDeltaSticky(mdx, mdy, playerFace.f);
      }
      // Continue the walk cycle between throttled React position publishes;
      // settle to idle only after movement has genuinely stopped.
      let playerMoving = nowMs - lastPlayerMovementAt < 170;
      if (dbgFace) { playerFace.f = dbgFace; playerMoving = true; }
      prevP.x = playerX; prevP.y = playerY;

      // camera follows the player (BUILD 944: target is the ROTATED anchor;
      // the -24 body-center nudge is screen-space, applied AFTER rotation).
      const target = isoToScreen(playerX, playerY);
      target.y -= 24;
      const rotK = rotationRef.current;
      if (rotK !== lastRotK) {
        // Snap on orientation change: never lerp across the world mid-rotation.
        cam.x = target.x; cam.y = target.y; lastRotK = rotK;
      } else {
        const k = 1 - Math.exp(-dt / 78);
        cam.x += (target.x - cam.x) * k;
        cam.y += (target.y - cam.y) * k;
      }
      clampCam(cam, zm, wpx, hpx, rotatedGridBounds(R, N, MARGIN, rotK));

      // background — BUILD 376: dark neutral fallback. Generated terrain now
      // covers the whole viewport at every zoom, so this should never show;
      // the old light blue is what used to read as "not generated".
      // BUILD 713: keep the real textured tile terrain active through normal
      // zooming. The coarse green chunk-LOD is only a last-resort fallback at
      // extreme zoom-out, where individual tile textures are sub-pixel.
      // This avoids the abrupt green-world switch at the old 0.35 threshold.
      const useChunkLOD = zm < 0.14;
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
      // BUILD 944: the range runs through rotatedVisibleTileRange, which
      // unrotates the viewport corners first; at k = 0 it is identical.
      const { x0, x1, y0, y1 } = rotatedVisibleTileRange(cam.x, cam.y, wpx, hpx, zm, rotationRef.current);
      // BUILD 712: shared viewport test. Off-screen props stay in world data
      // but never enter the depth-sort queue or execute canvas drawing.
      const viewHalfW = (wpx / 2) / zm;
      const viewHalfH = (hpx / 2) / zm;
      const anchorVisible = (p: { x: number; y: number }, marginX: number, marginTop: number, marginBottom: number) =>
        p.x >= cam.x - viewHalfW - marginX &&
        p.x <= cam.x + viewHalfW + marginX &&
        p.y >= cam.y - viewHalfH - marginTop &&
        p.y <= cam.y + viewHalfH + marginBottom;

      // BUILD 717: cache static ground separately from animated actors.
      // Cache covers 1.5 viewports and is rebuilt only when the camera leaves
      // it or a render-affecting input changes. Resolution is capped to avoid
      // enormous per-chunk bitmaps on high-DPI and zoomed-out devices.
      const showDetail = zm > 0.20;
      const tilesOn = isoTilesReady();
      const hedgeImage = (window as unknown as { __propImgs?: Record<string, HTMLImageElement> })
        .__propImgs?.['props/hedge-straight.png'];
      const hedgeReady = !!hedgeImage && hedgeImage.complete && hedgeImage.naturalWidth > 0;
      const groundCacheW = Math.max(1, Math.min(2048, Math.ceil(wpx * 1.5)));
      const groundCacheH = Math.max(1, Math.min(1536, Math.ceil(hpx * 1.5)));
      const desiredWorldW = (wpx / zm) * 1.5;
      const desiredWorldH = (hpx / zm) * 1.5;
      const groundCacheScale = Math.max(0.01, Math.min(
        zm, groundCacheW / desiredWorldW, groundCacheH / desiredWorldH,
      ));
      const groundWorldW = groundCacheW / groundCacheScale;
      const groundWorldH = groundCacheH / groundCacheScale;
      const groundKey = [
        chunk.x, chunk.y, zm, wpx, hpx, useChunkLOD, showDetail, tilesOn,
        skipFarm, hedgeReady, rotationRef.current,
      ].join('|');
      const viewportInsideCache = !!groundCacheBounds &&
        cam.x - viewHalfW >= groundCacheBounds.originX &&
        cam.x + viewHalfW <= groundCacheBounds.originX + groundCacheBounds.worldW &&
        cam.y - viewHalfH >= groundCacheBounds.originY &&
        cam.y + viewHalfH <= groundCacheBounds.originY + groundCacheBounds.worldH;
      if (groundCacheKey !== groundKey || !viewportInsideCache) {
        groundCacheCanvas.width = groundCacheW;
        groundCacheCanvas.height = groundCacheH;
        groundCacheG.setTransform(1, 0, 0, 1, 0, 0);
        groundCacheG.clearRect(0, 0, groundCacheW, groundCacheH);
        const originX = cam.x - groundWorldW / 2;
        const originY = cam.y - groundWorldH / 2;
        groundCacheG.setTransform(
          groundCacheScale, 0, 0, groundCacheScale,
          -originX * groundCacheScale, -originY * groundCacheScale,
        );
        groundCacheG.imageSmoothingEnabled = false;
        const cacheCenterX = originX + groundWorldW / 2;
        const cacheCenterY = originY + groundWorldH / 2;
        const { x0: groundX0, x1: groundX1, y0: groundY0, y1: groundY1 } =
          rotatedVisibleTileRange(cacheCenterX, cacheCenterY, groundCacheW, groundCacheH, groundCacheScale, rotationRef.current);
        farmsteadQueue.length = 0;
        // BUILD 916: water depth at any tile in the scene grid (same
        // sampling as the per-tile wet test, including the BUILD 610
        // town dry-land guard) — used for wet-bank shore blending.
        const colC: Rgb = [0, 0, 0]; // per-tile fill scratch (BUILD 916)
        const depthAtTile = (tx2: number, ty2: number): number => {
          const o2 = isoTileChunkOffset(tx2, ty2, N);
          const nsc = sceneFor(o2.ox, o2.oy);
          const acx2 = chunk.x + nsc.ox, acy2 = chunk.y + nsc.oy;
          if (acx2 >= 3 && acx2 <= 5 && acy2 >= 6 && acy2 <= 8) return 0;
          return waterDepthAt(nsc.water, acx2 * FIELD_SIZE + o2.lx + 0.5, acy2 * FIELD_SIZE + o2.ly + 0.5);
        };
      // ground — per-tile chunk lookup into the scene grid
      // BUILD 376: tile detail is sub-pixel when zoomed out, so skip it there.
      // BUILD 389: user-supplied landscape tileset replaces the procedural
      // diamond fill (falls back to it while tiles load).
      // BUILD 713: retain terrain accents/decor at smaller zoom levels too;
      // only omit these when they are effectively sub-pixel.
      if (useChunkLOD) {
        // BUILD 682: Chunk LOD with grass texture. Instead of one flat diamond
        // per chunk (which looked like solid green paint), subdivide each chunk
        // into an 8x8 coarse grid with subtle deterministic color variation.
        // 576 diamonds for 9 chunks — still cheap, but looks like grass.
        // BUILD 701: per-subtile classification (sand/farm/normal) and the
        // brightness hash are static per world subtile, so they're memoized
        // in lodGroundClassAt — no more per-frame trig/hashTile/parseInt.
        // Scene palette + desert/farm base colors are hoisted out of the
        // subtile loops. Visual output is identical to the old computation.
        const SUB = 8;
        const subN = N / SUB;
        for (const sc of scenes) {
          const cx0 = (chunk.x + sc.ox) * N, cy0 = (chunk.y + sc.oy) * N;
          const baseHex = sc.palette.field;
          for (let sy = 0; sy < SUB; sy++) {
            for (let sx = 0; sx < SUB; sx++) {
              const tx0 = cx0 + sx * subN, ty0 = cy0 + sy * subN;
              // BUILD 701: memoized fill (sand/farm/normal + brightness hash).
              groundCacheG.fillStyle = lodFillFor(tx0, ty0, subN, skipFarm, baseHex);
              const p00 = isoToScreen(tx0, ty0);
              const p10 = isoToScreen(tx0 + subN, ty0);
              const p11 = isoToScreen(tx0 + subN, ty0 + subN);
              const p01 = isoToScreen(tx0, ty0 + subN);
              groundCacheG.beginPath();
              groundCacheG.moveTo(p00.x, p00.y); groundCacheG.lineTo(p10.x, p10.y);
              groundCacheG.lineTo(p11.x, p11.y); groundCacheG.lineTo(p01.x, p01.y);
              groundCacheG.closePath(); groundCacheG.fill();
            }
          }
        }
      } else {
      for (let ty = groundY0; ty <= groundY1; ty++) {
        for (let tx = groundX0; tx <= groundX1; tx++) {
          const { ox, oy, lx, ly } = isoTileChunkOffset(tx, ty, N);
          const sc = sceneFor(ox, oy);
          // BUILD 695: storybook sandy ground inside Mosslight — radial mask
          // in world coords. Computed before the path so sand diamonds can
          // be expanded to kill AA seams (below).
          const absCxS = chunk.x + sc.ox, absCyS = chunk.y + sc.oy;
          const sandy = absCxS >= 3 && absCxS <= 5 && absCyS >= 6 && absCyS <= 8 &&
            mosslightSandAt(lx + absCxS * 280, ly + absCyS * 280) > 0.5;
          // BUILD 895: tile art is keyed to absolute world coordinates, not camera-relative chunk offsets. This prevents grass/decor patterns shifting or mismatching at chunk seams as the player moves.
          // BUILD 698: world tile coords + farmland plot code (0 = none).
          // Computed before the tileset branch so farm tiles use the flat
          // plot-color fallback (like the 695 sand), not the meadow tileset.
          const wxW = lx + absCxS * 280, wyW = ly + absCyS * 280;
          const farmCode = skipFarm ? 0 : farmlandPlotAt(wxW, wyW, sandy);
          // BUILD 916: raw town mask (0..1) drives the worn-grass → packed-
          // earth blend; the BUILD 604 plaza rect picks the stone fill.
          const townM = absCxS >= 3 && absCxS <= 5 && absCyS >= 6 && absCyS <= 8
            ? mosslightSandAt(wxW, wyW) : 0;
          const inPlaza = absCxS === 0 && absCyS === 0 && wxW >= 124 && wxW < 164 && wyW >= 124 && wyW < 164;
          const terr = sc.tile.terrain;
          const isOcean = terr === 'ocean';
          const roadHere = isOcean ? false : isRoadTileFor(sc, lx, ly);
          const p = isoToScreen(tx, ty);
          const hw = TILE_W / 2, hh = TILE_H / 2;
          // BUILD 698: expand sand/road diamonds ~1px so AA seams can't show
          // the dark background — the "graph paper" grid lines.
          // BUILD 916: flat fills replaced the overlapping tileset blocks on
          // EVERY surface, so every diamond expands — otherwise the seam
          // grid shows through the flat water/grass/plots.
          const ex = 1;
          groundCacheG.beginPath();
          groundCacheG.moveTo(p.x, p.y - hh - ex); groundCacheG.lineTo(p.x + hw + ex, p.y);
          groundCacheG.lineTo(p.x, p.y + hh + ex); groundCacheG.lineTo(p.x - hw - ex, p.y);
          groundCacheG.closePath();
          // BUILD 369 (Phase 2b): authoritative rivers/lakes; road crossings draw as bridges.
          let wet = false;
          let depthHere = 0;
          let inTownArea = false;
          if (!isOcean) {
            // BUILD 610: Never render water in starting town area (chunks 3-5, 6-8).
            // Town should be dry land; lakes were flooding the town.
            inTownArea = (chunk.x + sc.ox) >= 3 && (chunk.x + sc.ox) <= 5 &&
                               (chunk.y + sc.oy) >= 6 && (chunk.y + sc.oy) <= 8;
            if (!inTownArea) {
              // BUILD 714: depth-only lookup avoids allocating a temporary
              // { depth, kind } object for every visible tile on every frame.
              depthHere = waterDepthAt(sc.water, (chunk.x + sc.ox) * FIELD_SIZE + lx + 0.5, (chunk.y + sc.oy) * FIELD_SIZE + ly + 0.5);
              // BUILD 583: require deeper water before overriding land tiles.
              // Shallow depth (0.25-0.5) was causing false water rendering on meadows.
              wet = depthHere > 0.5;
            }
          }
          // BUILD 916: one procedural fill per tile. The tileset ground
          // blocks and the per-tile hash shade buckets that used to be
          // picked here (BUILD 389/695/698) are retired for base ground —
          // their discrete per-tile choices were the checkerboard quilt on
          // every surface. Fills now come from the continuous groundToneAt
          // field; decor sprites + accents still layer on top below.
          const tone = groundToneAt(wxW, wyW);
          const col = colC;
          if (wet && roadHere) {
            copyInto(col, BRIDGE_RGB); // bridge planks
          } else if (wet || isOcean) {
            const sampleX = (chunk.x + sc.ox) * FIELD_SIZE + lx + 0.5;
            const sampleY = (chunk.y + sc.oy) * FIELD_SIZE + ly + 0.5;
            const wDepth = waterDepthAt(sc.water, sampleX, sampleY);
            const wKind = waterKindAt(sc.water, sampleX, sampleY);
            const t = isOcean ? Math.max(0.55, Math.min(1, wDepth)) : Math.min(1, wDepth);
            mixInto(col, wKind === 2 ? WATER_SHAL_LAKE_RGB : WATER_SHAL_RGB, wKind === 2 ? WATER_DEEP_LAKE_RGB : WATER_DEEP_RGB, t);
            // Shore lightening: shallow water lifts toward pale aqua so
            // banks blend in instead of ending at a hard diamond edge.
            const shoreK = Math.max(0, Math.min(1, (0.95 - t) / 0.45));
            mixInto(col, col, WATER_SHORE_RGB, shoreK * 0.35);
            // Gentle continuous variation — large teal patches plus the
            // shared shade field; never a per-tile bucket.
            mixInto(col, col, WATER_TEAL_RGB, tone.patch * 0.18);
            shadeInto(col, col, 0.97 + (tone.shade - 1) * 0.55);
          } else if (inPlaza) {
            mixInto(col, PLAZA_RGB[0], PLAZA_RGB[1], tone.patch);
            shadeInto(col, col, tone.shade);
          } else if (farmCode > 0) {
            farmGroundInto(col, farmCode, tone, wyW);
          } else if (townM > 0) {
            townGroundInto(col, townM, tone);
          } else {
            biomeGroundInto(col, terr, sc.palette.field, tone);
          }
          // Roads feather into the ground they cross: dirt weight rises
          // from verge to centerline (roadBlendFor), and inside farm plots
          // it fades hard so lanes stop streaking across crops. The road
          // graph (navigation/collision/door alignment) is untouched.
          let roadK = 0;
          if (roadHere && !wet) {
            roadK = roadBlendFor(sc.road, lx, ly);
            if (farmCode > 0) roadK *= 0.3;
            roadGroundInto(S3, tone);
            mixInto(col, col, S3, roadK);
          }
          // Wet-bank tint: dry tiles touching water get a muddy edge, so
          // river/lake shores don't end at a hard diamond boundary. A cheap
          // same-grid probe (±1 water cell) gates the exact cross-chunk
          // neighbor checks so dry inland tiles never pay for them.
          if (!wet && !isOcean && !inTownArea && !inPlaza) {
            const nearWater = depthHere > 0 ||
              waterDepthAt(sc.water, wxW + 4.5, wyW + 0.5) > 0 ||
              waterDepthAt(sc.water, wxW - 3.5, wyW + 0.5) > 0 ||
              waterDepthAt(sc.water, wxW + 0.5, wyW + 4.5) > 0 ||
              waterDepthAt(sc.water, wxW + 0.5, wyW - 3.5) > 0;
            if (nearWater &&
                (depthAtTile(tx - 1, ty) > 0.5 || depthAtTile(tx + 1, ty) > 0.5 ||
                 depthAtTile(tx, ty - 1) > 0.5 || depthAtTile(tx, ty + 1) > 0.5)) {
              mixInto(col, col, BANK_RGB, 0.34 * (0.7 + 0.6 * tone.patch));
            }
          }
          groundCacheG.fillStyle = rgbStr(col);
          groundCacheG.fill();
          // Road gravel/verge detail only on the worn core of a road —
          // never on farm plots (faded above) or the feathered verge.
          if (roadHere && !isOcean && !wet && farmCode === 0 && roadK >= 0.8) {
            drawProceduralPathDetail(groundCacheG, wxW, wyW, p.x, p.y, sandy);
          }
          // BUILD 366: deterministic per-tile detail (chunk-gen video techniques).
          // (chunk offset mixed into the hash so neighbor chunks don't repeat
          // the home chunk's pattern; home chunk hash is unchanged.)
          // BUILD 389: tileset decor sprites replace the rect-based bits.
          if (showDetail && !isOcean && !roadHere && !wet) {
            // BUILD 916: the old (lx + ly) % 2 parity darkening is gone —
            // it was one of the checkerboard sources. Surface variation
            // now comes only from the continuous tone field in the fill.
            // BUILD 695: clean sandy streets — no decor sprites on town sand
            // (desert rocks would litter the market square).
            // BUILD 698: none on farmland either — meadow tufts on plowed
            // soil read wrong; plots get hedge/fence boundaries instead.
            const dn = (sandy || farmCode > 0) ? -1 : decorTileFor(terr, wxW, wyW, 0, 0);
            if (dn >= 0) drawDecor(groundCacheG, dn, p.x, p.y);
            else if (farmCode === 0 && (townM > 0 || !sandy)) {
              // HTML5 canvas accents add warm, storybook ground detail without
              // new image assets or per-frame drawing cost (this is cached).
              // BUILD 924: town ground gets the same flower/tuft accents as
              // the wilderness, at the same rate — previously the 695 sandy
              // gate left the whole packed-earth core with no decor AND no
              // accents (the dead-flat read from the BUILD 916 after-shots).
              // Decor sprites stay off sandy town ground (695: rocks would
              // litter the streets); only the grass/flower accents come in.
              // Town ground is grass-based (worn grass -> packed earth), so
              // the meadow accent set is the right one regardless of the
              // chunk's world biome. Non-town tiles are unchanged (chunk
              // biome, same pass). Roads, farm plots, and wet tiles are
              // excluded by the outer conditions, as before.
              drawProceduralGroundAccent(groundCacheG, townM > 0 ? 'meadow' : terr, wxW, wyW, p.x, p.y);
            }
            // BUILD 698: farmland plot boundaries (hedges/fences) and
            // farmstead building sites (drawn as drawables after the pass).
            if (farmCode > 0 && farmCode !== FARM_TRACK) {
              const det = farmlandDetailAt(wxW, wyW);
              if (det === FARM_DET_HEDGE) {
                const hedge = (window as unknown as { __propImgs?: Record<string, HTMLImageElement> })
                  .__propImgs?.['props/hedge-straight.png'];
                if (hedge && hedge.complete && hedge.naturalWidth > 0) {
                  groundCacheG.drawImage(hedge, p.x - hw, p.y - hh, TILE_W, TILE_H);
                }
              } else if (det === FARM_DET_FENCE) {
                groundCacheG.drawImage(farmFenceSprite(), p.x - hw, p.y - hh, TILE_W, TILE_H);
              } else if (det === FARM_DET_HOUSE) {
                farmsteadQueue.push({ x: wxW, y: wyW, barn: false });
              } else if (det === FARM_DET_BARN) {
                farmsteadQueue.push({ x: wxW, y: wyW, barn: true });
              }
            }
          }
        }
      }
      } // end useChunkLOD else
        groundCacheBounds = { originX, originY, worldW: groundWorldW, worldH: groundWorldH };
        groundCacheKey = groundKey;
        groundCacheFarmsteadQueue = farmsteadQueue.slice();
      } else {
        farmsteadQueue.length = 0;
        for (const farm of groundCacheFarmsteadQueue) farmsteadQueue.push(farm);
      }
      g.drawImage(
        groundCacheCanvas,
        groundCacheBounds!.originX, groundCacheBounds!.originY,
        groundCacheBounds!.worldW, groundCacheBounds!.worldH,
      );


      // BUILD 683: Settlement decor (plazas, lanes) — ground decals drawn
      // after terrain, before depth-sorted drawables. Only chunk (4,7) has any.
      for (const sc of scenes) {
        const decor = cachedSettlementDecorFor({ x: chunk.x + sc.ox, y: chunk.y + sc.oy });
        if (!decor.plazas.length && !decor.lanes.length) continue;
        const bx = sc.ox * N, by = sc.oy * N;
        for (const p of decor.plazas) {
          const c = isoToScreen(p.x + bx, p.y + by);
          // BUILD 695: plaza decal (was village green).
          // BUILD 916: packed-earth tint instead of sand, matching the
          // new town ground (the sand ellipse read as a beach patch).
          g.fillStyle = 'rgba(168, 144, 96, 0.28)'; // packed-earth plaza
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
            // Keep nearby path geometry warm while bounding memory in long sessions.
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
              // BUILD 916: lanes stroke at 85% width — less visual weight.
              g.lineWidth = lane.widths[li] * 0.85;
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

      // buildings: real rects -> iso boxes with pitched roofs. BUILD 376:
      // drawn for every chunk in the scene grid; neighbor rects are offset
      // into current-chunk-relative tile space so they tile seamlessly.
      // BUILD 601: Building sprites — Exiled Kingdoms style.
      // Cache building images on window.
      // BUILD 684: paths from the single asset catalog (no duplicated map).
      // BUILD 707: bldSrc hoisted to module scope (was rebuilt from
      // BUILDING_ASSET_META every frame — static data).
      const bldImgs = (window as unknown as { __bldImgs?: Record<string, HTMLImageElement> }).__bldImgs || {};
      for (const [kind, src] of BLD_SRC_ENTRIES) {
        // Imported Vite asset URLs already include the GitHub Pages base path.
        // Do not pass them through artUrl(), which prepends the base a second time
        // and makes IMG_5422 fail to load (leaving the procedural white house visible).
        const resolvedSrc = (src === sharedHouseSpriteUrl || src === startingHouseOverlayUrl) ? src : artUrl(src);
        let img = bldImgs[kind];
        // BUILD 802: replace stale cached variant images too; every building
        // must display the same uploaded IMG_5423 sprite, not legacy art.
        if (!img || img.dataset.sharedHouseSrc !== resolvedSrc) {
          img = new Image();
          img.dataset.sharedHouseSrc = resolvedSrc;
          img.src = resolvedSrc;
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
          if (Math.abs(lx - 179.7) < 1 && Math.abs(ly - 173.4) < 1) return 'green-cottage';
        }
        // BUILD 683: Mosslight cottages (chunk 4,7) use the settlement
        // layout's roof variants, not the position hash.
        // BUILD 692: the engine's roadside filler lots use district-appropriate
        // new art variants (commercial -> shops, residential -> cottages),
        // picked by stable hash so the assignment never flickers.
        if (absCx === 4 && absCy === 7 && b.rect) {
          // BUILD 768: Resolve the fixed Crossing buildings by the same stable
          // rect list used by doors and NPC homes. House 12 is the tavern.
          const pinnedRects = mosslightPinnedRects();
          const pinnedIndex = pinnedRects.findIndex((r) =>
            Math.abs(r.left - b.rect.left) < 0.01
            && Math.abs(r.top - b.rect.top) < 0.01
            && Math.abs(r.right - b.rect.right) < 0.01
            && Math.abs(r.bottom - b.rect.bottom) < 0.01
          );
          if (pinnedIndex >= 0 && pinnedIndex < 4) {
            return ['blue-house', 'story-tower', 'plaster-house', 'tavern'][pinnedIndex];
          }
          if (pinnedIndex >= 10 && pinnedIndex < 18) {
            return ['blue-house', 'tavern', 'green-shop', 'house-timber', 'shop-awning', 'blue-house', 'brick-shop', 'stone-cottage'][pinnedIndex - 10];
          }
          const v = cottageVariantForRect(b.rect);
          if (v) {
            // BUILD 767: use authored detailed PNGs; the SVG replacements were crude
            // and inconsistent in scale with the town's existing architectural style.
            return v === 'hut-thatched' ? 'green-cottage' : v;
          }
          const fv = fillerVariantForRect(b.rect);
          if (fv) {
            return fv === 'hut-thatched' ? 'green-cottage' : fv;
          }
        }
        // Stable hash: absolute chunk + local coords (both stable)
        // BUILD 614: expanded to 10 varieties for town diversity.
        const h = Math.abs(Math.sin((absCx * 1000 + lx) * 12.9898 + (absCy * 1000 + ly) * 78.233) * 43758.5453) % 1;
        const kinds = ['green-cottage', 'plaster-house', 'blue-house', 'red-shop', 'green-cottage', 'shop-awning', 'house-timber', 'story-tower', 'tavern', 'blue-house'];
        return kinds[Math.floor(h * kinds.length)];
      };
      for (const sc of scenes) {
        const bx = sc.ox * N, by = sc.oy * N;
        for (const b of [...sc.buildings].sort((a, b2) => dep(a.position.x, a.position.y) - dep(b2.position.x, b2.position.y))) {
          // BUILD 910 (Phase A2): every building renders the two-layer
          // starter-house treatment (roofless interior base + roof overlay
          // that hides while the player is under it). BUILD 805 hid all
          // non-tutorial exteriors; that skip is gone — doorway/collision
          // data is unchanged, only the visuals are universal now.
          const r = { left: b.rect.left + bx, top: b.rect.top + by, right: b.rect.right + bx, bottom: b.rect.bottom + by };
          const bpos = { x: b.position.x + bx, y: b.position.y + by };
        const p00 = isoToScreen(r.left, r.top), p10 = isoToScreen(r.right, r.top);
        const p11 = isoToScreen(r.right, r.bottom), p01 = isoToScreen(r.left, r.bottom);
        // BUILD 597: Viewport culling — skip buildings entirely outside view.
        // Visible world rect centered on cam.
        const vhw = (wpx / 2) / zm, vhh = (hpx / 2) / zm;
        const minX = Math.min(p00.x, p10.x, p11.x, p01.x), maxX = Math.max(p00.x, p10.x, p11.x, p01.x);
        // Use the selected sprite's real aspect ratio for vertical culling.
        // A fixed 64px allowance clipped tall roofs as the camera approached
        // the viewport edge, making buildings pop in/out while still visible.
        // Never render the retired straw-hut asset. Normalize the final live-renderer
        // selection here because pinned settlement variants and legacy hash pools
        // bypass the standalone buildingArtFor() selector.
        const selectedKind = buildingKindCache.get(b) ?? bldKindForBuilding(b, sc.ox, sc.oy);
        const kind = b.area.id === 'tutorial-house' ? 'starting-house-exterior' : (selectedKind.startsWith('new-') ? 'blue-house' : (selectedKind === 'hut-thatched' ? 'green-cottage' : selectedKind));
        buildingKindCache.set(b, kind);
        const projectedWidth = Math.hypot(p10.x - p00.x, p10.y - p00.y) * 0.95;
        const spriteHeight = buildingSpriteHeightForWidth(projectedWidth * (3.3 / 0.95), kind);
        // BUILD 910 (Phase A2): the roof overlay is drawn at 1.6x the base
        // sprite's height for EVERY building now, so the vertical culling
        // allowance must cover the overlay's full height (plus margin) or
        // roofs would pop in late at the top edge of the screen.
        const minY = Math.min(p00.y, p10.y, p11.y, p01.y) - Math.max(64, spriteHeight * 1.7);
        const maxY = Math.max(p00.y, p10.y, p11.y, p01.y);
        if (maxX < cam.x - vhw || minX > cam.x + vhw || maxY < cam.y - vhh || minY > cam.y + vhh) continue;
        const wallH = 64;
        const top = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - wallH });
        const t00 = top(p00), t10 = top(p10), t11 = top(p11), t01 = top(p01);
        // BUILD 811: The starting-house artwork is oversized and extends far
        // beyond its logical footprint. Always draw its sprite before the player
        // so the player remains visible when walking across/over the house image.
        // Collision and doorway logic remain tied to the original footprint.
        const buildingDepth = dep(position.x, position.y) - 0.02;

        // BUILD 910 (Phase A2): the BUILD 769 procedural floor-plan
        // cutaway is gone. Every building now uses the starter-house
        // two-layer pattern (authored interior base sprite + roof overlay
        // hidden while the player is under the drawn roof) — one consistent
        // in-field interior treatment for all buildings.

        drawables.push({
          depth: buildingDepth, draw: (g2) => {
            // BUILD 910 (Phase A2): every building's base is the authored
            // roofless-interior sprite (all registry variants already resolve
            // to IMG_5422; the explicit key keeps that guarantee if variants
            // are ever re-pointed at other art).
            const sprite = bldImgs['starting-house-exterior'] ?? bldImgs[kind] ?? bldImgs['blue-house'];
            if (sprite && sprite.complete && sprite.naturalWidth > 0) {
              // Draw sprite anchored at building base center
              const cx = (p00.x + p11.x) / 2;
              const baseY = Math.max(p00.y, p10.y, p11.y, p01.y);
              // BUILD 809: Make house sprites twice their previous size without changing
              // their shared logical footprint, door trigger, or collision data.
              // The slight overhang is intentional; culling above uses the same scale.
              // BUILD 910 (Phase A2): the 3.3x factor is a tutorial-house
              // framing (its logical rect is a tiny 7x4.8 for a full house).
              // Applied to EVERY building it made each town house's art
              // ~2.15x its footprint diamond — neighbours blanketed each
              // other in one unreadable roof pile (verified by screenshot:
              // a generated house's roof painted over the whole tutorial
              // house). Other buildings therefore scale with their footprint:
              // base art ~0.97x the footprint diamond's width, overlay ~1.55x
              // — the same two-layer look, sized to the lot it stands on.
              const edgeX = Math.hypot(p10.x - p00.x, p10.y - p00.y);
              const edgeY = Math.hypot(p01.x - p00.x, p01.y - p00.y);
              const targetW = b.area.id === 'tutorial-house' ? edgeX * 3.3 : (edgeX + edgeY) * 0.867;
              const scale = targetW / sprite.naturalWidth;
              const sw = sprite.naturalWidth * scale;
              const sh = sprite.naturalHeight * scale;
              // BUILD 808: no black ground ellipse beneath the uploaded house sprite.
              g2.save();
              g2.globalAlpha = 1;
              g2.globalCompositeOperation = 'source-over';
              g2.filter = 'none';
              g2.drawImage(sprite, cx - sw / 2, baseY - sh, sw, sh);
              g2.restore();
              // Keep authored sprite architecture intact; only add entry-aligned ground dressing.
              drawBuildingGroundDress(g2, cx, baseY, sw, r.left + r.right, r.top + r.bottom);
              // BUILD 826: draw the authored exterior overlay only while no interior is active.
              // The iso field can remain mounted during house transitions, so use the
              // live interior state instead of relying on unmounting the whole view.
              // BUILD 895: "inside the house" was tested against the overlay's
              // drawn screen bounds for the (then sole) tutorial house.
              // BUILD 910 supersedes that test with a per-building world-space
              // test — see the playerUnderRoof computation below for why the
              // screen AABB cannot generalize to a whole town of oversized art.
              // BUILD 899: enlarge the overlay (1.5 -> 1.6) and sink it so
              // its wall bases fully cover the base interior sprite's floor
              // front edge. Scale-about-the-bottom-anchor alone cannot close
              // that gap: the two authored images frame the house at
              // different heights, so scaling only moves the overlay's wall
              // bases up, not down (verified at 1.75 with a real screenshot —
              // the porch/deck stayed exposed). The sink keeps the
              // horizontal center and the world base anchor; only the drawn
              // rect's bottom extends past baseY onto the wall-base line.
              // BUILD 910 (Phase A1+A2): sink 0.18 -> 0.34. At 0.18 the
              // interior's porch/floor slab still jutted out below the
              // overlay's stone foundation (measured 22,625 uncovered px in
              // an offline composite of the two authored PNGs at renderer
              // geometry, all in the bottom band). At 0.34 the composite is
              // fully covered (~0 px) and the painted door still sits on its
              // foundation. The same two-layer treatment now applies to
              // EVERY building, not just the tutorial house (BUILD 805's
              // exterior skip is gone): base interior sprite + this overlay,
              // hidden while the player stands under the drawn roof.
              const overlayW = sw * 1.6;
              const overlayH = sh * 1.6;
              const overlaySink = sh * 0.34;
              // BUILD 910 (Phase A2): the under-roof test is per building in
              // WORLD space — the player's position (converted into this
              // scene's frame) against this building's own footprint,
              // inflated by 3 units (the doorstep + a step past the walls,
              // where the oversized art still reads as "at the house").
              // BUILD 896's drawn-screen-AABB test does NOT generalize:
              // with every building wearing the 3.3x/1.6x art, a
              // neighbouring house's screen AABB routinely contains the
              // player (measured: standing south of the tutorial house put
              // the player inside town-west-1's AABB, so its roof hid and
              // its interior painted over the tutorial house). The world
              // test keeps the 896 property that matters — the test follows
              // THIS building's drawn placement, footprint + art margin —
              // without borrowing a neighbour's rectangle.
              const scenePx = liveRef.current.px - bx;
              const scenePy = liveRef.current.py - by;
              const playerUnderRoof = scenePx >= b.rect.left - 3 && scenePx <= b.rect.right + 3
                && scenePy >= b.rect.top - 3 && scenePy <= b.rect.bottom + 3;
              if (!liveRef.current.inInterior && !playerUnderRoof) {
                const overlay = bldImgs['starting-house-overlay'];
                if (overlay && overlay.complete && overlay.naturalWidth > 0) {
                  g2.save();
                  g2.globalAlpha = 1;
                  g2.globalCompositeOperation = 'source-over';
                  g2.filter = 'none';
                  g2.drawImage(overlay, cx - overlayW / 2, baseY - overlayH + overlaySink, overlayW, overlayH);
                  g2.restore();
                }
              }
              return;
            }
            // BUILD 806: if the shared house sprite is still loading, skip this
            // frame rather than briefly drawing the procedural white house.
            // BUILD 910 (Phase A2): this now applies to every building — the
            // base sprite selection above already falls back through
            // 'starting-house-exterior' -> kind -> 'blue-house' (all the same
            // authored IMG_5422), so reaching here means the shared art
            // itself has not loaded yet.
            return;
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

      // BUILD 698: farmstead buildings (farmhouse + barn) in the farmland
      // ring — visual scenery only: no doors, no triggers, no collision
      // changes. Depth-sorted like real buildings, with the same soft
      // ground shadow treatment.
      for (const f of farmsteadQueue) {
        const fc = isoToScreen(f.x + 0.5, f.y + 0.5);
        const fvhw = (wpx / 2) / zm, fvhh = (hpx / 2) / zm;
        // BUILD 701: bottom margin 192 covers the farmstead sprite above its
        // base anchor (sw ~= 161 world units, ~1:1 aspect -> ~161 tall).
        if (fc.x < cam.x - fvhw - 100 || fc.x > cam.x + fvhw + 100 ||
            fc.y < cam.y - fvhh - 150 || fc.y > cam.y + fvhh + 192) continue;
        drawables.push({
          depth: dep(f.x, f.y),
          draw: (g2) => {
            const kind = f.barn ? 'house-timber' : 'hut-thatched';
            const sprite = bldImgs[kind];
            const e0 = isoToScreen(f.x + 0.5, f.y + 0.5);
            const e1 = isoToScreen(f.x + 1.5, f.y + 0.5);
            const tileEdge = Math.hypot(e1.x - e0.x, e1.y - e0.y);
            const sw = tileEdge * 4.5;
            const natW = sprite && sprite.complete && sprite.naturalWidth > 0 ? sprite.naturalWidth : 1600;
            const natH = sprite && sprite.complete && sprite.naturalWidth > 0 ? sprite.naturalHeight : 1600;
            const sh = sw * (natH / natW);
            // ground shadow (same treatment as town buildings)
            g2.fillStyle = 'rgba(0,0,0,0.20)';
            g2.beginPath();
            g2.ellipse(e0.x, e0.y, sw * 0.45, sw * 0.16, 0, 0, Math.PI * 2);
            g2.fill();
            if (sprite && sprite.complete && sprite.naturalWidth > 0) {
              g2.drawImage(sprite, e0.x - sw / 2, e0.y - sh, sw, sh);
            }
          },
        });
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
            depth: dep((x0 + x1) / 2, (y0 + y1) / 2),
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
      const propViewHalfW = (wpx / 2) / zm, propViewHalfH = (hpx / 2) / zm;
      for (const sc of scenes) {
        const decor = cachedSettlementDecorFor({ x: chunk.x + sc.ox, y: chunk.y + sc.oy });
        if (!decor.props.length) continue;
        const bx = sc.ox * N, by = sc.oy * N;
        for (const pr of decor.props) {
          const px = pr.x + bx, py = pr.y + by;
          const c = isoToScreen(px, py);
          // BUILD 701: bottom margin 128 covers the tallest prop sprite above
          // its base anchor (r=1.5 -> sw=96, up to ~96 tall at 1:1 aspect).
          if (c.x < cam.x - propViewHalfW - 100 || c.x > cam.x + propViewHalfW + 100 || c.y < cam.y - propViewHalfH - 150 || c.y > cam.y + propViewHalfH + 128) continue;
          const img = propImgs[pr.asset];
          drawables.push({
            depth: dep(px, py),
            draw: (g2) => {
              if (img && img.complete && img.naturalWidth > 0) {
                // BUILD 713: street lamps are intentionally larger so they
                // read clearly as town lighting without changing other props.
                const propScale = pr.asset === 'props/lamp.png' ? 1.6 : 1;
                const sw = pr.r * 2 * 32 * propScale;
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
          // BUILD 712: include canopy height in viewport bounds.
          // BUILD 945: marginX 40 (was 36) — the widest Rodwan crown spans
          // ~75px at full size, so 36px would pop edge trees in late.
          if (!anchorVisible(c, 40, 104, 18)) continue;
        const s = 0.7 + t.scale * 0.6;
        drawables.push({
          depth: dep(tx2, ty2), draw: (g2) => {
            // BUILD 945: Rodwan sprite trees, trunk base on the same ground
            // point the procedural tree used (c) — collision untouched.
            // Procedural is the fallback until the sheet loads (first frames).
            const img = rodwanSheetImage();
            if (img.complete && img.naturalWidth > 0) {
              drawRodwanTree(g2, img, RODWAN_SLICES[rodwanTreeIndexFor(chunk.x + sc.ox, chunk.y + sc.oy, t.id)], c.x, c.y, rodwanIsoHeightPx(t.scale), t.flip);
            } else if (zm < 0.42 || adaptiveTreeLod) drawProceduralTreeLod(g2, c.x, c.y, s, Math.round(tx2), Math.round(ty2));
            else drawProceduralTree(g2, c.x, c.y, s, Math.round(tx2), Math.round(ty2));
          },
        });
        } // end neighbor-chunk tree loop
      }

      // BUILD 724: one large, fixed landmark boulder just off the settlement.
      // Derive the anchor from authored town buildings so it stays near town
      // without relying on a magic world coordinate or changing collision.
      if (scenes.some((scene) => scene.ox === 0 && scene.oy === 0) && homeScene.buildings.length > 0 && zm >= 0.28) {
        const townBuildings = homeScene.buildings;
        const townX = townBuildings.reduce((sum, building) => sum + building.position.x, 0) / townBuildings.length;
        const townY = townBuildings.reduce((sum, building) => sum + building.position.y, 0) / townBuildings.length;
        const rockX = Math.max(4, Math.min(N - 5, townX + 13));
        const rockY = Math.max(4, Math.min(N - 5, townY + 8));
        const rockScreen = isoToScreen(rockX, rockY);
        if (anchorVisible(rockScreen, 38, 48, 20)) {
          drawables.push({
            depth: dep(rockX, rockY),
            draw: (g2) => drawProceduralBoulder(g2, rockScreen.x, rockScreen.y, zm < 0.42 ? 0.72 : 1),
          });
        }
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
          // BUILD 712: skip off-screen ore before queueing its drawable.
          if (!anchorVisible(c, 18, 20, 10)) continue;
          const oreCol = ORE_COLORS[o.kind] || '#8a8a8a';
          drawables.push({
            depth: dep(ox2, oy2), draw: (g2) => {
              // BUILD 734: render the authoritative starting deposit as a large boulder.
              if (o.id === 'tutorial-stone-deposit-4-7') {
                // BUILD 735: deliberately oversized landmark rock, visible at normal zoom.
                drawProceduralBoulder(g2, c.x, c.y, zm < 0.42 ? 1.7 : 2.25);
                return;
              }
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

        // BUILD 731: lootable NPC corpses — searchable in the default isometric view.
        if (sc.ox === 0 && sc.oy === 0) {
          for (const body of liveRef.current.lootableBodies || []) {
            const bx2 = body.position.x + bx, by2 = body.position.y + by;
            const bc = isoToScreen(bx2, by2);
            drawables.push({
              depth: dep(bx2, by2) + 0.002,
              draw: (g2, now) => {
                g2.save();
                // BUILD 912: an unlooted body advertises itself — a soft
                // pulsing gold ring + label, so the corpse reads as a tap
                // target on a phone instead of a 18px smudge on the ground.
                const pulse = 1 + Math.sin(now / 350) * 0.15;
                g2.strokeStyle = 'rgba(255, 205, 80, 0.75)';
                g2.lineWidth = 2;
                g2.beginPath(); g2.ellipse(bc.x, bc.y - 1, 15 * pulse, 6.5 * pulse, 0, 0, Math.PI * 2); g2.stroke();
                g2.font = 'bold 10px sans-serif';
                g2.textAlign = 'center';
                g2.textBaseline = 'middle';
                g2.lineWidth = 3;
                g2.strokeStyle = 'rgba(20, 16, 10, 0.85)';
                const label = '💰 Loot';
                g2.strokeText(label, bc.x, bc.y - 22);
                g2.fillStyle = '#ffd34d';
                g2.fillText(label, bc.x, bc.y - 22);
                g2.fillStyle = 'rgba(0,0,0,0.28)';
                g2.beginPath(); g2.ellipse(bc.x, bc.y - 1, 9, 4, 0, 0, Math.PI * 2); g2.fill();
                g2.fillStyle = '#d6cdb6';
                g2.beginPath(); g2.arc(bc.x, bc.y - 8, 5, 0, Math.PI * 2); g2.fill();
                g2.fillStyle = '#4b4035';
                g2.fillRect(bc.x - 3, bc.y - 9, 2, 2); g2.fillRect(bc.x + 1, bc.y - 9, 2, 2);
                g2.fillRect(bc.x - 2, bc.y - 5, 4, 2);
                g2.strokeStyle = '#a99b7e'; g2.lineWidth = 2;
                g2.beginPath(); g2.moveTo(bc.x - 7, bc.y - 3); g2.lineTo(bc.x + 7, bc.y + 1); g2.stroke();
                g2.restore();
              },
            });
          }
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
              depth: dep(dx2, dy2) + 0.001, draw: (g2, now) => {
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
        for (const c of cachedCrittersForChunk(chunk.x, chunk.y, N, isLand)) {
          const pose = critterPose(c, nowMs);
          // BUILD 712: avoid pose and draw-queue work for unseen wildlife.
          if (!anchorVisible(isoToScreen(pose.x, pose.y), 48, 60, 24)) continue;
          drawables.push({
            depth: dep(pose.x, pose.y) + 0.005,
            draw: (g2) => { drawCritter(g2, c, nowMs, isoToScreen, rotationRef.current); },
          });
        }
      }

      // townsfolk: the live NPC simulation, right where the 2D game has them.
      // look = npc.id -> deterministic per-NPC variant (same villager, same
      // face, every session).
      seenAnims.clear();
      // BUILD 597: Viewport culling for NPCs — only draw when in sight.
      const npcVhw = (wpx / 2) / zm, npcVhh = (hpx / 2) / zm;
      // BUILD 707: interpolate NPC sim positions (8Hz AI) to render rate.
        for (const npc of live.folk) {
        // Track previous/current simulation positions and interpolate over the
        // *observed* AI tick interval. A fixed 120ms duration causes a tiny
        // speed snap whenever mobile frame scheduling makes AI ticks drift.
        let ix = npc.position.x, iy = npc.position.y;
        const prev = npcInterp.get(npc.id);
        if (!prev || prev.cx !== npc.position.x || prev.cy !== npc.position.y) {
          // A jump > 5 units is a respawn/teleport, not a walk step.
          const jumped = prev && Math.hypot(npc.position.x - prev.cx, npc.position.y - prev.cy) > 5;
          ix = prev && !jumped ? prev.cx : npc.position.x;
          iy = prev && !jumped ? prev.cy : npc.position.y;
          const observedTick = prev ? nowMs - prev.t : 120;
          const duration = Math.max(70, Math.min(180, observedTick));
          npcInterp.set(npc.id, {
            px: ix, py: iy,
            cx: npc.position.x, cy: npc.position.y, t: nowMs,
            duration: jumped ? 0 : duration,
          });
        } else {
          const k = prev.duration === 0 ? 1 : Math.min(1, Math.max(0, (nowMs - prev.t) / prev.duration));
          ix = prev.px + (prev.cx - prev.px) * k;
          iy = prev.py + (prev.cy - prev.py) * k;
        }
        const nc = isoToScreen(ix, iy);
        // BUILD 701: bottom margin 64 covers the full character sprite above
        // the feet anchor (52 * 62/64 ~= 50.4 world units); the old 50 let
        // NPCs pop out while their head was still visible at the edge.
        if (nc.x < cam.x - npcVhw - 50 || nc.x > cam.x + npcVhw + 50 || nc.y < cam.y - npcVhh - 100 || nc.y > cam.y + npcVhh + 64) continue;
        // BUILD 719: selected NPC ring is a lightweight canvas drawable, not a
        // DOM overlay. The chat affordance appears only for the selected NPC
        // once the player is close enough to interact.
        if (live.selectedNpcId === npc.id) {
          const selectedX = ix, selectedY = iy;
          const playerDistance = Math.hypot(npc.position.x - live.px, npc.position.y - live.py);
          // BUILD 724: attacked/fleeing/dead townsfolk never show a talk affordance.
          // This is data-driven (not proximity-driven), so the icon cannot flicker back
          // on as the player moves in and out of interaction range during combat.
          const hasBeenAttacked = npc.hp != null || npc.fleeUntilTick != null || npc.deadUntilTick != null;
          const canTalk = !hasBeenAttacked && playerDistance <= 8.5;
          drawables.push({
            depth: dep(selectedX, selectedY) - 0.025,
            draw: (g2) => {
              g2.save();
              g2.strokeStyle = '#ffd34d';
              g2.lineWidth = 2.5;
              g2.fillStyle = 'rgba(255, 197, 45, 0.16)';
              g2.beginPath();
              g2.ellipse(nc.x, nc.y - 2, 20, 7, 0, 0, Math.PI * 2);
              g2.fill(); g2.stroke();
              if (canTalk && !npcIsDead) {
                const bx = nc.x, by = nc.y - 58;
                g2.fillStyle = '#fff4c8';
                g2.strokeStyle = '#8b6822';
                g2.lineWidth = 1.5;
                g2.beginPath();
                g2.roundRect(bx - 13, by - 10, 26, 20, 6);
                g2.fill(); g2.stroke();
                g2.beginPath(); g2.moveTo(bx - 4, by + 9); g2.lineTo(bx - 1, by + 14); g2.lineTo(bx + 2, by + 9); g2.fill();
                g2.fillStyle = '#5a4318';
                g2.font = 'bold 14px sans-serif';
                g2.textAlign = 'center';
                g2.textBaseline = 'middle';
                g2.fillText('…', bx, by - 1);
              }
              g2.restore();
            },
          });
        }
        // BUILD 921: a dead NPC renders minus the gear already looted off
        // its corpse (same hp<=0 condition as the Death pose below, so the
        // strip applies exactly when the corpse pose plays). Living NPCs
        // always render their full outfit — looting never undresses them.
        const npcDeadForLook = npc.hp != null && npc.hp <= 0;
        const lootedForNpc = npcDeadForLook ? live.corpseLootedBases?.[npc.id] : undefined;
        const npcLook: LookRef = lootedForNpc && lootedForNpc.length > 0
          ? lookWithoutLootedGear(variantLook(npc.id), lootedForNpc)
          : npc.id;
        drawPerson(drawables, ix, iy, npc.facing as Face4, npc.moving, npcLook, nowMs, npc.id,
          // BUILD 699: children are smaller (70% scale).
          // BUILD 704: fleeing NPCs run (explicit), everyone else walks.
          // BUILD 912: fight-back stance (in range, holding position) plays
          // the Attack clip — see drawPerson.
          npc.archetype === 'child' ? 36 : undefined, npc.running === true, npc.hp != null && npc.hp <= 0,
          0, npc.fightBackTarget != null && !npc.moving && !(npc.hp != null && npc.hp <= 0));

        // BUILD 732: dead NPCs are corpses, not conversational actors.
        // Check both authoritative death state and zero HP so ambient chatter
        // cannot survive a death transition while state updates are settling.
        const npcIsDead = npc.deadUntilTick != null || (npc.hp != null && npc.hp <= 0);

        // BUILD 886: overhead name label colored by disposition — red when
        // hostile (fighting back / fleeing) or cold toward the player, green
        // when friendly, white when neutral.
        if (!npcIsDead) {
          const hostile = npc.fightBackTarget != null || npc.fleeUntilTick != null;
          const color = dispositionNameColor(live.dispositions?.[npc.id] ?? defaultDisposition(), hostile);
          const nameText = npc.name;
          const nameX = nc.x, nameY = nc.y - (npc.archetype === 'child' ? 42 : 52);
          // BUILD 889: damage-drop HP bar — damaged townsfolk show a shrinking
          // red bar under the name (monsters already had one; NPCs didn't).
          const npcHpNow = npc.hp;
          const npcMaxHpNow = npcMaxHp(npc);
          const damaged = npcHpNow != null && npcHpNow < npcMaxHpNow;
          const hpFrac = damaged ? Math.max(0, npcHpNow / Math.max(1, npcMaxHpNow)) : 1;
          drawables.push({
            depth: dep(ix, iy) + 0.05,
            draw: (g2) => {
              g2.save();
              g2.font = 'bold 11px sans-serif';
              g2.textAlign = 'center';
              g2.textBaseline = 'middle';
              g2.lineWidth = 3;
              g2.strokeStyle = 'rgba(20, 16, 10, 0.85)';
              g2.strokeText(nameText, nameX, nameY);
              g2.fillStyle = color;
              g2.fillText(nameText, nameX, nameY);
              if (damaged) {
                const bw = 30, bh = 4, bx = nameX - bw / 2, by = nameY + 8;
                g2.fillStyle = 'rgba(20,10,10,0.8)';
                g2.fillRect(bx, by, bw, bh);
                g2.fillStyle = hpFrac > 0.35 ? '#e34b4b' : '#ff2222';
                g2.fillRect(bx, by, bw * hpFrac, bh);
              }
              g2.restore();
            },
          });
        }
        // BUILD 722: optional, unobtrusive ambient chatter above each living NPC.
        if (live.npcSpeechEnabled && !npcIsDead) {
          const line = NPC_CHATTER_LINES[Math.floor(nowMs / 4600 + npcSpeechSeedFor(npc.id)) % NPC_CHATTER_LINES.length];
          drawables.push({
            depth: dep(ix, iy) + 0.04,
            draw: (g2) => {
              g2.save();
              g2.font = '10px sans-serif';
              const textWidth = g2.measureText(line).width;
              const bw = Math.max(46, textWidth + 14);
              const bx = nc.x, by = nc.y - (npc.archetype === 'child' ? 57 : 65);
              g2.fillStyle = 'rgba(255, 250, 231, 0.96)';
              g2.strokeStyle = 'rgba(82, 66, 45, 0.92)';
              g2.lineWidth = 1;
              g2.beginPath();
              g2.roundRect(bx - bw / 2, by - 10, bw, 20, 6);
              g2.fill(); g2.stroke();
              g2.beginPath();
              g2.moveTo(bx - 4, by + 9); g2.lineTo(bx, by + 14); g2.lineTo(bx + 4, by + 9);
              g2.closePath(); g2.fill(); g2.stroke();
              g2.fillStyle = '#40372b';
              g2.textAlign = 'center';
              g2.textBaseline = 'middle';
              g2.fillText(line, bx, by);
              g2.restore();
            },
          });
        }
      }
      // BUILD 451: goats in the iso view — simple canvas goat (body, head,
      // BUILD 457: deer (stag sprite) replaces the canvas goat. Uses the
      // provided critter sprites from public/critters/stag/.
      const liveGoats = (live as { goats?: Array<{ id: number; kind: string; position: Point; facing: string; disposition: string }> }).goats;
      // BUILD 458: critter sprites per kind. Cache images.
      // BUILD 707: static entries (was rebuilt + Object.entries per frame).
      const critterImgs = (window as unknown as { __critterImgs?: Record<string, HTMLImageElement> }).__critterImgs || {};
      for (const [kind, src] of CRITTER_SRC_ENTRIES) {
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
          // BUILD 701: bottom margin 80 covers the tallest critter sprite
          // above the feet anchor (deer dh = 41 * 36/24 = 61.5 world units).
          if (c.x < cam.x - vhw - 50 || c.x > cam.x + vhw + 50 || c.y < cam.y - vhh - 50 || c.y > cam.y + vhh + 80) continue;
          const sx = c.x, sy = c.y;
          // BUILD 701: fixed world-unit size. This draw runs under
          // g.scale(zm, zm), so a zoom-multiplied size here scaled TWICE
          // (36*zm world units -> 36*zm^2 screen px): critters shrank to
          // near-invisible dots when zooming out and ballooned past the
          // player sprite when zooming in. Fixed 36 world units scales
          // with the world exactly like characters and buildings.
          const s = 36;
          const depth = dep(gx, gy);
          // Sprite dimensions per kind (strips animate, wolf is a single image)
          let frameW = 32, frameH = 41, isStrip = true;
          if (kind === 'direwolf') { frameW = 32; frameH = 32; isStrip = false; }
          else if (kind === 'boar') { frameW = 41; frameH = 25; }
          else if (kind === 'badger') { frameW = 33; frameH = 32; }
          const frameCount = isStrip ? Math.max(1, Math.floor(img.naturalWidth / frameW)) : 1;
          const frameIdx = isStrip ? Math.floor(nowMs / 150) % frameCount : 0;
          if (live.selectedGoatId === goat.id) {
            drawables.push({
              depth: depth - 0.025,
              draw: (g: CanvasRenderingContext2D) => {
                g.save();
                g.strokeStyle = '#ffd34d';
                g.fillStyle = 'rgba(255, 197, 45, 0.16)';
                g.lineWidth = 2.5;
                g.beginPath(); g.ellipse(sx, sy - 2, 22, 8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
                g.restore();
              },
            });
          }
          drawables.push({
            depth,
            draw: (g: CanvasRenderingContext2D) => {
              // shadow
              g.fillStyle = 'rgba(0,0,0,0.25)';
              g.beginPath(); g.ellipse(sx, sy, s * 0.6, s * 0.15, 0, 0, Math.PI * 2); g.fill();
              // critter sprite (feet-anchored)
              // BUILD 698: goats draw the pre-tinted strip (tint baked once
              // at load by goatTintedImg) — no more white fillRect over the
              // bounding box, which read as a broken white rectangle.
              const dimg: HTMLImageElement | HTMLCanvasElement =
                kind === 'goat' ? (goatTintedImg() ?? img) : img;
              const dw = frameW * (s / 24), dh = frameH * (s / 24);
              if (isStrip) {
                g.drawImage(dimg, frameIdx * frameW, 0, frameW, frameH, sx - dw / 2, sy - dh, dw, dh);
              } else {
                g.drawImage(dimg, sx - dw / 2, sy - dh, dw, dh);
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
                // BUILD 698: white tint is pre-baked into the goat sprite at
                // load (goatTintedImg) — the old per-frame fillRect over the
                // whole bounding box is gone.
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
      // BUILD 720: full monster sheets are rendered in the iso scene and share the same target lock as combat.
      // BUILD 742: hard-block hostile entities at render time in the starter settlement.
      // This also hides stale/cached monster state and malformed sprites that can
      // survive the spawn filter and appear as skeletons or invisible humanoids.
      const liveMonsters = liveMonstersForActiveChunk(live.monsters, chunk);
      const monsterImgs = (window as unknown as { __isoMonsterImgs?: Record<string, HTMLImageElement> }).__isoMonsterImgs || {};
      for (const monster of liveMonsters) {
        const def = isoMonsterDef(monster.kind);
        if (!def) {
          // Legacy monster kinds still need a visible, targetable iso presence.
          const c = isoToScreen(monster.position.x, monster.position.y);
          const mx = monster.position.x, my = monster.position.y;
          const selected = live.selectedMonsterId === monster.id;
          const tone = monster.kind === 'dragon' ? '#5f9b43' : monster.kind === 'snake' ? '#6d9142' : monster.kind === 'soldier' ? '#8a9ba8' : '#8b6349';
          drawables.push({ depth: dep(mx, my) - (selected ? 0.03 : 0), draw: (g) => {
            g.save();
            g.fillStyle = 'rgba(0,0,0,0.24)'; g.beginPath(); g.ellipse(c.x, c.y + 2, 13, 4, 0, 0, Math.PI * 2); g.fill();
            if (selected) { g.strokeStyle = '#ffd34d'; g.fillStyle = 'rgba(255,197,45,0.16)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(c.x, c.y - 2, 22, 8, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
            g.fillStyle = tone; g.beginPath(); g.ellipse(c.x, c.y - 13, monster.kind === 'dragon' ? 14 : 9, monster.kind === 'dragon' ? 9 : 12, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#d8c7aa'; g.beginPath(); g.arc(c.x, c.y - 23, monster.kind === 'dragon' ? 7 : 6, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#c83232'; g.beginPath(); g.arc(c.x - 2, c.y - 24, 1.2, 0, Math.PI * 2); g.arc(c.x + 2, c.y - 24, 1.2, 0, Math.PI * 2); g.fill();
            if (monster.hp < monster.maxHp && monster.disposition !== 'defeated') { g.fillStyle = '#271b1b'; g.fillRect(c.x - 13, c.y - 34, 26, 3); g.fillStyle = '#e34b4b'; g.fillRect(c.x - 13, c.y - 34, 26 * Math.max(0, monster.hp / Math.max(1, monster.maxHp)), 3); }
            g.restore();
          } });
          continue;
        }
        let img = monsterImgs[def.spriteSheet];
        if (!img) { img = new Image(); img.src = artUrl(def.spriteSheet.replace(/^\/+/, '')); monsterImgs[def.spriteSheet] = img; }
        if (!img.complete || img.naturalWidth === 0) continue;
        const mx = monster.position.x, my = monster.position.y;
        const c = isoToScreen(mx, my);
        const vhw = (wpx / 2) / zm, vhh = (hpx / 2) / zm;
        if (c.x < cam.x - vhw - 48 || c.x > cam.x + vhw + 48 || c.y < cam.y - vhh - 80 || c.y > cam.y + vhh + 36) continue;
        const anim: MonsterAnim = animForMonsterState({ dead: monster.disposition === 'defeated', hitFlash: !!monster.hitFlash, attacking: !!monster.attacking, moving: !!monster.moving });
        const animDef = def.animations[anim];
        const col = monsterAnimFrameFor(def, anim, nowMs, monster.id);
        const row = animDef.row === 'facing' ? (def.facingRows[rotateFace8(monster.facing as Face8, rotationRef.current)] ?? def.facingRows.down) : animDef.row;
        const size = def.displaySize * (def.variants[monster.variant || 'default']?.scale ?? 1);
        const left = c.x - size * def.anchor.x, top = c.y - size * def.anchor.y;
        const isSelected = live.selectedMonsterId === monster.id;
        if (isSelected) {
          drawables.push({ depth: dep(mx, my) - 0.03, draw: (g) => { g.save(); g.strokeStyle = '#ffd34d'; g.fillStyle = 'rgba(255, 197, 45, 0.16)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(c.x, c.y - 2, 22, 8, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); } });
        }
        drawables.push({ depth: dep(mx, my), draw: (g) => {
          g.save();
          const variantFilter = def.variants[monster.variant || 'default']?.filter;
          if (variantFilter) g.filter = variantFilter;
          g.globalAlpha = monster.disposition === 'defeated' ? 0.55 : 1;
          g.fillStyle = `rgba(0,0,0,${def.shadow.alpha})`; g.beginPath(); g.ellipse(c.x + def.shadow.dx, c.y + def.shadow.dy, size * 0.28, size * 0.09, 0, 0, Math.PI * 2); g.fill();
          g.drawImage(img, col * def.cell, row * def.cell, def.cell, def.cell, left, top, size, size);
          g.filter = 'none'; g.globalAlpha = 1;
          if (monster.hp < monster.maxHp && monster.disposition !== 'defeated') {
            const bw = 26, bh = 3; g.fillStyle = 'rgba(20,10,10,0.8)'; g.fillRect(c.x - bw / 2, top - 5, bw, bh); g.fillStyle = '#e34b4b'; g.fillRect(c.x - bw / 2, top - 5, bw * Math.max(0, monster.hp / Math.max(1, monster.maxHp)), bh);
          }
          g.restore();
        } });
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
          const s = 36; // BUILD 701: world units (see critter draw above)
          const w = box.hw * 2 * (s / 24);
          const h = box.hh * 2 * (s / 24);
          drawables.push({
            depth: dep(gx, gy) + 0.01,
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
          const s = 36; // BUILD 701: world units (see critter draw above)
          const w = gb.hw * 2 * (s / 24);
          const h = gb.hh * 2 * (s / 24);
          drawables.push({
            depth: dep(gx, gy) + 0.02,
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
      // BUILD 912: horses in the depth-sorted entity pass — the analytic
      // world horses (src/game/horses.ts) with their riders/leaders/cart
      // drivers, plus the player's parked horse. (The mounted case draws
      // under the player just below.)
      {
        const seenHorses = new Set<string>();
        for (const h of live.worldHorses || []) {
          seenHorses.add(h.id);
          // Interpolate between clock samples (same pattern as npcInterp,
          // longer clamp: horse samples arrive per world-clock tick and a
          // ridden horse covers real distance between them). BUILD 925:
          // the clamp is the full 3000 ms tick interval, so rendered speed
          // equals analytic speed — the old 2500 ms cap compressed every
          // segment by 1.2x on top of the analytic jumps.
          let hx = h.position.x, hy = h.position.y;
          let hMoving = false;
          const prev = horseInterp.get(h.id);
          if (!prev || prev.cx !== h.position.x || prev.cy !== h.position.y) {
            const jumped = prev && Math.hypot(h.position.x - prev.cx, h.position.y - prev.cy) > 60;
            hx = prev && !jumped ? prev.cx : h.position.x;
            hy = prev && !jumped ? prev.cy : h.position.y;
            const observedTick = prev ? nowMs - prev.t : 900;
            const duration = jumped ? 0 : Math.max(200, Math.min(3000, observedTick));
            horseInterp.set(h.id, { px: hx, py: hy, cx: h.position.x, cy: h.position.y, t: nowMs, duration });
          } else {
            const k = prev.duration === 0 ? 1 : Math.min(1, Math.max(0, (nowMs - prev.t) / prev.duration));
            hx = prev.px + (prev.cx - prev.px) * k;
            hy = prev.py + (prev.cy - prev.py) * k;
            hMoving = k < 1 && Math.hypot(prev.cx - prev.px, prev.cy - prev.py) > 0.05;
          }
          // Facing from the current travel segment; hold the last facing
          // when standing (stabled/grazing horses keep their orientation).
          const seg = horseInterp.get(h.id);
          const segFace = seg ? horseFace8ForDelta(seg.cx - seg.px, seg.cy - seg.py) : null;
          if (segFace) horseFace.set(h.id, segFace);
          const face = horseFace.get(h.id) ?? 'down';
          const hc = isoToScreen(hx, hy);
          if (!anchorVisible(hc, 90, 90, 30)) continue;
          const coat = horseCoat(h.color);
          const poseFlip = horsePoseForFace(rotateFace8(face, rotationRef.current));
          const phase = (nowMs / 1000) * 9;
          const activity = h.activity;
          const fv = horseFacingVector(face);
          if (activity === 'hauling') {
            // Cart trails behind the horse along its facing; the driver
            // sits on the cart bench (drawPerson with the cart lift).
            const cartX = hx - fv.x * HORSE_CART_TRAIL, cartY = hy - fv.y * HORSE_CART_TRAIL;
            const cc = isoToScreen(cartX, cartY);
            drawables.push({
              depth: dep(cartX, cartY) + 0.006,
              draw: (g2) => { drawIsoCart(g2, cc.x, cc.y, { pose: poseFlip.pose, flip: poseFlip.flip, moving: hMoving, phase, nowMs }); },
            });
            drawables.push({
              depth: dep(hx, hy) + 0.008,
              draw: (g2) => { drawIsoHorse(g2, hc.x, hc.y, { coat, pose: poseFlip.pose, flip: poseFlip.flip, moving: hMoving, phase, nowMs, saddle: false }); },
            });
            drawPerson(drawables, cartX, cartY, face, hMoving, h.id, nowMs, 'driver-' + h.id,
              undefined, false, false, HORSE_CART_SEAT_LIFT);
          } else if (activity === 'ridden') {
            drawables.push({
              depth: dep(hx, hy) + 0.008,
              draw: (g2) => { drawIsoHorse(g2, hc.x, hc.y, { coat, pose: poseFlip.pose, flip: poseFlip.flip, moving: hMoving, phase, nowMs, saddle: true }); },
            });
            // The owner rides: a real character (deterministic look from
            // the horse id) seated on the back via the seat lift.
            drawPerson(drawables, hx, hy, face, hMoving, h.id, nowMs, 'rider-' + h.id,
              undefined, false, false, HORSE_SEAT_LIFT);
          } else {
            drawables.push({
              depth: dep(hx, hy) + 0.008,
              draw: (g2) => { drawIsoHorse(g2, hc.x, hc.y, { coat, pose: poseFlip.pose, flip: poseFlip.flip, moving: hMoving, phase, nowMs, saddle: false }); },
            });
            if (activity === 'being_led') {
              // The owner walks at the horse's head, leading it.
              const leadX = hx + fv.x * 6.5, leadY = hy + fv.y * 6.5;
              drawPerson(drawables, leadX, leadY, face, hMoving, h.id, nowMs, 'leader-' + h.id,
                undefined, false, false, 0);
            }
          }
        }
        for (const k of horseInterp.keys()) if (!seenHorses.has(k)) { horseInterp.delete(k); horseFace.delete(k); }

        // The player's own horse, parked in this chunk: saddled, idle.
        const parked = live.playerMounted ? null : live.playerHorse;
        if (parked) {
          const pc = isoToScreen(parked.position.x, parked.position.y);
          if (anchorVisible(pc, 90, 90, 30)) {
            const poseFlip = horsePoseForFace(rotateFace8(parked.facing as Face8, rotationRef.current));
            drawables.push({
              depth: dep(parked.position.x, parked.position.y) + 0.008,
              draw: (g2) => {
                drawIsoHorse(g2, pc.x, pc.y, {
                  coat: horseCoat('bay'), pose: poseFlip.pose, flip: poseFlip.flip,
                  moving: false, phase: 0, nowMs, saddle: true,
                });
              },
            });
          }
        }
        // Mounted: the horse under the (already interpolated) player,
        // facing and gait tied to the player's own movement.
        if (live.playerMounted) {
          const mc = isoToScreen(playerX, playerY);
          const poseFlip = horsePoseForFace(rotateFace8(playerFace.f, rotationRef.current));
          const phase = (nowMs / 1000) * 10.5;
          drawables.push({
            depth: dep(playerX, playerY) + 0.009,
            draw: (g2) => {
              drawIsoHorse(g2, mc.x, mc.y, {
                coat: horseCoat('bay'), pose: poseFlip.pose, flip: poseFlip.flip,
                moving: playerMoving, phase, nowMs, saddle: true,
              });
            },
          });
        }
      }
      // player — BUILD 427: depth-sorted with the world instead of layered
      // on top. When the player is behind a house (smaller x+y than the
      // house's front corner), the house draws over them; when in front,
      // the player draws over the house.
      // BUILD 912: when mounted, the player is lifted onto the horse drawn
      // above (seat lift, no own ground shadow).
      drawPerson(drawables, playerX, playerY, playerFace.f, playerMoving, live.playerLook ?? 0, nowMs, 'player',
        undefined, live.playerRunning === true, false, live.playerMounted ? HORSE_SEAT_LIFT : 0, undefined,
        // BUILD 933: the sneaking player draws dimmed; everyone else is full opacity.
        live.playerSneaking ? SNEAK_PLAYER_OPACITY : undefined);
      for (const k of charAnims.keys()) if (!seenAnims.has(k)) charAnims.delete(k);
      // BUILD 707: prune interpolation entries for NPCs no longer drawn.
      for (const k of npcInterp.keys()) if (!seenAnims.has(k)) npcInterp.delete(k);

      drawables.sort((a, b) => a.depth - b.depth);
      for (const d of drawables) d.draw(g, nowMs);

      // BUILD 851: Asset Studio placements must be drawn by the actual world
      // renderer, not just stored in localStorage/editor lists. Coordinates are
      // chunk-local field units, matching tapToField() and the player's position.
      {
        const activeChunkKey = liveRef.current.chunk.x + ',' + liveRef.current.chunk.y;
        const assets = (liveRef.current.placedAssets || [])
          .filter((asset) => asset.visible !== false && asset.chunk === activeChunkKey)
          .slice()
          .sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0) || (rotationRef.current === 0 ? a.y - b.y : dep(a.x, a.y) - dep(b.x, b.y)));
        for (const asset of assets) {
          if (!Number.isFinite(asset.x) || !Number.isFinite(asset.y)) continue;
          const image = placedAssetImage(asset.src);
          if (!image.complete || image.naturalWidth <= 0) continue;
          const p = isoToScreen(asset.x, asset.y);
          const width = Math.max(1, (asset.width || image.naturalWidth) * Math.max(0.1, asset.scale || 1));
          const height = Math.max(1, (asset.height || image.naturalHeight) * Math.max(0.1, asset.scale || 1));
          g.save();
          g.translate(p.x, p.y);
          g.rotate(((asset.rotation || 0) * Math.PI) / 180);
          g.scale(asset.flipX ? -1 : 1, asset.flipY ? -1 : 1);
          g.imageSmoothingEnabled = false;
          g.drawImage(image, -width / 2, -height, width, height);
          g.restore();
        }
      }

      // BUILD 852: draw houses stamped by the editor; the 2D DOM layer is hidden under the iso canvas.
      {
        const activeChunkKey = liveRef.current.chunk.x + ',' + liveRef.current.chunk.y;
        const houseImage = placedAssetImage(sharedHouseSpriteUrl);
        if (houseImage.complete && houseImage.naturalWidth > 0) {
          const houses = (liveRef.current.editorPlacedObjects || []).filter((o) => o.kind === 'house' && o.chunk === activeChunkKey).slice().sort((a, b) => rotationRef.current === 0 ? a.y - b.y : dep(a.x, a.y) - dep(b.x, b.y));
          for (const house of houses) {
            if (!Number.isFinite(house.x) || !Number.isFinite(house.y)) continue;
            const p = isoToScreen(house.x, house.y);
            const width = 180;
            const height = width * houseImage.naturalHeight / Math.max(1, houseImage.naturalWidth);
            g.save();
            g.imageSmoothingEnabled = false;
            g.drawImage(houseImage, p.x - width / 2, p.y - height, width, height);
            g.restore();
          }
        }
      }

      // BUILD 684: floating combat text in iso (damage numbers were 2D-DOM
      // only). World-space, floats up and fades over ~0.9s (matches the
      // 2D lifetime). Drawn last so it sits above the world.
      {
        const texts = liveRef.current.damageTexts || [];
        const seen = dmgSeenRef.current;
        activeDamageIds.clear();
        for (const t of texts) {
          activeDamageIds.add(t.id);
          if (!seen.has(t.id)) seen.set(t.id, nowMs);
        }
        for (const id of seen.keys()) {
          if (!activeDamageIds.has(id)) seen.delete(id);
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

      // Adaptive quality governor: reduce tree detail first, then lower
      // pixel fill cost if the renderer remains over budget. Restore gradually
      // only after sustained headroom to avoid visible quality oscillation.
      const renderCostMs = performance.now() - frameStartedAt;
      renderCostEma += (renderCostMs - renderCostEma) * 0.12;
      if (++qualityProbeFrames >= 30) {
        if (renderCostEma > 18) {
          adaptiveTreeLod = true;
          if (adaptiveResolutionScale === 1 && nowMs - adaptiveResolutionLastChange > 1500) {
            adaptiveResolutionScale = window.innerWidth < 900 ? 0.82 : 0.9;
            adaptiveResolutionLastChange = nowMs;
            resize();
          }
        } else if (renderCostEma < 11) {
          adaptiveTreeLod = false;
          if (adaptiveResolutionScale < 1 && nowMs - adaptiveResolutionLastChange > 5000) {
            adaptiveResolutionScale = 1;
            adaptiveResolutionLastChange = nowMs;
            resize();
          }
        }
        qualityProbeFrames = 0;
      }
      // BUILD 716: measure actual renderer work and expose a compact on-canvas
      // readout for repeatable A/B profiling in crowded scenes.
      if (frameMetrics) {
        frameMetrics.record(renderCostMs);
        if (++perfOverlayTick % 30 === 0) {
          const m = frameMetrics.snapshot();
          g.save();
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.fillStyle = 'rgba(0,0,0,0.78)';
          g.fillRect(8, 8, 196, 58);
          g.font = '12px monospace';
          g.textAlign = 'left';
          g.fillStyle = '#9fffb2';
          g.fillText(`Render avg: ${m.averageMs.toFixed(1)} ms`, 16, 25);
          g.fillText(`P95: ${m.p95Ms.toFixed(1)} ms`, 16, 42);
          g.fillText(`FPS est.: ${m.estimatedFps.toFixed(0)}`, 16, 59);
          g.restore();
        }
      }
    };
    gameLoop = startBrowserGameLoop({
      maxDeltaMs: 50,
      onFrame: (nowMs, deltaMs) => {
        // Keep the renderer's established timing behavior while the browser
        // engine owns RAF scheduling and hidden-tab lifecycle.
        last = nowMs - deltaMs;
        frame(nowMs);
      },
    });

    // BUILD 366: tap-to-move + tap-to-talk. Hit-test NPCs first (screen
    // distance), then doors (walk to the doorway — the game loop's existing
    // doorway check fires entry), else walk to the tapped field point.
    const onTap = (e: PointerEvent) => {
      const { onTapMove: tapMove, onTalkTo: talk } = tapRef.current;
      if (!tapMove && !talk && !tapRef.current.onShopStall) return;
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
      // BUILD 719: chat is a separate affordance. It exists only for the
      // selected NPC and only when the player is within interaction range.
      const selectedNpc = liveRef.current.folk.find((npc) => npc.id === liveRef.current.selectedNpcId && !npc.indoors);
      const selectedNpcHasBeenAttacked = !!selectedNpc && (selectedNpc.hp != null || selectedNpc.fleeUntilTick != null || selectedNpc.deadUntilTick != null);
      if (selectedNpc && !selectedNpcHasBeenAttacked && talk && Math.hypot(selectedNpc.position.x - liveRef.current.px, selectedNpc.position.y - liveRef.current.py) <= 8.5) {
        const w = isoToScreen(selectedNpc.position.x, selectedNpc.position.y);
        const bx = (w.x - cam.x) * zm + wpx / 2;
        const by = (w.y - cam.y) * zm + hpx / 2 - 58 * zm;
        if (Math.hypot(bx - sx, by - sy) <= 25) { talk(selectedNpc); return; }
      }
      // BUILD 899: NPC body taps. Tapping a near, already-targeted NPC talks
      // directly (tap-to-talk). Far or untargeted NPCs keep select/deselect
      // and the existing follow system.
      const { onSelectNpc: selectNpc, onSelectGoat: selectGoat } = tapRef.current;
      let bestNpc: Townsperson | null = null; let bestNpcD = 34;
      for (const npc of liveRef.current.folk) {
        if (npc.indoors) continue;
        // BUILD 912: dead townsfolk are corpses, not selectable actors
        // (BUILD 732) — their taps belong to the lootable-body test below.
        // Before this, tapping a body selected/deselected the dead NPC and
        // the loot branch was unreachable under the corpse.
        if (npc.deadUntilTick != null || (npc.hp != null && npc.hp <= 0)) continue;
        const w = isoToScreen(npc.position.x, npc.position.y);
        const px = (w.x - cam.x) * zm + wpx / 2;
        const py = (w.y - cam.y) * zm + hpx / 2 - 24;
        const d = Math.hypot(px - sx, py - sy);
        if (d < bestNpcD) { bestNpcD = d; bestNpc = npc; }
      }
      if (bestNpc && selectNpc) {
        const alreadySelected = liveRef.current.selectedNpcId === bestNpc.id;
        const nearEnough = Math.hypot(bestNpc.position.x - liveRef.current.px, bestNpc.position.y - liveRef.current.py) <= 8.5;
        // Same exclusions as the BUILD 719/724 chat affordance: dead, hurt,
        // or fleeing townsfolk never trigger dialogue on tap.
        const talkable = bestNpc.hp == null && bestNpc.fleeUntilTick == null && bestNpc.deadUntilTick == null;
        if (alreadySelected && nearEnough && talkable && talk) { talk(bestNpc); return; }
        selectNpc(alreadySelected ? null : bestNpc);
        return;
      }
      // Hostile critters can be targeted directly in the isometric view.
      let bestEnemy: NonNullable<typeof liveRef.current.goats>[number] | null = null;
      let bestEnemyD = 36;
      for (const goat of liveRef.current.goats || []) {
        if (goat.disposition !== 'aggressive') continue;
        const w = isoToScreen(goat.position.x, goat.position.y);
        const px = (w.x - cam.x) * zm + wpx / 2;
        const py = (w.y - cam.y) * zm + hpx / 2;
        const d = Math.hypot(px - sx, py - sy);
        if (d < bestEnemyD) { bestEnemyD = d; bestEnemy = goat; }
      }
      if (bestEnemy && selectGoat) {
        selectGoat(liveRef.current.selectedGoatId === bestEnemy.id ? null : bestEnemy);
        return;
      }
      // Hostile monster sheets share the same tap-to-target and clear-on-repeat behavior.
      const { onSelectMonster: selectMonster } = tapRef.current;
      let bestMonster: IsoMonster | null = null; let bestMonsterD = 38;
      for (const monster of liveMonstersForActiveChunk(liveRef.current.monsters, liveRef.current.chunk)) {
        if (monster.disposition === 'defeated' || monster.hp <= 0) continue;
        const w = isoToScreen(monster.position.x, monster.position.y);
        const px = (w.x - cam.x) * zm + wpx / 2;
        const py = (w.y - cam.y) * zm + hpx / 2 - 18;
        const d = Math.hypot(px - sx, py - sy);
        if (d < bestMonsterD) { bestMonsterD = d; bestMonster = monster; }
      }
      if (bestMonster && selectMonster) {
        selectMonster(liveRef.current.selectedMonsterId === bestMonster.id ? null : bestMonster);
        return;
      }
      // Empty-field taps release entity lock before movement or world interactions.
      tapRef.current.onSelectNpc?.(null);
      tapRef.current.onSelectGoat?.(null);
      tapRef.current.onSelectMonster?.(null);
      // BUILD 912: corpse hit test runs BEFORE stalls/rocks/doors. A body is
      // the most salient tap target in its radius (64px); previously the
      // static-scenery tests (tutorial boulder 44px, doors 40px) ate taps
      // meant for a corpse lying near them and the loot window never opened.
      // BUILD 731 semantics kept: walk to a far body, tap again in range to loot.
      if (tapMove) {
        const bodies = liveRef.current.lootableBodies || [];
        const { onLootBody: lootBodyAt } = tapRef.current;
        let bestBody: { id: string; npcName: string; position: Point } | null = null; let bestBodyD = 64;
        for (const body of bodies) {
          const w = isoToScreen(body.position.x, body.position.y);
          const bxScreen = (w.x - cam.x) * zm + wpx / 2;
          const byScreen = (w.y - cam.y) * zm + hpx / 2;
          const d = Math.hypot(bxScreen - sx, byScreen - sy);
          if (d < bestBodyD) { bestBodyD = d; bestBody = body; }
        }
        if (bestBody && lootBodyAt) {
          const player = liveRef.current;
          const dist = Math.hypot(bestBody.position.x - player.px, bestBody.position.y - player.py);
          if (dist <= 16) { lootBodyAt(bestBody); return; }
          tapMove({ x: bestBody.position.x, y: bestBody.position.y }); return;
        }
      }
      // BUILD 721: stall hit test — only taps directly on the stall open its shop.
      // Keep the touch target tight so nearby paths, props, and open ground
      // remain normal movement targets. NPC hit-testing still takes priority.
      {
        const { onShopStall: shop } = tapRef.current;
        if (shop) {
          let bestStall = -1; let bestSD = 22;
          const stalls = stallsRef.current;
          for (let i = 0; i < stalls.length; i++) {
            const w = isoToScreen(stalls[i].x, stalls[i].y);
            const px = (w.x - cam.x) * zm + wpx / 2;
            const py = (w.y - cam.y) * zm + hpx / 2 - 24; // sprite center-ish
            const d = Math.hypot(px - sx, py - sy);
            if (d < bestSD) { bestSD = d; bestStall = i; }
          }
          if (bestStall >= 0) { shop(bestStall); return; }
        }
      }
      // BUILD 738: rocks are direct interaction targets. Tapping one starts an
      // approach-and-mine action instead of sending the player past the rock.
      {
        const mine = tapRef.current.onTapMine;
        if (mine) {
          let bestOre: FieldOre | null = null;
          let bestOreD = 38;
          for (const sc of scenes) {
            for (const ore of sc.ores) {
              if (ore.id !== 'tutorial-stone-deposit-4-7') continue;
              const depleted = (window as unknown as { __depletedOres?: Set<string> }).__depletedOres;
              if (depleted?.has(ore.id)) continue;
              const p = isoToScreen(ore.fx + sc.ox * N, ore.fy + sc.oy * N);
              const px = (p.x - cam.x) * zm + wpx / 2;
              const py = (p.y - cam.y) * zm + hpx / 2;
              const d = Math.hypot(px - sx, py - sy);
              const hitRadius = ore.id === 'tutorial-stone-deposit-4-7' ? 44 : 25;
              if (d < Math.min(bestOreD, hitRadius)) { bestOreD = d; bestOre = ore; }
            }
          }
          if (bestOre) { mine(bestOre); return; }
        }
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
        const uw = unrotateIsoScreen(wx, wy, rotationRef.current);
        const t = screenToTile(uw.x, uw.y);
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
      const uw = unrotateIsoScreen(wx, wy, rotationRef.current);
      const t = screenToTile(uw.x, uw.y);
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
    return () => { gameLoop?.stop(); window.removeEventListener('resize', resize); canvas.removeEventListener('pointerdown', onTap); canvas.removeEventListener('pointerdown', onHoldStart); canvas.removeEventListener('pointermove', onHoldMove); canvas.removeEventListener('pointerup', onHoldEnd); canvas.removeEventListener('pointercancel', onHoldEnd); };
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
      <canvas ref={canvasRef} data-testid="iso-field-canvas" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      {/* BUILD 372: zoom is driven by the main black zoom buttons (App), so the
          duplicate in-canvas zoom controls were removed. */}
      {/* BUILD 821: removed the 2.5D BETA label from the main game screen. */}
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