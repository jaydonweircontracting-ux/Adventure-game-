// Object pooling for entities (BUILD 469 — Performance Phase 2).
//
// Reuses entity objects instead of creating/destroying them, reducing GC
// pressure during spawn/death cycles. Critical for supporting 1000+ entities.
//
// Design (from the performance master prompt §6-8):
// - Generalized EntityPool (not per-type pools, unless needed later).
// - Complete reset on recycle (§7) — no stale state leaks.
// - Lifecycle: ACTIVE -> DYING -> POOLED -> ACTIVE (§8).
// - POOLED entities do nothing: no AI, no rendering, no queries.

export type EntityLifecycle = 'active' | 'dying' | 'pooled';

export interface PoolableEntity {
  /** Unique id (stable across recycles). */
  poolId: number;
  lifecycle: EntityLifecycle;
  /** Reset to initial state. Must clear ALL mutable state (§7). */
  reset(): void;
}

export interface EntityPoolOptions {
  /** Initial preallocated size. */
  initialSize?: number;
  /** Max size (beyond this, new objects are created but not pooled). */
  maxSize?: number;
  /** Factory for new instances. */
  factory: () => PoolableEntity;
}

/**
 * Generic object pool. Entities are acquired on spawn and released on death.
 *
 * Usage:
 *   const pool = new EntityPool({ factory: () => new Goblin(), initialSize: 50 });
 *   const goblin = pool.acquire();  // reuses or creates
 *   goblin.lifecycle = 'active';
 *   // ... on death:
 *   goblin.lifecycle = 'dying';
 *   // ... after death animation:
 *   pool.release(goblin);  // resets and pools
 */
export class EntityPool<T extends PoolableEntity> {
  private available: T[] = [];
  private activeCount = 0;
  private totalCreated = 0;
  private factory: () => T;
  private maxSize: number;

  // Metrics (§14).
  spawns = 0;
  recycles = 0;
  creations = 0;

  constructor(opts: EntityPoolOptions & { factory: () => T }) {
    this.factory = opts.factory;
    this.maxSize = opts.maxSize ?? 1000;
    const initial = opts.initialSize ?? 0;
    for (let i = 0; i < initial; i++) {
      const e = this.factory();
      e.lifecycle = 'pooled';
      this.available.push(e);
      this.totalCreated++;
    }
  }

  /** Active entities (acquired but not released). */
  get active(): number {
    return this.activeCount;
  }

  /** Pooled entities (available for reuse). */
  get pooled(): number {
    return this.available.length;
  }

  /** Total objects ever created. */
  get created(): number {
    return this.totalCreated;
  }

  /**
   * Acquire an entity. Reuses from pool if available, else creates new.
   * The entity's reset() is called to ensure clean state (§7).
   */
  acquire(): T {
    let entity: T;
    if (this.available.length > 0) {
      entity = this.available.pop()!;
      this.recycles++;
    } else {
      entity = this.factory();
      this.totalCreated++;
      this.creations++;
    }
    entity.reset(); // §7: complete reset, no stale state
    entity.lifecycle = 'active';
    this.activeCount++;
    this.spawns++;
    return entity;
  }

  /**
   * Release an entity back to the pool. Calls reset() and marks as pooled.
   * If pool is at maxSize, the object is dropped (GC) instead of pooled.
   */
  release(entity: T): void {
    if (entity.lifecycle === 'pooled') return; // already pooled
    entity.reset();
    entity.lifecycle = 'pooled';
    this.activeCount = Math.max(0, this.activeCount - 1);
    if (this.available.length < this.maxSize) {
      this.available.push(entity);
    }
    // else: drop it, let GC handle it (pool is full)
  }

  /** Release all active entities (e.g. on chunk unload). */
  releaseAll(activeEntities: T[]): void {
    for (const e of activeEntities) this.release(e);
  }

  /** Preallocate up to n pooled entities (warm the pool). */
  preallocate(n: number): void {
    while (this.available.length < n && this.totalCreated < this.maxSize) {
      const e = this.factory();
      e.lifecycle = 'pooled';
      this.available.push(e);
      this.totalCreated++;
    }
  }
}

// ---------------------------------------------------------------------------
// Example resettable entity base (for reference — game entities should
// implement PoolableEntity with a complete reset()).
// ---------------------------------------------------------------------------

/**
 * Checklist for a complete reset() (§7). Game entities must reset:
 * - HP, max HP, stamina/mana
 * - AI state, target, current path, path index
 * - movement vector, velocity, separation vector
 * - animation state, animation timer, facing direction
 * - attack cooldown, ability cooldowns
 * - status effects, aggro state, buffs/debuffs
 * - loot state, death state, timers
 * - schedule state (where appropriate)
 * - interaction state, visibility
 * - spatial hash registration (re-register on acquire)
 */
export const RESET_CHECKLIST = [
  'hp', 'maxHp', 'stamina', 'mana',
  'aiState', 'target', 'path', 'pathIndex',
  'velocity', 'separation',
  'animState', 'animTimer', 'facing',
  'attackCooldown', 'abilityCooldowns',
  'statusEffects', 'aggro', 'buffs', 'debuffs',
  'lootState', 'deathState', 'timers',
  'scheduleState', 'interactionState', 'visible',
] as const;
