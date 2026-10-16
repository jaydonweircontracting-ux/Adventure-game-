import assert from 'node:assert/strict';
import { determineUpdateStatus, parseBuildMarker } from '../src/game/updateVersion';

assert.equal(parseBuildMarker('window.__AG_BUILD="725";'), 725);
assert.equal(parseBuildMarker('window.__AG_BUILD=\\"726\\";'), 726);
assert.equal(parseBuildMarker('window.__AG_BUILD="unknown";'), null);
assert.equal(parseBuildMarker('no build marker'), null);

assert.equal(determineUpdateStatus(724, 724, 724), 'current');
assert.equal(determineUpdateStatus(723, 724, 724), 'available');
assert.equal(determineUpdateStatus(723, 723, 724), 'in-progress');
assert.equal(determineUpdateStatus(724, 723, 724), 'in-progress');
assert.equal(determineUpdateStatus(724, 725, 725), 'available');
assert.equal(determineUpdateStatus(725, 724, 725), 'in-progress');

console.log('Update-version checks passed (10 assertions).');
