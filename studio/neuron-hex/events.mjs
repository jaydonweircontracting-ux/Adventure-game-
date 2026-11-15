// NEURON HEX events — append-only timing log + aggregates.
// The log lives in the goal hidden_files (never in the repo): the dispatcher
// and the parent append to it; the hook never writes (it only wakes).
// Each line: {"ts":"...","event":"released|completed|failed|stalled|duplicate_prevented|eligible_detected","task":"0x02","detail":{...}}
// "released" events may carry detectedAt (ISO) — when the hook woke the
// dispatcher — so detection-to-release latency can be measured.
import { appendFileSync, readFileSync, existsSync } from 'node:fs';

export function appendEvent(logPath, event) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
  appendFileSync(logPath, line);
  return line.trim();
}

export function readEvents(logPath) {
  if (!existsSync(logPath)) return [];
  const out = [];
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip a corrupt line, keep the rest */ }
  }
  return out;
}

export function aggregateEvents(events, nowMs = Date.now()) {
  const byType = {};
  for (const e of events) byType[e.event] = (byType[e.event] || 0) + 1;
  const hourAgo = nowMs - 3600 * 1000;
  const completedLastHour = events.filter((e) => e.event === 'completed' && Number.isFinite(Date.parse(e.ts)) && Date.parse(e.ts) >= hourAgo).length;
  const released = new Map();
  const completed = new Map();
  for (const e of events) {
    if (e.event === 'released' && e.task) released.set(e.task, Date.parse(e.ts));
    if (e.event === 'completed' && e.task) completed.set(e.task, Date.parse(e.ts));
  }
  let totalReleaseToCompletion = 0;
  let paired = 0;
  for (const [task, r] of released) {
    const c = completed.get(task);
    if (Number.isFinite(r) && Number.isFinite(c) && c >= r) { totalReleaseToCompletion += c - r; paired += 1; }
  }
  let totalDetectToRelease = 0;
  let detectPaired = 0;
  for (const e of events) {
    if (e.event === 'released' && e.detectedAt) {
      const d = Date.parse(e.detectedAt);
      const r = Date.parse(e.ts);
      if (Number.isFinite(d) && Number.isFinite(r) && r >= d) { totalDetectToRelease += r - d; detectPaired += 1; }
    }
  }
  return {
    total: events.length,
    byType,
    completedLastHour,
    avgReleaseToCompletionMs: paired ? Math.round(totalReleaseToCompletion / paired) : null,
    pairedCompletions: paired,
    avgDetectionToReleaseMs: detectPaired ? Math.round(totalDetectToRelease / detectPaired) : null,
    detectPaired,
  };
}
