// Minimap radar mode (BUILD 891 — EO-style entity radar).
//
// Pure and deterministic — no React, no DOM. Projects nearby entity
// positions into minimap canvas coordinates so the MiniMap component can
// draw NPC/monster/critter/loot dots around the player instead of terrain.

export type RadarKind = 'npc' | 'monster' | 'critter' | 'loot';

export interface RadarEntity {
  position: { x: number; y: number };
  kind: RadarKind;
}

/** Dot colors on the radar. */
export const RADAR_COLORS: Record<RadarKind, string> = {
  npc: '#ffffff',
  monster: '#ff4444',
  critter: '#ffcc44',
  loot: '#ffd700',
};

/** Radar sweep range in field units (shown as the outer ring). */
export const RADAR_RANGE = 60;

export interface RadarDot {
  x: number;
  y: number;
  kind: RadarKind;
}

/**
 * Project entities within `range` field units of the player into canvas
 * coordinates. (cx, cy) is the canvas center, `radius` the radar circle
 * radius in px. Entities exactly at the player sit at the center; those
 * beyond `range` are clamped to the rim. Pure.
 */
export function radarDots(
  entities: RadarEntity[],
  playerPos: { x: number; y: number },
  cx: number,
  cy: number,
  radius: number,
  range = RADAR_RANGE,
): RadarDot[] {
  const scale = radius / range;
  const out: RadarDot[] = [];
  for (const e of entities) {
    let dx = (e.position.x - playerPos.x) * scale;
    let dy = (e.position.y - playerPos.y) * scale;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      dx = (dx / dist) * (radius - 2);
      dy = (dy / dist) * (radius - 2);
    }
    out.push({ x: cx + dx, y: cy + dy, kind: e.kind });
  }
  return out;
}
