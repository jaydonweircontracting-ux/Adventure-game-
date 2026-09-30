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

/** Kinds with legacy hand-built CSS sprites (NOT part of the sheet system). */
const LEGACY_KINDS: ReadonlySet<string> = new Set(['bandit', 'snake', 'dragon', 'soldier']);

/** Same-category siblings, used when a kind's own def is invalid. */
const SPRITE_CATEGORIES: Record<string, string[]> = {
  humanoid: ['goblin', 'skeleton', 'orc', 'troll'],
  beast: ['wolf', 'bat', 'rat'],
  crawler: ['spider', 'slime'],
};

function categoryOf(kind: string): string | undefined {
  for (const [category, kinds] of Object.entries(SPRITE_CATEGORIES)) {
    if (kinds.includes(kind)) return category;
  }
  return undefined;
}

/** The generic humanoid everything unknown falls back to. Never remap this. */
export const GENERIC_HUMANOID_KIND = 'goblin';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidAnim(value: unknown): value is MonsterAnimDef {
  if (!isRecord(value)) return false;
  const row = value['row'];
  return (row === 'facing' || typeof row === 'number')
    && typeof value['startCol'] === 'number' && (value['startCol'] as number) >= 0
    && typeof value['frames'] === 'number' && (value['frames'] as number) >= 1
    && typeof value['frameMs'] === 'number' && (value['frameMs'] as number) >= 1;
}

/** Structural validation: dimensions, facings, and all animation buckets. */
export function isValidMonsterSpriteDef(def: unknown): def is MonsterSpriteDef {
  if (!isRecord(def)) return false;
  if (typeof def['id'] !== 'string' || !(def['id'] as string)) return false;
  if (typeof def['spriteSheet'] !== 'string' || !(def['spriteSheet'] as string)) return false;
  for (const key of ['cell', 'cols', 'rows', 'displaySize']) {
    if (typeof def[key] !== 'number' || (def[key] as number) <= 0) return false;
  }
  const facingRows = def['facingRows'];
  if (!isRecord(facingRows)) return false;
  for (const facing of ['down', 'left', 'right', 'up']) {
    if (typeof facingRows[facing] !== 'number') return false;
  }
  const animations = def['animations'];
  if (!isRecord(animations)) return false;
  // idle must be valid — it is the per-component fallback for broken buckets.
  if (!isValidAnim(animations['idle'])) return false;
  return true;
}

/** Repair one def: broken animation buckets fall back to idle (per-component, not per-NPC). */
function repairedDef(kind: string, def: MonsterSpriteDef): { def: MonsterSpriteDef; repaired: string[] } {
  const repaired: string[] = [];
  const animations = { ...def.animations };
  for (const key of ['walk', 'attack', 'hurt', 'death'] as const) {
    if (!isValidAnim(animations[key])) {
      animations[key] = animations['idle'];
      repaired.push(key);
    }
  }
  return repaired.length ? { def: { ...def, animations }, repaired } : { def, repaired };
}

export interface MonsterSpriteResolution {
  /** Effective kind whose CSS classes the renderer should use. */
  kind: string;
  /** Validated (and repaired) def, or undefined for legacy-sprite kinds. */
  def: MonsterSpriteDef | undefined;
  /** 0 = requested asset; higher = deeper in the fallback chain. */
  fallbackLevel: number;
  /** Why we fell back (dev logging only). */
  reason?: string;
}

/** Permanent per-session cache — a resolved sprite never changes mid-session. */
const RESOLUTION_CACHE: Map<string, MonsterSpriteResolution> = new Map();
/** Each failure is logged once per session in development. */
const LOGGED_FAILURES: Set<string> = new Set();

function logSpriteFailureOnce(key: string, message: string): void {
  if (LOGGED_FAILURES.has(key)) return;
  LOGGED_FAILURES.add(key);
  try {
    const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    if (env && env.DEV) console.warn('[monster-sprite] ' + message);
  } catch {
    /* non-Vite runtimes (sim): stay silent */
  }
}

