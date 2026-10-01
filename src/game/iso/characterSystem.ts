// Shared character animation + asset pipeline for the isometric renderer.
//
// One module owns the whole character visual system so the three canvas
// consumers (IsoFieldView, IsoInteriorView, IsoRoom) render characters
// identically:
//
//   appearance   — curated NPC_LOOKS + deterministic per-NPC variants
//                  (same NPC id => same look, forever)
//   state machine — idle + walk fully implemented; interact / attack /
//                  hurt / dead prepared as idle-fallback clips so new states
//                  slot in without touching the renderer
//   timing       — walk-cycle rate is driven by each character's measured
//                  ground speed (fast attack / slow release, so the 120ms
//                  NPC sim ticks don't make the animation stutter)
//   assets       — sprite-sheet row/frame metadata + per-layer fallbacks:
//                  requested sheet -> base character sheet -> vector
//                  placeholder. Missing assets warn once, never per frame.
//   draw         — one canvas draw: shadow, feet-anchored paper-doll layers,
//                  subtle idle breathing, vector fallback while loading.
//
// No React state: each consumer keeps a Map<string, CharacterAnimator>
// (pruned per frame) inside its render loop.

import {
  type Face4, type MsLook, type MsLayer, NPC_LOOKS,
  MS_CELL, MS_WALK_FRAMES, MS_FEET_ROW, MS_ROW,
  msLayerKeys, msReady, msSprite,
  VARIANT_BODIES, VARIANT_OUTFITS, VARIANT_HAIRS, VARIANT_HATS,
} from './isoSprites';

// ---------------------------------------------------------------------------
// Animation state machine
// ---------------------------------------------------------------------------

/** Character animation states. Only idle/walk have dedicated art; the rest
 *  resolve to the idle clip (placeholder: true) until art exists. */
export type CharAnimState = 'idle' | 'walk' | 'interact' | 'attack' | 'hurt' | 'dead';

export interface CharAnimClip {
  /** Sprite-sheet row for (state, facing). */
  row: (f: Face4) => number;
  /** Frames in the cycle. */
  frames: number;
  loop: boolean;
  /** True when the state has no dedicated art yet (falls back to idle). */
  placeholder?: boolean;
}

export const CHAR_CLIPS: Record<CharAnimState, CharAnimClip> = {
  idle: { row: (f) => MS_ROW[f].stand, frames: 1, loop: true },
  walk: { row: (f) => MS_ROW[f].walk, frames: MS_WALK_FRAMES, loop: true },
  interact: { row: (f) => MS_ROW[f].stand, frames: 1, loop: true, placeholder: true },
  attack: { row: (f) => MS_ROW[f].stand, frames: 1, loop: true, placeholder: true },
  hurt: { row: (f) => MS_ROW[f].stand, frames: 1, loop: true, placeholder: true },
  dead: { row: (f) => MS_ROW[f].stand, frames: 1, loop: true, placeholder: true },
};

export const CHAR_STATES = Object.keys(CHAR_CLIPS) as CharAnimState[];

// Walk-cycle rate bounds (frames/sec). Tied to measured ground speed:
// stopped => no cycling, faster => faster cycling, always smooth.
export const WALK_FPS_MIN = 2;
export const WALK_FPS_MAX = 12;

/** Walk-cycle frames/sec for a measured ground speed (field units/sec). */
export function walkFpsForSpeed(unitsPerSec: number): number {
  if (!(unitsPerSec > 0)) return 0;
  return Math.min(WALK_FPS_MAX, Math.max(WALK_FPS_MIN, 2 + unitsPerSec * 0.55));
}

/** Pure helper: walk frame index at a timestamp for a constant speed. */
export function walkFrameAt(nowMs: number, unitsPerSec: number): number {
  const fps = walkFpsForSpeed(unitsPerSec);
  if (fps <= 0) return 0;
  return Math.floor((nowMs / 1000) * fps) % MS_WALK_FRAMES;
}

// ---------------------------------------------------------------------------
// Appearance: curated looks + deterministic NPC variants
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash — deterministic across sessions (unlike Math.random). */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic NPC appearance: same seed string => same body/outfit/hair/hat
 * forever (chunk reloads, save/load, new sessions). Picks from the full
 * Mana Seed wardrobe; outfits exclude underwear; ~30% get a hat.
 */
