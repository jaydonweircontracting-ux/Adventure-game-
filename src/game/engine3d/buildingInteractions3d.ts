// buildingInteractions3d.ts — NEURON HEX 0x0D area 6 (BUILD 1076).
// The building-interaction layer, extracted verbatim from Engine3DWorldView.tsx.
//
// What lives here: the Build mode / placement flow (placing items, the
// Build panel, addPlacement's partner cancelPlacement), entering/exiting
// buildings (the hut door Enter button, the interior transition, the
// exit), the Build tool toggles, undo/redo over the build-edit stack,
// and the area-select actions (rotate / delete / layout helpers).
// Placement is FREE (no inventory spend) — the inventory store is
// area 5 (inventoryCrafting3d.ts); this module never touches it.
// The founder tick is area 1, the renderer/camera/draw is area 2,
// the NPC simulation is area 3, the player controls are area 4.
//
// The React state itself stays in the view; the view builds one
// BuildingContext per render and calls in via createBuildingInteractions.
// Functions that the view's effect calls (pushHistory, placementLabel,
// clearAreaSelection, toolLabel, cancelPlacement) touch only refs and
// setters, never captured state values, so a stale effect closure is
// harmless for them. Functions that read state values (toggleRemove,
// toggleAreaSelect, setWalk, walkToolLabel, isBuildMinimized,
// nearDoorHutFor) are called from JSX or the per-render player-controls
// context, which is always fresh.
import type { MutableRefObject } from 'react';
import { saveWorld, type HutRect, type IsoWorld, type PlacedItem } from '../iso/isoWorld';
import { hutDoor, hutExitPoint, nearestDoorHut } from './interiors';
import { placedHutRects, recordBuildChange, undoBuildChange, redoBuildChange, type PaletteKind, type UndoEntry, type BuildHistory } from './placements';
import { selectArea, areaCentreTile, rotateRect, rotateArea, deleteArea, type AreaSelection } from './areaSelect';
import { type LayoutResult } from './layoutHelpers';
import { HOUSE_VARIANTS } from './townLook';
import type { CustomAsset } from './customAssets';
import type { StudioTool } from './worldStudio';

export interface BuildingContext {
  // Refs (mutable world / UI state the module reads and writes).
  stateRef: MutableRefObject<{ position: { x: number; y: number }; world: IsoWorld }>;
  historyRef: MutableRefObject<BuildHistory>;
  needsWorldRebuild: MutableRefObject<boolean>;
  // BUILD 1080 (0x0B): urgent-rebuild flag — set only by enter/exit.
  rebuildUrgent: MutableRefObject<boolean>;
  buildRef: MutableRefObject<{ palette: PaletteKind | null; removeMode: boolean; moveMode: boolean; saveAreaMode: boolean; pasteName: string | null; customAssetId: string | null; areaSelectMode: boolean; areaMoveArmed: boolean; areaDuplicateArmed: boolean }>;
  areaSelectionRef: MutableRefObject<AreaSelection | null>;
  npcActorsRef: MutableRefObject<Array<{ x: number; y: number; alive: boolean }>>;
  transientActorsRef: MutableRefObject<Array<{ x: number; y: number }>>;
  customAssetsRef: MutableRefObject<CustomAsset[]>;
  areaSelectPreviewRef: MutableRefObject<HTMLDivElement | null>;
  placePreviewRef: MutableRefObject<HTMLDivElement | null>;
  placeHoverRef: MutableRefObject<{ x: number; y: number } | null>;
  insideHutRef: MutableRefObject<HutRect | null>;
  walkRef: MutableRefObject<boolean>;
  // Setters.
  setPosition: (p: { x: number; y: number }) => void;
  setMessage: (m: string) => void;
  setPlacedCount: (n: number) => void;
  setInsideHut: (h: HutRect | null) => void;
  setUndoAvailable: (v: boolean) => void;
  setRedoAvailable: (v: boolean) => void;
  setPalette: (p: PaletteKind | null) => void;
  setCustomSelection: (id: string | null) => void;
  setPasteName: (n: string | null) => void;
  setRemoveMode: (v: boolean) => void;
  setMoveMode: (v: boolean) => void;
  setSaveAreaMode: (v: boolean) => void;
  setAreaSelectMode: (v: boolean) => void;
  setAreaSelection: (s: AreaSelection | null) => void;
  setAreaMoveArmed: (v: boolean) => void;
  setAreaDuplicateArmed: (v: boolean) => void;
  setAreaDeleteArmed: (v: boolean) => void;
  setWalkSuspended: (v: boolean) => void;
  // BUILD 1133: disarm the World Studio tool (the view's
  // setStudioToolBoth) — toggles and cancel call it so a studio
  // tool never stays armed beside another build tool.
  onClearStudio: () => void;
  // State values, captured per render.
  removeMode: boolean;
  palette: PaletteKind | null;
  customSelection: string | null;
  // BUILD 1133: the armed World Studio tool (view state, captured
  // per render like palette) — the minimized strip and Walk label
  // treat it as an armed build tool.
  studioTool: StudioTool | null;
  areaSelectMode: boolean;
  moveMode: boolean;
  saveAreaMode: boolean;
  pasteName: string | null;
  buildOpen: boolean;
  areaSelection: AreaSelection | null;
  insideHut: HutRect | null;
  position: { x: number; y: number };
  customAssets: CustomAsset[];
  saveKey: string;
}

