// Shared character animation + asset pipeline for the isometric renderer.
//
// One module owns the whole character visual system so the three canvas
// consumers (IsoFieldView, IsoInteriorView, IsoRoom) render characters
// identically:
//
//   appearance   — the fixed PLAYER_LOOK + deterministic per-NPC variants
//                  (same NPC id => same look, forever)
//   state machine — idle, walk, attack (slash), and hurt have dedicated art;
//                  interact / dead fall back to idle so new states slot in
//                  without touching the renderer
//   timing       — walk-cycle rate is driven by each character's measured
//                  ground speed (fast attack / slow release, so the 120ms
//                  NPC sim ticks don't make the animation stutter)
//   assets       — chibi LPC paper-doll layers (body + head + legs + torso
//                  + hair + hat) with per-layer fallbacks: requested sheet ->
//                  player's sheet for that layer -> vector placeholder.
//                  Missing assets warn once, never per frame.
//   draw         — one canvas draw: shadow, feet-anchored paper-doll layers,
//                  subtle idle breathing, vector fallback while loading.
//
// No React state: each consumer keeps a Map<string, CharacterAnimator>
// (pruned per frame) inside its render loop.

import {
  type Face4, type LpcLook, type LpcLayer, type LpcAnim, PLAYER_LOOK,
  LPC_CELL, LPC_FEET_ROW, LPC_FRAMES,
  lpcLayerKeys, lpcClip, lpcReady, lpcSprite,
  LPC_BODY_TONES, LPC_SHIRTS, LPC_PANTS, LPC_HAIR_POOL, LPC_HATS,
  BRUTE_CELL, BRUTE_COLS, BRUTE_FRAMES, bruteFlip, bruteReady, bruteSprite,
} from './isoSprites';

// ---------------------------------------------------------------------------
// Animation state machine
// ---------------------------------------------------------------------------

/** Character animation states. Interact/dead have no dedicated art yet and
 *  render the idle clip (placeholder: true) until art exists. */
export type CharAnimState = 'idle' | 'walk' | 'interact' | 'attack' | 'hurt' | 'dead';

export interface CharAnimClip {
  /** Which per-animation sprite file the state plays. */
  anim: LpcAnim;
  loop: boolean;
  /** True when the state has no dedicated art yet (falls back to idle). */
  placeholder?: boolean;
}

export const CHAR_CLIPS: Record<CharAnimState, CharAnimClip> = {
  idle: { anim: 'idle', loop: true },
  walk: { anim: 'walk', loop: true },
  interact: { anim: 'idle', loop: true, placeholder: true },
  attack: { anim: 'slash', loop: true },
  hurt: { anim: 'hurt', loop: true },
  dead: { anim: 'idle', loop: true, placeholder: true },
};

export const CHAR_STATES = Object.keys(CHAR_CLIPS) as CharAnimState[];

// Walk-cycle rate bounds (frames/sec). Tied to measured ground speed:
// stopped => no cycling, faster => faster cycling, always smooth.
export const WALK_FPS_MIN = 2;
export const WALK_FPS_MAX = 12;
/**
 * BUILD 386: the up/down (back/front) walk rows read as a slow foot-shuffle
 * next to the side rows at the same ground speed, so the feet cycle faster on
 * those facings to match the stride visually.
 */
export const WALK_FPS_UPDOWN_MULT = 1.5;

/** Walk-cycle frames/sec for a measured ground speed (field units/sec). */
export function walkFpsForSpeed(unitsPerSec: number): number {
  if (!(unitsPerSec > 0)) return 0;
  return Math.min(WALK_FPS_MAX, Math.max(WALK_FPS_MIN, 2 + unitsPerSec * 0.55));
}

/** Pure helper: walk frame index at a timestamp for a constant speed. */
export function walkFrameAt(nowMs: number, unitsPerSec: number): number {
  const fps = walkFpsForSpeed(unitsPerSec);
  if (fps <= 0) return 0;
  return Math.floor((nowMs / 1000) * fps) % LPC_FRAMES.walk;
}

// ---------------------------------------------------------------------------
// Appearance: the player look + deterministic NPC variants
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
 * Deterministic NPC appearance: same seed string => same body/legs/torso/
 * hair/hat forever (chunk reloads, save/load, new sessions). Picks from the
 * packed chibi LPC wardrobe; ~9% are bald; ~25% get a headband.
 */
export function variantLook(seed: string): LpcLook {
  const h = hashSeed(seed);
  const body = LPC_BODY_TONES[h % LPC_BODY_TONES.length];
  const legs = LPC_PANTS[(h >>> 7) % LPC_PANTS.length];
  const torso = LPC_SHIRTS[(h >>> 13) % LPC_SHIRTS.length];
  const hair = LPC_HAIR_POOL[(h >>> 19) % LPC_HAIR_POOL.length];
  const hat = h % 4 === 0 ? LPC_HATS[(h >>> 27) % LPC_HATS.length] : undefined;
  return hat ? { body, legs, torso, hair, hat } : { body, legs, torso, hair };
}

/**
 * Anything that identifies a character's appearance:
 *  - number: 0 = the player look, other values => deterministic legacy variant
 *  - LpcLook: explicit paper-doll layers
 *  - string: NPC id/seed => deterministic variant
 */
export type LookRef = number | LpcLook | string;

