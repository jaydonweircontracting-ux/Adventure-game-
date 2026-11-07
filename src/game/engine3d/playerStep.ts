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
// BUILD 1020: perpendicular slide. The 1018 fix exposed the deeper hole:
// for a straight push the component slides are DEGENERATE — pushing due
// north, the x-slide IS the current tile (correctly skipped since 1018)
// and the y-slide IS the blocked point itself, so a straight push can
// never slide and the player stops dead on every road crate. Measured:
// sprinting north from (102,130) flatlines at y≈120.6 against the crate
// on tile (102,120) — identical on 1017 and 1019 — and the same pin
// repeats at every road crate, so a latched sprint runs, stops dead,
// (the latch clears after 2s idle) and must be re-tapped: stop-start
// movement that reads as shaky and glitchy. Now, when the direct move
// and both component slides fail, the step tries the two PERPENDICULAR
// unit steps (east/west for a north/south push, north/south for an
// east/west push), toward the movement's small component first, then
// the other side — a full step, lateral only, never backwards. The
// player slides ALONG the obstacle instead of stopping dead on it.
// Contract change, stated plainly: the 1018 pin case (a single-tile
// obstacle straight ahead) now slides around instead of reporting
// blocked — 'Path blocked' is reserved for truly boxed-in cases where
// NO direction moves. The 1018 invariant is preserved: a no-op slide
// is never counted as a move, and every step 1017 took is byte-identical
// here — the perpendicular slide only adds movement where 1017 stood
// still.

export interface StepResult {
  x: number;
  y: number;
  /** The player actually changed position this frame. */
  moved: boolean;
  /** Direct move AND both slides failed — the way is fully blocked. */
  blocked: boolean;
}

export function resolvePlayerStep(
  px: number,
  py: number,
  moveDx: number,
  moveDy: number,
  dist: number,
  step: number,
  walkableAt: (x: number, y: number) => boolean,
): StepResult {
  const nx = px + (moveDx / dist) * step;
  const ny = py + (moveDy / dist) * step;
  if (walkableAt(nx, ny)) return { x: nx, y: ny, moved: true, blocked: false };
  // Slide along walls while retaining smooth world-space movement.
  const sx = px + (moveDx / dist) * step;
  const sy = py;
  const ax = px;
  const ay = py + (moveDy / dist) * step;
  // BUILD 1018: a slide that leaves the player exactly where they stand
  // is not a move — skip it instead of "succeeding" in place.
  if ((sx !== px || sy !== py) && walkableAt(sx, sy)) return { x: sx, y: sy, moved: true, blocked: false };
  if ((ax !== px || ay !== py) && walkableAt(ax, ay)) return { x: ax, y: ay, moved: true, blocked: false };
  // BUILD 1020: perpendicular slide. For a straight push the two slides
  // above are degenerate (one is the current tile, the other is the
  // blocked point), so try stepping sideways by a full step, toward the
  // movement's small component first, then the other side. Lateral only
  // — never backwards — and only into walkable tiles, one step at a
  // time, exactly like the component slides. A diagonal push already
  // slides via the components above; this only adds movement where the
  // old code stood still.
  if (Math.abs(moveDy) >= Math.abs(moveDx)) {
    const sgn = moveDx !== 0 ? Math.sign(moveDx) : 1;
    if (walkableAt(px + sgn * step, py)) return { x: px + sgn * step, y: py, moved: true, blocked: false };
    if (walkableAt(px - sgn * step, py)) return { x: px - sgn * step, y: py, moved: true, blocked: false };
  } else {
    const sgn = moveDy !== 0 ? Math.sign(moveDy) : 1;
    if (walkableAt(px, py + sgn * step)) return { x: px, y: py + sgn * step, moved: true, blocked: false };
    if (walkableAt(px, py - sgn * step)) return { x: px, y: py - sgn * step, moved: true, blocked: false };
  }
  return { x: px, y: py, moved: false, blocked: true };
}
