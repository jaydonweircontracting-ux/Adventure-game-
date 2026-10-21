import { getDirection, isAdjacentAndFacing, type CombatDirection, type CombatPoint } from './combat';

export type GoatAIState = 'idle' | 'chase' | 'attack' | 'hurt' | 'die';
export type GoatAIEntity = { position: CombatPoint; facing: CombatDirection; state: GoatAIState; disposition: 'calm' | 'aggressive' | 'defeated'; hp: number; maxHp: number; attackCooldown: number; attackTimer: number; attackHitApplied: boolean; hurtTimer: number; moving: boolean; attacking: boolean; spawnPosition?: CombatPoint; roamRadius?: number; level?: number; provoked?: boolean; threatLevel?: number; fleeing?: boolean };
export const GOAT_CHASE_RANGE = 24;
// Keep hostile goats close enough that sprites nearly touch the player:
// melee happens up close, and the player's 5-unit swing reach connects.
export const GOAT_MELEE_RANGE = 4;
export const GOAT_CHASE_SPEED = 4;
export const GOAT_FLEE_HP_RATIO = 0.3;
export const GOAT_FLEE_SPEED = 2;
// Common sense: a creature this many levels below its target won't start a
// fight unless provoked first. (Provoked creatures fight or flee normally.)
export const GOAT_OUTMATCHED_LEVEL_GAP = 4;
export const GOAT_ATTACK_WINDUP_MS = 220;
export const GOAT_ATTACK_COOLDOWN_MS = 1500;

// RuneScape-style: a monster drops everything it was carrying. Wielded gear is
// assigned deterministically at spawn (see gearForMonster) and always drops.
export type GearLoot = Record<string, number>;
export function gearForMonster(kind: string, variant: string | undefined, ranged: boolean): GearLoot {
  if (ranged) return { bow: 1 };
  switch (kind) {
    case 'bandit':
    case 'soldier':
      return { daggers: 1 };
    case 'goblin':
    case 'skeleton':
      return variant === 'warrior' ? { daggers: 1 } : {};
    default:
      return {};
  }
}
// Humanoids leave bones, like RuneScape.
export function bonesForMonster(kind: string): GearLoot {
  switch (kind) {
    case 'goblin':
    case 'bandit':
    case 'soldier':
    case 'orc':
    case 'skeleton':
    case 'troll':
      return { bone: 1 };
    default:
      return {};
  }
}

export function moveTowards(from: CombatPoint, to: CombatPoint, speed: number, deltaMs: number, separation: CombatPoint = { x: 0, y: 0 }): CombatPoint {
  const dx = to.x - from.x + separation.x;
  const dy = to.y - from.y + separation.y;
  const distance = Math.hypot(dx, dy) || 1;
  const step = speed * deltaMs / 1000;
  return { x: from.x + dx / distance * Math.min(step, distance), y: from.y + dy / distance * Math.min(step, distance) };
}

