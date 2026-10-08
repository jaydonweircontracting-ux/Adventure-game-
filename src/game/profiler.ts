// Performance profiler (BUILD 495 — Sawyer Pass Phase 1).
//
// Developer-only performance overlay data. Tracks frame budgets,
// entity counts, and system timings to identify actual bottlenecks.
// Follows the Chris Sawyer principle: measure first, optimize second.

export interface PerformanceMetrics {
  /** Frames per second */
  fps: number;
  /** Average frame time in ms */
  frameTimeMs: number;
  /** Update (simulation) time in ms */
  updateTimeMs: number;
  /** Render time in ms */
  renderTimeMs: number;
  /** Active full entities */
  activeEntities: number;
  /** Abstract entities */
  abstractEntities: number;
  /** Loaded chunks */
  loadedChunks: number;
  /** Active chunks */
  activeChunks: number;
  /** Pathfinding calls per second */
  pathfindingCallsPerSec: number;
  /** Collision checks per second */
  collisionChecksPerSec: number;
  /** AI updates per second */
  aiUpdatesPerSec: number;
  /** Estimated memory in MB */
  memoryEstimateMB: number;
}

export interface PerformanceBudget {
  /** Max frame time in ms (16.67 = 60fps) */
  maxFrameTimeMs: number;
  /** Max entities before LOD kicks in */
  maxActiveEntities: number;
  /** Max pathfinding calls per second */
  maxPathfindingPerSec: number;
  /** Max collision checks per second */
  maxCollisionPerSec: number;
}

export const DEFAULT_BUDGETS: PerformanceBudget = {
  maxFrameTimeMs: 16.67,
  maxActiveEntities: 500,
  maxPathfindingPerSec: 100,
  maxCollisionPerSec: 10000,
};

/**
 * Check if metrics exceed budgets.
 * Returns list of violations.
 */
export function checkBudgets(
  metrics: PerformanceMetrics,
  budgets: PerformanceBudget,
): string[] {
  const violations: string[] = [];

  if (metrics.frameTimeMs > budgets.maxFrameTimeMs) {
    violations.push(
      `Frame time ${metrics.frameTimeMs.toFixed(1)}ms exceeds ${budgets.maxFrameTimeMs}ms`
    );
  }
  if (metrics.activeEntities > budgets.maxActiveEntities) {
    violations.push(
      `Active entities ${metrics.activeEntities} exceeds ${budgets.maxActiveEntities}`
    );
  }
  if (metrics.pathfindingCallsPerSec > budgets.maxPathfindingPerSec) {
    violations.push(
      `Pathfinding ${metrics.pathfindingCallsPerSec}/s exceeds ${budgets.maxPathfindingPerSec}/s`
    );
  }
  if (metrics.collisionChecksPerSec > budgets.maxCollisionPerSec) {
    violations.push(
      `Collision checks ${metrics.collisionChecksPerSec}/s exceeds ${budgets.maxCollisionPerSec}/s`
    );
  }

  return violations;
}

/**
 * Create empty metrics (for initialization).
 */
export function emptyMetrics(): PerformanceMetrics {
  return {
    fps: 0,
    frameTimeMs: 0,
    updateTimeMs: 0,
    renderTimeMs: 0,
    activeEntities: 0,
    abstractEntities: 0,
    loadedChunks: 0,
    activeChunks: 0,
    pathfindingCallsPerSec: 0,
    collisionChecksPerSec: 0,
    aiUpdatesPerSec: 0,
    memoryEstimateMB: 0,
  };
}
