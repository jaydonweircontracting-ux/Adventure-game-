/**
 * BUILD 1083 — NEURON HEX 0x12, Living World plan Phase 1.4: landforms +
 * soil.
 *
 * This module owns the LANDFORM MAP: where the hills and the mountain
 * band rise, where the valleys run between them, which peak tiles are
 * sheer cliffs, and what the soil is under any tile. It is a pure,
 * deterministic function of the world (same seed → same mountains,
 * same valleys, same soil): the band is the eastern high ground of
 * the elevation field, the valleys are its deep low ground, and the
 * soil follows moisture + terrain.
 *
 * The mountain band is the eastern highland massif (x >= 140, the
 * ground above 0.45 on the elevation field — the same high ground
 * the 1.3 rivers drain from). Its tiles are stamped as 'stone'
 * terrain, so the whole game reads them as rock through the
 * EXISTING stone path — the renderer colours them grey, the height
 * field raises them (wildTerrain.surfaceElevation adds
 * MOUNTAIN_BOOST to stamped stone, so the range stands taller than
 * the noise field alone), and both maps show the band grey. The
 * hills (0.25–0.45, the foothills around the massif) are recorded
 * but not stamped — they render as raised grassy ground, which is
 * what a foothill is. The valleys (below -0.4 in the east) are the
 * low green corridors between the ridges — visible as low ground
 * against the tall rock, and rich soil under the farm rule.
 *
 * Cliffs are the sheer faces: a mountain tile above 0.70 elevation
 * whose hash says crag (half of the peaks), standing beyond the
 * founders' work radius (60 tiles from camp, +5 margin) and clear
 * of the newcomer arrival corridor (y 110–130, the walk in from
 * the east edge) — the sheer crags are on the far peaks, not in
 * the settled valley and not on the road a newcomer walks.
 * The hash scatters them, so they can never form a wall — every
 * cliff has a walkable neighbour, and the range stays traversable
 * (the asserts flood-fill from the camp to the eastern edge around
 * them). A cliff blocks
 * movement through isWalkableWorld (the 1081 deposit precedent: a
 * plain data check in isoWorld.ts, no import). A cliff whose terrain
 * is no longer 'stone' (the player Removed it) reads as gone, like
 * a removed river tile. Gentle slopes — every mountain tile that is
 * not a cliff — stay walkable.
 *
 * The band never floods the settlement: it is routed around the
 * camp disc, the hut rects, the farm tiles, and the 1.2 mineral
 * deposits, and it never overwrites water (the 1.3 rivers cut
 * gorges through the range — 56 river tiles stand on mountain
 * ground, and the band flows around them) or non-grass terrain
 * (the dirt road at y 99–100 keeps running through the range as
 * a mountain pass). Trees and rocks coexist with the band — a tree
 * on a mountain slope is a tree on rocky ground, and it is still
 * choppable from beside it.
 *
 * SOIL is the first gameplay effect of terrain. soilAt is a pure
 * function of position + the (persisted) river map: rich near
 * water (within 8 tiles of ocean, lake, pond, or river — the
 * alluvial floodplains) or in a valley (deep low ground); poor on
 * mountain rock or high dry ground; neutral everywhere else. The
 * settlement's home ground — within 25 tiles of the camp, the same
 * disc the rivers keep clear — is always neutral: the founders
 * picked a workable camp, not the richest ground, and the richest
 * ground is out in the river valleys, where expansion farming
 * pays. That rule is also what keeps the M1069 24h numbers
 * byte-identical: the camp farm grows at factor 1.0, exactly as
 * before. Growth factors: rich 1.5 (ready in 120 game-minutes),
 * neutral 1.0 (180), poor 0.6 (300) — farmStageAt takes the factor
 * as a parameter, and the farm reads it through the 1.1 adapter
 * (livingWorld.soilFactorAt), never by importing this module into
 * the farm tick.
 *
 * Persistence follows the BUILD 1061 removedTrees / BUILD 1081
 * mineralDeposits / BUILD 1082 rivers pattern: the landforms live
 * on the world object (IsoWorld.landforms, plain data) and are
 * saved wholesale by saveWorld. The stamp (stampLandforms, called
 * once from loadInitialWorld and from createSettlementSim) never
 * re-derives a stamped world, so a mountain never moves or
 * vanishes on reload. The soil needs no stored map: it is a pure
 * function of the persisted rivers + the deterministic elevation
 * field, so it is identical across reloads by construction (the
 * asserts prove it on a round-trip). Old saves load with none; the
 * stamp generates them on the same load (the layout is already
 * applied by then). Snow (a terrain type), seasons (1.5), and
 * caves are NOT built here.
 */
