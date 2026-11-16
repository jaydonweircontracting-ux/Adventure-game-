// NPC simulation — the 900ms ticks that move roster NPCs, transients,
// and animals, and make nearby figures bark. Extracted from
// Engine3DWorldView.tsx (BUILD 1073, NEURON HEX 0x0D area 3).
// Bodies moved verbatim; the view builds a context once and calls in.
// No behavior change: NPCs move, animate, and behave identically.
//
// Boundaries (what is NOT here): the founder tick (decisions, needs,
// jobs, construction, farm/mill, arrivals) lives in worldSimulation3d.ts
// (area 1); the figure render slots and the draw live in
// worldRenderer3d.ts (area 2). The player-side NPC helpers — walkableAt's
// proximity checks, figureOccupiedTiles, E-key targeting, looting — stay
// in the view (area 4, player controls).

import type { MutableRefObject } from 'react';
import { WILDERNESS_ONLY } from './wilderness';
import { saveWorld, type IsoWorld } from '../iso/isoWorld';
import {
  ROSTER_3D, buildAnchors, scheduleTileFor, planPathNpc, pathHasUnwalkableTile,
  sidestepTile, rosterArchetype, type DayClock, type StaticAnchors3D,
} from './townsfolk3d';
import { absMinutes, harvestFarmTile, nearestReadyFarmTile } from './farm';
import { blockedAction } from './npcMotion';
import {
  spawnTransient, stepTransient, barkLineFor, barkDayEligible,
  MAX_TRAVELERS, MAX_ADVENTURERS, TRAVELER_SPAWN_TICKS, ADVENTURER_SPAWN_TICKS,
  ADVENTURER_SPAWN_PHASE, BARK_CHECK_MS, BARK_GLOBAL_COOLDOWN_MS,
  BARK_NPC_COOLDOWN_MS, BARK_RANGE,
  type TransientActor, type TransientPathState,
} from './transients';
import {
  spawnAnimal, stepAnimal, ANIMAL_SPAWN_TOPUP_TICKS,
  MAX_BIRDS, MAX_GOATS, MAX_DEER, MAX_WOLVES, MAX_CHICKENS,
  type AnimalActor, type AnimalPathState,
} from './animals';
import type { WorldRenderer } from './worldRenderer3d';

// The roster NPC shape (mirrors NpcActor3D in the view — structural).
export type NpcSimActor = {
  name: string; x: number; y: number; waypoint: number; hp: number;
  alive: boolean; looted?: boolean;
};

export interface NpcSimContext {
  world: IsoWorld;
  staticAnchors: StaticAnchors3D;
  clock: MutableRefObject<DayClock>;
  getPlayerPos: () => { x: number; y: number };
  health: MutableRefObject<number>;
  npcActors: MutableRefObject<NpcSimActor[]>;
  transientActors: MutableRefObject<TransientActor[]>;
  animalActors: MutableRefObject<AnimalActor[]>;
  transientTick: MutableRefObject<number>;
  animalTick: MutableRefObject<number>;
  renderer: WorldRenderer;
  npcSaveKey: string;
  healthKey: string;
  setHealth: (n: number) => void;
  setMessage: (m: string) => void;
}

export type NpcPathEntry = {
  dest: string; path: { x: number; y: number }[]; index: number;
  noPathTicks: number; blockedTicks: number; detour: boolean;
};

export interface NpcSimState {
  npcPath: Map<string, NpcPathEntry>;
  transientPath: Map<string, TransientPathState>;
  animalPath: Map<string, AnimalPathState>;
  lastBarkAt: number;
  lastBarkBy: Map<string, number>;
}

export function createNpcSimState(): NpcSimState {
  return {
    npcPath: new Map(),
    transientPath: new Map(),
    animalPath: new Map(),
    lastBarkAt: 0,
    lastBarkBy: new Map(),
  };
}

// Roster index by name (built once from ROSTER_3D, as the view did).
const NPC_BY_NAME = new Map(ROSTER_3D.map((n, i) => [n.name, i]));

