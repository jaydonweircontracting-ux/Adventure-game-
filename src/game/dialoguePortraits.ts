// BUILD 956: dialogue portraits — user-supplied photo sheets, sliced into
// per-expression portraits, plus the mood model that picks which face shows.
//
// PORTRAIT POOL (exactly 10 characters, 6 expressions each = 60 files):
// The sheets were uploaded by the user as 1170x780 JPGs, each holding one
// character in a 2x3 grid (CALM/TALK top row, SADNESS/AGGRESSION middle,
// SPECIAL/SMILE bottom). Each sheet was measured (background-difference
// band detection, never a guessed grid — the sheets do not share one
// layout: labels sit above, below, or beside the cells depending on the
// sheet) and sliced into public/sprites/portraits/<slug>-<expr>.jpg
// (max 320px, JPEG q85, ~837KB total). The bald smith's SPECIAL row holds
// TWO profiles; the left profile is shipped as his SPECIAL.
// Assignment is seeded per NPC id (FNV-1a): the same NPC keeps the same
// character across conversations and sessions. When the user attaches
// more photos later, they extend THIS pool — the swap is not built now.
//
// MOOD MODEL (presentation only — driven by the SAME disposition/choice
// state the haggle system already moves; there is no second mood stat):
// precedence, first match wins:
//   1. shop open            -> SPECIAL (the merchant turns to their wares)
//   2. speaking beat        -> TALK (900ms after each new line, then settles)
//   3. last haggle move     -> insult/boast: AGGRESSION; compliment: SMILE;
//                              joke: SMILE on success, SADNESS on falling flat
//   4. refusal line         -> AGGRESSION (a cold-gated refusal is hostile)
//   5. loss news in the line-> SADNESS (died/dead/killed/slain/lost/missing/...)
//   6. disposition tier     -> cold: AGGRESSION; warm/admiring: SMILE; else CALM
//   7. anything unknown     -> CALM (never a broken image)

import { artUrl } from './artCache';
import { dispositionTier, type HaggleMove } from './dialogue';

export type PortraitExpression = 'calm' | 'talk' | 'sadness' | 'aggression' | 'special' | 'smile';

export const PORTRAIT_EXPRESSIONS: PortraitExpression[] = [
  'calm', 'talk', 'sadness', 'aggression', 'special', 'smile',
];

export interface PortraitCharacter {
  slug: string;
  name: string;
}

export const PORTRAIT_CHARACTERS: PortraitCharacter[] = [
  { slug: 'blonde-knight', name: 'Blonde Knight' },
  { slug: 'hooded-rogue', name: 'Hooded Rogue' },
  { slug: 'old-bearded', name: 'Old Bearded Man' },
  { slug: 'bald-smith', name: 'Bald Smith' },
  { slug: 'red-knight', name: 'Red-Haired Knight' },
  { slug: 'gold-knight', name: 'Gold-Trim Knight' },
  { slug: 'old-woman', name: 'Old Woman' },
  { slug: 'young-soldier', name: 'Young Soldier' },
  { slug: 'brown-green', name: 'Brown-Haired Man' },
  { slug: 'mustached-suit', name: 'Mustached Man' },
];

/** FNV-1a 32-bit hash — stable across sessions and platforms. Pure. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The one character assigned to an NPC id. Stable: same id -> same face. Pure. */
export function portraitCharacterForNpc(npcId: string): PortraitCharacter {
  const idx = hashString(npcId || 'unknown') % PORTRAIT_CHARACTERS.length;
  return PORTRAIT_CHARACTERS[idx];
}

/** URL for one sliced portrait. Unknown expressions fall back to CALM. Pure. */
export function portraitUrl(slug: string, expression: string): string {
  const expr: PortraitExpression = (PORTRAIT_EXPRESSIONS as string[]).includes(expression)
    ? (expression as PortraitExpression)
    : 'calm';
  const known = PORTRAIT_CHARACTERS.some((c) => c.slug === slug);
  const safeSlug = known ? slug : PORTRAIT_CHARACTERS[0].slug;
  return artUrl(`sprites/portraits/${safeSlug}-${expr}.jpg`);
}

export interface PortraitMoodInput {
  disposition: number;
  lastMove: HaggleMove | null;
  lastMoveDelta: number;
  isRefusal: boolean;
  lineText: string;
  shopOpen: boolean;
  talkBeat: boolean;
}

const LOSS_WORDS = /\b(died|dead|killed|slain|lost|missing|drowned|murdered)\b/i;

/** Resolve which face shows. Pure. Unknown inputs fall back to CALM. */
export function resolvePortraitMood(input: PortraitMoodInput): PortraitExpression {
  if (input.shopOpen) return 'special';
  if (input.talkBeat) return 'talk';
  switch (input.lastMove) {
    case 'insult':
    case 'boast':
      return 'aggression';
    case 'compliment':
      return 'smile';
    case 'joke':
      return input.lastMoveDelta < 0 ? 'sadness' : 'smile';
    default:
      break;
  }
  if (input.isRefusal) return 'aggression';
  if (input.lineText && LOSS_WORDS.test(input.lineText)) return 'sadness';
  if (!Number.isFinite(input.disposition)) return 'calm';
  const tier = dispositionTier(input.disposition);
  if (tier === 'cold') return 'aggression';
  if (tier === 'warm' || tier === 'admiring') return 'smile';
  return 'calm';
}
