export type CombatDirection = 'up' | 'down' | 'left' | 'right';
export type CombatPoint = { x: number; y: number };
export type CombatRect = { x: number; y: number; width: number; height: number };
export function getDirection(from: CombatPoint, to: CombatPoint): CombatDirection { const dx = to.x - from.x; const dy = to.y - from.y; return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'); }
export function getAttackHitbox(origin: CombatPoint, direction: CombatDirection): CombatRect { const size = 5.5; const reach = 5.2; const center = { x: origin.x + (direction === 'right' ? reach : direction === 'left' ? -reach : 0), y: origin.y + (direction === 'down' ? reach : direction === 'up' ? -reach : 0) }; return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size }; }
export function entityRect(center: CombatPoint, size = 4.5): CombatRect { return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size }; }
export function isEntityInHitbox(entity: CombatPoint, hitbox: CombatRect): boolean { const target = entityRect(entity); return target.x < hitbox.x + hitbox.width && target.x + target.width > hitbox.x && target.y < hitbox.y + hitbox.height && target.y + target.height > hitbox.y; }
