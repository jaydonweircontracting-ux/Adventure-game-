# Experiment Log

This directory contains benchmark results and experiment reports for the Alien Brain optimization system.

## Format

Each experiment produces:
- `benchmark-<timestamp>.json` — performance measurements
- `experiment-<name>.md` — hypothesis, method, results, decision

## Current Baselines (BUILD 657)

Dialogue system performance (avg over 1000 iterations):
- intent-recognize: 0.0019ms
- dialogue-response: 0.0008ms
- memory-recall: 0.0042ms
- personality-compute: 0.0007ms
- memory-record: 0.0009ms

**Finding:** The Living Dialogue system is NOT a performance bottleneck. All operations are sub-millisecond. Optimization efforts should focus elsewhere.

## Experiment Template

```markdown
# Experiment: <name>

## Hypothesis
<what you expect to improve>

## Baseline
<measurements before>

## Method
<what changed>

## Results
<measurements after>

## Decision
KEEP / REVERT / REVISE — <reason>
```
