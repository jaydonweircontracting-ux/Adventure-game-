// Road travel for the living world (civ phase 2: NPC travel).
//
// Travelers journey BETWEEN real settlements along the road network —
// Mosslight Crossing to Ironwood Southhold, Stormhaven to Frostwatch, and so
// on. Everything is FULLY analytic: a traveler's position is a pure function
// of (road link, world clock). No per-frame AI, no stored state, no
// chunk-transition bookkeeping — when the player enters a chunk, its
// travelers are already exactly where the simulation says they should be.
// Distant travel progresses analytically while the player is absent.
import type { WorldClockState } from './worldCore';
import { townsfolkHash } from './townsfolk';
import { LANDMARK_LIST, type PlacedLandmark } from './landmarks';

export type TravelerPoint = { x: number; y: number };
export type TravelerFacing = 'up' | 'down' | 'left' | 'right';
export type TravelerKind = 'merchant' | 'traveler' | 'courier';
export type RoadArms = { n: boolean; s: boolean; e: boolean; w: boolean };

export type Traveler = {
  id: string;
  name: string;
  /** 'male' | 'female' — every kind is open to both; drives name/appearance only. */
  gender: 'male' | 'female';
  kind: TravelerKind;
  /** Reuses the existing .town-npc.npc-<role> sprite classes. */
  role: 'mage' | 'warrior' | 'guide' | 'rogue';
  position: TravelerPoint;
  facing: TravelerFacing;
  destination: string;
};

/** One road connection between two landmarks, with the chunk path between them. */
export type RoadLink = {
  id: string;
  from: PlacedLandmark;
  to: PlacedLandmark;
  /** Chunk path from `from` to `to`, inclusive of both endpoints. */
  path: { x: number; y: number }[];
};

const TRAVELER_NAMES_MALE = ['Odo', 'Fen', 'Corb', 'Pell', 'Bramm', 'Ost'];
const TRAVELER_NAMES_FEMALE = ['Rhea', 'Asha', 'Linnet', 'Sorrel', 'Tilda', 'Wrenna'];
const TRAVELER_KINDS: TravelerKind[] = ['merchant', 'traveler', 'traveler', 'courier'];
const TRAVELER_ROLES: Record<TravelerKind, Traveler['role']> = { merchant: 'mage', traveler: 'guide', courier: 'rogue' };

const DIRS = {
  n: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  e: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 },
} as const;
type DirKey = keyof typeof DIRS;
const DIR_KEYS: DirKey[] = ['n', 's', 'e', 'w'];
const OPP: Record<DirKey, DirKey> = { n: 's', s: 'n', e: 'w', w: 'e' };

const chunkKey = (x: number, y: number) => x + ',' + y;

/**
 * Walk the road network from every landmark along each of its road arms until
 * another landmark is reached. Returns one link per unordered landmark pair.
 * Deterministic: junction choices prefer going straight.
 */
export function buildRoadLinks(
  roadArmsFor: (chunk: { x: number; y: number }) => RoadArms,
  landmarks: PlacedLandmark[] = LANDMARK_LIST,
): RoadLink[] {
  const byKey = new Map<string, PlacedLandmark>();
  for (const landmark of landmarks) byKey.set(chunkKey(landmark.chunk.x, landmark.chunk.y), landmark);
  const links: RoadLink[] = [];
  const seenPairs = new Set<string>();

  for (const start of landmarks) {
    const startKey = chunkKey(start.chunk.x, start.chunk.y);
    const startArms = roadArmsFor(start.chunk);
    for (const firstDir of DIR_KEYS) {
      if (!startArms[firstDir]) continue;
      const path: { x: number; y: number }[] = [{ x: start.chunk.x, y: start.chunk.y }];
      let cur = { x: start.chunk.x, y: start.chunk.y };
      let dir: DirKey = firstDir;
      for (let step = 0; step < 16; step++) {
        const next = { x: cur.x + DIRS[dir].dx, y: cur.y + DIRS[dir].dy };
        // The road must actually continue into the next chunk.
        if (!roadArmsFor(next)[OPP[dir]]) break;
        cur = next;
        path.push({ x: cur.x, y: cur.y });
        const hit = byKey.get(chunkKey(cur.x, cur.y));
        if (hit) {
          const hitKey = chunkKey(cur.x, cur.y);
          if (hitKey !== startKey) {
            const pairKey = startKey < hitKey ? startKey + '>' + hitKey : hitKey + '>' + startKey;
            if (!seenPairs.has(pairKey)) {
              seenPairs.add(pairKey);
              const from = startKey < hitKey ? start : hit;
              const to = startKey < hitKey ? hit : start;
              const orderedPath = startKey < hitKey ? path : [...path].reverse();
              links.push({ id: pairKey, from, to, path: orderedPath });
            }
          }
          break;
        }
        const arms = roadArmsFor(cur);
        const exits = DIR_KEYS.filter((d) => d !== OPP[dir] && arms[d]);
        if (exits.length === 0) break;
        dir = exits.includes(dir) ? dir : exits[0];
      }
    }
  }
  return links;
}

