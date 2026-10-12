// Working mills: wheat → flour production (BUILD 665).
// Mills are registered world objects with inventory and production state.
// They consume wheat and produce flour over game time.
//
// Pure — no React, no App dependency.

export interface Mill {
  /** Stable ID (e.g., 'mill-mosslight-1'). */
  id: string;
  name: string;
  /** World position. */
  x: number;
  y: number;
  /** Wheat in mill inventory. */
  wheat: number;
  /** Flour in mill inventory. */
  flour: number;
  /** Max storage capacity. */
  capacity: number;
  /** Whether mill is currently processing. */
  isWorking: boolean;
  /** Day when current batch started (null if idle). */
  batchStartDay: number | null;
}

/** Wheat consumed per milling batch. */
export const WHEAT_PER_BATCH = 4;
/** Flour produced per batch. */
export const FLOUR_PER_BATCH = 3;
/** Days per milling batch. */
export const MILL_BATCH_DAYS = 1;

/**
 * Create a mill.
 */
export function createMill(
  id: string,
  name: string,
  x: number,
  y: number,
  capacity: number = 50,
): Mill {
  return {
    id, name, x, y,
    wheat: 0,
    flour: 0,
    capacity,
    isWorking: false,
    batchStartDay: null,
  };
}

/**
 * Add wheat to mill. Returns new mill (or same if full).
 * Respects capacity.
 */
export function addWheatToMill(mill: Mill, amount: number): Mill {
  const space = mill.capacity - mill.wheat - mill.flour;
  const addable = Math.min(amount, Math.max(0, space));
  if (addable <= 0) return mill;
  return { ...mill, wheat: mill.wheat + addable };
}

/**
 * Advance mill production by elapsed days.
 * If mill has enough wheat and space for flour, processes batches.
 * Returns new mill state.
 */
export function advanceMill(mill: Mill, currentDay: number): Mill {
  let result = { ...mill };

  // Check if current batch is done.
  if (result.isWorking && result.batchStartDay !== null) {
    if (currentDay - result.batchStartDay >= MILL_BATCH_DAYS) {
      // Batch complete: consume wheat, produce flour.
      result = {
        ...result,
        wheat: result.wheat - WHEAT_PER_BATCH,
        flour: result.flour + FLOUR_PER_BATCH,
        isWorking: false,
        batchStartDay: null,
      };
    } else {
      // Still working.
      return result;
    }
  }

  // Start new batch if possible.
  if (!result.isWorking) {
    const hasWheat = result.wheat >= WHEAT_PER_BATCH;
    const hasSpace = result.flour + FLOUR_PER_BATCH <= result.capacity;
    if (hasWheat && hasSpace) {
      result = {
        ...result,
        isWorking: true,
        batchStartDay: currentDay,
      };
    }
  }

  return result;
}

/**
 * Remove flour from mill (for delivery to market).
 * Returns { mill, flourRemoved }.
 */
export function takeFlourFromMill(
  mill: Mill,
  amount: number,
): { mill: Mill; flourRemoved: number } {
  const removable = Math.min(amount, mill.flour);
  if (removable <= 0) return { mill, flourRemoved: 0 };
  return {
    mill: { ...mill, flour: mill.flour - removable },
    flourRemoved: removable,
  };
}

/**
 * Mill status for diagnostics.
 */
export function millStatus(mill: Mill): string {
  if (mill.isWorking) return `Working (wheat: ${mill.wheat}, flour: ${mill.flour})`;
  if (mill.wheat < WHEAT_PER_BATCH) return `Idle — needs wheat (${mill.wheat}/${WHEAT_PER_BATCH})`;
  if (mill.flour + FLOUR_PER_BATCH > mill.capacity) return `Idle — flour storage full`;
  return `Ready (wheat: ${mill.wheat}, flour: ${mill.flour})`;
}
