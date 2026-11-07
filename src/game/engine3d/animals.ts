/**
 * BUILD 1013 — wild animals for the 3D world: birds, goats, deer, wolves.
 *
 * AUDIT RESULTS (2026-11-05, traced before any code):
 *
 * 1. NO animal/creature code exists in engine3d (grep: zero hits for
 *    goat/deer/wolf/bird/creature/animal). The main game has goats,
 *    deer, and wolves as creatures, but nothing of them reaches 3D.
 *    This module ports their RULES (rules only, no 2.5D code), it does
 *    not share their systems.
 *
 * 2. ATTACK (F/Space) DOES exist in 3D, against NPCs only: nearest
 *    living resident within Chebyshev 1 takes 25 damage, strikes back
 *    for 5, dies at 0 (E loots the body). Player HP persists in
 *    ag-3d-health-v1; 0 means "exhausted, restored to 100" (no death
 *    screen). The wolf pipeline reuses exactly this shape: wolves are
 *    added as F/Space targets (25 per swing), wolves bite back on
 *    their own 900ms tick (6 damage), a dead wolf is removed at once
 *    with a message. NO loot, NO XP, NO quest credit, NO bestiary —
 *    none of those systems exist in 3D and none are built here.
 *
 * 3. MOVEMENT: the 998 rules apply unchanged — 900ms logical ticks,
 *    tile A* (planPathNpc) with cached paths, occupied-next-tile
 *    waits + persistent-block replans (blockedAction), sealed waits +
 *    11-tick retries, render glide via advanceRenderPos at the demo
 *    speed (1 tile / 900ms), yaw smoothing, distance-based phase.
 *    Birds are the one exception: flight is direct (no A* — birds fly
 *    OVER obstacles), 1 tile per tick toward a chosen landing tile.
 *    Nothing teleports, ever.
 *
 * 4. ECOLOGY PRECEDENT (main game, townStrays.ts, BUILD 917): the
 *    280-unit field keeps hostiles out of a 78-unit plaza-safe radius
 *    (spawn >=114 from center, roam radius 30, cap 1). The 3D map is
 *    200x200 tiles with the plaza at (102,102); the town itself was
 *    MEASURED (bundle probe, 2026-11-05): 26 huts, bbox x 63..124,
 *    y 36..161, max hut corner 66.0 tiles from the plaza, roads to
 *    66.4. So the 3D keep-out is 72 (66.4 + ~5.6 margin): no animal
 *    ever spawns, wanders, flees, or chases inside 72 tiles of the
 *    plaza, and every A* cost makes <72 tiles cost 50 (routes go
 *    around, never through). Wolves keep a deeper band (88..135).
 *
 * 5. SAVE TREATMENT: SESSION-ONLY, like 1000's transients. Animals
 *    live in a view ref the view never serializes; on reload the
 *    world repopulates them fresh. Reasons: animals are ambient
 *    wildlife, not named or owned entities — no player progress rides
 *    on one animal's exact tile; repopulation keeps saves clean and
 *    cannot strand an animal inside a house the player placed or a
 *    tree the player removed. A wolf's HP is combat state, not
 *    progress: a fresh wolf on reload is correct.
 *
 * 6. MODELLING PRECEDENT (994 villagers.ts): procedural vertex-colour
 *    triangles only (positions + RGB, no textures, no normals, no
 *    sprites — the sprite program was deleted in 994 and is not
 *    revived). Figures are seeded per id so the same animal renders
 *    the same way on every rebuild. Proportions anchor on the 992
 *    character height H=1.48: goats/deer/wolves are quadrupeds below
 *    it, birds are small. Quadruped gait swings legs in diagonal
 *    pairs; birds flap wings around the forward (roll) axis.
 *
 * 7. CAPS (total 13, same order as 1000's transient cap of 8):
 *    birds 5, goats 3, deer 3, wolves 2. The town never floods, and
 *    the 998 slot story stays bounded (one fixed GPU slot per animal,
 *    sized to the largest animal emitter).
 *
 * BUILD 1016 — CHICKENS (town animals, the INVERSE of the keep-out):
 * Zelda's village chickens, the game's own triangles — no Zelda
 * assets, names, or copied designs; in-game they are just "chickens".
 * Wild animals stay OUT of town (§4); chickens live INSIDE it: they
 * wander the streets, plaza edges, and house fronts, peck, and
 * scuttle a step aside when the player walks into one (so a chicken
 * never blocks the player or sits underfoot — a small step aside,
 * not a deer flee and not a bird flush). No swarm, no eggs, no
 * collecting, no picking up — ambient town wildlife only.
 * Audit notes: NPC movement NEVER checks animal tiles (zero 'animal'
 * hits in npcMotion/townsfolk3d/transients) — chickens cannot block
 * NPCs by construction; only the PLAYER's walkableAt treats animals
 * as solid (the 0.42 render-distance rule), and the scuttle is what
 * keeps that momentary. The bark system is name-keyed (residents /
 * transients) — chickens have no names, so they stay SILENT: no
 * cluck lines, no sound system. Door tiles are inside hut rects, so
 * npcWalkable already excludes them; doorSTEPS need an extra set
 * (doorstepTiles below, via hutFace + doorForRect over generated +
 * placed huts). Roam radius 64 covers the central town and the
 * vertical road (y41..164) plus all three 1015 buildings, and keeps
 * an 8-tile buffer from the wild keep-out (72) — the extreme
 * north/south hut rows (66.0 out) sit just outside it, which is fine:
 * chickens are central-town animals, not far-row ones.
 */

import { terrainAt, type IsoWorld } from '../iso/isoWorld';
import { npcWalkable, planPathNpc } from './townsfolk3d';
import { blockedAction } from './npcMotion';
import { emitBox, hashStr } from './villagers';
import { SUN_SHADE, shadeRgb, type Rgb } from './townLook';
import { doorForRect, hutFace, placedHutRects } from './placements';

// ---------------------------------------------------------------- constants

export type AnimalKind = 'bird' | 'goat' | 'deer' | 'wolf' | 'chicken';

/** The 3D plaza (staticAnchors.plaza at runtime; this is the assert default). */
export const PLAZA_3D = { x: 102, y: 102 };
/** No animal ever stands inside this radius of the plaza (measured
 *  town edge 66.4 + ~5.6 margin — see header §4). */
export const ANIMAL_TOWN_KEEP_OUT = 72;
/** Spawn band for ambient kinds (Euclidean tiles from the plaza). */
export const SPAWN_MIN_DIST = 74;
export const SPAWN_MAX_DIST = 120;
/** Wolves live deeper: farther out, never near the town edge. */
export const WOLF_SPAWN_MIN_DIST = 88;
export const WOLF_SPAWN_MAX_DIST = 135;
/** Spawn entries must sit beyond the 22-tile figure cull (no pop-in),
 *  the same rule as transients (1000). */
export const ANIMAL_SPAWN_VIEW_DIST = 22;
/** Top-up pacing in 900ms ticks: kinds below cap refill ~every 27s. */
export const ANIMAL_SPAWN_TOPUP_TICKS = 30;

export const MAX_BIRDS = 5;
export const MAX_GOATS = 3;
export const MAX_DEER = 3;
export const MAX_WOLVES = 2;
/** BUILD 1016: a handful scattered loosely, same order as the 1013 caps. */
export const MAX_CHICKENS = 5;
export const MAX_ANIMALS = MAX_BIRDS + MAX_GOATS + MAX_DEER + MAX_WOLVES + MAX_CHICKENS;

