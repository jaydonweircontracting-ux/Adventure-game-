import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// BUILD 804: Guard against the recurring stale/mismatched build number.
const entrySource = readFileSync('scripts/prepare-build-entry.cjs', 'utf8');
const appSource = readFileSync('src/App.tsx', 'utf8');
const markerBuild = parseBuildMarker(entrySource);
const appBuildMatch = appSource.match(/const BUILD_NUMBER = '(\d+)'/);
assert.ok(appBuildMatch, 'App.tsx must declare BUILD_NUMBER');
assert.equal(markerBuild, Number(appBuildMatch[1]), 'HTML boot marker and bundled app build must match');

const deployedManifest = JSON.parse(readFileSync('dist/public/version.json', 'utf8')) as { build?: string | number };
assert.equal(Number(deployedManifest.build), markerBuild, 'generated deployed version.json must match the source build marker');

console.log('Update-version checks passed, including source/app/deployed build consistency.');
