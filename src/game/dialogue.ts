// Oblivion-style dialogue: selectable topics, per-NPC disposition, town
// standing (reputation + wanted level). Pure — no React, no App dependency.
// Disposition (0-100) tones every response; the renderer shows the town
// reputation and wanted level in the dialogue window header.

export type DialogueTopicId =
  | 'who' | 'work' | 'rumors' | 'town' | 'bye'
  /** BUILD 955 follow-ups: unlocked by visiting their parent topic in the
   * SAME conversation (session state only — see DialogueSession). */
  | 'family' | 'workDetail' | 'rumorDetail' | 'townDetail';

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

// ---------------------------------------------------------------------------
// BUILD 955: topic deepening + haggle + price scaling.
//
// SESSION vs PERSISTENT, stated plainly — this is the separation the whole
// build rests on:
// - SESSION state (DialogueSession: which topics were visited, which haggle
//   moves were used) lives ONLY in the open conversation. Closing the
//   conversation — by Goodbye, by the ✕ button, or by the NPC dying —
//   throws it away, so every topic is re-explorable next conversation.
// - PERSISTENT state (per-NPC disposition, quest state, rumors filed in the
//   journal) lives OUTSIDE the session and is NEVER reset by closing a
//   conversation. A compliment that moved disposition +6 stays +6.
// Nothing in this section reads or writes faction standing (BUILD 939):
// disposition is per-NPC, faction standing is per-town, and the two buckets
// are never copied into each other.
// ---------------------------------------------------------------------------

/** Per-conversation session state. Transient — never saved, never loaded. */
export interface DialogueSession {
  /** Topics chosen in THIS conversation, in order (no duplicates). */
  visited: DialogueTopicId[];
  /** Haggle moves used in THIS conversation (each move once per conversation). */
  haggleUsed: HaggleMove[];
}

/** Fresh session: nothing visited, no haggle move spent. Pure. */
export function newDialogueSession(): DialogueSession {
  return { visited: [], haggleUsed: [] };
}

/** Record a topic choice in the session. Pure — the input is never mutated. */
export function visitTopic(session: DialogueSession, topic: DialogueTopicId): DialogueSession {
  const visited = session.visited.includes(topic)
    ? [...session.visited]
    : [...session.visited, topic];
  return { visited, haggleUsed: [...session.haggleUsed] };
}

/** Parent topic that unlocks each follow-up, or null for base topics. Pure. */
export function followUpParent(topic: DialogueTopicId): DialogueTopicId | null {
  switch (topic) {
    case 'family': return 'who';
    case 'workDetail': return 'work';
    case 'rumorDetail': return 'rumors';
    case 'townDetail': return 'town';
    default: return null;
  }
}

const FOLLOW_UP_LABELS: Record<string, string> = {
  family: '↳ Ask about their family',
  workDetail: '↳ Ask for more detail',
  rumorDetail: '↳ Press for more',
  townDetail: '↳ Ask about the town in detail',
};

/**
 * Topics offered right now: the base list, plus each follow-up whose parent
 * was visited in THIS session, inserted right after its parent. Goodbye
 * always stays last. Pure.
 */
export function sessionTopics(archetype: string, session: DialogueSession): DialogueTopic[] {
  const base = topicsFor(archetype);
  const out: DialogueTopic[] = [];
  for (const t of base) {
    out.push(t);
    if (t.id === 'bye') continue;
    for (const follow of ['family', 'workDetail', 'rumorDetail', 'townDetail'] as DialogueTopicId[]) {
      if (followUpParent(follow) === t.id && session.visited.includes(t.id)) {
        out.push({ id: follow, label: FOLLOW_UP_LABELS[follow] });
      }
    }
  }
  return out;
}

// --- Haggle: Oblivion-inspired MECHANICS only. All lines below are original
// writing for this game; no Oblivion text, content, or lore is copied. ---

export type HaggleMove = 'compliment' | 'joke' | 'boast' | 'insult';

export const HAGGLE_MOVES: Array<{ id: HaggleMove; label: string }> = [
  { id: 'compliment', label: '💬 Pay a compliment' },
  { id: 'joke', label: '😄 Tell a joke' },
  { id: 'boast', label: '🦚 Boast about yourself' },
  { id: 'insult', label: '😠 Insult them' },
];

