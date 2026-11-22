// Player controls — movement, input, and interaction with the
// world. Extracted from Engine3DWorldView.tsx (BUILD 1074, NEURON
// HEX 0x0D area 4). Bodies moved verbatim; the view builds one
// PlayerControlsContext (plus one SprintContext for the Sprint
// button) and calls in via createPlayerControls(), whose bound
// closures keep the original call signatures — so the pointer
// handlers, the renderer bind, and the listeners need only a
// `controls.` prefix. No behavior change: the player moves,
// interacts, and behaves identically.
//
// Boundaries (what is NOT here): the founder tick (decisions, needs,
// jobs, construction, farm/mill, arrivals) lives in
// worldSimulation3d.ts (area 1); the terrain, the renderer, the
// camera, and the draw live in worldRender3d.ts / worldRenderer3d.ts
// (area 2); the roster/transient/animal ticks and barks live in
// npcSimulation3d.ts (area 3). The canvas pointer routing (camera
// orbit, pinch zoom, and the Build-mode drag dispatch) stays in the
// view — it calls in here for the walk parts (walkableAt,
// figureOccupiedTiles). The Build-mode operations themselves
// (place/remove/move/save-area) are area 6.

import type { MutableRefObject } from 'react';
import { saveWorld, terrainKey, type HutRect, type IsoWorld } from '../iso/isoWorld';
import { nearestDoorHut, interiorTileWalkable } from './interiors';
import type { DayClock } from './townsfolk3d';
import {
  FOUNDERS_ENABLED, FOUNDER_STOCKPILE_TILE, FOUNDER_EAT_TILE, FOUNDER_CAMP_CENTRE,
  roundFounderNeeds, campWoodInRegistry, campFoodInRegistry, campStoneInRegistry,
  type FounderState,
} from './founders';
import { planBuildingLabel, type SettlementPlan } from './sitePlan';
import { closestFounder, memoryCountsFor } from './memory';
import { professionLabel } from './professions';
import { jobForFounder, type JobBoard } from './jobs';
import { growthFactorAt, livingWorldSummary, type LivingWorld3DState } from './livingWorld';
import { ecosystemSummaryText, plantSapling, recordAnimalKill } from './ecosystems';
import { granaryMeatInRegistry, granaryFishInRegistry } from './granary';
import type { PenState } from './animalHusbandry';
import {
  HUT_SITES, HUT_WORK_STEPS, sitesOf, hutSitePlacementExists,
  type ConstructionState,
} from './construction';
import { STOREHOUSE_CENTRE, STOREHOUSE_WORK_STEPS, storehouseWoodInRegistry, storehouseStoneInRegistry, storehouseWoolInRegistry, storehouseLeatherInRegistry, type StorehouseState } from './storehouse';
import { crateId, rockId, treeId, wildTreeId, npcSpawnIdFor } from './entityIds';
import {
  depositInto, extractDeposit, CAMP_STORE_ID, PLAYER_STORE_ID,
  type ResourceRegistry, type RegistryKind,
} from './resourceRegistry';
import {
  placedHutRects, placedFarmTiles, walkableWithPlacements, undoRedoKeyForEvent,
  type Rotation, type PaletteKind,
} from './placements';
import { absMinutes, farmStageAt, harvestFarmTile } from './farm';
import { campGrainInRegistry } from './food';
import { depositNear, examineDeposit } from './geology';
import { riverNear, examineRiver } from './rivers';
import { wildTreeAt, wildRockAt, isWildWalkable } from './wildTerrain';
import { isCarNear, carBlocksTile, type CarState } from './car';
import {
  planPlayerPath, playerWalkable,
  PLAYER_REPLAN_MS, PLAYER_STUCK_MS, PLAYER_WAIT_MS, PLAYER_WAYPOINT_ARRIVE,
  type PlayerPath,
} from './playerPath';
import { isSprintTap, latchAfterTap, type StaminaState } from './sprint';
import type { WorldRenderer } from './worldRenderer3d';
import type { Position } from './worldRender3d';
import type { TransientActor } from './transients';
import type { AnimalActor } from './animals';

// The roster NPC shape (mirrors NpcActor3D in the view — structural).
export type PlayerNpcActor = {
  name: string; x: number; y: number; waypoint: number; hp: number;
  alive: boolean; looted?: boolean;
};

// The Build-mode state the keyboard handler reads (mirrors buildRef).
export type PlayerBuildState = {
  palette: PaletteKind | null; removeMode: boolean; moveMode: boolean;
  saveAreaMode: boolean; pasteName: string | null; customAssetId: string | null;
  areaSelectMode: boolean; areaMoveArmed: boolean; areaDuplicateArmed: boolean;
};

// The Sprint-button hold state (component-level refs + latch setter).
export interface SprintContext {
  pointerId: MutableRefObject<number | null>;
  down: MutableRefObject<{ t: number; x: number; y: number } | null>;
  held: MutableRefObject<boolean>;
  latch: MutableRefObject<boolean>;
  stamina: MutableRefObject<StaminaState>;
  setLatched: (v: boolean) => void;
}

