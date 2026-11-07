// BUILD 1018: one player movement step (pure, no React, no I/O).
//
// Extracted verbatim from Engine3DWorldView's draw() pipeline — same
// step, same walkableAt checks, same wall sliding — with ONE correctness
// fix: a slide that does not change the player's position is NOT a move.
//
// The old inline code took the x-slide whenever it was walkable. Pushing
// due north/south (moveDx=0) makes the x-slide the CURRENT tile, which
// is walkable — so a player pinned against a crate on the road reported
// walkingNow=true while standing perfectly still, never drained stamina,
// never showed sprinting, and a tap-to-move target was never cleared
// ('Path blocked' never fired). The player just stood there forever,
// which reads exactly like a dead Sprint button. Now a no-op slide falls
// through to blocked, the tap target clears with 'Path blocked', and the
// player must tap around the obstacle like anywhere else. Diagonal
// movement is untouched: both slides genuinely change position there.
//
// BUILD 1021: the component slides now have a minimum-fraction gate
// and the perpendicular slide has a fixed side + a sticky preference
// (see MIN_SLIDE_FRACTION and resolvePlayerStep below). The 1020
// perpendicular slide followed sign(small component) for its side,
// which is noise for tap-to-move: the push is (target − player), so
// its lateral component is a microscopic nonzero value whose SIGN
// flips as the player crosses the target's x/y. Measured on 1020:
// tap-to-move north from (102,124) to (102,118) flatlines at y≈120.5
// against the crate — the x-slide takes a ~0.0002-tile micro-step
// every frame (it counts as `moved`, so stamina drains, the latch
// never idle-clears, and the tap target never clears with 'Path
// blocked'), the perpendicular never fires, and the player creeps
// asymptotically toward x=102.00 without ever reaching it or sliding
// around. A latched sprint drains 100→9 while pinned. Keyboard
// input (moveDx exactly 0) never sees this — the x-slide is the
// current tile there, correctly skipped since 1018. The 1021 fix:
// a component slide must be a meaningful fraction of the push, the
// perpendicular side is fixed (east for N/S pushes, south for E/W
// pushes) while that fraction is negligible, and once a slide picks
// a side it keeps it until the direct path opens, so a wide obstacle
// (a hut, 6 tiles) cannot trap the player in a gate-boundary
// oscillation either. Every step 1017/1020 took is unchanged — the
// new rules only add movement where the old code stood still or
// ping-ponged.

export type PerpDir = 'E' | 'W' | 'N' | 'S';

/** How the step moved: direct, component slide, perpendicular slide, or blocked. */
export type StepHow = 'direct' | 'slide' | 'perp' | 'blocked';

export interface StepResult {
  x: number;
  y: number;
  /** The player actually changed position this frame. */
  moved: boolean;
  /** Direct move AND both slides failed — the way is fully blocked. */
  blocked: boolean;
  how: StepHow;
  /** Which perpendicular direction was used (only when how === 'perp'). */
  perp: PerpDir | null;
}

/**
 * A component slide is only a real wall slide when its component is a
 * meaningful fraction of the push. A 6° deviation (fraction 0.1) is
 * the smallest genuine wall slide; below it the perpendicular is the
 * correct move. The 1017 identity cases are all ≥0.707 (45°), so the
 * gate never changes a step 1017 took.
 */
export const MIN_SLIDE_FRACTION = 0.1;

