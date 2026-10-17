// Isometric interiors for the 2.5D world (BUILD 366).
//
// Renders enterable building interiors in iso projection: wooden/stone floors,
// back walls with windows, a door gap, and per-room-type furniture (beds,
// tables, bar counters, forges, altars, barrels...) drawn as depth-sorted iso
// boxes. The player tap-to-moves inside; NPCs already INTERIOR are shown.
//
// Room types mirror the 2D InteriorRoom: guild | inn | chapel | building |
// tavern | cellar | prison. Layouts are deterministic per room id.
import React, { useEffect, useRef, useState } from 'react';
import {
  isoToScreen, screenToTileInt, depthKey, findPath, TILE_W, TILE_H,
  type TilePoint,
} from './projection';
import {
  isoPlayerFaceForScreenDeltaSticky,
  type Face4, type Face8,
} from './isoSprites';
// BUILD 674: Per-house interior layouts.
// BUILD 675: House-type mapping for resident archetypes.
import { generateInteriorLayout, type HouseType } from '../interiors';
import { houseTypeForBuilding } from '../houseTypes';
import { CharacterAnimator, drawIsoCharacter, preloadCharacterSprites, type LookRef } from './characterSystem';
import {
  preloadDungeonKit, dungeonKitReady,
  drawWallPanel, drawKitBillboard, drawKitFloor,
  wallPanelFor, floorPanelFor, torchPanelFor, pillarPanelFor, chestPanelFor,
} from './dungeonKit';

export type IsoRoomType = 'guild' | 'inn' | 'chapel' | 'building' | 'tavern' | 'cellar' | 'prison';

export interface IsoInteriorNpc {
  id: string;
  name: string;
  tx: number; ty: number;
  facing: Face4;
  look: LookRef;
}

// BUILD 430: items lying on the floor (e.g. the tutorial-house sword).
export interface IsoGroundItem {
  id: string;
  tx: number; ty: number;
  sprite: string; // asset path under public/
  label: string;
}

