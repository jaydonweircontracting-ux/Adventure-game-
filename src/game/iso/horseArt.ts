// BUILD 912: isometric horse + cart drawing for the iso field view.
//
// There is no horse art in any sprite pack the game ships (the RPG pack is
// humanoid-only; the 2D DOM view reuses a top-down cow sheet). Following the
// renderer's own precedent for missing art (procedural boulder, corpse,
// ores), horses are drawn as flat-shaded canvas shapes in the same visual
// language: soft ground shadow, dark outline tones, no gradients.
//
// Everything here is presentation-only: positions, activities and colors
// come from src/game/horses.ts (world horses) and App.tsx HorseState (the
// player's mount). Coordinates are the renderer's world px (isoToScreen
// space, feet/ground anchored) — a standing character is 64px tall there,
// so a horse's back sits ~42px up and its head ~58px up.

import { isoPlayerFaceForScreenDelta, type Face8 } from './isoSprites';

export interface HorseCoat {
  body: string;
  dark: string;
  light: string;
  mane: string;
}

/** Coat palettes keyed by the color names horses.ts assigns. */
export const HORSE_COATS: Record<string, HorseCoat> = {
  bay: { body: '#7a4a28', dark: '#4a2c17', light: '#96603a', mane: '#2e1c10' },
  chestnut: { body: '#8a4b22', dark: '#5d3013', light: '#a86535', mane: '#54300f' },
  black: { body: '#2e2e34', dark: '#17171a', light: '#48484f', mane: '#101012' },
  gray: { body: '#8d8d94', dark: '#5f5f66', light: '#acacb3', mane: '#55555c' },
  palomino: { body: '#c9a24f', dark: '#96702c', light: '#dec06e', mane: '#efe3bb' },
  'dappled gray': { body: '#7e7e88', dark: '#53535c', light: '#a2a2ab', mane: '#4c4c54' },
  roan: { body: '#6e4a3a', dark: '#452d22', light: '#8a6350', mane: '#33231c' },
  white: { body: '#ddd8ce', dark: '#b3ac9e', light: '#f2eee6', mane: '#cfc8ba' },
};

/** Coat for a horses.ts color name; unknown names fall back to bay. */
export function horseCoat(color: string): HorseCoat {
  return HORSE_COATS[color] ?? HORSE_COATS.bay;
}

/** Height of the horse's back above its ground anchor (world px). */
export const HORSE_BACK_Y = 42;
/** Screen lift applied to a rider's feet so they sit on the horse's back. */
export const HORSE_SEAT_LIFT = 34;
/** Screen lift for a driver seated on the cart bench. */
export const HORSE_CART_SEAT_LIFT = 30;
/** World-unit offset from horse to cart anchor (cart trails behind). */
export const HORSE_CART_TRAIL = 8.5;

export type HorsePose = 'side' | 'front' | 'back';

/**
 * Map an 8-way facing to a draw pose. E-ish facings show the horse's side
 * facing screen-right, W-ish the same profile flipped, S is the front
 * (head toward the viewer), N is the back (tail toward the viewer).
 */
export function horsePoseForFace(face: string): { pose: HorsePose; flip: boolean } {
  // Accept both Face8 ('upleft') and EightDirection ('up-left') spellings.
  switch (face.replace('-', '')) {
    case 'left': case 'upleft': case 'downleft':
      return { pose: 'side', flip: true };
    case 'up':
      return { pose: 'back', flip: false };
    case 'down':
      return { pose: 'front', flip: false };
    default: // right, upright, downright, anything else
      return { pose: 'side', flip: false };
  }
}

/**
 * Classify a world-space movement delta into an 8-way facing. Delegates to
 * the player's own screen-space facing function (isoSprites) so horses use
 * the exact convention the character art uses: facings name SCREEN
 * directions — world-east travel projects to screen down-right and yields
 * 'downright', world (1,-1) travel is pure screen-right, and so on.
 * Returns null when the delta is too small to read a direction from.
 */
export function horseFace8ForDelta(dx: number, dy: number): Face8 | null {
  if (Math.hypot(dx, dy) < 0.02) return null;
  return isoPlayerFaceForScreenDelta(dx, dy, 'down');
}

/**
 * Unit WORLD-space vector for an 8-way facing (for leader/cart offsets).
 * Facings name screen directions (see above), so this inverts the iso
 * projection: 'downright' art is used for world-east travel -> (1, 0);
 * 'right' art for world (1,-1) travel -> (SQRT1_2, -SQRT1_2); etc.
 */
