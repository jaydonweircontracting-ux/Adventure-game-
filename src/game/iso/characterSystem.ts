// Shared character animation + asset pipeline for the isometric renderer.
// BUILD 702: replaced the LPC paper-doll system with the user-supplied RPG
// sprite pack (public/rpg/, registry in rpgSprites.ts).
//
// One module owns the whole character visual system so the three canvas
// consumers (IsoFieldView, IsoInteriorView, IsoRoom) render characters
// identically:
//
//   appearance   — RpgLook: base body + equipment layers (currently everyone
//                  uses the bald/naked BaseHumanMale default; equipment is
//                  indexed in rpgManifest.json for future customization)
//   state machine — idle, walk, run, attack, bow, cast, dead map to real art;
//                  hurt has no pain art in the pack -> idle + red flash;
//                  interact falls back to idle
//   timing       — delta-time playback; one-shot anims (attack, death) play
//                  through once; death holds the last frame (never loops)
//   assets       — on-demand cached loading per (base, anim, face, frame);
//                  missing assets warn once and fall back to vector placeholder
//   draw         — one canvas draw: shadow, feet-anchored sprite, vector
//                  fallback while loading.
//
// No React state: each consumer keeps a Map<string, CharacterAnimator>
// (pruned per frame) inside its render loop.

import type { Face8 } from './isoSprites';
import {
  type RpgAnim, type RpgBase, type RpgLook,
  RPG_DEFAULT_BASE, RPG_DEFAULT_LOOK, RPG_BASES, RPG_ANIM_FRAMES,
  RPG_W, RPG_H,
  rpgSprite, rpgAnchorFor, preloadRpgBase, rpgCacheStats,
} from './rpgSprites';

// ---------------------------------------------------------------------------
// Animation state machine
// ---------------------------------------------------------------------------

/** Character animation states. */
export type CharAnimState =
  | 'idle' | 'walk' | 'run' | 'interact'
  | 'attack' | 'bow' | 'cast' | 'hurt' | 'dead';

export interface CharAnimClip {
  /** Which RPG sprite animation the state plays. */
  anim: RpgAnim;
  loop: boolean;
  /** One-shot: plays through once then transitions (attack->idle, dead holds). */
  oneShot?: boolean;
}

export const CHAR_CLIPS: Record<CharAnimState, CharAnimClip> = {
  idle: { anim: 'Idle', loop: true },
  walk: { anim: 'Walk', loop: true },
  run: { anim: 'Run', loop: true },
  interact: { anim: 'Idle', loop: true },
  attack: { anim: 'Attack', loop: false, oneShot: true },
  bow: { anim: 'Bow', loop: false, oneShot: true },
  cast: { anim: 'Cast', loop: false, oneShot: true },
  // No pain art in the pack — idle + red flash overlay (see drawIsoCharacter).
  hurt: { anim: 'Idle', loop: true },
  dead: { anim: 'Death', loop: false, oneShot: true },
};

export const CHAR_STATES = Object.keys(CHAR_CLIPS) as CharAnimState[];

// Walk-cycle rate bounds (frames/sec). Tied to measured ground speed.
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
  return Math.floor((nowMs / 1000) * fps) % RPG_ANIM_FRAMES.Walk;
}

// ---------------------------------------------------------------------------
// Appearance
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
 * Deterministic NPC appearance. BUILD 702: everyone uses the bald/naked
 * BaseHumanMale default (user directive — no auto-equipped items). The seed
 * is retained for future per-NPC customization (base variants, equipment).
 */
/**
 * BUILD 713: stable paper-doll loadout selection.
 *
 * Every selected item uses the same verified animation/direction/frame
 * contract as its base. Layer order matters: legs -> torso -> arms -> head
 * protection -> hair -> weapon/shield. Asset failures are isolated per layer
 * by rpgSprite(), so a missing optional item never hides the body or other
 * working layers. Keep the selection deterministic: the same NPC id always
 * resolves to the same appearance after chunk changes and save/load.
 *
 * These are folder names from rpgManifest.json. Equipment PNGs must be present
 * under public/rpg/<folder>/ for each layer to render; absent files gracefully
 * fall back to the layers that are available.
 */
