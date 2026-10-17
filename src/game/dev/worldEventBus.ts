/**
 * BUILD 835 foundation: typed, bounded world-event bus.
 *
 * The bus is deliberately instance-scoped: callers create one for a runtime or
 * disposable test simulation. It has no hidden global state and does not mutate
 * the game world itself. Systems subscribe to events and decide how to react.
 */
export type WorldEventMap = Record<string, unknown>;

export interface WorldEvent<K extends string = string, P = unknown> {
  readonly id: string;
  readonly type: K;
  readonly tick: number;
  readonly at: number;
  readonly payload: P;
}

export interface WorldEventOptions {
  /** Simulation tick that produced the event. Use a monotonic game tick where available. */
  tick?: number;
  /** Optional deterministic identifier for replay/tests. */
  id?: string;
  /** Optional timestamp; injected clocks make tests deterministic. */
  at?: number;
}

export interface WorldEventBusOptions {
  maxHistory?: number;
  now?: () => number;
  createId?: () => string;
}

export type WorldEventHandler<E> = (event: E) => void;

const DEFAULT_HISTORY_LIMIT = 500;
const MAX_HISTORY_LIMIT = 10_000;

/** A typed event channel shared by simulation systems, diagnostics and replay tools. */
export class WorldEventBus<Events extends WorldEventMap> {
  private readonly listeners = new Map<keyof Events, Set<WorldEventHandler<WorldEvent<keyof Events, Events[keyof Events]>>>>();
  private readonly history: Array<WorldEvent<keyof Events, Events[keyof Events]>> = [];
  private readonly maxHistory: number;
  private readonly now: () => number;
  private readonly createId: () => string;
  private sequence = 0;

  constructor(options: WorldEventBusOptions = {}) {
    const requestedLimit = options.maxHistory ?? DEFAULT_HISTORY_LIMIT;
    this.maxHistory = Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.floor(requestedLimit)));
    this.now = options.now ?? (() => Date.now());
    this.createId = options.createId ?? (() => `world-event-${++this.sequence}`);
  }

  publish<K extends keyof Events & string>(
    type: K,
    payload: Events[K],
    options: WorldEventOptions = {},
  ): WorldEvent<K, Events[K]> {
    const event: WorldEvent<K, Events[K]> = Object.freeze({
      id: options.id ?? this.createId(),
      type,
      tick: Number.isFinite(options.tick) ? Math.max(0, Math.floor(options.tick as number)) : 0,
      at: Number.isFinite(options.at) ? options.at as number : this.now(),
      payload,
    });
    this.history.push(event as WorldEvent<keyof Events, Events[keyof Events]>);
    if (this.history.length > this.maxHistory) this.history.splice(0, this.history.length - this.maxHistory);

    // Snapshot listeners so subscribe/unsubscribe during dispatch is safe.
    const handlers = [...(this.listeners.get(type) ?? [])];
    for (const handler of handlers) handler(event as WorldEvent<keyof Events, Events[keyof Events]>);
    return event;
  }

  subscribe<K extends keyof Events & string>(
    type: K,
    handler: WorldEventHandler<WorldEvent<K, Events[K]>>,
  ): () => void {
    let handlers = this.listeners.get(type);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(type, handlers);
    }
    handlers.add(handler as WorldEventHandler<WorldEvent<keyof Events, Events[keyof Events]>>);
    return () => {
      handlers?.delete(handler as WorldEventHandler<WorldEvent<keyof Events, Events[keyof Events]>>);
      if (handlers?.size === 0) this.listeners.delete(type);
    };
  }

  getHistory(options: { type?: keyof Events; sinceTick?: number; limit?: number } = {}): ReadonlyArray<WorldEvent<keyof Events, Events[keyof Events]>> {
    const limit = Math.max(0, Math.min(this.maxHistory, Math.floor(options.limit ?? this.maxHistory)));
    return this.history
      .filter((event) =>
        (options.type === undefined || event.type === options.type) &&
        (options.sinceTick === undefined || event.tick >= options.sinceTick))
      .slice(-limit);
  }

  clearHistory(): void {
    this.history.length = 0;
  }

  listenerCount(type?: keyof Events): number {
    if (type !== undefined) return this.listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const handlers of this.listeners.values()) total += handlers.size;
    return total;
  }
}

/** Starter event vocabulary; domain systems may extend this map with their own payloads. */
export interface CoreWorldEvents {
  'npc.goal-changed': { npcId: string; previousGoal: string | null; nextGoal: string };
  'npc.path-failed': { npcId: string; destination: { x: number; y: number }; reason: string };
  'npc.injured': { npcId: string; amount: number; sourceId?: string };
  'item.transferred': { itemId: string; quantity: number; from: string; to: string };
  'shop.stock-changed': { shopId: string; itemId: string; before: number; after: number };
  'crime.witnessed': { crimeId: string; witnessNpcId: string; suspectId?: string };
  'quest.stage-changed': { questId: string; previousStage: string; nextStage: string };
  'building.entrance-used': { buildingId: string; entranceId: string; destinationId: string };
  'world.chunk-loaded': { chunkKey: string };
  'world.chunk-unloaded': { chunkKey: string };
  'world.save-failed': { scope: 'player' | 'editor' | 'world'; message: string };
}
