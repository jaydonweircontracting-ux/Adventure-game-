// ---------------------------------------------------------------------------
// BUILD 959: Kenney Fantasy Town Kit (CC0) modular piece compositions.
//
// The kit ships MODULAR PIECES, not complete houses (see the reference
// image of pieces laid out). A house exterior is therefore ASSEMBLED from
// genuinely different structures — not one template recolored:
//   - widths: 3-cell cottages/shops and 5-cell grand houses/halls
//   - heights: single-story rows and two-story rows (tower, tall house)
//   - upper levels: solid walls or open BALCONY levels (balcony-wall)
//   - fronts: hanging BANNERS flanking the door (tavern, banner shop)
//   - shops: an OVERHANG awning above the door (shop-awning)
//   - roofs: gable, green hip, tall red, tall red with dormer, pointed
//   - chimneys: left, right, both, or none (barn)
//   - entrances: door leaf (stone/timber) or open arch (gatehouse)
//
// THE DOOR INVARIANT (standing door/path rule): every composition puts
// its ONE entrance piece at the EXACT CENTER cell of an odd-width row
// (cell 1 of 3, cell 2 of 5), so the painted door sits at 50% of the
// composition width — the footprint center, i.e. the door trigger's x
// (fieldDoorPosition 51% / newHouseDoorPosition 50% of rect width; max
// deviation 1% of rect width, asserted for every variant in verify959).
// Balconies, banners, awnings, and chimneys never move the door: upper
// rows carry windows/balconies only, banners hang inside the door cell's
// margins, the awning sits above the door, chimneys sit on the roof.
// The composition is drawn centered on the footprint's base-center anchor
// with its bottom on the ground line (baseY), so painted door == trigger
// == exit == path endpoint by construction, for every house.
//
// This module is PURE (no DOM, no React): composition tables + canvas
// draw helper + geometry constants. The iso renderer (IsoFieldView)
// owns image loading/caching and calls drawKenneyHouse in the same
// under-roof gate the old overlay used.
//
// License: Fantasy Town Kit 2.0 by Kenney (www.kenney.nl), CC0 1.0.
// License.txt ships alongside the pieces in public/sprites/town-sprites/.
// Only the 2D Previews PNGs ship; the kit's 3D models do not.
// The two landmark composites (windmill/watermill) are DERIVED images
// built from kit pieces by scripts/make-town-composites.py — the kit
// ships only the rotor (windmill.png) and the wheel (watermill.png),
// no complete mill building.
// ---------------------------------------------------------------------------

/** Public-dir path of a town-kit piece (no leading slash; artUrl adds base). */
export const TOWN_SPRITE_DIR = 'sprites/town-sprites';

/** Full public path for a piece name (without the .png suffix). */
export function townSpritePath(piece: string): string {
  return `${TOWN_SPRITE_DIR}/${piece}.png`;
}

/** Expected painted-door center as a fraction of composition width. */
export const KENNEY_DOOR_CENTER_FRACTION = 0.5;

/** Landmark composites (derived from kit pieces, see header + script). */
export const WINDMILL_ASSET = 'sprites/town-sprites/windmill-composite.png';
export const WATERMILL_ASSET = 'sprites/town-sprites/watermill-composite.png';

/**
 * One house exterior, assembled from kit pieces.
 * walls: the ground row, length 3 or 5 (odd only — the entrance MUST be
 *   the center cell). Exactly one entry includes 'door' (door leaf or
 *   open doorway arch); every other entry is a window wall.
 * upperWalls: optional second row, same length, windows/balconies ONLY
 *   (never a door) — the entrance stays in the ground row.
 * roof: single piece stretched across the full composition width.
 * chimneyPiece: stack piece (default 'chimney'); chimneySides: where
 *   stacks rise from the roof (default ['right']); [] = none (barn).
 * banners: [left, right] hanging signs flanking the door cell, or null.
 * awning: overhang slab drawn above the door cell, or null.
 */
export interface KenneyHouseComposition {
  walls: string[];
  upperWalls?: string[];
  roof: string;
  chimneyPiece?: string | null;
  chimneySides?: ('left' | 'right')[];
  banners?: [string, string] | null;
  awning?: string | null;
}

