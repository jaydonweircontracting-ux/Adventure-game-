/**
 * Character creation sprite pipeline (build v144).
 *
 * Composites Mana Seed "Character Base" paper-doll parts into a sprite sheet
 * that is geometrically identical to the original `assets/cute-fantasy/player.png`:
 * 192x320, 6 columns x 10 rows of 32x32 frames, with the same row semantics
 * (0-2 idle down/side/up, 3-5 walk down/side/up, 6-8 attack = walk copies, 9 spare).
 *
 * Column 0 is the player's custom character; columns 1-5 are fixed NPC presets
 * so town NPCs / simulated adventurers keep their own faces instead of cloning
 * the player.
 */

export interface CharacterChoices {
  name: string;
  /** base body variant, e.g. 'v00' (8 human skin tones v00-v07) */
  skin: string;
  /** outfit key, e.g. 'pfpn_v01' */
  outfit: string;
  /** hair style; 'none' = bald */
  hairStyle: 'none' | 'bob1' | 'dap1';
  /** hair palette variant, e.g. 'v02' */
  hairColor: string;
  /** hat key, e.g. 'pfht_v01', or null */
  hat: string | null;
}

export const SKIN_OPTIONS = ['v00', 'v01', 'v02', 'v03', 'v04', 'v05', 'v06', 'v07'];

export const OUTFIT_OPTIONS = [
  'pfpn_v01', 'pfpn_v02', 'pfpn_v03', 'pfpn_v04', 'pfpn_v05',
  'fstr_v01', 'fstr_v02', 'fstr_v03', 'fstr_v04', 'fstr_v05',
];

export const HAIR_STYLE_OPTIONS: Array<'bob1' | 'dap1'> = ['bob1', 'dap1'];

export const HAIR_COLOR_OPTIONS = [
  'v00', 'v01', 'v02', 'v03', 'v04', 'v05', 'v06',
  'v07', 'v08', 'v09', 'v10', 'v11', 'v12', 'v13',
];

export const HAT_OPTIONS = [
  'pfht_v01', 'pfht_v02', 'pfht_v03', 'pfht_v04', 'pfht_v05',
  'pnty_v01', 'pnty_v02', 'pnty_v03', 'pnty_v04',
];

export const DEFAULT_CHARACTER: CharacterChoices = {
  name: '',
  skin: 'v00',
  outfit: 'pfpn_v01',
  hairStyle: 'bob1',
  hairColor: 'v02',
  hat: null,
};

/** Fixed NPC faces for sheet columns 1-5 (town NPC roles + adventurers). */
export const NPC_PRESETS: CharacterChoices[] = [
  { name: '', skin: 'v01', outfit: 'pfpn_v02', hairStyle: 'dap1', hairColor: 'v03', hat: null },
  { name: '', skin: 'v02', outfit: 'fstr_v03', hairStyle: 'bob1', hairColor: 'v09', hat: 'pnty_v01' },
  { name: '', skin: 'v00', outfit: 'pfpn_v04', hairStyle: 'bob1', hairColor: 'v01', hat: 'pfht_v02' },
  { name: '', skin: 'v03', outfit: 'fstr_v05', hairStyle: 'dap1', hairColor: 'v00', hat: 'pfht_v04' },
  { name: '', skin: 'v04', outfit: 'pfpn_v01', hairStyle: 'none', hairColor: 'v00', hat: null },
];

const SHEET_W = 192;
const SHEET_H = 320;
const FRAME = 32;
/** Mana Seed source sheet is 512x512 with 64px frames. */
const SRC_FRAME = 64;
/**
 * Mana Seed characters are drawn slightly smaller than the original chibi
 * player, so source frames are scaled to 38px and centered in the 32px
 * target frame to match the original sprite's proportions.
 */
const DRAW_SIZE = 38;

/** Mana Seed walk rows (0-indexed) -> game sheet rows. */
const DIRECTIONS = [
  { srcRow: 4, idleRow: 0, walkRow: 3, attackRow: 6 }, // down
  { srcRow: 5, idleRow: 1, walkRow: 4, attackRow: 7 }, // left (game mirrors for right)
  { srcRow: 7, idleRow: 2, walkRow: 5, attackRow: 8 }, // up
];

