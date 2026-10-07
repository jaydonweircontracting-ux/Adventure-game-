// Field collision helpers (BUILD 375 — extracted from App.tsx).
//
// Pure geometry for the 2D field: entity overlap tests and separation.
// Structural types only — no dependency on App's local types.

export type Vec = { x: number; y: number };
export type CollisionBox = { halfWidth: number; halfHeight: number };

export const PLAYER_COLLISION_BOX: CollisionBox = { halfWidth: 3.6, halfHeight: 2.7 };
export const GOAT_COLLISION_BOX: CollisionBox = { halfWidth: 0.5, halfHeight: 0.6 };
// BUILD 459: per-critter collision boxes. Deer (male) is smaller as requested.
export const CRITTER_COLLISION_BOXES: Record<string, CollisionBox> = {
  deer: { halfWidth: 0.35, halfHeight: 0.4 },
  boar: { halfWidth: 0.4, halfHeight: 0.45 },
  badger: { halfWidth: 0.3, halfHeight: 0.35 },
  direwolf: { halfWidth: 0.45, halfHeight: 0.5 },
};
export function critterCollisionBox(kind: string): CollisionBox {
  return CRITTER_COLLISION_BOXES[kind] || GOAT_COLLISION_BOX;
}
export const COLLISION_GAP = 0.35;

export function collisionBoxesOverlap(a: Vec, aBox: CollisionBox, b: Vec, bBox: CollisionBox): boolean {
  return Math.abs(a.x - b.x) < aBox.halfWidth + bBox.halfWidth + COLLISION_GAP
    && Math.abs(a.y - b.y) < aBox.halfHeight + bBox.halfHeight + COLLISION_GAP;
}

type GoatLike = { position: Vec; disposition: string; kind?: string };

export function isPositionOccupiedByGoat(position: Vec, goats: GoatLike[]): boolean {
  return goats.some((goat) => goat.disposition !== 'defeated' && collisionBoxesOverlap(position, PLAYER_COLLISION_BOX, goat.position, critterCollisionBox(goat.kind || 'deer')));
}

/** Push-apart resolution for a goat overlapping the player; null when clear. */
export function separateGoatFromPlayer(goatPosition: Vec, playerPosition: Vec, kind?: string): Vec | null {
  const box = critterCollisionBox(kind || 'deer');
  const minimumX = PLAYER_COLLISION_BOX.halfWidth + box.halfWidth + COLLISION_GAP;
  const minimumY = PLAYER_COLLISION_BOX.halfHeight + box.halfHeight + COLLISION_GAP;
  const dx = goatPosition.x - playerPosition.x;
  const dy = goatPosition.y - playerPosition.y;
  const overlapX = minimumX - Math.abs(dx);
  const overlapY = minimumY - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return null;
  if (overlapX <= overlapY) {
    return { x: playerPosition.x + (dx >= 0 ? minimumX : -minimumX), y: goatPosition.y };
  }
  return { x: goatPosition.x, y: playerPosition.y + (dy >= 0 ? minimumY : -minimumY) };
}
