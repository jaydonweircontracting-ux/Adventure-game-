// Quest sites: physical world locations backing quest explore/visit/collect
// stages. Pure data + helpers; App.tsx owns rendering and event emission.
//
// Design notes:
// - Each site has a fixed chunk + field position (field units 0..140) so
//   markers render deterministically and saves never need to store them.
// - The 'crypt' explore stage and the 'funerary_mask' pickup live at the
//   generated dungeon landmark, whose chunk is not fixed: those sites carry
//   atDungeon: true and App.tsx resolves the chunk from the world tile.
// - Landmarks auto-complete on chunk entry (entering the chunk IS the
//   discovery); pickups require tapping the marker when near.

export type QuestSiteKind = 'landmark' | 'pickup';

export type QuestSiteEventType = 'explore' | 'visit' | 'collect';

export type QuestSite = {
  /** Quest stage target id this site satisfies (e.g. 'buried_treasure'). */
  target: string;
  /** Fixed chunk, or null when atDungeon resolves it at runtime. */
  chunk: { x: number; y: number } | null;
  /** True when the site sits at the generated dungeon landmark's chunk. */
  atDungeon?: boolean;
  /** Field-unit position inside the chunk (0..140). */
  position: { x: number; y: number };
  label: string;
  kind: QuestSiteKind;
  /** Event type a matching stage expects. */
  eventType: QuestSiteEventType;
};

export const QUEST_SITES: QuestSite[] = [
  { target: 'buried_treasure', chunk: { x: 5, y: 7 }, position: { x: 70, y: 60 }, label: 'Ancient Oak', kind: 'landmark', eventType: 'explore' },
  { target: 'buried_treasure', chunk: { x: 4, y: 8 }, position: { x: 60, y: 80 }, label: 'Sunken Cache', kind: 'landmark', eventType: 'explore' },
  { target: 'ruin', chunk: { x: 1, y: 10 }, position: { x: 70, y: 70 }, label: 'Ashen Keep', kind: 'landmark', eventType: 'explore' },
  { target: 'greenfield', chunk: { x: 6, y: 7 }, position: { x: 70, y: 70 }, label: 'Greenfield Farmstead', kind: 'landmark', eventType: 'visit' },
  { target: 'oakrest', chunk: { x: 2, y: 7 }, position: { x: 70, y: 70 }, label: 'Oakrest Waystone', kind: 'landmark', eventType: 'visit' },
  { target: 'funerary_mask', chunk: null, atDungeon: true, position: { x: 62, y: 52 }, label: 'Disturbed grave', kind: 'pickup', eventType: 'collect' },
  { target: 'ember_seal', chunk: { x: 1, y: 9 }, position: { x: 50, y: 60 }, label: 'Old battlefield cache', kind: 'pickup', eventType: 'collect' },
  { target: 'tide_seal', chunk: { x: 4, y: 9 }, position: { x: 80, y: 60 }, label: 'Drowned mine cache', kind: 'pickup', eventType: 'collect' },
  { target: 'thorn_seal', chunk: { x: 1, y: 10 }, position: { x: 90, y: 80 }, label: 'Overgrown keep cache', kind: 'pickup', eventType: 'collect' },
];

/** All sites whose target matches the given stage target id. */
export function sitesForTarget(target: string): QuestSite[] {
  const lowered = target.toLowerCase();
  return QUEST_SITES.filter((site) => site.target.toLowerCase() === lowered);
}

export type ActiveQuestStage = {
  questId: string;
  kind: string;
  target?: string;
};

/**
 * Sites relevant right now: one per site whose target + event type match an
 * active quest stage. Used to decide which markers to render.
 */
export function sitesForActiveStages(stages: ActiveQuestStage[]): QuestSite[] {
  const seen = new Set<string>();
  const relevant: QuestSite[] = [];
  for (const stage of stages) {
    if (!stage.target) continue;
    for (const site of sitesForTarget(stage.target)) {
      if (site.eventType !== stage.kind) continue;
      const key = site.target + '|' + site.label;
      if (seen.has(key)) continue;
      seen.add(key);
      relevant.push(site);
    }
  }
  return relevant;
}

/**
 * Resolve a site's chunk: fixed chunks pass through; atDungeon sites use the
 * dungeon landmark's chunk (null when the current chunk has no dungeon).
 */
export function resolveSiteChunk(
  site: QuestSite,
  dungeonChunk: { x: number; y: number } | null,
): { x: number; y: number } | null {
  if (!site.atDungeon) return site.chunk;
  return dungeonChunk;
}

/** True when the player's chunk satisfies an explore/visit stage. */
export function chunkSatisfiesStage(
  stage: ActiveQuestStage,
  playerChunk: { x: number; y: number },
  dungeonChunk: { x: number; y: number } | null,
): boolean {
  if (stage.kind !== 'explore' && stage.kind !== 'visit') return false;
  if (!stage.target) return false;
  // The crypt explore stage is satisfied by reaching the dungeon landmark.
  if (stage.target.toLowerCase() === 'crypt') {
    return dungeonChunk !== null && dungeonChunk.x === playerChunk.x && dungeonChunk.y === playerChunk.y;
  }
  return sitesForTarget(stage.target).some((site) => {
    const chunk = resolveSiteChunk(site, dungeonChunk);
    return chunk !== null && chunk.x === playerChunk.x && chunk.y === playerChunk.y && site.eventType === stage.kind;
  });
}