/**
 * Disposition delta for a haggle move at the CURRENT disposition. Stated
 * exactly, no hidden rolls:
 * - compliment: +6, always.
 * - joke: +3 when the NPC is not cold (disposition >= 20); −2 when cold —
 *   a joke falls flat with someone who already dislikes you.
 * - boast: −3. People tire of bragging.
 * - insult: −10.
 * The caller clamps with adjustDisposition; each move is usable once per
 * conversation (see canHaggle). Pure.
 */
export function haggleMoveDelta(move: HaggleMove, disposition: number): number {
  switch (move) {
    case 'compliment': return 6;
    case 'joke': return disposition >= 20 ? 3 : -2;
    case 'boast': return -3;
    case 'insult': return -10;
  }
}

/** True when this haggle move is still unused in this session. Pure. */
export function canHaggle(session: DialogueSession, move: HaggleMove): boolean {
  return !session.haggleUsed.includes(move);
}

/** Mark a haggle move used in the session. Pure — the input is never mutated. */
export function useHaggleMove(session: DialogueSession, move: HaggleMove): DialogueSession {
  if (session.haggleUsed.includes(move)) return session;
  return { visited: [...session.visited], haggleUsed: [...session.haggleUsed, move] };
}

/** The NPC's spoken reaction to a haggle move. Original writing. Pure. */
export function haggleReaction(move: HaggleMove, disposition: number, newDisposition: number): string {
  const fell = newDisposition < disposition;
  switch (move) {
    case 'compliment':
      return fell
        ? 'A compliment, and you mean it? ...Thank you. That is kind.'
        : 'Well! Flattery will get you... well, somewhere. Thank you, traveler.';
    case 'joke':
      return fell
        ? 'I am not in the mood for jokes from strangers.'
        : 'Ha! Alright, that one earned a smile. You\'re alright, traveler.';
    case 'boast':
      return 'Yes, yes — very impressive. Is there something you actually wanted?';
    case 'insult':
      return 'Watch your tongue. I have no patience for that.';
  }
}

// --- Price scaling: disposition moves prices through the EXISTING stall
// pricing (buyFromStall ledger) — this is only the multiplier, never a
// second pricing system. Sell prices are untouched: haggling affects what
// YOU pay, not what a merchant pays you. ---

/**
 * Buy-price multiplier by disposition tier. Stated exactly:
 * cold 1.25 (they charge you more), wary 1.15, neutral 1.00, warm 0.90,
 * admiring 0.80 (a friend's price). Applies to dialogue purchases only —
 * field stalls have no NPC disposition, so they always pay 1.00. Pure.
 */
export function priceMultiplierForDisposition(disposition: number): number {
  switch (dispositionTier(disposition)) {
    case 'cold': return 1.25;
    case 'wary': return 1.15;
    case 'neutral': return 1.0;
    case 'warm': return 0.9;
    case 'admiring': return 0.8;
  }
}

/** Adjusted buy price: base × multiplier, rounded, never below 1 gold. Pure. */
export function adjustedPrice(basePrice: number, disposition: number): number {
  return Math.max(1, Math.round(basePrice * priceMultiplierForDisposition(disposition)));
}

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

/**
 * Overhead nameplate color by disposition (BUILD 886 — EO-style): red for
 * hostile/cold, green for friendly/warm, white for neutral. `hostile`
 * (currently attacking/fleeing from the player) overrides to red. Pure.
 */