export interface BuildingInteractions {
  cancelPlacement: () => void;
  setWalk: (v: boolean) => void;
  doUndo: () => void;
  doRedo: () => void;
  toolLabel: (p: PaletteKind | null, rm: boolean, mv?: boolean, sa?: boolean, pn?: string | null, as?: boolean) => string;
  placementLabel: (item: PlacedItem) => string;
  walkToolLabel: () => string;
  toggleRemove: () => void;
  toggleAreaSelect: () => void;
  setAreaMoveArmedBoth: (v: boolean) => void;
  setAreaDuplicateArmedBoth: (v: boolean) => void;
  clearAreaSelection: () => void;
  areaActorTiles: () => { playerTile: { x: number; y: number }; npcTiles: Array<{ x: number; y: number }> };
  doAreaRotate: (steps: 1 | -1) => void;
  doAreaDelete: () => void;
  runLayoutHelper: (fn: (w: IsoWorld, s: AreaSelection, pt: { x: number; y: number }, nt: Array<{ x: number; y: number }>) => LayoutResult, already: string) => void;
  isBuildMinimized: () => boolean;
  enterHut: (hut: HutRect) => void;
  exitHut: () => void;
  nearDoorHut: () => HutRect | null;
  pushHistory: (entry: UndoEntry) => void;
}

export function createBuildingInteractions(ctx: BuildingContext): BuildingInteractions {
  return {
    cancelPlacement: () => cancelPlacement(ctx),
    setWalk: (v) => setWalk(ctx, v),
    doUndo: () => doUndo(ctx),
    doRedo: () => doRedo(ctx),
    toolLabel: (p, rm, mv, sa, pn, as) => toolLabel(p, rm, mv, sa, pn, as),
    placementLabel: (item) => placementLabel(ctx, item),
    walkToolLabel: () => walkToolLabel(ctx),
    toggleRemove: () => toggleRemove(ctx),
    toggleAreaSelect: () => toggleAreaSelect(ctx),
    setAreaMoveArmedBoth: (v) => setAreaMoveArmedBoth(ctx, v),
    setAreaDuplicateArmedBoth: (v) => setAreaDuplicateArmedBoth(ctx, v),
    clearAreaSelection: () => clearAreaSelection(ctx),
    areaActorTiles: () => areaActorTiles(ctx),
    doAreaRotate: (steps) => doAreaRotate(ctx, steps),
    doAreaDelete: () => doAreaDelete(ctx),
    runLayoutHelper: (fn, already) => runLayoutHelper(ctx, fn, already),
    isBuildMinimized: () => isBuildMinimized(ctx),
    enterHut: (hut) => enterHut(ctx, hut),
    exitHut: () => exitHut(ctx),
    nearDoorHut: () => nearDoorHutFor(ctx),
    pushHistory: (entry) => pushHistory(ctx, entry),
  };
}