export interface PlayerControlsContext {
  world: IsoWorld;
  renderer: WorldRenderer;
  state: MutableRefObject<{ position: Position; world: IsoWorld }>;
  setPosition: (p: Position) => void;
  setMessage: (m: string) => void;
  setHealth: (n: number) => void;
  refreshResourceUi: () => void;
  insideHut: MutableRefObject<HutRect | null>;
  car: MutableRefObject<CarState | null>;
  driving: MutableRefObject<boolean>;
  npcActors: MutableRefObject<PlayerNpcActor[]>;
  transientActors: MutableRefObject<TransientActor[]>;
  animalActors: MutableRefObject<AnimalActor[]>;
  founders: MutableRefObject<FounderState[]>;
  registry: MutableRefObject<ResourceRegistry>;
  jobBoard: MutableRefObject<JobBoard>;
  // BUILD 1100: the settlement plan (the view's sitePlanRef) —
  // the E report quotes it. Optional: old callers pass none and
  // the report omits the plan line.
  sitePlan?: MutableRefObject<SettlementPlan | null>;
  // BUILD 1108: the inventory toggle (the view's setInventoryOpen) —
  // the I key opens/closes the inventory panel. Optional: old callers
  // pass none and I does nothing.
  onToggleInventory?: () => void;
  // BUILD 1102: the pen (the view's penRef) — the E stockpile
  // report quotes it. Optional: old callers pass none and the
  // report omits the pen line.
  pen?: MutableRefObject<PenState>;
  construction: MutableRefObject<ConstructionState>;
  // BUILD 1087: the storehouse state (the E-key storehouse-site
  // report reads it). Optional: the old callers pass no storehouse
  // and the report falls back to the site line.
  storehouse?: MutableRefObject<StorehouseState>;
  livingWorld: MutableRefObject<LivingWorld3DState | null>;
  clock: MutableRefObject<DayClock>;
  health: MutableRefObject<number>;
  inventory: MutableRefObject<Record<string, number>>;
  playerPath: MutableRefObject<PlayerPath | null>;
  playerPathReplan: MutableRefObject<number>;
  playerPathWait: MutableRefObject<{ since: number; x: number; y: number } | null>;
  playerPathStuck: MutableRefObject<{ x: number; y: number; since: number } | null>;
  needsWorldRebuild: MutableRefObject<boolean>;
  build: MutableRefObject<PlayerBuildState>;
  placementRot: MutableRefObject<Rotation>;
  placeHover: MutableRefObject<{ x: number; y: number } | null>;
  placePreviewFn: MutableRefObject<((x: number, y: number) => void) | null>;
  sprint: SprintContext;
  doUndo: () => void;
  doRedo: () => void;
  cancelPlacement: () => void;
  setAreaMoveArmedBoth: (v: boolean) => void;
  setAreaDuplicateArmedBoth: (v: boolean) => void;
  setAreaDeleteArmed: (v: boolean) => void;
  setPlacementRotBoth: (r: Rotation) => void;
  enterCar: () => void;
  exitCar: () => void;
  enterHut: (hut: HutRect) => void;
  exitHut: () => void;
  saveKey: string;
  npcSaveKey: string;
  healthKey: string;
}

export interface PlayerControls {
  walkableAt: (x: number, y: number) => boolean;
  figureOccupiedTiles: () => Set<string>;
  replanPlayerPath: (exclude?: { x: number; y: number }) => 'ok' | 'throttled' | 'failed';
  followPlayerPath: (nowMs: number) => { dx: number; dy: number } | null;
  wheel: (e: WheelEvent) => void;
  keydown: (e: KeyboardEvent) => void;
  keyup: (e: KeyboardEvent) => void;
  tryMove: (dx: number, dy: number) => void;
  action: (e: KeyboardEvent) => void;
}

// Bound closures over one context, so call sites keep the original
// signatures (the pointer handlers, the renderer bind, and the
// listeners need only a `controls.` prefix).
export function createPlayerControls(ctx: PlayerControlsContext): PlayerControls {
  return {
    walkableAt: (x, y) => walkableAt(ctx, x, y),
    figureOccupiedTiles: () => figureOccupiedTiles(ctx),
    replanPlayerPath: (exclude) => replanPlayerPath(ctx, exclude),
    followPlayerPath: (nowMs) => followPlayerPath(ctx, nowMs),
    wheel: (e) => wheel(ctx, e),
    keydown: (e) => keydown(ctx, e),
    keyup: (e) => keyup(ctx, e),
    tryMove: (dx, dy) => tryMove(ctx, dx, dy),
    action: (e) => action(ctx, e),
  };
}

// Clear a Sprint-button hold (the window-level backstop and the
// touchend/blur handlers share it — assigning the cleared values is
// a no-op when the hold is already gone, so the null-guard the
// originals carried is preserved by the callers' conditions).
export function clearSprintHold(ctx: SprintContext): void {
  ctx.pointerId.current = null;
  ctx.held.current = false;
  ctx.down.current = null;
}

// BUILD 1018: end a Sprint-button hold. Only the pointer that started
// the hold can end it (pointerId-gated). A quick, still press is a TAP
// and flips the latch; a longer hold just releases. Called from the
// button's own pointerup AND the window-level backstop (without pointer
// capture, a finger that slides off the button lifts over another
// element — the button never sees that up, so the window catches it).
export function releaseSprintPointer(ctx: SprintContext, pointerId: number, clientX: number, clientY: number, allowToggle: boolean): void {
  const sprintPointerIdRef = ctx.pointerId;
  const sprintDownRef = ctx.down;
  const sprintHeldRef = ctx.held;
  const sprintLatchRef = ctx.latch;
  const staminaRef = ctx.stamina;
  const setSprintLatchedUi = ctx.setLatched;
  if(sprintPointerIdRef.current!==pointerId)return;
  sprintPointerIdRef.current=null;sprintHeldRef.current=false;
  const down=sprintDownRef.current;sprintDownRef.current=null;
  if(allowToggle&&down&&isSprintTap(down.t,performance.now(),down.x,down.y,clientX,clientY)){
    const next=latchAfterTap(sprintLatchRef.current,staminaRef.current.exhausted);
    sprintLatchRef.current=next;
    setSprintLatchedUi(next);
  }
}