/** Stardew-style flush: a perched bird takes off inside this radius. */
export const BIRD_FLUSH_RADIUS = 5;
/** Flight height in world units (bird geometry rises to this). */
export const BIRD_FLIGHT_HEIGHT = 3;
/** Goats step away when the player gets this close. */
export const GOAT_SHY_RADIUS = 2;
/** Deer run when the player gets this close. */
export const DEER_FLEE_RADIUS = 6;
/** A fleeing deer stops running once the player is this far away. */
export const DEER_FLEE_GIVE_UP_DIST = 12;
export const DEER_FLEE_MAX_TICKS = 8;
/** Wolves stalk the player inside this radius and give up beyond it. */
export const WOLF_APPROACH_RADIUS = 10;
export const WOLF_GIVE_UP_RADIUS = 16;
/** Wolf combat numbers (player melee is 25/swing, the NPC rule). */
export const WOLF_HP = 50;
export const WOLF_BITE = 6;
/** BUILD 1016: chickens roam the town inside this radius of the
 *  plaza (central town + vertical road + all three 1015 buildings;
 *  8 tiles of buffer from the wild keep-out at 72). */
export const CHICKEN_ROAM_RADIUS = 64;
/** A chicken scuttles aside when the player gets this close. */
export const CHICKEN_SCUTTLE_RADIUS = 2;
/** Scuttle lasts at most this many ticks (or until the player is
 *  CHICKEN_SCUTTLE_RADIUS + 2 away — the goat-shy exit rule). */
export const CHICKEN_SCUTTLE_TICKS = 3;

// ------------------------------------------------------------------- types

export type BirdState = 'perched' | 'flying';
export type GoatState = 'grazing' | 'wandering' | 'shying';
export type DeerState = 'grazing' | 'wandering' | 'fleeing';
export type WolfState = 'stalking' | 'approaching' | 'attacking';
export type ChickenState = 'pecking' | 'wandering' | 'scuttling';
export type AnimalState = BirdState | GoatState | DeerState | WolfState | ChickenState;

/** One wild animal. Logical tiles (integers after each 900ms step);
 * the view glides the render position toward them (998 rule). `slotId`
 * is the fixed GPU slot (0..MAX_ANIMALS-1) assigned at spawn. Wolves
 * carry hp; other kinds are never attack targets (hp stays 0). */
export interface AnimalActor {
  id: string;
  kind: AnimalKind;
  x: number;
  y: number;
  state: AnimalState;
  hp: number;
  slotId: number;
  /** Bird flight destination (landing tile), null when perched. */
  flightTo: { x: number; y: number } | null;
  /** Graze/pause ticks remaining (goat/deer). */
  pauseTicks: number;
  /** Flee/shy ticks remaining (goat/deer). */
  fleeTicks: number;
  /** Perched-bird relocation countdown (bird only). */
  relocateTicks: number;
  /** Per-animal variation seed (timers + spec). */
  seed: number;
}

export interface AnimalPathState {
  dest: string;
  path: { x: number; y: number }[];
  index: number;
  noPathTicks: number;
  blockedTicks: number;
}

// ------------------------------------------------------------------ helpers

export function distFromPlaza(x: number, y: number, plaza: { x: number; y: number }): number {
  return Math.hypot(x - plaza.x, y - plaza.y);
}

/** True when a tile is in the wild (outside the town keep-out). */
export function inWild(x: number, y: number, plaza: { x: number; y: number }): boolean {
  return distFromPlaza(x, y, plaza) >= ANIMAL_TOWN_KEEP_OUT;
}

/** Nearest tree within r tiles (deer/bird habitat preference). */
export function nearTree(world: IsoWorld, x: number, y: number, r: number): boolean {
  for (const t of world.trees) {
    if (Math.max(Math.abs(t.tx - x), Math.abs(t.ty - y)) <= r) return true;
  }
  return false;
}

/**
 * A tile an animal of this kind may stand on: NPC-walkable (never a
 * hut, never a placed blocker, never water), wild grass (never dirt
 * roads, never the sand plaza), and outside the town keep-out. Deer
 * additionally want a tree within 12 (forest edge); birds prefer one
 * within 8 but accept open field (see spawnAnimal's preference order).
 */
export function habitatTile(world: IsoWorld, kind: AnimalKind, x: number, y: number, plaza: { x: number; y: number }): boolean {
  if (!inWild(x, y, plaza)) return false;
  if (!npcWalkable(world, x, y)) return false;
  if (terrainAt(world, x, y) !== 'grass') return false;
  if (kind === 'deer' && !nearTree(world, x, y, 12)) return false;
  return true;
}

/**
 * A* step cost for animals: the town keep-out is expensive (50) so
 * routes go around the town instead of through it, never into it.
 * The Manhattan heuristic stays admissible (min cost 1).
 */
export function wildCostFn(plaza: { x: number; y: number }): (x: number, y: number) => number {
  return (x: number, y: number) => (distFromPlaza(x, y, plaza) < ANIMAL_TOWN_KEEP_OUT ? 50 : 1);
}

/** Project a tile outward to the keep-out circle (wolf approach clamp). */
export function clampToWild(x: number, y: number, plaza: { x: number; y: number }): { x: number; y: number } {
  const dx = x - plaza.x, dy = y - plaza.y;
  const d = Math.hypot(dx, dy);
  if (d >= ANIMAL_TOWN_KEEP_OUT || d === 0) return { x, y };
  const s = ANIMAL_TOWN_KEEP_OUT / d;
  return { x: Math.round(plaza.x + dx * s), y: Math.round(plaza.y + dy * s) };
}

// ------------------------------------------------------------ BUILD 1016 — town

/** True when a tile is inside the chickens' town roam. */
export function inTown(x: number, y: number, plaza: { x: number; y: number }): boolean {
  return distFromPlaza(x, y, plaza) <= CHICKEN_ROAM_RADIUS;
}

/**
 * Every doorstep tile in the world: each hut's door tile stepped one
 * tile outward along its door-face normal (the 990 exit point). Door
 * tiles themselves sit inside hut rects, so npcWalkable already
 * excludes them — doorsteps are the extra exclusion, and a chicken
 * must never sit on one (it would block Enter). Covers generated
 * huts (world.huts, incl. the stamped 1015 inn/store/smith) and
 * placed houses (placedHutRects). Single-sourced door math via
 * hutFace + doorForRect — never a second formula.
 */
export function doorstepTiles(world: IsoWorld): Set<string> {
  const out = new Set<string>();
  const huts = [...world.huts, ...placedHutRects(world)];
  for (const h of huts) {
    const face = hutFace(h);
    const door = doorForRect(h.x0, h.y0, h.x1, h.y1, face);
    const step = face === 'north' ? { x: door.x, y: door.y - 1 }
      : face === 'south' ? { x: door.x, y: door.y + 1 }
      : face === 'west' ? { x: door.x - 1, y: door.y }
      : { x: door.x + 1, y: door.y };
    out.add(door.x + ',' + door.y);
    out.add(step.x + ',' + step.y);
  }
  return out;
}

/**
 * A tile a chicken may stand on: NPC-walkable (never a hut, never a
 * placed blocker, never water), inside the town roam, town ground
 * (grass, dirt streets, or the sand plaza — never water, never
 * stone), and never a door tile or doorstep. The inverse of
 * habitatTile: wild animals take grass OUTSIDE 72; chickens take
 * town ground INSIDE 64.
 */
export function townHabitatTile(world: IsoWorld, x: number, y: number, plaza: { x: number; y: number }): boolean {
  if (!inTown(x, y, plaza)) return false;
  if (!npcWalkable(world, x, y)) return false;
  const t = terrainAt(world, x, y);
  if (t !== 'grass' && t !== 'dirt' && t !== 'sand') return false;
  if (doorstepTiles(world).has(x + ',' + y)) return false;
  return true;
}

/**
 * A* step cost for chickens: outside the town roam is expensive
 * (50) so routes stay in town instead of wandering into the wild.
 * The Manhattan heuristic stays admissible (min cost 1). Mirror of
 * wildCostFn with the sign flipped.
 */
export function townCostFn(plaza: { x: number; y: number }): (x: number, y: number) => number {
  return (x: number, y: number) => (distFromPlaza(x, y, plaza) > CHICKEN_ROAM_RADIUS ? 50 : 1);
}

