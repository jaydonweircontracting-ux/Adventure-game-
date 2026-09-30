// Oblivion-style dialogue: selectable topics, per-NPC disposition, town
// standing (reputation + wanted level). Pure — no React, no App dependency.
// Disposition (0-100) tones every response; the renderer shows the town
// reputation and wanted level in the dialogue window header.

export type DialogueTopicId = 'who' | 'work' | 'rumors' | 'town' | 'bye';

export interface DialogueTopic {
  id: DialogueTopicId;
  label: string;
}

/** Topics offered to an NPC, driven by archetype. Pure. */
export function topicsFor(archetype: string): DialogueTopic[] {
  const topics: DialogueTopic[] = [{ id: 'who', label: 'Who are you?' }];
  switch (archetype) {
    case 'farmer': topics.push({ id: 'work', label: 'The crops' }); break;
    case 'merchant': topics.push({ id: 'work', label: 'Your trade' }); break;
    case 'priest': topics.push({ id: 'work', label: 'The chapel' }); break;
    case 'guard': topics.push({ id: 'work', label: 'Trouble in town?' }); break;
    case 'smith': topics.push({ id: 'work', label: 'The forge' }); break;
    case 'child': topics.push({ id: 'work', label: 'What are you playing?' }); break;
    default: topics.push({ id: 'work', label: 'Your work' }); break;
  }
  topics.push({ id: 'rumors', label: 'Rumors' });
  topics.push({ id: 'town', label: 'Mosslight Crossing' });
  topics.push({ id: 'bye', label: 'Goodbye' });
  return topics;
}

export type DispositionTier = 'cold' | 'wary' | 'neutral' | 'warm' | 'admiring';

/** Disposition tier from a 0-100 value. Pure. */
export function dispositionTier(d: number): DispositionTier {
  if (d < 20) return 'cold';
  if (d < 40) return 'wary';
  if (d < 60) return 'neutral';
  if (d < 80) return 'warm';
  return 'admiring';
}

export function dispositionLabel(tier: DispositionTier): string {
  switch (tier) {
    case 'cold': return 'Cold';
    case 'wary': return 'Wary';
    case 'neutral': return 'Neutral';
    case 'warm': return 'Warm';
    case 'admiring': return 'Admires you';
  }
}

/** Fresh NPCs start neutral. */
export function defaultDisposition(): number {
  return 50;
}

/** Shift disposition, clamped to 0..100. Pure. */
export function adjustDisposition(current: number, delta: number): number {
  return Math.min(100, Math.max(0, Math.round(current + delta)));
}

/** Town wanted level label. Pure. */
export function wantedLabel(level: number): string {
  if (level <= 0) return 'Clean';
  if (level <= 2) return 'Suspect';
  if (level <= 5) return 'Wanted';
  return 'Hunted';
}

/** Shift the wanted level, clamped to 0..10. Pure. */
export function adjustWanted(current: number, delta: number): number {
  return Math.min(10, Math.max(0, Math.round(current + delta)));
}

export interface DialogueContext {
  name: string;
  archetype: string;
  /** Current activity, e.g. 'Tending crops'. */
  activity: string;
  /** 0-100 disposition toward the player. */
  disposition: number;
  /** Town reputation (can be negative). */
  townReputation: number;
  /** Deterministic per-NPC seed for rumor selection. */
  seed: number;
}

export interface DialogueResponse {
  text: string;
  /** When set, the renderer should file this rumor in the journal. */
  rumor?: string;
}

function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265461)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const RUMORS: string[] = [
  'They say the old well behind the chapel runs dry every third summer.',
  'A merchant caravan from Eastmarch is due any day now — best prices of the season.',
  "Bram's been working on something big at the forge. Won't say what.",
  'Wolves have been seen near the north road after dark. Travel in daylight.',
  'Mira waters her ale. Or so Dunstan claims after his third tankard.',
  'The chapel bell cracked last winter. Father Aldous still rings it, crack and all.',
  'Someone keeps leaving goat horns on the guild doorstep. Nobody admits to it.',
  'The corn this year is the tallest anyone can remember.',
];

