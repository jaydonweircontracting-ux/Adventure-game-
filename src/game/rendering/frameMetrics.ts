/**
 * Opt-in renderer frame metrics. Disabled by default; enable with ?perf=1.
 * Measures render-loop work, not input latency or simulation tick time.
 */
const WINDOW_SIZE = 120;

export interface FrameMetricSummary {
  samples: number;
  latestMs: number;
  averageMs: number;
  p95Ms: number;
  estimatedFps: number;
}

export class FrameMetrics {
  private readonly samples = new Float32Array(WINDOW_SIZE);
  private count = 0;
  private cursor = 0;
  private latest = 0;

  record(durationMs: number): void {
    const safe = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    this.samples[this.cursor] = safe;
    this.cursor = (this.cursor + 1) % WINDOW_SIZE;
    this.count = Math.min(WINDOW_SIZE, this.count + 1);
    this.latest = safe;
  }

  snapshot(): FrameMetricSummary {
    if (this.count === 0) {
      return { samples: 0, latestMs: 0, averageMs: 0, p95Ms: 0, estimatedFps: 0 };
    }
    let total = 0;
    const ordered = new Array<number>(this.count);
    for (let i = 0; i < this.count; i++) {
      const value = this.samples[i];
      total += value;
      ordered[i] = value;
    }
    ordered.sort((a, b) => a - b);
    const averageMs = total / this.count;
    const p95Ms = ordered[Math.min(this.count - 1, Math.ceil(this.count * 0.95) - 1)];
    return {
      samples: this.count,
      latestMs: this.latest,
      averageMs,
      p95Ms,
      estimatedFps: averageMs > 0 ? 1000 / averageMs : 0,
    };
  }
}
