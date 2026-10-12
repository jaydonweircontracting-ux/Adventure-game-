// 8-direction facing for horses (BUILD 668).
// Maps movement vectors to 8 compass directions.
// The sprite sheet only has 4 rows (up/left/down/right); diagonals
// map to the nearest cardinal in CSS via data-facing attributes.

export type EightDirection =
  | 'up' | 'up-right' | 'right' | 'down-right'
  | 'down' | 'down-left' | 'left' | 'up-left';

/**
 * Get 8-direction facing from a movement vector.
 * Uses angle-based selection for stable diagonal detection.
 */
export function eightDirectionFromVector(dx: number, dy: number): EightDirection {
  // Note: y is down-positive in screen coordinates.
  const angle = Math.atan2(dy, dx); // -PI to PI, 0 = east
  const deg = (angle * 180) / Math.PI; // -180 to 180

  // 8 sectors of 45 degrees each, centered on cardinal/diagonal directions.
  // East (right) is 0°, going clockwise (since y is down).
  if (deg >= -22.5 && deg < 22.5) return 'right';
  if (deg >= 22.5 && deg < 67.5) return 'down-right';
  if (deg >= 67.5 && deg < 112.5) return 'down';
  if (deg >= 112.5 && deg < 157.5) return 'down-left';
  if (deg >= 157.5 || deg < -157.5) return 'left';
  if (deg >= -157.5 && deg < -112.5) return 'up-left';
  if (deg >= -112.5 && deg < -67.5) return 'up';
  return 'up-right'; // -67.5 to -22.5
}

/**
 * Map 8-direction to 4-direction sprite row.
 * Used when the renderer only supports 4 facings.
 */
export function toFourDirection(dir: EightDirection): 'up' | 'down' | 'left' | 'right' {
  switch (dir) {
    case 'up':
    case 'up-left':
    case 'up-right':
      return 'up';
    case 'down':
    case 'down-left':
    case 'down-right':
      return 'down';
    case 'left':
      return 'left';
    case 'right':
      return 'right';
  }
}