/**
 * BUILD 1016: the A* step cost chickens actually plan with —
 * townCostFn plus a hard exclusion of door tiles/doorsteps (and any
 * other non-habitat town tile). Wander targets are habitat tiles,
 * but a plain townCostFn route may CUT THROUGH a doorstep on its
 * way there (a doorstep is NPC-walkable, so A* sees it as a free
 * tile) — the chicken would then stand on someone's doorstep for a
 * tick. The doorstep set is built once here and closed over, so
 * the per-node check is a Set lookup, not a rebuild. Non-habitat
 * tiles cost 1000 (not Infinity) so a route always exists: a
 * doorstep is a single tile with habitat ground around it, so the
 * planner routes around it instead of through it.
 */
export function chickenCostFn(world: IsoWorld, plaza: { x: number; y: number }): (x: number, y: number) => number {
  const steps = doorstepTiles(world);
  const town = townCostFn(plaza);
  return (x: number, y: number) => {
    if (steps.has(x + ',' + y)) return 1000;
    if (!inTown(x, y, plaza)) return town(x, y);
    if (!npcWalkable(world, x, y)) return 1000;
    const t = terrainAt(world, x, y);
    if (t !== 'grass' && t !== 'dirt' && t !== 'sand') return 1000;
    return town(x, y);
  };
}

// -------------------------------------------------------------------- spawn

function randomSpawnTile(
  world: IsoWorld,
  kind: AnimalKind,
  plaza: { x: number; y: number },
  minDist: number,
  maxDist: number,
  usedPositions: ReadonlySet<string>,
  preferNearTree: boolean,
): { x: number; y: number } | null {
  let fallback: { x: number; y: number } | null = null;
  for (let k = 0; k < 48; k++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const x = Math.round(plaza.x + Math.cos(ang) * dist);
    const y = Math.round(plaza.y + Math.sin(ang) * dist);
    if (x < 2 || y < 2 || x >= world.w - 2 || y >= world.h - 2) continue;
    if (usedPositions.has(x + ',' + y)) continue;
    if (!habitatTile(world, kind, x, y, plaza)) continue;
    if (preferNearTree && nearTree(world, x, y, 8)) return { x, y };
    if (!fallback) fallback = { x, y };
  }
  return fallback;
}

/**
 * BUILD 1016: a chicken spawn tile — a random town-ground tile
 * inside the roam radius, never on another animal's tile, never on
 * the player's tile, and (when requireOutOfView) beyond the 22-tile
 * figure cull so a chicken never pops in next to the player.
 */
function randomTownTile(
  world: IsoWorld,
  plaza: { x: number; y: number },
  usedPositions: ReadonlySet<string>,
  player: { x: number; y: number },
  requireOutOfView: boolean,
): { x: number; y: number } | null {
  const px = Math.round(player.x), py = Math.round(player.y);
  for (let k = 0; k < 48; k++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * CHICKEN_ROAM_RADIUS;
    const x = Math.round(plaza.x + Math.cos(ang) * dist);
    const y = Math.round(plaza.y + Math.sin(ang) * dist);
    if (x < 2 || y < 2 || x >= world.w - 2 || y >= world.h - 2) continue;
    if (usedPositions.has(x + ',' + y)) continue;
    if (x === px && y === py) continue;
    if (requireOutOfView && Math.max(Math.abs(x - px), Math.abs(y - py)) <= ANIMAL_SPAWN_VIEW_DIST) continue;
    if (!townHabitatTile(world, x, y, plaza)) continue;
    return { x, y };
  }
  return null;
}

/**
 * Spawn one animal of a kind, or null when it cannot spawn (no free
 * slot, no valid habitat tile, or — when requireOutOfView — no
 * out-of-view tile). Ids are kind + slot (stable, unique per live
 * animal); specs seed from the id.
 */
export function spawnAnimal(
  world: IsoWorld,
  kind: AnimalKind,
  usedSlots: ReadonlySet<number>,
  usedPositions: ReadonlySet<string>,
  player: { x: number; y: number },
  plaza: { x: number; y: number },
  requireOutOfView: boolean,
): AnimalActor | null {
  let slotId: number | null = null;
  for (let i = 0; i < MAX_ANIMALS; i++) if (!usedSlots.has(i)) { slotId = i; break; }
  if (slotId === null) return null;
  let tile: { x: number; y: number } | null = null;
  if (kind === 'chicken') {
    // Chickens spawn in town, not in the wild annulus.
    tile = randomTownTile(world, plaza, usedPositions, player, requireOutOfView);
  } else {
    const minDist = kind === 'wolf' ? WOLF_SPAWN_MIN_DIST : SPAWN_MIN_DIST;
    const maxDist = kind === 'wolf' ? WOLF_SPAWN_MAX_DIST : SPAWN_MAX_DIST;
    for (let attempt = 0; attempt < 3 && !tile; attempt++) {
      const cand = randomSpawnTile(world, kind, plaza, minDist, maxDist, usedPositions, kind === 'bird' || kind === 'deer');
      if (!cand) break;
      if (requireOutOfView && Math.max(Math.abs(cand.x - player.x), Math.abs(cand.y - player.y)) <= ANIMAL_SPAWN_VIEW_DIST) continue;
      tile = cand;
    }
  }
  if (!tile) return null;
  const seed = hashStr(kind + ':' + slotId + ':' + tile.x + ',' + tile.y);
  return {
    id: kind + '-' + slotId,
    kind,
    x: tile.x,
    y: tile.y,
    state: kind === 'wolf' ? 'stalking' : kind === 'bird' ? 'perched' : kind === 'chicken' ? 'pecking' : 'grazing',
    hp: kind === 'wolf' ? WOLF_HP : 0,
    slotId,
    flightTo: null,
    pauseTicks: kind === 'bird' ? 0 : kind === 'chicken' ? 3 + (seed % 4) : 4 + (seed % 5),
    fleeTicks: 0,
    relocateTicks: 25 + (seed % 20),
    seed,
  };
}

// --------------------------------------------------------------------- step

/**
 * Follow a cached A* path one tile (the transient/resident rule):
 * replan on destination change or unwalkable next step, wait on an
 * occupied next tile (persistent-block replan at 3), sealed wait +
 * 11-tick retry. Returns the (possibly new) path state and whether
 * the actor moved this tick.
 */
function followPath(
  world: IsoWorld,
  actor: AnimalActor,
  path: AnimalPathState | undefined,
  dest: { x: number; y: number },
  occupied: (x: number, y: number) => boolean,
  plaza: { x: number; y: number },
  costFn?: (x: number, y: number) => number,
): { path: AnimalPathState | undefined; moved: boolean } {
  // BUILD 1016: wild animals pay wildCostFn (stay out of town);
  // chickens pay townCostFn (stay in town). Default is wild.
  const cost = costFn ?? wildCostFn(plaza);
  const cx = Math.round(actor.x), cy = Math.round(actor.y);
  const destKey = dest.x + ',' + dest.y;
  let w = path;
  if (!w || w.dest !== destKey) {
    w = { dest: destKey, path: planPathNpc(world, { x: cx, y: cy }, dest, 4000, undefined, cost) ?? [], index: 0, noPathTicks: 0, blockedTicks: 0 };
  }
  if (w.path.length === 0) {
    w.noPathTicks++;
    if (w.noPathTicks >= 11) {
      w.path = planPathNpc(world, { x: cx, y: cy }, dest, 4000, undefined, cost) ?? [];
      w.index = 0; w.noPathTicks = 0;
    }
    return { path: w, moved: false };
  }
  const next = w.path[w.index];
  if (!next) return { path: undefined, moved: false };
  if (!npcWalkable(world, next.x, next.y)) {
    w.path = planPathNpc(world, { x: cx, y: cy }, dest, 4000, undefined, cost) ?? [];
    w.index = 0; w.noPathTicks = 0; w.blockedTicks = 0;
    return { path: w, moved: false };
  }
  if (occupied(next.x, next.y)) {
    w.blockedTicks++;
    if (blockedAction(w.blockedTicks) === 'replan') {
      const detour = planPathNpc(world, { x: cx, y: cy }, dest, 4000, new Set([next.x + ',' + next.y]), cost);
      if (detour) { w.path = detour; w.index = 0; w.blockedTicks = 0; w.noPathTicks = 0; }
      else { w.path = []; w.index = 0; w.blockedTicks = 0; w.noPathTicks = 0; }
    }
    return { path: w, moved: false };
  }
  actor.x = next.x;
  actor.y = next.y;
  w.index++;
  w.blockedTicks = 0;
  return { path: w, moved: true };
}

