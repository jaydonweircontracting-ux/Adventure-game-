import assert from 'node:assert/strict';
import { determineUpdateStatus, parseBuildMarker } from '../src/game/updateVersion';

assert.equal(parseBuildMarker('window.__AG_BUILD="728";'), 728);
assert.equal(parseBuildMarker('window.__AG_BUILD=\\"729\\";'), 729);
assert.equal(parseBuildMarker('window.__AG_BUILD="unknown";'), null);
assert.equal(parseBuildMarker('no build marker'), null);

assert.equal(determineUpdateStatus(727, 727, 727), 'current');
assert.equal(determineUpdateStatus(726, 727, 727), 'available');
assert.equal(determineUpdateStatus(726, 726, 727), 'in-progress');
assert.equal(determineUpdateStatus(727, 726, 727), 'in-progress');
assert.equal(determineUpdateStatus(727, 728, 728), 'available');
assert.equal(determineUpdateStatus(728, 727, 728), 'in-progress');
assert.equal(determineUpdateStatus(727, 707, 727), 'in-progress');

console.log('Update-version checks passed (11 assertions).');
