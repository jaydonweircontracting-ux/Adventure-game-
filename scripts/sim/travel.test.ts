// Civ phase 2 (NPC travel) sim: road links + analytic through-travelers.
// Uses the REAL road layout by extracting worldRoadAt from src/App.tsx.
import { readFileSync } from 'fs';
import { buildRoadLinks, travelersForChunk, type RoadArms, type RoadLink } from '../../src/game/travelers';
import { LANDMARKS } from '../../src/game/landmarks';
import type { WorldClockState } from '../../src/game/worldCore';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

// Extract the real road predicate from App.tsx (single source of truth).
const appSrc = readFileSync('src/App.tsx', 'utf8');
const match = appSrc.match(/function worldRoadAt\(x: number, y: number\): boolean \{([\s\S]*?)\n\}/);
if (!match) { console.error('FAIL: could not extract worldRoadAt'); process.exit(1); }
const worldRoadAt = new Function('x', 'y', match[1].replace(/const /g, 'var ')) as (x: number, y: number) => boolean;

const roadArmsFor = (chunk: { x: number; y: number }): RoadArms => ({
  n: worldRoadAt(chunk.x, chunk.y - 1),
  s: worldRoadAt(chunk.x, chunk.y + 1),
  e: worldRoadAt(chunk.x + 1, chunk.y),
  w: worldRoadAt(chunk.x - 1, chunk.y),
});

const links = buildRoadLinks(roadArmsFor);
check('links built on the real road network', links.length >= 8, `got ${links.length}`);
const linkBetween = (a: string, b: string) =>
  links.find((l) => {
    const ak = l.from.chunk.x + ',' + l.from.chunk.y;
    const bk = l.to.chunk.x + ',' + l.to.chunk.y;
    return (ak === a && bk === b) || (ak === b && bk === a);
  });
check('Mosslight Crossing <-> Ironwood Southhold link', !!linkBetween('4,7', '8,7'));
check('Mosslight Crossing <-> Dunewatch link', !!linkBetween('4,7', '4,19'));
check('Stormhaven <-> Frostwatch link (2nd continent)', !!linkBetween('130,-16', '140,-20'));
check('Northwatch Beacon <-> Frosthold link', !!linkBetween('5,2', '5,-5'));

// Path sanity: every link path is contiguous and road-continuous.
let badPaths = 0;
for (const link of links) {
  for (let i = 1; i < link.path.length; i++) {
    const a = link.path[i - 1];
    const b = link.path[i];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) badPaths++;
  }
  const fk = link.from.chunk.x + ',' + link.from.chunk.y;
  const tk = link.to.chunk.x + ',' + link.to.chunk.y;
  const pk0 = link.path[0].x + ',' + link.path[0].y;
  const pkN = link.path[link.path.length - 1].x + ',' + link.path[link.path.length - 1].y;
  if (pk0 !== fk || pkN !== tk) badPaths++;
}
check('all link paths contiguous and endpoint-correct', badPaths === 0, `${badPaths} bad`);

// No duplicate pairs.
const pairIds = new Set(links.map((l) => l.id));
check('no duplicate link pairs', pairIds.size === links.length);

const noon: WorldClockState = { tick: 1000, year: 1, month: 1, week: 1, day: 5, hour: 12, minuteOfDay: 720, second: 0, season: 'spring' };
const midnight: WorldClockState = { ...noon, hour: 0, minuteOfDay: 0 };
const nextNoon: WorldClockState = { ...noon, day: 6 };

// Travelers on a link chunk at noon (travelers may be on any chunk of the path).
const mossIron = linkBetween('4,7', '8,7') as RoadLink;
const travelersOnLink = (clock: WorldClockState) => {
  const out = [];
  for (const c of mossIron.path) out.push(...travelersForChunk(c, clock, links));
  return out;
};
const atNoon = travelersOnLink(noon);
check('travelers present on a road link at noon', atNoon.length >= 1, `got ${atNoon.length}`);
check('traveler destinations are real landmark names',
  atNoon.every((t) => Object.values(LANDMARKS).some((l) => l.name === t.destination)));
check('traveler positions inside field bounds',
  atNoon.every((t) => t.position.x >= -5 && t.position.x <= 145 && t.position.y >= -5 && t.position.y <= 145),
  JSON.stringify(atNoon.map((t) => t.position)));

// Analytic: same clock -> identical; later clock -> moved.
const atNoonAgain = travelersOnLink(noon);
check('deterministic for the same clock', JSON.stringify(atNoon) === JSON.stringify(atNoonAgain));
const atNextNoon = travelersOnLink(nextNoon);
const moved = atNoon.some((t) => {
  const other = atNextNoon.find((o) => o.id === t.id);
  return other && (Math.abs(other.position.x - t.position.x) > 0.01 || Math.abs(other.position.y - t.position.y) > 0.01);
});
check('travelers move as the clock advances', moved);

// Night: fewer or equal travelers vs noon (summed across the link).
const atMidnight = travelersOnLink(midnight);
check('quieter roads at night', atMidnight.length <= atNoon.length, `noon=${atNoon.length} night=${atMidnight.length}`);

// Rebuild determinism.
const links2 = buildRoadLinks(roadArmsFor);
check('link building deterministic', JSON.stringify(links) === JSON.stringify(links2));

// Traveler ids stable: at most 2 per link (one per direction).
const idsByLink = new Map<string, Set<string>>();
for (const t of atNoon) {
  const linkId = t.id.replace(/^traveler-link-/, '').replace(/-[01]$/, '');
  if (!idsByLink.has(linkId)) idsByLink.set(linkId, new Set());
  idsByLink.get(linkId)?.add(t.id);
}
const maxIdsPerLink = Math.max(...[...idsByLink.values()].map((s) => s.size));
check('stable traveler ids per link', maxIdsPerLink <= 2, `got ${maxIdsPerLink}`);

console.log(`travel sim: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
