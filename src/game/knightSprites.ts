/**
 * Knight sprite strips (BUILD 962).
 *
 * Source: the user's "2D HD Character Knight" pack (29 HD sheets, each
 * 1920x1024 = 15 columns x 8 rows of 128px cells, one direction per row,
 * one animation frame per column, "With shadows" variants only).
 * NO license file ships in that zip — no terms claimed; the fact is
 * recorded in the build note.
 *
 * Direction rows, measured by eye from enlarged Idle/Walk frames
 * (shield arm + body orientation), NOT guessed from a grid:
 *   source row 1 -> down  (torso square to camera, shield on viewer's right)
 *   source row 2 -> left  (side profile, shield leading to viewer's left)
 *   source row 6 -> right (side profile, shield trailing behind)
 *   source row 5 -> up    (back to camera, shield on viewer's left)
 * The other four source rows are the diagonals. They are NOT shipped:
 * the game only ever faces monsters in 4 directions, and the existing
 * monster-sheet convention falls back to the down row for diagonal
 * camera angles (IsoFieldView: facingRows[diagonal] ?? down) — the
 * knight follows that exact rule, so no diagonal is ever mislabeled.
 *
 * Shipped strips (scripts/make-knight-strips.py, 128px -> 64px cells):
 * one PNG per wired animation, 15 columns x 4 rows (down/left/right/up).
 * Wired animations: idle, walk, attack (Melee), hurt (TakeDamage),
 * death (Die). Run is NOT wired: monsters have no run state — moving
 * maps to walk, exactly like every sheet kind — so no Run strip ships.
 * The baked shadow in each source cell is kept (the renderer draws no
 * extra shadow ellipse for the knight: shadow alpha 0).
 *
 * Frame timing mirrors the goblin sheet convention (idle 450ms, walk
 * 140ms, attack 110ms, hurt 120ms, death 130ms); death cycles like
 * every sheet kind's death anim (monsterAnimFrameFor modulo).
 */
export type KnightAnim = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';

export const KNIGHT_CELL = 64;
export const KNIGHT_FRAMES = 15;
/** Strip row order: [down, left, right, up]. */
export const KNIGHT_STRIP_ROWS = ['down', 'left', 'right', 'up'] as const;

export const KNIGHT_STRIP_PATHS: Record<KnightAnim, string> = {
  idle: '/sprites/knight/knight-idle.png',
  walk: '/sprites/knight/knight-walk.png',
  attack: '/sprites/knight/knight-attack.png',
  hurt: '/sprites/knight/knight-hurt.png',
  death: '/sprites/knight/knight-death.png',
};

export const KNIGHT_FRAME_MS: Record<KnightAnim, number> = {
  idle: 450,
  walk: 140,
  attack: 110,
  hurt: 120,
  death: 130,
};

/** Displayed container size in px (goblin sheets use 36; the armored knight reads slightly larger). */
export const KNIGHT_DISPLAY_SIZE = 44;
/** Anchor matching the goblin convention (center-based entity anchor). */
export const KNIGHT_ANCHOR = { x: 0.5, y: 0.6 };

/**
 * Strip row for a monster facing. Cardinals map to their row; anything
 * else (diagonal camera angles) falls back to down — the same rule the
 * sheet system applies via facingRows[diagonal] ?? down.
 */
export function knightStripRowForFacing(facing: string | undefined): number {
  switch ((facing || 'down').toLowerCase()) {
    case 'left': return 1;
    case 'right': return 2;
    case 'up': return 3;
    case 'down':
    default: return 0;
  }
}

/** Frame column for an animation at a moment in time (phase per monster id). */
export function knightFrameFor(anim: KnightAnim, nowMs: number, monsterId: number): number {
  const offset = Math.abs(Math.floor(monsterId)) % 1000;
  const frame = Math.floor((nowMs + offset) / Math.max(1, KNIGHT_FRAME_MS[anim])) % KNIGHT_FRAMES;
  return frame;
}