/** Pick a random wild-grass wander target within radius r of the actor. */
function wanderTarget(
  world: IsoWorld,
  actor: AnimalActor,
  radius: number,
  plaza: { x: number; y: number },
): { x: number; y: number } | null {
  for (let k = 0; k < 16; k++) {
    const x = Math.round(actor.x + (Math.random() * 2 - 1) * radius);
    const y = Math.round(actor.y + (Math.random() * 2 - 1) * radius);
    if (x < 2 || y < 2 || x >= world.w - 2 || y >= world.h - 2) continue;
    if (habitatTile(world, actor.kind, x, y, plaza)) return { x, y };
  }
  return null;
}

/** BUILD 1016: a random town-ground wander target (mirror of wanderTarget). */
function townWanderTarget(
  world: IsoWorld,
  actor: AnimalActor,
  radius: number,
  plaza: { x: number; y: number },
): { x: number; y: number } | null {
  for (let k = 0; k < 16; k++) {
    const x = Math.round(actor.x + (Math.random() * 2 - 1) * radius);
    const y = Math.round(actor.y + (Math.random() * 2 - 1) * radius);
    if (x < 2 || y < 2 || x >= world.w - 2 || y >= world.h - 2) continue;
    if (townHabitatTile(world, x, y, plaza)) return { x, y };
  }
  return null;
}

/**
 * BUILD 1016: direct scuttle step — the walkable 8-neighbour (town
 * ground only) farthest from the player. Mirror of fleeStep with
 * the town habitat instead of the wild one.
 */
function townFleeStep(
  world: IsoWorld,
  actor: AnimalActor,
  player: { x: number; y: number },
  occupied: (x: number, y: number) => boolean,
  plaza: { x: number; y: number },
): boolean {
  const cx = Math.round(actor.x), cy = Math.round(actor.y);
  let best: { x: number; y: number } | null = null;
  let bestD = Math.hypot(cx - player.x, cy - player.y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = cx + dx, ny = cy + dy;
    if (!townHabitatTile(world, nx, ny, plaza)) continue;
    if (occupied(nx, ny)) continue;
    const d = Math.hypot(nx - player.x, ny - player.y);
    if (d > bestD) { bestD = d; best = { x: nx, y: ny }; }
  }
  if (!best) return false;
  actor.x = best.x; actor.y = best.y;
  return true;
}

/** Direct flee step: the walkable 8-neighbour (wild only) farthest from the player. */
function fleeStep(
  world: IsoWorld,
  actor: AnimalActor,
  player: { x: number; y: number },
  occupied: (x: number, y: number) => boolean,
  plaza: { x: number; y: number },
): boolean {
  const cx = Math.round(actor.x), cy = Math.round(actor.y);
  let best: { x: number; y: number } | null = null;
  let bestD = Math.hypot(cx - player.x, cy - player.y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = cx + dx, ny = cy + dy;
    if (!inWild(nx, ny, plaza)) continue;
    if (!npcWalkable(world, nx, ny)) continue;
    if (occupied(nx, ny)) continue;
    const d = Math.hypot(nx - player.x, ny - player.y);
    if (d > bestD) { bestD = d; best = { x: nx, y: ny }; }
  }
  if (!best) return false;
  actor.x = best.x; actor.y = best.y;
  return true;
}

/** Bird flight destination: away from the player, 8–14 tiles out,
 *  wild grass, preferably near a tree. Null when nothing qualifies. */
function flightLanding(
  world: IsoWorld,
  actor: AnimalActor,
  player: { x: number; y: number },
  plaza: { x: number; y: number },
  minDist: number,
  maxDist: number,
): { x: number; y: number } | null {
  let fallback: { x: number; y: number } | null = null;
  for (let k = 0; k < 24; k++) {
    const ang = Math.atan2(actor.y - player.y, actor.x - player.x) + (Math.random() - 0.5) * 1.6;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const x = Math.round(actor.x + Math.cos(ang) * dist);
    const y = Math.round(actor.y + Math.sin(ang) * dist);
    if (x < 2 || y < 2 || x >= world.w - 2 || y >= world.h - 2) continue;
    if (!habitatTile(world, 'bird', x, y, plaza)) continue;
    if (nearTree(world, x, y, 8)) return { x, y };
    if (!fallback) fallback = { x, y };
  }
  return fallback;
}

/**
 * One 900ms step for one animal. Returns the (possibly new) path
 * state and bite damage dealt to the player this tick (wolves only,
 * 0 otherwise — the VIEW applies it to HP + the message, exactly
 * like the NPC strike-back). Animals never despawn here (wildlife
 * persists for the session; only a slain wolf leaves, via the
 * player's F/Space attack in the view).
 */
