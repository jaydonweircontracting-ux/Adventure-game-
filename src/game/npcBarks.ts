// Ambient NPC barks — floating greetings when the player walks past a
// townsfolk. Pure; the renderer owns timing and throttling. Barks are
// disposition-gated (cold NPCs stay silent) and time-of-day aware.

export interface BarkContext {
  archetype: string;
  activity: string;
  disposition: number;
  /** Minutes since midnight, world clock. */
  minuteOfDay: number;
  /** Deterministic per-NPC seed. */
  seed: number;
  /** World day number — barks vary day to day. */
  day: number;
  /** Road destination — used for traveler-flavored barks. */
  destination?: string;
}

/** Deterministic numeric seed for NPCs that only have a name/id string. */
export function seedForName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265461)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Whether this NPC feels like greeting the player right now. Cold NPCs
 * (disposition < 35) never bark; everyone else barks about half the days.
 * Pure and deterministic.
 */
export function shouldBark(disposition: number, seed: number, day: number): boolean {
  if (disposition < 35) return false;
  return hash01(seed, day) < 0.5;
}

type DayPeriod = 'morning' | 'day' | 'evening' | 'night';

function periodFor(minuteOfDay: number): DayPeriod {
  const hour = Math.floor(minuteOfDay / 60);
  if (hour < 5 || hour >= 21) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'day';
  return 'evening';
}

const PERIOD_GREETINGS: Record<DayPeriod, [string, string]> = {
  morning: ['Morning!', 'Fine morning, isn\'t it?'],
  day: ['Fine day!', 'Lovely day, isn\'t it?'],
  evening: ['Evening.', 'Evening, traveler.'],
  night: ['Mind the dark.', 'Best get inside soon.'],
};

const ARCHETYPE_BARKS: Record<string, Partial<Record<DayPeriod, [string, string]>>> = {
  farmer: {
    morning: ['Morning! Fine day for the fields.', 'Up early — good. The crops won\'t wait.'],
    day: ['Crops are coming along!', 'No rain today, thank the soil.'],
  },
  merchant: {
    day: ['Finest goods in Mosslight!', 'Coin for quality, friend.'],
    morning: ['New stock just in!', 'Browse a while — no rush.'],
  },
  guard: {
    day: ['Stay on the road.', 'All quiet on my watch.'],
    night: ['Mind the dark out there.', 'Head home before full dark.'],
  },
  priest: {
    morning: ['Blessings on you.', 'A peaceful morning to you.'],
    day: ['The chapel door is open.', 'Blessings on you.'],
  },
  smith: {
    day: ['Steel\'s hot if you need work done.', 'Mind the sparks, friend.'],
  },
  child: {
    morning: ['Hi hi!', 'Wanna play?'],
    day: ['Hi hi!', 'Bet you can\'t catch me!'],
    evening: ['Almost dinner time!', 'Did you see my hiding spot?'],
  },
};

/** Pick the bark line for an NPC. Pure and deterministic. */
export function barkFor(ctx: BarkContext): string {
  const period = periodFor(ctx.minuteOfDay);
  if (ctx.destination && (ctx.archetype === 'traveler' || ctx.archetype === 'caravan')) {
    const pool = [`Bound for ${ctx.destination}.`, `The road to ${ctx.destination} is long.`, 'Mind the road, friend.'];
    return pool[Math.floor(hash01(ctx.seed, 78) * pool.length)];
  }
  const flavor = ARCHETYPE_BARKS[ctx.archetype]?.[period];
  const pool = flavor ?? PERIOD_GREETINGS[period];
  return pool[Math.floor(hash01(ctx.seed, 77) * pool.length)];
}