// BUILD 1036: cancel placement — disarm the armed asset (and any
// paste), hide the preview. Move mode stays as it was, so ESC /
// right-click after "Move + pick an asset" returns to dragging
// items instead of dropping the whole tool.
export function cancelPlacement(ctx: BuildingContext): void {
  ctx.onClearStudio();
  ctx.setPalette(null); ctx.setCustomSelection(null); ctx.setPasteName(null);
  ctx.buildRef.current = { ...ctx.buildRef.current, palette: null, customAssetId: null, pasteName: null };
  const el = ctx.placePreviewRef.current; if (el) el.style.display = 'none';
  ctx.placeHoverRef.current = null;
}
export function setWalk(ctx: BuildingContext, v: boolean): void {
  ctx.walkRef.current=v;ctx.setWalkSuspended(v);if(v){const el=ctx.placePreviewRef.current;if(el)el.style.display='none';}
}
export function syncHistory(ctx: BuildingContext): void {
  ctx.setUndoAvailable(ctx.historyRef.current.undo.length>0);ctx.setRedoAvailable(ctx.historyRef.current.redo.length>0);
}
export function pushHistory(ctx: BuildingContext, entry: UndoEntry): void {
  recordBuildChange(ctx.historyRef.current,entry);syncHistory(ctx);
}
export function doUndo(ctx: BuildingContext): void {
  const world=ctx.stateRef.current.world;
  const msg=undoBuildChange(world,ctx.historyRef.current);if(msg===null)return;
  syncHistory(ctx);saveWorld(world);ctx.needsWorldRebuild.current=true;ctx.setPlacedCount(world.placements?.length??0);ctx.setMessage(msg);
}
export function doRedo(ctx: BuildingContext): void {
  const world=ctx.stateRef.current.world;
  const msg=redoBuildChange(world,ctx.historyRef.current);if(msg===null)return;
  syncHistory(ctx);saveWorld(world);ctx.needsWorldRebuild.current=true;ctx.setPlacedCount(world.placements?.length??0);ctx.setMessage(msg);
}
export function toolLabel(p: PaletteKind | null, rm: boolean, mv?: boolean, sa?: boolean, pn?: string | null, as?: boolean): string {
  return pn?('Paste '+pn):as?'Area select':sa?'Save area':mv?'Move':rm?'Remove':p?({path:'Pathway',house:'House',tree:'Tree',stall:'Market Stall',grass:'Grass','house-cottage':'Cottage','house-tall':'Tall House','house-shop':'Shopfront','house-grand':'Grand House','house-inn':'Inn','house-smith':'Blacksmith','house-store':'General Store','house-windmill':'Windmill','house-mine':'Mine','station-workbench':'Workbench','station-blacksmith':'Blacksmith','station-furnace':'Furnace','station-advanced-forge':'Advanced Forge','station-apothecary':'Apothecary',lantern:'Lantern',bush:'Bush',ore:'Ore Deposit',bridge:'Wooden Bridge',ford:'Ford',dock:'Dock','stepping-stone':'Stepping Stone',embankment:'Embankment',farm:'Farm Land',fence:'Fence'} as Record<PaletteKind,string>)[p]:'';
}
export function placementLabel(ctx: BuildingContext, item: PlacedItem): string {
  return item.kind==='custom'?(ctx.customAssetsRef.current.find(a=>a.id===item.assetId)?.name??'Custom model'):item.kind==='house'&&item.variant?(HOUSE_VARIANTS[item.variant]?.label??'House'):({path:'Pathway',house:'House',tree:'Tree',stall:'Market Stall',grass:'Grass',rock:'Rock',water:'Water',wall:'Wall',lantern:'Lantern',bush:'Bush',ore:'Ore Deposit',bridge:'Wooden Bridge',ford:'Ford',dock:'Dock','stepping-stone':'Stepping Stone',embankment:'Embankment',farm:'Farm Land',fence:'Fence'} as Record<string,string>)[item.kind]??item.kind;
}
export function walkToolLabel(ctx: BuildingContext): string {
  if(ctx.studioTool)return ({river:'Draw river',widen:'Widen river',narrow:'Narrow river',bank:'Harden bank',bridge:'Bridge',path:'Draw path'} as Record<string,string>)[ctx.studioTool];
  const t=toolLabel(ctx.palette,ctx.removeMode,ctx.moveMode,ctx.saveAreaMode,ctx.pasteName,ctx.areaSelectMode);if(t)return t;if(ctx.customSelection){const a=ctx.customAssets.find(x=>x.id===ctx.customSelection);return a?a.name:'Custom';}return '';
}