export function resolvePlayerStep(
  px: number,
  py: number,
  moveDx: number,
  moveDy: number,
  dist: number,
  step: number,
  walkableAt: (x: number, y: number) => boolean,
  preferPerp: PerpDir | null = null,
): StepResult {
  const nx = px + (moveDx / dist) * step;
  const ny = py + (moveDy / dist) * step;
  if (walkableAt(nx, ny)) return { x: nx, y: ny, moved: true, blocked: false, how: 'direct', perp: null };
  const nsPush = Math.abs(moveDy) >= Math.abs(moveDx);
  // BUILD 1021: sticky perpendicular. A preference is only valid
  // perpendicular to the current push (an E/W preference means
  // nothing for an E/W push, and vice versa) — an invalid one is
  // ignored, so a turn onto a new axis starts fresh.
  const sticky: PerpDir | null = preferPerp !== null && ((nsPush && (preferPerp === 'E' || preferPerp === 'W')) || (!nsPush && (preferPerp === 'N' || preferPerp === 'S'))) ? preferPerp : null;
  // While sliding around an obstacle, a component slide pointing
  // OPPOSITE to the slide direction would undo it: for a wide
  // obstacle the push's lateral fraction grows past the gate
  // mid-slide, and without this the player oscillates on the gate
  // boundary and never gets around. Skip the components while the
  // push pulls back against the slide; the perpendicular keeps the
  // player moving around the obstacle on the side already chosen.
  const latComp = nsPush ? moveDx : moveDy;
  const stickySign = sticky === 'E' || sticky === 'S' ? 1 : sticky === 'W' || sticky === 'N' ? -1 : 0;
  const opposes = sticky !== null && latComp !== 0 && Math.sign(latComp) !== stickySign;
  if (!opposes) {
    // Slide along walls while retaining smooth world-space movement.
    const sx = px + (moveDx / dist) * step;
    const sy = py;
    const ax = px;
    const ay = py + (moveDy / dist) * step;
    // BUILD 1018: a slide that leaves the player exactly where they stand
    // is not a move — skip it instead of "succeeding" in place.
    // BUILD 1021: a slide whose component is a negligible fraction of
    // the push is the same failure in miniature — skip it too, so the
    // perpendicular below gets its chance.
    if (Math.abs(moveDx) / dist >= MIN_SLIDE_FRACTION && (sx !== px || sy !== py) && walkableAt(sx, sy)) return { x: sx, y: sy, moved: true, blocked: false, how: 'slide', perp: null };
    if (Math.abs(moveDy) / dist >= MIN_SLIDE_FRACTION && (ax !== px || ay !== py) && walkableAt(ax, ay)) return { x: ax, y: ay, moved: true, blocked: false, how: 'slide', perp: null };
  }
  // BUILD 1020: perpendicular slide. For a straight push the two slides
  // above are degenerate (one is the current tile, the other is the
  // blocked point), so try stepping sideways by a full step. Lateral
  // only — never backwards — and only into walkable tiles, one step at
  // a time, exactly like the component slides. A diagonal push already
  // slides via the components above; this only adds movement where the
  // old code stood still.
  // BUILD 1021: the side is FIXED while the push's lateral component
  // is negligible (east for N/S pushes, south for E/W pushes) — the
  // 1020 side followed sign(small component), which flips frame to
  // frame for tap-to-move and ping-pongs the player east/west along
  // the obstacle. A genuinely diagonal push still takes its own side
  // first (1020 behaviour preserved). The sticky side, when valid,
  // is tried before either default side.
  const defaultSide: PerpDir = nsPush
    ? (Math.abs(moveDx) / dist >= MIN_SLIDE_FRACTION ? (moveDx > 0 ? 'E' : 'W') : 'E')
    : (Math.abs(moveDy) / dist >= MIN_SLIDE_FRACTION ? (moveDy > 0 ? 'S' : 'N') : 'S');
  const otherSide: PerpDir = defaultSide === 'E' ? 'W' : defaultSide === 'W' ? 'E' : defaultSide === 'S' ? 'N' : 'S';
  const ordered: PerpDir[] = sticky !== null ? [sticky, defaultSide, otherSide].filter((s, i, a) => a.indexOf(s) === i) : [defaultSide, otherSide];
  for (const side of ordered) {
    const tx = side === 'E' ? px + step : side === 'W' ? px - step : px;
    const ty = side === 'S' ? py + step : side === 'N' ? py - step : py;
    if (walkableAt(tx, ty)) return { x: tx, y: ty, moved: true, blocked: false, how: 'perp', perp: side };
  }
  return { x: px, y: py, moved: false, blocked: true, how: 'blocked', perp: null };
}
