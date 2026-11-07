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
  return { x: px, y: py, moved: false, blocked: true };
}
