import assert from 'node:assert/strict';
import { determineUpdateStatus, parseBuildMarker } from '../src/game/updateVersion';

assert.equal(parseBuildMarker('window.__AG_BUILD="726";'), 726);
assert.equal(parseBuildMarker('window.__AG_BUILD=\\"727\\";'), 727);
assert.equal(parseBuildMarker('window.__AG_BUILD="unknown";'), null);
assert.equal(parseBuildMarker('no build marker'), null);

assert.equal(determineUpdateStatus(725, 725, 725), 'current');
assert.equal(determineUpdateStatus(724, 725, 725), 'available');
assert.equal(determineUpdateStatus(724, 724, 725), 'in-progress');
assert.equal(determineUpdateStatus(725, 724, 725), 'in-progress');
assert.equal(determineUpdateStatus(725, 726, 726), 'available');
assert.equal(determineUpdateStatus(726, 725, 726), 'in-progress');
assert.equal(determineUpdateStatus(725, 707, 725), 'in-progress');

console.log('Update-version checks passed (11 assertions).');