export function walkableAt(ctx: PlayerControlsContext, x: number, y: number): boolean {
  const world = ctx.world;
  const renderer = ctx.renderer;
  const insideHutRef = ctx.insideHut;
  const carRef = ctx.car;
  const drivingRef = ctx.driving;
  const npcActorsRef = ctx.npcActors;
  const transientActorsRef = ctx.transientActors;
  const animalActorsRef = ctx.animalActors;
  const gx=Math.round(x),gy=Math.round(y);
  // BUILD 990: inside the entered hut, every rect tile is walkable
  // (interior furniture is visual only — interiors.ts). The NPC
  // proximity check still applies; NPCs never enter (their
  // movement uses walkableWithPlacements unchanged).
  // BUILD 998: proximity uses RENDER positions (what the player
  // sees) when available, falling back to logical tiles — the
  // player can no longer walk through a gliding figure, and can
  // stand on a tile a figure is gliding away from.
  const npcNear=(n:{name:string;alive:boolean;x:number;y:number})=>{
    if(!n.alive)return false;
    const r=renderer.npcRender.get(n.name);
    const nx=r?r.x:n.x,ny=r?r.y:n.y;
    return Math.hypot(nx-x,ny-y)<.42;
  };
  // BUILD 1000: the player cannot walk through transient figures
  // either (same 0.42 render-distance rule as residents).
  const transientNear=(t:{id:string;x:number;y:number})=>{
    const r=renderer.npcRender.get(t.id);
    const nx=r?r.x:t.x,ny=r?r.y:t.y;
    return Math.hypot(nx-x,ny-y)<.42;
  };
  // BUILD 1013: the player cannot walk through an animal either
  // (same 0.42 render-distance rule as residents/transients).
  const animalNear=(a:{id:string;x:number;y:number})=>{
    const r=renderer.animalRender.get(a.id);
    const nx=r?r.x:a.x,ny=r?r.y:a.y;
    return Math.hypot(nx-x,ny-y)<.42;
  };
  const inside=insideHutRef.current;
  // BUILD 1032: while inside, the walls are solid — the interior
  // verdict is the whole answer. The old branch only returned
  // walkable for interior tiles and fell through to the outdoor
  // rule for exterior ones, and the grass outside a hut is
  // walkable outdoors, so the player walked straight through the
  // wall. Now every tile outside the rect is blocked; leaving is
  // via Exit only (button or E key). The NPC proximity check
  // still applies; NPCs never enter (their movement uses
  // walkableWithPlacements unchanged).
  if(inside){
    if(!interiorTileWalkable(inside,gx,gy))return false;
    return !npcActorsRef.current.some(npcNear)&&!transientActorsRef.current.some(transientNear)&&!animalActorsRef.current.some(animalNear);
  }
  // BUILD 1033: the parked car's tile is solid on foot (like a
  // rock — carBlocksTile). While driving the car IS the player, so
  // its tile never blocks (the check returns false then). The car
  // cannot be inside a hut, so this is the outdoor path only.
  if(carBlocksTile(carRef.current,drivingRef.current,gx,gy))return false;
  if(npcActorsRef.current.some(npcNear))return false;
  if(transientActorsRef.current.some(transientNear))return false;
  if(animalActorsRef.current.some(animalNear))return false;
  // BUILD 1024: past the old map edge the wilderness is walkable
  // grass (lakes, wild trees and wild rocks block, like their
  // in-map counterparts). NPCs never reach here — their
  // walkability (townsfolk3d npcWalkable) stays in-bounds — so
  // this branch is the player only.
  if(gx<0||gy<0||gx>=world.w||gy>=world.h) return isWildWalkable(world,gx,gy);
  return walkableWithPlacements(world,world.crates,gx,gy);
}

// BUILD 1030: tiles currently occupied by figures, for tap-to-walk
// planning (extraBlocked). Rounded tiles, using RENDER positions
// like walkableAt (what the player sees). The player's own tile is
// excluded — it is the path start.
export function figureOccupiedTiles(ctx: PlayerControlsContext): Set<string> {
  const renderer = ctx.renderer;
  const carRef = ctx.car;
  const drivingRef = ctx.driving;
  const npcActorsRef = ctx.npcActors;
  const transientActorsRef = ctx.transientActors;
  const animalActorsRef = ctx.animalActors;
  const out=new Set<string>();
  const add=(x:number,y:number)=>{out.add(Math.round(x)+','+Math.round(y));};
  for(const n of npcActorsRef.current){if(!n.alive)continue;const r=renderer.npcRender.get(n.name);add(r?r.x:n.x,r?r.y:n.y);}
  for(const t of transientActorsRef.current){const r=renderer.npcRender.get(t.id);add(r?r.x:t.x,r?r.y:t.y);}
  for(const a of animalActorsRef.current){const r=renderer.animalRender.get(a.id);add(r?r.x:a.x,r?r.y:a.y);}
  // BUILD 1033: the parked car blocks tap-to-move paths like a
  // figure — the A* plans around it immediately instead of the
  // follower waiting 900ms on the tile and then replanning.
  const parkedCar=carRef.current;
  if(parkedCar&&!drivingRef.current)add(parkedCar.x,parkedCar.y);
  return out;
}

// BUILD 1030: rebuild the tap journey's path from the current
// position to moveTarget, optionally excluding one tile (the tile
// ahead when pinned, or a figure's tile after waiting). Returns
// 'ok' (new path), 'throttled' (too soon — try again next frame),
// or 'failed' (no route exists). Never reports 'Path blocked'
// itself — the caller decides, so a throttled replan is a wait,
// not a false dead end.
export function replanPlayerPath(ctx: PlayerControlsContext, exclude?: { x: number; y: number }): 'ok' | 'throttled' | 'failed' {
  const stateRef = ctx.state;
  const world = ctx.world;
  const renderer = ctx.renderer;
  const playerPathRef = ctx.playerPath;
  const playerPathReplanRef = ctx.playerPathReplan;
  const playerPathWaitRef = ctx.playerPathWait;
  const playerPathStuckRef = ctx.playerPathStuck;
  const nowMs=performance.now();
  if(nowMs-playerPathReplanRef.current<PLAYER_REPLAN_MS)return 'throttled';
  const dest=renderer.moveTarget;if(!dest)return 'failed';
  playerPathReplanRef.current=nowMs;
  const blocked=figureOccupiedTiles(ctx);
  if(exclude)blocked.add(exclude.x+','+exclude.y);
  const path=planPlayerPath(stateRef.current.world,stateRef.current.position,dest,blocked);
  if(!path)return 'failed';
  playerPathRef.current=path;playerPathWaitRef.current=null;playerPathStuckRef.current=null;
  return 'ok';
}