export function horseFacingVector(face: string): { x: number; y: number } {
  const s = Math.SQRT1_2;
  switch (face.replace('-', '')) {
    case 'right': return { x: s, y: -s };
    case 'downright': return { x: 1, y: 0 };
    case 'down': return { x: s, y: s };
    case 'downleft': return { x: 0, y: 1 };
    case 'left': return { x: -s, y: s };
    case 'upleft': return { x: -1, y: 0 };
    case 'up': return { x: -s, y: -s };
    case 'upright': return { x: 0, y: -1 };
    default: return { x: 1, y: 0 };
  }
}

export interface HorseDrawOptions {
  coat: HorseCoat;
  pose: HorsePose;
  flip: boolean;
  moving: boolean;
  /** Walk-cycle phase in radians (advances while moving). */
  phase: number;
  /** Wall-clock ms for idle motion (tail swish, ear/head bob). */
  nowMs: number;
  /** Draw the saddle + blanket (ridden / player horses). */
  saddle: boolean;
}

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function leg(g: CanvasRenderingContext2D, x: number, topY: number, groundY: number, swing: number, coat: HorseCoat): void {
  // A leg is a slightly tapered stride line: hip at (x, topY), hoof lands
  // ahead/behind by `swing` px depending on the walk phase.
  const hoofX = x + swing;
  g.strokeStyle = coat.dark;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, topY);
  g.lineTo((x + hoofX) / 2 + swing * 0.2, (topY + groundY) / 2);
  g.lineTo(hoofX, groundY - 2);
  g.stroke();
  // hoof
  g.fillStyle = '#241a12';
  g.fillRect(hoofX - 3, groundY - 3, 7, 3);
}

/**
 * Draw one horse, ground-anchored at (cx, cy) — the point between its
 * hooves. Draw in the renderer's world-px space (after the camera
 * transform), like drawCritter.
 */