// Caller-supplied movement options for updateGoat. The AI stays pure: it never
// imports world collision itself. The caller (App) passes its authoritative
// blocker query so enemies respect water/trees/buildings instead of walking
// through them.
export type UpdateGoatOpts = {
  /** Return true when the field position is solid. When supplied, desired
   *  moves are validated: blocked destinations slide along the obstacle
   *  (axis-separated) instead of entering it, and fully blocked moves stay
   *  in place. When omitted, movement behaves exactly as before. */
  isBlocked?: (pos: CombatPoint) => boolean;
  /** BUILD 914: melee standoff distance the creature holds from its
   *  target. Defaults to GOAT_MELEE_RANGE (the player spacing). Against
   *  townsfolk targets the caller passes a close standoff: NPC retaliation
   *  lands at 1.8 units and their chase stops at 1.35, so a creature
   *  holding the 4.0 player ring could never be hit back — it kited its
   *  victim across town, untouchable (measured in the BUILD 914 browser
   *  verification: a guard dealt 0 damage over a full 60-HP fight). */
  meleeStandOff?: number;
  /** BUILD 933: chase-gate distance (defaults to GOAT_CHASE_RANGE). The App
   *  loops pass the reduced sneak range (12) for a sneaking player the
   *  creature is not already fighting, so acquisition gating in
   *  creatureCombat.ts is not bypassed by the chase itself. An already
   *  engaged creature keeps the normal gate — its lock/leash, not this
   *  number, decides when the fight ends. */
  chaseRange?: number;
  /** BUILD 934: per-kind behavior block (creatureBehavior.ts), resolved
   *  by the caller from the creature's kind. preferredRange is the
   *  fight range for THIS target (callers pass it only for player
   *  targets; NPC targets keep meleeStandOff so 915 retaliation lands).
   *  stand is the precomputed staticattack roll for this frame (the
   *  caller hashes key + time bucket; updateGoat stays pure). When
   *  omitted, movement/flee behave exactly as before (standoff 4,
   *  never stand, global 0.3 flee threshold, always flees). */
  behavior?: {
    preferredRange?: number;
    stand?: boolean;
    fleeHpRatio?: number;
    canFlee?: boolean;
  };
  /**
   * BUILD 943: EQEmu ability movement knobs, resolved by the caller
   * from the kind's ability block. chaseSpeed replaces GOAT_CHASE_SPEED
   * in the chase and return-home branches (enraged creatures run
   * faster); fleeSpeed replaces GOAT_FLEE_SPEED in the flee branch;
   * suppressEngagement holds an UNENGAGED creature idle (sneak-blind
   * kinds facing a sneaking player). All default to the old behavior
   * when omitted — a caller that passes nothing gets byte-identical
   * movement.
   */
  chaseSpeed?: number;
  fleeSpeed?: number;
  suppressEngagement?: boolean;
};

// Resolve a desired move against solid geometry. Tries the full move first,
// then axis-separated slides (wall sliding), then staying put. Never returns
// a blocked position unless the starting position itself was already blocked.
function resolveCollisionMove(from: CombatPoint, desired: CombatPoint, isBlocked?: (pos: CombatPoint) => boolean): { position: CombatPoint; moved: boolean } {
  if (!isBlocked) return { position: desired, moved: true };
  if (!isBlocked(desired)) return { position: desired, moved: true };
  const xOnly = { x: desired.x, y: from.y };
  if ((xOnly.x !== from.x || xOnly.y !== from.y) && !isBlocked(xOnly)) return { position: xOnly, moved: true };
  const yOnly = { x: from.x, y: desired.y };
  if ((yOnly.x !== from.x || yOnly.y !== from.y) && !isBlocked(yOnly)) return { position: yOnly, moved: true };
  return { position: from, moved: false };
}

function moveAwayFrom(from: CombatPoint, threat: CombatPoint, speed: number, deltaMs: number) {
  const dx = from.x - threat.x;
  const dy = from.y - threat.y;
  const distance = Math.hypot(dx, dy) || 1;
  const step = speed * deltaMs / 1000;
  return { x: from.x + (dx / distance) * Math.min(step, distance), y: from.y + (dy / distance) * Math.min(step, distance) };
}

// Home-range constraint: keep goats from wandering infinitely far from spawn.
// Returns the position clamped to within roamRadius of spawnPosition.
function clampToHomeRange(position: CombatPoint, spawnPosition: CombatPoint | undefined, roamRadius: number | undefined): CombatPoint {
  if (!spawnPosition || !roamRadius || roamRadius <= 0) return position;
  const dx = position.x - spawnPosition.x;
  const dy = position.y - spawnPosition.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= roamRadius) return position;
  const scale = roamRadius / distance;
  return { x: spawnPosition.x + dx * scale, y: spawnPosition.y + dy * scale };
}

// Should this goat give up the chase and head home? True when the player is
// beyond the goat's territory and the goat is already at its range edge.
function shouldReturnHome(goat: GoatAIEntity, player: CombatPoint): boolean {
  if (!goat.spawnPosition || !goat.roamRadius) return false;
  const playerDistFromHome = Math.hypot(player.x - goat.spawnPosition.x, player.y - goat.spawnPosition.y);
  const goatDistFromHome = Math.hypot(goat.position.x - goat.spawnPosition.x, goat.position.y - goat.spawnPosition.y);
  return playerDistFromHome > goat.roamRadius * 1.2 && goatDistFromHome >= goat.roamRadius * 0.9;
}

