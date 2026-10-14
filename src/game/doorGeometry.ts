// Shared door geometry — single source of truth for building door positions.
// BUILD 689: extracted from App.tsx (fieldDoorPosition / newHouseDoorPosition)
// so the live game, the town plan (townPlan.ts), and the sim all compute
// identical door positions. Doors are ALWAYS on the building's south face:
// the trigger zone, exit spawn, 2D CSS door, fallback iso renderer, and town
// plan lanes all assume south. Building sprites MUST paint their door on the
// south face too (the sprite images were horizontally flipped in BUILD 689
// because the AI art had doors on the east face).
//
// Pure module: no React, no App.tsx imports.

export interface DoorRect { left: number; top: number; right: number; bottom: number }
export interface DoorPoint { x: number; y: number }

/** Standard field-building door: matches .field-house::after (left 43%, width 16%, bottom 0). */
export function fieldDoorPosition(rect: DoorRect): DoorPoint {
  return {
    x: rect.left + (rect.right - rect.left) * 0.51,
    y: rect.top + (rect.bottom - rect.top) * 0.78,
  };
}

/** New-style stone house door (tutorial/guild/chapel/tavern): matches
 *  .field-house.new-house::after (left 38%, width 24%, bottom 0).
 *  Door center x: 38% + 12% = 50%. Door center y: 100% - 27.5% = 72.5%. */
export function newHouseDoorPosition(rect: DoorRect): DoorPoint {
  return {
    x: rect.left + (rect.right - rect.left) * 0.50,
    y: rect.top + (rect.bottom - rect.top) * 0.725,
  };
}

/** Which buildings use the new-style door formula. Shared so the town plan
 *  and the live game can never disagree on the formula choice. */
export function isNewStyleDoorBuilding(name: string): boolean {
  return name === 'tutorial' || name === 'guild' || name === 'chapel' || name === 'tavern';
}