/** Clear caches — test-only hook. */
export function clearMonsterSpriteCaches(): void {
  RESOLUTION_CACHE.clear();
  LOGGED_FAILURES.clear();
}

/** Test-only: add/override/remove a def (restores via clearMonsterSpriteCaches + re-override). */
export function overrideMonsterSpriteDefForTest(kind: string, def: unknown): void {
  if (def === undefined) delete (DEFS as Record<string, unknown>)[kind];
  else (DEFS as Record<string, unknown>)[kind] = def;
  RESOLUTION_CACHE.delete(kind);
}

/**
 * Resolve the sprite for a monster kind through the fallback hierarchy:
 *   1. requested asset (validated def)
 *   2. same-category variant (when the kind's own def is invalid)
 *   3/4. generic humanoid ('goblin')
 *   5. engine-safe placeholder (renderer uses .monster-placeholder, no PNG)
 * Legacy-sprite kinds always resolve to themselves (level 0, no def).
 * Deterministic and cached: same kind => same resolution all session.
 */
export function resolveMonsterSprite(kind: string): MonsterSpriteResolution {
  const cached = RESOLUTION_CACHE.get(kind);
  if (cached) return cached;

  let resolution: MonsterSpriteResolution;
  const raw = DEFS[kind];

  if (raw && isValidMonsterSpriteDef(raw)) {
    const { def, repaired } = repairedDef(kind, raw);
    if (repaired.length) {
      logSpriteFailureOnce(kind + ':anims', kind + ' has broken animation buckets (' + repaired.join(', ') + ') — using idle frames for those.');
    }
    resolution = { kind, def, fallbackLevel: 0, reason: repaired.length ? 'repaired animations: ' + repaired.join(', ') : undefined };
  } else if (raw) {
    // Invalid def: try a same-category sibling before the generic fallback.
    const category = categoryOf(kind);
    const sibling = category ? SPRITE_CATEGORIES[category].find((k) => k !== kind && isValidMonsterSpriteDef(DEFS[k])) : undefined;
    if (sibling) {
      logSpriteFailureOnce(kind + ':def', kind + ' has an invalid sprite def — falling back to same-category ' + sibling + '.');
      resolution = { kind: sibling, def: DEFS[sibling] as MonsterSpriteDef, fallbackLevel: 2, reason: 'invalid def for ' + kind };
    } else {
      logSpriteFailureOnce(kind + ':def', kind + ' has an invalid sprite def and no valid category sibling — using generic humanoid.');
      resolution = genericHumanoidResolution('invalid def for ' + kind);
    }
  } else if (LEGACY_KINDS.has(kind)) {
    resolution = { kind, def: undefined, fallbackLevel: 0 };
  } else {
    logSpriteFailureOnce(kind + ':unknown', 'unknown monster kind "' + kind + '" — using generic humanoid.');
    resolution = genericHumanoidResolution('unknown kind ' + kind);
  }

  RESOLUTION_CACHE.set(kind, resolution);
  return resolution;
}

function genericHumanoidResolution(reason: string): MonsterSpriteResolution {
  const generic = DEFS[GENERIC_HUMANOID_KIND];
  if (generic && isValidMonsterSpriteDef(generic)) {
    return { kind: GENERIC_HUMANOID_KIND, def: generic as MonsterSpriteDef, fallbackLevel: 3, reason };
  }
  // Even the generic humanoid is unusable: engine-safe placeholder, no PNG.
  return { kind: 'placeholder', def: undefined, fallbackLevel: 4, reason: reason + '; generic humanoid unavailable' };
}

/** Sprite definition for a monster kind, or undefined for legacy-sprite kinds.
 *  Goes through the fallback hierarchy (validated + repaired); unknown kinds
 *  resolve to the generic humanoid's def. */
export function spriteDefFor(kind: string): MonsterSpriteDef | undefined {
  return resolveMonsterSprite(kind).def;
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