/**
 * BUILD 959: slab crop for wall-family pieces. Every Kenney wall render
 * is a 64x64 frame whose actual wall slab occupies only the middle
 * (measured alpha bboxes, 2026-10-22): walls/doors/windows/balconies all
 * sit at x14..50, y13..51, except wall-window-shutters at x14..51,
 * y11..52. Tiling full frames leaves 28px transparent gaps between
 * slabs (the floating-slabs look seen in the first browser pass), so
 * wall rows draw source-cropped to the slab: cells become fully opaque
 * and adjacent cells touch. Roofs, chimneys, banners, and awnings are
 * NOT cropped (single positioned pieces, never tiled).
 */
const KENNEY_WALL_CROP: Record<string, [number, number, number, number]> = {
  'wall-window-shutters': [14, 11, 37, 41],
};
const KENNEY_WALL_CROP_DEFAULT: [number, number, number, number] = [14, 13, 36, 38];
function kenneyWallCrop(piece: string): [number, number, number, number] {
  return KENNEY_WALL_CROP[piece] ?? KENNEY_WALL_CROP_DEFAULT;
}
export function kenneyDoorCellIndex(comp: KenneyHouseComposition): number {
  return comp.walls.findIndex((p) => p.includes('door'));
}

/** Painted-door center as a fraction of composition width. Must be 0.5. */
export function kenneyDoorCenterFraction(comp: KenneyHouseComposition): number {
  const cells = comp.walls.length;
  const door = kenneyDoorCellIndex(comp);
  if (door < 0) return -1;
  return (door + 0.5) / cells;
}

const S = {
  glass: 'wall-window-glass',
  shutters: 'wall-window-shutters',
  small: 'wall-window-small',
  round: 'wall-window-round',
  stone: 'wall-window-stone',
  door: 'wall-door',
  arch: 'wall-doorway-square',
  wGlass: 'wall-wood-window-glass',
  wShutters: 'wall-wood-window-shutters',
  wRound: 'wall-wood-window-round',
  wSmall: 'wall-wood-window-small',
  wDoor: 'wall-wood-door',
  balc: 'balcony-wall',
  balcFence: 'balcony-wall-fence',
} as const;

