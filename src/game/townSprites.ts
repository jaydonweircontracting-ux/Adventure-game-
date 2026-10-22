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
// owns image loading/caching and calls drawKenneyHouse whenever the
// field view is active (BUILD 980: exteriors show whenever the player is
// not in an interior — the old under-roof gate is gone).
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
 * BUILD 980: kit-native face geometry (measured 2026-10-22 from the PNG
 * alpha masks — the 959 slab-crop is retired). Every wall-family piece
 * is the SAME face parallelogram in its 64x64 frame: TL (15,13),
 * TR (48,20), BR (48,50), BL (15,43) — along-vector (33,7), height (0,30).
 * (Shutters differ by 1-2px; the standard grid absorbs it.) Tiling places
 * each tile's BL on the band line advancing (33,7) per tile, so tiles
 * share edges exactly (BR_k == BL_{k+1}, TR_k == TL_{k+1}): a genuinely
 * receding oblique wall. The 959 crop (bbox stretched to a square cell,
 * tiled at constant y) flattened that slant into a flat row, and the
 * frame-positioned roof then floated 0.09-0.23 cells above the wall top:
 * the roof slabs' bottoms sit at frame y 36-52, not at the frame bottom,
 * and their bottom edges are slanted — so positioning by the frame
 * cannot seat any roof on any wall. Roofs now tile one per wall cell at
 * the SAME scale, each tile's bottom edge anchored exactly on its wall
 * cell's top edge. Per-piece bottom edges (image space, slab masks):
 * roof (12,49)-(51,42), roof-gable (14,36)-(52,46),
 * roof-high / roof-high-window (17,51)-(46,41),
 * roof-high-point (16,47)-(47,48). Bottoms that rise to the right are
 * drawn mirrored so every roof bottom falls to the right like the wall
 * top; each roof stretches in x so its bottom spans exactly one 33px
 * wall cell (roof 33/39, gable 33/38, high 33/29, high-point 33/31).
 * High-point's nearly flat bottom (slope 0.03 vs the wall top's 0.21)
 * is planted with a 6*s downward offset so its shallow end lands on the
 * wall top instead of leaving a notch.
 */
export const KENNEY_WALL_FACE = {
  tl: [15, 13] as [number, number],
  tr: [48, 20] as [number, number],
  br: [48, 50] as [number, number],
  bl: [15, 43] as [number, number],
};
/** Wall-face along-vector (image px per tile) and face height. */
export const KENNEY_WALL_ALONG = 33;
export const KENNEY_WALL_DROP = 7;
export const KENNEY_WALL_HEIGHT = 30;
/** Roof bottom edge (image space) + mirror flag + x-stretch for one cell.
 *  The wall top falls right (screen y grows 7px per 33px cell), so every
 *  roof bottom must fall right too: pieces whose bottom rises right are
 *  mirrored, pieces whose bottom already falls right are drawn as-is.
 *  stretchX scales the bottom edge to exactly one 33px wall cell, so
 *  each roof tile's bottom edge lands on its wall cell's top edge — or
 *  dips into the wall where the slab is steeper than the wall top (never
 *  above it, so no gap can open). yOffS is an extra downward anchor
 *  offset in units of s, needed only where the slab is flatter than the
 *  wall top (roof-high-point: its 1px drop over the cell would leave a
 *  6*s notch at the cell's right end; the offset plants the shallow end
 *  on the wall top and dips the deep end into the wall instead). */
export interface KenneyRoofGeometry {
  bl: [number, number];
  br: [number, number];
  flip: boolean;
  stretchX: number;
  yOffS: number;
}
export const KENNEY_ROOF_GEOMETRY: Record<string, KenneyRoofGeometry> = {
  // Bottom (12,49)-(51,42): rises right, so mirrored; 39px -> 33px cell.
  // Drop 7px matches the wall top exactly: an exact join.
  'roof': { bl: [12, 49], br: [51, 42], flip: true, stretchX: 33 / 39, yOffS: 0 },
  // Bottom (14,36)-(52,46): falls right as-is; 38px -> 33px cell.
  // Drop 10px is steeper than the wall top: the right end dips 3*s into
  // the wall — no gap, just overlap.
  'roof-gable': { bl: [14, 36], br: [52, 46], flip: false, stretchX: 33 / 38, yOffS: 0 },
  // Bottom (17,51)-(46,41): rises right, so mirrored; 29px -> 33px cell.
  // Drop 10px: right end dips 3*s into the wall.
  'roof-high': { bl: [17, 51], br: [46, 41], flip: true, stretchX: 33 / 29, yOffS: 0 },
  // Same slab as roof-high, with a window.
  'roof-high-window': { bl: [17, 51], br: [46, 41], flip: true, stretchX: 33 / 29, yOffS: 0 },
  // Bottom (16,47)-(47,48): falls right as-is, nearly flat (1px drop);
  // 31px -> 33px cell, plus the 6*s offset (see yOffS) for a gap-free join.
  'roof-high-point': { bl: [16, 47], br: [47, 48], flip: false, stretchX: 33 / 31, yOffS: 6 },
};
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
 * cell count): wall rows (30 image px each) + roof rise (~30 image px)
 * + chimney poke (~7.5 image px) above the ridge, all at the wall scale
 * s = cellW / 33. Documentation for the renderer; the draw is explicit.
 */