// BUILD 993: roster NPCs walk their 2.5D schedules. Destinations
// recompute from the clock every tick (anchors resolve hut doorsteps
// LIVE, so a removed home/workplace falls back to the plaza at once);
// movement follows a cached A* path (1 tile/900ms, the demo speed),
// replanned when the destination changes or a path tile becomes
// unwalkable. A pathless NPC waits and retries planning (a sealed
// destination never teleports); an occupied next tile waits a tick
// without replanning. At a destination the NPC stands still until
// the next phase retargets.
export function stepRosterNpcs(ctx: NpcSimContext, state: NpcSimState): void {
  // BUILD 1054: villagers are gated off — the tick has no actors
  // to move, and the roster save at its end is gated too.
  if (WILDERNESS_ONLY) return;
  const { world, staticAnchors } = ctx;
  const actors = ctx.npcActors.current;
  const clock = ctx.clock.current;
  const npcPath = state.npcPath;
  const anchors = buildAnchors(world, staticAnchors);
  actors.forEach((actor, i) => {
    if (!actor.alive) return;
    const idx = NPC_BY_NAME.get(actor.name);
    if (idx === undefined) return;
    const sched = scheduleTileFor(ROSTER_3D[idx], idx, anchors, clock.minutes, clock.day, world);
    const cx = Math.round(actor.x), cy = Math.round(actor.y);
    // BUILD 1041: farmers detour to a ready wheat tile within
    // FARM_VILLAGER_RADIUS and harvest it on arrival (the tile
    // resets to planted and regrows — the village's wheat, no
    // counter). The detour is a destination swap, not a schedule
    // change: the farmer resumes their schedule the next tick
    // after harvesting (or if the wheat is gone when they arrive
    // — harvested by the player or another farmer first).
    const farmNowAbs = absMinutes(clock.day, clock.minutes);
    const farmDest = rosterArchetype(actor.name) === 'farmer' ? nearestReadyFarmTile(world, cx, cy, farmNowAbs) : null;
    const dest = farmDest ?? { tx: sched.tx, ty: sched.ty };
    if (cx === dest.tx && cy === dest.ty) {
      if (farmDest) {
        const res = harvestFarmTile(world, farmDest.tx, farmDest.ty, farmNowAbs);
        if (res.ok) { saveWorld(world); ctx.setMessage(actor.name + ' harvested wheat'); }
      }
      npcPath.delete(actor.name);
      return;
    }
    const destKey = dest.tx + ',' + dest.ty;
    let w = npcPath.get(actor.name);
    if (!w || w.dest !== destKey) {
      w = { dest: destKey, path: planPathNpc(world, { x: cx, y: cy }, { x: dest.tx, y: dest.ty }) ?? [], index: 0, noPathTicks: 0, blockedTicks: 0, detour: false };
      npcPath.set(actor.name, w);
    }
    if (w.path.length === 0) {
      // No route (sealed): wait, retry planning occasionally in case
      // the world changed (a placed item removed).
      w.noPathTicks++;
      if (w.noPathTicks >= 11) {
        w.path = planPathNpc(world, { x: cx, y: cy }, { x: dest.tx, y: dest.ty }) ?? [];
        w.index = 0; w.noPathTicks = 0; w.detour = false;
      }
      return;
    }
    const next = w.path[w.index];
    if (!next) { npcPath.delete(actor.name); return; }
    // BUILD 1030: any remaining path tile became unwalkable (a
    // placed item landed on a later tile) — replan now, not just
    // when the NPC walks up to the blocker.
    if (pathHasUnwalkableTile(world, w.path, w.index)) {
      w.path = planPathNpc(world, { x: cx, y: cy }, { x: dest.tx, y: dest.ty }) ?? [];
      w.index = 0; w.noPathTicks = 0; w.blockedTicks = 0; w.detour = false;
      return;
    }
    const player = ctx.getPlayerPos();
    const occupied = (Math.round(player.x) === next.x && Math.round(player.y) === next.y) || actors.some((other, j) => j !== i && Math.round(other.x) === next.x && Math.round(other.y) === next.y);
    if (!occupied) { actor.x = next.x; actor.y = next.y; w.index++; w.blockedTicks = 0; }
    else {
      // BUILD 998: persistent-block rule — wait briefly (a leader
      // one tick ahead, a player stepping aside), then replan with
      // the blocking tile excluded so head-on and standing blocks
      // route around instead of deadlocking. A failed replan falls
      // into the sealed wait + 11-tick retry (empty path below).
      // BUILD 1030: a detour replan only when this path is not
      // itself a detour — two head-on actors both detour into the
      // same lane and ping-pong between lanes forever if each
      // replans again; an actor blocked on a detour steps aside
      // instead, which breaks the symmetry (the other one passes).
      w.blockedTicks++;
      if (blockedAction(w.blockedTicks) === 'replan') {
        let resolved = false;
        if (!w.detour) {
          const detour = planPathNpc(world, { x: cx, y: cy }, { x: dest.tx, y: dest.ty }, 4000, new Set([next.x + ',' + next.y]));
          if (detour) { w.path = detour; w.index = 0; w.blockedTicks = 0; w.noPathTicks = 0; w.detour = true; resolved = true; }
        }
        if (!resolved) {
          const occupiedFn = (x: number, y: number) => (Math.round(player.x) === x && Math.round(player.y) === y) || actors.some((other, j) => j !== i && Math.round(other.x) === x && Math.round(other.y) === y);
          const aside = sidestepTile(world, { x: cx, y: cy }, next, occupiedFn);
          if (aside) { w.path = [aside]; w.index = 0; w.blockedTicks = 0; w.noPathTicks = 0; w.detour = false; resolved = true; }
        }
        if (!resolved) { w.path = []; w.index = 0; w.blockedTicks = 0; w.noPathTicks = 0; w.detour = false; }
      }
    }
  });
  // BUILD 1054: never overwrite the saved villager roster while
  // the villagers are gated off — actors is [] in wilderness
  // mode, and writing it would wipe the roster the town rework
  // restores.
  if (!WILDERNESS_ONLY) { try { localStorage.setItem(ctx.npcSaveKey, JSON.stringify(actors)); } catch {} }
}

