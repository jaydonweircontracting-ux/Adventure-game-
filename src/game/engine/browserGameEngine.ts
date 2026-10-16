/**
 * Browser game-loop foundation for the existing isometric adventure renderer.
 *
 * Owns animation-frame scheduling and page-visibility lifecycle so individual
 * renderers only describe a frame; they do not each manage a competing RAF loop.
 * This intentionally does not replace game rules, rendering, or save data.
 */

export interface BrowserGameLoopOptions {
  /** Render/update one frame. The callback is never run while the page is hidden. */
  onFrame: (nowMs: number, deltaMs: number) => void;
  /** Upper bound for elapsed time after a slow frame. Defaults to 50 ms. */
  maxDeltaMs?: number;
}

export interface BrowserGameLoop {
  stop: () => void;
  isRunning: () => boolean;
}

export function createBrowserGameLoop(options: BrowserGameLoopOptions): BrowserGameLoop {
  const maxDeltaMs = Math.max(1, options.maxDeltaMs ?? 50);
  let rafId = 0;
  let running = false;
  let previousTime = 0;

  const tick = (nowMs: number) => {
    if (!running) return;
    if (document.hidden) {
      previousTime = 0;
      return;
    }

    const deltaMs = previousTime > 0
      ? Math.min(maxDeltaMs, Math.max(0, nowMs - previousTime))
      : 0;
    previousTime = nowMs;

    try {
      options.onFrame(nowMs, deltaMs);
    } finally {
      // Keep the loop alive even if a single frame throws; the app's existing
      // global error reporting still receives the error.
      if (running && !document.hidden) rafId = requestAnimationFrame(tick);
    }
  };

  const onVisibilityChange = () => {
    if (!running) return;
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      previousTime = 0;
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(tick);
  };

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

/** Start a visibility-aware browser game loop. Calling stop() is idempotent. */
export function startBrowserGameLoop(options: BrowserGameLoopOptions): BrowserGameLoop {
  const loop = createBrowserGameLoop(options);
  // Start the internal lifecycle before exposing the stop handle.
  // createBrowserGameLoop keeps its state private, so bootstrap through a
  // dedicated initial frame and visibility listener installed below.
  let rafId = 0;
  let running = true;
  let previousTime = 0;
  const maxDeltaMs = Math.max(1, options.maxDeltaMs ?? 50);

  const tick = (nowMs: number) => {
    if (!running || document.hidden) {
      previousTime = 0;
      rafId = 0;
      return;
    }
    const deltaMs = previousTime > 0 ? Math.min(maxDeltaMs, Math.max(0, nowMs - previousTime)) : 0;
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
      loop.stop();
    },
    isRunning: () => running,
  };
}
