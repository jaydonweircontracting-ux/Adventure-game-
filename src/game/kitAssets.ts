// Runtime loader for the CraftPix island-kit tileset (public/kit/tileset.png).
// The ground-detail renderer slices cliff faces out of this sheet at paint
// time. Loading is lazy + cached; paint code must handle a null image (not
// yet loaded) by falling back to procedural cliff shading.
//
// Credit: "Free Island Adventure Pixel Top-Down Minigame Kit" by CraftPix.

let tileset: HTMLImageElement | null = null;
let loadPromise: Promise<HTMLImageElement> | null = null;
const listeners = new Set<() => void>();

export function getKitTileset(): HTMLImageElement | null {
  return tileset && tileset.complete && tileset.naturalWidth > 0 ? tileset : null;
}

export function ensureKitTileset(): Promise<HTMLImageElement> {
  if (getKitTileset()) return Promise.resolve(tileset as HTMLImageElement);
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        tileset = img;
        loadPromise = null;
        listeners.forEach((cb) => { try { cb(); } catch { /* ignore */ } });
        resolve(img);
      };
      img.onerror = () => {
        loadPromise = null;
        reject(new Error('kit tileset failed to load'));
      };
      img.src = 'kit/tileset.png';
    });
  }
  return loadPromise;
}

/** Subscribe to tileset-loaded events (so ground layers can repaint). Returns unsubscribe. */
export function onKitTilesetLoaded(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// ---------------------------------------------------------------------------
// Tileset map (16px grid, 39 columns). Catalogued from Tileset/Tiled.png.
// ---------------------------------------------------------------------------

export const KIT_TILE = 16;

/** Brown dirt cliff-face block: cols 32-35, rows 0-7. */
export const KIT_DIRT_CLIFF = { x: 32 * 16, y: 0, w: 4 * 16, h: 8 * 16 };
/** Gray rock cliff-face block: cols 28-31, rows 0-7. */
export const KIT_ROCK_CLIFF = { x: 28 * 16, y: 0, w: 4 * 16, h: 8 * 16 };

/**
 * A repeatable vertical slice through the middle of a cliff block, skipping
 * the grassy top row. Returned as {sx, sy, sw, sh} source pixels.
 */
export function kitCliffSlice(kind: 'dirt' | 'rock'): { sx: number; sy: number; sw: number; sh: number } {
  const block = kind === 'dirt' ? KIT_DIRT_CLIFF : KIT_ROCK_CLIFF;
  // Middle column of the block, rows 2..7 (the rocky face, no grass lip).
  return { sx: block.x + 2 * KIT_TILE, sy: block.y + 2 * KIT_TILE, sw: KIT_TILE, sh: 6 * KIT_TILE };
}

/** Grassy lip where the plateau top meets the cliff (top row of the block). */
export function kitCliffLip(kind: 'dirt' | 'rock'): { sx: number; sy: number; sw: number; sh: number } {
  const block = kind === 'dirt' ? KIT_DIRT_CLIFF : KIT_ROCK_CLIFF;
  return { sx: block.x + 2 * KIT_TILE, sy: block.y, sw: KIT_TILE, sh: KIT_TILE };
}