// BUILD 1030: tap-to-walk path follower. Called once per frame
// while a tap journey is active. Returns the push (dx, dy) toward
// the current waypoint, or null when the player should wait this
// frame (a figure on the next waypoint, a throttled replan) or the
// journey ended. Handles: waypoint advance, static-block replan (a
// placed item landed on a waypoint — replan now, it won't move),
// figure-block wait-then-replan, and stuck detection (no real
// progress while pushing — micro-slides, a figure pacing the
// player). A replan recurses once to recompute from the new path;
// the 500ms throttle bounds the depth (the recursive call's own
// replan would return 'throttled').
export function followPlayerPath(ctx: PlayerControlsContext, nowMs: number): { dx: number; dy: number } | null {
  const stateRef = ctx.state;
  const world = ctx.world;
  const renderer = ctx.renderer;
  const setMessage = ctx.setMessage;
  const drivingRef = ctx.driving;
  const playerPathRef = ctx.playerPath;
  const playerPathWaitRef = ctx.playerPathWait;
  const playerPathStuckRef = ctx.playerPathStuck;
  const path=playerPathRef.current;const dest=renderer.moveTarget;
  if(!path||!dest)return null;
  const player=stateRef.current.position;
  // BUILD 1033: a driving car covers ~0.5 tiles/frame (4.5 at
  // harness frame rates), so it can jump clean over the 0.15
  // walking arrive radius and ping-pong on a waypoint forever. A
  // 1-tile arrive radius while driving is the same "reached it"
  // test at car scale.
  const arrive=drivingRef.current?1:PLAYER_WAYPOINT_ARRIVE;
  while(path.index<path.waypoints.length&&Math.hypot(path.waypoints[path.index].x-player.x,path.waypoints[path.index].y-player.y)<arrive)path.index++;
  if(path.index>=path.waypoints.length){playerPathRef.current=null;renderer.moveTarget=null;return null;}
  const wp=path.waypoints[path.index];
  const wtx=Math.round(wp.x),wty=Math.round(wp.y);
  const w=stateRef.current.world;
  if(!playerWalkable(w,wtx,wty)){
    const r=replanPlayerPath(ctx);
    if(r==='ok')return followPlayerPath(ctx, nowMs);
    if(r==='throttled')return null;
    playerPathRef.current=null;renderer.moveTarget=null;setMessage('Path blocked');
    return null;
  }
  if(!walkableAt(ctx, wp.x,wp.y)){
    const wait=playerPathWaitRef.current;
    if(!wait||wait.x!==wtx||wait.y!==wty){playerPathWaitRef.current={since:nowMs,x:wtx,y:wty};return null;}
    if(nowMs-wait.since>PLAYER_WAIT_MS){
      const r=replanPlayerPath(ctx, {x:wtx,y:wty});
      if(r==='ok'){playerPathWaitRef.current=null;return followPlayerPath(ctx, nowMs);}
      if(r==='throttled')return null;
      playerPathRef.current=null;renderer.moveTarget=null;setMessage('Path blocked');
      return null;
    }
    return null;
  }
  playerPathWaitRef.current=null;
  const stuck=playerPathStuckRef.current;
  if(!stuck){playerPathStuckRef.current={x:player.x,y:player.y,since:nowMs};}
  else if(Math.hypot(player.x-stuck.x,player.y-stuck.y)>=0.05){playerPathStuckRef.current={x:player.x,y:player.y,since:nowMs};}
  else if(nowMs-stuck.since>PLAYER_STUCK_MS){
    const ahead={x:Math.round(player.x+Math.sign(wp.x-player.x)),y:Math.round(player.y+Math.sign(wp.y-player.y))};
    const r=replanPlayerPath(ctx, ahead);
    if(r==='ok')return followPlayerPath(ctx, nowMs);
    if(r==='throttled')return null;
    playerPathRef.current=null;renderer.moveTarget=null;setMessage('Path blocked');
    return null;
  }
  return {dx:wp.x-player.x,dy:wp.y-player.y};
}

export function wheel(ctx: PlayerControlsContext, e: WheelEvent): void {
  const renderer = ctx.renderer;
  e.preventDefault();
  renderer.applyZoom(e.deltaY * .012);
}