// BUILD 1004: the ONE Remove toggle. The panel's Remove button and
// the minimized-cluster quick button both call this, so the two can
// never diverge. Body is the panel toggle's original handler, moved
// verbatim: turning Remove on clears any palette/custom choice and
// Move/Save/Paste; turning it off keeps the palette it displaced.
export function toggleRemove(ctx: BuildingContext): void {
  ctx.onClearStudio();
  const next=!ctx.removeMode;ctx.setRemoveMode(next);if(next){ctx.setPalette(null);ctx.setCustomSelection(null);}ctx.setMoveMode(false);ctx.setSaveAreaMode(false);ctx.setPasteName(null);ctx.buildRef.current={palette:next?null:ctx.palette,removeMode:next,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:next?null:ctx.buildRef.current.customAssetId,areaSelectMode:ctx.buildRef.current.areaSelectMode,areaMoveArmed:ctx.buildRef.current.areaMoveArmed,areaDuplicateArmed:ctx.buildRef.current.areaDuplicateArmed};
}

// BUILD 1037: the ONE Area-select toggle. Turning it on clears any
// palette/custom choice and Move/Remove/Save/Paste (the Save-area
// toggle's rule); turning it off KEEPS the selection — the yellow
// area stays so the actions menu still works, and Clear or × drops
// it. Move/Duplicate arms are dropped with the tool (they refer to
// the drag, not the selection).
export function toggleAreaSelect(ctx: BuildingContext): void {
  ctx.onClearStudio();
  const next=!ctx.areaSelectMode;ctx.setAreaSelectMode(next);if(next){ctx.setPalette(null);ctx.setCustomSelection(null);ctx.setRemoveMode(false);ctx.setMoveMode(false);ctx.setSaveAreaMode(false);ctx.setPasteName(null);}ctx.setAreaMoveArmed(false);ctx.setAreaDuplicateArmed(false);ctx.setAreaDeleteArmed(false);ctx.buildRef.current={palette:next?null:ctx.palette,removeMode:next?false:ctx.removeMode,moveMode:next?false:ctx.moveMode,saveAreaMode:next?false:ctx.saveAreaMode,pasteName:next?null:ctx.pasteName,customAssetId:next?null:ctx.buildRef.current.customAssetId,areaSelectMode:next,areaMoveArmed:false,areaDuplicateArmed:false};
}
export function setAreaMoveArmedBoth(ctx: BuildingContext, v: boolean): void {
  ctx.setAreaMoveArmed(v);ctx.buildRef.current={...ctx.buildRef.current,areaMoveArmed:v};
}
export function setAreaDuplicateArmedBoth(ctx: BuildingContext, v: boolean): void {
  ctx.setAreaDuplicateArmed(v);ctx.buildRef.current={...ctx.buildRef.current,areaDuplicateArmed:v};
}
export function clearAreaSelection(ctx: BuildingContext): void {
  ctx.setAreaSelection(null);setAreaMoveArmedBoth(ctx, false);setAreaDuplicateArmedBoth(ctx, false);ctx.setAreaDeleteArmed(false);const el=ctx.areaSelectPreviewRef.current;if(el)el.style.display='none';
}

// BUILD 1037: the area-select action handlers (panel buttons). They
// share the doUndo/doRedo shape (save + rebuild + one history entry
// + message) and re-select the group afterwards, so the user can
// rotate a group they just moved without re-dragging the rectangle.
export function areaActorTiles(ctx: BuildingContext): { playerTile: { x: number; y: number }; npcTiles: Array<{ x: number; y: number }> } {
  const player=ctx.stateRef.current.position;return {playerTile:{x:Math.round(player.x),y:Math.round(player.y)},npcTiles:[...ctx.npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)})),...ctx.transientActorsRef.current.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))]};
}
export function doAreaRotate(ctx: BuildingContext, steps: 1 | -1): void {
  const sel=ctx.areaSelectionRef.current;if(!sel)return;
  const world=ctx.stateRef.current.world;const {playerTile,npcTiles}=areaActorTiles(ctx);
  const res=rotateArea(world,sel,steps===1?1:3,playerTile,npcTiles);
  if(!res.ok){ctx.setMessage('Cannot rotate here: '+res.reason);return;}
  if(!res.entry)return;
  saveWorld(world);ctx.needsWorldRebuild.current=true;ctx.setPlacedCount(world.placements?.length??0);pushHistory(ctx, res.entry);
  const c=areaCentreTile(sel.rect);const newRect=rotateRect(c.x,c.y,sel.rect,steps===1?1:3);
  ctx.setAreaSelection(selectArea(world,newRect));ctx.setAreaDeleteArmed(false);
  ctx.setMessage('Rotated area '+(steps===1?'90° clockwise':'90° counter-clockwise')+' ('+res.moved+' item'+(res.moved===1?'':'s')+(res.skipped.length?', '+res.skipped.length+' skipped: '+res.skipped[0].reason:'')+')');
}
export function doAreaDelete(ctx: BuildingContext): void {
  const sel=ctx.areaSelectionRef.current;if(!sel)return;
  const world=ctx.stateRef.current.world;
  const res=deleteArea(world,sel);
  if(!res.entry){ctx.setMessage('Nothing selected to delete');return;}
  saveWorld(world);ctx.needsWorldRebuild.current=true;ctx.setPlacedCount(world.placements?.length??0);pushHistory(ctx, res.entry);
  clearAreaSelection(ctx);
  ctx.setMessage('Deleted '+res.removed+' item'+(res.removed===1?'':'s')+' — one Undo restores them');
}

