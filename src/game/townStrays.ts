import type { CombatPoint } from './combat';

/**
 * BUILD 917: occasional hostile strays at the town edge.
 *
 * BUILD 741's settlement safety zone keeps wilderness monsters from
 * spawning anywhere in the 5x5 town approach, so the Mosslight chunk
 * itself never contains a hostile and BUILD 915's NPC-vs-creature
 * combat can only happen when a test stages it. With the user's
 * approval the zone is relaxed AT THE EDGES ONLY: once in a while a
 * lone wilderness hostile wanders into the town chunk's outskirts,
 * menaces whoever it finds there (the 915 acquisition / fight-or-flee /
 * guard systems take over from that moment), and is gone for good when
 * killed — or left behind when the chunk's monster population
 * regenerates on exit, exactly like every other monster (monsters are
 * per-chunk session state and are never serialized, so a stray can
 * never duplicate or get stuck in a save).
 *
 * The town center stays safe by construction, not by policing: spawn
 * points sit in the edge band, and the stray's roam anchor
 * (updateGoat's home-range clamp) means even a full chase can never
 * come within TOWN_CENTER_SAFE_RADIUS of the plaza.
 *
 * Everything here is pure and sim-tested; App.tsx owns the live gate
 * (a slow accumulator in the field loop) and the actual spawn.
 */

/** How often the stray gate rolls while the player is in the town field. */
export const TOWN_STRAY_CHECK_INTERVAL_MS = 5000;
/** Per-check chance. At one roll per 5 s this averages one stray every
 *  ~2.4 minutes of town field time: a rare event in a play session,
 *  not a siege. */
export const TOWN_STRAY_CHANCE = 0.035;
/** At most this many live strays in the town chunk at once. */
export const TOWN_STRAY_MAX_ALIVE = 1;
/** After a stray dies (or is left behind on chunk exit), the gate stays
 *  shut this long so kills cannot be farmed back-to-back. */
export const TOWN_STRAY_COOLDOWN_MS = 240000;
/** Field units (of 280) from a chunk border that count as the outskirts. */
export const TOWN_STRAY_EDGE_BAND = 40;
/** Spawn points sit this far inside the border: in the band, on land. */
export const TOWN_STRAY_SPAWN_INSET = 26;
/** Roam anchor radius for a stray. Spawn points are 114+ units from the
 *  town center, so even a full-roam chase stays outside
 *  TOWN_CENTER_SAFE_RADIUS of the plaza. */
export const TOWN_STRAY_ROAM_RADIUS = 30;
/** The plaza heart: no stray spawn or chase may enter this radius. */
export const TOWN_CENTER_SAFE_RADIUS = 78;

/** Stray kinds, weighted: wolves most often, then slimes, then rats.
 *  All three are sprite-table wilderness kinds whose hpMult/variants
 *  live in MONSTER_SPAWN_TABLE (monsterSpawns.ts). */
export const TOWN_STRAY_KIND_WEIGHTS = [
  { kind: 'wolf', weight: 0.5 },
  { kind: 'slime', weight: 0.3 },
  { kind: 'rat', weight: 0.2 },
] as const;

export function strayKindForRoll(roll: number): string {
  let acc = 0;
  for (const entry of TOWN_STRAY_KIND_WEIGHTS) {
    acc += entry.weight;
    if (roll < acc) return entry.kind;
  }
  return TOWN_STRAY_KIND_WEIGHTS[0].kind;
}

/** True when the position sits in the chunk's outer edge band. */
export function isTownEdgePosition(pos: CombatPoint, fieldSize = 280): boolean {
  return pos.x <= TOWN_STRAY_EDGE_BAND || pos.y <= TOWN_STRAY_EDGE_BAND
    || pos.x >= fieldSize - TOWN_STRAY_EDGE_BAND || pos.y >= fieldSize - TOWN_STRAY_EDGE_BAND;
}

/** True when the position is inside the protected plaza heart. */
export function isTownCenterPosition(pos: CombatPoint, fieldSize = 280): boolean {
  const c = fieldSize / 2;
  return Math.hypot(pos.x - c, pos.y - c) <= TOWN_CENTER_SAFE_RADIUS;
}

/**
 * Candidate stray spawn points: the four edge midpoints and eight
 * off-center edge points, inset into the band. Every one is an edge
 * position, none is inside the center-safe radius, and all are inside
 * the spawnable field margin (asserted in sim).
 */
export function straySpawnPoints(fieldSize = 280): CombatPoint[] {
  const inset = TOWN_STRAY_SPAWN_INSET;
  const far = fieldSize - inset;
  const mid = fieldSize / 2;
  const q1 = fieldSize / 4;
  const q3 = (fieldSize * 3) / 4;
  return [
    { x: mid, y: inset }, { x: mid, y: far }, { x: inset, y: mid }, { x: far, y: mid },
    { x: q1, y: inset }, { x: q3, y: inset }, { x: q1, y: far }, { x: q3, y: far },
    { x: inset, y: q1 }, { x: inset, y: q3 }, { x: far, y: q1 }, { x: far, y: q3 },
  ];
}

/**
 * Pick a spawn point: scan candidates starting at `startIndex`
 * (roll-derived, so the entry edge varies) and take the first one the
 * caller's solidity query accepts. The edge/center rules are re-checked
 * here so no caller can ever place a stray in the town heart.
 */
export function pickStraySpawnPoint(
  candidates: CombatPoint[],
  startIndex: number,
  isFree: (pos: CombatPoint) => boolean,
  fieldSize = 280,
): CombatPoint | null {
  if (candidates.length === 0) return null;
  const start = ((startIndex % candidates.length) + candidates.length) % candidates.length;
  for (let i = 0; i < candidates.length; i++) {
    const pos = candidates[(start + i) % candidates.length];
    if (!isTownEdgePosition(pos, fieldSize) || isTownCenterPosition(pos, fieldSize)) continue;
    if (isFree(pos)) return pos;
  }
  return null;
}

/**
 * The stray gate: a new stray may arrive only when none is alive
 * (cap), the post-stray cooldown has elapsed, and the interval roll
 * succeeds.
 */
export function strayGateDecision(args: { aliveStrays: number; cooldownReady: boolean; roll: number }): boolean {
  if (args.aliveStrays >= TOWN_STRAY_MAX_ALIVE) return false;
  if (!args.cooldownReady) return false;
  return args.roll < TOWN_STRAY_CHANCE;
}
