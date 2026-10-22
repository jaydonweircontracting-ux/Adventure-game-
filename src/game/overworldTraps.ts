// BUILD 973: overworld traps (combat extras 5/6).
//
// Portable kernel only, from the EQEmu analysis (§(c)15): traps
// outside dungeons. The game already has dungeon trap vaults (931);
// this is the overworld extension, not a new idea — and it keeps the
// 931 trigger rule exactly: ONLY the player's own walking step fires
// a trap. Placement, sight, monster wandering, teleports, Veil Step
// blinks, minimap-travel arrival jumps, and load restores never fire
// one. (Tap-to-move and minimap travel DO fire, because the avatar
// visibly walks the route step by step through the frame-loop mover —
// the same steps a D-pad walk takes. Instant position sets never do.)
//
// Placement is deterministic per chunk (a hash of the chunk coords
// seeds a small LCG), so traps are stable across visits without any
// stored placement table: only FIRED trap ids are saved (one new save
// field, firedOverworldTraps; old saves restore to none fired). Traps
// never spawn in the settlement safety zone, on blocked cells
// (buildings, trees, water), or on road cells — wilderness hazard,
// not a tax on walking to town. A fired trap stays fired: re-entering
// the chunk never re-arms it.
//
// The trap itself is deliberately plain: a marked snare on the ground
// (drawn in the iso view, so it is avoidable on sight), dealing flat
// physical damage through the 935 mitigation pipeline — armor bites,
// and like any other wound it shatters an active Frost Ward. No slow,
// stun, or fear effect is attached: 943 established that nothing
// overworld slows, stuns, or fears anything yet, and this build does
// not invent one. No trap-laying, disarming, or crafting system is
// implied: these are world hazards, not player tools.

export type OverworldTrap = {
  /** Stable id: `${chunkX},${chunkY}:${index}`. */
  id: string;
  position: { x: number; y: number };
};

/** Step radius: the player's position within this of a trap fires it. */
export const TRAP_TRIGGER_RADIUS = 1.5;
/** Raw physical damage before 935 mitigation (armor applies). */
export const TRAP_RAW_DAMAGE = 8;
/** Max traps per wilderness chunk. */
export const TRAPS_PER_CHUNK = 3;
/** Placement margin inside the 0..280 field. */
export const TRAP_FIELD_MIN = 20;
export const TRAP_FIELD_MAX = 260;
/** Minimum separation between traps in one chunk. */
export const TRAP_MIN_SEPARATION = 25;

export function overworldTrapId(chunk: { x: number; y: number }, index: number): string {
  return `${chunk.x},${chunk.y}:${index}`;
}

function hashChunk(chunk: { x: number; y: number }): number {
  let h = (chunk.x * 374761393 + chunk.y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return h >>> 0;
}

/** Tiny deterministic LCG (no Math.random: placement must be stable). */
function nextRand(state: { s: number }): number {
  state.s = (Math.imul(state.s, 1664525) + 1013904223) >>> 0;
  return state.s / 4294967296;
}

/**
 * Deterministic traps for one chunk. The caller supplies the chunk's
 * own blockage/road tests (App: isFieldPositionBlocked + isOnFieldRoad
 * with the chunk's road piece) and whether traps are allowed here at
 * all (App passes false for the settlement safety zone). Pure: the
 * same chunk + same tests always yield the same traps.
 */
export function overworldTrapsForChunk(
  chunk: { x: number; y: number },
  isBlocked: (pos: { x: number; y: number }) => boolean,
  isRoad: (x: number, y: number) => boolean,
  allowed: boolean,
): OverworldTrap[] {
  if (!allowed) return [];
  const rng = { s: hashChunk(chunk) || 1 };
  const traps: OverworldTrap[] = [];
  for (let i = 0; i < TRAPS_PER_CHUNK; i++) {
    const x = TRAP_FIELD_MIN + nextRand(rng) * (TRAP_FIELD_MAX - TRAP_FIELD_MIN);
    const y = TRAP_FIELD_MIN + nextRand(rng) * (TRAP_FIELD_MAX - TRAP_FIELD_MIN);
    const pos = { x, y };
    if (isBlocked(pos) || isRoad(x, y)) continue;
    if (traps.some((t) => Math.hypot(t.position.x - x, t.position.y - y) < TRAP_MIN_SEPARATION)) continue;
    traps.push({ id: overworldTrapId(chunk, i), position: pos });
  }
  return traps;
}

/**
 * Step check: the trap under the player's new walking position, if
 * any armed trap is within trigger radius. Returns null when no trap
 * fires (none near, or already fired). The caller marks the returned
 * trap fired and applies damage — this function only decides.
 */
export function checkOverworldTrapStep(
  position: { x: number; y: number },
  traps: OverworldTrap[],
  firedIds: ReadonlySet<string>,
): OverworldTrap | null {
  for (const trap of traps) {
    if (firedIds.has(trap.id)) continue;
    if (Math.hypot(trap.position.x - position.x, trap.position.y - position.y) <= TRAP_TRIGGER_RADIUS) {
      return trap;
    }
  }
  return null;
}

/** Sanitize the save field: old saves carry nothing -> no fired traps. */
export function sanitizeFiredTraps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}
