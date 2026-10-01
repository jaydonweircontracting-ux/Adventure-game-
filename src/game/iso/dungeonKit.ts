// dungeonKit.ts — isometric dungeon prop kit ("Isometric_Free_Sample" pack)
// for the cellar/prison interiors in IsoInteriorView.
//
// BUILD 388: brick walls, wall torches, floor tiles, pillars and chests drawn
// from real sprite strips instead of flat procedural fills. Collision,
// furniture positions and solidity are untouched — this is purely visual.
//
// Each PNG is a strip of 4 panels; panel content bounds were measured from the
// alpha channel (there are a few px of transparent padding between panels).
// Missing assets warn once and draw nothing; the caller falls back to the
// procedural room when the kit isn't ready.

export type DungeonKitKey =
  | 'wall' | 'floor' | 'torch' | 'pillar'
  | 'chestBase' | 'chestTop' | 'armor';

const KIT_FILES: Record<DungeonKitKey, string> = {
  wall: 'WallBrick_Tall_01.png',
  floor: 'Floor_Corner_01.png',
  torch: 'Torch_Wall_01.png',
  pillar: 'Pillar_03.png',
  chestBase: 'SmallChest_02.png',
  chestTop: 'SmallChest_Top_02.png',
  armor: 'Armor_01.png',
};

export interface PanelRect { x: number; y: number; w: number; h: number }

// Measured content rects (4 panels each). wall panels: 0,2 = light (west
// wall, runs up-right), 1,3 = dark (north wall, runs down-right).
export const KIT_PANELS: Record<DungeonKitKey, PanelRect[]> = {
  wall: [
    { x: 4, y: 4, w: 204, h: 302 },
    { x: 217, y: 4, w: 204, h: 302 },
    { x: 430, y: 4, w: 204, h: 302 },
    { x: 643, y: 4, w: 204, h: 302 },
  ],
  floor: [
    { x: 4, y: 4, w: 400, h: 238 },
    { x: 413, y: 4, w: 400, h: 238 },
    { x: 822, y: 4, w: 400, h: 238 },
    { x: 1231, y: 4, w: 400, h: 238 },
  ],
  torch: [
    { x: 4, y: 12, w: 60, h: 74 },
    { x: 73, y: 12, w: 60, h: 74 },
    { x: 142, y: 12, w: 60, h: 74 },
    { x: 211, y: 12, w: 60, h: 74 },
  ],
  pillar: [
    { x: 12, y: 10, w: 64, h: 228 },
    { x: 101, y: 10, w: 64, h: 228 },
    { x: 190, y: 10, w: 64, h: 228 },
    { x: 279, y: 10, w: 64, h: 228 },
  ],
  chestBase: [
    { x: 8, y: 4, w: 116, h: 84 },
    { x: 137, y: 4, w: 116, h: 84 },
    { x: 262, y: 4, w: 116, h: 84 },
    { x: 391, y: 4, w: 116, h: 84 },
  ],
  chestTop: [
    { x: 8, y: 14, w: 116, h: 90 },
    { x: 145, y: 14, w: 116, h: 90 },
    { x: 286, y: 14, w: 116, h: 90 },
    { x: 423, y: 14, w: 116, h: 90 },
  ],
  armor: [
    { x: 16, y: 16, w: 88, h: 172 },
    { x: 141, y: 16, w: 88, h: 172 },
    { x: 270, y: 16, w: 88, h: 172 },
    { x: 395, y: 16, w: 88, h: 172 },
  ],
};

/** Strip pixel dimensions, for bounds-checking the panel table. */
export const KIT_DIMS: Record<DungeonKitKey, { w: number; h: number }> = {
  wall: { w: 852, h: 311 },
  floor: { w: 1636, h: 249 },
  torch: { w: 276, h: 91 },
  pillar: { w: 356, h: 249 },
  chestBase: { w: 516, h: 93 },
  chestTop: { w: 548, h: 121 },
  armor: { w: 500, h: 203 },
};

// ---------------------------------------------------------------------------
// Pure selectors (deterministic variety, tested in simulate.ts)
// ---------------------------------------------------------------------------

/** Wall panel for the i-th 2-tile segment: dark (1,3) on north, light (0,2) on west. */
export function wallPanelFor(side: 'north' | 'west', i: number): number {
  const k = ((i % 2) + 2) % 2;
  return side === 'north' ? (k === 0 ? 1 : 3) : (k === 0 ? 0 : 2);
}