export function kenneyCompositionHeightCells(comp: KenneyHouseComposition): number {
  const rows = comp.upperWalls ? 2 : 1;
  const roofTop = (rows * 30 + 30) / 33;
  const chimneyTop = (comp.chimneySides ?? ['right']).length > 0 ? (rows * 30 + 37.5) / 33 : roofTop;
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
 * The wall band's LAST tile bottom-right lands exactly at (x + w,
 * yBottom); the band recedes up-left from there along (33,7) per tile,
 * so the ground row sits on a slanted ground line (the kit's oblique
 * view) with the entrance at its center cell; an upper row sits exactly
 * on the ground row's top edge; the roof tiles one per wall cell with
 * each tile's bottom edge anchored exactly on its wall cell's top edge,
 * so wall and roof share an edge (no frame gap, no stretch-across slab);
 * chimneys plant on the roof slope; banners hang inside the door cell's
 * margins; the awning sits above the door. The door center stays at
 * x + w/2 exactly (same invariant as 959: the composition is centered
 * on the footprint, so painted door == trigger == exit == path end).
 * Missing images are skipped (graceful fallback, same pattern as
 * BUILD 806's sprite wait). Returns true if at least one piece drew;
 * false means every piece is missing and the caller should fall back
 * to the dollhouse base rather than leave an invisible house.
 * Pixel-art pieces draw unsmoothed so 64px art stays crisp at scale.
 */
export function drawKenneyHouse(
  g: CanvasRenderingContext2D,
  imgs: Record<string, DrawableImage | HTMLImageElement | null | undefined>,
  comp: KenneyHouseComposition,
  x: number,
  yBottom: number,
  w: number,
): boolean {
  const cells = comp.walls.length;
  // Wall scale: the band spans w over `cells` tiles of 33 image px each.
  const s = w / (cells * KENNEY_WALL_ALONG);
  const rows = comp.upperWalls ? 2 : 1;
  let drew = false;
  // Draw one 64px piece so image point (ix, iy) lands on screen (sx, sy),
  // at the wall scale (optionally stretched in x for roof cells). When
  // flip is set the image is mirrored: ix is then the ORIGINAL image x
  // that must land on sx (for roofs, the original bottom-right, whose
  // mirror is the tiled bottom-left).
  const drawAnchored = (
    piece: string, ix: number, iy: number, sx: number, sy: number,
    flip: boolean, stretchX = 1,
  ): void => {
    const img = imgs[townSpritePath(piece)] as (DrawableImage & { naturalWidth: number }) | null | undefined;
    if (!img || !img.complete || img.naturalWidth <= 0) return;
    const dw = 64 * s * stretchX;
    const dh = 64 * s;
    if (flip) {
      g.drawImage(img as unknown as CanvasImageSource, sx + ix * s * stretchX, sy - iy * s, -dw, dh);
    } else {
      g.drawImage(img as unknown as CanvasImageSource, sx - ix * s * stretchX, sy - iy * s, dw, dh);
    }
    drew = true;
  };
  g.save();
  g.imageSmoothingEnabled = false;
  // Ground row: tile k's BL sits on the band line; the last tile's BR
  // lands exactly at (x + w, yBottom). Entrance at the center cell.
  const groundBL = (c: number): [number, number] => [
    x + c * KENNEY_WALL_ALONG * s,
    yBottom - (cells - c) * KENNEY_WALL_DROP * s,
  ];
  for (let c = 0; c < cells; c++) {
    const [bx, by] = groundBL(c);
    drawAnchored(comp.walls[c], KENNEY_WALL_FACE.bl[0], KENNEY_WALL_FACE.bl[1], bx, by, false);
  }
  // Upper row: each tile's BL sits exactly on the ground tile's TL
  // (shared edge, no gap, no overlap).
  const topY = (c: number, row: number): [number, number] => {
    const [bx, by] = groundBL(c);
    return [bx, by - row * KENNEY_WALL_HEIGHT * s];
  };
  if (comp.upperWalls) {
    for (let c = 0; c < cells; c++) {
      const [bx, by] = topY(c, 1);
      drawAnchored(comp.upperWalls[c], KENNEY_WALL_FACE.bl[0], KENNEY_WALL_FACE.bl[1], bx, by, false);
    }
  }
  // Roof: one tile per wall cell, bottom edge anchored exactly on that
  // cell's top edge (top row's top for two-story houses). The wall top
  // at cell c is the top row's TL: ground BL shifted up rows*30*s.
  const roofGeo = KENNEY_ROOF_GEOMETRY[comp.roof] ?? KENNEY_ROOF_GEOMETRY['roof'];
  for (let c = 0; c < cells; c++) {
    const [tx, ty] = topY(c, rows);
    const ay = ty + roofGeo.yOffS * s;
    if (roofGeo.flip) {
      drawAnchored(comp.roof, roofGeo.br[0], roofGeo.br[1], tx, ay, true, roofGeo.stretchX);
    } else {
      drawAnchored(comp.roof, roofGeo.bl[0], roofGeo.bl[1], tx, ay, false, roofGeo.stretchX);
    }
  }
  // Chimneys: foot planted on the roof slope (~15*s above the wall top,
  // i.e. just below the ridge), stack rising ~7.5*s above the ridge.
  // The chimney graphic spans image y 12..50, so the draw rect's bottom
  // sits (64-50)/64 of its height below the graphic foot.
  const chimPiece = comp.chimneyPiece ?? 'chimney';
  const sides = comp.chimneySides ?? ['right'];
  const wallTopYAt = (screenX: number): number => {
    const [, ty0] = topY(0, rows);
    return ty0 + (screenX - x) * (KENNEY_WALL_DROP / KENNEY_WALL_ALONG);
  };
  for (const side of sides) {
    const chimW = 0.55 * KENNEY_WALL_ALONG * s;
    const chimH = 1.15 * KENNEY_WALL_ALONG * s;
    const chimX = side === 'left' ? x + w * 0.08 : x + w * 0.74;
    const footY = wallTopYAt(chimX) - 15 * s;
    const rectBottom = footY + (14 / 64) * chimH;
    const img = imgs[townSpritePath(chimPiece)] as (DrawableImage & { naturalWidth: number }) | null | undefined;
    if (!img || !img.complete || img.naturalWidth <= 0) continue;
    g.drawImage(img as unknown as CanvasImageSource, chimX - chimW / 2, rectBottom - chimH, chimW, chimH);
    drew = true;
  }
  // Banners: narrow vertical signs hanging inside the door cell's
  // left/right margins (the door arch itself is centered, so the
  // margins are free — the door never moves). Plain top-left draws at
  // the banner size (the pieces fill their frames vertically).
  if (comp.banners) {
    const doorIdx = kenneyDoorCellIndex(comp);
    const [doorBLx, doorBLy] = groundBL(doorIdx);
    const doorTLy = doorBLy - KENNEY_WALL_HEIGHT * s;
    const doorLeft = doorBLx;
    const doorRight = doorBLx + KENNEY_WALL_ALONG * s;
    const banW = 0.32 * KENNEY_WALL_ALONG * s;
    const banH = 0.95 * KENNEY_WALL_ALONG * s;
    const banY = doorTLy + 0.02 * KENNEY_WALL_ALONG * s;
    for (const [piece, bx] of [
      [comp.banners[0], doorLeft + 0.03 * KENNEY_WALL_ALONG * s],
      [comp.banners[1], doorRight - 0.03 * KENNEY_WALL_ALONG * s - banW],
    ] as const) {
      const img = imgs[townSpritePath(piece)] as (DrawableImage & { naturalWidth: number }) | null | undefined;
      if (!img || !img.complete || img.naturalWidth <= 0) continue;
      g.drawImage(img as unknown as CanvasImageSource, bx, banY, banW, banH);
      drew = true;
    }
  }
  // Awning: overhang slab above the door, slightly wider than the cell.
  if (comp.awning) {
    const doorIdx = kenneyDoorCellIndex(comp);
    const [doorBLx, doorBLy] = groundBL(doorIdx);
    const doorTLy = doorBLy - KENNEY_WALL_HEIGHT * s;
    const doorCx = doorBLx + (KENNEY_WALL_ALONG * s) / 2;
    const awnW = 1.6 * KENNEY_WALL_ALONG * s;
    const awnH = 0.35 * KENNEY_WALL_ALONG * s;
    const img = imgs[townSpritePath(comp.awning)] as (DrawableImage & { naturalWidth: number }) | null | undefined;
    if (img && img.complete && img.naturalWidth > 0) {
      g.drawImage(img as unknown as CanvasImageSource, doorCx - awnW / 2, doorTLy - awnH + 0.12 * KENNEY_WALL_ALONG * s, awnW, awnH);
      drew = true;
    }
  }
  g.restore();
  return drew;
}
