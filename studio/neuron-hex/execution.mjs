// execution.mjs — NEURON HEX execution policy: measured, not guessed.
//
// Diagnosis (2026-11-15, from the 1062–1065 runs): the same file is edited
// repeatedly because it is the single integration point for every 3D system.
// Engine3DWorldView.tsx is 6,638 lines; builds 1062–1064 put 232 added /
// 38 deleted lines into it, and the J-1 worker's uncommitted diff holds 14
// separate hunks in it (imports, refs, tick wiring, HUD, test hooks) made
// as ~6 separate edit calls. The hunks are distinct integration points, not
// rework — but one edit call per hunk re-opens the same giant file every
// time. That is the bottleneck: a god-component plus fine-grained edits.
//
// This module is pure (no I/O): it turns a task's git diff + run record
// into metrics, names the bottleneck file, and returns a verdict. The
// parent records the verdict per task; the next build is measured against
// the baseline. Thresholds are grounded in the 1062–1065 numbers above.
//
// Usage:
//   node --test execution.test.mjs   (standalone asserts, no runner needed
//   beyond node; the file throws on failure, matching scheduler.test.mjs)

export const WARN_FILE_HUNKS = 8; // one file with >=8 hunks in one task
export const FLAG_FILE_HUNKS = 12; // one file with >=12 hunks in one task
export const HOT_FILE_BUILDS = 3; // same file touched in >=3 consecutive builds
export const WARN_EDIT_CALLS = 3; // one file edited >=3 times: warn (one below the hard stop)
export const REPEAT_EDIT_CALLS = 4; // one file edited >=4 times: HARD STOP (flag). The four-edit limit is a hard stop, not a warning — the worker stops, the parent diagnoses, the task is reassigned with a different strategy.

// Parse `git show --numstat` / `git diff --numstat` output.
// Lines: "<added>\t<deleted>\t<file>" (binary files show "-").
// Returns [{ file, added, deleted }], skipping blanks.
export function parseNumstat(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const added = parts[0] === '-' ? 0 : Number(parts[0]);
    const deleted = parts[1] === '-' ? 0 : Number(parts[1]);
    if (!Number.isFinite(added) || !Number.isFinite(deleted)) continue;
    out.push({ file: parts.slice(2).join('\t'), added, deleted });
  }
  return out;
}

// Count diff hunks per file from `git diff` output.
// A hunk header is a line starting with "@@ ". The file is the most recent
// "diff --git a/<path> b/<path>" line before it.
// Returns { "<file>": hunkCount }.
export function parseHunks(diffText) {
  const hunks = {};
  let current = null;
  for (const line of String(diffText || '').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
      current = m ? m[2] : null;
    } else if (line.startsWith('@@ ') && current) {
      hunks[current] = (hunks[current] || 0) + 1;
    }
  }
  return hunks;
}

// Build the metrics for one task from its diff + run record.
//   files: parseNumstat() output (or [] when unknown)
//   hunks: parseHunks() output (or {} when unknown)
//   editCalls: { "<file>": count } of edit tool calls in the run (parent
//     supplies this from the run's monitor notes; {} when unknown)
//   durationMs: release -> completion, from the events log (or null)
// Returns the metrics object the verdict functions read.
export function executionMetrics({ files = [], hunks = {}, editCalls = {}, durationMs = null } = {}) {
  const filesChanged = files.length;
  let linesAdded = 0;
  let linesDeleted = 0;
  for (const f of files) { linesAdded += f.added; linesDeleted += f.deleted; }
  let topFile = null;
  let topHunks = 0;
  let totalHunks = 0;
  for (const [file, n] of Object.entries(hunks)) {
    totalHunks += n;
    if (n > topHunks) { topHunks = n; topFile = file; }
  }
  let topEditFile = null;
  let topEditCalls = 0;
  for (const [file, n] of Object.entries(editCalls)) {
    if (n > topEditCalls) { topEditCalls = n; topEditFile = file; }
  }
  const topShare = totalHunks ? topHunks / totalHunks : 0;
  return {
    filesChanged, linesAdded, linesDeleted,
    totalHunks, topFile, topHunks, topShare,
    topEditFile, topEditCalls, durationMs,
  };
}

