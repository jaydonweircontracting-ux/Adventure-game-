import type { CombatDirection, CombatPoint } from './combat';
export type GoatAIState = 'idle' | 'chase' | 'attack' | 'hurt' | 'die';
export type GoatAIEntity = { position: CombatPoint; facing: CombatDirection; state: GoatAIState; disposition: 'calm' | 'aggressive' | 'defeated'; hp: number; maxHp: number; attackCooldown: number; attackTimer: number; attackHitApplied: boolean; hurtTimer: number; moving: boolean; attacking: boolean };
export const GOAT_CHASE_RANGE = 24;
export const GOAT_MELEE_RANGE = 6.5;
export const GOAT_CHASE_SPEED = 18;
export const GOAT_FLEE_HP_RATIO = 0.3;
export const GOAT_FLEE_SPEED = 24;
export const GOAT_ATTACK_WINDUP_MS = 100;
export const GOAT_ATTACK_COOLDOWN_MS = 1000;
export function moveTowards(from: CombatPoint, to: CombatPoint, speed: number, deltaMs: number, separation: CombatPoint = { x: 0, y: 0 }): CombatPoint { const dx = to.x - from.x + separation.x; const dy = to.y - from.y + separation.y; const distance = Math.hypot(dx, dy) || 1; const step = speed * deltaMs / 1000; return { x: from.x + dx / distance * Math.min(step, distance), y: from.y + dy / distance * Math.min(step, distance) }; }
function moveAwayFrom(from: CombatPoint, threat: CombatPoint, speed: number, deltaMs: number) {
  const dx = from.x - threat.x;
  const dy = from.y - threat.y;
  const distance = Math.hypot(dx, dy) || 1;
  const step = speed * deltaMs / 1000;
  return {
    x: from.x + (dx / distance) * Math.min(step, distance),
    y: from.y + (dy / distance) * Math.min(step, distance),
  };
}
export function updateGoat(goat: GoatAIEntity, player: CombatPoint, goats: GoatAIEntity[], deltaMs: number): { goat: GoatAIEntity; attackHit: boolean } {
  const cooldown = Math.max(0, goat.attackCooldown - deltaMs);
  const hurtTimer = Math.max(0, goat.hurtTimer - deltaMs);
  if (goat.disposition === 'defeated') return { goat: { ...goat, state: 'die', moving: false, attacking: false, attackCooldown: cooldown, hurtTimer }, attackHit: false };
  if (goat.state === 'hurt' && hurtTimer > 0) return { goat: { ...goat, hurtTimer, attackCooldown: cooldown, moving: false, attacking: false }, attackHit: false };
  if (goat.disposition !== 'aggressive') return { goat: { ...goat, state: 'idle', attackCooldown: cooldown, hurtTimer: 0, moving: false, attacking: false }, attackHit: false };

  const distance = Math.hypot(player.x - goat.position.x, player.y - goat.position.y);
  const facing = getDirection(goat.position, player);
  const lowHealth = goat.hp / Math.max(1, goat.maxHp) <= GOAT_FLEE_HP_RATIO;
  if (lowHealth) {
    const position = moveAwayFrom(goat.position, player, GOAT_FLEE_SPEED, deltaMs);
    return { goat: { ...goat, position, state: 'chase', attackCooldown: cooldown, hurtTimer: 0, facing: getDirection(player, position), moving: true, attacking: false }, attackHit: false };
  }
  if (goat.state === 'attack') {
    const attackTimer = goat.attackTimer - deltaMs;
    if (attackTimer <= 0 && !goat.attackHitApplied) return { goat: { ...goat, state: 'chase', attackTimer: 0, attackHitApplied: true, attackCooldown: GOAT_ATTACK_COOLDOWN_MS, attacking: false, moving: false, facing }, attackHit: true };
    return { goat: { ...goat, attackTimer, attackCooldown: cooldown, facing, attacking: true, moving: false }, attackHit: false };
  }
  if (distance <= GOAT_MELEE_RANGE && cooldown <= 0) return { goat: { ...goat, state: 'attack', attackTimer: GOAT_ATTACK_WINDUP_MS, attackHitApplied: false, attackCooldown: 0, facing, attacking: true, moving: false }, attackHit: false };
  if (distance <= GOAT_CHASE_RANGE) {
    const separation = goats.reduce((force, other) => {
      if (other === goat) return force;
      const dx = goat.position.x - other.position.x;
      const dy = goat.position.y - other.position.y;
      const d = Math.hypot(dx, dy);
      return d > 0 && d < 6 ? { x: force.x + dx / d * (6 - d), y: force.y + dy / d * (6 - d) } : force;
    }, { x: 0, y: 0 });
    return { goat: { ...goat, position: moveTowards(goat.position, player, GOAT_CHASE_SPEED, deltaMs, separation), state: 'chase', attackCooldown: cooldown, hurtTimer: 0, facing, moving: true, attacking: false }, attackHit: false };
  }
  return { goat: { ...goat, state: 'idle', attackCooldown: cooldown, hurtTimer: 0, facing, moving: false, attacking: false }, attackHit: false };
}
function getDirection(from: CombatPoint, to: CombatPoint): CombatDirection { const dx = to.x - from.x; const dy = to.y - from.y; return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'); }
