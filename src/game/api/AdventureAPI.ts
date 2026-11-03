/**
 * Adventure API — the game's stable integration boundary.
 *
 * This is an engine-independent application API, not a Unity wrapper or a
 * claim that every domain is already connected. Existing game systems register
 * adapters here incrementally; renderers consume snapshots/actions through
 * contracts rather than reaching into unrelated implementation modules.
 */
import { WorldEventBus, type CoreWorldEvents } from '../dev/worldEventBus';

export const ADVENTURE_API_VERSION = '1.0.0';

export type AdventureSystemDomain =
  | 'world'
  | 'graphics'
  | 'physics'
  | 'npc'
  | 'combat'
  | 'economy'
  | 'player'
  | 'quests'
  | 'assets'
  | 'persistence'
  | 'audio'
  | 'platform'
  | 'analytics'
  | 'tools';

export interface AdventureSystemDescriptor {
  readonly id: string;
  readonly domain: AdventureSystemDomain;
  readonly version: string;
  readonly description: string;
}

export interface AdventureSystemEntry<T = unknown> {
  readonly descriptor: Readonly<AdventureSystemDescriptor>;
  readonly implementation: T;
}

export interface AdventureAPIOptions {
  readonly eventHistoryLimit?: number;
}

export class AdventureAPI {
  readonly version = ADVENTURE_API_VERSION;
  readonly events: WorldEventBus<CoreWorldEvents>;

  private readonly systems = new Map<string, AdventureSystemEntry>();

  constructor(options: AdventureAPIOptions = {}) {
    this.events = new WorldEventBus<CoreWorldEvents>({
      maxHistory: options.eventHistoryLimit,
    });
  }

  /**
   * Register one implementation behind a stable system ID.
   * Returns an unregister function for hot reloads, tests, and engine teardown.
   */
  registerSystem<T>(
    descriptor: AdventureSystemDescriptor,
    implementation: T,
  ): () => void {
    const id = descriptor.id.trim();
    if (!id) throw new Error('Adventure API system ID cannot be empty.');
    if (!descriptor.version.trim()) throw new Error(`System "${id}" must declare a version.`);
    if (this.systems.has(id)) throw new Error(`Adventure API system "${id}" is already registered.`);

    const entry: AdventureSystemEntry<T> = Object.freeze({
      descriptor: Object.freeze({ ...descriptor, id }),
      implementation,
    });
    this.systems.set(id, entry);

    return () => {
      if (this.systems.get(id) === entry) this.systems.delete(id);
    };
  }

  getSystem<T>(id: string): T | undefined {
    return this.systems.get(id)?.implementation as T | undefined;
  }

  requireSystem<T>(id: string): T {
    const system = this.getSystem<T>(id);
    if (system === undefined) {
      throw new Error(`Required Adventure API system "${id}" is not registered.`);
    }
    return system;
  }

  listSystems(domain?: AdventureSystemDomain): ReadonlyArray<Readonly<AdventureSystemDescriptor>> {
    return [...this.systems.values()]
      .map((entry) => entry.descriptor)
      .filter((descriptor) => domain === undefined || descriptor.domain === domain)
      .sort((a, b) => a.domain.localeCompare(b.domain) || a.id.localeCompare(b.id));
  }

  hasSystem(id: string): boolean {
    return this.systems.has(id);
  }

  getSystemCount(): number {
    return this.systems.size;
  }
}

/** Create an isolated API instance for a game runtime or deterministic test. */
export function createAdventureAPI(options: AdventureAPIOptions = {}): AdventureAPI {
  return new AdventureAPI(options);
}

/** Shared event vocabulary used by existing and future domain adapters. */
export type AdventureEvents = CoreWorldEvents;