export function stepAnimal(
  world: IsoWorld,
  actor: AnimalActor,
  path: AnimalPathState | undefined,
  occupied: (x: number, y: number) => boolean,
  player: { x: number; y: number },
  plaza: { x: number; y: number },
): { path: AnimalPathState | undefined; biteDamage: number } {
  const px = Math.round(player.x), py = Math.round(player.y);
  const playerDist = Math.hypot(actor.x - px, actor.y - py);
  const playerWildDist = distFromPlaza(px, py, plaza);

  // ---------------------------------------------------------- bird
  if (actor.kind === 'bird') {
    if (actor.state === 'flying') {
      const to = actor.flightTo;
      if (!to) { actor.state = 'perched'; return { path: undefined, biteDamage: 0 }; }
      const dx = to.x - Math.round(actor.x), dy = to.y - Math.round(actor.y);
      if (dx === 0 && dy === 0) {
        actor.state = 'perched';
        actor.flightTo = null;
        actor.relocateTicks = 25 + (actor.seed % 20);
        return { path: undefined, biteDamage: 0 };
      }
      // Direct flight (no A* — birds fly over obstacles), one tile
      // per tick along the axis with the larger remaining delta.
      if (Math.abs(dx) >= Math.abs(dy)) actor.x = Math.round(actor.x) + Math.sign(dx);
      else actor.y = Math.round(actor.y) + Math.sign(dy);
      actor.x = Math.max(2, Math.min(world.w - 3, actor.x));
      actor.y = Math.max(2, Math.min(world.h - 3, actor.y));
      return { path: undefined, biteDamage: 0 };
    }
    // Perched: flush when the player closes in (Stardew-style), or
    // relocate to a nearby perch on the seeded countdown.
    if (playerDist <= BIRD_FLUSH_RADIUS) {
      const landing = flightLanding(world, actor, player, plaza, 8, 14);
      if (landing) {
        actor.state = 'flying';
        actor.flightTo = landing;
      }
      return { path: undefined, biteDamage: 0 };
    }
    actor.relocateTicks--;
    if (actor.relocateTicks <= 0) {
      const landing = flightLanding(world, actor, player, plaza, 4, 8);
      if (landing) {
        actor.state = 'flying';
        actor.flightTo = landing;
      } else {
        actor.relocateTicks = 25 + (actor.seed % 20);
      }
    }
    return { path: undefined, biteDamage: 0 };
  }

  // ---------------------------------------------------------- goat
  if (actor.kind === 'goat') {
    if (actor.state === 'shying') {
      actor.fleeTicks--;
      if (actor.fleeTicks <= 0 || playerDist > GOAT_SHY_RADIUS + 2) {
        actor.state = 'grazing';
        actor.pauseTicks = 4 + (actor.seed % 5);
        return { path: undefined, biteDamage: 0 };
      }
      fleeStep(world, actor, player, occupied, plaza);
      return { path: undefined, biteDamage: 0 };
    }
    if (playerDist <= GOAT_SHY_RADIUS) {
      actor.state = 'shying';
      actor.fleeTicks = 3;
      fleeStep(world, actor, player, occupied, plaza);
      return { path: undefined, biteDamage: 0 };
    }
    if (actor.state === 'grazing') {
      actor.pauseTicks--;
      if (actor.pauseTicks <= 0) {
        const dest = wanderTarget(world, actor, 8, plaza);
        if (dest) { actor.state = 'wandering'; const r = followPath(world, actor, undefined, dest, occupied, plaza); return { path: r.path, biteDamage: 0 }; }
        actor.pauseTicks = 4 + (actor.seed % 5);
      }
      return { path, biteDamage: 0 };
    }
    // wandering
    const dest = path ? (() => { const [x, y] = path.dest.split(',').map(Number); return { x, y }; })() : null;
    if (!dest) { actor.state = 'grazing'; actor.pauseTicks = 4 + (actor.seed % 5); return { path: undefined, biteDamage: 0 }; }
    const res = followPath(world, actor, path, dest, occupied, plaza);
    if (Math.round(actor.x) === dest.x && Math.round(actor.y) === dest.y) {
      actor.state = 'grazing';
      actor.pauseTicks = 4 + (actor.seed % 5);
      return { path: undefined, biteDamage: 0 };
    }
    return { path: res.path, biteDamage: 0 };
  }

  // ---------------------------------------------------------- deer
  if (actor.kind === 'deer') {
    if (actor.state === 'fleeing') {
      actor.fleeTicks--;
      if (actor.fleeTicks <= 0 || playerDist > DEER_FLEE_GIVE_UP_DIST) {
        actor.state = 'grazing';
        actor.pauseTicks = 3 + (actor.seed % 4);
        return { path: undefined, biteDamage: 0 };
      }
      fleeStep(world, actor, player, occupied, plaza);
      return { path: undefined, biteDamage: 0 };
    }
    if (playerDist <= DEER_FLEE_RADIUS) {
      actor.state = 'fleeing';
      actor.fleeTicks = DEER_FLEE_MAX_TICKS;
      fleeStep(world, actor, player, occupied, plaza);
      return { path: undefined, biteDamage: 0 };
    }
    if (actor.state === 'grazing') {
      actor.pauseTicks--;
      if (actor.pauseTicks <= 0) {
        const dest = wanderTarget(world, actor, 10, plaza);
        if (dest) { actor.state = 'wandering'; const r = followPath(world, actor, undefined, dest, occupied, plaza); return { path: r.path, biteDamage: 0 }; }
        actor.pauseTicks = 3 + (actor.seed % 4);
      }
      return { path, biteDamage: 0 };
    }
    // wandering
    const dest = path ? (() => { const [x, y] = path.dest.split(',').map(Number); return { x, y }; })() : null;
    if (!dest) { actor.state = 'grazing'; actor.pauseTicks = 3 + (actor.seed % 4); return { path: undefined, biteDamage: 0 }; }
    const res = followPath(world, actor, path, dest, occupied, plaza);
    if (Math.round(actor.x) === dest.x && Math.round(actor.y) === dest.y) {
      actor.state = 'grazing';
      actor.pauseTicks = 3 + (actor.seed % 4);
      return { path: undefined, biteDamage: 0 };
    }
    return { path: res.path, biteDamage: 0 };
  }

  // ---------------------------------------------------------- chicken
  // BUILD 1016: peck → wander → scuttle. Pecking is head-down and
  // stationary (the view eases the peck from the 'pecking' state,
  // same channel as goat/deer graze); wandering is the 998 A* walk
  // on town ground; scuttling is the goat-shy shape with a town
  // flee step — a small step aside, never a deer flee, never a bird
  // flush. A chicken never leaves town: wander targets and flee
  // steps are town-habitat tiles, and the A* cost (chickenCostFn)
  // keeps routes inside the roam radius AND off doorsteps — a
  // plain townCostFn route could cut through a doorstep, since a
  // doorstep is NPC-walkable.
  if (actor.kind === 'chicken') {
    if (actor.state === 'scuttling') {
      actor.fleeTicks--;
      if (actor.fleeTicks <= 0 || playerDist > CHICKEN_SCUTTLE_RADIUS + 2) {
        actor.state = 'pecking';
        actor.pauseTicks = 3 + (actor.seed % 4);
        return { path: undefined, biteDamage: 0 };
      }
      townFleeStep(world, actor, player, occupied, plaza);
      return { path: undefined, biteDamage: 0 };
    }
    if (playerDist <= CHICKEN_SCUTTLE_RADIUS) {
      actor.state = 'scuttling';
      actor.fleeTicks = CHICKEN_SCUTTLE_TICKS;
      townFleeStep(world, actor, player, occupied, plaza);
      return { path: undefined, biteDamage: 0 };
    }
    if (actor.state === 'pecking') {
      actor.pauseTicks--;
      if (actor.pauseTicks <= 0) {
        const dest = townWanderTarget(world, actor, 10, plaza);
        if (dest) { actor.state = 'wandering'; const r = followPath(world, actor, undefined, dest, occupied, plaza, chickenCostFn(world, plaza)); return { path: r.path, biteDamage: 0 }; }
        actor.pauseTicks = 3 + (actor.seed % 4);
      }
      return { path, biteDamage: 0 };
    }
    // wandering
    const dest = path ? (() => { const [x, y] = path.dest.split(',').map(Number); return { x, y }; })() : null;
    if (!dest) { actor.state = 'pecking'; actor.pauseTicks = 3 + (actor.seed % 4); return { path: undefined, biteDamage: 0 }; }
    const res = followPath(world, actor, path, dest, occupied, plaza, chickenCostFn(world, plaza));
    if (Math.round(actor.x) === dest.x && Math.round(actor.y) === dest.y) {
      actor.state = 'pecking';
      actor.pauseTicks = 3 + (actor.seed % 4);
      return { path: undefined, biteDamage: 0 };
    }
    return { path: res.path, biteDamage: 0 };
  }

  // ---------------------------------------------------------- wolf
  const playerInWild = playerWildDist >= ANIMAL_TOWN_KEEP_OUT;
  if (actor.state === 'attacking') {
    const cheb = Math.max(Math.abs(Math.round(actor.x) - px), Math.abs(Math.round(actor.y) - py));
    if (!playerInWild) {
      // The player retreated to town: the wolf gives up the hunt
      // and stalks the edge instead of following them in.
      actor.state = 'stalking';
      return { path: undefined, biteDamage: 0 };
    }
    if (cheb <= 1) return { path: undefined, biteDamage: WOLF_BITE };
    actor.state = 'approaching';
    return { path: undefined, biteDamage: 0 };
  }
  if (actor.state === 'approaching') {
    const cheb = Math.max(Math.abs(Math.round(actor.x) - px), Math.abs(Math.round(actor.y) - py));
    if (cheb <= 1) {
      if (!playerInWild) { actor.state = 'stalking'; return { path: undefined, biteDamage: 0 }; }
      actor.state = 'attacking';
      return { path: undefined, biteDamage: WOLF_BITE };
    }
    if (playerDist > WOLF_GIVE_UP_RADIUS || !playerInWild) {
      actor.state = 'stalking';
      return { path: undefined, biteDamage: 0 };
    }
    const dest = playerInWild ? { x: px, y: py } : clampToWild(px, py, plaza);
    const res = followPath(world, actor, path, dest, occupied, plaza);
    return { path: res.path, biteDamage: 0 };
  }
  // stalking: slow wander in the wild; close in when the player
  // ventures out within range.
  if (playerInWild && playerDist <= WOLF_APPROACH_RADIUS) {
    actor.state = 'approaching';
    return { path: undefined, biteDamage: 0 };
  }
  if (path) {
    const dest = (() => { const [x, y] = path.dest.split(',').map(Number); return { x, y }; })();
    const res = followPath(world, actor, path, dest, occupied, plaza);
    if (Math.round(actor.x) === dest.x && Math.round(actor.y) === dest.y) return { path: undefined, biteDamage: 0 };
    return { path: res.path, biteDamage: 0 };
  }
  const dest = wanderTarget(world, actor, 10, plaza);
  if (!dest) return { path: undefined, biteDamage: 0 };
  const res = followPath(world, actor, undefined, dest, occupied, plaza);
  return { path: res.path, biteDamage: 0 };
}