const WARM_RUMORS: string[] = [
  'Between you and me — there\'s a loose board under the guild hall rug. Don\'t tell Bram I told you.',
  'If you\'re heading north, the old ruin past the treeline has more than rats in it. That\'s all I\'ll say.',
];

const WORK_LINES: Record<string, { cold: string; warm: string }> = {
  farmer: {
    cold: 'Crops. They grow. Anything else?',
    warm: 'The soil here is kind if you treat it right. I rotate corn and barley — keeps the field honest.',
  },
  merchant: {
    cold: 'Buy something or move along.',
    warm: 'Trade\'s been fair lately. The Eastmarch road brings coin, and Mosslight folk pay on time. Mostly.',
  },
  priest: {
    cold: 'The chapel is open to all. Even you.',
    warm: 'The chapel has stood for sixty years. I sweep it myself every morning — the roots don\'t mind, and neither do I.',
  },
  guard: {
    cold: 'Nothing to report. Move along.',
    warm: 'Quiet shifts, mostly. A wolf now and then, a drunk now and then. The road stays safe while we walk it.',
  },
  smith: {
    cold: 'Forge is hot. Mind your hands.',
    warm: 'Good steel wants patience. Heat it, fold it, quench it — rush any step and the blade remembers.',
  },
  child: {
    cold: 'Go away, I\'m busy.',
    warm: 'We\'re playing hide-and-seek! I\'m the best hider. Nobody found me behind the rain barrel yesterday.',
  },
};

/** Build the NPC's response to a topic. Pure and deterministic. */
export function responseFor(ctx: DialogueContext, topic: DialogueTopicId): DialogueResponse {
  const tier = dispositionTier(ctx.disposition);
  const cold = tier === 'cold' || tier === 'wary';
  switch (topic) {
    case 'who': {
      if (cold) return { text: `${ctx.name}. That's all you need to know.` };
      const role = ctx.archetype === 'commoner' ? 'a resident of Mosslight' : `the town ${ctx.archetype}`;
      return { text: `I'm ${ctx.name}, ${role}. Right now I'm ${ctx.activity.toLowerCase()}.` };
    }
    case 'work': {
      const lines = WORK_LINES[ctx.archetype] ?? {
        cold: 'Work is work.',
        warm: 'It keeps me busy and the town fed. Not much more to tell.',
      };
      return { text: cold ? lines.cold : lines.warm };
    }
    case 'rumors': {
      const pool = tier === 'warm' || tier === 'admiring' ? [...RUMORS, ...WARM_RUMORS] : RUMORS;
      const rumor = pool[Math.floor(hash2(ctx.seed, 9101) * pool.length)];
      const lead = cold
        ? 'I don\'t gossip with strangers.'
        : tier === 'admiring'
          ? 'For you? Anything. Here\'s one I don\'t tell just anyone: '
          : 'Heard this going around: ';
      return cold ? { text: lead } : { text: lead + rumor, rumor };
    }
    case 'town': {
      const rep = ctx.townReputation;
      const standing = rep >= 10
        ? 'Folk speak well of you here — you\'ve earned it.'
        : rep <= -10
          ? 'Folk whisper about you when you pass. Mind yourself.'
          : 'You\'re still a new face, but nobody minds you yet.';
      return { text: `Mosslight Crossing has stood at this crossroads for generations. ${standing}` };
    }
    case 'bye': {
      switch (tier) {
        case 'cold': return { text: 'Finally.' };
        case 'wary': return { text: 'Safe travels.' };
        case 'neutral': return { text: 'Take care out there.' };
        case 'warm': return { text: 'Always good talking to you.' };
        case 'admiring': return { text: 'Come back soon — it\'s never dull when you\'re around!' };
      }
    }
  }
}