export function keydown(ctx: PlayerControlsContext, e: KeyboardEvent): void {
  const world = ctx.world;
  const renderer = ctx.renderer;
  const setMessage = ctx.setMessage;
  const insideHutRef = ctx.insideHut;
  const buildRef = ctx.build;
  const placementRotRef = ctx.placementRot;
  const placeHoverRef = ctx.placeHover;
  const placePreviewFnRef = ctx.placePreviewFn;
  const doUndo = ctx.doUndo;
  const doRedo = ctx.doRedo;
  const cancelPlacement = ctx.cancelPlacement;
  const setAreaMoveArmedBoth = ctx.setAreaMoveArmedBoth;
  const setAreaDuplicateArmedBoth = ctx.setAreaDuplicateArmedBoth;
  const setAreaDeleteArmed = ctx.setAreaDeleteArmed;
  const setPlacementRotBoth = ctx.setPlacementRotBoth;
  const k=e.key.toLowerCase();
  // BUILD 1036: placement keys. Escape cancels the armed asset
  // (and any paste); R rotates it 90° clockwise, Shift+R 90°
  // counter-clockwise. Never while typing in an input (the
  // chunk-name field) or inside a hut (placement is disabled
  // there anyway). R only acts while a palette asset or a custom
  // upload is armed (BUILD 1048: a custom mesh rotates too) — it
  // never rotates a paste.
  const ae=document.activeElement;
  const typing=ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT');
  if(!typing){
    // BUILD 1039: undo/redo shortcuts — Ctrl+Z / Cmd+Z undoes,
    // Ctrl+Y / Cmd+Y (and Ctrl+Shift+Z / Cmd+Shift+Z) redoes.
    // The same doUndo/doRedo the Undo/Redo buttons call, so keys
    // and buttons can never drift apart. Never while typing in
    // an input; works inside a house too (990: Undo/Redo are
    // world-level edits, not interior edits).
    const ur=undoRedoKeyForEvent(e.key,e.ctrlKey,e.metaKey,e.shiftKey);
    if(ur){e.preventDefault();if(ur==='undo')doUndo();else doRedo();return;}
    if(k==='escape'){if(buildRef.current.areaDuplicateArmed||buildRef.current.areaMoveArmed){setAreaMoveArmedBoth(false);setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);setMessage('Area action cancelled — the selection is kept');}else if(buildRef.current.palette||buildRef.current.customAssetId||buildRef.current.pasteName){cancelPlacement();setMessage('Placement cancelled');}return;}
    // BUILD 1048: R rotates an armed custom upload too (its mesh
    // turns with the rotation — see validateCustomPlacement).
    if(k==='r'&&(buildRef.current.palette||buildRef.current.customAssetId)&&!insideHutRef.current){
      e.preventDefault();
      const next=(((placementRotRef.current+(e.shiftKey?3:1))%4) as Rotation);
      setPlacementRotBoth(next);
      const h=placeHoverRef.current;if(h)placePreviewFnRef.current?.(h.x,h.y);
      return;
    }
  }
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','f',' ','shift'].includes(k)){e.preventDefault();renderer.keys.add(k);}
}

export function keyup(ctx: PlayerControlsContext, e: KeyboardEvent): void {
  const renderer = ctx.renderer;
  renderer.keys.delete(e.key.toLowerCase());
}

export function tryMove(ctx: PlayerControlsContext, dx: number, dy: number): void {
  const stateRef = ctx.state;
  const npcActorsRef = ctx.npcActors;
  const world = ctx.world;
  const setPosition = ctx.setPosition;
  const SAVE_KEY = ctx.saveKey;
  const needsWorldRebuild = ctx.needsWorldRebuild;
  const nextX = Math.round(stateRef.current.position.x + dx), nextY = Math.round(stateRef.current.position.y + dy);
  const occupied = npcActorsRef.current.some(n => Math.round(n.x) === nextX && Math.round(n.y) === nextY);
  if (!occupied && walkableWithPlacements(world, world.crates, nextX, nextY)) {
    const next = { x: nextX, y: nextY };
    stateRef.current.position = next;
    setPosition(next);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch {}
    needsWorldRebuild.current = true;
  }
}

/** BUILD 1098 (0x21): the founder's E answer as a pure function —
 *  name + profession + activity + the scored decision (WHY) +
 *  needs + closest companion + the held job (kind + site). The
 *  1057 answer (name, activity, needs), the 1059 WHY (the scored
 *  decision), and the 1060 closest-companion line all live here.
 *  Pure so the sim and the standalone asserts can prove the E
 *  line reports the profession and the current work (the probe
 *  proves it live). */
export function founderExamineMessage(f: FounderState, day: number, job: { kind: string; targetId: string } | null | undefined, plan?: SettlementPlan | null): string {
  const n = roundFounderNeeds(f.needs);
  const d = f.lastDecision;
  const why = d ? ' (' + d.top + ' ' + d.topScore.toFixed(2) + ' > ' + d.runnerUp + ' ' + d.runnerUpScore.toFixed(2) + ')' : '';
  const cl = closestFounder(f.social, day);
  let rel = '';
  if (cl) {
    const c = memoryCountsFor(f.social, cl.name);
    const parts: string[] = [];
    if (c.build > 0) parts.push('built ' + c.build + '×');
    if (c.eat > 0) parts.push('ate ' + c.eat + '×');
    if (c.rest > 0) parts.push('rested ' + c.rest + '×');
    if (c.sleep > 0) parts.push('slept ' + c.sleep + '×');
    rel = ' · closest ' + cl.name + ' ' + Math.round(cl.affinity) + (parts.length ? ' — ' + parts.join(', ') : '');
  }
  const jobLine = job ? ' · job ' + job.kind + ' ' + job.targetId : ' · job —';
  // BUILD 1100: the settlement plan — why THIS building, why HERE
  // (the Mayor's need + the Architect's site, with the reasons).
  const planLine = plan ? ' · plan: ' + planBuildingLabel(plan.building) + ' at (' + ((plan.site.rect.x0 + plan.site.rect.x1) / 2) + ',' + ((plan.site.rect.y0 + plan.site.rect.y1) / 2) + ') — need ' + plan.need.toFixed(2) + ' · ' + plan.reasons.join('; ') : '';
  return f.name + ' (' + professionLabel(f.profession) + '): ' + f.activity + why + ' · hunger ' + n.hunger + ' · energy ' + n.energy + ' · social ' + n.social + ' · health ' + n.health + rel + jobLine + planLine;
}