/** Floor panel for a tile — scattered variety, no visible repetition axis. */
export function floorPanelFor(tx: number, ty: number): number {
  return (((tx * 3 + ty) % 4) + 4) % 4;
}

/** Torch variant for the i-th torch. */
export function torchPanelFor(i: number): number {
  return (((i % 4) + 4) % 4);
}

/** Pillar variant for the i-th pillar. */
export function pillarPanelFor(i: number): number {
  return (((i % 4) + 4) % 4);
}

/** Chest variant for a chest at a tile. */
export function chestPanelFor(tx: number, ty: number): number {
  return ((((tx + ty) % 4) + 4) % 4);
}

// ---------------------------------------------------------------------------
// Loading (warn once, never per frame)
// ---------------------------------------------------------------------------

const kitCache: Partial<Record<DungeonKitKey, HTMLImageElement>> = {};
let kitPreloaded = false;
const kitWarned = new Set<string>();

export function preloadDungeonKit(): void {
  if (kitPreloaded) return;
  kitPreloaded = true;
  (Object.keys(KIT_FILES) as DungeonKitKey[]).forEach((k) => {
    const img = new Image();
    img.onerror = () => {
      if (!kitWarned.has(k)) {
        kitWarned.add(k);
        console.warn(`[dungeonKit] asset failed to load: ${KIT_FILES[k]}`);
      }
    };
    img.src = `${import.meta.env.BASE_URL}iso-dungeon/${KIT_FILES[k]}`;
    kitCache[k] = img;
  });
}

/** True once every kit image has loaded with real pixels. */
export function dungeonKitReady(): boolean {
  return (Object.keys(KIT_FILES) as DungeonKitKey[]).every((k) => {
    const im = kitCache[k];
    return im !== undefined && im.complete && im.naturalWidth > 0;
  });
}

function kitImage(key: DungeonKitKey): HTMLImageElement | undefined {
  const im = kitCache[key];
  return im && im.complete && im.naturalWidth > 0 ? im : undefined;
}

// ---------------------------------------------------------------------------
// Canvas draw helpers (no-ops when the asset is missing)
// ---------------------------------------------------------------------------

/**
 * Draw a wall panel onto a slanted wall face. (ax,ay) is the source panel's
 * bottom-left corner target, (bx,by) the bottom-right corner target, following
 * the art's own left-to-right direction; the top edge is `height` px above.
 * Uses an affine transform so the 2:1 iso slant stays exact at any zoom.
 */
export function drawWallPanel(
  g: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number, height: number,
  panel: number,
): void {
  const img = kitImage('wall');
  const r = KIT_PANELS.wall[panel];
  if (!img || !r || height <= 0) return;
  const a = (bx - ax) / r.w;
  const b = (by - ay) / r.w;
  const c = 0;
  const d = height / r.h;
  const e = ax - a * r.x;
  const f = ay - height - b * r.x - d * r.y;
  g.save();
  g.transform(a, b, c, d, e, f);
  g.drawImage(img, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  g.restore();
}

/** Billboard sprite, bottom-center anchored at (cx, yBase), drawn `w` px wide. */
export function drawKitBillboard(
  g: CanvasRenderingContext2D,
  key: DungeonKitKey, panel: number,
  cx: number, yBase: number, w: number,
): void {
  const img = kitImage(key);
  const r = KIT_PANELS[key][panel];
  if (!img || !r || w <= 0) return;
  const h = (r.h / r.w) * w;
  g.drawImage(img, r.x, r.y, r.w, r.h, cx - w / 2, yBase - h, w, h);
}

/**
 * Floor diamond centered at (cx, cy), `w` px wide. The south edge row gets the
 * full tile with its stone skirt; other tiles get the top face only.
 */
export function drawKitFloor(
  g: CanvasRenderingContext2D,
  panel: number, cx: number, cy: number, w: number, withSkirt: boolean,
): void {
  const img = kitImage('floor');
  const r = KIT_PANELS.floor[panel];
  if (!img || !r || w <= 0) return;
  // Top face occupies y 4..206 of the 238px-tall panel (2:1 diamond + skirt).
  const sy = 4;
  const sh = withSkirt ? r.h : 202;
  const dh = (sh / r.w) * w;
  g.drawImage(img, r.x, sy, r.w, sh, cx - w / 2, cy - (202 / r.w) * w / 2, w, dh);
}
