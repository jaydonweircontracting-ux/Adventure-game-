/**
 * Character creation sprite pipeline (build v152).
 *
 * Rebuilt around the ORIGINAL chibi player sprite
 * (`assets/cute-fantasy/player.png`, 192x320, 6 columns x 10 rows of 32x32
 * frames). The whole sheet is the player's own frames (idle, walk, attack),
 * recolored from the sprite's own palette regions (hair / skin / shirt /
 * pants). Output geometry is identical to the original sheet, so
 * `--player-sprite-url` consumers need no changes. The attack sprite
 * (`assets/gameplay/shining-fields/characters/player/attack.png`) uses the
 * same palette and is recolored the same way for `--player-attack-sprite-url`.
 *
 * Choice keys keep the v144 vocabulary (skin 'v00'-'v07', outfit keys,
 * hairColor 'v00'-'v13') so existing saves still validate; the old
 * hairStyle/hat fields are dropped (the chibi sprite has one hairstyle
 * and no hats).
 */

export interface CharacterChoices {
  name: string;
  /** skin tone key, 'v00'-'v07' */
  skin: string;
  /** outfit key, e.g. 'pfpn_v01' */
  outfit: string;
  /** hair color key, 'v00'-'v13' */
  hairColor: string;
}

export const SKIN_OPTIONS = ['v00', 'v01', 'v02', 'v03', 'v04', 'v05', 'v06', 'v07'];

export const OUTFIT_OPTIONS = [
  'pfpn_v01', 'pfpn_v02', 'pfpn_v03', 'pfpn_v04', 'pfpn_v05',
  'fstr_v01', 'fstr_v02', 'fstr_v03', 'fstr_v04', 'fstr_v05',
];

export const HAIR_COLOR_OPTIONS = [
  'v00', 'v01', 'v02', 'v03', 'v04', 'v05', 'v06',
  'v07', 'v08', 'v13',
];

export const DEFAULT_CHARACTER: CharacterChoices = {
  name: '',
  skin: 'v00',
  outfit: 'pfpn_v01',
  hairColor: 'v02',
};

/** [light, dark] skin tones, light = base. Realistic tones only (no blue/green/purple/yellow). */
export const SKIN_TONES: Record<string, [string, string]> = {
  v00: ['f6ca9f', 'd29f70'],
  v01: ['ffd9b3', 'd9ae86'],
  v02: ['f2b384', 'c68f61'],
  v03: ['df9a62', 'b57a4c'],
  v04: ['c07a45', '9a5f36'],
  v05: ['9c5f33', '7c4a28'],
  v06: ['74452a', '5b3520'],
  v07: ['53301e', '402416'],
};

/** [light, dark] hair colors, light = base. Realistic colors only (no blue/green/purple). */
export const HAIR_COLORS: Record<string, [string, string]> = {
  v00: ['33333d', '232328'],
  v01: ['5d2c28', '452019'],
  v02: ['704643', '55332f'],
  v03: ['8f4d2c', '6c3a20'],
  v04: ['c46a2d', '945021'],
  v05: ['e0aa45', 'aa8134'],
  v06: ['f2d98c', 'b8a468'],
  v07: ['f5e9c8', 'bab194'],
  v08: ['a8352a', '7e281f'],
  v13: ['c9c9d4', '9797a0'],
};

export interface OutfitPalette {
  /** [light, dark] shirt shades */
  shirt: [string, string];
  /** [light, mid, dark] pants shades */
  pants: [string, string, string];
}

function outfit(shirtBase: string, pantsBase: string): OutfitPalette {
  return {
    shirt: [shirtBase, shade(shirtBase, 0.7)],
    pants: [pantsBase, shade(pantsBase, 0.74), shade(pantsBase, 0.52)],
  };
}

export const OUTFITS: Record<string, OutfitPalette> = {
  pfpn_v01: { shirt: ['33984b', '1e6f50'], pants: ['0098dc', '0069aa', '134c4c'] },
  pfpn_v02: outfit('a8352a', '6b4a2f'),
  pfpn_v03: outfit('2f6db3', '3a3a44'),
  pfpn_v04: outfit('7d4da3', '55555f'),
  pfpn_v05: outfit('d08030', '5d4a2f'),
  fstr_v01: outfit('2fa08e', 'c9a86a'),
  fstr_v02: outfit('e0aa45', '2b4a7a'),
  fstr_v03: outfit('d06a9a', '2e2e36'),
  fstr_v04: outfit('8a8a95', '3a6b3a'),
  fstr_v05: outfit('7a5a2f', '5f7030'),
};