export function drawIsoHorse(
  g: CanvasRenderingContext2D,
  cx: number, cy: number,
  o: HorseDrawOptions,
): void {
  const { coat, pose, flip, moving, phase, nowMs, saddle } = o;
  g.save();
  g.translate(Math.round(cx), Math.round(cy));
  if (flip) g.scale(-1, 1);

  // soft shadow
  ellipse(g, 0, 2, pose === 'side' ? 40 : 24, 6, 'rgba(0,0,0,0.20)');

  const idleBob = moving ? 0 : Math.sin(nowMs / 900) * 0.8;
  const tailSwish = Math.sin(nowMs / 700) * (moving ? 2.5 : 4);

  if (pose === 'side') {
    const stride = moving ? 7 : 0;
    const s1 = Math.sin(phase) * stride;
    const s2 = Math.sin(phase + Math.PI) * stride;
    const bellyY = -22;
    // far legs (darker, behind body)
    g.globalAlpha = 0.82;
    leg(g, -24, bellyY, 0, s2, coat);
    leg(g, 22, bellyY, 0, s1, coat);
    g.globalAlpha = 1;
    // tail (rear, at -x after flip-normalization)
    g.strokeStyle = coat.mane;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-37, -HORSE_BACK_Y + 2);
    g.quadraticCurveTo(-44, -26, -42 + tailSwish, -6);
    g.stroke();
    // body
    ellipse(g, 0, -33 + idleBob, 38, 11.5, coat.body);
    ellipse(g, -26, -34 + idleBob, 13, 10.5, coat.body); // rump
    ellipse(g, 27, -34 + idleBob, 12, 10.5, coat.body); // chest
    ellipse(g, 0, -38 + idleBob, 34, 8, coat.light); // back highlight
    if (coat === HORSE_COATS['dappled gray']) {
      g.fillStyle = 'rgba(240,240,245,0.25)';
      for (const [dx, dy, r] of [[-16, -36, 4], [4, -30, 3], [16, -38, 3.5], [-4, -40, 2.5]] as const) {
        g.beginPath(); g.ellipse(dx, dy + idleBob, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
      }
    }
    // neck + head (front at +x)
    g.fillStyle = coat.body;
    g.beginPath();
    g.moveTo(28, -40 + idleBob);
    g.lineTo(46, -54 + idleBob);
    g.lineTo(52, -50 + idleBob);
    g.lineTo(38, -32 + idleBob);
    g.closePath();
    g.fill();
    // head: long face angled down-forward, muzzle darker
    g.save();
    g.translate(50, -52 + idleBob);
    g.rotate(0.5);
    ellipse(g, 0, 0, 12, 5.5, coat.body);
    ellipse(g, 9, 1, 5.5, 4.2, coat.dark); // muzzle
    g.restore();
    // ears
    g.fillStyle = coat.dark;
    g.beginPath();
    g.moveTo(41, -55 + idleBob); g.lineTo(43, -62 + idleBob); g.lineTo(46, -56 + idleBob);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(46, -56 + idleBob); g.lineTo(49, -62 + idleBob); g.lineTo(51, -55 + idleBob);
    g.closePath(); g.fill();
    // mane along the neck crest
    g.strokeStyle = coat.mane;
    g.lineWidth = 4.5;
    g.beginPath();
    g.moveTo(30, -43 + idleBob);
    g.quadraticCurveTo(38, -52 + idleBob, 45, -57 + idleBob);
    g.stroke();
    // eye
    ellipse(g, 45, -53 + idleBob, 1.4, 1.4, '#14100c');
    // near legs (in front of body)
    leg(g, -20, bellyY, 0, s1, coat);
    leg(g, 26, bellyY, 0, s2, coat);
    if (saddle) {
      // blanket + saddle at the back's center
      g.fillStyle = '#7a2e2e';
      g.fillRect(-11, -HORSE_BACK_Y - 1 + idleBob, 22, 9);
      g.fillStyle = '#e8c87a';
      g.fillRect(-11, -HORSE_BACK_Y + 6 + idleBob, 22, 2);
      ellipse(g, 0, -HORSE_BACK_Y - 2 + idleBob, 9, 4, '#5d3a1e');
      g.fillStyle = '#3d2712';
      g.fillRect(-2, -HORSE_BACK_Y - 8 + idleBob, 4, 4); // pommel
    }
  } else {
    // front (viewer sees the chest + face) / back (rump + tail)
    const front = pose === 'front';
    const stride = moving ? 4 : 0;
    const s1 = Math.sin(phase) * stride;
    const s2 = Math.sin(phase + Math.PI) * stride;
    // legs
    leg(g, -11, -20, 0, front ? s1 : s2, coat);
    leg(g, 11, -20, 0, front ? s2 : s1, coat);
    // body mass
    ellipse(g, 0, -30 + idleBob, 17, 15, coat.body);
    ellipse(g, 0, -36 + idleBob, 15, 10, coat.light);
    if (front) {
      // neck + head facing the viewer
      ellipse(g, 0, -47 + idleBob, 8.5, 10, coat.body);
      ellipse(g, 0, -40 + idleBob, 6, 5, coat.dark); // muzzle
      ellipse(g, -2.5, -41 + idleBob, 1.1, 1.6, '#14100c');
      ellipse(g, 2.5, -41 + idleBob, 1.1, 1.6, '#14100c');
      // ears
      g.fillStyle = coat.dark;
      g.beginPath();
      g.moveTo(-8, -53 + idleBob); g.lineTo(-7, -60 + idleBob); g.lineTo(-3, -54 + idleBob);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(8, -53 + idleBob); g.lineTo(7, -60 + idleBob); g.lineTo(3, -54 + idleBob);
      g.closePath(); g.fill();
      // forelock
      ellipse(g, 0, -54 + idleBob, 4.5, 3, coat.mane);
      // eyes
      ellipse(g, -5.5, -48 + idleBob, 1.3, 1.3, '#14100c');
      ellipse(g, 5.5, -48 + idleBob, 1.3, 1.3, '#14100c');
      if (saddle) {
        // chest strap hint of the saddle girth
        g.fillStyle = '#5d3a1e';
        g.fillRect(-13, -30 + idleBob, 26, 3);
      }
    } else {
      // tail hanging center-back, swishing
      g.strokeStyle = coat.mane;
      g.lineWidth = 5.5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, -42 + idleBob);
      g.quadraticCurveTo(tailSwish, -26, tailSwish * 1.4, -8);
      g.stroke();
      // ears + head top peeking above the rump
      g.fillStyle = coat.dark;
      g.beginPath();
      g.moveTo(-7, -46 + idleBob); g.lineTo(-6, -53 + idleBob); g.lineTo(-2, -47 + idleBob);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(7, -46 + idleBob); g.lineTo(6, -53 + idleBob); g.lineTo(2, -47 + idleBob);
      g.closePath(); g.fill();
      ellipse(g, 0, -45 + idleBob, 6, 5, coat.body);
      if (saddle) {
        ellipse(g, 0, -HORSE_BACK_Y - 1 + idleBob, 10, 4.5, '#5d3a1e');
        g.fillStyle = '#7a2e2e';
        g.fillRect(-12, -HORSE_BACK_Y + 2 + idleBob, 24, 3);
      }
    }
  }
  g.restore();
}

