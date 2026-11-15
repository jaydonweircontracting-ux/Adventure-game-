// BUILD 1054 — the clean-wilderness gate.
//
// The user wants the 3D world empty for now: just trees and terrain
// (plus water and rocks). The villagers are being reworked and will
// come back later, and NPCs will build the towns themselves — so
// NOTHING town/NPC is deleted. The town layout generator, the
// villager roster, the town buildings, the landmarks, the market,
// the cobble, the car, and the transient travelers all still exist
// in the code; they just do not run while this flag is on.
//
// Reversal: set WILDERNESS_ONLY to false. The town comes back from
// the layout on the next load (applyMosslightTownLayout re-stamps
// every generated lot from the layout generator on every load), the
// villagers come back from their saved roster (NPC_SAVE_KEY is never
// overwritten while the flag is on — see the per-tick serializer
// gate in Engine3DWorldView), and the player's own placements,
// inventory, gold, and position are untouched throughout.
//
// What the flag gates (all in Engine3DWorldView unless noted):
//   - applyMosslightTownLayout: returns stripTownContent(source)
//     instead of stamping roads/plaza/lots/town buildings/props/
//     stalls/landmarks.
//   - savedNpcActors: returns [] (no villagers spawn).
//   - The NPC tick: early return (no NPC simulation work at all),
//     and its NPC_SAVE_KEY write is gated too.
//   - Transient mount + timer spawns: skipped (no travelers or
//     adventurers; the spawn test hook returns null).
//   - summonCar + the Car button: hidden/refused (no car).
//   - cobbleForTile (settlements.ts): false (no cobbled paving).
//
// What stays: trees (seed + scatter + wild), terrain heightfield,
// water (ocean, authored pond, wild lakes), rocks (seed + scatter +
// stampExtraRocks), wild animals (session-only wildlife, not
// villagers), the HUD, sprint/stamina, Build mode (the player can
// still place things — an open question for the user, not decided
// here), and the 1053 minimap (it reads the world, so it renders
// terrain-only on its own).
//
// Pure module (no React, no WebGL, no I/O) so the sim and the
// standalone asserts can import it directly.
import { terrainKey, type IsoWorld, type Terrain } from '../iso/isoWorld';
import { stampExtraRocks } from './townAdditions3d';

/** BUILD 1054: true = the 3D world generates as pure wilderness. */
export const WILDERNESS_ONLY = true;

/**
 * Strip every generated man-made thing from a world, keeping the
 * natural world and the player's own work. Returns a NEW world;
 * the source is never mutated.
 *
 * Removed: walls, huts (generated + town buildings), stalls
 * (generated + market), crates (layout props + authored crates),
 * NPC spawns, prop decor (fountain, statue), crate kinds, wild
 * landmarks, and every 'dirt'/'sand' terrain entry (the generated
 * roads and plaza — the legacy cross-roads included). The authored
 * pond stays: it is 'water', not dirt/sand.
 *
 * Kept: trees (filtered by the user's removed-trees set, as the
 * adapter does), rocks, all other terrain (water included), the
 * player's own placements, and every removal/moved record
 * (removedHuts, removedPaths, movedHuts, ...) so a reversal
 * restores the town exactly as the player left it. Extra wild
 * rocks are re-stamped (stampExtraRocks) so rock density matches
 * the world the player knew.
 */
export function stripTownContent(source: IsoWorld): IsoWorld {
  const terrain: Record<string, Terrain> = {};
  for (const [k, t] of Object.entries(source.terrain)) {
    if (t === 'dirt' || t === 'sand') continue;
    terrain[k] = t;
  }
  const removedTreeKeys = new Set(source.removedTrees ?? []);
  const world: IsoWorld = {
    ...source,
    terrain,
    walls: [],
    huts: [],
    stalls: [],
    trees: (source.trees ?? []).filter((t) => !removedTreeKeys.has(terrainKey(t.tx, t.ty))),
    rocks: [...(source.rocks ?? [])],
    crates: [],
    npcSpawns: [],
    propDecor: [],
    crateKinds: {},
    landmarks: [],
  };
  stampExtraRocks(world);
  return world;
}