function edgePoint(dir: DirKey | 'center'): TravelerPoint {
  switch (dir) {
    case 'n': return { x: 140, y: 0 };
    case 's': return { x: 140, y: 280 };
    case 'e': return { x: 280, y: 140 };
    case 'w': return { x: 0, y: 140 };
    default: return { x: 140, y: 140 };
  }
}

function dirBetween(a: { x: number; y: number }, b: { x: number; y: number }): DirKey | 'center' {
  if (b.x > a.x) return 'e';
  if (b.x < a.x) return 'w';
  if (b.y > a.y) return 's';
  if (b.y < a.y) return 'n';
  return 'center';
}

/**
 * Resolve this chunk's travelers for the current world clock: every road link
 * passing through the chunk contributes travelers walking it in both
 * directions (one direction at night). Speed is chunks per day, so long
 * journeys take longer than short hops.
 */
export function travelersForChunk(
  chunk: { x: number; y: number },
  clock: WorldClockState,
  links: RoadLink[],
): Traveler[] {
  const travelers: Traveler[] = [];
  const dayFloat = (Math.floor(clock.day) - 1) + Math.floor(clock.minuteOfDay) / 1440;
  const hour = Math.floor(clock.hour);
  const night = hour >= 22 || hour < 5;

  for (const link of links) {
    const pathLen = link.path.length - 1;
    if (pathLen < 1) continue;
    const linkSeed = Math.abs([...link.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) >>> 0;
    // Chunks per day: unhurried walking pace, per-link variation.
    const speed = 4 + townsfolkHash(linkSeed, 11) * 3;
    const phase = townsfolkHash(linkSeed, 22) * 2 * pathLen;
    const directions = night ? [0] : [0, 1];
    for (const d of directions) {
      const dist = (dayFloat * speed + phase + d * pathLen) % (2 * pathLen);
      const forward = dist < pathLen;
      // Distance measured from the `from` end in both cases.
      const fromDist = forward ? dist : 2 * pathLen - dist;
      const idx = Math.min(Math.floor(fromDist), pathLen - 1);
      const frac = fromDist >= pathLen ? 1 : fromDist - idx;
      const pathIdx = forward ? idx : pathLen - idx;
      const here = link.path[pathIdx];
      if (here.x !== chunk.x || here.y !== chunk.y) continue;
      const prevChunk = link.path[forward ? Math.max(0, pathIdx - 1) : Math.min(pathLen, pathIdx + 1)];
      const nextChunk = link.path[forward ? Math.min(pathLen, pathIdx + 1) : Math.max(0, pathIdx - 1)];
      const entryDir = pathIdx === (forward ? 0 : pathLen) ? 'center' : dirBetween(here, prevChunk);
      const exitDir = pathIdx === (forward ? pathLen : 0) ? 'center' : dirBetween(here, nextChunk);
      const entry = edgePoint(entryDir);
      const exit = edgePoint(exitDir);
      // Offset lanes so opposite directions pass each other.
      const lane = (townsfolkHash(linkSeed, 33 + d) < 0.5 ? -1 : 1) * 3.5;
      const dx = exit.x - entry.x;
      const dy = exit.y - entry.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const position = {
        x: entry.x + dx * frac + px * lane,
        y: entry.y + dy * frac + py * lane,
      };
      const facing: TravelerFacing =
        Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
      const kind = TRAVELER_KINDS[Math.floor(townsfolkHash(linkSeed, 44 + d) * TRAVELER_KINDS.length) % TRAVELER_KINDS.length];
      const gender: 'male' | 'female' = townsfolkHash(linkSeed, 60 + d) < 0.5 ? 'male' : 'female';
      const pool = gender === 'male' ? TRAVELER_NAMES_MALE : TRAVELER_NAMES_FEMALE;
      travelers.push({
        id: `traveler-link-${link.id}-${d}`,
        name: pool[Math.floor(townsfolkHash(linkSeed, 55 + d) * pool.length) % pool.length],
        gender,
        kind,
        role: TRAVELER_ROLES[kind],
        position,
        facing,
        destination: (forward ? link.to : link.from).name,
      });
    }
  }
  return travelers;
}

/** Links whose path passes through the given chunk. */
export function linksForChunk(chunk: { x: number; y: number }, links: RoadLink[]): RoadLink[] {
  return links.filter((link) => link.path.some((c) => c.x === chunk.x && c.y === chunk.y));
}
