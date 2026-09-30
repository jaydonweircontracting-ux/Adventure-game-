// Pokémon-style talk targeting: pure selection logic for the Talk button.
// Given the player's position/facing and the talkable NPCs nearby, picks the
// nearest NPC that is in front of the player (or very close in any direction).
// Rendering and dialogue handlers live in App.tsx; this module stays pure so
// the selection rules are unit-testable.

export type TalkPoint = { x: number; y: number };
export type TalkFacing = 'up' | 'down' | 'left' | 'right';

export interface TalkCandidate {
  name: string;
  position: TalkPoint;
}

/** Max distance (field units) at which the Talk button appears. */
export const TALK_RANGE = 9;
/** Within this distance the NPC counts as "stood next to" — facing ignored. */
export const TALK_CLOSE_RANGE = 2.5;
/** Minimum facing dot product for NPCs beyond close range. */
export const TALK_FACING_DOT = 0.3;

const FACING_VECTORS: Record<TalkFacing, TalkPoint> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function findTalkTarget<T extends TalkCandidate>(
  candidates: T[],
  player: TalkPoint,
  facing: TalkFacing,
): T | null {
  const fv = FACING_VECTORS[facing];
  let best: T | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dx = c.position.x - player.x;
    const dy = c.position.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > TALK_RANGE) continue;
    if (dist > TALK_CLOSE_RANGE) {
      const dot = (dx * fv.x + dy * fv.y) / (dist || 1);
      if (dot < TALK_FACING_DOT) continue;
    }
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}