import { hash2, terrainAt, type IsoWorld } from '../iso/isoWorld';
import { groundElevation } from './townLook';
import { isWaterTile } from './rivers';
import { FOUNDER_CAMP, FOUNDER_WORK_RADIUS } from './founders';

/** One landform tile. */
export interface LandformTile {
  x: number;
  y: number;
}

/** The landform map, stored on the world (plain data, saved
 *  wholesale). Mountains are the stamped 'stone' band; hills and
 *  valleys are recorded (they render as raised / low ground);
 *  cliffs are the blocking subset of the mountains. */
export interface Landforms {
  mountains: LandformTile[];
  hills: LandformTile[];
  valleys: LandformTile[];
  cliffs: LandformTile[];
}

/** Soil under a tile — what the farm growth factor reads. */
export type Soil = 'rich' | 'neutral' | 'poor';

/** The mountain band lives in the eastern high ground (the same
 *  ground the 1.3 river sources stand on). */
export const MOUNTAIN_MIN_X = 140;
/** A mountain tile stands on ground above this elevation (the
 *  field's measured max over the eastern half is 0.794; 0.45 is
 *  the top ~third — a real massif, ~3,800 tiles, not a speck). */
export const MOUNTAIN_ELEV = 0.45;
/** The foothills wrap the massif (0.25–0.45, a little further
 *  west than the mountains). */
export const HILL_MIN_X = 130;
export const HILL_ELEV_MIN = 0.25;
export const HILL_ELEV_MAX = 0.45;
/** A valley floor is deep low ground in the east (the camp farm
 *  sits at about -1.27 — the settlement is in a valley). */
export const VALLEY_MIN_X = 100;
export const VALLEY_ELEV = -0.4;
/** A mountain tile above this elevation is a peak; half of the
 *  peaks are sheer crags (cliffs) by hash, half are climbable
 *  slopes. */
export const CLIFF_ELEV = 0.7;
export const CLIFF_HASH = 0.5;
const CLIFF_SEED = 8301;
/** A cliff never stands within this many tiles of the camp centre:
 *  the founders' work radius (FOUNDER_WORK_RADIUS = 60) plus a
 *  5-tile margin for paths that bow outward. The sheer crags are
 *  on the far peaks, beyond the settled valley — so a founder's
 *  path to a tree never detours around one, and the M1069 24h
 *  numbers stay byte-identical (the no-cliff diagnostic proved
 *  the cliffs, not the mountains or the soil, moved them). */
export const CLIFF_WORK_CLEARANCE = FOUNDER_WORK_RADIUS + 5;
/** The newcomer arrival corridor: residents walk in from the east
 *  edge (RESIDENT_ENTRY_TILE 199,120) to camp along y ~ 120 — a
 *  77-step A* path straight through the range. No cliff stands in
 *  this east-west band (10 tiles of bow room each side of the walk
 *  line), so a newcomer never detours around a crag on the walk in.
 *  The work-radius clearance alone did not restore the M1069
 *  numbers, because the arrival path crosses the far-east cliff
 *  field; this corridor is the second half of that fix. */
export const ARRIVAL_CORRIDOR_Y0 = 110;
export const ARRIVAL_CORRIDOR_Y1 = 130;
/** No landform tile within this many tiles of the camp centre
 *  (the founders' immediate work area — the same disc the rivers
 *  keep clear). */
export const LANDFORM_CAMP_EXCLUSION = 25;
/** No landform tile within this many tiles of a hut rect edge. */
export const LANDFORM_HUT_MARGIN = 2;
/** The settlement's home ground — within this many tiles of the
 *  camp — is always neutral soil (see the header: the founders
 *  picked workable ground, and the camp farm grows at factor 1.0,
 *  so the M1069 numbers stay byte-identical). */
export const SOIL_CAMP_RADIUS = 25;
/** Rich soil reaches this many tiles (Manhattan) from water —
 *  the alluvial floodplain along a river, lake, pond, or coast. */
export const MOISTURE_RADIUS = 8;
/** Farm growth factors by soil — the first gameplay effect of
 *  terrain. Rich soil reaches ready in 120 game-minutes, neutral
 *  in 180, poor in 300 (farmStageAt scales the 60/180 thresholds
 *  by the factor). */
export const SOIL_GROWTH: Record<Soil, number> = { rich: 1.5, neutral: 1, poor: 0.6 };

