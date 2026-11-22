import { useEffect, useRef, useState } from 'react';
import { hutAt, inBounds, isWalkableWorld, loadWorld, terrainAt, terrainKey, type HutRect, type IsoWorld, type PlacedItem } from '../iso/isoWorld';
import { mosslightEngineChunkLayout } from '../mosslightLayout';
import { emitVillager, villagerSpecFor, PLAYER_SPEC, PHASE_PER_UNIT, type VillagerSpec } from './villagers';
import { advanceRenderPos, needsRenderSnap, turnYawToward, easePhaseToNeutral, phaseForDistance, figureSlotLayout, poseKeyEquals, FIGURE_TURN_RATE, type FigurePoseKey } from './npcMotion';
import {
  houseDesignFor, houseDesignForVariant, streetSlabsFor, cobbleSquaresFor,
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
import { nightFactor3dForMinutes, skyGradientForMinutes, starAlphaForMinutes, STAR_COUNT, FIGURE_NIGHT_CAP, rainForMinutes, emitRainStreaks, RAIN_STREAKS, RAIN_VERTS_PER_STREAK } from './atmosphere';
import { emitHouseFx, houseFxInputsFor, resolveHouseFx, smokePuffsFor, chimneyTopFor, windowSlotsFor, houseLitAt, lightScheduleFor, FX_MAX_VERTS, type InteriorFxInput } from './houseFx';
import { WINDMILL_TOWER_H, WINDMILL_CAP_H } from './windmill';
import { LANTERN_POST_H, LANTERN_POST_W, LANTERN_BOX, LANTERN_CAP, LANTERN_TIMBER, LANTERN_GLASS_DARK, lanternBoxCentre } from './lantern';
import { absMinutes, farmStageAt, readyFarmTiles, FARM_HARVEST_WHEAT, FARM_SOIL, FARM_FURROW, FARM_VILLAGER_RADIUS, type FarmStage } from './farm';
import { campGrainInRegistry } from './food';
import { GRANARY_CAPACITY_FLOUR, granaryFlourInRegistry, granaryMeatInRegistry, granaryFishInRegistry } from './granary';
import { MILL_CENTRE, MILL_RECT, MILL_DOOR, MILL_APPROACH, BAKERY_CENTRE, BAKERY_RECT, BAKERY_DOOR, BAKERY_APPROACH, freshFoodChain, reconcileFoodChain, millPlacementExists, bakeryPlacementExists, placedWindmillRects, type FoodChainState } from './foodChain';
import { SMELTER_CENTRE, SMELTER_RECT, SMELTER_DOOR, SMELTER_APPROACH, BLACKSMITH_CENTRE, BLACKSMITH_RECT, BLACKSMITH_DOOR, BLACKSMITH_APPROACH, SAWMILL_CENTRE, SAWMILL_RECT, SAWMILL_DOOR, SAWMILL_APPROACH, CARPENTER_CENTRE, CARPENTER_RECT, CARPENTER_DOOR, CARPENTER_APPROACH, WORKSHOP_CENTRE, WORKSHOP_RECT, WORKSHOP_DOOR, WORKSHOP_APPROACH, freshMetalChain, reconcileMetalChain, smelterPlacementExists, blacksmithPlacementExists, sawmillPlacementExists, carpenterPlacementExists, workshopPlacementExists, workshopStallReason, metalChainCoalInRegistry, metalChainIngotsInRegistry, metalChainToolsInRegistry, metalChainTimberInRegistry, metalChainFurnitureInRegistry, type MetalChainState } from './metalChain';
import { INN_APPROACH, INN_CENTRE, INN_RECT, INN_DOOR, INN_SITE_ID, MARKET_STALL_TILE, freshHousing, reconcileHousing, seedInnStore, innFoodInRegistry, innPlacementExists, marketStallListing, nightSleepers, type HousingState } from './housing';
import { sitePlanFromSave, type SettlementPlan } from './sitePlan';
import { createFoundingSim, existingRectsForFounding, type FoundingState } from './founding';
import {
  doorsFacePaths, treesOffPaths, lanternsAlongRoads, fencesAroundProperty,
  alignArea, enhanceArea, adjustSpacing,
} from './layoutHelpers';
import {
  placedHutRects, placedTreeTiles, placedStallRects, placedRockTiles, placedWallTiles,
  placedLanternTiles, placedBushTiles, placedOreTiles, placedBridgeTiles, placedFarmTiles, placedFarmKeyInts, placedFenceTiles,
  validatePlacement, movePlacement, moveGeneratedHut, moveGeneratedPath, moveGeneratedTree,
  seedRectForHut, removeAt, removeAlongStroke, findRemovableNear, addPlacement, walkableWithPlacements,
  createBuildHistory, isHouseKind, rotateFace, placementRectFor, tileKeyInt,
  type PaletteKind, type UndoEntry, type BuildHistory, type Rotation,
} from './placements';
import { gardenFencesFor, gardenPlantsFor } from './gardens';
import { marketStallSpots, stampLandmarks, type LandmarkKind } from './settlements';
import { emitNaturalGrass, emitPlacedGrass, blockedTiles } from './grassTufts';
import { emitGroundDetail3d } from './groundDetail3d';
import { treeShapeForTile, TREE_SHAPES, generatedBushAt, bushParamsForTile, crateKindsForProps, propKindToCrateKind, type CratePropKind } from './vegetation';
import { wildTerrainAt, wildTreeAt, wildObstacleAt, isWildWalkable, cellIsMixed, effTerrainFor, surfaceElevation, renderTerrain, rayHitSurface } from './wildTerrain';
import { stampTownBuildings, stampExtraRocks } from './townAdditions3d';
import { loadTemplates, saveTemplates, captureChunk, pasteChunk, uniquifyName, type ChunkTemplate } from './templates';
import {
  selectArea, selectionCount, selectionCounts,
  moveArea, duplicateArea,
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
  findNameCollisions, canPreviewAsset,
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

import { sameHut, interiorBoxes, interiorFloorColor, interiorCeilingFor, interiorWallBandFor, interiorHearthFor, rescuePosition, INTERIOR_FLOOR_Y } from './interiors';
import { ROSTER_3D, buildStaticAnchors, buildAnchors, npcWalkable, quantizeTile, rosterArchetype, loadClock, saveClock } from './townsfolk3d';
import { formatDayClock, waitOptionsFor, waitInterrupted, waitRemainingLabel, WAIT_STEP_MINUTES, WAIT_STEP_MS, waitStepsFor } from './worldclock';
// BUILD 1057: founder settlers — the first NPCs of the empty world
// (needs-driven, chopping wood to a visible camp stockpile).
import { FOUNDERS_ENABLED, FOUNDER_CAMP, FOUNDER_CAMP_CENTRE, FOUNDER_STOCKPILE_TILE, FOUNDER_EAT_TILE, FOUNDER_NAMES, ALL_SETTLER_NAMES, FOUNDER_START_FOOD, FOUNDER_WORK_RADIUS, FOUNDER_CHOP_TICKS, decayFounderNeeds, founderAbsMinutes, defaultFounderState, nearestTreeTile, loadFoundersSave, saveFoundersSave, foundersSaveOf, foundersStateOf, seedCampStore, seedCarrierStore, eatFounderMealFromRegistry, fellTreeToCarrier, harvestFarmTileToCarrier, FOUNDER_HARVEST_TICKS, campWoodInRegistry, campFoodInRegistry, campStoneInRegistry, spawnResident, type FounderState, type FounderPathState } from './founders';
import { freshPen, validatePenState, PEN_RECT, HUNTABLE_KINDS, simPreyFor, nearestBankTile, type PenState } from './animalHusbandry';
import { chooseScoredActivity, founderDistToSite } from './utility';
import { professionLabel } from './professions';
import { closestFounder, recordSharedEvent, restTileFor } from './memory';
import type { SharedEventType } from './memory';
// BUILD 1062: the living-world coordinator (F-0) — the adapter that
// reads real 3D state (founders, trees, clock) and writes back real
// trees + a persisted camp ledger. The view owns the ref; the 1s
// clock timer and the wait step call the sync on the day boundary.
import { CAMP_SETTLEMENT_ID, advanceLivingWorldDay, forestDensity, freshLivingWorldState, growthFactorAt, livingWorldSummary, loadLivingWorldState, rainfallAt, saveLivingWorldState, soilAt, soilFactorAt, temperatureAt, type LivingWorld3DState } from './livingWorld';
import { recordAnimalKill, populationFor, populationParamsFor3D, ANIMAL_KINDS_3D } from './ecosystems';
import { animalActivityFactor, seasonForDay, seasonGrowthFactor, seasonLabel } from './climate';
// BUILD 1068 (0x08): World Simulation Control Center — the panel data +
// sim-speed model (pure) and the panel component. The view owns the refs;
// the module formats them, the panel renders them.
import { getSimSpeed, founderStepsForSpeed, clockMinutesPerSecond, formatControlCenterData, animalWorkersFor } from './controlCenter';
import { advanceWorldSimClock, runFounderSimInterval, simulateWorldSimWaitStep, type FounderSimContext, type WaitSimContext } from './worldSimulation3d';
import { createNpcSimState, startNpcSimTimers, type NpcSimContext } from './npcSimulation3d';
import { createPlayerControls, releaseSprintPointer, clearSprintHold, type PlayerControlsContext, type SprintContext } from './playerControls3d';
import { WorldRenderer, type Diagnostics3D } from './worldRenderer3d';
import { createWorldBuilder, type WorldBuilder, type Vec3, type Position } from './worldRender3d';
import { ControlCenterPanel } from './ControlCenterPanel';
// BUILD 1058: NPC construction — the first hut from the stockpile.
import { HUT_CENTRE, HUT_RECT, HUT_DOOR, HUT_APPROACH, HUT_SITES, HUT_KIND, HUT_WOOD_PER_STEP, HUT_TICKS_PER_STEP, canBuild, spendBuildStepFromRegistry, finishConstruction, reconcileConstruction, reconcileExtraSites, hutPlacementExists, hutPlacementId, insideHutRect, hutProgressLabel, freshConstruction, hutSiteById, hutSiteIndexById, nearestUnfinishedSite, hasUnfinishedSite, sitesOf, constructionFromSites, housingCapacity, type ConstructionState } from './construction';
// BUILD 1092 (0x1B, Phase 3.1): the building catalogue as data — the
// Build menu lists it (entries with a palette kind arm that tool;
// the rest are listed, locked, with the reason why).
import { BUILDING_CATALOGUE, CATALOGUE_CATEGORIES, catalogueMenuEntryFor } from './buildingCatalogue';
import { STOREHOUSE_APPROACH, STOREHOUSE_CENTRE, STOREHOUSE_DOOR, STOREHOUSE_RECT, STOREHOUSE_HUT_SITE, STOREHOUSE_KIND, STOREHOUSE_SITE_ID, STOREHOUSE_STORE_ID, STOREHOUSE_CAPACITY_WOOD, STOREHOUSE_CAPACITY_STONE, STOREHOUSE_CAPACITY_ORE, STOREHOUSE_CAPACITY_COAL, STOREHOUSE_CAPACITY_INGOT, STOREHOUSE_CAPACITY_TOOL, STOREHOUSE_CAPACITY_TIMBER, STOREHOUSE_CAPACITY_FURNITURE, STOREHOUSE_WORK_STEPS, freshStorehouse, reconcileStorehouse, seedStorehouseStore, storehouseWoodInRegistry, storehouseStoneInRegistry, storehouseOreInRegistry, storehouseWoolInRegistry, storehouseLeatherInRegistry, storehousePlacementExists, storehousePlacementId, storehouseLabel, type StorehouseState } from './storehouse';
import { freshPathState, pathTiles, reconcileBridges, wellTile, type PathState } from './paths';
import { freshMineState, validateMineState, mineSummaryText, type MineState } from './mines';
// BUILD 1064 (R-1): the unified resource registry — the one
// authoritative record of what exists, where it is, and where it
// came from. The view owns the ref; the E-key gather, the founder
// tick, and the living-world sync all write through it, and the
// HUD/camp line mirror it (never a second count).
import { CAMP_STORE_ID, GRANARY_STORE_ID, PLAYER_STORE_ID, createRegistry, addDeposit, extractDeposit, treeDeposit, depositsFromWorld, mirrorCampStoresToSettlement, setStoreQty, storeQty, totalAvailable, depositsOfKind, syncCampStoreFromSettlement, type ResourceRegistry } from './resourceRegistry';
// BUILD 1075 (0x0D area 5): the player's inventory store — save/load +
// the registry -> React mirror. No crafting system exists in 3D yet.
import { initialInventory, loadPlayerInventoryIntoRegistry, refreshPlayerInventory, type Inventory3D, type InventoryContext } from './inventoryCrafting3d';
import { createBuildingInteractions, type BuildingContext } from './buildingInteractions3d';
import { AssetPreviewCanvas, Minimap3D, WorldMap3D, HudStrip, WaitSheet, WaitProgress, TopLeftButtons, BuildCluster, InteriorCarButtons } from './hudInterface3d';
// BUILD 1078 (0x0D area 8): the world synchronization layer — the
// persist + mark-dirty primitive, the initial world load, and the
// living-world coordinator sync. The Build panel JSX stays in the
// view (its ~40-identifier prop surface is a rewrite, not an extraction).
import { commitWorld, markWorldDirty, loadInitialWorld, syncLivingWorld as syncLivingWorldImpl, type WorldSyncContext, type LivingWorldSyncContext } from './worldSync3d';
import { depositsFromGeology, applyDepletion, mineralDepositEntry, type MineralDeposit } from './geology';
// BUILD 1065 (J-1): the job scheduler — NPCs discover work, claim
// jobs, gather, transport, and complete tasks through the registry.
// The view owns the board ref (session-only — rebuilt from the
// world on load, claims re-established on re-target); the founder
// tick discovers + claims + executes, the wait step feeds the
// scorer from the frozen board, and the E report / probe read it.
import { createJobBoard, discoverJobs, claimJob, claimNearestJob, claimDeliverJobFor, releaseJob, completeJob, failJob, jobForFounder, scorerTreeDist, buildJobClaimedBy, buildJobIdFor, jobSummary, type JobBoard } from './jobs';
// BUILD 1066 (0x06): settlement growth — the arrival loop that closes
// the forest-to-resident chain (a newcomer arrives when a finished hut,
// food, and settlement age allow).
import { arrivalCheck, RESIDENT_ENTRY_TILE } from './settlementGrowth';
import { spawnTransient, barkLineFor, maxVillagerVerts, MAX_TRANSIENTS, type TransientActor } from './transients';
import { spawnAnimal, emitAnimal, emitAnimalBlob, animalSpecFor, maxAnimalVerts, BIRD_FLIGHT_HEIGHT, MAX_BIRDS, MAX_GOATS, MAX_DEER, MAX_WOLVES, MAX_CHICKENS, MAX_RABBITS, MAX_BOARS, MAX_ELK, MAX_FOXES, MAX_BEARS, MAX_FISH, MAX_ANIMALS, PLAZA_3D, type AnimalActor } from './animals';
import { WALK_SPEED, SPRINT_SPEED, STAMINA_MAX, stepStamina, FULL_STAMINA, sprintInput, nextSprintRearm, type StaminaState } from './sprint';
import { resolvePlayerStep, type PerpDir } from './playerStep';
import { planPlayerPath, type PlayerPath } from './playerPath';
import { shouldShowMinimap3d } from './minimap3d';
import { WILDERNESS_ONLY, stripTownContent } from './wilderness';
import { CAR_SPEED, CAR_MAX_VERTS, emitCar, carSpawnTile, carExitTile, isCarNear, type CarState } from './car';
import { classifySwipe, SWIPE_HANDLE_MIN_PX, EDGE_STRIP_PX } from './swipe';

const SAVE_KEY = 'ag-3d-player-v1';
const NPC_SAVE_KEY = 'ag-3d-npcs-v1';
const HEALTH_KEY = 'ag-3d-health-v1';
type NpcActor3D = { name: string; x: number; y: number; waypoint: number; hp: number; alive: boolean; looted?: boolean };
// BUILD 988: one camera FOV for both cameras + the ground picker. Was
// 60 degrees (Math.PI/3) for both; 66 widens the view ~12% linearly
// (tan33/tan30) without fisheye distortion (half-angle 33 < 45). 72 was
// built first and measured a real town FPS regression in SwiftShader
// (wider wedge = more triangles surviving frustum clipping), so the
// step was cut to 66, the largest step that holds FPS at baseline.
// The ground window stays 45x45 — but BUILD 1002 proved by probe that
// it does NOT cover the visible ground: at max zoom-out the top of

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
  // BUILD 1054: clean wilderness — the town + NPC systems are gated
  // off pending the NPC-built-towns rework. stripTownContent keeps
  // trees/rocks/terrain/water and the player's own placements and
  // drops every generated man-made thing. The layout code below is
  // untouched; flip WILDERNESS_ONLY in wilderness.ts to restore it.
  if (WILDERNESS_ONLY) return stripTownContent(source);
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
  // BUILD 1054: villagers are gated off — no NPCs spawn. The saved
  // roster in localStorage (NPC_SAVE_KEY) is left untouched, and the
  // per-tick serializer is gated the same way, so the roster survives
  // for the town rework.
  if (WILDERNESS_ONLY) return [];
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


export default function Engine3DWorldView({ onExit, fpAuto = true, hideUi = false, onDiagnostics }: { onExit?: () => void; fpAuto?: boolean; hideUi?: boolean; onDiagnostics?: (d: Diagnostics3D) => void }) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [message,setMessage]=useState('Connected to the editable world map');
  // BUILD 1055: overworld-map overlay state. The Map button is a
  // control button (always visible, like Build/Exit 3D); the overlay
  // hides the minimap while it is open (the 2D precedent, BUILD 691).
  const [mapOpen,setMapOpen]=useState(false);
  // BUILD 1068 (0x08): Control Center overlay state — same pattern as
  // the Map overlay (a control button, always visible).
  const [controlOpen,setControlOpen]=useState(false);
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
  const [inventory,setInventory]=useState<Inventory3D>(()=>initialInventory());
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
  // BUILD 1053: minimap tap-to-travel bridge — the Minimap3D canvas
  // calls this with a world destination; the implementation is
  // assigned inside the frame-loop effect (moveTarget and the path
  // refs live in that closure).
  const travelRequestRef=useRef<((dest:{x:number;y:number})=>void)|null>(null);
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
  // prevPlayerRef = the player position last frame, for the moving
  // step-stat (maxStepMsMoving); buildFramesRef/buildMsRef = the
  // frames/ms the current build has taken; rebuildStepStatsRef = the
  // probe-visible step statistics (count, worst single step, worst
  // single step WHILE MOVING, total step time, last build's frames
  // and ms — read-only via __ag3dTest getRebuildStats).
  // BUILD 1080 (0x0B): the budget rule changed — it is no longer
  // "moving → 10ms/frame, stationary → run to completion". A chop
  // while standing still ran the whole ~200-400ms rebuild in one
  // frame (the 367-417ms hitch), so now only an URGENT rebuild
  // (enter/exit a hut, flagged by buildingInteractions3d) runs to
  // completion; every other rebuild gets the 10ms step budget,
  // moving or not. maxStepMs is now the hitch signal for a chop:
  // after a chop it must stay small (~10-40ms); the only large
  // single step allowed is an urgent enter/exit.
  const worldBuilderRef=useRef<WorldBuilder|null>(null);
  const prevPlayerRef=useRef<{x:number;y:number}|null>(null);
  const buildFramesRef=useRef(0);
  const buildMsRef=useRef(0);
  const rebuildStepStatsRef=useRef({count:0,maxStepMs:0,maxStepMsMoving:0,totalStepMs:0,lastBuildFrames:0,lastBuildMs:0});
  // BUILD 1074 (0x0D, area 4): the Sprint-button hold lives in
  // playerControls3d.ts now — the view builds the sprint context
  // once (the refs + the latch setter) and calls in.
  const sprintCtx: SprintContext = {
    pointerId: sprintPointerIdRef,
    down: sprintDownRef,
    held: sprintHeldRef,
    latch: sprintLatchRef,
    stamina: staminaRef,
    setLatched: setSprintLatchedUi,
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
  // BUILD 1080 (0x0B): urgent-rebuild flag — set only by enter/exit
  // (buildingInteractions3d), read by the renderer driver. A rebuild
  // flagged urgent runs to completion in one frame (the shell-hide
  // interior must appear immediately); every other rebuild is
  // time-sliced at 10ms/frame, moving or not, so a chop no longer
  // hitches the frame.
  const rebuildUrgent=useRef(false);
  const npcActorsRef=useRef<NpcActor3D[]>([]);
  // BUILD 1057: founder settlers (the NPC-built-towns vision's first
  // residents). A SEPARATE array + save key from npcActorsRef on
  // purpose: the old 47-roster stays preserved untouched in
  // ag-3d-npcs-v1 while the founders live in ag-3d-founders-v1.
  // Stockpile + food are refs (the tick owns them); campUi mirrors
  // them for the HUD. BUILD 1064 (R-1): the refs are READ mirrors
  // only — the registry (below) is the authority, and every write
  // goes through it. The mirrors exist because the founder tick's
  // hot paths read numbers, like inventoryRef mirrors inventory.
  const foundersRef=useRef<FounderState[]>([]);
  const founderStockpileRef=useRef(0);
  const founderFoodRef=useRef(FOUNDER_START_FOOD);
  // BUILD 1067: the camp grain store mirror (the grain the founders
  // harvested, waiting to be milled into meals) — same pattern.
  const founderGrainRef=useRef(0);
  // BUILD 1086: the camp stone store mirror — the same pattern.
  const founderStoneRef=useRef(0);
  // BUILD 1064 (R-1): the unified resource registry — the one
  // authoritative record (player store, camp store, carrier stores,
  // world deposits). Built from the world + the saves on load (the
  // mount effect below); the saves are written back from it. The
  // React states (inventory, campUi) and the plain refs above mirror
  // it via refreshResourceUi — never a second count.
  const registryRef=useRef<ResourceRegistry>(createRegistry());
  // BUILD 1065 (J-1): the job board (session-only — discovery
  // rebuilds it from the world every founder tick; claims live on
  // the board, not in the save, so no save version moves).
  const jobBoardRef=useRef<JobBoard>(createJobBoard());
  // BUILD 1062: the living-world coordinator state (the adapter's
  // persisted state — null until the mount effect loads it, like the
  // founders save). The 1s clock timer and the wait step advance it.
  const livingWorldRef=useRef<LivingWorld3DState|null>(null);
  // BUILD 1058: the first hut's construction (progress + wood spent).
  // The tick owns it; the founders save persists it (v3).
  const constructionRef=useRef<ConstructionState>(freshConstruction());
  // BUILD 1087 (2.2): the storehouse's construction (progress +
  // wood/stone spent). The tick owns it; the founders save persists
  // it (v9) alongside the camp pile.
  const storehouseRef=useRef<StorehouseState>(freshStorehouse());
  // BUILD 1088 (2.3): the path layer — the traffic counts, the
  // bridge sites, and the last bridge-scan day. The tick owns it;
  // the founders save persists the bridges (v10). The traffic is
  // session-only (the dirt path tiles persist via the world save).
  const pathsRef=useRef<PathState>(freshPathState());
  // BUILD 1089 (2.4): the mine / quarry / lumber sites — the
  // designations over a real iron deposit, a rock cluster, and a
  // forest-edge rect. The tick owns them; the founders save
  // persists them (v11) alongside the carried + stored ore.
  const minesRef=useRef<MineState>(freshMineState());
  // BUILD 1094 (3.3): the mill + the bakery — the food chain. The
  // tick owns it; the founders save persists it (v12, compatible
  // fields — the flour stock + the food-chain state) alongside the
  // camp pile.
  const foodChainRef=useRef<FoodChainState>(freshFoodChain());
  const metalChainRef=useRef<MetalChainState>(freshMetalChain());
  // BUILD 1096 (3.5): the housing — the inn. The tick owns it;
  // the founders save persists it (v12, compatible fields — the
  // housing state + the inn food stock) alongside the camp pile.
  const housingRef=useRef<HousingState>(freshHousing());
  // BUILD 1100 (0x23, Phase 4.2): the settlement plan — the Mayor +
  // Architect decision. The tick owns it; the founders save persists
  // it (v12, a compatible field) alongside the camp pile.
  const sitePlanRef=useRef<SettlementPlan|null>(null);
  // BUILD 1102 (0x25, Phase 4.5): the sheep pen. The tick owns it;
  // the founders save persists it (v12, a compatible field)
  // alongside the camp pile.
  const penRef=useRef<PenState>(freshPen());
  // BUILD 1101 (0x24, Phase 4.3): the founding party — session-only,
  // like transients (never in the founders save). The tick owns it;
  // the test hook starts it (probe-only — no UI trigger).
  const foundingRef=useRef<FoundingState|null>(null);
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
  // BUILD 1056: world clock + wait system. clockUi is the rendered clock
  // (the 1s interval refreshes it, so the HUD readout ticks live);
  // waitingRef is what the frame loop / tap handlers read to freeze the
  // player while a wait runs; waitTimerRef is cleared on cancel, on
  // completion, and on unmount, so a wait can never outlive the view.
  const [clockUi,setClockUi]=useState(loadClock());
  const [waitSheetOpen,setWaitSheetOpen]=useState(false);
  const [waitProgress,setWaitProgress]=useState<{done:number;total:number;label:string}|null>(null);
  // BUILD 1057: the founders' camp readout — the REAL stockpile
  // count (wood delivered by the founders) + the shared food stock.
  // Updated by the founder tick / wait steps when either changes.
  // BUILD 1058: + the hut progress ('—' / '3/6' / 'done').
  // BUILD 1062: + the forest density % from the living-world adapter
  // (live stored trees / baseline) — '—' until the adapter loads.
  const [campUi,setCampUi]=useState({wood:0,stone:0,food:FOUNDER_START_FOOD,grain:0,flour:0,iron:0,ingots:0,tools:0,timber:0,furniture:0,hut:'—',storehouse:'—',forest:'—',beds:'—'});
  // BUILD 1062: the forest % for the Camp line, from the live tree
  // count and the adapter's fixed baseline. '—' when the adapter has
  // not loaded yet (first render, before the mount effect).
  const forestPct=(trees:number)=>{const s=livingWorldRef.current;return s?String(Math.round(forestDensity(trees,s.baselineTrees)*100)):'—';};
  // BUILD 1064 (R-1): mirror the registry into the React states
  // (inventory + camp line) and the plain read-mirror refs. The
  // camp line is set on every call (its callers already gate on
  // stockChanged/hutChanged). BUILD 1075 (0x0D area 5): the inventory
  // mirror itself lives in inventoryCrafting3d.ts (refreshPlayerInventory)
  // — the state is set only when the player record actually changed
  // (a founder delivery must not re-render the HUD), and the player
  // record is persisted to INVENTORY_KEY in its old shape (resource
  // keys from the registry, keepsakes passed through).
  // The inventory context — built once, the view calls
  // refreshPlayerInventory through it. The registry getter reads the
  // live ref (the registry is rebuilt on load).
  const inventoryCtx: InventoryContext = { registry: () => registryRef.current, inventoryRef, setInventory };
  const refreshResourceUi=()=>{
    refreshPlayerInventory(inventoryCtx);
    const reg=registryRef.current;
    founderStockpileRef.current=campWoodInRegistry(reg);
    founderFoodRef.current=campFoodInRegistry(reg);
    founderGrainRef.current=campGrainInRegistry(reg);
    founderStoneRef.current=campStoneInRegistry(reg);
    setCampUi({wood:founderStockpileRef.current,stone:founderStoneRef.current,food:founderFoodRef.current,grain:founderGrainRef.current,flour:granaryFlourInRegistry(reg),iron:storehouseOreInRegistry(reg,'iron'),ingots:metalChainIngotsInRegistry(reg),tools:metalChainToolsInRegistry(reg),timber:metalChainTimberInRegistry(reg),furniture:metalChainFurnitureInRegistry(reg),hut:hutProgressLabel(constructionRef.current),storehouse:storehouseLabel(storehouseRef.current),forest:forestPct(stateRef.current.world.trees.length),beds:foundersRef.current.length+'/'+housingCapacity(constructionRef.current)});
  };
  // BUILD 1078 (0x0D, area 8): the living-world sync lives in
  // worldSync3d.ts now — the view builds the context once and calls
  // in through the bound syncLivingWorld below (used by the 1s clock
  // timer and the wait step via their contexts).
  const livingWorldSyncCtx: LivingWorldSyncContext = {
    livingWorld: livingWorldRef, registry: registryRef, founders: foundersRef,
    clock: clockRef, needsWorldRebuild, refreshResourceUi, setMessage,
  };
  const syncLivingWorld=(world:IsoWorld)=>syncLivingWorldImpl(livingWorldSyncCtx,world);
  const waitingRef=useRef(false);
  const waitTimerRef=useRef<number|null>(null);
  const waitStartHpRef=useRef(100);
  // Bridge for cancelling a tap journey from outside the render effect
  // (moveTarget lives in the effect's closure — same pattern as the
  // 1053 travelRequestRef bridge). Assigned inside the effect.
  const cancelWalkRef=useRef<(()=>void)|null>(null);
  const cancelWait=(reason:'done'|'cancelled'|'interrupted')=>{
    if(waitTimerRef.current!==null){window.clearInterval(waitTimerRef.current);waitTimerRef.current=null;}
    waitingRef.current=false;setWaitProgress(null);
    if(reason==='done')setMessage('You waited until '+formatDayClock(clockRef.current)+'.');
    else if(reason==='cancelled')setMessage('You stop waiting.');
    else setMessage('Something attacked you — you stop waiting.');
  };
  const startWait=(totalMinutes:number,label:string)=>{
    if(waitingRef.current||totalMinutes<=0)return;
    // Clear any stale timer without messaging (no wait is running).
    if(waitTimerRef.current!==null){window.clearInterval(waitTimerRef.current);waitTimerRef.current=null;}
    // Stop the player dead (2D parity: movement keys cleared, walk
    // stopped) — the journey bridge clears moveTarget + path, and the
    // frame loop ignores all movement input while waitingRef is set.
    cancelWalkRef.current?.();
    waitingRef.current=true;setWaitSheetOpen(false);
    const total=waitStepsFor(totalMinutes);
    waitStartHpRef.current=healthRef.current;
    setWaitProgress({done:0,total,label});
    let remaining=totalMinutes;
    const timer=window.setInterval(()=>{
      // A wolf bite (or the 0 → 100 exhaustion restore) ends the wait:
      // HP only ever moves by damage or that restore in 3D.
      if(waitInterrupted(waitStartHpRef.current,healthRef.current)){cancelWait('interrupted');return;}
      const step=Math.min(WAIT_STEP_MINUTES,remaining);
      const waitCtx: WaitSimContext = {
        world: stateRef.current.world,
        clock: clockRef,
        founders: foundersRef,
        construction: constructionRef,
        storehouse: storehouseRef,
        paths: pathsRef,
        mines: minesRef,
        foodChain: foodChainRef,
        metalChain: metalChainRef,
        housing: housingRef,
        sitePlan: sitePlanRef,
        pen: penRef,
        registry: registryRef,
        jobBoard: jobBoardRef,
        syncLivingWorld,
        setClockUi,
      };
      simulateWorldSimWaitStep(waitCtx, step);
      remaining-=step;
      if(remaining<=0){cancelWait('done');return;}
      setWaitProgress({done:total-waitStepsFor(remaining),total,label});
    },WAIT_STEP_MS);
    waitTimerRef.current=timer;
  };
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
  // BUILD 1078 (0x0D, area 8): the world-sync primitive lives in
  // worldSync3d.ts now — the view builds one context and calls in
  // via commitWorld/markWorldDirty. The refs themselves stay here
  // (passed by reference into the renderer and the other extracted
  // modules); what moved is the logic that operates on them.
  const worldSyncCtx: WorldSyncContext = { needsWorldRebuild, setPlacedCount };
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
  // BUILD 997: display name for a placed item — built-in kinds use
  // the catalog label; a custom item uses its upload's name (or a
  // fallback when the upload is gone). Used by Move/Remove messages
  // so they never index KIND_META with 'custom' (which has no entry
  // and would crash the preview/message path). BUILD 1012: a placed
  // house shows its variant's label (Cottage / Tall House /
  // Shopfront / Grand House); a legacy variant-less house is 'House'.
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
        if(n>0){commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'stroke',entries:removed.map(r=>({kind:'unplace' as const,item:r.item,index:r.index}))});}
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
    if(n>0){commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'stroke',entries:removed.map(r=>({kind:'unplace' as const,item:r.item,index:r.index}))});}
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
    // BUILD 1088 swatch: well stone grey / water blue. The well is
    // NOT offered in any catalog section (the settlement seeds it) —
    // the entry exists only because KIND_META is total over
    // PaletteKind, so a moved/selected well still reads a label.
    well:{label:'Well',swatch:'linear-gradient(135deg,#8a8d8a 0 50%,#3a6a8a 50% 100%)'},
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
  // BUILD 1076 (0x0D area 6): the Build-mode interaction layer lives
  // in buildingInteractions3d.ts — the view builds one context per
  // render and calls in via buildIx. The door/interior transition,
  // the Build tool toggles, undo/redo, and the area actions moved
  // verbatim; the React state itself stays here.
  const buildCtx: BuildingContext = {
    stateRef, historyRef, needsWorldRebuild, rebuildUrgent, buildRef, areaSelectionRef,
    npcActorsRef, transientActorsRef, customAssetsRef, areaSelectPreviewRef,
    placePreviewRef, placeHoverRef, insideHutRef, walkRef,
    setPosition, setMessage, setPlacedCount, setInsideHut,
    setUndoAvailable, setRedoAvailable, setPalette, setCustomSelection,
    setPasteName, setRemoveMode, setMoveMode, setSaveAreaMode,
    setAreaSelectMode, setAreaSelection, setAreaMoveArmed,
    setAreaDuplicateArmed, setAreaDeleteArmed, setWalkSuspended,
    removeMode, palette, customSelection, areaSelectMode, moveMode,
    saveAreaMode, pasteName, buildOpen, areaSelection, insideHut,
    position, customAssets,
    saveKey: SAVE_KEY,
  };
  const buildIx = createBuildingInteractions(buildCtx);
  const nearDoorHut = buildIx.nearDoorHut();
  const buildMinimized = buildIx.isBuildMinimized();
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
    // BUILD 1054: no car in the clean wilderness (the button is
    // hidden too — this guards the test hook).
    if(WILDERNESS_ONLY){setMessage('No cars in the wilderness');return;}
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
    markWorldDirty(worldSyncCtx);setMessage('Driving — 10x speed');
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
    markWorldDirty(worldSyncCtx);setMessage('Outside');
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
    const world=loadInitialWorld(applyMosslightTownLayout,absMinutes(clockRef.current.day,clockRef.current.minutes),(w,x,y)=>npcWalkable(w,x,y));stateRef.current.world=world;
    setPlacedCount(world.placements.length);
    npcActorsRef.current=savedNpcActors(world);
    // BUILD 1057: founders load from the versioned founders save (or
    // fresh defaults at the camp on first run — the old roster is
    // never read or written here). Positions validate against the
    // live world: an unwalkable saved tile snaps to a nearby
    // walkable one, or the camp centre. Needs resume from where the
    // save left them (no offline catch-up decay — the world does not
    // run while the game is closed, same as the old NPCs).
    if(FOUNDERS_ENABLED){
      const saved=loadFoundersSave();
      const clockAbs=founderAbsMinutes(clockRef.current.day,clockRef.current.minutes);
      const states=saved?foundersStateOf(saved):FOUNDER_NAMES.map((n,i)=>defaultFounderState(n,i,clockAbs));
      for(const f of states){
        // BUILD 1058: a founder saved INSIDE the finished hut is
        // asleep in their own bed — keep the tile (npcWalkable
        // refuses hut tiles, so the generic snap below would throw
        // them out of the house).
        const insideHut=hutPlacementExists(world)&&insideHutRect(f.x,f.y);
        if(!insideHut&&!npcWalkable(world,f.x,f.y)){
          const near=quantizeTile(world,f.x,f.y,8);
          f.x=near?near.x:FOUNDER_CAMP_CENTRE.x;f.y=near?near.y:FOUNDER_CAMP_CENTRE.y;
        }
        // 'chopping' is session-only (the tree target is not saved) —
        // a founder reloaded mid-chop walks to a tree again.
        if(f.workState==='chopping')f.workState='toTree';
        // BUILD 1087: 'toStorehouse' is session-only too (the fetch
        // target is the storehouse approach) — a founder reloaded
        // mid-fetch walks to a site again; the carried build wood
        // rides in the carrier store and is returned on delivery.
        if(f.workState==='toStorehouse')f.workState='toTree';
        // BUILD 1088: 'toWell'/'toWater' are session-only too (the
        // well approach / the farm tile) — a founder reloaded
        // mid-watering walks to a site again; the carried water is
        // spilled (it is never stocked).
        if(f.workState==='toWell'||f.workState==='toWater'){f.workState='toTree';f.carryingWater=0;}
        // BUILD 1090: 'toPlant'/'planting' are session-only too (the
        // farm tile) — a founder reloaded mid-plant walks to a site
        // again; the tile is not planted yet, so nothing is lost.
        if(f.workState==='toPlant'||f.workState==='planting'){f.workState='toTree';f.plantTicks=0;}
        // BUILD 1102: 'toPrey'/'hunting', 'toBank'/'fishing' and
        // 'toPen'/'shepherding' are session-only too (the prey
        // target / the bank tile / the pen leg) — a founder reloaded
        // mid-hunt walks to a site again; the prey target is not
        // saved, and any carried yield rides in the carrier store
        // and is returned on delivery.
        if(f.workState==='toPrey'||f.workState==='hunting'||f.workState==='toBank'||f.workState==='fishing'||f.workState==='toPen'||f.workState==='shepherding'){f.workState='toTree';f.preyTarget=null;f.animalTicks=0;}
        // BUILD 1058: a founder reloaded at the build site resumes
        // the step from 0 ticks (like the chop reset above); a
        // founder reloaded mid-build whose hut finished while they
        // were away goes back to chopping.
        f.treeTarget=null;f.farmTarget=null;f.waterTarget=null;f.workTile=null;f.chopTicks=0;f.buildTicks=0;f.harvestTicks=0;f.plantTicks=0;
        f.restTile=null;
        f.lastAbs=clockAbs;
      }
      foundersRef.current=states;
      // BUILD 1064 (R-1): build the registry — the runtime authority.
      // Deposits from the live world (trees/rocks/crates), the camp
      // store from the founders save (v4 shape preserved — the
      // numbers ride in, the registry owns them from here), each
      // founder's carrier from their saved carrying, and the player
      // store from INVENTORY_KEY (keepsakes stay out of the
      // registry). The plain refs below are read mirrors, set by
      // refreshResourceUi — never written directly again.
      let reg=depositsFromWorld(createRegistry(),world);
      // BUILD 1081 (1.2): the live mineral deposits join the registry
      // (the accounting side of the deposit map) — mined-out deposits
      // are skipped, so the registry never reports ore that no longer
      // exists. The stamp in loadInitialWorld already ran above.
      reg=depositsFromGeology(reg,world);
      reg=seedCampStore(reg,saved?saved.stockpileWood:0,saved?saved.foodStock:FOUNDER_START_FOOD,saved?saved.grainStock:0,saved?saved.stoneStock??0:0,saved?saved.flourStock??0:0,saved?saved.meatStock??0:0,saved?saved.fishStock??0:0);
      // BUILD 1087: the storehouse store from the v9 founders save
      // (v8 saves migrate with empty counts — the camp pile keeps
      // everything, the same as before).
      // BUILD 1089: + the stored iron (v11; v10 saves migrate with 0).
      reg=seedStorehouseStore(reg,saved?saved.storehouseWood??0:0,saved?saved.storehouseStone??0:0,saved?saved.storehouseOre??0:0,saved?saved.storehouseCoal??0:0,saved?saved.storehouseIngots??0:0,saved?saved.storehouseTools??0:0,saved?saved.storehouseTimber??0:0,saved?saved.storehouseFurniture??0:0,saved?saved.storehouseWool??0:0,saved?saved.storehouseLeather??0:0);
      // BUILD 1096: the inn store seeds from the v12 founders save
      // (older saves start empty).
      reg=seedInnStore(reg,saved?saved.innFoodStock??0:0);
      for(const f of states)reg=seedCarrierStore(reg,f);
      reg=loadPlayerInventoryIntoRegistry(reg);
      registryRef.current=reg;
      // BUILD 1058: construction loads from the v2 founders save
      // (v1 saves migrate to a fresh one). If the save says 'done'
      // but the world has no hut placement, reconcile: the founders
      // rebuild from the pile.
      constructionRef.current=saved&&saved.construction?reconcileExtraSites(reconcileConstruction(saved.construction,hutPlacementExists(world)),world):freshConstruction();
      if(!hasUnfinishedSite(constructionRef.current)){
        for(const f of foundersRef.current)if(f.workState==='toSite'||f.workState==='building')f.workState='toTree';
      }
      // BUILD 1087: the storehouse loads from the v9 founders save
      // (v8 saves migrate to a fresh one). If the save says 'done'
      // but the world has no storehouse placement, reconcile: the
      // founders rebuild from the pile.
      storehouseRef.current=saved&&saved.storehouse?reconcileStorehouse(saved.storehouse,world):freshStorehouse();
      // BUILD 1088: the bridge sites load from the v10 founders save
      // (v9 saves migrate to an empty list). If the save says 'done'
      // but the world has no bridge placement, reconcile: the
      // founders rebuild from the pile. The traffic resets — the
      // dirt path tiles persist via the world save.
      pathsRef.current=saved&&saved.bridges?{...freshPathState(),bridges:reconcileBridges(saved.bridges,world)}:freshPathState();
      // BUILD 1089: the mine / quarry / lumber sites load from the
      // v11 founders save (v10 saves migrate to no sites — the world
      // keeps working, the same as before). The validation is the
      // shape check (a corrupt list starts fresh, never crashes).
      minesRef.current=validateMineState(saved?saved.mines:undefined);
      // BUILD 1094: the mill + the bakery load from the v12 founders
      // save (older saves migrate to a fresh chain). If the save says
      // 'done' but the world has no mill/bakery placement, reconcile:
      // the founders rebuild from the pile.
      foodChainRef.current=saved&&saved.foodChain?reconcileFoodChain(saved.foodChain,world):freshFoodChain();
      // BUILD 1095: the chain loads from the v12 founders save
      // (older saves migrate to a fresh chain). If the save says
      // 'done' but the world has no chain placement, reconcile:
      // the founders rebuild from the pile.
      metalChainRef.current=saved&&saved.metalChain?reconcileMetalChain(saved.metalChain,world):freshMetalChain();
      // BUILD 1096: the housing loads from the v12 founders save
      // (older saves migrate to a fresh housing). If the save says
      // 'done' but the world has no inn placement, reconcile: the
      // founders rebuild from the pile.
      housingRef.current=saved&&saved.housing?reconcileHousing(saved.housing,world):freshHousing();
      // BUILD 1100: the settlement plan loads from the v12 founders
      // save (older saves have none — the tick re-plans on the first
      // tick). A corrupt value validates to null, never crashes.
      sitePlanRef.current=sitePlanFromSave(saved?saved.sitePlan:null);
      // BUILD 1102: the pen loads from the v12 founders save
      // (older saves have none — validatePenState starts fresh).
      // If the save says 'done' but the world has no fence
      // placements (a world save wiped without the founders save),
      // the pen rebuilds from the pile — the inn's reconcile
      // precedent, inline here so the pen module stays untouched.
      penRef.current=saved&&saved.pen?validatePenState(saved.pen):freshPen();
      if(penRef.current.site.state==='done'){
        const fenced=new Set(placedFenceTiles(world).map((t)=>t.tx+','+t.ty));
        let whole=true;
        for(let x=PEN_RECT.x0;x<=PEN_RECT.x1&&whole;x++){if(!fenced.has(x+','+PEN_RECT.y0)||!fenced.has(x+','+PEN_RECT.y1))whole=false;}
        for(let y=PEN_RECT.y0+1;y<=PEN_RECT.y1-1&&whole;y++){if(!fenced.has(PEN_RECT.x0+','+y)||!fenced.has(PEN_RECT.x1+','+y))whole=false;}
        if(!whole)penRef.current=freshPen();
      }
      // BUILD 1062: the living-world coordinator (F-0) — load the saved
      // adapter state, or fresh from the live world (real trees, real
      // founders, real day). A corrupt/unknown save starts fresh; the
      // coordinator never advances a disconnected sim.
      livingWorldRef.current=loadLivingWorldState()??freshLivingWorldState(world,foundersRef.current,clockRef.current);
      // BUILD 1064 (R-1): the camp settlement's storage is a MIRROR
      // of the registry's camp store — write the real numbers in at
      // load, so the coordinator's first advance sees the pile the
      // founders actually filled, not a second (empty) ledger.
      const campSettlement=livingWorldRef.current.livingWorld.civilization.settlements.find(s=>s.id===CAMP_SETTLEMENT_ID);
      // BUILD 1090: the camp's storage is two stores now (wood +
      // stone in the camp store, food + grain in the granary) —
      // mirror both, so the coordinator sees the pile the founders
      // actually filled.
      if(campSettlement)mirrorCampStoresToSettlement(registryRef.current,campSettlement);
      refreshResourceUi();
    }
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
    let renderer: WorldRenderer;
    try {
      renderer = new WorldRenderer(canvas, (m) => setMessage(m));
    } catch {
      return;
    }

    // BUILD 1074 (0x0D, area 4): the player controls live in
    // playerControls3d.ts now — the view builds the context once
    // and calls in via the bound controls (walkableAt, the
    // tap-to-walk follower, the keyboard handlers, the E-key
    // action). The Build-mode callbacks the keyboard handler needs
    // (undo/redo, Escape/R) ride in the context; the pointer
    // routing (orbit, pinch, Build-mode drags) stays here and calls
    // in for the walk parts.
    const playerCtx: PlayerControlsContext = {
      world, renderer, state: stateRef, setPosition, setMessage, setHealth, refreshResourceUi,
      insideHut: insideHutRef, car: carRef, driving: drivingRef,
      npcActors: npcActorsRef, transientActors: transientActorsRef, animalActors: animalActorsRef,
      founders: foundersRef, registry: registryRef, jobBoard: jobBoardRef, sitePlan: sitePlanRef, pen: penRef,
      construction: constructionRef, storehouse: storehouseRef, livingWorld: livingWorldRef, clock: clockRef,
      health: healthRef, inventory: inventoryRef,
      playerPath: playerPathRef, playerPathReplan: playerPathReplanRef,
      playerPathWait: playerPathWaitRef, playerPathStuck: playerPathStuckRef,
      needsWorldRebuild, build: buildRef, placementRot: placementRotRef,
      placeHover: placeHoverRef, placePreviewFn: placePreviewFnRef, sprint: sprintCtx,
      doUndo: buildIx.doUndo, doRedo: buildIx.doRedo, cancelPlacement: buildIx.cancelPlacement,
      setAreaMoveArmedBoth: buildIx.setAreaMoveArmedBoth, setAreaDuplicateArmedBoth: buildIx.setAreaDuplicateArmedBoth, setAreaDeleteArmed, setPlacementRotBoth,
      enterCar, exitCar, enterHut: buildIx.enterHut, exitHut: buildIx.exitHut,
      saveKey: SAVE_KEY, npcSaveKey: NPC_SAVE_KEY, healthKey: HEALTH_KEY,
    };
    const controls = createPlayerControls(playerCtx);









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

    const hideRemovePreview=()=>{const el=removePreviewRef.current;if(el)el.style.display='none';};
    const showRemovePreview=(clientX:number,clientY:number)=>{
      const el=removePreviewRef.current;if(!el){return;}
      const destination=renderer.pickGround(clientX,clientY);
      const snapped=destination?findRemovableNear(stateRef.current.world,destination.x,destination.y):null;
      const proj=snapped?renderer.projectTileCenter(snapped.tx,snapped.ty):null;
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
      commitWorld(worldSyncCtx,world);
      buildIx.pushHistory({kind:'stroke',entries});
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
      const destination=renderer.pickGround(clientX,clientY);if(!destination){el.style.display='none';return;}
      const proj=renderer.projectTileCenter(Math.round(destination.x),Math.round(destination.y));if(!proj){el.style.display='none';return;}
      el.style.display='block';el.style.left=proj.cx+'px';el.style.top=proj.cy+'px';
      const label=movePreviewLabelRef.current;
      if(label)label.textContent='Move '+(moveDragging.kind==='placed'?buildIx.placementLabel(moveDragging.item):moveDragging.kind);
    };
    // BUILD 995: the caller (pointer-up) already cleared moveDragging
    // and hid the preview before calling, so the dragged item arrives
    // as a parameter — re-reading moveDragging here always saw null
    // and silently dropped every move.
    const finalizeMove=(clientX:number,clientY:number,drag:MoveDrag)=>{
      const destination=renderer.pickGround(clientX,clientY);
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
        commitWorld(worldSyncCtx,world);
        buildIx.pushHistory({kind:'move',oldItem:drag.item,newItem:res.item,index:res.index});
        setMessage('Moved '+buildIx.placementLabel(res.item));
        return;
      }
      // BUILD 1006: generated moves — same atomicity, same one-undo
      // rule, same save + rebuild. A same-position drop is a silent
      // no-op (the pure functions already guarantee zero mutation).
      if(drag.kind==='house'){
        const res=moveGeneratedHut(world,drag.hut,dx,dy,playerTile,npcTiles);
        if(!res.ok){setMessage('Cannot move here: '+res.reason);return;}
        if(res.same)return;
        commitWorld(worldSyncCtx,world);
        buildIx.pushHistory(res.entry);setMessage('Moved house');return;
      }
      if(drag.kind==='tree'){
        const res=moveGeneratedTree(world,drag.x,drag.y,dx,dy,playerTile,npcTiles);
        if(!res.ok){setMessage('Cannot move here: '+res.reason);return;}
        if(res.same)return;
        commitWorld(worldSyncCtx,world);
        buildIx.pushHistory(res.entry);setMessage('Moved tree');return;
      }
      const res=moveGeneratedPath(world,drag.x,drag.y,dx,dy);
      if(!res.ok){setMessage('Cannot move here: '+res.reason);return;}
      if(res.same)return;
      commitWorld(worldSyncCtx,world);
      buildIx.pushHistory(res.entry);setMessage('Moved path');
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
      const destination=renderer.pickGround(clientX,clientY);if(!destination){el.style.display='none';return;}
      const ex=Math.round(destination.x),ey=Math.round(destination.y);
      const x0=Math.min(start.x,ex),x1=Math.max(start.x,ex),y0=Math.min(start.y,ey),y1=Math.max(start.y,ey);
      const p0=renderer.projectTileCenter(x0,y0),p1=renderer.projectTileCenter(x1,y1);
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
      const destination=renderer.pickGround(clientX,clientY);
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
        labelName=buildIx.toolLabel(palette,false);
        if(res.ok&&isHouseKind(palette))labelName+=' · door faces '+rotateFace('south',rot);
      }
      const p0=renderer.projectTileCenter(rect.x0,rect.y0),p1=renderer.projectTileCenter(rect.x1,rect.y1);
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
      const destination=renderer.pickGround(clientX,clientY);
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
      const p0=renderer.projectTileCenter(rect.x0,rect.y0),p1=renderer.projectTileCenter(rect.x1,rect.y1);
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
    const showAreaSelectPreview=(start:{x:number;y:number},clientX:number,clientY:number)=>{
      const destination=renderer.pickGround(clientX,clientY);if(!destination){hideAreaSelectPreview();return;}
      const ex=Math.round(destination.x),ey=Math.round(destination.y);
      const rect={x0:Math.min(start.x,ex),y0:Math.min(start.y,ey),x1:Math.max(start.x,ex),y1:Math.max(start.y,ey)};
      const world=stateRef.current.world;
      const count=selectionCount(selectArea(world,rect));
      positionAreaSelectRect(rect,'Area '+(rect.x1-rect.x0+1)+'×'+(rect.y1-rect.y0+1)+' · '+count+' item'+(count===1?'':'s'));
    };
    const showAreaMovePreview=(clientX:number,clientY:number)=>{
      if(!areaMoveDragging)return;
      const destination=renderer.pickGround(clientX,clientY);if(!destination){hideAreaSelectPreview();return;}
      const dx=Math.round(destination.x)-areaMoveDragging.start.x,dy=Math.round(destination.y)-areaMoveDragging.start.y;
      const r=areaMoveDragging.sel.rect;
      positionAreaSelectRect({x0:r.x0+dx,y0:r.y0+dy,x1:r.x1+dx,y1:r.y1+dy},'Move area '+(dx===0&&dy===0?'— drop to cancel':'to ('+(r.x0+dx)+','+(r.y0+dy)+')'));
    };
    const showAreaDuplicatePreview=(clientX:number,clientY:number)=>{
      const sel=areaSelectionRef.current;if(!sel)return;
      const destination=renderer.pickGround(clientX,clientY);if(!destination){hideAreaSelectPreview();return;}
      const ax=Math.round(destination.x),ay=Math.round(destination.y);
      const w=sel.rect.x1-sel.rect.x0,h=sel.rect.y1-sel.rect.y0;
      positionAreaSelectRect({x0:ax,y0:ay,x1:ax+w,y1:ay+h},'Duplicate here — tap to place');
    };
    const finalizeAreaSelection=(clientX:number,clientY:number,drag:{start:{x:number;y:number}})=>{
      const destination=renderer.pickGround(clientX,clientY);
      if(!destination){setMessage('Drag on the ground to select an area');return;}
      const ex=Math.round(destination.x),ey=Math.round(destination.y);
      const rect={x0:Math.min(drag.start.x,ex),y0:Math.min(drag.start.y,ey),x1:Math.max(drag.start.x,ex),y1:Math.max(drag.start.y,ey)};
      const world=stateRef.current.world;
      const sel=selectArea(world,rect);
      const count=selectionCount(sel);
      if(count===0){setMessage('Nothing selectable in this area — drag a bigger rectangle');setAreaSelection(null);hideAreaSelectPreview();return;}
      setAreaSelection(sel);buildIx.setAreaMoveArmedBoth(false);buildIx.setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);
      setBuildOpen(true);
      positionAreaSelectRect(rect,areaSelectionLabel(sel));
      setMessage('Area selected ('+(rect.x1-rect.x0+1)+'×'+(rect.y1-rect.y0+1)+', '+count+' item'+(count===1?'':'s')+') — Move, Rotate, Delete, or Duplicate it in the Build panel'+(sel.notes.length?' · '+sel.notes[0]:''));
    };
    const finalizeAreaMove=(clientX:number,clientY:number,drag:{start:{x:number;y:number};sel:AreaSelection})=>{
      const destination=renderer.pickGround(clientX,clientY);
      if(!destination){setMessage('Drag the yellow area to move it');return;}
      const dx=Math.round(destination.x)-drag.start.x,dy=Math.round(destination.y)-drag.start.y;
      if(dx===0&&dy===0){positionAreaSelectRect(drag.sel.rect,areaSelectionLabel(drag.sel));return;}
      const world=stateRef.current.world;
      const {playerTile,npcTiles}=buildIx.areaActorTiles();
      const res=moveArea(world,drag.sel,dx,dy,playerTile,npcTiles);
      if(!res.ok){setMessage('Cannot move here: '+res.reason);positionAreaSelectRect(drag.sel.rect,areaSelectionLabel(drag.sel));return;}
      if(!res.entry){positionAreaSelectRect(drag.sel.rect,areaSelectionLabel(drag.sel));return;}
      commitWorld(worldSyncCtx,world);buildIx.pushHistory(res.entry);
      const newRect={x0:drag.sel.rect.x0+dx,y0:drag.sel.rect.y0+dy,x1:drag.sel.rect.x1+dx,y1:drag.sel.rect.y1+dy};
      const newSel=selectArea(world,newRect);
      setAreaSelection(newSel);buildIx.setAreaMoveArmedBoth(false);setAreaDeleteArmed(false);
      positionAreaSelectRect(newRect,areaSelectionLabel(newSel));
      setMessage('Moved area ('+res.moved+' item'+(res.moved===1?'':'s')+(res.skipped.length?', '+res.skipped.length+' skipped: '+res.skipped[0].reason:'')+')');
    };
    const paintRemoveAt=(clientX:number,clientY:number)=>{
      const destination=renderer.pickGround(clientX,clientY);if(!destination)return;
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
      markWorldDirty(worldSyncCtx);
      showRemovePreview(clientX,clientY);
    };
    const down=(e:PointerEvent)=>{if((e.target as HTMLElement).closest('button'))return;renderer.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(renderer.pointers.size===1){renderer.drag=true;renderer.gestureMoved=false;renderer.gestureStartX=e.clientX;renderer.gestureStartY=e.clientY;renderer.lx=e.clientX;renderer.ly=e.clientY;removeDragging=!!(buildRef.current.removeMode&&!walkRef.current&&!insideHutRef.current);removeStrokeEntries=[];removeStrokeTiles=new Set();removeStrokeRects=[];if(removeDragging)showRemovePreview(e.clientX,e.clientY);if(!removeDragging&&buildRef.current.moveMode&&!buildRef.current.palette&&!buildRef.current.customAssetId&&!buildRef.current.pasteName&&!walkRef.current&&!insideHutRef.current){const dest=renderer.pickGround(e.clientX,e.clientY);if(dest){const w=stateRef.current.world;const fx=Math.round(dest.x),fy=Math.round(dest.y);const found=(w.placements??[]).find(p=>fx>=p.x0&&fx<=p.x1&&fy>=p.y0&&fy<=p.y1);if(found){moveDragging={kind:'placed',item:found};}else{const hut=hutAt(w,fx,fy);if(hut){moveDragging={kind:'house',hut};}else if(w.trees.some(t=>t.tx===fx&&t.ty===fy)||w.crates.some(c=>c.tx===fx&&c.ty===fy)){moveDragging={kind:'tree',x:fx,y:fy};}else if(terrainAt(w,fx,fy)==='dirt'){moveDragging={kind:'path',x:fx,y:fy};}}if(moveDragging)showMovePreview(e.clientX,e.clientY);}}if(!removeDragging&&!moveDragging&&!walkRef.current&&!insideHutRef.current){const dest=renderer.pickGround(e.clientX,e.clientY);if(dest){const fx=Math.round(dest.x),fy=Math.round(dest.y);const areaSel=areaSelectionRef.current;const insideSel=!!(areaSel&&fx>=areaSel.rect.x0&&fx<=areaSel.rect.x1&&fy>=areaSel.rect.y0&&fy<=areaSel.rect.y1);if(areaSel&&(buildRef.current.areaMoveArmed||insideSel)){areaMoveDragging={start:{x:fx,y:fy},sel:areaSel};showAreaMovePreview(e.clientX,e.clientY);}else if(buildRef.current.areaSelectMode&&!buildRef.current.areaDuplicateArmed&&!buildRef.current.areaMoveArmed){areaSelectDragging={start:{x:fx,y:fy}};showAreaSelectPreview(areaSelectDragging.start,e.clientX,e.clientY);}}}if(!removeDragging&&!moveDragging&&!areaMoveDragging&&!areaSelectDragging&&buildRef.current.saveAreaMode&&!walkRef.current&&!insideHutRef.current){const dest=renderer.pickGround(e.clientX,e.clientY);if(dest){saveDragging={start:{x:Math.round(dest.x),y:Math.round(dest.y)}};showSavePreview(saveDragging.start,e.clientX,e.clientY);}} }else{renderer.drag=false;renderer.gestureMoved=true;renderer.pinchDistance=pointerDistance();if(removeDragging){finalizeRemoveStroke();removeDragging=false;hideRemovePreview();}if(moveDragging){moveDragging=null;hideMovePreview();}if(saveDragging){saveDragging=null;hideSavePreview();}if(areaMoveDragging){areaMoveDragging=null;hideAreaSelectPreview();}if(areaSelectDragging){areaSelectDragging=null;hideAreaSelectPreview();}}canvas.setPointerCapture?.(e.pointerId)};
    const pointerDistance=()=>{const pts=[...renderer.pointers.values()];return pts.length<2?0:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)};
    const move=(e:PointerEvent)=>{if(!renderer.pointers.has(e.pointerId))return;renderer.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(renderer.pointers.size>=2){const distance=pointerDistance();if(renderer.pinchDistance>0&&distance>0)renderer.applyZoom((renderer.pinchDistance-distance)*.025);renderer.pinchDistance=distance;if(removeDragging){finalizeRemoveStroke();removeDragging=false;hideRemovePreview();}if(moveDragging){moveDragging=null;hideMovePreview();}if(saveDragging){saveDragging=null;hideSavePreview();}if(areaMoveDragging){areaMoveDragging=null;hideAreaSelectPreview();}if(areaSelectDragging){areaSelectDragging=null;hideAreaSelectPreview();}return;}
      if(moveDragging){
        if(Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)>7)renderer.gestureMoved=true;
        showMovePreview(e.clientX,e.clientY);
        return;
      }
      if(removeDragging){
        if(Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)>7)renderer.gestureMoved=true;
        paintRemoveAt(e.clientX,e.clientY);
        return;
      }
      // BUILD 996: a save-area drag paints the rectangle instead of
      // orbiting (same override Remove uses). Pinch cancels it with
      // no selection, like a cancelled move-drag.
      if(saveDragging){
        if(Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)>7)renderer.gestureMoved=true;
        showSavePreview(saveDragging.start,e.clientX,e.clientY);
        return;
      }
      // BUILD 1037: an area-select drag paints the yellow rectangle
      // instead of orbiting (same override Remove/Save use); an area
      // move-drag paints the yellow rectangle at the new location;
      // while Duplicate is armed the hover paints the destination
      // rectangle. Pinch cancels all three with no commit.
      if(areaSelectDragging){
        if(Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)>7)renderer.gestureMoved=true;
        showAreaSelectPreview(areaSelectDragging.start,e.clientX,e.clientY);
        return;
      }
      if(areaMoveDragging){
        if(Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)>7)renderer.gestureMoved=true;
        showAreaMovePreview(e.clientX,e.clientY);
        return;
      }
      if(buildRef.current.areaDuplicateArmed&&areaSelectionRef.current){
        showAreaDuplicatePreview(e.clientX,e.clientY);
        return;
      }
      if(!renderer.drag)return;
      if(Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)>7)renderer.gestureMoved=true;
      if(!renderer.gestureMoved)return;
      renderer.yaw+=(e.clientX-renderer.lx)*.008;
      // BUILD 1023: first-person pitch is drag-up = look up. It was
      // inverted (drag up looked down: +dy raised lookPitch, and
      // lookPitch+ is gaze-up). Orbit keeps its existing sign below.
      if(firstPersonRef.current)renderer.lookPitch=Math.max(FP_PITCH_MIN,Math.min(FP_PITCH_MAX,renderer.lookPitch-(e.clientY-renderer.ly)*.006));
      else renderer.pitch=Math.max(.22,Math.min(1.25,renderer.pitch+(e.clientY-renderer.ly)*.006));
      renderer.lx=e.clientX;renderer.ly=e.clientY;
    };
    const up=(e:PointerEvent)=>{const wasTap=renderer.pointers.size===1&&renderer.drag&&!renderer.gestureMoved&&Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)<=10;
      renderer.pointers.delete(e.pointerId);renderer.drag=false;renderer.pinchDistance=0;
      const wasMoveDrag=moveDragging;moveDragging=null;hideMovePreview();
      const wasRemoveDrag=removeDragging;removeDragging=false;hideRemovePreview();
      const wasSaveDrag=saveDragging;saveDragging=null;hideSavePreview();
      const wasAreaMoveDrag=areaMoveDragging;areaMoveDragging=null;
      const wasAreaSelectDrag=areaSelectDragging;areaSelectDragging=null;
      if(wasMoveDrag){
        if(renderer.gestureMoved)finalizeMove(e.clientX,e.clientY,wasMoveDrag);
        else setMessage('Drag an item to move it');
      }
      else if(wasRemoveDrag&&removeStrokeEntries.length>0){finalizeRemoveStroke();}
      // BUILD 1037: an area move-drag commits the whole group to the
      // new location; an area select-drag finalizes the rectangle.
      // A tap inside the selection (no drag) falls through to the
      // tap-to-toggle branch below instead of moving anything.
      else if(wasAreaMoveDrag){
        if(renderer.gestureMoved)finalizeAreaMove(e.clientX,e.clientY,wasAreaMoveDrag);
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
          const destination=renderer.pickGround(e.clientX,e.clientY);
          if(!destination){setMessage('Tap the ground to place the copy');}
          else{
            const world=stateRef.current.world;const sel=areaSelectionRef.current;
            const ax=Math.round(destination.x),ay=Math.round(destination.y);
            const {playerTile,npcTiles}=buildIx.areaActorTiles();
            const res=duplicateArea(world,sel,{x:ax,y:ay},playerTile,npcTiles,customAssetsRef.current);
            if(!res.entry){setMessage('Nothing landed here: '+res.skipped[0]?.reason);buildIx.setAreaDuplicateArmedBoth(false);}
            else{
              // BUILD 1041: a duplicated farm tile is a FRESH planting
              // (the copy does not inherit the original's growth stage).
              for(const it of res.landed)if(it.kind==='farm'&&it.farmPlantedAt===undefined)it.farmPlantedAt=absMinutes(clockRef.current.day,clockRef.current.minutes);
              commitWorld(worldSyncCtx,world);buildIx.pushHistory(res.entry);
              const w=sel.rect.x1-sel.rect.x0,h=sel.rect.y1-sel.rect.y0;
              const newRect={x0:ax,y0:ay,x1:ax+w,y1:ay+h};
              const newSel=selectArea(world,newRect);
              setAreaSelection(newSel);buildIx.setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);
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
          const destination=renderer.pickGround(e.clientX,e.clientY);
          if(destination){
            const world=stateRef.current.world;
            const tx=Math.round(destination.x),ty=Math.round(destination.y);
            const sel=areaSelectionRef.current;
            if(tx>=sel.rect.x0&&tx<=sel.rect.x1&&ty>=sel.rect.y0&&ty<=sel.rect.y1){
              const toggled=toggleSelectionMember(sel,world,tx,ty);
              if(toggled){
                areaTapConsumed=true;
                const after=selectionCount(toggled.sel);
                if(after===0){buildIx.clearAreaSelection();setMessage('Selection cleared — nothing left in it');}
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
          const destination=renderer.pickGround(e.clientX,e.clientY);
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
                else{for(const it of res.landed)if(it.kind==='farm'&&it.farmPlantedAt===undefined)it.farmPlantedAt=absMinutes(clockRef.current.day,clockRef.current.minutes);commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'paste',items:res.landed});setMessage('Pasted '+res.landed.length+' of '+template.items.length+' from \''+template.name+'\''+(res.skipped.length?' ('+res.skipped.length+' skipped: '+res.skipped[0].reason+')':'')+' · tap again to paste more, or tap the chunk to stop');}
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
              else if(res.kind==='placed'){commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'unplace',item:res.item,index:res.index});setMessage('Removed '+buildIx.placementLabel(res.item));}
              else if(res.kind==='house'){commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'unhouse',rect:res.rect,index:res.index});setMessage('Removed house');}
              else if(res.kind==='tree'){commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'untree',tree:res.tree,treeIndex:res.treeIndex,crate:res.crate,crateIndex:res.crateIndex});setMessage('Removed tree');}
              else if(res.kind==='rock'){commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'unrock',x:res.x,y:res.y,rockIndex:res.rockIndex});setMessage('Removed rock');}
              else if(res.kind==='water'){commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'unwater',x:res.x,y:res.y,wasStored:res.wasStored});setMessage('Removed water');}
              else if(res.kind==='wall'){commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'unwall',x:res.x,y:res.y,wallIndex:res.wallIndex,h:res.h});setMessage('Removed wall');}
              else{commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'unpath',x:res.x,y:res.y});setMessage('Removed path');}
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
                else{addPlacement(world,result.item);commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'place',item:result.item});setMessage('Placed '+asset.name);}
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
              else{if(result.item.kind==='farm')result.item.farmPlantedAt=absMinutes(clockRef.current.day,clockRef.current.minutes);addPlacement(world,result.item);commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'place',item:result.item});setMessage('Placed '+buildIx.placementLabel(result.item));}
            }
          }
        } else if(!areaTapConsumed&&!waitingRef.current) {
          // BUILD 1056: taps never start a walk while waiting.
          const destination=renderer.pickGround(e.clientX,e.clientY);
          if(!destination){/* no ground picked — nothing to do */}
          else if(!controls.walkableAt(destination.x,destination.y)){setMessage('That destination is blocked');}
          else if(insideHutRef.current){
            // Inside a hut: short interior walk, direct push + sliding
            // (the A* walkable set is the outdoor one). The draw loop
            // clears any outdoor path on entry.
            renderer.moveTarget=destination;playerPathRef.current=null;setMessage('Walking to destination');
          } else {
            // BUILD 1030: tap-to-walk plans an A* route around trees,
            // houses, rocks, water, walls, and figures — no more
            // re-tapping around every obstacle. A walkable destination
            // with no route at all reports 'Path blocked'.
            const path=planPlayerPath(stateRef.current.world,stateRef.current.position,destination,controls.figureOccupiedTiles());
            if(!path){setMessage('Path blocked');}
            else{playerPathRef.current=path;playerPathReplanRef.current=performance.now();playerPathWaitRef.current=null;playerPathStuckRef.current=null;renderer.moveTarget=destination;setMessage('Walking to destination');}
          }
        }
      }
      if(renderer.pointers.size===1){const p=[...renderer.pointers.values()][0];renderer.lx=p.x;renderer.ly=p.y;renderer.drag=true;renderer.gestureMoved=true;}
    };
    // BUILD 1056: walk-cancel bridge for the wait system (moveTarget
    // lives in this closure; the Wait button lives outside it).
    cancelWalkRef.current=()=>{playerPathRef.current=null;renderer.moveTarget=null;playerPathWaitRef.current=null;playerPathStuckRef.current=null;};
    // BUILD 1053: minimap tap-to-travel — the same start-a-journey code
    // as a field tap (walkable check, 1030 A* plan, 'Path blocked' on
    // no route), exposed to the Minimap3D canvas via travelRequestRef
    // because moveTarget / playerPathRef live in this effect's closure.
    // The minimap is hidden inside a hut, so the interior branch is
    // belt-and-braces parity with the field tap, not a live path.
    travelRequestRef.current=(dest:{x:number;y:number})=>{
      // BUILD 1056: no new journeys while waiting — cancel the wait
      // first (the wait sheet's Cancel button, or the progress Cancel).
      if(waitingRef.current){setMessage('You are waiting — cancel the wait to travel.');return;}
      if(!controls.walkableAt(dest.x,dest.y)){setMessage('That destination is blocked');return;}
      if(insideHutRef.current){renderer.moveTarget=dest;playerPathRef.current=null;setMessage('Walking to destination');return;}
      const path=planPlayerPath(stateRef.current.world,stateRef.current.position,dest,controls.figureOccupiedTiles());
      if(!path){setMessage('Path blocked');return;}
      playerPathRef.current=path;playerPathReplanRef.current=performance.now();playerPathWaitRef.current=null;playerPathStuckRef.current=null;renderer.moveTarget=dest;setMessage('Walking to destination');
    };
    window.addEventListener('keydown',controls.keydown);window.addEventListener('keyup',controls.keyup);
    // BUILD 1018: Sprint-button hold backstop (window-level, so a hold
    // ends even when the finger slides off the button and lifts over
    // another element — without pointer capture the button never sees
    // that up). PointerId-gated inside releaseSprintPointer, so other
    // fingers' ups/cancels never touch the hold. touchend with zero
    // touches left + window blur clear a hold whose pointerup never
    // arrived (a cancelled touch still ends with a touchend).
    const sprintWinUp=(e:PointerEvent)=>releaseSprintPointer(sprintCtx,e.pointerId,e.clientX,e.clientY,true);
    const sprintWinCancel=(e:PointerEvent)=>releaseSprintPointer(sprintCtx,e.pointerId,e.clientX,e.clientY,false);
    const sprintWinTouchEnd=(e:TouchEvent)=>{if(e.touches.length===0&&sprintCtx.pointerId.current!==null)clearSprintHold(sprintCtx);};
    const sprintWinBlur=()=>{if(sprintCtx.pointerId.current!==null)clearSprintHold(sprintCtx);};
    window.addEventListener('pointerup',sprintWinUp);window.addEventListener('pointercancel',sprintWinCancel);window.addEventListener('touchend',sprintWinTouchEnd);window.addEventListener('blur',sprintWinBlur);
    // BUILD 1036: placement-preview hover — runs on every pointermove
    // (mouse hover included, not just drags), so the ghost follows
    // the cursor while an asset is armed. It never orbits or places;
    // it only positions the preview div.
    const hover=(e:PointerEvent)=>{if((buildRef.current.palette||buildRef.current.customAssetId)&&!buildRef.current.removeMode&&!buildRef.current.saveAreaMode&&!walkRef.current&&!insideHutRef.current)showPlacementPreview(e.clientX,e.clientY);else hidePlacementPreview();};
    // BUILD 1036: right-click cancels placement (same as Escape) —
    // the browser menu is suppressed on the canvas so the gesture
    // stays in the game.
    const cancelOnContextMenu=(e:MouseEvent)=>{e.preventDefault();if(buildRef.current.palette||buildRef.current.customAssetId||buildRef.current.pasteName){buildIx.cancelPlacement();setMessage('Placement cancelled');}};
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointermove',hover);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',controls.wheel,{passive:false});canvas.addEventListener('contextmenu',cancelOnContextMenu);

    renderer.bind({
      world, saveKey: SAVE_KEY,
      isAreaSelectDragging: () => areaSelectDragging !== null,
      isAreaMoveDragging: () => areaMoveDragging !== null,
      stateRef, clockRef, waitingRef, insideHutRef, playerPathRef, playerPathWaitRef, playerPathStuckRef, slidePerpRef, sprintHeldRef, sprintLatchRef, sprintRearmRef, staminaRef, sprintingRef, drivingRef, carYawRef, carRef, prevPlayerRef, needsWorldRebuild, rebuildUrgent, worldBuilderRef, buildFramesRef, buildMsRef, rebuildStepStatsRef, rebuildCountRef, diagRef, onDiagnosticsRef, customAssetsRef, skyDriftRef, firstPersonRef, fpAutoRef, npcActorsRef, transientActorsRef, foundersRef, foundingRef, animalActorsRef, registryRef, constructionRef, storehouseRef, foodChainRef, metalChainRef, housingRef, penRef, staminaPublishCountRef, areaSelectionRef, buildRef,
      setPosition, setMessage, setStaminaUi, setSprintingUi, setSprintLatchedUi, setSprintRearmUi, setFirstPersonOn,
      walkableAt: controls.walkableAt, replanPlayerPath: controls.replanPlayerPath, followPlayerPath: controls.followPlayerPath, positionAreaSelectRect, areaSelectionLabel,
    });


    window.addEventListener('keydown',controls.action);
    // BUILD 983 screenshot harness: drive the first-person camera
    // without UI (renamed in 992: street view became first person on
    // full zoom; setStreetView stays as a deprecated alias).
    (window as any).__ag3dTest={
      setYaw:(v:number)=>{renderer.yaw=v},
      setLookPitch:(v:number)=>{renderer.lookPitch=v},
      // BUILD 1023 probe hook (read-only): first-person look pitch, so
      // probes can measure the drag→pitch direction exactly.
      getLookPitch:()=>renderer.lookPitch,
      setFirstPerson:(v:boolean)=>{firstPersonRef.current=v;setFirstPersonOn(v)},
      setStreetView:(v:boolean)=>{firstPersonRef.current=v;setFirstPersonOn(v)},
      getFirstPerson:()=>firstPersonRef.current,
      getZoom:()=>renderer.zoom,
      setPlayer:(x:number,y:number)=>{stateRef.current.position={x,y};setPosition({x,y});markWorldDirty(worldSyncCtx)},
      // BUILD 990 test hook (read-only): the entered hut's rect, or null.
      getInsideHut:()=>insideHutRef.current?{...insideHutRef.current}:null,
      getPlacements:()=>JSON.parse(JSON.stringify(stateRef.current.world.placements??[])),
      // BUILD 1063 test hook (probes only — no gameplay effect):
      // place one palette item through the REAL path
      // (validatePlacement + addPlacement + saveWorld) and return
      // the placed item, or null when the tile refuses. The probe
      // uses it to prove a placed item gets a stable id at creation
      // and keeps it across a reload.
      placeTestItem:(kind:PaletteKind,tx:number,ty:number)=>{const w=stateRef.current.world;const player=stateRef.current.position;const playerTile={x:Math.round(player.x),y:Math.round(player.y)};const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];const result=validatePlacement(w,kind,tx,ty,playerTile,npcTiles,0);if(!result.ok)return null;addPlacement(w,result.item);commitWorld(worldSyncCtx,w);return JSON.parse(JSON.stringify(result.item));},
      // BUILD 1041 test hook (read-only): farm tiles with their live
      // growth stage (probes only — no gameplay effect).
      getFarmTiles:()=>placedFarmTiles(stateRef.current.world).map(t=>({tx:t.tx,ty:t.ty,plantedAt:t.plantedAt??null,stage:farmStageAt(t.plantedAt,absMinutes(clockRef.current.day,clockRef.current.minutes),growthFactorAt(stateRef.current.world,clockRef.current.day,t.tx,t.ty))})),
      // BUILD 1083 test hook (read-only): the soil + growth factor at
      // any tile (probes only — no gameplay effect).
      getSoilAt:(x:number,y:number)=>({soil:soilAt(stateRef.current.world,x,y),factor:soilFactorAt(stateRef.current.world,x,y)}),
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
      // BUILD 1056: wait state for probes (no gameplay effect).
      isWaiting:()=>waitingRef.current,
      setClock:(minutes:number,day?:number)=>{clockRef.current={minutes:((Math.floor(minutes)%1440)+1440)%1440,day:day??clockRef.current.day};saveClock(clockRef.current);},
      // BUILD 1011 test hooks: sky state read + cloud-drift set (probes
      // only — no gameplay effect).
      getSky:()=>{const m=clockRef.current.minutes;const g=skyGradientForMinutes(m);return {minutes:m,night:nightFactor3dForMinutes(m),night976:nightFactorForMinutes(m),drift:skyDriftRef.current,inside:!!insideHutRef.current,stars:{alpha:starAlphaForMinutes(m),count:STAR_COUNT},gradient:{top:[...g.top],horizon:[...g.horizon],warm:g.warm},rain:rainForMinutes(clockRef.current.day,m)};},
      setSkyDrift:(s:number)=>{skyDriftRef.current=Math.max(0,Math.floor(s));},
      // BUILD 1014 test hooks: house-fx state read (probes only — no
      // gameplay effect). houses/chimneys/litHouses are the last
      // frame's emission; houses[] carries each house's schedule +
      // lit state (resolveHouseFx is what the renderer draws, so
      // probes see exactly the live state); smokeSample is the first
      // chimney's live puff centres (pure function of the drift clock,
      // for the smoke-movement proof).
      getHouseFx:()=>{const details=resolveHouseFx(houseFxInputsFor(world,insideHutRef.current),clockRef.current.minutes);const c=details.find(d=>d.top);const sample=c&&c.top?{top:[...c.top],puffs:smokePuffsFor(c.top,c.seedX0,c.seedY0,skyDriftRef.current)}:null;return {minutes:clockRef.current.minutes,night:nightFactor3dForMinutes(clockRef.current.minutes),drift:skyDriftRef.current,...renderer.lastFxStats,houses:details.map(d=>({x0:d.hut.x0,y0:d.hut.y0,x1:d.hut.x1,y1:d.hut.y1,doorFace:d.doorFace,stories:d.stories,chimney:!!d.top,onMin:d.schedule.onMin,offMin:d.schedule.offMin,lit:d.lit,variant:d.variant??null,baseY:d.baseY,roofAxis:d.roofAxis,roofPitch:d.roofPitch,roofForm:d.roofForm})),lanterns:placedLanternTiles(world).map(t=>({tx:t.tx,ty:t.ty,lit:houseLitAt(clockRef.current.minutes,lightScheduleFor(t.tx,t.ty))})),smokeSample:sample};},
      // BUILD 999: a teleport must also drop the NPC's cached A* path.
      // Paths store ABSOLUTE tiles planned from the old position; the
      // timer only replans when the DESTINATION changes, so a moved
      // actor otherwise snaps back onto its stale path on the next
      // tick (caught by the 999 probes: a teleported NPC jumped ~21
      // tiles to its old path). Probes only — no gameplay effect: no
      // in-game system moves an NPC outside the timer today.
      setNpcPos:(name:string,tx:number,ty:number)=>{const a=npcActorsRef.current.find(n=>n.name===name);if(a){a.x=tx;a.y=ty;npcSimState.npcPath.delete(name);}},
      // BUILD 998 test hooks: interpolated render tile coords (floats)
      // for motion proofs, and last-frame slot upload stats (emitted vs
      // reused vs drawn) for the caching proof.
      getNpcRenderPos:(name:string)=>{const r=renderer.npcRender.get(name);return r?{x:r.x,y:r.y}:null;},
      getMotionStats:()=>({...renderer.motionStats}),
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
      clearMoveTarget:()=>{renderer.moveTarget=null;playerPathRef.current=null;playerPathWaitRef.current=null;playerPathStuckRef.current=null;},
      getTransients:()=>transientActorsRef.current.map(t=>({id:t.id,kind:t.kind,name:t.name,x:t.x,y:t.y,state:t.state,slotId:t.slotId,exit:t.exit})),
      spawnTransient:(kind:'traveler'|'adventurer')=>{if(WILDERNESS_ONLY)return null;const live=transientActorsRef.current;const s=spawnTransient(world,kind,new Set(live.map(t=>t.name)),new Set(live.map(t=>t.slotId)),transientTickRef.current,stateRef.current.position,false);if(s){transientActorsRef.current=[...live,s];return s.id;}return null;},
      // BUILD 1013 test hooks (probes only — no gameplay effect):
      // read animals, force-spawn one (bypasses pacing + the
      // out-of-view rule so probes can watch it, but never the caps
      // or slot uniqueness), teleport one (drops the cached A* path,
      // the 999 lesson), and read its render position (floats, with
      // flight height h for birds).
      getAnimals:()=>animalActorsRef.current.map(a=>({id:a.id,kind:a.kind,x:a.x,y:a.y,state:a.state,hp:a.hp,slotId:a.slotId,flightTo:a.flightTo})),
      // BUILD 1102 test hooks (probes only — no gameplay effect):
      // the pen (site state + flock + wool + last fed day), the
      // hunting picture (nearest prey per kind from the player,
      // live huntable counts, populations, hunter work states),
      // and the fishing picture (fish population, live fish, the
      // nearest bank tile from the player).
      getPen:()=>({state:penRef.current.site.state,progress:penRef.current.site.progress,spentWood:penRef.current.site.spentWood,flock:penRef.current.flock,woolReady:penRef.current.woolReady,fedDay:penRef.current.fedDay,stocked:penRef.current.stocked}),
      getHunting:()=>{const w=stateRef.current.world;const p=stateRef.current.position;const from={x:Math.round(p.x),y:Math.round(p.y)};return {prey:HUNTABLE_KINDS.map(k=>{const t=simPreyFor(w,k,from,PLAZA_3D);return {kind:k,nearest:t?Math.round(Math.hypot(t.x-from.x,t.y-from.y)):null,live:animalActorsRef.current.filter(a=>a.kind===k).length,population:populationFor(w,k)??0};}),hunters:foundersRef.current.filter(f=>f.profession==='hunter').map(f=>({name:f.name,workState:f.workState}))};},
      getFish:()=>{const w=stateRef.current.world;const p=stateRef.current.position;const from={x:Math.round(p.x),y:Math.round(p.y)};return {population:populationFor(w,'fish')??0,live:animalActorsRef.current.filter(a=>a.kind==='fish').length,bank:nearestBankTile(w,from,PLAZA_3D),fishers:foundersRef.current.filter(f=>f.profession==='fisher').map(f=>({name:f.name,workState:f.workState}))};},
      spawnAnimal:(kind:'bird'|'goat'|'deer'|'wolf'|'chicken'|'rabbit'|'boar'|'elk'|'fox'|'bear'|'fish')=>{const live=animalActorsRef.current;const cap=kind==='bird'?MAX_BIRDS:kind==='goat'?MAX_GOATS:kind==='deer'?MAX_DEER:kind==='wolf'?MAX_WOLVES:kind==='rabbit'?MAX_RABBITS:kind==='boar'?MAX_BOARS:kind==='elk'?MAX_ELK:kind==='fox'?MAX_FOXES:kind==='bear'?MAX_BEARS:kind==='fish'?MAX_FISH:MAX_CHICKENS;if(live.filter(a=>a.kind===kind).length>=cap)return null;const s=spawnAnimal(world,kind,new Set(live.map(a=>a.slotId)),new Set(live.map(a=>a.x+','+a.y)),stateRef.current.position,staticAnchors.plaza,false);if(s){animalActorsRef.current=[...live,s];return s.id;}return null;},
      setAnimalPos:(id:string,tx:number,ty:number)=>{const a=animalActorsRef.current.find(x=>x.id===id);if(a){a.x=tx;a.y=ty;npcSimState.animalPath.delete(id);return true;}return false;},
      getAnimalRenderPos:(id:string)=>{const r=renderer.animalRender.get(id);return r?{x:r.x,y:r.y,h:r.h}:null;},
      // BUILD 1057 test hooks (probes only — no gameplay effect):
      // read founders (name, tile, activity, work state, carrying,
      // chop progress, needs, and the shared stockpile/food counts),
      // teleport one (drops the cached founder path, the 999 lesson),
      // set needs (to force eat/sleep/rest without waiting for
      // decay), and read its render position (floats).
      getFounders:()=>foundersRef.current.map(f=>{const j=jobForFounder(jobBoardRef.current,f.id);return {id:f.id,name:f.name,profession:f.profession,x:f.x,y:f.y,activity:f.activity,workState:f.workState,bed:f.bed,carrying:f.carrying,carryingGrain:f.carryingGrain,carryingStone:f.carryingStone,carryingBuild:f.carryingBuild,carryingWater:f.carryingWater,carryingOre:f.carryingOre,mineTicks:f.mineTicks,harvestTicks:f.harvestTicks,chopTicks:f.chopTicks,buildTicks:f.buildTicks,hunger:Math.round(f.needs.hunger),energy:Math.round(f.needs.energy),social:Math.round(f.needs.social),health:Math.round(f.needs.health),stockpileWood:campWoodInRegistry(registryRef.current),foodStock:campFoodInRegistry(registryRef.current),grainStock:campGrainInRegistry(registryRef.current),stoneStock:campStoneInRegistry(registryRef.current),jobId:j?j.id:null,jobKind:j?j.kind:null,jobTarget:j?j.targetId:null};}),
      // BUILD 1065 (J-1): the job board for the probe — the summary
      // counts plus every live job (id, kind, target, tile, state,
      // claim). Read-only.
      getJobs:()=>{const s=jobSummary(jobBoardRef.current);return {...s,jobs:Object.values(jobBoardRef.current.jobs).map(j=>({id:j.id,kind:j.kind,targetId:j.targetId,tile:j.tile,state:j.state,claimedBy:j.claimedBy}))};},
      setFounderPos:(name:string,tx:number,ty:number)=>{const f=foundersRef.current.find(x=>x.name===name);if(f){f.x=tx;f.y=ty;founderPath.delete(name);return true;}return false;},
      setFounderNeeds:(name:string,hunger:number,energy:number,social:number)=>{const f=foundersRef.current.find(x=>x.name===name);if(f){f.needs={hunger,energy,social,health:f.needs.health};return true;}return false;},
      // BUILD 1060 test hooks (probes only — no gameplay effect):
      // read each founder's social state (affinity + memories +
      // closest companion at the current day) and set one affinity
      // (probe setup — lets a probe give two founders a history
      // without waiting for days of shared meals).
      getFounderSocial:()=>foundersRef.current.map(f=>({name:f.name,affinity:{...f.social.affinity},affinityDay:{...f.social.affinityDay},memories:f.social.memories.map(m=>({...m})),closest:closestFounder(f.social,clockRef.current.day)})),
      setFounderAffinity:(name:string,other:string,value:number)=>{const f=foundersRef.current.find(x=>x.name===name);if(!f||!ALL_SETTLER_NAMES.includes(other)||other===name)return false;f.social={...f.social,affinity:{...f.social.affinity,[other]:Math.max(0,Math.min(100,Math.round(value)))},affinityDay:{...f.social.affinityDay,[other]:clockRef.current.day}};return true;},
      getFounderRenderPos:(name:string)=>{const r=renderer.npcRender.get('founder:'+name);return r?{x:r.x,y:r.y}:null;},
      // BUILD 1058 test hooks (probes only — no gameplay effect):
      // read the hut construction (state/progress/wood spent +
      // whether the hut placement exists), and seed the stockpile
      // (probe setup only — the game itself only ever changes the
      // pile by delivery or by a build step).
      getConstruction:()=>({...constructionRef.current,sites:sitesOf(constructionRef.current).map((s,i)=>({id:HUT_SITES[i]?HUT_SITES[i].id:'hut-site-'+i,state:s.state,progress:s.progress,spentWood:s.spentWood,stages:s.stages})),hutPlaced:hutPlacementExists(world),hutId:hutPlacementId(world),hutRect:{...HUT_RECT},door:{...HUT_DOOR},approach:{...HUT_APPROACH}}),
      // BUILD 1087 (2.2) test hooks (probes only — no gameplay effect):
      // the storehouse state + counts, setters for the store (probe
      // setup — the game itself only ever changes the store by
      // delivery or by a build step), and a reset for one hut site
      // (removes its placement and resets the site, so the founders
      // rebuild it — the probe uses it to watch a hut rebuild draw
      // from the storehouse). The reset is probe-only: a removed hut
      // leaves its residents' beds in the open until it rebuilds.
      getStorehouse:()=>({state:storehouseRef.current.state,progress:storehouseRef.current.progress,spentWood:storehouseRef.current.spentWood,spentStone:storehouseRef.current.spentStone,wood:storehouseWoodInRegistry(registryRef.current),stone:storehouseStoneInRegistry(registryRef.current),iron:storehouseOreInRegistry(registryRef.current,'iron'),placed:storehousePlacementExists(stateRef.current.world),placedId:storehousePlacementId(stateRef.current.world),centre:{...STOREHOUSE_CENTRE},rect:{...STOREHOUSE_RECT},door:{...STOREHOUSE_DOOR},approach:{...STOREHOUSE_APPROACH}}),
      // BUILD 1088 (2.3): the path layer (probes only) — the dirt path
      // tiles on the world, the camp well, the bridge sites, and how
      // many tiles have any traffic (the session-only counts).
      getPaths:()=>({tiles:pathTiles(stateRef.current.world),well:wellTile(stateRef.current.world,FOUNDER_CAMP.x,FOUNDER_CAMP.y),bridges:pathsRef.current.bridges.map(b=>({...b,workTile:{...b.workTile}})),trafficTiles:Object.keys(pathsRef.current.traffic).length}),
      // BUILD 1089 (2.4): the mine / quarry / lumber sites (probes
      // only) — the designations, their state, and the one-line
      // summary (the HUD / E report text). Read-only.
      getMines:()=>({mines:minesRef.current.mines.map(m=>({...m,workTile:{...m.workTile}})),quarry:minesRef.current.quarry?{...minesRef.current.quarry,centre:{...minesRef.current.quarry.centre}}:null,lumber:minesRef.current.lumber?{...minesRef.current.lumber,rect:{...minesRef.current.lumber.rect}}:null,lastDesignateDay:minesRef.current.lastDesignateDay,summary:mineSummaryText(minesRef.current,stateRef.current.world,registryRef.current)}),
      // BUILD 1094 (3.3): the food chain (probes only) — the mill +
      // the bakery state + progress, their placements, and the flour
      // in the granary. Read-only.
      getFoodChain:()=>({mill:{...foodChainRef.current.mill,centre:{...MILL_CENTRE},rect:{...MILL_RECT},door:{...MILL_DOOR},approach:{...MILL_APPROACH},placed:millPlacementExists(stateRef.current.world)},bakery:{...foodChainRef.current.bakery,centre:{...BAKERY_CENTRE},rect:{...BAKERY_RECT},door:{...BAKERY_DOOR},approach:{...BAKERY_APPROACH},placed:bakeryPlacementExists(stateRef.current.world)},flour:granaryFlourInRegistry(registryRef.current),grain:campGrainInRegistry(registryRef.current),food:campFoodInRegistry(registryRef.current),placedWindmills:placedWindmillRects(stateRef.current.world).length}),
      // BUILD 1095 (3.4): the metal + timber chain (probes only) — the
      // five buildings' state + progress, their placements, the
      // storehouse counts, and the workshop stall reason (null when
      // the workshop is not stalled). Read-only.
      getMetalChain:()=>({smelter:{...metalChainRef.current.smelter,centre:{...SMELTER_CENTRE},rect:{...SMELTER_RECT},door:{...SMELTER_DOOR},approach:{...SMELTER_APPROACH},placed:smelterPlacementExists(stateRef.current.world)},blacksmith:{...metalChainRef.current.blacksmith,centre:{...BLACKSMITH_CENTRE},rect:{...BLACKSMITH_RECT},door:{...BLACKSMITH_DOOR},approach:{...BLACKSMITH_APPROACH},placed:blacksmithPlacementExists(stateRef.current.world)},sawmill:{...metalChainRef.current.sawmill,centre:{...SAWMILL_CENTRE},rect:{...SAWMILL_RECT},door:{...SAWMILL_DOOR},approach:{...SAWMILL_APPROACH},placed:sawmillPlacementExists(stateRef.current.world)},carpenter:{...metalChainRef.current.carpenter,centre:{...CARPENTER_CENTRE},rect:{...CARPENTER_RECT},door:{...CARPENTER_DOOR},approach:{...CARPENTER_APPROACH},placed:carpenterPlacementExists(stateRef.current.world)},workshop:{...metalChainRef.current.workshop,centre:{...WORKSHOP_CENTRE},rect:{...WORKSHOP_RECT},door:{...WORKSHOP_DOOR},approach:{...WORKSHOP_APPROACH},placed:workshopPlacementExists(stateRef.current.world)},ingots:metalChainIngotsInRegistry(registryRef.current),tools:metalChainToolsInRegistry(registryRef.current),timber:metalChainTimberInRegistry(registryRef.current),furniture:metalChainFurnitureInRegistry(registryRef.current),coal:metalChainCoalInRegistry(registryRef.current),iron:storehouseOreInRegistry(registryRef.current,'iron'),stall:workshopStallReason(metalChainRef.current,foodChainRef.current.bakery.state==='done',campWoodInRegistry(registryRef.current),metalChainToolsInRegistry(registryRef.current))}),
      // BUILD 1096 (3.5): the housing (probes only) — the
      // capacity (beds free/total), the inn's state + progress +
      // placement + food, and the market-stall listing. Read-only.
      getHousing:()=>({capacity:housingCapacity(constructionRef.current),bedsFree:Math.max(0,housingCapacity(constructionRef.current)-foundersRef.current.length),founders:foundersRef.current.length,night:nightSleepers(foundersRef.current,constructionRef.current)}),
      // BUILD 1100 (0x23, Phase 4.2): the settlement plan (probes
      // only) — the Mayor's pick + the Architect's site + the
      // reasons, or null when nothing is startable. Read-only.
      getSitePlan:()=>sitePlanRef.current?JSON.parse(JSON.stringify(sitePlanRef.current)):null,
      // BUILD 1101 (0x24, Phase 4.3): start a founding party in the
      // wilds (probe-only). Returns the chosen site + reasons, or
      // null when no site passes the survey. Read-only otherwise.
      startFounding:()=>{const f=createFoundingSim(stateRef.current.world,existingRectsForFounding(stateRef.current.world,constructionRef.current,storehouseRef.current,foodChainRef.current,metalChainRef.current,housingRef.current));foundingRef.current=f;return f.site?{centre:{...f.site.centre},score:f.site.score,reasons:[...f.site.reasons]}:null;},
      getFounding:()=>foundingRef.current?JSON.parse(JSON.stringify(foundingRef.current)):null,
      getInn:()=>({inn:{...housingRef.current.inn,centre:{...INN_CENTRE},rect:{...INN_RECT},door:{...INN_DOOR},approach:{...INN_APPROACH},placed:innPlacementExists(stateRef.current.world)},food:innFoodInRegistry(registryRef.current)}),
      getMarketStall:()=>({tile:{...MARKET_STALL_TILE},listing:marketStallListing(registryRef.current)}),
      setStorehouseWood:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,STOREHOUSE_STORE_ID,'wood',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...STOREHOUSE_APPROACH},capacity:STOREHOUSE_CAPACITY_WOOD});refreshResourceUi();return storehouseWoodInRegistry(registryRef.current);},
      setStorehouseStone:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,STOREHOUSE_STORE_ID,'stone',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...STOREHOUSE_APPROACH},capacity:STOREHOUSE_CAPACITY_STONE});refreshResourceUi();return storehouseStoneInRegistry(registryRef.current);},
      setStorehouseIron:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,STOREHOUSE_STORE_ID,'iron',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...STOREHOUSE_APPROACH},capacity:STOREHOUSE_CAPACITY_ORE});refreshResourceUi();return storehouseOreInRegistry(registryRef.current,'iron');},
      resetHutForTest:(siteId:string)=>{const w=stateRef.current.world;const idx=HUT_SITES.findIndex(s=>s.id===siteId);if(idx<0)return false;const site=HUT_SITES[idx];w.placements=(w.placements??[]).filter(p=>!(p.kind==='house'&&p.x0===site.rect.x0&&p.y0===site.rect.y0&&p.x1===site.rect.x1&&p.y1===site.rect.y1));const sites=sitesOf(constructionRef.current).map((s,j)=>j===idx?{state:'none' as const,progress:0,spentWood:0}:{...s});constructionRef.current=constructionFromSites(sites);for(const f of foundersRef.current)if(f.workState==='toSite'||f.workState==='building'){f.workState='toTree';f.buildTicks=0;}commitWorld(worldSyncCtx,w);refreshResourceUi();return true;},
      // BUILD 1062 test hooks (probes only — no gameplay effect): the
      // living-world coordinator state (day advanced, forest density
      // from the real tree count, trees regrown, camp ledger, latest
      // event), the stored tree count, and the nearest tree (probe
      // setup — lets a probe walk the player to a tree and chop it).
      getLivingWorld:()=>{const s=livingWorldRef.current;return s?livingWorldSummary(s,stateRef.current.world.trees.length,clockRef.current.day):null;},
      getTreeCount:()=>stateRef.current.world.trees.length,
      getNearestTree:(x:number,y:number)=>nearestTreeTile(stateRef.current.world,Math.round(x),Math.round(y),FOUNDER_WORK_RADIUS),
      // BUILD 1064 (R-1): the registry read (probes only) — the
      // player store, the camp store, the carrier stores, the world
      // deposits still standing, and the totals a scheduler asks.
      getResourceRegistry:()=>({player:{wood:storeQty(registryRef.current,PLAYER_STORE_ID,'wood'),stone:storeQty(registryRef.current,PLAYER_STORE_ID,'stone'),gold:storeQty(registryRef.current,PLAYER_STORE_ID,'gold'),grain:storeQty(registryRef.current,PLAYER_STORE_ID,'grain')},camp:{wood:campWoodInRegistry(registryRef.current),food:campFoodInRegistry(registryRef.current),grain:campGrainInRegistry(registryRef.current),stone:campStoneInRegistry(registryRef.current)},granary:{grain:campGrainInRegistry(registryRef.current),food:campFoodInRegistry(registryRef.current),flour:granaryFlourInRegistry(registryRef.current)},storehouse:{wood:storehouseWoodInRegistry(registryRef.current),stone:storehouseStoneInRegistry(registryRef.current),iron:storehouseOreInRegistry(registryRef.current,'iron')},carried:foundersRef.current.map(f=>({id:f.id,wood:storeQty(registryRef.current,'carrier:'+f.id,'wood'),grain:storeQty(registryRef.current,'carrier:'+f.id,'grain'),stone:storeQty(registryRef.current,'carrier:'+f.id,'stone'),iron:storeQty(registryRef.current,'carrier:'+f.id,'iron')})),deposits:{wood:depositsOfKind(registryRef.current,'wood').length,stone:depositsOfKind(registryRef.current,'stone').length},totalWoodAvailable:totalAvailable(registryRef.current,'wood'),totalStoneAvailable:totalAvailable(registryRef.current,'stone')}),
      setStockpileWood:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,CAMP_STORE_ID,'wood',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...FOUNDER_STOCKPILE_TILE}});refreshResourceUi();return campWoodInRegistry(registryRef.current);},
      setFoodStock:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,GRANARY_STORE_ID,'food',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...FOUNDER_EAT_TILE},capacity:60});refreshResourceUi();return campFoodInRegistry(registryRef.current);},
      setCampGrain:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,GRANARY_STORE_ID,'grain',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...FOUNDER_CAMP_CENTRE},capacity:200});refreshResourceUi();return campGrainInRegistry(registryRef.current);},
      setCampFlour:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,GRANARY_STORE_ID,'flour',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...FOUNDER_CAMP_CENTRE},capacity:GRANARY_CAPACITY_FLOUR});refreshResourceUi();return granaryFlourInRegistry(registryRef.current);},
      // BUILD 1095 (3.4): the chain setters (probes only) — the
      // storehouse store's coal / ingots / tools / timber /
      // furniture, so a probe can seed the smelter's inputs, the
      // blacksmith's ingots, the workshop's tools, and the
      // carpenter's timber without waiting for the mines.
      setCampCoal:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,STOREHOUSE_STORE_ID,'coal',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...STOREHOUSE_APPROACH},capacity:STOREHOUSE_CAPACITY_COAL});refreshResourceUi();return metalChainCoalInRegistry(registryRef.current);},
      setCampIngots:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,STOREHOUSE_STORE_ID,'ingot',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...STOREHOUSE_APPROACH},capacity:STOREHOUSE_CAPACITY_INGOT});refreshResourceUi();return metalChainIngotsInRegistry(registryRef.current);},
      setCampTools:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,STOREHOUSE_STORE_ID,'tools',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...STOREHOUSE_APPROACH},capacity:STOREHOUSE_CAPACITY_TOOL});refreshResourceUi();return metalChainToolsInRegistry(registryRef.current);},
      setCampTimber:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,STOREHOUSE_STORE_ID,'timber',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...STOREHOUSE_APPROACH},capacity:STOREHOUSE_CAPACITY_TIMBER});refreshResourceUi();return metalChainTimberInRegistry(registryRef.current);},
      setCampFurniture:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,STOREHOUSE_STORE_ID,'furniture',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...STOREHOUSE_APPROACH},capacity:STOREHOUSE_CAPACITY_FURNITURE});refreshResourceUi();return metalChainFurnitureInRegistry(registryRef.current);},
      setCampStone:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,CAMP_STORE_ID,'stone',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...FOUNDER_STOCKPILE_TILE}});refreshResourceUi();return campStoneInRegistry(registryRef.current);},
      setCampWood:(n:number)=>{registryRef.current=setStoreQty(registryRef.current,CAMP_STORE_ID,'wood',Math.max(0,Math.round(n)),{type:'loaded'},{location:{...FOUNDER_STOCKPILE_TILE}});refreshResourceUi();return campWoodInRegistry(registryRef.current);},
      // BUILD 1081 (1.2): mineral deposits (probes only) — the live
      // deposit list, and a debug depletion path (Phase 2 owns real
      // mining; this hook proves a mined-out deposit stays mined-out
      // across reload). Depleting updates the world save, the
      // registry entry, and the rebuild flag.
      getDeposits:()=>JSON.parse(JSON.stringify(stateRef.current.world.mineralDeposits??[])),
      getRivers:()=>JSON.parse(JSON.stringify(stateRef.current.world.rivers??[])),
      // BUILD 1084 (1.5): climate (probes only) — the season, the
      // temperature + rainfall at the camp, and the live growth
      // and activity factors.
      getClimate:()=>{const w=stateRef.current.world;const day=clockRef.current.day;const s=seasonForDay(day);return {season:s,label:seasonLabel(s),day,temperatureC:temperatureAt(w,day,FOUNDER_CAMP.x,FOUNDER_CAMP.y),rainfallMm:rainfallAt(w,day,FOUNDER_CAMP.x,FOUNDER_CAMP.y),growthFactor:seasonGrowthFactor(s),activityFactor:animalActivityFactor(s)};},
      depleteDeposit:(id:string,qty:number)=>{const w=stateRef.current.world;const res=applyDepletion((w.mineralDeposits??[]) as unknown as MineralDeposit[],id,qty);if(!res.depleted)return null;w.mineralDeposits=res.deposits;if(res.depleted.remaining<=0){registryRef.current=extractDeposit(registryRef.current,id).registry;}else{registryRef.current=addDeposit(registryRef.current,mineralDepositEntry(res.depleted));}commitWorld(worldSyncCtx,w);return JSON.parse(JSON.stringify(res.depleted));},
      // BUILD 1085 (1.6) test hooks (probes only — no gameplay effect):
      // the ecosystem state (saplings + animal populations + recorded
      // kills — the numbers the acceptance test asserts on) and a way
      // to record a hunting kill for a species. Deer are not
      // player-killable yet (hunting as a profession is Phase 4), so
      // the probe drives the deer-hunting leg through this hook — the
      // same record a Phase 4 hunt will write.
      getEcosystem:()=>({saplings:JSON.parse(JSON.stringify(stateRef.current.world.saplings??[])),populations:JSON.parse(JSON.stringify(stateRef.current.world.animalPopulations??[])),kills:{...(stateRef.current.world.animalKills??{})}}),
      recordHuntingKill:(kind:string)=>{const w=stateRef.current.world;recordAnimalKill(w,kind);commitWorld(worldSyncCtx,w);return w.animalKills?.[kind]??0;},
      // BUILD 1000: teleport a transient (probes only — lets a probe
      // place an adventurer beside the plaza to watch its pause +
      // exit without a 90s walk). Drops the cached A* path, the 999
      // lesson: absolute path tiles would snap it back otherwise.
      setTransientPos:(id:string,tx:number,ty:number)=>{const t=transientActorsRef.current.find(x=>x.id===id);if(t){t.x=tx;t.y=ty;npcSimState.transientPath.delete(id);return true;}return false;},
      // BUILD 1000: cached-path inspector (probes only — distinguishes
      // a sealed route (path []) from an occupied deadlock (path with
      // a stuck index) when a transient is not advancing).
      debugTransient:(id:string)=>{const t=transientActorsRef.current.find(x=>x.id===id);const p=npcSimState.transientPath.get(id);return t?{exit:t.exit,path:p?p.path:null,index:p?p.index:null,blockedTicks:p?p.blockedTicks:null,noPathTicks:p?p.noPathTicks:null,state:t.state}:null;},
      forceBark:(name:string)=>{const clock=clockRef.current;const res=npcActorsRef.current.find(n=>n.name===name);if(res){const line=barkLineFor('resident',rosterArchetype(name),clock.minutes,name,clock.day);setMessage(name+': '+line);return line;}const tr=transientActorsRef.current.find(t=>t.name===name);if(tr){const line=barkLineFor(tr.kind,null,clock.minutes,name,clock.day);setMessage(name+': '+line);return line;}return null;},
      // BUILD 989 refinement: project a tile centre to container pixel
      // coordinates (same math as the Remove aiming preview), so the
      // browser harness can tap/drag exact tiles instead of guessing
      // pixel offsets. Test-only; no gameplay effect.
      projectTile:(tx:number,ty:number)=>renderer.projectTileCenter(tx,ty),
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
    renderer.start();
    // BUILD 993: the day clock advances 1 game minute per real second
    // while the view is mounted, persisted so phases survive reloads.
    // BUILD 1070 (0x0D, area 1): the 3D world simulation lives in
    // worldSimulation3d.ts now — the founder tick, the clock, the
    // founder interval, and the wait-step simulation. The view builds
    // the simulation context once (the refs + the world + the
    // callbacks the tick needs) and the timers call into it.
    const founderPath=new Map<string,FounderPathState>();
    const simCtx: FounderSimContext = {
      world,
      clock: clockRef,
      founders: foundersRef,
      construction: constructionRef,
      storehouse: storehouseRef,
      paths: pathsRef,
      mines: minesRef,
      foodChain: foodChainRef,
      metalChain: metalChainRef,
      housing: housingRef,
      sitePlan: sitePlanRef,
      pen: penRef,
      animals: animalActorsRef,
      founding: foundingRef,
      registry: registryRef,
      jobBoard: jobBoardRef,
      founderPath,
      getPlayerPos: () => stateRef.current.position,
      npcActors: npcActorsRef,
      waiting: waitingRef,
      needsWorldRebuild,
      setMessage,
      setClockUi,
      refreshResourceUi,
      syncLivingWorld,
    };
    const npcSimCtx: NpcSimContext = {
      world,
      staticAnchors,
      clock: clockRef,
      getPlayerPos: () => stateRef.current.position,
      health: healthRef,
      npcActors: npcActorsRef,
      transientActors: transientActorsRef,
      animalActors: animalActorsRef,
      transientTick: transientTickRef,
      animalTick: animalTickRef,
      renderer,
      npcSaveKey: NPC_SAVE_KEY,
      healthKey: HEALTH_KEY,
      setHealth,
      setMessage,
    };
    const npcSimState = createNpcSimState();
    const stopNpcSim = startNpcSimTimers(npcSimCtx, npcSimState);
    const clockTimer=window.setInterval(()=>{advanceWorldSimClock(simCtx);},1000);
    // BUILD 1057: founder life — the first NPCs of the empty world.
    // One 900ms tick, the resident pattern: needs decay from elapsed
    // GAME minutes (clock-driven, not tick-driven — the 1056 wait
    // steps the clock, so this tick pauses during a wait and the
    // wait's own step function advances needs instead), activity
    // re-chosen by the utility scorer (BUILD 1059 — the 1057 fixed
    // priority is gone), then the activity executes: sleep/eat/
    // rest walk to the camp; work walks to a tree, chops 3 ticks,
    // carries 2 wood to the stockpile. The stockpile count goes up
    // ONLY on a delivery. A felled tree leaves world.trees (or
    // removedWildTrees) with a world rebuild, exactly like the
    // player's E-key chop, so the player sees it fall and cannot chop
    // the same tree twice. NOTHING here touches NPC_SAVE_KEY:
    // founders save to ag-3d-founders-v1, and the old roster is
    // never read or written.
    // BUILD 1068 (0x08): the founder tick body, extracted so the
    // sim-speed control can run it N times per 900ms interval (the sim
    // advances in larger steps per tick at high speeds — it does not
    // run 100 ticks per second). Needs decay is clock-driven (elapsed
    // from nowAbs), so extra sub-steps do not double-decay it;
    // movement/progress advance per sub-step. The founders save is
    // written once per interval, after all sub-steps (not per sub-step).
    const founderTimer=window.setInterval(()=>{runFounderSimInterval(simCtx);},900);

    return()=>{if(waitTimerRef.current!==null){window.clearInterval(waitTimerRef.current);waitTimerRef.current=null;}waitingRef.current=false;renderer.stop();stopNpcSim();window.clearInterval(founderTimer);window.clearInterval(clockTimer);window.removeEventListener('keydown',controls.keydown);window.removeEventListener('keyup',controls.keyup);window.removeEventListener('pointerup',sprintWinUp);window.removeEventListener('pointercancel',sprintWinCancel);window.removeEventListener('touchend',sprintWinTouchEnd);window.removeEventListener('blur',sprintWinBlur);window.removeEventListener('keydown',controls.action);window.removeEventListener('touchmove',stopTouch);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointermove',hover);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',controls.wheel);canvas.removeEventListener('contextmenu',cancelOnContextMenu);html.style.overflow=oldHtml.overflow;html.style.touchAction=oldHtml.touchAction;html.style.overscrollBehavior=oldHtml.overscrollBehavior;body.style.overflow=oldBody.overflow;body.style.touchAction=oldBody.touchAction;body.style.overscrollBehavior=oldBody.overscrollBehavior;body.style.position=oldBody.position;body.style.width=oldBody.width;renderer.dispose();};
  },[]);
  const move=(dx:number,dy:number)=>{const world=stateRef.current.world;const p=stateRef.current.position;const length=Math.hypot(dx,dy)||1;const target={x:Math.max(0,Math.min(world.w-1,p.x+dx/length*3)),y:Math.max(0,Math.min(world.h-1,p.y+dy/length*3))};if(walkableWithPlacements(world,world.crates,Math.round(target.x),Math.round(target.y))){try{localStorage.setItem(SAVE_KEY,JSON.stringify(target))}catch{}stateRef.current.position=target;setPosition(target);markWorldDirty(worldSyncCtx) }};
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
    {!hideUi && <HudStrip message={message} clockUi={clockUi} health={health} staminaUi={staminaUi} sprintingUi={sprintingUi} sprintLatchedUi={sprintLatchedUi} sprintRearmUi={sprintRearmUi} inventory={inventory} campUi={campUi} onWaitToggle={()=>setWaitSheetOpen(v=>!v)} onSprintPointerDown={(e)=>{sprintPointerIdRef.current=e.pointerId;sprintDownRef.current={t:performance.now(),x:e.clientX,y:e.clientY};sprintHeldRef.current=true;}} onSprintPointerUp={(e)=>releaseSprintPointer(sprintCtx,e.pointerId,e.clientX,e.clientY,true)} onSprintPointerCancel={(e)=>releaseSprintPointer(sprintCtx,e.pointerId,e.clientX,e.clientY,false)} />}
    {/* BUILD 1056: wait sheet — the 2D wait options on the 3D clock.
        A centred panel (the sheet covers the canvas, so taps land on it,
        not the field). The progress panel shows the live clock as it
        fast-forwards, so the player watches time pass. */}
    {waitSheetOpen && !waitProgress && (<WaitSheet clockUi={clockUi} onStartWait={startWait} onClose={()=>setWaitSheetOpen(false)} />)}
    {waitProgress && (<WaitProgress progress={waitProgress} clockUi={clockUi} onCancel={()=>cancelWait('cancelled')} />)}
    {/* BUILD 1053: 3D minimap, top-left — the only free corner (see the
        Minimap3D component above for the layout audit). Hidden inside
        a hut and while Hide UI is on, like the 2D minimap's hide
        rules; there is no world-map overlay in the 3D view. */}
    {shouldShowMinimap3d({ insideHut: !!insideHut, hideUi, mapOpen }) && (
      <Minimap3D world={stateRef.current.world} playerX={position.x} playerY={position.y} npcsRef={npcActorsRef} foundersRef={foundersRef} car={car} onTapTravel={(dest) => { travelRequestRef.current?.(dest); }} />
    )}
    {/* BUILD 1055: Map button — below the minimap (left:12, top:140:
        minimap top 12 + 120px + 8 gap), the only free slot in the
        top-left corner. A control button, so it stays visible like
        Build/Exit 3D (inside huts, with Hide UI on). Toggles the
        overworld-map overlay. */}
    <TopLeftButtons onToggleMap={()=>setMapOpen(v=>!v)} onToggleControl={()=>setControlOpen(v=>!v)} />
    {mapOpen && (
      <WorldMap3D world={stateRef.current.world} playerX={position.x} playerY={position.y} day={clockRef.current.day} onClose={()=>setMapOpen(false)} onTapTravel={(dest) => { travelRequestRef.current?.(dest); }} />
    )}
    {/* BUILD 1068 (0x08): Control Center button — below the Map button
        (top:188: Map top 140 + ~40px + 8 gap), same control-button
        pattern. Opens the World Simulation Control Center panel, which
        reads the live coordinator + registry state. */}
    {controlOpen && (
      <ControlCenterPanel onClose={()=>setControlOpen(false)} getData={()=>{
        const clock=clockRef.current;
        const nowAbs=founderAbsMinutes(clock.day,clock.minutes);
        const board=jobBoardRef.current;
        const reg=registryRef.current;
        const lw=livingWorldRef.current?livingWorldSummary(livingWorldRef.current,stateRef.current.world.trees.length,clock.day):null;
        const farmTiles=placedFarmTiles(stateRef.current.world);
        const farm={planted:0,growing:0,ready:0};
        for(const t of farmTiles){const s=farmStageAt(t.plantedAt,nowAbs,growthFactorAt(stateRef.current.world,clock.day,t.tx,t.ty));farm[s]++;}
        return formatControlCenterData({
          speed:getSimSpeed(),day:clock.day,minutes:clock.minutes,
          founders:foundersRef.current.map(f=>{const j=jobForFounder(board,f.id);return {id:f.id,name:f.name,profession:professionLabel(f.profession),activity:f.activity,workState:f.workState,health:Math.round(f.needs.health),hunger:Math.round(f.needs.hunger),energy:Math.round(f.needs.energy),social:Math.round(f.needs.social),jobKind:j?j.kind:null,jobTarget:j?j.targetId:null,carrying:f.carrying,carryingGrain:f.carryingGrain,carryingStone:f.carryingStone,carryingOre:f.carryingOre};}),
          sites:[...sitesOf(constructionRef.current).map((s,i)=>({id:HUT_SITES[i]?HUT_SITES[i].id:'hut-site-'+i,state:s.state,progress:s.progress,spentWood:s.spentWood})),...(penRef.current.site.state!=='none'?[{id:'pen-site',state:penRef.current.site.state,progress:penRef.current.site.progress,spentWood:penRef.current.site.spentWood}]:[])],
          hutDone:!hasUnfinishedSite(constructionRef.current),
          camp:{wood:campWoodInRegistry(reg),food:campFoodInRegistry(reg),grain:campGrainInRegistry(reg),flour:granaryFlourInRegistry(reg),stone:campStoneInRegistry(reg)},
          foodChain:{mill:{state:foodChainRef.current.mill.state,progress:foodChainRef.current.mill.progress},bakery:{state:foodChainRef.current.bakery.state,progress:foodChainRef.current.bakery.progress}},
          metalChain:{smelter:{state:metalChainRef.current.smelter.state,progress:metalChainRef.current.smelter.progress},blacksmith:{state:metalChainRef.current.blacksmith.state,progress:metalChainRef.current.blacksmith.progress},sawmill:{state:metalChainRef.current.sawmill.state,progress:metalChainRef.current.sawmill.progress},carpenter:{state:metalChainRef.current.carpenter.state,progress:metalChainRef.current.carpenter.progress},workshop:{state:metalChainRef.current.workshop.state,progress:metalChainRef.current.workshop.progress},workshopStall:workshopStallReason(metalChainRef.current,foodChainRef.current.bakery.state==='done',campWoodInRegistry(reg),metalChainToolsInRegistry(reg))},
          housing:{capacity:housingCapacity(constructionRef.current),bedsFree:Math.max(0,housingCapacity(constructionRef.current)-foundersRef.current.length),inn:{state:housingRef.current.inn.state,progress:housingRef.current.inn.progress,food:innFoodInRegistry(reg)},stall:marketStallListing(reg)},
          sitePlan:sitePlanRef.current,
          founding:foundingRef.current,
          animals:{pen:{state:penRef.current.site.state,progress:penRef.current.site.progress,flock:penRef.current.flock,woolReady:penRef.current.woolReady,fedDay:penRef.current.fedDay},populations:ANIMAL_KINDS_3D.map(k=>({kind:k,population:populationFor(stateRef.current.world,k)??0,capacity:populationParamsFor3D(k)?.carryingCapacity??0})),workers:animalWorkersFor(foundersRef.current).map(f=>({name:f.name,profession:professionLabel(f.profession),workState:f.workState})),meat:granaryMeatInRegistry(reg),fish:granaryFishInRegistry(reg),wool:storehouseWoolInRegistry(reg),leather:storehouseLeatherInRegistry(reg)},
          storehouse:{state:storehouseRef.current.state,progress:storehouseRef.current.progress,wood:storehouseWoodInRegistry(reg),stone:storehouseStoneInRegistry(reg),iron:storehouseOreInRegistry(reg,'iron'),coal:metalChainCoalInRegistry(reg),ingots:metalChainIngotsInRegistry(reg),tools:metalChainToolsInRegistry(reg),timber:metalChainTimberInRegistry(reg),furniture:metalChainFurnitureInRegistry(reg)},
          player:{wood:storeQty(reg,PLAYER_STORE_ID,'wood'),stone:storeQty(reg,PLAYER_STORE_ID,'stone'),gold:storeQty(reg,PLAYER_STORE_ID,'gold'),grain:storeQty(reg,PLAYER_STORE_ID,'grain')},
          carried:foundersRef.current.map(f=>({id:f.id,wood:storeQty(reg,'carrier:'+f.id,'wood'),grain:storeQty(reg,'carrier:'+f.id,'grain'),stone:storeQty(reg,'carrier:'+f.id,'stone'),iron:storeQty(reg,'carrier:'+f.id,'iron')})),
          deposits:{wood:depositsOfKind(reg,'wood').length,stone:depositsOfKind(reg,'stone').length},
          totalWoodAvailable:totalAvailable(reg,'wood'),totalStoneAvailable:totalAvailable(reg,'stone'),
          jobs:jobSummary(board),livingWorld:lw,farm,
          perf:{rebuilds:rebuildCountRef.current,maxStepMsMoving:rebuildStepStatsRef.current.maxStepMsMoving,lastBuildMs:rebuildStepStatsRef.current.lastBuildMs,lastBuildFrames:rebuildStepStatsRef.current.lastBuildFrames},
        });
      }} />
    )}
    <button type="button" onClick={onExit} style={{position:'absolute',right:12,top:12,zIndex:4,padding:'10px 13px',border:'1px solid #c4d1bd',borderRadius:9,background:'#172c23e8',color:'#fff',fontWeight:700}}>Exit 3D</button>
    {/* BUILD 992: the 983 Street view toggle is removed from the main UI.
        First person now engages on full zoom; its setting lives in the
        Options dialog. BUILD 984 placement tool: bottom-right, clear of
        Options (top-right) and the diagnostic (bottom-left). */}
    <BuildCluster buildOpen={buildOpen} buildMinimized={buildMinimized} palette={palette} customSelection={customSelection} removeMode={removeMode} moveMode={moveMode} saveAreaMode={saveAreaMode} pasteName={pasteName} areaSelectMode={areaSelectMode} areaSelection={areaSelection} walkSuspended={walkSuspended} undoAvailable={undoAvailable} redoAvailable={redoAvailable} driving={driving} insideHut={!!insideHut} buildIx={buildIx} handleSwipeRef={handleSwipeRef} onToggleBuild={()=>{if(!buildOpen)buildIx.setWalk(false);setBuildOpen(v=>!v);}} onOpenBuild={()=>setBuildOpen(true)} onSummonCar={summonCar} />
    {/* BUILD 1033: Car summon — the freed Sprint slot (bottom:262,
        the 62px step between Redo 200 and Remove 324). Always
        visible like Build; disabled (dimmed, the Undo/Redo pattern)
        while driving or inside a hut. Summons the red sports car
        next to the player. */}
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
    {/* BUILD 1028: the big right-side Sprint button is gone — the
        control is now a small ⚡ icon at the bottom next to Gold in
        the HUD strip (same handlers, same latch/rearm/Tired states).
        The slot at bottom:262 stays empty on purpose: the 989 fixed
        stack never shifts, so Walk/Undo/Redo/Remove keep their
        positions. */}
    {/* BUILD 1004: Remove quick toggle — the SAME buildIx.toggleRemove the
        panel's Remove button calls, so the two can never diverge.
        Renders in the minimized cluster (same visibility rule as
        Undo/Redo) at the next fixed slot (bottom:324, same 62px
        step), green while Remove is on, so Remove flips without
        opening the panel at all. Hidden while the panel is open,
        where the panel's own toggle is the path; it sits under the
        panel's footprint exactly like Sprint does. */}
    {/* BUILD 1004: minimized handle — a visible tab at the right edge
        while build UI is minimized (panel hidden, tool still armed),
        clear of the cluster (cluster top is bottom:376, handle spans
        bottom:392–448). Tap it, or drag it sideways, to reopen the
        panel; the right-edge strip swipe reopens it too. */}
    {/* BUILD 990: phone-first interior entry/exit. Enter appears when a
        house door is within one tile (nearest door wins); Exit shows
        only while inside. Centered at bottom:110 — clear of the
        minimized cluster (Build 14 / Walk 76 / Undo 138, right side)
        and above the panel (zIndex 6 > panel 4) so entry works with
        the panel open, regardless of the active Build tool. */}
    {/* BUILD 1033: the house Enter is gated on not driving — while
        driving the only Enter/Exit is the car's (the car cannot be
        taken inside a hut). */}
    <InteriorCarButtons insideHut={!!insideHut} driving={driving} nearDoorHut={nearDoorHut} nearCar={nearCar} onEnterHut={()=>{if(nearDoorHut)buildIx.enterHut(nearDoorHut);}} onExitHut={buildIx.exitHut} onEnterCar={enterCar} onExitCar={exitCar} />
    {/* BUILD 1033: car Enter/Exit — the same phone-first pattern as
        houses. Enter Car sits above the house Enter (bottom:170 vs
        110) so the two never overlap; Exit Car takes the 110 slot
        (you cannot drive and be inside a hut at once). */}
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
        <button type="button" data-testid="build-close" title="Close (clears your tool)" onClick={()=>{setBuildOpen(false);setImportHubOpen(false);setPalette(null);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setSaveAreaMode(false);setPasteName(null);setSaveSelection(null);setAreaSelectMode(false);setAreaSelection(null);setAreaMoveArmed(false);setAreaDuplicateArmed(false);setAreaDeleteArmed(false);setCatalogCategory('all');setPlacementRotBoth(0);buildRef.current={palette:null,removeMode:false,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:null,areaSelectMode:false,areaMoveArmed:false,areaDuplicateArmed:false};const el=placePreviewRef.current;if(el)el.style.display='none';const ael=areaSelectPreviewRef.current;if(ael)ael.style.display='none';placeHoverRef.current=null;buildIx.setWalk(false);}} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,lineHeight:1}}>×</button>
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
        {/* BUILD 1092 (0x1B, Phase 3.1): the settlement catalogue — every
            building the settlement can grow into, generated from
            buildingCatalogue.ts. Entries with a palette kind arm that
            tool exactly like the palette buttons above (same behaviour,
            free placement where it was free); the rest are listed,
            locked, with the reason why. Nothing here builds anything
            new — the catalogue is data, the construction path (3.2)
            comes in a later build. */}
        <div data-testid="build-catalogue" style={{marginTop:10}}>
          <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:8}}>Settlement Catalogue — every building the settlement can grow into</div>
          <div style={{fontSize:11,opacity:.7,marginTop:4,lineHeight:1.4}}>93 buildings in 6 categories. Tap one that is ready to place it; the rest are listed so you can see what each one needs — locked ones have no construction path yet and arrive in a later build.</div>
          {CATALOGUE_CATEGORIES.map(cat=><div key={cat.id}>
            <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:8}}>{cat.letter}. {cat.label}</div>
            {BUILDING_CATALOGUE.filter(e=>e.category===cat.id).map(entry=>{const m=catalogueMenuEntryFor(entry);const cost=entry.materials.length===0?'No cost':entry.materials.map(x=>x.qty+' '+x.resource).join(' + ');return (
              <button key={entry.id} type="button" data-testid={'build-catalogue-'+entry.id} disabled={!m.placeable} onClick={()=>{if(!entry.paletteKind)return;const kind=entry.paletteKind;const next=palette===kind?null:kind;setPalette(next);setCustomSelection(null);setRemoveMode(false);setSaveAreaMode(false);setPasteName(null);setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);buildRef.current={palette:next,removeMode:false,moveMode:buildRef.current.moveMode,saveAreaMode:false,pasteName:null,customAssetId:null,areaSelectMode:false,areaMoveArmed:false,areaDuplicateArmed:false};if(!next){const el=placePreviewRef.current;if(el)el.style.display='none';placeHoverRef.current=null;}}} style={{display:'block',width:'100%',textAlign:'left',padding:'8px 10px',borderRadius:9,border:'1px solid #c4d1bd',background:m.placeable?(palette===entry.paletteKind?'#526d42':'#22392d'):'#1a2a22',color:'#fff',fontSize:13,marginTop:6,opacity:m.placeable?1:.75}}>
                <span style={{fontWeight:700}}>{entry.name}</span>
                <span style={{display:'block',fontSize:11,opacity:.8,marginTop:2}}>{entry.footprint.w}×{entry.footprint.h} · {cost}{entry.produces?' · makes '+entry.produces.perHour+' '+entry.produces.resource+'/h':''}{entry.capacity>0?' · holds '+entry.capacity+' '+entry.capacityUnit:''}{entry.workers>0?' · '+entry.workers+' worker'+(entry.workers===1?'':'s'):''}</span>
                {!m.placeable&&<span style={{display:'block',fontSize:11,opacity:.7,marginTop:2}}>🔒 {m.lockedReason}</span>}
              </button>);})}
          </div>)}
        </div>
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
      <button type="button" data-testid="build-remove-toggle" onClick={buildIx.toggleRemove} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:removeMode?'#7a3b2e':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Remove: {removeMode?'On':'Off'}</button>
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
        <button type="button" data-testid="build-area-select-toggle" onClick={buildIx.toggleAreaSelect} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'3px solid #ffd94d',background:areaSelectMode?'#8a6d1f':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Area select: {areaSelectMode?'On':'Off'}</button>
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
            <button type="button" data-testid="build-area-move" onClick={()=>{if(!areaSelection)return;buildIx.setAreaMoveArmedBoth(!areaMoveArmed);buildIx.setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);setMessage(areaMoveArmed?'Move cancelled':'Drag the yellow area to a new location — everything moves together, keeping its layout');}} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:areaMoveArmed?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Move</button>
            <button type="button" data-testid="build-area-duplicate" onClick={()=>{if(!areaSelection)return;buildIx.setAreaDuplicateArmedBoth(!areaDuplicateArmed);buildIx.setAreaMoveArmedBoth(false);setAreaDeleteArmed(false);setMessage(areaDuplicateArmed?'Duplicate cancelled':'Tap the ground to place a copy of the area — its corner lands on the tapped tile');}} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:areaDuplicateArmed?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Duplicate</button>
            <button type="button" data-testid="build-area-rotate-ccw" onClick={()=>buildIx.doAreaRotate(-1)} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>⟲ Rotate left</button>
            <button type="button" data-testid="build-area-rotate-cw" onClick={()=>buildIx.doAreaRotate(1)} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Rotate right ⟳</button>
          </div>
          <button type="button" data-testid="build-area-delete" onClick={()=>{if(!areaSelection)return;const n=selectionCount(areaSelection);if(n>10&&!areaDeleteArmed){setAreaDeleteArmed(true);setMessage('Delete '+n+' items? Tap Delete again to confirm — Undo restores them');return;}buildIx.doAreaDelete();}} style={{display:'block',width:'100%',marginTop:8,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:areaDeleteArmed?'#7a3b2e':'#5a2e24',color:'#fff',fontWeight:700,fontSize:14}}>{areaDeleteArmed?'Tap again to confirm delete':'Delete area'}</button>
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
              <button type="button" data-testid="build-layout-doors" onClick={()=>buildIx.runLayoutHelper(doorsFacePaths,'Doors already face the nearest path')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Doors face paths</button>
              <button type="button" data-testid="build-layout-trees" onClick={()=>buildIx.runLayoutHelper(treesOffPaths,'No trees standing on paths here')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Trees off paths</button>
              <button type="button" data-testid="build-layout-lanterns" onClick={()=>buildIx.runLayoutHelper(lanternsAlongRoads,'No lanterns fit along these roads')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Lanterns along roads</button>
              <button type="button" data-testid="build-layout-fence" onClick={()=>buildIx.runLayoutHelper(fencesAroundProperty,'No fence fits around these houses')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Fence property</button>
              <button type="button" data-testid="build-layout-align-row" onClick={()=>buildIx.runLayoutHelper((w,s,pt,nt)=>alignArea(w,s,'row',pt,nt),'Already aligned to a row')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Align row</button>
              <button type="button" data-testid="build-layout-align-col" onClick={()=>buildIx.runLayoutHelper((w,s,pt,nt)=>alignArea(w,s,'col',pt,nt),'Already aligned to a column')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Align column</button>
              <button type="button" data-testid="build-layout-enhance" onClick={()=>buildIx.runLayoutHelper(enhanceArea,'Nothing to enhance here — the ground is already full')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>ENHANCE</button>
              <button type="button" data-testid="build-layout-spread" onClick={()=>buildIx.runLayoutHelper((w,s,pt,nt)=>adjustSpacing(w,s,'spread',pt,nt),'Nothing moved')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Spread out</button>
              <button type="button" data-testid="build-layout-pack" onClick={()=>buildIx.runLayoutHelper((w,s,pt,nt)=>adjustSpacing(w,s,'pack',pt,nt),'Nothing moved')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Pack together</button>
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
                <button type="button" data-testid="build-area-item-remove" aria-label={'Remove '+label+' from selection'} onClick={()=>{if(!areaSelection)return;const next=excludeItem(areaSelection,it);const after=selectionCount(next);if(after===0){buildIx.clearAreaSelection();setMessage('Selection cleared — nothing left in it');}else{setAreaSelection(next);setAreaDeleteArmed(false);const lab=areaSelectPreviewLabelRef.current;if(lab)lab.textContent='Area '+(next.rect.x1-next.rect.x0+1)+'×'+(next.rect.y1-next.rect.y0+1)+' · '+after+' item'+(after===1?'':'s');setMessage('Removed '+label+' from the area ('+after+' items)');}}} style={{padding:'4px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>×</button>
              </div>;
            })}
          </div>
          <button type="button" data-testid="build-area-clear" onClick={()=>{buildIx.clearAreaSelection();setMessage('Area selection cleared');}} style={{display:'block',width:'100%',marginTop:10,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Clear selection</button>
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