export function action(ctx: PlayerControlsContext, e: KeyboardEvent): void {
  const stateRef = ctx.state;
  const world = ctx.world;
  const renderer = ctx.renderer;
  const setMessage = ctx.setMessage;
  const setHealth = ctx.setHealth;
  const refreshResourceUi = ctx.refreshResourceUi;
  const insideHutRef = ctx.insideHut;
  const carRef = ctx.car;
  const drivingRef = ctx.driving;
  const npcActorsRef = ctx.npcActors;
  const animalActorsRef = ctx.animalActors;
  const foundersRef = ctx.founders;
  const registryRef = ctx.registry;
  const jobBoardRef = ctx.jobBoard;
  const sitePlanRef = ctx.sitePlan;
  const penRef = ctx.pen;
  const constructionRef = ctx.construction;
  const livingWorldRef = ctx.livingWorld;
  const clockRef = ctx.clock;
  const healthRef = ctx.health;
  const inventoryRef = ctx.inventory;
  const needsWorldRebuild = ctx.needsWorldRebuild;
  const enterCar = ctx.enterCar;
  const exitCar = ctx.exitCar;
  const enterHut = ctx.enterHut;
  const exitHut = ctx.exitHut;
  const NPC_SAVE_KEY = ctx.npcSaveKey;
  const HEALTH_KEY = ctx.healthKey;
  if(e.type!=='keydown')return;const k=e.key.toLowerCase();const p=stateRef.current.position;
  // BUILD 1064 (R-1): gathered goods go into the player store
  // (source: the entity id they came from, location: the tile
  // the player stands on, owner: the player) and the HUD is
  // refreshed from the registry. Returns how many units landed.
  const depositPlayer=(kind:RegistryKind,qty:number,sourceId:string)=>{
    const dep=depositInto(registryRef.current,PLAYER_STORE_ID,kind,qty,{type:'entity',id:sourceId},{location:{x:Math.round(p.x),y:Math.round(p.y)},ownerId:'player'});
    registryRef.current=dep.registry;
    refreshResourceUi();
    return dep.added;
  };
  // BUILD 1108 (0x2B): I opens/closes the inventory panel. Not while
  // typing in a text field (library search, rename, paste name).
  if(k==='i'){if(!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement))ctx.onToggleInventory?.();return;}
  if(k==='f'||k===' '){
    const npcTarget=npcActorsRef.current.filter(n=>n.alive&&Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    // BUILD 1013: wolves are F/Space targets too (25/swing, the
    // NPC rule). Nearest target wins across residents + wolves.
    // Goats, deer, and birds are ambient wildlife — never targets.
    // A wolf does NOT strike back here: wolves bite on their own
    // 900ms tick (the animal timer), so the bite is a real combat
    // loop, not a scripted retaliation.
    const wolfTarget=animalActorsRef.current.filter(a=>a.kind==='wolf'&&a.hp>0&&Math.abs(a.x-p.x)<=1&&Math.abs(a.y-p.y)<=1).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    if(wolfTarget&&(!npcTarget||Math.hypot(wolfTarget.x-p.x,wolfTarget.y-p.y)<Math.hypot(npcTarget.x-p.x,npcTarget.y-p.y))){
      wolfTarget.hp=Math.max(0,wolfTarget.hp-25);
      if(wolfTarget.hp===0){
        animalActorsRef.current=animalActorsRef.current.filter(a=>a!==wolfTarget);
        renderer.animalRender.delete(wolfTarget.id);
        renderer.slotUploaded.delete(renderer.animalSlotBase+wolfTarget.slotId);
        recordAnimalKill(world,'wolf');setMessage('Wolf slain.');
      } else setMessage('Wolf hit · '+wolfTarget.hp+' HP remaining');
      return;
    }
    const target=npcTarget;
    if(!target){setMessage('No living target in melee range');return}
    target.hp=Math.max(0,target.hp-25);
    const nextHealth=Math.max(0,healthRef.current-5);healthRef.current=nextHealth;setHealth(nextHealth);try{localStorage.setItem(HEALTH_KEY,String(nextHealth))}catch{}
    if(nextHealth===0){setMessage('You are exhausted. Health restored to 100.');healthRef.current=100;setHealth(100);try{localStorage.setItem(HEALTH_KEY,'100')}catch{}}
    if(target.hp===0){target.alive=false;setMessage(target.name+' defeated. Press E beside them to loot the body.')}
    else setMessage(target.name+' hit · '+target.hp+' HP remaining · they strike back for 5');
    try{localStorage.setItem(NPC_SAVE_KEY,JSON.stringify(npcActorsRef.current))}catch{}
    return;
  }
  if(k==='e'){
    // BUILD 1033: E exits the car first (like Exit from a hut),
    // then enters the car when standing by it — before the door
    // check, since the car is the thing just summoned. The Enter
    // Car button is the phone-first path; E is the desktop one.
    if(drivingRef.current){exitCar();return;}
    const parkedCar=carRef.current;
    if(parkedCar&&isCarNear(parkedCar,p.x,p.y)){enterCar();return;}
    // BUILD 990: E enters/exits houses (the Enter/Exit buttons are
    // the phone-first path; E is the desktop equivalent). Inside →
    // exit first; near a door → enter; otherwise the existing
    // loot/talk/harvest chain below.
    if(insideHutRef.current){exitHut();return;}
    const doorHut=nearestDoorHut([...world.huts,...placedHutRects(world)],Math.round(p.x),Math.round(p.y));
    if(doorHut){enterHut(doorHut);return;}
    const dead=npcActorsRef.current.find(n=>!n.alive&&Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1);
    if(dead){
      // BUILD 1064 (R-1): loot goes through the registry — gold
      // into the player store (source: the dead NPC's id), the
      // keepsake stays in the inventory record (memorabilia, not
      // a resource). The keepsake is added first, then the
      // deposit's refresh merges it with the gold in one pass.
      inventoryRef.current={...inventoryRef.current,[dead.name+' loot']:(inventoryRef.current[dead.name+' loot']||0)+1};
      depositPlayer('gold',5,npcSpawnIdFor(dead.name));
      dead.looted=true;try{localStorage.setItem(NPC_SAVE_KEY,JSON.stringify(npcActorsRef.current))}catch{}setMessage('Looted '+dead.name+': 5 gold and 1 keepsake');return}
    const near=npcActorsRef.current.find(n=>n.alive&&Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1);
    if(near){setMessage('You speak with '+near.name+'. They are going about their day.');return}
    // BUILD 1057: founders answer E with their state (name,
    // activity, needs) — no dialogue UI yet, just the message
    // line. BUILD 1059: the answer also says WHY — the scored
    // decision ("build 0.72 > work 0.30"), so the player can see
    // the utility choice. The stockpile tile answers with the
    // real count.
    const nearFounder=FOUNDERS_ENABLED?foundersRef.current.find(f=>Math.abs(f.x-p.x)<=1&&Math.abs(f.y-p.y)<=1):undefined;
    // BUILD 1060: the answer also names the founder's closest
    // companion and what they have shared ("closest Greta 62 —
    // built 2×, ate 1×, rested 3×") — the counts come from the
    // founder's actual memories, so the player never sees a
    // count the founder does not remember. Only non-zero counts
    // are shown.
    if(nearFounder){setMessage(founderExamineMessage(nearFounder,clockRef.current.day,jobForFounder(jobBoardRef.current,nearFounder.id),sitePlanRef?sitePlanRef.current:null));return}
    if(FOUNDERS_ENABLED&&Math.abs(FOUNDER_STOCKPILE_TILE.x-p.x)<=1&&Math.abs(FOUNDER_STOCKPILE_TILE.y-p.y)<=1){
      // BUILD 1062: the stockpile tile is the camp's status board —
      // the living-world numbers ride along (forest density from
      // the real tree count, trees regrown, the day the sim has
      // advanced through). All numbers are live, never invented.
      const lw=livingWorldRef.current?livingWorldSummary(livingWorldRef.current,world.trees.length,clockRef.current.day):null;
      // BUILD 1085 (1.6): the ecosystem counts ride on the stockpile
      // board too (deer/wolves/saplings, live from the world save).
      const eco=ecosystemSummaryText(world, penRef ? penRef.current : null, { meat: granaryMeatInRegistry(registryRef.current), fish: granaryFishInRegistry(registryRef.current), wool: storehouseWoolInRegistry(registryRef.current), leather: storehouseLeatherInRegistry(registryRef.current) });
      setMessage('Settlers\' stockpile: '+campWoodInRegistry(registryRef.current)+' wood · '+campStoneInRegistry(registryRef.current)+' stone · Granary '+campFoodInRegistry(registryRef.current)+' meals · '+campGrainInRegistry(registryRef.current)+' grain'+(lw?' · Forest '+lw.forestDensityPct+'% ('+lw.liveTrees+'/'+lw.baselineTrees+' trees) · '+lw.plantedTotal+' regrown · sim day '+lw.lastAdvancedDay:'')+(eco?' · '+eco:''));
      return;
    }
    // BUILD 1058: E at the founders' hut reports its state:
    // progress + wood spent while building, whose hut it is once
    // finished. After the door check (the door enters) and after
    // the stockpile check (the pile tile sits against the hut's
    // west wall, and its count still wins there). A player-built
    // cottage on the exact site is adopted by the founders (the
    // tick reconciles it to 'done'), so the only states here are
    // 'building' and 'done'.
    if(FOUNDERS_ENABLED){
      const nearSite=HUT_SITES.find(s=>Math.abs(p.x-s.centre.x)<=3&&Math.abs(p.y-s.centre.y)<=2);
      if(nearSite){
        const sc=sitesOf(constructionRef.current)[HUT_SITES.indexOf(nearSite)];
        if(sc&&hutSitePlacementExists(world,nearSite)&&sc.state==='done'){setMessage(nearSite.id==='hut-site-0'?'The founders\' hut — Marlow, Greta and Perrin sleep here':'The second hut — the founders\' new home');return;}
        if(sc&&sc.state==='building'){
          const b=foundersRef.current.find(f=>f.workState==='building'||f.workState==='toSite');
          setMessage((nearSite.id==='hut-site-0'?'First hut: ':'Second hut: ')+sc.progress+'/'+HUT_WORK_STEPS+' built · '+sc.spentWood+' wood spent'+(b?' · '+b.name+' is building':' · waiting for wood'));
          return;
        }
      }
    }
    // BUILD 1087: E at the storehouse site reports its state:
    // progress + wood/stone spent while building, and the stored
    // wood/stone once finished. After the hut-site check (the hut
    // check's 3x2 window does not reach the storehouse centre, so
    // the two never compete) and before the deposit check.
    if(FOUNDERS_ENABLED&&ctx.storehouse&&Math.abs(p.x-STOREHOUSE_CENTRE.x)<=3&&Math.abs(p.y-STOREHOUSE_CENTRE.y)<=2){
      const sh=ctx.storehouse.current;
      if(sh.state==='done'){setMessage('The storehouse — '+storehouseWoodInRegistry(registryRef.current)+' wood · '+storehouseStoneInRegistry(registryRef.current)+' stone stored');return;}
      if(sh.state==='building'){const b=foundersRef.current.find(f=>f.workState==='building'||f.workState==='toSite');setMessage('Storehouse: '+sh.progress+'/'+STOREHOUSE_WORK_STEPS+' built · '+sh.spentWood+' wood · '+sh.spentStone+' stone spent'+(b?' · '+b.name+' is building':' · waiting for wood and stone'));return;}
      setMessage('The storehouse site — the founders will build it here once the huts are done.');return;
    }
    // BUILD 1081 (1.2): a mineral deposit answers E with its Examine
    // text (mineral + remaining) — mining it is Phase 2, so E only
    // looks, never takes. The deposit is a rock outcrop: it blocks
    // like a rock, so the player stands beside it, within the
    // shared 1-tile reach.
    const deposit=depositNear(world,Math.round(p.x),Math.round(p.y));
    if(deposit){setMessage(examineDeposit(deposit));return}
    // BUILD 1082 (1.3): a river answers E with its Examine text
    // (which way it flows) — the river is water, so it blocks
    // like water, and the player stands beside it, within the
    // shared 1-tile reach. No fishing, swimming, or drinking here.
    const river=riverNear(world,Math.round(p.x),Math.round(p.y));
    if(river){setMessage(examineRiver(river));return}
    const key=(x:number,y:number)=>Math.abs(x-p.x)<=1&&Math.abs(y-p.y)<=1;
    const crate=world.crates.find(c=>key(c.tx,c.ty));
    // BUILD 1064 (R-1): the crate's deposit is extracted (the
    // crate holds 1 wood; a missing deposit falls back to 1 —
    // the world's truth, e.g. a crate placed after load) and
    // the yield lands in the player store with the crate as
    // its source.
    if(crate){world.crates=world.crates.filter(c=>c!==crate);saveWorld(world);const ex=extractDeposit(registryRef.current,crateId(crate.tx,crate.ty));registryRef.current=ex.registry;depositPlayer('wood',ex.qty>0?ex.qty:1,crateId(crate.tx,crate.ty));needsWorldRebuild.current=true;setMessage('Collected 1 wood');return}
    const rock=world.rocks.find(c=>key(c.tx,c.ty));
    // BUILD 1064 (R-1): the rock's deposit is extracted (1 stone;
    // a missing deposit falls back to 1) and the yield lands in
    // the player store with the rock as its source.
    if(rock){world.rocks=world.rocks.filter(c=>c!==rock);if(!world.removedRocks)world.removedRocks=[];const rk=terrainKey(rock.tx,rock.ty);if(!world.removedRocks.includes(rk))world.removedRocks.push(rk);saveWorld(world);const ex=extractDeposit(registryRef.current,rockId(rock.tx,rock.ty));registryRef.current=ex.registry;depositPlayer('stone',ex.qty>0?ex.qty:1,rockId(rock.tx,rock.ty));needsWorldRebuild.current=true;setMessage('Mined 1 stone');return}
    const tree=world.trees.find(c=>key(c.tx,c.ty));
    // BUILD 1061: a chopped tree is recorded in removedTrees (the
    // rock branch above has done this since 987 for the same
    // reason) — the tree-density migration in loadWorld re-stamps
    // trees from the rule, and without the record a chopped tree
    // would resurrect on the next load.
    if(tree){world.trees=world.trees.filter(c=>c!==tree);if(!world.removedTrees)world.removedTrees=[];const tk=terrainKey(tree.tx,tree.ty);if(!world.removedTrees.includes(tk))world.removedTrees.push(tk);plantSapling(world,tree.tx,tree.ty);saveWorld(world);const ex=extractDeposit(registryRef.current,treeId(tree.tx,tree.ty));registryRef.current=ex.registry;depositPlayer('wood',ex.qty>0?ex.qty:2,treeId(tree.tx,tree.ty));needsWorldRebuild.current=true;setMessage('Chopped tree · collected 2 wood');return}
    // BUILD 1024: wild trees/rocks past the old edge harvest the
    // same way (2 wood / 1 stone) and stay gone via the
    // removedWildTrees / removedWildRocks sets. Same 1-tile reach
    // (the shared key() test) as the stored items above.
    let wildFound:'tree'|'rock'|null=null;let wildKey='';
    for(let wy=Math.round(p.y)-1;wy<=Math.round(p.y)+1&&!wildFound;wy++) for(let wx=Math.round(p.x)-1;wx<=Math.round(p.x)+1;wx++){
      if(!key(wx,wy)) continue;
      if(wx>=0&&wy>=0&&wx<world.w&&wy<world.h) continue;
      const k=wx+','+wy;
      if(wildTreeAt(wx,wy)&&!(world.removedWildTrees??[]).includes(k)){wildFound='tree';wildKey=k;break;}
      if(wildRockAt(wx,wy)&&!(world.removedWildRocks??[]).includes(k)){wildFound='rock';wildKey=k;break;}
    }
    // BUILD 1064 (R-1): wild trees/rocks are SOURCES, not
    // deposits (a hash rule, not a stored list — the F-1
    // treatment) — the yield lands in the player store with
    // the wild id as its source, no deposit to extract.
    if(wildFound==='tree'){if(!world.removedWildTrees)world.removedWildTrees=[];world.removedWildTrees.push(wildKey);saveWorld(world);const [wx,wy]=wildKey.split(',').map(Number);depositPlayer('wood',2,wildTreeId(wx,wy));needsWorldRebuild.current=true;setMessage('Chopped tree · collected 2 wood');return}
    if(wildFound==='rock'){if(!world.removedWildRocks)world.removedWildRocks=[];world.removedWildRocks.push(wildKey);saveWorld(world);const [wx,wy]=wildKey.split(',').map(Number);depositPlayer('stone',1,rockId(wx,wy));needsWorldRebuild.current=true;setMessage('Mined 1 stone');return}
    // BUILD 1041: farm land — E harvests a ready wheat tile
    // within the shared 1-tile reach (the same key() test as
    // crates/trees/rocks). The tile resets to planted and
    // regrows on its own, so no re-planting is ever needed. No
    // world rebuild: the soil is static and the wheat is
    // per-frame fx, so the field updates next frame on its own.
    // A growing tile answers plainly instead of harvesting.
    const farmNowAbs=absMinutes(clockRef.current.day,clockRef.current.minutes);
    const farmReady=placedFarmTiles(world).find(t=>key(t.tx,t.ty)&&farmStageAt(t.plantedAt,farmNowAbs,growthFactorAt(world,clockRef.current.day,t.tx,t.ty))==='ready');
    if(farmReady){const res=harvestFarmTile(world,farmReady.tx,farmReady.ty,farmNowAbs,growthFactorAt(world,clockRef.current.day,farmReady.tx,farmReady.ty));if(res.ok){saveWorld(world);depositPlayer('grain',res.wheat,'farm:'+farmReady.tx+','+farmReady.ty);setMessage('Harvested wheat · +'+res.wheat+' wheat');return}}
    const farmNear=placedFarmTiles(world).find(t=>key(t.tx,t.ty));
    if(farmNear){setMessage('Wheat is still growing — it is ready in a few in-game hours');return}
    setMessage('Nothing close enough to interact with');return
  }
  // Directional keys are integrated continuously by the render loop;
  // never quantize movement into one-tile jumps.
}
