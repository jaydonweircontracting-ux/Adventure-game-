import { useEffect, useRef, useState } from 'react';
import { hutAt, inBounds, isWalkableWorld, loadWorld, saveWorld, terrainAt, terrainKey, type HutRect, type IsoWorld, type PlacedItem } from '../iso/isoWorld';
import { mosslightEngineChunkLayout } from '../mosslightLayout';
import { emitVillager, villagerSpecFor, PLAYER_SPEC, PHASE_PER_UNIT, type VillagerSpec } from './villagers';
import { advanceRenderPos, needsRenderSnap, turnYawToward, easePhaseToNeutral, phaseForDistance, blockedAction, figureSlotLayout, poseKeyEquals, FIGURE_TURN_RATE, type FigurePoseKey } from './npcMotion';
import {
  houseDesignFor, houseDesignForVariant, HOUSE_VARIANTS, streetSlabsFor, cobbleSquaresFor,
  SKY_TOP, SKY_HORIZON, DIRT_TAN, COBBLE_GAP, MORTAR, hash2,
  DOOR_WOOD, GROUND_FLOOR_H, UPPER_FLOOR_H, roofRise, PARAPET_H,
  SUN_SHADE, shadeRgb, groundTintDelta,
  DOOR_W, DOOR_H, FIRST_PERSON_EYE,
  FP_PITCH_MIN, FP_PITCH_MAX, ZOOM_MIN,
  VIEW_FAR_PLANE, VIEW_BAND_HALF, VIEW_BAND_CELL, VIEW_FAR_BAND_HALF, VIEW_FAR_BAND_CELL, VIEW_HORIZON_BAND_HALF, VIEW_HORIZON_BAND_CELL, VIEW_APRON_HALF,
  VIEW_BAND_Y, VIEW_FAR_BAND_Y, VIEW_HORIZON_BAND_Y, VIEW_APRON_Y,
} from './townLook';
import { applyZoomDelta } from './firstPerson';
import { emitSkyObjects, nightFactorForMinutes, NIGHT_NAVY, SKY_MAX_VERTS } from './sky';
import { emitHouseFx, houseFxInputsFor, resolveHouseFx, smokePuffsFor, chimneyTopFor, windowSlotsFor, houseLitAt, lightScheduleFor, FX_MAX_VERTS, type InteriorFxInput } from './houseFx';
import { WINDMILL_TOWER_H, WINDMILL_CAP_H } from './windmill';
import { LANTERN_POST_H, LANTERN_POST_W, LANTERN_BOX, LANTERN_CAP, LANTERN_TIMBER, LANTERN_GLASS_DARK, lanternBoxCentre } from './lantern';
import { absMinutes, farmStageAt, harvestFarmTile, nearestReadyFarmTile, FARM_HARVEST_WHEAT, FARM_SOIL, FARM_FURROW, type FarmStage } from './farm';
import {
  doorsFacePaths, treesOffPaths, lanternsAlongRoads, fencesAroundProperty,
  alignArea, enhanceArea, adjustSpacing,
  type LayoutResult,
} from './layoutHelpers';
import {
  placedHutRects, placedTreeTiles, placedStallRects, placedRockTiles, placedWallTiles,
  placedLanternTiles, placedBushTiles, placedOreTiles, placedBridgeTiles, placedFarmTiles, placedFarmKeyInts, placedFenceTiles,
  validatePlacement, movePlacement, moveGeneratedHut, moveGeneratedPath, moveGeneratedTree,
  seedRectForHut, removeAt, removeAlongStroke, findRemovableNear, addPlacement, walkableWithPlacements,
  createBuildHistory, recordBuildChange, undoBuildChange, redoBuildChange, undoRedoKeyForEvent,
  isHouseKind, rotateFace, placementRectFor, tileKeyInt,
  type PaletteKind, type UndoEntry, type BuildHistory, type Rotation,
} from './placements';
import { gardenFencesFor, gardenPlantsFor } from './gardens';
import { marketStallSpots, stampLandmarks, type LandmarkKind } from './settlements';
import { emitNaturalGrass, emitPlacedGrass, blockedTiles } from './grassTufts';
import { emitGroundDetail3d } from './groundDetail3d';
import { treeShapeForTile, TREE_SHAPES, generatedBushAt, bushParamsForTile, crateKindsForProps, propKindToCrateKind, type CratePropKind } from './vegetation';
import { wildTerrainAt, wildTreeAt, wildRockAt, wildObstacleAt, isWildWalkable, cellIsMixed, effTerrainFor, surfaceElevation, renderTerrain, rayHitSurface } from './wildTerrain';
import { stampTownBuildings, stampExtraRocks } from './townAdditions3d';
import { loadTemplates, saveTemplates, captureChunk, pasteChunk, uniquifyName, type ChunkTemplate } from './templates';
import {
  selectArea, selectionCount, selectionCounts, areaCentreTile, rotateRect,
  moveArea, rotateArea, deleteArea, duplicateArea,
  toggleSelectionMember, excludeItem, selectionItems, selectionItemLabel,
  type AreaSelection,
} from './areaSelect';
import { loadCustomAssets, parseGlbUpload, parseGltfUpload, parseObjUpload, validateCustomPlacement, removeCustomAssetPlacements, customFootprint, rotateCustomXZ, MAX_FILE_BYTES, CUSTOM_ASSETS_KEY, type CustomAsset, type GlbUploadResult, type GltfDependency } from './customAssets';
import { createAssetStore, createIndexedDbAssetBackend, writeAssetManifest, readAssetManifest, describeStoreError, type AssetStore } from './assetStore';
import { parseZipUpload, writeZipArchive } from './zipImport';
import { buildAssetPack } from './assetPack';
import {
  buildHandoffPack, buildHandoffSummary, selectHandoffAssets, decideSharePath, decideCopyPath,
  HANDOFF_ZIP_NAME, HANDOFF_HOWTO, HANDOFF_LIMIT,
  type HandoffScope,
} from './assetHandoff';
import {
  ASSET_CATEGORIES, parseTags, assetRow,
  renameAsset, setAssetCategory, setAssetTags, filterAssets, sortAssets,
  importProgressPercent, importProgressLabel, planLibraryCommit, discardPending,
  findNameCollisions, renderAssetPreview, canPreviewAsset,
  type ImportProgress, type LibrarySort, type OverwriteChoice,
} from './assetLibrary';

// BUILD 1045: the preview canvas. A tiny module-level component (not
// defined inside the view, so it never remounts on re-render): it
// draws the pixel buffer renderAssetPreview returns — the model's own
// triangles, rasterized in assetLibrary.ts — into a <canvas> with
// putImageData. No second 3D renderer: the pixels come from the same
// positions + colours the game draws. When the model cannot be
// previewed it renders nothing and the caller says so in words.
// BUILD 1046: the last import's report — exactly which models
// landed, which entries were skipped and why, which failed, and
// notes (a missing texture, a pack manifest, a .bin found in a
// subfolder). Shown in the hub until dismissed; the message bar
// keeps only the one-line summary.
export interface ImportReport {
  source: string;
  added: string[];
  skipped: Array<{ name: string; reason: string }>;
  failed: string[];
  notes: string[];
}

// BUILD 1046: one overwrite-prompt row — a pending model whose
// name already exists in the library, the asset it would collide
// with, and how many placed copies that asset has (Replace
// removes them). `choices` is the player's per-row answer so far;
// a row with no answer defaults to Keep both.
export interface OverwritePrompt {
  pending: CustomAsset[];
  collisions: Array<{ pendingId: string; pendingName: string; existingId: string; existingName: string; placedCount: number }>;
  choices: Record<string, OverwriteChoice>;
}

function AssetPreviewCanvas({ asset, size, testid }: { asset: CustomAsset; size: number; testid: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const preview = renderAssetPreview(asset, size);
    ctx.clearRect(0, 0, size, size);
    if (!preview) return;
    const img = new ImageData(new Uint8ClampedArray(preview.pixels), size, size);
    ctx.putImageData(img, 0, 0);
  }, [asset, size]);
  return <canvas ref={ref} width={size} height={size} data-testid={testid} style={{ display: 'block', width: size, height: size, borderRadius: 6, background: '#d8e2d4', border: '1px solid rgba(255,255,255,.25)' }} />;
}
import { hutDoor, hutExitPoint, sameHut, nearestDoorHut, interiorBoxes, interiorFloorColor, interiorCeilingFor, interiorWallBandFor, interiorHearthFor, interiorTileWalkable, rescuePosition, INTERIOR_FLOOR_Y } from './interiors';
import { ROSTER_3D, buildStaticAnchors, buildAnchors, scheduleTileFor, planPathNpc, npcWalkable, pathHasUnwalkableTile, sidestepTile, rosterArchetype, loadClock, saveClock } from './townsfolk3d';
import { spawnTransient, stepTransient, barkLineFor, barkDayEligible, maxVillagerVerts, MAX_TRAVELERS, MAX_ADVENTURERS, MAX_TRANSIENTS, TRAVELER_SPAWN_TICKS, ADVENTURER_SPAWN_TICKS, ADVENTURER_SPAWN_PHASE, BARK_CHECK_MS, BARK_GLOBAL_COOLDOWN_MS, BARK_NPC_COOLDOWN_MS, BARK_RANGE, type TransientActor, type TransientPathState } from './transients';
import { spawnAnimal, stepAnimal, emitAnimal, emitAnimalBlob, animalSpecFor, maxAnimalVerts, ANIMAL_SPAWN_TOPUP_TICKS, BIRD_FLIGHT_HEIGHT, MAX_BIRDS, MAX_GOATS, MAX_DEER, MAX_WOLVES, MAX_CHICKENS, MAX_ANIMALS, type AnimalActor, type AnimalPathState } from './animals';
import { WALK_SPEED, SPRINT_SPEED, STAMINA_MAX, stepStamina, FULL_STAMINA, sprintInput, isSprintTap, latchAfterTap, nextSprintRearm, type StaminaState } from './sprint';
import { resolvePlayerStep, type PerpDir } from './playerStep';
import { planPlayerPath, playerWalkable, PLAYER_REPLAN_MS, PLAYER_STUCK_MS, PLAYER_WAIT_MS, PLAYER_WAYPOINT_ARRIVE, type PlayerPath } from './playerPath';
import { CAR_SPEED, CAR_MAX_VERTS, emitCar, carSpawnTile, carExitTile, isCarNear, carBlocksTile, type CarState } from './car';
import { classifySwipe, SWIPE_HANDLE_MIN_PX, EDGE_STRIP_PX } from './swipe';


type Vec3 = [number, number, number];
type Vertex = number[];
const SAVE_KEY = 'ag-3d-player-v1';
const NPC_SAVE_KEY = 'ag-3d-npcs-v1';
const INVENTORY_KEY = 'ag-3d-inventory-v1';
const HEALTH_KEY = 'ag-3d-health-v1';
type NpcActor3D = { name: string; x: number; y: number; waypoint: number; hp: number; alive: boolean; looted?: boolean };
type Inventory3D = Record<string, number>;
function readSaved<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? { ...fallback, ...JSON.parse(value) } : fallback; } catch { return fallback; }
}
const COLORS: Record<string, Vec3> = {
  grass: [0.31, 0.41, 0.22], dirt: DIRT_TAN, sand: [0.68, 0.59, 0.39],
  stone: [0.48, 0.49, 0.46], water: [0.12, 0.36, 0.57],
  // BUILD 1034: foam — the pale water edge (Stage 2 shores). Display
  // only; walkability still reads the water terrain underneath.
  foam: [0.72, 0.84, 0.87],
};
// BUILD 988: one camera FOV for both cameras + the ground picker. Was
// 60 degrees (Math.PI/3) for both; 66 widens the view ~12% linearly
// (tan33/tan30) without fisheye distortion (half-angle 33 < 45). 72 was
// built first and measured a real town FPS regression in SwiftShader
// (wider wedge = more triangles surviving frustum clipping), so the
// step was cut to 66, the largest step that holds FPS at baseline.
// The ground window stays 45x45 — but BUILD 1002 proved by probe that
// it does NOT cover the visible ground: at max zoom-out the top of
// the frame showed sky where ground should be, an open field rendered
// as a floating mesa, and past the map edge half the frame was sky.
// The window is kept (detail where it matters); the new band + apron
// underlays in buildWorldVertices carry ground to the horizon, and
// the distance fog softens the far window edge instead of a hard
// cutoff.
export const WORLD_FOV_DEG = 66;
export const WORLD_FOV_RAD = (WORLD_FOV_DEG * Math.PI) / 180;
// BUILD 988 distance fog: ground-plane range (tiles from the player)
// over which world geometry fades to the horizon colour. BUILD 1005:
// fog pushed out to the 240-tile view edge (Minecraft-style render
// distance) — near field (<=120) stays crisp, the fade runs 120..240,
// and >=240 is fully horizon colour, so land stays visible across the
// whole view and only blends into sky at the horizon itself. Fog is
// measured from the PLAYER, not the camera, so orbit zoom-out never
// fogs the town itself out. (Before 1005: 14..30 — everything past
// 30 tiles was fully hazed, so visible land effectively ended at the
// ±35 band even though ground geometry reached the horizon.)
// BUILD 1007 — "unlimited" view: the world is 200x200, so the
// farthest real object is ~282 tiles from any viewpoint. Fog stays
// crisp across the ENTIRE world (<=300) and only fades on the plains
// beyond the map (300..600), reaching full horizon colour exactly
// where ground meets sky. Nothing real is ever hazed out.
// BUILD 1007 — far shadow-blob range: house contact shadows are
// ground decals 0.005-0.008 above the ground plane, the detail most
// prone to depth fighting at range (24-bit resolution at camera
// distance d is ~d^2 x 6e-7 with near plane 0.1, so a 0.005 offset
// stops resolving past ~91 tiles of camera distance). Blobs render
// only within 150 tiles of the build centre: that covers every
// in-town view (farthest in-town hut is ~139 tiles from any in-town
// viewpoint), and cross-map views drop a decal that would be a
// couple of dark pixels under a ~10px house anyway. The far-house
// shimmer probe (see verify1007) measures what residual flicker, if
// any, remains on distant houses.
export const FOG_NEAR = 300;
export const FOG_FAR = 600;
export const FAR_BLOB_RANGE = 150;
type Position = { x: number; y: number };

// BUILD 990: interior occupancy is session-only. A saved tile strictly
// inside a hut (not its walkable door tile) means the player quit while
// inside — rescue to that hut's exit point instead of loading the tile
// (the shell is solid again on a fresh load, so the saved tile would be
// a trap). Door-tile saves are kept: door tiles are walkable outside.
export function savedPosition(world: IsoWorld): Position {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Position;
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
        const tx = Math.round(p.x), ty = Math.round(p.y);
        const rescued = rescuePosition([...world.huts, ...placedHutRects(world)], tx, ty);
        if (rescued) return rescued;
        // BUILD 1024: a save past the old edge loads if the wild tile
        // is walkable (grass, no tree/rock/lake); in-map saves use
        // the normal rule.
        const ok = (tx >= 0 && ty >= 0 && tx < world.w && ty < world.h)
          ? walkableWithPlacements(world, world.crates, tx, ty)
          : isWildWalkable(world, tx, ty);
        if (ok) return p;
      }
    }
  } catch { /* use the world's authored spawn */ }
  return { x: world.playerStart.tx, y: world.playerStart.ty };
}

/**
 * Project the authored Mosslight Crossing town blueprint into the independent
 * 3D map. The 2D/2.5D world renderer is untouched: this adapter only changes
 * the 3D view's world snapshot. A fixed transform keeps the whole town inside
 * the 200x200 3D map and keeps the layout deterministic across sessions.
 */
// Exported for standalone build-verification asserts (crate/stall counts
// in the adapted world); the game itself calls it internally only.
export function applyMosslightTownLayout(source: IsoWorld): IsoWorld {
  const world: IsoWorld = {
    ...source,
    terrain: { ...source.terrain },
    // BUILD 1028: walls the user removed stay removed — the filter
    // copies source walls verbatim on every load, so a removed tile
    // would otherwise come back (the 987/989 rule, same as huts).
    walls: source.walls.filter(w => (Math.abs(w.x - 100) > 68 || Math.abs(w.y - 100) > 68) && !(source.removedWalls ?? []).includes(terrainKey(w.x, w.y))),
    // BUILD 1006: a moved hut's CURRENT rect is kept even when it sits
    // near town (the lot loop below would otherwise drop it and the
    // moved record alone cannot re-create a non-layout hut — and for
    // layout lots the present-guard in the lot loop prevents a double
    // stamp, so keeping it is always safe).
    huts: source.huts.filter(h => Math.abs((h.x0 + h.x1) / 2 - 100) > 68 || Math.abs((h.y0 + h.y1) / 2 - 100) > 68
      || (source.movedHuts ?? []).some(m => m.to.x0 === h.x0 && m.to.y0 === h.y0 && m.to.x1 === h.x1 && m.to.y1 === h.y1)),
    stalls: source.stalls.filter(st => Math.abs((st.x0 + st.x1) / 2 - 100) > 68 || Math.abs(st.y0 - 100) > 68),
    trees: [...source.trees],
    rocks: [...source.rocks],
    crates: [...source.crates],
    npcSpawns: source.npcSpawns.map(n => ({ ...n, waypoints: [...(n.waypoints || [])] })),
  };
  // Remove the old demo's straight cross-road stamps; Mosslight's generated
  // street network below replaces them while preserving the pond and other
  // authored terrain outside those legacy road lines.
  for (const [key, terrain] of Object.entries(world.terrain)) {
    if (terrain !== 'dirt') continue;
    const [x, y] = key.split(',').map(Number);
    if (x === 99 || x === 100 || y === 99 || y === 100) delete world.terrain[key];
  }
  const layout = mosslightEngineChunkLayout();
  const scale = 0.42;
  const tile = (v: number) => 100 + (v - 140) * scale;
  const clamp = (v: number) => Math.max(2, Math.min(197, Math.round(v)));
  // BUILD 987: paths the user removed stay removed — the road/plaza
  // rasterizer below would otherwise re-stamp them on every load.
  const removedPathKeys = new Set(world.removedPaths ?? []);
  // BUILD 989: trees and crates the user removed stay removed. Trees are
  // copied verbatim below (never re-stamped), so the tree set is
  // belt-and-braces; the crate set is MANDATORY because the prop loop
  // below re-pushes layout props as crates on every load.
  const removedTreeKeys = new Set(world.removedTrees ?? []);
  const removedCrateKeys = new Set(world.removedCrates ?? []);
  const setTerrain = (x: number, y: number, terrain: 'dirt' | 'sand') => {
    if (removedPathKeys.has(terrainKey(x, y))) return;
    if (x >= 0 && y >= 0 && x < world.w && y < world.h) world.terrain[terrainKey(x, y)] = terrain;
  };

  // Rasterize the actual generated road network into the 3D walk/collision grid.
  for (const road of layout.roads) {
    const pts = road.points.map(p => ({ x: tile(p.x), y: tile(p.y) }));
    const radius = Math.max(0.55, road.width * scale / 2);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius - 1));
      const maxX = Math.min(world.w - 1, Math.ceil(Math.max(a.x, b.x) + radius + 1));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius - 1));
      const maxY = Math.min(world.h - 1, Math.ceil(Math.max(a.y, b.y) + radius + 1));
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const t = len2 ? Math.max(0, Math.min(1, ((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy) / len2)) : 0;
        if (Math.hypot(x + 0.5 - (a.x + t * dx), y + 0.5 - (a.y + t * dy)) <= radius) setTerrain(x, y, 'dirt');
      }
    }
  }

  // The generator's authored plaza becomes the town square, over the road fill.
  for (const plaza of layout.plazas) {
    const cx = tile(plaza.x), cy = tile(plaza.y), radius = Math.max(1, plaza.r * scale);
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++)
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) setTerrain(x, y, 'sand');
  }

  // Convert pinned story-critical buildings and generated filler lots to solid
  // 3D footprints. Facing determines the doorway tile used by movement checks.
  world.huts = [...world.huts];
  for (const lot of layout.lots.filter(l => l.kind === 'building')) {
    const r = lot.footprint;
    const x0 = clamp(Math.floor(tile(r.left))), y0 = clamp(Math.floor(tile(r.top)));
    const x1 = clamp(Math.max(x0, Math.floor(tile(r.right)))), y1 = clamp(Math.max(y0, Math.floor(tile(r.bottom))));
    // BUILD 1006: a moved lot stamps at its record's `to` rect instead
    // of its layout rect — the moved hut never snaps home on reload.
    // The removed-skip checks the TARGET rect: a moved hut removed at
    // its new location stays gone (its record deliberately survives
    // removal — dropping it would resurrect the hut at its layout
    // rect, since the lot loop would no longer know it moved).
    const moved = (world.movedHuts ?? []).find(m => m.from.x0 === x0 && m.from.y0 === y0 && m.from.x1 === x1 && m.from.y1 === y1);
    const tx0 = moved ? moved.to.x0 : x0, ty0 = moved ? moved.to.y0 : y0;
    const tx1 = moved ? moved.to.x1 : x1, ty1 = moved ? moved.to.y1 : y1;
    // BUILD 987: houses the user removed stay removed — the generator
    // would otherwise re-push the same footprint on every load.
    if ((world.removedHuts ?? []).some(h => h.x0 === tx0 && h.y0 === ty0 && h.x1 === tx1 && h.y1 === ty1)) continue;
    // Already present (far-kept source hut, or a moved-to hut kept by
    // the source filter above) — never stamp twice.
    if (world.huts.some(h => h.x0 === tx0 && h.y0 === ty0 && h.x1 === tx1 && h.y1 === ty1)) continue;
    const midX = Math.round((tx0 + tx1) / 2), midY = Math.round((ty0 + ty1) / 2);
    const door = lot.facing === 'north' ? { x: midX, y: ty0 }
      : lot.facing === 'south' ? { x: midX, y: ty1 }
      : lot.facing === 'west' ? { x: tx0, y: midY } : { x: tx1, y: midY };
    world.huts.push({ x0: tx0, y0: ty0, x1: tx1, y1: ty1, doorX: door.x, doorY: door.y });
  }

  // BUILD 1015: the town's commercial buildings (inn, general store,
  // blacksmith) and the extra wild rocks — pure functions in
  // townAdditions3d.ts, asserted standalone. Stamped after the lot
  // loop and before the prop loop / insideBuilding filter, so
  // trees/rocks/crates under them get cleared and NPC spawns get
  // nudged. No mechanics: buildings only.
  stampTownBuildings(world);
  stampExtraRocks(world);

  // Bring the layout generator's authored market/utility props into the
  // 3D collision grid. Stalls retain their counter collision; other solid
  // props become crates — and BUILD 1049 records WHAT each crate is
  // (world.crateKinds, from the prop kind), so the renderer draws a
  // lamp as a lamp and a barrel as a barrel instead of the 986 pine
  // tree every prop used to render as. The map is re-derived on every
  // load (the layout is deterministic), then merged with carried kinds
  // for props the player moved (a moved prop keeps its shape — its
  // tile is no longer a layout tile, so the derivation alone would
  // lose it; the merge only keeps entries whose crate is still in
  // the world, so a removed prop's kind drops out with it).
  const propCrates: Array<{ x: number; y: number; kind: string }> = [];
  const propDecor: Array<{ tx: number; ty: number; kind: string }> = [];
  for (const prop of layout.props) {
    const x = clamp(tile(prop.x)), y = clamp(tile(prop.y));
    if (world.huts.some(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1)) continue;
    if (!prop.solid) {
      // BUILD 1049: non-solid props (the fountain, the statue) used
      // to be skipped entirely — they rendered as nothing. They are
      // town decor now: drawn by their own shape, never blocking,
      // never removable (no removed-set — the generated-stall rule).
      // BUILD 1051: the stall prop joins them no longer — it is
      // non-solid too, but it is a STALL now, not decor: it goes
      // into world.stalls with stall collision (the 1049 cause,
      // fixed here as Stage 5's market work — the market square
      // finally has a market in it).
      if (prop.kind === 'stall') {
        world.stalls.push({ x0: x, y0: y, x1: Math.min(world.w - 1, x + 1) });
      } else {
        propDecor.push({ tx: x, ty: y, kind: prop.kind });
      }
      continue;
    }
    if (prop.kind === 'stall') {
      world.stalls.push({ x0: x, y0: y, x1: Math.min(world.w - 1, x + 1) });
    } else if (!world.crates.some(c => c.tx === x && c.ty === y) && !removedCrateKeys.has(terrainKey(x, y))) {
      world.crates.push({ tx: x, ty: y });
      propCrates.push({ x, y, kind: prop.kind });
    }
  }
  world.propDecor = propDecor;
  const kinds: Record<string, string> = crateKindsForProps(propCrates);
  for (const [k, v] of Object.entries(source.crateKinds ?? {})) {
    if (!(k in kinds) && world.crates.some(c => terrainKey(c.tx, c.ty) === k)) kinds[k] = v;
  }
  world.crateKinds = kinds;

  // BUILD 1051: the market. The blueprint stall above is one stall;
  // the square needs a row. marketStallSpots (settlements.ts) scans
  // the blueprint stall's row for verified-clear 2x1 spots — west
  // first, then east, fixed order — and stamps up to two more, so
  // the market is one compact row (the generator's BUILD 759
  // intent), never a stall on a road, a garden, or a doorstep.
  for (const s of marketStallSpots(world)) world.stalls.push({ x0: s.x0, y0: s.y0, x1: s.x1 });
  // A tree, rock, or crate standing on a stall tile would clip
  // through the counter (the insideBuilding pattern, one step later
  // — the prop loop above only clears under huts). Verified a no-op
  // on the current world (the design probe found the row clear),
  // but it guards the row against a future layout change the way
  // insideBuilding guards the huts.
  const stallTiles = new Set(world.stalls.flatMap((s) => { const out: string[] = []; for (let x = s.x0; x <= s.x1; x++) out.push(terrainKey(x, s.y0)); return out; }));
  world.trees = world.trees.filter((t) => !stallTiles.has(terrainKey(t.tx, t.ty)));
  world.rocks = world.rocks.filter((r) => !stallTiles.has(terrainKey(r.tx, r.ty)));
  world.crates = world.crates.filter((c) => !stallTiles.has(terrainKey(c.tx, c.ty)));

  // BUILD 1051: fixed wild landmarks (settlements.ts) — the ruined
  // tower SW, the standing stones NE, the hunter's camp E. Stamped
  // fresh on every load (stampLandmarks replaces whatever the save
  // carried), so they can never duplicate or drift. They block on
  // their solid tiles (isWalkableWorld), are never removable, and
  // ride the heightfield like everything else.
  stampLandmarks(world);

  // Remove harvestables accidentally placed under the new building footprints.
  const insideBuilding = (x: number, y: number) => world.huts.some(h =>
    x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  world.trees = world.trees.filter(t => !insideBuilding(t.tx, t.ty) && !removedTreeKeys.has(terrainKey(t.tx, t.ty)));
  world.rocks = world.rocks.filter(t => !insideBuilding(t.tx, t.ty));
  world.crates = world.crates.filter(t => !insideBuilding(t.tx, t.ty));

  // Keep existing 3D NPC save names/schedules, but nudge authored demo spawns
  // off new building footprints so they can still walk around the town.
  world.npcSpawns = world.npcSpawns.map((npc, index) => {
    if (!insideBuilding(Math.round(npc.x), Math.round(npc.y))) return npc;
    const originX = Math.round(npc.x), originY = Math.round(npc.y);
    for (let radius = 1; radius <= 8; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = originX + dx, y = originY + dy;
      if (isWalkableWorld(world, world.crates, x, y)) {
        const waypoints = (npc.waypoints || []).map((p, i) => i === 0 ? { tx: x, ty: y } : p);
        return { ...npc, x, y, waypoints };
      }
    }
    return { ...npc, x: 100 + index, y: 106 };
  });
  return world;
}

// BUILD 993: the 2.5D Mosslight roster replaces the 4 demo placeholders.
// Migration: a save containing 'Bram' (a demo-only name) is a demo-era
// save — its positions are discarded and the roster starts at home
// doorsteps. A roster-era save restores positions for matching names when
// the tile is still walkable and outside every hut; looted residents stay
// gone (the demo behavior, unchanged). The waypoint field is legacy and
// ignored — schedules recompute destinations from the clock every tick.
// Exported for standalone build-verification asserts (migration proofs).
export function savedNpcActors(world: IsoWorld): NpcActor3D[] {
  const statics = buildStaticAnchors(world);
  const anchors = buildAnchors(world, statics);
  const homeTile = (homeKey: string) => anchors.points[homeKey] ?? anchors.plaza;
  // BUILD 998: never spawn/restore two figures on one tile. Several
  // roster NPCs share a homeKey (cottage-6 holds four), so bare
  // doorstep starts stacked up to four figures on one tile — the
  // visible "standing inside each other" the 993 probe caught (47
  // NPCs, 46 distinct tiles). The first roster NPC keeps its tile
  // exactly; later duplicates nudge to the nearest NPC-walkable free
  // tile (spiral, radius 8). Fallback keeps the tile rather than
  // failing the load.
  const usedTiles = new Set<string>();
  const dedupTile = (tx: number, ty: number): { x: number; y: number } => {
    const key = tx + ',' + ty;
    if (!usedTiles.has(key)) { usedTiles.add(key); return { x: tx, y: ty }; }
    for (let radius = 1; radius <= 8; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = tx + dx, y = ty + dy;
      if (usedTiles.has(x + ',' + y) || !npcWalkable(world, x, y)) continue;
      usedTiles.add(x + ',' + y);
      return { x, y };
    }
    return { x: tx, y: ty };
  };
  const startAtHome = (npc: { name: string; homeKey: string }): NpcActor3D => {
    const t = homeTile(npc.homeKey);
    const d = dedupTile(t.x, t.y);
    return { name: npc.name, x: d.x, y: d.y, waypoint: 0, hp: 100, alive: true };
  };
  const insideHut = (x: number, y: number) => world.huts.some((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  try {
    const raw = localStorage.getItem(NPC_SAVE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as NpcActor3D[];
      if (Array.isArray(saved) && !saved.some((a) => a && a.name === 'Bram')) {
        const out: NpcActor3D[] = [];
        for (const npc of ROSTER_3D) {
          const s = saved.find((a) => a && a.name === npc.name);
          if (s && !s.looted && Number.isFinite(s.x) && Number.isFinite(s.y)) {
            const tx = Math.round(s.x);
            const ty = Math.round(s.y);
            if (!insideHut(tx, ty) && walkableWithPlacements(world, world.crates, tx, ty)) {
              const d = dedupTile(tx, ty);
              const nudged = d.x !== tx || d.y !== ty;
              out.push({ name: npc.name, x: nudged ? d.x : s.x, y: nudged ? d.y : s.y, waypoint: 0, hp: Number.isFinite(s.hp) ? s.hp : 100, alive: s.alive !== false });
              continue;
            }
          }
          if (s && s.looted) continue; // looted residents stay gone
          out.push(startAtHome(npc));
        }
        return out;
      }
    }
  } catch { /* fall through to homes */ }
  return ROSTER_3D.map((npc) => startAtHome(npc));
}

// Exported for standalone build-verification asserts (synthetic render
// proofs); the game itself calls it internally only.
// BUILD 1024: detail emission radii (tiles, player-centred, NOT
// clamped to the map — the world is infinite now, so the ranges
// follow the player). Grass tufts are the expensive kind, measured
// in ~/workspace/verify1024: a ±22 window costs 28k verts at town
// (54k in full grass), ±32 costs 74k/111k, ±48 costs 200k/224k,
// ±64 costs 382k/372k, and whole-map grass is 960k verts — 6x the
// current 186k-vert buffer, genuinely prohibitive, which is why the
// order's "or farther away" is the shipped form for grass. Flowers
// and pebbles are cheap (±64: ~9k verts) and wild trees/rocks are
// sparse (~3k verts at ±64), so they go to the far range, where a
// flower popping is sub-pixel. The radii are the FPS-measured
// compromise (see the 1024 probe): ±48 grass cost −30% town FPS
// and −56% wilderness FPS in the harness (too much — cut to ±32),
// ±32 grass + ±64 far holds the total vertex growth to the ~+30%
// band 1022 proved is free. A tuft popping at the ±32 edge is ~11px
// (was ~16px at ±22); a wild tree popping at the ±64 edge is a far
// silhouette at the generation frontier, where new land appears as
// the player walks — disclosed as a limit, not a glitch in the
// already-generated world. (Measured in the harness, town /
// wilderness FPS, pristine 1023 = 7.6 / 13.1: ±48 grass = 5.3 / 5.8
// (−30% / −56%, too much); ±32 = 6.4 / 7.2 (−16% / −45%);
// ±28 = 6.8 / 7.5 (−11% / −43%), the shipped radii — the
// wilderness now runs at the old town's speed because it carries a
// real scene (grass, trees, lakes) instead of an empty buffer.
// Rebuild hitch: pristine 283ms, ±28 317ms. A tuft popping at the
// ±28 edge is ~13px (was ~16px at ±22).)
const DETAIL_GRASS_HALF = 28;
const DETAIL_FAR_HALF = 64;
// BUILD 1026: WORLD_REBUILD_DIST — the player must move this far from
// the last build centre before the whole world buffer rebuilds. Was
// 8 (BUILD 983); repro2 measured one ~150–250ms-above-baseline hitch
// frame per rebuild, and at sprint speed the rebuilds come 56% more
// often per second (same per-tile rate, faster travel), which is the
// stutter the user feels. 16 halves the hitch rate. Safe: the ground
// window is ±22 (≥6 tiles of margin at 16) and grass ±28 (≥12).
export const WORLD_REBUILD_DIST = 16;
// BUILD 1035 — REBUILD_STEP_BUDGET_MS: the per-frame time budget for
// one step of a time-sliced world rebuild while the player is MOVING
// (driving/walking). 10ms leaves headroom for the frame's own draw
// (~8ms on a real phone) inside a 16ms frame, so no frame hitches;
// a ~200ms rebuild then finishes in ~20 frames (~0.33s), during which
// the car travels ~10 tiles — inside the ±22 window, so the player
// never outruns the buffer. While STATIONARY the driver passes
// Infinity (run to completion in one frame), so a placement or an
// enter/exit appears immediately, exactly like the old synchronous
// path — the budget only binds while moving, which is when the
// stutter lived.
export const REBUILD_STEP_BUDGET_MS = 10;
export function* buildWorldVerticesGen(world: IsoWorld, center: Position, enteredHut: HutRect | null = null, customAssets: CustomAsset[] = []): Generator<void, Float32Array, void> {
  const data: Vertex = [];
  // BUILD 988 distance fog, BAKED (not shader-side): every emitted
  // vertex colour is mixed toward the horizon colour by ground-plane
  // distance from the build centre (the player position at rebuild
  // time), smoothstep FOG_NEAR..FOG_FAR. Zero per-frame cost — the
  // shader stays trivial — and the 45x45 window edge reads as haze
  // instead of a hard cutoff. BUILD 1002: the band + apron underlays
  // below continue that fade past the window edge out to the horizon,
  // so the fog no longer ends at a geometry edge. Cost of baking: the
  // fog centre goes stale as the player walks (rebuilds recentre it
  // every >8 tiles), so far-field haze shifts subtly on rebuild; near
  // field (<=300 tiles, BUILD 1007) is always unfogged — the whole
  // world stays crisp, and only the plains beyond the map fade — and
  // 8 tiles of staleness is under 3% of the 300-tile fog range, far
  // less visible than at 1002's 30-tile range. A shader-side fog was
  // measured first and cost frames in SwiftShader, so it was replaced
  // by this baked form. NOTE: figures are NOT fogged (see the actor
  // section) — deliberate, so people stay visible at range.
  const fogAt = (x: number, z: number) => {
    // BUILD 1035: Math.sqrt, not Math.hypot — identical values for
    // these magnitudes (no overflow: |dx|,|dz| < 2000), and hypot's
    // varargs/overflow handling is measurably slower per call.
    const dx = x - (center.x + .5), dz = z - (center.y + .5);
    const d = Math.sqrt(dx * dx + dz * dz);
    const t = Math.min(1, Math.max(0, (d - FOG_NEAR) / (FOG_FAR - FOG_NEAR)));
    return t * t * (3 - 2 * t);
  };
  // BUILD 988: explicit 6-arg pushes, not spreads — the world rebuild
  // emits ~60k vertices every time the player moves >8 tiles, and
  // spreading small arrays in that loop was the rebuild's main cost.
  // Fog is mixed inline per vertex (no temp arrays).
  const tri = (a: Vec3, b: Vec3, c: Vec3, color: Vec3) => {
    const fa = fogAt(a[0], a[2]), fb = fogAt(b[0], b[2]), fc = fogAt(c[0], c[2]);
    data.push(a[0], a[1], a[2], color[0] + (SKY_HORIZON[0] - color[0]) * fa, color[1] + (SKY_HORIZON[1] - color[1]) * fa, color[2] + (SKY_HORIZON[2] - color[2]) * fa,
      b[0], b[1], b[2], color[0] + (SKY_HORIZON[0] - color[0]) * fb, color[1] + (SKY_HORIZON[1] - color[1]) * fb, color[2] + (SKY_HORIZON[2] - color[2]) * fb,
      c[0], c[1], c[2], color[0] + (SKY_HORIZON[0] - color[0]) * fc, color[1] + (SKY_HORIZON[1] - color[1]) * fc, color[2] + (SKY_HORIZON[2] - color[2]) * fc);
  };
  // BUILD 985: per-vertex-colour triangle for grass blades (the flat
  // tri() above forces one colour per triangle; grass needs the shader
  // gradient evaluated at each corner, interpolated by the rasterizer).
  // BUILD 988: grass corners are fogged like everything else.
  const triV = (a: Vec3, ca: Vec3, b: Vec3, cb: Vec3, c: Vec3, cc: Vec3) => {
    const fa = fogAt(a[0], a[2]), fb = fogAt(b[0], b[2]), fc = fogAt(c[0], c[2]);
    data.push(a[0], a[1], a[2], ca[0] + (SKY_HORIZON[0] - ca[0]) * fa, ca[1] + (SKY_HORIZON[1] - ca[1]) * fa, ca[2] + (SKY_HORIZON[2] - ca[2]) * fa,
      b[0], b[1], b[2], cb[0] + (SKY_HORIZON[0] - cb[0]) * fb, cb[1] + (SKY_HORIZON[1] - cb[1]) * fb, cb[2] + (SKY_HORIZON[2] - cb[2]) * fb,
      c[0], c[1], c[2], cc[0] + (SKY_HORIZON[0] - cc[0]) * fc, cc[1] + (SKY_HORIZON[1] - cc[1]) * fc, cc[2] + (SKY_HORIZON[2] - cc[2]) * fc);
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3) => { tri(a, b, c, color); tri(a, c, d, color); };
  // BUILD 1009: per-corner-colour quad (two triV calls). Ground tint is
  // a continuous field of position, so ground quads MUST carry one tint
  // per corner: adjacent quads share corner positions and therefore
  // corner colours exactly, which is what makes ring boundaries
  // invisible. A single-colour quad() here would reintroduce the flat
  // tint blocks the 1009 tint field exists to remove.
  const quadV = (a: Vec3, ca: Vec3, b: Vec3, cb: Vec3, c: Vec3, cc: Vec3, d: Vec3, cd: Vec3) => { triV(a, ca, b, cb, c, cc); triV(a, ca, c, cc, d, cd); };
  // BUILD 988: cube faces use the unified SUN_SHADE table (sun from
  // northwest-high, matching the house shadow blobs): +z south shaded,
  // -z north lit, -x west near-lit, +x east darkest, top brightest.
  // BUILD 1034: baseY lifts the cube onto the heightfield (the ground
  // it stands on); 0 keeps the old flat behaviour for callers that
  // already pass an absolute y0 (houseBox/box do their own).
  const cube = (x: number, z: number, w: number, h: number, d: number, color: Vec3, baseY = 0) => {
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y0=baseY,y1=baseY+h;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],shadeRgb(color, SUN_SHADE.south));
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],shadeRgb(color, SUN_SHADE.north));
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],shadeRgb(color, SUN_SHADE.west));
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],shadeRgb(color, SUN_SHADE.east));
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],shadeRgb(color, SUN_SHADE.top));
  };
  // BUILD 1024: the detailed ground window is player-centred and NO
  // LONGER clamped to the 200x200 map — the world is infinite now, so
  // the window follows the player past the old edge. Out-of-map tiles
  // take wild terrain (grass, or a lake) through effTerrain below.
  const minX=Math.floor(center.x)-22, maxX=Math.floor(center.x)+22;
  const minY=Math.floor(center.y)-22, maxY=Math.floor(center.y)+22;
  // BUILD 984: placed paths render exactly like generated dirt roads.
  // BUILD 1027: placed water renders exactly like generated water
  // (ocean/pond) — and wins over a placed path on the same tile, so a
  // water tile can never silently read as dirt.
  // BUILD 1034: the effective terrain is now the shared wildTerrain
  // effTerrainFor (identical rule — placed water wins, then placed
  // paths read as dirt, then stored terrain, then wild terrain) so the
  // ground, the surface, the picker and the camera all read one
  // definition instead of a local copy.
  const effTerrain=effTerrainFor(world);
  // BUILD 1034: the ground corners are shared between adjacent cells,
  // so the surface is computed once per corner per rebuild (a Map
  // keyed by the integer corner coords) instead of 4x per cell. Without
  // this the heightfield costs ~+30% rebuild time (68k surface calls);
  // with it the cost is ~+5% (17k unique corners). The cache is local
  // to this rebuild — the field is deterministic, so a per-rebuild
  // cache is always correct, and it is dropped when the rebuild ends.
  // (Coords are integers in [-1000,1000]; the key is collision-free
  // for cy+2048 in [0,4096).)
  const surfCache=new Map<number,number>();
  const surfAt=(cx:number,cy:number):number=>{
    const key=(cx+2048)*4096+(cy+2048);
    let v=surfCache.get(key);
    if(v===undefined){v=surfaceElevation(effTerrain,cx,cy);surfCache.set(key,v);}
    return v;
  };
  // BUILD 1035: per-rebuild tint cache. groundTintDelta is pure in
  // (terrain, x, y) and the same corner is evaluated 2-4x — shared
  // corners across adjacent tiles, runs and cells — each evaluation
  // costing 4 groundNoise calls (16 sin-hash calls; the CPU profile
  // put groundTintDelta at ~17% of rebuild time). The cache makes
  // repeats a Map hit; values are identical, only faster. Key: the
  // terrain code in the high bits + the integer tile key. Dropped
  // with the rebuild (local, like surfCache).
  const tintCache=new Map<number,Vec3>();
  const tintAt=(terrain:string,x:number,y:number):Vec3=>{
    const tc=terrain==='grass'?0:terrain==='dirt'?1:terrain==='sand'?2:terrain==='stone'?3:terrain==='water'?4:5;
    const key=tc*16777216+(x+2048)*4096+(y+2048);
    let v=tintCache.get(key);
    if(v===undefined){v=groundTintDelta(terrain,x,y);tintCache.set(key,v);}
    return v;
  };
  // BUILD 1035: time-sliced rebuild — the generator yields between
  // work chunks so the render loop can spread one rebuild over many
  // frames (see createWorldBuilder). Each yield below is a chunk
  // boundary; no single chunk may run long (the driver budgets ~10ms
  // while the player moves). The synchronous wrapper below runs the
  // generator to completion for the sim and the first frame.
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
    // BUILD 1034: display terrain (shores + stone, via renderTerrain)
    // and the heightfield: every ground corner sits on the shared
    // surface, so the window rolls with the hills and adjacent tiles
    // share corner heights exactly — no cracks, no floating tiles.
    const terrain=renderTerrain(effTerrain,x,y);
    const c=COLORS[terrain]||COLORS.grass;
    // BUILD 1009: tint evaluated PER CORNER from the continuous 1009
    // field (see townLook groundTintDelta). Adjacent tiles share corner
    // positions and therefore corner colours exactly — the near field
    // reads as rolling variation, not a checkerboard, and the window
    // edge is invisible because the band cells beyond it sample the
    // same field at their own corners.
    const colAt=(cx:number,cy:number):Vec3=>{const t=tintAt(terrain,cx,cy);return [c[0]+t[0],c[1]+t[1],c[2]+t[2]];};
    const yAt=(cx:number,cy:number):number=>surfAt(cx,cy);
    quadV([x,yAt(x,y),y],colAt(x,y),[x+1,yAt(x+1,y),y],colAt(x+1,y),[x+1,yAt(x+1,y+1),y+1],colAt(x+1,y+1),[x,yAt(x,y+1),y+1],colAt(x,y+1));
    if(x===maxX&&(y-minY)%4===3)yield;
  }
  // BUILD 1022: path slabs + cobble shoulders render for the WHOLE map,
  // not just the ±22 detailed window. They used to pop in and out at the
  // window edge as the player walked (the window rebuilds on >8-tile
  // moves, so a cobble tile 23 tiles out was plain grass and 21 tiles
  // out was dark cobble). The overlay quads below are identical to the
  // ones the window loop used to emit (same functions, same y heights,
  // same colours) — the near view is pixel-identical; only the tile set
  // grows from the window to the map. Cost, counted in
  // ~/workspace/verify1022 (1,202 dirt tiles, 1,490 near-dirt tiles):
  // 59,154 overlay verts whole-map vs 18,986 in-window at the default
  // start (+40,168 verts, +28% of the 143,772-vert world buffer).
  // Grass tufts, wildflowers and pebbles stay window-only (separate
  // systems, out of scope for this fix).
  // BUILD 1041: farm-land soil rides this same whole-map loop (the
  // wheat stalks are per-frame fx, also whole-map, so a field reads
  // the same at every zoom — soil and wheat never disagree).
  const farmKeys=placedFarmKeyInts(world);
  for(let y=0;y<world.h;y++) for(let x=0;x<world.w;x++) {
    const terrain=effTerrain(x,y);
    // BUILD 1034: overlays ride the heightfield — a slab/cobble at a
    // fixed y would float over a hollow or sink into a rise. Slabs and
    // cobble squares take the surface at their centre (+ the offset);
    // the full-tile cobble shoulder takes per-corner surface heights
    // like the ground quad under it. The offsets still clear the ring
    // layers (band -0.02, far -0.05, horizon -0.08) because both the
    // overlays and the rings are measured from the same surface.
    if(terrain==='dirt'){
      const slabs=streetSlabsFor(x,y);
      for(let i=0;i<slabs.length;i++){
        const s=slabs[i],sy=surfaceElevation(effTerrain,x+s.dx+s.w/2,y+s.dz+s.d/2)+.03+i*.002;
        quad([x+s.dx,sy,y+s.dz],[x+s.dx+s.w,sy,y+s.dz],[x+s.dx+s.w,sy,y+s.dz+s.d],[x+s.dx,sy,y+s.dz+s.d],[s.shade,s.shade,s.shade*.96]);
      }
    } else if(terrain==='grass'||terrain==='stone'){
      const nearDirt=(x>0&&effTerrain(x-1,y)==='dirt')||(x<world.w-1&&effTerrain(x+1,y)==='dirt')||(y>0&&effTerrain(x,y-1)==='dirt')||(y<world.h-1&&effTerrain(x,y+1)==='dirt');
      if(nearDirt){
        const cY=(cx:number,cy:number):number=>surfAt(cx,cy)+.018;
        quadV([x,cY(x,y),y],COBBLE_GAP,[x+1,cY(x+1,y),y],COBBLE_GAP,[x+1,cY(x+1,y+1),y+1],COBBLE_GAP,[x,cY(x,y+1),y+1],COBBLE_GAP);
        for(const sq of cobbleSquaresFor(x,y)){
          const qy=surfaceElevation(effTerrain,x+sq.dx+sq.size/2,y+sq.dz+sq.size/2)+.022;
          quad([x+sq.dx,qy,y+sq.dz],[x+sq.dx+sq.size,qy,y+sq.dz],[x+sq.dx+sq.size,qy,y+sq.dz+sq.size],[x+sq.dx,qy,y+sq.dz+sq.size],[sq.shade,sq.shade,sq.shade*.97]);
        }
      }
    }
    // BUILD 1041: farm land — a tilled-soil slab riding the
    // heightfield (+0.03, the slab offset) with three darker furrow
    // strips, so a field reads as ploughed earth even before the
    // wheat grows. The wheat itself is per-frame fx (houseFx.ts).
    if(farmKeys.has(tileKeyInt(x,y))){
      const sy=surfaceElevation(effTerrain,x+.5,y+.5)+.03;
      quad([x,sy,y],[x+1,sy,y],[x+1,sy,y+1],[x,sy,y+1],FARM_SOIL);
      for(let f=0;f<3;f++){
        const fz=y+.22+f*.28,fy=sy+.002;
        quad([x+.06,fy,fz],[x+.94,fy,fz],[x+.94,fy,fz+.12],[x+.06,fy,fz+.12],FARM_FURROW);
      }
    }
    if(x===world.w-1&&y%5===4)yield;
  }
  // BUILD 1002 — far ground: the detailed window above ends 22 tiles
  // out, but the visible ground reaches ~79 tiles at default orbit
  // zoom and ~150 at max zoom-out, and past the 200x200 map edge there
  // is no window at all (the map-edge probe showed half the frame as
  // sky). Underlays close that gap, all centred on the build centre
  // (NOT clamped to the map) so they cover the map exterior too.
  // (a) a coarse band of VIEW_BAND_CELL-tile cells out to
  // VIEW_BAND_HALF, terrain-sampled at each cell centre (roads and
  // fields continue coarsely past the window) and fogged per vertex
  // by the same tri(). The band square deliberately overlaps the
  // window (64 > 22 + the 8-tile rebuild staleness), so a stale
  // window edge still sits on band. That overlap is safe: at <=64
  // tiles, 24-bit depth resolution (<=0.0024) is far under the 0.02
  // layer separation.
  // BUILD 1005 — (b) a far band of VIEW_FAR_BAND_CELL-tile cells out
  // to VIEW_FAR_BAND_HALF (240), sampled the same way (terrainAt
  // falls back to grass past the 200x200 map, so the plains correctly
  // continue to the horizon). Graduated cells keep the vertex budget
  // bounded: 1089 near quads + 961 far quads (edge slivers included).
  // BUILD 1007 — far ground as NON-OVERLAPPING rings. At 300+ tiles,
  // depth resolution (~d^2 x 6e-7, near plane 0.1) exceeds the old
  // 0.02-0.05 layer separations, so overlapping far layers WOULD
  // z-fight. Instead each far layer owns an exclusive ring of the
  // plane (adjacent rects, shared edges, no shared area): far ring
  // (64,240] at 16-tile cells, horizon ring (240,600] at 64-tile
  // cells, apron ring (600,1000] as 4 quads. Rings cannot fight at
  // any range because no two layers occupy the same ground point;
  // the y values stay monotonic as belt-and-braces. The apron ring's
  // vertices all sit past FOG_FAR, so tri() fogs them to exactly
  // SKY_HORIZON — uniform horizon colour meeting the sky gradient's
  // horizon colour, never a cutoff. Cell convention: fillCells takes
  // INCLUSIVE tile bounds and covers continuous [x0, x1+1), exactly
  // like the old square loops, so ring edges tile exactly against
  // the neighbouring layers (band square covers [cx-64, cx+65), so
  // the far ring's inner hole is that same interval).
  {
    // BUILD 1008 — dirt subdivision for far cells. A far cell used to
    // render dirt only when its CENTRE tile happened to be dirt, so
    // 1-2-tile roads dissolved into grass at distance (corner probes
    // on 1007: 0/11 and 0/12 dirt on the open-country road past 64
    // tiles, placed-path span only 37/102 dirt at 120 tiles). Cells
    // containing ANY dirt tile are now subdivided into per-row runs
    // of equal terrain — dirt runs render as dirt, the rest as their
    // own terrain — all at the same ring y, non-overlapping (the
    // 1007 ring philosophy applied within a cell, so no z-fighting
    // at any range). Cells with no dirt keep the single
    // centre-sampled quad (fast path, pixel-identical to before).
    // BUILD 1027 — generalised to MIXED cells (was dirt-only in
    // 1008): the same centre-sampled problem applies to
    // water — without it the ocean coastline would step in 16/64-tile
    // blocks at distance, and the pond would vanish or flood a whole
    // 4-tile band cell. The trigger is now "the cell holds 2+
    // distinct terrains" (in-map scan; a uniform water cell keeps the
    // fast path, so the open ocean stays one quad) OR "the cell
    // straddles the ocean coastline" (analytic coast test — the coast
    // is a smooth 1D function, so sampling it across the cell's
    // y-range is enough, no per-tile scan of the infinite west).
    // BUILD 1031 — the mix scan is no longer clipped to the map for
    // small cells: cellIsMixed (wildTerrain.ts) scans the WHOLE cell
    // when it is <=256 tiles (band 4x4, far 16x16), so wild lakes
    // render as their actual tiles and stay put as the player-centred
    // grid shifts. This RETIRES the 1024 accepted limit ("wild lakes
    // stay centre-sampled at distance") — it became the user-reported
    // bug: a lake whose centre tile was water rendered as one solid
    // blue quad, one whose centre was grass rendered as no water at
    // all, and both flipped as the player walked. Horizon cells
    // (64x64) keep the clipped scan + coast test: a full scan there
    // is ~1.2M noise calls per rebuild and the ring starts at 240
    // tiles, past the ~150-tile visible ground at max zoom-out.
    // Dirt can only exist inside the map (terrainAt falls back to
    // grass outside it, placed paths are bounds-checked).
    // BUILD 1034: the far cells ride the heightfield too — every ring
    // quad's corners sit on the shared surface plus the ring's y offset
    // (band -0.02, far -0.05, horizon -0.08), so the rings step down
    // exactly as before and never z-fight where they overlap. `tf` is
    // the DISPLAY terrain: the band (close enough to see) uses
    // renderTerrain (shores + stone), so a grass+stone cell subdivides
    // and the outcrop renders; the far/horizon rings use plain
    // effTerrain (a 1-3 tile shore or outcrop is sub-pixel past 64
    // tiles, and the full renderTerrain scan there would cost ~130ms).
    // The corner heights always use effTerrain (the real water/land),
    // never the display terrain — the land blend is about water.
    const quadCellMixed=(x0:number,x1:number,y0:number,y1:number,y:number,tf:(x:number,y:number)=>string)=>{
      const yAt=(cx:number,cy:number):number=>surfAt(cx,cy)+y;
      const mixed=cellIsMixed(x0,x1,y0,y1,tf,world.w,world.h);
      if(!mixed){
        const sx=x0+Math.floor((x1+1-x0)/2), sy=y0+Math.floor((y1+1-y0)/2);
        const bt=tf(sx,sy), bc=COLORS[bt]||COLORS.grass;
        // BUILD 1009: per-corner tint from the continuous field. The
        // old single centre-sampled tint made every far cell one flat
        // block; corner sampling turns the same cell into a smooth
        // gradient of the same field the window samples directly, so
        // the cell edges vanish. Adjacent cells share corner positions
        // and therefore colours exactly — no seams at any ring edge.
        const colAt=(cx:number,cy:number):Vec3=>{const t=tintAt(bt,cx,cy);return [bc[0]+t[0],bc[1]+t[1],bc[2]+t[2]];};
        quadV([x0,yAt(x0,y0),y0],colAt(x0,y0),[x1+1,yAt(x1+1,y0),y0],colAt(x1+1,y0),[x1+1,yAt(x1+1,y1+1),y1+1],colAt(x1+1,y1+1),[x0,yAt(x0,y1+1),y1+1],colAt(x0,y1+1));
        return;
      }
      for(let yy=y0;yy<=y1;yy++){
        let runStart=x0, runT=tf(x0,yy);
        for(let xx=x0+1;xx<=x1+1;xx++){
          const t=xx<=x1?tf(xx,yy):null;
          if(t!==runT){
            // BUILD 1009: dirt runs keep the 1008 subdivision geometry
            // (roads still render to their ends) but take per-corner
            // tint like every other ground quad, so a road's tint
            // varies smoothly along its length instead of stepping
            // once per run.
            const bc=COLORS[runT]||COLORS.grass;
            const colAt=(cx:number,cy:number):Vec3=>{const tt=tintAt(runT,cx,cy);return [bc[0]+tt[0],bc[1]+tt[1],bc[2]+tt[2]];};
            quadV([runStart,yAt(runStart,yy),yy],colAt(runStart,yy),[xx,yAt(xx,yy),yy],colAt(xx,yy),[xx,yAt(xx,yy+1),yy+1],colAt(xx,yy+1),[runStart,yAt(runStart,yy+1),yy+1],colAt(runStart,yy+1));
            runStart=xx; runT=t!;
          }
        }
      }
    };
    const renderTf=(x:number,y:number):string=>renderTerrain(effTerrain,x,y);
    const bx0=Math.floor(center.x)-VIEW_BAND_HALF, bx1=Math.floor(center.x)+VIEW_BAND_HALF;
    const by0=Math.floor(center.y)-VIEW_BAND_HALF, by1=Math.floor(center.y)+VIEW_BAND_HALF;
    for(let y=by0;y<=by1;y+=VIEW_BAND_CELL) for(let x=bx0;x<=bx1;x+=VIEW_BAND_CELL){
      const w=Math.min(VIEW_BAND_CELL,bx1+1-x), d=Math.min(VIEW_BAND_CELL,by1+1-y);
      quadCellMixed(x,x+w-1,y,y+d-1,VIEW_BAND_Y,renderTf);
      if(x+VIEW_BAND_CELL>bx1)yield;
    }
    function* fillCells(x0:number,x1:number,y0:number,y1:number,cell:number,y:number,tf:(x:number,y:number)=>string):Generator<void,void,void>{
      for(let yy=y0;yy<=y1;yy+=cell){ for(let xx=x0;xx<=x1;xx+=cell){
        const w=Math.min(cell,x1+1-xx), d=Math.min(cell,y1+1-yy);
        quadCellMixed(xx,xx+w-1,yy,yy+d-1,y,tf);
      } yield; }
    }
    function* fillRing(inner:number,outer:number,cell:number,y:number,tf:(x:number,y:number)=>string):Generator<void,void,void>{
      const cx=Math.floor(center.x), cy=Math.floor(center.y);
      yield* fillCells(cx-outer,cx+outer,cy+inner+1,cy+outer,cell,y,tf);
      yield* fillCells(cx-outer,cx+outer,cy-outer,cy-inner-1,cell,y,tf);
      yield* fillCells(cx-outer,cx-inner-1,cy-inner,cy+inner,cell,y,tf);
      yield* fillCells(cx+inner+1,cx+outer,cy-inner,cy+inner,cell,y,tf);
    }
    yield* fillRing(VIEW_BAND_HALF,VIEW_FAR_BAND_HALF,VIEW_FAR_BAND_CELL,VIEW_FAR_BAND_Y,effTerrain);
    yield* fillRing(VIEW_FAR_BAND_HALF,VIEW_HORIZON_BAND_HALF,VIEW_HORIZON_BAND_CELL,VIEW_HORIZON_BAND_Y,effTerrain);
    {
      const cx=Math.floor(center.x), cy=Math.floor(center.y), A=VIEW_APRON_HALF, I=VIEW_HORIZON_BAND_HALF, y=VIEW_APRON_Y;
      quad([cx-A,y,cy+I+1],[cx+A+1,y,cy+I+1],[cx+A+1,y,cy+A+1],[cx-A,y,cy+A+1],COLORS.grass);
      quad([cx-A,y,cy-A],[cx+A+1,y,cy-A],[cx+A+1,y,cy-I],[cx-A,y,cy-I],COLORS.grass);
      quad([cx-A,y,cy-I],[cx-I,y,cy-I],[cx-I,y,cy+I+1],[cx-A,y,cy+I+1],COLORS.grass);
      quad([cx+I+1,y,cy-I],[cx+A+1,y,cy-I],[cx+A+1,y,cy+I+1],[cx+I+1,y,cy+I+1],COLORS.grass);
    }
  }
  // BUILD 986: houseBox moved above the stall loop so the shared tree
  // renderer below can serve stalls and crates too (same scope, same
  // code — only its position in the function changed).
  // BUILD 988: same unified SUN_SHADE table as cube() (houseBox used
  // .78/.88/.72 before, disagreeing with both cube() and the shadow
  // blobs). Trees, posts, beams and chimneys inherit it automatically.
  const houseBox=(x:number,z:number,w:number,h:number,d:number,y0:number,color:Vec3)=>{
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y1=y0+h;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],shadeRgb(color, SUN_SHADE.south));
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],shadeRgb(color, SUN_SHADE.north));
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],shadeRgb(color, SUN_SHADE.west));
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],shadeRgb(color, SUN_SHADE.east));
  };
  // BUILD 990: full box with a base height — cube() fixes y0=0 and
  // houseBox() has no top face, but furniture sits on the interior
  // floor (y0=INTERIOR_FLOOR_Y) and is seen from orbit above, so it
  // needs both. Same SUN_SHADE faces as cube()/houseBox().
  const box=(x:number,z:number,w:number,h:number,d:number,y0:number,color:Vec3)=>{
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y1=y0+h;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],shadeRgb(color, SUN_SHADE.south));
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],shadeRgb(color, SUN_SHADE.north));
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],shadeRgb(color, SUN_SHADE.west));
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],shadeRgb(color, SUN_SHADE.east));
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],shadeRgb(color, SUN_SHADE.top));
  };
  // BUILD 986: the exact 983 tapered-tier tree (trunk + 3 shrinking
  // foliage tiers) — one renderer, never a second tree.
  // BUILD 992 proportion pass: tiers from townLook (total 4.44 =
  // 3.00x character). Same tiles, same collision — only the mesh grows.
  // BUILD 1034: baseY lifts the tree onto the heightfield.
  // BUILD 1049: three shapes (vegetation.ts TREE_SHAPES — pine is the
  // exact 983 tree, oak broad/short, birch slim/tall/pale-trunked).
  // The shape is a pure function of the tile (treeShapeForTile), so
  // the same tile always grows the same tree and a reload shows the
  // same world. Generated trees, wild trees and player-placed trees
  // all go through this one renderer.
  const treeAt=(tx:number,ty:number,baseY=0,shape=treeShapeForTile(tx,ty))=>{
    for(const t of TREE_SHAPES[shape]) houseBox(tx+.5,ty+.5,t.w,t.h,t.w,t.y0+baseY,t.color);
  };
  // BUILD 1049: a generated/authored market stall renders as a stall,
  // not a tree (the 986 placeholder). Counter + two back posts + a
  // canvas awning slab — the same brown counter the player-placed
  // stall keeps below, so the two agree. Max height ~1.9 (a tree is
  // 3.6–4.7), so a stall can never be mistaken for one.
  const stallAt=(x:number,y0:number,baseY=0)=>{
    const cx=x+.5, cz=y0+.5;
    box(cx,cz,1,.75,1,baseY,[.57,.31,.16]);
    houseBox(cx-.42,cz-.42,.09,1.1,.09,baseY+.75,[.23,.16,.1]);
    houseBox(cx+.42,cz-.42,.09,1.1,.09,baseY+.75,[.23,.16,.1]);
    box(cx,cz-.42,1.05,.07,.7,baseY+1.85,[.85,.78,.6]);
  };
  // BUILD 1049: town props render as themselves, not as pine trees
  // (the 986 placeholder — 118 crates in town: lamps, hedges,
  // barrels, fountain, well, windmill, statue, gatehouse, carts, all
  // trees). The kind comes from world.crateKinds (the adapter's
  // derivation from the layout prop kinds); a tile with no entry is
  // a plain wooden crate box. Every shape is a few vertex-colour
  // boxes from the existing vocabulary — a lamp reuses the 1040
  // placed-lantern shape (same post/glass/cap constants, so the two
  // agree), a crate is a box with a lid rim, a barrel is a box with
  // iron bands. Collision is untouched (the whole tile still blocks);
  // only the mesh changes.
  const crateAt=(tx:number,ty:number,baseY=0,kind: CratePropKind='crate')=>{
    const cx=tx+.5, cz=ty+.5;
    const wood:Vec3=[.55,.38,.2], woodDark:Vec3=[.48,.33,.17];
    const stone:Vec3=[.5,.5,.48], stoneDark:Vec3=[.38,.38,.36];
    const timber:Vec3=[.23,.16,.1];
    if(kind==='lamp'){
      houseBox(cx,cz,LANTERN_POST_W,LANTERN_POST_H,LANTERN_POST_W,baseY,LANTERN_TIMBER);
      const gc=lanternBoxCentre(tx,ty,baseY);
      cube(gc[0],gc[2],LANTERN_BOX,LANTERN_BOX,LANTERN_BOX,LANTERN_GLASS_DARK,gc[1]-LANTERN_BOX/2);
      houseBox(cx,cz,LANTERN_CAP,.06,LANTERN_CAP,baseY+LANTERN_POST_H+LANTERN_BOX,LANTERN_TIMBER);
      return;
    }
    if(kind==='barrel'){
      box(cx,cz,.62,.72,.62,baseY,wood);
      box(cx,cz,.66,.06,.66,baseY+.15,[.2,.2,.2]);
      box(cx,cz,.66,.06,.66,baseY+.5,[.2,.2,.2]);
      return;
    }
    if(kind==='hedge'){
      box(cx,cz,.9,.5,.9,baseY,[.14,.32,.15]);
      box(cx,cz,.7,.25,.7,baseY+.5,[.17,.36,.17]);
      return;
    }
    if(kind==='fountain'){
      box(cx,cz,.9,.5,.9,baseY,stone);
      quad([cx-.42,baseY+.5,cz-.42],[cx+.42,baseY+.5,cz-.42],[cx+.42,baseY+.5,cz+.42],[cx-.42,baseY+.5,cz+.42],[.12,.36,.57]);
      box(cx,cz,.2,.5,.2,baseY+.5,stoneDark);
      return;
    }
    if(kind==='well'){
      box(cx,cz,.8,.6,.8,baseY,stone);
      quad([cx-.32,baseY+.6,cz-.32],[cx+.32,baseY+.6,cz-.32],[cx+.32,baseY+.6,cz+.32],[cx-.32,baseY+.6,cz+.32],[.08,.09,.1]);
      houseBox(cx-.3,cz,.1,.9,.1,baseY+.6,timber);
      houseBox(cx+.3,cz,.1,.9,.1,baseY+.6,timber);
      box(cx,cz,.9,.08,.5,baseY+1.5,woodDark);
      return;
    }
    if(kind==='statue'){
      box(cx,cz,.6,.4,.6,baseY,stoneDark);
      box(cx,cz,.35,1.1,.35,baseY+.4,[.75,.73,.68]);
      box(cx,cz,.25,.25,.25,baseY+1.5,[.78,.76,.71]);
      return;
    }
    if(kind==='gatehouse'){
      houseBox(cx-.32,cz,.3,2.2,.3,baseY,stone);
      houseBox(cx+.32,cz,.3,2.2,.3,baseY,stone);
      box(cx,cz,1.0,.4,.4,baseY+2.2,stoneDark);
      box(cx,cz,1.1,.08,.5,baseY+2.6,woodDark);
      return;
    }
    if(kind==='cart'){
      box(cx,cz,.9,.25,.6,baseY+.35,wood);
      box(cx-.2,cz,.1,.5,.5,baseY,[.2,.2,.2]);
      box(cx+.2,cz,.1,.5,.5,baseY,[.2,.2,.2]);
      box(cx+.15,cz,.4,.3,.4,baseY+.6,woodDark);
      return;
    }
    if(kind==='windmill'){
      houseBox(cx,cz,.9,2.6,.9,baseY,stone);
      const ce=.12, apex:[number,number,number]=[cx,baseY+2.6+.55,cz];
      tri([cx-.45-ce,baseY+2.6,cz-.45-ce],[cx+.45+ce,baseY+2.6,cz-.45-ce],apex,shadeRgb([.42,.27,.17],SUN_SHADE.north));
      tri([cx+.45+ce,baseY+2.6,cz-.45-ce],[cx+.45+ce,baseY+2.6,cz+.45+ce],apex,shadeRgb([.42,.27,.17],SUN_SHADE.east));
      tri([cx+.45+ce,baseY+2.6,cz+.45+ce],[cx-.45-ce,baseY+2.6,cz+.45+ce],apex,shadeRgb([.42,.27,.17],SUN_SHADE.south));
      tri([cx-.45-ce,baseY+2.6,cz+.45+ce],[cx-.45-ce,baseY+2.6,cz-.45-ce],apex,shadeRgb([.42,.27,.17],SUN_SHADE.west));
      return;
    }
    // Default: a plain wooden crate — a box with a lid rim.
    box(cx,cz,.72,.6,.72,baseY,wood);
    box(cx,cz,.78,.08,.78,baseY+.6,woodDark);
  };
  // BUILD 1051: fixed wild landmarks render as themselves, not as
  // trees or crates (the 986 placeholder for everything the world
  // didn't know). One emitter per kind, all from the existing box /
  // triangle vocabulary, all standing on the heightfield. The tower
  // is the distance marker (4.6 high, 2x2, grey stone against green
  // trees); the stones and the camp read up close. A tower tile is
  // a full-tile box, so the four tiles merge into one 2x2 tower
  // (the shared faces are interior and invisible); the broken
  // corner renders short with a rubble mound.
  const landmarkAt=(tx:number,ty:number,kind:LandmarkKind,baseY=0,broken=false,part?:string)=>{
    const cx=tx+.5, cz=ty+.5;
    const stone:Vec3=[.5,.5,.48], stoneDark:Vec3=[.38,.38,.36];
    const canvas:Vec3=[.78,.72,.58];
    if(kind==='tower'){
      if(broken){
        box(cx,cz,1.0,3.0,1.0,baseY,stoneDark);
        box(cx,cz,.9,.5,.9,baseY+3.0,stone);
        return;
      }
      box(cx,cz,1.0,4.6,1.0,baseY,stone);
      box(cx,cz,1.05,.15,1.05,baseY+4.6,stoneDark);
      return;
    }
    if(kind==='stones'){
      // A tall thin slab; the long axis alternates per tile, so the
      // ring reads as rough megaliths, not a fence.
      const ns=(tx+ty)%2===0;
      const w=ns?0.5:0.28, d=ns?0.28:0.5;
      const shade=0.9+((tx*7+ty*13)%5)*0.04;
      box(cx,cz,w,2.8,d,baseY,[stone[0]*shade,stone[1]*shade,stone[2]*shade]);
      box(cx,cz,w+0.08,.25,d+0.08,baseY+2.8,stoneDark);
      return;
    }
    // camp
    if(part==='firepit'){
      // A low stone ring + a dark ember bed in the middle.
      for(const [ox,oz] of [[-.28,0],[.28,0],[0,-.28],[0,.28]] as const)
        box(cx+ox,cz+oz,.22,.18,.22,baseY,stoneDark);
      quad([cx-.2,baseY+.06,cz-.2],[cx+.2,baseY+.06,cz-.2],[cx+.2,baseY+.06,cz+.2],[cx-.2,baseY+.06,cz+.2],[.25,.1,.05]);
      return;
    }
    // tent: an A-frame prism — two sloped canvas quads, two triangle
    // ends, a ridge pole. One prism per tile; two adjacent tiles
    // read as one two-bay ridge tent.
    const ridge=baseY+0.9, eave=baseY+0.08, hw=0.42;
    quad([cx-.5,eave,cz-hw],[cx+.5,eave,cz-hw],[cx+.5,ridge,cz],[cx-.5,ridge,cz],shadeRgb(canvas,SUN_SHADE.north));
    quad([cx+.5,eave,cz+hw],[cx-.5,eave,cz+hw],[cx-.5,ridge,cz],[cx+.5,ridge,cz],shadeRgb(canvas,SUN_SHADE.south));
    tri([cx-.5,eave,cz-hw],[cx-.5,eave,cz+hw],[cx-.5,ridge,cz],shadeRgb(canvas,SUN_SHADE.west));
    tri([cx+.5,eave,cz+hw],[cx+.5,eave,cz-hw],[cx+.5,ridge,cz],shadeRgb(canvas,SUN_SHADE.east));
    box(cx,cz,1.02,.06,.06,ridge,[.23,.16,.1]);
  };
  // Walls and stall counters use the editor-authored collision geometry.
  // BUILD 1028: placed walls render as the same 1x0.85x1 cube as a
  // generated wall tile (placedWallTiles carries the h, but the 3D
  // cube is orientation-agnostic — the h only matters to the 2.5D
  // wall-run merge). BUILD 1034: walls stand on the heightfield.
  for(const wall of [...world.walls, ...placedWallTiles(world)]) if(wall.x>=minX&&wall.x<=maxX&&wall.y>=minY&&wall.y<=maxY) cube(wall.x+.5,wall.y+.5,1,.85,1,[.43,.39,.32],surfaceElevation(effTerrain,wall.x+.5,wall.y+.5));
  // BUILD 1042: placed fences — a low wooden fence: four corner posts
  // plus two rails on each side, timber brown, standing on the
  // heightfield. One tile reads as a fence segment; a run of tiles
  // reads as a fence line. Fences block movement, like walls.
  // BUILD 1050: the same fence is the generated garden fence — one
  // emitter (fenceAt) for both, so the two can never drift apart.
  const FENCE_TIMBER:Vec3=[.45,.32,.18];
  const fenceAt=(tx:number,ty:number)=>{
    const fy=surfaceElevation(effTerrain,tx+.5,ty+.5);
    for(const [px,pz] of [[.08,.08],[.92,.08],[.08,.92],[.92,.92]] as const) cube(tx+px,ty+pz,.09,.55,.09,FENCE_TIMBER,fy);
    for(const ry of [.22,.42]){
      cube(tx+.5,ty+.06,.84,.07,.05,FENCE_TIMBER,fy+ry);
      cube(tx+.5,ty+.94,.84,.07,.05,FENCE_TIMBER,fy+ry);
      cube(tx+.06,ty+.5,.05,.07,.84,FENCE_TIMBER,fy+ry);
      cube(tx+.94,ty+.5,.05,.07,.84,FENCE_TIMBER,fy+ry);
    }
  };
  for(const f of placedFenceTiles(world)) if(f.tx>=minX&&f.tx<=maxX&&f.ty>=minY&&f.ty<=maxY) fenceAt(f.tx,f.ty);
  // BUILD 1050: generated garden fences (gardens.ts) — around the
  // planted patches beside town houses, with a gate gap at the door.
  for(const f of gardenFencesFor(world)) if(f.x>=minX&&f.x<=maxX&&f.y>=minY&&f.y<=maxY) fenceAt(f.x,f.y);
  // BUILD 1049: generated/authored stalls render as stalls (counter +
  // posts + awning — stallAt above), not the 986 pine trees. Stall
  // data + collision are untouched; only the mesh changes.
  // User-PLACED stalls keep the brown counter cube below — a
  // deliberate Build-panel choice is never silently converted.
  // BUILD 1007: stalls render at whole-world range (were window-culled).
  for(const stall of world.stalls) for(let x=stall.x0;x<=stall.x1;x++) stallAt(x,stall.y0,surfaceElevation(effTerrain,x+.5,stall.y0+.5));
  for(const stall of placedStallRects(world)) for(let x=stall.x0;x<=stall.x1;x++) cube(x+.5,stall.y0+.5,1,.75,1,[.57,.31,.16],surfaceElevation(effTerrain,x+.5,stall.y0+.5));
  // BUILD 1051: fixed wild landmarks (settlements.ts) — the ruined
  // tower, the standing stones, the hunter's camp. Whole-world range
  // like the stalls (the tower is the distance marker), one
  // landmarkAt per solid tile, on the heightfield. The stone
  // circle's centre is open ground and renders nothing.
  for(const lm of world.landmarks ?? []) for(const b of lm.blocks) landmarkAt(b.x,b.y,lm.kind as LandmarkKind,surfaceElevation(effTerrain,b.x+.5,b.y+.5),!!(lm.broken&&lm.broken.x===b.x&&lm.broken.y===b.y),b.part);
  yield;
  // BUILD 997: uploaded custom meshes — static vertex-colour
  // triangles in the world buffer (like placed stalls, not the
  // per-frame actor buffer: uploads never move on their own). Mesh
  // local coords are centred XZ with base y=0 (1 unit = 1 tile), so
  // the mesh centres on the placement rect's centre. A placement
  // whose asset is gone renders nothing (delete removes copies
  // first, so this is defensive only).
  // BUILD 1007: custom assets render at whole-world range (were window-culled).
  // BUILD 1048: the mesh rotates by the placement's `rot` (the 1036
  // convention — rotateCustomXZ turns local XZ clockwise, the same
  // direction the stored rect turns, so the model stays inside its
  // own footprint; a square model rotates in place).
  for(const p of (world.placements??[])) if(p.kind==='custom'){
    const asset=customAssets.find(a=>a.id===p.assetId);if(!asset)continue;
    const ccx=(p.x0+p.x1+1)/2,ccz=(p.y0+p.y1+1)/2;
    // BUILD 1034: the mesh sits on the heightfield at its centre.
    const baseY=surfaceElevation(effTerrain,ccx,ccz);
    const prot=(p.rot??0) as 0|1|2|3;
    for(let i=0;i<asset.indices.length;i+=3){
      const a=asset.indices[i]*3,b=asset.indices[i+1]*3,c=asset.indices[i+2]*3;
      const ra=rotateCustomXZ(asset.positions[a],asset.positions[a+2],prot),rb=rotateCustomXZ(asset.positions[b],asset.positions[b+2],prot),rc=rotateCustomXZ(asset.positions[c],asset.positions[c+2],prot);
      triV([ccx+ra.x,asset.positions[a+1]+baseY,ccz+ra.z],[asset.colors[a],asset.colors[a+1],asset.colors[a+2]],
        [ccx+rb.x,asset.positions[b+1]+baseY,ccz+rb.z],[asset.colors[b],asset.colors[b+1],asset.colors[b+2]],
        [ccx+rc.x,asset.positions[c+1]+baseY,ccz+rc.z],[asset.colors[c],asset.colors[c+1],asset.colors[c+2]]);
      // BUILD 1035: a big uploaded mesh is many triangles — yield
      // every 64 so one placement cannot exceed the step budget.
      if(i%192===189)yield;
    }
    yield;
  }
  // BUILD 983 town look (reference match): varied low-poly houses —
  // stone-block ground floors, dark timber framing, plaster upper walls,
  // steep pitched roofs, small square windows (some warm-lit), open
  // colonnade fronts on some lots. Designs come from townLook.ts, seeded
  // by hut coordinates (stable across rebuilds and cameras — the old
  // code cycled colours by visible-window order, so houses changed
  // colour while panning). Layout is never moved: footprints, doors and
  // collision come from world.huts exactly as the layout produced them.
  // This renderer uses vertex colours only (no textures), so the FBX
  // atlas trap does not apply here; the generated native geometry is
  // the single source of truth for buildings in this mode.
  type FaceDir='north'|'south'|'west'|'east';
  // A flat rect centred on a face: a = position along the face, y = centre
  // height, fixed = the face plane coordinate (proud of the wall).
  const faceRect=(face:FaceDir,a:number,wA:number,y:number,h:number,fixed:number,color:Vec3)=>{
    const a0=a-wA/2,a1=a+wA/2,y0=y-h/2,y1=y+h/2;
    if(face==='south')quad([a0,y0,fixed],[a1,y0,fixed],[a1,y1,fixed],[a0,y1,fixed],color);
    else if(face==='north')quad([a1,y0,fixed],[a0,y0,fixed],[a0,y1,fixed],[a1,y1,fixed],color);
    else if(face==='west')quad([fixed,y0,a1],[fixed,y0,a0],[fixed,y1,a0],[fixed,y1,a1],color);
    else quad([fixed,y0,a0],[fixed,y0,a1],[fixed,y1,a1],[fixed,y1,a0],color);
  };
  // Mortar joints for one stone ground-floor face: horizontal courses plus
  // staggered vertical joints, drawn proud of the stone box.
  // BUILD 1034: baseY lifts the joints onto the heightfield with the hut.
  const stoneJoints=(face:FaceDir,cx:number,cz:number,w:number,d:number,baseY=0)=>{
    const fixed=face==='south'?cz+d/2+.008:face==='north'?cz-d/2-.008:face==='west'?cx-w/2-.008:cx+w/2+.008;
    const span=face==='south'||face==='north'?w:d;
    const a0=face==='south'||face==='north'?cx-w/2:cz-d/2;
    const courses=3,courseH=GROUND_FLOOR_H/courses,blockW=.85;
    for(let c=0;c<courses;c++){
      const y0=c*courseH+baseY,y1=(c+1)*courseH+baseY;
      if(c>0)faceRect(face,a0+span/2,span,y0,.035,fixed,MORTAR);
      const joints=Math.max(1,Math.round(span/blockW));
      const step=span/joints,offset=(c%2)*step/2;
      for(let j=0;j<=joints;j++){
        const a=a0+offset+j*step;
        if(a<=a0+.02||a>=a0+span-.02)continue;
        faceRect(face,a,.035,(y0+y1)/2,courseH-.035,fixed,MORTAR);
      }
    }
  };
  const warmTint=(c:Vec3):Vec3=>[Math.min(1,c[0]*1.04),Math.min(1,c[1]*1.0),Math.min(1,c[2]*.94)];
  // BUILD 1007: houses render at whole-world range (were window-culled
  // — even in-town views were missing houses past 22 tiles).
  for(const hut of [...world.huts, ...placedHutRects(world)]) {
    const x=(hut.x0+hut.x1+1)/2,z=(hut.y0+hut.y1+1)/2,w=Math.max(2,hut.x1-hut.x0+1),d=Math.max(2,hut.y1-hut.y0+1);
    // BUILD 1034: the hut's base y — the shared surface at its centre.
    // Every part of the house (floor, walls, roof, chimney, shadow)
    // lifts by this one value, so the house sits ON the hill, never
    // floating or buried. The 1034 harness proves the worst footprint
    // variation is 0.25 tiles, so one base y per hut is enough (no
    // per-corner tilt).
    const hy=surfaceElevation(effTerrain,x,z);
    const hutDist=Math.hypot(x-(center.x+.5),z-(center.y+.5));
    // BUILD 990 shell-hide overlay: the entered house renders its
    // generated interior INSTEAD of its shell — no walls, roof,
    // windows, chimney, or shadow blobs. Only this hut (rect match);
    // every other house in the window renders normally. Floor covers
    // the footprint at INTERIOR_FLOOR_Y; furniture is seeded from the
    // rect (interiors.ts) and is visual only, so the room is fully
    // walkable. Generated and placed houses share this path.
    // BUILD 1006: a moved hut keeps its ORIGINAL rect's look — the seed
    // rect is the moved record's `from`, so stories/stone/plaster/
    // timber/roof/windows and the furniture kind pattern travel with
    // the house. Unmoved and placed huts seed from themselves.
    // BUILD 1050: seedRectForHut also honours a placed house's
    // stamped design seed, so a placed house keeps the roof it was
    // built with across moves and rotations.
    const seedHut=seedRectForHut(world, hut);
    if(enteredHut && sameHut(hut, enteredHut)) {
      for(let fy=hut.y0;fy<=hut.y1;fy++) for(let fx=hut.x0;fx<=hut.x1;fx++) {
        const fc=interiorFloorColor(fx,fy);
        quad([fx,INTERIOR_FLOOR_Y+hy,fy],[fx+1,INTERIOR_FLOOR_Y+hy,fy],[fx+1,INTERIOR_FLOOR_Y+hy,fy+1],[fx,INTERIOR_FLOOR_Y+hy,fy+1],fc);
      }
      for(const b of interiorBoxes(hut, seedHut)) box(b.x,b.z,b.w,b.h,b.d,b.y0+hy,b.color);
      continue;
    }
    const hDoorX=(hut as {doorX?:number}).doorX ?? Math.round(x);
    const hDoorY=(hut as {doorY?:number}).doorY ?? hut.y1;
    // BUILD 1012: a placed house with a variant renders the picked
    // design (stories/open front fixed by the variant, the rest from
    // the same seed hash as town houses); every other hut — generated
    // or legacy placed — uses houseDesignFor exactly as before.
    const hutVariant=(hut as {variant?:string}).variant;
    const design=hutVariant&&HOUSE_VARIANTS[hutVariant as keyof typeof HOUSE_VARIANTS]
      ?houseDesignForVariant(HOUSE_VARIANTS[hutVariant as keyof typeof HOUSE_VARIANTS],hut.x0,hut.y0,hut.x1,hut.y1,hDoorX,hDoorY,seedHut.x0,seedHut.y0)
      :houseDesignFor(hut.x0,hut.y0,hut.x1,hut.y1,hDoorX,hDoorY,seedHut.x0,seedHut.y0);
    const topY=hy+GROUND_FLOOR_H+(design.stories-1)*UPPER_FLOOR_H;
    const span=design.roofAxis==='x'?d:w;
    // BUILD 1050: the ridge rides the house's own pitch (0.25
    // shallow, 0.45 the old standard, 0.6 steep), not one slope for
    // the whole town.
    const ridgeY=topY+roofRise(span, design.roofPitch);
    const face=design.doorFace;
    const faceFixed=face==='south'?z+d/2:face==='north'?z-d/2:face==='west'?x-w/2:x+w/2;
    const faceOut=face==='south'||face==='east'?1:-1;
    const facePlane=(o:number)=>faceFixed+faceOut*o;
    const aC=face==='south'||face==='north'?x:z;
    const spanA=face==='south'||face==='north'?w:d;
    // Soft contact shadow + sun-side blob (no shadow maps in this
    // renderer; darkened ground quads ground the volumes instead).
    // BUILD 1007: blobs gated to FAR_BLOB_RANGE — cross-map views drop
    // a decal that would be a couple of dark pixels under a ~10px house.
    if(hutDist<=FAR_BLOB_RANGE){
      quad([x-w/2-.45+.25,.005+hy,z-d/2-.45+.35],[x+w/2+.45+.25,.005+hy,z-d/2-.45+.35],[x+w/2+.45+.25,.005+hy,z+d/2+.45+.35],[x-w/2-.45+.25,.005+hy,z+d/2+.45+.35],[.28,.27,.24]);
      quad([x-w/2-.15+.12,.008+hy,z-d/2-.15+.15],[x+w/2+.15+.12,.008+hy,z-d/2-.15+.15],[x+w/2+.15+.12,.008+hy,z+d/2+.15+.15],[x-w/2-.15+.12,.008+hy,z+d/2+.15+.15],[.2,.19,.17]);
    }
    // BUILD 1038: the windmill is a house variant, but it is NOT a house
    // shape — a straight stone tower (two stories tall) with a pyramid
    // cap, a door on the door face, and window frames at the shared
    // windowSlotsFor positions (so the per-frame fx panes land inside
    // them, lit at night like any house). No pitched roof, no upper
    // plaster floors, no chimney, no commercial dressing. The rotating
    // blades are NOT here: they are per-frame fx (houseFx.ts), driven
    // by the drift clock, so they turn with no world rebuild. The tower
    // top (topY) is the cap base; the hub height in windmill.ts must
    // agree with it (WINDMILL_TOWER_H = GROUND_FLOOR_H +
    // UPPER_FLOOR_H, and stories is fixed to 2 by the variant).
    if(hutVariant==='windmill'){
      houseBox(x,z,w,WINDMILL_TOWER_H,d,hy,design.stone);
      (['north','south','west','east'] as const).forEach(f=>stoneJoints(f,x,z,w,d,hy));
      // Door + timber lintel + stone step on the door face (same as a house).
      faceRect(face,aC,DOOR_W,DOOR_H/2+hy,DOOR_H,facePlane(.02),DOOR_WOOD);
      faceRect(face,aC,1.21,GROUND_FLOOR_H+.06+hy,.12,facePlane(.02),design.timber);
      if(face==='south')houseBox(x,z+d/2+.15,1.21,.12,.3,hy,design.stone);
      else if(face==='north')houseBox(x,z-d/2-.15,1.21,.12,.3,hy,design.stone);
      else if(face==='west')houseBox(x-w/2-.15,z,.12,.12,1.21,hy,design.stone);
      else houseBox(x+w/2+.15,z,.12,.12,1.21,hy,design.stone);
      // Window frames at the shared slots (fx panes land inside them).
      for(const s of windowSlotsFor(x,z,w,d,face,design.stories,hy)){
        const fixed=s.face==='south'?z+d/2:s.face==='north'?z-d/2:s.face==='west'?x-w/2:x+w/2;
        const out=s.face==='south'||s.face==='east'?1:-1;
        faceRect(s.face,s.a,.46,s.y,.56,fixed+out*.015,design.timber);
      }
      // Pyramid cap (roof colour, slight overhang), one triangle per face.
      const ce=.18;
      const cx0=x-w/2-ce,cx1=x+w/2+ce,cz0=z-d/2-ce,cz1=z+d/2+ce;
      const apex:[number,number,number]=[x,topY+WINDMILL_CAP_H,z];
      tri([cx0,topY,cz0],[cx1,topY,cz0],apex,shadeRgb(design.roof,SUN_SHADE.north));
      tri([cx1,topY,cz0],[cx1,topY,cz1],apex,shadeRgb(design.roof,SUN_SHADE.east));
      tri([cx1,topY,cz1],[cx0,topY,cz1],apex,shadeRgb(design.roof,SUN_SHADE.south));
      tri([cx0,topY,cz1],[cx0,topY,cz0],apex,shadeRgb(design.roof,SUN_SHADE.west));
      yield;
      continue;
    }
    // BUILD 1040: the mine is a house variant, but it is NOT a house
    // shape — a rocky mound (a tapered stack of dark stone boxes,
    // like a slag heap / rock face) with a dark entrance on the door
    // face, timber posts + lintel around the opening, and gold ore
    // glints on the mound. No pitched roof, no upper plaster floors,
    // no chimney, no windows (houseFx gives it no panes — its branch
    // emits no frames, so panes would float in the air). The door
    // face rotates with the mine, so the entrance turns with it, and
    // the Enter button works exactly like a house (the interior is
    // the bare box every house has for now — no mining inside yet).
    if(hutVariant==='mine'){
      const rock:[number,number,number]=[.34,.33,.31];
      const rockDark:[number,number,number]=[.27,.26,.24];
      const gold:[number,number,number]=[.85,.65,.2];
      // Mound: three stacked boxes, each smaller and offset, so the
      // silhouette reads as a rock face, not a cube.
      houseBox(x,z,w,1.5,d,hy,rock);
      houseBox(x+.15,z-.1,w-0.8,1.0,d-0.8,hy+1.5,rockDark);
      houseBox(x-.1,z+.12,w-1.7,0.7,d-1.7,hy+2.5,rock);
      // Dark entrance on the door face + timber posts + lintel.
      faceRect(face,aC,1.0,0.85+hy,1.7,facePlane(.02),[.08,.07,.06]);
      faceRect(face,aC-0.62,0.14,0.85+hy,1.7,facePlane(.03),design.timber);
      faceRect(face,aC+0.62,0.14,0.85+hy,1.7,facePlane(.03),design.timber);
      faceRect(face,aC,1.4,1.78+hy,0.14,facePlane(.03),design.timber);
      // Gold ore glints on the mound faces (small proud quads, so
      // they read as ore veins, not paint).
      faceRect('south',x-0.7,0.22,hy+0.9,0.22,z+d/2+.01,gold);
      faceRect('south',x+0.8,0.18,hy+1.9,0.18,z+d/2+.01,gold);
      faceRect('west',z-0.6,0.2,hy+1.2,0.2,x-w/2-.01,gold);
      faceRect('east',z+0.7,0.16,hy+2.2,0.16,x+w/2+.01,gold);
      yield;
      continue;
    }
    // Stone ground floor + mortar joints on all faces.
    houseBox(x,z,w,GROUND_FLOOR_H,d,hy,design.stone);
    (['north','south','west','east'] as const).forEach(f=>stoneJoints(f,x,z,w,d,hy));
    if(design.openFront){
      // Dark shopfront interior on the door face, timber posts + beam in
      // front of it, door offset to one side on the dark face.
      faceRect(face,aC,spanA-.3,GROUND_FLOOR_H/2+hy,GROUND_FLOOR_H-.14,facePlane(.01),[.12,.1,.08]);
      const posts=3;
      for(let i=0;i<posts;i++){
        const a=aC-spanA/2+spanA*(i+1)/(posts+1);
        if(face==='south'||face==='north')houseBox(a,facePlane(.06),.14,GROUND_FLOOR_H,.14,hy,design.timber);
        else houseBox(facePlane(.06),a,.14,GROUND_FLOOR_H,.14,hy,design.timber);
      }
      if(face==='south'||face==='north')houseBox(x,facePlane(.06),w,.14,.14,GROUND_FLOOR_H-.14+hy,design.timber);
      else houseBox(facePlane(.06),z,.14,.14,d,GROUND_FLOOR_H-.14+hy,design.timber);
      faceRect(face,aC+spanA*.28,DOOR_W,DOOR_H/2+hy,DOOR_H,facePlane(.03),DOOR_WOOD);
    } else {
      // Door + timber lintel + stone step on the door face.
      // BUILD 992: door 0.87 x 1.78 (1.20x character); lintel + step
      // span the wider door (1.21 = door + margin).
      faceRect(face,aC,DOOR_W,DOOR_H/2+hy,DOOR_H,facePlane(.02),DOOR_WOOD);
      faceRect(face,aC,1.21,GROUND_FLOOR_H+.06+hy,.12,facePlane(.02),design.timber);
      if(face==='south')houseBox(x,z+d/2+.15,1.21,.12,.3,hy,design.stone);
      else if(face==='north')houseBox(x,z-d/2-.15,1.21,.12,.3,hy,design.stone);
      else if(face==='west')houseBox(x-w/2-.15,z,.12,.12,1.21,hy,design.stone);
      else houseBox(x+w/2+.15,z,.12,.12,1.21,hy,design.stone);
    }
    // Upper floors: plaster boxes + timber corner posts + floor beams.
    for(let s=1;s<design.stories;s++){
      const y0=hy+GROUND_FLOOR_H+(s-1)*UPPER_FLOOR_H;
      houseBox(x,z,w,UPPER_FLOOR_H,d,y0,design.plaster);
    }
    const po=.06;
    houseBox(x-w/2+po,z-d/2+po,.13,(design.stories-1)*UPPER_FLOOR_H,.13,hy+GROUND_FLOOR_H,design.timber);
    houseBox(x+w/2-po,z-d/2+po,.13,(design.stories-1)*UPPER_FLOOR_H,.13,hy+GROUND_FLOOR_H,design.timber);
    houseBox(x-w/2+po,z+d/2-po,.13,(design.stories-1)*UPPER_FLOOR_H,.13,hy+GROUND_FLOOR_H,design.timber);
    houseBox(x+w/2-po,z+d/2-po,.13,(design.stories-1)*UPPER_FLOOR_H,.13,hy+GROUND_FLOOR_H,design.timber);
    for(let s=0;s<design.stories-1;s++){
      const y=hy+GROUND_FLOOR_H+s*UPPER_FLOOR_H;
      houseBox(x,z+d/2+.01,w,.13,.07,y-.065,design.timber);
      houseBox(x,z-d/2-.01,w,.13,.07,y-.065,design.timber);
      houseBox(x-w/2-.01,z,.07,.13,d,y-.065,design.timber);
      houseBox(x+w/2+.01,z,.07,.13,d,y-.065,design.timber);
    }
    // Small square windows: 2 on the door face per upper floor, 1 on each
    // side face per upper floor, 1 on the back per upper floor.
    // BUILD 1014: the timber FRAMES stay here (static, world buffer);
    // the glass panes moved to the per-frame fx buffer (houseFx.ts),
    // where the lit state is a pure function of (house seed, clock
    // minutes) — no world rebuild when a light flips. Positions are
    // single-sourced from windowSlotsFor, so frames and panes can
    // never disagree.
    for(const s of windowSlotsFor(x,z,w,d,face,design.stories,hy)){
      const fixed=s.face==='south'?z+d/2:s.face==='north'?z-d/2:s.face==='west'?x-w/2:x+w/2;
      const out=s.face==='south'||s.face==='east'?1:-1;
      faceRect(s.face,s.a,.46,s.y,.56,fixed+out*.015,design.timber);
    }
    // Steep pitched roof (ridge along the longer side), eaves overhang,
    // timber gables at the ridge ends, ridge beam, optional chimney.
    const e=.18;
    const x0=x-w/2-e,x1=x+w/2+e,z0=z-d/2-e,z1=z+d/2+e;
    // BUILD 988: roof slopes + gables follow the same sun table — the
    // sun-facing slope keeps the warm full tint, the shaded slope takes
    // its face shade (was: sun side full, shade side flat .85, with no
    // relation to which compass face it was).
    if(design.roofForm==='parapet'){
      // BUILD 1050: flat-topped with a raised edge — a flat roof slab
      // (roof colour, top shade) with a low plaster rim around its
      // edge. No ridge beam, no gables; the chimney (below) rides the
      // parapet top.
      quad([x0,topY,z0],[x1,topY,z0],[x1,topY,z1],[x0,topY,z1],shadeRgb(design.roof, SUN_SHADE.top));
      const pt=.12;
      houseBox(x,z0+pt/2,w+2*e,PARAPET_H,pt,topY,design.plaster);
      houseBox(x,z1-pt/2,w+2*e,PARAPET_H,pt,topY,design.plaster);
      houseBox(x0+pt/2,z,pt,PARAPET_H,d+2*e,topY,design.plaster);
      houseBox(x1-pt/2,z,pt,PARAPET_H,d+2*e,topY,design.plaster);
    } else if(design.roofAxis==='x'){
      quad([x0,topY,z1],[x1,topY,z1],[x1,ridgeY,z],[x0,ridgeY,z],shadeRgb(design.roof, SUN_SHADE.south));
      quad([x0,topY,z0],[x0,ridgeY,z],[x1,ridgeY,z],[x1,topY,z0],warmTint(design.roof));
      tri([x-w/2,topY,z-d/2],[x-w/2,topY,z+d/2],[x-w/2,ridgeY,z],shadeRgb(design.plaster, SUN_SHADE.west));
      tri([x+w/2,topY,z+d/2],[x+w/2,topY,z-d/2],[x+w/2,ridgeY,z],shadeRgb(design.plaster, SUN_SHADE.east));
      houseBox(x,z,w+2*e,.1,.1,ridgeY,design.timber);
    } else {
      quad([x1,topY,z1],[x1,topY,z0],[x,ridgeY,z0],[x,ridgeY,z1],shadeRgb(design.roof, SUN_SHADE.east));
      quad([x0,topY,z0],[x0,topY,z1],[x,ridgeY,z1],[x,ridgeY,z0],warmTint(design.roof));
      tri([x-w/2,topY,z-d/2],[x+w/2,topY,z-d/2],[x,ridgeY,z-d/2],shadeRgb(design.plaster, SUN_SHADE.north));
      tri([x+w/2,topY,z+d/2],[x-w/2,topY,z+d/2],[x,ridgeY,z+d/2],shadeRgb(design.plaster, SUN_SHADE.south));
      houseBox(x,z,.1,.1,d+2*e,ridgeY,design.timber);
    }
    // BUILD 1014: chimney top single-sourced with houseFx.ts — the
    // smoke starts at exactly this cap (ridgeY+.8). BUILD 1015: the
    // blacksmith's chimney is wider (0.55); the cap lip scales with
    // it, the cap HEIGHT is unchanged so the smoke needs no case.
    const chimTop=chimneyTopFor(x,z,w,d,design,hy);
    if(chimTop){
      const chw=design.wideChimney?.55:.35;
      houseBox(chimTop[0],chimTop[2],chw,1.1,chw,chimTop[1]-1.1,design.stone);
      const cap=chw/2+.015;
      quad([chimTop[0]-cap,chimTop[1],chimTop[2]-cap],[chimTop[0]+cap,chimTop[1],chimTop[2]-cap],[chimTop[0]+cap,chimTop[1],chimTop[2]+cap],[chimTop[0]-cap,chimTop[1],chimTop[2]+cap],[.15,.14,.12]);
    }
    // BUILD 1015: commercial-building dressing (no mechanics — the
    // buildings are shells with 990 interiors for now). Inn: a hanging
    // sign board on a timber post beside the door. Store: a terracotta
    // awning over the open front on two posts, with goods crates
    // flanking the door (clear of the colonnade posts and the door
    // swing). All positions derive from the door face, so they read
    // from every camera angle.
    if(design.building==='inn'){
      const signA=aC+spanA*.32;
      if(face==='south'||face==='north'){
        houseBox(signA,facePlane(.16),.08,.08,.3,2.32+hy,design.timber);
        houseBox(signA,facePlane(.32),.7,.45,.06,2.02+hy,[.78,.58,.25]);
      } else {
        houseBox(facePlane(.16),signA,.3,.08,.08,2.32+hy,design.timber);
        houseBox(facePlane(.32),signA,.06,.45,.7,2.02+hy,[.78,.58,.25]);
      }
    } else if(design.building==='store'){
      const aw=spanA/2-.3;
      const a0=aC-aw,a1=aC+aw;
      if(face==='south'||face==='north'){
        quad([a0,2.0+hy,facePlane(.02)],[a1,2.0+hy,facePlane(.02)],[a1,1.65+hy,facePlane(.78)],[a0,1.65+hy,facePlane(.78)],[.55,.25,.18]);
        houseBox(a0,facePlane(.78),.08,1.65,.08,hy,design.timber);
        houseBox(a1,facePlane(.78),.08,1.65,.08,hy,design.timber);
        houseBox(aC-spanA*.35,facePlane(.45),.5,.5,.5,hy,[.57,.31,.16]);
        houseBox(aC+spanA*.35,facePlane(.45),.5,.5,.5,hy,[.57,.31,.16]);
        houseBox(aC-spanA*.35,facePlane(.45),.35,.35,.35,.5+hy,[.5,.27,.14]);
      } else {
        quad([facePlane(.02),2.0+hy,a0],[facePlane(.02),2.0+hy,a1],[facePlane(.78),1.65+hy,a1],[facePlane(.78),1.65+hy,a0],[.55,.25,.18]);
        houseBox(facePlane(.78),a0,.08,1.65,.08,hy,design.timber);
        houseBox(facePlane(.78),a1,.08,1.65,.08,hy,design.timber);
        houseBox(facePlane(.45),aC-spanA*.35,.5,.5,.5,hy,[.57,.31,.16]);
        houseBox(facePlane(.45),aC+spanA*.35,.5,.5,.5,hy,[.57,.31,.16]);
        houseBox(facePlane(.45),aC-spanA*.35,.35,.35,.35,.5+hy,[.5,.27,.14]);
      }
    }
    yield;
  }
  // BUILD 1007: trees render at whole-world range (were window-culled).
  const allTrees=[...world.trees, ...placedTreeTiles(world)];
  for(let ti=0;ti<allTrees.length;ti++) {
    const t=allTrees[ti];
    // BUILD 1027: a stored tree standing in water never renders — the
    // ocean scatter skips water tiles, but an old save's stored list
    // (or a placed tree under a placed water tile, which removeAt
    // clears first) can hold one; water wins, the tree does not.
    if(effTerrain(t.tx,t.ty)==='water')continue;
    // BUILD 983: low-poly tapered tree (trunk + 3 shrinking foliage
    // tiers) instead of the old single green cube. Visual only — same
    // tile, same collision, same positions. BUILD 986: now the shared
    // treeAt renderer (identical geometry). BUILD 1034: the tree
    // stands on the heightfield.
    treeAt(t.tx,t.ty,surfaceElevation(effTerrain,t.tx+.5,t.ty+.5));
    if(ti%16===15)yield;
  }
  // BUILD 985: stylized grass tufts (StayAtHomeDev MIT meshes, baked in
  // grassMeshes.ts, coloured by grassTufts.ts: base-to-tip gradient x
  // world-XZ noise). Natural tufts seed by tile so they never reshuffle
  // across window rebuilds; placed grass from the Build panel renders
  // the same way. Emitted after trees so blades sit above the ground
  // quads, before rocks/crates (draw order is irrelevant — one buffer).
  // BUILD 1024: grass, flowers and pebbles NO LONGER stop at the ±22
  // window — they render over player-centred detail ranges far past
  // it, so they stop popping in and out as the player walks. Same
  // functions, same look up close (the near view is pixel-identical
  // by construction); only the tile set grows. The ranges are NOT
  // clamped to the map: in the wilderness the detail follows the
  // player, and out-of-map tiles take wild terrain through
  // effTerrain (grass, or a lake — never a tuft in water).
  const gX0=Math.floor(center.x)-DETAIL_GRASS_HALF, gX1=Math.floor(center.x)+DETAIL_GRASS_HALF;
  const gY0=Math.floor(center.y)-DETAIL_GRASS_HALF, gY1=Math.floor(center.y)+DETAIL_GRASS_HALF;
  // BUILD 1035: grass + detail emit in 16-row bands (the ranges are
  // inclusive, so the bands tile exactly) with a yield between bands.
  for(let gy=gY0;gy<=gY1;gy+=4){const gy1=Math.min(gy+3,gY1);emitNaturalGrass(triV, world, effTerrain, gX0, gX1, gy, gy1);emitPlacedGrass(triV, world, effTerrain, gX0, gX1, gy, gy1);yield;}
  // BUILD 1015: wildflowers + pebbles (groundDetail3d.ts) — same
  // determinism as the tufts, a few hundred verts in the old window.
  const fX0=Math.floor(center.x)-DETAIL_FAR_HALF, fX1=Math.floor(center.x)+DETAIL_FAR_HALF;
  const fY0=Math.floor(center.y)-DETAIL_FAR_HALF, fY1=Math.floor(center.y)+DETAIL_FAR_HALF;
  for(let fy=fY0;fy<=fY1;fy+=4){const fy1=Math.min(fy+3,fY1);emitGroundDetail3d(triV, world, effTerrain, fX0, fX1, fy, fy1);yield;}
  // BUILD 1007: rocks + crates render at whole-world range (were window-culled).
  // BUILD 1015: rocks vary in size and shade by tile seed (0.5-1.0
  // wide, 0.4-0.9 tall) instead of one identical cube — the wild reads
  // less stamped. Collision is unchanged (the whole tile blocks,
  // whatever the visual size).
  // BUILD 1025: placed rocks render through this same loop (a placed
  // rock on a tile uses the tile's seed, so it looks identical to a
  // generated rock there) — same pattern as placed trees above.
  const allRocks=[...world.rocks, ...placedRockTiles(world)];
  for(let ri=0;ri<allRocks.length;ri++){
    const r=allRocks[ri];
    // BUILD 1027: a stored rock standing in water never renders —
    // the ocean scatter skips water tiles, but an old save's stored
    // list can hold one; water wins, the rock does not.
    if(effTerrain(r.tx,r.ty)==='water')continue;
    const rw=.5+hash2(r.tx*3.1+21,r.ty*7.7+21)*.5;
    const rh=.4+hash2(r.tx*5.3+23,r.ty*9.1+23)*.5;
    const sh=.8+hash2(r.tx*7.7+27,r.ty*3.3+27)*.25;
    cube(r.tx+.5,r.ty+.5,rw,rh,rw,[.43*sh,.45*sh,.44*sh],surfaceElevation(effTerrain,r.tx+.5,r.ty+.5));
    if(ri%16===15)yield;
  }
  // BUILD 1040: placed bushes — low wide green blobs (four overlapping
  // full boxes in two foliage greens, seeded by tile so bushes differ
  // slightly), never the pine tree. A bush is walk-through decor, so
  // this loop renders only; blocking is isPlacedBlocking's business
  // (bushes are excluded there, like grass). box() (not houseBox):
  // the blobs are seen from orbit above, so they need top faces.
  for(const b of placedBushTiles(world)){
    const by=surfaceElevation(effTerrain,b.tx+.5,b.ty+.5);
    const s1=hash2(b.tx*3.7+41,b.ty*11.3+41), s2=hash2(b.tx*5.1+43,b.ty*7.9+43);
    const g1:Vec3=[.13+.03*s1,.30+.04*s1,.14+.02*s1], g2:Vec3=[.16+.03*s2,.34+.03*s2,.16+.02*s2];
    const cx=b.tx+.5, cz=b.ty+.5;
    box(cx,cz,.85,.45,.85,by,g1);
    box(cx-.25,cz+.1,.5,.35,.5,by+.15,g2);
    box(cx+.28,cz-.12,.45,.3,.45,by+.18,g1);
    box(cx+.05,cz+.05,.4,.3,.4,by+.35,g2);
  }
  // BUILD 1049: GENERATED bushes — undergrowth in the wild and around
  // town, from the same deterministic hash family as the flowers and
  // pebbles (generatedBushAt, vegetation.ts). Non-blocking, walk-through
  // decor like the 1040 placed bush: this loop renders only, and no
  // walkability function consults it. Two overlapping low boxes (the
  // placed bush's 4-box shape is kept exactly as 1040 shipped it —
  // this is its cheaper generated cousin, 20 tris). Skipped on any
  // occupied tile (blockedTiles + every placed kind), on non-grass,
  // and under a wild tree/rock out of map — a bush never clips through
  // solid geometry. Tufts/flowers/pebbles skip bush tiles too
  // (grassTufts.ts / groundDetail3d.ts), so nothing pokes through a
  // bush. Yields every 16 rows like the wild-tree loop above, so the
  // 16k-tile scan cannot eat a whole time-sliced step.
  {
    const bushBlocked = blockedTiles(world);
    for (const t of placedBushTiles(world)) bushBlocked.add(t.tx + ',' + t.ty);
    for (const t of placedLanternTiles(world)) bushBlocked.add(t.tx + ',' + t.ty);
    for (const t of placedOreTiles(world)) bushBlocked.add(t.tx + ',' + t.ty);
    for (const t of placedRockTiles(world)) bushBlocked.add(t.tx + ',' + t.ty);
    for (const t of placedFarmTiles(world)) bushBlocked.add(t.tx + ',' + t.ty);
    for (const t of placedBridgeTiles(world)) bushBlocked.add(t.tx + ',' + t.ty);
    // BUILD 1050: one emitter for the generated bush shape, shared
    // by the hash scan below and the garden plants after it — a
    // garden plant IS a generated bush, on a chosen tile instead of
    // a hashed one, so the two can never drift apart.
    const emitGenBush = (bx: number, by: number): void => {
      const p = bushParamsForTile(bx, by);
      const gy = surfaceElevation(effTerrain, bx + .5, by + .5);
      const g1: Vec3 = [.13 + .03 * p.g1, .30 + .04 * p.g1, .14 + .02 * p.g1];
      const g2: Vec3 = [.16 + .03 * p.g2, .34 + .03 * p.g2, .16 + .02 * p.g2];
      const s = p.scale;
      box(bx + .5 + p.ox1, by + .5 + p.oz1, .85 * s, .42 * s, .85 * s, gy, g1);
      box(bx + .5 + p.ox2, by + .5 + p.oz2, .55 * s, .3 * s, .55 * s, gy + .25 * s, g2);
    };
    for (let by = fY0; by <= fY1; by++) {
      for (let bx = fX0; bx <= fX1; bx++) {
        if (effTerrain(bx, by) !== 'grass') continue;
        if (bushBlocked.has(bx + ',' + by)) continue;
        if ((bx < 0 || by < 0 || bx >= world.w || by >= world.h) && wildObstacleAt(bx, by)) continue;
        if (!generatedBushAt(bx, by)) continue;
        emitGenBush(bx, by);
      }
      if ((by - fY0) % 16 === 15) yield;
    }
    // BUILD 1050: garden plants — the planted tiles inside the
    // fenced patches (gardens.ts). Same bush, same emitter; the tile
    // list is explicit, not hashed, and blockedTiles already keeps
    // the hash scan and the tufts off these tiles.
    for (const t of gardenPlantsFor(world)) {
      if (t.x < fX0 || t.x > fX1 || t.y < fY0 || t.y > fY1) continue;
      emitGenBush(t.x, t.y);
    }
  }
  // BUILD 1040: placed ore deposits — the same seeded rock cube as a
  // generated rock (same tile seed, so an ore node on a tile looks
  // like the rock that would grow there), plus three small gold
  // glint cubes on its faces, so the ore reads at a glance. Blocking
  // like a rock. No mining yet (see the 1040 note): E-key does
  // nothing on it.
  for(const o of placedOreTiles(world)){
    if(effTerrain(o.tx,o.ty)==='water')continue;
    const oy=surfaceElevation(effTerrain,o.tx+.5,o.ty+.5);
    const rw=.5+hash2(o.tx*3.1+21,o.ty*7.7+21)*.5;
    const rh=.4+hash2(o.tx*5.3+23,o.ty*9.1+23)*.5;
    const sh=.8+hash2(o.tx*7.7+27,o.ty*3.3+27)*.25;
    cube(o.tx+.5,o.ty+.5,rw,rh,rw,[.43*sh,.45*sh,.44*sh],oy);
    const gold:Vec3=[.85,.65,.2];
    cube(o.tx+.5,o.ty+.5,.14,.14,.14,gold,oy+rh-.12);
    cube(o.tx+.5-rw/2,o.ty+.5,.1,.1,.1,gold,oy+rh*.45);
    cube(o.tx+.5+rw/2,o.ty+.5,.1,.1,.1,[.75,.45,.25],oy+rh*.6);
  }
  // BUILD 1040: placed lanterns — a dark timber post with a hanging
  // lantern box (dark glass by day; the night glow is per-frame fx,
  // houseFx.ts, on the house-light schedule). The post stands on the
  // heightfield; the glass box centre is lanternBoxCentre (lantern.ts)
  // so the static box and the fx glow box can never disagree.
  for(const l of placedLanternTiles(world)){
    const ly=surfaceElevation(effTerrain,l.tx+.5,l.ty+.5);
    const cx=l.tx+.5, cz=l.ty+.5;
    houseBox(cx,cz,LANTERN_POST_W,LANTERN_POST_H,LANTERN_POST_W,ly,LANTERN_TIMBER);
    const gc=lanternBoxCentre(l.tx,l.ty,ly);
    cube(gc[0],gc[2],LANTERN_BOX,LANTERN_BOX,LANTERN_BOX,LANTERN_GLASS_DARK,gc[1]-LANTERN_BOX/2);
    houseBox(cx,cz,LANTERN_CAP,.06,LANTERN_CAP,ly+LANTERN_POST_H+LANTERN_BOX,LANTERN_TIMBER);
  }
  // BUILD 1040: placed wooden bridges — a plank deck over water. Four
  // plank strips (wood browns, small gaps between them so the water
  // shows through) plus two low side beams, at the water surface +
  // 0.06 (the water surface is the heightfield blended to 0, so the
  // deck sits just above it). Unlike the tree/rock loops above, this
  // loop does NOT skip water tiles — the water is the whole point.
  // The deck is flat quads, so the player (standing at the surface)
  // reads as walking on the planks.
  for(const br of placedBridgeTiles(world)){
    const bwy=surfaceElevation(effTerrain,br.tx+.5,br.ty+.5)+0.06;
    const plank:Vec3=[.55,.4,.22], plank2:Vec3=[.48,.35,.2];
    for(let i=0;i<4;i++){
      const z0=br.ty+0.06+i*0.24, z1=z0+0.2;
      quad([br.tx+0.02,bwy,z0],[br.tx+0.98,bwy,z0],[br.tx+0.98,bwy,z1],[br.tx+0.02,bwy,z1],i%2===0?plank:plank2);
    }
    houseBox(br.tx+.5,br.ty+.08,.98,.1,.08,bwy,LANTERN_TIMBER);
    houseBox(br.tx+.5,br.ty+.92,.98,.1,.08,bwy,LANTERN_TIMBER);
  }
  // BUILD 1024: wild trees + rocks past the old map edge. The stored
  // lists stop at 200x200, but the scatter hash continues — so the
  // wilderness has trees and rocks too, over the same far detail
  // range as the flowers/pebbles. Same geometry as the stored ones
  // (treeAt for trees, the seeded cube for rocks, same tile seeds so
  // a wild rock looks identical to a stored rock on the same tile),
  // same collision (the whole tile blocks). In-map tiles are skipped
  // (stored lists govern there); chopped/mined wild items stay gone
  // via removedWildTrees / removedWildRocks; lake and ocean tiles
  // hold no tree or rock (wildTreeAt/wildRockAt already exclude them).
  for(let y=fY0;y<=fY1;y++) for(let x=fX0;x<=fX1;x++) {
    if(x>=0&&y>=0&&x<world.w&&y<world.h) continue;
    const wkey=x+','+y;
    // BUILD 1034: wild trees and rocks stand on the heightfield too.
    if(wildTreeAt(x,y)&&!(world.removedWildTrees??[]).includes(wkey)) treeAt(x,y,surfaceElevation(effTerrain,x+.5,y+.5));
    else if(wildRockAt(x,y)&&!(world.removedWildRocks??[]).includes(wkey)) {
      const rw=.5+hash2(x*3.1+21,y*7.7+21)*.5;
      const rh=.4+hash2(x*5.3+23,y*9.1+23)*.5;
      const sh=.8+hash2(x*7.7+27,y*3.3+27)*.25;
      cube(x+.5,y+.5,rw,rh,rw,[.43*sh,.45*sh,.44*sh],surfaceElevation(effTerrain,x+.5,y+.5));
    }
    if(x===fX1&&(y-fY0)%4===3)yield;
  }
  // BUILD 1049: generated/authored crates + layout props render as
  // themselves (crateAt above — crate, lamp, barrel, hedge, fountain,
  // well, statue, gatehouse, cart, windmill), not the 986 pine trees.
  // Data untouched — the wood interaction still finds and removes the
  // crate entry (see the E-key handler).
  // BUILD 1034: crates stand on the heightfield.
  for(let ci=0;ci<world.crates.length;ci++){const c=world.crates[ci];crateAt(c.tx,c.ty,surfaceElevation(effTerrain,c.tx+.5,c.ty+.5),(world.crateKinds?.[terrainKey(c.tx,c.ty)] as CratePropKind|undefined)??'crate');if(ci%16===15)yield;}
  // BUILD 1049: non-solid town decor (fountain, statue) — the same
  // crateAt shapes, but these never block (they are not in crates)
  // and are never removable. A decor tile stays walkable.
  for(const d of world.propDecor ?? []) crateAt(d.tx,d.ty,surfaceElevation(effTerrain,d.tx+.5,d.ty+.5),propKindToCrateKind(d.kind));
  // BUILD 984: the 983 castle backdrop group (7-peak silhouette + 4 foot
  // houses) was removed at the user's request — no skyline, no foot
  // houses. The blue sky gradient pass above is unchanged.
  // BUILD 1008 NOTE (lines removed): a gl.LINES centreline overlay
  // was prototyped here and then REMOVED before shipping. The reason
  // is verification, not geometry: in the SwiftShader harness
  // gl.LINES draws nothing at all (isolated test: 0 red line pixels
  // vs 40,841 green triangle pixels from the same buffer layout), so
  // a line overlay cannot be browser-proven in this harness, and
  // shipping an unverifiable renderer path is a guess-build. The
  // subdivision below is the shipped mechanism, and it IS sufficient:
  // with antialias:true the 0.27-row dirt strip at 120 tiles blends
  // into a continuous ~24% dirt tint band (row 294 of the placed-line
  // far view: 37 tint pixels across the full x144-245 span, vs pure
  // grass on neighbouring rows), and at phone DPR 3 the same strip
  // covers ~0.81 rows (~81% blend). A line overlay would only help
  // where the tint band already reads; it is not worth an unverified
  // draw path. If a future harness has a real GPU, revisit.
  return new Float32Array(data);
}

// BUILD 1035 — time-sliced world rebuild. The generator above yields
// between work chunks; this wrapper runs it to completion for the
// callers that need the whole buffer synchronously (the sim, the
// measure harness, and the first frame — the world must exist before
// the first draw). The render loop uses createWorldBuilder instead,
// stepping the same generator a few milliseconds per frame while the
// player moves, so driving never blocks on a ~350ms rebuild.
// The buffer is BIT-IDENTICAL either way: the generator emits the
// same vertices in the same order; only the timing differs.
/** Synchronous world-buffer build (unchanged behaviour, runs the generator to completion). */
export function buildWorldVertices(world: IsoWorld, center: Position, enteredHut: HutRect | null = null, customAssets: CustomAsset[] = []): Float32Array {
  const gen = buildWorldVerticesGen(world, center, enteredHut, customAssets);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

/** A resumable world-buffer build: step() runs the generator until
 *  the time budget is spent (or it finishes) and reports completion.
 *  `center` is the build centre the buffer was built around — the
 *  driver records it as the last build centre on upload (NOT the
 *  player's position at upload time, which has moved on). */
export interface WorldBuilder {
  readonly center: Position;
  readonly enteredHut: HutRect | null;
  readonly customAssets: CustomAsset[];
  step(budgetMs: number): boolean;
  result(): Float32Array;
}
export function createWorldBuilder(world: IsoWorld, center: Position, enteredHut: HutRect | null = null, customAssets: CustomAsset[] = []): WorldBuilder {
  const gen = buildWorldVerticesGen(world, center, enteredHut, customAssets);
  let done = false;
  let value: Float32Array | null = null;
  return {
    center,
    enteredHut,
    customAssets,
    step(budgetMs: number): boolean {
      if (done) return true;
      const t0 = performance.now();
      let r = gen.next();
      while (!r.done && performance.now() - t0 < budgetMs) r = gen.next();
      if (r.done) { done = true; value = r.value; return true; }
      return false;
    },
    result(): Float32Array {
      if (!done || !value) throw new Error('WorldBuilder: result() before completion');
      return value;
    },
  };
}

// BUILD 1017: diagnostics snapshot for the Options dialog (GraphicsModeHost).
// The play screen no longer shows the diagnostic line; the view reports
// {verts, map, position} to the parent instead, and Options > Diagnostics
// renders it on demand.
export interface Diagnostics3D { verts: number; mapW: number; mapH: number; x: number; y: number; }

export default function Engine3DWorldView({ onExit, fpAuto = true, hideUi = false, onDiagnostics }: { onExit?: () => void; fpAuto?: boolean; hideUi?: boolean; onDiagnostics?: (d: Diagnostics3D) => void }) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [message,setMessage]=useState('Connected to the editable world map');
  // BUILD 992: first person (was the 983 street view, now engaged by
  // zooming all the way in). The ref is what the render loop reads;
  // the state drives the first-person hint text. fpAuto comes from the
  // Options dialog (GraphicsModeHost); the ref mirror keeps it live
  // without re-running the render effect.
  const [firstPersonOn,setFirstPersonOn]=useState(false);
  const firstPersonRef=useRef(false);
  const fpAutoRef=useRef(fpAuto);
  useEffect(()=>{fpAutoRef.current=fpAuto;},[fpAuto]);
  // BUILD 1017: diagnostics snapshot (see Diagnostics3D above) + the
  // parent callback, mirrored into refs so the render loop (which closes
  // over refs, not state) can report it without re-running.
  const diagRef=useRef<Diagnostics3D>({verts:0,mapW:200,mapH:200,x:99,y:105});
  const onDiagnosticsRef=useRef(onDiagnostics);
  onDiagnosticsRef.current=onDiagnostics;
  const [position,setPosition]=useState<Position>(()=>savedPosition(applyMosslightTownLayout(loadWorld())));
  // Report position changes to Options > Diagnostics (verts/map ride along
  // from the last world rebuild). Placed after the position declaration:
  // the effect reads position, so it cannot sit above it.
  useEffect(()=>{const next={...diagRef.current,x:Math.round(position.x),y:Math.round(position.y)};diagRef.current=next;onDiagnosticsRef.current?.(next);},[position]);
  const [inventory,setInventory]=useState<Inventory3D>(()=>readSaved<Inventory3D>(INVENTORY_KEY,{}));
  const [health,setHealth]=useState<number>(()=>{try{const n=Number(localStorage.getItem(HEALTH_KEY));return Number.isFinite(n)&&n>0?Math.min(100,n):100}catch{return 100}});
  // BUILD 1003: stamina UI state (throttled publish from draw(); the
  // authoritative value lives in staminaRef, session-only, never saved).
  const [staminaUi,setStaminaUi]=useState<StaminaState>(FULL_STAMINA);
  const [sprintingUi,setSprintingUi]=useState(false);
  const inventoryRef=useRef<Inventory3D>(inventory); inventoryRef.current=inventory;
  const healthRef=useRef<number>(health); healthRef.current=health;
  // BUILD 1003: sprint hold (button or Shift key) + stamina. Session-only:
  // staminaRef starts full on every mount and is never written to storage.
  const sprintHeldRef=useRef(false);
  const staminaRef=useRef<StaminaState>({...FULL_STAMINA});
  const sprintingRef=useRef(false);
  // BUILD 1018: tap-to-toggle sprint latch + robust hold tracking.
  // sprintLatchRef = the toggle: a quick tap latches sprint ON until
  // tapped again or until exhaustion. (BUILD 1026: the 2s idle-clear
  // is gone — it killed "tap sprint, then move", and the 2.5D toggle
  // persists; a stale latch cannot run the player into a wall forever
  // because it only sprints while there is input, and a pinned target
  // clears with 'Path blocked' / slides around it.)
  // sprintPointerIdRef = the pointer currently holding the button (or
  // null); the hold ends ONLY on pointerup for that id — a second
  // finger's up/cancel can never kill the first finger's hold.
  // sprintDownRef = where/when the hold started, for the tap test.
  // BUILD 1020: sprintRearmRef = the exhaustion rearm gate. Once stamina
  // hits 0, sprint stays off until ALL sprint input is released and
  // pressed again — a sustained hold no longer surges sprint→walk→sprint
  // every ~7s. Session-only ref, never saved.
  // BUILD 1021: the gate is a level, not an edge — a press that starts
  // while already tired also arms it (nextSprintRearm takes the tired
  // level now); a release only disarms it after recovery.
  const sprintRearmRef=useRef(false);
  // BUILD 1021: slidePerpRef = the sticky perpendicular-slide side.
  // Once a slide-around picks east (or west/north/south), the player
  // keeps sliding that way until the direct path opens — a tap-to-move
  // push's lateral sign flips as the player crosses the target's x/y,
  // and without this the slide ping-pongs and never gets around a
  // wide obstacle. Cleared on a direct step and whenever there is no
  // movement input at all (a new journey starts fresh). Session-only.
  const slidePerpRef=useRef<PerpDir | null>(null);
  // BUILD 1030: tap-to-walk path state. playerPathRef = the A* waypoints
  // for the active tap journey (null = direct push, e.g. interior taps
  // or D-pad). The other refs are the follower's bookkeeping: replan
  // throttle, figure-block wait, and stuck detection. Session-only.
  const playerPathRef=useRef<PlayerPath | null>(null);
  const playerPathReplanRef=useRef(0);
  const playerPathWaitRef=useRef<{since:number;x:number;y:number}|null>(null);
  const playerPathStuckRef=useRef<{x:number;y:number;since:number}|null>(null);
  const sprintLatchRef=useRef(false);
  const sprintPointerIdRef=useRef<number|null>(null);
  const sprintDownRef=useRef<{t:number;x:number;y:number}|null>(null);
  const [sprintLatchedUi,setSprintLatchedUi]=useState(false);
  // BUILD 1026: sprintRearmUi = the exhaustion rearm gate, published
  // for the button label. Repro2 measured 84 samples after recovery
  // (stamina >=25) while STILL holding, sprinting=0, gate armed — the
  // user holds a dead button with no hint. The gate stays (removing it
  // reintroduces the 1020 sawtooth); the button now says "Release!"
  // while the gate is armed and stamina has recovered, so the user
  // knows to lift and press again. Armed + recovered only ever holds
  // while input is still held (a release disarms the gate on the next
  // frame), so the label needs no separate input state.
  const [sprintRearmUi,setSprintRearmUi]=useState(false);
  // BUILD 1026 probe counters (read-only via __ag3dTest; no gameplay
  // effect): world-buffer rebuilds and stamina-UI publishes.
  const rebuildCountRef=useRef(0);
  const staminaPublishCountRef=useRef(0);
  // BUILD 1035: time-sliced rebuild driver state (see the draw loop).
  // worldBuilderRef = the in-progress builder (null when idle);
  // prevPlayerRef = the player position last frame, for the adaptive
  // budget (moving → 10ms/frame, stationary → run to completion);
  // buildFramesRef/buildMsRef = the frames/ms the current build has
  // taken; rebuildStepStatsRef = the probe-visible step statistics
  // (count, worst single step, worst single step WHILE MOVING, total
  // step time, last build's frames and ms — read-only via __ag3dTest
  // getRebuildStats). maxStepMsMoving is the invariant that matters:
  // a stationary build is ALLOWED to run to completion in one step
  // (the load build does, ~200ms on a phone, ~500ms cold under
  // SwiftShader), so the raw maxStepMs is not the hitch signal — a
  // step while the player is moving is.
  const worldBuilderRef=useRef<WorldBuilder|null>(null);
  const prevPlayerRef=useRef<{x:number;y:number}|null>(null);
  const buildFramesRef=useRef(0);
  const buildMsRef=useRef(0);
  const rebuildStepStatsRef=useRef({count:0,maxStepMs:0,maxStepMsMoving:0,totalStepMs:0,lastBuildFrames:0,lastBuildMs:0});
  // BUILD 1018: end a Sprint-button hold. Only the pointer that started
  // the hold can end it (pointerId-gated). A quick, still press is a TAP
  // and flips the latch; a longer hold just releases. Called from the
  // button's own pointerup AND the window-level backstop (without pointer
  // capture, a finger that slides off the button lifts over another
  // element — the button never sees that up, so the window catches it).
  const releaseSprintPointer=(pointerId:number,clientX:number,clientY:number,allowToggle:boolean)=>{
    if(sprintPointerIdRef.current!==pointerId)return;
    sprintPointerIdRef.current=null;sprintHeldRef.current=false;
    const down=sprintDownRef.current;sprintDownRef.current=null;
    if(allowToggle&&down&&isSprintTap(down.t,performance.now(),down.x,down.y,clientX,clientY)){
      const next=latchAfterTap(sprintLatchRef.current,staminaRef.current.exhausted);
      sprintLatchRef.current=next;
      setSprintLatchedUi(next);
    }
  };
  // BUILD 1004: swipe-gesture tracking refs (pointerId-gated, so a
  // second finger never hijacks a swipe already in progress; each
  // resets on pointerup/pointercancel, and a vertical panel scroll
  // cancels the panel tracker via pointercancel from the browser).
  const panelSwipeRef=useRef<{id:number;x:number;y:number;fired:boolean}|null>(null);
  const edgeSwipeRef=useRef<{id:number;x:number;y:number}|null>(null);
  const handleSwipeRef=useRef<{id:number;x:number;y:number}|null>(null);
  const stateRef=useRef({position,world:loadWorld()});
  const needsWorldRebuild=useRef(true);
  const npcActorsRef=useRef<NpcActor3D[]>([]);
  // BUILD 1000: transient figures (travelers + adventurers). A
  // SEPARATE array from npcActorsRef on purpose: the resident timer
  // serializes npcActorsRef to NPC_SAVE_KEY every tick, and transients
  // must never land in a resident save. Session-only by construction.
  const transientActorsRef=useRef<TransientActor[]>([]);
  // BUILD 1000: transient spawn pacing tick (shared by the timer and
  // the spawnTransient probe hook).
  const transientTickRef=useRef(0);
  // BUILD 1013: wild animals (birds, goats, deer, wolves). Session-only
  // like transients (see animals.ts header §5): a separate array the
  // view never serializes; reload repopulates them fresh.
  const animalActorsRef=useRef<AnimalActor[]>([]);
  const animalTickRef=useRef(0);
  // BUILD 993: the 3D day clock (1 game minute per real second while the
  // view is mounted, persisted so phases survive reloads). Default 08:00.
  const clockRef=useRef(loadClock());
  // BUILD 1011: cloud-drift clock (real seconds, accumulated per frame;
  // session-only — clouds keep drifting, they do not need persistence).
  const skyDriftRef=useRef(0);
  // BUILD 984 placement tool. The ref mirrors the state for the
  // render-loop closures (which capture refs, not state).
  const [buildOpen,setBuildOpen]=useState(false);
  const [palette,setPalette]=useState<PaletteKind|null>(null);
  const [removeMode,setRemoveMode]=useState(false);
  const [moveMode,setMoveMode]=useState(false);
  const [placedCount,setPlacedCount]=useState(0);
  // BUILD 996: chunk tools. saveAreaMode arms the rectangle drag;
  // pasteName arms stamping (the template's name, or null). Both
  // mirror into buildRef like every other tool, because the pointer
  // handlers close over buildRef, not over React state.
  const [saveAreaMode,setSaveAreaMode]=useState(false);
  const [pasteName,setPasteName]=useState<string|null>(null);
  const [saveSelection,setSaveSelection]=useState<{x0:number;y0:number;x1:number;y1:number;count:number}|null>(null);
  const saveSelectionRef=useRef<{x0:number;y0:number;x1:number;y1:number;count:number}|null>(null);
  saveSelectionRef.current=saveSelection;
  // BUILD 1037: AREA SELECT. areaSelectMode arms the rectangle drag;
  // areaSelection is the live selection (rect + contents, mirrored
  // into areaSelectionRef for the pointer handlers and the draw loop,
  // like saveSelection). areaMoveArmed arms drag-to-move (tap Move,
  // then drag anywhere); areaDuplicateArmed arms tap-to-place a copy.
  // areaDeleteArmed is the two-tap delete confirmation (panel only).
  // All three arms mirror into buildRef like every other tool.
  const [areaSelectMode,setAreaSelectMode]=useState(false);
  const [areaSelection,setAreaSelection]=useState<AreaSelection|null>(null);
  const areaSelectionRef=useRef<AreaSelection|null>(null);
  areaSelectionRef.current=areaSelection;
  const [areaMoveArmed,setAreaMoveArmed]=useState(false);
  const [areaDuplicateArmed,setAreaDuplicateArmed]=useState(false);
  const [areaDeleteArmed,setAreaDeleteArmed]=useState(false);
  // The yellow selection overlay div + label (direct-DOM, like the
  // save-area preview — never React state per pointermove). Declared
  // here, with the state, so the action helpers can hide it.
  const areaSelectPreviewRef=useRef<HTMLDivElement|null>(null);
  const areaSelectPreviewLabelRef=useRef<HTMLSpanElement|null>(null);
  const [chunkName,setChunkName]=useState('');
  const buildRef=useRef<{palette:PaletteKind|null;removeMode:boolean;moveMode:boolean;saveAreaMode:boolean;pasteName:string|null;customAssetId:string|null;areaSelectMode:boolean;areaMoveArmed:boolean;areaDuplicateArmed:boolean}>({palette:null,removeMode:false,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:null,areaSelectMode:false,areaMoveArmed:false,areaDuplicateArmed:false});
  // BUILD 1036: placement rotation (quarter-turns clockwise) + the
  // placement preview. Rotation is a placement setting: it persists
  // across asset switches and cancels, and resets only when the
  // panel closes (×). placementRotRef mirrors it for the pointer
  // handlers (which close over refs, not state).
  const [placementRot, setPlacementRot] = useState<Rotation>(0);
  const placementRotRef = useRef<Rotation>(0);
  const placePreviewRef = useRef<HTMLDivElement | null>(null);
  const placePreviewLabelRef = useRef<HTMLSpanElement | null>(null);
  // Last pointer position the placement preview was drawn for, so a
  // rotation-button tap can redraw it without waiting for a move.
  const placeHoverRef = useRef<{ x: number; y: number } | null>(null);
  // The effect-local showPlacementPreview, mirrored here so the
  // rotation buttons (panel JSX) can redraw the preview at the last
  // hovered tile immediately after a rotation.
  const placePreviewFnRef = useRef<((x: number, y: number) => void) | null>(null);
  const setPlacementRotBoth = (r: Rotation) => { placementRotRef.current = r; setPlacementRot(r); };
  // BUILD 1036: cancel placement — disarm the armed asset (and any
  // paste), hide the preview. Move mode stays as it was, so ESC /
  // right-click after "Move + pick an asset" returns to dragging
  // items instead of dropping the whole tool.
  const cancelPlacement = () => {
    setPalette(null); setCustomSelection(null); setPasteName(null);
    buildRef.current = { ...buildRef.current, palette: null, customAssetId: null, pasteName: null };
    const el = placePreviewRef.current; if (el) el.style.display = 'none';
    placeHoverRef.current = null;
  };
  // BUILD 996: chunk library. Lazy-loaded from localStorage (key
  // ag-3d-templates-v1, separate from world saves); every change
  // persists via the effect below. templatesRef mirrors it for the
  // pointer handlers (same pattern as stateRef). Saving/deleting a
  // chunk is panel state, never a world change or undo entry.
  const [templates,setTemplates]=useState<ChunkTemplate[]>(()=>loadTemplates());
  const templatesRef=useRef<ChunkTemplate[]>(templates);
  templatesRef.current=templates;
  useEffect(()=>{saveTemplates(templates);},[templates]);
  // BUILD 1044: custom uploads live in IndexedDB (assetStore.ts),
  // not localStorage. The library starts EMPTY and fills from the
  // store before placement/rendering is enabled: the init effect
  // below migrates the legacy localStorage library once (and only
  // deletes the legacy key after read-back validation), then loads
  // the store into this state. customAssetsRef mirrors it for the
  // render-loop closures (which capture refs, not state).
  // customAssetsLoading is the small loading state the hub and the
  // Custom category show while the store is opening; customAssetsWarning
  // is a visible warning when migration partially failed or IndexedDB
  // is unavailable (in which case the legacy library is loaded for
  // the session and new uploads will not survive a reload — the world
  // still boots, and nothing is silently lost). assetStoreRef is the
  // serialised store; assetStoreReadyRef says IndexedDB is usable
  // this session. Uploading is library state, never a world change
  // or undo entry; placing an upload is a normal `place` entry, and
  // deleting an upload removes its placed copies at once (also not
  // undoable — same as deleting a chunk).
  const [customAssets,setCustomAssets]=useState<CustomAsset[]>([]);
  const [customAssetsLoading,setCustomAssetsLoading]=useState(true);
  const [customAssetsWarning,setCustomAssetsWarning]=useState<string|null>(null);
  // Refs mirror the two states for the __ag3dTest hook below (its
  // effect runs once, so a state closure there would go stale).
  const customAssetsLoadingRef=useRef(true);
  const customAssetsWarningRef=useRef<string|null>(null);
  const setAssetsLoading=(v:boolean)=>{customAssetsLoadingRef.current=v;setCustomAssetsLoading(v);};
  const setAssetsWarning=(w:string|null)=>{customAssetsWarningRef.current=w;setCustomAssetsWarning(w);};
  const customAssetsRef=useRef<CustomAsset[]>(customAssets);
  customAssetsRef.current=customAssets;
  const assetStoreRef=useRef<AssetStore|null>(null);
  const assetStoreReadyRef=useRef(false);
  const setLibrary=(next:CustomAsset[])=>{setCustomAssets(next);customAssetsRef.current=next;writeAssetManifest(next);};
  // Serial queue for library commits: two rapid uploads (or an
  // upload and a delete) never interleave their read-modify-write of
  // the in-memory library, so no asset is ever lost between them.
  const libraryQueueRef=useRef<Promise<void>>(Promise.resolve());
  const runLibraryOp=<T,>(op:()=>Promise<T>):Promise<T>=>{
    const p=libraryQueueRef.current.then(op);
    libraryQueueRef.current=p.then(()=>undefined,()=>undefined);
    return p;
  };
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const store=createAssetStore(createIndexedDbAssetBackend());
        assetStoreRef.current=store;
        const legacy=loadCustomAssets();
        const mig=await store.migrate(legacy);
        let assets=await store.loadAll();
        if(!cancelled&&mig.failed.length>0){
          // Migration partially failed: the legacy key is KEPT (the
          // caller only deletes it on a clean verified migration),
          // and the assets that failed to move stay usable from the
          // legacy library for this session.
          const failedIds=new Set(mig.failed.map(f=>f.id));
          const kept=legacy.filter(l=>failedIds.has(l.id));
          const have=new Set(assets.map(a=>a.id));
          assets=[...assets,...kept.filter(k=>!have.has(k.id))];
          setAssetsWarning('Some old uploads could not be moved to the new model store ('+mig.failed.length+' failed: '+mig.failed.slice(0,2).map(f=>f.reason).join('; ')+') — they are still saved in the old storage and still work here. Try deleting one and re-uploading it.');
        }else if(!cancelled&&mig.verified&&legacy.length>0){
          try{localStorage.removeItem(CUSTOM_ASSETS_KEY);}catch{/* the key staying is harmless — the next boot re-runs the idempotent migration */}
        }
        if(cancelled)return;
        assetStoreReadyRef.current=true;
        setLibrary(assets);
      }catch(err){
        if(cancelled)return;
        // IndexedDB unavailable (private mode, blocked, old browser):
        // the world still boots. The legacy library loads for this
        // session; new uploads will not survive a reload, and the hub
        // says so plainly.
        assetStoreReadyRef.current=false;
        setAssetsWarning('This browser cannot open the new model store ('+describeStoreError(err)+') — your old uploads are still here for this session, but new uploads will not survive a reload.');
        const legacy=loadCustomAssets();
        setCustomAssets(legacy);customAssetsRef.current=legacy;
      }finally{
        if(!cancelled)setAssetsLoading(false);
      }
    })();
    return ()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const [customSelection,setCustomSelection]=useState<string|null>(null);
  // BUILD 1043: Import Hub open state (the hub lives at the top of
  // the Build panel; it is panel UI state like the catalog category).
  const [importHubOpen,setImportHubOpen]=useState(false);
  // BUILD 1045: Import Hub Stage 3 — preview + library. Parsed models
  // wait in `pendingImports` until the player taps an explicit Add
  // (they join the library then, and only then) or Cancel (they are
  // dropped — nothing was ever written for them). `importProgress`
  // is the real, live progress of a running import: files/bytes
  // read out of the totals, advanced between awaited reads/parses.
  // The library search/sort/filter state keeps a growing library
  // usable: search matches name, tags, and source filename; the
  // category and format filters narrow it; sort orders it.
  const [pendingImports,setPendingImports]=useState<CustomAsset[]>([]);
  const pendingImportsRef=useRef<CustomAsset[]>([]);
  const setPending=(next:CustomAsset[])=>{pendingImportsRef.current=next;setPendingImports(next);};
  // BUILD 1046: the last import's report (hub UI, not just a log),
  // the dependencies the parsers reported for pending imports
  // (keyed by pending asset id — a missing texture is a note, a
  // .bin found in a subfolder is a note, neither blocks the Add),
  // and the overwrite prompt (a name collision asks first — the
  // commit waits until the player picks Keep both / Replace /
  // Skip for every colliding row).
  const [importReport,setImportReportState]=useState<ImportReport|null>(null);
  const importReportRef=useRef<ImportReport|null>(null);
  const setReport=(r:ImportReport|null)=>{importReportRef.current=r;setImportReportState(r);};
  const pendingDepsRef=useRef(new Map<string, GltfDependency[]>());
  const [overwritePrompt,setOverwritePromptState]=useState<OverwritePrompt|null>(null);
  const overwritePromptRef=useRef<OverwritePrompt|null>(null);
  const setOverwrite=(o:OverwritePrompt|null)=>{overwritePromptRef.current=o;setOverwritePromptState(o);};
  const [importProgress,setImportProgress]=useState<ImportProgress|null>(null);
  const importProgressRef=useRef<ImportProgress|null>(null);
  const setProgress=(p:ImportProgress|null)=>{importProgressRef.current=p;setImportProgress(p);};
  const [librarySearch,setLibrarySearch]=useState('');
  const [librarySort,setLibrarySort]=useState<LibrarySort>('name');
  const [libraryCategoryFilter,setLibraryCategoryFilter]=useState('all');
  const [libraryFormatFilter,setLibraryFormatFilter]=useState('all');
  // Rename-in-progress: which library row is being renamed + the draft.
  const [renamingId,setRenamingId]=useState<string|null>(null);
  const [renameDraft,setRenameDraft]=useState('');
  // BUILD 1047: AI / development handoff — which library rows are
  // ticked for the handoff (individual checkboxes; the whole
  // category / whole library are scopes, not stored state), and what
  // the last handoff copy / share / export did (probes only — the
  // player sees the same facts in the message line).
  const [handoffChecked,setHandoffChecked]=useState<string[]>([]);
  const handoffCheckedRef=useRef<string[]>([]);
  const setHandoffCheckedBoth=(ids:string[])=>{handoffCheckedRef.current=ids;setHandoffChecked(ids);};
  const handoffCopyRef=useRef<'clipboard'|'select-text'|null>(null);
  const handoffShareRef=useRef<'share'|'download'|'cancelled'|null>(null);
  const handoffExportRef=useRef(0);
  const handoffSummaryRef=useRef<HTMLTextAreaElement|null>(null);
  // BUILD 989: Walk suspension. Suspension is a separate flag from the
  // tool itself: Walk pauses taps (they walk) while the preserved
  // selection stays stored in buildRef; tapping Walk again resumes it.
  // Suspension lives ONLY while minimized — reopening the panel
  // resumes the tool, closing clears suspension with everything else.
  // BUILD 991: unlimited Undo + Redo stacks (MS Paint style). Every
  // Build-panel change pushes one inverse entry onto the undo stack
  // and clears the redo stack; each Undo tap pops one entry, applies
  // its inverse, and pushes it onto redo; each Redo tap replays one
  // entry forward. A whole stroke = one entry, so one tap undoes a
  // whole drag. Both stacks are session-only refs (never saved):
  // after a reload both buttons are disabled until a new change that
  // session. Closing the panel clears NEITHER stack (989 rule kept).
  // Undo/Redo stay available while inside a house (990): they are
  // world-level edits, not interior edits.
  const [walkSuspended,setWalkSuspended]=useState(false);
  const walkRef=useRef(false);
  const historyRef=useRef<BuildHistory>(createBuildHistory());
  const [undoAvailable,setUndoAvailable]=useState(false);
  const [redoAvailable,setRedoAvailable]=useState(false);
  const setWalk=(v:boolean)=>{walkRef.current=v;setWalkSuspended(v);if(v){const el=placePreviewRef.current;if(el)el.style.display='none';}};
  const syncHistory=()=>{setUndoAvailable(historyRef.current.undo.length>0);setRedoAvailable(historyRef.current.redo.length>0);};
  const pushHistory=(entry:UndoEntry)=>{recordBuildChange(historyRef.current,entry);syncHistory();};
  const doUndo=()=>{
    const world=stateRef.current.world;
    const msg=undoBuildChange(world,historyRef.current);if(msg===null)return;
    syncHistory();saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);setMessage(msg);
  };
  const doRedo=()=>{
    const world=stateRef.current.world;
    const msg=redoBuildChange(world,historyRef.current);if(msg===null)return;
    syncHistory();saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);setMessage(msg);
  };
  const toolLabel=(p:PaletteKind|null,rm:boolean,mv?:boolean,sa?:boolean,pn?:string|null,as?:boolean)=>pn?('Paste '+pn):as?'Area select':sa?'Save area':mv?'Move':rm?'Remove':p?({path:'Pathway',house:'House',tree:'Tree',stall:'Market Stall',grass:'Grass','house-cottage':'Cottage','house-tall':'Tall House','house-shop':'Shopfront','house-grand':'Grand House','house-inn':'Inn','house-smith':'Blacksmith','house-store':'General Store','house-windmill':'Windmill','house-mine':'Mine',lantern:'Lantern',bush:'Bush',ore:'Ore Deposit',bridge:'Wooden Bridge',farm:'Farm Land',fence:'Fence'} as Record<PaletteKind,string>)[p]:'';
  // BUILD 997: display name for a placed item — built-in kinds use
  // the catalog label; a custom item uses its upload's name (or a
  // fallback when the upload is gone). Used by Move/Remove messages
  // so they never index KIND_META with 'custom' (which has no entry
  // and would crash the preview/message path). BUILD 1012: a placed
  // house shows its variant's label (Cottage / Tall House /
  // Shopfront / Grand House); a legacy variant-less house is 'House'.
  const placementLabel=(item:PlacedItem)=>item.kind==='custom'?(customAssetsRef.current.find(a=>a.id===item.assetId)?.name??'Custom model'):item.kind==='house'&&item.variant?(HOUSE_VARIANTS[item.variant]?.label??'House'):({path:'Pathway',house:'House',tree:'Tree',stall:'Market Stall',grass:'Grass',rock:'Rock',water:'Water',wall:'Wall',lantern:'Lantern',bush:'Bush',ore:'Ore Deposit',bridge:'Wooden Bridge',farm:'Farm Land',fence:'Fence'} as Record<string,string>)[item.kind]??item.kind;
  const walkToolLabel=()=>{const t=toolLabel(palette,removeMode,moveMode,saveAreaMode,pasteName,areaSelectMode);if(t)return t;if(customSelection){const a=customAssets.find(x=>x.id===customSelection);return a?a.name:'Custom';}return '';};
  // BUILD 1004: the ONE Remove toggle. The panel's Remove button and
  // the minimized-cluster quick button both call this, so the two can
  // never diverge. Body is the panel toggle's original handler, moved
  // verbatim: turning Remove on clears any palette/custom choice and
  // Move/Save/Paste; turning it off keeps the palette it displaced.
  const toggleRemove=()=>{const next=!removeMode;setRemoveMode(next);if(next){setPalette(null);setCustomSelection(null);}setMoveMode(false);setSaveAreaMode(false);setPasteName(null);buildRef.current={palette:next?null:palette,removeMode:next,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:next?null:buildRef.current.customAssetId,areaSelectMode:buildRef.current.areaSelectMode,areaMoveArmed:buildRef.current.areaMoveArmed,areaDuplicateArmed:buildRef.current.areaDuplicateArmed};};
  // BUILD 1037: the ONE Area-select toggle. Turning it on clears any
  // palette/custom choice and Move/Remove/Save/Paste (the Save-area
  // toggle's rule); turning it off KEEPS the selection — the yellow
  // area stays so the actions menu still works, and Clear or × drops
  // it. Move/Duplicate arms are dropped with the tool (they refer to
  // the drag, not the selection).
  const toggleAreaSelect=()=>{const next=!areaSelectMode;setAreaSelectMode(next);if(next){setPalette(null);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setSaveAreaMode(false);setPasteName(null);}setAreaMoveArmed(false);setAreaDuplicateArmed(false);setAreaDeleteArmed(false);buildRef.current={palette:next?null:palette,removeMode:next?false:removeMode,moveMode:next?false:moveMode,saveAreaMode:next?false:saveAreaMode,pasteName:next?null:pasteName,customAssetId:next?null:buildRef.current.customAssetId,areaSelectMode:next,areaMoveArmed:false,areaDuplicateArmed:false};};
  const setAreaMoveArmedBoth=(v:boolean)=>{setAreaMoveArmed(v);buildRef.current={...buildRef.current,areaMoveArmed:v};};
  const setAreaDuplicateArmedBoth=(v:boolean)=>{setAreaDuplicateArmed(v);buildRef.current={...buildRef.current,areaDuplicateArmed:v};};
  const clearAreaSelection=()=>{setAreaSelection(null);setAreaMoveArmedBoth(false);setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);const el=areaSelectPreviewRef.current;if(el)el.style.display='none';};
  // BUILD 1037: the area-select action handlers (panel buttons). They
  // share the doUndo/doRedo shape (save + rebuild + one history entry
  // + message) and re-select the group afterwards, so the user can
  // rotate a group they just moved without re-dragging the rectangle.
  const areaActorTiles=()=>{const player=stateRef.current.position;return {playerTile:{x:Math.round(player.x),y:Math.round(player.y)},npcTiles:[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))]};};
  const doAreaRotate=(steps:1|-1)=>{
    const sel=areaSelectionRef.current;if(!sel)return;
    const world=stateRef.current.world;const {playerTile,npcTiles}=areaActorTiles();
    const res=rotateArea(world,sel,steps===1?1:3,playerTile,npcTiles);
    if(!res.ok){setMessage('Cannot rotate here: '+res.reason);return;}
    if(!res.entry)return;
    saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory(res.entry);
    const c=areaCentreTile(sel.rect);const newRect=rotateRect(c.x,c.y,sel.rect,steps===1?1:3);
    setAreaSelection(selectArea(world,newRect));setAreaDeleteArmed(false);
    setMessage('Rotated area '+(steps===1?'90° clockwise':'90° counter-clockwise')+' ('+res.moved+' item'+(res.moved===1?'':'s')+(res.skipped.length?', '+res.skipped.length+' skipped: '+res.skipped[0].reason:'')+')');
  };
  const doAreaDelete=()=>{
    const sel=areaSelectionRef.current;if(!sel)return;
    const world=stateRef.current.world;
    const res=deleteArea(world,sel);
    if(!res.entry){setMessage('Nothing selected to delete');return;}
    saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory(res.entry);
    clearAreaSelection();
    setMessage('Deleted '+res.removed+' item'+(res.removed===1?'':'s')+' — one Undo restores them');
  };
  // BUILD 1042: Town Builder Stage 5 — LAYOUT HELPERS. One shared
  // runner for the nine optional tools in the actions menu: each
  // helper is a pure function over (world, selection, actors) that
  // returns ONE group undo entry (or null when nothing changed), and
  // this runner does the same save + rebuild + history + re-select
  // + message shape as doAreaRotate. Nothing runs until the player
  // taps a button; a failed helper changes nothing; a no-op helper
  // reports what is already true instead of pushing history.
  const runLayoutHelper=(fn:(w:IsoWorld,s:AreaSelection,pt:{x:number;y:number},nt:Array<{x:number;y:number}>)=>LayoutResult,already:string)=>{
    const sel=areaSelectionRef.current;if(!sel)return;
    const world=stateRef.current.world;const {playerTile,npcTiles}=areaActorTiles();
    const res=fn(world,sel,playerTile,npcTiles);
    if(!res.ok){setMessage('Cannot do that here: '+res.reason);return;}
    if(!res.entry){setMessage(already+(res.skipped.length?' ('+res.skipped.length+' skipped: '+res.skipped[0].reason+')':''));return;}
    saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory(res.entry);
    setAreaSelection(selectArea(world,sel.rect));setAreaDeleteArmed(false);
    setMessage(res.message+(res.skipped.length?', '+res.skipped.length+' skipped: '+res.skipped[0].reason:'')+' — one Undo undoes it');
  };
  // BUILD 1004: "build UI is minimized" — panel hidden but a tool
  // still armed. Only in this state do the right-edge strip swipe and
  // the minimized handle reopen the panel; a full close (×) clears
  // the tools, so nothing reopens until Build is tapped again.
  const buildMinimized=!buildOpen&&!!(palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName||areaSelectMode||areaSelection);
  // BUILD 1043: arm a custom upload like any palette kind (shared by
  // the Custom catalog tiles and the Import Hub's Place buttons, so
  // the two lists can never drift apart).
  const armCustomAsset=(id:string|null)=>{
    setCustomSelection(id);setPalette(null);setRemoveMode(false);setSaveAreaMode(false);setPasteName(null);setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);
    buildRef.current={palette:null,removeMode:false,moveMode:buildRef.current.moveMode,saveAreaMode:false,pasteName:null,customAssetId:id,areaSelectMode:false,areaMoveArmed:false,areaDuplicateArmed:false};
    if(!id){const el=placePreviewRef.current;if(el)el.style.display='none';placeHoverRef.current=null;}
  };
  // BUILD 1045: Import Hub Stage 3 — staged import with real
  // progress + a review step. Files are read and parsed one at a
  // time, yielding to the event loop between files (setTimeout 0),
  // so a multi-file import never blocks the render loop in one long
  // synchronous run; the progress bar shows files and bytes read out
  // of the totals — real numbers from the work itself, never a timer.
  // Parsed models do NOT join the library here: they wait in
  // pendingImports for an explicit Add (commitPendingAssets) or
  // Cancel (discardPendingAsset). Every failure is a message, never
  // a crash, and a bad file never blocks the good ones picked with it.
  // (BUILD 997's single-.glb handler and 1044's direct commit are
  // replaced by this — the GLB/ZIP parse paths are unchanged, they
  // just end in review instead of the library.)
  const yieldToLoop=()=>new Promise<void>((r)=>setTimeout(r,0));
  const handleImportFiles=async(e:{target:{files:FileList|null;value:string}})=>{
    const files=e.target.files?Array.from(e.target.files):[];
    e.target.value='';
    if(files.length===0)return;
    setReport(null);
    const modelFiles=files.filter(f=>!/\.bin$/i.test(f.name)&&!/\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name));
    const totalBytes=files.reduce((s,f)=>s+f.size,0);
    let bytesDone=0;let filesDone=0;
    const setP=(phase:'reading'|'parsing',current:string)=>setProgress({phase,filesDone,filesTotal:modelFiles.length,bytesDone,bytesTotal:totalBytes,current});
    // BUILD 1046: companion files for any .gltf/.glb picked in the
    // same batch — its .bin, and any image it names. Keyed by file
    // name and by folder-relative path (a folder pick keeps its
    // subfolders), so a .gltf in `models/` finds `models/mesh.bin`.
    // Images are companions only: they are never models, and never
    // failures on their own — the parsers report whether a model
    // actually referenced them.
    const companionFiles=new Map<string,ArrayBuffer>();
    const relPathOf=(f:File):string=>((f as File&{webkitRelativePath?:string}).webkitRelativePath||f.name);
    const dirOf=(p:string):string=>p.includes('/')?p.slice(0,p.lastIndexOf('/')):'';
    for(const f of files.filter(f=>/\.bin$/i.test(f.name)||/\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name))){
      setP('reading',f.name);
      try{
        const buf=await f.arrayBuffer();
        companionFiles.set(f.name,buf);
        const rel=relPathOf(f);
        if(rel!==f.name)companionFiles.set(rel,buf);
        bytesDone+=f.size;
      }catch{/* a bad companion just means its .gltf fails with a clear message */}
      await yieldToLoop();
    }
    const parsed:CustomAsset[]=[];
    const failed:string[]=[];
    const skipped:ImportReport['skipped']=[];
    const notes:string[]=[];
    // BUILD 1046: a missing texture (or a .bin found in a
    // subfolder) is a report note, not a silent drop — the model
    // still imports, and the hub says plainly that the texture was
    // not found and was not applied.
    const noteDeps=(asset:CustomAsset,deps?:GltfDependency[])=>{
      if(!deps)return;
      for(const d of deps){
        if(!d.found&&d.kind==='image')notes.push('\''+asset.name+'\': texture "'+d.uri+'" was named but not found — the model still imported; textures are not rendered, so nothing was applied');
        if(d.found&&d.kind==='buffer'&&d.resolvedPath&&d.resolvedPath.includes('/'))notes.push('\''+asset.name+'\': its data file "'+d.resolvedPath+'" was found in a subfolder');
      }
    };
    const accept=(res:GlbUploadResult,label:string)=>{
      if(!res.ok){failed.push(label+': '+res.reason);return;}
      parsed.push(res.asset);
      if(res.dependencies)pendingDepsRef.current.set(res.asset.id,res.dependencies);
      noteDeps(res.asset,res.dependencies);
    };
    for(const file of modelFiles){
      const lower=file.name.toLowerCase();
      setP('reading',file.name);
      if(lower.endsWith('.zip')){
        let buf:ArrayBuffer;
        try{buf=await file.arrayBuffer();bytesDone+=file.size;}catch{failed.push(file.name+': could not read the file');filesDone++;await yieldToLoop();continue;}
        setP('parsing',file.name);
        let zip;
        try{zip=await parseZipUpload(buf);}catch(err){failed.push(file.name+': '+(err instanceof Error?err.message:'could not read the ZIP'));filesDone++;await yieldToLoop();continue;}
        for(const m of zip.models)accept(m.result,m.name);
        for(const s of zip.skipped)skipped.push(s);
        if(zip.packManifest)notes.push('This ZIP is an exported asset pack'+(zip.packManifest.exportedAt?' (exported '+zip.packManifest.exportedAt.slice(0,10)+')':'')+' listing '+zip.packManifest.assetCount+' model'+(zip.packManifest.assetCount===1?'':'s')+' — the models import normally, and a name that already exists will ask first');
        filesDone++;await yieldToLoop();
        continue;
      }
      if(lower.endsWith('.glb')||lower.endsWith('.gltf')||lower.endsWith('.obj')){
        if(file.size>MAX_FILE_BYTES){failed.push(file.name+': file is over 5 MB');filesDone++;await yieldToLoop();continue;}
        try{
          if(lower.endsWith('.glb')){
            const buf=await file.arrayBuffer();bytesDone+=file.size;
            setP('parsing',file.name);await yieldToLoop();
            accept(parseGlbUpload(buf,file.name,companionFiles,dirOf(relPathOf(file))),file.name);
          }else if(lower.endsWith('.gltf')){
            const text=await file.text();bytesDone+=file.size;
            setP('parsing',file.name);await yieldToLoop();
            accept(parseGltfUpload(text,file.name,companionFiles,dirOf(relPathOf(file))),file.name);
          }else{
            const text=await file.text();bytesDone+=file.size;
            setP('parsing',file.name);await yieldToLoop();
            accept(parseObjUpload(text,file.name),file.name);
          }
        }catch{failed.push(file.name+': could not read the file');}
        filesDone++;await yieldToLoop();
        continue;
      }
      failed.push(file.name+': not a supported file (.glb, .gltf, .obj, or .zip)');
      filesDone++;await yieldToLoop();
    }
    // BUILD 1046: an image file no model referenced is noted, not
    // failed — it was only ever a possible texture, and textures
    // are not rendered.
    const referenced=new Set<string>();
    pendingDepsRef.current.forEach((deps)=>{for(const d of deps)if(d.found&&d.resolvedPath)referenced.add(d.resolvedPath);});
    for(const f of files.filter(f=>/\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name))){
      const rel=relPathOf(f);
      if(!referenced.has(f.name)&&!referenced.has(rel))notes.push('\''+f.name+'\' is an image file — images are only used as glTF texture references, and textures are not rendered, so it was ignored');
    }
    setProgress(null);
    if(parsed.length===0&&failed.length===0&&files.every(f=>/\.bin$/i.test(f.name))){
      setMessage('A .bin file on its own is not a model — select it together with its .gltf file');
      return;
    }
    if(parsed.length>0)setPending([...pendingImportsRef.current,...parsed]);
    // BUILD 1046: the hub report — exactly which models landed,
    // which entries were skipped and why, which failed, and the
    // notes above. The message bar keeps the one-line summary.
    const report:ImportReport={source:files.length===1?files[0].name:files.length+' files',added:parsed.map(a=>a.name),skipped,failed,notes};
    if(report.added.length>0||report.skipped.length>0||report.failed.length>0||report.notes.length>0)setReport(report);
    const bits:string[]=[];
    if(parsed.length>0)bits.push(parsed.length===1?'\''+parsed[0].name+'\' is ready to review below — check the preview, then tap Add to Asset Library or Cancel':parsed.length+' models are ready to review below — check each preview, then Add to Asset Library or Cancel');
    if(failed.length>0)bits.push(failed.length+' failed: '+failed.slice(0,2).join('; ')+(failed.length>2?' (+'+(failed.length-2)+' more)':''));
    if(skipped.length>0)bits.push(skipped.length+' skipped ('+skipped[0].reason+')');
    if(bits.length>0)setMessage(bits.join(' — '));
  };
  // BUILD 1045: commit pending imports to the library — the explicit
  // "Add to Asset Library" step. planLibraryCommit uniquifies names
  // and checks the budgets first; then each asset is written to
  // IndexedDB, and only the writes that succeeded join the in-memory
  // library. A failed write names the asset and the reason and adds
  // nothing — no fake success, no silent loss. Assets that failed to
  // save stay pending, so the player can retry or cancel them. When
  // IndexedDB is unavailable the add is session-only and the hub
  // warning already says so.
  const commitPendingAssets=async(toCommit:CustomAsset[],resolutions?:Map<string,OverwriteChoice>)=>{
    if(toCommit.length===0)return;
    // BUILD 1046: a name that already exists asks FIRST — the
    // commit waits until the player answers Keep both / Replace /
    // Skip for every colliding row. Nothing is overwritten silently,
    // and nothing is committed while the question is open.
    if(!resolutions){
      const collisions=findNameCollisions(customAssetsRef.current,toCommit);
      if(collisions.length>0){
        const world=stateRef.current.world;
        const placed=(world.placements??[]) as Array<{kind?:string;assetId?:string}>;
        setOverwrite({
          pending:toCommit,
          collisions:collisions.map(c=>({pendingId:c.pending.id,pendingName:c.pending.name,existingId:c.existing.id,existingName:c.existing.name,placedCount:placed.filter(p=>p.kind==='custom'&&p.assetId===c.existing.id).length})),
          choices:{},
        });
        return;
      }
    }
    await runLibraryOp(async()=>{
      const store=assetStoreRef.current;
      const live=customAssetsRef.current;
      const plan=planLibraryCommit(live,toCommit,resolutions);
      const failed:string[]=[...plan.failed];
      const persisted:CustomAsset[]=[];
      // BUILD 1046: Replace — the old asset goes away first (store
      // delete, then its placed copies with one undo stroke, the
      // same as deleting it by hand), and only then does the new
      // model take the name. If the old asset cannot be removed,
      // its replacement is NOT added — two assets must never share
      // a name after this commit.
      const blockedNames=new Set<string>();
      for(const old of plan.replaced){
        let removedOk=true;
        if(store){
          try{await store.remove(old.id);}
          catch(err){failed.push(old.name+': could not remove the old model ('+describeStoreError(err)+') — the new one was not added');removedOk=false;}
        }
        if(!removedOk){blockedNames.add(old.name);continue;}
        const world=stateRef.current.world;
        const removed=removeCustomAssetPlacements(world,old.id);
        const n=removed.length;
        setLibrary(customAssetsRef.current.filter(a=>a.id!==old.id));
        if(customSelection===old.id){setCustomSelection(null);buildRef.current={...buildRef.current,customAssetId:null};}
        if(n>0){saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory({kind:'stroke',entries:removed.map(r=>({kind:'unplace' as const,item:r.item,index:r.index}))});}
      }
      const addable=plan.toAdd.filter(a=>!blockedNames.has(a.name));
      if(addable.length>0){
        if(store){
          for(const a of addable){
            try{await store.put(a);persisted.push(a);}
            catch(err){failed.push(a.name+': could not save ('+describeStoreError(err)+')');}
          }
        }else{
          persisted.push(...addable);
        }
      }
      if(persisted.length>0)setLibrary([...customAssetsRef.current,...persisted]);
      const committedIds=new Set(persisted.map(a=>a.id));
      // BUILD 1046: an asset the player chose to Skip leaves
      // pending too — it was decided, not committed. An asset that
      // FAILED (budget / save) stays pending, so it can be retried
      // or cancelled by hand.
      const skippedIds=new Set(toCommit.filter(a=>resolutions?.get(a.id)==='skip').map(a=>a.id));
      setPending(pendingImportsRef.current.filter(a=>!committedIds.has(a.id)&&!skippedIds.has(a.id)));
      for(const id of [...committedIds,...skippedIds])pendingDepsRef.current.delete(id);
      const bits:string[]=[];
      if(persisted.length>0)bits.push('Added '+persisted.map(a=>'\''+a.name+'\'').join(', ')+' to the Asset Library — pick '+(persisted.length===1?'it':'one')+' in Custom, then tap the ground to place it');
      if(plan.replaced.length>0)bits.push('Replaced '+plan.replaced.filter(o=>!blockedNames.has(o.name)).map(o=>'\''+o.name+'\'').join(', ')+' — the old model and its placed copies were removed first');
      if(skippedIds.size>0)bits.push('Skipped '+toCommit.filter(a=>skippedIds.has(a.id)).map(a=>'\''+a.name+'\'').join(', ')+' — nothing was added for '+(skippedIds.size===1?'it':'them'));
      if(failed.length>0)bits.push(failed.length+' failed: '+failed.slice(0,2).join('; ')+(failed.length>2?' (+'+(failed.length-2)+' more)':''));
      if(bits.length>0)setMessage(bits.join(' — '));
    });
  };
  // BUILD 1046: the player answered the overwrite prompt — carry
  // the per-row choices (an unanswered row defaults to Keep both,
  // the choice that destroys nothing) into the commit.
  const resolveOverwritePrompt=()=>{
    const prompt=overwritePromptRef.current;
    if(!prompt)return;
    const resolutions=new Map<string,OverwriteChoice>();
    for(const c of prompt.collisions)resolutions.set(c.pendingId,prompt.choices[c.pendingId]??'keep');
    setOverwrite(null);
    void commitPendingAssets(prompt.pending,resolutions);
  };
  // BUILD 1046: export / back up the whole library as a ZIP — the
  // models in their original formats plus a manifest. A
  // user-initiated download to this device (on iPhone, it lands in
  // Files); nothing is uploaded anywhere. Re-importing the ZIP
  // restores the models (new ids — placements are not in the pack,
  // they live in the world save).
  const exportAssetPack=()=>{
    const assets=customAssetsRef.current;
    if(assets.length===0){setMessage('Nothing to export — the Asset Library is empty');return;}
    try{
      const pack=buildAssetPack(assets);
      const bytes=writeZipArchive(pack.entries);
      const blob=new Blob([bytes as BlobPart],{type:'application/zip'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download='ashfall-asset-pack.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      setMessage('Exported '+assets.length+' model'+(assets.length===1?'':'s')+' as ashfall-asset-pack.zip — it downloads to this device (on iPhone, find it in Files). The pack has your models plus a manifest; re-import the ZIP to restore them.');
    }catch(err){
      setMessage('Could not export the pack ('+(err instanceof Error?err.message:'unknown error')+')');
    }
  };
  // BUILD 1047: the build number stamped on a handoff (manifest +
  // summary). It must match BUILD_NUMBER in App.tsx and __AG_BUILD
  // in scripts/prepare-build-entry.cjs — the asserts check all three
  // agree, so a handoff never claims the wrong build.
  const HANDOFF_BUILD = '1047';
  // BUILD 1047: AI / development handoff. The player picks WHICH
  // assets to hand off — individual checkboxes, a whole category, or
  // the whole library — and the export is a ZIP with exactly those
  // models (original formats) + the manifest + handoff-summary.txt,
  // downloaded to this device. There is no direct handoff: the game
  // is a static page with no backend and no connected runtime, so
  // the player uploads the ZIP in their ChatGPT or Muse chat — and
  // the hub says so in plain words. Share… tries the device's file
  // share sheet first (navigator.canShare with a real File) and
  // falls back to the download when the device cannot share files,
  // saying which path ran.
  const downloadZipBytes=(bytes:Uint8Array,fileName:string)=>{
    const blob=new Blob([bytes as BlobPart],{type:'application/zip'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  };
  const handoffAssetsFor=(scope:HandoffScope)=>selectHandoffAssets(customAssetsRef.current,scope);
  const handoffSummaryFor=(scope:HandoffScope)=>buildHandoffSummary(handoffAssetsFor(scope),HANDOFF_BUILD);
  const exportHandoff=(scope:HandoffScope)=>{
    const assets=handoffAssetsFor(scope);
    if(assets.length===0){setMessage('Nothing to hand off — tick a model in the library first, or pick a category that has models.');return;}
    try{
      const pack=buildHandoffPack(assets,HANDOFF_BUILD);
      downloadZipBytes(writeZipArchive(pack.entries),HANDOFF_ZIP_NAME);
      handoffExportRef.current=assets.length;
      handoffShareRef.current='download';
      setMessage('Exported a handoff ZIP with '+assets.length+' model'+(assets.length===1?'':'s')+' — it downloads to this device (on iPhone, find it in Files). Upload the ZIP in your ChatGPT or Muse chat and paste the summary below; neither of them can see your browser files on their own.');
    }catch(err){
      setMessage('Could not export the handoff ('+(err instanceof Error?err.message:'unknown error')+')');
    }
  };
  const shareHandoff=async()=>{
    const assets=handoffAssetsFor({kind:'ids',ids:handoffCheckedRef.current});
    if(assets.length===0){setMessage('Nothing checked — tick a model in the library first.');return;}
    const pack=buildHandoffPack(assets,HANDOFF_BUILD);
    const bytes=writeZipArchive(pack.entries);
    const file=new File([bytes as BlobPart],HANDOFF_ZIP_NAME,{type:'application/zip'});
    const canShareFiles=typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});
    if(decideSharePath(canShareFiles)==='share'){
      try{
        await navigator.share({files:[file],title:'Ashfall asset handoff',text:'Models exported from Ashfall — see handoff-summary.txt inside the ZIP.'});
        handoffShareRef.current='share';handoffExportRef.current=assets.length;
        setMessage('Shared the handoff ZIP ('+assets.length+' model'+(assets.length===1?'':'s')+') — pick ChatGPT, Muse, or Files in the share sheet, and paste the summary below so the AI knows what it is looking at.');
        return;
      }catch(err){
        if((err as Error)?.name==='AbortError'){handoffShareRef.current='cancelled';setMessage('Share cancelled — nothing was sent.');return;}
        // Any other share failure falls through to the download below.
      }
    }
    handoffShareRef.current='download';handoffExportRef.current=assets.length;
    downloadZipBytes(bytes,HANDOFF_ZIP_NAME);
    setMessage('This device cannot share files from the browser, so the handoff ZIP ('+assets.length+' model'+(assets.length===1?'':'s')+') downloaded instead — find it in Files, then upload it in your ChatGPT or Muse chat.');
  };
  const copyHandoffSummary=async()=>{
    if(handoffCheckedRef.current.length===0){setMessage('Nothing checked — tick a model in the library first, then copy its summary.');return;}
    const text=handoffSummaryFor({kind:'ids',ids:handoffCheckedRef.current});
    const hasClipboard=!!(navigator.clipboard&&navigator.clipboard.writeText);
    if(decideCopyPath(hasClipboard)==='clipboard'){
      try{await navigator.clipboard.writeText(text);handoffCopyRef.current='clipboard';setMessage('Copied the handoff summary — paste it into your ChatGPT or Muse chat, along with the ZIP.');return;}catch{/* fall through to select-the-text */}
    }
    const el=handoffSummaryRef.current;
    if(el){el.focus();el.select();}
    handoffCopyRef.current='select-text';
    setMessage('The summary text is selected — copy it (long-press → Copy, or Ctrl+C) and paste it into your ChatGPT or Muse chat.');
  };
  // BUILD 1045: Cancel a pending import. Nothing was ever written
  // for it, so dropping it leaves the library exactly as it was.
  const discardPendingAsset=(id:string)=>{
    const a=pendingImportsRef.current.find(x=>x.id===id);
    setPending(discardPending(pendingImportsRef.current,id));
    pendingDepsRef.current.delete(id);
    if(a)setMessage('Discarded \''+a.name+'\' — it was not added to the library');
  };
  // BUILD 1045: edit a pending import's details before it is added
  // (name, category, tags) — pending copies only, the library is
  // untouched until Add.
  const updatePendingAsset=(id:string,patch:Partial<CustomAsset>)=>{
    setPending(pendingImportsRef.current.map(a=>a.id===id?{...a,...patch}:a));
  };
  // BUILD 1045: rename / re-categorise / re-tag a library asset. The
  // updated asset is written to the store FIRST and only then
  // replaces the old one in the library, so a failed write never
  // shows a change that did not stick.
  const updateLibraryAsset=async(updated:CustomAsset,msg:string)=>{
    await runLibraryOp(async()=>{
      const store=assetStoreRef.current;
      if(store){
        try{await store.put(updated);}
        catch(err){setMessage('Could not save that change — '+describeStoreError(err)+'. The library is unchanged.');return;}
      }
      setLibrary(customAssetsRef.current.map(a=>a.id===updated.id?updated:a));
      setMessage(msg);
    });
  };
  const renameLibraryAsset=(asset:CustomAsset,newName:string)=>{
    const trimmed=newName.trim();
    if(trimmed.length===0){setMessage('Type a name first');return;}
    const updated=renameAsset(asset,trimmed,customAssetsRef.current.map(a=>a.name));
    setRenamingId(null);
    if(updated.name===asset.name){setMessage('It is already called \''+asset.name+'\'');return;}
    void updateLibraryAsset(updated,'Renamed to \''+updated.name+'\''+(updated.name!==trimmed?' (that name was taken)':''));
  };
  const setLibraryAssetCategory=(asset:CustomAsset,category:string)=>{
    const updated=setAssetCategory(asset,category);
    void updateLibraryAsset(updated,'\''+updated.name+'\' is now in '+updated.category);
  };
  const setLibraryAssetTags=(asset:CustomAsset,input:string)=>{
    const updated=setAssetTags(asset,parseTags(input));
    void updateLibraryAsset(updated,'Tags saved for \''+updated.name+'\''+((updated.tags??[]).length===0?' (no tags)':' — '+(updated.tags??[]).join(', ')));
  };
  const deleteCustomAsset=async(asset:CustomAsset)=>{
    // Persist the deletion FIRST: if the store cannot delete, the
    // asset stays in the library and the player is told why — the
    // world is never changed for a deletion that did not stick.
    const store=assetStoreRef.current;
    if(store){
      try{await store.remove(asset.id);}
      catch(err){setMessage('Could not delete \''+asset.name+'\' — '+describeStoreError(err)+'. Your upload is still in the library.');return;}
    }
    const world=stateRef.current.world;
    const removed=removeCustomAssetPlacements(world,asset.id);
    const n=removed.length;
    setLibrary(customAssetsRef.current.filter(a=>a.id!==asset.id));
    if(customSelection===asset.id){setCustomSelection(null);buildRef.current={...buildRef.current,customAssetId:null};}
    if(n>0){saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory({kind:'stroke',entries:removed.map(r=>({kind:'unplace' as const,item:r.item,index:r.index}))});}
    setMessage('Deleted upload \''+asset.name+'\''+(n>0?' (removed '+n+' placed cop'+(n===1?'y':'ies')+')':''));
  };
  // BUILD 995: scrollable asset catalog (Sims/Forge-style). Categories
  // group the placeable kinds; tiles reuse each kind's own mesh
  // colours as the preview swatch (path = dirt tan + cobble grey,
  // house = plaster cream + roof brown, tree = foliage green + trunk
  // brown, stall = brown counter cube, grass = tuft tip-to-base
  // green). No search box: the kinds need categories, not search —
  // search becomes justified when custom uploads (997) grow the list.
  // Category selection is panel UI state: it persists while the view
  // is mounted (minimize keeps it, like the tool selection); only the
  // tool itself is cleared by close.
  // BUILD 1040: the categories are the §5 asset-library list
  // (Buildings / Houses / Shops / Decorations / Roads / Nature /
  // Infrastructure). Mapping, stated plainly: Houses = the four house
  // designs; Shops = the three commercial buildings + the market
  // stall; Buildings = the two landmark structures with interiors
  // (windmill, mine); Decorations = lantern + wall + fence; Roads = path +
  // wooden bridge (the thing you walk on); Nature = tree, bush,
  // grass, rock, water; Infrastructure = the ore deposit (the
  // resource node — wells join it when they are built). A kind lives
  // in exactly one section, so the counts above are the whole palette.
  type CatalogCategory='all'|'buildings'|'houses'|'shops'|'decorations'|'roads'|'nature'|'infrastructure'|'custom';
  const CATALOG_SECTIONS:{id:Exclude<CatalogCategory,'all'>;label:string;kinds:PaletteKind[]}[]=[
    {id:'buildings',label:'Buildings',kinds:['house-windmill','house-mine']},
    // BUILD 1012: the Houses section offers the four real town
    // house designs (cottage / tall / shopfront / grand) instead of
    // the one bare 'house' kind — each is its own palette entry with
    // its own look, footprint, and interior. Bare 'house' is the
    // legacy placed kind (old saves only) and is not offered here.
    {id:'houses',label:'Houses',kinds:['house-cottage','house-tall','house-shop','house-grand']},
    {id:'shops',label:'Shops',kinds:['house-inn','house-smith','house-store','stall']},
    {id:'decorations',label:'Decorations',kinds:['lantern','wall','fence']},
    {id:'roads',label:'Roads',kinds:['path','bridge']},
    // BUILD 1041: farm land joins Nature (it is tilled ground, like
    // the grass and the bush — a field, not a building).
    {id:'nature',label:'Nature',kinds:['tree','bush','grass','rock','water','farm']},
    {id:'infrastructure',label:'Infrastructure',kinds:['ore']},
  ];
  const KIND_META:Record<PaletteKind,{label:string;swatch:string}>={
    path:{label:'Pathway',swatch:'linear-gradient(135deg,#bd914f 0 50%,#61615c 50% 100%)'},
    house:{label:'House',swatch:'linear-gradient(135deg,#d6c799 0 50%,#6b452b 50% 100%)'},
    // BUILD 1012 swatches (995 style: the model's own colours) —
    // each variant's plaster + roof, so the four read apart at a
    // glance: cottage cream/brown, tall pale-yellow/red tile,
    // shopfront tan/dark timber (open colonnade), grand warm
    // beige/dark brown.
    'house-cottage':{label:'Cottage',swatch:'linear-gradient(135deg,#d6c799 0 50%,#6b452b 50% 100%)'},
    'house-tall':{label:'Tall House',swatch:'linear-gradient(135deg,#dec78f 0 50%,#8f3626 50% 100%)'},
    'house-shop':{label:'Shopfront',swatch:'linear-gradient(135deg,#c2a678 0 50%,#3a281a 50% 100%)'},
    'house-grand':{label:'Grand House',swatch:'linear-gradient(135deg,#d1b183 0 50%,#54341e 50% 100%)'},
    // BUILD 1015 swatches: inn cream/amber sign, smith dark stone/
    // forge ember, store tan/terracotta awning.
    'house-inn':{label:'Inn',swatch:'linear-gradient(135deg,#d6c799 0 50%,#c79540 50% 100%)'},
    'house-smith':{label:'Blacksmith',swatch:'linear-gradient(135deg,#61615c 0 50%,#b35a1e 50% 100%)'},
    'house-store':{label:'General Store',swatch:'linear-gradient(135deg,#c2a678 0 50%,#8c402e 50% 100%)'},
    // BUILD 1038 swatch: windmill stone grey / timber brown.
    'house-windmill':{label:'Windmill',swatch:'linear-gradient(135deg,#9a9a94 0 50%,#6b4a2b 50% 100%)'},
    // BUILD 1040 swatch: mine dark rock / gold ore glint.
    'house-mine':{label:'Mine',swatch:'linear-gradient(135deg,#57564f 0 50%,#d9a833 50% 100%)'},
    // BUILD 1040 swatches (995 style: the model's own colours) —
    // lantern warm glow / dark timber, bush two greens, ore grey /
    // gold, bridge plank browns.
    lantern:{label:'Lantern',swatch:'linear-gradient(135deg,#f5c25c 0 50%,#3a281a 50% 100%)'},
    bush:{label:'Bush',swatch:'linear-gradient(135deg,#2e5c2b 0 50%,#4a7a3a 50% 100%)'},
    ore:{label:'Ore Deposit',swatch:'linear-gradient(135deg,#8a8d8a 0 50%,#d9a833 50% 100%)'},
    bridge:{label:'Wooden Bridge',swatch:'linear-gradient(135deg,#8f6a38 0 50%,#6b4a2b 50% 100%)'},
    // BUILD 1041 swatch: farm land tilled brown / ready wheat gold.
    farm:{label:'Farm Land',swatch:'linear-gradient(135deg,#593d24 0 50%,#d9a833 50% 100%)'},
    // BUILD 1042 swatch: fence timber browns (posts + rails).
    fence:{label:'Fence',swatch:'linear-gradient(135deg,#7a5a30 0 50%,#5a3d1e 50% 100%)'},
    tree:{label:'Tree',swatch:'linear-gradient(135deg,#295729 0 50%,#5c3b1f 50% 100%)'},
    stall:{label:'Market Stall',swatch:'#914f29'},
    // BUILD 1025: Rock — the generated rock's own grey (seeded cube
    // [.43,.45,.44] x shade .8-1.05), so the swatch reads as the rock.
    rock:{label:'Rock',swatch:'linear-gradient(135deg,#8a8d8a 0 50%,#5c5e5c 50% 100%)'},
    // BUILD 1027: Water — the water surface's own blue
    // (COLORS.water [0.12,0.36,0.57] ≈ #1f5c91), so the swatch reads
    // as the water it places.
    water:{label:'Water',swatch:'linear-gradient(180deg,#2e6ea8 0,#1f5c91 100%)'},
    // BUILD 1028: Wall — the generated wall's own dark grey-brown
    // ([.43,.39,.32] ≈ #6e6352), so the swatch reads as the wall.
    wall:{label:'Wall',swatch:'linear-gradient(135deg,#6e6352 0 50%,#4a4238 50% 100%)'},
    grass:{label:'Grass',swatch:'linear-gradient(180deg,#a6bf66 0,#618538 100%)'},
  };
  const [catalogCategory,setCatalogCategory]=useState<CatalogCategory>('all');
  // BUILD 990: interior occupancy — session-only. insideHut is the hut
  // whose shell is hidden (its interior renders instead); the ref
  // mirrors it for the render-loop closures. Reloading always starts
  // outside: savedPosition() rescues an inside-hut save to the exit
  // point, so a fresh session never opens inside a hidden-shell state.
  // While inside, Build placement/removal is disabled (taps move only)
  // and Undo stays functional — it is world-level, not an interior edit.
  const [insideHut,setInsideHut]=useState<HutRect|null>(null);
  const insideHutRef=useRef<HutRect|null>(null);
  const setInside=(h:HutRect|null)=>{insideHutRef.current=h;setInsideHut(h);};
  const enterHut=(hut:HutRect)=>{
    const door=hutDoor(hut);
    const next={x:door.x,y:door.y};
    stateRef.current.position=next;setPosition(next);setInside(hut);
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(next));}catch{}
    needsWorldRebuild.current=true;setMessage('Inside — tap Exit to leave');
  };
  const exitHut=()=>{
    const hut=insideHutRef.current;if(!hut)return;
    const next=hutExitPoint(hut);
    stateRef.current.position=next;setPosition(next);setInside(null);
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(next));}catch{}
    needsWorldRebuild.current=true;setMessage('Outside');
  };
  // The Enter button's hut: the nearest door within one tile of the
  // player tile, while not already inside. Recomputed every render.
  const nearDoorHut=!insideHut?nearestDoorHut([...stateRef.current.world.huts,...placedHutRects(stateRef.current.world)],Math.round(position.x),Math.round(position.y)):null;
  // BUILD 1033: the red sports car. The car is SESSION-ONLY (car.ts):
  // it is never written to localStorage, so a reload starts without a
  // car and the player summons it again with one tap. The ref is the
  // car's live position (parked, or the player position while driving
  // — updated every frame in the draw loop); the React state mirrors
  // it only for the buttons, the same ref+state pattern as insideHut.
  // carYawRef is the car's heading (atan2(dx, dz), the figure yaw
  // convention): it turns toward the direction of travel while
  // driving and is parked with the car on exit.
  const [car,setCar]=useState<CarState|null>(null);
  const carRef=useRef<CarState|null>(null);
  const setCarBoth=(c:CarState|null)=>{carRef.current=c;setCar(c);};
  const [driving,setDriving]=useState(false);
  const drivingRef=useRef(false);
  const setDrivingBoth=(d:boolean)=>{drivingRef.current=d;setDriving(d);};
  const carYawRef=useRef(Math.PI);
  // A tile is free for the car (summon / exit) when it is statically
  // walkable, not inside any hut, and no figure stands on it. The
  // summon also excludes the player's own tile (the car spawns NEXT
  // to the player); the exit does not (the car's tile is the fallback).
  const carTileFree=(tx:number,ty:number,excludePlayer:boolean)=>{
    const world=stateRef.current.world;
    const p=stateRef.current.position;
    if(excludePlayer&&Math.round(p.x)===tx&&Math.round(p.y)===ty)return false;
    if(hutAt(world,tx,ty))return false;
    if(placedHutRects(world).some(h=>tx>=h.x0&&tx<=h.x1&&ty>=h.y0&&ty<=h.y1))return false;
    const inMap=tx>=0&&ty>=0&&tx<world.w&&ty<world.h;
    if(inMap){if(!walkableWithPlacements(world,world.crates,tx,ty))return false;}
    else if(!isWildWalkable(world,tx,ty))return false;
    for(const n of npcActorsRef.current)if(n.alive&&Math.round(n.x)===tx&&Math.round(n.y)===ty)return false;
    for(const t of transientActorsRef.current)if(Math.round(t.x)===tx&&Math.round(t.y)===ty)return false;
    for(const a of animalActorsRef.current)if(Math.round(a.x)===tx&&Math.round(a.y)===ty)return false;
    return true;
  };
  // Summon the car next to the player (the Car button / the test
  // hook). Gated on not driving and not inside a hut; when boxed in
  // the player gets "No room for the car here" instead of a car.
  const summonCar=()=>{
    if(drivingRef.current){setMessage('You are already driving');return;}
    if(insideHutRef.current){setMessage('Cannot summon the car inside');return;}
    const p=stateRef.current.position;
    const tile=carSpawnTile(Math.round(p.x),Math.round(p.y),(tx,ty)=>carTileFree(tx,ty,true));
    if(!tile){setMessage('No room for the car here');return;}
    setCarBoth({x:tile.x,y:tile.y,yaw:carYawRef.current});
    setMessage('Sports car summoned — stand by it and tap Enter Car');
  };
  // Enter the car: the player snaps onto the car's tile and drives.
  // The car position becomes the player position (the ref stays live
  // in the draw loop); the player figure is hidden while driving.
  const enterCar=()=>{
    const c=carRef.current;if(!c||drivingRef.current)return;
    const p=stateRef.current.position;
    if(!isCarNear(c,p.x,p.y))return;
    const next={x:c.x,y:c.y};
    stateRef.current.position=next;setPosition(next);
    carYawRef.current=c.yaw;
    setDrivingBoth(true);
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(next));}catch{}
    needsWorldRebuild.current=true;setMessage('Driving — 10x speed');
  };
  // Exit the car: the car stays where it is (parked at the player
  // position with its current heading) and the player steps onto the
  // best adjacent tile — behind the car first, then the sides.
  const exitCar=()=>{
    if(!drivingRef.current)return;
    const p=stateRef.current.position;
    const parked={x:p.x,y:p.y,yaw:carYawRef.current};
    const tile=carExitTile(parked,(tx,ty)=>carTileFree(tx,ty,false));
    setCarBoth(parked);
    setDrivingBoth(false);
    const next={x:tile.x,y:tile.y};
    stateRef.current.position=next;setPosition(next);
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(next));}catch{}
    needsWorldRebuild.current=true;setMessage('Outside');
  };
  // The car Enter button's condition: the parked car is within one
  // tile (Chebyshev, the door rule), while not driving and not inside
  // a hut. Recomputed every render.
  const nearCar=!driving&&car&&!insideHut?isCarNear(car,position.x,position.y):false;
  // BUILD 989 refinement: aiming preview for Remove mode. A plain div
  // positioned by direct DOM writes (never React state per pointermove
  // — that would re-render the whole view at pointer frequency). It
  // sits in the same fixed container as the canvas, so container-
  // relative coordinates from projectTileCenter line up exactly.
  const removePreviewRef=useRef<HTMLDivElement|null>(null);
  const removePreviewLabelRef=useRef<HTMLSpanElement|null>(null);
  const movePreviewRef=useRef<HTMLDivElement|null>(null);
  const movePreviewLabelRef=useRef<HTMLSpanElement|null>(null);
  // BUILD 996: save-area rectangle preview — same direct-DOM
  // technique as Remove/Move (never React state per pointermove).
  // A dashed gold rectangle spanning the drag's corner tiles
  // (projected centres ± half a ring width), with a label giving
  // the rectangle size in tiles. The exact tile rect is what the
  // panel shows on release; the overlay is only an aim guide.
  const savePreviewRef=useRef<HTMLDivElement|null>(null);
  const savePreviewLabelRef=useRef<HTMLSpanElement|null>(null);
  stateRef.current={position,world:stateRef.current.world};
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const world=applyMosslightTownLayout(loadWorld());stateRef.current.world=world;
    if(!world.placements)world.placements=[];
    setPlacedCount(world.placements.length);
    npcActorsRef.current=savedNpcActors(world);
    // BUILD 993: static schedule anchors (plaza, stalls, gardens, patrol)
    // are built once per world load; hut-derived anchors resolve live per
    // tick inside buildAnchors, so mid-session house removals fall back.
    const staticAnchors=buildStaticAnchors(world);
    // This mode uses the generated Daggerfall-inspired cottage meshes below.
    // Do not load or render the separately uploaded FBX house pack here.
    const html=document.documentElement,body=document.body;
    const oldHtml={overflow:html.style.overflow,touchAction:html.style.touchAction,overscrollBehavior:html.style.overscrollBehavior};
    const oldBody={overflow:body.style.overflow,touchAction:body.style.touchAction,overscrollBehavior:body.style.overscrollBehavior,position:body.style.position,width:body.style.width};
    html.style.overflow='hidden';html.style.touchAction='none';html.style.overscrollBehavior='none';
    body.style.overflow='hidden';body.style.touchAction='none';body.style.overscrollBehavior='none';body.style.position='fixed';body.style.width='100%';
    const stopTouch=(e:TouchEvent)=>{const target=e.target;if(target instanceof Element&&target.closest('[data-testid="build-panel"], [data-testid="build-catalog-list"]'))return;if(e.cancelable)e.preventDefault()};
    window.addEventListener('touchmove',stopTouch,{passive:false});
    const gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
    if(!gl){setMessage('WebGL is unavailable in this browser');return;}
    const vs=gl.createShader(gl.VERTEX_SHADER)!;gl.shaderSource(vs,'attribute vec3 p;attribute vec3 c;uniform mat4 m;varying vec3 v;void main(){gl_Position=m*vec4(p,1.0);v=c;}');gl.compileShader(vs);
    // BUILD 1011: uNight mixes every fragment toward 976's navy veil
    // (mix(v, navy, uNight) IS the 976 composite scene*(1-a)+navy*a).
    // One uniform, set per frame from the 3D clock — no rebuilds, no
    // blending, no veil quad. Sun/moon draw with uNight=0 (self-luminous).
    const fs=gl.createShader(gl.FRAGMENT_SHADER)!;gl.shaderSource(fs,`precision mediump float;varying vec3 v;uniform float uNight;void main(){gl_FragColor=vec4(mix(v,vec3(${NIGHT_NAVY[0].toFixed(3)},${NIGHT_NAVY[1].toFixed(3)},${NIGHT_NAVY[2].toFixed(3)}),uNight),1.0);}`);gl.compileShader(fs);
    if(!gl.getShaderParameter(vs,gl.COMPILE_STATUS)){setMessage('3D vertex shader failed: '+(gl.getShaderInfoLog(vs)||'unknown shader error'));return;}if(!gl.getShaderParameter(fs,gl.COMPILE_STATUS)){setMessage('3D fragment shader failed: '+(gl.getShaderInfoLog(fs)||'unknown shader error'));return;}const program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){setMessage(gl.getProgramInfoLog(program)||'3D renderer setup failed');return}
    gl.useProgram(program);
    const worldBuffer=gl.createBuffer()!,actorBuffer=gl.createBuffer()!,corpseBuffer=gl.createBuffer()!,skyObjBuffer=gl.createBuffer()!,fxBuffer=gl.createBuffer()!,carBuffer=gl.createBuffer()!;
    const pLoc=gl.getAttribLocation(program,'p'),cLoc=gl.getAttribLocation(program,'c'),mLoc=gl.getUniformLocation(program,'m'),uNightLoc=gl.getUniformLocation(program,'uNight');
    if(pLoc<0||cLoc<0||!mLoc||!uNightLoc){setMessage('3D renderer missing required shader attributes');return;}
    gl.enableVertexAttribArray(pLoc);gl.enableVertexAttribArray(cLoc);
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(SKY_HORIZON[0],SKY_HORIZON[1],SKY_HORIZON[2],1);
    // BUILD 983 sky gradient: a static clip-space quad (horizon colour at
    // the bottom, clear blue at the top) drawn with depth off before the
    // world, so the world draws over it. Same vertex-colour program.
    // BUILD 1011: the sky-object buffer is allocated ONCE at SKY_MAX_VERTS
    // and re-uploaded per frame with bufferSubData (see the draw loop) —
    // a per-frame bufferData reallocation stalls the pipeline.
    gl.bindBuffer(gl.ARRAY_BUFFER,skyObjBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,SKY_MAX_VERTS*24,gl.DYNAMIC_DRAW);
    // BUILD 1014: the house-fx buffer (chimney smoke + window panes) is
    // allocated ONCE at FX_MAX_VERTS and re-uploaded per frame with
    // bufferSubData, the 1011 sky-buffer pattern — a per-frame
    // bufferData reallocation stalls the pipeline.
    gl.bindBuffer(gl.ARRAY_BUFFER,fxBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,FX_MAX_VERTS*24,gl.DYNAMIC_DRAW);
    // BUILD 1033: the car buffer, the same 1011/1014 pattern — allocated
    // ONCE at CAR_MAX_VERTS and re-uploaded per frame with bufferSubData
    // when a car exists. The car is dynamic (it moves every frame while
    // driving), so it must NOT go in the static world buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER,carBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,CAR_MAX_VERTS*24,gl.DYNAMIC_DRAW);
    const skyBuffer=gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      -1,-1,1,...SKY_HORIZON, 1,-1,1,...SKY_HORIZON, 1,1,1,...SKY_TOP,
      -1,-1,1,...SKY_HORIZON, 1,1,1,...SKY_TOP, -1,1,1,...SKY_TOP,
    ]),gl.STATIC_DRAW);
    // BUILD 988: hoisted sky identity matrix (was allocated fresh every
    // frame) + cached world vertex count (was a per-frame
    // getBufferParameter GL query).
    const IDENTITY_MAT=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
    let worldVertCount=0;
    // BUILD 1014: last frame's house-fx emission stats, for the
    // getHouseFx test hook (probes only).
    let lastFxStats={houses:0,chimneys:0,litHouses:0,smokeVerts:0,totalVerts:0,windmills:0,millVerts:0,lanterns:0,lanternVerts:0,wheatTiles:0,wheatVerts:0,ceilingVerts:0,wallVerts:0,hearthGlow:0,hearthVerts:0};
    let yaw=.65,pitch=.7,zoom=12,drag=false,lx=0,ly=0,raf=0;
    let lookPitch=0,lastBuildX=stateRef.current.position.x,lastBuildY=stateRef.current.position.y;
    // BUILD 992: one zoom parameter for pinch + wheel, routed through
    // the first-person state machine (firstPerson.ts). Reaching the
    // minimum engages first person when auto is ON; zooming out past
    // minimum + hysteresis returns to orbit AT the minimum first.
    // Entering first person resets the look to level gaze.
    const applyZoom=(d:number)=>{
      const next=applyZoomDelta({zoom,firstPerson:firstPersonRef.current},d,fpAutoRef.current);
      if(next.firstPerson!==firstPersonRef.current){firstPersonRef.current=next.firstPerson;setFirstPersonOn(next.firstPerson);if(next.firstPerson)lookPitch=0;}
      zoom=next.zoom;
    };
    const pointers=new Map<number,{x:number;y:number}>();let pinchDistance=0;
    // Continuous click-to-move target, in the same free world-space units as
    // the base game's tapMove system (not tile-by-tile stepping).
    let moveTarget:{x:number;y:number}|null=null;
    let gestureMoved=false,gestureStartX=0,gestureStartY=0;
    let lastFrameTime=performance.now(),lastPositionPublish=0,lastPositionSave=0;
    // BUILD 1003: stamina UI publish throttle (bar updates ~10/s while
    // draining, immediately on exhausted/sprinting flips).
    let lastStaminaPublish=0,lastStaminaInt=STAMINA_MAX,lastExhaustedPub=false,lastSprintingPub=false,lastLatchedPub=false,lastRearmPub=false;
    let walkingNow=false;
    // BUILD 994: per-figure walk state (player + NPCs). Session-only
    // render state, never saved: last tile center, facing yaw, walk
    // phase, and the last time the figure moved. Idle figures ease
    // their phase to the nearest neutral (a multiple of 2π) instead
    // of freezing mid-stride. Yaw follows the movement vector:
    // forward = (sin yaw, cos yaw) in (x, z).
    type FigureState={px:number;pz:number;yaw:number;phase:number;lastMove:number};
    const figureState=new Map<string,FigureState>();
    const figurePose=(key:string,x:number,z:number,now:number,dtMs:number,traveling:boolean,stepDist:number)=>{
      let s=figureState.get(key);
      if(!s){s={px:x,pz:z,yaw:Math.PI,phase:0,lastMove:0};figureState.set(key,s);}
      if(x!==s.px||z!==s.pz){s.yaw=Math.atan2(x-s.px,z-s.pz);s.lastMove=now;}
      s.px=x;s.pz=z;
      if(traveling){s.phase+=stepDist*PHASE_PER_UNIT;}
      else{s.phase=easePhaseToNeutral(s.phase,dtMs);}
      return {yaw:s.yaw,phase:s.phase};
    };
    // BUILD 998: interpolated NPC render state + per-figure GPU slots
    // (see npcMotion.ts). Render positions are tile coords (floats)
    // gliding toward logical tiles; slot counts are constant per
    // figure (specs are seeded per name), so each figure owns a fixed
    // vertex range in the actor buffer and only dirty slots re-emit +
    // re-upload. slotUploaded tracks the last uploaded pose per slot
    // (roster order, player last); actorSlotsAllocated gates the one
    // full-size buffer allocation on the first draw frame.
    type NpcRenderState={x:number;y:number;yaw:number;phase:number};
    const npcRender=new Map<string,NpcRenderState>();
    // BUILD 1013: animal render state. h = flight height (birds only,
    // eased toward BIRD_FLIGHT_HEIGHT while flying), graze = head-down
    // amount (goat/deer, eased toward 1 while grazing); eh/eg are the
    // last values EMITTED to the GPU slot — the draw loop deletes the
    // slot's uploaded key when either changes, because the pose key
    // (x/z/yaw/phase) cannot see them.
    type AnimalRenderState={x:number;y:number;h:number;yaw:number;phase:number;graze:number;eh:number;eg:number};
    const animalRender=new Map<string,AnimalRenderState>();
    const slotByName=new Map<string,number>();
    const figureSlotCounts:number[]=[];
    ROSTER_3D.forEach((n,i)=>{slotByName.set(n.name,i);const scratch:number[]=[];emitVillager(scratch,0,0,0,0,villagerSpecFor(n.name),rosterArchetype(n.name)==='child');figureSlotCounts.push(scratch.length/6);});
    const playerSlot=ROSTER_3D.length;
    {const scratch:number[]=[];emitVillager(scratch,0,0,0,0,PLAYER_SPEC,false);figureSlotCounts.push(scratch.length/6);}
    // BUILD 1000: transient GPU slots. Each transient owns a FIXED
    // slot (base + slotId) sized to the largest possible figure, so a
    // slot never changes size when its occupant leaves and another
    // arrives; the draw itself uses the occupant's actual vertex
    // count (emitFigureSlot's pre array). Slots free on despawn.
    const transientSlotBase=ROSTER_3D.length+1;
    const transientSlotCap=maxVillagerVerts();
    for(let i=0;i<MAX_TRANSIENTS;i++)figureSlotCounts.push(transientSlotCap);
    // BUILD 1013: animal GPU slots. One fixed slot per animal (base +
    // slotId), sized to the largest animal emitter — the same
    // discipline as transient slots (a slot never changes size when
    // its occupant leaves and another arrives).
    const animalSlotBase=transientSlotBase+MAX_TRANSIENTS;
    const animalSlotCap=maxAnimalVerts();
    for(let i=0;i<MAX_ANIMALS;i++)figureSlotCounts.push(animalSlotCap);
    const figureSlots=figureSlotLayout(figureSlotCounts);
    const figureScratch=new Float32Array(Math.max(...figureSlotCounts)*6);
    const slotUploaded=new Map<number,FigurePoseKey>();
    let actorSlotsAllocated=false;
    let motionStats={emitted:0,reused:0,drawn:0};
    const walkableAt=(x:number,y:number)=>{
      const gx=Math.round(x),gy=Math.round(y);
      // BUILD 990: inside the entered hut, every rect tile is walkable
      // (interior furniture is visual only — interiors.ts). The NPC
      // proximity check still applies; NPCs never enter (their
      // movement uses walkableWithPlacements unchanged).
      // BUILD 998: proximity uses RENDER positions (what the player
      // sees) when available, falling back to logical tiles — the
      // player can no longer walk through a gliding figure, and can
      // stand on a tile a figure is gliding away from.
      const npcNear=(n:{name:string;alive:boolean;x:number;y:number})=>{
        if(!n.alive)return false;
        const r=npcRender.get(n.name);
        const nx=r?r.x:n.x,ny=r?r.y:n.y;
        return Math.hypot(nx-x,ny-y)<.42;
      };
      // BUILD 1000: the player cannot walk through transient figures
      // either (same 0.42 render-distance rule as residents).
      const transientNear=(t:{id:string;x:number;y:number})=>{
        const r=npcRender.get(t.id);
        const nx=r?r.x:t.x,ny=r?r.y:t.y;
        return Math.hypot(nx-x,ny-y)<.42;
      };
      // BUILD 1013: the player cannot walk through an animal either
      // (same 0.42 render-distance rule as residents/transients).
      const animalNear=(a:{id:string;x:number;y:number})=>{
        const r=animalRender.get(a.id);
        const nx=r?r.x:a.x,ny=r?r.y:a.y;
        return Math.hypot(nx-x,ny-y)<.42;
      };
      const inside=insideHutRef.current;
      // BUILD 1032: while inside, the walls are solid — the interior
      // verdict is the whole answer. The old branch only returned
      // walkable for interior tiles and fell through to the outdoor
      // rule for exterior ones, and the grass outside a hut is
      // walkable outdoors, so the player walked straight through the
      // wall. Now every tile outside the rect is blocked; leaving is
      // via Exit only (button or E key). The NPC proximity check
      // still applies; NPCs never enter (their movement uses
      // walkableWithPlacements unchanged).
      if(inside){
        if(!interiorTileWalkable(inside,gx,gy))return false;
        return !npcActorsRef.current.some(npcNear)&&!transientActorsRef.current.some(transientNear)&&!animalActorsRef.current.some(animalNear);
      }
      // BUILD 1033: the parked car's tile is solid on foot (like a
      // rock — carBlocksTile). While driving the car IS the player, so
      // its tile never blocks (the check returns false then). The car
      // cannot be inside a hut, so this is the outdoor path only.
      if(carBlocksTile(carRef.current,drivingRef.current,gx,gy))return false;
      if(npcActorsRef.current.some(npcNear))return false;
      if(transientActorsRef.current.some(transientNear))return false;
      if(animalActorsRef.current.some(animalNear))return false;
      // BUILD 1024: past the old map edge the wilderness is walkable
      // grass (lakes, wild trees and wild rocks block, like their
      // in-map counterparts). NPCs never reach here — their
      // walkability (townsfolk3d npcWalkable) stays in-bounds — so
      // this branch is the player only.
      if(gx<0||gy<0||gx>=world.w||gy>=world.h) return isWildWalkable(world,gx,gy);
      return walkableWithPlacements(world,world.crates,gx,gy);
    };
    // BUILD 1030: tiles currently occupied by figures, for tap-to-walk
    // planning (extraBlocked). Rounded tiles, using RENDER positions
    // like walkableAt (what the player sees). The player's own tile is
    // excluded — it is the path start.
    const figureOccupiedTiles=():Set<string>=>{
      const out=new Set<string>();
      const add=(x:number,y:number)=>{out.add(Math.round(x)+','+Math.round(y));};
      for(const n of npcActorsRef.current){if(!n.alive)continue;const r=npcRender.get(n.name);add(r?r.x:n.x,r?r.y:n.y);}
      for(const t of transientActorsRef.current){const r=npcRender.get(t.id);add(r?r.x:t.x,r?r.y:t.y);}
      for(const a of animalActorsRef.current){const r=animalRender.get(a.id);add(r?r.x:a.x,r?r.y:a.y);}
      // BUILD 1033: the parked car blocks tap-to-move paths like a
      // figure — the A* plans around it immediately instead of the
      // follower waiting 900ms on the tile and then replanning.
      const parkedCar=carRef.current;
      if(parkedCar&&!drivingRef.current)add(parkedCar.x,parkedCar.y);
      return out;
    };
    // BUILD 1030: rebuild the tap journey's path from the current
    // position to moveTarget, optionally excluding one tile (the tile
    // ahead when pinned, or a figure's tile after waiting). Returns
    // 'ok' (new path), 'throttled' (too soon — try again next frame),
    // or 'failed' (no route exists). Never reports 'Path blocked'
    // itself — the caller decides, so a throttled replan is a wait,
    // not a false dead end.
    const replanPlayerPath=(exclude?:{x:number;y:number}):'ok'|'throttled'|'failed'=>{
      const nowMs=performance.now();
      if(nowMs-playerPathReplanRef.current<PLAYER_REPLAN_MS)return 'throttled';
      const dest=moveTarget;if(!dest)return 'failed';
      playerPathReplanRef.current=nowMs;
      const blocked=figureOccupiedTiles();
      if(exclude)blocked.add(exclude.x+','+exclude.y);
      const path=planPlayerPath(stateRef.current.world,stateRef.current.position,dest,blocked);
      if(!path)return 'failed';
      playerPathRef.current=path;playerPathWaitRef.current=null;playerPathStuckRef.current=null;
      return 'ok';
    };
    // BUILD 1030: tap-to-walk path follower. Called once per frame
    // while a tap journey is active. Returns the push (dx, dy) toward
    // the current waypoint, or null when the player should wait this
    // frame (a figure on the next waypoint, a throttled replan) or the
    // journey ended. Handles: waypoint advance, static-block replan (a
    // placed item landed on a waypoint — replan now, it won't move),
    // figure-block wait-then-replan, and stuck detection (no real
    // progress while pushing — micro-slides, a figure pacing the
    // player). A replan recurses once to recompute from the new path;
    // the 500ms throttle bounds the depth (the recursive call's own
    // replan would return 'throttled').
    const followPlayerPath=(nowMs:number):{dx:number;dy:number}|null=>{
      const path=playerPathRef.current;const dest=moveTarget;
      if(!path||!dest)return null;
      const player=stateRef.current.position;
      // BUILD 1033: a driving car covers ~0.5 tiles/frame (4.5 at
      // harness frame rates), so it can jump clean over the 0.15
      // walking arrive radius and ping-pong on a waypoint forever. A
      // 1-tile arrive radius while driving is the same "reached it"
      // test at car scale.
      const arrive=drivingRef.current?1:PLAYER_WAYPOINT_ARRIVE;
      while(path.index<path.waypoints.length&&Math.hypot(path.waypoints[path.index].x-player.x,path.waypoints[path.index].y-player.y)<arrive)path.index++;
      if(path.index>=path.waypoints.length){playerPathRef.current=null;moveTarget=null;return null;}
      const wp=path.waypoints[path.index];
      const wtx=Math.round(wp.x),wty=Math.round(wp.y);
      const w=stateRef.current.world;
      if(!playerWalkable(w,wtx,wty)){
        const r=replanPlayerPath();
        if(r==='ok')return followPlayerPath(nowMs);
        if(r==='throttled')return null;
        playerPathRef.current=null;moveTarget=null;setMessage('Path blocked');
        return null;
      }
      if(!walkableAt(wp.x,wp.y)){
        const wait=playerPathWaitRef.current;
        if(!wait||wait.x!==wtx||wait.y!==wty){playerPathWaitRef.current={since:nowMs,x:wtx,y:wty};return null;}
        if(nowMs-wait.since>PLAYER_WAIT_MS){
          const r=replanPlayerPath({x:wtx,y:wty});
          if(r==='ok'){playerPathWaitRef.current=null;return followPlayerPath(nowMs);}
          if(r==='throttled')return null;
          playerPathRef.current=null;moveTarget=null;setMessage('Path blocked');
          return null;
        }
        return null;
      }
      playerPathWaitRef.current=null;
      const stuck=playerPathStuckRef.current;
      if(!stuck){playerPathStuckRef.current={x:player.x,y:player.y,since:nowMs};}
      else if(Math.hypot(player.x-stuck.x,player.y-stuck.y)>=0.05){playerPathStuckRef.current={x:player.x,y:player.y,since:nowMs};}
      else if(nowMs-stuck.since>PLAYER_STUCK_MS){
        const ahead={x:Math.round(player.x+Math.sign(wp.x-player.x)),y:Math.round(player.y+Math.sign(wp.y-player.y))};
        const r=replanPlayerPath(ahead);
        if(r==='ok')return followPlayerPath(nowMs);
        if(r==='throttled')return null;
        playerPathRef.current=null;moveTarget=null;setMessage('Path blocked');
        return null;
      }
      return {dx:wp.x-player.x,dy:wp.y-player.y};
    };
    const pickGround=(clientX:number,clientY:number)=>{
      const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
      const nx=((clientX-rect.left)/rect.width)*2-1,ny=1-((clientY-rect.top)/rect.height)*2;
      const p=stateRef.current.position;
      const tx=p.x+.5,tz=p.y+.5;
      // BUILD 1034: the picker ray-marches against the heightfield, not
      // the flat y=0 plane — a tap on a hill must pick the hill's tile,
      // not the tile the flat plane would give. The eye sits on the
      // surface at the player, exactly like the camera.
      const effTerrainPick=effTerrainFor(stateRef.current.world);
      const pickBaseY=surfaceElevation(effTerrainPick,tx,tz);
      const ty=pickBaseY+.8;
      // BUILD 984: first person uses the eye-level camera, not the orbit
      // camera — the old code always used orbit math, so first-person
      // taps mis-picked (BUILD 983 delta #4). Branching here fixes both
      // first-person tap-to-move and placement taps.
      let eyeX:number,eyeZ:number,eyeY:number,forward:number[];
      if(firstPersonRef.current){
        eyeX=tx;eyeZ=tz;eyeY=pickBaseY+FIRST_PERSON_EYE;
        forward=[-Math.sin(yaw)*Math.cos(lookPitch),Math.sin(lookPitch),-Math.cos(yaw)*Math.cos(lookPitch)];
      } else {
        eyeX=tx+Math.sin(yaw)*zoom*Math.cos(pitch);eyeZ=tz+Math.cos(yaw)*zoom*Math.cos(pitch);eyeY=ty+zoom*Math.sin(pitch);
        forward=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
      }
      const right=[Math.cos(yaw),0,-Math.sin(yaw)];
      const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
      // BUILD 988: pick math uses the same FOV as the projection (was a
      // hardcoded tan(30 deg) for the old 60 deg FOV — changing the FOV
      // without this would mis-pick every tap, the 984 bug all over).
      const scale=Math.tan(WORLD_FOV_RAD/2),aspect=rect.width/rect.height;
      const dx=forward[0]+right[0]*nx*scale*aspect+up[0]*ny*scale;
      const dy=forward[1]+right[1]*nx*scale*aspect+up[1]*ny*scale;
      const dz=forward[2]+right[2]*nx*scale*aspect+up[2]*ny*scale;
      if(dy>=-0.001)return null;
      const hit=rayHitSurface(effTerrainPick,eyeX,eyeY,eyeZ,dx,dy,dz,2000);
      if(!hit)return null;
      const x=hit.x-.5,y=hit.z-.5;
      // BUILD 1024: no map-bounds refusal — the world is infinite
      // now, so a tap past the old edge picks the wild ground there.
      // Every consumer still validates its own domain: tap-to-move
      // is gated by walkableAt, placements refuse outside the map
      // (validatePlacement), and remove/move/save look up in-map
      // items only, so an out-of-map pick finds nothing to do.
      if(!Number.isFinite(x)||!Number.isFinite(y))return null;
      return {x,y};
    };
    const wheel=(e:WheelEvent)=>{e.preventDefault();applyZoom(e.deltaY*.012);};
    const keys=new Set<string>();
    const keydown=(e:KeyboardEvent)=>{
      const k=e.key.toLowerCase();
      // BUILD 1036: placement keys. Escape cancels the armed asset
      // (and any paste); R rotates it 90° clockwise, Shift+R 90°
      // counter-clockwise. Never while typing in an input (the
      // chunk-name field) or inside a hut (placement is disabled
      // there anyway). R only acts while a palette asset or a custom
      // upload is armed (BUILD 1048: a custom mesh rotates too) — it
      // never rotates a paste.
      const ae=document.activeElement;
      const typing=ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT');
      if(!typing){
        // BUILD 1039: undo/redo shortcuts — Ctrl+Z / Cmd+Z undoes,
        // Ctrl+Y / Cmd+Y (and Ctrl+Shift+Z / Cmd+Shift+Z) redoes.
        // The same doUndo/doRedo the Undo/Redo buttons call, so keys
        // and buttons can never drift apart. Never while typing in
        // an input; works inside a house too (990: Undo/Redo are
        // world-level edits, not interior edits).
        const ur=undoRedoKeyForEvent(e.key,e.ctrlKey,e.metaKey,e.shiftKey);
        if(ur){e.preventDefault();if(ur==='undo')doUndo();else doRedo();return;}
        if(k==='escape'){if(buildRef.current.areaDuplicateArmed||buildRef.current.areaMoveArmed){setAreaMoveArmedBoth(false);setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);setMessage('Area action cancelled — the selection is kept');}else if(buildRef.current.palette||buildRef.current.customAssetId||buildRef.current.pasteName){cancelPlacement();setMessage('Placement cancelled');}return;}
        // BUILD 1048: R rotates an armed custom upload too (its mesh
        // turns with the rotation — see validateCustomPlacement).
        if(k==='r'&&(buildRef.current.palette||buildRef.current.customAssetId)&&!insideHutRef.current){
          e.preventDefault();
          const next=(((placementRotRef.current+(e.shiftKey?3:1))%4) as Rotation);
          setPlacementRotBoth(next);
          const h=placeHoverRef.current;if(h)showPlacementPreview(h.x,h.y);
          return;
        }
      }
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','f',' ','shift'].includes(k)){e.preventDefault();keys.add(k);}
    };
    const keyup=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
    // BUILD 989 refinement: Remove targeting. (1) TAP TOLERANCE — taps
    // snap via findRemovableNear (1.5 tiles), so a fat-finger tap next
    // to a small orbit tile still lands. (2) DRAG-TO-REMOVE — while
    // Remove mode is active (and not Walk-suspended), a drag paints
    // removals instead of orbiting the camera; that camera-vs-remove
    // conflict is why drags previously felt unresponsive. Each painted
    // tile applies removeAt immediately (same precedence, removed
    // sets, no wood) and flags a world rebuild, so the vertex buffer
    // refreshes on the very next animation frame — no waiting for a
    // window rebuild or diagnostic cycle. The whole stroke occupies
    // ONE undo-stack entry (finalized on release). (3) AIMING PREVIEW — on
    // touch-down and on every drag point, a gold ring + label marks
    // the snapped tile about to be removed (or hides when nothing
    // removable is within tolerance), so the user aims before lifting.
    // projectTileCenter inverts pickGround with the same camera basis
    // (forward/right/up, same FOV), so ring and pick agree exactly.
    const projectTileCenter=(tx:number,ty:number)=>{
      const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
      const p=stateRef.current.position;const px=p.x+.5,pz=p.y+.5;
      // BUILD 1034: the inverse of pickGround on the same surface — the
      // eye sits on the heightfield at the player, and the tile's ground
      // height is the surface at its centre, so the ring and the pick
      // agree exactly.
      const effTerrainProj=effTerrainFor(stateRef.current.world);
      const projBaseY=surfaceElevation(effTerrainProj,px,pz);
      const py=projBaseY+.8;
      let eyeX:number,eyeZ:number,eyeY:number,forward:number[];
      if(firstPersonRef.current){eyeX=px;eyeZ=pz;eyeY=projBaseY+FIRST_PERSON_EYE;forward=[-Math.sin(yaw)*Math.cos(lookPitch),Math.sin(lookPitch),-Math.cos(yaw)*Math.cos(lookPitch)];}
      else{eyeX=px+Math.sin(yaw)*zoom*Math.cos(pitch);eyeZ=pz+Math.cos(yaw)*zoom*Math.cos(pitch);eyeY=py+zoom*Math.sin(pitch);forward=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];}
      const right=[Math.cos(yaw),0,-Math.sin(yaw)];
      const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
      const scale=Math.tan(WORLD_FOV_RAD/2),aspect=rect.width/rect.height;
      const vx=tx+.5-eyeX,vy=surfaceElevation(effTerrainProj,tx+.5,ty+.5)-eyeY,vz=ty+.5-eyeZ;
      const depth=vx*forward[0]+vy*forward[1]+vz*forward[2];if(depth<=0)return null;
      const nx=(vx*right[0]+vy*right[1]+vz*right[2])/(depth*scale*aspect);
      const ny=(vx*up[0]+vy*up[1]+vz*up[2])/(depth*scale);
      if(Math.abs(nx)>1||Math.abs(ny)>1)return null;
      return {cx:(nx+1)/2*rect.width,cy:(1-ny)/2*rect.height};
    };
    const hideRemovePreview=()=>{const el=removePreviewRef.current;if(el)el.style.display='none';};
    const showRemovePreview=(clientX:number,clientY:number)=>{
      const el=removePreviewRef.current;if(!el){return;}
      const destination=pickGround(clientX,clientY);
      const snapped=destination?findRemovableNear(stateRef.current.world,destination.x,destination.y):null;
      const proj=snapped?projectTileCenter(snapped.tx,snapped.ty):null;
      if(!snapped||!proj){el.style.display='none';return;}
      el.style.display='block';el.style.left=proj.cx+'px';el.style.top=proj.cy+'px';
      const label=removePreviewLabelRef.current;
      if(label)label.textContent='Remove '+({placed:'placed item',house:'house',tree:'tree',rock:'rock',water:'water',wall:'wall',path:'path'} as Record<string,string>)[snapped.kind];
    };
    let removeDragging=false;
    let removeStrokeEntries:UndoEntry[]=[];
    let removeStrokeTiles=new Set<string>();
    let removeStrokeRects:Array<{x0:number;y0:number;x1:number;y1:number}>=[];
    const finalizeRemoveStroke=()=>{
      const entries=removeStrokeEntries;
      removeStrokeEntries=[];removeStrokeTiles=new Set();removeStrokeRects=[];
      if(entries.length===0)return;
      const world=stateRef.current.world;
      saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);
      pushHistory({kind:'stroke',entries});
      setMessage('Removed '+entries.length+(entries.length===1?' item':' items'));
    };
    // BUILD 995: drag-to-move. In Move mode, a drag that starts on an
    // item moves that item (gold ring + label preview, same direct-DOM
    // technique as Remove); a drag starting anywhere else orbits as
    // usual, and a tap in Move mode does nothing special (taps never
    // move items — only drags do, so Move never hijacks tap-to-walk).
    // The move itself is atomic (lift, validate under the same
    // placement rules, insert or restore) and occupies ONE undo entry.
    // Pinch during a move-drag CANCELS it (item unmoved) — unlike a
    // remove stroke, a half-dragged move has no partial progress worth
    // keeping. While inside a house or Walk-suspended, move-drags never
    // start (same gate as Remove). BUILD 1006: generated houses, paths,
    // and trees move too (same interaction, same one-undo rule) — a
    // drag starting on generated content grabs it with Remove's
    // precedence (placed > house > tree > path); stalls, walls, and
    // rocks never grab, and a tree standing on dirt grabs the tree
    // (the dirt takes a second drag, exactly like Remove's two-tap).
    type MoveDrag =
      | { kind: 'placed'; item: PlacedItem }
      | { kind: 'house'; hut: HutRect }
      | { kind: 'tree'; x: number; y: number }
      | { kind: 'path'; x: number; y: number };
    let moveDragging:MoveDrag|null=null;
    const hideMovePreview=()=>{const el=movePreviewRef.current;if(el)el.style.display='none';};
    const showMovePreview=(clientX:number,clientY:number)=>{
      const el=movePreviewRef.current;if(!el||!moveDragging)return;
      const destination=pickGround(clientX,clientY);if(!destination){el.style.display='none';return;}
      const proj=projectTileCenter(Math.round(destination.x),Math.round(destination.y));if(!proj){el.style.display='none';return;}
      el.style.display='block';el.style.left=proj.cx+'px';el.style.top=proj.cy+'px';
      const label=movePreviewLabelRef.current;
      if(label)label.textContent='Move '+(moveDragging.kind==='placed'?placementLabel(moveDragging.item):moveDragging.kind);
    };
    // BUILD 995: the caller (pointer-up) already cleared moveDragging
    // and hid the preview before calling, so the dragged item arrives
    // as a parameter — re-reading moveDragging here always saw null
    // and silently dropped every move.
    const finalizeMove=(clientX:number,clientY:number,drag:MoveDrag)=>{
      const destination=pickGround(clientX,clientY);
      if(!destination){setMessage('Drag an item to move it');return;}
      const world=stateRef.current.world;
      const player=stateRef.current.position;
      const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
      const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];
      const dx=Math.round(destination.x), dy=Math.round(destination.y);
      if(drag.kind==='placed'){
        const res=movePlacement(world,drag.item,dx,dy,playerTile,npcTiles);
        if(!res.ok){setMessage('Cannot move here: '+res.reason);return;}
        const same=res.item.x0===drag.item.x0&&res.item.y0===drag.item.y0&&res.item.x1===drag.item.x1&&res.item.y1===drag.item.y1;
        if(same)return; // dropped where it started: no change, no history
        saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);
        pushHistory({kind:'move',oldItem:drag.item,newItem:res.item,index:res.index});
        setMessage('Moved '+placementLabel(res.item));
        return;
      }
      // BUILD 1006: generated moves — same atomicity, same one-undo
      // rule, same save + rebuild. A same-position drop is a silent
      // no-op (the pure functions already guarantee zero mutation).
      if(drag.kind==='house'){
        const res=moveGeneratedHut(world,drag.hut,dx,dy,playerTile,npcTiles);
        if(!res.ok){setMessage('Cannot move here: '+res.reason);return;}
        if(res.same)return;
        saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);
        pushHistory(res.entry);setMessage('Moved house');return;
      }
      if(drag.kind==='tree'){
        const res=moveGeneratedTree(world,drag.x,drag.y,dx,dy,playerTile,npcTiles);
        if(!res.ok){setMessage('Cannot move here: '+res.reason);return;}
        if(res.same)return;
        saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);
        pushHistory(res.entry);setMessage('Moved tree');return;
      }
      const res=moveGeneratedPath(world,drag.x,drag.y,dx,dy);
      if(!res.ok){setMessage('Cannot move here: '+res.reason);return;}
      if(res.same)return;
      saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);
      pushHistory(res.entry);setMessage('Moved path');
    };
    // BUILD 996: save-area drag helpers (effect-local, like the
    // Remove/Move previews — they need pickGround/projectTileCenter).
    // A drag in Save-area mode paints a rectangle instead of orbiting;
    // release finalizes the selection into panel state exactly once
    // (no React state per pointermove). A tap selects its single tile.
    let saveDragging:{start:{x:number;y:number}}|null=null;
    const hideSavePreview=()=>{const el=savePreviewRef.current;if(el)el.style.display='none';};
    const showSavePreview=(start:{x:number;y:number},clientX:number,clientY:number)=>{
      const el=savePreviewRef.current;if(!el)return;
      const destination=pickGround(clientX,clientY);if(!destination){el.style.display='none';return;}
      const ex=Math.round(destination.x),ey=Math.round(destination.y);
      const x0=Math.min(start.x,ex),x1=Math.max(start.x,ex),y0=Math.min(start.y,ey),y1=Math.max(start.y,ey);
      const p0=projectTileCenter(x0,y0),p1=projectTileCenter(x1,y1);
      if(!p0||!p1){el.style.display='none';return;}
      const half=26;
      el.style.display='block';
      el.style.left=(Math.min(p0.cx,p1.cx)-half)+'px';
      el.style.top=(Math.min(p0.cy,p1.cy)-half)+'px';
      el.style.width=(Math.abs(p1.cx-p0.cx)+half*2)+'px';
      el.style.height=(Math.abs(p1.cy-p0.cy)+half*2)+'px';
      const label=savePreviewLabelRef.current;
      if(label)label.textContent='Save area '+(x1-x0+1)+'×'+(y1-y0+1);
    };
    // BUILD 1036: placement preview — a translucent rectangle over
    // the tiles the armed asset would occupy, following the cursor.
    // Green when validatePlacement passes at the hovered tile (with
    // the current rotation), red when it fails, with a label naming
    // the asset and — for houses — the door face, so a rotated house
    // shows where its door will land before it is placed. Same
    // direct-DOM technique as the Remove/Move/Save previews (never
    // React state per pointermove). The hover listener below drives
    // it; taps place through the normal `up` path.
    const hidePlacementPreview=()=>{const el=placePreviewRef.current;if(el)el.style.display='none';};
    const showPlacementPreview=(clientX:number,clientY:number)=>{
      const el=placePreviewRef.current;if(!el)return;
      const build=buildRef.current;
      // BUILD 1043: an armed custom upload (build.customAssetId) gets
      // the same green/red preview as a palette kind — before this
      // fix the guard below only accepted build.palette, so an import
      // armed from the hub showed no preview at all and placed blind.
      if((!build.palette&&!build.customAssetId)||build.removeMode||build.saveAreaMode||walkRef.current||insideHutRef.current){el.style.display='none';return;}
      const destination=pickGround(clientX,clientY);
      if(!destination){el.style.display='none';return;}
      const tx=Math.round(destination.x),ty=Math.round(destination.y);
      const world=stateRef.current.world;
      const player=stateRef.current.position;
      const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
      const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];
      const rot=placementRotRef.current;
      let ok:boolean;let rect:{x0:number;y0:number;x1:number;y1:number};let failReason='';let labelName='';
      if(build.customAssetId){
        const asset=customAssetsRef.current.find(a=>a.id===build.customAssetId);
        if(!asset){el.style.display='none';return;}
        // BUILD 1048: the preview validates (and draws) at the armed
        // rotation — a 2×1 model turned 90° previews as 1×2.
        const vres=validateCustomPlacement(world,asset,tx,ty,playerTile,npcTiles,rot);
        labelName=asset.name+(rot!==0?' · rotated '+(rot*90)+'°':'');
        if(vres.ok){ok=true;rect={x0:vres.item.x0,y0:vres.item.y0,x1:vres.item.x1,y1:vres.item.y1};}
        else{ok=false;failReason=vres.reason;const fp=customFootprint(asset,rot);rect={x0:tx,y0:ty,x1:tx+fp.w-1,y1:ty+fp.h-1};}
      }else{
        const palette=build.palette;
        if(!palette){el.style.display='none';return;}
        const res=validatePlacement(world,palette,tx,ty,playerTile,npcTiles,rot);
        ok=res.ok;
        // The rect the asset would occupy (the validated item when it
        // fits, the would-be footprint when it does not — so the red
        // preview still shows where the asset would land).
        rect=res.ok?{x0:res.item.x0,y0:res.item.y0,x1:res.item.x1,y1:res.item.y1}:placementRectFor(palette,tx,ty,rot);
        if(!res.ok)failReason=res.reason;
        labelName=toolLabel(palette,false);
        if(res.ok&&isHouseKind(palette))labelName+=' · door faces '+rotateFace('south',rot);
      }
      const p0=projectTileCenter(rect.x0,rect.y0),p1=projectTileCenter(rect.x1,rect.y1);
      if(!p0||!p1){el.style.display='none';return;}
      const half=26;
      el.style.display='block';
      el.style.left=(Math.min(p0.cx,p1.cx)-half)+'px';
      el.style.top=(Math.min(p0.cy,p1.cy)-half)+'px';
      el.style.width=(Math.abs(p1.cx-p0.cx)+half*2)+'px';
      el.style.height=(Math.abs(p1.cy-p0.cy)+half*2)+'px';
      el.style.background=ok?'rgba(80,200,90,.28)':'rgba(220,60,50,.32)';
      el.style.borderColor=ok?'#4fc85a':'#e04a3e';
      const label=placePreviewLabelRef.current;
      if(label)label.textContent=!ok?'Cannot place: '+failReason:labelName;
      placeHoverRef.current={x:clientX,y:clientY};
    };
    placePreviewFnRef.current=showPlacementPreview;
    const finalizeSaveSelection=(clientX:number,clientY:number,drag:{start:{x:number;y:number}})=>{
      const destination=pickGround(clientX,clientY);
      if(!destination){setMessage('Drag on the ground to select an area');return;}
      const ex=Math.round(destination.x),ey=Math.round(destination.y);
      const rect={x0:Math.min(drag.start.x,ex),y0:Math.min(drag.start.y,ey),x1:Math.max(drag.start.x,ex),y1:Math.max(drag.start.y,ey)};
      const world=stateRef.current.world;
      const count=captureChunk(world,rect).length;
      if(count===0){setMessage('No placed items in this area — drag a bigger rectangle');return;}
      setSaveSelection({...rect,count});
      setChunkName('');
      setBuildOpen(true);
      setMessage('Area selected ('+(rect.x1-rect.x0+1)+'×'+(rect.y1-rect.y0+1)+', '+count+' placed item'+(count===1?'':'s')+') — name it in the Build panel to save it');
    };
    // BUILD 1037: AREA SELECT drag helpers (effect-local, like the
    // Save-area/Move previews — they need pickGround/projectTileCenter).
    // The yellow overlay is ONE div serving four jobs: the select-drag
    // preview, the move-drag preview, the duplicate destination
    // preview, and the persistent selection (repositioned by the draw
    // loop as the camera moves). All positioning goes through
    // positionAreaSelectRect, so the four jobs can never disagree
    // about the rectangle.
    const hideAreaSelectPreview=()=>{const el=areaSelectPreviewRef.current;if(el)el.style.display='none';};
    const positionAreaSelectRect=(rect:{x0:number;y0:number;x1:number;y1:number},label:string)=>{
      const el=areaSelectPreviewRef.current;if(!el)return;
      const p0=projectTileCenter(rect.x0,rect.y0),p1=projectTileCenter(rect.x1,rect.y1);
      if(!p0||!p1){el.style.display='none';return;}
      const half=26;
      el.style.display='block';
      el.style.left=(Math.min(p0.cx,p1.cx)-half)+'px';
      el.style.top=(Math.min(p0.cy,p1.cy)-half)+'px';
      el.style.width=(Math.abs(p1.cx-p0.cx)+half*2)+'px';
      el.style.height=(Math.abs(p1.cy-p0.cy)+half*2)+'px';
      const lab=areaSelectPreviewLabelRef.current;
      if(lab)lab.textContent=label;
    };
    const areaSelectionLabel=(sel:AreaSelection)=>'Area '+(sel.rect.x1-sel.rect.x0+1)+'×'+(sel.rect.y1-sel.rect.y0+1)+' · '+selectionCount(sel)+' item'+(selectionCount(sel)===1?'':'s');
    let areaSelectDragging:{start:{x:number;y:number}}|null=null;
    let areaMoveDragging:{start:{x:number;y:number};sel:AreaSelection}|null=null;
    let areaCamKey='';
    const showAreaSelectPreview=(start:{x:number;y:number},clientX:number,clientY:number)=>{
      const destination=pickGround(clientX,clientY);if(!destination){hideAreaSelectPreview();return;}
      const ex=Math.round(destination.x),ey=Math.round(destination.y);
      const rect={x0:Math.min(start.x,ex),y0:Math.min(start.y,ey),x1:Math.max(start.x,ex),y1:Math.max(start.y,ey)};
      const world=stateRef.current.world;
      const count=selectionCount(selectArea(world,rect));
      positionAreaSelectRect(rect,'Area '+(rect.x1-rect.x0+1)+'×'+(rect.y1-rect.y0+1)+' · '+count+' item'+(count===1?'':'s'));
    };
    const showAreaMovePreview=(clientX:number,clientY:number)=>{
      if(!areaMoveDragging)return;
      const destination=pickGround(clientX,clientY);if(!destination){hideAreaSelectPreview();return;}
      const dx=Math.round(destination.x)-areaMoveDragging.start.x,dy=Math.round(destination.y)-areaMoveDragging.start.y;
      const r=areaMoveDragging.sel.rect;
      positionAreaSelectRect({x0:r.x0+dx,y0:r.y0+dy,x1:r.x1+dx,y1:r.y1+dy},'Move area '+(dx===0&&dy===0?'— drop to cancel':'to ('+(r.x0+dx)+','+(r.y0+dy)+')'));
    };
    const showAreaDuplicatePreview=(clientX:number,clientY:number)=>{
      const sel=areaSelectionRef.current;if(!sel)return;
      const destination=pickGround(clientX,clientY);if(!destination){hideAreaSelectPreview();return;}
      const ax=Math.round(destination.x),ay=Math.round(destination.y);
      const w=sel.rect.x1-sel.rect.x0,h=sel.rect.y1-sel.rect.y0;
      positionAreaSelectRect({x0:ax,y0:ay,x1:ax+w,y1:ay+h},'Duplicate here — tap to place');
    };
    const finalizeAreaSelection=(clientX:number,clientY:number,drag:{start:{x:number;y:number}})=>{
      const destination=pickGround(clientX,clientY);
      if(!destination){setMessage('Drag on the ground to select an area');return;}
      const ex=Math.round(destination.x),ey=Math.round(destination.y);
      const rect={x0:Math.min(drag.start.x,ex),y0:Math.min(drag.start.y,ey),x1:Math.max(drag.start.x,ex),y1:Math.max(drag.start.y,ey)};
      const world=stateRef.current.world;
      const sel=selectArea(world,rect);
      const count=selectionCount(sel);
      if(count===0){setMessage('Nothing selectable in this area — drag a bigger rectangle');setAreaSelection(null);hideAreaSelectPreview();return;}
      setAreaSelection(sel);setAreaMoveArmedBoth(false);setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);
      setBuildOpen(true);
      positionAreaSelectRect(rect,areaSelectionLabel(sel));
      setMessage('Area selected ('+(rect.x1-rect.x0+1)+'×'+(rect.y1-rect.y0+1)+', '+count+' item'+(count===1?'':'s')+') — Move, Rotate, Delete, or Duplicate it in the Build panel'+(sel.notes.length?' · '+sel.notes[0]:''));
    };
    const finalizeAreaMove=(clientX:number,clientY:number,drag:{start:{x:number;y:number};sel:AreaSelection})=>{
      const destination=pickGround(clientX,clientY);
      if(!destination){setMessage('Drag the yellow area to move it');return;}
      const dx=Math.round(destination.x)-drag.start.x,dy=Math.round(destination.y)-drag.start.y;
      if(dx===0&&dy===0){positionAreaSelectRect(drag.sel.rect,areaSelectionLabel(drag.sel));return;}
      const world=stateRef.current.world;
      const {playerTile,npcTiles}=areaActorTiles();
      const res=moveArea(world,drag.sel,dx,dy,playerTile,npcTiles);
      if(!res.ok){setMessage('Cannot move here: '+res.reason);positionAreaSelectRect(drag.sel.rect,areaSelectionLabel(drag.sel));return;}
      if(!res.entry){positionAreaSelectRect(drag.sel.rect,areaSelectionLabel(drag.sel));return;}
      saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory(res.entry);
      const newRect={x0:drag.sel.rect.x0+dx,y0:drag.sel.rect.y0+dy,x1:drag.sel.rect.x1+dx,y1:drag.sel.rect.y1+dy};
      const newSel=selectArea(world,newRect);
      setAreaSelection(newSel);setAreaMoveArmedBoth(false);setAreaDeleteArmed(false);
      positionAreaSelectRect(newRect,areaSelectionLabel(newSel));
      setMessage('Moved area ('+res.moved+' item'+(res.moved===1?'':'s')+(res.skipped.length?', '+res.skipped.length+' skipped: '+res.skipped[0].reason:'')+')');
    };
    const paintRemoveAt=(clientX:number,clientY:number)=>{
      const destination=pickGround(clientX,clientY);if(!destination)return;
      const world=stateRef.current.world;
      const snapped=findRemovableNear(world,destination.x,destination.y);if(!snapped)return;
      const key=terrainKey(snapped.tx,snapped.ty);
      if(removeStrokeTiles.has(key))return;
      if(removeStrokeRects.some((r)=>snapped.tx>=r.x0&&snapped.tx<=r.x1&&snapped.ty>=r.y0&&snapped.ty<=r.y1))return;
      removeStrokeTiles.add(key);
      const one=removeAlongStroke(world,[{x:snapped.tx,y:snapped.ty}]);
      if(!one)return;
      for(const entry of one.entries){
        removeStrokeEntries.push(entry);
        if(entry.kind==='unhouse')removeStrokeRects.push({x0:entry.rect.x0,y0:entry.rect.y0,x1:entry.rect.x1,y1:entry.rect.y1});
        else if(entry.kind==='unplace')removeStrokeRects.push({x0:entry.item.x0,y0:entry.item.y0,x1:entry.item.x1,y1:entry.item.y1});
      }
      needsWorldRebuild.current=true;
      showRemovePreview(clientX,clientY);
    };
    const down=(e:PointerEvent)=>{if((e.target as HTMLElement).closest('button'))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){drag=true;gestureMoved=false;gestureStartX=e.clientX;gestureStartY=e.clientY;lx=e.clientX;ly=e.clientY;removeDragging=!!(buildRef.current.removeMode&&!walkRef.current&&!insideHutRef.current);removeStrokeEntries=[];removeStrokeTiles=new Set();removeStrokeRects=[];if(removeDragging)showRemovePreview(e.clientX,e.clientY);if(!removeDragging&&buildRef.current.moveMode&&!buildRef.current.palette&&!buildRef.current.customAssetId&&!buildRef.current.pasteName&&!walkRef.current&&!insideHutRef.current){const dest=pickGround(e.clientX,e.clientY);if(dest){const w=stateRef.current.world;const fx=Math.round(dest.x),fy=Math.round(dest.y);const found=(w.placements??[]).find(p=>fx>=p.x0&&fx<=p.x1&&fy>=p.y0&&fy<=p.y1);if(found){moveDragging={kind:'placed',item:found};}else{const hut=hutAt(w,fx,fy);if(hut){moveDragging={kind:'house',hut};}else if(w.trees.some(t=>t.tx===fx&&t.ty===fy)||w.crates.some(c=>c.tx===fx&&c.ty===fy)){moveDragging={kind:'tree',x:fx,y:fy};}else if(terrainAt(w,fx,fy)==='dirt'){moveDragging={kind:'path',x:fx,y:fy};}}if(moveDragging)showMovePreview(e.clientX,e.clientY);}}if(!removeDragging&&!moveDragging&&!walkRef.current&&!insideHutRef.current){const dest=pickGround(e.clientX,e.clientY);if(dest){const fx=Math.round(dest.x),fy=Math.round(dest.y);const areaSel=areaSelectionRef.current;const insideSel=!!(areaSel&&fx>=areaSel.rect.x0&&fx<=areaSel.rect.x1&&fy>=areaSel.rect.y0&&fy<=areaSel.rect.y1);if(areaSel&&(buildRef.current.areaMoveArmed||insideSel)){areaMoveDragging={start:{x:fx,y:fy},sel:areaSel};showAreaMovePreview(e.clientX,e.clientY);}else if(buildRef.current.areaSelectMode&&!buildRef.current.areaDuplicateArmed&&!buildRef.current.areaMoveArmed){areaSelectDragging={start:{x:fx,y:fy}};showAreaSelectPreview(areaSelectDragging.start,e.clientX,e.clientY);}}}if(!removeDragging&&!moveDragging&&!areaMoveDragging&&!areaSelectDragging&&buildRef.current.saveAreaMode&&!walkRef.current&&!insideHutRef.current){const dest=pickGround(e.clientX,e.clientY);if(dest){saveDragging={start:{x:Math.round(dest.x),y:Math.round(dest.y)}};showSavePreview(saveDragging.start,e.clientX,e.clientY);}} }else{drag=false;gestureMoved=true;pinchDistance=pointerDistance();if(removeDragging){finalizeRemoveStroke();removeDragging=false;hideRemovePreview();}if(moveDragging){moveDragging=null;hideMovePreview();}if(saveDragging){saveDragging=null;hideSavePreview();}if(areaMoveDragging){areaMoveDragging=null;hideAreaSelectPreview();}if(areaSelectDragging){areaSelectDragging=null;hideAreaSelectPreview();}}canvas.setPointerCapture?.(e.pointerId)};
    const pointerDistance=()=>{const pts=[...pointers.values()];return pts.length<2?0:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)};
    const move=(e:PointerEvent)=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>=2){const distance=pointerDistance();if(pinchDistance>0&&distance>0)applyZoom((pinchDistance-distance)*.025);pinchDistance=distance;if(removeDragging){finalizeRemoveStroke();removeDragging=false;hideRemovePreview();}if(moveDragging){moveDragging=null;hideMovePreview();}if(saveDragging){saveDragging=null;hideSavePreview();}if(areaMoveDragging){areaMoveDragging=null;hideAreaSelectPreview();}if(areaSelectDragging){areaSelectDragging=null;hideAreaSelectPreview();}return;}
      if(moveDragging){
        if(Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>7)gestureMoved=true;
        showMovePreview(e.clientX,e.clientY);
        return;
      }
      if(removeDragging){
        if(Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>7)gestureMoved=true;
        paintRemoveAt(e.clientX,e.clientY);
        return;
      }
      // BUILD 996: a save-area drag paints the rectangle instead of
      // orbiting (same override Remove uses). Pinch cancels it with
      // no selection, like a cancelled move-drag.
      if(saveDragging){
        if(Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>7)gestureMoved=true;
        showSavePreview(saveDragging.start,e.clientX,e.clientY);
        return;
      }
      // BUILD 1037: an area-select drag paints the yellow rectangle
      // instead of orbiting (same override Remove/Save use); an area
      // move-drag paints the yellow rectangle at the new location;
      // while Duplicate is armed the hover paints the destination
      // rectangle. Pinch cancels all three with no commit.
      if(areaSelectDragging){
        if(Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>7)gestureMoved=true;
        showAreaSelectPreview(areaSelectDragging.start,e.clientX,e.clientY);
        return;
      }
      if(areaMoveDragging){
        if(Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>7)gestureMoved=true;
        showAreaMovePreview(e.clientX,e.clientY);
        return;
      }
      if(buildRef.current.areaDuplicateArmed&&areaSelectionRef.current){
        showAreaDuplicatePreview(e.clientX,e.clientY);
        return;
      }
      if(!drag)return;
      if(Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>7)gestureMoved=true;
      if(!gestureMoved)return;
      yaw+=(e.clientX-lx)*.008;
      // BUILD 1023: first-person pitch is drag-up = look up. It was
      // inverted (drag up looked down: +dy raised lookPitch, and
      // lookPitch+ is gaze-up). Orbit keeps its existing sign below.
      if(firstPersonRef.current)lookPitch=Math.max(FP_PITCH_MIN,Math.min(FP_PITCH_MAX,lookPitch-(e.clientY-ly)*.006));
      else pitch=Math.max(.22,Math.min(1.25,pitch+(e.clientY-ly)*.006));
      lx=e.clientX;ly=e.clientY;
    };
    const up=(e:PointerEvent)=>{const wasTap=pointers.size===1&&drag&&!gestureMoved&&Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)<=10;
      pointers.delete(e.pointerId);drag=false;pinchDistance=0;
      const wasMoveDrag=moveDragging;moveDragging=null;hideMovePreview();
      const wasRemoveDrag=removeDragging;removeDragging=false;hideRemovePreview();
      const wasSaveDrag=saveDragging;saveDragging=null;hideSavePreview();
      const wasAreaMoveDrag=areaMoveDragging;areaMoveDragging=null;
      const wasAreaSelectDrag=areaSelectDragging;areaSelectDragging=null;
      if(wasMoveDrag){
        if(gestureMoved)finalizeMove(e.clientX,e.clientY,wasMoveDrag);
        else setMessage('Drag an item to move it');
      }
      else if(wasRemoveDrag&&removeStrokeEntries.length>0){finalizeRemoveStroke();}
      // BUILD 1037: an area move-drag commits the whole group to the
      // new location; an area select-drag finalizes the rectangle.
      // A tap inside the selection (no drag) falls through to the
      // tap-to-toggle branch below instead of moving anything.
      else if(wasAreaMoveDrag){
        if(gestureMoved)finalizeAreaMove(e.clientX,e.clientY,wasAreaMoveDrag);
        else positionAreaSelectRect(wasAreaMoveDrag.sel.rect,areaSelectionLabel(wasAreaMoveDrag.sel));
      }
      else if(wasAreaSelectDrag){finalizeAreaSelection(e.clientX,e.clientY,wasAreaSelectDrag);}
      // BUILD 996: a save-area drag (or tap) finalizes the selection
      // instead of walking or placing — the naming row in the panel
      // does the actual save. A tap selects its single tile.
      else if(wasSaveDrag){finalizeSaveSelection(e.clientX,e.clientY,wasSaveDrag);}
      else if(wasTap){
        const build=buildRef.current;
        // BUILD 1037: a tap the area-select branches consume must not
        // also walk/place — areaTapConsumed guards the toolActive/walk
        // logic below. A toggle tap outside the rect leaves it false
        // so the tap walks normally.
        let areaTapConsumed=false;
        // BUILD 1037: while Duplicate is armed, a tap places the copy
        // with its corner on the tapped tile (the paste pattern) and
        // the selection MOVES to the copy. It beats every tool below.
        if(build.areaDuplicateArmed&&areaSelectionRef.current){
          areaTapConsumed=true;
          const destination=pickGround(e.clientX,e.clientY);
          if(!destination){setMessage('Tap the ground to place the copy');}
          else{
            const world=stateRef.current.world;const sel=areaSelectionRef.current;
            const ax=Math.round(destination.x),ay=Math.round(destination.y);
            const {playerTile,npcTiles}=areaActorTiles();
            const res=duplicateArea(world,sel,{x:ax,y:ay},playerTile,npcTiles,customAssetsRef.current);
            if(!res.entry){setMessage('Nothing landed here: '+res.skipped[0]?.reason);setAreaDuplicateArmedBoth(false);}
            else{
              // BUILD 1041: a duplicated farm tile is a FRESH planting
              // (the copy does not inherit the original's growth stage).
              for(const it of res.landed)if(it.kind==='farm'&&it.farmPlantedAt===undefined)it.farmPlantedAt=absMinutes(clockRef.current.day,clockRef.current.minutes);
              saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory(res.entry);
              const w=sel.rect.x1-sel.rect.x0,h=sel.rect.y1-sel.rect.y0;
              const newRect={x0:ax,y0:ay,x1:ax+w,y1:ay+h};
              const newSel=selectArea(world,newRect);
              setAreaSelection(newSel);setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);
              positionAreaSelectRect(newRect,areaSelectionLabel(newSel));
              setMessage('Duplicated area ('+res.landed.length+' item'+(res.landed.length===1?'':'s')+(res.skipped.length?', '+res.skipped.length+' skipped: '+res.skipped[0].reason:'')+') — the selection moved to the copy');
            }
          }
        }
        // BUILD 1037: a tap inside a live selection toggles that one
        // object in/out of the group (removeAt precedence, so a tap
        // on a house toggles the house, not the path under it). It
        // beats walking/placing — the yellow area is a mode, not a
        // decoration. Dropping to zero items clears the selection.
        else if(areaSelectionRef.current){
          const destination=pickGround(e.clientX,e.clientY);
          if(destination){
            const world=stateRef.current.world;
            const tx=Math.round(destination.x),ty=Math.round(destination.y);
            const sel=areaSelectionRef.current;
            if(tx>=sel.rect.x0&&tx<=sel.rect.x1&&ty>=sel.rect.y0&&ty<=sel.rect.y1){
              const toggled=toggleSelectionMember(sel,world,tx,ty);
              if(toggled){
                areaTapConsumed=true;
                const after=selectionCount(toggled.sel);
                if(after===0){clearAreaSelection();setMessage('Selection cleared — nothing left in it');}
                else{
                  setAreaSelection(toggled.sel);setAreaDeleteArmed(false);
                  positionAreaSelectRect(toggled.sel.rect,areaSelectionLabel(toggled.sel));
                  setMessage((toggled.action==='added'?'Added ':'Removed ')+toggled.label+(toggled.action==='added'?' to':' from')+' the area ('+after+' items)');
                }
              }
            }
          }
        }
        // BUILD 989: Walk suspension pauses the tool without clearing
        // it — a suspended tap walks exactly like a no-tool tap. The
        // walk branch below is the only other path, so suspended taps
        // and no-tool taps behave identically. D-pad movement never
        // consults buildRef, so it always walks regardless.
        // BUILD 990: while inside, Build placement/removal is disabled —
        // taps move only, even with a tool selected (the Enter button
        // is separate UI, so entry works regardless of the active tool).
        const toolActive=!areaTapConsumed&&!insideHutRef.current&&!walkRef.current&&(build.palette||build.customAssetId||build.removeMode||build.pasteName);
        if(toolActive){
          // BUILD 984: a build-mode tap places or removes instead of
          // moving. Build taps never set moveTarget.
          const destination=pickGround(e.clientX,e.clientY);
          if(!destination){setMessage('Tap the ground to place');}
          else{
            const world=stateRef.current.world;
            // BUILD 995: round, not floor — pickGround already subtracts .5,
            // so its output for a tile spans [tx-.5,tx+.5); floor would map
            // the western/southern half of every tile one tile off, and a
            // tile-centre tap sits exactly on a floor boundary (any
            // sub-pixel click rounding flips it). Round is the exact inverse.
            const tx=Math.round(destination.x),ty=Math.round(destination.y);
            if(build.pasteName){
              // BUILD 996: paste mode stamps the armed chunk with its
              // origin corner on the tapped tile. Per-item validation
              // (pasteChunk): invalid items skip individually, the
              // paste never refuses wholesale. A paste with at least
              // one landed item is ONE undo entry; a zero-landing
              // paste touches neither world nor stacks. Paste stays
              // armed (panel tools persist until toggled off) — the
              // message says how to stop.
              const template=templatesRef.current.find(t=>t.name===build.pasteName);
              if(!template){setMessage('That chunk is gone');}
              else{
                const world=stateRef.current.world;
                const player=stateRef.current.position;
                const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
                const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];
                const res=pasteChunk(world,template,{x:tx,y:ty},playerTile,npcTiles,customAssetsRef.current);
                if(res.landed.length===0){setMessage('Nothing pasted from \''+template.name+'\': '+(res.skipped[0]?res.skipped[0].reason:'blocked'));}
                // BUILD 1041: a pasted farm tile is a FRESH planting
                // (chunks carry no growth state) — stamp it now, like
                // a fresh placement, so it grows from today.
                else{for(const it of res.landed)if(it.kind==='farm'&&it.farmPlantedAt===undefined)it.farmPlantedAt=absMinutes(clockRef.current.day,clockRef.current.minutes);saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory({kind:'paste',items:res.landed});setMessage('Pasted '+res.landed.length+' of '+template.items.length+' from \''+template.name+'\''+(res.skipped.length?' ('+res.skipped.length+' skipped: '+res.skipped[0].reason+')':'')+' · tap again to paste more, or tap the chunk to stop');}
              }
            } else if(build.removeMode){
              // BUILD 989: full chain — placed > generated house (whole
              // rect) > generated tree (real tree and/or crate on the
              // tile, one tap) > generated rock (BUILD 1025) > generated
              // water (BUILD 1027 — ocean or pond) > generated path
              // tile. Every successful
              // change pushes onto the undo stack and clears the redo
              // stack (BUILD 991); failed taps touch neither world nor stacks.
              // Refinement: the tap SNAPS to the nearest removable tile
              // within 1.5 tiles (findRemovableNear) instead of demanding
              // an exact tile hit — the exact tile still wins ties.
              const snapped=findRemovableNear(world,destination.x,destination.y);
              const res=snapped?removeAt(world,snapped.tx,snapped.ty):null;
              if(!res){setMessage('Nothing to remove here');}
              else if(res.kind==='placed'){saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory({kind:'unplace',item:res.item,index:res.index});setMessage('Removed '+placementLabel(res.item));}
              else if(res.kind==='house'){saveWorld(world);needsWorldRebuild.current=true;pushHistory({kind:'unhouse',rect:res.rect,index:res.index});setMessage('Removed house');}
              else if(res.kind==='tree'){saveWorld(world);needsWorldRebuild.current=true;pushHistory({kind:'untree',tree:res.tree,treeIndex:res.treeIndex,crate:res.crate,crateIndex:res.crateIndex});setMessage('Removed tree');}
              else if(res.kind==='rock'){saveWorld(world);needsWorldRebuild.current=true;pushHistory({kind:'unrock',x:res.x,y:res.y,rockIndex:res.rockIndex});setMessage('Removed rock');}
              else if(res.kind==='water'){saveWorld(world);needsWorldRebuild.current=true;pushHistory({kind:'unwater',x:res.x,y:res.y,wasStored:res.wasStored});setMessage('Removed water');}
              else if(res.kind==='wall'){saveWorld(world);needsWorldRebuild.current=true;pushHistory({kind:'unwall',x:res.x,y:res.y,wallIndex:res.wallIndex,h:res.h});setMessage('Removed wall');}
              else{saveWorld(world);needsWorldRebuild.current=true;pushHistory({kind:'unpath',x:res.x,y:res.y});setMessage('Removed path');}
            } else if(build.customAssetId){
              // BUILD 997: an armed upload places with its mesh
              // footprint (min corner on the tapped tile) under the
              // same blocking rules as houses — one undo entry, like
              // any other placement. BUILD 1048: at the armed
              // rotation (a 2×1 model turned 90° lands as 1×2).
              const asset=customAssetsRef.current.find(a=>a.id===build.customAssetId);
              if(!asset){setMessage('That upload is gone');}
              else{
                const player=stateRef.current.position;
                const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
                const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];
                const result=validateCustomPlacement(world,asset,tx,ty,playerTile,npcTiles,placementRotRef.current);
                if(!result.ok){setMessage('Cannot place here: '+result.reason);}
                else{addPlacement(world,result.item);saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory({kind:'place',item:result.item});setMessage('Placed '+asset.name);}
              }
            } else if(build.palette){
              const player=stateRef.current.position;
              const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
              const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];
              // BUILD 1036: place with the current rotation — the
              // asset stays armed afterwards, so another tap places
              // another copy without re-selecting the menu.
              const result=validatePlacement(world,build.palette,tx,ty,playerTile,npcTiles,placementRotRef.current);
              if(!result.ok){setMessage('Cannot place here: '+result.reason);}
              // BUILD 1041: a fresh farm tile is planted NOW (the
              // growth clock starts at placement); move/undo carry
              // the stamp, paste/duplicate stamp their own copies.
              else{if(result.item.kind==='farm')result.item.farmPlantedAt=absMinutes(clockRef.current.day,clockRef.current.minutes);addPlacement(world,result.item);saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory({kind:'place',item:result.item});setMessage('Placed '+placementLabel(result.item));}
            }
          }
        } else if(!areaTapConsumed) {
          const destination=pickGround(e.clientX,e.clientY);
          if(!destination){/* no ground picked — nothing to do */}
          else if(!walkableAt(destination.x,destination.y)){setMessage('That destination is blocked');}
          else if(insideHutRef.current){
            // Inside a hut: short interior walk, direct push + sliding
            // (the A* walkable set is the outdoor one). The draw loop
            // clears any outdoor path on entry.
            moveTarget=destination;playerPathRef.current=null;setMessage('Walking to destination');
          } else {
            // BUILD 1030: tap-to-walk plans an A* route around trees,
            // houses, rocks, water, walls, and figures — no more
            // re-tapping around every obstacle. A walkable destination
            // with no route at all reports 'Path blocked'.
            const path=planPlayerPath(stateRef.current.world,stateRef.current.position,destination,figureOccupiedTiles());
            if(!path){setMessage('Path blocked');}
            else{playerPathRef.current=path;playerPathReplanRef.current=performance.now();playerPathWaitRef.current=null;playerPathStuckRef.current=null;moveTarget=destination;setMessage('Walking to destination');}
          }
        }
      }
      if(pointers.size===1){const p=[...pointers.values()][0];lx=p.x;ly=p.y;drag=true;gestureMoved=true;}
    };
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
    // BUILD 1018: Sprint-button hold backstop (window-level, so a hold
    // ends even when the finger slides off the button and lifts over
    // another element — without pointer capture the button never sees
    // that up). PointerId-gated inside releaseSprintPointer, so other
    // fingers' ups/cancels never touch the hold. touchend with zero
    // touches left + window blur clear a hold whose pointerup never
    // arrived (a cancelled touch still ends with a touchend).
    const sprintWinUp=(e:PointerEvent)=>releaseSprintPointer(e.pointerId,e.clientX,e.clientY,true);
    const sprintWinCancel=(e:PointerEvent)=>releaseSprintPointer(e.pointerId,e.clientX,e.clientY,false);
    const sprintWinTouchEnd=(e:TouchEvent)=>{if(e.touches.length===0&&sprintPointerIdRef.current!==null){sprintPointerIdRef.current=null;sprintHeldRef.current=false;sprintDownRef.current=null;}};
    const sprintWinBlur=()=>{if(sprintPointerIdRef.current!==null){sprintPointerIdRef.current=null;sprintHeldRef.current=false;sprintDownRef.current=null;}};
    window.addEventListener('pointerup',sprintWinUp);window.addEventListener('pointercancel',sprintWinCancel);window.addEventListener('touchend',sprintWinTouchEnd);window.addEventListener('blur',sprintWinBlur);
    // BUILD 1036: placement-preview hover — runs on every pointermove
    // (mouse hover included, not just drags), so the ghost follows
    // the cursor while an asset is armed. It never orbits or places;
    // it only positions the preview div.
    const hover=(e:PointerEvent)=>{if((buildRef.current.palette||buildRef.current.customAssetId)&&!buildRef.current.removeMode&&!buildRef.current.saveAreaMode&&!walkRef.current&&!insideHutRef.current)showPlacementPreview(e.clientX,e.clientY);else hidePlacementPreview();};
    // BUILD 1036: right-click cancels placement (same as Escape) —
    // the browser menu is suppressed on the canvas so the gesture
    // stays in the game.
    const cancelOnContextMenu=(e:MouseEvent)=>{e.preventDefault();if(buildRef.current.palette||buildRef.current.customAssetId||buildRef.current.pasteName){cancelPlacement();setMessage('Placement cancelled');}};
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointermove',hover);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('contextmenu',cancelOnContextMenu);
    const perspective=(f:number,a:number,n:number,far:number)=>{const t=1/Math.tan(f/2),nf=1/(n-far);return [t/a,0,0,0,0,t,0,0,0,0,(far+n)*nf,-1,0,0,2*far*n*nf,0]};
    const lookAt=(eye:number[],center:number[])=>{const norm=(v:number[])=>{const l=Math.hypot(...v)||1;return v.map(n=>n/l)};const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const sub=(a:number[],b:number[])=>a.map((n,i)=>n-b[i]);const z=norm(sub(eye,center)),x=norm(cross([0,1,0],z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1]};
    const mul=(a:number[],b:number[])=>{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o};
    const upload=(buffer:WebGLBuffer,data:Float32Array)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12)};
    const draw=()=>{
      const now=performance.now(),rawDt=Math.max(0,(now-lastFrameTime)/1000);lastFrameTime=now;
      const dt=Math.min(.05,rawDt);
      // BUILD 998: NPC glide uses real frame time (capped at 0.25s),
      // NOT the 0.05s physics clamp above. The logical clock ticks in
      // real time (900ms); at low frame rates the clamped dt would
      // glide slower than the clock (0.89 tiles/s at 16fps), so render
      // would fall behind until the snap rule fired — a self-inflicted
      // tile jump. dtNpc keeps pace down to ~4fps; below that the snap
      // rule is the correct backstop.
      const dtNpc=Math.min(.25,rawDt);
      // Smooth, non-grid movement with collision checks along the path. A tap
      // gives a continuous world-space destination and walking stops on release
      // of the path target, like the 2.5D game's tap-to-move behaviour.
      const current=stateRef.current;
      let player=current.position;
      walkingNow=false;
      let moveDx=0,moveDy=0,hasInput=false;
      // BUILD 1030: keys / D-pad (which dispatches key events) take
      // over a tap journey — the user steers directly, the path is
      // dropped. Otherwise a tap journey follows its A* waypoints;
      // a direct push (interior taps) keeps the old behaviour.
      const heldKeys=[...keys].filter(k=>['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k));
      if(heldKeys.length>0){
        if(playerPathRef.current||moveTarget){playerPathRef.current=null;moveTarget=null;playerPathWaitRef.current=null;playerPathStuckRef.current=null;}
        moveDx=(heldKeys.includes('d')||heldKeys.includes('arrowright')?1:0)-(heldKeys.includes('a')||heldKeys.includes('arrowleft')?1:0);
        moveDy=(heldKeys.includes('s')||heldKeys.includes('arrowdown')?1:0)-(heldKeys.includes('w')||heldKeys.includes('arrowup')?1:0);
        hasInput=true;
      }else if(moveTarget){
        // Entering a hut ends an outdoor tap journey (the waypoints
        // are outside; interior taps walk direct, see the tap handler).
        if(insideHutRef.current&&playerPathRef.current){playerPathRef.current=null;moveTarget=null;}
        else if(playerPathRef.current){
          const push=followPlayerPath(now);
          if(push){moveDx=push.dx;moveDy=push.dy;hasInput=true;}
        }else{
          moveDx=moveTarget.x-player.x;moveDy=moveTarget.y-player.y;
          if(Math.hypot(moveDx,moveDy)<.08){moveTarget=null;moveDx=0;moveDy=0;}
          else hasInput=true;
        }
      }
      // BUILD 1021: no movement input — a new journey starts fresh, so
      // a stale slide-around side never carries into the next push.
      if(!hasInput){slidePerpRef.current=null;playerPathStuckRef.current=null;}
      // BUILD 1003: sprint multiplies speed INSIDE this same pipeline —
      // same step, same walkableAt checks, same wall sliding. Hold =
      // Sprint control or Shift key; exhausted forces walk. BUILD 1018:
      // the button ALSO latches (tap-to-toggle) — sprintInput merges
      // hold, latch, and Shift into one sprint input. BUILD 1020: the
      // rearm gate — while rearmed (exhaustion hit and the same hold
      // never lifted) sprint input is ignored, so a sustained hold
      // cannot auto-resume at 25 and surge again; release + press
      // re-arms it (nextSprintRearm, updated after the stamina step).
      // BUILD 1021: the gate is a level — a press that starts while
      // already tired arms it too, and a release only disarms it after
      // recovery (nextSprintRearm takes the tired level as its 4th arg).
      const sprintRaw=sprintInput(sprintHeldRef.current,sprintLatchRef.current,keys.has('shift'));
      // BUILD 1033: no sprint while driving — the car is already 10x
      // walk, and stamina must not drain for driving (it regens).
      const sprintHeld=drivingRef.current?false:(sprintRearmRef.current?false:sprintRaw);
      const sprintingNow=sprintHeld&&!staminaRef.current.exhausted&&hasInput;
      // Position before this frame's step, so stamina can tell real
      // displacement from a zero-displacement slide (see below).
      const prevMoveX=player.x,prevMoveY=player.y;
      if(hasInput){
        // BUILD 1033: the car drives at CAR_SPEED (10x walk) through
        // the same step pipeline — same walkableAt checks, same wall
        // sliding, so it cannot drive through houses, walls, or water.
        const dist=Math.hypot(moveDx,moveDy),step=Math.min(dist,(drivingRef.current?CAR_SPEED:(sprintingNow?SPRINT_SPEED:WALK_SPEED))*dt);
        // BUILD 1018: step resolution lives in playerStep.ts (pure) —
        // same direct move + wall sliding, except a slide that leaves
        // the player exactly where they stand no longer counts as a
        // move, so a tap-to-move target pinned against a crate clears
        // with 'Path blocked' instead of retrying forever in place.
        // BUILD 1021: the step also takes the sticky slide-around side
        // (slidePerpRef) and reports which side it used, so a
        // tap-to-move slide-around keeps one side until the direct
        // path opens instead of ping-ponging.
        const res=resolvePlayerStep(player.x,player.y,moveDx,moveDy,dist,step,walkableAt,slidePerpRef.current);
        if(res.how==='perp')slidePerpRef.current=res.perp;
        else if(res.how==='direct')slidePerpRef.current=null;
        if(res.moved){player={x:res.x,y:res.y};current.position=player;walkingNow=true;}
        else if(res.blocked&&moveTarget){
          // BUILD 1030: a blocked step on a tap journey replans (the
          // way may have closed after planning) — only a failed replan
          // reports 'Path blocked'. A throttled replan is a wait, not
          // a dead end. Direct pushes (no path) keep the old immediate
          // message.
          if(playerPathRef.current){
            const ahead={x:Math.round(player.x+Math.sign(moveDx)),y:Math.round(player.y+Math.sign(moveDy))};
            const r=replanPlayerPath(ahead);
            if(r==='failed'){playerPathRef.current=null;moveTarget=null;setMessage('Path blocked');}
          }else{moveTarget=null;setMessage('Path blocked');}
        }
        // BUILD 1033: a driving car covers 0.5 tiles/frame, so the 0.08
        // walking arrive radius is jumped over forever — 0.5 at car scale.
        if(moveTarget&&Math.hypot(moveTarget.x-player.x,moveTarget.y-player.y)<(drivingRef.current?0.5:0.08))moveTarget=null;
        if(walkingNow&&now-lastPositionPublish>90){lastPositionPublish=now;setPosition(player);}
        if(walkingNow&&now-lastPositionSave>400){lastPositionSave=now;try{localStorage.setItem(SAVE_KEY,JSON.stringify(player));}catch{}}
      }
      // BUILD 1003: stamina ticks every frame, even idle (regen) — drain
      // only on ACTUAL displacement (stepStamina's rule). walkingNow
      // alone is not enough: a straight-line push against a wall or a
      // slower figure takes the no-op slide branch (same tile, flag
      // still true), which must NOT drain — the player took no benefit.
      // Caught by the 1004 probes: stamina drained steadily while the
      // player was stuck behind an eastbound traveler at ~1.1 u/s.
      // Session-only: staminaRef is never written to storage.
      const actuallyMoved=player.x!==prevMoveX||player.y!==prevMoveY;
      // BUILD 1033: while driving the car turns toward the direction of
      // travel (the figure turn rule, turnYawToward) and its position
      // IS the player position — the ref stays live for the mesh, the
      // exit, and the test hooks.
      if(drivingRef.current&&actuallyMoved){
        carYawRef.current=turnYawToward(carYawRef.current,Math.atan2(player.x-prevMoveX,player.y-prevMoveY),FIGURE_TURN_RATE*dt);
        carRef.current={x:player.x,y:player.y,yaw:carYawRef.current};
      }
      const wasExhausted=staminaRef.current.exhausted;
      const nextStamina=stepStamina(staminaRef.current,dt,sprintHeld,actuallyMoved);
      // BUILD 1018: the latch clears on exhaustion (the button shows
      // Tired; tap again to resume once recovered). BUILD 1026: the
      // 2s idle-clear is gone — it killed "tap sprint, then move", and
      // the 2.5D toggle persists until tapped again or exhaustion.
      if(sprintLatchRef.current&&nextStamina.exhausted&&!wasExhausted)sprintLatchRef.current=false;
      // BUILD 1020: rearm gate — exhaustion arms it, releasing all
      // sprint input clears it (nextSprintRearm). While armed, the
      // hold above is ignored, so the speed sawtooth stops here.
      // BUILD 1021: the gate takes the tired LEVEL (4th arg) — a press
      // that starts while already tired arms it too, and a release
      // only disarms it after recovery.
      sprintRearmRef.current=nextSprintRearm(sprintRearmRef.current,nextStamina.exhausted&&!wasExhausted,sprintRaw,nextStamina.exhausted);
      staminaRef.current=nextStamina;sprintingRef.current=sprintingNow&&actuallyMoved;
      const nextStaminaInt=Math.round(nextStamina.stamina);
      if((now-lastStaminaPublish>100&&nextStaminaInt!==lastStaminaInt)||nextStamina.exhausted!==lastExhaustedPub||sprintingRef.current!==lastSprintingPub||sprintLatchRef.current!==lastLatchedPub||sprintRearmRef.current!==lastRearmPub){lastStaminaPublish=now;lastStaminaInt=nextStaminaInt;lastExhaustedPub=nextStamina.exhausted;lastSprintingPub=sprintingRef.current;lastLatchedPub=sprintLatchRef.current;lastRearmPub=sprintRearmRef.current;setStaminaUi(nextStamina);setSprintingUi(sprintingRef.current);setSprintLatchedUi(sprintLatchRef.current);setSprintRearmUi(sprintRearmRef.current);staminaPublishCountRef.current++;}
      const dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;needsWorldRebuild.current=true}
      player=stateRef.current.position;
      // BUILD 983: the old code only rebuilt on resize/interactions, so
      // the 45×45 window went stale after walking ~20 tiles. Rebuild when
      // the player moves WORLD_REBUILD_DIST tiles from the last build
      // centre (BUILD 1026: 16, was 8 — halves the rebuild hitch rate).
      if(Math.hypot(player.x-lastBuildX,player.y-lastBuildY)>WORLD_REBUILD_DIST)needsWorldRebuild.current=true;
      // BUILD 1017: the diagnostic line no longer goes to the play-screen
      // message — it is reported to Options > Diagnostics instead.
      // BUILD 1035: time-sliced world rebuild (see createWorldBuilder).
      // The old code built the whole ~350ms buffer synchronously here,
      // so every chunk boundary froze the frame — at car speed (31.5
      // u/s) that was a hitch every ~0.5s. Now the build runs as a
      // generator stepped a few ms per frame while the player moves,
      // and runs to completion in one frame while stationary (so a
      // placement or an enter/exit still appears immediately, exactly
      // like the old path). The last build centre is the BUILDER's
      // centre (where the buffer was actually built around), not the
      // player's position at upload time — the player has moved on.
      // Abort: if the player entered/exited a house or the custom
      // assets changed since this builder started, its captured
      // enteredHut/customAssets are stale — drop it and start fresh
      // (the next frame rebuilds with the current state). World edits
      // (placements) need no abort: they set needsWorldRebuild, so a
      // fresh builder follows this one immediately.
      const prevP=prevPlayerRef.current;
      const playerMoved=prevP!==null&&(player.x!==prevP.x||player.y!==prevP.y);
      prevPlayerRef.current={x:player.x,y:player.y};
      if(needsWorldRebuild.current){
        const b0=worldBuilderRef.current;
        if(b0&&(b0.enteredHut!==insideHutRef.current||b0.customAssets!==customAssetsRef.current))worldBuilderRef.current=null;
        if(!worldBuilderRef.current){worldBuilderRef.current=createWorldBuilder(world,player,insideHutRef.current,customAssetsRef.current);buildFramesRef.current=0;buildMsRef.current=0;}
        const budget=playerMoved?REBUILD_STEP_BUDGET_MS:Infinity;
        const t0=performance.now();
        const done=worldBuilderRef.current.step(budget);
        const stepMs=performance.now()-t0;
        buildFramesRef.current++;buildMsRef.current+=stepMs;
        const st=rebuildStepStatsRef.current;
        st.totalStepMs+=stepMs;if(stepMs>st.maxStepMs)st.maxStepMs=stepMs;
        if(playerMoved&&stepMs>st.maxStepMsMoving)st.maxStepMsMoving=stepMs;
        if(done){
          const b=worldBuilderRef.current;worldBuilderRef.current=null;
          const built=b.result();
          if(built.length===0){const snap:Diagnostics3D={verts:0,mapW:world.w,mapH:world.h,x:Math.round(player.x),y:Math.round(player.y)};diagRef.current=snap;onDiagnosticsRef.current?.(snap);}
          else{upload(worldBuffer,built);worldVertCount=built.length/6;const snap:Diagnostics3D={verts:worldVertCount,mapW:world.w,mapH:world.h,x:Math.round(player.x),y:Math.round(player.y)};diagRef.current=snap;onDiagnosticsRef.current?.(snap);}
          needsWorldRebuild.current=false;lastBuildX=b.center.x;lastBuildY=b.center.y;rebuildCountRef.current++;
          st.count=rebuildCountRef.current;st.lastBuildFrames=buildFramesRef.current;st.lastBuildMs=buildMsRef.current;
        }
      }
      gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      // BUILD 1011: night factor for this frame — 976's curve on the 3D
      // clock, as one shader uniform (see sky.ts). Set before the sky
      // pass so the gradient darkens too; sun/moon are drawn with
      // uNight=0 below (self-luminous). Cloud drift accumulates here.
      const nightFactor=nightFactorForMinutes(clockRef.current.minutes);
      skyDriftRef.current+=dt;
      gl.uniform1f(uNightLoc,nightFactor);
      // Sky gradient pass (identity matrix, depth off), then the world.
      gl.disable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
      gl.uniformMatrix4fv(mLoc,false,IDENTITY_MAT);
      gl.drawArrays(gl.TRIANGLES,0,6);
      gl.enable(gl.DEPTH_TEST);
      // Orbit around the player's tile center, not its top-left grid corner.
      // Keeping the camera target and orbit origin aligned prevents the player
      // sprite drifting sideways while the camera rotates; pitch now controls
      // the actual orbit elevation as well.
      // BUILD 1034: the camera rides the heightfield — the orbit target
      // and the first-person eye sit on the shared surface at the player,
      // so the camera never sinks into a hill or floats over a hollow.
      // effTerrainDraw is this frame's effective terrain (the placement
      // Sets are built once per frame); playerBaseY is the ground under
      // the player, reused by the player figure and the car below.
      const effTerrainDraw=effTerrainFor(world);
      const playerBaseY=surfaceElevation(effTerrainDraw,player.x+.5,player.y+.5);
      const targetX=player.x+.5,targetZ=player.y+.5,targetY=playerBaseY+.8;
      const horizontal=zoom*Math.cos(pitch);
      const ex=targetX+Math.sin(yaw)*horizontal,ez=targetZ+Math.cos(yaw)*horizontal,ey=targetY+zoom*Math.sin(pitch);
      // BUILD 983 first-person camera: eye-level camera at the player,
      // looking along yaw with a slight up/down look pitch (yaw 0 faces
      // north). BUILD 1002: far plane VIEW_FAR_PLANE (300, was 200):
      // at minimum orbit pitch the horizon ray runs past 200, leaving
      // a sky strip under the horizon line; 300 keeps ground inside
      // the frustum out to the horizon at every zoom and pitch.
      // BUILD 1005: 300 is KEPT by measurement for the 240 view —
      // max camera-to-ground-point is 272 (240 + 32 orbit radius at
      // min pitch 0.22), 280 with 8-tile rebuild staleness, and apron
      // coverage reaches 340 - 32 = 308, so 300 sits inside [280, 308]
      // with margin both sides; raising it would only coarsen depth
      // precision at 240 tiles.
      // BUILD 1007: far plane is 700. Two coverings, both measured:
      // (1) worst camera-to-farthest-real-object is 282 (map diagonal)
      // + 64 (max orbit radius, BUILD 1023 — was 32) = 346, far under
      // 700; (2) the clip edge must sit past the fog-full distance,
      // or hazed-green ground would end visibly against sky: worst
      // clip-edge distance from the build centre is 700 - 64 - 8 =
      // 628, past FOG_FAR 600, so the clipped edge is always uniform
      // horizon colour. Apron coverage 1000 - 64 = 936 > 700, so the
      // apron always extends past the far plane. Depth precision at a
      // given distance depends on the near plane (0.1) and the
      // distance, not the far plane, so 700 costs nothing versus 300
      // at 282 tiles.
      // BUILD 992: eye at FIRST_PERSON_EYE (0.90x character),
      // level gaze by default (lookPitch starts 0).
      // BUILD 992: turning first-person-auto OFF while in first person
      // drops back to orbit at the minimum distance (the zoom handlers
      // alone cannot see the toggle flip).
      if(firstPersonRef.current&&!fpAutoRef.current){firstPersonRef.current=false;setFirstPersonOn(false);zoom=ZOOM_MIN;}
      const mat=firstPersonRef.current
        ? mul(perspective(WORLD_FOV_RAD,w/h,.1,VIEW_FAR_PLANE),lookAt([targetX,playerBaseY+FIRST_PERSON_EYE,targetZ],[targetX-Math.sin(yaw)*Math.cos(lookPitch)*10,playerBaseY+FIRST_PERSON_EYE+Math.sin(lookPitch)*10,targetZ-Math.cos(yaw)*Math.cos(lookPitch)*10]))
        : mul(perspective(WORLD_FOV_RAD,w/h,.1,VIEW_FAR_PLANE),lookAt([ex,ey,ez],[targetX,targetY,targetZ]));
      gl.uniformMatrix4fv(mLoc,false,new Float32Array(mat));
      gl.bindBuffer(gl.ARRAY_BUFFER,worldBuffer);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
      // BUILD 988: no per-frame getError() here — it is a known
      // pipeline-stall pitfall (it can force a sync every frame) and it
      // bought nothing: setup failures are still caught by the shader
      // compile + program link checks above, and the diagnostic still
      // reports the vertex count every rebuild.
      gl.drawArrays(gl.TRIANGLES,0,worldVertCount);
      // BUILD 1011: sun, moon, drifting clouds — a small per-frame buffer
      // (a few hundred verts; the world buffer rebuilds only on >8-tile
      // moves and cannot carry moving sky objects). Camera-centred on the
      // player so walking never leaves them behind; depth-tested, so the
      // ground occludes them below the horizon. Clouds draw with the
      // night factor, sun/moon with uNight=0 (self-luminous). Suppressed
      // entirely while inside a house (990: emitSkyObjects returns empty
      // when insideHut is set).
      const skyEye:Vec3=firstPersonRef.current?[targetX,playerBaseY+FIRST_PERSON_EYE,targetZ]:[ex,ey,ez];
      const skyArr:number[]=[];
      const skyCounts=emitSkyObjects(skyArr,skyEye,player.x+.5,player.y+.5,clockRef.current.minutes,skyDriftRef.current,!!insideHutRef.current);
      if(skyCounts.totalVerts>0){
        gl.bindBuffer(gl.ARRAY_BUFFER,skyObjBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(skyArr));gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
        if(skyCounts.cloudVerts>0)gl.drawArrays(gl.TRIANGLES,0,skyCounts.cloudVerts);
        if(skyCounts.totalVerts>skyCounts.cloudVerts){gl.uniform1f(uNightLoc,0);gl.drawArrays(gl.TRIANGLES,skyCounts.cloudVerts,skyCounts.totalVerts-skyCounts.cloudVerts);gl.uniform1f(uNightLoc,nightFactor);}
      }
      // BUILD 1014: chimney smoke + window panes — a small per-frame
      // buffer (a few thousand verts; the world buffer rebuilds only
      // on >8-tile moves and cannot carry moving smoke or time-varying
      // lights). Lit state is a pure function of (house seed, clock
      // minutes), so no rebuild fires when a light flips. Smoke + dark
      // panes draw with the night factor; lit panes draw with uNight=0
      // (self-luminous, the sun/moon precedent — a lit window emits
      // light). The entered hut's shell is skipped whole (its chimney
      // and panes are hidden with it).
      const fxArr:number[]=[];
      // BUILD 1040: lanterns ride the same fx call (their glow is
      // per-frame, on the house-light schedule) — the tiles come from
      // placedLanternTiles with the heightfield base y, so the glow
      // box lands exactly on the static glass box.
      const lanternInputs=placedLanternTiles(world).map(t=>({tx:t.tx,ty:t.ty,baseY:surfaceElevation(effTerrainDraw,t.tx+.5,t.ty+.5)}));
      // BUILD 1041: wheat rides the same fx call — the stalks are
      // time-varying (they appear and grow as the clock advances), so
      // they emit per frame like the blades. The stage is a pure
      // function of (plantedAt, clock), so a harvest or a reload
      // changes the field with no world rebuild.
      const nowAbs=absMinutes(clockRef.current.day,clockRef.current.minutes);
      const wheatInputs=placedFarmTiles(world).map(t=>({tx:t.tx,ty:t.ty,baseY:surfaceElevation(effTerrainDraw,t.tx+.5,t.ty+.5),stage:farmStageAt(t.plantedAt,nowAbs) as FarmStage}));
      // BUILD 1050: the entered hut's interior shell + hearth — the
      // ceiling and wall band render only in first-person inside (the
      // orbit view keeps its cutaway so the room stays visible from
      // above); the hearth glow renders whenever inside and the house
      // is lit at night on its schedule (houseLitAt + the hut's seed
      // schedule, the same times its windows light up).
      const insideNow=insideHutRef.current;
      let interiorFx: InteriorFxInput | null = null;
      if (insideNow) {
        const seedHutIn=seedRectForHut(world, insideNow);
        const hyIn=surfaceElevation(effTerrainDraw,(insideNow.x0+insideNow.x1+1)/2,(insideNow.y0+insideNow.y1+1)/2);
        interiorFx={
          ceiling: firstPersonRef.current ? interiorCeilingFor(insideNow, hyIn) : null,
          walls: firstPersonRef.current ? interiorWallBandFor(insideNow, hyIn) : [],
          hearth: interiorHearthFor(insideNow, seedHutIn, hyIn),
          hearthLit: houseLitAt(clockRef.current.minutes, lightScheduleFor(seedHutIn.x0, seedHutIn.y0)),
        };
      }
      const fxCounts=emitHouseFx(fxArr,houseFxInputsFor(world,insideHutRef.current),clockRef.current.minutes,skyDriftRef.current,lanternInputs,wheatInputs,interiorFx);
      lastFxStats={houses:fxCounts.houses,chimneys:fxCounts.chimneys,litHouses:fxCounts.litHouses,smokeVerts:fxCounts.smokeVerts,totalVerts:fxCounts.totalVerts,windmills:fxCounts.windmills,millVerts:fxCounts.millVerts,lanterns:fxCounts.lanterns,lanternVerts:fxCounts.lanternVerts,wheatTiles:fxCounts.wheatTiles,wheatVerts:fxCounts.wheatVerts,ceilingVerts:fxCounts.ceilingVerts,wallVerts:fxCounts.wallVerts,hearthGlow:fxCounts.hearthGlow,hearthVerts:fxCounts.hearthVerts};
      if(fxCounts.totalVerts>0){
        gl.bindBuffer(gl.ARRAY_BUFFER,fxBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(fxArr));gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
        if(fxCounts.nightVerts>0)gl.drawArrays(gl.TRIANGLES,0,fxCounts.nightVerts);
        if(fxCounts.totalVerts>fxCounts.nightVerts){gl.uniform1f(uNightLoc,0);gl.drawArrays(gl.TRIANGLES,fxCounts.nightVerts,fxCounts.totalVerts-fxCounts.nightVerts);gl.uniform1f(uNightLoc,nightFactor);}
      }
      // BUILD 998: interpolated NPC motion + per-figure GPU slots (see
      // npcMotion.ts). Logical tiles come from the 900ms timer; figures
      // glide toward them at the demo speed, phase follows distance
      // actually traveled, yaw turns smoothly, and only slots whose
      // pose changed re-emit + re-upload (bufferSubData). Idle figures
      // cost zero emission and zero upload per frame. Corpses keep a
      // small separate buffer (few verts, full upload is negligible).
      // BUILD 1007: NO figure cull — residents, transients, and corpses
      // draw at whole-world range (were 22-tile culled, so the town
      // looked empty of people from any far viewpoint). Figures are
      // deliberately NOT fogged: at range they are a few pixels, and
      // vivid figures stay visible while hazed ground would swallow
      // them — visibility wins for "see everything". Figures still
      // depth-test against houses like any other geometry, in both
      // cameras.
      if(!actorSlotsAllocated){gl.bindBuffer(gl.ARRAY_BUFFER,actorBuffer);gl.bufferData(gl.ARRAY_BUFFER,figureSlots.totalVerts*24,gl.DYNAMIC_DRAW);actorSlotsAllocated=true;}
      gl.bindBuffer(gl.ARRAY_BUFFER,actorBuffer);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
      let emitted=0,reused=0,drawn=0;
      const emitFigureSlot=(slot:number,cx:number,cz:number,yaw:number,phase:number,spec:VillagerSpec,child:boolean,rx:number,rz:number,pre?:number[],baseY=0)=>{
        const key:FigurePoseKey={x:rx,z:rz,yaw,phase};
        if(!poseKeyEquals(slotUploaded.get(slot)??null,key)){
          const tmp:number[]=pre??[];
          // BUILD 1034: baseY lifts the figure onto the heightfield.
          // The pose key need not carry it — a standing figure's tile
          // (and so its base y) never changes while the key is stable,
          // and a moving figure re-emits every frame anyway.
          if(!pre)emitVillager(tmp,cx,cz,yaw,phase,spec,child,baseY);
          const count=pre?pre.length/6:figureSlotCounts[slot];
          figureScratch.set(tmp);
          gl.bufferSubData(gl.ARRAY_BUFFER,figureSlots.offsets[slot]*24,figureScratch.subarray(0,count*6));
          slotUploaded.set(slot,key);
          emitted++;
        } else reused++;
        // BUILD 1000: transient slots draw the occupant's actual count
        // (pre array), not the slot capacity — stale verts past the
        // occupant's count are never drawn.
        const drawCount=pre?pre.length/6:figureSlotCounts[slot];
        gl.drawArrays(gl.TRIANGLES,figureSlots.offsets[slot],drawCount);
        drawn++;
      };
      const nowMs=performance.now();
      for(const npc of npcActorsRef.current){
        if(npc.looted||!npc.alive)continue;
        const slot=slotByName.get(npc.name);if(slot===undefined)continue;
        const target={x:npc.x,y:npc.y};
        let st=npcRender.get(npc.name);
        if(!st){st={x:target.x,y:target.y,yaw:Math.PI,phase:0};npcRender.set(npc.name,st);}
        else if(needsRenderSnap({x:st.x,y:st.y},target)){st.x=target.x;st.y=target.y;}
        const step=advanceRenderPos({x:st.x,y:st.y},target,dtNpc);
        const moved=step.dist>0;
        let yaw=st.yaw;
        if(moved){yaw=turnYawToward(st.yaw,Math.atan2(step.pos.x-st.x,step.pos.y-st.y),FIGURE_TURN_RATE*dtNpc);}
        const phase=moved?phaseForDistance(st.phase,step.dist):easePhaseToNeutral(st.phase,dtNpc*1000);
        st.x=step.pos.x;st.y=step.pos.y;st.yaw=yaw;st.phase=phase;
        emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(npc.name),rosterArchetype(npc.name)==='child',st.x,st.y,undefined,surfaceElevation(effTerrainDraw,st.x+.5,st.y+.5));
      }
      // BUILD 1000: transient figures (travelers + adventurers) ride
      // the same glide/yaw/phase/slot machinery as residents: logical
      // tiles come from the 900ms transient timer, render positions
      // glide toward them at the demo speed, and only dirty slots
      // re-emit. Transients are adults (no child scale) and never use
      // the player spec. Slots are fixed per figure (base + slotId);
      // despawn frees the slot (the timer deletes the render + slot
      // state), so a later occupant re-emits instead of inheriting
      // stale verts.
      for(const t of transientActorsRef.current){
        const slot=transientSlotBase+t.slotId;
        const target={x:t.x,y:t.y};
        let st=npcRender.get(t.id);
        if(!st){st={x:target.x,y:target.y,yaw:Math.PI,phase:0};npcRender.set(t.id,st);}
        else if(needsRenderSnap({x:st.x,y:st.y},target)){st.x=target.x;st.y=target.y;}
        const step=advanceRenderPos({x:st.x,y:st.y},target,dtNpc);
        const moved=step.dist>0;
        let yaw=st.yaw;
        if(moved){yaw=turnYawToward(st.yaw,Math.atan2(step.pos.x-st.x,step.pos.y-st.y),FIGURE_TURN_RATE*dtNpc);}
        const phase=moved?phaseForDistance(st.phase,step.dist):easePhaseToNeutral(st.phase,dtNpc*1000);
        st.x=step.pos.x;st.y=step.pos.y;st.yaw=yaw;st.phase=phase;
        const pre:number[]=[];
        // BUILD 1034: transients stand on the heightfield (the pre
        // array is emitted here, so the base y goes into emitVillager).
        const tBaseY=surfaceElevation(effTerrainDraw,st.x+.5,st.y+.5);
        emitVillager(pre,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(t.name),false,tBaseY);
        emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(t.name),false,st.x,st.y,pre,tBaseY);
      }
      // BUILD 1013: wild animals ride the same glide/yaw/phase/slot
      // machinery as residents and transients: logical tiles come from
      // the 900ms animal timer, render positions glide toward them at
      // the demo speed, and only dirty slots re-emit. Two render
      // dimensions the pose key cannot see — bird flight height and
      // graze amount — are eased in render state, and the loop deletes
      // the slot's uploaded key when either changes, forcing a
      // re-emit instead of a stale reuse. Geometry comes from
      // emitAnimal via `pre`, so the villager spec argument is unused
      // (PLAYER_SPEC is a dummy — never rendered as a villager).
      for(const a of animalActorsRef.current){
        const slot=animalSlotBase+a.slotId;
        const target={x:a.x,y:a.y};
        let st=animalRender.get(a.id);
        if(!st){st={x:target.x,y:target.y,h:a.kind==='bird'&&a.state==='flying'?BIRD_FLIGHT_HEIGHT:0,yaw:Math.PI,phase:0,graze:0,eh:-1,eg:-1};animalRender.set(a.id,st);}
        else if(needsRenderSnap({x:st.x,y:st.y},target)){st.x=target.x;st.y=target.y;}
        const step=advanceRenderPos({x:st.x,y:st.y},target,dtNpc);
        const moved=step.dist>0;
        let yaw=st.yaw;
        if(moved){yaw=turnYawToward(st.yaw,Math.atan2(step.pos.x-st.x,step.pos.y-st.y),FIGURE_TURN_RATE*dtNpc);}
        const phase=moved?phaseForDistance(st.phase,step.dist):easePhaseToNeutral(st.phase,dtNpc*1000);
        st.x=step.pos.x;st.y=step.pos.y;st.yaw=yaw;st.phase=phase;
        const targetH=a.kind==='bird'&&a.state==='flying'?BIRD_FLIGHT_HEIGHT:0;
        st.h+=Math.max(-4*dtNpc,Math.min(4*dtNpc,targetH-st.h));
        // BUILD 1016: chickens peck through the same graze channel
        // (head down while 'pecking') and flap while scuttling.
        const targetGraze=((a.kind==='goat'||a.kind==='deer')&&a.state==='grazing')||(a.kind==='chicken'&&a.state==='pecking')?1:0;
        st.graze+=Math.max(-2.5*dtNpc,Math.min(2.5*dtNpc,targetGraze-st.graze));
        if(Math.abs(st.h-st.eh)>0.01||Math.abs(st.graze-st.eg)>0.01){slotUploaded.delete(slot);st.eh=st.h;st.eg=st.graze;}
        const pre:number[]=[];
        // BUILD 1034: animals stand on the heightfield — the yBase is
        // the ground plus the flight height (birds), and the shadow
        // blob sits on the ground under them.
        const aBaseY=surfaceElevation(effTerrainDraw,st.x+.5,st.y+.5);
        emitAnimal(pre,a.kind,st.x+.5,st.y+.5,aBaseY+st.h,yaw,phase,animalSpecFor(a.id,a.kind),{graze:st.graze,flying:a.state==='flying',flutter:a.state==='scuttling'});
        // BUILD 1015 polish: shadow blob under ground animals (1013
        // shipped none; emitAnimalBlob in animals.ts). Landing/takeoff
        // forces a slot re-emit via the h-change check above, so the
        // blob appears and disappears with the bird.
        emitAnimalBlob(pre,a.kind,st.x+.5,st.y+.5,st.h,aBaseY);
        emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,PLAYER_SPEC,false,st.x,st.y,pre,aBaseY);
      }
      // BUILD 992: in first person the camera IS the player — hide the
      // player figure or it fills the frame. NPC figures still draw.
      // BUILD 1033: while driving the car IS the player — hide the
      // figure or it stands on the car's roof; the car mesh draws instead.
      if(!firstPersonRef.current&&!drivingRef.current){
        const px=player.x+.5,pz=player.y+.5;
        const prev=figureState.get('__player');
        const dist=prev?Math.hypot(px-prev.px,pz-prev.pz):0;
        const pose=figurePose('__player',px,pz,nowMs,dt*1000,dist>0,dist);
        emitFigureSlot(playerSlot,px,pz,pose.yaw,pose.phase,PLAYER_SPEC,false,player.x,player.y,undefined,playerBaseY);
      }
      motionStats={emitted,reused,drawn};
      // BUILD 1033: the red sports car — a small per-frame buffer (the
      // sky/fx pattern: allocated once, re-uploaded per frame), drawn
      // after the actor pass. While driving the car's position IS the
      // player position and its heading is the live carYawRef; parked
      // it draws from carRef. Suppressed inside a hut (the car cannot
      // be inside; the player cannot see outside). Depth-tested like
      // every other figure, so houses occlude it correctly.
      if(!insideHutRef.current){
        const carPos=drivingRef.current?{x:player.x+.5,z:player.y+.5,yaw:carYawRef.current}:(carRef.current?{x:carRef.current.x+.5,z:carRef.current.y+.5,yaw:carRef.current.yaw}:null);
        if(carPos){
          const carArr:number[]=[];
          // BUILD 1034: the car sits on the heightfield at its position.
          emitCar(carArr,carPos.x,carPos.z,carPos.yaw,surfaceElevation(effTerrainDraw,carPos.x,carPos.z));
          gl.bindBuffer(gl.ARRAY_BUFFER,carBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(carArr));gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
          gl.drawArrays(gl.TRIANGLES,0,carArr.length/6);
        }
      }
      const corpseVerts:number[]=[];
      const corpse=(x:number,z:number)=>{const color:Vec3=[.38,.18,.16],x0=x-.28,x1=x+.28,z0=z-.28,z1=z+.28,y0=0,y1=.18;const tri=(a:Vec3,b:Vec3,c:Vec3)=>{for(const p of [a,b,c])corpseVerts.push(...p,...color)};tri([x0,y0,z1],[x1,y0,z1],[x1,y1,z1]);tri([x0,y0,z1],[x1,y1,z1],[x0,y1,z1]);};
      for(const npc of npcActorsRef.current) if(!npc.looted&&!npc.alive)corpse(npc.x+.5,npc.y+.5);
      if(corpseVerts.length){upload(corpseBuffer,new Float32Array(corpseVerts));gl.drawArrays(gl.TRIANGLES,0,corpseVerts.length/6);}
      // BUILD 1037: keep the yellow selection overlay glued to the
      // ground as the camera moves — reposition it at the live
      // selection rect each frame, but only when the camera key
      // (yaw/zoom/player) changed, so a still camera costs no DOM
      // writes. Skipped while a drag or Duplicate is armed — those
      // previews own the overlay then (their handlers position it
      // per pointer).
      {
        const sel=areaSelectionRef.current;
        if(sel&&!areaSelectDragging&&!areaMoveDragging&&!buildRef.current.areaDuplicateArmed){
          const camKey=yaw.toFixed(4)+'|'+zoom.toFixed(2)+'|'+stateRef.current.position.x.toFixed(2)+'|'+stateRef.current.position.y.toFixed(2);
          if(camKey!==areaCamKey){areaCamKey=camKey;positionAreaSelectRect(sel.rect,areaSelectionLabel(sel));}
        }
      }
      raf=requestAnimationFrame(draw);
    };
    const tryMove=(dx:number,dy:number)=>{const nextX=Math.round(stateRef.current.position.x+dx),nextY=Math.round(stateRef.current.position.y+dy);const occupied=npcActorsRef.current.some(n=>Math.round(n.x)===nextX&&Math.round(n.y)===nextY);if(!occupied&&walkableWithPlacements(world,world.crates,nextX,nextY)){const next={x:nextX,y:nextY};stateRef.current.position=next;setPosition(next);try{localStorage.setItem(SAVE_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true}};
    const action=(e:KeyboardEvent)=>{if(e.type!=='keydown')return;const k=e.key.toLowerCase();const p=stateRef.current.position;
      if(k==='f'||k===' '){
        const npcTarget=npcActorsRef.current.filter(n=>n.alive&&Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
        // BUILD 1013: wolves are F/Space targets too (25/swing, the
        // NPC rule). Nearest target wins across residents + wolves.
        // Goats, deer, and birds are ambient wildlife — never targets.
        // A wolf does NOT strike back here: wolves bite on their own
        // 900ms tick (the animal timer), so the bite is a real combat
        // loop, not a scripted retaliation.
        const wolfTarget=animalActorsRef.current.filter(a=>a.kind==='wolf'&&a.hp>0&&Math.abs(a.x-p.x)<=1&&Math.abs(a.y-p.y)<=1).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
        if(wolfTarget&&(!npcTarget||Math.hypot(wolfTarget.x-p.x,wolfTarget.y-p.y)<Math.hypot(npcTarget.x-p.x,npcTarget.y-p.y))){
          wolfTarget.hp=Math.max(0,wolfTarget.hp-25);
          if(wolfTarget.hp===0){
            animalActorsRef.current=animalActorsRef.current.filter(a=>a!==wolfTarget);
            animalRender.delete(wolfTarget.id);
            slotUploaded.delete(animalSlotBase+wolfTarget.slotId);
            setMessage('Wolf slain.');
          } else setMessage('Wolf hit · '+wolfTarget.hp+' HP remaining');
          return;
        }
        const target=npcTarget;
        if(!target){setMessage('No living target in melee range');return}
        target.hp=Math.max(0,target.hp-25);
        const nextHealth=Math.max(0,healthRef.current-5);healthRef.current=nextHealth;setHealth(nextHealth);try{localStorage.setItem(HEALTH_KEY,String(nextHealth))}catch{}
        if(nextHealth===0){setMessage('You are exhausted. Health restored to 100.');healthRef.current=100;setHealth(100);try{localStorage.setItem(HEALTH_KEY,'100')}catch{}}
        if(target.hp===0){target.alive=false;setMessage(target.name+' defeated. Press E beside them to loot the body.')}
        else setMessage(target.name+' hit · '+target.hp+' HP remaining · they strike back for 5');
        try{localStorage.setItem(NPC_SAVE_KEY,JSON.stringify(npcActorsRef.current))}catch{}
        return;
      }
      if(k==='e'){
        // BUILD 1033: E exits the car first (like Exit from a hut),
        // then enters the car when standing by it — before the door
        // check, since the car is the thing just summoned. The Enter
        // Car button is the phone-first path; E is the desktop one.
        if(drivingRef.current){exitCar();return;}
        const parkedCar=carRef.current;
        if(parkedCar&&isCarNear(parkedCar,p.x,p.y)){enterCar();return;}
        // BUILD 990: E enters/exits houses (the Enter/Exit buttons are
        // the phone-first path; E is the desktop equivalent). Inside →
        // exit first; near a door → enter; otherwise the existing
        // loot/talk/harvest chain below.
        if(insideHutRef.current){exitHut();return;}
        const doorHut=nearestDoorHut([...world.huts,...placedHutRects(world)],Math.round(p.x),Math.round(p.y));
        if(doorHut){enterHut(doorHut);return;}
        const dead=npcActorsRef.current.find(n=>!n.alive&&Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1);
        if(dead){const currentInventory=inventoryRef.current;const next={...currentInventory,gold:(currentInventory.gold||0)+5,[dead.name+' loot']:(currentInventory[dead.name+' loot']||0)+1};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}dead.looted=true;try{localStorage.setItem(NPC_SAVE_KEY,JSON.stringify(npcActorsRef.current))}catch{}setMessage('Looted '+dead.name+': 5 gold and 1 keepsake');return}
        const near=npcActorsRef.current.find(n=>n.alive&&Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1);
        if(near){setMessage('You speak with '+near.name+'. They are going about their day.');return}
        const key=(x:number,y:number)=>Math.abs(x-p.x)<=1&&Math.abs(y-p.y)<=1;
        const crate=world.crates.find(c=>key(c.tx,c.ty));
        if(crate){world.crates=world.crates.filter(c=>c!==crate);saveWorld(world);const currentInventory=inventoryRef.current;const next={...currentInventory,wood:(currentInventory.wood||0)+1};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true;setMessage('Collected 1 wood');return}
        const rock=world.rocks.find(c=>key(c.tx,c.ty));
        if(rock){world.rocks=world.rocks.filter(c=>c!==rock);if(!world.removedRocks)world.removedRocks=[];const rk=terrainKey(rock.tx,rock.ty);if(!world.removedRocks.includes(rk))world.removedRocks.push(rk);saveWorld(world);const currentInventory=inventoryRef.current;const next={...currentInventory,stone:(currentInventory.stone||0)+1};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true;setMessage('Mined 1 stone');return}
        const tree=world.trees.find(c=>key(c.tx,c.ty));
        if(tree){world.trees=world.trees.filter(c=>c!==tree);saveWorld(world);const currentInventory=inventoryRef.current;const next={...currentInventory,wood:(currentInventory.wood||0)+2};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true;setMessage('Chopped tree · collected 2 wood');return}
        // BUILD 1024: wild trees/rocks past the old edge harvest the
        // same way (2 wood / 1 stone) and stay gone via the
        // removedWildTrees / removedWildRocks sets. Same 1-tile reach
        // (the shared key() test) as the stored items above.
        let wildFound:'tree'|'rock'|null=null;let wildKey='';
        for(let wy=Math.round(p.y)-1;wy<=Math.round(p.y)+1&&!wildFound;wy++) for(let wx=Math.round(p.x)-1;wx<=Math.round(p.x)+1;wx++){
          if(!key(wx,wy)) continue;
          if(wx>=0&&wy>=0&&wx<world.w&&wy<world.h) continue;
          const k=wx+','+wy;
          if(wildTreeAt(wx,wy)&&!(world.removedWildTrees??[]).includes(k)){wildFound='tree';wildKey=k;break;}
          if(wildRockAt(wx,wy)&&!(world.removedWildRocks??[]).includes(k)){wildFound='rock';wildKey=k;break;}
        }
        if(wildFound==='tree'){if(!world.removedWildTrees)world.removedWildTrees=[];world.removedWildTrees.push(wildKey);saveWorld(world);const currentInventory=inventoryRef.current;const next={...currentInventory,wood:(currentInventory.wood||0)+2};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true;setMessage('Chopped tree · collected 2 wood');return}
        if(wildFound==='rock'){if(!world.removedWildRocks)world.removedWildRocks=[];world.removedWildRocks.push(wildKey);saveWorld(world);const currentInventory=inventoryRef.current;const next={...currentInventory,stone:(currentInventory.stone||0)+1};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true;setMessage('Mined 1 stone');return}
        // BUILD 1041: farm land — E harvests a ready wheat tile
        // within the shared 1-tile reach (the same key() test as
        // crates/trees/rocks). The tile resets to planted and
        // regrows on its own, so no re-planting is ever needed. No
        // world rebuild: the soil is static and the wheat is
        // per-frame fx, so the field updates next frame on its own.
        // A growing tile answers plainly instead of harvesting.
        const farmNowAbs=absMinutes(clockRef.current.day,clockRef.current.minutes);
        const farmReady=placedFarmTiles(world).find(t=>key(t.tx,t.ty)&&farmStageAt(t.plantedAt,farmNowAbs)==='ready');
        if(farmReady){const res=harvestFarmTile(world,farmReady.tx,farmReady.ty,farmNowAbs);if(res.ok){saveWorld(world);const currentInventory=inventoryRef.current;const next={...currentInventory,wheat:(currentInventory.wheat||0)+res.wheat};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}setMessage('Harvested wheat · +'+res.wheat+' wheat');return}}
        const farmNear=placedFarmTiles(world).find(t=>key(t.tx,t.ty));
        if(farmNear){setMessage('Wheat is still growing — it is ready in a few in-game hours');return}
        setMessage('Nothing close enough to interact with');return
      }
      // Directional keys are integrated continuously by the render loop;
      // never quantize movement into one-tile jumps.
    };
    window.addEventListener('keydown',action);
    // BUILD 983 screenshot harness: drive the first-person camera
    // without UI (renamed in 992: street view became first person on
    // full zoom; setStreetView stays as a deprecated alias).
    (window as any).__ag3dTest={
      setYaw:(v:number)=>{yaw=v},
      setLookPitch:(v:number)=>{lookPitch=v},
      // BUILD 1023 probe hook (read-only): first-person look pitch, so
      // probes can measure the drag→pitch direction exactly.
      getLookPitch:()=>lookPitch,
      setFirstPerson:(v:boolean)=>{firstPersonRef.current=v;setFirstPersonOn(v)},
      setStreetView:(v:boolean)=>{firstPersonRef.current=v;setFirstPersonOn(v)},
      getFirstPerson:()=>firstPersonRef.current,
      getZoom:()=>zoom,
      setPlayer:(x:number,y:number)=>{stateRef.current.position={x,y};setPosition({x,y});needsWorldRebuild.current=true},
      // BUILD 990 test hook (read-only): the entered hut's rect, or null.
      getInsideHut:()=>insideHutRef.current?{...insideHutRef.current}:null,
      getPlacements:()=>JSON.parse(JSON.stringify(stateRef.current.world.placements??[])),
      // BUILD 1041 test hook (read-only): farm tiles with their live
      // growth stage (probes only — no gameplay effect).
      getFarmTiles:()=>placedFarmTiles(stateRef.current.world).map(t=>({tx:t.tx,ty:t.ty,plantedAt:t.plantedAt??null,stage:farmStageAt(t.plantedAt,absMinutes(clockRef.current.day,clockRef.current.minutes))})),
      // BUILD 996 test hooks: chunk library, save selection, armed
      // paste template (probes only — no gameplay effect).
      getTemplates:()=>JSON.parse(JSON.stringify(templatesRef.current)),
      // BUILD 997 test hook (read-only): uploaded custom assets.
      getCustomAssets:()=>JSON.parse(JSON.stringify(customAssetsRef.current)),
      // BUILD 1044 test hooks (read-only): the IndexedDB store state
      // — whether the library finished loading, whether the store is
      // usable this session, and any visible warning (probes only).
      getAssetStoreStatus:()=>({loading:customAssetsLoadingRef.current,ready:assetStoreReadyRef.current,warning:customAssetsWarningRef.current}),
      // BUILD 1045 test hooks (read-only): the imports waiting for
      // an explicit Add/Cancel, and the live import progress (probes only).
      getPendingImports:()=>JSON.parse(JSON.stringify(pendingImportsRef.current)),
      getImportProgress:()=>importProgressRef.current?{...importProgressRef.current}:null,
      // BUILD 1046 test hooks (read-only): the last import's report
      // (landed / skipped + why / failed / notes), the overwrite
      // prompt when a name collides, and the dependencies the
      // parsers reported for pending imports (probes only).
      getImportReport:()=>importReportRef.current?JSON.parse(JSON.stringify(importReportRef.current)):null,
      getOverwritePrompt:()=>overwritePromptRef.current?JSON.parse(JSON.stringify(overwritePromptRef.current)):null,
      // BUILD 1047 test hooks (read-only): the handoff selection, the
      // live summary for it, and what the last handoff copy / share /
      // export did (probes only — the player sees the same facts in
      // the message line).
      getHandoffStatus:()=>({checked:[...handoffCheckedRef.current],lastCopyPath:handoffCopyRef.current,lastSharePath:handoffShareRef.current,lastExportCount:handoffExportRef.current}),
      getHandoffSummary:()=>handoffSummaryFor({kind:'ids',ids:handoffCheckedRef.current}),
      getPendingDependencies:()=>{const o:Record<string,GltfDependency[]>={};pendingDepsRef.current.forEach((v,k)=>{o[k]=JSON.parse(JSON.stringify(v));});return o;},
      getSaveSelection:()=>saveSelectionRef.current?{...saveSelectionRef.current}:null,
      getPasteName:()=>buildRef.current.pasteName,
      // BUILD 1036 test hooks (probes only — no gameplay effect):
      // the armed placement selection + rotation, and the same
      // rotate the R key / rotation buttons perform.
      getPlacement:()=>({palette:buildRef.current.palette,customAssetId:buildRef.current.customAssetId,rot:placementRotRef.current,moveMode:buildRef.current.moveMode}),
      rotatePlacement:(dir:1|-1)=>{if(!buildRef.current.palette&&!buildRef.current.customAssetId)return placementRotRef.current;const next=(((placementRotRef.current+(dir===1?1:3))%4) as Rotation);setPlacementRotBoth(next);const h=placeHoverRef.current;if(h)placePreviewFnRef.current?.(h.x,h.y);return next;},
      // BUILD 1037 test hooks (probes only — no gameplay effect): the
      // live area selection, the armed tool, and a direct way to set
      // a selection from a rectangle (the drag's end state).
      getAreaSelection:()=>areaSelectionRef.current?JSON.parse(JSON.stringify(areaSelectionRef.current)):null,
      getAreaSelectMode:()=>buildRef.current.areaSelectMode,
      setAreaSelect:(rect:{x0:number;y0:number;x1:number;y1:number})=>{const sel=selectArea(stateRef.current.world,rect);setAreaSelection(sel);setBuildOpen(true);positionAreaSelectRect(rect,areaSelectionLabel(sel));return sel;},
      selectAreaRect:(x0:number,y0:number,x1:number,y1:number)=>{const rect={x0,y0,x1,y1};const sel=selectArea(stateRef.current.world,rect);setAreaSelection(sel);setBuildOpen(true);positionAreaSelectRect(rect,areaSelectionLabel(sel));return sel;},
      getPlayer:()=>({...stateRef.current.position}),
      // BUILD 993 test hooks: day clock read/set + NPC teleport (probes
      // only — no gameplay effect). setClock persists like the live clock.
      getClock:()=>({...clockRef.current}),
      setClock:(minutes:number,day?:number)=>{clockRef.current={minutes:((Math.floor(minutes)%1440)+1440)%1440,day:day??clockRef.current.day};saveClock(clockRef.current);},
      // BUILD 1011 test hooks: sky state read + cloud-drift set (probes
      // only — no gameplay effect).
      getSky:()=>({minutes:clockRef.current.minutes,night:nightFactorForMinutes(clockRef.current.minutes),drift:skyDriftRef.current,inside:!!insideHutRef.current}),
      setSkyDrift:(s:number)=>{skyDriftRef.current=Math.max(0,Math.floor(s));},
      // BUILD 1014 test hooks: house-fx state read (probes only — no
      // gameplay effect). houses/chimneys/litHouses are the last
      // frame's emission; houses[] carries each house's schedule +
      // lit state (resolveHouseFx is what the renderer draws, so
      // probes see exactly the live state); smokeSample is the first
      // chimney's live puff centres (pure function of the drift clock,
      // for the smoke-movement proof).
      getHouseFx:()=>{const details=resolveHouseFx(houseFxInputsFor(world,insideHutRef.current),clockRef.current.minutes);const c=details.find(d=>d.top);const sample=c&&c.top?{top:[...c.top],puffs:smokePuffsFor(c.top,c.seedX0,c.seedY0,skyDriftRef.current)}:null;return {minutes:clockRef.current.minutes,night:nightFactorForMinutes(clockRef.current.minutes),drift:skyDriftRef.current,...lastFxStats,houses:details.map(d=>({x0:d.hut.x0,y0:d.hut.y0,x1:d.hut.x1,y1:d.hut.y1,doorFace:d.doorFace,stories:d.stories,chimney:!!d.top,onMin:d.schedule.onMin,offMin:d.schedule.offMin,lit:d.lit,variant:d.variant??null,baseY:d.baseY,roofAxis:d.roofAxis,roofPitch:d.roofPitch,roofForm:d.roofForm})),lanterns:placedLanternTiles(world).map(t=>({tx:t.tx,ty:t.ty,lit:houseLitAt(clockRef.current.minutes,lightScheduleFor(t.tx,t.ty))})),smokeSample:sample};},
      // BUILD 999: a teleport must also drop the NPC's cached A* path.
      // Paths store ABSOLUTE tiles planned from the old position; the
      // timer only replans when the DESTINATION changes, so a moved
      // actor otherwise snaps back onto its stale path on the next
      // tick (caught by the 999 probes: a teleported NPC jumped ~21
      // tiles to its old path). Probes only — no gameplay effect: no
      // in-game system moves an NPC outside the timer today.
      setNpcPos:(name:string,tx:number,ty:number)=>{const a=npcActorsRef.current.find(n=>n.name===name);if(a){a.x=tx;a.y=ty;npcPath.delete(name);}},
      // BUILD 998 test hooks: interpolated render tile coords (floats)
      // for motion proofs, and last-frame slot upload stats (emitted vs
      // reused vs drawn) for the caching proof.
      getNpcRenderPos:(name:string)=>{const r=npcRender.get(name);return r?{x:r.x,y:r.y}:null;},
      getMotionStats:()=>({...motionStats}),
      // BUILD 1000 test hooks (probes only — no gameplay effect):
      // read transients, force-spawn one (bypasses pacing + the
      // out-of-view rule so probes can watch it, but never the caps,
      // name uniqueness, or slot uniqueness), and force a bark line
      // (bypasses cooldowns, range, and the day rule so probes can
      // prove delivery; the standalone asserts prove eligibility).
      // BUILD 1003 test hooks (probes only — no gameplay effect):
      // stamina read, sprint hold, and whether this frame sprint-moves.
      getStamina:()=>({...staminaRef.current}),
      setSprintHeld:(v:boolean)=>{sprintHeldRef.current=v;},
      getSprinting:()=>sprintingRef.current,
      // BUILD 1018 test hook (read-only): whether the tap-to-toggle
      // sprint latch is on (probes only — no gameplay effect).
      getSprintLatched:()=>sprintLatchRef.current,
      // BUILD 1026 test hooks (read-only): the exhaustion rearm-gate
      // state, the world-buffer rebuild count, and the stamina-UI
      // publish count (probes only — no gameplay effect).
      getSprintRearm:()=>sprintRearmRef.current,
      getRebuildCount:()=>rebuildCountRef.current,
      // BUILD 1035 test hook (read-only): the time-sliced rebuild step
      // statistics — how many builds finished, the worst single step
      // in ms, the worst single step WHILE MOVING (the hitch signal;
      // a stationary build may run to completion in one step), the
      // total step time, and the last build's frame count and ms
      // (probes only — no gameplay effect).
      getRebuildStats:()=>({...rebuildStepStatsRef.current}),
      getStaminaPublishes:()=>staminaPublishCountRef.current,
      // Probe-only: drop a stale tap destination so key-based probe runs
      // are not overridden by an earlier tap (no gameplay effect — taps
      // only ever set moveTarget from the canvas handler). BUILD 1030:
      // also drops the tap journey's A* path, or the follower would
      // keep driving toward the cleared destination.
      clearMoveTarget:()=>{moveTarget=null;playerPathRef.current=null;playerPathWaitRef.current=null;playerPathStuckRef.current=null;},
      getTransients:()=>transientActorsRef.current.map(t=>({id:t.id,kind:t.kind,name:t.name,x:t.x,y:t.y,state:t.state,slotId:t.slotId,exit:t.exit})),
      spawnTransient:(kind:'traveler'|'adventurer')=>{const live=transientActorsRef.current;const s=spawnTransient(world,kind,new Set(live.map(t=>t.name)),new Set(live.map(t=>t.slotId)),transientTickRef.current,stateRef.current.position,false);if(s){transientActorsRef.current=[...live,s];return s.id;}return null;},
      // BUILD 1013 test hooks (probes only — no gameplay effect):
      // read animals, force-spawn one (bypasses pacing + the
      // out-of-view rule so probes can watch it, but never the caps
      // or slot uniqueness), teleport one (drops the cached A* path,
      // the 999 lesson), and read its render position (floats, with
      // flight height h for birds).
      getAnimals:()=>animalActorsRef.current.map(a=>({id:a.id,kind:a.kind,x:a.x,y:a.y,state:a.state,hp:a.hp,slotId:a.slotId,flightTo:a.flightTo})),
      spawnAnimal:(kind:'bird'|'goat'|'deer'|'wolf'|'chicken')=>{const live=animalActorsRef.current;const cap=kind==='bird'?MAX_BIRDS:kind==='goat'?MAX_GOATS:kind==='deer'?MAX_DEER:kind==='wolf'?MAX_WOLVES:MAX_CHICKENS;if(live.filter(a=>a.kind===kind).length>=cap)return null;const s=spawnAnimal(world,kind,new Set(live.map(a=>a.slotId)),new Set(live.map(a=>a.x+','+a.y)),stateRef.current.position,staticAnchors.plaza,false);if(s){animalActorsRef.current=[...live,s];return s.id;}return null;},
      setAnimalPos:(id:string,tx:number,ty:number)=>{const a=animalActorsRef.current.find(x=>x.id===id);if(a){a.x=tx;a.y=ty;animalPath.delete(id);return true;}return false;},
      getAnimalRenderPos:(id:string)=>{const r=animalRender.get(id);return r?{x:r.x,y:r.y,h:r.h}:null;},
      // BUILD 1000: teleport a transient (probes only — lets a probe
      // place an adventurer beside the plaza to watch its pause +
      // exit without a 90s walk). Drops the cached A* path, the 999
      // lesson: absolute path tiles would snap it back otherwise.
      setTransientPos:(id:string,tx:number,ty:number)=>{const t=transientActorsRef.current.find(x=>x.id===id);if(t){t.x=tx;t.y=ty;transientPath.delete(id);return true;}return false;},
      // BUILD 1000: cached-path inspector (probes only — distinguishes
      // a sealed route (path []) from an occupied deadlock (path with
      // a stuck index) when a transient is not advancing).
      debugTransient:(id:string)=>{const t=transientActorsRef.current.find(x=>x.id===id);const p=transientPath.get(id);return t?{exit:t.exit,path:p?p.path:null,index:p?p.index:null,blockedTicks:p?p.blockedTicks:null,noPathTicks:p?p.noPathTicks:null,state:t.state}:null;},
      forceBark:(name:string)=>{const clock=clockRef.current;const res=npcActorsRef.current.find(n=>n.name===name);if(res){const line=barkLineFor('resident',rosterArchetype(name),clock.minutes,name,clock.day);setMessage(name+': '+line);return line;}const tr=transientActorsRef.current.find(t=>t.name===name);if(tr){const line=barkLineFor(tr.kind,null,clock.minutes,name,clock.day);setMessage(name+': '+line);return line;}return null;},
      // BUILD 989 refinement: project a tile centre to container pixel
      // coordinates (same math as the Remove aiming preview), so the
      // browser harness can tap/drag exact tiles instead of guessing
      // pixel offsets. Test-only; no gameplay effect.
      projectTile:(tx:number,ty:number)=>projectTileCenter(tx,ty),
      // BUILD 987 test hook (read-only): adapted-world summary for the
      // browser harness — hut rects, dirt keys, removed sets, placements.
      getWorldSummary:()=>({
        // BUILD 990: door coords for the browser harness (Enter-button probes).
        huts: stateRef.current.world.huts.map(h=>({x0:h.x0,y0:h.y0,x1:h.x1,y1:h.y1,doorX:(h as {doorX?:number}).doorX??null,doorY:(h as {doorY?:number}).doorY??null})),
        dirtKeys: Object.entries(stateRef.current.world.terrain).filter(([,t])=>t==='dirt').map(([k])=>k),
        removedHuts: stateRef.current.world.removedHuts??[],
        removedPaths: stateRef.current.world.removedPaths??[],
        // BUILD 1006: moved generated huts, for move + reload proofs.
        movedHuts: stateRef.current.world.movedHuts??[],
        placements: JSON.parse(JSON.stringify(stateRef.current.world.placements??[])),
        // BUILD 989: trees, crates, and their removed sets for the
        // browser harness (tree/crate-tree removal + undo proofs).
        trees: stateRef.current.world.trees.map(t=>({tx:t.tx,ty:t.ty})),
        crates: stateRef.current.world.crates.map(t=>({tx:t.tx,ty:t.ty})),
        removedTrees: stateRef.current.world.removedTrees??[],
        removedCrates: stateRef.current.world.removedCrates??[],
        // BUILD 1025: rocks + removedRocks for the browser harness
        // (rock placement / rock removal + reload proofs). Read-only.
        rocks: stateRef.current.world.rocks.map(t=>({tx:t.tx,ty:t.ty})),
        removedRocks: stateRef.current.world.removedRocks??[],
        // BUILD 1027: removedWater for the browser harness (water
        // removal + reload proofs). Read-only.
        removedWater: stateRef.current.world.removedWater??[],
        // BUILD 1028: walls + removedWalls for the browser harness
        // (wall placement / wall removal + reload proofs). Read-only.
        walls: stateRef.current.world.walls.map(wl=>({x:wl.x,y:wl.y,h:wl.h})),
        removedWalls: stateRef.current.world.removedWalls??[],
        // BUILD 1051: market stalls + wild landmarks + town decor
        // for the browser harness (market / landmark / district
        // proofs). Read-only — the stalls are the adapter's market
        // row, the landmarks are the fixed wild list.
        stalls: stateRef.current.world.stalls.map(s=>({x0:s.x0,y0:s.y0,x1:s.x1})),
        landmarks: JSON.parse(JSON.stringify(stateRef.current.world.landmarks??[])),
        propDecor: JSON.parse(JSON.stringify(stateRef.current.world.propDecor??[])),
        // BUILD 993: day clock + roster positions for schedule probes.
        clockMinutes: clockRef.current.minutes,
        clockDay: clockRef.current.day,
        npcs: npcActorsRef.current.map(n=>({name:n.name,x:n.x,y:n.y,alive:n.alive})),
      }),
      // BUILD 1033 test hooks (probes only — no gameplay effect): the
      // car's live position + heading + driving state, and the same
      // summon / enter / exit the buttons call.
      getCar:()=>carRef.current?{...carRef.current,driving:drivingRef.current}:null,
      summonCar:()=>{summonCar();return carRef.current?{...carRef.current}:null;},
      enterCar:()=>{enterCar();return drivingRef.current;},
      exitCar:()=>{exitCar();return drivingRef.current;},
    };
    draw();
    // BUILD 993: the day clock advances 1 game minute per real second
    // while the view is mounted, persisted so phases survive reloads.
    const clockTimer=window.setInterval(()=>{
      const c=clockRef.current;let minutes=c.minutes+1,day=c.day;
      if(minutes>=1440){minutes-=1440;day+=1;}
      clockRef.current={minutes,day};saveClock(clockRef.current);
    },1000);
    // BUILD 993: roster NPCs walk their 2.5D schedules. Destinations
    // recompute from the clock every tick (anchors resolve hut doorsteps
    // LIVE, so a removed home/workplace falls back to the plaza at once);
    // movement follows a cached A* path (1 tile/900ms, the demo speed),
    // replanned when the destination changes or a path tile becomes
    // unwalkable. A pathless NPC waits and retries planning (a sealed
    // destination never teleports); an occupied next tile waits a tick
    // without replanning. At a destination the NPC stands still until
    // the next phase retargets.
    const npcByName=new Map(ROSTER_3D.map((n,i)=>[n.name,i]));
    // Path state per NPC (session-only, never saved). blockedTicks
    // counts consecutive ticks behind the same occupied tile (998).
    const npcPath=new Map<string,{dest:string;path:{x:number;y:number}[];index:number;noPathTicks:number;blockedTicks:number;detour:boolean}>();
    const npcTimer=window.setInterval(()=>{
      const actors=npcActorsRef.current;
      const clock=clockRef.current;
      const anchors=buildAnchors(world,staticAnchors);
      actors.forEach((actor,i)=>{
        if(!actor.alive)return;
        const idx=npcByName.get(actor.name);if(idx===undefined)return;
        const sched=scheduleTileFor(ROSTER_3D[idx],idx,anchors,clock.minutes,clock.day,world);
        const cx=Math.round(actor.x),cy=Math.round(actor.y);
        // BUILD 1041: farmers detour to a ready wheat tile within
        // FARM_VILLAGER_RADIUS and harvest it on arrival (the tile
        // resets to planted and regrows — the village's wheat, no
        // counter). The detour is a destination swap, not a schedule
        // change: the farmer resumes their schedule the next tick
        // after harvesting (or if the wheat is gone when they arrive
        // — harvested by the player or another farmer first).
        const farmNowAbs=absMinutes(clock.day,clock.minutes);
        const farmDest=rosterArchetype(actor.name)==='farmer'?nearestReadyFarmTile(world,cx,cy,farmNowAbs):null;
        const dest=farmDest??{tx:sched.tx,ty:sched.ty};
        if(cx===dest.tx&&cy===dest.ty){
          if(farmDest){
            const res=harvestFarmTile(world,farmDest.tx,farmDest.ty,farmNowAbs);
            if(res.ok){saveWorld(world);setMessage(actor.name+' harvested wheat');}
          }
          npcPath.delete(actor.name);return;
        }
        const destKey=dest.tx+','+dest.ty;
        let w=npcPath.get(actor.name);
        if(!w||w.dest!==destKey){
          w={dest:destKey,path:planPathNpc(world,{x:cx,y:cy},{x:dest.tx,y:dest.ty})??[],index:0,noPathTicks:0,blockedTicks:0,detour:false};
          npcPath.set(actor.name,w);
        }
        if(w.path.length===0){
          // No route (sealed): wait, retry planning occasionally in case
          // the world changed (a placed item removed).
          w.noPathTicks++;
          if(w.noPathTicks>=11){
            w.path=planPathNpc(world,{x:cx,y:cy},{x:dest.tx,y:dest.ty})??[];
            w.index=0;w.noPathTicks=0;w.detour=false;
          }
          return;
        }
        const next=w.path[w.index];
        if(!next){npcPath.delete(actor.name);return;}
        // BUILD 1030: any remaining path tile became unwalkable (a
        // placed item landed on a later tile) — replan now, not just
        // when the NPC walks up to the blocker.
        if(pathHasUnwalkableTile(world,w.path,w.index)){
          w.path=planPathNpc(world,{x:cx,y:cy},{x:dest.tx,y:dest.ty})??[];
          w.index=0;w.noPathTicks=0;w.blockedTicks=0;w.detour=false;
          return;
        }
        const player=stateRef.current.position;
        const occupied=(Math.round(player.x)===next.x&&Math.round(player.y)===next.y)||actors.some((other,j)=>j!==i&&Math.round(other.x)===next.x&&Math.round(other.y)===next.y);
        if(!occupied){actor.x=next.x;actor.y=next.y;w.index++;w.blockedTicks=0;}
        else{
          // BUILD 998: persistent-block rule — wait briefly (a leader
          // one tick ahead, a player stepping aside), then replan with
          // the blocking tile excluded so head-on and standing blocks
          // route around instead of deadlocking. A failed replan falls
          // into the sealed wait + 11-tick retry (empty path below).
          // BUILD 1030: a detour replan only when this path is not
          // itself a detour — two head-on actors both detour into the
          // same lane and ping-pong between lanes forever if each
          // replans again; an actor blocked on a detour steps aside
          // instead, which breaks the symmetry (the other one passes).
          w.blockedTicks++;
          if(blockedAction(w.blockedTicks)==='replan'){
            let resolved=false;
            if(!w.detour){
              const detour=planPathNpc(world,{x:cx,y:cy},{x:dest.tx,y:dest.ty},4000,new Set([next.x+','+next.y]));
              if(detour){w.path=detour;w.index=0;w.blockedTicks=0;w.noPathTicks=0;w.detour=true;resolved=true;}
            }
            if(!resolved){
              const occupiedFn=(x:number,y:number)=>(Math.round(player.x)===x&&Math.round(player.y)===y)||actors.some((other,j)=>j!==i&&Math.round(other.x)===x&&Math.round(other.y)===y);
              const aside=sidestepTile(world,{x:cx,y:cy},next,occupiedFn);
              if(aside){w.path=[aside];w.index=0;w.blockedTicks=0;w.noPathTicks=0;w.detour=false;resolved=true;}
            }
            if(!resolved){w.path=[];w.index=0;w.blockedTicks=0;w.noPathTicks=0;w.detour=false;}
          }
        }
      });
      try{localStorage.setItem(NPC_SAVE_KEY,JSON.stringify(actors))}catch{}
    },900);

    // BUILD 1000: transient life. Mount spawns one traveler + one
    // adventurer when an out-of-view road entry exists (the town
    // reads as lived-in on first load, never a pop-in); the timer
    // then paces further spawns (travelers ~45s, adventurers ~100s,
    // staggered) up to the caps, and steps every transient with the
    // same rules as residents (cached road-biased A*, occupied waits,
    // persistent-block replans, sealed retries). Despawn frees the
    // GPU slot + render state. NOTHING here touches NPC_SAVE_KEY:
    // transients are session-only (see the ref comment above).
    const transientPath=new Map<string,TransientPathState>();
    const mountSpawn=(kind:'traveler'|'adventurer')=>{
      const live=transientActorsRef.current;
      const s=spawnTransient(world,kind,new Set(live.map(t=>t.name)),new Set(live.map(t=>t.slotId)),transientTickRef.current,stateRef.current.position,true);
      if(s)transientActorsRef.current=[...live,s];
    };
    mountSpawn('traveler');
    mountSpawn('adventurer');
    const transientTimer=window.setInterval(()=>{
      transientTickRef.current++;
      const tick=transientTickRef.current;
      const player=stateRef.current.position;
      const live=transientActorsRef.current;
      if(tick%TRAVELER_SPAWN_TICKS===0&&live.filter(t=>t.kind==='traveler').length<MAX_TRAVELERS){
        const s=spawnTransient(world,'traveler',new Set(live.map(t=>t.name)),new Set(live.map(t=>t.slotId)),tick,player,true);
        if(s)transientActorsRef.current=[...transientActorsRef.current,s];
      }
      if(tick%ADVENTURER_SPAWN_TICKS===ADVENTURER_SPAWN_PHASE&&live.filter(t=>t.kind==='adventurer').length<MAX_ADVENTURERS){
        const s=spawnTransient(world,'adventurer',new Set(live.map(t=>t.name)),new Set(live.map(t=>t.slotId)),tick,player,true);
        if(s)transientActorsRef.current=[...transientActorsRef.current,s];
      }
      const residents=npcActorsRef.current;
      const kept:TransientActor[]=[];
      for(const t of transientActorsRef.current){
        const occupied=(x:number,y:number)=>(Math.round(player.x)===x&&Math.round(player.y)===y)
          ||residents.some(r=>r.alive&&Math.round(r.x)===x&&Math.round(r.y)===y)
          ||transientActorsRef.current.some(o=>o!==t&&Math.round(o.x)===x&&Math.round(o.y)===y);
        const res=stepTransient(world,t,transientPath.get(t.id),occupied,staticAnchors.plaza);
        if(res.path)transientPath.set(t.id,res.path);else transientPath.delete(t.id);
        if(res.despawn){npcRender.delete(t.id);slotUploaded.delete(transientSlotBase+t.slotId);}
        else kept.push(t);
      }
      transientActorsRef.current=kept;
    },900);

    // BUILD 1013: wild animals. Mount spawns one of each kind when an
    // out-of-view wild tile exists (the wild reads as alive on first
    // load, never a pop-in); the timer tops each kind up to its cap
    // every 30 ticks (~27s) and steps every animal with the 998 rules
    // (cached A*, occupied waits, persistent-block replans, sealed
    // retries — see animals.ts). A wolf bite lands here, on the wolf's
    // own 900ms tick: the player takes WOLF_BITE damage (persisted to
    // HEALTH_KEY, with the same exhaustion rule as the NPC strike-back).
    // NOTHING here touches NPC_SAVE_KEY: animals are session-only.
    const animalPath=new Map<string,AnimalPathState>();
    const mountSpawnAnimal=(kind:'bird'|'goat'|'deer'|'wolf'|'chicken')=>{
      const live=animalActorsRef.current;
      const cap=kind==='bird'?MAX_BIRDS:kind==='goat'?MAX_GOATS:kind==='deer'?MAX_DEER:kind==='wolf'?MAX_WOLVES:MAX_CHICKENS;
      if(live.filter(a=>a.kind===kind).length>=cap)return;
      const s=spawnAnimal(world,kind,new Set(live.map(a=>a.slotId)),new Set(live.map(a=>a.x+','+a.y)),stateRef.current.position,staticAnchors.plaza,true);
      if(s)animalActorsRef.current=[...live,s];
    };
    mountSpawnAnimal('bird');
    mountSpawnAnimal('goat');
    mountSpawnAnimal('deer');
    mountSpawnAnimal('wolf');
    // BUILD 1016: chickens spawn in town with the wild animals.
    mountSpawnAnimal('chicken');
    const animalTimer=window.setInterval(()=>{
      animalTickRef.current++;
      const tick=animalTickRef.current;
      const player=stateRef.current.position;
      if(tick%ANIMAL_SPAWN_TOPUP_TICKS===0){
        (['bird','goat','deer','wolf','chicken'] as const).forEach(kind=>mountSpawnAnimal(kind));
      }
      const residents=npcActorsRef.current;
      for(const a of animalActorsRef.current){
        const occupied=(x:number,y:number)=>(Math.round(player.x)===x&&Math.round(player.y)===y)
          ||residents.some(r=>r.alive&&Math.round(r.x)===x&&Math.round(r.y)===y)
          ||transientActorsRef.current.some(t=>Math.round(t.x)===x&&Math.round(t.y)===y)
          ||animalActorsRef.current.some(o=>o!==a&&Math.round(o.x)===x&&Math.round(o.y)===y);
        const res=stepAnimal(world,a,animalPath.get(a.id),occupied,player,staticAnchors.plaza);
        if(res.path)animalPath.set(a.id,res.path);else animalPath.delete(a.id);
        if(res.biteDamage>0){
          const nextHealth=Math.max(0,healthRef.current-res.biteDamage);
          healthRef.current=nextHealth;setHealth(nextHealth);
          try{localStorage.setItem(HEALTH_KEY,String(nextHealth))}catch{}
          if(nextHealth===0){setMessage('You are exhausted. Health restored to 100.');healthRef.current=100;setHealth(100);try{localStorage.setItem(HEALTH_KEY,'100')}catch{}}
          else setMessage('A wolf bites you for '+res.biteDamage+'!');
        }
      }
    },900);

    // BUILD 1000: barks through the existing message area. Every 3s,
    // the nearest figure within 4 tiles barks when eligible (residents:
    // seeded day rule; transients: always day-eligible) and both
    // cooldowns (global 25s, per-figure 90s) have elapsed. No floating
    // text exists in this renderer (see the transients.ts verdict).
    let lastBarkAt=0;
    const lastBarkBy=new Map<string,number>();
    const barkTimer=window.setInterval(()=>{
      const now=Date.now();
      if(now-lastBarkAt<BARK_GLOBAL_COOLDOWN_MS)return;
      const p=stateRef.current.position;
      const clock=clockRef.current;
      type Cand={name:string;kind:'resident'|'traveler'|'adventurer';archetype:string|null;x:number;y:number};
      const cands:Cand[]=[];
      for(const n of npcActorsRef.current){
        if(!n.alive)continue;
        const r=npcRender.get(n.name);
        cands.push({name:n.name,kind:'resident',archetype:rosterArchetype(n.name),x:r?r.x:n.x,y:r?r.y:n.y});
      }
      for(const t of transientActorsRef.current){
        const r=npcRender.get(t.id);
        cands.push({name:t.name,kind:t.kind,archetype:null,x:r?r.x:t.x,y:r?r.y:t.y});
      }
      const near=cands.filter(c=>Math.hypot(c.x-p.x,c.y-p.y)<=BARK_RANGE)
        .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
      for(const c of near){
        if(c.kind==='resident'&&!barkDayEligible(c.name,clock.day))continue;
        if(now-(lastBarkBy.get(c.name)??0)<BARK_NPC_COOLDOWN_MS)continue;
        setMessage(c.name+': '+barkLineFor(c.kind,c.archetype,clock.minutes,c.name,clock.day));
        lastBarkAt=now;lastBarkBy.set(c.name,now);
        break;
      }
    },BARK_CHECK_MS);

    return()=>{cancelAnimationFrame(raf);window.clearInterval(npcTimer);window.clearInterval(transientTimer);window.clearInterval(animalTimer);window.clearInterval(barkTimer);window.clearInterval(clockTimer);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('pointerup',sprintWinUp);window.removeEventListener('pointercancel',sprintWinCancel);window.removeEventListener('touchend',sprintWinTouchEnd);window.removeEventListener('blur',sprintWinBlur);window.removeEventListener('keydown',action);window.removeEventListener('touchmove',stopTouch);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointermove',hover);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('contextmenu',cancelOnContextMenu);html.style.overflow=oldHtml.overflow;html.style.touchAction=oldHtml.touchAction;html.style.overscrollBehavior=oldHtml.overscrollBehavior;body.style.overflow=oldBody.overflow;body.style.touchAction=oldBody.touchAction;body.style.overscrollBehavior=oldBody.overscrollBehavior;body.style.position=oldBody.position;body.style.width=oldBody.width;gl.deleteBuffer(worldBuffer);gl.deleteBuffer(actorBuffer);gl.deleteBuffer(corpseBuffer);gl.deleteBuffer(skyBuffer);gl.deleteBuffer(skyObjBuffer);gl.deleteBuffer(fxBuffer);gl.deleteBuffer(carBuffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs)};
  },[]);
  const move=(dx:number,dy:number)=>{const world=stateRef.current.world;const p=stateRef.current.position;const length=Math.hypot(dx,dy)||1;const target={x:Math.max(0,Math.min(world.w-1,p.x+dx/length*3)),y:Math.max(0,Math.min(world.h-1,p.y+dy/length*3))};if(walkableWithPlacements(world,world.crates,Math.round(target.x),Math.round(target.y))){try{localStorage.setItem(SAVE_KEY,JSON.stringify(target))}catch{}stateRef.current.position=target;setPosition(target);needsWorldRebuild.current=true }};
  return <div data-testid="game-view-3d" style={{position:'fixed',inset:0,zIndex:20000,overflow:'hidden',background:'#789ebf',touchAction:'none',fontFamily:'system-ui,sans-serif'}}
    // BUILD 1004: right-edge strip swipe to reopen the Build panel.
    // Gated hard so ordinary canvas drags never reopen it: only while
    // build UI is minimized (panel hidden, tool still armed), only
    // when the drag STARTS in the 28px right-edge strip, only when it
    // starts on a non-button (cluster/Build/Exit buttons are excluded,
    // the handle has its own handlers), and only on a predominantly
    // LEFTWARD swipe. Never preventDefaults or stops propagation, so
    // orbit/pinch/placement drags proceed untouched unless they
    // qualify as this exact gesture.
    onPointerDown={(e)=>{if(buildOpen||!buildMinimized)return;if(e.target instanceof Element&&e.target.closest('button'))return;if(e.clientX<window.innerWidth-EDGE_STRIP_PX)return;edgeSwipeRef.current={id:e.pointerId,x:e.clientX,y:e.clientY};}}
    onPointerMove={(e)=>{const s=edgeSwipeRef.current;if(!s||s.id!==e.pointerId)return;if(classifySwipe(e.clientX-s.x,e.clientY-s.y)==='left'){edgeSwipeRef.current=null;setBuildOpen(true);}}}
    onPointerUp={(e)=>{if(edgeSwipeRef.current?.id===e.pointerId)edgeSwipeRef.current=null;}}
    onPointerCancel={(e)=>{if(edgeSwipeRef.current?.id===e.pointerId)edgeSwipeRef.current=null;}}
  >
    <canvas ref={canvasRef} aria-label="3D Adventure world" style={{width:'100%',height:'100%',display:'block',touchAction:'none'}}/>
    {/* BUILD 1017: the top banner is gone from the play screen (its text
        lives in Options > About); the bottom block is replaced by this
        compact status strip + message line. Help text lives in
        Options > Controls; the diagnostic line lives in
        Options > Diagnostics. Hide UI (Options) hides this whole text
        column; the control buttons always stay visible. The message row
        is one line with ellipsis so the column height is fixed and it
        can never grow up into the Enter/Exit buttons (center bottom 110).
        BUILD 1003 stamina behaviour is kept (bar + number, red + "Tired"
        while exhausted) — only the long "walk to recover" sentence is
        dropped, so the row still fits on one line; the Sprint icon
        already shows "Tired" while exhausted. */}
    {!hideUi && <div data-testid="hud-text" style={{position:'absolute',left:10,bottom:10,maxWidth:260,padding:'6px 10px',borderRadius:8,background:'#14241ddf',color:'#fff',fontSize:12}}>
      <div title={message} style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:240}}>{message}</div>
      <div style={{marginTop:2}}>HP {health}/100<div style={{display:'inline-block',width:80,height:8,marginLeft:6,borderRadius:4,background:'#3a4a3f',verticalAlign:'middle',overflow:'hidden'}}><div data-testid="hp-bar" style={{width:health+'%',height:'100%',background:'#5fbf6f'}} /></div></div>
      <div style={{marginTop:2}}>Stamina {Math.round(staminaUi.stamina)}/100<div style={{display:'inline-block',width:100,height:8,marginLeft:6,borderRadius:4,background:'#3a4a3f',verticalAlign:'middle',overflow:'hidden'}}><div data-testid="sprint-stamina-bar" style={{width:Math.round(staminaUi.stamina)+'%',height:'100%',background:staminaUi.exhausted?'#c0392b':'#5fbf6f'}} /></div>{staminaUi.exhausted?' · Tired':''}</div>
      {/* BUILD 1028: the Sprint control is a SMALL icon at the bottom
          next to Gold — the big right-side button is gone. Same
          handlers, same state (tap-to-toggle latch, "Release!" while
          the rearm gate is armed, "Tired" while exhausted, green
          while sprinting); only the size and the seat changed. The
          stamina bar above keeps its sprint-stamina-bar testid, and
          the icon keeps the sprint-toggle testid the 1026 probes use.
          Consequence, stated: Hide UI hides this whole strip, so the
          icon hides with it (the old button stayed visible) — the
          user asked for it next to Gold, which lives in this strip. */}
      <div style={{marginTop:2,display:'flex',alignItems:'center',flexWrap:'wrap',gap:6}}><span>Wood {inventory.wood||0} · Stone {inventory.stone||0} · Gold {inventory.gold||0} · Wheat {inventory.wheat||0}</span><button type="button" data-testid="sprint-toggle" aria-label="Sprint" title="Sprint (tap to toggle)" onPointerDown={(e)=>{sprintPointerIdRef.current=e.pointerId;sprintDownRef.current={t:performance.now(),x:e.clientX,y:e.clientY};sprintHeldRef.current=true;}} onPointerUp={(e)=>releaseSprintPointer(e.pointerId,e.clientX,e.clientY,true)} onPointerCancel={(e)=>releaseSprintPointer(e.pointerId,e.clientX,e.clientY,false)} onContextMenu={(e)=>e.preventDefault()} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 6px',border:'1px solid #c4d1bd',borderRadius:6,background:(sprintingUi||sprintLatchedUi)&&!staminaUi.exhausted?'#3f7d4e':staminaUi.exhausted?'#5a3a2e':'#22392d',color:'#fff',fontWeight:700,fontSize:11,lineHeight:1,opacity:staminaUi.exhausted?0.65:1,touchAction:'none',WebkitTouchCallout:'none',userSelect:'none'}}><span style={{fontSize:13}}>⚡</span><span>{staminaUi.exhausted?'Tired':sprintRearmUi?'Release!':sprintLatchedUi?'Sprinting':'Sprint'}</span></button></div>
    </div>}
    <button type="button" onClick={onExit} style={{position:'absolute',right:12,top:12,zIndex:4,padding:'10px 13px',border:'1px solid #c4d1bd',borderRadius:9,background:'#172c23e8',color:'#fff',fontWeight:700}}>Exit 3D</button>
    {/* BUILD 992: the 983 Street view toggle is removed from the main UI.
        First person now engages on full zoom; its setting lives in the
        Options dialog. BUILD 984 placement tool: bottom-right, clear of
        Options (top-right) and the diagnostic (bottom-left). */}
    <button type="button" data-testid="build-toggle" onClick={()=>{if(!buildOpen)setWalk(false);setBuildOpen(v=>!v);}} style={{position:'absolute',right:12,bottom:14,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:(buildOpen||palette||removeMode||moveMode)?'#526d42':'#172c23e8',color:'#fff',fontWeight:700,fontSize:16}}>Build</button>
    {/* BUILD 1033: Car summon — the freed Sprint slot (bottom:262,
        the 62px step between Redo 200 and Remove 324). Always
        visible like Build; disabled (dimmed, the Undo/Redo pattern)
        while driving or inside a hut. Summons the red sports car
        next to the player. */}
    <button type="button" data-testid="car-summon" disabled={driving||!!insideHut} onClick={summonCar} style={{position:'absolute',right:12,bottom:262,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:'#7a1f1f',color:'#fff',fontWeight:700,fontSize:16,opacity:(driving||insideHut)?0.45:1}}>Car</button>
    {/* BUILD 989 minimized cluster, extended by 991, 995, and 996: fixed stack above
        Build (Walk at bottom:76, Undo at bottom:138, Redo at
        bottom:200 — same 62px step) so positions never shift. Walk
        shows only when a tool is active (taps already walk otherwise);
        Undo and Redo show when a tool is active or either stack is
        non-empty; with neither, only Build shows. Each is enabled iff
        its stack is non-empty, else disabled + dimmed. Walk suspends
        the tool (label flips to Resume <tool>); Undo/Redo work
        regardless of suspension and while inside a house. Neither
        button is rendered while the panel is open. Move, Save area,
        and Paste count as tools for all three buttons, exactly like
        palette and Remove. */}
    {!buildOpen&&(palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName||areaSelectMode||areaSelection)&&<button type="button" data-testid="build-walk-toggle" onClick={()=>setWalk(!walkSuspended)} style={{position:'absolute',right:12,bottom:76,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:walkSuspended?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:16}}>{walkSuspended?(walkToolLabel()?'Resume '+walkToolLabel():'Resume'):'Walk'}</button>}
    {!buildOpen&&((palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName||areaSelectMode||areaSelection)||undoAvailable||redoAvailable)&&<button type="button" data-testid="build-undo" disabled={!undoAvailable} onClick={doUndo} style={{position:'absolute',right:12,bottom:138,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,opacity:undoAvailable?1:0.45}}>Undo</button>}
    {!buildOpen&&((palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName||areaSelectMode||areaSelection)||undoAvailable||redoAvailable)&&<button type="button" data-testid="build-redo" disabled={!redoAvailable} onClick={doRedo} style={{position:'absolute',right:12,bottom:200,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,opacity:redoAvailable?1:0.45}}>Redo</button>}
    {/* BUILD 1028: the big right-side Sprint button is gone — the
        control is now a small ⚡ icon at the bottom next to Gold in
        the HUD strip (same handlers, same latch/rearm/Tired states).
        The slot at bottom:262 stays empty on purpose: the 989 fixed
        stack never shifts, so Walk/Undo/Redo/Remove keep their
        positions. */}
    {/* BUILD 1004: Remove quick toggle — the SAME toggleRemove the
        panel's Remove button calls, so the two can never diverge.
        Renders in the minimized cluster (same visibility rule as
        Undo/Redo) at the next fixed slot (bottom:324, same 62px
        step), green while Remove is on, so Remove flips without
        opening the panel at all. Hidden while the panel is open,
        where the panel's own toggle is the path; it sits under the
        panel's footprint exactly like Sprint does. */}
    {!buildOpen&&((palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName||areaSelectMode||areaSelection)||undoAvailable||redoAvailable)&&<button type="button" data-testid="build-remove-quick-toggle" onClick={toggleRemove} style={{position:'absolute',right:12,bottom:324,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:removeMode?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:16}}>Remove</button>}
    {/* BUILD 1004: minimized handle — a visible tab at the right edge
        while build UI is minimized (panel hidden, tool still armed),
        clear of the cluster (cluster top is bottom:376, handle spans
        bottom:392–448). Tap it, or drag it sideways, to reopen the
        panel; the right-edge strip swipe reopens it too. */}
    {buildMinimized&&<button type="button" data-testid="build-swipe-handle" title="Swipe or tap to reopen Build" onClick={()=>setBuildOpen(true)} onPointerDown={(e)=>{handleSwipeRef.current={id:e.pointerId,x:e.clientX,y:e.clientY};}} onPointerMove={(e)=>{const s=handleSwipeRef.current;if(!s||s.id!==e.pointerId)return;const d=classifySwipe(e.clientX-s.x,e.clientY-s.y,SWIPE_HANDLE_MIN_PX);if(d==='left'||d==='right'){handleSwipeRef.current=null;setBuildOpen(true);}}} onPointerUp={(e)=>{if(handleSwipeRef.current?.id===e.pointerId)handleSwipeRef.current=null;}} onPointerCancel={(e)=>{if(handleSwipeRef.current?.id===e.pointerId)handleSwipeRef.current=null;}} style={{position:'absolute',right:0,bottom:392,zIndex:4,width:30,height:56,padding:0,border:'1px solid #c4d1bd',borderRight:'none',borderRadius:'9px 0 0 9px',background:'#526d42',color:'#fff',fontWeight:700,fontSize:20,touchAction:'none'}}>‹</button>}
    {/* BUILD 990: phone-first interior entry/exit. Enter appears when a
        house door is within one tile (nearest door wins); Exit shows
        only while inside. Centered at bottom:110 — clear of the
        minimized cluster (Build 14 / Walk 76 / Undo 138, right side)
        and above the panel (zIndex 6 > panel 4) so entry works with
        the panel open, regardless of the active Build tool. */}
    {/* BUILD 1033: the house Enter is gated on not driving — while
        driving the only Enter/Exit is the car's (the car cannot be
        taken inside a hut). */}
    {!insideHut&&!driving&&nearDoorHut&&<button type="button" data-testid="interior-enter" onClick={()=>enterHut(nearDoorHut)} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:110,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#526d42',color:'#fff',fontWeight:700,fontSize:16}}>Enter</button>}
    {insideHut&&<button type="button" data-testid="interior-exit" onClick={exitHut} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:110,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#526d42',color:'#fff',fontWeight:700,fontSize:16}}>Exit</button>}
    {/* BUILD 1033: car Enter/Exit — the same phone-first pattern as
        houses. Enter Car sits above the house Enter (bottom:170 vs
        110) so the two never overlap; Exit Car takes the 110 slot
        (you cannot drive and be inside a hut at once). */}
    {!driving&&nearCar&&<button type="button" data-testid="car-enter" onClick={enterCar} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:170,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#7a1f1f',color:'#fff',fontWeight:700,fontSize:16}}>Enter Car</button>}
    {driving&&<button type="button" data-testid="car-exit" onClick={exitCar} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:110,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#7a1f1f',color:'#fff',fontWeight:700,fontSize:16}}>Exit Car</button>}
    {/* BUILD 989 refinement: Remove aiming preview — gold ring + label
        at the snapped tile about to be removed. Positioned by direct
        DOM writes from the pointer handlers (never React state), so it
        tracks the finger with no re-render lag; pointerEvents none so
        it never eats a tap. Hidden unless a drag/touch-down is active
        over a removable tile within tolerance. */}
    <div ref={removePreviewRef} data-testid="build-remove-preview" style={{display:'none',position:'absolute',zIndex:5,pointerEvents:'none',transform:'translate(-50%,-50%)',width:52,height:52,border:'3px solid #ffd94d',borderRadius:'50%',boxShadow:'0 0 0 2px rgba(0,0,0,.55)'}}>
      <span ref={removePreviewLabelRef} style={{position:'absolute',left:'50%',top:56,transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'3px 8px',borderRadius:8,background:'rgba(0,0,0,.75)',color:'#ffd94d',fontSize:12,fontWeight:700}}></span>
    </div>
    {/* BUILD 995: Move aiming preview — same gold ring + label as
        Remove, positioned by direct DOM writes from the pointer
        handlers; pointerEvents none so it never eats a tap. */}
    <div ref={movePreviewRef} data-testid="build-move-preview" style={{display:'none',position:'absolute',zIndex:5,pointerEvents:'none',transform:'translate(-50%,-50%)',width:52,height:52,border:'3px solid #ffd94d',borderRadius:'50%',boxShadow:'0 0 0 2px rgba(0,0,0,.55)'}}>
      <span ref={movePreviewLabelRef} style={{position:'absolute',left:'50%',top:56,transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'3px 8px',borderRadius:8,background:'rgba(0,0,0,.75)',color:'#ffd94d',fontSize:12,fontWeight:700}}></span>
    </div>
    {/* BUILD 1037: AREA SELECT overlay — a translucent yellow
        rectangle with a solid border, spanning the selection's corner
        tiles (projected centres ± half a ring width), with a label
        giving the rectangle size and item count. Same direct-DOM
        technique as the save-area preview (never React state per
        pointermove); pointerEvents none so it never eats a tap. It
        doubles as the drag preview, the move preview, and the
        duplicate destination preview — the draw loop repositions it
        at the live selection rect as the camera moves, so the yellow
        area stays glued to the ground it selects. */}
    <div ref={areaSelectPreviewRef} data-testid="build-area-preview" style={{display:'none',position:'absolute',zIndex:5,pointerEvents:'none',border:'3px solid #ffd94d',borderRadius:6,background:'rgba(255,217,77,.18)',boxShadow:'0 0 0 2px rgba(0,0,0,.35)'}}>
      <span ref={areaSelectPreviewLabelRef} style={{position:'absolute',left:'50%',bottom:'100%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'3px 8px',marginBottom:4,borderRadius:8,background:'rgba(0,0,0,.75)',color:'#ffd94d',fontSize:12,fontWeight:700}}></span>
    </div>
    {/* BUILD 996: save-area rectangle preview — dashed gold rectangle
        positioned by direct DOM writes from the drag handlers; the
        label gives the rectangle size in tiles. pointerEvents none
        so it never eats a tap. */}
    <div ref={savePreviewRef} data-testid="build-save-preview" style={{display:'none',position:'absolute',zIndex:5,pointerEvents:'none',border:'3px dashed #ffd94d',borderRadius:6,boxShadow:'0 0 0 2px rgba(0,0,0,.35)'}}>
      <span ref={savePreviewLabelRef} style={{position:'absolute',left:'50%',bottom:'100%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'3px 8px',marginBottom:4,borderRadius:8,background:'rgba(0,0,0,.75)',color:'#ffd94d',fontSize:12,fontWeight:700}}></span>
    </div>
    {/* BUILD 1036: placement preview — a translucent rectangle over
        the tiles the armed asset would occupy, following the cursor.
        Green when the placement is valid, red when it is not; the
        label names the asset and, for houses, the door face.
        Positioned by direct DOM writes from the hover listener
        (never React state per pointermove); pointerEvents none so it
        never eats a tap. */}
    <div ref={placePreviewRef} data-testid="build-place-preview" style={{display:'none',position:'absolute',zIndex:5,pointerEvents:'none',border:'3px solid #4fc85a',borderRadius:6,background:'rgba(80,200,90,.28)',boxShadow:'0 0 0 2px rgba(0,0,0,.35)'}}>
      <span ref={placePreviewLabelRef} style={{position:'absolute',left:'50%',bottom:'100%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'3px 8px',marginBottom:4,borderRadius:8,background:'rgba(0,0,0,.75)',color:'#fff',fontSize:12,fontWeight:700}}></span>
    </div>
    {buildOpen&&<div data-testid="build-panel" style={{position:'absolute',right:12,bottom:76,zIndex:4,width:248,maxHeight:'calc(100% - 90px)',overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',touchAction:'pan-y',overscrollBehavior:'contain',padding:14,borderRadius:12,background:'#172c23f5',border:'1px solid #8c9b8d',color:'#fff',fontFamily:'system-ui,sans-serif'}}
      // BUILD 1004: sideways swipe on the open panel minimizes it —
      // exactly the minimize button's state (setBuildOpen(false)
      // only, tool kept). Vertical drags keep scrolling natively:
      // the browser cancels the pointer stream (pointercancel) and
      // the tracker resets, and the dominance rule in classifySwipe
      // would reject them anyway. Taps (small displacement) never
      // fire; a swipe that unmounts the panel cannot also click a
      // button inside it, since the button is gone by pointerup.
      onPointerDown={(e)=>{panelSwipeRef.current={id:e.pointerId,x:e.clientX,y:e.clientY,fired:false};}}
      onPointerMove={(e)=>{const s=panelSwipeRef.current;if(!s||s.id!==e.pointerId||s.fired)return;const d=classifySwipe(e.clientX-s.x,e.clientY-s.y);if(d==='left'||d==='right'){s.fired=true;setBuildOpen(false);}}}
      onPointerUp={(e)=>{if(panelSwipeRef.current?.id===e.pointerId)panelSwipeRef.current=null;}}
      onPointerCancel={(e)=>{if(panelSwipeRef.current?.id===e.pointerId)panelSwipeRef.current=null;}}
    >
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <strong style={{flex:1,fontSize:15}}>Build — free, no resource cost</strong>
        <button type="button" data-testid="build-minimize" title="Minimize (keeps your tool)" onClick={()=>setBuildOpen(false)} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,lineHeight:1}}>—</button>
        <button type="button" data-testid="build-close" title="Close (clears your tool)" onClick={()=>{setBuildOpen(false);setImportHubOpen(false);setPalette(null);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setSaveAreaMode(false);setPasteName(null);setSaveSelection(null);setAreaSelectMode(false);setAreaSelection(null);setAreaMoveArmed(false);setAreaDuplicateArmed(false);setAreaDeleteArmed(false);setCatalogCategory('all');setPlacementRotBoth(0);buildRef.current={palette:null,removeMode:false,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:null,areaSelectMode:false,areaMoveArmed:false,areaDuplicateArmed:false};const el=placePreviewRef.current;if(el)el.style.display='none';const ael=areaSelectPreviewRef.current;if(ael)ael.style.display='none';placeHoverRef.current=null;setWalk(false);}} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,lineHeight:1}}>×</button>
      </div>
      {/* BUILD 1043: Import Hub — the Build panel's front door for
          bringing in outside models. One button opens it; inside are
          the file picker (several files at once), the folder picker
          (desktop browsers that support it), the imported library
          with Place buttons, and the honest limits in plain words.
          The hub is a section at the top of the scrolling panel, not
          a floating overlay, so it cannot cover the field on a phone. */}
      <button type="button" data-testid="import-hub-open" onClick={()=>setImportHubOpen(!importHubOpen)} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:importHubOpen?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>📦 Import Hub {importHubOpen?'▾':'▸'}</button>
      {importHubOpen&&<div data-testid="import-hub" style={{marginTop:10,padding:12,borderRadius:9,background:'#22392d',border:'1px solid #c4d1bd'}}>
        <div style={{fontSize:13,fontWeight:700}}>Import Hub — bring in your own models</div>
        {customAssetsWarning&&<div data-testid="import-hub-warning" style={{fontSize:12,marginTop:8,lineHeight:1.5,padding:8,borderRadius:8,background:'#5c3a17',border:'1px solid #d9a833'}}>⚠️ {customAssetsWarning}</div>}
        <div style={{fontSize:12,marginTop:6,lineHeight:1.5}}>Imports <b>.glb</b>, <b>.gltf</b> (pick its <b>.bin</b> file at the same time if it has one), <b>.obj</b>, or a <b>.zip</b> holding any of those. Pick several files at once. A ZIP is checked before anything imports: unsafe paths, ZIP-bomb expansion, and too many or too large files are rejected or skipped with a reason, and a bad entry never stops the rest. After an import the hub reports exactly which models landed, which were skipped and why. Models render as plain coloured triangles — 1 unit = 1 tile, footprint max 8×8, max 5 MB per file, library up to 50 MB / 100,000 triangles total. Your models are stored on this device (IndexedDB) and survive reloads here — they are not synced to other devices or to GitHub. A name that already exists asks first (Keep both / Replace / Skip) — nothing is overwritten silently.</div>
        <label style={{display:'block',fontSize:12,opacity:.85,marginTop:10}}>Choose model files (several at once)</label>
        <input type="file" multiple accept=".glb,.gltf,.obj,.zip,.bin" data-testid="import-hub-file-input" onChange={handleImportFiles} style={{display:'block',width:'100%',marginTop:6,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12,boxSizing:'border-box'}} />
        <label style={{display:'block',fontSize:12,opacity:.85,marginTop:10}}>Or choose a whole folder (desktop browsers that support it)</label>
        <input type="file" multiple data-testid="import-hub-folder-input" ref={(el)=>{if(el)el.setAttribute('webkitdirectory','');}} onChange={handleImportFiles} style={{display:'block',width:'100%',marginTop:6,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12,boxSizing:'border-box'}} />
        {/* BUILD 1045: real import progress — the bar's width is the
            bytes read out of the total (or files, when there are no
            bytes), advanced between awaited reads/parses. It only
            shows while an import is actually running. */}
        {importProgress&&<div data-testid="import-progress" style={{marginTop:10,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #c4d1bd'}}>
          <div style={{fontSize:12,lineHeight:1.4}}>{importProgressLabel(importProgress)}</div>
          <div style={{height:10,borderRadius:5,background:'#0f1f18',marginTop:6,overflow:'hidden'}}><div data-testid="import-progress-bar" style={{width:importProgressPercent(importProgress)+'%',height:'100%',background:'#7fb069'}} /></div>
        </div>}
        {/* BUILD 1046: the last import's report — exactly which
            models landed, which entries were skipped and why, which
            failed, and notes (a missing texture, a pack manifest, a
            .bin found in a subfolder). It stays until dismissed, so
            a partial import is never a mystery. */}
        {importReport&&<div data-testid="import-report" style={{marginTop:12,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #c4d1bd'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{flex:1,fontSize:13,fontWeight:700}}>Import report — {importReport.source}</div>
            <button type="button" data-testid="import-report-dismiss" onClick={()=>setReport(null)} style={{padding:'6px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Dismiss</button>
          </div>
          {importReport.added.length>0&&<div data-testid="import-report-added" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>✅ Landed ({importReport.added.length}): {importReport.added.join(', ')}</div>}
          {importReport.skipped.length>0&&<div data-testid="import-report-skipped" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>⏭️ Skipped ({importReport.skipped.length}):
            {importReport.skipped.map((s,i)=><div key={i} style={{marginLeft:12}}>• {s.name} — {s.reason}</div>)}
          </div>}
          {importReport.failed.length>0&&<div data-testid="import-report-failed" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>❌ Failed ({importReport.failed.length}):
            {importReport.failed.map((f,i)=><div key={i} style={{marginLeft:12}}>• {f}</div>)}
          </div>}
          {importReport.notes.length>0&&<div data-testid="import-report-notes" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>📝 Notes:
            {importReport.notes.map((n,i)=><div key={i} style={{marginLeft:12}}>• {n}</div>)}
          </div>}
          {importReport.added.length===0&&importReport.skipped.length===0&&importReport.failed.length===0&&<div style={{fontSize:12,marginTop:6,opacity:.8}}>Nothing landed from this import.</div>}
        </div>}
        {/* BUILD 1045: review step — every parsed model waits here
            with a real preview drawn from its own geometry, its
            details, and its name/category/tags editable BEFORE it
            joins the library. Add commits it (persisted first, then
            shown); Cancel drops it (nothing was ever written). */}
        {pendingImports.length>0&&<div data-testid="import-pending" style={{marginTop:12}}>
          <div style={{fontSize:13,fontWeight:700}}>Ready to review ({pendingImports.length}) — nothing joins the library until you tap Add</div>
          {pendingImports.map(a=>{const row=assetRow(a);return <div key={a.id} data-testid="import-pending-card" style={{marginTop:8,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #ffd94d'}}>
            <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
              {canPreviewAsset(a)
                ? <AssetPreviewCanvas asset={a} size={120} testid="import-preview" />
                : <div data-testid="import-preview-unavailable" style={{width:120,height:120,flex:'0 0 120px',borderRadius:6,background:'#3a2a2a',border:'1px solid rgba(255,255,255,.25)',fontSize:11,lineHeight:1.4,padding:8,boxSizing:'border-box'}}>This model has no triangles to preview — it cannot be shown or added as a visible model.</div>}
              <div style={{flex:1,minWidth:0}}>
                <label style={{display:'block',fontSize:11,opacity:.85}}>Name</label>
                <input type="text" data-testid="import-pending-name" value={a.name} onChange={e=>updatePendingAsset(a.id,{name:e.target.value.slice(0,40)})} style={{display:'block',width:'100%',marginTop:2,padding:8,borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:13,boxSizing:'border-box'}} />
                <label style={{display:'block',fontSize:11,opacity:.85,marginTop:6}}>Category</label>
                <select data-testid="import-pending-category" value={a.category??'Unsorted'} onChange={e=>updatePendingAsset(a.id,{category:e.target.value})} style={{display:'block',width:'100%',marginTop:2,padding:8,borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:13,boxSizing:'border-box'}}>
                  {ASSET_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <label style={{display:'block',fontSize:11,opacity:.85,marginTop:6}}>Tags (comma-separated)</label>
                <input type="text" data-testid="import-pending-tags" defaultValue={(a.tags??[]).join(', ')} onBlur={e=>updatePendingAsset(a.id,{tags:parseTags(e.target.value)})} placeholder="e.g. red, roof" style={{display:'block',width:'100%',marginTop:2,padding:8,borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:13,boxSizing:'border-box'}} />
              </div>
            </div>
            <div style={{fontSize:12,marginTop:8,lineHeight:1.5}}>{row.width}×{row.depth} tiles · {row.height} high · {row.triangles} triangles · {row.format.toUpperCase()} · from {row.sourceFile}</div>
            {/* BUILD 1046: dependencies the parser reported — a
                texture this model names but that was not in the
                upload is said plainly here (it was not applied,
                because textures are never rendered), and a data
                file found in a subfolder is named too. */}
            {(()=>{const deps=(pendingDepsRef.current.get(a.id)||[]).filter(d=>!d.found||(d.found&&d.kind==='buffer'&&d.resolvedPath&&d.resolvedPath.includes('/')));
              if(deps.length===0)return null;
              return <div data-testid="import-pending-deps" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>
                {deps.map((d,i)=><div key={i}>⚠️ {d.kind==='image'
                  ? 'Texture "'+d.uri+'" was named but not found in the upload — the model still imports; textures are not rendered, so nothing was applied.'
                  : 'Its data file "'+d.resolvedPath+'" was found in a subfolder.'}</div>)}
              </div>;})()}
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <button type="button" data-testid="import-pending-add" onClick={()=>void commitPendingAssets([a])} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>Add to Asset Library</button>
              <button type="button" data-testid="import-pending-cancel" onClick={()=>discardPendingAsset(a.id)} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#5a2e24',color:'#fff',fontWeight:700,fontSize:13}}>Cancel</button>
            </div>
          </div>;})}
          {pendingImports.length>1&&<div style={{display:'flex',gap:8,marginTop:8}}>
            <button type="button" data-testid="import-pending-add-all" onClick={()=>void commitPendingAssets([...pendingImportsRef.current])} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>Add all ({pendingImports.length})</button>
            <button type="button" data-testid="import-pending-cancel-all" onClick={()=>{const n=pendingImportsRef.current.length;setPending([]);pendingDepsRef.current.clear();setMessage('Discarded '+n+' pending import'+(n===1?'':'s')+' — nothing joined the library');}} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#5a2e24',color:'#fff',fontWeight:700,fontSize:13}}>Cancel all</button>
          </div>}
        </div>}
        {/* BUILD 1046: overwrite confirmation — a pending model
            whose name already exists in the library asks first.
            Keep both renames the newcomer (the old behaviour);
            Replace removes the old model AND its placed copies,
            then adds the new one under the same name; Skip drops
            the newcomer. Nothing is committed while this is open,
            and an unanswered row defaults to Keep both. */}
        {overwritePrompt&&<div data-testid="import-overwrite-prompt" style={{marginTop:12,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #ffd94d'}}>
          <div style={{fontSize:13,fontWeight:700}}>A name already exists — what should happen?</div>
          <div style={{fontSize:12,marginTop:4,lineHeight:1.5,opacity:.9}}>Nothing has been added or removed yet. Pick one for each model, then continue.</div>
          {overwritePrompt.collisions.map(c=>{const choice=overwritePrompt.choices[c.pendingId]??'keep';return <div key={c.pendingId} data-testid="import-overwrite-row" style={{marginTop:8,padding:8,borderRadius:8,background:'#0f1f18',border:'1px solid rgba(255,255,255,.15)'}}>
            <div style={{fontSize:12,lineHeight:1.5}}><b>'{c.pendingName}'</b> is already in the library.{choice==='replace'?' Replace removes \''+c.existingName+'\' and its '+c.placedCount+' placed cop'+(c.placedCount===1?'y':'ies')+', then adds the new model.':''}</div>
            <div style={{display:'flex',gap:6,marginTop:6}}>
              <button type="button" data-testid="import-overwrite-keep" onClick={()=>setOverwrite({...overwritePromptRef.current!,choices:{...overwritePromptRef.current!.choices,[c.pendingId]:'keep'}})} style={{flex:1,padding:'8px 4px',borderRadius:8,border:'1px solid #c4d1bd',background:choice==='keep'?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Keep both</button>
              <button type="button" data-testid="import-overwrite-replace" onClick={()=>setOverwrite({...overwritePromptRef.current!,choices:{...overwritePromptRef.current!.choices,[c.pendingId]:'replace'}})} style={{flex:1,padding:'8px 4px',borderRadius:8,border:'1px solid #c4d1bd',background:choice==='replace'?'#7a3b2e':'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Replace</button>
              <button type="button" data-testid="import-overwrite-skip" onClick={()=>setOverwrite({...overwritePromptRef.current!,choices:{...overwritePromptRef.current!.choices,[c.pendingId]:'skip'}})} style={{flex:1,padding:'8px 4px',borderRadius:8,border:'1px solid #c4d1bd',background:choice==='skip'?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Skip</button>
            </div>
          </div>;})}
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button type="button" data-testid="import-overwrite-continue" onClick={resolveOverwritePrompt} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>Continue with these choices</button>
            <button type="button" data-testid="import-overwrite-cancel" onClick={()=>setOverwrite(null)} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Not yet</button>
          </div>
        </div>}
        <div style={{fontSize:13,fontWeight:700,marginTop:12}}>Asset Library ({customAssetsLoading?'…':customAssets.length})</div>
        {/* BUILD 1045: the library is searchable and sortable — search
            matches name, tags, and source filename; the filters narrow
            by category and format; sort orders by name, format,
            category, or triangle count. */}
        <input type="text" data-testid="import-library-search" value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)} placeholder="Search by name, tag, or file…" style={{display:'block',width:'100%',marginTop:6,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:13,boxSizing:'border-box'}} />
        <div style={{display:'flex',gap:6,marginTop:6}}>
          <select data-testid="import-library-category-filter" value={libraryCategoryFilter} onChange={e=>setLibraryCategoryFilter(e.target.value)} aria-label="Filter by category" style={{flex:1,padding:'8px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12}}>
            <option value="all">All categories</option>
            {ASSET_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select data-testid="import-library-format-filter" value={libraryFormatFilter} onChange={e=>setLibraryFormatFilter(e.target.value)} aria-label="Filter by format" style={{flex:1,padding:'8px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12}}>
            <option value="all">All formats</option>
            <option value="glb">GLB</option>
            <option value="gltf">glTF</option>
            <option value="obj">OBJ</option>
          </select>
          <select data-testid="import-library-sort" value={librarySort} onChange={e=>setLibrarySort(e.target.value as LibrarySort)} aria-label="Sort library" style={{flex:1,padding:'8px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12}}>
            <option value="name">Sort: name</option>
            <option value="format">Sort: format</option>
            <option value="category">Sort: category</option>
            <option value="triangles">Sort: triangles</option>
          </select>
        </div>
        {customAssetsLoading
          ? <div data-testid="import-hub-loading" style={{fontSize:12,opacity:.7,marginTop:6}}>Loading your models{(()=>{const m=readAssetManifest();return m&&m.assets.length>0?' ('+m.assets.length+' saved)':'';})()}…</div>
          : customAssets.length===0
          ? <div style={{fontSize:12,opacity:.7,marginTop:6}}>Nothing imported yet — pick a file above.</div>
          : (()=>{const visible=sortAssets(filterAssets(customAssets,{query:librarySearch,category:libraryCategoryFilter,format:libraryFormatFilter}),librarySort);
            if(visible.length===0)return <div data-testid="import-library-empty" style={{fontSize:12,opacity:.7,marginTop:6}}>No models match that search — clear the search or filters to see the whole library.</div>;
            return <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6}}>
              {visible.map(a=>{const row=assetRow(a);return <div key={a.id} data-testid="import-library-row" style={{display:'flex',gap:8,alignItems:'flex-start',padding:8,borderRadius:9,background:'#172c23',border:'1px solid rgba(255,255,255,.12)'}}>
                {/* BUILD 1047: tick a row to include it in the AI
                    handoff (export / share / copy summary below). */}
                <input type="checkbox" data-testid="import-library-handoff-check" checked={handoffChecked.includes(a.id)} onChange={()=>{const ids=handoffCheckedRef.current.includes(a.id)?handoffCheckedRef.current.filter(id=>id!==a.id):[...handoffCheckedRef.current,a.id];setHandoffCheckedBoth(ids);}} aria-label={'Include '+a.name+' in the handoff'} style={{marginTop:14,flex:'0 0 auto',width:18,height:18,accentColor:'#7fb069'}} />
                <AssetPreviewCanvas asset={a} size={44} testid="import-library-preview" />
                <div style={{flex:1,minWidth:0}}>
                  {renamingId===a.id
                    ? <div style={{display:'flex',gap:6}}>
                        <input type="text" data-testid="import-library-rename-input" value={renameDraft} onChange={e=>setRenameDraft(e.target.value.slice(0,40))} style={{flex:1,minWidth:0,padding:'7px 8px',borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:12,boxSizing:'border-box'}} />
                        <button type="button" data-testid="import-library-rename-save" onClick={()=>renameLibraryAsset(a,renameDraft)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:12}}>Save</button>
                        <button type="button" data-testid="import-library-rename-cancel" onClick={()=>setRenamingId(null)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>✕</button>
                      </div>
                    : <div style={{fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.name}</div>}
                  <div style={{fontSize:11,opacity:.85,lineHeight:1.5,marginTop:2}}>{row.category}{row.tags.length>0?' · '+row.tags.join(', '):''} · {row.width}×{row.depth} tiles · {row.height} high · {row.triangles} triangles · {row.format.toUpperCase()} · {row.sourceFile}</div>
                  <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
                    <select data-testid="import-library-category" value={row.category} onChange={e=>setLibraryAssetCategory(a,e.target.value)} aria-label={'Category for '+a.name} style={{padding:'6px',borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:11}}>
                      {ASSET_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="text" data-testid="import-library-tags" defaultValue={row.tags.join(', ')} onBlur={e=>setLibraryAssetTags(a,e.target.value)} placeholder="tags, comma-separated" aria-label={'Tags for '+a.name} style={{flex:1,minWidth:90,padding:'6px 8px',borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:11,boxSizing:'border-box'}} />
                  </div>
                  <div style={{display:'flex',gap:6,marginTop:6}}>
                    {renamingId!==a.id&&<button type="button" data-testid="import-library-rename" onClick={()=>{setRenamingId(a.id);setRenameDraft(a.name);}} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Rename</button>}
                    <button type="button" data-testid="import-hub-place" onClick={()=>armCustomAsset(a.id)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:customSelection===a.id?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Place</button>
                    <button type="button" data-testid="import-hub-delete" aria-label={'Delete '+a.name} onClick={()=>deleteCustomAsset(a)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#7a3b2e',color:'#fff',fontWeight:700,fontSize:12}}>Delete</button>
                  </div>
                </div>
              </div>;})}
            </div>;})()}
        {/* BUILD 1046: export / backup — the whole library as one
            ZIP (models in their original formats + a manifest),
            downloaded to this device. Nothing is uploaded anywhere.
            Re-importing the ZIP restores the models; placements are
            not in the pack — they live in the world save. */}
        <div style={{marginTop:12,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #c4d1bd'}}>
          <div style={{fontSize:13,fontWeight:700}}>Back up your models</div>
          <div style={{fontSize:12,marginTop:4,lineHeight:1.5}}>Export downloads one ZIP with every model in the library (in its original format) plus a manifest listing names, formats, categories, tags, and sizes. Re-import that ZIP to restore them.</div>
          <button type="button" data-testid="import-hub-export" onClick={exportAssetPack} style={{display:'block',width:'100%',marginTop:8,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>⬇️ Export library as a ZIP ({customAssetsLoading?'…':customAssets.length} model{customAssets.length===1?'':'s'})</button>
        </div>
        {/* BUILD 1047: hand off models to ChatGPT or Muse — pick which
            models (checkboxes on the rows above, a whole category, or
            the whole library), export a ZIP with the models + the
            manifest + a copyable summary, or share it when the device
            supports sharing files from the browser. The game uploads
            nothing anywhere; the AI cannot see browser files until
            the player uploads the ZIP in their chat. */}
        <div data-testid="import-handoff" style={{marginTop:12,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #c4d1bd'}}>
          <div style={{fontSize:13,fontWeight:700}}>Hand off models to ChatGPT or Muse</div>
          <div style={{fontSize:12,marginTop:4,lineHeight:1.5}}>{HANDOFF_HOWTO}</div>
          <div style={{fontSize:12,marginTop:4,lineHeight:1.5}}>{HANDOFF_LIMIT}</div>
          <div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap'}}>
            <button type="button" data-testid="import-handoff-export-checked" onClick={()=>exportHandoff({kind:'ids',ids:handoffCheckedRef.current})} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>⬇️ Export checked ({handoffChecked.length})</button>
            {libraryCategoryFilter!=='all'&&<button type="button" data-testid="import-handoff-export-category" onClick={()=>exportHandoff({kind:'category',category:libraryCategoryFilter})} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>⬇️ Export {libraryCategoryFilter} ({customAssets.filter(a=>(a.category??'Unsorted')===libraryCategoryFilter).length})</button>}
            <button type="button" data-testid="import-handoff-export-all" onClick={()=>exportHandoff({kind:'all'})} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>⬇️ Export whole library ({customAssetsLoading?'…':customAssets.length})</button>
            <button type="button" data-testid="import-handoff-share" onClick={()=>void shareHandoff()} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>📤 Share checked…</button>
          </div>
          <div style={{display:'flex',gap:6,marginTop:6}}>
            <button type="button" data-testid="import-handoff-check-all" onClick={()=>setHandoffCheckedBoth(customAssetsRef.current.map(a=>a.id))} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Check all</button>
            <button type="button" data-testid="import-handoff-clear" onClick={()=>setHandoffCheckedBoth([])} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Clear</button>
          </div>
          <label style={{display:'block',fontSize:12,opacity:.85,marginTop:8}}>Handoff summary — what is in the checked models (copy it into your chat)</label>
          <textarea ref={handoffSummaryRef} data-testid="import-handoff-summary" readOnly value={handoffChecked.length===0?'Tick a model in the library to see its handoff summary here.':handoffSummaryFor({kind:'ids',ids:handoffChecked})} rows={8} style={{display:'block',width:'100%',marginTop:4,padding:8,borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:11,lineHeight:1.5,boxSizing:'border-box',resize:'vertical'}} />
          <button type="button" data-testid="import-handoff-copy" onClick={()=>void copyHandoffSummary()} style={{display:'block',width:'100%',marginTop:6,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>📋 Copy summary</button>
        </div>
        <div data-testid="import-hub-limits" style={{fontSize:12,marginTop:12,lineHeight:1.5,borderTop:'1px solid #c4d1bd',paddingTop:10}}>
          <div style={{fontWeight:700}}>What the hub cannot do (honest limits)</div>
          <div style={{marginTop:4}}>• <b>Folders:</b> on iPhone Safari a folder cannot be opened directly — pick files above instead (several at once). The folder button works on a desktop browser where the browser supports it.</div>
          <div style={{marginTop:4}}>• <b>Audio:</b> not imported — there is no audio playback in the game yet, so an audio file would have nowhere to play.</div>
          <div style={{marginTop:4}}>• <b>Textures:</b> not rendered as textures — this renderer draws plain coloured triangles only, so a texture on a model is ignored and the model shows its colours flat.</div>
          <div style={{marginTop:4}}>• <b>Packs:</b> an export backs up your models, not where you placed them — placements live in the world save, and re-importing a pack creates new copies of the models (a name that already exists will ask first).</div>
          <div style={{marginTop:4}}>• <b>AI access:</b> ChatGPT cannot reach files on your phone or computer — uploading here through the file picker is how a model gets into the game.</div>
          <div style={{marginTop:4}}>• <b>AI handoff:</b> ChatGPT and Muse cannot see the files in your browser on their own — download the handoff ZIP and upload it in your chat with them, and paste the summary. The game itself does not run an AI.</div>
        </div>
      </div>}
      <div style={{fontSize:12,opacity:.85,marginTop:4,lineHeight:1.4}}>Pick an item from the catalog — it stays selected and follows your cursor as a green (valid) or red (invalid) preview until you place it, and stays selected after placing so you can place another copy right away; ESC or right-click cancels. Tap Move first and the asset still attaches to your cursor; after cancelling you are back to dragging items. Houses, stalls, the windmill, and the mine rotate: R = 90° clockwise, Shift+R = 90° counter-clockwise, or the rotation buttons — rotate a house so its door faces the road or path. New in this build: Farm Land (Nature) is tilled soil you place tile by tile — it grows green shoots after an in-game hour and golden wheat after three in-game hours, and regrows on its own after harvest; stand next to ready wheat and press E to harvest 2 wheat (the Wheat counter is next to Wood, Stone, and Gold), and farmer villagers walk to ready wheat and harvest it too. Lanterns (Decorations) glow at night like the house lights; Bushes (Nature) are walk-through decor, like grass; the Mine (Buildings) is a stone structure you can enter, like a house; Ore Deposits (Infrastructure) are placeable rock nodes — there is no mining system yet, so they are decoration for now; the Wooden Bridge (Roads) goes over the ocean or the pond and you can walk across it. Tap Remove, then an item, path, house, tree, rock, water, lantern, bush, ore deposit, bridge, or farm land to take it down — taps snap to the nearest removable tile, and dragging in Remove mode clears a whole section at once (one Undo tap restores the whole drag). Tap Move, then drag an item you placed to a new spot — one Undo tap moves it back. Minimize (—) keeps your tool; close (×) clears it. While minimized, Walk pauses your tool so taps move you, Undo steps back through your changes one tap at a time, and Redo steps forward again — a new change clears Redo. Undo (CTRL+Z) and Redo (CTRL+Y, or CTRL+Shift+Z) work from the keyboard too, for every change — placement, deletion, movement, rotation, and area actions — with no limit on how far back you can go; deleting an upload is undoable as well (one Undo brings its placed copies back). Save area lets you drag a rectangle, name it, and keep it as a chunk; tap a saved chunk, then tap the ground to stamp it elsewhere, and one Undo removes the whole paste. The Import Hub (button at the top of this panel) is where you bring in your own models — .glb, .gltf (with its .bin file if it has one), .obj, or a ZIP of models. They render as plain coloured triangles (textures and animation are ignored), you pick one in the Custom category to place it like any other item, and one Undo removes it. Audio is not imported yet — there is no audio playback in the game — and on iPhone Safari folders cannot be opened directly, so pick files (several at once) instead. AREA SELECT has Layout helpers now (in the yellow area menu): Doors face paths turns each selected house so its door faces the nearest road or path, Trees off paths moves trees standing on a path to the nearest clear tile beside it, Lanterns along roads puts lanterns on the road's edge every few tiles, Fence property puts a low wooden fence around each selected house with a gap at the door, Align row / Align column line the selected items up, ENHANCE fills empty ground with grass, bushes, and the odd tree without moving or removing anything, and Spread out / Pack together move the selected items one tile apart or together — each helper is optional (nothing happens until you tap it) and one Undo undoes the whole thing. Fence is also in the Build menu under Decorations, like the wall. Honest note: scale, elevation, tree rotation, and vegetation size cannot change yet — there is no per-item size feature — so those are not in the helpers. New in this build: the Import Hub shows a real preview of each model before it joins the library, with its size, height, source file, and format — tap Add to Asset Library to keep it or Cancel to discard it — and the library can be searched by name, tag, or file, and sorted by name, format, category, or size, with each asset's name, category, and tags editable. New in this build: ZIP imports are checked for unsafe paths and ZIP-bomb expansion, a bad entry is skipped with a reason instead of stopping the whole import, and the hub reports exactly which models landed, which were skipped and why; a .gltf finds its .bin in a subfolder and a missing texture is reported, never claimed as applied; the whole library can be exported as a ZIP backup with a manifest; and a name that already exists asks first (Keep both / Replace / Skip) instead of overwriting silently. New in this build: the Import Hub can hand models to ChatGPT or Muse — tick models in the library (or a whole category, or the whole library), export a ZIP with the models, the manifest, and a copyable summary, or share it when the device supports sharing files from the browser. ChatGPT and Muse cannot see your browser's files on their own — you upload the ZIP in your chat — and the game itself does not run an AI. New in this build: the town's roofs vary now — some run north-south instead of east-west, some are shallow and some are steep, and some have a flat top with a raised edge instead of a pitched ridge; which roof a house has is fixed by the house, so the same house always has the same roof, and a house you place keeps its roof when you move it, rotate it, or undo and redo. Some town houses have a fenced garden beside them — a low wooden fence around a planted patch, with a gap at the gate so you can walk in — and the fences never block a door or a path. Step inside a house and there is a ceiling over you now instead of open sky, with walls and a doorway, and the hearth in every house glows warm at night when the house lights are on; the ceiling and walls only show in first-person view inside (zoom right in) — from the normal high view the room still shows open so you can see the furniture — and the gardens only grow beside town houses the game built, not beside houses you place (use Fence property in the area menu for those).</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:10}}>
        {(['all','buildings','houses','shops','decorations','roads','nature','infrastructure','custom'] as const).map(cat=><button key={cat} type="button" data-testid={'build-catalog-category-'+cat} onClick={()=>setCatalogCategory(cat)} style={{padding:'8px 10px',borderRadius:9,border:'1px solid #c4d1bd',background:catalogCategory===cat?'#526d42':'#22392d',color:'#fff',fontWeight:catalogCategory===cat?700:500,fontSize:13}}>{{all:'All',buildings:'Buildings',houses:'Houses',shops:'Shops',decorations:'Decorations',roads:'Roads',nature:'Nature',infrastructure:'Infrastructure',custom:'Custom'}[cat]}</button>)}
      </div>
      <div data-testid="build-catalog-list" style={{maxHeight:280,overflowY:'auto',marginTop:10,paddingRight:2}}>
        {CATALOG_SECTIONS.filter(sec=>catalogCategory==='all'||catalogCategory===sec.id).map(sec=><div key={sec.id}>
          <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:8}}>{sec.label}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:6}}>
            {sec.kinds.map(kind=><button key={kind} type="button" data-testid={'build-palette-'+kind} onClick={()=>{const next=palette===kind?null:kind;setPalette(next);setCustomSelection(null);setRemoveMode(false);setSaveAreaMode(false);setPasteName(null);setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);buildRef.current={palette:next,removeMode:false,moveMode:buildRef.current.moveMode,saveAreaMode:false,pasteName:null,customAssetId:null,areaSelectMode:false,areaMoveArmed:false,areaDuplicateArmed:false};if(!next){const el=placePreviewRef.current;if(el)el.style.display='none';placeHoverRef.current=null;}}} style={{padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:palette===kind?'#526d42':'#22392d',color:'#fff',fontWeight:palette===kind?700:500,fontSize:14}}>
              <span style={{display:'block',height:26,borderRadius:6,background:KIND_META[kind].swatch,marginBottom:6,border:'1px solid rgba(255,255,255,.25)'}}></span>
              {KIND_META[kind].label}
            </button>)}
          </div>
        </div>)}
        {/* BUILD 997: Custom category — uploaded .glb models as
            catalog tiles (swatch = the model's mean colour), plus the
            upload picker. Selecting an upload arms it like any
            palette kind; tapping the ground places it with its mesh
            footprint. Deleting an upload removes its placed copies
            at once and is not undoable. */}
        {(catalogCategory==='all'||catalogCategory==='custom')&&<div>
          <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:8}}>Custom</div>
          {customAssetsLoading
            ? <div data-testid="build-custom-loading" style={{fontSize:12,opacity:.7,marginTop:6}}>Loading your models…</div>
            : customAssets.length===0
            ? <div style={{fontSize:12,opacity:.7,marginTop:6}}>No custom uploads yet — open the Import Hub above to bring in a model.</div>
            : <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:6}}>
                {customAssets.map(a=><div key={a.id} style={{display:'flex',flexDirection:'column',gap:6}}>
                  <button type="button" data-testid="build-custom-asset" onClick={()=>armCustomAsset(customSelection===a.id?null:a.id)} style={{padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:customSelection===a.id?'#526d42':'#22392d',color:'#fff',fontWeight:customSelection===a.id?700:500,fontSize:14}}>
                    <span style={{display:'block',height:26,borderRadius:6,background:'rgb('+Math.round(a.avgColor[0]*255)+','+Math.round(a.avgColor[1]*255)+','+Math.round(a.avgColor[2]*255)+')',marginBottom:6,border:'1px solid rgba(255,255,255,.25)'}}></span>
                    {a.name}
                  </button>
                  <button type="button" data-testid="build-custom-delete" aria-label={'Delete '+a.name} onClick={()=>deleteCustomAsset(a)} style={{padding:'8px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#7a3b2e',color:'#fff',fontWeight:700,fontSize:12}}>Delete</button>
                </div>)}
              </div>}
          {/* BUILD 1043: uploads moved to the Import Hub (top of this
              panel) — this section only lists what is already imported
              and arms it for placement. */}
          <div style={{marginTop:8}}>
            <button type="button" data-testid="build-custom-open-hub" onClick={()=>setImportHubOpen(true)} style={{display:'block',width:'100%',padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>📦 Open the Import Hub to upload models</button>
            <div style={{fontSize:11,opacity:.7,marginTop:4,lineHeight:1.4}}>Models render as plain coloured triangles — textures and animation are ignored. 1 unit = 1 tile; footprint max 8×8. PNGs cannot be placed: the 3D renderer draws geometry, not pictures. No scale control yet — a model places at its authored size, and there is no way to make it bigger or smaller.</div>
          </div>
        </div>}
      </div>
      {/* BUILD 1036: rotation controls — shown while a house or stall
          is armed (the only kinds rotation changes: houses rotate
          their door face, stalls rotate their 2x1 run; 1x1 kinds are
          unaffected, so no controls are shown for them — no fake
          controls). BUILD 1048: also shown while a custom upload is
          armed — the model itself turns (its footprint swaps w/h on
          odd turns), so R and the buttons rotate it like a house.
          R rotates 90° clockwise, Shift+R 90° counter-clockwise;
          the buttons do the same for touch. The rotation persists
          across placements and asset switches. */}
      {((palette&&(isHouseKind(palette)||palette==='stall'))||customSelection)&&<div style={{marginTop:10,padding:10,borderRadius:9,background:'#22392d',border:'1px solid #c4d1bd'}}>
        <div style={{fontSize:12,fontWeight:700}}>Rotation: {placementRot*90}° · {customSelection?'model rotated '+(placementRot*90)+'°':(palette&&isHouseKind(palette))?'door faces '+rotateFace('south',placementRot):'runs '+(placementRot%2===1?'south':'east')}</div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button type="button" data-testid="build-rotate-ccw" onClick={()=>{const next=(((placementRot+3)%4) as Rotation);setPlacementRotBoth(next);const h=placeHoverRef.current;if(h)placePreviewFnRef.current?.(h.x,h.y);}} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:14}}>⟲ 90°</button>
          <button type="button" data-testid="build-rotate-cw" onClick={()=>{const next=(((placementRot+1)%4) as Rotation);setPlacementRotBoth(next);const h=placeHoverRef.current;if(h)placePreviewFnRef.current?.(h.x,h.y);}} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:14}}>90° ⟳</button>
        </div>
        <div style={{fontSize:11,opacity:.75,marginTop:6,lineHeight:1.4}}>R = rotate 90° clockwise, Shift+R = 90° counter-clockwise. Rotate a house so its door faces the road or path, or a model so it faces the way you want. 90° steps only — the world is built from tile rectangles, so 45°/15°/free rotation cannot exist for houses or models.</div>
      </div>}
      <button type="button" data-testid="build-remove-toggle" onClick={toggleRemove} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:removeMode?'#7a3b2e':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Remove: {removeMode?'On':'Off'}</button>
      <button type="button" data-testid="build-move-toggle" onClick={()=>{const next=!moveMode;setMoveMode(next);if(next){setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);}buildRef.current={...buildRef.current,moveMode:next,areaSelectMode:next?false:buildRef.current.areaSelectMode,areaMoveArmed:next?false:buildRef.current.areaMoveArmed,areaDuplicateArmed:next?false:buildRef.current.areaDuplicateArmed};}} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:moveMode?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Move: {moveMode?'On':'Off'}</button>
      {/* BUILD 996: saved chunks (build templates). Save area arms the
          rectangle drag; the naming row appears after a selection
          finalizes (panel reopens if minimized, so the row is
          visible). Tapping a saved chunk arms paste mode — tap the
          ground to stamp it with its corner on the tapped tile;
          tapping the chunk again disarms. Deleting is immediate and
          is not an undo entry (templates are library state, not
          world changes). */}
      <div style={{marginTop:14,paddingTop:10,borderTop:'1px solid #8c9b8d'}}>
        <div style={{fontSize:13,fontWeight:700}}>Saved chunks</div>
        <div style={{fontSize:11,opacity:.75,marginTop:4,lineHeight:1.4}}>Turn Save area on, then drag a rectangle on the ground — or tap one tile — to select it. Name it and save it as a chunk. Tap a saved chunk, then tap the ground to stamp it there (its corner lands on the tapped tile); items that cannot fit are skipped and reported, never blocking the rest. One Undo removes a whole paste. Chunks save only what you placed — generated houses, paths, and trees are not captured. Custom uploads are captured too, with the model they came from — pasting one needs that model still in your library, or that item is skipped and reported.</div>
        <button type="button" data-testid="build-save-area-toggle" onClick={()=>{const next=!saveAreaMode;setSaveAreaMode(next);if(next){setPalette(null);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setPasteName(null);setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);}setSaveSelection(null);buildRef.current={palette:next?null:palette,removeMode:next?false:removeMode,moveMode:next?false:moveMode,saveAreaMode:next,pasteName:next?null:pasteName,customAssetId:next?null:buildRef.current.customAssetId,areaSelectMode:next?false:areaSelectMode,areaMoveArmed:next?false:areaMoveArmed,areaDuplicateArmed:next?false:areaDuplicateArmed};}} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:saveAreaMode?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Save area: {saveAreaMode?'On':'Off'}</button>
        {/* BUILD 1037: AREA SELECT — drag a yellow rectangle on the
            ground to select everything inside it (houses, trees,
            paths, rocks, walls, decorations — placed and generated),
            then Move, Rotate, Delete, or Duplicate the whole group
            from the actions menu below. A drag that starts inside a
            live selection moves it; a tap inside it toggles one
            object in or out. */}
        <div style={{fontSize:11,opacity:.75,marginTop:10,lineHeight:1.4}}>Area select: turn it on, then drag a yellow rectangle on the ground to select everything inside it — houses, trees, roads, decorations, whole town sections. Then Move, Rotate, Delete, or Duplicate the group below. Drag inside the yellow area to move it; tap an object inside it to toggle that one object in or out.</div>
        <button type="button" data-testid="build-area-select-toggle" onClick={toggleAreaSelect} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'3px solid #ffd94d',background:areaSelectMode?'#8a6d1f':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Area select: {areaSelectMode?'On':'Off'}</button>
        {saveSelection&&<div style={{marginTop:10,padding:10,borderRadius:9,background:'#22392d',border:'1px solid #c4d1bd'}}>
          <div style={{fontSize:12}}>Area {(saveSelection.x1-saveSelection.x0+1)}×{(saveSelection.y1-saveSelection.y0+1)} · {saveSelection.count} placed item{saveSelection.count===1?'':'s'}</div>
          <input type="text" data-testid="build-chunk-name-input" value={chunkName} onChange={e=>setChunkName(e.target.value)} placeholder={'Chunk '+(templates.length+1)} style={{display:'block',width:'100%',marginTop:8,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:14,boxSizing:'border-box'}} />
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button type="button" data-testid="build-chunk-save" onClick={()=>{const world=stateRef.current.world;const items=captureChunk(world,saveSelection);if(items.length===0){setMessage('Nothing placed in this area anymore');setSaveSelection(null);return;}const name=uniquifyName(templates.map(t=>t.name),chunkName);setTemplates(prev=>[...prev,{name,items}]);setSaveSelection(null);setChunkName('');setSaveAreaMode(false);buildRef.current={...buildRef.current,saveAreaMode:false};setMessage('Saved chunk \''+name+'\' ('+items.length+' item'+(items.length===1?'':'s')+')');}} style={{flex:1,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:14}}>Save chunk</button>
            <button type="button" data-testid="build-chunk-cancel" onClick={()=>{setSaveSelection(null);setChunkName('');}} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Cancel</button>
          </div>
        </div>}
        {/* BUILD 1037: AREA SELECT actions menu — appears when a
            selection is live. MOVE arms a drag (or drag inside the
            yellow area directly); ROTATE turns the whole group 90°
            around the selection centre (houses keep their door face
            rotating with them); DELETE removes exactly the selected
            items (two taps when there are more than 10); DUPLICATE
            arms a tap-to-place copy (the selection moves to the copy).
            Every action is ONE Undo step. The item list below is the
            per-object control — × drops one object from the group
            without touching the world. */}
        {areaSelection&&<div data-testid="build-area-menu" style={{marginTop:10,padding:10,borderRadius:9,background:'#22392d',border:'3px solid #ffd94d'}}>
          <div style={{fontSize:12,fontWeight:700}}>Area {(areaSelection.rect.x1-areaSelection.rect.x0+1)}×{(areaSelection.rect.y1-areaSelection.rect.y0+1)} · {selectionCount(areaSelection)} item{selectionCount(areaSelection)===1?'':'s'}</div>
          <div style={{fontSize:11,opacity:.75,marginTop:2}}>{(()=>{const c=selectionCounts(areaSelection);return [c.houses>0?'Houses '+c.houses:null,c.trees>0?'Trees '+c.trees:null,c.paths>0?'Paths '+c.paths:null,c.rocks>0?'Rocks '+c.rocks:null,c.walls>0?'Walls '+c.walls:null,c.placed>0?'Other placed '+c.placed:null].filter(Boolean).join(' · ');})()}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
            <button type="button" data-testid="build-area-move" onClick={()=>{if(!areaSelection)return;setAreaMoveArmedBoth(!areaMoveArmed);setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);setMessage(areaMoveArmed?'Move cancelled':'Drag the yellow area to a new location — everything moves together, keeping its layout');}} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:areaMoveArmed?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Move</button>
            <button type="button" data-testid="build-area-duplicate" onClick={()=>{if(!areaSelection)return;setAreaDuplicateArmedBoth(!areaDuplicateArmed);setAreaMoveArmedBoth(false);setAreaDeleteArmed(false);setMessage(areaDuplicateArmed?'Duplicate cancelled':'Tap the ground to place a copy of the area — its corner lands on the tapped tile');}} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:areaDuplicateArmed?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Duplicate</button>
            <button type="button" data-testid="build-area-rotate-ccw" onClick={()=>doAreaRotate(-1)} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>⟲ Rotate left</button>
            <button type="button" data-testid="build-area-rotate-cw" onClick={()=>doAreaRotate(1)} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Rotate right ⟳</button>
          </div>
          <button type="button" data-testid="build-area-delete" onClick={()=>{if(!areaSelection)return;const n=selectionCount(areaSelection);if(n>10&&!areaDeleteArmed){setAreaDeleteArmed(true);setMessage('Delete '+n+' items? Tap Delete again to confirm — Undo restores them');return;}doAreaDelete();}} style={{display:'block',width:'100%',marginTop:8,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:areaDeleteArmed?'#7a3b2e':'#5a2e24',color:'#fff',fontWeight:700,fontSize:14}}>{areaDeleteArmed?'Tap again to confirm delete':'Delete area'}</button>
          {/* BUILD 1042: Town Builder Stage 5 — LAYOUT HELPERS. Optional
            tools, nothing moves unless you tap one: each button runs
            its helper on this selection only, as one Undo step. Doors
            face paths turns each selected house (in place) so its door
            faces the nearest road or path. Trees off paths moves trees
            standing on a path to the nearest clear tile beside it.
            Lanterns along roads puts a lantern on the road's edge
            every few tiles. Fence property puts a low wooden fence
            around each selected house, with a gap at the door. Align
            row / Align column line the selected items up. ENHANCE
            fills empty ground with grass, bushes, and the odd tree —
            it never moves or removes anything. Spread out / Pack
            together move the selected items one tile apart / together.
            Scale, elevation, tree rotation, and vegetation size are
            NOT here — there is no per-item size feature yet, so those
            stay pending and are not faked. */}
          <div style={{marginTop:10,borderTop:'1px solid #c4d1bd',paddingTop:10}}>
            <div style={{fontSize:12,fontWeight:700}}>Layout helpers — optional tools, nothing moves unless you tap one</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
              <button type="button" data-testid="build-layout-doors" onClick={()=>runLayoutHelper(doorsFacePaths,'Doors already face the nearest path')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Doors face paths</button>
              <button type="button" data-testid="build-layout-trees" onClick={()=>runLayoutHelper(treesOffPaths,'No trees standing on paths here')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Trees off paths</button>
              <button type="button" data-testid="build-layout-lanterns" onClick={()=>runLayoutHelper(lanternsAlongRoads,'No lanterns fit along these roads')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Lanterns along roads</button>
              <button type="button" data-testid="build-layout-fence" onClick={()=>runLayoutHelper(fencesAroundProperty,'No fence fits around these houses')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Fence property</button>
              <button type="button" data-testid="build-layout-align-row" onClick={()=>runLayoutHelper((w,s,pt,nt)=>alignArea(w,s,'row',pt,nt),'Already aligned to a row')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Align row</button>
              <button type="button" data-testid="build-layout-align-col" onClick={()=>runLayoutHelper((w,s,pt,nt)=>alignArea(w,s,'col',pt,nt),'Already aligned to a column')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Align column</button>
              <button type="button" data-testid="build-layout-enhance" onClick={()=>runLayoutHelper(enhanceArea,'Nothing to enhance here — the ground is already full')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>ENHANCE</button>
              <button type="button" data-testid="build-layout-spread" onClick={()=>runLayoutHelper((w,s,pt,nt)=>adjustSpacing(w,s,'spread',pt,nt),'Nothing moved')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Spread out</button>
              <button type="button" data-testid="build-layout-pack" onClick={()=>runLayoutHelper((w,s,pt,nt)=>adjustSpacing(w,s,'pack',pt,nt),'Nothing moved')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Pack together</button>
            </div>
            <div style={{fontSize:11,opacity:.75,marginTop:6,lineHeight:1.4}}>Each helper acts only on this selection, and one Undo undoes the whole thing. Scale, elevation, tree rotation, and vegetation size cannot change yet — there is no per-item size feature — so those are not here.</div>
          </div>
          {areaSelection.notes.length>0&&<div style={{fontSize:11,opacity:.75,marginTop:6,lineHeight:1.4}}>{areaSelection.notes.join(' · ')}</div>}
          <div style={{marginTop:10}}>
            <div style={{fontSize:11,opacity:.75}}>Items in this area — tap × to drop one from the group (the world is untouched):</div>
            {selectionItems(areaSelection).map((it,i)=>{
              const label=selectionItemLabel(it);
              const key=label+'|'+i;
              return <div key={key} style={{display:'flex',alignItems:'center',gap:8,marginTop:4,fontSize:12}}>
                <span style={{flex:1}}>{label}</span>
                <button type="button" data-testid="build-area-item-remove" aria-label={'Remove '+label+' from selection'} onClick={()=>{if(!areaSelection)return;const next=excludeItem(areaSelection,it);const after=selectionCount(next);if(after===0){clearAreaSelection();setMessage('Selection cleared — nothing left in it');}else{setAreaSelection(next);setAreaDeleteArmed(false);const lab=areaSelectPreviewLabelRef.current;if(lab)lab.textContent='Area '+(next.rect.x1-next.rect.x0+1)+'×'+(next.rect.y1-next.rect.y0+1)+' · '+after+' item'+(after===1?'':'s');setMessage('Removed '+label+' from the area ('+after+' items)');}}} style={{padding:'4px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>×</button>
              </div>;
            })}
          </div>
          <button type="button" data-testid="build-area-clear" onClick={()=>{clearAreaSelection();setMessage('Area selection cleared');}} style={{display:'block',width:'100%',marginTop:10,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Clear selection</button>
        </div>}
        {templates.length===0
          ? <div style={{fontSize:12,opacity:.7,marginTop:10}}>No saved chunks yet.</div>
          : <div style={{marginTop:10}}>{templates.map(t=><div key={t.name} style={{display:'flex',gap:8,marginTop:6}}>
              <button type="button" data-testid="build-chunk-paste" onClick={()=>{const next=pasteName===t.name?null:t.name;setPasteName(next);if(next){setPalette(null);setCustomSelection(null);setRemoveMode(false);setSaveAreaMode(false);setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);}buildRef.current={palette:next?null:palette,removeMode:next?false:removeMode,moveMode:buildRef.current.moveMode,saveAreaMode:next?false:saveAreaMode,pasteName:next,customAssetId:next?null:buildRef.current.customAssetId,areaSelectMode:next?false:areaSelectMode,areaMoveArmed:next?false:areaMoveArmed,areaDuplicateArmed:next?false:areaDuplicateArmed};if(!next){const el=placePreviewRef.current;if(el)el.style.display='none';placeHoverRef.current=null;}setMessage(next?'Tap the ground to paste \''+t.name+'\' — its corner lands on the tapped tile. Tap the chunk again to stop.':'Stopped pasting');}} style={{flex:1,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:pasteName===t.name?'#526d42':'#22392d',color:'#fff',fontWeight:pasteName===t.name?700:500,fontSize:13,textAlign:'left'}}>{t.name} <span style={{opacity:.75}}>({t.items.length} item{t.items.length===1?'':'s'})</span></button>
              <button type="button" data-testid="build-chunk-delete" aria-label={'Delete '+t.name} onClick={()=>{setTemplates(prev=>prev.filter(x=>x.name!==t.name));if(pasteName===t.name){setPasteName(null);buildRef.current={...buildRef.current,pasteName:null};}setMessage('Deleted chunk \''+t.name+'\'');}} style={{padding:'10px 12px',borderRadius:9,border:'1px solid #c4d1bd',background:'#7a3b2e',color:'#fff',fontWeight:700,fontSize:13}}>×</button>
            </div>)}</div>}
      </div>
      <div data-testid="build-count" style={{fontSize:12,opacity:.85,marginTop:10}}>Placed: {placedCount}</div>
      <div style={{fontSize:11,opacity:.7,marginTop:6,lineHeight:1.4}}>Houses have interiors now — stand by a door and tap Enter to step inside; Exit returns you to the doorstep. While inside, Build placement and removal are paused (taps move only). Placed items show in 3D mode; the 2.5D view does not show them yet.</div>
    </div>}
  </div>;
}