export function resolveLook(look: LookRef): LpcLook {
  if (typeof look === 'string') return variantLook(look);
  if (typeof look === 'number') {
    return look === 0 ? PLAYER_LOOK : variantLook(`legacy-look-${look}`);
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
    this.phase = (hashSeed(seedStr) % LPC_FRAMES.walk);
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
      // BUILD 386: faster feet on up/down facings (back/front rows shuffle
      // slowly at the side-row rate).
      const upDown = this.facing === 'up' || this.facing === 'down';
      const rate = walkFpsForSpeed(this.speed) * (upDown ? WALK_FPS_UPDOWN_MULT : 1);
      this.phase = (this.phase + (dt / 1000) * rate) % LPC_FRAMES.walk;
    } else {
      this.state = 'idle';
    }
    this.lx = u.x; this.ly = u.y; this.lastNow = u.nowMs; this.init = true;
  }

  /** Current sprite-sheet frame index for the active clip. */
  frameIndex(): number {
    const frames = LPC_FRAMES[CHAR_CLIPS[this.state].anim];
    if (frames <= 1) return 0;
    return Math.floor(this.phase) % frames;
  }
}

// ---------------------------------------------------------------------------
// Asset resolution with fallbacks (warn once, never per frame)
// ---------------------------------------------------------------------------

const missingWarned = new Set<string>();
function warnMissingAsset(file: string): void {
  if (missingWarned.has(file)) return;
  missingWarned.add(file);
  console.warn(`[characterSystem] sheet missing/unloaded, using fallback: ${file}`);
}

/**
 * Resolve one paper-doll layer image. Fallback chain:
 *   1. the requested sheet
 *   2. the player look's sheet for the same layer + animation + facing
 *   3. undefined -> the caller draws the vector placeholder
 */
function layerImage(file: string, layer: LpcLayer, look: LpcLook, anim: LpcAnim, face: Face4): HTMLImageElement | undefined {
  const direct = lpcSprite(file);
  if (direct) return direct;
  warnMissingAsset(file);
  const baseKey = lpcLayerKeys(PLAYER_LOOK).find((l) => l.layer === layer)?.key;
  if (baseKey) {
    const baseClip = lpcClip(layer, baseKey, anim, face);
    if (baseClip.file !== file) {
      const base = lpcSprite(baseClip.file);
      if (base) return base;
    }
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
 * BUILD 389: draw the player (look === 0) from the user-supplied "brute"
 * sheet instead of the LPC paper doll. Feet-anchored at the bottom of the
 * 195px cell; the right facing mirrors the side cells. Falls back to the LPC
 * path while the sheet is still loading.
 */
function drawBruteCharacter(o: DrawCharacterOptions): boolean {
  const im = bruteSprite();
  if (!im) return false;
  const g = o.g;
  const size = o.size ?? 60;
  const walking = o.animator.state === 'walk';
  const anim = CHAR_CLIPS[o.animator.state].anim;
  const frames = BRUTE_FRAMES[anim] ?? 1;
  const frame = frames <= 1 ? 0 : Math.floor(o.animator.phase) % frames;
  const cols = BRUTE_COLS[o.animator.facing];
  const col = cols[frame % cols.length];
  const flip = bruteFlip(o.animator.facing);
  const lift = walking ? Math.abs(Math.sin(o.nowMs / 130)) * 2 : 0;
  const breathe = walking ? 0 : Math.sin(o.nowMs / 1100); // ±1px idle breath
  if (o.shadow !== false) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(o.x, o.y + 3, 13, 5, 0, 0, 7); g.fill();
  }
  const dy = o.y - size - lift + breathe;
  const s = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  try {
    if (flip) {
      g.save();
      g.translate(o.x, 0);
      g.scale(-1, 1);
      g.drawImage(im, col * BRUTE_CELL, 0, BRUTE_CELL, BRUTE_CELL, -size / 2, dy, size, size);
      g.restore();
    } else {
      g.drawImage(im, col * BRUTE_CELL, 0, BRUTE_CELL, BRUTE_CELL, o.x - size / 2, dy, size, size);
    }
  } finally {
    g.imageSmoothingEnabled = s;
  }
  return true;
}

/**
 * Draw one character. Feet-anchored: LPC_FEET_ROW of the sprite cell lands on
 * (x, y); the root never moves between frames — only the body animates.
 * Walking adds a small step bob; idling adds a subtle ±1px breath.
 */
export function drawIsoCharacter(o: DrawCharacterOptions): void {
  // BUILD 389: the player uses the brute sprite pack when it's loaded.
  if (o.look === 0 && bruteReady()) {
    if (drawBruteCharacter(o)) return;
  }
  const g = o.g;
  const size = o.size ?? 52;
  const L = resolveLook(o.look);
  const layers = lpcLayerKeys(L);
  const walking = o.animator.state === 'walk';
  const anim = CHAR_CLIPS[o.animator.state].anim;
  const lift = walking ? Math.abs(Math.sin(o.nowMs / 130)) * 2 : 0;
  const breathe = walking ? 0 : Math.sin(o.nowMs / 1100); // ±1px idle breath
  if (o.shadow !== false) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(o.x, o.y + 3, 12, 5, 0, 0, 7); g.fill();
  }
  const frame = o.animator.frameIndex();
  const dx = o.x - size / 2;
  const dy = o.y - (LPC_FEET_ROW / LPC_CELL) * size - lift + breathe;
  let drew = false;
  const clips = layers.map(({ key, layer }) => ({ layer, clip: lpcClip(layer, key, anim, o.animator.facing) }));
  if (lpcReady(clips.map((c) => c.clip.file))) {
    for (const { layer, clip } of clips) {
      const im = layerImage(clip.file, layer, L, anim, o.animator.facing);
      if (!im) continue;
      const f = Math.min(frame, clip.frames - 1);
      g.drawImage(im, f * LPC_CELL, clip.row * LPC_CELL, LPC_CELL, LPC_CELL, dx, dy, size, size);
      drew = true;
    }
  }
  if (!drew) drawVectorPlaceholder(g, o.x, o.y - lift + breathe, walking, o.nowMs);
}