function mountSpawnTransient(ctx: NpcSimContext, kind: 'traveler' | 'adventurer'): void {
  const live = ctx.transientActors.current;
  const s = spawnTransient(ctx.world, kind, new Set(live.map((t) => t.name)), new Set(live.map((t) => t.slotId)), ctx.transientTick.current, ctx.getPlayerPos(), true);
  if (s) ctx.transientActors.current = [...live, s];
}

function mountSpawnAnimal(ctx: NpcSimContext, kind: 'bird' | 'goat' | 'deer' | 'wolf' | 'chicken'): void {
  const live = ctx.animalActors.current;
  const cap = kind === 'bird' ? MAX_BIRDS : kind === 'goat' ? MAX_GOATS : kind === 'deer' ? MAX_DEER : kind === 'wolf' ? MAX_WOLVES : MAX_CHICKENS;
  if (live.filter((a) => a.kind === kind).length >= cap) return;
  const s = spawnAnimal(ctx.world, kind, new Set(live.map((a) => a.slotId)), new Set(live.map((a) => a.x + ',' + a.y)), ctx.getPlayerPos(), ctx.staticAnchors.plaza, true);
  if (s) ctx.animalActors.current = [...live, s];
}

// BUILD 1000: transient life. Mount spawns one traveler + one
// adventurer when an out-of-view road entry exists (the town
// reads as lived-in on first load, never a pop-in); the timer
// then paces further spawns (travelers ~45s, adventurers ~100s,
// staggered) up to the caps, and steps every transient with the
// same rules as residents (cached road-biased A*, occupied waits,
// persistent-block replans, sealed retries). Despawn frees the
// GPU slot + render state. NOTHING here touches NPC_SAVE_KEY:
// transients are session-only.
export function stepTransients(ctx: NpcSimContext, state: NpcSimState): void {
  ctx.transientTick.current++;
  const tick = ctx.transientTick.current;
  const player = ctx.getPlayerPos();
  const live = ctx.transientActors.current;
  if (!WILDERNESS_ONLY && tick % TRAVELER_SPAWN_TICKS === 0 && live.filter((t) => t.kind === 'traveler').length < MAX_TRAVELERS) {
    const s = spawnTransient(ctx.world, 'traveler', new Set(live.map((t) => t.name)), new Set(live.map((t) => t.slotId)), tick, player, true);
    if (s) ctx.transientActors.current = [...ctx.transientActors.current, s];
  }
  if (!WILDERNESS_ONLY && tick % ADVENTURER_SPAWN_TICKS === ADVENTURER_SPAWN_PHASE && live.filter((t) => t.kind === 'adventurer').length < MAX_ADVENTURERS) {
    const s = spawnTransient(ctx.world, 'adventurer', new Set(live.map((t) => t.name)), new Set(live.map((t) => t.slotId)), tick, player, true);
    if (s) ctx.transientActors.current = [...ctx.transientActors.current, s];
  }
  const residents = ctx.npcActors.current;
  const kept: TransientActor[] = [];
  for (const t of ctx.transientActors.current) {
    const occupied = (x: number, y: number) => (Math.round(player.x) === x && Math.round(player.y) === y)
      || residents.some((r) => r.alive && Math.round(r.x) === x && Math.round(r.y) === y)
      || ctx.transientActors.current.some((o) => o !== t && Math.round(o.x) === x && Math.round(o.y) === y);
    const res = stepTransient(ctx.world, t, state.transientPath.get(t.id), occupied, ctx.staticAnchors.plaza);
    if (res.path) state.transientPath.set(t.id, res.path); else state.transientPath.delete(t.id);
    if (res.despawn) { ctx.renderer.npcRender.delete(t.id); ctx.renderer.slotUploaded.delete(ctx.renderer.transientSlotBase + t.slotId); }
    else kept.push(t);
  }
  ctx.transientActors.current = kept;
}

