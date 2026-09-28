/**
 * Character creation sprite pipeline (build v151).
 *
 * Rebuilt around the ORIGINAL chibi player sprite
 * (`assets/cute-fantasy/player.png`, 192x320, 6 columns x 10 rows of 32x32
 * frames). The player's column (0) is recolored from the sprite's own
 * palette regions (hair / skin / shirt / pants); columns 1-5 are the
 * original NPC faces, untouched. Output geometry is identical to the
 * original sheet, so `--player-sprite-url` consumers need no changes.
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
  'v07', 'v08', 'v09', 'v10', 'v11', 'v12', 'v13',
];

export const DEFAULT_CHARACTER: CharacterChoices = {
  name: '',
  skin: 'v00',
  outfit: 'pfpn_v01',
  hairColor: 'v02',
};

/** [light, dark] skin tones, light = base. */
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

/** [light, dark] hair colors, light = base. */
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
  v09: ['2f6db3', '235286'],
  v10: ['2fa08e', '23786a'],
  v11: ['45a04e', '34783a'],
  v12: ['7d4da3', '5e3a7b'],
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

let spriteCache: { url: string; img: HTMLImageElement } | null = null;

function loadSprite(url: string): Promise<HTMLImageElement> {
  if (spriteCache && spriteCache.url === url) return Promise.resolve(spriteCache.img);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      spriteCache = { url, img };
      resolve(img);
    };
    img.onerror = () => reject(new Error('player sprite failed to load: ' + url));
    img.src = url;
  });
}

const SHEET_W = 192;
const SHEET_H = 320;

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
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_W;
  canvas.height = SHEET_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, SHEET_W, SHEET_H);
  const palette = paletteFor(choices);
  const data = ctx.getImageData(0, 0, SHEET_W, SHEET_H);
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