const LOOK_PARTS = {
  legs: ['BluePants', 'BrownPants', 'BlackBoots', 'DrkBoot', 'AhoulBoots1', 'AhoulKilt1'],
  clothing: ['BlueVest', 'BrvHrtTunic', 'BrvHrtVest', 'ChestPiece1', 'ChestPiece2'],
  armor: ['BreastPlate1', 'BreastPlateGold', 'Breastplate2', 'DrkChestPlat', 'AhoulChestpiece1', 'AhoulLeatherBreastplate'],
  arms: ['AhoulArmBand', 'AhoulArmGuards', 'DrkArmPlat', 'AhoulShoulderpads1'],
  headwear: ['CanvasHood', 'ChainCoif', 'CoifFelious', 'CoifMudam', 'DrkCoif', 'DrkHelm', 'DrkHood'],
  hair: ['DreamWalkerHair1', 'DreamWalkerHair2', 'DreamWalkerHair3'],
  beard: ['BeardDark', 'BeardGrey', 'BeardLight', 'BeardRed'],
  weapons: ['Dagger', 'BroadSword', 'BroadSword2', 'BastardSword', 'BattleAxe', 'Axe', 'BoneBow', 'BoneClub', 'ChainMace'],
  shields: ['BucklerNisos', 'BucklerWood'],
} as const;

function choosePart(seed: number, parts: readonly string[], salt: number): string | null {
  // Salt each slot so outfit choices don't correlate with one another.
  const value = (Math.imul(seed ^ salt, 0x45d9f3b) >>> 0);
  return parts[value % parts.length] ?? null;
}

/** Stable, varied RPG loadout for an NPC id/seed. */
export function variantLook(seedStr: string): RpgLook {
  const seed = hashSeed(seedStr || 'adventurer');
  const role = seed % 5;
  const equipment: string[] = [];
  const add = (part: string | null) => { if (part && !equipment.includes(part)) equipment.push(part); };

  // Every outfit has a basic leg layer and a torso layer.
  add(choosePart(seed, LOOK_PARTS.legs, 0x1a2b3c));
  if (role === 0 || role === 2) {
    // Light civilian/traveller clothing.
    add(choosePart(seed, LOOK_PARTS.clothing, 0x2b3c4d));
  } else {
    // Armoured archetypes: chest armour replaces (rather than duplicates) a shirt.
    add(choosePart(seed, LOOK_PARTS.armor, 0x3c4d5e));
    if (role === 1 || role === 4) add(choosePart(seed, LOOK_PARTS.arms, 0x4d5e6f));
  }

  // Hair is common; head protection takes priority on helmeted loadouts.
  if (role === 1 || role === 4) {
    add(choosePart(seed, LOOK_PARTS.headwear, 0x5e6f70));
  } else {
    add(choosePart(seed, LOOK_PARTS.hair, 0x6f7081));
    if (role === 3 && seed % 2 === 0) add(choosePart(seed, LOOK_PARTS.beard, 0x708192));
  }

  // Weapon/shield layers are cosmetic; combat logic and inventory remain authoritative.
  if (role === 1 || role === 2 || role === 4) {
    add(choosePart(seed, LOOK_PARTS.weapons, 0x8192a3));
    if (role === 4 && seed % 3 === 0) add(choosePart(seed, LOOK_PARTS.shields, 0x92a3b4));
  }

  // All seven installed base rigs are valid for every animation, including
  // Death. Pick by stable NPC seed so crowds use the supplied race/body art
  // without random changes when chunks unload or the game rerenders.
  const base = RPG_BASES[seed % RPG_BASES.length] ?? RPG_DEFAULT_BASE;
  return { base, equipment };
}

/**
 * Anything that identifies a character's appearance:
 *  - RpgLook: explicit base + equipment layers
 *  - string: NPC id/seed => deterministic base-rig and outfit variation
 *  - number: 0 = player default, other => deterministic default
 */
export type LookRef = number | RpgLook | string;

export function resolveLook(look: LookRef): RpgLook {
  if (typeof look === 'string') return variantLook(look);
  if (typeof look === 'number') return { ...RPG_DEFAULT_LOOK };
  return look;
}

/** Preload the default base's full animation set. Call once at startup. */
export function preloadCharacterSprites(): void {
  preloadRpgBase(RPG_DEFAULT_BASE);
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
  /**
   * Explicit run hint (BUILD 704). When set, it overrides the speed
   * heuristic: true forces the run cycle, false forces walk. When omitted
   * the animator falls back to measured speed (run above 6 units/sec).
   */
  running?: boolean;
  /** Authoritative from the simulation: which way is it facing? */
  facing: Face8;
  nowMs: number;
}

export class CharacterAnimator {
  facing: Face8 = 'down';
  state: CharAnimState = 'idle';
  /** Measured ground speed, field units/sec (smoothed). */
  speed = 0;
  /** Animation phase in frames (float). */
  phase = 0;
  /** For one-shot anims: ms elapsed since the state started. */
  private stateT = 0;
  private lx = 0;
  private ly = 0;
  private lastNow = 0;
  private init = false;

