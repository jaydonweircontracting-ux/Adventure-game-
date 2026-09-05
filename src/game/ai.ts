import { getDirection, isAdjacentAndFacing, type CombatDirection, type CombatPoint } from './combat';

export type GoatAIState = 'idle' | 'chase' | 'attack' | 'hurt' | 'die';
export type GoatAIEntity = { position: CombatPoint; facing: CombatDirection; state: GoatAIState; disposition: 'calm' | 'aggressive' | 'defeated'; hp: number; maxHp: number; attackCooldown: number; attackTimer: number; attackHitApplied: boolean; hurtTimer: number; moving: boolean; attacking: boolean };
export const GOAT_CHASE_RANGE = 24;
export const GOAT_MELEE_RANGE = 5;
export const GOAT_CHASE_SPEED = 10;
export const GOAT_FLEE_HP_RATIO = 0.3;
export const GOAT_FLEE_SPEED = 12;
export const GOAT_ATTACK_WINDUP_MS = 100;
export const GOAT_ATTACK_COOLDOWN_MS = 1000;

export function moveTowards(from: CombatPoint, to: CombatPoint, speed: number, deltaMs: number, separation: CombatPoint = { x: 0, y: 0 }): CombatPoint {
  const dx = to.x - from.x + separation.x;
  const dy = to.y - from.y + separation.y;
  const distance = Math.hypot(dx, dy) || 1;
  const step = speed * deltaMs / 1000;
  return { x: from.x + dx / distance * Math.min(step, distance), y: from.y + dy / distance * Math.min(step, distance) };
}

function moveAwayFrom(from: CombatPoint, threat: CombatPoint, speed: number, deltaMs: number) {
  const dx = from.x - threat.x;
  const dy = from.y - threat.y;
  const distance = Math.hypot(dx, dy) || 1;
  const step = speed * deltaMs / 1000;
  return { x: from.x + (dx / distance) * Math.min(step, distance), y: from.y + (dy / distance) * Math.min(step, distance) };
}

// Keep hostile goats one melee tile away so they can attack without occupying
// the player's position or overlapping the player sprite.
function keepMeleeDistance(position: CombatPoint, player: CombatPoint, playerFacing: CombatDirection): CombatPoint {
  const dx = position.x - player.x;
  const dy = position.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= GOAT_MELEE_RANGE) return position;
  if (distance === 0) {
    const facingOffset: Record<CombatDirection, CombatPoint> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const offset = facingOffset[playerFacing];
    return { x: player.x + offset.x * GOAT_MELEE_RANGE, y: player.y + offset.y * GOAT_MELEE_RANGE };
  }
  const scale = GOAT_MELEE_RANGE / distance;
  return { x: player.x + dx * scale, y: player.y + dy * scale };
}

export function updateGoat(goat: GoatAIEntity, player: CombatPoint, playerFacing: CombatDirection, goats: GoatAIEntity[], deltaMs: number): { goat: GoatAIEntity; attackHit: boolean } {
  const cooldown = Math.max(0, goat.attackCooldown - deltaMs);
  const hurtTimer = Math.max(0, goat.hurtTimer - deltaMs);
  if (goat.disposition === 'defeated') return { goat: { ...goat, state: 'die', moving: false, attacking: false, attackCooldown: cooldown, hurtTimer }, attackHit: false };
  if (goat.state === 'hurt' && hurtTimer > 0) return { goat: { ...goat, hurtTimer, attackCooldown: cooldown, moving: false, attacking: false }, attackHit: false };

  const distance = Math.hypot(player.x - goat.position.x, player.y - goat.position.y);
  if (goat.disposition !== 'aggressive') {
    return { goat: { ...goat, state: 'idle', attackCooldown: cooldown, hurtTimer: 0, moving: false, attacking: false }, attackHit: false };
  }

  const facing = goat.facing;
  const lowHealth = goat.hp / Math.max(1, goat.maxHp) <= GOAT_FLEE_HP_RATIO;
  if (lowHealth) {
    const position = moveAwayFrom(goat.position, player, GOAT_FLEE_SPEED, deltaMs);
    return { goat: { ...goat, position, state: 'chase', attackCooldown: cooldown, hurtTimer: 0, facing: getDirection(player, position), moving: true, attacking: false }, attackHit: false };
  }
  if (goat.state === 'attack') {
    const attackTimer = goat.attackTimer - deltaMs;
    if (attackTimer <= 0 && !goat.attackHitApplied) {
      const attackHit = isAdjacentAndFacing(goat.position, player, facing, playerFacing);
      return { goat: { ...goat, state: 'chase', attackTimer: 0, attackHitApplied: true, attackCooldown: GOAT_ATTACK_COOLDOWN_MS, attacking: false, moving: false }, attackHit };
    }
    return { goat: { ...goat, attackTimer, attackCooldown: cooldown, attacking: attackTimer > 0, moving: false }, attackHit: false };
  }
  const canStartAttack = cooldown <= 0 && isAdjacentAndFacing(goat.position, player, facing, playerFacing);
  if (canStartAttack) return { goat: { ...goat, state: 'attack', attackTimer: GOAT_ATTACK_WINDUP_MS, attackHitApplied: false, attackCooldown: 0, facing, attacking: true, moving: false }, attackHit: false };
  if (distance <= GOAT_CHASE_RANGE) {
    const separation = goats.reduce((force, other) => {
      if (other === goat) return force;
      const dx = goat.position.x - other.position.x;
      const dy = goat.position.y - other.position.y;
      const d = Math.hypot(dx, dy);
      return d > 0 && d < 6 ? { x: force.x + dx / d * (6 - d), y: force.y + dy / d * (6 - d) } : force;
    }, { x: 0, y: 0 });
    const chasedPosition = moveTowards(goat.position, player, GOAT_CHASE_SPEED, deltaMs, separation);
    const position = keepMeleeDistance(chasedPosition, player, playerFacing);
    return { goat: { ...goat, position, state: 'chase', attackCooldown: cooldown, hurtTimer: 0, facing: getDirection(position, player), moving: true, attacking: false }, attackHit: false };
  }
  return { goat: { ...goat, state: 'idle', attackCooldown: cooldown, hurtTimer: 0, moving: false, attacking: false }, attackHit: false };
}
