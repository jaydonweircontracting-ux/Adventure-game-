// NPC entrance (BUILD 306): NPCs never just pop into view — when one is first
// seen on the player's chunk it slides in from the chunk edge it came from,
// based on its facing. Pure helpers so scripts/simulate.ts can unit-test them.

export type NpcFacing = 'up' | 'down' | 'left' | 'right';
export type NpcPoint = { x: number; y: number };

// Field size in world units (must match FIELD_SIZE in App.tsx).
const FIELD = 280;
// Start slightly off the field so the NPC walks fully into view.
const OFF = 6;

/** Dominant-axis facing for a movement delta. */
export function facingForDelta(dx: number, dy: number): NpcFacing {
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
}

/**
 * The point just off the chunk edge the NPC walked in from, given where it
 * is now and which way it faces. Facing 'right' means it came from the west
 * edge, etc.
 */
export function npcEntryPoint(position: NpcPoint, facing: NpcFacing): NpcPoint {
  switch (facing) {
    case 'right': return { x: -OFF, y: position.y };
    case 'left': return { x: FIELD + OFF, y: position.y };
    case 'down': return { x: position.x, y: -OFF };
    case 'up': return { x: position.x, y: FIELD + OFF };
  }
}
