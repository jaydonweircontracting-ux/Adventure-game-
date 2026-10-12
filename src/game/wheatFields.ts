// Wheat fields and crop lifecycle (BUILD 665).
// Functional wheat fields near Mosslight Crossing with growth stages.
// Farmers harvest mature wheat; wheat goes to mills for flour.
//
// Crop stages:
// 0: Prepared soil (tilled, empty)
// 1: Planted (seeds)
// 2: Growing (green shoots)
// 3: Mature (golden, harvestable)
// 4: Harvested (stubble, regrows to stage 0)
//
// Growth advances by game days, not frames.
// Pure — no React, no App dependency.

export type WheatStage = 0 | 1 | 2 | 3 | 4;

export interface WheatCrop {
  /** Stable ID: `wheat-{fieldId}-{index}` */
  id: string;
  fieldId: string;
  /** Position in field coordinates. */
  x: number;
  y: number;
  stage: WheatStage;
  /** Day when planted (for growth calculation). */
  plantedDay: number;
  /** Day when last harvested (for regrowth). */
  harvestedDay: number | null;
}

export interface WheatField {
  id: string;
  /** Field origin in world coordinates. */
  x: number;
  y: number;
  /** Field dimensions. */
  width: number;
  height: number;
  crops: WheatCrop[];
}

/** Days for each growth transition. */
export const WHEAT_GROWTH_DAYS = {
  soilToPlanted: 1,    // Stage 0 → 1
  plantedToGrowing: 2, // Stage 1 → 2
  growingToMature: 3,  // Stage 2 → 3
  harvestedToSoil: 2,  // Stage 4 → 0
};

/** Wheat yielded per harvested crop. */
export const WHEAT_PER_CROP = 2;

/**
 * Create a wheat field with crops at initial stages.
 * Deterministic by field ID and seed.
 */
export function createWheatField(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  startDay: number,
): WheatField {
  const crops: WheatCrop[] = [];
  const cols = Math.floor(width / 4);
  const rows = Math.floor(height / 4);

  // Deterministic RNG.
  let s = seed || 1;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  let index = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Stagger initial stages so field isn't uniform.
      const stageRoll = rng();
      const stage: WheatStage = stageRoll < 0.2 ? 0 : stageRoll < 0.4 ? 1 : stageRoll < 0.7 ? 2 : 3;

      crops.push({
        id: `wheat-${id}-${index}`,
        fieldId: id,
        x: x + c * 4 + (rng() - 0.5) * 1.5,
        y: y + r * 4 + (rng() - 0.5) * 1.5,
        stage,
        plantedDay: startDay - Math.floor(rng() * 5),
        harvestedDay: null,
      });
      index++;
    }
  }

  return { id, x, y, width, height, crops };
}

/**
 * Advance crop growth by elapsed days.
 * Returns new field with updated stages.
 * Pure — does not mutate input.
 */
export function advanceWheatGrowth(
  field: WheatField,
  currentDay: number,
): WheatField {
  const crops = field.crops.map((crop) => {
    const daysSincePlant = currentDay - crop.plantedDay;

    let newStage = crop.stage;
    if (crop.stage === 4 && crop.harvestedDay !== null) {
      // Harvested → soil after regrowth period.
      if (currentDay - crop.harvestedDay >= WHEAT_GROWTH_DAYS.harvestedToSoil) {
        newStage = 0;
      }
    } else if (crop.stage !== 4) {
      // Calculate target stage directly (can advance multiple stages).
      const toPlanted = WHEAT_GROWTH_DAYS.soilToPlanted;
      const toGrowing = toPlanted + WHEAT_GROWTH_DAYS.plantedToGrowing;
      const toMature = toGrowing + WHEAT_GROWTH_DAYS.growingToMature;

      if (daysSincePlant >= toMature) {
        newStage = 3;
      } else if (daysSincePlant >= toGrowing) {
        newStage = 2;
      } else if (daysSincePlant >= toPlanted) {
        newStage = 1;
      } else {
        newStage = 0;
      }
      // Don't regress: keep max of current and calculated.
      if (newStage < crop.stage && crop.stage !== 0) {
        newStage = crop.stage;
      }
    }
    // Stage 3 (mature) stays until harvested.

    if (newStage === crop.stage) return crop;
    return { ...crop, stage: newStage };
  });

  return { ...field, crops };
}

/**
 * Harvest a mature crop. Returns { field, wheatYield }.
 * Only stage 3 crops can be harvested. Harvesting sets stage to 4.
 */
export function harvestWheatCrop(
  field: WheatField,
  cropId: string,
  currentDay: number,
): { field: WheatField; wheatYield: number } {
  const crop = field.crops.find((c) => c.id === cropId);
  if (!crop || crop.stage !== 3) {
    return { field, wheatYield: 0 }; // Cannot harvest.
  }

  const crops = field.crops.map((c) =>
    c.id === cropId
      ? { ...c, stage: 4 as WheatStage, harvestedDay: currentDay }
      : c
  );

  return {
    field: { ...field, crops },
    wheatYield: WHEAT_PER_CROP,
  };
}

/**
 * Count crops by stage.
 */
export function countCropsByStage(field: WheatField): Record<WheatStage, number> {
  const counts: Record<WheatStage, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const crop of field.crops) {
    counts[crop.stage]++;
  }
  return counts;
}

/**
 * Get harvestable crops (stage 3).
 */
export function harvestableCrops(field: WheatField): WheatCrop[] {
  return field.crops.filter((c) => c.stage === 3);
}
