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
  /** BUILD 956: the speaker's raw memory event strings (villageLife NPCMemory).
   * Only speakable ones are ever surfaced — internal codes are decoded to
   * plain sentences, greeting chatter is skipped. Nothing is invented. */
  memories?: string[];
  /** BUILD 956: titles of ACTIVE quests this NPC gives. When present, the
   * 'work' answer mentions the first one — a real quest, never a fake one. */
  quests?: string[];
  /** BUILD 655: personality traits for tone. When present, responses reflect
   * sociability (verbosity/warmth), courage (directness), curiosity (questions). */
  personality?: { sociability: number; courage: number; curiosity: number };
}

export interface DialogueResponse {
  text: string;
  /** When set, the renderer should file this rumor in the journal. */
  rumor?: string;
  /** BUILD 956: true when this line is a cold-gated refusal. The portrait
   * mood model reads it (refusal -> AGGRESSION face). */
  refusal?: boolean;
}

function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265461)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// BUILD 956: the canned rumor pools are DELETED, not moved. Every line they
// held asserted a world fact the simulation never recorded (a well running
// dry, a caravan due any day, a cracked bell, a loose board hiding spot).
// Under the meaningful-dialogue rule, rumors now come only from real sim
// state: hearsay the NPC actually heard (BUILD 368 gossip propagation) and
// the NPC's own recorded memories, decoded from internal codes below.
// With neither, the NPC says so honestly and files no rumor.

/**
 * Decode an internal memory code into a speakable sentence about a real
 * recorded event. Returns null for codes that are not speakable (the
 * PLAYER_SUSPICIOUS flag) or for prose that needs no decoding. Pure.
 */
export function decodeMemoryCode(event: string): string | null {
  switch (event) {
    case 'PLAYER_KILLED_SOMEONE': return 'You killed someone once. I have not forgotten.';
    case 'PLAYER_ATTACKED_ME': return 'You attacked me once. I have not forgotten.';
    case 'PLAYER_STOLE_FROM_ME': return 'You stole from me once. I have not forgotten.';
    case 'PLAYER_TRESPASSED': return 'You trespassed once. I have not forgotten.';
    case 'PLAYER_VANDALIZED': return 'You vandalized something once. I have not forgotten.';
    case 'NPC_KILLED_SOMEONE': return 'Someone was killed in town once.';
    case 'NPC_ATTACKED_SOMEONE': return 'Someone was attacked in town once.';
    case 'NPC_STOLE_FROM_SOMEONE': return 'Someone stole from another in town once.';
    case 'NPC_TRESPASSED': return 'Someone trespassed in town once.';
    case 'NPC_VANDALIZED': return 'Something was vandalized in town once.';
    case 'I_COMMITTED_THEFT': return 'I stole once, and I am not proud of it.';
    case 'I_WAS_ARRESTED': return 'I was arrested once. Not my finest day.';
    case 'I_MARRIED_THE_PLAYER': return 'We got married, you and I — do not go forgetting it.';
    case 'THE_PLAYER_LEFT_ME': return 'You left me once. I remember.';
    default: return null;
  }
}

/**
 * Turn a hearsay string ("Heard from X: <inner>") into speakable form,
 * decoding an inner code when one is present. Prose passes through. Pure.
 */
export function speakableHearsay(raw: string): string {
  const m = /^Heard from (.+?): (.*)$/.exec(raw);
  if (!m) return raw;
  return `Heard from ${m[1]}: ${decodeMemoryCode(m[2]) ?? m[2]}`;
}

/**
 * The NPC's own most notable speakable memory, or null. Skips greeting
 * chatter ('Talked with the traveler.') and second-hand gossip (handled
 * separately). Deterministic per NPC seed. Pure.
 */
export function speakableOwnMemory(events: string[], seed: number): string | null {
  const candidates: string[] = [];
  for (const event of events) {
    if (event.startsWith('Heard from')) continue;
    if (event === 'Talked with the traveler.' || event === 'Talked with the traveler') continue;
    if (event.startsWith('Discussed ')) {
      const topic = event.slice('Discussed '.length).replace(/ with traveler$/, '');
      candidates.push(`We talked about ${topic} before.`);
      continue;
    }
    if (event.startsWith('Told traveler: ')) {
      const rest = event.slice('Told traveler: '.length);
      const idx = rest.indexOf(': ');
      candidates.push(`I told you before — ${idx >= 0 ? rest.slice(idx + 2) : rest}.`);
      continue;
    }
    const decoded = decodeMemoryCode(event);
    if (decoded) candidates.push(decoded);
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(hash2(seed, 9105) * candidates.length)];
}

