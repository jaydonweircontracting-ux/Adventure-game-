import { useEffect, useRef, useState } from 'react';
import { hutAt, inBounds, isWalkableWorld, loadWorld, saveWorld, terrainAt, terrainKey, type HutRect, type IsoWorld, type PlacedItem } from '../iso/isoWorld';
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
  placedHutRects, placedTreeTiles, placedStallRects, placedStationRects, placedRockTiles, placedWallTiles,
  placedLanternTiles, placedBushTiles, placedOreTiles, placedBridgeTiles, placedFarmTiles, placedFarmKeyInts, placedFenceTiles,
  validatePlacement, movePlacement, moveGeneratedHut, moveGeneratedPath, moveGeneratedTree, firstValidTileFor,
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
import { loadTemplates, saveTemplates, captureChunk, pasteChunk, type ChunkTemplate } from './templates';
import {
  selectArea, selectionCount,
  moveArea, duplicateArea,
  toggleSelectionMember,
  type AreaSelection,
} from './areaSelect';
import { loadCustomAssets, parseGlbUpload, parseGltfUpload, parseObjUpload, parseFbxUpload, validateCustomPlacement, removeCustomAssetPlacements, customFootprint, rotateCustomXZ, MAX_FILE_BYTES, CUSTOM_ASSETS_KEY, type CustomAsset, type GlbUploadResult, type GltfDependency } from './customAssets';
import { createAssetStore, createIndexedDbAssetBackend, writeAssetManifest, describeStoreError, type AssetStore } from './assetStore';
import { parseZipUpload, writeZipArchive } from './zipImport';
import { buildAssetPack } from './assetPack';
import {
  buildHandoffPack, buildHandoffSummary, selectHandoffAssets, decideSharePath, decideCopyPath,
  HANDOFF_ZIP_NAME,
  type HandoffScope,
} from './assetHandoff';
import {
  parseTags,
  renameAsset, setAssetCategory, setAssetTags, planLibraryCommit, discardPending,
  findNameCollisions,
  type ImportProgress, type LibrarySort, type OverwriteChoice,
} from './assetLibrary';

// BUILD 1045: the preview canvas. A tiny module-level component (not
// defined inside the view, so it never remounts on re-render): it
// draws the pixel buffer renderAssetPreview returns — the model's own
// triangles, rasterized in assetLibrary.ts — into a <canvas> with
// putImageData. No second 3D renderer: the pixels come from the same
// positions + colours the game draws. When the model cannot be
// previewed it renders nothing and the caller says so in words.
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
import { STOREHOUSE_APPROACH, STOREHOUSE_CENTRE, STOREHOUSE_DOOR, STOREHOUSE_RECT, STOREHOUSE_HUT_SITE, STOREHOUSE_KIND, STOREHOUSE_SITE_ID, STOREHOUSE_STORE_ID, STOREHOUSE_CAPACITY_WOOD, STOREHOUSE_CAPACITY_STONE, STOREHOUSE_CAPACITY_ORE, STOREHOUSE_CAPACITY_COAL, STOREHOUSE_CAPACITY_INGOT, STOREHOUSE_CAPACITY_TOOL, STOREHOUSE_CAPACITY_TIMBER, STOREHOUSE_CAPACITY_FURNITURE, STOREHOUSE_WORK_STEPS, freshStorehouse, reconcileStorehouse, seedStorehouseStore, storehouseWoodInRegistry, storehouseStoneInRegistry, storehouseOreInRegistry, storehouseWoolInRegistry, storehouseLeatherInRegistry, storehousePlacementExists, storehousePlacementId, storehouseLabel, type StorehouseState } from './storehouse';
import { bridgeAxisForCrossing, bridgeSpanForCrossing, bridgeStyleForCrossing, finishBridge, fordTiles, freshBridgeSite, freshPathState, pathTiles, placeBridgeSpan, reconcileBridges, scoreBridgeCrossing, wellTile, type PathState, type BridgeStyle } from './paths';
import { previewStudioEdit, applyStudioEdit, type StudioTool, type StudioTile, type StudioPreview } from './worldStudio';
import { freshMineState, validateMineState, mineSummaryText, type MineState } from './mines';
// BUILD 1064 (R-1): the unified resource registry — the one
// authoritative record of what exists, where it is, and where it
// came from. The view owns the ref; the E-key gather, the founder
// tick, and the living-world sync all write through it, and the
// HUD/camp line mirror it (never a second count).
import { CAMP_STORE_ID, GRANARY_STORE_ID, PLAYER_STORE_ID, createRegistry, addDeposit, depositInto, extractDeposit, withdrawFrom, treeDeposit, depositsFromWorld, mirrorCampStoresToSettlement, setStoreQty, storeQty, totalAvailable, depositsOfKind, syncCampStoreFromSettlement, kindForPlayerKey, type RegistryKind, type ResourceRegistry } from './resourceRegistry';
// BUILD 1075 (0x0D area 5): the player's inventory store — save/load +
// the registry -> React mirror. (BUILD 1111: stations now exist —
  // see craftingStations.ts + stationPanel3d.tsx.)