// Keep hostile goats close enough that sprites nearly touch the player:
// melee happens up close, and the player's 5-unit swing reach connects.
function keepMeleeDistance(position: CombatPoint, player: CombatPoint, playerFacing: CombatDirection, standOff: number = GOAT_MELEE_RANGE): CombatPoint {
  const dx = position.x - player.x;
  const dy = position.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= standOff) return position;
  if (distance === 0) {
    const facingOffset: Record<CombatDirection, CombatPoint> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const offset = facingOffset[playerFacing];
    return { x: player.x + offset.x * standOff, y: player.y + offset.y * standOff };
  }
  const scale = standOff / distance;
  return { x: player.x + dx * scale, y: player.y + dy * scale };
}

export function updateGoat<T extends GoatAIEntity>(goat: T, player: CombatPoint, playerFacing: CombatDirection, goats: GoatAIEntity[], deltaMs: number, opts?: UpdateGoatOpts): { goat: T; attackHit: boolean } {
  const cooldown = Math.max(0, goat.attackCooldown - deltaMs);
  const hurtTimer = Math.max(0, goat.hurtTimer - deltaMs);
  if (goat.hp <= 0 || goat.disposition === 'defeated') return { goat: { ...goat, disposition: 'defeated', state: 'die', moving: false, attacking: false, attackCooldown: cooldown, hurtTimer, attackTimer: 0, attackHitApplied: false, fleeing: false }, attackHit: false };
  if (goat.state === 'hurt' && hurtTimer > 0) return { goat: { ...goat, hurtTimer, attackCooldown: cooldown, moving: false, attacking: false, fleeing: goat.fleeing ?? false }, attackHit: false };

  const distance = Math.hypot(player.x - goat.position.x, player.y - goat.position.y);
  if (goat.disposition !== 'aggressive') {
    return { goat: { ...goat, state: 'idle', attackCooldown: cooldown, hurtTimer: 0, moving: false, attacking: false, fleeing: false }, attackHit: false };
  }
  // Common sense: don't pick fights you can't win. An unprovoked creature
  // won't start a fight with a foe far above its own level — it holds still
  // instead of suiciding. Hitting it first (provoked) overrides this.
  const selfLevel = goat.level ?? 1;
  const threatLevel = goat.threatLevel;
  if (!goat.provoked && threatLevel !== undefined && threatLevel > selfLevel + GOAT_OUTMATCHED_LEVEL_GAP) {
    return { goat: { ...goat, state: 'idle', attackCooldown: cooldown, hurtTimer: 0, moving: false, attacking: false, fleeing: false }, attackHit: false };
  }

  const facing = getDirection(goat.position, player);
  // BUILD 934: per-kind flee threshold + capability (defaults preserve
  // the old global 0.3 / always-flee behavior for callers without a
  // behavior block). Fleeing keeps disposition aggressive so the
  // creature stays targetable and killable; the home-range clamp stops
  // the flight at the roam edge, so flight can never strand a quest.
  const fleeRatio = opts?.behavior?.fleeHpRatio ?? GOAT_FLEE_HP_RATIO;
  const canFlee = opts?.behavior?.canFlee ?? true;
  const lowHealth = canFlee && goat.hp / Math.max(1, goat.maxHp) <= fleeRatio;
  if (lowHealth) {
    const fled = moveAwayFrom(goat.position, player, opts?.fleeSpeed ?? GOAT_FLEE_SPEED, deltaMs);
    const clamped = clampToHomeRange(fled, goat.spawnPosition, goat.roamRadius);
    const { position, moved } = resolveCollisionMove(goat.position, clamped, opts?.isBlocked);
    return { goat: { ...goat, position, state: 'chase', attackCooldown: cooldown, hurtTimer: 0, facing: getDirection(player, position), moving: moved, attacking: false, fleeing: true }, attackHit: false };
  }
  // BUILD 943: aggro immunity — an unengaged creature that must not
  // engage (a sneak-blind kind facing a sneaking player) holds idle.
  // Engaged creatures (chase/attack) are never suppressed: a held
  // engagement is never dropped by an immunity, mirroring the 933
  // sneak rule. This sits AFTER the flee branch, so a fleeing creature
  // still flees under suppression, and only ever gates
  // idle-to-chase/attack transitions (hurt/dead returned above).
  if (opts?.suppressEngagement && (goat.state === 'idle' || goat.state === 'hurt')) {
    return { goat: { ...goat, state: 'idle', attackCooldown: cooldown, hurtTimer: 0, moving: false, attacking: false, fleeing: false }, attackHit: false };
  }
  if (goat.state === 'attack') {
    const attackTimer = goat.attackTimer - deltaMs;
    if (attackTimer <= 0 && !goat.attackHitApplied) {
      const attackHit = isAdjacentAndFacing(goat.position, player, facing, playerFacing, GOAT_MELEE_RANGE);
      return { goat: { ...goat, state: 'chase', attackTimer: 0, attackHitApplied: true, attackCooldown: GOAT_ATTACK_COOLDOWN_MS, attacking: false, moving: false, fleeing: false }, attackHit };
    }
    return { goat: { ...goat, attackTimer, attackCooldown: cooldown, attacking: attackTimer > 0, moving: false, fleeing: false }, attackHit: false };
  }
  const canStartAttack = cooldown <= 0 && isAdjacentAndFacing(goat.position, player, facing, playerFacing, GOAT_MELEE_RANGE);
  if (canStartAttack) return { goat: { ...goat, state: 'attack', attackTimer: GOAT_ATTACK_WINDUP_MS, attackHitApplied: false, attackCooldown: 0, facing, attacking: true, moving: false, fleeing: false }, attackHit: false };
  if (distance <= (opts?.chaseRange ?? GOAT_CHASE_RANGE)) {
    // Give up the chase when the player lures the goat out of its territory.
    if (shouldReturnHome(goat, player) && goat.spawnPosition) {
      const homePosition = moveTowards(goat.position, goat.spawnPosition, opts?.chaseSpeed ?? GOAT_CHASE_SPEED, deltaMs);
      const clamped = clampToHomeRange(homePosition, goat.spawnPosition, goat.roamRadius);
      const { position, moved } = resolveCollisionMove(goat.position, clamped, opts?.isBlocked);
      return { goat: { ...goat, position, state: 'idle', attackCooldown: cooldown, hurtTimer: 0, facing: getDirection(position, goat.spawnPosition), moving: moved, attacking: false, fleeing: false }, attackHit: false };
    }
    // BUILD 934: staticattack — a won stand roll holds ground this
    // frame instead of stepping. Buckets rotate every 500ms (the caller
    // hashes key + bucket), so a high-stand creature still advances in
    // expectation and can never stall forever. The attack check above
    // runs before movement, so standing never costs a landed hit.
    if (opts?.behavior?.stand === true) {
      return { goat: { ...goat, state: 'chase', attackCooldown: cooldown, hurtTimer: 0, facing, moving: false, attacking: false, fleeing: false }, attackHit: false };
    }
    const separation = goats.reduce((force, other) => {
      if (other === goat) return force;
      const dx = goat.position.x - other.position.x;
      const dy = goat.position.y - other.position.y;
      const d = Math.hypot(dx, dy);
      return d > 0 && d < 6 ? { x: force.x + dx / d * (6 - d), y: force.y + dy / d * (6 - d) } : force;
    }, { x: 0, y: 0 });
    const chasedPosition = moveTowards(goat.position, player, opts?.chaseSpeed ?? GOAT_CHASE_SPEED, deltaMs, separation);
    const rangedPosition = clampToHomeRange(chasedPosition, goat.spawnPosition, goat.roamRadius);
    // BUILD 934: preferred fight range for this target (player targets
    // only — callers leave it undefined for NPC targets so the 1.6
    // retaliation standoff from BUILD 915 still applies there). A
    // ranged creature pushed inside its band steps back out to it;
    // a melee creature keeps the old 4-unit ring exactly.
    const desired = keepMeleeDistance(rangedPosition, player, playerFacing, opts?.behavior?.preferredRange ?? opts?.meleeStandOff ?? GOAT_MELEE_RANGE);
    const { position, moved } = resolveCollisionMove(goat.position, desired, opts?.isBlocked);
    return { goat: { ...goat, position, state: 'chase', attackCooldown: cooldown, hurtTimer: 0, facing: getDirection(position, player), moving: moved, attacking: false, fleeing: false }, attackHit: false };
  }
  return { goat: { ...goat, state: 'idle', attackCooldown: cooldown, hurtTimer: 0, moving: false, attacking: false, fleeing: false }, attackHit: false };
}
