import assert from 'node:assert/strict';
import { takeBodyLootSelection, type LootableBody } from '../src/game/lootableBodies';

const body: LootableBody = {
  id: 'body-test', npcId: 'npc-test', npcName: 'Test Guard',
  chunk: { x: 4, y: 7 }, position: { x: 120, y: 80 }, day: 1,
  loot: { gold: 23, potions: 2, items: ['iron-helmet', 'leather-boots'] },
  looted: false,
};

const gold = takeBodyLootSelection(body, { kind: 'gold' });
assert.ok(gold, 'gold should be selectable');
assert.equal(gold.taken.gold, 23);
assert.deepEqual(gold.updatedBody.loot, { gold: 0, potions: 2, items: ['iron-helmet', 'leather-boots'] });
assert.equal(gold.updatedBody.looted, false, 'unselected loot must remain on the body');
assert.equal(takeBodyLootSelection(gold.updatedBody, { kind: 'gold' }), null, 'empty gold stack cannot be taken twice');

const potion = takeBodyLootSelection(gold.updatedBody, { kind: 'potion' });
assert.ok(potion);
assert.equal(potion.taken.potions, 1);
assert.deepEqual(potion.updatedBody.loot, { gold: 0, potions: 1, items: ['iron-helmet', 'leather-boots'] });

const item = takeBodyLootSelection(potion.updatedBody, { kind: 'item', itemId: 'iron-helmet' });
assert.ok(item);
assert.deepEqual(item.taken.items, ['iron-helmet']);
assert.deepEqual(item.updatedBody.loot, { gold: 0, potions: 1, items: ['leather-boots'] });
assert.equal(takeBodyLootSelection(item.updatedBody, { kind: 'item', itemId: 'missing' }), null, 'stale item selection must be ignored');

const lastPotion = takeBodyLootSelection(item.updatedBody, { kind: 'potion' });
assert.ok(lastPotion);
const lastItem = takeBodyLootSelection(lastPotion.updatedBody, { kind: 'item', itemId: 'leather-boots' });
assert.ok(lastItem);
assert.equal(lastItem.updatedBody.looted, true, 'body is marked looted only after every entry is taken');
assert.deepEqual(lastItem.updatedBody.loot, { gold: 0, potions: 0, items: [] });
assert.equal(takeBodyLootSelection(lastItem.updatedBody, { kind: 'potion' }), null, 'fully looted bodies reject further transfers');

console.log('Selective body-loot tests passed (partial take, stale selection, persistence, completion).');