import { initialInventory, loadPlayerInventoryIntoRegistry, refreshPlayerInventory, type Inventory3D, type InventoryContext } from './inventoryCrafting3d';
// BUILD 1108 (0x2B): the slot inventory engine (pure) + the panel.
// The registry stays the one authority for totals; this module owns
// only the slot distribution (see playerInventory.ts).
import { HOTBAR_SLOT_COUNT, equipItem, itemMetaFor, moveSlot, readHotbarSelected, readSlotLayout, reconcileSlots, damageTool, splitSlot, unequipItem, useEffectFor, writeHotbarSelected, writeSlotLayout, type EquipSlotId, type PlayerInventoryLayout } from './playerInventory';
import { HAND_RECIPES, canCraftHand, handRecipeFor, maxDurabilityFor } from './gathering';
import { STATION_RECIPES, canCraftStation, isRecipeUnlocked, nearestStation, readDiscoveredMaterials, recordDiscoveredMaterials, stationDefFor, stationRecipeFor, stationRecipesFor, type StationId } from './craftingStations';
import { StationPanel } from './stationPanel3d';
import { InventoryPanel } from './inventoryPanel3d';
import { Hotbar } from './hotbar3d';
import { createBuildingInteractions, type BuildingContext } from './buildingInteractions3d';
import { Minimap3D, WorldMap3D, HudStrip, WaitSheet, WaitProgress, TopLeftButtons, BuildCluster, InteriorCarButtons } from './hudInterface3d';
import { BuildPanel, type ImportReport, type OverwritePrompt, type CatalogCategory } from './buildPanel3d';
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
  // BUILD 1108 (0x2B): the slot layout — distribution state only, the
  // record above (registry totals) stays the authority.
  const [invLayout,setInvLayout]=useState<PlayerInventoryLayout>(()=>readSlotLayout());
  const [health,setHealth]=useState<number>(()=>{try{const n=Number(localStorage.getItem(HEALTH_KEY));return Number.isFinite(n)&&n>0?Math.min(100,n):100}catch{return 100}});
  // BUILD 1003: stamina UI state (throttled publish from draw(); the
  // authoritative value lives in staminaRef, session-only, never saved).
  const [staminaUi,setStaminaUi]=useState<StaminaState>(FULL_STAMINA);
  const [sprintingUi,setSprintingUi]=useState(false);
  const inventoryRef=useRef<Inventory3D>(inventory); inventoryRef.current=inventory;
  const invLayoutRef=useRef<PlayerInventoryLayout>(invLayout); invLayoutRef.current=invLayout;
  // BUILD 1110 (0x2D): the torch-lit flag the renderer reads per
  // frame — synced the same way as invLayoutRef above.
  const torchLitRef=useRef(false); torchLitRef.current=invLayout.equipped.tool==='torch';
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
    // BUILD 1111 (0x2E): discovery — every material the player has
    // ever held unlocks its recipes (recordDiscoveredMaterials unions
    // the inventory record kinds into the persisted set; the state
    // only changes when a new material actually appears).
    const heldKinds=Object.keys(inventoryRef.current).filter((k)=>(inventoryRef.current[k]??0)>0);
    const nextDiscovered=recordDiscoveredMaterials(discoveredRef.current,heldKinds);
    if(nextDiscovered!==discoveredRef.current){discoveredRef.current=nextDiscovered;setDiscovered(nextDiscovered);}
    // BUILD 1108 (0x2B): the slot layout follows the record — a pickup
    // lands in the slots (reconcile preserves the player's layout).
    const nextLayout=reconcileSlots(inventoryRef.current,invLayoutRef.current);
    if(nextLayout!==invLayoutRef.current){invLayoutRef.current=nextLayout;setInvLayout(nextLayout);}
    writeSlotLayout(nextLayout);
    const reg=registryRef.current;
    founderStockpileRef.current=campWoodInRegistry(reg);
    founderFoodRef.current=campFoodInRegistry(reg);
    founderGrainRef.current=campGrainInRegistry(reg);
    founderStoneRef.current=campStoneInRegistry(reg);
    setCampUi({wood:founderStockpileRef.current,stone:founderStoneRef.current,food:founderFoodRef.current,grain:founderGrainRef.current,flour:granaryFlourInRegistry(reg),iron:storehouseOreInRegistry(reg,'iron'),ingots:metalChainIngotsInRegistry(reg),tools:metalChainToolsInRegistry(reg),timber:metalChainTimberInRegistry(reg),furniture:metalChainFurnitureInRegistry(reg),hut:hutProgressLabel(constructionRef.current),storehouse:storehouseLabel(storehouseRef.current),forest:forestPct(stateRef.current.world.trees.length),beds:foundersRef.current.length+'/'+housingCapacity(constructionRef.current)});
  };
  // BUILD 1108 (0x2B): slot interactions — distribution only, the
  // totals never move (the registry is the authority), so these never
  // write to the registry; they persist the layout and mirror it.
  const commitInvLayout=(next: PlayerInventoryLayout)=>{if(next!==invLayoutRef.current){invLayoutRef.current=next;setInvLayout(next);}writeSlotLayout(next);};
  const handleInvMove=(from:number,to:number)=>{commitInvLayout(moveSlot(invLayoutRef.current,from,to));};
  const handleInvSplit=(index:number)=>{commitInvLayout(splitSlot(invLayoutRef.current,index));};
  const handleInvEquip=(index:number)=>{commitInvLayout(equipItem(invLayoutRef.current,index));};
  const handleInvUnequip=(slot: EquipSlotId)=>{commitInvLayout(unequipItem(invLayoutRef.current,slot));};
  // BUILD 1109 (0x2C): the hotbar selection + use. Selection is UI
  // state (persisted under its own key); use consumes one unit of a
  // usable kind (a meal restores 25 health) through the registry —
  // the unit leaves the player store, then the normal refresh
  // re-derives the slots, so totals stay authoritative. Anything
  // without a use effect is a no-op with a message — the unit is
  // never destroyed without an effect — and use at full health is
  // blocked so a meal is never wasted.
  const commitHotbarSelected=(index:number)=>{const clamped=Math.min(HOTBAR_SLOT_COUNT-1,Math.max(0,Math.floor(index)));if(clamped!==hotbarSelectedRef.current){hotbarSelectedRef.current=clamped;setHotbarSelected(clamped);}writeHotbarSelected(clamped);};
  const handleHotbarSelect=(index:number)=>{commitHotbarSelected(index);};
  const handleHotbarUse=(index:number)=>{
    const slot=invLayoutRef.current.slots[index];
    if(!slot||!slot.kind||slot.qty<=0)return;
    const effect=useEffectFor(slot.kind);
    if(!effect){setMessage(itemMetaFor(slot.kind).name+' cannot be used.');return;}
    if(healthRef.current>=100){setMessage('Already at full health.');return;}
    const rk=kindForPlayerKey(slot.kind);
    if(rk){const w=withdrawFrom(registryRef.current,PLAYER_STORE_ID,rk,1);if(w.taken<=0)return;registryRef.current=w.registry;}
    else{const cur=inventoryRef.current[slot.kind]??0;if(cur<=0)return;const next={...inventoryRef.current};if(cur<=1)delete next[slot.kind];else next[slot.kind]=cur-1;inventoryRef.current=next;setInventory({...next});}
    const healed=Math.min(100,healthRef.current+effect.heal);
    healthRef.current=healed;setHealth(healed);try{localStorage.setItem(HEALTH_KEY,String(healed));}catch{}
    setMessage(itemMetaFor(slot.kind).name+' · +'+effect.heal+' health');
    refreshResourceUi();
  };
  // BUILD 1110 (0x2D): how much of a craft material the player
  // holds — registry player-store kinds (wood, stone, stick, coal)
  // read from the store, anything else from the inventory record.
  // The hand recipes use only store kinds, so the fallback is a
  // safety net, not a live path.
  const playerHeldQty=(kind:string):number=>{
    const rk=kindForPlayerKey(kind);
    if(rk)return storeQty(registryRef.current,PLAYER_STORE_ID,rk);
    return inventoryRef.current[kind]??0;
  };
  // The live affordability snapshot for the Craft panel (recomputed
  // every render from the refs, so the panel never shows a stale
  // Can/Cannot).
  const craftHeld:Record<string,number>={};
  for(const k of ['wood','stone','stick','coal'])craftHeld[k]=playerHeldQty(k);
  // BUILD 1110 (0x2D): hand-crafting — materials leave the registry
  // player store (withdrawFrom per material — a craft that cannot
  // afford every material never starts, so nothing is half-spent);
  // stackable products land back in the player store (depositInto),
  // tools land in the inventory record (the 1108 gear channel).
  // The normal refresh re-derives the slots, and reconcile fills a
  // new tool's durability to full.
  const handleCraftHand=(id:string)=>{
    const recipe=handRecipeFor(id);
    if(!recipe)return;
    const held:Record<string,number>={};
    for(const m of recipe.materials)held[m.kind]=playerHeldQty(m.kind);
    if(!canCraftHand(recipe,held)){setMessage('Not enough materials to craft '+recipe.name+'.');return;}
    let reg=registryRef.current;
    for(const m of recipe.materials){
      const rk=kindForPlayerKey(m.kind);
      if(rk){const w=withdrawFrom(reg,PLAYER_STORE_ID,rk,m.qty);reg=w.registry;}
      else{const cur=inventoryRef.current[m.kind]??0;const next={...inventoryRef.current};if(cur<=m.qty)delete next[m.kind];else next[m.kind]=cur-m.qty;inventoryRef.current=next;setInventory({...next});}
    }
    registryRef.current=reg;
    const prk=kindForPlayerKey(recipe.product);
    if(prk){const dep=depositInto(reg,PLAYER_STORE_ID,prk,recipe.productQty,{type:'entity',id:'craft:'+recipe.id},{location:{x:Math.round(stateRef.current.position.x),y:Math.round(stateRef.current.position.y)},ownerId:'player'});registryRef.current=dep.registry;}
    else{inventoryRef.current={...inventoryRef.current,[recipe.product]:(inventoryRef.current[recipe.product]??0)+recipe.productQty};setInventory({...inventoryRef.current});}
    setMessage('Crafted '+recipe.name+(recipe.productQty>1?' \u00d7'+recipe.productQty:'')+'.');
    refreshResourceUi();
  };
  // BUILD 1111 (0x2E): station crafting — the same conservation as
  // hand-crafting (withdrawFrom per material, depositInto for
  // stackables, record++ for gear), plus the unlock gate: a locked
  // recipe refuses with a message naming the material it needs.
  const handleStationCraft=(station:StationId,id:string)=>{
    const recipe=stationRecipeFor(id);
    if(!recipe||recipe.station!==station)return;
    if(!isRecipeUnlocked(recipe,discoveredRef.current)){const need=recipe.unlock.kind==='discover'?recipe.unlock.material:'the right material';setMessage(recipe.name+' is locked — find '+need+'.');return;}
    const held:Record<string,number>={};
    for(const m of recipe.materials)held[m.kind]=playerHeldQty(m.kind);
    if(!canCraftStation(recipe,held)){setMessage('Not enough materials to craft '+recipe.name+'.');return;}
    let reg=registryRef.current;
    for(const m of recipe.materials){
      const rk=kindForPlayerKey(m.kind);
      if(rk){const w=withdrawFrom(reg,PLAYER_STORE_ID,rk,m.qty);reg=w.registry;}
      else{const cur=inventoryRef.current[m.kind]??0;const next={...inventoryRef.current};if(cur<=m.qty)delete next[m.kind];else next[m.kind]=cur-m.qty;inventoryRef.current=next;setInventory({...next});}
    }
    registryRef.current=reg;
    const prk=kindForPlayerKey(recipe.product);
    if(prk){const dep=depositInto(reg,PLAYER_STORE_ID,prk,recipe.productQty,{type:'entity',id:'craft:'+recipe.id},{location:{x:Math.round(stateRef.current.position.x),y:Math.round(stateRef.current.position.y)},ownerId:'player'});registryRef.current=dep.registry;}
    else{inventoryRef.current={...inventoryRef.current,[recipe.product]:(inventoryRef.current[recipe.product]??0)+recipe.productQty};setInventory({...inventoryRef.current});}
    setMessage('Crafted '+recipe.name+(recipe.productQty>1?' \u00d7'+recipe.productQty:'')+'.');
    refreshResourceUi();
  };
  // BUILD 1110 (0x2D): tool wear — one hit off the equipped tool.
  // A break removes one unit of the kind from the inventory record
  // and reconciles, which clears the equip slot (a spare, if any,
  // becomes the equipped one at full durability).
  const handleToolHit=():{broken:boolean;kind:string|null}=>{
    const kind=invLayoutRef.current.equipped.tool;
    if(!kind)return {broken:false,kind:null};
    const res=damageTool(invLayoutRef.current,'tool');
    commitInvLayout(res.layout);
    if(!res.broken)return {broken:false,kind};
    const cur=inventoryRef.current[kind]??0;
    const next={...inventoryRef.current};
    if(cur<=1)delete next[kind];else next[kind]=cur-1;
    inventoryRef.current=next;setInventory({...next});
    refreshResourceUi();
    return {broken:true,kind};
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
  // BUILD 1108 (0x2B): the inventory panel (I key / HUD button).
  const [inventoryOpen,setInventoryOpen]=useState(false);
  // BUILD 1111 (0x2E): the station panel — which station is open
  // (null = none), and the set of materials the player has ever held
  // (the discovery set — recipe unlocks, persisted under its own key).
  const [openStation,setOpenStation]=useState<StationId|null>(null);
  const [discovered,setDiscovered]=useState<Set<string>>(()=>readDiscoveredMaterials());
  const discoveredRef=useRef<Set<string>>(discovered); discoveredRef.current=discovered;
  // BUILD 1109 (0x2C): the hotbar selection — slots 0-8 of the same
  // inventory, persisted under its own key (the slots persist via 1108).
  const [hotbarSelected,setHotbarSelected]=useState<number>(()=>readHotbarSelected());
  const hotbarSelectedRef=useRef<number>(hotbarSelected); hotbarSelectedRef.current=hotbarSelected;
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
  // BUILD 1132 (0x33): the bridge style picker — which of the six
  // founder bridge styles a hand-placed bridge uses. Same pattern as
  // placementRot: state for the panel, a ref for the pointer handlers,
  // persists across asset switches, resets when the panel closes (×).
  const [bridgeStyle, setBridgeStyle] = useState<BridgeStyle>('wooden');
  const bridgeStyleRef = useRef<BridgeStyle>('wooden');
  const setBridgeStyleBoth = (s: BridgeStyle) => { bridgeStyleRef.current = s; setBridgeStyle(s); };
  // BUILD 1133 (0x34): World Studio — river/bridge/path editing.
  // Same state+ref pattern as bridgeStyle: state for the panel,
  // refs for the pointer handlers (which close over refs, not
  // state). The stroke lives in a ref (pointer handlers run outside
  // React state); the preview is derived from it. The preview divs
  // are positioned by the effect-local helpers (they need the
  // renderer, which only exists inside the mount effect) — the
  // mirror ref below lets the width setter recompute them.
  const [studioTool, setStudioTool] = useState<StudioTool | null>(null);
  const studioToolRef = useRef<StudioTool | null>(null);
  const [studioWidth, setStudioWidth] = useState<1 | 2 | 3>(1);
  const studioWidthRef = useRef<1 | 2 | 3>(1);
  const [studioPreview, setStudioPreview] = useState<StudioPreview | null>(null);
  const studioPreviewRef = useRef<StudioPreview | null>(null);
  const studioStrokeRef = useRef<StudioTile[]>([]);
  const studioPreviewDivRef = useRef<HTMLDivElement | null>(null);
  const studioPreviewFnRef = useRef<(() => void) | null>(null);
  const setStudioPreviewBoth = (p: StudioPreview | null) => { studioPreviewRef.current = p; setStudioPreview(p); };
  const clearStudioStroke = () => {
    studioStrokeRef.current = [];
    setStudioPreviewBoth(null);
    const el = studioPreviewDivRef.current;
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  };
  const setStudioToolBoth = (t: StudioTool | null) => {
    studioToolRef.current = t; setStudioTool(t);
    clearStudioStroke();
    if (t !== null) {
      // Arming a studio tool clears every other build tool (the
      // same mutual exclusion the palette buttons enforce).
      setPalette(null); setCustomSelection(null); setRemoveMode(false); setMoveMode(false);
      setSaveAreaMode(false); setPasteName(null); setAreaSelectMode(false);
      setAreaMoveArmed(false); setAreaDuplicateArmed(false);
      buildRef.current = { palette: null, removeMode: false, moveMode: false, saveAreaMode: false, pasteName: null, customAssetId: null, areaSelectMode: false, areaMoveArmed: false, areaDuplicateArmed: false };
      const el = placePreviewRef.current; if (el) el.style.display = 'none';
      placeHoverRef.current = null;
    }
  };
  const setStudioWidthBoth = (w: 1 | 2 | 3) => { studioWidthRef.current = w; setStudioWidth(w); studioPreviewFnRef.current?.(); };
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
  const [assetsSaving,setAssetsSaving]=useState(false);
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
        if(!d.found&&d.kind==='image')notes.push('\''+asset.name+'\': texture "'+d.uri+'" was not found — the model imported with its material colour fallback');
        if(d.found&&d.kind==='image')notes.push('\''+asset.name+'\': texture "'+d.uri+'" was found and stored with the model');
        if(d.found&&d.kind==='buffer'&&d.resolvedPath&&d.resolvedPath.includes('/'))notes.push('\''+asset.name+'\': its data file "'+d.resolvedPath+'" was found in a subfolder');
      }
    };
    const accept=(res:GlbUploadResult,label:string)=>{
      if(!res.ok){failed.push(label+': '+res.reason);return;}
      parsed.push(res.asset);
      if(res.dependencies)pendingDepsRef.current.set(res.asset.id,res.dependencies);
      noteDeps(res.asset,res.dependencies);
      if(res.asset.format==='fbx'&&res.asset.textureImages?.some(Boolean))notes.push('\''+res.asset.name+'\': diffuse texture map was loaded for the textured character renderer');
      if(res.asset.format==='fbx'&&res.asset.animationFrames?.length)notes.push('\''+res.asset.name+'\': skeletal walk cycle baked ('+res.asset.animationFrames.length+' frames at '+(res.asset.animationFps??8)+' fps)');
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
      if(lower.endsWith('.glb')||lower.endsWith('.gltf')||lower.endsWith('.obj')||lower.endsWith('.fbx')){
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
          }else if(lower.endsWith('.obj')){
            const text=await file.text();bytesDone+=file.size;
            setP('parsing',file.name);await yieldToLoop();
            accept(parseObjUpload(text,file.name),file.name);
          }else{
            const buf=await file.arrayBuffer();bytesDone+=file.size;
            setP('parsing',file.name);await yieldToLoop();
            accept(await parseFbxUpload(buf,file.name,companionFiles),file.name);
          }
        }catch{failed.push(file.name+': could not read the file');}
        filesDone++;await yieldToLoop();
        continue;
      }
      failed.push(file.name+': not a supported file (.glb, .gltf, .obj, .fbx, or .zip)');
      filesDone++;await yieldToLoop();
    }
    // BUILD 1046: an image file no model referenced is noted, not
    // failed — it was only ever a possible texture, and textures
    // are not rendered.
    const referenced=new Set<string>();
    pendingDepsRef.current.forEach((deps)=>{for(const d of deps)if(d.found&&d.resolvedPath)referenced.add(d.resolvedPath);});
    const hasFbxTexture=parsed.some(a=>a.format==='fbx'&&a.textureImages?.some(Boolean));
    for(const f of files.filter(f=>/\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name))){
      const rel=relPathOf(f);
      if(!hasFbxTexture&&!referenced.has(f.name)&&!referenced.has(rel))notes.push('\''+f.name+'\' is an image file that no imported model referenced, so it was not added to the asset library');
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
  const saveAssets=async()=>{
    if(assetsSaving||customAssetsLoading)return;
    setAssetsSaving(true);
    try{
      // Uploads first enter the review queue. Save must finish that
      // step too; otherwise the button sees an empty library and
      // tells the player "no models yet" even though models were parsed.
      const waiting=[...pendingImportsRef.current];
      if(waiting.length>0){
        await commitPendingAssets(waiting);
        if(overwritePromptRef.current){
          setMessage('A model name already exists. Choose Keep both or Replace to finish saving your uploaded models.');
          return;
        }
        if(pendingImportsRef.current.length>0){
          setMessage('Some uploads could not be added. Check the import report, then retry Save; successful models remain saved.');
          return;
        }
      }
      const store=assetStoreRef.current;
      if(!store||!assetStoreReadyRef.current){setMessage('Model storage is unavailable in this browser. Keep this game open; uploads cannot be confirmed as saved across reloads.');return;}
      await runLibraryOp(async()=>{
        const snapshot=[...customAssetsRef.current];
        if(snapshot.length===0){setMessage('No models have finished importing yet. Upload a model and wait for it to appear in the review list.');return;}
        for(const asset of snapshot)await store.put(asset);
        const verified=await store.loadAll();
        const byId=new Map(verified.map(asset=>[asset.id,asset]));
        const missing=snapshot.filter(asset=>{const saved=byId.get(asset.id);return !saved||saved.indices.length!==asset.indices.length||saved.positions.length!==asset.positions.length;});
        if(missing.length>0)throw new Error('read-back verification failed for '+missing.length+' model(s): '+missing.slice(0,3).map(a=>a.name).join(', '));
        writeAssetManifest(snapshot);
        setMessage('Saved and verified '+snapshot.length+' uploaded model(s) on this device. You can close the game and reopen it later.');
      });
    }catch(err){setMessage('Save failed — '+describeStoreError(err)+'. Keep the game open and try again.');}
    finally{setAssetsSaving(false);}
  };
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
  // (windmill, mine); Decorations = lantern + wall + fence; Roads =
  // path + the river crossings (bridge, ford, dock, stepping stone);
  // Nature = tree, bush, grass, rock, water; Infrastructure = the ore
  // deposit (the resource node — wells join it when they are built)
  // + the embankment (a reinforced river bank). A kind lives
  // in exactly one section, so the counts above are the whole palette.
  const CATALOG_SECTIONS:{id:Exclude<CatalogCategory,'all'>;label:string;kinds:PaletteKind[]}[]=[
    {id:'buildings',label:'Buildings',kinds:['house-windmill','house-mine']},
    // BUILD 1111 (0x2E): the Crafting section — the five stations.
    {id:'stations',label:'Crafting',kinds:['station-workbench','station-blacksmith','station-furnace','station-advanced-forge','station-apothecary']},
    // BUILD 1012: the Houses section offers the four real town
    // house designs (cottage / tall / shopfront / grand) instead of
    // the one bare 'house' kind — each is its own palette entry with
    // its own look, footprint, and interior. Bare 'house' is the
    // legacy placed kind (old saves only) and is not offered here.
    {id:'houses',label:'Houses',kinds:['house-cottage','house-tall','house-shop','house-grand']},
    {id:'shops',label:'Shops',kinds:['house-inn','house-smith','house-store','stall']},
    {id:'decorations',label:'Decorations',kinds:['lantern','wall','fence']},
    {id:'roads',label:'Roads',kinds:['path','bridge','ford','dock','stepping-stone']},
    // BUILD 1041: farm land joins Nature (it is tilled ground, like
    // the grass and the bush — a field, not a building).
    {id:'nature',label:'Nature',kinds:['tree','bush','grass','rock','water','farm']},
    {id:'infrastructure',label:'Infrastructure',kinds:['ore','embankment']},
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
    // BUILD 1111 (0x2E) swatches: each station in its own colour
    // (the same colours as the 3D counter cubes in worldRender3d.ts).
    'station-workbench':{label:'Workbench',swatch:'linear-gradient(135deg,#8a6d3b 0 50%,#d9b06c 50% 100%)'},
    'station-blacksmith':{label:'Blacksmith',swatch:'linear-gradient(135deg,#3d3d3d 0 50%,#e07b39 50% 100%)'},
    'station-furnace':{label:'Furnace',swatch:'linear-gradient(135deg,#5c3a2a 0 50%,#e05a2a 50% 100%)'},
    'station-advanced-forge':{label:'Advanced Forge',swatch:'linear-gradient(135deg,#2b2b3a 0 50%,#7a5fd0 50% 100%)'},
    'station-apothecary':{label:'Apothecary',swatch:'linear-gradient(135deg,#2e5c2b 0 50%,#7ac74f 50% 100%)'},
    // BUILD 1040 swatches (995 style: the model's own colours) —
    // lantern warm glow / dark timber, bush two greens, ore grey /
    // gold, bridge plank browns.
    lantern:{label:'Lantern',swatch:'linear-gradient(135deg,#f5c25c 0 50%,#3a281a 50% 100%)'},
    bush:{label:'Bush',swatch:'linear-gradient(135deg,#2e5c2b 0 50%,#4a7a3a 50% 100%)'},
    ore:{label:'Ore Deposit',swatch:'linear-gradient(135deg,#8a8d8a 0 50%,#d9a833 50% 100%)'},
    bridge:{label:'Wooden Bridge',swatch:'linear-gradient(135deg,#8f6a38 0 50%,#6b4a2b 50% 100%)'},
    // BUILD 1128 (0x31): a ford is a wadeable shallow crossing — sand
    // shallows, so the swatch is sand over water blue. BUILD 1132
    // (0x33): the ford joins the Roads catalog (it was stamped by the
    // path system only), with the dock (pier planks over water blue),
    // the stepping stone (stone grey over water blue), and the
    // embankment (stone grey over earth brown) beside it.
    ford:{label:'Ford',swatch:'linear-gradient(135deg,#c2a878 0 50%,#2a5aaa 50% 100%)'},
    dock:{label:'Dock',swatch:'linear-gradient(135deg,#8f6a38 0 50%,#2a5aaa 50% 100%)'},
    'stepping-stone':{label:'Stepping Stone',swatch:'linear-gradient(135deg,#8a8d8a 0 50%,#2a5aaa 50% 100%)'},
    embankment:{label:'Embankment',swatch:'linear-gradient(135deg,#8a8d8a 0 50%,#6b4a2b 50% 100%)'},
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
    onClearStudio: () => setStudioToolBoth(null),
    removeMode, palette, customSelection, studioTool, areaSelectMode, moveMode,
    saveAreaMode, pasteName, buildOpen, areaSelection, insideHut,
    position, customAssets,
    saveKey: SAVE_KEY,
  };
  const buildIx = createBuildingInteractions(buildCtx);
  // BUILD 1133: World Studio Apply/Cancel (panel buttons). Apply
  // runs the real apply on the current stroke, commits, and pushes
  // ONE undo entry; the tool stays armed so another stroke can
  // follow. Cancel drops the stroke and its preview.
  const studioApply = () => {
    const tool = studioToolRef.current;
    if (!tool) return;
    const world = stateRef.current.world;
    const { playerTile, npcTiles } = buildIx.areaActorTiles();
    const res = applyStudioEdit(world, tool, studioStrokeRef.current, { playerTile, npcTiles, paths: pathsRef.current, bridgeStyle: bridgeStyleRef.current, width: studioWidthRef.current });
    if (!res.ok) { setMessage(res.message); return; }
    commitWorld(worldSyncCtx, world);
    if (res.undo) buildIx.pushHistory(res.undo);
    clearStudioStroke();
    setMessage(res.message);
  };
  const studioCancel = () => {
    clearStudioStroke();
    setMessage('World Studio stroke cleared — nothing changed');
  };
  const nearDoorHut = buildIx.nearDoorHut();
  // BUILD 1111 (0x2E): the nearest placed crafting station in E-key
  // reach (the same 1-tile rule as the E-key branch) — the Use
  // button and the E-key both read this, so they never disagree.
  const nearStation = nearestStation(stateRef.current.world, Math.round(position.x), Math.round(position.y));
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
      // BUILD 0x36: the bridge scan's last-scan day loads from the
      // save too (v13 saves have none and migrate to 1) — without
      // it a reload re-ran that day's scan and opened a duplicate
      // bridge site.
      pathsRef.current=saved&&saved.bridges?{...freshPathState(),lastBridgeScanDay:saved.lastBridgeScanDay??1,bridges:reconcileBridges(saved.bridges,world)}:freshPathState();
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
      onToggleInventory: () => setInventoryOpen((v) => !v),
      onHotbarSelect: (index: number) => commitHotbarSelected(index),
      getEquippedTool: () => invLayoutRef.current.equipped.tool,
      onToolHit: handleToolHit,
      onOpenStation: (station) => setOpenStation(station),
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
        const res=validatePlacement(world,palette,tx,ty,playerTile,npcTiles,rot,{bridgeStyle:bridgeStyleRef.current});
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
    // BUILD 1133: World Studio drag — a stroke paints the preview
    // (green = will change, red = refused, dashed = the path
    // connector) and Apply in the panel commits it as ONE undo
    // entry. The stroke stays a preview until Apply/Cancel; a pinch
    // cancels the stroke outright. The divs are re-projected on
    // every orbit move (positionStudioPreviewDivs), so they track
    // the camera like the area rectangle does.
    let studioDragging=false;
    const studioOpts=()=>{const {playerTile,npcTiles}=buildIx.areaActorTiles();return {playerTile,npcTiles,paths:pathsRef.current,bridgeStyle:bridgeStyleRef.current,width:studioWidthRef.current};};
    const renderStudioPreviewDivs=()=>{
      const container=studioPreviewDivRef.current;if(!container)return;
      const preview=studioPreviewRef.current;
      if(!preview){container.style.display='none';container.innerHTML='';return;}
      const tiles: Array<{x:number;y:number;kind:'ok'|'bad'|'link'}> = [
        ...preview.tiles.map(t=>({x:t.x,y:t.y,kind:'ok' as const})),
        ...preview.rejected.map(t=>({x:t.x,y:t.y,kind:'bad' as const})),
        ...(preview.connector??[]).map(t=>({x:t.x,y:t.y,kind:'link' as const})),
      ];
      container.innerHTML='';
      for(const t of tiles){
        const proj=renderer.projectTileCenter(t.x,t.y);if(!proj)continue;
        const d=document.createElement('div');
        d.dataset.tx=String(t.x);d.dataset.ty=String(t.y);
        d.style.cssText='position:absolute;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:8px;pointer-events:none;'+(t.kind==='ok'?'border:3px solid #4fc85a;background:rgba(80,200,90,.30);':t.kind==='link'?'border:3px dashed #7fb069;background:rgba(127,176,105,.25);':'border:3px solid #e04a3e;background:rgba(220,60,50,.30);');
        d.style.left=proj.cx+'px';d.style.top=proj.cy+'px';
        container.appendChild(d);
      }
      container.style.display=tiles.length>0?'block':'none';
    };
    const positionStudioPreviewDivs=()=>{
      const container=studioPreviewDivRef.current;if(!container||container.style.display==='none')return;
      for(const child of Array.from(container.children) as HTMLDivElement[]){
        const tx=Number(child.dataset.tx),ty=Number(child.dataset.ty);
        const proj=renderer.projectTileCenter(tx,ty);
        if(!proj){child.style.display='none';continue;}
        child.style.display='block';child.style.left=proj.cx+'px';child.style.top=proj.cy+'px';
      }
    };
    const hideStudioPreviewDivs=()=>{const c=studioPreviewDivRef.current;if(c){c.style.display='none';c.innerHTML='';}};
    const recomputeStudioPreview=()=>{
      const tool=studioToolRef.current;
      if(!tool){setStudioPreviewBoth(null);hideStudioPreviewDivs();return;}
      const preview=previewStudioEdit(stateRef.current.world,tool,studioStrokeRef.current,studioOpts());
      setStudioPreviewBoth(preview);
      renderStudioPreviewDivs();
    };
    studioPreviewFnRef.current=recomputeStudioPreview;
    const studioAddToStroke=(clientX:number,clientY:number)=>{
      const tool=studioToolRef.current;if(!tool)return;
      const destination=renderer.pickGround(clientX,clientY);if(!destination)return;
      const tx=Math.round(destination.x),ty=Math.round(destination.y);
      const stroke=studioStrokeRef.current;
      const last=stroke[stroke.length-1];
      if(last&&last.x===tx&&last.y===ty)return;
      if(last){
        // Bresenham gap-fill: a fast drag must not leave holes in
        // the river/path (the same continuity the remove stroke
        // gets from per-tile painting).
        let x0=last.x,y0=last.y;const dx=Math.abs(tx-x0),dy=Math.abs(ty-y0);const sx=x0<tx?1:-1,sy=y0<ty?1:-1;let err=dx-dy;
        while(!(x0===tx&&y0===ty)){
          const e2=2*err;
          if(e2>-dy){err-=dy;x0+=sx;}
          if(e2<dx){err+=dx;y0+=sy;}
          if(x0===tx&&y0===ty)break;
          stroke.push({x:x0,y:y0});
        }
      }
      stroke.push({x:tx,y:ty});
      recomputeStudioPreview();
    };
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
    // BUILD 1131: tap-to-auto-gather. Approach a reachable bank tile,
    // then repeat the existing E action until this exact resource is gone.
    let autoGatherTimer:number|null=null;
    let autoGatherTarget:{kind:'tree'|'rock'|'deposit';x:number;y:number}|null=null;
    const stopAutoGather=()=>{if(autoGatherTimer!==null){window.clearInterval(autoGatherTimer);autoGatherTimer=null;}autoGatherTarget=null;};
    const startAutoGather=(kind:'tree'|'rock'|'deposit',x:number,y:number)=>{
      stopAutoGather();
      const around:Array<{x:number;y:number;d:number}>=[];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(dx===0&&dy===0)continue;
        const tx=x+dx,ty=y+dy;
        if(controls.walkableAt(tx,ty))around.push({x:tx,y:ty,d:Math.hypot(tx-stateRef.current.position.x,ty-stateRef.current.position.y)});
      }
      around.sort((a,b)=>a.d-b.d);
      const occupied=controls.figureOccupiedTiles();
      const approach=around.find(t=>!occupied.has(t.x+','+t.y));
      if(!approach){setMessage('No clear space beside that resource');return;}
      const dest={x:approach.x,y:approach.y};
      const path=planPlayerPath(stateRef.current.world,stateRef.current.position,dest,occupied);
      if(!path){setMessage('Cannot reach that resource');return;}
      autoGatherTarget={kind,x,y};
      playerPathRef.current=path;playerPathReplanRef.current=performance.now();playerPathWaitRef.current=null;playerPathStuckRef.current=null;
      renderer.moveTarget=dest;
      setMessage(kind==='tree'?'Walking to tree…':kind==='rock'?'Walking to rock…':'Walking to ore…');
      autoGatherTimer=window.setInterval(()=>{
        const target=autoGatherTarget;if(!target)return;
        const w=stateRef.current.world;
        const exists=target.kind==='tree'?w.trees.some(t=>t.tx===target.x&&t.ty===target.y)
          :target.kind==='rock'?w.rocks.some(t=>t.tx===target.x&&t.ty===target.y)
          :(w.mineralDeposits??[]).some(d=>d.x===target.x&&d.y===target.y&&d.remaining>0);
        if(!exists){stopAutoGather();setMessage('Resource depleted');return;}
        const p=stateRef.current.position;
        if(Math.abs(p.x-target.x)>1.05||Math.abs(p.y-target.y)>1.05)return;
        controls.action(new KeyboardEvent('keydown',{key:'e'}));
        const after=stateRef.current.world;
        const remains=target.kind==='tree'?after.trees.some(t=>t.tx===target.x&&t.ty===target.y)
          :target.kind==='rock'?after.rocks.some(t=>t.tx===target.x&&t.ty===target.y)
          :(after.mineralDeposits??[]).some(d=>d.x===target.x&&d.y===target.y&&d.remaining>0);
        if(!remains)stopAutoGather();
      },900);
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
    const down=(e:PointerEvent)=>{if((e.target as HTMLElement).closest('button'))return;renderer.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(renderer.pointers.size===1){renderer.drag=true;renderer.gestureMoved=false;renderer.gestureStartX=e.clientX;renderer.gestureStartY=e.clientY;renderer.lx=e.clientX;renderer.ly=e.clientY;removeDragging=!!(buildRef.current.removeMode&&!walkRef.current&&!insideHutRef.current);removeStrokeEntries=[];removeStrokeTiles=new Set();removeStrokeRects=[];if(removeDragging)showRemovePreview(e.clientX,e.clientY);if(!removeDragging&&buildRef.current.moveMode&&!buildRef.current.palette&&!buildRef.current.customAssetId&&!buildRef.current.pasteName&&!walkRef.current&&!insideHutRef.current){const dest=renderer.pickGround(e.clientX,e.clientY);if(dest){const w=stateRef.current.world;const fx=Math.round(dest.x),fy=Math.round(dest.y);const found=(w.placements??[]).find(p=>fx>=p.x0&&fx<=p.x1&&fy>=p.y0&&fy<=p.y1);if(found){moveDragging={kind:'placed',item:found};}else{const hut=hutAt(w,fx,fy);if(hut){moveDragging={kind:'house',hut};}else if(w.trees.some(t=>t.tx===fx&&t.ty===fy)||w.crates.some(c=>c.tx===fx&&c.ty===fy)){moveDragging={kind:'tree',x:fx,y:fy};}else if(terrainAt(w,fx,fy)==='dirt'){moveDragging={kind:'path',x:fx,y:fy};}}if(moveDragging)showMovePreview(e.clientX,e.clientY);}}if(!removeDragging&&!moveDragging&&studioToolRef.current&&!walkRef.current&&!insideHutRef.current){studioDragging=true;studioAddToStroke(e.clientX,e.clientY);}if(!removeDragging&&!moveDragging&&!studioDragging&&!walkRef.current&&!insideHutRef.current){const dest=renderer.pickGround(e.clientX,e.clientY);if(dest){const fx=Math.round(dest.x),fy=Math.round(dest.y);const areaSel=areaSelectionRef.current;const insideSel=!!(areaSel&&fx>=areaSel.rect.x0&&fx<=areaSel.rect.x1&&fy>=areaSel.rect.y0&&fy<=areaSel.rect.y1);if(areaSel&&(buildRef.current.areaMoveArmed||insideSel)){areaMoveDragging={start:{x:fx,y:fy},sel:areaSel};showAreaMovePreview(e.clientX,e.clientY);}else if(buildRef.current.areaSelectMode&&!buildRef.current.areaDuplicateArmed&&!buildRef.current.areaMoveArmed){areaSelectDragging={start:{x:fx,y:fy}};showAreaSelectPreview(areaSelectDragging.start,e.clientX,e.clientY);}}}if(!removeDragging&&!moveDragging&&!studioDragging&&!areaMoveDragging&&!areaSelectDragging&&buildRef.current.saveAreaMode&&!walkRef.current&&!insideHutRef.current){const dest=renderer.pickGround(e.clientX,e.clientY);if(dest){saveDragging={start:{x:Math.round(dest.x),y:Math.round(dest.y)}};showSavePreview(saveDragging.start,e.clientX,e.clientY);}} }else{renderer.drag=false;renderer.gestureMoved=true;renderer.pinchDistance=pointerDistance();if(removeDragging){finalizeRemoveStroke();removeDragging=false;hideRemovePreview();}if(moveDragging){moveDragging=null;hideMovePreview();}if(saveDragging){saveDragging=null;hideSavePreview();}if(areaMoveDragging){areaMoveDragging=null;hideAreaSelectPreview();}if(areaSelectDragging){areaSelectDragging=null;hideAreaSelectPreview();}if(studioDragging){studioDragging=false;studioStrokeRef.current=[];setStudioPreviewBoth(null);hideStudioPreviewDivs();}}canvas.setPointerCapture?.(e.pointerId)};
    const pointerDistance=()=>{const pts=[...renderer.pointers.values()];return pts.length<2?0:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)};
    const move=(e:PointerEvent)=>{if(!renderer.pointers.has(e.pointerId))return;renderer.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(renderer.pointers.size>=2){const distance=pointerDistance();if(renderer.pinchDistance>0&&distance>0)renderer.applyZoom((renderer.pinchDistance-distance)*.025);renderer.pinchDistance=distance;if(removeDragging){finalizeRemoveStroke();removeDragging=false;hideRemovePreview();}if(moveDragging){moveDragging=null;hideMovePreview();}if(saveDragging){saveDragging=null;hideSavePreview();}if(areaMoveDragging){areaMoveDragging=null;hideAreaSelectPreview();}if(areaSelectDragging){areaSelectDragging=null;hideAreaSelectPreview();}if(studioDragging){studioDragging=false;studioStrokeRef.current=[];setStudioPreviewBoth(null);hideStudioPreviewDivs();}return;}
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
      if(studioDragging){
        if(Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)>7)renderer.gestureMoved=true;
        studioAddToStroke(e.clientX,e.clientY);
        return;
      }
      if(buildRef.current.areaDuplicateArmed&&areaSelectionRef.current){
        showAreaDuplicatePreview(e.clientX,e.clientY);
        return;
      }
      if(!renderer.drag)return;
      if(Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)>7)renderer.gestureMoved=true;
      if(!renderer.gestureMoved)return;
      positionStudioPreviewDivs();
      // Drag right must turn the view right in both orbit and first-person.
      // The camera's forward vector is (-sin(yaw), -cos(yaw)); adding
      // yaw here made a rightward drag rotate the view left.
      renderer.yaw-=(e.clientX-renderer.lx)*.008;
      // BUILD 1137: vertical drag no longer changes camera pitch in
      // either first-person or orbit mode. Horizontal drag remains the
      // only camera-look gesture; arrow keys move the first-person player.
      renderer.lx=e.clientX;renderer.ly=e.clientY;
    };
    const up=(e:PointerEvent)=>{const wasTap=renderer.pointers.size===1&&renderer.drag&&!renderer.gestureMoved&&Math.hypot(e.clientX-renderer.gestureStartX,e.clientY-renderer.gestureStartY)<=10;
      renderer.pointers.delete(e.pointerId);renderer.drag=false;renderer.pinchDistance=0;
      const wasMoveDrag=moveDragging;moveDragging=null;hideMovePreview();
      const wasRemoveDrag=removeDragging;removeDragging=false;hideRemovePreview();
      const wasSaveDrag=saveDragging;saveDragging=null;hideSavePreview();
      const wasAreaMoveDrag=areaMoveDragging;areaMoveDragging=null;
      const wasAreaSelectDrag=areaSelectDragging;areaSelectDragging=null;
      const wasStudioDrag=studioDragging;studioDragging=false;
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
      else if(wasStudioDrag){/* the stroke stays a preview until Apply/Cancel */}
      else if(wasTap){
        const build=buildRef.current;
        // BUILD 1037: a tap the area-select branches consume must not
        // also walk/place — areaTapConsumed guards the toolActive/walk
        // logic below. A toggle tap outside the rect leaves it false
        // so the tap walks normally.
        let areaTapConsumed=false;
        // BUILD 1133: a studio tap paints the stroke (down already
        // added the tile; this is the retry when down missed it) and
        // never walks or places.
        if(studioToolRef.current&&!walkRef.current&&!insideHutRef.current){areaTapConsumed=true;studioAddToStroke(e.clientX,e.clientY);}
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
              const result=validatePlacement(world,build.palette,tx,ty,playerTile,npcTiles,placementRotRef.current,{bridgeStyle:bridgeStyleRef.current});
              if(!result.ok){setMessage('Cannot place here: '+result.reason);}
              // BUILD 1041: a fresh farm tile is planted NOW (the
              // growth clock starts at placement); move/undo carry
              // the stamp, paste/duplicate stamp their own copies.
              else{if(result.item.kind==='farm')result.item.farmPlantedAt=absMinutes(clockRef.current.day,clockRef.current.minutes);addPlacement(world,result.item);commitWorld(worldSyncCtx,world);buildIx.pushHistory({kind:'place',item:result.item});setMessage('Placed '+buildIx.placementLabel(result.item));}
            }
          }
        } else if(!areaTapConsumed&&!waitingRef.current&&!firstPersonRef.current) {
          // BUILD 1124: first-person is keyboard/touch-D-pad driven;
          // ground taps never create a hidden auto-walk journey.
          const destination=renderer.pickGround(e.clientX,e.clientY);
          if(!destination){/* no ground picked — nothing to do */}
          else {
            // A new tap cancels the previous gather order. Resource taps
            // take precedence over blocked-tile walking and target the
            // nearest walkable tile beside the selected object.
            stopAutoGather();
            const tx=Math.round(destination.x),ty=Math.round(destination.y),w=stateRef.current.world;
            const tree=w.trees.find(t=>t.tx===tx&&t.ty===ty);
            const rock=w.rocks.find(t=>t.tx===tx&&t.ty===ty);
            const ore=(w.mineralDeposits??[]).find(d=>d.x===tx&&d.y===ty&&d.remaining>0);
            if(tree)startAutoGather('tree',tx,ty);
            else if(rock)startAutoGather('rock',tx,ty);
            else if(ore)startAutoGather('deposit',tx,ty);
            else if(!controls.walkableAt(destination.x,destination.y)){setMessage('That destination is blocked');}
            else if(insideHutRef.current){
              renderer.moveTarget=destination;playerPathRef.current=null;setMessage('Walking to destination');
            } else {
              const path=planPlayerPath(w,stateRef.current.position,destination,controls.figureOccupiedTiles());
              if(!path){setMessage('Path blocked');}
              else{playerPathRef.current=path;playerPathReplanRef.current=performance.now();playerPathWaitRef.current=null;playerPathStuckRef.current=null;renderer.moveTarget=destination;setMessage('Walking to destination');}
            }
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
    const cancelOnContextMenu=(e:MouseEvent)=>{e.preventDefault();if(buildRef.current.palette||buildRef.current.customAssetId||buildRef.current.pasteName||studioToolRef.current){buildIx.cancelPlacement();setMessage('Placement cancelled');}};
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointermove',hover);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',controls.wheel,{passive:false});canvas.addEventListener('contextmenu',cancelOnContextMenu);

    renderer.bind({
      world, saveKey: SAVE_KEY,
      isAreaSelectDragging: () => areaSelectDragging !== null,
      isAreaMoveDragging: () => areaMoveDragging !== null,
      stateRef, clockRef, torchLitRef, waitingRef, insideHutRef, playerPathRef, playerPathWaitRef, playerPathStuckRef, slidePerpRef, sprintHeldRef, sprintLatchRef, sprintRearmRef, staminaRef, sprintingRef, drivingRef, carYawRef, carRef, prevPlayerRef, needsWorldRebuild, rebuildUrgent, worldBuilderRef, buildFramesRef, buildMsRef, rebuildStepStatsRef, rebuildCountRef, diagRef, onDiagnosticsRef, customAssetsRef, skyDriftRef, firstPersonRef, fpAutoRef, npcActorsRef, transientActorsRef, foundersRef, foundingRef, animalActorsRef, registryRef, constructionRef, storehouseRef, foodChainRef, metalChainRef, housingRef, penRef, staminaPublishCountRef, areaSelectionRef, buildRef,
      setPosition, setMessage, setStaminaUi, setSprintingUi, setSprintLatchedUi, setSprintRearmUi, setFirstPersonOn,
      walkableAt: controls.walkableAt, replanPlayerPath: controls.replanPlayerPath, followPlayerPath: controls.followPlayerPath, positionAreaSelectRect, areaSelectionLabel,
    });


    window.addEventListener('keydown',controls.action);
    // BUILD 983 screenshot harness: drive the first-person camera
    // without UI (renamed in 992: street view became first person on
    // full zoom; setStreetView stays as a deprecated alias).
    (window as any).__ag3dTest={
      setYaw:(v:number)=>{renderer.yaw=v},
      getYaw:()=>renderer.yaw,
      getPitch:()=>renderer.pitch,
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
      placeTestItem:(kind:PaletteKind,tx:number,ty:number,style?:BridgeStyle)=>{const w=stateRef.current.world;const player=stateRef.current.position;const playerTile={x:Math.round(player.x),y:Math.round(player.y)};const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];const result=validatePlacement(w,kind,tx,ty,playerTile,npcTiles,0,style?{bridgeStyle:style}:{});if(!result.ok)return null;addPlacement(w,result.item);commitWorld(worldSyncCtx,w);return JSON.parse(JSON.stringify(result.item));},
      // BUILD 1132 test hook (probes only — no gameplay effect): the
      // first tile where `kind` validates through the real placement
      // rules, or null when no tile in the world takes it. The probe
      // uses it to find a legal dock / stepping-stone / embankment /
      // ford tile instead of guessing coordinates.
      findInfraSpot:(kind:PaletteKind)=>{const w=stateRef.current.world;const player=stateRef.current.position;const playerTile={x:Math.round(player.x),y:Math.round(player.y)};const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];return firstValidTileFor(w,kind,playerTile,npcTiles);},
      // BUILD 1124 bridge integration probe: in testmode only, create a
      // short, isolated two-tile river crossing in unused wilderness,
      // stamp both bank paths and the real multi-tile bridge placements,
      // and return the coordinates so Playwright can walk the player over it.
      createBridgeCrossingForTest:()=>{
        if(!window.location.search.includes('testmode=1'))return null;
        const w=stateRef.current.world, p=stateRef.current.position;
        const playerTile={x:Math.round(p.x),y:Math.round(p.y)};
        const npcTiles=[
          ...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),
          ...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)})),
          ...foundersRef.current.map(f=>({x:Math.round(f.x),y:Math.round(f.y)})),
        ];
        const blocked=new Set<string>();
        const mark=(x:number,y:number)=>blocked.add(x+','+y);
        // Existing placements and live actors are indexed directly;
        // walkableWithPlacements below checks terrain, buildings, props,
        // walls and resource blockers without duplicating their schemas.
        for(const item of w.placements??[])for(let y=item.y0;y<=item.y1;y++)for(let x=item.x0;x<=item.x1;x++)mark(x,y);
        for(const n of npcTiles)mark(n.x,n.y);
        mark(playerTile.x,playerTile.y);
        for(let y=12;y<w.h-12;y+=3){
          for(let x=12;x<w.w-20;x+=3){
            if(Math.hypot(x-FOUNDER_CAMP.x,y-FOUNDER_CAMP.y)<32)continue;
            const line=Array.from({length:8},(_,i)=>({x:x+i,y}));
            if(line.some(t=>blocked.has(t.x+','+t.y)||terrainAt(w,t.x,t.y)==='water'||!walkableWithPlacements(w,w.crates,t.x,t.y)))continue;
            const near={x,y},far={x:x+3,y};
            if(!walkableWithPlacements(w,w.crates,near.x,near.y)||!walkableWithPlacements(w,w.crates,far.x,far.y))continue;
            const span=[{x:x+1,y},{x:x+2,y}];
            const river={id:'bridge-probe-'+x+'-'+y,tiles:span.map(tile=>({...tile,dx:1,dy:0,width:2})),mouth:{...far}} as any;
            const oldRivers=w.rivers??[];
            const oldTerrain=span.map(tile=>({key:terrainKey(tile.x,tile.y),value:w.terrain[terrainKey(tile.x,tile.y)]}));
            for(const tile of span)w.terrain[terrainKey(tile.x,tile.y)]='water';
            w.rivers=[...oldRivers,river];
            const spanTiles=bridgeSpanForCrossing(w,near,span[0]);
            if(spanTiles.length!==2||!Number.isFinite(scoreBridgeCrossing(w,near,span[0]))){
              w.rivers=oldRivers;for(const item of oldTerrain){if(item.value===undefined)delete w.terrain[item.key];else w.terrain[item.key]=item.value;}continue;
            }
            const style=bridgeStyleForCrossing(w,near,span[0]);
            const site=freshBridgeSite(span[0].x,span[0].y,near,spanTiles,style,bridgeAxisForCrossing(near,span[0]));
            const placed=placeBridgeSpan(w,site,playerTile,npcTiles);
            if(!placed.ok){
              w.rivers=oldRivers;for(const item of oldTerrain){if(item.value===undefined)delete w.terrain[item.key];else w.terrain[item.key]=item.value;}continue;
            }
            pathsRef.current={...pathsRef.current,bridges:finishBridge([...pathsRef.current.bridges,site],site.id)};
            commitWorld(worldSyncCtx,w);saveWorld(w);
            return {near,far,span:spanTiles,style,axis:'x'};
          }
        }
        return null;
      },
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
      getPlacement:()=>({palette:buildRef.current.palette,customAssetId:buildRef.current.customAssetId,rot:placementRotRef.current,bridgeStyle:bridgeStyleRef.current,moveMode:buildRef.current.moveMode}),
      // BUILD 1133 test hooks: World Studio (probes only — the
      // preview is pure, the apply runs the real commit path:
      // applyStudioEdit + commitWorld + one history entry).
      studioPreview:(tool:StudioTool,tiles:Array<{x:number;y:number}>)=>{const w=stateRef.current.world;const {playerTile,npcTiles}=buildIx.areaActorTiles();return previewStudioEdit(w,tool,tiles,{playerTile,npcTiles,paths:pathsRef.current,bridgeStyle:bridgeStyleRef.current,width:studioWidthRef.current});},
      studioApply:(tool:StudioTool,tiles:Array<{x:number;y:number}>)=>{const w=stateRef.current.world;const {playerTile,npcTiles}=buildIx.areaActorTiles();const res=applyStudioEdit(w,tool,tiles,{playerTile,npcTiles,paths:pathsRef.current,bridgeStyle:bridgeStyleRef.current,width:studioWidthRef.current});if(!res.ok)return res;commitWorld(worldSyncCtx,w);if(res.undo)buildIx.pushHistory(res.undo);clearStudioStroke();setMessage(res.message);return res;},
      studioGetRivers:()=>JSON.parse(JSON.stringify(stateRef.current.world.rivers??[])),
      getStudioPreview:()=>studioPreviewRef.current?JSON.parse(JSON.stringify(studioPreviewRef.current)):null,
      setStudioTool:(t:StudioTool|null)=>{setStudioToolBoth(t);return studioToolRef.current;},
      getStudioTool:()=>studioToolRef.current,
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
      getPaths:()=>({tiles:pathTiles(stateRef.current.world),fords:fordTiles(stateRef.current.world),well:wellTile(stateRef.current.world,FOUNDER_CAMP.x,FOUNDER_CAMP.y),bridges:pathsRef.current.bridges.map(b=>({...b,workTile:{...b.workTile}})),trafficTiles:Object.keys(pathsRef.current.traffic).length}),
      // BUILD 1127 test hook (read-only): the live bridge sites (probes only — no gameplay effect).
      getBridges:()=>pathsRef.current.bridges.map(b=>({...b,workTile:{...b.workTile}})),
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
      // BUILD 1108 (0x2B) test hooks: the slot inventory (probes only).
      // getInventorySlots/getEquipped/getInventoryRecord read the live
      // layout + record; givePlayerItem grants through the REAL paths —
      // resource kinds (wood/stone/gold/wheat→grain, food since 1109) via depositInto the
      // player store, the same path E-key gather uses; non-resource kinds
      // (gear: tools/weapons/armor) through the record's non-resource
      // channel, the same channel loot keepsakes use — there is no
      // registry kind for gear, and depositInto would create an entry
      // the player bridge can never read back. The inventory* hooks
      // drive the pure slot ops through the live view state, so the
      // probe proves the UI wiring, not just the pure functions (the
      // asserts prove those).
      getInventorySlots:()=>JSON.parse(JSON.stringify(invLayoutRef.current.slots)),
      getEquipped:()=>({...invLayoutRef.current.equipped}),
      getInventoryRecord:()=>({...inventoryRef.current}),
      givePlayerItem:(kind:string,qty:number)=>{const rk=kindForPlayerKey(kind);if(rk){const dep=depositInto(registryRef.current,PLAYER_STORE_ID,rk,qty,{type:'entity',id:'test-grant'},{location:{x:Math.round(stateRef.current.position.x),y:Math.round(stateRef.current.position.y)},ownerId:'player'});registryRef.current=dep.registry;refreshResourceUi();return dep.added;}const want=Math.max(0,Math.floor(qty));if(want<=0)return 0;inventoryRef.current={...inventoryRef.current,[kind]:(inventoryRef.current[kind]??0)+want};setInventory({...inventoryRef.current});refreshResourceUi();return want;},
      openInventory:()=>{setInventoryOpen(true);return true;},
      closeInventory:()=>{setInventoryOpen(false);return true;},
      // BUILD 1111 (0x2E) test hooks: the stations (probes only).
      // getStations reads the placed stations (world placements);
      // openStation/closeStation drive the panel; stationCraft runs
      // the same handler the panel button runs; getStationRecipes
      // lists every recipe with its unlock state; getDiscoveredMaterials
      // reads the persisted discovery set.
      getStations:()=>placedStationRects(stateRef.current.world),
      openStation:(id:string)=>{setOpenStation(id as StationId);return true;},
      closeStation:()=>{setOpenStation(null);return true;},
      stationCraft:(station:string,id:string)=>{handleStationCraft(station as StationId,id);return true;},
      getStationRecipes:()=>STATION_RECIPES.map((r)=>({station:r.station,id:r.id,name:r.name,unlocked:isRecipeUnlocked(r,discoveredRef.current)})),
      getDiscoveredMaterials:()=>[...discoveredRef.current],
      inventoryMove:(from:number,to:number)=>{handleInvMove(from,to);return JSON.parse(JSON.stringify(invLayoutRef.current.slots));},
      inventorySplit:(index:number)=>{handleInvSplit(index);return JSON.parse(JSON.stringify(invLayoutRef.current.slots));},
      inventoryEquip:(index:number)=>{handleInvEquip(index);return {...invLayoutRef.current.equipped};},
      inventoryUnequip:(slot:string)=>{handleInvUnequip(slot as EquipSlotId);return {...invLayoutRef.current.equipped};},
      // BUILD 1109 (0x2C) test hooks: the hotbar (probes only). Slots
      // 0-8 of the same layout — getHotbarSlots reads them, selectHotbar
      // / useHotbar drive the live view handlers, getHotbarSelected
      // reads the persisted selection.
      getHotbarSlots:()=>JSON.parse(JSON.stringify(invLayoutRef.current.slots.slice(0,9))),
      getHotbarSelected:()=>hotbarSelectedRef.current,
      selectHotbar:(index:number)=>{handleHotbarSelect(index);return hotbarSelectedRef.current;},
      useHotbar:(index:number)=>{handleHotbarUse(index);return {health:healthRef.current,slots:JSON.parse(JSON.stringify(invLayoutRef.current.slots.slice(0,9)))};},
      // BUILD 1110 (0x2D): gathering hooks (probes only — no
      // gameplay effect): craftHand drives the live craft handler;
      // getGatherState reads the world's gather health / gathered /
      // stump records; get/setToolDurability read + set the equipped
      // tool's remaining hits (the probe break test); getRecipes
      // lists the hand recipes with live affordability.
      craftHand:(id:string)=>{handleCraftHand(id);return {slots:JSON.parse(JSON.stringify(invLayoutRef.current.slots)),equipped:{...invLayoutRef.current.equipped}};},
      getGatherState:()=>JSON.parse(JSON.stringify({gatherHealth:stateRef.current.world.gatherHealth??{},gatheredAt:stateRef.current.world.gatheredAt??{},stumps:stateRef.current.world.stumps??[]})),
      getToolDurability:()=>{const kind=invLayoutRef.current.equipped.tool;if(!kind)return null;const max=maxDurabilityFor(kind);if(max===null)return null;return invLayoutRef.current.equippedDurability.tool??max;},
      setToolDurability:(n:number)=>{const kind=invLayoutRef.current.equipped.tool;if(!kind)return false;const max=maxDurabilityFor(kind);if(max===null)return false;const next={...invLayoutRef.current,equippedDurability:{...invLayoutRef.current.equippedDurability,tool:Math.max(0,Math.min(max,Math.floor(n)))}};commitInvLayout(next);return true;},
      getRecipes:()=>HAND_RECIPES.map((recipe)=>{const held:Record<string,number>={};for(const m of recipe.materials)held[m.kind]=playerHeldQty(m.kind);return {id:recipe.id,name:recipe.name,product:recipe.product,canCraft:canCraftHand(recipe,held)};}),
      // BUILD 1109 (0x2C): health read/write for the hotbar probe (the
      // meal heal is only observable through the live health value).
      getHealth:()=>healthRef.current,
      setHealth:(n:number)=>{const v=Math.min(100,Math.max(0,Math.floor(n)));healthRef.current=v;setHealth(v);try{localStorage.setItem(HEALTH_KEY,String(v));}catch{}return v;},
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

    return()=>{stopAutoGather();if(waitTimerRef.current!==null){window.clearInterval(waitTimerRef.current);waitTimerRef.current=null;}waitingRef.current=false;renderer.stop();stopNpcSim();window.clearInterval(founderTimer);window.clearInterval(clockTimer);window.removeEventListener('keydown',controls.keydown);window.removeEventListener('keyup',controls.keyup);window.removeEventListener('pointerup',sprintWinUp);window.removeEventListener('pointercancel',sprintWinCancel);window.removeEventListener('touchend',sprintWinTouchEnd);window.removeEventListener('blur',sprintWinBlur);window.removeEventListener('keydown',controls.action);window.removeEventListener('touchmove',stopTouch);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointermove',hover);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',controls.wheel);canvas.removeEventListener('contextmenu',cancelOnContextMenu);html.style.overflow=oldHtml.overflow;html.style.touchAction=oldHtml.touchAction;html.style.overscrollBehavior=oldHtml.overscrollBehavior;body.style.overflow=oldBody.overflow;body.style.touchAction=oldBody.touchAction;body.style.overscrollBehavior=oldBody.overscrollBehavior;body.style.position=oldBody.position;body.style.width=oldBody.width;renderer.dispose();};
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
    {!hideUi && <HudStrip message={message} clockUi={clockUi} health={health} staminaUi={staminaUi} sprintingUi={sprintingUi} sprintLatchedUi={sprintLatchedUi} sprintRearmUi={sprintRearmUi} inventory={inventory} campUi={campUi} onInventoryToggle={()=>setInventoryOpen(v=>!v)} onWaitToggle={()=>setWaitSheetOpen(v=>!v)} onSprintPointerDown={(e)=>{sprintPointerIdRef.current=e.pointerId;sprintDownRef.current={t:performance.now(),x:e.clientX,y:e.clientY};sprintHeldRef.current=true;}} onSprintPointerUp={(e)=>releaseSprintPointer(sprintCtx,e.pointerId,e.clientX,e.clientY,true)} onSprintPointerCancel={(e)=>releaseSprintPointer(sprintCtx,e.pointerId,e.clientX,e.clientY,false)} />}
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
    <InteriorCarButtons insideHut={!!insideHut} driving={driving} nearDoorHut={nearDoorHut} nearCar={nearCar} onEnterHut={()=>{if(nearDoorHut)buildIx.enterHut(nearDoorHut);}} onExitHut={buildIx.exitHut} onEnterCar={enterCar} onExitCar={exitCar} nearStation={nearStation?{id:nearStation.station,name:stationDefFor(nearStation.station).name}:null} onUseStation={()=>{if(nearStation)setOpenStation(nearStation.station);}} />
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
    {/* BUILD 1133: World Studio stroke preview — one div per
        tile, built by direct DOM writes from the drag handlers
        (never React state per pointermove); pointerEvents none so
        it never eats a tap. Green = will change, red = refused,
        dashed = the path connector to a bridge. */}
    <div ref={studioPreviewDivRef} data-testid="build-studio-preview" style={{display:'none',position:'absolute',inset:0,zIndex:5,pointerEvents:'none'}}></div>
    <div ref={placePreviewRef} data-testid="build-place-preview" style={{display:'none',position:'absolute',zIndex:5,pointerEvents:'none',border:'3px solid #4fc85a',borderRadius:6,background:'rgba(80,200,90,.28)',boxShadow:'0 0 0 2px rgba(0,0,0,.35)'}}>
      <span ref={placePreviewLabelRef} style={{position:'absolute',left:'50%',bottom:'100%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'3px 8px',marginBottom:4,borderRadius:8,background:'rgba(0,0,0,.75)',color:'#fff',fontSize:12,fontWeight:700}}></span>
    </div>
    <BuildPanel buildOpen={buildOpen} palette={palette} customSelection={customSelection} removeMode={removeMode} moveMode={moveMode} saveAreaMode={saveAreaMode} pasteName={pasteName} areaSelectMode={areaSelectMode} areaSelection={areaSelection} areaMoveArmed={areaMoveArmed} areaDuplicateArmed={areaDuplicateArmed} areaDeleteArmed={areaDeleteArmed} catalogCategory={catalogCategory} customAssets={customAssets} customAssetsLoading={customAssetsLoading} customAssetsWarning={customAssetsWarning} assetsSaving={assetsSaving} saveAssets={saveAssets} importHubOpen={importHubOpen} importProgress={importProgress} importReport={importReport} pendingImports={pendingImports} overwritePrompt={overwritePrompt} renamingId={renamingId} renameDraft={renameDraft} librarySearch={librarySearch} librarySort={librarySort} libraryCategoryFilter={libraryCategoryFilter} libraryFormatFilter={libraryFormatFilter} handoffChecked={handoffChecked} templates={templates} placedCount={placedCount} placementRot={placementRot} bridgeStyle={bridgeStyle} studioTool={studioTool} studioWidth={studioWidth} studioPreview={studioPreview} saveSelection={saveSelection} chunkName={chunkName} buildIx={buildIx} catalogSections={CATALOG_SECTIONS} kindMeta={KIND_META} setBuildOpen={setBuildOpen} setPalette={(v)=>{setPalette(v);if(v!==null)setStudioToolBoth(null);}} setCustomSelection={(v)=>{setCustomSelection(v);if(v!==null)setStudioToolBoth(null);}} setRemoveMode={setRemoveMode} setMoveMode={(v)=>{setMoveMode(v);if(v)setStudioToolBoth(null);}} setSaveAreaMode={(v)=>{setSaveAreaMode(v);if(v)setStudioToolBoth(null);}} setPasteName={(v)=>{setPasteName(v);if(v!==null)setStudioToolBoth(null);}} setAreaSelectMode={(v)=>{setAreaSelectMode(v);if(v)setStudioToolBoth(null);}} setAreaSelection={setAreaSelection} setAreaMoveArmed={(v)=>{setAreaMoveArmed(v);if(v)setStudioToolBoth(null);}} setAreaDuplicateArmed={(v)=>{setAreaDuplicateArmed(v);if(v)setStudioToolBoth(null);}} setAreaDeleteArmed={setAreaDeleteArmed} setCatalogCategory={setCatalogCategory} setImportHubOpen={setImportHubOpen} setReport={setReport} setPending={setPending} setOverwrite={setOverwrite} setRenameDraft={setRenameDraft} setRenamingId={setRenamingId} setLibrarySearch={setLibrarySearch} setLibrarySort={setLibrarySort} setLibraryCategoryFilter={setLibraryCategoryFilter} setLibraryFormatFilter={setLibraryFormatFilter} setChunkName={setChunkName} setSaveSelection={setSaveSelection} setTemplates={setTemplates} setMessage={setMessage} setPlacementRotBoth={setPlacementRotBoth} setBridgeStyleBoth={setBridgeStyleBoth} setStudioToolBoth={setStudioToolBoth} setStudioWidthBoth={setStudioWidthBoth} onStudioApply={studioApply} onStudioCancel={studioCancel} setHandoffCheckedBoth={setHandoffCheckedBoth} setLibraryAssetCategory={setLibraryAssetCategory} setLibraryAssetTags={setLibraryAssetTags} panelSwipeRef={panelSwipeRef} buildRef={buildRef} placePreviewRef={placePreviewRef} placeHoverRef={placeHoverRef} placePreviewFnRef={placePreviewFnRef} areaSelectPreviewRef={areaSelectPreviewRef} areaSelectPreviewLabelRef={areaSelectPreviewLabelRef} pendingImportsRef={pendingImportsRef} pendingDepsRef={pendingDepsRef} overwritePromptRef={overwritePromptRef} handoffCheckedRef={handoffCheckedRef} handoffSummaryRef={handoffSummaryRef} customAssetsRef={customAssetsRef} stateRef={stateRef} handleImportFiles={handleImportFiles} commitPendingAssets={commitPendingAssets} discardPendingAsset={discardPendingAsset} updatePendingAsset={updatePendingAsset} exportAssetPack={exportAssetPack} exportHandoff={exportHandoff} copyHandoffSummary={copyHandoffSummary} shareHandoff={shareHandoff} handoffSummaryFor={handoffSummaryFor} armCustomAsset={(id)=>{if(id!==null)setStudioToolBoth(null);armCustomAsset(id);}} deleteCustomAsset={deleteCustomAsset} renameLibraryAsset={renameLibraryAsset} resolveOverwritePrompt={resolveOverwritePrompt} />
    <InventoryPanel open={inventoryOpen} layout={invLayout} onMove={handleInvMove} onSplit={handleInvSplit} onEquip={handleInvEquip} onUnequip={handleInvUnequip} recipes={HAND_RECIPES.map((recipe)=>({recipe,canCraft:canCraftHand(recipe,craftHeld)}))} onCraft={handleCraftHand} onClose={()=>setInventoryOpen(false)} />
    {openStation&&<StationPanel open station={openStation} recipes={stationRecipesFor(openStation).map((recipe)=>{const held:Record<string,number>={};for(const m of recipe.materials)held[m.kind]=playerHeldQty(m.kind);return {recipe,unlocked:isRecipeUnlocked(recipe,discovered),canCraft:canCraftStation(recipe,held)};})} onCraft={(id)=>handleStationCraft(openStation,id)} onClose={()=>setOpenStation(null)} />}
    {!hideUi && <Hotbar layout={invLayout} selected={hotbarSelected} onSelect={handleHotbarSelect} onUse={handleHotbarUse} />}
  </div>;
}