export interface CartDrawOptions {
  pose: HorsePose;
  flip: boolean;
  moving: boolean;
  phase: number;
  nowMs: number;
}

/**
 * Draw a wooden two-wheel cart, ground-anchored at (cx, cy) — the point
 * under its axle. Drawn in the same pose space as the horse it trails:
 * side view shows one big spoked wheel + the bed in profile; front/back
 * views show the bed's end with a wheel at each side. Shafts reach toward
 * the horse (the caller positions the cart HORSE_CART_TRAIL units behind
 * the horse along its facing).
 */
export function drawIsoCart(
  g: CanvasRenderingContext2D,
  cx: number, cy: number,
  o: CartDrawOptions,
): void {
  const { pose, flip, moving, phase } = o;
  const wood = '#8a6a42';
  const woodDark = '#5f4526';
  const woodLight = '#a8845c';
  g.save();
  g.translate(Math.round(cx), Math.round(cy));
  if (flip) g.scale(-1, 1);

  ellipse(g, 0, 2, pose === 'side' ? 34 : 28, 5, 'rgba(0,0,0,0.18)');
  const wheelSpin = moving ? phase * 1.6 : 0;

  const wheel = (wx: number, wy: number, r: number) => {
    g.save();
    g.translate(wx, wy);
    g.rotate(wheelSpin);
    g.strokeStyle = woodDark;
    g.lineWidth = 3.5;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      g.beginPath();
      g.moveTo(Math.cos(a) * -r, Math.sin(a) * -r);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      g.stroke();
    }
    g.restore();
    ellipse(g, wx, wy, 3, 3, woodDark);
  };

  if (pose === 'side') {
    // shafts toward the horse (horse is at +x after flip-normalization)
    g.strokeStyle = woodDark;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(16, -26); g.lineTo(44, -30);
    g.moveTo(16, -20); g.lineTo(44, -24);
    g.stroke();
    // bed: plank box in profile
    g.fillStyle = wood;
    g.fillRect(-34, -38, 52, 16);
    g.fillStyle = woodLight;
    g.fillRect(-34, -38, 52, 4);
    g.strokeStyle = woodDark;
    g.lineWidth = 1.5;
    g.strokeRect(-34, -38, 52, 16);
    g.beginPath();
    g.moveTo(-34, -30); g.lineTo(18, -30);
    g.moveTo(-34, -26); g.lineTo(18, -26);
    g.stroke();
    // driver bench at the front of the bed
    g.fillStyle = woodDark;
    g.fillRect(2, -44, 14, 4);
    g.fillRect(13, -40, 3, 6);
    // cargo hint: sacks
    ellipse(g, -20, -40, 8, 5, '#b39b72');
    ellipse(g, -8, -41, 7, 6, '#9c865f');
    // wheel under the bed's middle-rear
    wheel(-8, -13, 13);
  } else {
    // bed end-on
    g.fillStyle = wood;
    g.fillRect(-24, -40, 48, 18);
    g.fillStyle = woodLight;
    g.fillRect(-24, -40, 48, 4);
    g.strokeStyle = woodDark;
    g.lineWidth = 1.5;
    g.strokeRect(-24, -40, 48, 18);
    g.beginPath();
    g.moveTo(-24, -31); g.lineTo(24, -31);
    g.stroke();
    // driver bench across the top
    g.fillStyle = woodDark;
    g.fillRect(-16, -46, 32, 4);
    ellipse(g, -10, -42, 7, 4.5, '#b39b72');
    ellipse(g, 9, -42, 6, 4, '#9c865f');
    // wheels at both sides
    wheel(-24, -12, 12);
    wheel(24, -12, 12);
    if (pose === 'front') {
      // shafts converge toward the viewer/horse below the bed
      g.strokeStyle = woodDark;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-14, -22); g.lineTo(-8, -6);
      g.moveTo(14, -22); g.lineTo(8, -6);
      g.stroke();
    }
  }
  g.restore();
}