type Role = 'hair' | 'skin' | 'shirt' | 'pants';

/**
 * Original player-column palette regions, extracted from
 * `assets/cute-fantasy/player.png` column 0. Outline (#0e071b), eyes/boots
 * (#000000) and the sword-slash steel blues are deliberately unmapped and
 * stay exactly as drawn.
 */
const ROLE_COLORS: Record<Role, string[]> = {
  hair: ['704643', '5d2c28'],
  skin: ['f6ca9f', 'd29f70'],
  shirt: ['33984b', '1e6f50'],
  pants: ['0098dc', '0069aa', '134c4c'],
};

/** hex (no #) -> { role, shadeIndex }, shades ordered light -> dark. */
const ROLE_LOOKUP = (() => {
  const map = new Map<string, { role: Role; index: number }>();
  (Object.keys(ROLE_COLORS) as Role[]).forEach((role) => {
    const ordered = [...ROLE_COLORS[role]].sort((a, b) => luminance(b) - luminance(a));
    ordered.forEach((hex, index) => map.set(hex, { role, index }));
  });
  return map;
})();

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return h(r) + h(g) + h(b);
}

function shade(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

interface RecolorPalette {
  hair: [string, string];
  skin: [string, string];
  shirt: [string, string];
  pants: [string, string, string];
}

function paletteFor(choices: CharacterChoices): RecolorPalette {
  return {
    hair: HAIR_COLORS[choices.hairColor] || HAIR_COLORS.v02,
    skin: SKIN_TONES[choices.skin] || SKIN_TONES.v00,
    shirt: (OUTFITS[choices.outfit] || OUTFITS.pfpn_v01).shirt,
    pants: (OUTFITS[choices.outfit] || OUTFITS.pfpn_v01).pants,
  };
}

const spriteCache = new Map<string, HTMLImageElement>();

function loadSprite(url: string): Promise<HTMLImageElement> {
  const cached = spriteCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      spriteCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('player sprite failed to load: ' + url));
    img.src = url;
  });
}

const SHEET_W = 192;
const SHEET_H = 320;

/**
 * Recolor an image's pixels with the palette and return a PNG data URL.
 * Only exact palette-region colors are swapped; outline, eyes, weapons,
 * and effects are untouched.
 */
function recolorToDataUrl(
  img: HTMLImageElement,
  w: number,
  h: number,
  palette: RecolorPalette,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const entry = ROLE_LOOKUP.get(rgbToHex(px[i], px[i + 1], px[i + 2]));
    if (!entry) continue;
    const shades = palette[entry.role];
    const [r, g, b] = hexToRgb(shades[Math.min(entry.index, shades.length - 1)]);
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Build the player sheet: the original sprite recolored to the player's
 * choices. The whole sheet is the player's own frames (idle, walk, attack),
 * so every column is recolored. Returns a PNG data URL for
 * `--player-sprite-url`.
 */
export async function compositeCharacterSheet(
  choices: CharacterChoices,
  playerSpriteUrl: string,
): Promise<string> {
  const img = await loadSprite(playerSpriteUrl);
  return recolorToDataUrl(img, SHEET_W, SHEET_H, paletteFor(choices));
}

/**
 * Build the attack sprite recolored to the player's choices. Same palette
 * regions as the main sheet; the weapon stays as-is. Returns a PNG data
 * URL for `--player-attack-sprite-url`.
 */
export async function compositeAttackSprite(
  choices: CharacterChoices,
  attackSpriteUrl: string,
): Promise<string> {
  const img = await loadSprite(attackSpriteUrl);
  return recolorToDataUrl(img, img.naturalWidth, img.naturalHeight, paletteFor(choices));
}

/** Validate choices loaded from a save before compositing. */
export function sanitizeCharacterChoices(value: unknown): CharacterChoices | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<CharacterChoices>;
  if (typeof v.skin !== 'string' || !SKIN_OPTIONS.includes(v.skin)) return null;
  if (typeof v.outfit !== 'string' || !OUTFIT_OPTIONS.includes(v.outfit)) return null;
  if (typeof v.hairColor !== 'string' || !HAIR_COLOR_OPTIONS.includes(v.hairColor)) return null;
  return {
    name: typeof v.name === 'string' ? v.name.slice(0, 24) : '',
    skin: v.skin,
    outfit: v.outfit,
    hairColor: v.hairColor,
  };
}