// Name the bottleneck for one task: the file that concentrates the work.
// priorBuilds: array of per-build file lists (most recent last), e.g.
//   [["src/a.ts"], ["src/a.ts","src/b.ts"]] — a file present in the last
//   HOT_FILE_BUILDS consecutive builds is a hot file.
// Returns null when nothing crosses a threshold, else
//   { file, level: 'warn'|'flag', reasons: [...] }.
export function bottleneckFile(metrics, priorBuilds = []) {
  const reasons = [];
  let level = null;
  const file = metrics.topFile;
  if (file && metrics.topHunks >= FLAG_FILE_HUNKS) {
    level = 'flag';
    reasons.push(`${file}: ${metrics.topHunks} hunks in one task (>= ${FLAG_FILE_HUNKS})`);
  } else if (file && metrics.topHunks >= WARN_FILE_HUNKS) {
    level = 'warn';
    reasons.push(`${file}: ${metrics.topHunks} hunks in one task (>= ${WARN_FILE_HUNKS})`);
  }
  if (metrics.topEditFile && metrics.topEditCalls >= WARN_EDIT_CALLS) {
    const r = `${metrics.topEditFile}: edited ${metrics.topEditCalls} times in one task (hard stop at ${REPEAT_EDIT_CALLS})`;
    reasons.push(r);
    if (metrics.topEditCalls >= REPEAT_EDIT_CALLS) level = 'flag';
    else if (level !== 'flag') level = 'warn';
  }
  if (priorBuilds.length >= HOT_FILE_BUILDS) {
    const recent = priorBuilds.slice(-HOT_FILE_BUILDS);
    const counts = {};
    for (const build of recent) for (const f of new Set(build)) counts[f] = (counts[f] || 0) + 1;
    for (const [f, n] of Object.entries(counts)) {
      if (n >= HOT_FILE_BUILDS) {
        const r = `${f}: touched in ${n} consecutive builds (hot file)`;
        if (!reasons.includes(r)) reasons.push(r);
        if (level === null) level = 'warn';
      }
    }
  }
  if (!level) return null;
  return { file: file || metrics.topEditFile, level, reasons };
}

// Overall verdict for one task. Returns { level, reasons } where level is
// 'ok' | 'warn' | 'flag'. A flag means: stop, diagnose, change approach
// before the next task — do not repeat the same edit pattern.
export function executionVerdict(metrics, priorBuilds = []) {
  const b = bottleneckFile(metrics, priorBuilds);
  if (!b) return { level: 'ok', reasons: [] };
  return { level: b.level, reasons: b.reasons };
}

// --- productivity: more than speed. ---
// A faster build that delivers less functionality is not an improvement.
// The record is assembled from the parent's verification (duration from the
// events log, tests from the re-run asserts, regressions from the sim
// comparison, functionality from the probe). Speed is one of seven numbers.
export const FOUNDATION_BASELINE = {
  // Average of the three foundation builds 0x02-0x04 (events log):
  // 1684s, 1316s, 1532s -> 1511s. The number 0x06 is measured against.
  avgDurationMs: 1511000,
  builds: 3,
};

// Assemble one build's productivity record. featuresCompleted counts the
// task's completed outcomes (the brief's deliverables), not the files
// touched. functionality is what the player can actually do now, verified
// in the probe — free text, not a count.
export function productivityRecord({ taskId, durationMs, featuresCompleted, testsPassed, regressions, filesChanged, topHunks, topEditCalls, functionality = '' }) {
  return { taskId, durationMs, featuresCompleted, testsPassed, regressions, filesChanged, topHunks, topEditCalls, functionality };
}

// Compare one build against a baseline (FOUNDATION_BASELINE by default).
// Faster is only a win when regressions are 0 and features did not drop.
export function compareToBaseline(record, baseline = FOUNDATION_BASELINE) {
  const durationDeltaMs = record.durationMs - baseline.avgDurationMs;
  const faster = durationDeltaMs < 0;
  const regressionFree = record.regressions === 0;
  return {
    durationDeltaMs,
    durationPct: baseline.avgDurationMs ? Math.round((durationDeltaMs / baseline.avgDurationMs) * 100) : null,
    faster,
    regressionFree,
    improvement: faster && regressionFree,
  };
}

// --- intervention: what happens on a flag. ---
// A flag is a hard stop, not a report. The parent pauses the worker, the
// worker's uncommitted work stays in the worktree (closing a worker does
// not revert the filesystem), the parent diagnoses from the diff + metrics,
// and a new worker is spawned with a revised brief that names the bottleneck
// and a different strategy. Returns null when the verdict is not a flag.
// (The automatic trigger — a monitor that watches the worktree diff and
// flags the parent without a turn — is the next machinery step; today the
// parent intervenes on the flag from the run's monitor notes and the diff.)
export function interventionPlan(metrics, priorBuilds = []) {
  const v = executionVerdict(metrics, priorBuilds);
  if (v.level !== 'flag') return null;
  const file = metrics.topFile || metrics.topEditFile;
  return {
    action: 'pause',
    preserve: 'Close the worker; its uncommitted work stays in the worktree. Do not revert it.',
    diagnose: v.reasons,
    reassign: `Spawn a new worker on the same worktree with a revised brief: name the bottleneck file (${file}), batch all of its changes into the fewest edit calls, and use a different implementation strategy (extract a helper module, or split the change across two smaller tasks).`,
  };
}
