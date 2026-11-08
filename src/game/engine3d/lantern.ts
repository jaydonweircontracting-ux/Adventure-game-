// BUILD 1040 — the placeable lantern's shared geometry (pure).
//
// The lantern is a 1x1 blocking post in the Build menu
// (Decorations): a dark timber post with a hanging lantern box.
// The post + box + cap are STATIC world-buffer geometry (the view's
// render loop emits them with houseBox/cube); the GLOW is per-frame
// fx (houseFx.ts), driven by the same light schedule as the house
// windows (lightScheduleFor, seeded by the lantern's tile) — so a
// lantern glows at night exactly when the houses light up, and
// stays dark glass during the day. The constants live here so the
// view and the fx emitter can never disagree on where the lantern
// is: the glow box sits at the same centre as the static glass box,
// a touch larger (0.26 vs 0.22) so its faces sit proud of the glass
// and cannot z-fight it.

import type { Vec3 } from './houseFx';

/** Post height above the base y, tiles. */
export const LANTERN_POST_H = 1.5;
/** Post thickness, tiles. */
export const LANTERN_POST_W = 0.12;
/** The lantern glass box: a 0.22 cube hanging at the post top. */
export const LANTERN_BOX = 0.22;
/** The cap slab above the glass box (0.3 x 0.06 x 0.3). */
export const LANTERN_CAP = 0.3;
/** Dark timber (post + cap). */
export const LANTERN_TIMBER: Vec3 = [0.23, 0.16, 0.1];
/** Dark glass (the unlit box, daytime). */
export const LANTERN_GLASS_DARK: Vec3 = [0.16, 0.24, 0.32];
/** Warm lit glass (the night glow — the same warm yellow as the
 *  house windows, GLASS_LIT). */
export const LANTERN_GLOW: Vec3 = [0.96, 0.76, 0.36];
/** The glow box is a touch larger than the glass box so its faces
 *  sit proud of the glass (no z-fighting at night). */
export const LANTERN_GLOW_BOX = 0.26;

/** The glass box centre for a lantern on tile (tx, ty) at base y:
 *  the tile centre, the post top + half the box. The view's static
 *  box and the fx glow box both centre here. */
export function lanternBoxCentre(tx: number, ty: number, baseY = 0): Vec3 {
  return [tx + 0.5, baseY + LANTERN_POST_H + LANTERN_BOX / 2, ty + 0.5];
}