const WORK_LINES: Record<string, { cold: string; warm: string }> = {
  farmer: {
    cold: 'Crops. They grow. Anything else?',
    warm: 'The soil here is kind if you treat it right. I rotate corn and barley — keeps the field honest.',
  },
  merchant: {
    cold: 'Buy something or move along.',
    warm: 'Trade\'s been fair lately. The road brings coin, and Mosslight folk pay on time. Mostly.',
  },
  priest: {
    cold: 'The chapel is open to all. Even you.',
    warm: 'The chapel is my work. I sweep it myself every morning, and the doors stay open.',
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
    warm: 'We play hide-and-seek! I am the best hider in Mosslight.',
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
      if (cold) return { text: `${ctx.name}. That's all you need to know.`, refusal: true };
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
      let text = cold ? lines.cold : lines.warm;
      // BUILD 956: a real active quest this NPC gives is mentioned by title.
      // Cold NPCs do not share it — same gating as everything else.
      const quests = ctx.quests ?? [];
      if (!cold && quests.length > 0) {
        text += ` I'm waiting on word about "${quests[0]}" — that's mine to give, if you're the helping sort.`;
      }
      return { text };
    }
    case 'rumors': {
      // BUILD 956 (meaningful dialogue): rumors come ONLY from real sim
      // state. 1) hearsay this NPC actually heard (BUILD 368 gossip
      // propagation), decoded to speakable form, filed in the journal.
      // 2) the NPC's own recorded memories, decoded the same way — a
      // personal recollection, so it is spoken but NOT filed as gossip.
      // 3) neither: an honest no-news line. Nothing is invented.
      if (cold) return { text: 'I don\'t gossip with strangers.', refusal: true };
      const heard = ctx.hearsay ?? [];
      if (heard.length > 0 && hash2(ctx.seed, 9102) < 0.65) {
        const raw = heard[Math.floor(hash2(ctx.seed, 9103) * heard.length)];
        const spoken = speakableHearsay(raw);
        return { text: `${spoken}. At least, that's what I heard.`, rumor: spoken };
      }
      const own = speakableOwnMemory(ctx.memories ?? [], ctx.seed);
      if (own) return { text: own };
      return { text: `Nothing new reaches my ears lately. The town's been quiet on my end.` };
    }
    case 'town': {
      // BUILD 550: Mira gives practical directions for new players.
      // Corrected: town NPCs are northwest of Mira (16-93, 23-87), not northeast.
      if (isBryn && !cold) {
        return { text: `Mosslight Crossing is northwest of here — just follow the road. You'll find the tavern, the smith, and the chapel there. The guards patrol the roads, so you should be safe.` };
      }
      // BUILD 955: disposition gates town talk — cold or wary NPCs withhold.
      if (cold) return { text: 'Town business is not for strangers. Ask someone who likes you.', refusal: true };
      const rep = ctx.townReputation;
      const standing = rep >= 10
        ? 'Folk speak well of you here — you\'ve earned it.'
        : rep <= -10
          ? 'Folk whisper about you when you pass. Mind yourself.'
          : 'You\'re still a new face, but nobody minds you yet.';
      return { text: `Mosslight Crossing is the town at this crossroads. ${standing}` };
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
        return { text: cold ? 'My family is none of your business.' : `It's just me and the work, mostly.`, refusal: cold };
      }
      const bond = kin.kind === 'family' ? 'Blood is blood' : 'Closer than blood, some days';
      return { text: `${kin.kind === 'family' ? 'My kin' : 'My good friend'} ${kin.targetName} is around here too. ${bond} — we look out for each other.` };
    }
    case 'workDetail': {
      const lines: Record<string, string> = {
        farmer: 'The trick is the rotation — corn one year, barley the next, never twice on the same strip. The soil pays you back if you let it rest.',
        merchant: 'Margins are thin on the road goods and fat on the local ones. Corn and beer move every day; blades move once a season but pay for the month.',
        priest: 'The chapel is my work — I sweep it, I mend it, I keep the doors open.',
        guard: 'The night watch walks in pairs. One carries the lantern, the other carries the spear.',
        smith: 'Quench in oil for a tool, in water for a blade, and never quench angry — the steel takes your mood with it, or so my master claimed.',
        child: 'Hide-and-seek is the best game. I count to a hundred and nobody ever finds me first.',
      };
      return { text: lines[ctx.archetype] ?? 'There is more to it than it looks. Give me a season and I could show you.' };
    }
    case 'rumorDetail': {
      // BUILD 956: the deep rumor is real content only. Cold or wary NPCs
      // withhold. Otherwise: real hearsay first (filed), then the NPC's own
      // recorded memories (spoken, not filed as gossip). With neither, an
      // honest line — no invented secret, whatever the disposition.
      if (cold) return { text: `I've told you enough. Come back when we're on better terms.`, refusal: true };
      const heard = ctx.hearsay ?? [];
      if (heard.length > 0) {
        const raw = heard[Math.floor(hash2(ctx.seed, 9204) * heard.length)];
        const spoken = speakableHearsay(raw);
        return { text: `Since we're speaking plainly: ${spoken}`, rumor: spoken };
      }
      const own = speakableOwnMemory(ctx.memories ?? [], ctx.seed);
      if (own) return { text: own };
      if (tier === 'warm' || tier === 'admiring') {
        return { text: `I wish I had something worth telling you. Ask around — someone always knows something.` };
      }
      return { text: `That's really all I know.` };
    }
    case 'townDetail': {
      if (cold) return { text: 'I have said enough about the town.', refusal: true };
      // BUILD 956: structural only — places that exist in the game and what
      // they are for. No invented history, no invented secrets.
      const details = [
        'The Rusty Tankard is the town tavern — drink, food, and talk after work.',
        'The guild hall stands in town; travelers with a trade find work through it.',
        'The market stalls are where Mosslight buys and sells.',
        'The chapel doors are open to all, traveler.',
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
