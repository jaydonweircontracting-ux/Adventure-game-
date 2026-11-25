// worldRender3d.ts — BUILD 1071 (NEURON HEX 0x0D, area 2 of 8).
// The 3D world rendering + terrain, extracted from Engine3DWorldView.tsx.
// BEHAVIOR-PRESERVING: the terrain geometry generator
// (buildWorldVerticesGen), the synchronous + resumable world-buffer
// builders (buildWorldVertices / createWorldBuilder), and the terrain
// constants/types they use moved verbatim out of the view. The view
// imports them back; nothing else changes. The WebGL renderer setup,
// the camera, and the per-frame draw still live in the view — they
// share the effect's mutable render state (yaw/pitch/zoom, the GL
// buffers, the figure render slots), so extracting them is a separate,
// larger refactor and the follow-up within area 2.
// Area 2 covers rendering/terrain — the terrain geometry is the
// largest, most separable piece; the renderer/camera/draw follow.

import { terrainAt, terrainKey, inBounds, type HutRect, type IsoWorld } from '../iso/isoWorld';
import {
  houseDesignFor, houseDesignForVariant, HOUSE_VARIANTS, streetSlabsFor, cobbleSquaresFor,
  SKY_HORIZON, COBBLE_GAP, MORTAR, DIRT_TAN, hash2, DOOR_WOOD, GROUND_FLOOR_H, UPPER_FLOOR_H,
  roofRise, PARAPET_H, SUN_SHADE, shadeRgb, groundTintDelta, DOOR_W, DOOR_H,
  VIEW_BAND_HALF, VIEW_BAND_CELL, VIEW_FAR_BAND_HALF, VIEW_FAR_BAND_CELL,
  VIEW_HORIZON_BAND_HALF, VIEW_HORIZON_BAND_CELL, VIEW_APRON_HALF,
  VIEW_BAND_Y, VIEW_FAR_BAND_Y, VIEW_HORIZON_BAND_Y, VIEW_APRON_Y,
} from './townLook';
import { chimneyTopFor, windowSlotsFor } from './houseFx';
import { WINDMILL_TOWER_H, WINDMILL_CAP_H } from './windmill';
import {
  LANTERN_POST_H, LANTERN_POST_W, LANTERN_BOX, LANTERN_CAP, LANTERN_TIMBER,
  LANTERN_GLASS_DARK, lanternBoxCentre,
} from './lantern';
import { FARM_SOIL, FARM_FURROW } from './farm';
import {
  placedHutRects, placedTreeTiles, placedStallRects, placedStationRects, placedRockTiles, placedWallTiles,
  placedLanternTiles, placedBushTiles, placedOreTiles, placedBridgeTiles, placedFarmTiles,
  placedFarmKeyInts, placedFenceTiles, seedRectForHut, removeAt, tileKeyInt,
} from './placements';
import { gardenFencesFor, gardenPlantsFor } from './gardens';
import { type LandmarkKind } from './settlements';
import { emitNaturalGrass, emitPlacedGrass, blockedTiles } from './grassTufts';
import { mineralRenderColor } from './geology';
import { stationDefFor } from './craftingStations';
import { SAPLING_MATURE_GROWTH } from './ecosystems';
import { emitGroundDetail3d } from './groundDetail3d';
import {
  treeShapeForTile, TREE_SHAPES, generatedBushAt, generatedHerbAt, bushParamsForTile,
  propKindToCrateKind, type CratePropKind,
} from './vegetation';
import { isGathered } from './gathering';
import {
  wildTreeAt, wildRockAt, wildObstacleAt, cellIsMixed, effTerrainFor,
  surfaceElevation, renderTerrain,
} from './wildTerrain';
import { rotateCustomXZ, type CustomAsset } from './customAssets';
import { sameHut, interiorBoxes, interiorFloorColor, INTERIOR_FLOOR_Y } from './interiors';
import { productionKindForRect, productionInteriorBoxes } from './productionInteriors';
import { groundNoise } from './townLook';

export type Vec3 = [number, number, number];
type Vertex = number[];