  constructor(seedStr = '') {
    // Deterministic initial offset so crowds don't animate in lockstep.
    this.phase = hashSeed(seedStr) % RPG_ANIM_FRAMES.Idle;
  }

  /** Force an animation state (attack, hurt, dead, etc.). One-shot states
   *  play through once; dead holds its final frame. */
  setState(s: CharAnimState): void {
    if (this.state === s) return;
    // Don't interrupt death.
    if (this.state === 'dead') return;
    this.state = s;
    this.phase = 0;
    this.stateT = 0;
  }

  update(u: AnimUpdate): void {
    // Ignore long browser/GC pauses so resuming never jumps the animation phase.
    const dt = this.init ? Math.min(50, Math.max(1, u.nowMs - this.lastNow)) : 16.7;
    const dist = this.init ? Math.hypot(u.x - this.lx, u.y - this.ly) : 0;
    const inst = dist / (dt / 1000);
    this.speed = Math.max(inst, this.speed * Math.exp(-dt / 450));
    this.facing = u.facing;

    const clip = CHAR_CLIPS[this.state];
    const frames = RPG_ANIM_FRAMES[clip.anim];

    if (clip.oneShot) {
      // One-shot: advance at a fixed cinematic rate (~12fps), hold or exit.
      this.stateT += dt;
      const fps = 12;
      this.phase = Math.min(frames - 1, (this.stateT / 1000) * fps);
      if (this.stateT / 1000 * fps >= frames) {
        if (this.state === 'dead') {
          this.phase = frames - 1; // hold final death frame forever
        } else {
          // Attack/bow/cast done -> back to walk/idle per movement.
          this.state = u.moving ? 'walk' : 'idle';
          this.phase = 0;
          this.stateT = 0;
        }
      }
    } else if (u.moving) {
      // BUILD 704: explicit run hint (player sprint, NPC flee) wins and
      // allows walk<->run transitions with phase preservation (no leg pop).
      // Without a hint, keep the original behavior: pick walk/run once on
      // entry via the speed heuristic, then stick (stable for crowds).
      if (this.state !== 'walk' && this.state !== 'run') {
        const wantRun = u.running ?? this.speed > 6;
        this.state = wantRun ? 'run' : 'walk';
        this.phase = 0;
      } else if (u.running !== undefined) {
        const wantState: CharAnimState = u.running ? 'run' : 'walk';
        if (this.state !== wantState) {
          const oldFrames = RPG_ANIM_FRAMES[CHAR_CLIPS[this.state].anim];
          this.state = wantState;
          const newFrames = RPG_ANIM_FRAMES[CHAR_CLIPS[this.state].anim];
          this.phase = oldFrames > 0 ? (this.phase / oldFrames) * newFrames : 0;
        }
      }
      const rate = walkFpsForSpeed(this.speed);
      const wframes = RPG_ANIM_FRAMES[CHAR_CLIPS[this.state].anim];
      this.phase = (this.phase + (dt / 1000) * rate) % wframes;
    } else {
      if (this.state === 'walk' || this.state === 'run') {
        this.state = 'idle';
        this.phase = 0;
      } else if (this.state === 'idle' || this.state === 'interact' || this.state === 'hurt') {
        // Idle breathing: slow cycle through the 4 idle frames.
        this.phase = (this.phase + (dt / 1000) * 2) % frames;
      }
    }
    this.lx = u.x; this.ly = u.y; this.lastNow = u.nowMs; this.init = true;
  }

  /** Current sprite frame index for the active clip. */
  frameIndex(): number {
    const frames = RPG_ANIM_FRAMES[CHAR_CLIPS[this.state].anim];
    if (frames <= 1) return 0;
    return Math.floor(this.phase) % frames;
  }
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
  /** Drawn sprite height in px (default 64). Width scales proportionally.
   *  Root anchor never moves. */
  size?: number;
  /** Ground shadow (default true). */
  shadow?: boolean;
  /** Base body override (e.g. skeleton enemies). */
  base?: RpgBase;
}

/** Simple placeholder when no sprite art is available (fallback). */
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

// Per-animator last-good frame prevents visible placeholder flicker when
// asynchronous PNG loads lag behind the animation clock.
const lastCharacterSprite = new WeakMap<CharacterAnimator, {
  key: string;
  image: HTMLImageElement;
  base: RpgBase;
  anim: RpgAnim;
  face: Face8;
  frame: number;
}>();
// Keep each equipped layer visible across animation transitions as well as frame loads.
// The old cache key included drawAnim, so switching Walk -> Attack created an empty
// cache and made the dagger disappear until an Attack PNG loaded (or permanently if
// that equipment animation was missing). Cache the last-good layer by item + facing.
const lastEquipmentSprites = new WeakMap<CharacterAnimator, Map<string, HTMLImageElement>>();

