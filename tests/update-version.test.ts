import assert from 'node:assert/strict';
import { determineUpdateStatus, parseBuildMarker } from '../src/game/updateVersion';

assert.equal(parseBuildMarker('window.__AG_BUILD="727";'), 727);
assert.equal(parseBuildMarker('window.__AG_BUILD=\\"728\\";'), 728);
assert.equal(parseBuildMarker('window.__AG_BUILD="unknown";'), null);
assert.equal(parseBuildMarker('no build marker'), null);

assert.equal(determineUpdateStatus(726, 726, 726), 'current');
assert.equal(determineUpdateStatus(725, 726, 726), 'available');
assert.equal(determineUpdateStatus(725, 725, 726), 'in-progress');
assert.equal(determineUpdateStatus(726, 725, 726), 'in-progress');
assert.equal(determineUpdateStatus(726, 727, 727), 'available');
assert.equal(determineUpdateStatus(727, 726, 727), 'in-progress');
assert.equal(determineUpdateStatus(726, 707, 726), 'in-progress');

console.log('Update-version checks passed (11 assertions).');