function key(x: number, y: number): string {
  return x + ',' + y;
}

/** True when the tile is a mountain by the pure elevation rule
 *  (position only — the stamp stores exactly this set, minus its
 *  exclusions). */
export function isMountainTile(x: number, y: number): boolean {
  return x >= MOUNTAIN_MIN_X && groundElevation(x, y) > MOUNTAIN_ELEV;
}

/** True when the tile is a foothill (raised ground around the
 *  massif, below mountain height). */
export function isHillTile(x: number, y: number): boolean {
  const e = groundElevation(x, y);
  return x >= HILL_MIN_X && e > HILL_ELEV_MIN && e <= HILL_ELEV_MAX;
}

/** True when the tile is a valley floor (deep low ground in the
 *  east — the corridors between the ridges). */
export function isValleyTile(x: number, y: number): boolean {
  return x >= VALLEY_MIN_X && groundElevation(x, y) < VALLEY_ELEV;
}

/** Hut rects (authored + player-placed) with a margin — a
 *  landform never runs against a hut wall. */
function hutRects(world: IsoWorld): Array<{ x0: number; y0: number; x1: number; y1: number }> {
  const rects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  for (const h of world.huts ?? []) rects.push(h);
  for (const p of world.placements ?? []) if (p.kind === 'house') rects.push({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 });
  return rects;
}

/** The exclusion set for landform placement: water, mineral
 *  deposits, farm tiles, the camp disc, and hut rects. Trees and
 *  rocks are NOT excluded — they coexist with the terrain (a tree
 *  on a mountain slope is still choppable from beside it). */
interface Exclusions {
  huts: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  farms: Set<string>;
  deposits: Set<string>;
}

function buildExclusions(world: IsoWorld): Exclusions {
  const farms = new Set<string>();
  for (const p of world.placements ?? []) if (p.kind === 'farm') farms.add(key(p.x0, p.y0));
  const deposits = new Set<string>();
  for (const d of world.mineralDeposits ?? []) deposits.add(key(d.x, d.y));
  return { huts: hutRects(world), farms, deposits };
}

function isExcluded(world: IsoWorld, ex: Exclusions, x: number, y: number): boolean {
  if (Math.hypot(x - FOUNDER_CAMP.x, y - FOUNDER_CAMP.y) < LANDFORM_CAMP_EXCLUSION) return true;
  if (isWaterTile(world, x, y)) return true;
  if (ex.farms.has(key(x, y))) return true;
  if (ex.deposits.has(key(x, y))) return true;
  for (const r of ex.huts) {
    if (x >= r.x0 - LANDFORM_HUT_MARGIN && x <= r.x1 + LANDFORM_HUT_MARGIN && y >= r.y0 - LANDFORM_HUT_MARGIN && y <= r.y1 + LANDFORM_HUT_MARGIN) return true;
  }
  // Only grass is stamped over: the dirt road keeps running
  // through the range as a mountain pass, the sand plaza stays a
  // plaza, and no water tile is ever re-stamped.
  if (terrainAt(world, x, y) !== 'grass') return true;
  return false;
}

/** The deterministic landform map for a world: the eastern
 *  mountain massif, its foothills, the valley floors between
 *  the ridges, and the sheer crags (the blocking peaks). Pure —
 *  no randomness, no I/O, no mutation. */
export function generateLandforms(world: IsoWorld): Landforms {
  const ex = buildExclusions(world);
  const mountains: LandformTile[] = [];
  const hills: LandformTile[] = [];
  const valleys: LandformTile[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (isMountainTile(x, y)) {
        if (!isExcluded(world, ex, x, y)) mountains.push({ x, y });
      } else if (isHillTile(x, y)) {
        if (!isExcluded(world, ex, x, y)) hills.push({ x, y });
      }
      if (isValleyTile(x, y) && !isExcluded(world, ex, x, y)) valleys.push({ x, y });
    }
  }
  // Cliffs: the sheer crags — peak mountain tiles whose hash says
  // crag. The hash scatters them, so they can never form a wall
  // (a wall would need a long contiguous run to pass the hash).
  const cliffs: LandformTile[] = [];
  for (const m of mountains) {
    if (groundElevation(m.x, m.y) > CLIFF_ELEV && hash2(m.x, m.y, CLIFF_SEED) < CLIFF_HASH && Math.hypot(m.x - FOUNDER_CAMP.x, m.y - FOUNDER_CAMP.y) > CLIFF_WORK_CLEARANCE && (m.y < ARRIVAL_CORRIDOR_Y0 || m.y > ARRIVAL_CORRIDOR_Y1)) cliffs.push({ x: m.x, y: m.y });
  }
  return { mountains, hills, valleys, cliffs };
}

