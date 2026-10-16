/**
 * Visibility-aware animation loop for the existing browser game renderer.
 * Rendering and game rules stay in their existing modules; this module owns
 * frame scheduling and prevents hidden tabs from wasting CPU/GPU time.
 */
export interface BrowserGameLoopOptions {
  onFrame: (nowMs: number, deltaMs: number) => void;
  maxDeltaMs?: number;
}
export interface BrowserGameLoop {
  stop: () => void;
  isRunning: () => boolean;
}

export function startBrowserGameLoop(options: BrowserGameLoopOptions): BrowserGameLoop {
  const maxDeltaMs = Math.max(1, options.maxDeltaMs ?? 50);
  let rafId = 0;
  let running = true;
  let previousTime = 0;

  const tick = (nowMs: number) => {
    if (!running || document.hidden) {
      previousTime = 0;
      rafId = 0;
      return;
    }
    const deltaMs = previousTime > 0
      ? Math.min(maxDeltaMs, Math.max(0, nowMs - previousTime))
      : 0;
    previousTime = nowMs;
    try {
      options.onFrame(nowMs, deltaMs);
    } finally {
      if (running && !document.hidden) rafId = requestAnimationFrame(tick);
      else rafId = 0;
    }
  };

  const onVisibilityChange = () => {
    if (!running) return;
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      previousTime = 0;
    } else if (!rafId) {
      rafId = requestAnimationFrame(tick);
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  if (!document.hidden) rafId = requestAnimationFrame(tick);

  return {
    stop() {
      if (!running) return;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
    isRunning: () => running,
  };
}
