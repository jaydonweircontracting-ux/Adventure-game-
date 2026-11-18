// productionInteriors.ts — BUILD 1097 (0x20, NEURON HEX Phase 3.6).
// Interiors for the settlement's production buildings, as part of
// each building's definition (the interior is a property of the
// building definition, not a new catalogue entry, and it contains
// NO new production logic — smelting, smithing, sawing, milling,
// baking all run exactly as they do now).
//
// The enter/exit machinery is the EXISTING hut interior system
// (interiors.ts + buildingInteractions3d.ts): a finished production
// building IS a 'house' placement on its rect, so it is already in
// placedHutRects — nearDoorHut finds its door, enterHut/exitHut
// move the player through hutDoor/hutExitPoint, rescuePosition
// covers it, houseFxInputsFor skips its shell when entered, and the
// hut loop renders the interior instead of the shell when entered.
// What was missing was only the CONTENT: the entered building
// showed seeded hut furniture (bed, table, hearth). This module
// supplies the right equipment per building, and the renderer
// dispatches to it by rect (productionKindForRect).
//
// Equipment (visual only — walkability is interiorWalkable, so the
// room is fully walkable; the door tile + the tile directly inward
// are furniture-free, the same reserved lane as huts):
//   smelter: furnace (stone body + fire) + ore bin (counter)
//   blacksmith: forge (stone body + fire) + anvil (iron)
//   sawmill: saw works (frame + blade) + lumber rack (shelf)
//   carpenter: workbench + tool rack (shelf)
//   mill: mill works (wheel + axle) + grain bin (counter)
//   bakery: oven (stone body + fire) + dough table (counter)
//   workshop: workbench + assembly table (counter)
// The signature kinds (furnace, forge, saw, millworks, oven) are
// unique per building; the workbench is shared by the carpenter
// and the workshop, but their rooms differ by tile + second piece,
// so no two interiors have the same (kind, tile) set.
import { INTERIOR_FLOOR_Y, type InteriorBox } from './interiors';
import type { Rgb } from './townLook';
import {
  SMELTER_RECT, SMELTER_DOOR, SMELTER_APPROACH,
  BLACKSMITH_RECT, BLACKSMITH_DOOR, BLACKSMITH_APPROACH,
  SAWMILL_RECT, SAWMILL_DOOR, SAWMILL_APPROACH,
  CARPENTER_RECT, CARPENTER_DOOR, CARPENTER_APPROACH,
  WORKSHOP_RECT, WORKSHOP_DOOR, WORKSHOP_APPROACH,
} from './metalChain';
import {
  MILL_RECT, MILL_DOOR, MILL_APPROACH,
  BAKERY_RECT, BAKERY_DOOR, BAKERY_APPROACH,
} from './foodChain';
import type { HutRect } from '../iso/isoWorld';

export type ProductionKind =
  | 'smelter' | 'blacksmith' | 'sawmill' | 'carpenter'
  | 'mill' | 'bakery' | 'workshop';

export interface ProductionInteriorDef {
  kind: ProductionKind;
  rect: { x0: number; y0: number; x1: number; y1: number };
  door: { x: number; y: number };
  approach: { x: number; y: number };
}

/** The seven production buildings, from their chain definitions. */
export const PRODUCTION_BUILDINGS: ProductionInteriorDef[] = [
  { kind: 'smelter', rect: { ...SMELTER_RECT }, door: { ...SMELTER_DOOR }, approach: { ...SMELTER_APPROACH } },
  { kind: 'blacksmith', rect: { ...BLACKSMITH_RECT }, door: { ...BLACKSMITH_DOOR }, approach: { ...BLACKSMITH_APPROACH } },
  { kind: 'sawmill', rect: { ...SAWMILL_RECT }, door: { ...SAWMILL_DOOR }, approach: { ...SAWMILL_APPROACH } },
  { kind: 'carpenter', rect: { ...CARPENTER_RECT }, door: { ...CARPENTER_DOOR }, approach: { ...CARPENTER_APPROACH } },
  { kind: 'mill', rect: { ...MILL_RECT }, door: { ...MILL_DOOR }, approach: { ...MILL_APPROACH } },
  { kind: 'bakery', rect: { ...BAKERY_RECT }, door: { ...BAKERY_DOOR }, approach: { ...BAKERY_APPROACH } },
  { kind: 'workshop', rect: { ...WORKSHOP_RECT }, door: { ...WORKSHOP_DOOR }, approach: { ...WORKSHOP_APPROACH } },
];

export function productionDefFor(kind: ProductionKind): ProductionInteriorDef {
  return PRODUCTION_BUILDINGS.find((d) => d.kind === kind)!;
}

/** The production kind for a rect, or null (hut, inn, wild rect). */
export function productionKindForRect(rect: { x0: number; y0: number; x1: number; y1: number }): ProductionKind | null {
  for (const d of PRODUCTION_BUILDINGS) {
    if (d.rect.x0 === rect.x0 && d.rect.y0 === rect.y0 && d.rect.x1 === rect.x1 && d.rect.y1 === rect.y1) return d.kind;
  }
  return null;
}