/**
 * Draw one character. Feet-anchored: the frame's content ground point
 * (per-frame anchor from rpgAnchorFor) lands on (x, y); the root never
 * moves between frames — only the body animates.
 * Equipment layers (when configured) draw over the base in order.
 */
export function drawIsoCharacter(o: DrawCharacterOptions): void {
  const g = o.g;
  const size = o.size ?? 64;
  const L = resolveLook(o.look);
  const base = o.base ?? L.base;
  const anim = CHAR_CLIPS[o.animator.state].anim;
  const frame = o.animator.frameIndex();
  const face = o.animator.facing;
  const walking = o.animator.state === 'walk' || o.animator.state === 'run';
  const walkFrames = RPG_ANIM_FRAMES[CHAR_CLIPS[o.animator.state].anim];
  const lift = walking ? Math.abs(Math.sin((o.animator.phase / Math.max(1, walkFrames)) * Math.PI * 2)) * 1.25 : 0;

  if (o.shadow !== false) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(o.x, o.y + 3, 12, 5, 0, 0, 7); g.fill();
  }

  // Sprite is 148x130; scale so height = size. BUILD 706: anchor by the
  // frame's own content ground point (bottom-center of opaque pixels), so
  // the feet stay planted even though the artist shifted the body inside
  // the canvas between frames. Equipment layers use the same origin so
  // they stay aligned with the base.
  // Keep the last valid frame visible while the next frame loads or if an
  // individual PNG is missing. Without this, the renderer alternates between
  // the real animated model and the flat vector placeholder every few frames.
  const spriteKey = `${base}:${anim}:${face}`;
  let spriteFrame = frame;
  let drawBase = base;
  let drawAnim = anim;
  let drawFace = face;
  let im = rpgSprite(base, anim, face, spriteFrame);
  if (!im) {
    const cached = lastCharacterSprite.get(o.animator);
    if (cached) {
      // Keep the exact last-good sprite and its matching anchor/animation
      // metadata together. Using the current clip's anchor for an older cached
      // frame made the body jump vertically during direction/clip changes.
      im = cached.image;
      drawBase = cached.base;
      drawAnim = cached.anim;
      drawFace = cached.face;
      spriteFrame = cached.frame;
    } else {
      // First-ever frame only: try the stable first frame before using the
      // vector placeholder. Once any real frame has loaded, never flash back.
      im = rpgSprite(base, anim, face, 0);
      if (im) {
        spriteFrame = 0;
        lastCharacterSprite.set(o.animator, { key: spriteKey, image: im, base, anim, face, frame: spriteFrame });
      }
    }
  } else {
    lastCharacterSprite.set(o.animator, { key: spriteKey, image: im, base, anim, face, frame: spriteFrame });
  }

  const anchor = rpgAnchorFor(drawBase, drawAnim, drawFace, spriteFrame);
  const scale = size / RPG_H;
  const dw = RPG_W * scale;
  const dh = size;
  const dx = o.x - anchor.cx * scale;
  const dy = o.y - anchor.cb * scale - lift;

  let drew = false;
  if (im) {
    g.drawImage(im, dx, dy, dw, dh);
    drew = true;
    // Equipment layers (future customization; currently empty by default).
    let equipmentCache = lastEquipmentSprites.get(o.animator);
    if (!equipmentCache) {
      equipmentCache = new Map<string, HTMLImageElement>();
      lastEquipmentSprites.set(o.animator, equipmentCache);
    }
    for (const eq of L.equipment) {
      const cacheKey = `${eq}:${drawFace}`;
      const loadedLayer = rpgSprite(eq, drawAnim, drawFace, spriteFrame);
      if (loadedLayer) equipmentCache.set(cacheKey, loadedLayer);
      const layer = loadedLayer ?? equipmentCache.get(cacheKey);
      if (layer) g.drawImage(layer, dx, dy, dw, dh);
    }
  }
  // Hurt flash: no pain art in the pack, so tint red briefly.
  if (o.animator.state === 'hurt' && drew) {
    g.save();
    g.globalAlpha = 0.35;
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#ff2222';
    g.fillRect(dx, dy, dw, dh);
    g.restore();
  }
  if (!drew) drawVectorPlaceholder(g, o.x, o.y - lift, walking, o.nowMs);
}

/** Re-export cache stats for the debug tool. */
export { rpgCacheStats };
