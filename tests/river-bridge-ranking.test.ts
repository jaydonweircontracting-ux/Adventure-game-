import assert from 'node:assert/strict';
import { defaultWorld } from '../src/game/iso/isoWorld';
import { bridgeAxisForCrossing, bridgeSitePlacementExists, bridgeSpanForCrossing, bridgeStyleForCrossing, scoreBridgeCrossing, finishBridge, freshBridgeSite, freshPathState, placeBridgeSpan, reconcileBridges, scanForBridgeSites, validateBridgeSite } from '../src/game/engine3d/paths';
import { placedBridgeTiles } from '../src/game/engine3d/placements';

// A controlled world with two independent river crossings; this fixture is deterministic. The first has
// a matching path on both banks; the second only has a near-bank approach.
const world = defaultWorld();
world.huts = [];
world.stalls = [];
world.trees = [];
world.rocks = [];
world.crates = [];
world.walls = [];
world.npcSpawns = [];
world.placements = [
  { kind: 'path', x0: 119, y0: 120, x1: 119, y1: 120 },
  { kind: 'path', x0: 121, y0: 120, x1: 121, y1: 120 },
  { kind: 'path', x0: 119, y0: 130, x1: 119, y1: 130 },
];
world.terrain = { '120,120': 'water', '120,130': 'water' };
world.rivers = [{
  id: 'river-test',
  tiles: [
    { x: 120, y: 120, dx: 0, dy: 1 },
    { x: 120, y: 130, dx: 0, dy: 1 },
  ],
  mouth: { x: 120, y: 140 },
}];

const state = freshPathState();
assert.deepEqual(scanForBridgeSites(world, state, 2), [], 'bridge day gate remains closed before day 3');
const sites = scanForBridgeSites(world, state, 3);
assert.equal(sites.length, 1, 'one daily scan opens only one bridge site');
assert.deepEqual({ x: sites[0].x, y: sites[0].y }, { x: 120, y: 120 }, 'the best two-bank-aligned crossing wins');
assert.equal(state.bridges.length, 1, 'only the selected site enters persisted bridge state');
assert.equal(state.bridges[0].id, 'bridge-120-120', 'bridge identity remains stable');
assert.equal('_candidateScore' in state.bridges[0], false, 'transient ranking data is never persisted');
assert.equal(state.lastBridgeScanDay, 3, 'the daily scan marker advances');
assert.deepEqual(scanForBridgeSites(world, state, 3), [], 'a second same-day scan does not create duplicates');
// BUILD 1123 release-gate test.
// Bridge spans cover every consecutive river tile and persist with a profile + axis.
function addRiver(id: string, coords: Array<{ x: number; y: number }>): void {
  for (const tile of coords) world.terrain[tile.x + ',' + tile.y] = 'water';
  world.rivers!.push({
    id,
    tiles: coords.map((tile, i) => ({
      ...tile,
      dx: i < coords.length - 1 ? coords[i + 1].x - tile.x : 0,
      dy: i < coords.length - 1 ? coords[i + 1].y - tile.y : 0,
    })),
    mouth: { ...coords[coords.length - 1] },
  });
}
const one = [{ x: 160, y: 140 }];
const two = [{ x: 170, y: 140 }, { x: 171, y: 140 }];
const three = [{ x: 150, y: 140 }, { x: 151, y: 140 }, { x: 152, y: 140 }];
const four = [{ x: 160, y: 150 }, { x: 161, y: 150 }, { x: 162, y: 150 }, { x: 163, y: 150 }];
const blockedBank = [{ x: 180, y: 140 }];
addRiver('one-tile', one);
addRiver('two-tile', two);
addRiver('three-tile', three);
addRiver('four-tile', four);
addRiver('narrow-stream', blockedBank);
world.terrain['181,140'] = 'water'; // water beyond the river is not treated as a walkable bank
world.placements!.push(
  { kind: 'path', x0: 159, y0: 140, x1: 159, y1: 140 },
  { kind: 'path', x0: 161, y0: 140, x1: 161, y1: 140 },
  { kind: 'path', x0: 169, y0: 140, x1: 169, y1: 140 },
  { kind: 'path', x0: 172, y0: 140, x1: 172, y1: 140 },
  { kind: 'path', x0: 149, y0: 140, x1: 149, y1: 140 },
  { kind: 'path', x0: 153, y0: 140, x1: 153, y1: 140 },
  { kind: 'path', x0: 159, y0: 150, x1: 159, y1: 150 },
  { kind: 'path', x0: 164, y0: 150, x1: 164, y1: 150 },
);
assert.equal(bridgeSpanForCrossing(world, { x: 149, y: 140 }, three[0]).length, 3, 'the bridge span follows all three river tiles');
assert.equal(bridgeAxisForCrossing({ x: 149, y: 140 }, three[0]), 'x', 'west/east crossings save the x axis');
assert.equal(bridgeAxisForCrossing({ x: 150, y: 139 }, three[0]), 'y', 'north/south crossings save the y axis');
assert.equal(bridgeStyleForCrossing(world, { x: 159, y: 140 }, one[0]), 'wooden', 'a road-aligned narrow crossing selects wood');
assert.equal(bridgeStyleForCrossing(world, { x: 169, y: 140 }, two[0]), 'stone', 'a two-tile crossing selects stone');
assert.equal(bridgeStyleForCrossing(world, { x: 149, y: 140 }, three[0]), 'large-road', 'a three-tile crossing selects a road bridge');
assert.equal(bridgeStyleForCrossing(world, { x: 159, y: 150 }, four[0]), 'wide-river', 'a four-tile crossing selects a wide-river bridge');
assert.equal(bridgeStyleForCrossing(world, { x: 179, y: 140 }, blockedBank[0]), 'narrow-stream', 'a water-terminated bank is never promoted to a road bridge');
assert.equal(scoreBridgeCrossing(world, { x: 179, y: 140 }, blockedBank[0]), -Infinity, 'a crossing with no dry far bank is rejected entirely');
const foot = [{ x: 175, y: 140 }];
addRiver('footbridge', foot);
assert.equal(bridgeStyleForCrossing(world, { x: 174, y: 140 }, foot[0]), 'footbridge', 'a walkable unpaved far bank selects a footbridge');

