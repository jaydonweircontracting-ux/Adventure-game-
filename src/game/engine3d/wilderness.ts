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
import { oceanAt, scatterTreeAt, terrainKey, TREE_PROTECTED_TILES, type IsoWorld, type Terrain } from '../iso/isoWorld';
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
  // BUILD 1061: re-forest the ghost town. The generator never
  // planted inside the old town rect (defaultWorld's scatter loop
  // skips |x-100| <= 24, |y-100| <= 24 — the town needed clear
  // ground), and the migration copies that exclusion, so the player
  // spawn (99,105) and the camp's west side sat in a treeless hole:
  // nearest tree to the spawn was 19 tiles away even though the
  // tile is forest (the noise field says forest; the scatter hash
  // is uniform, 6.01% < 0.06 across the map — the hole is the
  // exclusion, not the density). The town is stripped in this mode,
  // so the footprint regrows with the same scatter rule. A
  // deterministic derivation on every load, so it is idempotent: a
  // tile already in the list is skipped, a chopped tree stays
  // chopped via removedTrees, and water / rocks / placements / the
  // spawn ring / the protected camp tiles stay clear. Runs after
  // stampExtraRocks so no rock lands on a new tree.
  const treeKeys = new Set(world.trees.map((t) => terrainKey(t.tx, t.ty)));
  const rockKeys = new Set(world.rocks.map((r) => terrainKey(r.tx, r.ty)));
  const blocked = new Set<string>();
  for (const p of source.placements ?? []) for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) blocked.add(terrainKey(x, y));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) blocked.add(terrainKey(source.playerStart.tx + dx, source.playerStart.ty + dy));
  for (const k of TREE_PROTECTED_TILES) blocked.add(k);
  for (let y = 76; y <= 124; y++) for (let x = 76; x <= 124; x++) {
    const k = terrainKey(x, y);
    if (treeKeys.has(k) || removedTreeKeys.has(k) || rockKeys.has(k) || blocked.has(k)) continue;
    if (!scatterTreeAt(x, y)) continue;
    if (oceanAt(x, y) || terrain[k] === 'water') continue;
    world.trees.push({ tx: x, ty: y });
    treeKeys.add(k);
  }
  return world;
}