/** The HutRect the enter/exit machinery uses for a production building. */
export function productionHutRect(def: ProductionInteriorDef): HutRect {
  return { x0: def.rect.x0, y0: def.rect.y0, x1: def.rect.x1, y1: def.rect.y1, doorX: def.door.x, doorY: def.door.y };
}

const WOOD: Rgb = [0.45, 0.32, 0.2];
const WOOD_DARK: Rgb = [0.36, 0.25, 0.15];
const STONE_GREY: Rgb = [0.52, 0.52, 0.5];
const FIRE: Rgb = [0.95, 0.55, 0.15];
const IRON: Rgb = [0.25, 0.25, 0.28];

const y = INTERIOR_FLOOR_Y;

function box(
  kind: InteriorBox['kind'],
  tx: number, ty: number,
  w: number, h: number, d: number,
  y0: number, color: Rgb,
  dx = 0, dz = 0,
): InteriorBox {
  return { kind, tx, ty, x: tx + 0.5 + dx, z: ty + 0.5 + dz, w, d, h, y0, color };
}

/**
 * The working equipment for a production building, as interior
 * boxes. Every piece sits on the north row (y0) — the door tile
 * (south edge centre) and the tile directly inward from it are
 * never used, so the reserved entry lane stays clear. Layouts
 * differ per building (signature kind + tile), so no two rooms
 * read the same.
 */
export function productionInteriorBoxes(kind: ProductionKind, rect: { x0: number; y0: number; x1: number; y1: number }): InteriorBox[] {
  const x0 = rect.x0, x1 = rect.x1, y0 = rect.y0;
  const mx = Math.round((x0 + x1) / 2);
  if (kind === 'smelter') {
    return [
      box('furnace', mx, y0, 0.9, 1.2, 0.6, y, STONE_GREY),
      box('furnace', mx, y0, 0.45, 0.4, 0.15, y, FIRE, 0, 0.25),
      box('counter', x0, y0, 0.9, 0.8, 0.55, y, STONE_GREY),
    ];
  }
  if (kind === 'blacksmith') {
    return [
      box('forge', x0, y0, 0.9, 0.9, 0.5, y, STONE_GREY),
      box('forge', x0, y0, 0.4, 0.35, 0.15, y, FIRE, 0, 0.2),
      box('anvil', x1, y0, 0.5, 0.3, 0.4, y, WOOD_DARK),
      box('anvil', x1, y0, 0.55, 0.2, 0.3, y + 0.3, IRON),
    ];
  }
  if (kind === 'sawmill') {
    return [
      box('saw', mx, y0, 0.9, 0.9, 0.15, y, WOOD, 0, -0.2),
      box('saw', mx, y0, 0.7, 0.8, 0.06, y + 0.1, IRON, 0, 0.1),
      box('shelf', x0, y0, 0.8, 1.1, 0.3, y, WOOD_DARK),
    ];
  }
  if (kind === 'carpenter') {
    return [
      box('workbench', mx, y0, 0.9, 0.08, 0.6, y + 0.57, WOOD),
      box('workbench', mx, y0, 0.3, 0.57, 0.3, y, WOOD_DARK),
      box('shelf', x0, y0, 0.8, 1.1, 0.3, y, WOOD_DARK),
    ];
  }
  if (kind === 'mill') {
    return [
      box('millworks', mx, y0, 0.08, 1.4, 1.2, y, WOOD),
      box('millworks', mx, y0, 0.5, 0.15, 0.15, y + 0.7, WOOD_DARK),
      box('counter', x0, y0, 0.9, 0.8, 0.55, y, STONE_GREY),
    ];
  }
  if (kind === 'bakery') {
    return [
      box('oven', mx, y0, 0.9, 1.0, 0.6, y, STONE_GREY),
      box('oven', mx, y0, 0.45, 0.35, 0.15, y, FIRE, 0, 0.25),
      box('counter', x0, y0, 0.9, 0.8, 0.55, y, STONE_GREY),
    ];
  }
  // workshop
  return [
    box('workbench', x1, y0, 0.9, 0.08, 0.6, y + 0.57, WOOD),
    box('workbench', x1, y0, 0.3, 0.57, 0.3, y, WOOD_DARK),
    box('counter', x0, y0, 0.9, 0.8, 0.55, y, STONE_GREY),
  ];
}

/**
 * The fire's centre, in absolute world units (baseY added), for
 * the buildings with a live fire (smelter furnace, blacksmith
 * forge, bakery oven) — the hearth glow for production interiors.
 * Null for the sawmill, carpenter, mill, and workshop (no fire).
 * The fire box is the FIRE-coloured box the equipment emits.
 */
export function productionFireFor(
  kind: ProductionKind | null,
  rect: { x0: number; y0: number; x1: number; y1: number },
  baseY: number,
): [number, number, number] | null {
  if (!kind) return null;
  for (const b of productionInteriorBoxes(kind, rect)) {
    if (b.color[0] === FIRE[0] && b.color[1] === FIRE[1] && b.color[2] === FIRE[2]) {
      return [b.x, b.y0 + b.h / 2 + baseY, b.z];
    }
  }
  return null;
}
