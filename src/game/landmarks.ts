// Authoritative world landmarks (phase 2 of the civilization integration).
//
// This table is the single source of truth for named places on the world map.
// Coordinates were validated against the real DEFAULT_WORLD_SEED (847291583);
// every site is on verified inland land. See BUG-001.
//
// Civilization modules (settlements, trade routes, caravans) must reconcile
// their names against THIS table — never rename or duplicate these locations.
export type LandmarkKind = 'village' | 'town' | 'dungeon' | 'ruin';

export type Landmark = {
  name: string;
  kind: LandmarkKind;
};

export type PlacedLandmark = Landmark & {
  chunk: { x: number; y: number };
};

export const LANDMARKS: Record<string, Landmark> = {
  '4,7': { name: 'Mosslight Crossing', kind: 'town' },
  '0,7': { name: 'Fenmere Hamlet', kind: 'village' },
  '8,7': { name: 'Ironwood Southhold', kind: 'town' },
  '5,2': { name: 'Northwatch Beacon', kind: 'village' },
  '2,4': { name: 'Old Mill', kind: 'village' },
  '9,3': { name: 'Emberpeak Shrine', kind: 'village' },
  '3,12': { name: 'Sunwash Port', kind: 'town' },
  '6,10': { name: 'Bellwater', kind: 'village' },
  '10,10': { name: 'Seabreak', kind: 'town' },
  '1,3': { name: 'Blackroot Camp', kind: 'village' },
  // Outer-region settlements (expanded world)
  '5,-5': { name: 'Frosthold', kind: 'village' },
  '4,19': { name: 'Dunewatch', kind: 'village' },
  '17,7': { name: 'Eastmarch', kind: 'town' },
  '-7,7': { name: 'Westhold', kind: 'village' },
  // Second continent settlements (far-eastern continent: x 117..196, y -28..51).
  '130,-16': { name: 'Stormhaven', kind: 'town' },
  '140,-20': { name: 'Frostwatch', kind: 'village' },
  '155,0': { name: 'Oakfield', kind: 'village' },
  '174,-8': { name: 'Stonebridge', kind: 'village' },
  '165,25': { name: 'Saltmarsh', kind: 'village' },
  '184,15': { name: 'Emberhold', kind: 'town' },
  '144,35': { name: 'Dunmere', kind: 'village' },
  // Second-continent points of interest (enterable dungeon + ruins).
  '136,-12': { name: 'Sunken Crypt', kind: 'dungeon' },
  '188,20': { name: 'Ember Ruins', kind: 'ruin' },
  '150,6': { name: 'Whispering Stones', kind: 'ruin' },
};

/** Landmarks as a list with parsed chunk coordinates, in table order. */
export const LANDMARK_LIST: PlacedLandmark[] = Object.entries(LANDMARKS).map(([key, landmark]) => {
  const [x, y] = key.split(',').map(Number);
  return { ...landmark, chunk: { x, y } };
});

/** Settlements only (no dungeons/ruins) — the places travelers journey between. */
export const SETTLEMENT_LIST: PlacedLandmark[] = LANDMARK_LIST.filter(
  (landmark) => landmark.kind === 'village' || landmark.kind === 'town',
);

export function landmarkAt(chunk: { x: number; y: number }): Landmark | null {
  return LANDMARKS[chunk.x + ',' + chunk.y] || null;
}
