import { useEffect, useRef, useState } from 'react';
import { hutAt, isWalkableWorld, loadWorld, saveWorld, terrainAt, terrainKey, type HutRect, type IsoWorld, type PlacedItem } from '../iso/isoWorld';
import { mosslightEngineChunkLayout } from '../mosslightLayout';
import { emitVillager, villagerSpecFor, PLAYER_SPEC, PHASE_PER_UNIT, type VillagerSpec } from './villagers';
import { advanceRenderPos, needsRenderSnap, turnYawToward, easePhaseToNeutral, phaseForDistance, blockedAction, figureSlotLayout, poseKeyEquals, FIGURE_TURN_RATE, type FigurePoseKey } from './npcMotion';
import {
  houseDesignFor, houseDesignForVariant, HOUSE_VARIANTS, streetSlabsFor, cobbleSquaresFor,
  SKY_TOP, SKY_HORIZON, DIRT_TAN, COBBLE_GAP, MORTAR, hash2,
  DOOR_WOOD, GROUND_FLOOR_H, UPPER_FLOOR_H, roofRise,
  SUN_SHADE, shadeRgb, groundTintDelta,
  DOOR_W, DOOR_H, TREE_TIERS, FIRST_PERSON_EYE,
  FP_PITCH_MIN, FP_PITCH_MAX, ZOOM_MIN,
  VIEW_FAR_PLANE, VIEW_BAND_HALF, VIEW_BAND_CELL, VIEW_FAR_BAND_HALF, VIEW_FAR_BAND_CELL, VIEW_HORIZON_BAND_HALF, VIEW_HORIZON_BAND_CELL, VIEW_APRON_HALF,
  VIEW_BAND_Y, VIEW_FAR_BAND_Y, VIEW_HORIZON_BAND_Y, VIEW_APRON_Y,
} from './townLook';
import { applyZoomDelta } from './firstPerson';
import { emitSkyObjects, nightFactorForMinutes, NIGHT_NAVY, SKY_MAX_VERTS } from './sky';
import { emitHouseFx, houseFxInputsFor, resolveHouseFx, smokePuffsFor, chimneyTopFor, windowSlotsFor, FX_MAX_VERTS } from './houseFx';
import {
  placedHutRects, placedTreeTiles, placedStallRects, placedPathKeys,
  validatePlacement, movePlacement, moveGeneratedHut, moveGeneratedPath, moveGeneratedTree,
  movedRecordForHut, removeAt, removeAlongStroke, findRemovableNear, addPlacement, walkableWithPlacements,
  createBuildHistory, recordBuildChange, undoBuildChange, redoBuildChange,
  type PaletteKind, type UndoEntry, type BuildHistory,
} from './placements';
import { emitNaturalGrass, emitPlacedGrass } from './grassTufts';
import { emitGroundDetail3d } from './groundDetail3d';
import { stampTownBuildings, stampExtraRocks } from './townAdditions3d';
import { loadTemplates, saveTemplates, captureChunk, pasteChunk, uniquifyName, type ChunkTemplate } from './templates';
import { loadCustomAssets, saveCustomAssets, parseGlbUpload, validateCustomPlacement, removeCustomAssetPlacements, uniquifyAssetName, MAX_FILE_BYTES, MAX_LIBRARY_JSON, type CustomAsset } from './customAssets';
import { hutDoor, hutExitPoint, sameHut, nearestDoorHut, interiorBoxes, interiorFloorColor, interiorWalkable, rescuePosition, INTERIOR_FLOOR_Y } from './interiors';
import { ROSTER_3D, buildStaticAnchors, buildAnchors, scheduleTileFor, planPathNpc, npcWalkable, rosterArchetype, loadClock, saveClock } from './townsfolk3d';
import { spawnTransient, stepTransient, barkLineFor, barkDayEligible, maxVillagerVerts, MAX_TRAVELERS, MAX_ADVENTURERS, MAX_TRANSIENTS, TRAVELER_SPAWN_TICKS, ADVENTURER_SPAWN_TICKS, ADVENTURER_SPAWN_PHASE, BARK_CHECK_MS, BARK_GLOBAL_COOLDOWN_MS, BARK_NPC_COOLDOWN_MS, BARK_RANGE, type TransientActor, type TransientPathState } from './transients';
import { spawnAnimal, stepAnimal, emitAnimal, emitAnimalBlob, animalSpecFor, maxAnimalVerts, ANIMAL_SPAWN_TOPUP_TICKS, BIRD_FLIGHT_HEIGHT, MAX_BIRDS, MAX_GOATS, MAX_DEER, MAX_WOLVES, MAX_CHICKENS, MAX_ANIMALS, type AnimalActor, type AnimalPathState } from './animals';
import { WALK_SPEED, SPRINT_SPEED, STAMINA_MAX, stepStamina, FULL_STAMINA, type StaminaState } from './sprint';
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
        if (walkableWithPlacements(world, world.crates, tx, ty)) return p;
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
    walls: source.walls.filter(w => Math.abs(w.x - 100) > 68 || Math.abs(w.y - 100) > 68),
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
  // props use the current 3D crate placeholder until dedicated prop meshes land.
  for (const prop of layout.props) {
    const x = clamp(tile(prop.x)), y = clamp(tile(prop.y));
    if (!prop.solid || world.huts.some(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1)) continue;
    if (prop.kind === 'stall') {
      world.stalls.push({ x0: x, y0: y, x1: Math.min(world.w - 1, x + 1) });
    } else if (!world.crates.some(c => c.tx === x && c.ty === y) && !removedCrateKeys.has(terrainKey(x, y))) {
      world.crates.push({ tx: x, ty: y });
    }
  }

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
export function buildWorldVertices(world: IsoWorld, center: Position, enteredHut: HutRect | null = null, customAssets: CustomAsset[] = []): Float32Array {
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
    const d = Math.hypot(x - (center.x + .5), z - (center.y + .5));
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
  const cube = (x: number, z: number, w: number, h: number, d: number, color: Vec3) => {
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y0=0,y1=h;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],shadeRgb(color, SUN_SHADE.south));
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],shadeRgb(color, SUN_SHADE.north));
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],shadeRgb(color, SUN_SHADE.west));
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],shadeRgb(color, SUN_SHADE.east));
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],shadeRgb(color, SUN_SHADE.top));
  };
  const minX=Math.max(0,Math.floor(center.x)-22), maxX=Math.min(world.w-1,Math.floor(center.x)+22);
  const minY=Math.max(0,Math.floor(center.y)-22), maxY=Math.min(world.h-1,Math.floor(center.y)+22);
  // BUILD 984: placed paths render exactly like generated dirt roads.
  const placedPaths=placedPathKeys(world);
  const effTerrain=(x:number,y:number)=>placedPaths.has(terrainKey(x,y))?'dirt':terrainAt(world,x,y);
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
    const terrain=effTerrain(x,y);
    const c=COLORS[terrain]||COLORS.grass;
    // BUILD 1009: tint evaluated PER CORNER from the continuous 1009
    // field (see townLook groundTintDelta). Adjacent tiles share corner
    // positions and therefore corner colours exactly — the near field
    // reads as rolling variation, not a checkerboard, and the window
    // edge is invisible because the band cells beyond it sample the
    // same field at their own corners.
    const colAt=(cx:number,cy:number):Vec3=>{const t=groundTintDelta(terrain,cx,cy);return [c[0]+t[0],c[1]+t[1],c[2]+t[2]];};
    quadV([x,0,y],colAt(x,y),[x+1,0,y],colAt(x+1,y),[x+1,0,y+1],colAt(x+1,y+1),[x,0,y+1],colAt(x,y+1));
    // BUILD 983 street: scattered stone slabs on dirt, grey cobble shoulders
    // on grass/stone tiles beside a dirt tile. Overlays sit slightly above
    // the ground (slabs staggered per index) so nothing z-fights.
    if(terrain==='dirt'){
      const slabs=streetSlabsFor(x,y);
      for(let i=0;i<slabs.length;i++){
        const s=slabs[i],sy=.03+i*.002;
        quad([x+s.dx,sy,y+s.dz],[x+s.dx+s.w,sy,y+s.dz],[x+s.dx+s.w,sy,y+s.dz+s.d],[x+s.dx,sy,y+s.dz+s.d],[s.shade,s.shade,s.shade*.96]);
      }
    } else if(terrain==='grass'||terrain==='stone'){
      const nearDirt=(x>0&&effTerrain(x-1,y)==='dirt')||(x<world.w-1&&effTerrain(x+1,y)==='dirt')||(y>0&&effTerrain(x,y-1)==='dirt')||(y<world.h-1&&effTerrain(x,y+1)==='dirt');
      if(nearDirt){
        quad([x,.018,y],[x+1,.018,y],[x+1,.018,y+1],[x,.018,y+1],COBBLE_GAP);
        for(const sq of cobbleSquaresFor(x,y)){
          quad([x+sq.dx,.022,y+sq.dz],[x+sq.dx+sq.size,.022,y+sq.dz],[x+sq.dx+sq.size,.022,y+sq.dz+sq.size],[x+sq.dx,.022,y+sq.dz+sq.size],[sq.shade,sq.shade,sq.shade*.97]);
        }
      }
    }
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
    // Dirt can only exist inside the map (terrainAt falls back to
    // grass outside it, placed paths are bounds-checked), so the
    // dirt scan is clipped to the cell ∩ map rectangle — far cells
    // outside the map skip the scan entirely.
    const quadCellDirt=(x0:number,x1:number,y0:number,y1:number,y:number)=>{
      const sx0=Math.max(x0,0), sx1=Math.min(x1,world.w-1), sy0=Math.max(y0,0), sy1=Math.min(y1,world.h-1);
      let hasDirt=false;
      for(let yy=sy0;yy<=sy1&&!hasDirt;yy++) for(let xx=sx0;xx<=sx1;xx++) if(effTerrain(xx,yy)==='dirt'){hasDirt=true;break;}
      if(!hasDirt){
        const sx=x0+Math.floor((x1+1-x0)/2), sy=y0+Math.floor((y1+1-y0)/2);
        const bt=effTerrain(sx,sy), bc=COLORS[bt]||COLORS.grass;
        // BUILD 1009: per-corner tint from the continuous field. The
        // old single centre-sampled tint made every far cell one flat
        // block; corner sampling turns the same cell into a smooth
        // gradient of the same field the window samples directly, so
        // the cell edges vanish. Adjacent cells share corner positions
        // and therefore colours exactly — no seams at any ring edge.
        const colAt=(cx:number,cy:number):Vec3=>{const t=groundTintDelta(bt,cx,cy);return [bc[0]+t[0],bc[1]+t[1],bc[2]+t[2]];};
        quadV([x0,y,y0],colAt(x0,y0),[x1+1,y,y0],colAt(x1+1,y0),[x1+1,y,y1+1],colAt(x1+1,y1+1),[x0,y,y1+1],colAt(x0,y1+1));
        return;
      }
      for(let yy=y0;yy<=y1;yy++){
        let runStart=x0, runT=effTerrain(x0,yy);
        for(let xx=x0+1;xx<=x1+1;xx++){
          const t=xx<=x1?effTerrain(xx,yy):null;
          if(t!==runT){
            // BUILD 1009: dirt runs keep the 1008 subdivision geometry
            // (roads still render to their ends) but take per-corner
            // tint like every other ground quad, so a road's tint
            // varies smoothly along its length instead of stepping
            // once per run.
            const bc=COLORS[runT]||COLORS.grass;
            const colAt=(cx:number,cy:number):Vec3=>{const tt=groundTintDelta(runT,cx,cy);return [bc[0]+tt[0],bc[1]+tt[1],bc[2]+tt[2]];};
            quadV([runStart,y,yy],colAt(runStart,yy),[xx,y,yy],colAt(xx,yy),[xx,y,yy+1],colAt(xx,yy+1),[runStart,y,yy+1],colAt(runStart,yy+1));
            runStart=xx; runT=t!;
          }
        }
      }
    };
    const bx0=Math.floor(center.x)-VIEW_BAND_HALF, bx1=Math.floor(center.x)+VIEW_BAND_HALF;
    const by0=Math.floor(center.y)-VIEW_BAND_HALF, by1=Math.floor(center.y)+VIEW_BAND_HALF;
    for(let y=by0;y<=by1;y+=VIEW_BAND_CELL) for(let x=bx0;x<=bx1;x+=VIEW_BAND_CELL){
      const w=Math.min(VIEW_BAND_CELL,bx1+1-x), d=Math.min(VIEW_BAND_CELL,by1+1-y);
      quadCellDirt(x,x+w-1,y,y+d-1,VIEW_BAND_Y);
    }
    const fillCells=(x0:number,x1:number,y0:number,y1:number,cell:number,y:number)=>{
      for(let yy=y0;yy<=y1;yy+=cell) for(let xx=x0;xx<=x1;xx+=cell){
        const w=Math.min(cell,x1+1-xx), d=Math.min(cell,y1+1-yy);
        quadCellDirt(xx,xx+w-1,yy,yy+d-1,y);
      }
    };
    const fillRing=(inner:number,outer:number,cell:number,y:number)=>{
      const cx=Math.floor(center.x), cy=Math.floor(center.y);
      fillCells(cx-outer,cx+outer,cy+inner+1,cy+outer,cell,y);
      fillCells(cx-outer,cx+outer,cy-outer,cy-inner-1,cell,y);
      fillCells(cx-outer,cx-inner-1,cy-inner,cy+inner,cell,y);
      fillCells(cx+inner+1,cx+outer,cy-inner,cy+inner,cell,y);
    };
    fillRing(VIEW_BAND_HALF,VIEW_FAR_BAND_HALF,VIEW_FAR_BAND_CELL,VIEW_FAR_BAND_Y);
    fillRing(VIEW_FAR_BAND_HALF,VIEW_HORIZON_BAND_HALF,VIEW_HORIZON_BAND_CELL,VIEW_HORIZON_BAND_Y);
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
  // foliage tiers), shared by real trees, converted crates and converted
  // generated stalls — one renderer, never a second tree.
  // BUILD 992 proportion pass: tiers from townLook (total 4.44 =
  // 3.00x character). Same tiles, same collision — only the mesh grows.
  const treeAt=(tx:number,ty:number)=>{
    for(const t of TREE_TIERS) houseBox(tx+.5,ty+.5,t.w,t.h,t.w,t.y0,t.color);
  };
  // Walls and stall counters use the editor-authored collision geometry.
  for(const wall of world.walls) if(wall.x>=minX&&wall.x<=maxX&&wall.y>=minY&&wall.y<=maxY) cube(wall.x+.5,wall.y+.5,1,.85,1,[.43,.39,.32]);
  // BUILD 986: generated/authored stalls render as 983 trees, not brown
  // counter cubes. Stall data + collision are untouched; only the mesh
  // changes. User-PLACED stalls keep the brown counter cube below — a
  // deliberate Build-panel choice is never silently converted.
  // BUILD 1007: stalls render at whole-world range (were window-culled).
  for(const stall of world.stalls) for(let x=stall.x0;x<=stall.x1;x++) treeAt(x,stall.y0);
  for(const stall of placedStallRects(world)) for(let x=stall.x0;x<=stall.x1;x++) cube(x+.5,stall.y0+.5,1,.75,1,[.57,.31,.16]);
  // BUILD 997: uploaded custom meshes — static vertex-colour
  // triangles in the world buffer (like placed stalls, not the
  // per-frame actor buffer: uploads never move on their own). Mesh
  // local coords are centred XZ with base y=0 (1 unit = 1 tile), so
  // the mesh centres on the placement rect's centre. A placement
  // whose asset is gone renders nothing (delete removes copies
  // first, so this is defensive only).
  // BUILD 1007: custom assets render at whole-world range (were window-culled).
  for(const p of (world.placements??[])) if(p.kind==='custom'){
    const asset=customAssets.find(a=>a.id===p.assetId);if(!asset)continue;
    const ccx=(p.x0+p.x1+1)/2,ccz=(p.y0+p.y1+1)/2;
    for(let i=0;i<asset.indices.length;i+=3){
      const a=asset.indices[i]*3,b=asset.indices[i+1]*3,c=asset.indices[i+2]*3;
      triV([ccx+asset.positions[a],asset.positions[a+1],ccz+asset.positions[a+2]],[asset.colors[a],asset.colors[a+1],asset.colors[a+2]],
        [ccx+asset.positions[b],asset.positions[b+1],ccz+asset.positions[b+2]],[asset.colors[b],asset.colors[b+1],asset.colors[b+2]],
        [ccx+asset.positions[c],asset.positions[c+1],ccz+asset.positions[c+2]],[asset.colors[c],asset.colors[c+1],asset.colors[c+2]]);
    }
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
  const stoneJoints=(face:FaceDir,cx:number,cz:number,w:number,d:number)=>{
    const fixed=face==='south'?cz+d/2+.008:face==='north'?cz-d/2-.008:face==='west'?cx-w/2-.008:cx+w/2+.008;
    const span=face==='south'||face==='north'?w:d;
    const a0=face==='south'||face==='north'?cx-w/2:cz-d/2;
    const courses=3,courseH=GROUND_FLOOR_H/courses,blockW=.85;
    for(let c=0;c<courses;c++){
      const y0=c*courseH,y1=(c+1)*courseH;
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
    const seedHut=movedRecordForHut(world, hut)?.from ?? hut;
    if(enteredHut && sameHut(hut, enteredHut)) {
      for(let fy=hut.y0;fy<=hut.y1;fy++) for(let fx=hut.x0;fx<=hut.x1;fx++) {
        const fc=interiorFloorColor(fx,fy);
        quad([fx,INTERIOR_FLOOR_Y,fy],[fx+1,INTERIOR_FLOOR_Y,fy],[fx+1,INTERIOR_FLOOR_Y,fy+1],[fx,INTERIOR_FLOOR_Y,fy+1],fc);
      }
      for(const b of interiorBoxes(hut, seedHut)) box(b.x,b.z,b.w,b.h,b.d,b.y0,b.color);
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
    const topY=GROUND_FLOOR_H+(design.stories-1)*UPPER_FLOOR_H;
    const span=design.roofAxis==='x'?d:w;
    const ridgeY=topY+roofRise(span);
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
      quad([x-w/2-.45+.25,.005,z-d/2-.45+.35],[x+w/2+.45+.25,.005,z-d/2-.45+.35],[x+w/2+.45+.25,.005,z+d/2+.45+.35],[x-w/2-.45+.25,.005,z+d/2+.45+.35],[.28,.27,.24]);
      quad([x-w/2-.15+.12,.008,z-d/2-.15+.15],[x+w/2+.15+.12,.008,z-d/2-.15+.15],[x+w/2+.15+.12,.008,z+d/2+.15+.15],[x-w/2-.15+.12,.008,z+d/2+.15+.15],[.2,.19,.17]);
    }
    // Stone ground floor + mortar joints on all faces.
    houseBox(x,z,w,GROUND_FLOOR_H,d,0,design.stone);
    (['north','south','west','east'] as const).forEach(f=>stoneJoints(f,x,z,w,d));
    if(design.openFront){
      // Dark shopfront interior on the door face, timber posts + beam in
      // front of it, door offset to one side on the dark face.
      faceRect(face,aC,spanA-.3,GROUND_FLOOR_H/2,GROUND_FLOOR_H-.14,facePlane(.01),[.12,.1,.08]);
      const posts=3;
      for(let i=0;i<posts;i++){
        const a=aC-spanA/2+spanA*(i+1)/(posts+1);
        if(face==='south'||face==='north')houseBox(a,facePlane(.06),.14,GROUND_FLOOR_H,.14,0,design.timber);
        else houseBox(facePlane(.06),a,.14,GROUND_FLOOR_H,.14,0,design.timber);
      }
      if(face==='south'||face==='north')houseBox(x,facePlane(.06),w,.14,.14,GROUND_FLOOR_H-.14,design.timber);
      else houseBox(facePlane(.06),z,.14,.14,d,GROUND_FLOOR_H-.14,design.timber);
      faceRect(face,aC+spanA*.28,DOOR_W,DOOR_H/2,DOOR_H,facePlane(.03),DOOR_WOOD);
    } else {
      // Door + timber lintel + stone step on the door face.
      // BUILD 992: door 0.87 x 1.78 (1.20x character); lintel + step
      // span the wider door (1.21 = door + margin).
      faceRect(face,aC,DOOR_W,DOOR_H/2,DOOR_H,facePlane(.02),DOOR_WOOD);
      faceRect(face,aC,1.21,GROUND_FLOOR_H+.06,.12,facePlane(.02),design.timber);
      if(face==='south')houseBox(x,z+d/2+.15,1.21,.12,.3,0,design.stone);
      else if(face==='north')houseBox(x,z-d/2-.15,1.21,.12,.3,0,design.stone);
      else if(face==='west')houseBox(x-w/2-.15,z,.12,.12,1.21,0,design.stone);
      else houseBox(x+w/2+.15,z,.12,.12,1.21,0,design.stone);
    }
    // Upper floors: plaster boxes + timber corner posts + floor beams.
    for(let s=1;s<design.stories;s++){
      const y0=GROUND_FLOOR_H+(s-1)*UPPER_FLOOR_H;
      houseBox(x,z,w,UPPER_FLOOR_H,d,y0,design.plaster);
    }
    const po=.06;
    houseBox(x-w/2+po,z-d/2+po,.13,topY-GROUND_FLOOR_H,.13,GROUND_FLOOR_H,design.timber);
    houseBox(x+w/2-po,z-d/2+po,.13,topY-GROUND_FLOOR_H,.13,GROUND_FLOOR_H,design.timber);
    houseBox(x-w/2+po,z+d/2-po,.13,topY-GROUND_FLOOR_H,.13,GROUND_FLOOR_H,design.timber);
    houseBox(x+w/2-po,z+d/2-po,.13,topY-GROUND_FLOOR_H,.13,GROUND_FLOOR_H,design.timber);
    for(let s=0;s<design.stories-1;s++){
      const y=GROUND_FLOOR_H+s*UPPER_FLOOR_H;
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
    for(const s of windowSlotsFor(x,z,w,d,face,design.stories)){
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
    if(design.roofAxis==='x'){
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
    const chimTop=chimneyTopFor(x,z,w,d,design);
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
        houseBox(signA,facePlane(.16),.08,.08,.3,2.32,design.timber);
        houseBox(signA,facePlane(.32),.7,.45,.06,2.02,[.78,.58,.25]);
      } else {
        houseBox(facePlane(.16),signA,.3,.08,.08,2.32,design.timber);
        houseBox(facePlane(.32),signA,.06,.45,.7,2.02,[.78,.58,.25]);
      }
    } else if(design.building==='store'){
      const aw=spanA/2-.3;
      const a0=aC-aw,a1=aC+aw;
      if(face==='south'||face==='north'){
        quad([a0,2.0,facePlane(.02)],[a1,2.0,facePlane(.02)],[a1,1.65,facePlane(.78)],[a0,1.65,facePlane(.78)],[.55,.25,.18]);
        houseBox(a0,facePlane(.78),.08,1.65,.08,0,design.timber);
        houseBox(a1,facePlane(.78),.08,1.65,.08,0,design.timber);
        houseBox(aC-spanA*.35,facePlane(.45),.5,.5,.5,0,[.57,.31,.16]);
        houseBox(aC+spanA*.35,facePlane(.45),.5,.5,.5,0,[.57,.31,.16]);
        houseBox(aC-spanA*.35,facePlane(.45),.35,.35,.35,.5,[.5,.27,.14]);
      } else {
        quad([facePlane(.02),2.0,a0],[facePlane(.02),2.0,a1],[facePlane(.78),1.65,a1],[facePlane(.78),1.65,a0],[.55,.25,.18]);
        houseBox(facePlane(.78),a0,.08,1.65,.08,0,design.timber);
        houseBox(facePlane(.78),a1,.08,1.65,.08,0,design.timber);
        houseBox(facePlane(.45),aC-spanA*.35,.5,.5,.5,0,[.57,.31,.16]);
        houseBox(facePlane(.45),aC+spanA*.35,.5,.5,.5,0,[.57,.31,.16]);
        houseBox(facePlane(.45),aC-spanA*.35,.35,.35,.35,.5,[.5,.27,.14]);
      }
    }
  }
  // BUILD 1007: trees render at whole-world range (were window-culled).
  for(const t of [...world.trees, ...placedTreeTiles(world)]) {
    // BUILD 983: low-poly tapered tree (trunk + 3 shrinking foliage
    // tiers) instead of the old single green cube. Visual only — same
    // tile, same collision, same positions. BUILD 986: now the shared
    // treeAt renderer (identical geometry).
    treeAt(t.tx,t.ty);
  }
  // BUILD 985: stylized grass tufts (StayAtHomeDev MIT meshes, baked in
  // grassMeshes.ts, coloured by grassTufts.ts: base-to-tip gradient x
  // world-XZ noise). Natural tufts seed by tile so they never reshuffle
  // across window rebuilds; placed grass from the Build panel renders
  // the same way. Emitted after trees so blades sit above the ground
  // quads, before rocks/crates (draw order is irrelevant — one buffer).
  emitNaturalGrass(triV, world, effTerrain, minX, maxX, minY, maxY);
  emitPlacedGrass(triV, world, minX, maxX, minY, maxY);
  // BUILD 1015: wildflowers + pebbles (groundDetail3d.ts) — same
  // window, same determinism as the tufts, a few hundred verts.
  emitGroundDetail3d(triV, world, effTerrain, minX, maxX, minY, maxY);
  // BUILD 1007: rocks + crates render at whole-world range (were window-culled).
  // BUILD 1015: rocks vary in size and shade by tile seed (0.5-1.0
  // wide, 0.4-0.9 tall) instead of one identical cube — the wild reads
  // less stamped. Collision is unchanged (the whole tile blocks,
  // whatever the visual size).
  for(const r of world.rocks){
    const rw=.5+hash2(r.tx*3.1+21,r.ty*7.7+21)*.5;
    const rh=.4+hash2(r.tx*5.3+23,r.ty*9.1+23)*.5;
    const sh=.8+hash2(r.tx*7.7+27,r.ty*3.3+27)*.25;
    cube(r.tx+.5,r.ty+.5,rw,rh,rw,[.43*sh,.45*sh,.44*sh]);
  }
  // BUILD 986: generated/authored crates + layout prop placeholders render
  // as 983 trees, not brown cubes. Data untouched — the wood interaction
  // still finds and removes the crate entry (see the E-key handler).
  for(const c of world.crates) treeAt(c.tx,c.ty);
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

export default function Engine3DWorldView({ onExit, fpAuto = true }: { onExit?: () => void; fpAuto?: boolean }) {
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
  const [position,setPosition]=useState<Position>(()=>savedPosition(applyMosslightTownLayout(loadWorld())));
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
  const [chunkName,setChunkName]=useState('');
  const buildRef=useRef<{palette:PaletteKind|null;removeMode:boolean;moveMode:boolean;saveAreaMode:boolean;pasteName:string|null;customAssetId:string|null}>({palette:null,removeMode:false,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:null});
  // BUILD 996: chunk library. Lazy-loaded from localStorage (key
  // ag-3d-templates-v1, separate from world saves); every change
  // persists via the effect below. templatesRef mirrors it for the
  // pointer handlers (same pattern as stateRef). Saving/deleting a
  // chunk is panel state, never a world change or undo entry.
  const [templates,setTemplates]=useState<ChunkTemplate[]>(()=>loadTemplates());
  const templatesRef=useRef<ChunkTemplate[]>(templates);
  templatesRef.current=templates;
  useEffect(()=>{saveTemplates(templates);},[templates]);
  // BUILD 997: custom GLB uploads. Same pattern as templates: lazy
  // load from localStorage (key ag-3d-custom-assets-v1, separate from
  // world saves), every change persists via the effect below, and
  // customAssetsRef mirrors it for the render-loop closures (which
  // capture refs, not state). customSelection is the armed upload
  // (asset id, or null); it mirrors into buildRef.customAssetId like
  // every other tool. Uploading is library state, never a world
  // change or undo entry; placing an upload is a normal `place`
  // entry, and deleting an upload removes its placed copies at once
  // (also not undoable — same as deleting a chunk).
  const [customAssets,setCustomAssets]=useState<CustomAsset[]>(()=>loadCustomAssets());
  const customAssetsRef=useRef<CustomAsset[]>(customAssets);
  customAssetsRef.current=customAssets;
  useEffect(()=>{saveCustomAssets(customAssets);},[customAssets]);
  const [customSelection,setCustomSelection]=useState<string|null>(null);
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
  const setWalk=(v:boolean)=>{walkRef.current=v;setWalkSuspended(v);};
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
  const toolLabel=(p:PaletteKind|null,rm:boolean,mv?:boolean,sa?:boolean,pn?:string|null)=>pn?('Paste '+pn):sa?'Save area':mv?'Move':rm?'Remove':p?({path:'Pathway',house:'House',tree:'Tree',stall:'Market Stall',grass:'Grass','house-cottage':'Cottage','house-tall':'Tall House','house-shop':'Shopfront','house-grand':'Grand House','house-inn':'Inn','house-smith':'Blacksmith','house-store':'General Store'} as Record<PaletteKind,string>)[p]:'';
  // BUILD 997: display name for a placed item — built-in kinds use
  // the catalog label; a custom item uses its upload's name (or a
  // fallback when the upload is gone). Used by Move/Remove messages
  // so they never index KIND_META with 'custom' (which has no entry
  // and would crash the preview/message path). BUILD 1012: a placed
  // house shows its variant's label (Cottage / Tall House /
  // Shopfront / Grand House); a legacy variant-less house is 'House'.
  const placementLabel=(item:PlacedItem)=>item.kind==='custom'?(customAssetsRef.current.find(a=>a.id===item.assetId)?.name??'Custom model'):item.kind==='house'&&item.variant?(HOUSE_VARIANTS[item.variant]?.label??'House'):({path:'Pathway',house:'House',tree:'Tree',stall:'Market Stall',grass:'Grass'} as Record<string,string>)[item.kind]??item.kind;
  const walkToolLabel=()=>{const t=toolLabel(palette,removeMode,moveMode,saveAreaMode,pasteName);if(t)return t;if(customSelection){const a=customAssets.find(x=>x.id===customSelection);return a?a.name:'Custom';}return '';};
  // BUILD 1004: the ONE Remove toggle. The panel's Remove button and
  // the minimized-cluster quick button both call this, so the two can
  // never diverge. Body is the panel toggle's original handler, moved
  // verbatim: turning Remove on clears any palette/custom choice and
  // Move/Save/Paste; turning it off keeps the palette it displaced.
  const toggleRemove=()=>{const next=!removeMode;setRemoveMode(next);if(next){setPalette(null);setCustomSelection(null);}setMoveMode(false);setSaveAreaMode(false);setPasteName(null);buildRef.current={palette:next?null:palette,removeMode:next,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:next?null:buildRef.current.customAssetId};};
  // BUILD 1004: "build UI is minimized" — panel hidden but a tool
  // still armed. Only in this state do the right-edge strip swipe and
  // the minimized handle reopen the panel; a full close (×) clears
  // the tools, so nothing reopens until Build is tapped again.
  const buildMinimized=!buildOpen&&!!(palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName);
  // BUILD 997: upload a .glb file picked in the panel. Every failure
  // is a message, never a crash: bad magic, wrong version, external
  // buffers, non-triangle geometry, oversize file or full library
  // all reject before anything is stored. The input resets so the
  // same file can be picked again after a rejection.
  const handleCustomUpload=async(e:{target:{files:FileList|null;value:string}})=>{
    const file=e.target.files&&e.target.files[0];
    e.target.value='';
    if(!file)return;
    if(file.size>MAX_FILE_BYTES){setMessage('Upload failed: file is over 1 MB');return;}
    let buf:ArrayBuffer;
    try{buf=await file.arrayBuffer();}catch{setMessage('Upload failed: could not read the file');return;}
    const res=parseGlbUpload(buf,file.name);
    if(!res.ok){setMessage('Upload failed: '+res.reason);return;}
    const existing=customAssetsRef.current;
    const name=uniquifyAssetName(existing.map(a=>a.name),res.asset.name);
    const next=[...existing,{...res.asset,name}];
    if(JSON.stringify(next).length>MAX_LIBRARY_JSON){setMessage('Upload failed: custom library is full (2 MB cap)');return;}
    setCustomAssets(next);
    setMessage('Uploaded \''+name+'\' — pick it in Custom, then tap the ground to place it');
  };
  const deleteCustomAsset=(asset:CustomAsset)=>{
    const world=stateRef.current.world;
    const n=removeCustomAssetPlacements(world,asset.id);
    setCustomAssets(prev=>prev.filter(a=>a.id!==asset.id));
    if(customSelection===asset.id){setCustomSelection(null);buildRef.current={...buildRef.current,customAssetId:null};}
    if(n>0){saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);}
    setMessage('Deleted upload \''+asset.name+'\''+(n>0?' (removed '+n+' placed cop'+(n===1?'y':'ies')+')':''));
  };
  // BUILD 995: scrollable asset catalog (Sims/Forge-style). Categories
  // group the five placeable kinds; tiles reuse each kind's own mesh
  // colours as the preview swatch (path = dirt tan + cobble grey,
  // house = plaster cream + roof brown, tree = foliage green + trunk
  // brown, stall = brown counter cube, grass = tuft tip-to-base
  // green). No search box: five kinds need categories, not search —
  // search becomes justified when custom uploads (997) grow the list.
  // Category selection is panel UI state: it persists while the view
  // is mounted (minimize keeps it, like the tool selection); only the
  // tool itself is cleared by close.
  type CatalogCategory='all'|'terrain'|'buildings'|'plants'|'props'|'custom';
  const CATALOG_SECTIONS:{id:Exclude<CatalogCategory,'all'>;label:string;kinds:PaletteKind[]}[]=[
    {id:'terrain',label:'Terrain',kinds:['path','grass']},
    // BUILD 1012: the Buildings section offers the four real town
    // house designs (cottage / tall / shopfront / grand) instead of
    // the one bare 'house' kind — each is its own palette entry with
    // its own look, footprint, and interior. Bare 'house' is the
    // legacy placed kind (old saves only) and is not offered here.
    {id:'buildings',label:'Buildings',kinds:['house-cottage','house-tall','house-shop','house-grand','house-inn','house-smith','house-store']},
    {id:'plants',label:'Plants',kinds:['tree']},
    {id:'props',label:'Props',kinds:['stall']},
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
    tree:{label:'Tree',swatch:'linear-gradient(135deg,#295729 0 50%,#5c3b1f 50% 100%)'},
    stall:{label:'Market Stall',swatch:'#914f29'},
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
    const worldBuffer=gl.createBuffer()!,actorBuffer=gl.createBuffer()!,corpseBuffer=gl.createBuffer()!,skyObjBuffer=gl.createBuffer()!,fxBuffer=gl.createBuffer()!;
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
    let lastFxStats={houses:0,chimneys:0,litHouses:0,smokeVerts:0,totalVerts:0};
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
    let lastStaminaPublish=0,lastStaminaInt=STAMINA_MAX,lastExhaustedPub=false,lastSprintingPub=false;
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
      if(inside&&interiorWalkable(inside,gx,gy))
        return !npcActorsRef.current.some(npcNear)&&!transientActorsRef.current.some(transientNear)&&!animalActorsRef.current.some(animalNear);
      if(npcActorsRef.current.some(npcNear))return false;
      if(transientActorsRef.current.some(transientNear))return false;
      if(animalActorsRef.current.some(animalNear))return false;
      return walkableWithPlacements(world,world.crates,gx,gy);
    };
    const pickGround=(clientX:number,clientY:number)=>{
      const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
      const nx=((clientX-rect.left)/rect.width)*2-1,ny=1-((clientY-rect.top)/rect.height)*2;
      const p=stateRef.current.position;
      const tx=p.x+.5,tz=p.y+.5,ty=.8;
      // BUILD 984: first person uses the eye-level camera, not the orbit
      // camera — the old code always used orbit math, so first-person
      // taps mis-picked (BUILD 983 delta #4). Branching here fixes both
      // first-person tap-to-move and placement taps.
      let eyeX:number,eyeZ:number,eyeY:number,forward:number[];
      if(firstPersonRef.current){
        eyeX=tx;eyeZ=tz;eyeY=FIRST_PERSON_EYE;
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
      const t=-eyeY/dy;if(t<=0)return null;
      const x=eyeX+dx*t-.5,y=eyeZ+dz*t-.5;
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=world.w||y>=world.h)return null;
      return {x,y};
    };
    const wheel=(e:WheelEvent)=>{e.preventDefault();applyZoom(e.deltaY*.012);};
    const keys=new Set<string>();
    const keydown=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','f',' ','shift'].includes(k)){e.preventDefault();keys.add(k);}};
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
      const p=stateRef.current.position;const px=p.x+.5,pz=p.y+.5,py=.8;
      let eyeX:number,eyeZ:number,eyeY:number,forward:number[];
      if(firstPersonRef.current){eyeX=px;eyeZ=pz;eyeY=FIRST_PERSON_EYE;forward=[-Math.sin(yaw)*Math.cos(lookPitch),Math.sin(lookPitch),-Math.cos(yaw)*Math.cos(lookPitch)];}
      else{eyeX=px+Math.sin(yaw)*zoom*Math.cos(pitch);eyeZ=pz+Math.cos(yaw)*zoom*Math.cos(pitch);eyeY=py+zoom*Math.sin(pitch);forward=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];}
      const right=[Math.cos(yaw),0,-Math.sin(yaw)];
      const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
      const scale=Math.tan(WORLD_FOV_RAD/2),aspect=rect.width/rect.height;
      const vx=tx+.5-eyeX,vy=0-eyeY,vz=ty+.5-eyeZ;
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
      if(label)label.textContent='Remove '+({placed:'placed item',house:'house',tree:'tree',path:'path'} as Record<string,string>)[snapped.kind];
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
    const down=(e:PointerEvent)=>{if((e.target as HTMLElement).closest('button'))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){drag=true;gestureMoved=false;gestureStartX=e.clientX;gestureStartY=e.clientY;lx=e.clientX;ly=e.clientY;removeDragging=!!(buildRef.current.removeMode&&!walkRef.current&&!insideHutRef.current);removeStrokeEntries=[];removeStrokeTiles=new Set();removeStrokeRects=[];if(removeDragging)showRemovePreview(e.clientX,e.clientY);if(!removeDragging&&buildRef.current.moveMode&&!walkRef.current&&!insideHutRef.current){const dest=pickGround(e.clientX,e.clientY);if(dest){const w=stateRef.current.world;const fx=Math.round(dest.x),fy=Math.round(dest.y);const found=(w.placements??[]).find(p=>fx>=p.x0&&fx<=p.x1&&fy>=p.y0&&fy<=p.y1);if(found){moveDragging={kind:'placed',item:found};}else{const hut=hutAt(w,fx,fy);if(hut){moveDragging={kind:'house',hut};}else if(w.trees.some(t=>t.tx===fx&&t.ty===fy)||w.crates.some(c=>c.tx===fx&&c.ty===fy)){moveDragging={kind:'tree',x:fx,y:fy};}else if(terrainAt(w,fx,fy)==='dirt'){moveDragging={kind:'path',x:fx,y:fy};}}if(moveDragging)showMovePreview(e.clientX,e.clientY);}}if(!removeDragging&&!moveDragging&&buildRef.current.saveAreaMode&&!walkRef.current&&!insideHutRef.current){const dest=pickGround(e.clientX,e.clientY);if(dest){saveDragging={start:{x:Math.round(dest.x),y:Math.round(dest.y)}};showSavePreview(saveDragging.start,e.clientX,e.clientY);}} }else{drag=false;gestureMoved=true;pinchDistance=pointerDistance();if(removeDragging){finalizeRemoveStroke();removeDragging=false;hideRemovePreview();}if(moveDragging){moveDragging=null;hideMovePreview();}if(saveDragging){saveDragging=null;hideSavePreview();}}canvas.setPointerCapture?.(e.pointerId)};
    const pointerDistance=()=>{const pts=[...pointers.values()];return pts.length<2?0:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)};
    const move=(e:PointerEvent)=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>=2){const distance=pointerDistance();if(pinchDistance>0&&distance>0)applyZoom((pinchDistance-distance)*.025);pinchDistance=distance;if(removeDragging){finalizeRemoveStroke();removeDragging=false;hideRemovePreview();}if(moveDragging){moveDragging=null;hideMovePreview();}if(saveDragging){saveDragging=null;hideSavePreview();}return;}
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
      if(!drag)return;
      if(Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>7)gestureMoved=true;
      if(!gestureMoved)return;
      yaw+=(e.clientX-lx)*.008;
      if(firstPersonRef.current)lookPitch=Math.max(FP_PITCH_MIN,Math.min(FP_PITCH_MAX,lookPitch+(e.clientY-ly)*.006));
      else pitch=Math.max(.22,Math.min(1.25,pitch+(e.clientY-ly)*.006));
      lx=e.clientX;ly=e.clientY;
    };
    const up=(e:PointerEvent)=>{const wasTap=pointers.size===1&&drag&&!gestureMoved&&Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)<=10;
      pointers.delete(e.pointerId);drag=false;pinchDistance=0;
      const wasMoveDrag=moveDragging;moveDragging=null;hideMovePreview();
      const wasRemoveDrag=removeDragging;removeDragging=false;hideRemovePreview();
      const wasSaveDrag=saveDragging;saveDragging=null;hideSavePreview();
      if(wasMoveDrag){
        if(gestureMoved)finalizeMove(e.clientX,e.clientY,wasMoveDrag);
        else setMessage('Drag an item to move it');
      }
      else if(wasRemoveDrag&&removeStrokeEntries.length>0){finalizeRemoveStroke();}
      // BUILD 996: a save-area drag (or tap) finalizes the selection
      // instead of walking or placing — the naming row in the panel
      // does the actual save. A tap selects its single tile.
      else if(wasSaveDrag){finalizeSaveSelection(e.clientX,e.clientY,wasSaveDrag);}
      else if(wasTap){
        const build=buildRef.current;
        // BUILD 989: Walk suspension pauses the tool without clearing
        // it — a suspended tap walks exactly like a no-tool tap. The
        // walk branch below is the only other path, so suspended taps
        // and no-tool taps behave identically. D-pad movement never
        // consults buildRef, so it always walks regardless.
        // BUILD 990: while inside, Build placement/removal is disabled —
        // taps move only, even with a tool selected (the Enter button
        // is separate UI, so entry works regardless of the active tool).
        const toolActive=!insideHutRef.current&&!walkRef.current&&(build.palette||build.customAssetId||build.removeMode||build.pasteName);
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
                const res=pasteChunk(world,template,{x:tx,y:ty},playerTile,npcTiles);
                if(res.landed.length===0){setMessage('Nothing pasted from \''+template.name+'\': '+(res.skipped[0]?res.skipped[0].reason:'blocked'));}
                else{saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory({kind:'paste',items:res.landed});setMessage('Pasted '+res.landed.length+' of '+template.items.length+' from \''+template.name+'\''+(res.skipped.length?' ('+res.skipped.length+' skipped: '+res.skipped[0].reason+')':'')+' · tap again to paste more, or tap the chunk to stop');}
              }
            } else if(build.removeMode){
              // BUILD 989: full chain — placed > generated house (whole
              // rect) > generated tree (real tree and/or crate on the
              // tile, one tap) > generated path tile. Every successful
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
              else{saveWorld(world);needsWorldRebuild.current=true;pushHistory({kind:'unpath',x:res.x,y:res.y});setMessage('Removed path');}
            } else if(build.customAssetId){
              // BUILD 997: an armed upload places with its mesh
              // footprint (min corner on the tapped tile) under the
              // same blocking rules as houses — one undo entry, like
              // any other placement.
              const asset=customAssetsRef.current.find(a=>a.id===build.customAssetId);
              if(!asset){setMessage('That upload is gone');}
              else{
                const player=stateRef.current.position;
                const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
                const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];
                const result=validateCustomPlacement(world,asset,tx,ty,playerTile,npcTiles);
                if(!result.ok){setMessage('Cannot place here: '+result.reason);}
                else{addPlacement(world,result.item);saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory({kind:'place',item:result.item});setMessage('Placed '+asset.name);}
              }
            } else if(build.palette){
              const player=stateRef.current.position;
              const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
              const npcTiles=[...npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))];
              const result=validatePlacement(world,build.palette,tx,ty,playerTile,npcTiles);
              if(!result.ok){setMessage('Cannot place here: '+result.reason);}
              else{addPlacement(world,result.item);saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);pushHistory({kind:'place',item:result.item});setMessage('Placed '+placementLabel(result.item));}
            }
          }
        } else {
          const destination=pickGround(e.clientX,e.clientY);
          if(destination&&walkableAt(destination.x,destination.y)){moveTarget=destination;setMessage('Walking to destination');}
          else if(destination){setMessage('That destination is blocked');}
        }
      }
      if(pointers.size===1){const p=[...pointers.values()][0];lx=p.x;ly=p.y;drag=true;gestureMoved=true;}
    };
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
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
      if(moveTarget){
        moveDx=moveTarget.x-player.x;moveDy=moveTarget.y-player.y;
        if(Math.hypot(moveDx,moveDy)<.08){moveTarget=null;moveDx=0;moveDy=0;}
        else hasInput=true;
      }else{
        const held=[...keys].filter(k=>['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k));
        moveDx=(held.includes('d')||held.includes('arrowright')?1:0)-(held.includes('a')||held.includes('arrowleft')?1:0);
        moveDy=(held.includes('s')||held.includes('arrowdown')?1:0)-(held.includes('w')||held.includes('arrowup')?1:0);
        hasInput=moveDx!==0||moveDy!==0;
      }
      // BUILD 1003: sprint multiplies speed INSIDE this same pipeline —
      // same step, same walkableAt checks, same wall sliding. Hold =
      // Sprint button or Shift key; exhausted forces walk.
      const sprintHeld=sprintHeldRef.current||keys.has('shift');
      const sprintingNow=sprintHeld&&!staminaRef.current.exhausted&&hasInput;
      // Position before this frame's step, so stamina can tell real
      // displacement from a zero-displacement slide (see below).
      const prevMoveX=player.x,prevMoveY=player.y;
      if(hasInput){
        const dist=Math.hypot(moveDx,moveDy),step=Math.min(dist,(sprintingNow?SPRINT_SPEED:WALK_SPEED)*dt);
        const nx=player.x+moveDx/dist*step,ny=player.y+moveDy/dist*step;
        if(walkableAt(nx,ny)){player={x:nx,y:ny};current.position=player;walkingNow=true;}
        else{
          // Slide along walls while retaining smooth world-space movement.
          const sx=player.x+moveDx/dist*step,sy=player.y;
          const ax=player.x,ay=player.y+moveDy/dist*step;
          if(walkableAt(sx,sy)){player={x:sx,y:sy};current.position=player;walkingNow=true;}
          else if(walkableAt(ax,ay)){player={x:ax,y:ay};current.position=player;walkingNow=true;}
          else if(moveTarget){moveTarget=null;setMessage('Path blocked');}
        }
        if(moveTarget&&Math.hypot(moveTarget.x-player.x,moveTarget.y-player.y)<.08)moveTarget=null;
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
      const nextStamina=stepStamina(staminaRef.current,dt,sprintHeld,actuallyMoved);
      staminaRef.current=nextStamina;sprintingRef.current=sprintingNow&&actuallyMoved;
      const nextStaminaInt=Math.round(nextStamina.stamina);
      if((now-lastStaminaPublish>100&&nextStaminaInt!==lastStaminaInt)||nextStamina.exhausted!==lastExhaustedPub||sprintingRef.current!==lastSprintingPub){lastStaminaPublish=now;lastStaminaInt=nextStaminaInt;lastExhaustedPub=nextStamina.exhausted;lastSprintingPub=sprintingRef.current;setStaminaUi(nextStamina);setSprintingUi(sprintingRef.current);}
      const dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;needsWorldRebuild.current=true}
      player=stateRef.current.position;
      // BUILD 983: the old code only rebuilt on resize/interactions, so
      // the 45×45 window went stale after walking ~20 tiles. Rebuild when
      // the player moves >8 tiles from the last build centre.
      if(Math.hypot(player.x-lastBuildX,player.y-lastBuildY)>8)needsWorldRebuild.current=true;
      if(needsWorldRebuild.current){const built=buildWorldVertices(world,player,insideHutRef.current,customAssetsRef.current);if(built.length===0){setMessage('3D diagnostic: world generated zero terrain vertices');}else{upload(worldBuffer,built);worldVertCount=built.length/6;setMessage('3D diagnostic: '+worldVertCount.toLocaleString()+' terrain vertices · '+world.w+'×'+world.h+' map');}needsWorldRebuild.current=false;lastBuildX=player.x;lastBuildY=player.y}
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
      const targetX=player.x+.5,targetZ=player.y+.5,targetY=.8;
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
      // + 32 (max orbit radius) = 314, far under 700; (2) the clip edge
      // must sit past the fog-full distance, or hazed-green ground
      // would end visibly against sky: worst clip-edge distance from
      // the build centre is 700 - 32 - 8 = 660, past FOG_FAR 600, so
      // the clipped edge is always uniform horizon colour. Apron
      // coverage 1000 - 32 = 968 > 700, so the apron always extends
      // past the far plane. Depth precision at a given distance
      // depends on the near plane (0.1) and the distance, not the far
      // plane, so 700 costs nothing versus 300 at 282 tiles.
      // BUILD 992: eye at FIRST_PERSON_EYE (0.90x character),
      // level gaze by default (lookPitch starts 0).
      // BUILD 992: turning first-person-auto OFF while in first person
      // drops back to orbit at the minimum distance (the zoom handlers
      // alone cannot see the toggle flip).
      if(firstPersonRef.current&&!fpAutoRef.current){firstPersonRef.current=false;setFirstPersonOn(false);zoom=ZOOM_MIN;}
      const mat=firstPersonRef.current
        ? mul(perspective(WORLD_FOV_RAD,w/h,.1,VIEW_FAR_PLANE),lookAt([targetX,FIRST_PERSON_EYE,targetZ],[targetX-Math.sin(yaw)*Math.cos(lookPitch)*10,FIRST_PERSON_EYE+Math.sin(lookPitch)*10,targetZ-Math.cos(yaw)*Math.cos(lookPitch)*10]))
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
      const skyEye:Vec3=firstPersonRef.current?[targetX,FIRST_PERSON_EYE,targetZ]:[ex,ey,ez];
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
      const fxCounts=emitHouseFx(fxArr,houseFxInputsFor(world,insideHutRef.current),clockRef.current.minutes,skyDriftRef.current);
      lastFxStats={houses:fxCounts.houses,chimneys:fxCounts.chimneys,litHouses:fxCounts.litHouses,smokeVerts:fxCounts.smokeVerts,totalVerts:fxCounts.totalVerts};
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
      const emitFigureSlot=(slot:number,cx:number,cz:number,yaw:number,phase:number,spec:VillagerSpec,child:boolean,rx:number,rz:number,pre?:number[])=>{
        const key:FigurePoseKey={x:rx,z:rz,yaw,phase};
        if(!poseKeyEquals(slotUploaded.get(slot)??null,key)){
          const tmp:number[]=pre??[];
          if(!pre)emitVillager(tmp,cx,cz,yaw,phase,spec,child);
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
        emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(npc.name),rosterArchetype(npc.name)==='child',st.x,st.y);
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
        emitVillager(pre,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(t.name),false);
        emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(t.name),false,st.x,st.y,pre);
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
        emitAnimal(pre,a.kind,st.x+.5,st.y+.5,st.h,yaw,phase,animalSpecFor(a.id,a.kind),{graze:st.graze,flying:a.state==='flying',flutter:a.state==='scuttling'});
        // BUILD 1015 polish: shadow blob under ground animals (1013
        // shipped none; emitAnimalBlob in animals.ts). Landing/takeoff
        // forces a slot re-emit via the h-change check above, so the
        // blob appears and disappears with the bird.
        emitAnimalBlob(pre,a.kind,st.x+.5,st.y+.5,st.h);
        emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,PLAYER_SPEC,false,st.x,st.y,pre);
      }
      // BUILD 992: in first person the camera IS the player — hide the
      // player figure or it fills the frame. NPC figures still draw.
      if(!firstPersonRef.current){
        const px=player.x+.5,pz=player.y+.5;
        const prev=figureState.get('__player');
        const dist=prev?Math.hypot(px-prev.px,pz-prev.pz):0;
        const pose=figurePose('__player',px,pz,nowMs,dt*1000,dist>0,dist);
        emitFigureSlot(playerSlot,px,pz,pose.yaw,pose.phase,PLAYER_SPEC,false,player.x,player.y);
      }
      motionStats={emitted,reused,drawn};
      const corpseVerts:number[]=[];
      const corpse=(x:number,z:number)=>{const color:Vec3=[.38,.18,.16],x0=x-.28,x1=x+.28,z0=z-.28,z1=z+.28,y0=0,y1=.18;const tri=(a:Vec3,b:Vec3,c:Vec3)=>{for(const p of [a,b,c])corpseVerts.push(...p,...color)};tri([x0,y0,z1],[x1,y0,z1],[x1,y1,z1]);tri([x0,y0,z1],[x1,y1,z1],[x0,y1,z1]);};
      for(const npc of npcActorsRef.current) if(!npc.looted&&!npc.alive)corpse(npc.x+.5,npc.y+.5);
      if(corpseVerts.length){upload(corpseBuffer,new Float32Array(corpseVerts));gl.drawArrays(gl.TRIANGLES,0,corpseVerts.length/6);}
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
      setFirstPerson:(v:boolean)=>{firstPersonRef.current=v;setFirstPersonOn(v)},
      setStreetView:(v:boolean)=>{firstPersonRef.current=v;setFirstPersonOn(v)},
      getFirstPerson:()=>firstPersonRef.current,
      getZoom:()=>zoom,
      setPlayer:(x:number,y:number)=>{stateRef.current.position={x,y};setPosition({x,y});needsWorldRebuild.current=true},
      // BUILD 990 test hook (read-only): the entered hut's rect, or null.
      getInsideHut:()=>insideHutRef.current?{...insideHutRef.current}:null,
      getPlacements:()=>JSON.parse(JSON.stringify(stateRef.current.world.placements??[])),
      // BUILD 996 test hooks: chunk library, save selection, armed
      // paste template (probes only — no gameplay effect).
      getTemplates:()=>JSON.parse(JSON.stringify(templatesRef.current)),
      // BUILD 997 test hook (read-only): uploaded custom assets.
      getCustomAssets:()=>JSON.parse(JSON.stringify(customAssetsRef.current)),
      getSaveSelection:()=>saveSelectionRef.current?{...saveSelectionRef.current}:null,
      getPasteName:()=>buildRef.current.pasteName,
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
      getHouseFx:()=>{const details=resolveHouseFx(houseFxInputsFor(world,insideHutRef.current),clockRef.current.minutes);const c=details.find(d=>d.top);const sample=c&&c.top?{top:[...c.top],puffs:smokePuffsFor(c.top,c.seedX0,c.seedY0,skyDriftRef.current)}:null;return {minutes:clockRef.current.minutes,night:nightFactorForMinutes(clockRef.current.minutes),drift:skyDriftRef.current,...lastFxStats,houses:details.map(d=>({x0:d.hut.x0,y0:d.hut.y0,x1:d.hut.x1,y1:d.hut.y1,doorFace:d.doorFace,stories:d.stories,chimney:!!d.top,onMin:d.schedule.onMin,offMin:d.schedule.offMin,lit:d.lit})),smokeSample:sample};},
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
      // Probe-only: drop a stale tap destination so key-based probe runs
      // are not overridden by an earlier tap (no gameplay effect — taps
      // only ever set moveTarget from the canvas handler).
      clearMoveTarget:()=>{moveTarget=null;},
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
        // BUILD 993: day clock + roster positions for schedule probes.
        clockMinutes: clockRef.current.minutes,
        clockDay: clockRef.current.day,
        npcs: npcActorsRef.current.map(n=>({name:n.name,x:n.x,y:n.y,alive:n.alive})),
      }),
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
    const npcPath=new Map<string,{dest:string;path:{x:number;y:number}[];index:number;noPathTicks:number;blockedTicks:number}>();
    const npcTimer=window.setInterval(()=>{
      const actors=npcActorsRef.current;
      const clock=clockRef.current;
      const anchors=buildAnchors(world,staticAnchors);
      actors.forEach((actor,i)=>{
        if(!actor.alive)return;
        const idx=npcByName.get(actor.name);if(idx===undefined)return;
        const sched=scheduleTileFor(ROSTER_3D[idx],idx,anchors,clock.minutes,clock.day,world);
        const cx=Math.round(actor.x),cy=Math.round(actor.y);
        if(cx===sched.tx&&cy===sched.ty){npcPath.delete(actor.name);return;}
        const destKey=sched.tx+','+sched.ty;
        let w=npcPath.get(actor.name);
        if(!w||w.dest!==destKey){
          w={dest:destKey,path:planPathNpc(world,{x:cx,y:cy},{x:sched.tx,y:sched.ty})??[],index:0,noPathTicks:0,blockedTicks:0};
          npcPath.set(actor.name,w);
        }
        if(w.path.length===0){
          // No route (sealed): wait, retry planning occasionally in case
          // the world changed (a placed item removed).
          w.noPathTicks++;
          if(w.noPathTicks>=11){
            w.path=planPathNpc(world,{x:cx,y:cy},{x:sched.tx,y:sched.ty})??[];
            w.index=0;w.noPathTicks=0;
          }
          return;
        }
        const next=w.path[w.index];
        if(!next){npcPath.delete(actor.name);return;}
        if(!npcWalkable(world,next.x,next.y)){
          // Path tile became unwalkable (placed item / removal): replan.
          w.path=planPathNpc(world,{x:cx,y:cy},{x:sched.tx,y:sched.ty})??[];
          w.index=0;w.noPathTicks=0;w.blockedTicks=0;
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
          w.blockedTicks++;
          if(blockedAction(w.blockedTicks)==='replan'){
            const detour=planPathNpc(world,{x:cx,y:cy},{x:sched.tx,y:sched.ty},4000,new Set([next.x+','+next.y]));
            if(detour){w.path=detour;w.index=0;w.blockedTicks=0;w.noPathTicks=0;}
            else{w.path=[];w.index=0;w.blockedTicks=0;w.noPathTicks=0;}
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

    return()=>{cancelAnimationFrame(raf);window.clearInterval(npcTimer);window.clearInterval(transientTimer);window.clearInterval(animalTimer);window.clearInterval(barkTimer);window.clearInterval(clockTimer);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('keydown',action);window.removeEventListener('touchmove',stopTouch);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);html.style.overflow=oldHtml.overflow;html.style.touchAction=oldHtml.touchAction;html.style.overscrollBehavior=oldHtml.overscrollBehavior;body.style.overflow=oldBody.overflow;body.style.touchAction=oldBody.touchAction;body.style.overscrollBehavior=oldBody.overscrollBehavior;body.style.position=oldBody.position;body.style.width=oldBody.width;gl.deleteBuffer(worldBuffer);gl.deleteBuffer(actorBuffer);gl.deleteBuffer(corpseBuffer);gl.deleteBuffer(skyBuffer);gl.deleteBuffer(skyObjBuffer);gl.deleteBuffer(fxBuffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs)};
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
    <div style={{position:'absolute',left:10,top:10,padding:'7px 10px',borderRadius:8,background:'#14241ddf',color:'#f2f7f2',font:'700 11px/1.4 system-ui',pointerEvents:'none'}}>ADVENTURE 3D · WORLD SIMULATION <span style={{opacity:.8,fontWeight:400}}>Editable terrain · collision · walking NPC schedules · saved progress</span></div>
    <div style={{position:'absolute',left:10,bottom:14,padding:'7px 10px',borderRadius:8,background:'#14241ddf',color:'#fff',fontSize:12}}>{message} · {Math.round(position.x)},{Math.round(position.y)}<div style={{marginTop:5}}>HP {health}/100 · Wood {inventory.wood||0} · Stone {inventory.stone||0} · Gold {inventory.gold||0}</div>{/* BUILD 1003: stamina HUD — bar + number, green normally, red + "Tired" while exhausted. */}<div style={{marginTop:3}}>Stamina {Math.round(staminaUi.stamina)}/100<div style={{display:'inline-block',width:120,height:8,marginLeft:6,borderRadius:4,background:'#3a4a3f',verticalAlign:'middle',overflow:'hidden'}}><div data-testid="sprint-stamina-bar" style={{width:Math.round(staminaUi.stamina)+'%',height:'100%',background:staminaUi.exhausted?'#c0392b':'#5fbf6f'}} /></div>{staminaUi.exhausted?' · Tired — walk to recover':''}</div><div style={{opacity:.8,marginTop:3}}>{firstPersonOn?'Tap ground to move · drag to look · pinch to zoom out · E: interact · F/Space: attack · Enter: step inside at a door · Hold Sprint/Shift: sprint':'Tap ground to move · drag to rotate · pinch to zoom · E: interact · F/Space: attack · Enter: step inside at a door · Hold Sprint/Shift: sprint'}</div></div>
    <button type="button" onClick={onExit} style={{position:'absolute',right:12,top:12,zIndex:4,padding:'10px 13px',border:'1px solid #c4d1bd',borderRadius:9,background:'#172c23e8',color:'#fff',fontWeight:700}}>Exit 3D</button>
    {/* BUILD 992: the 983 Street view toggle is removed from the main UI.
        First person now engages on full zoom; its setting lives in the
        Options dialog. BUILD 984 placement tool: bottom-right, clear of
        Options (top-right) and the diagnostic (bottom-left). */}
    <button type="button" data-testid="build-toggle" onClick={()=>{if(!buildOpen)setWalk(false);setBuildOpen(v=>!v);}} style={{position:'absolute',right:12,bottom:14,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:(buildOpen||palette||removeMode||moveMode)?'#526d42':'#172c23e8',color:'#fff',fontWeight:700,fontSize:16}}>Build</button>
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
    {!buildOpen&&(palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName)&&<button type="button" data-testid="build-walk-toggle" onClick={()=>setWalk(!walkSuspended)} style={{position:'absolute',right:12,bottom:76,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:walkSuspended?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:16}}>{walkSuspended?(walkToolLabel()?'Resume '+walkToolLabel():'Resume'):'Walk'}</button>}
    {!buildOpen&&((palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName)||undoAvailable||redoAvailable)&&<button type="button" data-testid="build-undo" disabled={!undoAvailable} onClick={doUndo} style={{position:'absolute',right:12,bottom:138,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,opacity:undoAvailable?1:0.45}}>Undo</button>}
    {!buildOpen&&((palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName)||undoAvailable||redoAvailable)&&<button type="button" data-testid="build-redo" disabled={!redoAvailable} onClick={doRedo} style={{position:'absolute',right:12,bottom:200,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,opacity:redoAvailable?1:0.45}}>Redo</button>}
    {/* BUILD 1003: Sprint — HOLD to sprint (button or Shift key). Next
        slot in the fixed right-side stack (Build 14 / Walk 76 / Undo
        138 / Redo 200 / Sprint 262, same 62px step) so it never shifts
        and never collides: no clash with Build, Enter/Exit (center
        bottom 110), or the message box (bottom-left). Rendered always
        in normal play; when the Build panel is open it sits under the
        panel (later in DOM, same zIndex) — minimize to reach it, same
        as the rest of the cluster. Pointer capture so a sliding finger
        still releases cleanly; green while sprint-moving, dimmed +
        "Tired" while exhausted (forced walk until 25 stamina). */}
    <button type="button" data-testid="sprint-toggle" onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId);sprintHeldRef.current=true;}} onPointerUp={()=>{sprintHeldRef.current=false;}} onPointerCancel={()=>{sprintHeldRef.current=false;}} onLostPointerCapture={()=>{sprintHeldRef.current=false;}} onContextMenu={(e)=>e.preventDefault()} style={{position:'absolute',right:12,bottom:262,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:sprintingUi?'#3f7d4e':staminaUi.exhausted?'#5a3a2e':'#22392d',color:'#fff',fontWeight:700,fontSize:16,opacity:staminaUi.exhausted?0.65:1,touchAction:'none',WebkitTouchCallout:'none',userSelect:'none'}}>{staminaUi.exhausted?'Tired':'Sprint'}</button>
    {/* BUILD 1004: Remove quick toggle — the SAME toggleRemove the
        panel's Remove button calls, so the two can never diverge.
        Renders in the minimized cluster (same visibility rule as
        Undo/Redo) at the next fixed slot (bottom:324, same 62px
        step), green while Remove is on, so Remove flips without
        opening the panel at all. Hidden while the panel is open,
        where the panel's own toggle is the path; it sits under the
        panel's footprint exactly like Sprint does. */}
    {!buildOpen&&((palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName)||undoAvailable||redoAvailable)&&<button type="button" data-testid="build-remove-quick-toggle" onClick={toggleRemove} style={{position:'absolute',right:12,bottom:324,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:removeMode?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:16}}>Remove</button>}
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
    {!insideHut&&nearDoorHut&&<button type="button" data-testid="interior-enter" onClick={()=>enterHut(nearDoorHut)} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:110,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#526d42',color:'#fff',fontWeight:700,fontSize:16}}>Enter</button>}
    {insideHut&&<button type="button" data-testid="interior-exit" onClick={exitHut} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:110,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#526d42',color:'#fff',fontWeight:700,fontSize:16}}>Exit</button>}
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
    {/* BUILD 996: save-area rectangle preview — dashed gold rectangle
        positioned by direct DOM writes from the drag handlers; the
        label gives the rectangle size in tiles. pointerEvents none
        so it never eats a tap. */}
    <div ref={savePreviewRef} data-testid="build-save-preview" style={{display:'none',position:'absolute',zIndex:5,pointerEvents:'none',border:'3px dashed #ffd94d',borderRadius:6,boxShadow:'0 0 0 2px rgba(0,0,0,.35)'}}>
      <span ref={savePreviewLabelRef} style={{position:'absolute',left:'50%',bottom:'100%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'3px 8px',marginBottom:4,borderRadius:8,background:'rgba(0,0,0,.75)',color:'#ffd94d',fontSize:12,fontWeight:700}}></span>
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
        <button type="button" data-testid="build-close" title="Close (clears your tool)" onClick={()=>{setBuildOpen(false);setPalette(null);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setSaveAreaMode(false);setPasteName(null);setSaveSelection(null);setCatalogCategory('all');buildRef.current={palette:null,removeMode:false,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:null};setWalk(false);}} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,lineHeight:1}}>×</button>
      </div>
      <div style={{fontSize:12,opacity:.85,marginTop:4,lineHeight:1.4}}>Pick an item from the catalog, then tap the ground to place it. Tap Remove, then an item, path, house, or tree to take it down — taps snap to the nearest removable tile, and dragging in Remove mode clears a whole section at once (one Undo tap restores the whole drag). Tap Move, then drag an item you placed to a new spot — one Undo tap moves it back. Minimize (—) keeps your tool; close (×) clears it. While minimized, Walk pauses your tool so taps move you, Undo steps back through your changes one tap at a time, and Redo steps forward again — a new change clears Redo. Save area lets you drag a rectangle, name it, and keep it as a chunk; tap a saved chunk, then tap the ground to stamp it elsewhere, and one Undo removes the whole paste. In the Custom category you can upload your own .glb model — it renders as plain coloured triangles (textures and animation are ignored), places like any other item, and one Undo removes it.</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:10}}>
        {(['all','terrain','buildings','plants','props','custom'] as const).map(cat=><button key={cat} type="button" data-testid={'build-catalog-category-'+cat} onClick={()=>setCatalogCategory(cat)} style={{padding:'8px 10px',borderRadius:9,border:'1px solid #c4d1bd',background:catalogCategory===cat?'#526d42':'#22392d',color:'#fff',fontWeight:catalogCategory===cat?700:500,fontSize:13}}>{{all:'All',terrain:'Terrain',buildings:'Buildings',plants:'Plants',props:'Props',custom:'Custom'}[cat]}</button>)}
      </div>
      <div data-testid="build-catalog-list" style={{maxHeight:280,overflowY:'auto',marginTop:10,paddingRight:2}}>
        {CATALOG_SECTIONS.filter(sec=>catalogCategory==='all'||catalogCategory===sec.id).map(sec=><div key={sec.id}>
          <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:8}}>{sec.label}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:6}}>
            {sec.kinds.map(kind=><button key={kind} type="button" data-testid={'build-palette-'+kind} onClick={()=>{const next=palette===kind?null:kind;setPalette(next);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setSaveAreaMode(false);setPasteName(null);buildRef.current={palette:next,removeMode:false,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:null};}} style={{padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:palette===kind?'#526d42':'#22392d',color:'#fff',fontWeight:palette===kind?700:500,fontSize:14}}>
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
          {customAssets.length===0
            ? <div style={{fontSize:12,opacity:.7,marginTop:6}}>No custom uploads yet — upload a .glb file below.</div>
            : <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:6}}>
                {customAssets.map(a=><div key={a.id} style={{display:'flex',flexDirection:'column',gap:6}}>
                  <button type="button" data-testid="build-custom-asset" onClick={()=>{const next=customSelection===a.id?null:a.id;setCustomSelection(next);setPalette(null);setRemoveMode(false);setMoveMode(false);setSaveAreaMode(false);setPasteName(null);buildRef.current={palette:null,removeMode:false,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:next};}} style={{padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:customSelection===a.id?'#526d42':'#22392d',color:'#fff',fontWeight:customSelection===a.id?700:500,fontSize:14}}>
                    <span style={{display:'block',height:26,borderRadius:6,background:'rgb('+Math.round(a.avgColor[0]*255)+','+Math.round(a.avgColor[1]*255)+','+Math.round(a.avgColor[2]*255)+')',marginBottom:6,border:'1px solid rgba(255,255,255,.25)'}}></span>
                    {a.name}
                  </button>
                  <button type="button" data-testid="build-custom-delete" aria-label={'Delete '+a.name} onClick={()=>deleteCustomAsset(a)} style={{padding:'8px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#7a3b2e',color:'#fff',fontWeight:700,fontSize:12}}>Delete</button>
                </div>)}
              </div>}
          <div style={{marginTop:8}}>
            <label style={{fontSize:12,opacity:.85}}>Upload a .glb model (max 1 MB)</label>
            <input type="file" accept=".glb" data-testid="build-custom-upload" onChange={handleCustomUpload} style={{display:'block',width:'100%',marginTop:6,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12,boxSizing:'border-box'}} />
            <div style={{fontSize:11,opacity:.7,marginTop:4,lineHeight:1.4}}>Renders as plain coloured triangles — textures and animation are ignored. 1 unit = 1 tile; footprint max 8×8. PNGs cannot be placed: the 3D renderer draws geometry, not pictures.</div>
          </div>
        </div>}
      </div>
      <button type="button" data-testid="build-remove-toggle" onClick={toggleRemove} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:removeMode?'#7a3b2e':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Remove: {removeMode?'On':'Off'}</button>
      <button type="button" data-testid="build-move-toggle" onClick={()=>{const next=!moveMode;setMoveMode(next);if(next){setPalette(null);setCustomSelection(null);setRemoveMode(false);setSaveAreaMode(false);setPasteName(null);}buildRef.current={palette:next?null:palette,removeMode:next?false:removeMode,moveMode:next,saveAreaMode:false,pasteName:null,customAssetId:next?null:buildRef.current.customAssetId};}} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:moveMode?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Move: {moveMode?'On':'Off'}</button>
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
        <div style={{fontSize:11,opacity:.75,marginTop:4,lineHeight:1.4}}>Turn Save area on, then drag a rectangle on the ground — or tap one tile — to select it. Name it and save it as a chunk. Tap a saved chunk, then tap the ground to stamp it there (its corner lands on the tapped tile); items that cannot fit are skipped and reported, never blocking the rest. One Undo removes a whole paste. Chunks save only what you placed — generated houses, paths, and trees are not captured, and custom uploads are not captured yet.</div>
        <button type="button" data-testid="build-save-area-toggle" onClick={()=>{const next=!saveAreaMode;setSaveAreaMode(next);if(next){setPalette(null);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setPasteName(null);}setSaveSelection(null);buildRef.current={palette:next?null:palette,removeMode:next?false:removeMode,moveMode:next?false:moveMode,saveAreaMode:next,pasteName:next?null:pasteName,customAssetId:next?null:buildRef.current.customAssetId};}} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:saveAreaMode?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Save area: {saveAreaMode?'On':'Off'}</button>
        {saveSelection&&<div style={{marginTop:10,padding:10,borderRadius:9,background:'#22392d',border:'1px solid #c4d1bd'}}>
          <div style={{fontSize:12}}>Area {(saveSelection.x1-saveSelection.x0+1)}×{(saveSelection.y1-saveSelection.y0+1)} · {saveSelection.count} placed item{saveSelection.count===1?'':'s'}</div>
          <input type="text" data-testid="build-chunk-name-input" value={chunkName} onChange={e=>setChunkName(e.target.value)} placeholder={'Chunk '+(templates.length+1)} style={{display:'block',width:'100%',marginTop:8,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:14,boxSizing:'border-box'}} />
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button type="button" data-testid="build-chunk-save" onClick={()=>{const world=stateRef.current.world;const items=captureChunk(world,saveSelection);if(items.length===0){setMessage('Nothing placed in this area anymore');setSaveSelection(null);return;}const name=uniquifyName(templates.map(t=>t.name),chunkName);setTemplates(prev=>[...prev,{name,items}]);setSaveSelection(null);setChunkName('');setSaveAreaMode(false);buildRef.current={...buildRef.current,saveAreaMode:false};setMessage('Saved chunk \''+name+'\' ('+items.length+' item'+(items.length===1?'':'s')+')');}} style={{flex:1,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:14}}>Save chunk</button>
            <button type="button" data-testid="build-chunk-cancel" onClick={()=>{setSaveSelection(null);setChunkName('');}} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Cancel</button>
          </div>
        </div>}
        {templates.length===0
          ? <div style={{fontSize:12,opacity:.7,marginTop:10}}>No saved chunks yet.</div>
          : <div style={{marginTop:10}}>{templates.map(t=><div key={t.name} style={{display:'flex',gap:8,marginTop:6}}>
              <button type="button" data-testid="build-chunk-paste" onClick={()=>{const next=pasteName===t.name?null:t.name;setPasteName(next);if(next){setPalette(null);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setSaveAreaMode(false);}buildRef.current={palette:next?null:palette,removeMode:next?false:removeMode,moveMode:next?false:moveMode,saveAreaMode:next?false:saveAreaMode,pasteName:next,customAssetId:next?null:buildRef.current.customAssetId};setMessage(next?'Tap the ground to paste \''+t.name+'\' — its corner lands on the tapped tile. Tap the chunk again to stop.':'Stopped pasting');}} style={{flex:1,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:pasteName===t.name?'#526d42':'#22392d',color:'#fff',fontWeight:pasteName===t.name?700:500,fontSize:13,textAlign:'left'}}>{t.name} <span style={{opacity:.75}}>({t.items.length} item{t.items.length===1?'':'s'})</span></button>
              <button type="button" data-testid="build-chunk-delete" aria-label={'Delete '+t.name} onClick={()=>{setTemplates(prev=>prev.filter(x=>x.name!==t.name));if(pasteName===t.name){setPasteName(null);buildRef.current={...buildRef.current,pasteName:null};}setMessage('Deleted chunk \''+t.name+'\'');}} style={{padding:'10px 12px',borderRadius:9,border:'1px solid #c4d1bd',background:'#7a3b2e',color:'#fff',fontWeight:700,fontSize:13}}>×</button>
            </div>)}</div>}
      </div>
      <div data-testid="build-count" style={{fontSize:12,opacity:.85,marginTop:10}}>Placed: {placedCount}</div>
      <div style={{fontSize:11,opacity:.7,marginTop:6,lineHeight:1.4}}>Houses have interiors now — stand by a door and tap Enter to step inside; Exit returns you to the doorstep. While inside, Build placement and removal are paused (taps move only). Placed items show in 3D mode; the 2.5D view does not show them yet.</div>
    </div>}
  </div>;
}