const spanSite = freshBridgeSite(150, 140, { x: 149, y: 140 }, three, 'large-road', 'x');
const savedSite = validateBridgeSite({ ...spanSite, state: 'building', progress: 1, spentWood: 2 });
assert.deepEqual(savedSite?.spanTiles, three, 'span tiles survive founders-save validation');
assert.equal(savedSite?.style, 'large-road', 'bridge profile survives founders-save validation');
assert.equal(savedSite?.axis, 'x', 'bridge axis survives founders-save validation');
const legacySite = validateBridgeSite({ x: 9, y: 9, workTile: { x: 8, y: 9 }, state: 'none' });
assert.deepEqual(legacySite?.spanTiles, [{ x: 9, y: 9 }], 'legacy bridge saves migrate to a one-tile span');
assert.equal(legacySite?.style, 'wooden', 'legacy bridge saves retain the wooden appearance');

const placedWorld = defaultWorld();
placedWorld.huts = []; placedWorld.stalls = []; placedWorld.trees = []; placedWorld.rocks = [];
placedWorld.crates = []; placedWorld.walls = []; placedWorld.npcSpawns = []; placedWorld.placements = [];
placedWorld.terrain = { '150,140': 'water', '151,140': 'water', '152,140': 'water' };
placedWorld.rivers = [{ id: 'place-span', tiles: three.map((tile) => ({ ...tile, dx: 1, dy: 0 })), mouth: { x: 153, y: 140 } }];
const placedSite = freshBridgeSite(150, 140, { x: 149, y: 140 }, three, 'large-road', 'x');
const placedResult = placeBridgeSpan(placedWorld, placedSite, { x: 0, y: 0 }, []);
assert.equal(placedResult.ok, true, 'a clear multi-tile bridge places atomically');
assert.equal(placedBridgeTiles(placedWorld).length, 3, 'every water tile receives a bridge deck');
assert.equal(placedBridgeTiles(placedWorld).every((tile) => tile.style === 'large-road' && tile.axis === 'x'), true, 'profile and axis persist on every bridge tile');
assert.equal(bridgeSitePlacementExists(placedWorld, placedSite), true, 'reconciliation sees a complete span');
const done = finishBridge([placedSite], placedSite.id);
placedWorld.placements!.pop();
assert.equal(reconcileBridges(done, placedWorld)[0].state, 'none', 'a partial/missing span cannot remain marked complete');

const blockedWorld = defaultWorld();
blockedWorld.huts = []; blockedWorld.stalls = []; blockedWorld.trees = []; blockedWorld.rocks = [];
blockedWorld.crates = []; blockedWorld.walls = []; blockedWorld.npcSpawns = []; blockedWorld.placements = [];
blockedWorld.terrain = { '160,150': 'water', '161,150': 'water', '162,150': 'water' };
blockedWorld.rivers = [{ id: 'blocked-span', tiles: [160, 161, 162].map((x) => ({ x, y: 150, dx: 1, dy: 0 })), mouth: { x: 163, y: 150 } }];
const blockedSite = freshBridgeSite(160, 150, { x: 159, y: 150 }, [{ x: 160, y: 150 }, { x: 161, y: 150 }, { x: 162, y: 150 }], 'large-road', 'x');
const beforeBlocked = blockedWorld.placements.length;
assert.equal(placeBridgeSpan(blockedWorld, blockedSite, { x: 161, y: 150 }, []).ok, false, 'a player standing in the span blocks the whole bridge');
assert.equal(blockedWorld.placements.length, beforeBlocked, 'blocked placement never leaves a partial bridge');

console.log('River bridge tests passed (ranking, full spans, six styles, axis, save migration, atomic placement).');
