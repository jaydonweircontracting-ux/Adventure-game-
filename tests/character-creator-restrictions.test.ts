import assert from 'node:assert/strict';
import { CHARACTER_CREATION_SLOTS } from '../src/components/RpgCharacterCreator';

const slots = Object.values(CHARACTER_CREATION_SLOTS);
const choices = slots.flatMap((slot) => slot.options);
assert.deepEqual(Object.keys(CHARACTER_CREATION_SLOTS), ['legs', 'torso', 'hair', 'beard']);
assert.ok(choices.includes('BluePants'));
assert.ok(choices.includes('BrvHrtTunic'));
assert.ok(choices.includes('DreamWalkerHair1'));
assert.ok(choices.some((item) => item.startsWith('Beard')));
for (const forbidden of [
  'BreastPlate1', 'BreastPlateGold', 'DrkChestPlat', 'ChainCoif', 'DrkHelm',
  'Dagger', 'BroadSword', 'BattleAxe', 'BoneBow', 'BucklerNisos', 'BucklerWood',
]) {
  assert.ok(!choices.includes(forbidden), `character creator must not offer gear: ${forbidden}`);
}
console.log('Character-creator restriction tests passed (basic clothing and hair only; no armor, weapons or shields).');