// ---------------------------------------------------------------- modelling

/** Seeded per-animal appearance (the 994 villager discipline). */
export interface AnimalSpec {
  body: Rgb;
  belly: Rgb;
  dark: Rgb;
  accent: Rgb;
  /** Size multiplier around 1 (goat/deer/wolf 0.94..1.08, bird 0.9..1.1). */
  scale: number;
}

const BIRD_BODIES: Rgb[] = [
  [0.35, 0.5, 0.7], [0.5, 0.38, 0.25], [0.15, 0.15, 0.16], [0.65, 0.35, 0.2],
];
const GOAT_BODIES: Rgb[] = [
  [0.9, 0.88, 0.84], [0.6, 0.6, 0.6], [0.55, 0.4, 0.25], [0.2, 0.18, 0.16],
];
const DEER_BODIES: Rgb[] = [
  [0.72, 0.55, 0.35], [0.62, 0.48, 0.32], [0.78, 0.62, 0.42],
];
const WOLF_BODIES: Rgb[] = [
  [0.45, 0.46, 0.5], [0.32, 0.32, 0.36], [0.5, 0.44, 0.38],
];
/** BUILD 1016: mostly white, like Zelda's village cuccos, with some
 *  brown variety. White is listed twice so most chickens read white. */
const CHICKEN_BODIES: Rgb[] = [
  [0.93, 0.93, 0.9], [0.93, 0.93, 0.9], [0.62, 0.47, 0.3], [0.35, 0.28, 0.22],
];

export function animalSpecFor(id: string, kind: AnimalKind): AnimalSpec {
  const h = hashStr(id + ':' + kind);
  const pick = (arr: Rgb[]) => arr[h % arr.length];
  // NOTE: hashStr returns an UNSIGNED 32-bit int, so the shift must be
  // >>> (unsigned) — >> (signed) turns hashes above 2^31 negative and
  // shrinks the animal instead of varying it (caught by the 1013
  // asserts: wolf scale came out 0.80 instead of 0.94..1.08).
  switch (kind) {
    case 'bird':
      return { body: pick(BIRD_BODIES), belly: [0.92, 0.9, 0.85], dark: [0.12, 0.12, 0.13], accent: [0.9, 0.55, 0.15], scale: 0.9 + ((h >>> 3) % 3) * 0.1 };
    case 'goat':
      return { body: pick(GOAT_BODIES), belly: [0.95, 0.93, 0.88], dark: [0.75, 0.7, 0.6], accent: [0.75, 0.7, 0.6], scale: 0.94 + ((h >>> 3) % 5) * 0.035 };
    case 'deer':
      return { body: pick(DEER_BODIES), belly: [0.85, 0.75, 0.6], dark: [0.6, 0.45, 0.28], accent: [0.6, 0.5, 0.38], scale: 0.94 + ((h >>> 3) % 5) * 0.035 };
    case 'wolf':
      return { body: pick(WOLF_BODIES), belly: [0.78, 0.76, 0.74], dark: [0.28, 0.28, 0.32], accent: [0.9, 0.9, 0.92], scale: 0.94 + ((h >>> 3) % 5) * 0.035 };
    case 'chicken':
      // accent is the red comb; beak/legs are a fixed orange in emitChicken.
      return { body: pick(CHICKEN_BODIES), belly: [0.96, 0.96, 0.93], dark: [0.55, 0.42, 0.28], accent: [0.85, 0.2, 0.15], scale: 0.9 + ((h >>> 3) % 3) * 0.05 };
  }
}

/** The same rotation emitBox applies: local (b=up, c=forward) at swing s. */
function rotPoint(b: number, s: number): { fwd: number; up: number } {
  return { fwd: -b * Math.sin(s), up: b * Math.cos(s) };
}

function pushTri(out: number[], a: Rgb, b: Rgb, c: Rgb, color: Rgb, shade: number): void {
  out.push(...a, ...shadeRgb(color, shade), ...b, ...shadeRgb(color, shade), ...c, ...shadeRgb(color, shade));
}

/**
 * A thin box rolled around the FORWARD axis (wing flap). emitBox can
 * only swing around the lateral axis, which reads as rowing, not
 * flapping — so wings get their own box with roll rotation. The box
 * spans lateral [±span], up [−thick/2, +thick/2], forward
 * [−chord/2, +chord/2], pivoted at its root (body side).
 * Emits 5 faces (top, front, back, left, right — same winding order
 * as emitBox) so it survives the renderer's face culling.
 */
function emitRollBox(
  out: number[],
  cx: number, cy: number, cz: number,
  yaw: number,
  flap: number,
  side: 1 | -1,
  span: number,
  thick: number,
  chord: number,
  color: Rgb,
): void {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const c = Math.cos(flap), s = Math.sin(flap);
  // Local corners: a=lateral (0..span, outward), b=up, c2=forward.
  const pt = (a: number, b: number, c2: number): Rgb => {
    const ar = a * c - b * s;
    const br = a * s + b * c;
    return [cx + rx * (ar * side) + fx * c2, cy + br, cz + rz * (ar * side) + fz * c2];
  };
  const h = thick / 2, ch = chord / 2;
  const p000 = pt(0, -h, -ch), p010 = pt(0, h, -ch), p001 = pt(0, -h, ch), p011 = pt(0, h, ch);
  const p100 = pt(span, -h, -ch), p110 = pt(span, h, -ch), p101 = pt(span, -h, ch), p111 = pt(span, h, ch);
  // Top (+up)
  pushTri(out, p011, p111, p110, color, SUN_SHADE.top);
  pushTri(out, p011, p110, p010, color, SUN_SHADE.top);
  // Front (+f)
  pushTri(out, p001, p101, p111, color, SUN_SHADE.south);
  pushTri(out, p001, p111, p011, color, SUN_SHADE.south);
  // Back (-f)
  pushTri(out, p100, p000, p010, color, SUN_SHADE.north);
  pushTri(out, p100, p010, p110, color, SUN_SHADE.north);
  // Outer edge (+lateral)
  pushTri(out, p101, p100, p110, color, SUN_SHADE.east);
  pushTri(out, p101, p110, p111, color, SUN_SHADE.east);
  // Inner edge (root, -lateral)
  pushTri(out, p000, p001, p011, color, SUN_SHADE.west);
  pushTri(out, p000, p011, p010, color, SUN_SHADE.west);
}

/** Quadruped proportions, in world units at scale 1 (before spec.scale). */
const QUAD = {
  goat: { legH: 0.52, bodyH: 0.42, bodyL: 0.78, bodyW: 0.36, neckLen: 0.34, headL: 0.26, headW: 0.2, headH: 0.18, tailL: 0.2 },
  deer: { legH: 0.68, bodyH: 0.44, bodyL: 0.82, bodyW: 0.34, neckLen: 0.5, headL: 0.3, headW: 0.18, headH: 0.16, tailL: 0.14 },
  wolf: { legH: 0.5, bodyH: 0.44, bodyL: 0.8, bodyW: 0.36, neckLen: 0.3, headL: 0.32, headW: 0.2, headH: 0.18, tailL: 0.34 },
} as const;

/**
 * Emit one quadruped (goat/deer/wolf). Diagonal leg pairs swing
 * opposite (walk gait); graze (0..1) pitches the neck/head down.
 * All boxes are yaw-rotated; limbs offset along the lateral axis
 * (the 1001 coherence rule).
 */
