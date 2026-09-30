// BUILD 285: lockpicks + simple lockpicking. Pure data + helpers; App.tsx owns
// rendering, attempts, and persistence.
//
// Design notes:
// - Chests are deterministic per chunk (id 'cx,cy:index'), so saves only need
//   to store opened ids — positions never need persisting.
// - Placement is contextual: bandit stashes on dangerous road chunks, old
//   stone coffers in deep rocky/desert wilderness.
// - Lockpicking is deliberately simple for now: each attempt consumes one
//   lockpick and succeeds at a flat chance. (A timing minigame can layer on
//   top of attemptLockpick later without changing the data model.)

export type LockedChest = {
  /** Deterministic id 'chunkX,chunkY:index'. */
  id: string;
  chunk: { x: number; y: number };
  /** Field-unit position inside the chunk (0..140). */
  position: { x: number; y: number };
  label: string;
  loot: Record<string, number>;
};

/** Flat success chance per attempt (one lockpick consumed per attempt). */
export const LOCKPICK_SUCCESS_CHANCE = 0.65;

/** Pure attempt resolution: pass Math.random() from the caller. */
export function attemptLockpick(random: number): boolean {
  return random < LOCKPICK_SUCCESS_CHANCE;
}

export type ChestChunkInfo = { hasRoad: boolean; danger: number; terrain: string };

export function chestsForChunk(chunk: { x: number; y: number }, info: ChestChunkInfo): LockedChest[] {
  const chests: LockedChest[] = [];
  const seedBase = Math.abs(chunk.x * 31 + chunk.y * 57);
  const fieldPos = (salt: number) => ({
    x: 20 + ((seedBase * (43 + salt)) % 100),
    y: 20 + ((seedBase * (61 + salt)) % 100),
  });
  // Bandit stash: stolen goods cached near dangerous roads.
  if (info.hasRoad && info.danger >= 1 && seedBase % 3 === 0) {
    chests.push({
      id: chunk.x + ',' + chunk.y + ':0',
      chunk: { ...chunk },
      position: fieldPos(7),
      label: "Bandit's stash",
      loot: { coins: 8 + (seedBase % 12), fabric: 1, lockpicks: 1 },
    });
  }
  // Old stone coffer: ancient cache in deep rocky/desert wilderness.
  if ((info.terrain === 'rock' || info.terrain === 'desert') && info.danger >= 2 && seedBase % 2 === 0) {
    const loot: Record<string, number> = { coins: 12 + (seedBase % 20), bone: 1 };
    if (seedBase % 4 === 0) loot.daggers = 1;
    chests.push({
      id: chunk.x + ',' + chunk.y + ':1',
      chunk: { ...chunk },
      position: fieldPos(13),
      label: 'Old stone coffer',
      loot,
    });
  }
  return chests;
}

/** Serialize opened chest ids for save/load. */
export function serializeOpenedChests(ids: string[]): string {
  return JSON.stringify(ids);
}

/** Parse opened chest ids; tolerant of missing/corrupt data. */
export function parseOpenedChests(data: string | undefined | null): string[] {
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
