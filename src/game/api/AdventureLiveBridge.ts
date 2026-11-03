/**
 * Read-only bridge from the Adventure API into the authoritative running game.
 * Providers are getters over GameField refs: no second clock, NPC simulation,
 * inventory, quest store or save state is created here.
 */
import { AdventureAPI } from './AdventureAPI';
import { GRAPHICS_MODE_OPTIONS } from '../engine3d/engine3d';
import { macroLandformAt, moistureAt, forestDensityAt, rockDensityAt, regionForChunk, waterAt, landUseAt } from '../landscape';
import { NPC_ARCHETYPES, getArchetype } from '../npcArchetypes';
import { createDefaultMood, applyMoodEvent, advanceMoodTime, moodSummary, isValidMood } from '../npcMood';
import { findPath, pathTo, pathToDoor, stepAlongPath, trackStep, validateDestination, isOnFieldRoad } from '../npcNavigation';
import { ItemRng, ITEM_BASES, ITEM_QUALITIES, ITEM_QUALITY_ORDER, AFFIXES, generateItem, totalEquipmentStats, equipItem, unequipItem, generatedItemWeight, carriedWeight, carryCapacity, encumbranceTier } from '../items';
import { getDirection, isAdjacentTarget, isAdjacentAndFacing, getAttackHitbox, entityRect, isEntityInHitbox, isInMeleeArc, traceLineBlocked } from '../combat';

export interface AdventureLiveSnapshot {
  world: unknown;
  player: unknown;
  npcs: unknown;
  inventory: unknown;
  quests: unknown;
  civilization: unknown;
}

export interface AdventureLiveProviders {
  world: () => AdventureLiveSnapshot['world'];
  player: () => AdventureLiveSnapshot['player'];
  npcs: () => AdventureLiveSnapshot['npcs'];
  inventory: () => AdventureLiveSnapshot['inventory'];
  quests: () => AdventureLiveSnapshot['quests'];
  civilization: () => AdventureLiveSnapshot['civilization'];
}

export interface AdventureLiveBridge {
  readonly api: AdventureAPI;
  readSnapshot: () => AdventureLiveSnapshot;
  dispose: () => void;
}

export function createAdventureLiveBridge(providers: AdventureLiveProviders): AdventureLiveBridge {
  const api = new AdventureAPI({ eventHistoryLimit: 120 });
  const unregister: Array<() => void> = [];
  const registerSnapshot = (
    id: string,
    domain: 'world' | 'player' | 'npc' | 'economy' | 'quests',
    description: string,
    read: () => unknown,
  ) => unregister.push(api.registerSystem({
    id, domain, version: '1.0.0', description,
  }, Object.freeze({ getSnapshot: read })));

  registerSnapshot('world.live', 'world', 'Read-only access to the active world clock and player chunk', providers.world);
  unregister.push(api.registerSystem({
    id: 'world.terrain', domain: 'world', version: '1.0.0',
    description: 'Query the same deterministic landscape and terrain layers used by the active game',
  }, Object.freeze({
    sample: (x: number, y: number) => ({
      landform: macroLandformAt(x, y),
      moisture: moistureAt(x, y),
      forestDensity: forestDensityAt(x, y),
      rockDensity: rockDensityAt(x, y),
      landUse: landUseAt(x, y),
      water: waterAt(x, y),
      region: regionForChunk({ x: Math.floor(x / 280), y: Math.floor(y / 280) }),
    }),
  })));
  registerSnapshot('player.live', 'player', 'Read-only access to the active player position, health, level and attributes', providers.player);
  registerSnapshot('npc.roster.live', 'npc', 'Read-only access to the active townsfolk and NPC roster', providers.npcs);
  registerSnapshot('inventory.live', 'economy', 'Read-only access to the active player inventory and equipment', providers.inventory);
  registerSnapshot('quests.live', 'quests', 'Read-only access to active quest and task progress', providers.quests);
  registerSnapshot('civilization.live', 'economy', 'Read-only access to the active civilization and settlement economy', providers.civilization);

  unregister.push(api.registerSystem({
    id: 'graphics.modes', domain: 'graphics', version: '1.0.0',
    description: 'Supported 2D, 2.5D and experimental 3D rendering modes',
  }, Object.freeze({ modes: GRAPHICS_MODE_OPTIONS })));

  unregister.push(api.registerSystem({
    id: 'npc.psychology', domain: 'npc', version: '1.0.0',
    description: 'Existing NPC archetypes, mood events, validation and recovery functions',
  }, Object.freeze({
    archetypes: NPC_ARCHETYPES, archetype: getArchetype, createMood: createDefaultMood,
    applyEvent: applyMoodEvent, advanceTime: advanceMoodTime, summarize: moodSummary, validate: isValidMood,
  })));

  unregister.push(api.registerSystem({
    id: 'npc.navigation', domain: 'npc', version: '1.0.0',
    description: 'Existing obstacle-aware pathfinding, doorway routing and movement functions',
  }, Object.freeze({ findPath, pathTo, pathToDoor, step: stepAlongPath, trackStep, validateDestination, isOnFieldRoad })));

  unregister.push(api.registerSystem({
    id: 'economy.items', domain: 'economy', version: '1.0.0',
    description: 'Existing seeded item generation, equipment calculations and encumbrance rules',
  }, Object.freeze({
    bases: ITEM_BASES, qualities: ITEM_QUALITIES, qualityOrder: ITEM_QUALITY_ORDER, affixes: AFFIXES,
    createRng: (seed: number) => new ItemRng(seed), generate: generateItem,
    equipmentStats: totalEquipmentStats, equip: equipItem, unequip: unequipItem,
    itemWeight: generatedItemWeight, carriedWeight, carryCapacity, encumbrance: encumbranceTier,
  })));

  unregister.push(api.registerSystem({
    id: 'combat.geometry', domain: 'combat', version: '1.0.0',
    description: 'Existing facing, adjacency, melee hitbox and line-of-sight geometry',
  }, Object.freeze({
    direction: getDirection, isAdjacent: isAdjacentTarget, isFacingPair: isAdjacentAndFacing,
    attackHitbox: getAttackHitbox, entityBounds: entityRect, intersectsHitbox: isEntityInHitbox,
    isInMeleeArc, isLineBlocked: traceLineBlocked,
  })));

  const readSnapshot = (): AdventureLiveSnapshot => ({
    world: providers.world(),
    player: providers.player(),
    npcs: providers.npcs(),
    inventory: providers.inventory(),
    quests: providers.quests(),
    civilization: providers.civilization(),
  });

  return {
    api,
    readSnapshot,
    dispose() { for (const remove of unregister.reverse()) remove(); },
  };
}