function emitQuadruped(
  out: number[],
  kind: 'goat' | 'deer' | 'wolf',
  cx: number, cz: number,
  yBase: number,
  yaw: number,
  phase: number,
  spec: AnimalSpec,
  graze: number,
): void {
  const q = QUAD[kind];
  const s = spec.scale;
  const legH = q.legH * s, bodyH = q.bodyH * s, bodyL = q.bodyL * s, bodyW = q.bodyW * s;
  const bodyY = yBase + legH + bodyH / 2;
  const bob = Math.abs(Math.sin(phase)) * 0.02;
  const legSwing = 0.45;
  const legW = 0.13 * s, legD = 0.14 * s;
  const legX = bodyW / 2 * 0.68;
  const legZ = bodyL / 2 * 0.72;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const legPos = (side: 1 | -1, fwd: 1 | -1) => ({
    x: cx + rx * (side * legX) + fx * (fwd * legZ),
    z: cz + rz * (side * legX) + fz * (fwd * legZ),
  });
  // Diagonal pairs: front-left + rear-right share one swing.
  const swingFL = legSwing * Math.sin(phase);
  const swingFR = -legSwing * Math.sin(phase);
  const fl = legPos(1, 1), fr = legPos(-1, 1), rl = legPos(1, -1), rr = legPos(-1, -1);
  emitBox(out, fl.x, bodyY - bodyH / 2 + bob, fl.z, yaw, swingFL, legW, -legH, 0, legD, spec.dark);
  emitBox(out, fr.x, bodyY - bodyH / 2 + bob, fr.z, yaw, swingFR, legW, -legH, 0, legD, spec.dark);
  emitBox(out, rl.x, bodyY - bodyH / 2 + bob, rl.z, yaw, swingFR, legW, -legH, 0, legD, spec.dark);
  emitBox(out, rr.x, bodyY - bodyH / 2 + bob, rr.z, yaw, swingFL, legW, -legH, 0, legD, spec.dark);
  // Body (slight forward pitch when grazing).
  emitBox(out, cx, bodyY + bob, cz, yaw, graze * 0.12, bodyW, -bodyH / 2, bodyH / 2, bodyL, spec.body);
  // Belly patch (slightly proud of the body bottom).
  emitBox(out, cx, bodyY - bodyH / 2 + 0.02 + bob, cz, yaw, graze * 0.12, bodyW * 0.9, -0.06, 0.06, bodyL * 0.85, spec.belly);
  // Neck: pivot at the body front-top; swing negative tips the top
  // forward; grazing pitches it further down.
  const neckPivotY = bodyY + bodyH / 2 - 0.04 + bob;
  const neckSwing = -0.45 - graze * 0.45;
  const neckLen = q.neckLen * s;
  const neckW = 0.14 * s;
  const neckPx = cx + fx * (bodyL / 2 - 0.02), neckPz = cz + fz * (bodyL / 2 - 0.02);
  emitBox(out, neckPx, neckPivotY, neckPz, yaw, neckSwing, neckW, 0, neckLen, neckW, spec.body);
  // Head at the neck top (rotated by the neck swing).
  const top = rotPoint(neckLen, neckSwing);
  const headCx = neckPx + fx * top.fwd, headCz = neckPz + fz * top.fwd;
  const headCy = neckPivotY + top.up;
  const headL = q.headL * s, headW = q.headW * s, headH = q.headH * s;
  emitBox(out, headCx, headCy, headCz, yaw, graze * 0.5, headW, -headH / 2, headH / 2, headL, spec.body);
  // Snout (wolf: long; goat/deer: shorter, same shape).
  const snoutL = kind === 'wolf' ? 0.14 * s : 0.09 * s;
  const snoutW = headW * 0.62;
  emitBox(out, headCx + fx * (headL / 2 + snoutL / 2 - 0.02), headCy - headH * 0.12, headCz + fz * (headL / 2 + snoutL / 2 - 0.02), yaw, graze * 0.5, snoutW, -headH * 0.3, headH * 0.3, snoutL, spec.dark);
  // Horns / antlers / ears.
  if (kind === 'goat') {
    for (const side of [1, -1] as const) {
      const hx = headCx + rx * (side * headW * 0.32) + fx * (-headL * 0.18);
      const hz = headCz + rz * (side * headW * 0.32) + fz * (-headL * 0.18);
      emitBox(out, hx, headCy + headH / 2, hz, yaw, 0.55, 0.05, 0, 0.2 * s, 0.05, spec.accent);
    }
  } else if (kind === 'deer') {
    for (const side of [1, -1] as const) {
      const ax = headCx + rx * (side * headW * 0.3) + fx * (-headL * 0.1);
      const az = headCz + rz * (side * headW * 0.3) + fz * (-headL * 0.1);
      emitBox(out, ax, headCy + headH / 2, az, yaw, 0.3, 0.045, 0, 0.34 * s, 0.045, spec.accent);
      // Forward tine on each antler.
      emitBox(out, ax + fx * 0.07 * s, headCy + headH / 2 + 0.16 * s, az + fz * 0.07 * s, yaw, -0.7, 0.04, 0, 0.14 * s, 0.04, spec.accent);
    }
  } else {
    // Wolf ears: two small upright boxes.
    for (const side of [1, -1] as const) {
      const ex = headCx + rx * (side * headW * 0.28) + fx * (headL * 0.12);
      const ez = headCz + rz * (side * headW * 0.28) + fz * (headL * 0.12);
      emitBox(out, ex, headCy + headH / 2, ez, yaw, -0.15, 0.06, 0, 0.12 * s, 0.06, spec.dark);
    }
  }
  // Tail: pivot at the body rear-top, angled up.
  const tailL = q.tailL * s;
  emitBox(out, cx + fx * (-bodyL / 2 + 0.02), bodyY + bodyH / 2 - 0.06 + bob, cz + fz * (-bodyL / 2 + 0.02), yaw, kind === 'wolf' ? 0.9 : 0.5, 0.07, 0, tailL, 0.07, spec.dark);
}

/** Emit one bird: small body, folded wings perched, flapping in flight. */
function emitBird(
  out: number[],
  cx: number, cz: number,
  yBase: number,
  yaw: number,
  phase: number,
  spec: AnimalSpec,
  flying: boolean,
): void {
  const s = spec.scale;
  const bodyY = yBase + 0.16 * s;
  const bodyL = 0.34 * s, bodyW = 0.18 * s, bodyH = 0.16 * s;
  const bob = flying ? 0 : Math.abs(Math.sin(phase)) * 0.01;
  // Body (slight nose-up pitch in flight).
  emitBox(out, cx, bodyY + bob, cz, yaw, flying ? -0.25 : 0, bodyW, -bodyH / 2, bodyH / 2, bodyL, spec.body);
  // Belly patch.
  emitBox(out, cx, bodyY - bodyH / 2 + 0.02 + bob, cz, yaw, flying ? -0.25 : 0, bodyW * 0.85, -0.05, 0.05, bodyL * 0.8, spec.belly);
  // Head + beak.
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const headCx = cx + fx * (bodyL / 2 + 0.02), headCz = cz + fz * (bodyL / 2 + 0.02);
  const headCy = bodyY + 0.09 * s + bob;
  emitBox(out, headCx, headCy, headCz, yaw, 0, 0.13 * s, -0.06 * s, 0.06 * s, 0.13 * s, spec.body);
  emitBox(out, headCx + fx * 0.1 * s, headCy, headCz + fz * 0.1 * s, yaw, 0, 0.05 * s, -0.02 * s, 0.02 * s, 0.08 * s, spec.accent);
  // Tail (short, angled up-back).
  emitBox(out, cx + fx * (-bodyL / 2 - 0.02), bodyY + 0.02 + bob, cz + fz * (-bodyL / 2 - 0.02), yaw, 0.7, bodyW * 0.7, -0.02, 0.02, 0.16 * s, spec.dark);
  // Wings: folded (tips down) when perched, flapping when flying.
  // Both wings take the SAME flap angle — emitRollBox's side
  // multiplier mirrors the lateral axis, so the tips rise together.
  const flap = flying ? Math.sin(phase) * 0.9 : -0.55;
  const wingSpan = 0.42 * s, wingChord = 0.2 * s, wingThick = 0.03;
  const wingY = bodyY + 0.04 * s + bob;
  emitRollBox(out, cx, wingY, cz, yaw, flap, 1, wingSpan, wingThick, wingChord, spec.body);
  emitRollBox(out, cx, wingY, cz, yaw, flap, -1, wingSpan, wingThick, wingChord, spec.body);
}