// BUILD 1013: wild animals. Mount spawns one of each kind when an
// out-of-view wild tile exists (the wild reads as alive on first
// load, never a pop-in); the timer tops each kind up to its cap
// every 30 ticks (~27s) and steps every animal with the 998 rules
// (cached A*, occupied waits, persistent-block replans, sealed
// retries — see animals.ts). A wolf bite lands here, on the wolf's
// own 900ms tick: the player takes WOLF_BITE damage (persisted to
// HEALTH_KEY, with the same exhaustion rule as the NPC strike-back).
// NOTHING here touches NPC_SAVE_KEY: animals are session-only.
export function stepAnimals(ctx: NpcSimContext, state: NpcSimState): void {
  ctx.animalTick.current++;
  const tick = ctx.animalTick.current;
  const player = ctx.getPlayerPos();
  if (tick % ANIMAL_SPAWN_TOPUP_TICKS === 0) {
    (['bird', 'goat', 'deer', 'wolf', 'chicken'] as const).forEach((kind) => mountSpawnAnimal(ctx, kind));
  }
  const residents = ctx.npcActors.current;
  for (const a of ctx.animalActors.current) {
    const occupied = (x: number, y: number) => (Math.round(player.x) === x && Math.round(player.y) === y)
      || residents.some((r) => r.alive && Math.round(r.x) === x && Math.round(r.y) === y)
      || ctx.transientActors.current.some((t) => Math.round(t.x) === x && Math.round(t.y) === y)
      || ctx.animalActors.current.some((o) => o !== a && Math.round(o.x) === x && Math.round(o.y) === y);
    const res = stepAnimal(ctx.world, a, state.animalPath.get(a.id), occupied, player, ctx.staticAnchors.plaza);
    if (res.path) state.animalPath.set(a.id, res.path); else state.animalPath.delete(a.id);
    if (res.biteDamage > 0) {
      const nextHealth = Math.max(0, ctx.health.current - res.biteDamage);
      ctx.health.current = nextHealth;
      ctx.setHealth(nextHealth);
      try { localStorage.setItem(ctx.healthKey, String(nextHealth)); } catch {}
      if (nextHealth === 0) { ctx.setMessage('You are exhausted. Health restored to 100.'); ctx.health.current = 100; ctx.setHealth(100); try { localStorage.setItem(ctx.healthKey, '100'); } catch {} }
      else ctx.setMessage('A wolf bites you for ' + res.biteDamage + '!');
    }
  }
}

