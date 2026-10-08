// Work queue system (BUILD 496 — Sawyer Pass Phase 2).
//
// Expensive operations are queued and processed incrementally.
// Never freeze the game to generate a region or calculate a path.
// Follows Chris Sawyer: defer noncritical work, maintain frame budget.

export type WorkItemKind =
  | 'generate_chunk'
  | 'calculate_path'
  | 'spawn_population'
  | 'generate_cave'
  | 'update_economy'
  | 'generate_map_section';

export interface WorkItem {
  id: string;
  kind: WorkItemKind;
  /** Priority 0-10 (higher = more urgent) */
  priority: number;
  /** Data for the work */
  data: unknown;
  /** When it was queued */
  queuedAt: number;
}

export interface WorkQueue {
  items: WorkItem[];
  /** Max ms to spend per frame */
  budgetMs: number;
}

/**
 * Create a new work queue.
 */
export function createWorkQueue(budgetMs: number = 5): WorkQueue {
  return { items: [], budgetMs };
}

/**
 * Add work to the queue.
 */
export function enqueueWork(
  queue: WorkQueue,
  kind: WorkItemKind,
  priority: number,
  data: unknown,
): string {
  const id = `work_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  queue.items.push({
    id,
    kind,
    priority: Math.max(0, Math.min(10, priority)),
    data,
    queuedAt: Date.now(),
  });
  // Sort by priority (highest first).
  queue.items.sort((a, b) => b.priority - a.priority);
  return id;
}

/**
 * Process work items within the time budget.
 * @param queue the queue
 * @param processor function that does the work, returns true if complete
 * @returns number of items processed
 */
export function processWorkQueue(
  queue: WorkQueue,
  processor: (item: WorkItem) => boolean,
): number {
  const start = Date.now();
  let processed = 0;

  while (queue.items.length > 0) {
    // Check budget.
    if (Date.now() - start >= queue.budgetMs) break;

    const item = queue.items.shift()!;
    const complete = processor(item);
    processed++;

    // If not complete, re-queue (for multi-frame work).
    if (!complete) {
      queue.items.unshift(item);
      break;
    }
  }

  return processed;
}

/**
 * Get queue depth.
 */
export function queueDepth(queue: WorkQueue): number {
  return queue.items.length;
}