/** Orange beak + legs (fixed, not seeded — every chicken reads as one). */
const CHICKEN_ORANGE: Rgb = [0.9, 0.6, 0.15];

/**
 * BUILD 1016: emit one chicken — a small biped, ~0.5 tall against
 * the 1.48 character anchor. Plump body, head with beak and red comb,
 * folded wings (flapping while scuttling), tail feathers fanned
 * up-back, two thin legs that alternate while walking. `graze` is
 * the peck amount 0..1: the head drops toward the ground and the
 * body pitches forward, same channel as goat/deer graze.
 */
function emitChicken(
  out: number[],
  cx: number, cz: number,
  yBase: number,
  yaw: number,
  phase: number,
  spec: AnimalSpec,
  graze: number,
  flutter: boolean,
): void {
  const s = spec.scale;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const legH = 0.16 * s;
  const bodyY = yBase + legH + 0.12 * s;
  const bodyW = 0.22 * s, bodyH = 0.24 * s, bodyL = 0.34 * s;
  const bob = Math.abs(Math.sin(phase)) * 0.015;
  // Legs: thin, orange, swinging opposite while walking.
  const legSwing = 0.4;
  const legW = 0.045 * s, legD = 0.05 * s;
  const legX = 0.05 * s;
  for (const side of [1, -1] as const) {
    const lx = cx + rx * (side * legX), lz = cz + rz * (side * legX);
    emitBox(out, lx, legH + bob, lz, yaw, side === 1 ? legSwing * Math.sin(phase) : -legSwing * Math.sin(phase), legW, -legH, 0, legD, CHICKEN_ORANGE);
  }
  // Body (slight forward pitch while pecking) + belly patch.
  emitBox(out, cx, bodyY + bob, cz, yaw, graze * 0.15, bodyW, -bodyH / 2, bodyH / 2, bodyL, spec.body);
  emitBox(out, cx, bodyY - bodyH / 2 + 0.02 + bob, cz, yaw, graze * 0.15, bodyW * 0.85, -0.05, 0.05, bodyL * 0.8, spec.belly);
  // Head: front-top of the body; pecking drops it toward the ground
  // and tips it forward. Beak + red comb ride the head.
  const headCx = cx + fx * (bodyL / 2 + 0.01 + graze * 0.06 * s);
  const headCz = cz + fz * (bodyL / 2 + 0.01 + graze * 0.06 * s);
  const headCy = bodyY + 0.14 * s - graze * 0.2 * s + bob;
  const headW = 0.13 * s, headH = 0.12 * s, headL = 0.13 * s;
  const headSwing = graze * 0.5;
  emitBox(out, headCx, headCy, headCz, yaw, headSwing, headW, -headH / 2, headH / 2, headL, spec.body);
  emitBox(out, headCx + fx * 0.09 * s, headCy - 0.01 * s, headCz + fz * 0.09 * s, yaw, headSwing, 0.04 * s, -0.015 * s, 0.015 * s, 0.07 * s, CHICKEN_ORANGE);
  emitBox(out, headCx, headCy + headH / 2 + 0.02 * s, headCz, yaw, headSwing, 0.04 * s, 0, 0.07 * s, 0.05 * s, spec.accent);
  // Tail feathers: two thin boxes fanned up-back.
  const tailX = cx + fx * (-bodyL / 2 + 0.01), tailZ = cz + fz * (-bodyL / 2 + 0.01);
  emitBox(out, tailX, bodyY + 0.06 * s + bob, tailZ, yaw, 0.55, 0.05 * s, 0, 0.18 * s, 0.04 * s, spec.dark);
  emitBox(out, tailX + rx * 0.04 * s, bodyY + 0.07 * s + bob, tailZ + rz * 0.04 * s, yaw, 0.85, 0.045 * s, 0, 0.14 * s, 0.04 * s, spec.dark);
  // Wings: folded flat on the body sides while pecking/wandering,
  // flapping (roll boxes, like the bird) while scuttling.
  if (flutter) {
    const flap = Math.sin(phase) * 0.7;
    const wingY = bodyY + 0.04 * s + bob;
    emitRollBox(out, cx, wingY, cz, yaw, flap, 1, 0.2 * s, 0.03, 0.18 * s, spec.dark);
    emitRollBox(out, cx, wingY, cz, yaw, flap, -1, 0.2 * s, 0.03, 0.18 * s, spec.dark);
  } else {
    for (const side of [1, -1] as const) {
      const wx = cx + rx * (side * (bodyW / 2 + 0.005)), wz = cz + rz * (side * (bodyW / 2 + 0.005));
      emitBox(out, wx, bodyY + 0.02 * s + bob, wz, yaw, graze * 0.15, 0.03, -0.06 * s, 0.06 * s, 0.2 * s, spec.dark);
    }
  }
}

/**
 * Emit one animal into the world vertex buffer. `yBase` is the ground
 * height (birds pass their flight height; ground animals pass 0).
 * `graze` is 0..1 (goat/deer head-down, chicken peck), `flying`
 * drives wing flap, `flutter` flaps chicken wings while scuttling.
 */
export function emitAnimal(
  out: number[],
  kind: AnimalKind,
  cx: number,
  cz: number,
  yBase: number,
  yaw: number,
  phase: number,
  spec: AnimalSpec,
  opts: { graze?: number; flying?: boolean; flutter?: boolean },
): void {
  if (kind === 'bird') {
    emitBird(out, cx, cz, yBase, yaw, phase, spec, opts.flying ?? false);
    return;
  }
  if (kind === 'chicken') {
    emitChicken(out, cx, cz, yBase, yaw, phase, spec, opts.graze ?? 0, opts.flutter ?? false);
    return;
  }
  emitQuadruped(out, kind, cx, cz, yBase, yaw, phase, spec, opts.graze ?? 0);
}

/** Largest per-kind vertex count (probe one spec per kind). */
export function maxAnimalVerts(): number {
  let max = 0;
  for (const kind of ['bird', 'goat', 'deer', 'wolf', 'chicken'] as const) {
    const out: number[] = [];
    emitAnimal(out, kind, 0, 0, 0, 0, 0, animalSpecFor('probe-0', kind), { graze: 0.5, flying: true, flutter: true });
    max = Math.max(max, out.length / 6);
  }
  return max;
}

/**
 * BUILD 1015 polish: shadow blob under a ground animal (1013 shipped
 * none). One dark ground quad (2 tris, 6 verts) at y=0.005, same dark
 * blob colour as the house contact shadows. Skipped while a bird is
 * flying (h >= 0.05) — a bird in the air casts no blob here.
 * Half-size by kind: bird 0.22, deer 0.55, goat/wolf 0.45.
 */
export function emitAnimalBlob(out: number[], kind: AnimalKind, cx: number, cz: number, h: number): void {
  if (h >= 0.05) return;
  const bs = kind === 'bird' ? 0.22 : kind === 'chicken' ? 0.25 : kind === 'deer' ? 0.55 : 0.45;
  out.push(
    cx - bs, 0.005, cz - bs, 0.2, 0.19, 0.17, cx + bs, 0.005, cz - bs, 0.2, 0.19, 0.17, cx + bs, 0.005, cz + bs, 0.2, 0.19, 0.17,
    cx - bs, 0.005, cz - bs, 0.2, 0.19, 0.17, cx + bs, 0.005, cz + bs, 0.2, 0.19, 0.17, cx - bs, 0.005, cz + bs, 0.2, 0.19, 0.17,
  );
}