/** One composition per live building-variant key (see BUILDING_VARIANTS). */
export const KENNEY_HOUSE_COMPOSITIONS: Record<string, KenneyHouseComposition> = {
  // --- Stone cottages & houses (3-cell, single story) ---
  'blue-cottage': { walls: [S.glass, S.door, S.glass], roof: 'roof-gable', chimneySides: ['right'] },
  'red-cottage': { walls: [S.shutters, S.door, S.shutters], roof: 'roof-high', chimneySides: ['right'] },
  'green-cottage': { walls: [S.glass, S.door, S.glass], roof: 'roof', chimneySides: ['right'] },
  'stone-cottage': { walls: [S.stone, S.door, S.stone], roof: 'roof-gable', chimneySides: ['right'] },
  'plaster-house': { walls: [S.shutters, S.door, S.shutters], roof: 'roof', chimneySides: ['left'] },
  'blue-house': { walls: [S.round, S.door, S.round], roof: 'roof-gable', chimneySides: ['right'] },
  'brick-shop': { walls: [S.small, S.door, S.small], roof: 'roof-high', chimneySides: ['left'] },
  // Tavern: dormer roof + hanging banners flanking the door.
  'tavern': {
    walls: [S.shutters, S.door, S.shutters], roof: 'roof-high-window',
    chimneySides: ['right'], banners: ['banner-green', 'banner-red'],
  },
  // Gatehouse: open square arch instead of a door leaf, pointed roof.
  'gatehouse': { walls: [S.stone, S.arch, S.stone], roof: 'roof-high-point', chimneySides: ['right'] },
  // Tower: two stories, small windows, pointed roof.
  'story-tower': {
    walls: [S.small, S.door, S.small],
    upperWalls: [S.small, S.small, S.small],
    roof: 'roof-high-point', chimneySides: ['right'],
  },
  // --- Wide houses (5-cell, door at center cell 2) ---
  'cottage-wide': {
    walls: [S.glass, S.glass, S.door, S.glass, S.glass],
    roof: 'roof-gable', chimneySides: ['left'],
  },
  'hall-grand': {
    walls: [S.shutters, S.shutters, S.door, S.shutters, S.shutters],
    roof: 'roof-high-point', chimneySides: ['left', 'right'],
  },
  // Balcony house: open balcony level above the ground row.
  'house-balcony': {
    walls: [S.glass, S.door, S.glass],
    upperWalls: [S.balcFence, S.balc, S.balcFence],
    roof: 'roof-gable', chimneySides: ['right'],
  },
  // Tall townhouse: stone ground floor, timber upper floor.
  'house-tall': {
    walls: [S.glass, S.door, S.glass],
    upperWalls: [S.wGlass, S.wGlass, S.wGlass],
    roof: 'roof-high', chimneySides: ['right'],
  },
  // --- Timber shops & houses (3-cell, single story) ---
  'red-shop': { walls: [S.wShutters, S.wDoor, S.wShutters], roof: 'roof-high', chimneySides: ['right'] },
  'green-shop': { walls: [S.wGlass, S.wDoor, S.wGlass], roof: 'roof', chimneySides: ['right'] },
  'house-timber': { walls: [S.wGlass, S.wDoor, S.wGlass], roof: 'roof-gable', chimneySides: ['right'] },
  // Shop with an overhang awning above the door.
  'shop-awning': {
    walls: [S.wRound, S.wDoor, S.wRound], roof: 'roof-gable',
    chimneySides: ['right'], awning: 'overhang',
  },
  // Banner shop: hanging signs flanking the door.
  'shop-banner': {
    walls: [S.wGlass, S.wDoor, S.wGlass], roof: 'roof',
    chimneySides: ['right'], banners: ['banner-red', 'banner-green'],
  },
  // Grand inn: 5-cell timber, tall roof, twin chimneys.
  'inn-large': {
    walls: [S.wShutters, S.wShutters, S.wDoor, S.wShutters, S.wShutters],
    roof: 'roof-high', chimneySides: ['left', 'right'],
  },
  // Iso normalizes hut-thatched -> green-cottage before drawing; mapped
  // here too so any direct caller gets the same composition.
  'hut-thatched': { walls: [S.glass, S.door, S.glass], roof: 'roof', chimneySides: ['right'] },
  // Farmstead scenery (iso only, no doors/triggers): farmhouse + barn.
  'farmhouse': { walls: [S.wGlass, S.wDoor, S.wGlass], roof: 'roof-high-window', chimneySides: ['right'] },
  'barn': { walls: [S.wSmall, S.wDoor, S.wSmall], roof: 'roof-high', chimneySides: [] },
};

/** Composition for a variant key; unknown keys fall back to blue-cottage. */
export function kenneyCompositionFor(variant: string): KenneyHouseComposition {
  return KENNEY_HOUSE_COMPOSITIONS[variant] ?? KENNEY_HOUSE_COMPOSITIONS['blue-cottage'];
}

/** Every distinct piece file a composition can reference (for preloading). */
export const KENNEY_PIECE_PATHS: string[] = (() => {
  const seen = new Set<string>();
  for (const comp of Object.values(KENNEY_HOUSE_COMPOSITIONS)) {
    const pieces = [
      ...comp.walls, ...(comp.upperWalls ?? []), comp.roof,
      ...((comp.chimneySides ?? ['right']).length > 0 ? [comp.chimneyPiece ?? 'chimney'] : []),
      ...(comp.banners ?? []), ...(comp.awning ? [comp.awning] : []),
    ];
    for (const piece of pieces) seen.add(townSpritePath(piece));
  }
  return [...seen].sort();
})();

/**
 * Composition height in units of cell width (cell = composition width /
 * cell count): wall rows + roof rise above the wall top + chimney poke
 * above the roof. Documentation for the renderer; the draw is explicit.
 */
export function kenneyCompositionHeightCells(comp: KenneyHouseComposition): number {
  const rows = comp.upperWalls ? 2 : 1;
  const roofTop = rows + 0.9 - 0.16; // rows + roofH - overlap
  const chimneyTop = (comp.chimneySides ?? ['right']).length > 0 ? roofTop + 0.61 : roofTop;
  return Math.max(rows, chimneyTop);
}

type DrawableImage = {
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
};

