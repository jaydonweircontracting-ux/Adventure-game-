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
  const size = 5.5;
  const reach = 5.2;
  const center = { x: origin.x + (direction === 'right' ? reach : direction === 'left' ? -reach : 0), y: origin.y + (direction === 'down' ? reach : direction === 'up' ? -reach : 0) };
  return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size };
}

export function entityRect(center: CombatPoint, size = 4.5): CombatRect {
  return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size };
}

export function isEntityInHitbox(entity: CombatPoint, hitbox: CombatRect): boolean {
  const target = entityRect(entity);
  return target.x < hitbox.x + hitbox.width && target.x + target.width > hitbox.x && target.y < hitbox.y + hitbox.height && target.y + target.height > hitbox.y;
}