export function dispositionNameColor(d: number, hostile = false): string {
  if (hostile || d < 40) return '#e5484d';
  if (d >= 60) return '#5dbb63';
  return '#ffffff';
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
  /** BUILD 368: the speaker's relationships (highest affinity first). When
   * present, 'who' answers name kin and 'rumors' can surface village gossip. */
  relationships?: Array<{ targetName: string; kind: string; affinity: number }>;
  /** BUILD 368: second-hand gossip the speaker has heard ("Heard from X: ..."). */
  hearsay?: string[];
  /** BUILD 655: personality traits for tone. When present, responses reflect
   * sociability (verbosity/warmth), courage (directness), curiosity (questions). */
  personality?: { sociability: number; courage: number; curiosity: number };
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

// BUILD 655: Apply personality-based tone to a response. Sociable NPCs are
// warmer and more verbose; courageous ones are direct; curious ones ask questions.
export function applyPersonalityTone(
  text: string,
  personality: { sociability: number; courage: number; curiosity: number } | undefined,
  seed: number,
  topic?: string,
): string {
  if (!personality) return text;
  let result = text;
  // Low sociability: shorter, more clipped.
  if (personality.sociability < 0.3) {
    // Remove some warmth — keep it brief (don't alter facts).
    result = result.replace(/! /g, '. ');
  }
  // BUILD 656: High curiosity adds a follow-up, but only when contextually
  // appropriate — not after goodbyes, and topic-relevant when possible.
  if (personality.curiosity > 0.7 && topic !== 'bye') {
    const questions: Record<string, string[]> = {
      rumors: [
        ' Have you heard anything yourself?',
        ' What do you make of that?',
      ],
      town: [
        ' Are you planning to stay long?',
        ' What brings you to Mosslight?',
      ],
      work: [
        ' Do you know much about that kind of work?',
      ],
      who: [
        ' What brings you here, anyway?',
        ' Have you seen anything interesting on the road?',
      ],
    };
    const options = questions[topic ?? ''] ?? questions.who;
    result += options[seed % options.length];
  }
  // Low courage + cold: more evasive.
  if (personality.courage < 0.3 && personality.sociability < 0.5) {
    result = result.replace(/^I'm /, 'I... I\'m ');
  }
  return result;
}


/** Build the NPC's response to a topic. Pure and deterministic. */
export function responseForBase(ctx: DialogueContext, topic: DialogueTopicId): DialogueResponse {
  const tier = dispositionTier(ctx.disposition);
  const cold = tier === 'cold' || tier === 'wary';
  // BUILD 549: Mira the neighbor gives new-player guidance.
  // She's the first NPC most players meet — her dialogue should orient them.
  const isBryn = ctx.name === 'Bryn';
  // BUILD 550: Key NPCs get unique introductions (DISC-DLG-001).
  // Players should remember who they talked to.
  const isCedric = ctx.name === 'Cedric';
  const isAldous = ctx.name === 'Father Aldous';
  const isTom = ctx.name === 'Tom';
  switch (topic) {
    case 'who': {
      if (isBryn && !cold) {
        return { text: `I'm Bryn — I farm the plot just east of here. You must be the traveler staying in the old cottage. Welcome! If you're heading to town, follow the road northwest to Mosslight Crossing.` };
      }
      if (isCedric && !cold) {
        return { text: `Cedric's the name — I run the trade stalls here in Mosslight. If you've got coin, I've got goods. Come back when the stalls are open!` };
      }
      if (isAldous && !cold) {
        return { text: `I am Father Aldous, keeper of the chapel. All are welcome here, traveler. If you seek guidance — or simply quiet — the doors are open.` };
      }
      if (isTom && !cold) {
        return { text: `Tom, the smith. I keep the guards' blades sharp and the farmers' tools mended. If your sword needs work, you know where to find me.` };
      }
      if (cold) return { text: `${ctx.name}. That's all you need to know.` };
      const role = ctx.archetype === 'commoner' ? 'a resident of Mosslight' : `the town ${ctx.archetype}`;
      let text = `I'm ${ctx.name}, ${role}. Right now I'm ${ctx.activity.toLowerCase()}.`;
      // BUILD 368: name kin — the relationship graph becomes conversation.
      const kin = (ctx.relationships ?? []).find((r) => r.kind === 'family' || r.kind === 'friend');
      if (kin && !cold) {
        const bond = kin.kind === 'family' ? 'My kin' : 'My good friend';
        text += ` ${bond} ${kin.targetName} is around here too — say hello if you see them.`;
      }
      return { text };
    }
    case 'work': {
      const lines = WORK_LINES[ctx.archetype] ?? {
        cold: 'Work is work.',
        warm: 'It keeps me busy and the town fed. Not much more to tell.',
      };
      return { text: cold ? lines.cold : lines.warm };
    }
    case 'rumors': {
      // BUILD 368: real village gossip first — things this NPC actually heard
      // from someone, via propagateRumors. Falls back to canned rumors.
      const heard = ctx.hearsay ?? [];
      if (!cold && heard.length > 0 && hash2(ctx.seed, 9102) < 0.65) {
        const gossip = heard[Math.floor(hash2(ctx.seed, 9103) * heard.length)];
        return { text: `${gossip}. At least, that's what I heard.`, rumor: gossip };
      }
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
      // BUILD 550: Mira gives practical directions for new players.
      // Corrected: town NPCs are northwest of Mira (16-93, 23-87), not northeast.
      if (isBryn && !cold) {
        return { text: `Mosslight Crossing is northwest of here — just follow the road. You'll find the tavern, the smith, and the chapel there. The guards patrol the roads, so you should be safe.` };
      }
      // BUILD 955: disposition gates town talk — cold or wary NPCs withhold.
      if (cold) return { text: 'Town business is not for strangers. Ask someone who likes you.' };
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
    // BUILD 955 follow-ups: only offered after their parent topic was
    // visited in THIS session (see sessionTopics). Responses are gated by
    // disposition exactly like the base topics.
    case 'family': {
      const kin = (ctx.relationships ?? []).find((r) => r.kind === 'family' || r.kind === 'friend');
      if (cold || !kin) {
        return { text: cold ? 'My family is none of your business.' : `It's just me and the work, mostly. Family's scattered — the road takes people.` };
      }
      const bond = kin.kind === 'family' ? 'Blood is blood' : 'Closer than blood, some days';
      return { text: `${kin.kind === 'family' ? 'My kin' : 'My good friend'} ${kin.targetName} is around here too. ${bond} — we look out for each other.` };
    }
    case 'workDetail': {
      const lines: Record<string, string> = {
        farmer: 'The trick is the rotation — corn one year, barley the next, never twice on the same strip. The soil pays you back if you let it rest.',
        merchant: 'Margins are thin on the road goods and fat on the local ones. Corn and beer move every day; blades move once a season but pay for the month.',
        priest: 'The chapel roof leaks over the north pew. I catch it in a bucket and nobody has complained yet — the faithful are kind that way.',
        guard: 'The night watch walks the north road in pairs. One carries the lantern, the other carries the spear, and they swap at the halfway stone.',
        smith: 'Quench in oil for a tool, in water for a blade, and never quench angry — the steel takes your mood with it, or so my master claimed.',
        child: 'The best hiding spot is inside the old cart by the mill. But don\'t tell anyone I told you. Actually — tell everyone. Then they\'ll never check the rain barrel.',
      };
      return { text: lines[ctx.archetype] ?? 'There is more to it than it looks. Give me a season and I could show you.' };
    }
    case 'rumorDetail': {
      // BUILD 955: the deep rumor is the high-disposition content — cold or
      // wary NPCs withhold, neutral NPCs repeat the ordinary pool, warm and
      // admiring NPCs share a hint they tell few others.
      if (cold) return { text: `I've told you enough. Come back when we're on better terms.` };
      if (tier === 'warm' || tier === 'admiring') {
        const hint = WARM_RUMORS[Math.floor(hash2(ctx.seed, 9203) * WARM_RUMORS.length)];
        return { text: `Since we're speaking plainly: ${hint}`, rumor: hint };
      }
      const rumor = RUMORS[Math.floor(hash2(ctx.seed, 9202) * RUMORS.length)];
      return { text: `That's really all I know. Well — ${rumor}`, rumor };
    }
    case 'townDetail': {
      if (cold) return { text: 'I have said enough about the town.' };
      const details = [
        'The Rusty Tankard pours the best ale this side of Eastmarch, and the worst gossip. Both are worth the price.',
        'The guild hall takes in travelers with a trade and sends them out with work. If you have hands, they have a use for them.',
        'The market stalls open with the sun. Get there early for corn, late for bargains — the merchants would rather sell cheap than haul it home.',
        'The chapel bell still rings with its crack. Father Aldous says a cracked bell rings truer, because it has survived something.',
      ];
      return { text: details[Math.floor(hash2(ctx.seed, 9201) * details.length)] };
    }
  }
}

/**
 * BUILD 655: Main entry point. Wraps responseForBase with personality tone.
 * Existing callers get personality-influenced responses automatically when
 * they pass ctx.personality.
 */
export function responseFor(ctx: DialogueContext, topic: DialogueTopicId): DialogueResponse {
  const base = responseForBase(ctx, topic);
  if (ctx.personality) {
    return {
      ...base,
      text: applyPersonalityTone(base.text, ctx.personality, ctx.seed, topic),
    };
  }
  return base;
}