/** Stamp the landform map onto a world that has none, once, and
 *  stamp the mountain tiles as 'stone' terrain so the whole game
 *  reads them as rock through the existing stone path (rendering,
 *  heightfield, maps). Returns true when it generated (the caller
 *  saves the world then). A world that already has landforms is
 *  left untouched — this is what keeps a mountain from moving or
 *  vanishing across reloads. */
export function stampLandforms(world: IsoWorld): boolean {
  if (world.landforms && world.landforms.mountains.length > 0) return false;
  const landforms = generateLandforms(world);
  if (landforms.mountains.length === 0) return false;
  world.landforms = landforms as unknown as IsoWorld['landforms'];
  for (const m of landforms.mountains) {
    world.terrain[`${m.x},${m.y}`] = 'stone';
  }
  return true;
}

/** True when any water (ocean, wild lake, authored pond, river,
 *  or placed water) lies within `radius` tiles (Manhattan) — the
 *  moisture rule for rich soil. The disc scan is bounded (17x17
 *  at radius 8) and reads through the existing water path, so it
 *  sees rivers too (they are stamped water terrain). */
function nearWater(world: IsoWorld, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > radius) continue;
      if (isWaterTile(world, x + dx, y + dy)) return true;
    }
  }
  return false;
}

/** The soil under a tile — a pure function of position + the
 *  (persisted) river map, so it is identical across reloads by
 *  construction. Rich near water or in a valley; poor on mountain
 *  rock or high dry ground; neutral everywhere else — and always
 *  neutral on the settlement's home ground (the camp disc). */
export function soilAt(world: IsoWorld, x: number, y: number): Soil {
  if (Math.hypot(x - FOUNDER_CAMP.x, y - FOUNDER_CAMP.y) < SOIL_CAMP_RADIUS) return 'neutral';
  if (isMountainTile(x, y) || groundElevation(x, y) > 0.6) return 'poor';
  if (nearWater(world, x, y, MOISTURE_RADIUS) || isValleyTile(x, y)) return 'rich';
  return 'neutral';
}

/** The farm growth factor for a tile (rich 1.5, neutral 1.0,
 *  poor 0.6) — what farmStageAt scales its thresholds by. */
export function soilFactorAt(world: IsoWorld, x: number, y: number): number {
  return SOIL_GROWTH[soilAt(world, x, y)];
}

/** The cliff on a tile, if any (exact tile only). A tile whose
 *  terrain is no longer stone (the player Removed it) reads as
 *  gone — the same rule as a removed river tile. */
export function cliffAt(world: IsoWorld, x: number, y: number): LandformTile | null {
  if (terrainAt(world, x, y) !== 'stone') return null;
  for (const c of world.landforms?.cliffs ?? []) if (c.x === x && c.y === y) return c;
  return null;
}

/** The mountain tile on a tile, if any (exact tile only, and
 *  only while its terrain is still stone). */
export function mountainAt(world: IsoWorld, x: number, y: number): LandformTile | null {
  if (terrainAt(world, x, y) !== 'stone') return null;
  for (const m of world.landforms?.mountains ?? []) if (m.x === x && m.y === y) return m;
  return null;
}

/** Which landform a tile belongs to ('mountain' | 'hill' |
 *  'valley' | null) — the map/probe view of the landform map. */
export function landformAt(world: IsoWorld, x: number, y: number): 'mountain' | 'hill' | 'valley' | null {
  if (mountainAt(world, x, y)) return 'mountain';
  for (const h of world.landforms?.hills ?? []) if (h.x === x && h.y === y) return 'hill';
  for (const v of world.landforms?.valleys ?? []) if (v.x === x && v.y === y) return 'valley';
  return null;
}

/** Every mountain tile in the world, flat (rendering + tests). */
export function allMountainTiles(world: IsoWorld): LandformTile[] {
  return [...(world.landforms?.mountains ?? [])];
}

/** Every cliff tile in the world, flat (rendering + tests). */
export function allCliffTiles(world: IsoWorld): LandformTile[] {
  return [...(world.landforms?.cliffs ?? [])];
}

/** Every valley tile in the world, flat (rendering + tests). */
export function allValleyTiles(world: IsoWorld): LandformTile[] {
  return [...(world.landforms?.valleys ?? [])];
}