// BUILD 1000: barks through the existing message area. Every 3s,
// the nearest figure within 4 tiles barks when eligible (residents:
// seeded day rule; transients: always day-eligible) and both
// cooldowns (global 25s, per-figure 90s) have elapsed. No floating
// text exists in this renderer (see the transients.ts verdict).
export function stepBarks(ctx: NpcSimContext, state: NpcSimState): void {
  const now = Date.now();
  if (now - state.lastBarkAt < BARK_GLOBAL_COOLDOWN_MS) return;
  const p = ctx.getPlayerPos();
  const clock = ctx.clock.current;
  type Cand = { name: string; kind: 'resident' | 'traveler' | 'adventurer'; archetype: string | null; x: number; y: number };
  const cands: Cand[] = [];
  for (const n of ctx.npcActors.current) {
    if (!n.alive) continue;
    const r = ctx.renderer.npcRender.get(n.name);
    cands.push({ name: n.name, kind: 'resident', archetype: rosterArchetype(n.name), x: r ? r.x : n.x, y: r ? r.y : n.y });
  }
  for (const t of ctx.transientActors.current) {
    const r = ctx.renderer.npcRender.get(t.id);
    cands.push({ name: t.name, kind: t.kind, archetype: null, x: r ? r.x : t.x, y: r ? r.y : t.y });
  }
  const near = cands.filter((c) => Math.hypot(c.x - p.x, c.y - p.y) <= BARK_RANGE)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  for (const c of near) {
    if (c.kind === 'resident' && !barkDayEligible(c.name, clock.day)) continue;
    if (now - (state.lastBarkBy.get(c.name) ?? 0) < BARK_NPC_COOLDOWN_MS) continue;
    ctx.setMessage(c.name + ': ' + barkLineFor(c.kind, c.archetype, clock.minutes, c.name, clock.day));
    state.lastBarkAt = now;
    state.lastBarkBy.set(c.name, now);
    break;
  }
}

// Mount spawns: one traveler + one adventurer (gated off in the clean
// wilderness — BUILD 1054) and one animal of each kind (BUILD 1013,
// chickens in town — BUILD 1016).
export function mountNpcSim(ctx: NpcSimContext): void {
  // BUILD 1054: no travelers or adventurers in the clean
  // wilderness — the mount spawns are skipped outright.
  if (!WILDERNESS_ONLY) { mountSpawnTransient(ctx, 'traveler'); mountSpawnTransient(ctx, 'adventurer'); }
  mountSpawnAnimal(ctx, 'bird');
  mountSpawnAnimal(ctx, 'goat');
  mountSpawnAnimal(ctx, 'deer');
  mountSpawnAnimal(ctx, 'wolf');
  // BUILD 1016: chickens spawn in town with the wild animals.
  mountSpawnAnimal(ctx, 'chicken');
}

// Start the four 900ms/3s NPC timers; returns a cleanup that stops them.
export function startNpcSimTimers(ctx: NpcSimContext, state: NpcSimState): () => void {
  mountNpcSim(ctx);
  const npcTimer = window.setInterval(() => stepRosterNpcs(ctx, state), 900);
  const transientTimer = window.setInterval(() => stepTransients(ctx, state), 900);
  const animalTimer = window.setInterval(() => stepAnimals(ctx, state), 900);
  const barkTimer = window.setInterval(() => stepBarks(ctx, state), BARK_CHECK_MS);
  return () => {
    window.clearInterval(npcTimer);
    window.clearInterval(transientTimer);
    window.clearInterval(animalTimer);
    window.clearInterval(barkTimer);
  };
}