export function variantLook(seed: string): MsLook {
  const h = hashSeed(seed);
  const body = VARIANT_BODIES[h % VARIANT_BODIES.length];
  const outfit = VARIANT_OUTFITS[(h >>> 7) % VARIANT_OUTFITS.length];
  const hair = VARIANT_HAIRS[(h >>> 13) % VARIANT_HAIRS.length];
  const hat = h % 10 < 3 ? VARIANT_HATS[(h >>> 21) % VARIANT_HATS.length] : undefined;
  return hat ? { body, outfit, hair, hat } : { body, outfit, hair };
}

/**
 * Anything that identifies a character's appearance:
 *  - number: legacy index into NPC_LOOKS (player = 0)
 *  - MsLook: explicit paper-doll layers
 *  - string: NPC id/seed => deterministic variant
 */
export type LookRef = number | MsLook | string;

export function resolveLook(look: LookRef): MsLook {
  if (typeof look === 'string') return variantLook(look);
  if (typeof look === 'number') {
    return NPC_LOOKS[((look % NPC_LOOKS.length) + NPC_LOOKS.length) % NPC_LOOKS.length];
  }
  return look;
}

// ---------------------------------------------------------------------------
// CharacterAnimator — the per-character animation controller
// ---------------------------------------------------------------------------

export interface AnimUpdate {
  /** Character position in whatever consistent unit the caller uses. */
  x: number;
  y: number;
  /** Authoritative from the simulation: is the character moving? */
  moving: boolean;
  /** Authoritative from the simulation: which way is it facing? */
  facing: Face4;
  nowMs: number;
}

/**
 * Per-character animation state. The simulation stays authoritative for
 * moving/facing; the animator derives the visual state (idle/walk), measures
 * ground speed (fast attack / slow release, smoothing the 120ms sim ticks),
 * and advances the walk phase at a speed-tied rate. No timers, no React
 * state — the consumer calls update() once per rendered frame.
 */
export class CharacterAnimator {
  facing: Face4 = 'down';
  state: CharAnimState = 'idle';
  /** Measured ground speed, field units/sec (smoothed). */
  speed = 0;
  /** Walk phase in frames (float); each character also gets a deterministic
   *  initial offset so crowds don't march in lockstep. */
  phase: number;
  private lx = 0;
  private ly = 0;
  private lastNow = 0;
  private init = false;

  constructor(seedStr = '') {
    this.phase = (hashSeed(seedStr) % MS_WALK_FRAMES);
  }

  /** Force an animation state (e.g. a future interact/attack). Placeholder
   *  states render their idle fallback until dedicated art exists. */
  setState(s: CharAnimState): void {
    this.state = s;
  }

  update(u: AnimUpdate): void {
    const dt = this.init ? Math.max(1, u.nowMs - this.lastNow) : 16.7;
    const dist = this.init ? Math.hypot(u.x - this.lx, u.y - this.ly) : 0;
    const inst = dist / (dt / 1000);
    // Fast attack, slow release: picks up motion instantly, rides through
    // the gaps between sim ticks without the walk stuttering.
    this.speed = Math.max(inst, this.speed * Math.exp(-dt / 450));
    // Sim is authoritative for direction; stopping keeps the last facing.
    this.facing = u.facing;
    if (u.moving) {
      this.state = 'walk';
      this.phase = (this.phase + (dt / 1000) * walkFpsForSpeed(this.speed)) % MS_WALK_FRAMES;
    } else {
      this.state = 'idle';
    }
    this.lx = u.x; this.ly = u.y; this.lastNow = u.nowMs; this.init = true;
  }

  /** Current sprite-sheet frame index for the active clip. */
  frameIndex(): number {
    const clip = CHAR_CLIPS[this.state];
    if (clip.frames <= 1) return 0;
    return Math.floor(this.phase) % clip.frames;
  }

  /** Current sprite-sheet row for (state, facing). */
  sourceRow(): number {
    return CHAR_CLIPS[this.state].row(this.facing);
  }
}

// ---------------------------------------------------------------------------
// Asset resolution with fallbacks (warn once, never per frame)
// ---------------------------------------------------------------------------

