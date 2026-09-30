/**
 * Monster sprite system — definitions, lookup, and frame helpers.
 *
 * Every monster with a generated sprite sheet has a JSON definition in this
 * directory (see scripts/write-monster-sprite-defs.py). The sheet grid
 * convention is shared by all monsters:
 *   8 cols x 5 rows of 64px cells
 *   rows 0-3: facings down/left/right/up — cols 0-1 idle, 2-5 walk, 6-7 attack
 *   row 4:    cols 0-1 hurt, cols 2-5 death
 *
 * To reskin a monster, replace its PNG with a sheet that follows the same
 * grid — no renderer changes needed. To add a monster, add its JSON + PNG
 * and register it in MONSTER_SPRITE_DEFS.
 */
import bat from './bat.json';
import goblin from './goblin.json';
import orc from './orc.json';
import rat from './rat.json';
import skeleton from './skeleton.json';
import slime from './slime.json';
import spider from './spider.json';
import troll from './troll.json';
import wolf from './wolf.json';

export interface MonsterAnimDef {
  /** 'facing' = the row for the monster's current facing; otherwise a row index. */
  row: 'facing' | number;
  startCol: number;
  frames: number;
  /** Milliseconds per frame. */
  frameMs: number;
}

export interface MonsterSpriteDef {
  id: string;
  spriteSheet: string;
  cell: number;
  cols: number;
  rows: number;
  facingRows: Record<string, number>;
  animations: Record<'idle' | 'walk' | 'attack' | 'hurt' | 'death', MonsterAnimDef>;
  /** Displayed container size in px (one cell scaled to this). */
  displaySize: number;
  /** Anchor as a fraction of the cell; matches the existing center-based entity anchor. */
  anchor: { x: number; y: number };
  shadow: { dx: number; dy: number; alpha: number };
  /** Collision footprint in tiles (informational; combat stays distance-based). */
  collision: { w: number; h: number };
  variants: Record<string, { filter?: string; scale?: number }>;
  biomes: string[];
  minDanger: number;
}

const DEFS: Record<string, MonsterSpriteDef> = {
  bat: bat as MonsterSpriteDef,
  goblin: goblin as MonsterSpriteDef,
  orc: orc as MonsterSpriteDef,
  rat: rat as MonsterSpriteDef,
  skeleton: skeleton as MonsterSpriteDef,
  slime: slime as MonsterSpriteDef,
  spider: spider as MonsterSpriteDef,
  troll: troll as MonsterSpriteDef,
  wolf: wolf as MonsterSpriteDef,
};

/** Monster kinds that use the generated sprite-sheet system. */
export const SHEET_KINDS: string[] = Object.keys(DEFS);

/** Sprite definition for a monster kind, or undefined for legacy-sprite kinds. */
export function spriteDefFor(kind: string): MonsterSpriteDef | undefined {
  return DEFS[kind];
}

export type MonsterAnim = keyof MonsterSpriteDef['animations'];

/**
 * Resolve the grid column for an animation at a moment in time.
 * Pure and deterministic — used for the marker-mode debug label so the
 * displayed frame matches what the CSS animation is showing.
 */
export function monsterAnimFrameFor(
  def: MonsterSpriteDef,
  anim: MonsterAnim,
  nowMs: number,
  seed: number,
): number {
  const a = def.animations[anim];
  const offset = Math.abs(Math.floor(seed)) % 1000;
  const frame = Math.floor((nowMs + offset) / Math.max(1, a.frameMs)) % Math.max(1, a.frames);
  return a.startCol + frame;
}

/** Pick the animation bucket for a monster's combat state. */
export function animForMonsterState(opts: {
  dead: boolean;
  hitFlash: boolean;
  attacking: boolean;
  moving: boolean;
}): MonsterAnim {
  if (opts.dead) return 'death';
  if (opts.hitFlash) return 'hurt';
  if (opts.attacking) return 'attack';
  if (opts.moving) return 'walk';
  return 'idle';
}