/**
 * Draw one assembled house exterior on a canvas context.
 * (x, yBottom, w): composition box — left, ground line, full width.
 * The ground wall row sits on the ground line with the entrance at its
 * center cell; an upper row (walls/balcony) sits above it; the roof
 * spans the full width above (slightly overlapping the wall top, as a
 * real roof overhangs); chimneys rise from the roof slope; banners hang
 * inside the door cell's margins; the awning sits above the door.
 * Missing images are skipped (graceful fallback, same pattern as
 * BUILD 806's sprite wait). Pixel-art pieces draw unsmoothed so 64px
 * art stays crisp at scale.
 */
export function drawKenneyHouse(
  g: CanvasRenderingContext2D,
  imgs: Record<string, DrawableImage | HTMLImageElement | null | undefined>,
  comp: KenneyHouseComposition,
  x: number,
  yBottom: number,
  w: number,
): void {
  const cells = comp.walls.length;
  const cellW = w / cells;
  const rows = comp.upperWalls ? 2 : 1;
  const wallTop = yBottom - rows * cellW;
  const draw = (piece: string, dx: number, dy: number, dw: number, dh: number, crop?: [number, number, number, number]): void => {
    const img = imgs[townSpritePath(piece)] as (DrawableImage & { naturalWidth: number }) | null | undefined;
    if (!img || !img.complete || img.naturalWidth <= 0) return;
    if (crop) {
      g.drawImage(img as unknown as CanvasImageSource, crop[0], crop[1], crop[2], crop[3], dx, dy, dw, dh);
    } else {
      g.drawImage(img as unknown as CanvasImageSource, dx, dy, dw, dh);
    }
  };
  g.save();
  g.imageSmoothingEnabled = false;
  // Ground row: entrance at the center cell, windows elsewhere.
  // Wall rows draw slab-cropped so adjacent cells touch (BUILD 959 fix:
  // full frames leave transparent gaps between slabs).
  for (let c = 0; c < cells; c++) {
    draw(comp.walls[c], x + c * cellW, yBottom - cellW, cellW, cellW, kenneyWallCrop(comp.walls[c]));
  }
  // Upper row (walls/balcony): windows only, never a door.
  if (comp.upperWalls) {
    for (let c = 0; c < cells; c++) {
      draw(comp.upperWalls[c], x + c * cellW, yBottom - 2 * cellW, cellW, cellW, kenneyWallCrop(comp.upperWalls[c]));
    }
  }
  // Roof: one piece stretched across the full width, overlapping the
  // wall top by 0.16 cell so no gap shows between wall and roof.
  const roofH = cellW * 0.9;
  const roofY = wallTop - roofH + cellW * 0.16;
  draw(comp.roof, x, roofY, w, roofH);
  // Chimneys: foot planted mid-roof-slope, top above the ridge.
  const chimPiece = comp.chimneyPiece ?? 'chimney';
  const sides = comp.chimneySides ?? ['right'];
  for (const side of sides) {
    const chimW = cellW * 0.55;
    const chimH = cellW * 1.15;
    const chimBottom = roofY + roofH * 0.6;
    const chimX = side === 'left' ? x + w * 0.08 : x + w * 0.74;
    draw(chimPiece, chimX, chimBottom - chimH, chimW, chimH);
  }
  // Banners: narrow vertical signs hanging inside the door cell's
  // left/right margins (the door arch itself is centered, so the
  // margins are free — the door never moves).
  if (comp.banners) {
    const doorIdx = kenneyDoorCellIndex(comp);
    const doorLeft = x + doorIdx * cellW;
    const banW = cellW * 0.32;
    const banH = cellW * 0.95;
    const banY = yBottom - cellW + cellW * 0.02;
    draw(comp.banners[0], doorLeft + cellW * 0.03, banY, banW, banH);
    draw(comp.banners[1], doorLeft + cellW - cellW * 0.03 - banW, banY, banW, banH);
  }
  // Awning: overhang slab above the door, slightly wider than the cell.
  if (comp.awning) {
    const doorIdx = kenneyDoorCellIndex(comp);
    const doorCx = x + (doorIdx + 0.5) * cellW;
    const awnW = cellW * 1.6;
    const awnH = cellW * 0.35;
    draw(comp.awning, doorCx - awnW / 2, wallTop - awnH + cellW * 0.12, awnW, awnH);
  }
  g.restore();
}