// BUILD 1042: Town Builder Stage 5 — LAYOUT HELPERS. One shared
// runner for the nine optional tools in the actions menu: each
// helper is a pure function over (world, selection, actors) that
// returns ONE group undo entry (or null when nothing changed), and
// this runner does the same save + rebuild + history + re-select
// + message shape as doAreaRotate. Nothing runs until the player
// taps a button; a failed helper changes nothing; a no-op helper
// reports what is already true instead of pushing history.
export function runLayoutHelper(ctx: BuildingContext, fn: (w: IsoWorld, s: AreaSelection, pt: { x: number; y: number }, nt: Array<{ x: number; y: number }>) => LayoutResult, already: string): void {
  const sel=ctx.areaSelectionRef.current;if(!sel)return;
  const world=ctx.stateRef.current.world;const {playerTile,npcTiles}=areaActorTiles(ctx);
  const res=fn(world,sel,playerTile,npcTiles);
  if(!res.ok){ctx.setMessage('Cannot do that here: '+res.reason);return;}
  if(!res.entry){ctx.setMessage(already+(res.skipped.length?' ('+res.skipped.length+' skipped: '+res.skipped[0].reason+')':''));return;}
  saveWorld(world);ctx.needsWorldRebuild.current=true;ctx.setPlacedCount(world.placements?.length??0);pushHistory(ctx, res.entry);
  ctx.setAreaSelection(selectArea(world,sel.rect));ctx.setAreaDeleteArmed(false);
  ctx.setMessage(res.message+(res.skipped.length?', '+res.skipped.length+' skipped: '+res.skipped[0].reason:'')+' — one Undo undoes it');
}

// BUILD 1004: "build UI is minimized" — panel hidden but a tool
// still armed. Only in this state do the right-edge strip swipe and
// the minimized handle reopen the panel; a full close (×) clears
// the tools, so nothing reopens until Build is tapped again.
export function isBuildMinimized(ctx: BuildingContext): boolean {
  return !ctx.buildOpen&&!!(ctx.palette||ctx.customSelection||ctx.removeMode||ctx.moveMode||ctx.saveAreaMode||ctx.pasteName||ctx.areaSelectMode||ctx.studioTool||ctx.areaSelection);
}
export function setInside(ctx: BuildingContext, h: HutRect | null): void {
  ctx.insideHutRef.current=h;ctx.setInsideHut(h);
}
export function enterHut(ctx: BuildingContext, hut: HutRect): void {
  const door=hutDoor(hut);
  const next={x:door.x,y:door.y};
  ctx.stateRef.current.position=next;ctx.setPosition(next);setInside(ctx, hut);
  try{localStorage.setItem(ctx.saveKey,JSON.stringify(next));}catch{}
  ctx.rebuildUrgent.current=true;ctx.needsWorldRebuild.current=true;ctx.setMessage('Inside — tap Exit to leave');
}
export function exitHut(ctx: BuildingContext): void {
  const hut=ctx.insideHutRef.current;if(!hut)return;
  const next=hutExitPoint(hut);
  ctx.stateRef.current.position=next;ctx.setPosition(next);setInside(ctx, null);
  try{localStorage.setItem(ctx.saveKey,JSON.stringify(next));}catch{}
  ctx.rebuildUrgent.current=true;ctx.needsWorldRebuild.current=true;ctx.setMessage('Outside');
}

// The Enter button's hut: the nearest door within one tile of the
// player tile, while not already inside. Recomputed every render.
export function nearDoorHutFor(ctx: BuildingContext): HutRect | null {
  return !ctx.insideHut?nearestDoorHut([...ctx.stateRef.current.world.huts,...placedHutRects(ctx.stateRef.current.world)],Math.round(ctx.position.x),Math.round(ctx.position.y)):null;
}