const missingWarned = new Set<string>();
function warnMissingAsset(key: string): void {
  if (missingWarned.has(key)) return;
  missingWarned.add(key);
  console.warn(`[characterSystem] sheet missing/unloaded, using fallback: ${key}`);
}

/**
 * Resolve one paper-doll layer image. Fallback chain:
 *   1. the requested sheet
 *   2. the base character's sheet for the same layer (NPC_LOOKS[0])
 *   3. undefined -> the caller draws the vector placeholder
 */
function layerImage(key: string, layer: MsLayer): HTMLImageElement | undefined {
  const direct = msSprite(key);
  if (direct) return direct;
  warnMissingAsset(key);
  const baseKey = NPC_LOOKS[0][layer];
  if (baseKey && baseKey !== key) {
    const base = msSprite(baseKey);
    if (base) return base;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Canvas draw — the single character renderer
// ---------------------------------------------------------------------------

export interface DrawCharacterOptions {
  g: CanvasRenderingContext2D;
  /** Screen px of the character's FEET anchor (ground contact point). */
  x: number;
  y: number;
  look: LookRef;
  nowMs: number;
  /** Owns facing/state/phase — call update() before drawing each frame. */
  animator: CharacterAnimator;
  /** Drawn sprite size in px (default 52). Root anchor never moves. */
  size?: number;
  /** Ground shadow (default true). */
  shadow?: boolean;
}

/** Simple placeholder when no sprite art is available (tier-3 fallback). */
function drawVectorPlaceholder(
  g: CanvasRenderingContext2D, x: number, y: number, moving: boolean, nowMs: number,
): void {
  g.save();
  g.translate(x, y);
  const legSwing = moving ? Math.sin(nowMs / 130) * 4 : 0;
  g.fillStyle = '#4a3220';
  g.fillRect(-7, -12 + legSwing * 0.4, 6, 12);
  g.fillRect(1, -12 - legSwing * 0.4, 6, 12);
  g.fillStyle = '#3b6fd4';
  g.beginPath();
  g.moveTo(-10, -12); g.lineTo(10, -12); g.lineTo(8, -30); g.lineTo(-8, -30);
  g.closePath(); g.fill();
  g.fillRect(-13, -28, 4, 14); g.fillRect(9, -28, 4, 14);
  g.fillStyle = '#f2c89b';
  g.beginPath(); g.arc(0, -38, 9, 0, 7); g.fill();
  g.fillStyle = '#5a3a22';
  g.beginPath(); g.arc(0, -40, 9, Math.PI, 0); g.fill();
  g.fillRect(-9, -40, 4, 8);
  g.restore();
}

/**
 * Draw one character. Feet-anchored: MS_FEET_ROW of the sprite cell lands on
 * (x, y); the root never moves between frames — only the body animates.
 * Walking adds a small step bob; idling adds a subtle ±1px breath.
 */
export function drawIsoCharacter(o: DrawCharacterOptions): void {
  const g = o.g;
  const size = o.size ?? 52;
  const L = resolveLook(o.look);
  const layers = msLayerKeys(L);
  const walking = o.animator.state === 'walk';
  const lift = walking ? Math.abs(Math.sin(o.nowMs / 130)) * 2 : 0;
  const breathe = walking ? 0 : Math.sin(o.nowMs / 1100); // ±1px idle breath
  if (o.shadow !== false) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(o.x, o.y + 3, 12, 5, 0, 0, 7); g.fill();
  }
  const frame = o.animator.frameIndex();
  const row = o.animator.sourceRow();
  const sx = frame * MS_CELL, sy = row * MS_CELL;
  const dx = o.x - size / 2;
  const dy = o.y - (MS_FEET_ROW / MS_CELL) * size - lift + breathe;
  let drew = false;
  if (msReady(layers.map((l) => l.key))) {
    for (const { key, layer } of layers) {
      const im = layerImage(key, layer);
      if (!im) continue;
      g.drawImage(im, sx, sy, MS_CELL, MS_CELL, dx, dy, size, size);
      drew = true;
    }
  }
  if (!drew) drawVectorPlaceholder(g, o.x, o.y - lift + breathe, walking, o.nowMs);
}