function partFiles(choices: CharacterChoices): string[] {
  const files = [
    `char_a_pONE3_0bas_humn_${choices.skin}.png`,
    `char_a_pONE3_1out_${choices.outfit}.png`,
  ];
  if (choices.hairStyle !== 'none') {
    files.push(`char_a_pONE3_4har_${choices.hairStyle}_${choices.hairColor}.png`);
  }
  if (choices.hat) {
    files.push(`char_a_pONE3_5hat_${choices.hat}.png`);
  }
  return files;
}

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('sprite part failed to load: ' + url));
    img.src = url;
  });
}

/**
 * Composite one character into a sheet column.
 * Source frames are 64x64; each is drawn at 38x38 centered in the 32x32 cell.
 */
function paintCharacter(
  ctx: CanvasRenderingContext2D,
  parts: HTMLImageElement[],
  col: number,
) {
  const drawOffset = (FRAME - DRAW_SIZE) / 2;
  for (const { srcRow, idleRow, walkRow, attackRow } of DIRECTIONS) {
    for (let frame = 0; frame < 6; frame++) {
      const sx = frame * SRC_FRAME;
      const sy = srcRow * SRC_FRAME;
      // Destination rows: idle only uses frame 0; walk/attack use all 6.
      const targets: number[] = [];
      if (frame === 0) targets.push(idleRow);
      targets.push(walkRow, attackRow);
      for (const row of targets) {
        const dx = col * FRAME + drawOffset;
        const dy = row * FRAME + drawOffset;
        for (const part of parts) {
          ctx.drawImage(part, sx, sy, SRC_FRAME, SRC_FRAME, dx, dy, DRAW_SIZE, DRAW_SIZE);
        }
      }
    }
    // Row 9 (spare, 6 frames): idle down copies so nothing is ever blank.
    if (srcRow === 4) {
      for (let frame = 0; frame < 6; frame++) {
        const dx = col * FRAME + drawOffset;
        const dy = 9 * FRAME + drawOffset;
        for (const part of parts) {
          ctx.drawImage(part, 0, 4 * SRC_FRAME, SRC_FRAME, SRC_FRAME, dx, dy, DRAW_SIZE, DRAW_SIZE);
        }
      }
    }
  }
}

/**
 * Build the full 192x320 player sheet: column 0 = player's custom character,
 * columns 1-5 = fixed NPC presets. Returns a PNG data URL suitable for
 * `--player-sprite-url`.
 */
export async function compositeCharacterSheet(
  player: CharacterChoices,
  resolveUrl: (file: string) => string,
): Promise<string> {
  const columns: CharacterChoices[] = [player, ...NPC_PRESETS];
  const fileSet = new Map<string, string>();
  for (const choices of columns) {
    for (const file of partFiles(choices)) {
      if (!fileSet.has(file)) fileSet.set(file, resolveUrl(file));
    }
  }
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...fileSet.entries()].map(async ([file, url]) => {
      loaded.set(file, await loadImage(url));
    }),
  );
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_W;
  canvas.height = SHEET_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  columns.forEach((choices, col) => {
    const parts = partFiles(choices).map((file) => loaded.get(file) as HTMLImageElement);
    paintCharacter(ctx, parts, col);
  });
  return canvas.toDataURL('image/png');
}

/** Validate choices loaded from a save before compositing. */
export function sanitizeCharacterChoices(value: unknown): CharacterChoices | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<CharacterChoices>;
  if (typeof v.skin !== 'string' || !SKIN_OPTIONS.includes(v.skin)) return null;
  if (typeof v.outfit !== 'string' || !OUTFIT_OPTIONS.includes(v.outfit)) return null;
  const hairStyle = v.hairStyle === 'none' || v.hairStyle === 'bob1' || v.hairStyle === 'dap1' ? v.hairStyle : 'bob1';
  const hairColor = typeof v.hairColor === 'string' && HAIR_COLOR_OPTIONS.includes(v.hairColor) ? v.hairColor : 'v02';
  const hat = typeof v.hat === 'string' && HAT_OPTIONS.includes(v.hat) ? v.hat : null;
  return {
    name: typeof v.name === 'string' ? v.name.slice(0, 24) : '',
    skin: v.skin,
    outfit: v.outfit,
    hairStyle,
    hairColor,
    hat,
  };
}
