// Standalone asserts for the NEURON HEX event log. Run directly: node events.test.mjs
// Throws on the first failure; prints the pass count on success.
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendEvent, readEvents, aggregateEvents } from './events.mjs';

let n = 0;
function check(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  n += 1;
}

const dir = mkdtempSync(path.join(tmpdir(), 'neuron-hex-events-'));
const log = path.join(dir, 'events.jsonl');
try {
  // Round-trip: append + read back; a corrupt line is skipped, not fatal.
  appendEvent(log, { event: 'released', task: '0x01' });
  appendEvent(log, { event: 'completed', task: '0x01' });
  appendEvent(log, { event: 'duplicate_prevented', task: '0x02' });
  appendFileSync(log, 'this is not json\n');
  appendEvent(log, { event: 'failed', task: '0x03' });
  const back = readEvents(log);
  check(back.length === 4, `round-trip reads 4 events, corrupt line skipped (got ${back.length})`);
  check(back[0].event === 'released' && back[0].task === '0x01' && typeof back[0].ts === 'string', 'first event keeps its fields plus a timestamp');
  check(readEvents(path.join(dir, 'missing.jsonl')).length === 0, 'missing log reads as empty');

  // Aggregates on synthetic events with known timestamps.
  const T0 = Date.parse('2026-11-15T23:00:00Z');
  const ev = [
    { ts: '2026-11-15T23:00:00Z', event: 'released', task: '0x01' },
    { ts: '2026-11-15T23:05:00Z', event: 'completed', task: '0x01' },
    { ts: '2026-11-15T23:10:00Z', event: 'released', task: '0x02', detectedAt: '2026-11-15T23:09:55Z' },
    { ts: '2026-11-15T23:15:00Z', event: 'completed', task: '0x02' },
    { ts: '2026-11-15T23:12:00Z', event: 'duplicate_prevented', task: '0x03' },
    { ts: '2026-11-15T23:13:00Z', event: 'failed', task: '0x04' },
    { ts: '2026-11-15T23:14:00Z', event: 'stalled', task: '0x05' },
  ];
  const a = aggregateEvents(ev, T0 + 1000 * 1000);
  check(a.total === 7, `aggregate total is 7 (got ${a.total})`);
  check(a.byType.released === 2 && a.byType.completed === 2 && a.byType.duplicate_prevented === 1 && a.byType.failed === 1 && a.byType.stalled === 1,
    `aggregate counts by type match (got ${JSON.stringify(a.byType)})`);
  check(a.completedLastHour === 2, `both completions are in the last hour (got ${a.completedLastHour})`);
  check(a.avgReleaseToCompletionMs === 300000 && a.pairedCompletions === 2,
    `avg release-to-completion is 300000ms over 2 pairs (got ${a.avgReleaseToCompletionMs})`);
  check(a.avgDetectionToReleaseMs === 5000 && a.detectPaired === 1,
    `avg detection-to-release is 5000ms over 1 pair (got ${a.avgDetectionToReleaseMs})`);
  const empty = aggregateEvents([], T0);
  check(empty.total === 0 && empty.completedLastHour === 0 && empty.avgReleaseToCompletionMs === null && empty.avgDetectionToReleaseMs === null,
    'empty log aggregates to zero/null, not an error');
  const old = aggregateEvents([{ ts: '2026-11-15T20:00:00Z', event: 'completed', task: '0x01' }], T0 + 1000 * 1000);
  check(old.completedLastHour === 0, 'a completion 3h ago does not count in the last hour');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`EVENTS ASSERTS: ${n} passed`);
