export type CombatDirection = 'up' | 'down' | 'left' | 'right';
export type CombatPoint = { x: number; y: number };
export type CombatRect = { x: number; y: number; width: number; height: number };

export const COMBAT_ADJACENT_RANGE = 5;
export const COMBAT_ATTACK_LANE = 3;

export function getDirection(from: CombatPoint, to: CombatPoint): CombatDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
}

export function isAdjacentTarget(from: CombatPoint, to: CombatPoint, range = COMBAT_ADJACENT_RANGE): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const direction = getDirection(from, to);
  const lateralDistance = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);
  return Math.hypot(dx, dy) <= range && lateralDistance <= COMBAT_ATTACK_LANE;
}

export function isAdjacentAndFacing(attacker: CombatPoint, target: CombatPoint, attackerFacing: CombatDirection, targetFacing: CombatDirection, range = COMBAT_ADJACENT_RANGE): boolean {
  return isAdjacentTarget(attacker, target, range)
    && getDirection(attacker, target) === attackerFacing
    && getDirection(target, attacker) === targetFacing;
}

export function getAttackHitbox(origin: CombatPoint, direction: CombatDirection): CombatRect {
  // Match the full visible goat sprite and keep contact forgiving at field scale.
  const size = 5.5;
  const reach = 3.2;
  const center = { x: origin.x + (direction === 'right' ? reach : direction === 'left' ? -reach : 0), y: origin.y + (direction === 'down' ? reach : direction === 'up' ? -reach : 0) };
  return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size };
}

export function entityRect(center: CombatPoint, size = 3.2): CombatRect {
  return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size };
}

export function isEntityInHitbox(entity: CombatPoint, hitbox: CombatRect): boolean {
  const target = entityRect(entity);
  return target.x < hitbox.x + hitbox.width && target.x + target.width > hitbox.x && target.y < hitbox.y + hitbox.height && target.y + target.height > hitbox.y;
}

// Player swing reach: melee means melee — the player must be right up against
// the target for the swing to connect, so hits look and feel like contact.
export const PLAYER_MELEE_REACH = 3.8;
// The character sprite occupies roughly 3.2 world units. Treat that body area
// as the target hurtbox, but keep the weapon's swing lane narrow so a swing
// cannot connect with a target well to the side or several steps away.
export const PLAYER_MELEE_BEHIND_TOLERANCE = 0.45;
const MELEE_TARGET_HALF_SIZE = 1.6;
const MELEE_SWING_HALF_WIDTH = 1.15;

export function isInMeleeArc(attacker: CombatPoint, target: CombatPoint, facing: CombatDirection, reach = PLAYER_MELEE_REACH): boolean {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const forward = facing === 'right' ? dx : facing === 'left' ? -dx : facing === 'down' ? dy : -dy;
  const lateral = facing === 'left' || facing === 'right' ? Math.abs(dy) : Math.abs(dx);
  // Collision is against the visible target sprite's approximate body bounds,
  // intersected with a short rectangular weapon hitbox in front of the player.
  // This makes a hit correspond to contact with the character, not a broad
  // invisible circle around the attacker.
  return forward >= -PLAYER_MELEE_BEHIND_TOLERANCE
    && forward <= reach + MELEE_TARGET_HALF_SIZE
    && lateral <= MELEE_SWING_HALF_WIDTH + MELEE_TARGET_HALF_SIZE;
}

// Line-of-sight trace (FOnline-style TraceLine): does solid geometry block
// the straight line from `from` to `to`? Samples interior points along the
// segment and returns true if any sample is blocked. Endpoints are excluded:
// the attacker's and target's own positions are validated separately, so a
// target standing against a wall is still hittable.
export function traceLineBlocked(from: CombatPoint, to: CombatPoint, isBlocked: (pos: CombatPoint) => boolean, step = 0.5): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return false;
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isBlocked({ x: from.x + dx * t, y: from.y + dy * t })) return true;
  }
  return false;
}