const COLORS: Record<string, Vec3> = {
  grass: [0.31, 0.41, 0.22], dirt: DIRT_TAN, sand: [0.68, 0.59, 0.39],
  stone: [0.48, 0.49, 0.46], water: [0.10, 0.33, 0.52], // BUILD 1099: deeper, more natural water blue (was [0.12,0.36,0.57])
  // BUILD 1034: foam — the pale water edge (Stage 2 shores). Display
  // only; walkability still reads the water terrain underneath.
  foam: [0.72, 0.84, 0.87],
};

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
export type Position = { x: number; y: number };

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
  // BUILD 1122 — voxel-step elevation for the endless wilderness.
  // Minecraft's readable block terrain comes from level top faces and
  // exposed vertical sides, not from a smooth per-vertex slope. Snap
  // only out-of-map wilderness samples to half-block levels; the authored
  // settlement/map keeps its exact existing heightfield. This sampler
  // is shared by ground and prop placement in this builder, so trees and
  // rocks sit on the same stepped surface as their terrain caps. Water
  // remains at its existing zero surface through landBlendAt.
  const renderSurfaceElevation=(x:number,z:number):number=>{
    const h=surfaceElevation(effTerrain,x,z);
    if(inBounds(world,Math.floor(x),Math.floor(z))) return h;
    return Math.round(h*2)*0.5;
  };
  // BUILD 1119: remember the generated river depth class while building
  // the ground mesh. Centreline water can be deep or shallow; width
  // shoulders are always shallow. This gives the channel a readable
  // turquoise-to-blue cross-section without changing terrain or saves.
  const riverDepthByTile = new Map<number, number>();
  const riverTileKey = (x:number,y:number):number => (x+2048)*4096+(y+2048);
  const riverCourses = (world.rivers ?? []) as unknown as Array<{
    tiles?: Array<{x:number;y:number;shallow?:boolean}>;
    widthTiles?: Array<{x:number;y:number}>;
  }>;
  for (const river of riverCourses) {
    for (const tile of river.tiles ?? []) riverDepthByTile.set(riverTileKey(tile.x,tile.y), tile.shallow ? 1 : 0);
    for (const tile of river.widthTiles ?? []) riverDepthByTile.set(riverTileKey(tile.x,tile.y), 1);
  }
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
    if(v===undefined){v=renderSurfaceElevation(cx,cy);surfCache.set(key,v);}
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
    const riverDepth = terrain === 'water' ? riverDepthByTile.get(riverTileKey(x,y)) : undefined;
    const c: Vec3 = riverDepth === 1 ? [0.16,0.48,0.59]
      : riverDepth === 0 ? [0.07,0.25,0.43]
      : (COLORS[terrain]||COLORS.grass);
    // BUILD 1009: tint evaluated PER CORNER from the continuous 1009
    // field (see townLook groundTintDelta). Adjacent tiles share corner
    // positions and therefore corner colours exactly — the near field
    // reads as rolling variation, not a checkerboard, and the window
    // edge is invisible because the band cells beyond it sample the
    // same field at their own corners.
    const colAt=(cx:number,cy:number):Vec3=>terrain==='water'?c:(()=>{const t=tintAt(terrain,cx,cy);return [c[0]+t[0],c[1]+t[1],c[2]+t[2]] as Vec3;})();
    // Water is a level tile surface, never a bilinear blend with the surrounding land.
    const yAt=(cx:number,cy:number):number=>terrain==='water'?0:surfAt(cx,cy);
    if (!inBounds(world, x, y) && terrain !== 'water') {
      // BUILD 1116: outside the authored map, render each land tile as a
      // quantized voxel cap and expose only the sides facing lower tiles.
      // The same deterministic elevation sampler drives props, picking
      // and the camera through surfaceElevation; water remains a level
      // surface and the authored town keeps its original heightfield.
      const top = renderSurfaceElevation( x + 0.5, y + 0.5);
      const west = renderSurfaceElevation( x - 0.5, y + 0.5);
      const east = renderSurfaceElevation( x + 1.5, y + 0.5);
      const north = renderSurfaceElevation( x + 0.5, y - 0.5);
      const south = renderSurfaceElevation( x + 0.5, y + 1.5);
      // BUILD 1117: altitude-aware voxel surface materials. Snow settles
      // on the highest ridges, exposed rock appears above the tree line,
      // and grass remains on foothills/lowlands. Coordinate hash keeps
      // sparse snow variation stable while avoiding a noisy checkerboard.
      const alpine = top >= 7.0;
      const rocky = top >= 4.0;
      const snowPatch = alpine && hash2(x * 3.1 + 17, y * 2.7 - 9) > 0.16;
      // BUILD 1121: broad moisture bands create coherent meadow,
      // lush lowland and dry-grass regions. The field is slow-changing
      // across dozens of tiles, so it reads as a biome, not random noise.
      const moisture = groundNoise(x + 913.7, y - 427.3, 54);
      const grassBiome: Vec3 = moisture > 0.64 ? [0.22,0.36,0.18]
        : moisture < 0.30 ? [0.43,0.42,0.23]
        : [c[0],c[1],c[2]];
      const topColor: Vec3 = snowPatch ? [0.82,0.86,0.88]
        : rocky ? [0.48,0.50,0.49]
        : grassBiome;
      quad([x,top,y],[x+1,top,y],[x+1,top,y+1],[x,top,y+1],topColor);
      // BUILD 1118: exposed voxel faces use readable geological strata
      // instead of one flat brown/grey wall. A thin grass cap sits under
      // the turf, compacted earth forms the middle layer, and stone
      // appears at the base. Each band is part of the same face (no
      // floating cubes or extra tile draw calls), with deterministic
      // per-column variation so long cliffs do not look like wallpaper.
      const soil: Vec3 = rocky ? [0.39,0.40,0.39] : [0.34,0.25,0.16];
      const dirtBand: Vec3 = [0.39,0.29,0.18];
      const rockBand: Vec3 = [0.29,0.31,0.30];
      const grassBand: Vec3 = [0.25,0.34,0.18];
      const emitStrataFace = (
        topA: [number,number,number], topB: [number,number,number],
        lowA: [number,number,number], lowB: [number,number,number],
        shade: number, seed: number,
      ) => {
        const height = Math.max(0, topA[1] - lowA[1]);
        if (height < 0.24) return;
        const at = (a: [number,number,number], b: [number,number,number], t: number): [number,number,number] =>
          [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
        const grassEnd = rocky ? 0 : Math.min(0.18, 0.18 / height);
        const dirtEnd = Math.min(0.68, Math.max(grassEnd, 0.68 / height));
        const bandColor = (color: Vec3, salt: number): Vec3 => {
          const variation = 0.94 + hash2(x * 7.1 + seed + salt, y * 5.3 - seed) * 0.12;
          return shadeRgb([color[0]*variation,color[1]*variation,color[2]*variation],shade);
        };
        if (grassEnd > 0) quad(at(topA,lowA,0),at(topB,lowB,0),at(topB,lowB,grassEnd),at(topA,lowA,grassEnd),bandColor(grassBand,1));
        if (dirtEnd > grassEnd) quad(at(topA,lowA,grassEnd),at(topB,lowB,grassEnd),at(topB,lowB,dirtEnd),at(topA,lowA,dirtEnd),bandColor(dirtBand,2));
        if (dirtEnd < 1) quad(at(topA,lowA,dirtEnd),at(topB,lowB,dirtEnd),at(topB,lowB,1),at(topA,lowA,1),bandColor(rockBand,3));
      };
      if (west < top - 0.24) emitStrataFace([x,top,y],[x,top,y+1],[x,west,y],[x,west,y+1],SUN_SHADE.west,1);
      if (east < top - 0.24) emitStrataFace([x+1,top,y+1],[x+1,top,y],[x+1,east,y+1],[x+1,east,y],SUN_SHADE.east,2);
      if (north < top - 0.24) emitStrataFace([x+1,top,y],[x,top,y],[x+1,north,y],[x,north,y],SUN_SHADE.north,3);
      if (south < top - 0.24) emitStrataFace([x,top,y+1],[x+1,top,y+1],[x,south,y+1],[x+1,south,y+1],SUN_SHADE.south,4);
    } else {
      quadV([x,yAt(x,y),y],colAt(x,y),[x+1,yAt(x+1,y),y],colAt(x+1,y),[x+1,yAt(x+1,y+1),y+1],colAt(x+1,y+1),[x,yAt(x,y+1),y+1],colAt(x,y+1));
    }
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
        const s=slabs[i],sy=renderSurfaceElevation(x+s.dx+s.w/2,y+s.dz+s.d/2)+.03+i*.002;
        quad([x+s.dx,sy,y+s.dz],[x+s.dx+s.w,sy,y+s.dz],[x+s.dx+s.w,sy,y+s.dz+s.d],[x+s.dx,sy,y+s.dz+s.d],[s.shade,s.shade,s.shade*.96]);
      }
    } else if(terrain==='grass'||terrain==='stone'){
      const nearDirt=(x>0&&effTerrain(x-1,y)==='dirt')||(x<world.w-1&&effTerrain(x+1,y)==='dirt')||(y>0&&effTerrain(x,y-1)==='dirt')||(y<world.h-1&&effTerrain(x,y+1)==='dirt');
      if(nearDirt){
        const cY=(cx:number,cy:number):number=>surfAt(cx,cy)+.018;
        quadV([x,cY(x,y),y],COBBLE_GAP,[x+1,cY(x+1,y),y],COBBLE_GAP,[x+1,cY(x+1,y+1),y+1],COBBLE_GAP,[x,cY(x,y+1),y+1],COBBLE_GAP);
        for(const sq of cobbleSquaresFor(x,y)){
          const qy=renderSurfaceElevation(x+sq.dx+sq.size/2,y+sq.dz+sq.size/2)+.022;
          quad([x+sq.dx,qy,y+sq.dz],[x+sq.dx+sq.size,qy,y+sq.dz],[x+sq.dx+sq.size,qy,y+sq.dz+sq.size],[x+sq.dx,qy,y+sq.dz+sq.size],[sq.shade,sq.shade,sq.shade*.97]);
        }
      }
    }
    // BUILD 1041: farm land — a tilled-soil slab riding the
    // heightfield (+0.03, the slab offset) with three darker furrow
    // strips, so a field reads as ploughed earth even before the
    // wheat grows. The wheat itself is per-frame fx (houseFx.ts).
    if(farmKeys.has(tileKeyInt(x,y))){
      const sy=renderSurfaceElevation(x+.5,y+.5)+.03;
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
      const yAt=(cx:number,cy:number,terrain?:string):number=>terrain==='water'?y:surfAt(cx,cy)+y;
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
        quadV([x0,yAt(x0,y0,bt),y0],colAt(x0,y0),[x1+1,yAt(x1+1,y0,bt),y0],colAt(x1+1,y0),[x1+1,yAt(x1+1,y1+1,bt),y1+1],colAt(x1+1,y1+1),[x0,yAt(x0,y1+1,bt),y1+1],colAt(x0,y1+1));
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
            quadV([runStart,yAt(runStart,yy,runT),yy],colAt(runStart,yy),[xx,yAt(xx,yy,runT),yy],colAt(xx,yy),[xx,yAt(xx,yy+1,runT),yy+1],colAt(xx,yy+1),[runStart,yAt(runStart,yy+1,runT),yy+1],colAt(runStart,yy+1));
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
  // BUILD 1085 (1.6): a sapling — a short trunk and one small foliage
  // tier, growing with it (narrow at planting, near tree-sized at
  // maturity). The same houseBox vocabulary as treeAt, so a sapling
  // reads as a young tree, never a second tree system.
  const saplingAt=(tx:number,ty:number,baseY=0,growth=0)=>{
    const f=Math.max(0,Math.min(1,growth/SAPLING_MATURE_GROWTH));
    const w=0.25+0.45*f, h=0.35+0.55*f;
    houseBox(tx+.5,ty+.5,0.12,0.5,0.12,baseY,[.4,.28,.14]);
    houseBox(tx+.5,ty+.5,w,h,w,baseY+0.5,[.25,.55,.2]);
  };
  // BUILD 1110 (0x2D): a stump — the visible remainder of a felled
  // tree while its sapling grows. A wide short trunk box with a
  // lighter cut top (the rings), same houseBox vocabulary as
  // saplingAt, so a stump reads as a cut tree, never a second tree
  // system. It clears when the sapling matures (applyMaturedTrees).
  const stumpAt=(tx:number,ty:number,baseY=0)=>{
    houseBox(tx+.5,ty+.5,0.5,0.32,0.5,baseY,[.4,.28,.14]);
    houseBox(tx+.5,ty+.5,0.46,0.06,0.46,baseY+0.32,[.62,.47,.26]);
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
  for(const wall of [...world.walls, ...placedWallTiles(world)]) if(wall.x>=minX&&wall.x<=maxX&&wall.y>=minY&&wall.y<=maxY) cube(wall.x+.5,wall.y+.5,1,.85,1,[.43,.39,.32],renderSurfaceElevation(wall.x+.5,wall.y+.5));
  // BUILD 1042: placed fences — a low wooden fence: four corner posts
  // plus two rails on each side, timber brown, standing on the
  // heightfield. One tile reads as a fence segment; a run of tiles
  // reads as a fence line. Fences block movement, like walls.
  // BUILD 1050: the same fence is the generated garden fence — one
  // emitter (fenceAt) for both, so the two can never drift apart.
  const FENCE_TIMBER:Vec3=[.45,.32,.18];
  const fenceAt=(tx:number,ty:number)=>{
    const fy=renderSurfaceElevation(tx+.5,ty+.5);
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
  for(const stall of world.stalls) for(let x=stall.x0;x<=stall.x1;x++) stallAt(x,stall.y0,renderSurfaceElevation(x+.5,stall.y0+.5));
  for(const stall of placedStallRects(world)) for(let x=stall.x0;x<=stall.x1;x++) cube(x+.5,stall.y0+.5,1,.75,1,[.57,.31,.16],renderSurfaceElevation(x+.5,stall.y0+.5));
  // BUILD 1111 (0x2E): placed crafting stations render as a coloured
  // counter cube in the station's colour, with a pale work-surface cap
  // on top — the same shape language as placed stalls, so a station
  // reads as a thing you walk up to and use. Whole-world range like stalls.
  for(const st of placedStationRects(world)){const def=stationDefFor(st.station);const by=renderSurfaceElevation(st.x0+.5,st.y0+.5);cube(st.x0+.5,st.y0+.5,1,.75,1,def.color,by);cube(st.x0+.5,st.y0+.5,.8,.1,.8,[.9,.85,.7],by+.75);}
  // BUILD 1051: fixed wild landmarks (settlements.ts) — the ruined
  // tower, the standing stones, the hunter's camp. Whole-world range
  // like the stalls (the tower is the distance marker), one
  // landmarkAt per solid tile, on the heightfield. The stone
  // circle's centre is open ground and renders nothing.
  for(const lm of world.landmarks ?? []) for(const b of lm.blocks) landmarkAt(b.x,b.y,lm.kind as LandmarkKind,renderSurfaceElevation(b.x+.5,b.y+.5),!!(lm.broken&&lm.broken.x===b.x&&lm.broken.y===b.y),b.part);
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
    const baseY=renderSurfaceElevation(ccx,ccz);
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
    const hy=renderSurfaceElevation(x,z);
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
      for(const b of (productionKindForRect(hut)?productionInteriorBoxes(productionKindForRect(hut)!,hut):interiorBoxes(hut, seedHut))) box(b.x,b.z,b.w,b.h,b.d,b.y0+hy,b.color);
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
    treeAt(t.tx,t.ty,renderSurfaceElevation(t.tx+.5,t.ty+.5));
    if(ti%16===15)yield;
  }
  // BUILD 1085 (1.6): saplings render as young trees where a chopped
  // tree is regrowing — the visible half of the regrowth, so a cleared
  // patch reads as regrowing before any tree matures.
  const saplings=world.saplings??[];
  for(let si=0;si<saplings.length;si++){
    const s=saplings[si];
    if(effTerrain(s.x,s.y)==='water')continue;
    saplingAt(s.x,s.y,renderSurfaceElevation(s.x+.5,s.y+.5),s.growth);
    if(si%16===15)yield;
  }
  // BUILD 1110 (0x2D): stumps render where trees were felled — the
  // temporary remainder while the sapling regrows.
  const stumps=world.stumps??[];
  for(let si=0;si<stumps.length;si++){
    const st=stumps[si];
    if(effTerrain(st.x,st.y)==='water')continue;
    stumpAt(st.x,st.y,renderSurfaceElevation(st.x+.5,st.y+.5));
    if(si%16===15)yield;
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
    cube(r.tx+.5,r.ty+.5,rw,rh,rw,[.43*sh,.45*sh,.44*sh],renderSurfaceElevation(r.tx+.5,r.ty+.5));
    if(ri%16===15)yield;
  }
  // BUILD 1081: mineral deposits — distinct rock outcrops (taller
  // than a plain rock, tinted by mineral) so a player can tell an
  // iron deposit from a plain rock at a glance. Mined-out deposits
  // render as low dark rubble. The list lives on the world
  // (world.mineralDeposits, stamped once on load); a mined-out
  // deposit stays rendered as rubble because the stamp never
  // re-derives it.
  for (const d of world.mineralDeposits ?? []) {
    if (effTerrain(d.x, d.y) === 'water') continue;
    const by = renderSurfaceElevation( d.x + .5, d.y + .5);
    if (d.remaining <= 0) {
      cube(d.x + .5, d.y + .5, .8, .3, .8, [.16, .15, .14], by);
      continue;
    }
    const c = mineralRenderColor(d.mineral);
    const s = .9 + hash2(d.x * 3.1 + 51, d.y * 7.7 + 51) * .2;
    cube(d.x + .5, d.y + .5, .95 * s, 1.0, .95 * s, [c[0] * .75, c[1] * .75, c[2] * .75], by);
    cube(d.x + .5, d.y + .5, .6 * s, .55, .6 * s, c, by + 1.0);
  }
  // BUILD 1040: placed bushes — low wide green blobs (four overlapping
  // full boxes in two foliage greens, seeded by tile so bushes differ
  // slightly), never the pine tree. A bush is walk-through decor, so
  // this loop renders only; blocking is isPlacedBlocking's business
  // (bushes are excluded there, like grass). box() (not houseBox):
  // the blobs are seen from orbit above, so they need top faces.
  for(const b of placedBushTiles(world)){
    const by=renderSurfaceElevation(b.tx+.5,b.ty+.5);
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
      const gy = renderSurfaceElevation( bx + .5, by + .5);
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
        // BUILD 1110 (0x2D): a gathered bush stays gone until its
        // regrow day clears the record (the day advance does that).
        if (isGathered(world, 'bush', bx, by)) continue;
        emitGenBush(bx, by);
      }
      if ((by - fY0) % 16 === 15) yield;
    }
    // BUILD 1110 (0x2D): wild herbs — small dark-green tufts on
    // grass tiles the bush rule did not claim (a herb never fights
    // a bush for the same tile) and no placed kind occupies. Same
    // scan discipline as the bush loop above (16-row yields, same
    // skips), and a gathered herb stays gone until its regrow day.
    const emitHerb=(hx:number,hy:number):void=>{
      const gy=renderSurfaceElevation(hx+.5,hy+.5);
      const h=hash2(hx*3.1+41,hy*7.7+43);
      const lean=(h-0.5)*0.12;
      box(hx+.5+lean,hy+.5,0.1,0.5,0.1,gy,[.16,.42,.16]);
      box(hx+.5-lean,hy+.5,0.1,0.38,0.1,gy,[.2,.5,.2]);
      box(hx+.5,hy+.5+lean,0.1,0.44,0.1,gy,[.14,.38,.14]);
    };
    for (let by = fY0; by <= fY1; by++) {
      for (let bx = fX0; bx <= fX1; bx++) {
        if (effTerrain(bx, by) !== 'grass') continue;
        if (bushBlocked.has(bx + ',' + by)) continue;
        if ((bx < 0 || by < 0 || bx >= world.w || by >= world.h) && wildObstacleAt(bx, by)) continue;
        // A tile whose hashes claim both a bush and a herb shows
        // the bush first; once the bush is gathered, the herb under
        // it shows (and can be gathered).
        if (generatedBushAt(bx, by) && !isGathered(world, 'bush', bx, by)) continue;
        if (!generatedHerbAt(bx, by)) continue;
        if (isGathered(world, 'herb', bx, by)) continue;
        emitHerb(bx, by);
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
    const oy=renderSurfaceElevation(o.tx+.5,o.ty+.5);
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
    const ly=renderSurfaceElevation(l.tx+.5,l.ty+.5);
    const cx=l.tx+.5, cz=l.ty+.5;
    houseBox(cx,cz,LANTERN_POST_W,LANTERN_POST_H,LANTERN_POST_W,ly,LANTERN_TIMBER);
    const gc=lanternBoxCentre(l.tx,l.ty,ly);
    cube(gc[0],gc[2],LANTERN_BOX,LANTERN_BOX,LANTERN_BOX,LANTERN_GLASS_DARK,gc[1]-LANTERN_BOX/2);
    houseBox(cx,cz,LANTERN_CAP,.06,LANTERN_CAP,ly+LANTERN_POST_H+LANTERN_BOX,LANTERN_TIMBER);
  }
  // BUILD 1124: bridge profiles are original, deterministic shapes.
  // The saved axis keeps each deck aligned with its crossing direction;
  // every water tile in a multi-tile span receives the same profile.
  for(const br of placedBridgeTiles(world)){
    const bwy=renderSurfaceElevation(br.tx+.5,br.ty+.5)+0.06;
    const narrow=br.style==='narrow-stream';
    const deckWidth=br.style==='narrow-stream' ? 0.54 : br.style==='footbridge' ? 0.7 : 0.94;
    const count=br.style==='narrow-stream'?2:br.style==='footbridge'?3:br.style==='stone'?4:br.style==='large-road'?5:br.style==='wide-river'?6:4;
    const stone=br.style==='stone';
    const plank:Vec3=stone?[.48,.5,.52]:[.55,.4,.22];
    const plank2:Vec3=stone?[.4,.43,.46]:[.48,.35,.2];
    const railColor:Vec3=stone?[.34,.38,.42]:LANTERN_TIMBER;
    for(let i=0;i<count;i++){
      const step=.88/count, a=.06+i*step, b=a+step*.82;
      if(br.axis==='x'){
        const z0=br.ty+(1-deckWidth)/2+a*deckWidth, z1=br.ty+(1-deckWidth)/2+b*deckWidth;
        quad([br.tx+.02,bwy,z0],[br.tx+.98,bwy,z0],[br.tx+.98,bwy,z1],[br.tx+.02,bwy,z1],i%2===0?plank:plank2);
      }else{
        const x0=br.tx+(1-deckWidth)/2+a*deckWidth, x1=br.tx+(1-deckWidth)/2+b*deckWidth;
        quad([x0,bwy,br.ty+.02],[x1,bwy,br.ty+.02],[x1,bwy,br.ty+.98],[x0,bwy,br.ty+.98],i%2===0?plank:plank2);
      }
    }
    if(!narrow){
      if(br.axis==='x'){
        const z0=br.ty+(1-deckWidth)/2+.035, z1=br.ty+(1+deckWidth)/2-.035;
        houseBox(br.tx+.5,z0, .98,.1,.07,bwy,railColor);
        houseBox(br.tx+.5,z1, .98,.1,.07,bwy,railColor);
      }else{
        const x0=br.tx+(1-deckWidth)/2+.035, x1=br.tx+(1+deckWidth)/2-.035;
        houseBox(x0,br.ty+.5,.07,.1,.98,bwy,railColor);
        houseBox(x1,br.ty+.5,.07,.1,.98,bwy,railColor);
      }
    }
  }
  // Water is intentionally rendered as plain, flat blue tiles.
  // No raised current ribbons or triangular flow markers are emitted.
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
    if(wildTreeAt(x,y)&&!(world.removedWildTrees??[]).includes(wkey)) treeAt(x,y,renderSurfaceElevation(x+.5,y+.5));
    else if(wildRockAt(x,y)&&!(world.removedWildRocks??[]).includes(wkey)) {
      const rw=.5+hash2(x*3.1+21,y*7.7+21)*.5;
      const rh=.4+hash2(x*5.3+23,y*9.1+23)*.5;
      const sh=.8+hash2(x*7.7+27,y*3.3+27)*.25;
      cube(x+.5,y+.5,rw,rh,rw,[.43*sh,.45*sh,.44*sh],renderSurfaceElevation(x+.5,y+.5));
    }
    if(x===fX1&&(y-fY0)%4===3)yield;
  }
  // BUILD 1049: generated/authored crates + layout props render as
  // themselves (crateAt above — crate, lamp, barrel, hedge, fountain,
  // well, statue, gatehouse, cart, windmill), not the 986 pine trees.
  // Data untouched — the wood interaction still finds and removes the
  // crate entry (see the E-key handler).
  // BUILD 1034: crates stand on the heightfield.
  for(let ci=0;ci<world.crates.length;ci++){const c=world.crates[ci];crateAt(c.tx,c.ty,renderSurfaceElevation(c.tx+.5,c.ty+.5),(world.crateKinds?.[terrainKey(c.tx,c.ty)] as CratePropKind|undefined)??'crate');if(ci%16===15)yield;}
  // BUILD 1049: non-solid town decor (fountain, statue) — the same
  // crateAt shapes, but these never block (they are not in crates)
  // and are never removable. A decor tile stays walkable.
  for(const d of world.propDecor ?? []) crateAt(d.tx,d.ty,renderSurfaceElevation(d.tx+.5,d.ty+.5),propKindToCrateKind(d.kind));
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