const groundItemImgs = new Map<string, HTMLImageElement>();
function groundItemImg(sprite: string): HTMLImageElement | undefined {
  let img = groundItemImgs.get(sprite);
  if (!img) {
    img = new Image();
    img.onerror = () => console.warn(`[iso-interior] failed to load ${sprite}`);
    // BUILD 430 fix: respect Vite base URL (GitHub Pages serves from /Adventure-game-/).
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const path = sprite.startsWith('/') ? sprite.slice(1) : sprite;
    img.src = `${base}${path}`;
    groundItemImgs.set(sprite, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : undefined;
}

// BUILD 591: Rat sprite sheet (public/mobs/rat_sheet.png).
// 512x320, 8x5 grid of 64x64 frames. Row 0: facing forward idle, Row 1-2: side walking.
let ratSpriteImg: HTMLImageElement | null = null;
function ratSprite(): HTMLImageElement | undefined {
  if (!ratSpriteImg) {
    ratSpriteImg = new Image();
    ratSpriteImg.onerror = () => console.warn('[iso-interior] failed to load rat sprite');
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    ratSpriteImg.src = `${base}mobs/rat_sheet.png`;
  }
  return ratSpriteImg.complete && ratSpriteImg.naturalWidth > 0 ? ratSpriteImg : undefined;
}

// BUILD 777: authored starting-house room diorama.
let starterHouseSceneImg: HTMLImageElement | null = null;
function starterHouseScene(): HTMLImageElement | undefined {
  if (!starterHouseSceneImg) {
    starterHouseSceneImg = new Image();
    starterHouseSceneImg.onerror = () => console.warn('[iso-interior] failed to load starting-house interior art');
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    starterHouseSceneImg.src = `${base}assets/starting-house/interior.jpeg`;
  }
  return starterHouseSceneImg.complete && starterHouseSceneImg.naturalWidth > 0 ? starterHouseSceneImg : undefined;
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
  // BUILD 720: use the same RPG paper-doll appearance as the outdoor player.
  playerLook?: LookRef;
  // BUILD 390: barbarian player equipment (player is look 0).
  // BUILD 702: deprecated (RPG sprite system) — kept for App.tsx compat, ignored.
  barbOutfit?: unknown;
  barbWeapon?: unknown;
  barbHair?: string;
  // Same one-shot attack sequence used by the outdoor RPG sprite renderer.
  barbAttackSequence?: number;
  // BUILD 422: debug direction test — when set, the player shows this facing's
  // sprite sheet with the walk cycle playing, ignoring movement deltas.
  debugFacing?: Face8 | null;
  // BUILD 430: items on the floor. Tapping one calls onPickupItem.
  groundItems?: IsoGroundItem[];
  onPickupItem?: (id: string) => void;
  // BUILD 565: cellar rats. Tapping one calls onStrikeRat.
  rats?: { id: number; tx: number; ty: number; hp: number; maxHp: number }[];
  onStrikeRat?: (id: number) => void;
  // BUILD 569: sync iso player position to App for combat calculations
  onPlayerMove?: (tx: number, ty: number) => void;
  // BUILD 704: player run state from App's stamina system. Running shortens
  // the tile step (faster movement) and selects the run animation.
  playerRunning?: boolean;
}

// BUILD 764: larger walkable floorplans; door, movement bounds, rendering,
// and pathfinding all derive from these shared room dimensions.
const ROOM_W = 14;
const ROOM_H = 12;
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
function furnitureFor(roomType: IsoRoomType, roomId?: string): Furniture[] {
  // BUILD 674: Per-house variation for generic buildings.
  // BUILD 675: House type based on resident archetype.
  // Uses the interior layout system for deterministic per-building furniture.
  if (roomType === 'building' && roomId) {
    const houseType = houseTypeForBuilding(roomId);
    const layout = generateInteriorLayout(roomId, houseType, ROOM_W, ROOM_H);
    // Convert to iso Furniture format.
    return layout.furniture.map((f) => ({
      kind: f.kind,
      tx: f.tx, ty: f.ty, w: f.w, h: f.h,
      solid: f.solid,
    }));
  }
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

function faceForMove(ax: number, ay: number, bx: number, by: number, current: Face8): Face8 {
  // BUILD 407: screen-space facing, same as the iso field outside. The tile
  // delta is projected to true screen space (2:1 dimetric) and the dominant
  // screen axis picks the art, so screen up-right/up-left travel shows the
  // right/left sprite instead of the back sprite.
  // BUILD 414: the northward diagonal bands now resolve to the dedicated
  // up-right/up-left art, same as the field.
  return isoPlayerFaceForScreenDeltaSticky(bx - ax, by - ay, current);
}

export default function IsoInteriorView({ roomId, roomType, npcs, onExit, onTalkTo, getHeldDir, playerLook, barbOutfit, barbWeapon, barbHair, barbAttackSequence, debugFacing, groundItems, onPickupItem, rats, onStrikeRat, onPlayerMove, playerRunning }: IsoInteriorViewProps): React.JSX.Element {
  // BUILD 784: restore the original Build 777 room-image framing; keep the camera fixed.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attackSequenceRef = useRef(barbAttackSequence ?? 0);
  attackSequenceRef.current = barbAttackSequence ?? 0;
  // BUILD 565: expose tile->screen for test automation (localhost only)
  const toScreenRef = useRef<((tx: number, ty: number) => { x: number; y: number }) | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const talkRef = useRef(onTalkTo);
  talkRef.current = onTalkTo;
  const npcsRef = useRef(npcs);
  npcsRef.current = npcs;
  const groundItemsRef = useRef(groundItems ?? []);
  groundItemsRef.current = groundItems ?? [];
  const pickupRef = useRef(onPickupItem);
  pickupRef.current = onPickupItem;
  // BUILD 565: rats
  const ratsRef = useRef(rats ?? []);
  ratsRef.current = rats ?? [];
  const strikeRatRef = useRef(onStrikeRat);
  strikeRatRef.current = onStrikeRat;
  const playerMoveRef = useRef(onPlayerMove);
  playerMoveRef.current = onPlayerMove;
  const heldDirRef = useRef(getHeldDir);
  heldDirRef.current = getHeldDir;
  // BUILD 704: run state ref so the frame loop sees fresh values.
  const playerRunningRef = useRef(playerRunning);
  playerRunningRef.current = playerRunning;

  useEffect(() => { preloadCharacterSprites(); preloadDungeonKit(); }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // BUILD 776: the starting house is a bespoke, cozy first-home layout rather than a random cottage template.
    const isStarterHouse = roomId === 'tutorial-house';
    const furn: Furniture[] = isStarterHouse ? [
      { kind: 'rug', tx: 4, ty: 5, w: 4, h: 3, solid: false },
      { kind: 'bed', tx: 1, ty: 1, w: 2, h: 1, solid: true },
      { kind: 'shelf', tx: 4, ty: 1, w: 2, h: 1, solid: true },
      { kind: 'table', tx: 5, ty: 5, w: 2, h: 1, solid: true },
      { kind: 'chair', tx: 4, ty: 6, w: 1, h: 1, solid: true },
      { kind: 'chair', tx: 7, ty: 6, w: 1, h: 1, solid: true },
      { kind: 'fireplace', tx: 11, ty: 5, w: 1, h: 2, solid: true },
      { kind: 'shelf', tx: 10, ty: 1, w: 2, h: 1, solid: true },
      { kind: 'crate', tx: 2, ty: 7, w: 1, h: 1, solid: true },
      { kind: 'barrel', tx: 11, ty: 9, w: 1, h: 1, solid: true },
      { kind: 'lamp', tx: 1, ty: 9, w: 1, h: 1, solid: false },
      { kind: 'plant', tx: 1, ty: 5, w: 1, h: 1, solid: false },
    ] : furnitureFor(roomType, roomId);
    // BUILD 769: authored, type-specific floor plans. Residential buildings no
    // longer share one generic partition layout: each archetype gets a distinct
    // room arrangement, with explicit gaps so every room remains reachable.
    const isDungeon = roomType === 'cellar' || roomType === 'prison';
    const buildingType = roomType === 'building' ? houseTypeForBuilding(roomId) : null;
    const partitionWalls: { tx: number; ty: number; axis: 'north' | 'west' }[] = [];
    const addWall = (tx: number, ty: number, axis: 'north' | 'west') => {
      if (tx > 0 && ty > 0 && tx < ROOM_W - 1 && ty < ROOM_H - 1) partitionWalls.push({ tx, ty, axis });
    };
    if (!isDungeon) {
      if (roomType === 'building' && isStarterHouse) {
        // Keep the starter cottage open and easy to navigate; furniture zones
        // define the bedroom, hearth corner, and sitting area without partitions.
      } else if (roomType === 'building') {
        switch (buildingType) {
          case 'farmhouse':
            // Kitchen/store wing plus a broad doorway into the living space.
            for (let ty = 2; ty <= 9; ty++) if (ty !== 5 && ty !== 9) addWall(8, ty, 'west');
            for (let tx = 8; tx <= 12; tx++) if (tx !== 10) addWall(tx, 6, 'north');
            break;
          case 'merchant':
            // Front shop, rear stockroom, and a side office.
            for (let tx = 5; tx <= 12; tx++) if (tx !== 9) addWall(tx, 4, 'north');
            for (let ty = 4; ty <= 9; ty++) if (ty !== 7) addWall(5, ty, 'west');
            break;
          case 'guard':
            // Sleeping quarters separated from the equipment/store room.
            for (let ty = 2; ty <= 9; ty++) if (ty !== 6) addWall(7, ty, 'west');
            for (let tx = 7; tx <= 12; tx++) if (tx !== 10) addWall(tx, 7, 'north');
            break;
          case 'craftsman':
            // Workbench room, household room, and a rear tool store.
            for (let ty = 2; ty <= 9; ty++) if (ty !== 5) addWall(4, ty, 'west');
            for (let tx = 4; tx <= 12; tx++) if (tx !== 8 && tx !== 11) addWall(tx, 4, 'north');
            break;
          case 'cottage':
          default:
            // Compact cottage with a bedroom nook and a small rear pantry.
            for (let ty = 2; ty <= 8; ty++) if (ty !== 6) addWall(8, ty, 'west');
            for (let tx = 8; tx <= 12; tx++) if (tx !== 10) addWall(tx, 3, 'north');
            break;
        }
      } else if (roomType === 'tavern' || roomType === 'inn') {
        // Public taproom separated from the staff/store room.
        for (let ty = 1; ty <= 4; ty++) if (ty !== 3) addWall(8, ty, 'west');
        for (let tx = 8; tx <= 12; tx++) if (tx !== 10) addWall(tx, 5, 'north');
      } else if (roomType === 'guild') {
        // Workshop plus enclosed rear tool room and side office.
        for (let ty = 2; ty <= 9; ty++) if (ty !== 6) addWall(8, ty, 'west');
        for (let tx = 8; tx <= 12; tx++) if (tx !== 10) addWall(tx, 4, 'north');
      } else if (roomType === 'chapel') {
        // Nave with a separated sacristy at the rear.
        for (let tx = 2; tx <= 11; tx++) if (tx !== 6) addWall(tx, 3, 'north');
      }
    }
    const partitionTileBlocked = (tx: number, ty: number) =>
      partitionWalls.some((w) => w.tx === tx && w.ty === ty);
    const solidAt = (tx: number, ty: number): boolean => {
      if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return true;
      if (partitionTileBlocked(tx, ty)) return true;
      return furn.some((f) => f.solid && tx >= f.tx && tx < f.tx + f.w && ty >= f.ty && ty < f.ty + f.h);
    };
    const doorTile: TilePoint = { tx: Math.floor(ROOM_W / 2), ty: ROOM_H - 1 };

    const state = {
      px: doorTile.tx, py: doorTile.ty - 1,
      fx: doorTile.tx, fy: doorTile.ty - 1,
      path: [] as TilePoint[], stepT: 0, moving: false, facing: 'up' as Face8,
      tapPath: false,
      zoom: 1, camX: 0, camY: 0, w: 0, h: 0, dpr: 1,
    };
    // Per-character animation controllers (pruned each frame).
    const charAnims = new Map<string, CharacterAnimator>();
    const seenAnims = new Set<string>();
    // Match each attack sequence to exactly one visible Death/Attack sprite clip.
    let lastAttackSeq = attackSequenceRef.current;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      state.dpr = Math.min(window.innerWidth < 900 ? 1.25 : 1.5, window.devicePixelRatio || 1);
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
    // BUILD 565: expose for test automation
    toScreenRef.current = (tx: number, ty: number) => {
      const p = toScreen(tx, ty);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + p.x, y: rect.top + p.y };
    };
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      (window as any).__interiorToScreen = (tx: number, ty: number) => toScreenRef.current?.(tx, ty) ?? null;
      // BUILD 583: expose NPC IDs for test readiness checks.
      // Tests wait for Mira's ID to appear before tapping, instead of guessing timing.
      (window as any).__interiorNpcIds = () => npcsRef.current.map((n) => n.id);
      // Direct tile tap: simulates tap at tile center via real handler path
      (window as any).__interiorTapTile = (tx: number, ty: number) => {
        // BUILD 586: Check door tile first for reliable exit.
        // Previously the door check was only inside goTo(), but the tap handler
        // couldn't tell if exit succeeded vs. movement started.
        if (tx === doorTile.tx && ty === doorTile.ty) {
          if (exitRef.current) { exitRef.current(); return 'exit'; }
        }
        const npc = npcsRef.current.find((n) => Math.round(n.tx) === tx && Math.round(n.ty) === ty);
        if (npc && talkRef.current) { talkRef.current(npc.id); return npc.id; }
        const rat = ratsRef.current.find((r) => Math.round(r.tx) === tx && Math.round(r.ty) === ty);
        if (rat && strikeRatRef.current) { strikeRatRef.current(rat.id); return 'rat-' + rat.id; }
        // Empty walkable tile -> move there (via goTo pathfinding)
        if (tx >= 0 && ty >= 0 && tx < ROOM_W && ty < ROOM_H && !solidAt(tx, ty)) {
          goTo(tx, ty);
          return 'move-' + tx + ',' + ty;
        }
        return null;
      };
      (window as any).__interiorPlayerPos = () => ({ tx: state.px, ty: state.py });
      // BUILD 571: sync initial position for melee range
      if (playerMoveRef.current) playerMoveRef.current(state.px, state.py);
    }
    const fromScreen = (sx: number, sy: number) => {
      const wx = (sx - state.w / 2) / state.zoom + state.camX;
      const wy = (sy - state.h / 2) / state.zoom + state.camY;
      return screenToTileInt(wx, wy);
    };

    // Center camera on room.
    const rc = isoToScreen(ROOM_W / 2, ROOM_H / 2);
    state.camX = rc.x; state.camY = rc.y;
    // BUILD 765: keep the expanded floorplan visibly larger instead of fitting
    // every extra tile into the same tiny on-screen footprint. The room can
    // approach the viewport edges, but remains centered and fully interactive.
    state.zoom = Math.min(Math.min(state.w / (ROOM_W * TILE_W * 0.62), state.h / (ROOM_H * TILE_H * 1.7), 1.4) * 1.18, 1.5);

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

    // BUILD 784: pointer movement is for walking/interaction only. The old
    // drag-to-pan handler made the room appear to scroll sideways/down while walking.
    const onPointerUp = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const t = fromScreen(e.clientX - r.left, e.clientY - r.top);
      const npc = npcsRef.current.find((n) => Math.round(n.tx) === t.tx && Math.round(n.ty) === t.ty);
      if (npc && talkRef.current) { talkRef.current(npc.id); return; }
      const rat = ratsRef.current.find((rat) => Math.round(rat.tx) === t.tx && Math.round(rat.ty) === t.ty);
      if (rat && strikeRatRef.current) { strikeRatRef.current(rat.id); return; }
      const item = groundItemsRef.current.find((g) => Math.round(g.tx) === t.tx && Math.round(g.ty) === t.ty);
      if (item && pickupRef.current) { pickupRef.current(item.id); return; }
      if (t.tx >= 0 && t.ty >= 0 && t.tx < ROOM_W && t.ty < ROOM_H && !solidAt(t.tx, t.ty)) goTo(t.tx, t.ty);
    };
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    let raf = 0;
    let last = performance.now();
    const STEP_MS = 280;
    // BUILD 704: running shortens the tile step (faster indoor movement).
    const STEP_MS_RUN = 160;

    const drawFurniture = (g: CanvasRenderingContext2D, f: Furniture, nowMs: number, kit: boolean) => {
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
          g.fillStyle = isStarterHouse ? '#873f32' : roomType === 'chapel' ? 'rgba(140,40,50,0.55)' : 'rgba(150,60,40,0.45)';
          g.beginPath();
          g.moveTo(c.x, yB - hpx / 2); g.lineTo(c.x + wpx / 2, yB);
          g.lineTo(c.x, yB + hpx / 2); g.lineTo(c.x - wpx / 2, yB);
          g.closePath(); g.fill();
          g.strokeStyle = isStarterHouse ? '#d6ad69' : 'rgba(90,30,20,0.5)'; g.lineWidth = isStarterHouse ? 3 * z : 2; g.stroke();
          if (isStarterHouse) {
            g.strokeStyle = '#d6ad69'; g.lineWidth = Math.max(1, z);
            g.beginPath(); g.moveTo(c.x, yB - hpx * 0.32); g.lineTo(c.x + wpx * 0.32, yB); g.lineTo(c.x, yB + hpx * 0.32); g.lineTo(c.x - wpx * 0.32, yB); g.closePath(); g.stroke();
            g.fillStyle = '#d6ad69'; g.fillRect(c.x - 2 * z, yB - 2 * z, 4 * z, 4 * z);
          }
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
          if (isStarterHouse) {
            // Small loaf, crock, and mug make the starter table feel lived-in.
            g.fillStyle = '#d9bd83'; g.beginPath(); g.ellipse(c.x - 8 * z, yB - 31 * z, 8 * z, 4 * z, -0.25, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#b36d3c'; g.beginPath(); g.ellipse(c.x - 8 * z, yB - 32 * z, 6 * z, 3 * z, -0.25, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#e4d7bd'; g.fillRect(c.x + 7 * z, yB - 35 * z, 7 * z, 8 * z);
            g.fillStyle = '#b98b54'; g.fillRect(c.x + 6 * z, yB - 36 * z, 9 * z, 2 * z);
          }
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
        case 'crate': {
          if (kit) {
            // BUILD 388: dungeon chest (base + lid), same footprint/solidity.
            const cp = chestPanelFor(f.tx, f.ty);
            const cw = 46 * z;
            const baseH = (84 / 116) * cw;
            drawKitBillboard(g, 'chestBase', cp, c.x, yB, cw);
            drawKitBillboard(g, 'chestTop', cp, c.x, yB - baseH + 4 * z, cw);
            break;
          }
          box(c.x, yB, tw * 0.8, 26 * z, '#a87f4e', '#7a5a36', '#93703f');
          g.strokeStyle = 'rgba(60,40,20,0.6)'; g.lineWidth = 2 * z;
          g.beginPath();
          g.moveTo(c.x - tw * 0.4, yB - 26 * z); g.lineTo(c.x, yB - 26 * z + th * 0.4);
          g.lineTo(c.x + tw * 0.4, yB - 26 * z); g.stroke();
          break;
        }
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
        case 'plant': {
          // Leafy potted herb beside the bed, with a terracotta pot.
          g.fillStyle = '#9b5537';
          g.beginPath(); g.moveTo(c.x - 10 * z, yB - 13 * z); g.lineTo(c.x + 10 * z, yB - 13 * z); g.lineTo(c.x + 7 * z, yB); g.lineTo(c.x - 7 * z, yB); g.closePath(); g.fill();
          g.fillStyle = '#4d7a42';
          for (let i = 0; i < 5; i++) {
            const lx = c.x + (i - 2) * 5 * z;
            g.beginPath(); g.ellipse(lx, yB - (23 + (i % 2) * 5) * z, 5 * z, 10 * z, (i - 2) * 0.16, 0, Math.PI * 2); g.fill();
          }
          g.strokeStyle = '#a4c26d'; g.lineWidth = Math.max(1, z);
          g.beginPath(); g.moveTo(c.x, yB - 7 * z); g.lineTo(c.x, yB - 29 * z); g.stroke();
          break;
        }
        case 'lamp': {
          if (kit) {
            // BUILD 388: dungeon torch on a stand, same footprint/solidity.
            const lp = torchPanelFor(f.tx + f.ty * 2);
            const lw = 30 * z;
            const flick = 0.7 + 0.3 * Math.sin(nowMs / 200 + f.tx * 1.7 + f.ty);
            const gr = g.createRadialGradient(c.x, yB - 44 * z, 2, c.x, yB - 44 * z, 52 * z);
            gr.addColorStop(0, `rgba(255,170,60,${0.3 * flick})`);
            gr.addColorStop(1, 'rgba(255,170,60,0)');
            g.fillStyle = gr;
            g.fillRect(c.x - 56 * z, yB - 100 * z, 112 * z, 112 * z);
            g.fillStyle = '#3a3f4a';
            g.fillRect(c.x - 2 * z, yB - 36 * z, 4 * z, 36 * z);
            drawKitBillboard(g, 'torch', lp, c.x, yB - 32 * z, lw);
            break;
          }
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
          if (kit) {
            // BUILD 388: straw pile on the west tile, chest on the east tile —
            // same 2x1 solid footprint.
            const wc = toScreen(f.tx + 0.5, f.ty + 0.5);
            const ec = toScreen(f.tx + 1.5, f.ty + 0.5);
            g.fillStyle = '#c9a86b';
            g.beginPath(); g.ellipse(wc.x, wc.y - 8 * z, tw * 0.45, th * 0.4, 0, 0, 7); g.fill();
            g.fillStyle = '#a8895a';
            for (let i = 0; i < 8; i++) {
              const sx = wc.x - tw * 0.35 + (i * tw * 0.7) / 8;
              g.fillRect(sx, wc.y - 14 * z, 2 * z, 10 * z);
            }
            const cp = chestPanelFor(f.tx + 1, f.ty);
            const cw = 46 * z;
            const baseH = (84 / 116) * cw;
            drawKitBillboard(g, 'chestBase', cp, ec.x, ec.y, cw);
            drawKitBillboard(g, 'chestTop', cp, ec.x, ec.y - baseH + 4 * z, cw);
            break;
          }
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
    // BUILD 704: explicit `running` overrides the animator's speed heuristic.
    const drawCharacter = (g: CanvasRenderingContext2D, fx: number, fy: number, facing: Face8, moving: boolean, look: LookRef, nowMs: number, animKey: string, running?: boolean) => {
      const c = toScreen(fx, fy);
      const depth = depthKey(Math.round(fx), Math.round(fy));
      let anim = charAnims.get(animKey);
      if (!anim) { anim = new CharacterAnimator(animKey); charAnims.set(animKey, anim); }
      seenAnims.add(animKey);
      // BUILD 705: the animator's walk-cycle rate is tuned for field units
      // (16 units/sec -> ~11fps). Interior tiles move at 3.57 tiles/sec,
      // which measured as ~4fps — slow-motion legs vs outside. Scale tile
      // coords to field-equivalent units so the walk cycle matches.
      anim.update({ x: fx * 4.5, y: fy * 4.5, moving, facing, nowMs, running });
      const draw = (g2: CanvasRenderingContext2D) => {
        drawIsoCharacter({
          g: g2, x: c.x, y: c.y, look, nowMs, animator: anim,
        });
      };
      return { depth, draw };
    };

    const frame = (nowMs: number) => {
      // Schedule from the start so render work does not add another frame of delay.
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = nowMs; return; }
      // Carry through longer frame intervals instead of discarding movement time
      // after a hitch; the old 50ms cap made movement feel sluggish under load.
      const dt = Math.min(100, Math.max(0, nowMs - last));
      last = nowMs;
      // Dungeon kit once its images have pixels; otherwise procedural.
      const kit = isDungeon && dungeonKitReady();
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
            state.facing = faceForMove(state.px, state.py, nx, ny, state.facing);
            state.path = [{ tx: nx, ty: ny }];
            state.tapPath = false;
            state.moving = true;
          }
        }
      }
      // movement interpolation
      if (state.moving && state.path.length > 0) {
        const target = state.path[0];
        // BUILD 704: running = faster tile steps indoors.
        const stepMs = playerRunningRef.current === true ? STEP_MS_RUN : STEP_MS;
        const speed = dt / stepMs;
        const dx = target.tx - state.fx, dy = target.ty - state.fy;
        const dist = Math.hypot(dx, dy);
        if (dist <= speed) {
          state.fx = target.tx; state.fy = target.ty;
          state.px = target.tx; state.py = target.ty;
          state.path.shift();
          if (playerMoveRef.current) playerMoveRef.current(state.px, state.py);
          // BUILD 703: don't drop state.moving when a tile step completes if
          // a direction is still held — the next frame starts a new step.
          // Flickering moving=false made the animator reset to idle and
          // restart the walk cycle on every tile, so the interior walk
          // looked nothing like the smooth field walk. But if the held
          // direction is blocked (wall), stop — otherwise the walk pose
          // freezes mid-stride.
          if (state.path.length === 0) {
            let blocked = true;
            if (hd.x !== 0 || hd.y !== 0) {
              const bdx = hd.x !== 0 ? Math.sign(hd.x) : 0;
              const bdy = hd.x !== 0 ? 0 : Math.sign(hd.y);
              const bnx = Math.round(state.px) + bdx, bny = Math.round(state.py) + bdy;
              blocked = !(bnx === doorTile.tx && bny === doorTile.ty) && !walkable(bnx, bny);
            }
            if ((hd.x === 0 && hd.y === 0) || blocked) state.moving = false;
            state.tapPath = false;
          }
          else state.facing = faceForMove(state.fx, state.fy, state.path[0].tx, state.path[0].ty, state.facing);
        } else {
          state.facing = faceForMove(state.fx, state.fy, target.tx, target.ty, state.facing);
          state.fx += (dx / dist) * speed;
          state.fy += (dy / dist) * speed;
        }
      }

      const g = ctx;
      g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      g.clearRect(0, 0, state.w, state.h);
      // BUILD 783: warm room-toned backdrop, so uncovered space never appears black.
      g.fillStyle = isStarterHouse ? '#a97545' : '#14181f';
      g.fillRect(0, 0, state.w, state.h);

      const wood = isStarterHouse || roomType === 'guild' || roomType === 'cellar' || roomType === 'prison';
      const f1 = isStarterHouse ? '#b7834e' : wood ? '#8d8fa3' : '#a87f4e';
      const f2 = isStarterHouse ? '#a97545' : wood ? '#83858f' : '#9c7443';

      // BUILD 777: replace the procedural floor with the uploaded room scene.
      const starterScene = isStarterHouse ? starterHouseScene() : undefined;
      if (isStarterHouse && starterScene) {
        // Restore the original Build 777 sizing so the whole room is visible
        // at once. Do not move the art when the player walks.
        const maxW = state.w * 1.15;
        const maxH = state.h * 0.66;
        const scale = Math.min(maxW / starterScene.naturalWidth, maxH / starterScene.naturalHeight);
        const imageW = starterScene.naturalWidth * scale;
        const imageH = starterScene.naturalHeight * scale;
        g.globalCompositeOperation = 'screen';
        g.drawImage(starterScene, (state.w - imageW) / 2, (state.h - imageH) / 2, imageW, imageH);
        g.globalCompositeOperation = 'source-over';
      } else {
      // floor
      for (let ty = 0; ty < ROOM_H; ty++) {
        for (let tx = 0; tx < ROOM_W; tx++) {
          const p = toScreen(tx, ty);
          const hw = (TILE_W * state.zoom) / 2, hh = (TILE_H * state.zoom) / 2;
          if (kit) {
            // BUILD 388: dungeon stone tiles; the open south edge keeps its skirt.
            drawKitFloor(g, floorPanelFor(tx, ty), p.x, p.y, TILE_W * state.zoom, ty === ROOM_H - 1);
          } else {
            g.beginPath();
            g.moveTo(p.x, p.y - hh); g.lineTo(p.x + hw, p.y);
            g.lineTo(p.x, p.y + hh); g.lineTo(p.x - hw, p.y);
            g.closePath();
            g.fillStyle = isStarterHouse ? (ty % 2 === 0 ? ((tx % 3 === 0) ? '#bd8b55' : f1) : ((tx % 3 === 1) ? '#9d6d40' : f2)) : ((tx + ty) % 2 === 0 ? f1 : f2);
            g.fill();
            if (isStarterHouse) {
              // Warm plank seams, alternating board lengths, and subtle wood grain.
              g.strokeStyle = 'rgba(63,35,19,0.34)';
              g.lineWidth = Math.max(0.7, 0.9 * state.zoom);
              g.beginPath(); g.moveTo(p.x - hw * 0.86, p.y); g.lineTo(p.x + hw * 0.86, p.y); g.stroke();
              g.strokeStyle = 'rgba(244,194,125,0.20)';
              g.beginPath(); g.moveTo(p.x - hw * 0.42, p.y - hh * 0.30); g.lineTo(p.x + hw * 0.18, p.y - hh * 0.30); g.stroke();
            } else if (!wood && tx % 3 === 0) {
              // plank seams
              g.strokeStyle = 'rgba(60,40,20,0.25)';
              g.lineWidth = 1;
              g.beginPath(); g.moveTo(p.x - hw, p.y); g.lineTo(p.x + hw, p.y); g.stroke();
            }
          }
          if (tx === doorTile.tx && ty === doorTile.ty) {
            g.fillStyle = 'rgba(255,210,90,0.35)';
            g.beginPath();
            g.moveTo(p.x, p.y - hh); g.lineTo(p.x + hw, p.y);
            g.lineTo(p.x, p.y + hh); g.lineTo(p.x - hw, p.y);
            g.closePath(); g.fill();
          }
        }
      }

      }

      if (isStarterHouse) {
        // Warm daylight and hearth bounce soften the floor without obscuring movement or objects.
        const glowAt = (tx: number, ty: number, radius: number, alpha: number) => {
          const p = toScreen(tx, ty);
          const gr = g.createRadialGradient(p.x, p.y, 2, p.x, p.y, radius * state.zoom);
          gr.addColorStop(0, `rgba(255,190,105,${alpha})`);
          gr.addColorStop(1, 'rgba(255,190,105,0)');
          g.fillStyle = gr; g.fillRect(0, 0, state.w, state.h);
        };
        glowAt(11, 6, 150, 0.23);
        glowAt(3, 2, 125, 0.12);
      }

      interface Drawable { depth: number; draw: (g: CanvasRenderingContext2D) => void }
      const drawables: Drawable[] = [];

      if (!isStarterHouse) {
      // back walls (north ty=0, west tx=0) with windows
      const wallCol = isStarterHouse ? '#c8a578' : wood ? '#6e6f7a' : '#b08d5a';
      const wallDark = isStarterHouse ? '#765033' : wood ? '#54555e' : '#8a6c42';
      const wh = WALL_H * state.zoom;
      if (kit) {
        // BUILD 388: brick wall panels, one per 2 tiles (panel aspect fits
        // 2 tile-edges at WALL_H height). Dark panels run down-right (north).
        for (let i = 0; i < ROOM_W / 2; i++) {
          const tx = i * 2;
          const p0 = toScreen(tx, 0);
          const p2 = toScreen(tx + 2, 0);
          const hw2 = (TILE_W * state.zoom) / 2;
          const ax = p0.x - hw2, ay = p0.y;      // W(tx): upper-left end
          const bx = p2.x - hw2, by = p2.y;      // W(tx+2): lower-right end
          const panel = wallPanelFor('north', i);
          drawables.push({
            depth: depthKey(tx, -1),
            draw: (g2) => { drawWallPanel(g2, ax, ay, bx, by, wh, panel); },
          });
        }
      } else
      for (let tx = 0; tx < ROOM_W; tx++) {
        const p = toScreen(tx, 0);
        const hw = (TILE_W * state.zoom) / 2;
        drawables.push({
          depth: depthKey(tx, -1),
          draw: (g2) => {
            g2.fillStyle = wallCol;
            g2.beginPath();
            g2.moveTo(p.x - hw, p.y); g2.lineTo(p.x, p.y + (TILE_H * state.zoom) / 2);
            g2.lineTo(p.x, p.y + (TILE_H * state.zoom) / 2 - wh);
            g2.lineTo(p.x - hw, p.y - wh);
            g2.closePath(); g2.fill();
            if (isStarterHouse ? tx % 4 === 1 : tx % 3 === 1) {
              // Framed windows; the starter cottage gets timber trim and divided glass.
              const wx = p.x - hw * 0.58, wy = p.y - wh * 0.77, ww = hw * 0.58, whi = wh * 0.40;
              g2.fillStyle = isStarterHouse ? '#54351f' : '#2a3a4a';
              g2.fillRect(wx - 2 * state.zoom, wy - 2 * state.zoom, ww + 4 * state.zoom, whi + 4 * state.zoom);
              g2.fillStyle = isStarterHouse ? '#7198a1' : '#2a3a4a';
              g2.fillRect(wx, wy, ww, whi);
              g2.fillStyle = 'rgba(210,239,242,0.55)';
              g2.fillRect(wx, wy, ww, whi * 0.18);
              g2.strokeStyle = isStarterHouse ? '#4b2e1b' : '#172633';
              g2.lineWidth = Math.max(1, 2 * state.zoom);
              g2.beginPath(); g2.moveTo(wx + ww / 2, wy); g2.lineTo(wx + ww / 2, wy + whi);
              g2.moveTo(wx, wy + whi * 0.56); g2.lineTo(wx + ww, wy + whi * 0.56); g2.stroke();
              if (isStarterHouse) {
                g2.fillStyle = '#a95f48';
                g2.fillRect(wx - 3 * state.zoom, wy, 4 * state.zoom, whi);
                g2.fillRect(wx + ww - state.zoom, wy, 4 * state.zoom, whi);
                g2.fillStyle = '#d8b27d';
                g2.fillRect(wx - 3 * state.zoom, wy + whi, ww + 6 * state.zoom, 3 * state.zoom);
              }
            }
            if (isStarterHouse && tx % 3 === 0) {
              // Exposed timber beam across the plaster wall.
              g2.strokeStyle = '#795033'; g2.lineWidth = Math.max(2, 3 * state.zoom);
              g2.beginPath(); g2.moveTo(p.x - hw, p.y - wh * 0.10); g2.lineTo(p.x, p.y + (TILE_H * state.zoom) / 2 - wh * 0.10); g2.stroke();
            }
          },
        });
      }
      if (kit) {
        // BUILD 388: light brick panels run up-right (west wall). a = the
        // lower-left end, b = the upper-right end, matching the art.
        for (let i = 0; i < ROOM_H / 2; i++) {
          const ty = i * 2;
          const pLo = toScreen(0, ty + 2);
          const pHi = toScreen(0, ty);
          const hw2 = (TILE_W * state.zoom) / 2;
          const ax = pLo.x + hw2, ay = pLo.y;   // E(ty+2): lower-left end
          const bx = pHi.x + hw2, by = pHi.y;   // E(ty): upper-right end
          const panel = wallPanelFor('west', i);
          drawables.push({
            depth: depthKey(-1, ty),
            draw: (g2) => { drawWallPanel(g2, ax, ay, bx, by, wh, panel); },
          });
        }
      } else
      for (let ty = 0; ty < ROOM_H; ty++) {
        const p = toScreen(0, ty);
        const hw = (TILE_W * state.zoom) / 2;
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

      // BUILD 766: raised isometric partition walls. The omitted wall tiles
      // are door openings, so every new room remains reachable.
      for (const wall of partitionWalls) {
        const p = toScreen(wall.tx, wall.ty);
        const hw = (TILE_W * state.zoom) / 2;
        const hh = (TILE_H * state.zoom) / 2;
        const wallHeight = WALL_H * state.zoom;
        drawables.push({
          depth: depthKey(wall.tx, wall.ty) + 0.5,
          draw: (g2) => {
            const x1 = wall.axis === 'north' ? p.x - hw : p.x + hw;
            const x2 = p.x;
            const y1 = p.y;
            const y2 = p.y + hh;
            g2.fillStyle = wallDark;
            g2.beginPath();
            g2.moveTo(x1, y1); g2.lineTo(x2, y2);
            g2.lineTo(x2, y2 - wallHeight); g2.lineTo(x1, y1 - wallHeight);
            g2.closePath(); g2.fill();
            g2.strokeStyle = 'rgba(38,28,20,0.75)';
            g2.lineWidth = Math.max(1, state.zoom);
            g2.stroke();
            g2.strokeStyle = wallCol;
            g2.lineWidth = Math.max(2, 3 * state.zoom);
            g2.beginPath();
            g2.moveTo(x1, y1 - wallHeight); g2.lineTo(x2, y2 - wallHeight);
            g2.stroke();
          },
        });
      }

      if (kit) {
        // BUILD 388: wall torches + engaged pillars on the brick walls.
        const z = state.zoom;
        const hwT = (TILE_W * z) / 2, hhT = (TILE_H * z) / 2;
        let ti = 0;
        const torchGlow = (g2: CanvasRenderingContext2D, x: number, y: number, tx: number) => {
          const flick = 0.7 + 0.3 * Math.sin(nowMs / 200 + tx * 1.7);
          const gr = g2.createRadialGradient(x, y - 14 * z, 2, x, y - 14 * z, 44 * z);
          gr.addColorStop(0, `rgba(255,170,60,${0.28 * flick})`);
          gr.addColorStop(1, 'rgba(255,170,60,0)');
          g2.fillStyle = gr;
          g2.fillRect(x - 48 * z, y - 62 * z, 96 * z, 96 * z);
        };
        for (let tx = 2; tx < ROOM_W - 1; tx += 3) {
          const p = toScreen(tx, 0);
          const mx = p.x - hwT / 2, my = p.y + hhT / 2; // north wall face midpoint
          const bx2 = mx, by2 = my - wh * 0.52;
          const panel = torchPanelFor(ti++);
          const d = depthKey(tx, -1) + 1;
          drawables.push({
            depth: d,
            draw: (g2) => {
              torchGlow(g2, bx2, by2, tx);
              drawKitBillboard(g2, 'torch', panel, bx2, by2, 30 * z);
            },
          });
        }
        for (let ty = 2; ty < ROOM_H - 1; ty += 3) {
          const p = toScreen(0, ty);
          const mx = p.x + hwT / 2, my = p.y + hhT / 2; // west wall face midpoint
          const bx2 = mx, by2 = my - wh * 0.52;
          const panel = torchPanelFor(ti++);
          const d = depthKey(-1, ty) + 1;
          drawables.push({
            depth: d,
            draw: (g2) => {
              torchGlow(g2, bx2, by2, ty * 2);
              drawKitBillboard(g2, 'torch', panel, bx2, by2, 30 * z);
            },
          });
        }
        // Engaged pillars capping the north wall ends.
        [[0, 0], [ROOM_W - 1, 0]].forEach(([px, py], i) => {
          const p = toScreen(px, py);
          const d = depthKey(px, -1) + 2;
          drawables.push({
            depth: d,
            draw: (g2) => { drawKitBillboard(g2, 'pillar', pillarPanelFor(i), p.x, p.y + hhT * 0.5, 34 * z); },
          });
        });
      }

      }

      // furniture
      if (!isStarterHouse) for (const f of furn) {
        drawables.push({
          depth: depthKey(f.tx + f.w - 1, f.ty + f.h - 1) + 0.1,
          draw: (g2) => drawFurniture(g2, f, nowMs, kit),
        });
      }

      // BUILD 724: ground pickups; the starter dagger is drawn directly so it
      // needs no missing external bitmap and stays crisp on every device.
      for (const item of groundItemsRef.current) {
        const isDagger = item.sprite === 'procedural:dagger';
        const img = isDagger ? undefined : groundItemImg(item.sprite);
        if (!isDagger && !img) continue;
        const c = toScreen(item.tx, item.ty);
        drawables.push({
          depth: depthKey(item.tx, item.ty) + 0.05,
          draw: (g2) => {
            const w = TILE_W * (isDagger ? 0.30 : 0.35);
            if (isDagger) {
              // Small metal dagger lying diagonally on the floor, with a dark
              // grip, brass guard, and a bright steel blade.
              g2.save();
              g2.translate(c.x, c.y);
              g2.rotate(-Math.PI / 4);
              g2.lineCap = 'round';
              g2.strokeStyle = 'rgba(0,0,0,0.42)'; g2.lineWidth = 6;
              g2.beginPath(); g2.moveTo(-w * 0.38, 0); g2.lineTo(w * 0.42, 0); g2.stroke();
              g2.strokeStyle = '#4b2e1c'; g2.lineWidth = 4;
              g2.beginPath(); g2.moveTo(-w * 0.34, 0); g2.lineTo(-w * 0.02, 0); g2.stroke();
              g2.strokeStyle = '#c79a43'; g2.lineWidth = 3;
              g2.beginPath(); g2.moveTo(-w * 0.04, -5); g2.lineTo(-w * 0.04, 5); g2.stroke();
              g2.fillStyle = '#c8d7df';
              g2.beginPath(); g2.moveTo(0, -3); g2.lineTo(w * 0.46, 0); g2.lineTo(0, 3); g2.closePath(); g2.fill();
              g2.strokeStyle = '#f2f6f8'; g2.lineWidth = 1;
              g2.beginPath(); g2.moveTo(0, -1); g2.lineTo(w * 0.40, 0); g2.stroke();
              g2.restore();
            } else if (img) {
              const h = w * (img.naturalHeight / img.naturalWidth);
              g2.drawImage(img, c.x - w / 2, c.y - h / 2, w, h);
            }
            // Label
            g2.font = '600 10px system-ui';
            g2.textAlign = 'center';
            const lw = g2.measureText(item.label).width;
            g2.fillStyle = 'rgba(10,14,20,0.65)';
            g2.fillRect(c.x - lw / 2 - 4, c.y + 12, lw + 8, 15);
            g2.fillStyle = '#ffe9a8';
            g2.fillText(item.label, c.x, c.y + 24);
          },
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

      // BUILD 565: Rats (cellar). Simple dark ellipse with HP bar.
      // BUILD 591: Use actual rat sprite sheet instead of ellipse.
      for (const rat of ratsRef.current) {
        const c = toScreen(rat.tx, rat.ty);
        const z = state.zoom;
        drawables.push({
          depth: (rat.tx + rat.ty) * 10 + 5,
          draw: (g2) => {
            const sprite = ratSprite();
            if (sprite) {
              // Sprite sheet: 8x5 grid, 64x64 frames.
              // Use row 1 (side view) with animation based on time.
              // Frame cycles every 300ms for walking animation.
              const frame = Math.floor(performance.now() / 300) % 8;
              const sx = frame * 64, sy = 1 * 64; // Row 1: side walking
              const dw = 32 * z, dh = 32 * z; // Scaled to ~32px at zoom 1
              g2.drawImage(sprite, sx, sy, 64, 64, c.x - dw/2, c.y - dh - 8 * z, dw, dh);
            } else {
              // Fallback: dark brown ellipse (if sprite not loaded)
              g2.fillStyle = '#4a3728';
              g2.beginPath();
              g2.ellipse(c.x, c.y - 10 * z, 14 * z, 8 * z, 0, 0, Math.PI * 2);
              g2.fill();
            }
            // HP bar
            const w = 28 * z;
            g2.fillStyle = 'rgba(0,0,0,0.6)';
            g2.fillRect(c.x - w/2, c.y - 28 * z, w, 4);
            g2.fillStyle = rat.hp / rat.maxHp > 0.5 ? '#4a4' : '#a44';
            g2.fillRect(c.x - w/2, c.y - 28 * z, w * (rat.hp / rat.maxHp), 4);
          },
        });
      }

      // player
      // Start the actual RPG Attack clip once per combat swing indoors too.
      const attackSeq = attackSequenceRef.current;
      if (attackSeq !== lastAttackSeq) {
        lastAttackSeq = attackSeq;
        charAnims.get('player')?.setState('attack');
      }
      // BUILD 422: debug direction test overrides facing + forces walk cycle.
      const dbgFace = debugFacing ?? null;
      drawables.push(drawCharacter(g, state.fx, state.fy, dbgFace ?? state.facing, dbgFace ? true : state.moving, playerLook ?? 0, nowMs, 'player', playerRunningRef.current === true));
      for (const k of charAnims.keys()) if (!seenAnims.has(k)) charAnims.delete(k);

      drawables.sort((a, b) => a.depth - b.depth);
      for (const d of drawables) d.draw(g);

      // exit hint
      const dp = toScreen(doorTile.tx, doorTile.ty);
      g.font = '600 12px system-ui';
      g.textAlign = 'center';
      g.fillStyle = '#ffd98a';
      g.fillText('🚪 tap the door to exit', dp.x, dp.y + 34);

    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
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
