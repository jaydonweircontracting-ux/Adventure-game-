// BUILD 1072 — WorldRenderer: the WebGL renderer, camera, and per-frame
// draw for the 3D view, extracted verbatim from Engine3DWorldView.tsx
// (area 2 follow-up). The view owns the React state and the input
// handlers; the renderer owns the GL context, the camera, and every
// piece of mutable render state. Behaviour-preserving: no visual or
// gameplay change. The renderer never imports React; it receives
// everything it needs through WorldRendererDeps (refs as {current}
// containers, setters, and the view's helpers), following the
// FounderSimContext pattern from area 1 (worldSimulation3d.ts).
//
// Two view-local definitions moved here because only the renderer uses
// them: the render constants WORLD_FOV_DEG / WORLD_FOV_RAD /
// WORLD_REBUILD_DIST / REBUILD_STEP_BUDGET_MS and the Diagnostics3D
// interface (the view imports Diagnostics3D back as a type).
// SAVE_KEY stays in the view (used all over it); draw receives it
// through deps.saveKey. The area-drag flags are plain view `let`s;
// draw only tests their truthiness, so the deps expose boolean readers
// (isAreaSelectDragging / isAreaMoveDragging).

import { type IsoWorld, type HutRect } from '../iso/isoWorld';
import { emitVillager, villagerSpecFor, PLAYER_SPEC, PHASE_PER_UNIT, type VillagerSpec } from './villagers';
import { advanceRenderPos, needsRenderSnap, turnYawToward, easePhaseToNeutral, phaseForDistance, figureSlotLayout, poseKeyEquals, FIGURE_TURN_RATE, type FigurePoseKey } from './npcMotion';
import { SKY_TOP, SKY_HORIZON, FIRST_PERSON_EYE, ZOOM_MIN, VIEW_FAR_PLANE } from './townLook';
import { applyZoomDelta } from './firstPerson';
import { emitSkyObjects, NIGHT_NAVY, SKY_MAX_VERTS } from './sky';
import { nightFactor3dForMinutes, skyGradientForMinutes, FIGURE_NIGHT_CAP, rainForMinutes, emitRainStreaks, RAIN_STREAKS, RAIN_VERTS_PER_STREAK } from './atmosphere';
import { growthFactorAt } from './livingWorld';
import { rainIntensityFor, seasonForDay } from './climate';
import { emitHouseFx, houseFxInputsFor, houseLitAt, lightScheduleFor, FX_MAX_VERTS, type InteriorFxInput, type PenFxInput } from './houseFx';
import { absMinutes, farmStageAt, type FarmStage } from './farm';
import { placedLanternTiles, placedFarmTiles, seedRectForHut, type PaletteKind } from './placements';
import { effTerrainFor, surfaceElevation, rayHitSurface } from './wildTerrain';
import { type AreaSelection } from './areaSelect';
import { type CustomAsset } from './customAssets';
import { interiorCeilingFor, interiorWallBandFor, interiorHearthFor } from './interiors';
import { productionKindForRect, productionFireFor } from './productionInteriors';
import { ROSTER_3D, rosterArchetype, type DayClock } from './townsfolk3d';
import { FOUNDERS_ENABLED, FOUNDER_STOCKPILE_TILE, FOUNDER_NAMES, campWoodInRegistry, type FounderState } from './founders';
import { PEN_CENTRE, penSheepPositions, type PenState } from './animalHusbandry';
import { FOUNDING_PARTY_SIZE, type FoundingState } from './founding';
import { createWorldBuilder, type Vec3, type WorldBuilder } from './worldRender3d';
import { HUT_SITES, sitesOf, type ConstructionState } from './construction';
import { STOREHOUSE_HUT_SITE, type StorehouseState } from './storehouse';
import { MILL_HUT_SITE, BAKERY_HUT_SITE, type FoodChainState } from './foodChain';
import { SMELTER_HUT_SITE, BLACKSMITH_HUT_SITE, SAWMILL_HUT_SITE, CARPENTER_HUT_SITE, WORKSHOP_HUT_SITE, type MetalChainState } from './metalChain';
import { INN_HUT_SITE, type HousingState } from './housing';
import { type ResourceRegistry } from './resourceRegistry';
import { maxVillagerVerts, MAX_TRANSIENTS, type TransientActor } from './transients';
import { emitAnimal, emitAnimalBlob, animalSpecFor, maxAnimalVerts, BIRD_FLIGHT_HEIGHT, MAX_ANIMALS, type AnimalActor } from './animals';
import { WALK_SPEED, SPRINT_SPEED, STAMINA_MAX, stepStamina, sprintInput, nextSprintRearm, type StaminaState } from './sprint';
import { resolvePlayerStep, type PerpDir } from './playerStep';
import { type PlayerPath } from './playerPath';
import { CAR_SPEED, CAR_MAX_VERTS, emitCar, type CarState } from './car';

// the frame showed sky where ground should be, an open field rendered
// as a floating mesa, and past the map edge half the frame was sky.
// The window is kept (detail where it matters); the new band + apron
// underlays in buildWorldVertices carry ground to the horizon, and
// the distance fog softens the far window edge instead of a hard
// cutoff.
export const WORLD_FOV_DEG = 66;
export const WORLD_FOV_RAD = (WORLD_FOV_DEG * Math.PI) / 180;

// BUILD 1026: WORLD_REBUILD_DIST — the player must move this far from
// the last build centre before the whole world buffer rebuilds. Was
// 8 (BUILD 983); repro2 measured one ~150–250ms-above-baseline hitch
// frame per rebuild, and at sprint speed the rebuilds come 56% more
// often per second (same per-tile rate, faster travel), which is the
// stutter the user feels. 16 halves the hitch rate. Safe: the ground
// window is ±22 (≥6 tiles of margin at 16) and grass ±28 (≥12).
export const WORLD_REBUILD_DIST = 16;
// BUILD 1035 — REBUILD_STEP_BUDGET_MS: the per-frame time budget for
// one step of a time-sliced world rebuild while the player is MOVING
// (driving/walking). 10ms leaves headroom for the frame's own draw
// (~8ms on a real phone) inside a 16ms frame, so no frame hitches;
// a ~200ms rebuild then finishes in ~20 frames (~0.33s), during which
// the car travels ~10 tiles — inside the ±22 window, so the player
// never outruns the buffer. While STATIONARY the driver passes
// Infinity (run to completion in one frame), so a placement or an
// enter/exit appears immediately, exactly like the old synchronous
// path — the budget only binds while moving, which is when the
// stutter lived.
export const REBUILD_STEP_BUDGET_MS = 10;

// BUILD 988: hoisted sky identity matrix (was allocated fresh every
// frame) + cached world vertex count (was a per-frame
// getBufferParameter GL query).
const IDENTITY_MAT = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

// BUILD 1017: diagnostics snapshot for the Options dialog (GraphicsModeHost).
// The play screen no longer shows the diagnostic line; the view reports
// {verts, map, position} to the parent instead, and Options > Diagnostics
// renders it on demand.
export interface Diagnostics3D { verts: number; mapW: number; mapH: number; x: number; y: number; }

// BUILD 994: per-figure walk state (player + NPCs). Session-only
// render state, never saved: last tile center, facing yaw, walk
// phase, and the last time the figure moved. Idle figures ease
// their phase to the nearest neutral (a multiple of 2π) instead
// of freezing mid-stride. Yaw follows the movement vector:
// forward = (sin yaw, cos yaw) in (x, z).
type FigureState = { px: number; pz: number; yaw: number; phase: number; lastMove: number };
// BUILD 998: interpolated NPC render state + per-figure GPU slots
// (see npcMotion.ts). Render positions are tile coords (floats)
// gliding toward logical tiles; slot counts are constant per
// figure (specs are seeded per name), so each figure owns a fixed
// vertex range in the actor buffer and only dirty slots re-emit +
// re-upload.
type NpcRenderState = { x: number; y: number; yaw: number; phase: number };
// BUILD 1013: animal render state. h = flight height (birds only,
// eased toward BIRD_FLIGHT_HEIGHT while flying), graze = head-down
// amount (goat/deer, eased toward 1 while grazing); eh/eg are the
// last values EMITTED to the GPU slot — the draw loop deletes the
// slot's uploaded key when either changes, because the pose key
// (x/z/yaw/phase) cannot see them.
type AnimalRenderState = { x: number; y: number; h: number; yaw: number; phase: number; graze: number; eh: number; eg: number };

// Matrix helpers for the camera/projection (moved from the view — they
// were defined just before upload/draw and used only by draw).
const perspective=(f:number,a:number,n:number,far:number)=>{const t=1/Math.tan(f/2),nf=1/(n-far);return [t/a,0,0,0,0,t,0,0,0,0,(far+n)*nf,-1,0,0,2*far*n*nf,0]};
const lookAt=(eye:number[],center:number[])=>{const norm=(v:number[])=>{const l=Math.hypot(...v)||1;return v.map(n=>n/l)};const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const sub=(a:number[],b:number[])=>a.map((n,i)=>n-b[i]);const z=norm(sub(eye,center)),x=norm(cross([0,1,0],z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1]};
const mul=(a:number[],b:number[])=>{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o};

export interface WorldRendererDeps {
  world: IsoWorld;
  saveKey: string;
  isAreaSelectDragging: () => boolean;
  isAreaMoveDragging: () => boolean;
  stateRef: { current: { position: { x: number; y: number }; world: IsoWorld } };
  clockRef: { current: DayClock };
  waitingRef: { current: boolean };
  insideHutRef: { current: HutRect | null };
  playerPathRef: { current: PlayerPath | null };
  playerPathWaitRef: { current: { since: number; x: number; y: number } | null };
  playerPathStuckRef: { current: { x: number; y: number; since: number } | null };
  slidePerpRef: { current: PerpDir | null };
  sprintHeldRef: { current: boolean };
  sprintLatchRef: { current: boolean };
  sprintRearmRef: { current: boolean };
  staminaRef: { current: StaminaState };
  sprintingRef: { current: boolean };
  drivingRef: { current: boolean };
  carYawRef: { current: number };
  carRef: { current: CarState | null };
  prevPlayerRef: { current: { x: number; y: number } | null };
  needsWorldRebuild: { current: boolean };
  // BUILD 1080 (0x0B): urgent-rebuild flag — set only by enter/exit
  // (buildingInteractions3d). An urgent rebuild runs to completion in
  // one frame; every other rebuild is time-sliced at the step budget.
  rebuildUrgent: { current: boolean };
  worldBuilderRef: { current: WorldBuilder | null };
  buildFramesRef: { current: number };
  buildMsRef: { current: number };
  rebuildStepStatsRef: { current: { count: number; maxStepMs: number; maxStepMsMoving: number; totalStepMs: number; lastBuildFrames: number; lastBuildMs: number } };
  rebuildCountRef: { current: number };
  diagRef: { current: Diagnostics3D };
  onDiagnosticsRef: { current: ((d: Diagnostics3D) => void) | undefined };
  customAssetsRef: { current: CustomAsset[] };
  skyDriftRef: { current: number };
  firstPersonRef: { current: boolean };
  fpAutoRef: { current: boolean };
  // BUILD 1110 (0x2D): whether the player has a torch equipped in
  // the tool slot — the renderer glows it above the player (fx
  // buffer, per frame, no rebuild when it equips or breaks).
  torchLitRef: { current: boolean };
  npcActorsRef: { current: { name: string; x: number; y: number; waypoint: number; hp: number; alive: boolean; looted?: boolean }[] };
  transientActorsRef: { current: TransientActor[] };
  foundersRef: { current: FounderState[] };
  // BUILD 1101 (0x24, Phase 4.3): the founding party (session-only
  // — the view's foundingRef). Its figures + stockpile + hut site
  // ride the same per-frame fx / figure paths as the founders'.
  foundingRef: { current: FoundingState | null };
  animalActorsRef: { current: AnimalActor[] };
  registryRef: { current: ResourceRegistry };
  constructionRef: { current: ConstructionState };
  // BUILD 1087: the storehouse state (its build site renders through
  // the same per-frame fx path as a hut site, below).
  storehouseRef: { current: StorehouseState };
  // BUILD 1094: the food chain (its build sites render through the
  // same per-frame fx path as a hut/storehouse site, below).
  foodChainRef: { current: FoodChainState };
  // BUILD 1095: the metal + timber chain (its build sites render
  // through the same per-frame fx path).
  metalChainRef: { current: MetalChainState };
  // BUILD 1096: the housing (its build site renders through the
  // same per-frame fx path as a hut site, below).
  housingRef: { current: HousingState };
  // BUILD 1102 (0x25, Phase 4.5): the pen (its sheep render through
  // the same per-frame fx path as the stockpile logs, below).
  penRef: { current: PenState };
  staminaPublishCountRef: { current: number };
  areaSelectionRef: { current: AreaSelection | null };
  buildRef: { current: { palette: PaletteKind | null; removeMode: boolean; moveMode: boolean; saveAreaMode: boolean; pasteName: string | null; customAssetId: string | null; areaSelectMode: boolean; areaMoveArmed: boolean; areaDuplicateArmed: boolean } };
  setPosition: (p: { x: number; y: number }) => void;
  setMessage: (m: string) => void;
  setStaminaUi: (s: StaminaState) => void;
  setSprintingUi: (b: boolean) => void;
  setSprintLatchedUi: (b: boolean) => void;
  setSprintRearmUi: (b: boolean) => void;
  setFirstPersonOn: (b: boolean) => void;
  walkableAt: (x: number, y: number) => boolean;
  replanPlayerPath: (exclude?: { x: number; y: number }) => 'ok' | 'throttled' | 'failed';
  followPlayerPath: (nowMs: number) => { dx: number; dy: number } | null;
  positionAreaSelectRect: (rect: { x0: number; y0: number; x1: number; y1: number }, label: string) => void;
  areaSelectionLabel: (sel: AreaSelection) => string;
}

export class WorldRenderer {
  // ---- GL objects (assigned in the constructor) ----
  private canvas!: HTMLCanvasElement;
  private gl!: WebGLRenderingContext;
  private vs!: WebGLShader;
  private fs!: WebGLShader;
  private program!: WebGLProgram;
  private worldBuffer!: WebGLBuffer;
  private actorBuffer!: WebGLBuffer;
  private customActorBuffer!: WebGLBuffer;
  private customActorCapacity = 0;
  private corpseBuffer!: WebGLBuffer;
  private skyObjBuffer!: WebGLBuffer;
  private fxBuffer!: WebGLBuffer;
  private carBuffer!: WebGLBuffer;
  private rainBuffer!: WebGLBuffer;
  private skyBuffer!: WebGLBuffer;
  private pLoc!: number;
  private cLoc!: number;
  private mLoc!: WebGLUniformLocation | null;
  private uNightLoc!: WebGLUniformLocation | null;
  private uWarmLoc!: WebGLUniformLocation | null;
  private deps!: WorldRendererDeps;
  // ---- camera ----
  yaw = .65;
  pitch = .7;
  zoom = 12;
  lookPitch = 0;
  drag = false;
  lx = 0;
  ly = 0;
  raf = 0;
  // ---- input ----
  pointers = new Map<number, { x: number; y: number }>();
  pinchDistance = 0;
  moveTarget: { x: number; y: number } | null = null;
  gestureMoved = false;
  gestureStartX = 0;
  gestureStartY = 0;
  keys = new Set<string>();
  // ---- render state ----
  worldVertCount = 0;
  lastFxStats = {houses:0,chimneys:0,litHouses:0,smokeVerts:0,totalVerts:0,windmills:0,millVerts:0,lanterns:0,lanternVerts:0,wheatTiles:0,wheatVerts:0,stockpileTiles:0,stockpileVerts:0,penSheep:0,penVerts:0,ceilingVerts:0,wallVerts:0,hearthGlow:0,hearthVerts:0,torchGlow:0,torchVerts:0};
  lastBuildX = 0;
  lastBuildY = 0;
  figureState = new Map<string, FigureState>();
  npcRender = new Map<string, NpcRenderState>();
  animalRender = new Map<string, AnimalRenderState>();
  slotByName = new Map<string, number>();
  figureSlotCounts: number[] = [];
  playerSlot = 0;
  transientSlotBase = 0;
  transientSlotCap = 0;
  animalSlotBase = 0;
  animalSlotCap = 0;
  foundingSlotBase = 0;
  foundingSlotCap = 0;
  founderSlotBase = 0;
  founderSlotCap = 0;
  figureSlots!: { offsets: number[]; totalVerts: number };
  figureScratch!: Float32Array;
  slotUploaded = new Map<number, FigurePoseKey>();
  actorSlotsAllocated = false;
  motionStats = {emitted:0,reused:0,drawn:0};
  areaCamKey = '';
  lastFrameTime = 0;
  lastPositionPublish = 0;
  lastPositionSave = 0;
  lastStaminaPublish = 0;
  lastStaminaInt = STAMINA_MAX;
  lastExhaustedPub = false;
  lastSprintingPub = false;
  lastLatchedPub = false;
  lastRearmPub = false;
  walkingNow = false;

  constructor(canvas: HTMLCanvasElement, onError: (m: string) => void) {
    this.canvas = canvas;
    const gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
    if(!gl){onError('WebGL is unavailable in this browser');throw new Error('WorldRenderer setup failed');}
    const vs=gl.createShader(gl.VERTEX_SHADER)!;gl.shaderSource(vs,'attribute vec3 p;attribute vec3 c;uniform mat4 m;varying vec3 v;void main(){gl_Position=m*vec4(p,1.0);v=c;}');gl.compileShader(vs);
    // BUILD 1011: uNight mixes every fragment toward 976's navy veil
    // (mix(v, navy, uNight) IS the 976 composite scene*(1-a)+navy*a).
    // One uniform, set per frame from the 3D clock — no rebuilds, no
    // blending, no veil quad. Sun/moon draw with uNight=0 (self-luminous).
    // BUILD 1052: uNight is now the DEEPER 3D factor (cap 0.82, not
    // 976's 0.55 — see atmosphere.ts; the 976 curve is untouched for
    // the 2.5D game), and uWarm warms every fragment toward golden
    // hour at dawn/dusk (v * (1.0,0.72,0.45), strength 0.45 * warm).
    // Both are set to 0 for the self-luminous segments, the uNight=0
    // precedent — lit windows, sun/moon/stars, and the sky gradient
    // (whose colours are already computed per-frame) keep true colours.
    const fs=gl.createShader(gl.FRAGMENT_SHADER)!;gl.shaderSource(fs,`precision mediump float;varying vec3 v;uniform float uNight;uniform float uWarm;void main(){vec3 w=mix(v,v*vec3(1.0,0.72,0.45),uWarm*0.45);gl_FragColor=vec4(mix(w,vec3(${NIGHT_NAVY[0].toFixed(3)},${NIGHT_NAVY[1].toFixed(3)},${NIGHT_NAVY[2].toFixed(3)}),uNight),1.0);}`);gl.compileShader(fs);
    if(!gl.getShaderParameter(vs,gl.COMPILE_STATUS)){onError('3D vertex shader failed: '+(gl.getShaderInfoLog(vs)||'unknown shader error'));throw new Error('WorldRenderer setup failed');}if(!gl.getShaderParameter(fs,gl.COMPILE_STATUS)){onError('3D fragment shader failed: '+(gl.getShaderInfoLog(fs)||'unknown shader error'));throw new Error('WorldRenderer setup failed');}const program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){onError(gl.getProgramInfoLog(program)||'3D renderer setup failed');throw new Error('WorldRenderer setup failed');}
    gl.useProgram(program);
    const worldBuffer=gl.createBuffer()!,actorBuffer=gl.createBuffer()!,customActorBuffer=gl.createBuffer()!,corpseBuffer=gl.createBuffer()!,skyObjBuffer=gl.createBuffer()!,fxBuffer=gl.createBuffer()!,carBuffer=gl.createBuffer()!;
    const pLoc=gl.getAttribLocation(program,'p'),cLoc=gl.getAttribLocation(program,'c'),mLoc=gl.getUniformLocation(program,'m'),uNightLoc=gl.getUniformLocation(program,'uNight'),uWarmLoc=gl.getUniformLocation(program,'uWarm');
    if(pLoc<0||cLoc<0||!mLoc||!uNightLoc||!uWarmLoc){onError('3D renderer missing required shader attributes');throw new Error('WorldRenderer setup failed');}
    gl.enableVertexAttribArray(pLoc);gl.enableVertexAttribArray(cLoc);
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(SKY_HORIZON[0],SKY_HORIZON[1],SKY_HORIZON[2],1);
    // BUILD 983 sky gradient: a static clip-space quad (horizon colour at
    // the bottom, clear blue at the top) drawn with depth off before the
    // world, so the world draws over it. Same vertex-colour program.
    // BUILD 1011: the sky-object buffer is allocated ONCE at SKY_MAX_VERTS
    // and re-uploaded per frame with bufferSubData (see the draw loop) —
    // a per-frame bufferData reallocation stalls the pipeline.
    gl.bindBuffer(gl.ARRAY_BUFFER,skyObjBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,SKY_MAX_VERTS*24,gl.DYNAMIC_DRAW);
    // BUILD 1014: the house-fx buffer (chimney smoke + window panes) is
    // allocated ONCE at FX_MAX_VERTS and re-uploaded per frame with
    // bufferSubData, the 1011 sky-buffer pattern — a per-frame
    // bufferData reallocation stalls the pipeline.
    gl.bindBuffer(gl.ARRAY_BUFFER,fxBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,FX_MAX_VERTS*24,gl.DYNAMIC_DRAW);
    // BUILD 1033: the car buffer, the same 1011/1014 pattern — allocated
    // ONCE at CAR_MAX_VERTS and re-uploaded per frame with bufferSubData
    // when a car exists. The car is dynamic (it moves every frame while
    // driving), so it must NOT go in the static world buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER,carBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,CAR_MAX_VERTS*24,gl.DYNAMIC_DRAW);
    // BUILD 1052: the rain buffer — allocated ONCE at RAIN_STREAKS *
    // RAIN_VERTS_PER_STREAK and re-uploaded per frame with bufferSubData
    // only while raining (the 1011 sky-buffer pattern). Rain has its own
    // buffer, not the fx buffer, so a rain frame can never overflow the
    // fx allocation.
    const RAIN_MAX_VERTS=RAIN_STREAKS*RAIN_VERTS_PER_STREAK;
    const rainBuffer=gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER,rainBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,RAIN_MAX_VERTS*24,gl.DYNAMIC_DRAW);
    const skyBuffer=gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
    // BUILD 1052: the gradient is DYNAMIC now, not static — the sky
    // colours are a function of the clock (night + dawn/dusk grading),
    // so the 6 verts are re-uploaded per frame with bufferSubData
    // (the 1011 pattern; 6 verts is nothing). Initial content is the
    // day gradient; the loop overwrites it before the first draw.
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
    -1,-1,1,...SKY_HORIZON, 1,-1,1,...SKY_HORIZON, 1,1,1,...SKY_TOP,
    -1,-1,1,...SKY_HORIZON, 1,1,1,...SKY_TOP, -1,1,1,...SKY_TOP,
    ]),gl.DYNAMIC_DRAW);
    
    this.gl = gl;
    this.vs = vs;
    this.fs = fs;
    this.program = program;
    this.worldBuffer = worldBuffer;
    this.actorBuffer = actorBuffer;
    this.customActorBuffer = customActorBuffer;
    this.corpseBuffer = corpseBuffer;
    this.skyObjBuffer = skyObjBuffer;
    this.fxBuffer = fxBuffer;
    this.carBuffer = carBuffer;
    this.rainBuffer = rainBuffer;
    this.skyBuffer = skyBuffer;
    this.pLoc = pLoc;
    this.cLoc = cLoc;
    this.mLoc = mLoc;
    this.uNightLoc = uNightLoc;
    this.uWarmLoc = uWarmLoc;
    // BUILD 998: per-figure GPU slots (see npcMotion.ts) — roster
    // order, player last, then fixed transient/animal/founder slots.
    ROSTER_3D.forEach((n,i)=>{this.slotByName.set(n.name,i);const scratch:number[]=[];emitVillager(scratch,0,0,0,0,villagerSpecFor(n.name),rosterArchetype(n.name)==='child');this.figureSlotCounts.push(scratch.length/6);});
    this.playerSlot=ROSTER_3D.length;
    {const scratch:number[]=[];emitVillager(scratch,0,0,0,0,PLAYER_SPEC,false);this.figureSlotCounts.push(scratch.length/6);}
    this.transientSlotBase=ROSTER_3D.length+1;
    this.transientSlotCap=maxVillagerVerts();
    for(let i=0;i<MAX_TRANSIENTS;i++)this.figureSlotCounts.push(this.transientSlotCap);
    this.animalSlotBase=this.transientSlotBase+MAX_TRANSIENTS;
    this.animalSlotCap=maxAnimalVerts();
    for(let i=0;i<MAX_ANIMALS;i++)this.figureSlotCounts.push(this.animalSlotCap);
    // BUILD 1101 (0x24, Phase 4.3): the founding party's slots sit
    // BEFORE the founder slots — the founder slots are preallocated
    // for the 3 founding names while the founders array grows to 7,
    // so founding slots after them would collide with the arrivals'
    // overflow writes. Founders 0–2 keep their slots; arrivals 3+
    // behave exactly as today.
    this.foundingSlotBase=this.animalSlotBase+MAX_ANIMALS;
    this.foundingSlotCap=maxVillagerVerts();
    for(let i=0;i<FOUNDING_PARTY_SIZE;i++)this.figureSlotCounts.push(this.foundingSlotCap);
    this.founderSlotBase=this.foundingSlotBase+FOUNDING_PARTY_SIZE;
    this.founderSlotCap=maxVillagerVerts();
    for(let i=0;i<FOUNDER_NAMES.length;i++)this.figureSlotCounts.push(this.founderSlotCap);
    this.figureSlots=figureSlotLayout(this.figureSlotCounts);
    this.figureScratch=new Float32Array(Math.max(...this.figureSlotCounts)*6);
    this.lastFrameTime = performance.now();
  }

  bind(deps: WorldRendererDeps): void {
    this.deps = deps;
    this.lastBuildX = deps.stateRef.current.position.x;
    this.lastBuildY = deps.stateRef.current.position.y;
  }

  applyZoom(d: number): void {
    const firstPersonRef = this.deps.firstPersonRef;
    const fpAutoRef = this.deps.fpAutoRef;
    const setFirstPersonOn = this.deps.setFirstPersonOn;

    const next=applyZoomDelta({zoom: this.zoom,firstPerson:firstPersonRef.current},d,fpAutoRef.current);
    if(next.firstPerson!==firstPersonRef.current){firstPersonRef.current=next.firstPerson;setFirstPersonOn(next.firstPerson);if(next.firstPerson)this.lookPitch=0;}
    this.zoom=next.zoom;

  }

  figurePose(key: string, x: number, z: number, now: number, dtMs: number, traveling: boolean, stepDist: number): { yaw: number; phase: number } {

    let s=this.figureState.get(key);
    if(!s){s={px:x,pz:z,yaw:Math.PI,phase:0,lastMove:0};this.figureState.set(key,s);}
    if(x!==s.px||z!==s.pz){s.yaw=Math.atan2(x-s.px,z-s.pz);s.lastMove=now;}
    s.px=x;s.pz=z;
    if(traveling){s.phase+=stepDist*PHASE_PER_UNIT;}
    else{s.phase=easePhaseToNeutral(s.phase,dtMs);}
    return {yaw:s.yaw,phase:s.phase};

  }

  upload(buffer: WebGLBuffer, data: Float32Array): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER,buffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,data,this.gl.DYNAMIC_DRAW);this.gl.vertexAttribPointer(this.pLoc,3,this.gl.FLOAT,false,24,0);this.gl.vertexAttribPointer(this.cLoc,3,this.gl.FLOAT,false,24,12)
  }

  pickGround(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.canvas;
    const stateRef = this.deps.stateRef;
    const firstPersonRef = this.deps.firstPersonRef;
    const yaw = this.yaw;
    const pitch = this.pitch;
    const zoom = this.zoom;
    const lookPitch = this.lookPitch;

    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    const nx=((clientX-rect.left)/rect.width)*2-1,ny=1-((clientY-rect.top)/rect.height)*2;
    const p=stateRef.current.position;
    const tx=p.x+.5,tz=p.y+.5;
    // BUILD 1034: the picker ray-marches against the heightfield, not
    // the flat y=0 plane — a tap on a hill must pick the hill's tile,
    // not the tile the flat plane would give. The eye sits on the
    // surface at the player, exactly like the camera.
    const effTerrainPick=effTerrainFor(stateRef.current.world);
    const pickBaseY=surfaceElevation(effTerrainPick,tx,tz);
    const ty=pickBaseY+.8;
    // BUILD 984: first person uses the eye-level camera, not the orbit
    // camera — the old code always used orbit math, so first-person
    // taps mis-picked (BUILD 983 delta #4). Branching here fixes both
    // first-person tap-to-move and placement taps.
    let eyeX:number,eyeZ:number,eyeY:number,forward:number[];
    if(firstPersonRef.current){
    eyeX=tx;eyeZ=tz;eyeY=pickBaseY+FIRST_PERSON_EYE;
    forward=[-Math.sin(yaw)*Math.cos(lookPitch),Math.sin(lookPitch),-Math.cos(yaw)*Math.cos(lookPitch)];
    } else {
    eyeX=tx+Math.sin(yaw)*zoom*Math.cos(pitch);eyeZ=tz+Math.cos(yaw)*zoom*Math.cos(pitch);eyeY=ty+zoom*Math.sin(pitch);
    forward=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
    }
    const right=[Math.cos(yaw),0,-Math.sin(yaw)];
    const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
    // BUILD 988: pick math uses the same FOV as the projection (was a
    // hardcoded tan(30 deg) for the old 60 deg FOV — changing the FOV
    // without this would mis-pick every tap, the 984 bug all over).
    const scale=Math.tan(WORLD_FOV_RAD/2),aspect=rect.width/rect.height;
    const dx=forward[0]+right[0]*nx*scale*aspect+up[0]*ny*scale;
    const dy=forward[1]+right[1]*nx*scale*aspect+up[1]*ny*scale;
    const dz=forward[2]+right[2]*nx*scale*aspect+up[2]*ny*scale;
    if(dy>=-0.001)return null;
    const hit=rayHitSurface(effTerrainPick,eyeX,eyeY,eyeZ,dx,dy,dz,2000);
    if(!hit)return null;
    const x=hit.x-.5,y=hit.z-.5;
    // BUILD 1024: no map-bounds refusal — the world is infinite
    // now, so a tap past the old edge picks the wild ground there.
    // Every consumer still validates its own domain: tap-to-move
    // is gated by walkableAt, placements refuse outside the map
    // (validatePlacement), and remove/move/save look up in-map
    // items only, so an out-of-map pick finds nothing to do.
    if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    return {x,y};

  }

  projectTileCenter(tx: number, ty: number): { cx: number; cy: number } | null {
    const canvas = this.canvas;
    const stateRef = this.deps.stateRef;
    const firstPersonRef = this.deps.firstPersonRef;
    const yaw = this.yaw;
    const pitch = this.pitch;
    const zoom = this.zoom;
    const lookPitch = this.lookPitch;

    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    const p=stateRef.current.position;const px=p.x+.5,pz=p.y+.5;
    // BUILD 1034: the inverse of pickGround on the same surface — the
    // eye sits on the heightfield at the player, and the tile's ground
    // height is the surface at its centre, so the ring and the pick
    // agree exactly.
    const effTerrainProj=effTerrainFor(stateRef.current.world);
    const projBaseY=surfaceElevation(effTerrainProj,px,pz);
    const py=projBaseY+.8;
    let eyeX:number,eyeZ:number,eyeY:number,forward:number[];
    if(firstPersonRef.current){eyeX=px;eyeZ=pz;eyeY=projBaseY+FIRST_PERSON_EYE;forward=[-Math.sin(yaw)*Math.cos(lookPitch),Math.sin(lookPitch),-Math.cos(yaw)*Math.cos(lookPitch)];}
    else{eyeX=px+Math.sin(yaw)*zoom*Math.cos(pitch);eyeZ=pz+Math.cos(yaw)*zoom*Math.cos(pitch);eyeY=py+zoom*Math.sin(pitch);forward=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];}
    const right=[Math.cos(yaw),0,-Math.sin(yaw)];
    const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
    const scale=Math.tan(WORLD_FOV_RAD/2),aspect=rect.width/rect.height;
    const vx=tx+.5-eyeX,vy=surfaceElevation(effTerrainProj,tx+.5,ty+.5)-eyeY,vz=ty+.5-eyeZ;
    const depth=vx*forward[0]+vy*forward[1]+vz*forward[2];if(depth<=0)return null;
    const nx=(vx*right[0]+vy*right[1]+vz*right[2])/(depth*scale*aspect);
    const ny=(vx*up[0]+vy*up[1]+vz*up[2])/(depth*scale);
    if(Math.abs(nx)>1||Math.abs(ny)>1)return null;
    return {cx:(nx+1)/2*rect.width,cy:(1-ny)/2*rect.height};

  }

  draw(): void {
    const stateRef = this.deps.stateRef;
    const clockRef = this.deps.clockRef;
    const torchLitRef = this.deps.torchLitRef;
    const waitingRef = this.deps.waitingRef;
    const insideHutRef = this.deps.insideHutRef;
    const playerPathRef = this.deps.playerPathRef;
    const playerPathWaitRef = this.deps.playerPathWaitRef;
    const playerPathStuckRef = this.deps.playerPathStuckRef;
    const slidePerpRef = this.deps.slidePerpRef;
    const sprintHeldRef = this.deps.sprintHeldRef;
    const sprintLatchRef = this.deps.sprintLatchRef;
    const sprintRearmRef = this.deps.sprintRearmRef;
    const staminaRef = this.deps.staminaRef;
    const sprintingRef = this.deps.sprintingRef;
    const drivingRef = this.deps.drivingRef;
    const carYawRef = this.deps.carYawRef;
    const carRef = this.deps.carRef;
    const prevPlayerRef = this.deps.prevPlayerRef;
    const needsWorldRebuild = this.deps.needsWorldRebuild;
    const rebuildUrgent = this.deps.rebuildUrgent;
    const worldBuilderRef = this.deps.worldBuilderRef;
    const buildFramesRef = this.deps.buildFramesRef;
    const buildMsRef = this.deps.buildMsRef;
    const rebuildStepStatsRef = this.deps.rebuildStepStatsRef;
    const rebuildCountRef = this.deps.rebuildCountRef;
    const diagRef = this.deps.diagRef;
    const onDiagnosticsRef = this.deps.onDiagnosticsRef;
    const customAssetsRef = this.deps.customAssetsRef;
    const skyDriftRef = this.deps.skyDriftRef;
    const firstPersonRef = this.deps.firstPersonRef;
    const fpAutoRef = this.deps.fpAutoRef;
    const npcActorsRef = this.deps.npcActorsRef;
    const transientActorsRef = this.deps.transientActorsRef;
    const foundersRef = this.deps.foundersRef;
    const foundingRef = this.deps.foundingRef;
    const animalActorsRef = this.deps.animalActorsRef;
    const registryRef = this.deps.registryRef;
    const constructionRef = this.deps.constructionRef;
    const storehouseRef = this.deps.storehouseRef;
    const foodChainRef = this.deps.foodChainRef;
    const metalChainRef = this.deps.metalChainRef;
    const housingRef = this.deps.housingRef;
    const penRef = this.deps.penRef;
    const staminaPublishCountRef = this.deps.staminaPublishCountRef;
    const areaSelectionRef = this.deps.areaSelectionRef;
    const buildRef = this.deps.buildRef;
    const setPosition = this.deps.setPosition;
    const setMessage = this.deps.setMessage;
    const setStaminaUi = this.deps.setStaminaUi;
    const setSprintingUi = this.deps.setSprintingUi;
    const setSprintLatchedUi = this.deps.setSprintLatchedUi;
    const setSprintRearmUi = this.deps.setSprintRearmUi;
    const setFirstPersonOn = this.deps.setFirstPersonOn;
    const walkableAt = this.deps.walkableAt;
    const replanPlayerPath = this.deps.replanPlayerPath;
    const followPlayerPath = this.deps.followPlayerPath;
    const positionAreaSelectRect = this.deps.positionAreaSelectRect;
    const areaSelectionLabel = this.deps.areaSelectionLabel;
    const world = this.deps.world;
    const SAVE_KEY = this.deps.saveKey;
    const isAreaSelectDragging = this.deps.isAreaSelectDragging;
    const isAreaMoveDragging = this.deps.isAreaMoveDragging;
    const canvas = this.canvas;
    const yaw = this.yaw;
    const pitch = this.pitch;
    const lookPitch = this.lookPitch;
    const keys = this.keys;
    const gl = this.gl;
    const program = this.program;
    const worldBuffer = this.worldBuffer;
    const actorBuffer = this.actorBuffer;
    const corpseBuffer = this.corpseBuffer;
    const skyObjBuffer = this.skyObjBuffer;
    const fxBuffer = this.fxBuffer;
    const carBuffer = this.carBuffer;
    const rainBuffer = this.rainBuffer;
    const skyBuffer = this.skyBuffer;
    const pLoc = this.pLoc;
    const cLoc = this.cLoc;
    const mLoc = this.mLoc;
    const uNightLoc = this.uNightLoc;
    const uWarmLoc = this.uWarmLoc;
    const figureState = this.figureState;
    const npcRender = this.npcRender;
    const animalRender = this.animalRender;
    const slotByName = this.slotByName;
    const figureSlotCounts = this.figureSlotCounts;
    const playerSlot = this.playerSlot;
    const transientSlotBase = this.transientSlotBase;
    const transientSlotCap = this.transientSlotCap;
    const animalSlotBase = this.animalSlotBase;
    const animalSlotCap = this.animalSlotCap;
    const foundingSlotBase = this.foundingSlotBase;
    const founderSlotBase = this.founderSlotBase;
    const founderSlotCap = this.founderSlotCap;
    const figureSlots = this.figureSlots;
    const figureScratch = this.figureScratch;
    const slotUploaded = this.slotUploaded;
    const now=performance.now(),rawDt=Math.max(0,(now-this.lastFrameTime)/1000);this.lastFrameTime=now;
    const dt=Math.min(.05,rawDt);
    // BUILD 998: NPC glide uses real frame time (capped at 0.25s),
    // NOT the 0.05s physics clamp above. The logical clock ticks in
    // real time (900ms); at low frame rates the clamped dt would
    // glide slower than the clock (0.89 tiles/s at 16fps), so render
    // would fall behind until the snap rule fired — a self-inflicted
    // tile jump. dtNpc keeps pace down to ~4fps; below that the snap
    // rule is the correct backstop.
    const dtNpc=Math.min(.25,rawDt);
    // Smooth, non-grid movement with collision checks along the path. A tap
    // gives a continuous world-space destination and walking stops on release
    // of the path target, like the 2.5D game's tap-to-move behaviour.
    const current=stateRef.current;
    let player=current.position;
    this.walkingNow=false;
    let moveDx=0,moveDy=0,hasInput=false;
    // BUILD 1030: keys / D-pad (which dispatches key events) take
    // over a tap journey — the user steers directly, the path is
    // dropped. Otherwise a tap journey follows its A* waypoints;
    // a direct push (interior taps) keeps the old behaviour.
    const heldKeys=[...keys].filter(k=>['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k));
    // BUILD 1056: frozen while waiting — no key or tap-journey input
    // moves the player; hasInput stays false, so stamina never drains
    // and no step is taken. The wait's own timer is the only thing
    // that advances anything.
    if(!waitingRef.current&&heldKeys.length>0){
    if(playerPathRef.current||this.moveTarget){playerPathRef.current=null;this.moveTarget=null;playerPathWaitRef.current=null;playerPathStuckRef.current=null;}
    const strafe=(heldKeys.includes('d')||heldKeys.includes('arrowright')?1:0)-(heldKeys.includes('a')||heldKeys.includes('arrowleft')?1:0);
    const forward=(heldKeys.includes('s')||heldKeys.includes('arrowdown')?1:0)-(heldKeys.includes('w')||heldKeys.includes('arrowup')?1:0);
    if(this.deps.firstPersonRef.current){
      // First-person controls are camera-relative: Up follows the
      // view direction, Down backs away, and Left/Right strafe.
      // yaw 0 faces north (-z), matching the camera's lookAt basis.
      const sin=Math.sin(this.yaw),cos=Math.cos(this.yaw);
      moveDx=strafe*cos-forward*sin;
      moveDy=-strafe*sin-forward*cos;
    }else{
      moveDx=strafe;
      moveDy=forward;
    }
    hasInput=true;
    }else if(!waitingRef.current&&this.moveTarget){
    // Entering a hut ends an outdoor tap journey (the waypoints
    // are outside; interior taps walk direct, see the tap handler).
    if(insideHutRef.current&&playerPathRef.current){playerPathRef.current=null;this.moveTarget=null;}
    else if(playerPathRef.current){
    const push=followPlayerPath(now);
    if(push){moveDx=push.dx;moveDy=push.dy;hasInput=true;}
    }else{
    moveDx=this.moveTarget.x-player.x;moveDy=this.moveTarget.y-player.y;
    if(Math.hypot(moveDx,moveDy)<.08){this.moveTarget=null;moveDx=0;moveDy=0;}
    else hasInput=true;
    }
    }
    // BUILD 1021: no movement input — a new journey starts fresh, so
    // a stale slide-around side never carries into the next push.
    if(!hasInput){slidePerpRef.current=null;playerPathStuckRef.current=null;}
    // BUILD 1003: sprint multiplies speed INSIDE this same pipeline —
    // same step, same walkableAt checks, same wall sliding. Hold =
    // Sprint control or Shift key; exhausted forces walk. BUILD 1018:
    // the button ALSO latches (tap-to-toggle) — sprintInput merges
    // hold, latch, and Shift into one sprint input. BUILD 1020: the
    // rearm gate — while rearmed (exhaustion hit and the same hold
    // never lifted) sprint input is ignored, so a sustained hold
    // cannot auto-resume at 25 and surge again; release + press
    // re-arms it (nextSprintRearm, updated after the stamina step).
    // BUILD 1021: the gate is a level — a press that starts while
    // already tired arms it too, and a release only disarms it after
    // recovery (nextSprintRearm takes the tired level as its 4th arg).
    const sprintRaw=sprintInput(sprintHeldRef.current,sprintLatchRef.current,keys.has('shift'));
    // BUILD 1033: no sprint while driving — the car is already 10x
    // walk, and stamina must not drain for driving (it regens).
    const sprintHeld=drivingRef.current?false:(sprintRearmRef.current?false:sprintRaw);
    const sprintingNow=sprintHeld&&!staminaRef.current.exhausted&&hasInput;
    // Position before this frame's step, so stamina can tell real
    // displacement from a zero-displacement slide (see below).
    const prevMoveX=player.x,prevMoveY=player.y;
    if(hasInput){
    // BUILD 1033: the car drives at CAR_SPEED (10x walk) through
    // the same step pipeline — same walkableAt checks, same wall
    // sliding, so it cannot drive through houses, walls, or water.
    const dist=Math.hypot(moveDx,moveDy),step=Math.min(dist,(drivingRef.current?CAR_SPEED:(sprintingNow?SPRINT_SPEED:WALK_SPEED))*dt);
    // BUILD 1018: step resolution lives in playerStep.ts (pure) —
    // same direct move + wall sliding, except a slide that leaves
    // the player exactly where they stand no longer counts as a
    // move, so a tap-to-move target pinned against a crate clears
    // with 'Path blocked' instead of retrying forever in place.
    // BUILD 1021: the step also takes the sticky slide-around side
    // (slidePerpRef) and reports which side it used, so a
    // tap-to-move slide-around keeps one side until the direct
    // path opens instead of ping-ponging.
    const res=resolvePlayerStep(player.x,player.y,moveDx,moveDy,dist,step,walkableAt,slidePerpRef.current);
    if(res.how==='perp')slidePerpRef.current=res.perp;
    else if(res.how==='direct')slidePerpRef.current=null;
    if(res.moved){player={x:res.x,y:res.y};current.position=player;this.walkingNow=true;}
    else if(res.blocked&&this.moveTarget){
    // BUILD 1030: a blocked step on a tap journey replans (the
    // way may have closed after planning) — only a failed replan
    // reports 'Path blocked'. A throttled replan is a wait, not
    // a dead end. Direct pushes (no path) keep the old immediate
    // message.
    if(playerPathRef.current){
    const ahead={x:Math.round(player.x+Math.sign(moveDx)),y:Math.round(player.y+Math.sign(moveDy))};
    const r=replanPlayerPath(ahead);
    if(r==='failed'){playerPathRef.current=null;this.moveTarget=null;setMessage('Path blocked');}
    }else{this.moveTarget=null;setMessage('Path blocked');}
    }
    // BUILD 1033: a driving car covers 0.5 tiles/frame, so the 0.08
    // walking arrive radius is jumped over forever — 0.5 at car scale.
    if(this.moveTarget&&Math.hypot(this.moveTarget.x-player.x,this.moveTarget.y-player.y)<(drivingRef.current?0.5:0.08))this.moveTarget=null;
    if(this.walkingNow&&now-this.lastPositionPublish>90){this.lastPositionPublish=now;setPosition(player);}
    if(this.walkingNow&&now-this.lastPositionSave>400){this.lastPositionSave=now;try{localStorage.setItem(SAVE_KEY,JSON.stringify(player));}catch{}}
    }
    // BUILD 1003: stamina ticks every frame, even idle (regen) — drain
    // only on ACTUAL displacement (stepStamina's rule). walkingNow
    // alone is not enough: a straight-line push against a wall or a
    // slower figure takes the no-op slide branch (same tile, flag
    // still true), which must NOT drain — the player took no benefit.
    // Caught by the 1004 probes: stamina drained steadily while the
    // player was stuck behind an eastbound traveler at ~1.1 u/s.
    // Session-only: staminaRef is never written to storage.
    const actuallyMoved=player.x!==prevMoveX||player.y!==prevMoveY;
    // BUILD 1033: while driving the car turns toward the direction of
    // travel (the figure turn rule, turnYawToward) and its position
    // IS the player position — the ref stays live for the mesh, the
    // exit, and the test hooks.
    if(drivingRef.current&&actuallyMoved){
    carYawRef.current=turnYawToward(carYawRef.current,Math.atan2(player.x-prevMoveX,player.y-prevMoveY),FIGURE_TURN_RATE*dt);
    carRef.current={x:player.x,y:player.y,yaw:carYawRef.current};
    }
    const wasExhausted=staminaRef.current.exhausted;
    const nextStamina=stepStamina(staminaRef.current,dt,sprintHeld,actuallyMoved);
    // BUILD 1018: the latch clears on exhaustion (the button shows
    // Tired; tap again to resume once recovered). BUILD 1026: the
    // 2s idle-clear is gone — it killed "tap sprint, then move", and
    // the 2.5D toggle persists until tapped again or exhaustion.
    if(sprintLatchRef.current&&nextStamina.exhausted&&!wasExhausted)sprintLatchRef.current=false;
    // BUILD 1020: rearm gate — exhaustion arms it, releasing all
    // sprint input clears it (nextSprintRearm). While armed, the
    // hold above is ignored, so the speed sawtooth stops here.
    // BUILD 1021: the gate takes the tired LEVEL (4th arg) — a press
    // that starts while already tired arms it too, and a release
    // only disarms it after recovery.
    sprintRearmRef.current=nextSprintRearm(sprintRearmRef.current,nextStamina.exhausted&&!wasExhausted,sprintRaw,nextStamina.exhausted);
    staminaRef.current=nextStamina;sprintingRef.current=sprintingNow&&actuallyMoved;
    const nextStaminaInt=Math.round(nextStamina.stamina);
    if((now-this.lastStaminaPublish>100&&nextStaminaInt!==this.lastStaminaInt)||nextStamina.exhausted!==this.lastExhaustedPub||sprintingRef.current!==this.lastSprintingPub||sprintLatchRef.current!==this.lastLatchedPub||sprintRearmRef.current!==this.lastRearmPub){this.lastStaminaPublish=now;this.lastStaminaInt=nextStaminaInt;this.lastExhaustedPub=nextStamina.exhausted;this.lastSprintingPub=sprintingRef.current;this.lastLatchedPub=sprintLatchRef.current;this.lastRearmPub=sprintRearmRef.current;setStaminaUi(nextStamina);setSprintingUi(sprintingRef.current);setSprintLatchedUi(sprintLatchRef.current);setSprintRearmUi(sprintRearmRef.current);staminaPublishCountRef.current++;}
    const dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;needsWorldRebuild.current=true}
    player=stateRef.current.position;
    // BUILD 983: the old code only rebuilt on resize/interactions, so
    // the 45×45 window went stale after walking ~20 tiles. Rebuild when
    // the player moves WORLD_REBUILD_DIST tiles from the last build
    // centre (BUILD 1026: 16, was 8 — halves the rebuild hitch rate).
    if(Math.hypot(player.x-this.lastBuildX,player.y-this.lastBuildY)>WORLD_REBUILD_DIST)needsWorldRebuild.current=true;
    // BUILD 1017: the diagnostic line no longer goes to the play-screen
    // message — it is reported to Options > Diagnostics instead.
    // BUILD 1035: time-sliced world rebuild (see createWorldBuilder).
    // The old code built the whole ~350ms buffer synchronously here,
    // so every chunk boundary froze the frame — at car speed (31.5
    // u/s) that was a hitch every ~0.5s. Now the build runs as a
    // generator stepped a few ms per frame while the player moves,
    // and runs to completion in one frame while stationary (so a
    // placement or an enter/exit still appears immediately, exactly
    // like the old path). The last build centre is the BUILDER's
    // centre (where the buffer was actually built around), not the
    // player's position at upload time — the player has moved on.
    // Abort: if the player entered/exited a house or the custom
    // assets changed since this builder started, its captured
    // enteredHut/customAssets are stale — drop it and start fresh
    // (the next frame rebuilds with the current state). World edits
    // (placements) need no abort: they set needsWorldRebuild, so a
    // fresh builder follows this one immediately.
    const prevP=prevPlayerRef.current;
    const playerMoved=prevP!==null&&(player.x!==prevP.x||player.y!==prevP.y);
    prevPlayerRef.current={x:player.x,y:player.y};
    if(needsWorldRebuild.current){
    const b0=worldBuilderRef.current;
    if(b0&&(b0.enteredHut!==insideHutRef.current||b0.customAssets!==customAssetsRef.current))worldBuilderRef.current=null;
    if(!worldBuilderRef.current){worldBuilderRef.current=createWorldBuilder(world,player,insideHutRef.current,customAssetsRef.current);buildFramesRef.current=0;buildMsRef.current=0;}
    // BUILD 1080 (0x0B): the budget is no longer "Infinity while
    // stationary". A chop/mine/collect while standing still used to
    // run the whole ~200-400ms rebuild in ONE frame (the 367-417ms
    // chop-rebuild hitch) — the stationary Infinity was only ever
    // needed for enter/exit, where the shell-hide interior must
    // appear in the same frame. Now only an urgent rebuild (enter/
    // exit, flagged by buildingInteractions3d) runs to completion;
    // everything else gets the 10ms step budget, moving or not, so a
    // chop finishes over ~15 frames with no frame over ~20ms. The
    // buffer is bit-identical either way (worldRender3d).
    const budget=rebuildUrgent.current?Infinity:REBUILD_STEP_BUDGET_MS;
    const t0=performance.now();
    const done=worldBuilderRef.current.step(budget);
    const stepMs=performance.now()-t0;
    buildFramesRef.current++;buildMsRef.current+=stepMs;
    const st=rebuildStepStatsRef.current;
    st.totalStepMs+=stepMs;if(stepMs>st.maxStepMs)st.maxStepMs=stepMs;
    if(playerMoved&&stepMs>st.maxStepMsMoving)st.maxStepMsMoving=stepMs;
    if(done){
    const b=worldBuilderRef.current;worldBuilderRef.current=null;
    const built=b.result();
    if(built.length===0){const snap:Diagnostics3D={verts:0,mapW:world.w,mapH:world.h,x:Math.round(player.x),y:Math.round(player.y)};diagRef.current=snap;onDiagnosticsRef.current?.(snap);}
    else{this.upload(worldBuffer,built);this.worldVertCount=built.length/6;const snap:Diagnostics3D={verts:this.worldVertCount,mapW:world.w,mapH:world.h,x:Math.round(player.x),y:Math.round(player.y)};diagRef.current=snap;onDiagnosticsRef.current?.(snap);}
    needsWorldRebuild.current=false;rebuildUrgent.current=false;this.lastBuildX=b.center.x;this.lastBuildY=b.center.y;rebuildCountRef.current++;
    st.count=rebuildCountRef.current;st.lastBuildFrames=buildFramesRef.current;st.lastBuildMs=buildMsRef.current;
    }
    }
    // BUILD 1052: night factor + sky gradient for this frame — the
    // DEEPER 3D factor (cap 0.82, atmosphere.ts; 976's 0.55 curve is
    // untouched for the 2.5D game) and the clock-graded sky colours.
    // The clear colour follows the horizon, so any pixel the
    // gradient quad does not cover still matches the sky.
    const nightFactor=nightFactor3dForMinutes(clockRef.current.minutes);
    const skyGrad=skyGradientForMinutes(clockRef.current.minutes);
    skyDriftRef.current+=dt;
    gl.clearColor(skyGrad.horizon[0],skyGrad.horizon[1],skyGrad.horizon[2],1);
    gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(uNightLoc,nightFactor);gl.uniform1f(uWarmLoc,skyGrad.warm);
    // Sky gradient pass (identity matrix, depth off), then the world.
    // The gradient's colours are already the final sky colours, so
    // it draws with uNight=0 AND uWarm=0 (the self-luminous
    // precedent) — the shader must not veil or warm them twice.
    gl.disable(gl.DEPTH_TEST);
    gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array([
    -1,-1,1,...skyGrad.horizon, 1,-1,1,...skyGrad.horizon, 1,1,1,...skyGrad.top,
    -1,-1,1,...skyGrad.horizon, 1,1,1,...skyGrad.top, -1,1,1,...skyGrad.top,
    ]));
    gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
    gl.uniformMatrix4fv(mLoc,false,IDENTITY_MAT);
    gl.uniform1f(uNightLoc,0);gl.uniform1f(uWarmLoc,0);
    gl.drawArrays(gl.TRIANGLES,0,6);
    gl.uniform1f(uNightLoc,nightFactor);gl.uniform1f(uWarmLoc,skyGrad.warm);
    gl.enable(gl.DEPTH_TEST);
    // Orbit around the player's tile center, not its top-left grid corner.
    // Keeping the camera target and orbit origin aligned prevents the player
    // sprite drifting sideways while the camera rotates; pitch now controls
    // the actual orbit elevation as well.
    // BUILD 1034: the camera rides the heightfield — the orbit target
    // and the first-person eye sit on the shared surface at the player,
    // so the camera never sinks into a hill or floats over a hollow.
    // effTerrainDraw is this frame's effective terrain (the placement
    // Sets are built once per frame); playerBaseY is the ground under
    // the player, reused by the player figure and the car below.
    const effTerrainDraw=effTerrainFor(world);
    const playerBaseY=surfaceElevation(effTerrainDraw,player.x+.5,player.y+.5);
    const targetX=player.x+.5,targetZ=player.y+.5,targetY=playerBaseY+.8;
    const horizontal=this.zoom*Math.cos(pitch);
    const ex=targetX+Math.sin(yaw)*horizontal,ez=targetZ+Math.cos(yaw)*horizontal,ey=targetY+this.zoom*Math.sin(pitch);
    // BUILD 983 first-person camera: eye-level camera at the player,
    // looking along yaw with a slight up/down look pitch (yaw 0 faces
    // north). BUILD 1002: far plane VIEW_FAR_PLANE (300, was 200):
    // at minimum orbit pitch the horizon ray runs past 200, leaving
    // a sky strip under the horizon line; 300 keeps ground inside
    // the frustum out to the horizon at every zoom and pitch.
    // BUILD 1005: 300 is KEPT by measurement for the 240 view —
    // max camera-to-ground-point is 272 (240 + 32 orbit radius at
    // min pitch 0.22), 280 with 8-tile rebuild staleness, and apron
    // coverage reaches 340 - 32 = 308, so 300 sits inside [280, 308]
    // with margin both sides; raising it would only coarsen depth
    // precision at 240 tiles.
    // BUILD 1007: far plane is 700. Two coverings, both measured:
    // (1) worst camera-to-farthest-real-object is 282 (map diagonal)
    // + 64 (max orbit radius, BUILD 1023 — was 32) = 346, far under
    // 700; (2) the clip edge must sit past the fog-full distance,
    // or hazed-green ground would end visibly against sky: worst
    // clip-edge distance from the build centre is 700 - 64 - 8 =
    // 628, past FOG_FAR 600, so the clipped edge is always uniform
    // horizon colour. Apron coverage 1000 - 64 = 936 > 700, so the
    // apron always extends past the far plane. Depth precision at a
    // given distance depends on the near plane (0.1) and the
    // distance, not the far plane, so 700 costs nothing versus 300
    // at 282 tiles.
    // BUILD 992: eye at FIRST_PERSON_EYE (0.90x character),
    // level gaze by default (lookPitch starts 0).
    // BUILD 992: turning first-person-auto OFF while in first person
    // drops back to orbit at the minimum distance (the zoom handlers
    // alone cannot see the toggle flip).
    if(firstPersonRef.current&&!fpAutoRef.current){firstPersonRef.current=false;setFirstPersonOn(false);this.zoom=ZOOM_MIN;}
    const mat=firstPersonRef.current
    ? mul(perspective(WORLD_FOV_RAD,w/h,.1,VIEW_FAR_PLANE),lookAt([targetX,playerBaseY+FIRST_PERSON_EYE,targetZ],[targetX-Math.sin(yaw)*Math.cos(lookPitch)*10,playerBaseY+FIRST_PERSON_EYE+Math.sin(lookPitch)*10,targetZ-Math.cos(yaw)*Math.cos(lookPitch)*10]))
    : mul(perspective(WORLD_FOV_RAD,w/h,.1,VIEW_FAR_PLANE),lookAt([ex,ey,ez],[targetX,targetY,targetZ]));
    gl.uniformMatrix4fv(mLoc,false,new Float32Array(mat));
    gl.bindBuffer(gl.ARRAY_BUFFER,worldBuffer);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
    // BUILD 988: no per-frame getError() here — it is a known
    // pipeline-stall pitfall (it can force a sync every frame) and it
    // bought nothing: setup failures are still caught by the shader
    // compile + program link checks above, and the diagnostic still
    // reports the vertex count every rebuild.
    gl.drawArrays(gl.TRIANGLES,0,this.worldVertCount);
    // BUILD 1011: sun, moon, drifting clouds — a small per-frame buffer
    // (a few hundred verts; the world buffer rebuilds only on >8-tile
    // moves and cannot carry moving sky objects). Camera-centred on the
    // player so walking never leaves them behind; depth-tested, so the
    // ground occludes them below the horizon. Clouds draw with the
    // night factor, sun/moon/stars with uNight=0 AND uWarm=0
    // (self-luminous). Suppressed entirely while inside a house (990:
    // emitSkyObjects returns empty when insideHut is set).
    const skyEye:Vec3=firstPersonRef.current?[targetX,playerBaseY+FIRST_PERSON_EYE,targetZ]:[ex,ey,ez];
    const skyArr:number[]=[];
    const skyCounts=emitSkyObjects(skyArr,skyEye,player.x+.5,player.y+.5,clockRef.current.minutes,skyDriftRef.current,!!insideHutRef.current);
    if(skyCounts.totalVerts>0){
    gl.bindBuffer(gl.ARRAY_BUFFER,skyObjBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(skyArr));gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
    if(skyCounts.cloudVerts>0)gl.drawArrays(gl.TRIANGLES,0,skyCounts.cloudVerts);
    if(skyCounts.totalVerts>skyCounts.cloudVerts){gl.uniform1f(uNightLoc,0);gl.uniform1f(uWarmLoc,0);gl.drawArrays(gl.TRIANGLES,skyCounts.cloudVerts,skyCounts.totalVerts-skyCounts.cloudVerts);gl.uniform1f(uNightLoc,nightFactor);gl.uniform1f(uWarmLoc,skyGrad.warm);}
    }
    // BUILD 1014: chimney smoke + window panes — a small per-frame
    // buffer (a few thousand verts; the world buffer rebuilds only
    // on >8-tile moves and cannot carry moving smoke or time-varying
    // lights). Lit state is a pure function of (house seed, clock
    // minutes), so no rebuild fires when a light flips. Smoke + dark
    // panes draw with the night factor; lit panes draw with uNight=0
    // (self-luminous, the sun/moon precedent — a lit window emits
    // light). The entered hut's shell is skipped whole (its chimney
    // and panes are hidden with it).
    const fxArr:number[]=[];
    // BUILD 1040: lanterns ride the same fx call (their glow is
    // per-frame, on the house-light schedule) — the tiles come from
    // placedLanternTiles with the heightfield base y, so the glow
    // box lands exactly on the static glass box.
    const lanternInputs=placedLanternTiles(world).map(t=>({tx:t.tx,ty:t.ty,baseY:surfaceElevation(effTerrainDraw,t.tx+.5,t.ty+.5)}));
    // BUILD 1041: wheat rides the same fx call — the stalks are
    // time-varying (they appear and grow as the clock advances), so
    // they emit per frame like the blades. The stage is a pure
    // function of (plantedAt, clock), so a harvest or a reload
    // changes the field with no world rebuild.
    const nowAbs=absMinutes(clockRef.current.day,clockRef.current.minutes);
    const wheatInputs=placedFarmTiles(world).map(t=>({tx:t.tx,ty:t.ty,baseY:surfaceElevation(effTerrainDraw,t.tx+.5,t.ty+.5),stage:farmStageAt(t.plantedAt,nowAbs,growthFactorAt(world,clockRef.current.day,t.tx,t.ty),t.wateredAt) as FarmStage}));
    // BUILD 1057: the founders' log pile rides the same fx call as
    // the wheat — the pile is per-frame fx (it grows with
    // deliveries), so it needs no world rebuild. The input is the
    // pile tile + the real stockpile count; 0 wood still shows 1
    // log (the camp has a pile).
    const stockpileInputs=FOUNDERS_ENABLED?[{tx:FOUNDER_STOCKPILE_TILE.x,ty:FOUNDER_STOCKPILE_TILE.y,baseY:surfaceElevation(effTerrainDraw,FOUNDER_STOCKPILE_TILE.x+.5,FOUNDER_STOCKPILE_TILE.y+.5),wood:campWoodInRegistry(registryRef.current)}]:[];
    // BUILD 1102 (0x25, Phase 4.5): the pen's sheep ride the same fx
    // call as the stockpile logs — one white blob per sheep in the
    // flock (penSheepPositions, capped at 6), on the flat pen rect.
    // A pen still building, or an empty flock, emits nothing.
    const penInputs: PenFxInput[] = FOUNDERS_ENABLED && penRef.current.site.state === 'done' && penRef.current.flock >= 1 ? [{ positions: penSheepPositions(penRef.current), baseY: surfaceElevation(effTerrainDraw, PEN_CENTRE.x + 0.5, PEN_CENTRE.y + 0.5) }] : [];
    // BUILD 1101 (0x24, Phase 4.3): the founding camp's log pile rides
    // the same fx call as the founders' pile (it grows with deliveries).
    if(FOUNDERS_ENABLED&&foundingRef.current){const fnd=foundingRef.current;const fSite=fnd.site;if(fSite)stockpileInputs.push({tx:fSite.stockpile.x,ty:fSite.stockpile.y,baseY:surfaceElevation(effTerrainDraw,fSite.stockpile.x+.5,fSite.stockpile.y+.5),wood:fnd.pile.wood});}
    // BUILD 1058: the first hut's build site rides the same fx call
    // as the pile — per-frame fx (foundation + frame grow with the
    // real construction progress), so it needs no world rebuild.
    // At progress 6 the real hut placement renders instead.
    // BUILD 1087: the storehouse's build site rides the same fx call
    // as the huts — per-frame fx (foundation + frame grow with the
    // real storehouse progress), so it needs no world rebuild. At
    // progress 6 the real storehouse placement renders instead.
    // BUILD 1094: the mill + the bakery ride the same fx call — at
    // progress 6 the real mill/bakery placement renders instead.
    const siteInputs=FOUNDERS_ENABLED?[...sitesOf(constructionRef.current).flatMap((s,i)=>{const site=HUT_SITES[i];return s.state==='building'&&site?[{baseY:surfaceElevation(effTerrainDraw,site.centre.x+.5,site.centre.y+.5),progress:s.progress,site}]:[];}),...(storehouseRef.current.state==='building'?[{baseY:surfaceElevation(effTerrainDraw,STOREHOUSE_HUT_SITE.centre.x+.5,STOREHOUSE_HUT_SITE.centre.y+.5),progress:storehouseRef.current.progress,site:STOREHOUSE_HUT_SITE}]:[]),...(foodChainRef.current.mill.state==='building'?[{baseY:surfaceElevation(effTerrainDraw,MILL_HUT_SITE.centre.x+.5,MILL_HUT_SITE.centre.y+.5),progress:foodChainRef.current.mill.progress,site:MILL_HUT_SITE}]:[]),...(foodChainRef.current.bakery.state==='building'?[{baseY:surfaceElevation(effTerrainDraw,BAKERY_HUT_SITE.centre.x+.5,BAKERY_HUT_SITE.centre.y+.5),progress:foodChainRef.current.bakery.progress,site:BAKERY_HUT_SITE}]:[]),...(metalChainRef.current.smelter.state==='building'?[{baseY:surfaceElevation(effTerrainDraw,SMELTER_HUT_SITE.centre.x+.5,SMELTER_HUT_SITE.centre.y+.5),progress:metalChainRef.current.smelter.progress,site:SMELTER_HUT_SITE}]:[]),...(metalChainRef.current.blacksmith.state==='building'?[{baseY:surfaceElevation(effTerrainDraw,BLACKSMITH_HUT_SITE.centre.x+.5,BLACKSMITH_HUT_SITE.centre.y+.5),progress:metalChainRef.current.blacksmith.progress,site:BLACKSMITH_HUT_SITE}]:[]),...(metalChainRef.current.sawmill.state==='building'?[{baseY:surfaceElevation(effTerrainDraw,SAWMILL_HUT_SITE.centre.x+.5,SAWMILL_HUT_SITE.centre.y+.5),progress:metalChainRef.current.sawmill.progress,site:SAWMILL_HUT_SITE}]:[]),...(metalChainRef.current.carpenter.state==='building'?[{baseY:surfaceElevation(effTerrainDraw,CARPENTER_HUT_SITE.centre.x+.5,CARPENTER_HUT_SITE.centre.y+.5),progress:metalChainRef.current.carpenter.progress,site:CARPENTER_HUT_SITE}]:[]),...(metalChainRef.current.workshop.state==='building'?[{baseY:surfaceElevation(effTerrainDraw,WORKSHOP_HUT_SITE.centre.x+.5,WORKSHOP_HUT_SITE.centre.y+.5),progress:metalChainRef.current.workshop.progress,site:WORKSHOP_HUT_SITE}]:[]),...(housingRef.current.inn.state==='building'?[{baseY:surfaceElevation(effTerrainDraw,INN_HUT_SITE.centre.x+.5,INN_HUT_SITE.centre.y+.5),progress:housingRef.current.inn.progress,site:INN_HUT_SITE}]:[])]:[];
    // BUILD 1050: the entered hut's interior shell + hearth — the
    // ceiling and wall band render only in first-person inside (the
    // orbit view keeps its cutaway so the room stays visible from
    // above); the hearth glow renders whenever inside and the house
    // is lit at night on its schedule (houseLitAt + the hut's seed
    // schedule, the same times its windows light up).
    const insideNow=insideHutRef.current;
    let interiorFx: InteriorFxInput | null = null;
    if (insideNow) {
    const seedHutIn=seedRectForHut(world, insideNow);
    const hyIn=surfaceElevation(effTerrainDraw,(insideNow.x0+insideNow.x1+1)/2,(insideNow.y0+insideNow.y1+1)/2);
    // BUILD 1097: a production interior's glow is its own fire
    // (furnace / forge / oven) — the hut hearth lookup would return
    // the seeded hut furniture's hearth at the wrong tile. The
    // ceiling + wall band are rect-generic and work unchanged.
    const prodKindIn=productionKindForRect(insideNow);
    interiorFx={
    ceiling: firstPersonRef.current ? interiorCeilingFor(insideNow, hyIn) : null,
    walls: firstPersonRef.current ? interiorWallBandFor(insideNow, hyIn) : [],
    hearth: prodKindIn ? productionFireFor(prodKindIn, insideNow, hyIn) : interiorHearthFor(insideNow, seedHutIn, hyIn),
    hearthLit: houseLitAt(clockRef.current.minutes, lightScheduleFor(seedHutIn.x0, seedHutIn.y0)),
    };
    }
    // BUILD 1101 (0x24, Phase 4.3): the founding hut's build site rides
    // the same fx call as the founders' huts — at progress 6 the real
    // hut placement renders instead.
    if(FOUNDERS_ENABLED&&foundingRef.current&&foundingRef.current.hut.state==='building'){const fnd=foundingRef.current;const fSite=fnd.site;if(fSite)siteInputs.push({baseY:surfaceElevation(effTerrainDraw,fSite.hut.centre.x+.5,fSite.hut.centre.y+.5),progress:fnd.hut.progress,site:fSite.hut});}
    // BUILD 1110 (0x2D): the equipped torch's glow input — the
    // player's tile + heightfield base y (the fx module never
    // samples the terrain itself, the lantern precedent).
    const torchInput = torchLitRef.current ? { x: Math.floor(player.x), y: Math.floor(player.y), baseY: surfaceElevation(effTerrainDraw, player.x + .5, player.y + .5) } : null;
    const fxCounts=emitHouseFx(fxArr,houseFxInputsFor(world,insideHutRef.current),clockRef.current.minutes,skyDriftRef.current,lanternInputs,wheatInputs,interiorFx,stockpileInputs,siteInputs,penInputs,torchInput);
    this.lastFxStats={houses:fxCounts.houses,chimneys:fxCounts.chimneys,litHouses:fxCounts.litHouses,smokeVerts:fxCounts.smokeVerts,totalVerts:fxCounts.totalVerts,windmills:fxCounts.windmills,millVerts:fxCounts.millVerts,lanterns:fxCounts.lanterns,lanternVerts:fxCounts.lanternVerts,wheatTiles:fxCounts.wheatTiles,wheatVerts:fxCounts.wheatVerts,stockpileTiles:fxCounts.stockpileTiles,stockpileVerts:fxCounts.stockpileVerts,penSheep:fxCounts.penSheep,penVerts:fxCounts.penVerts,ceilingVerts:fxCounts.ceilingVerts,wallVerts:fxCounts.wallVerts,hearthGlow:fxCounts.hearthGlow,hearthVerts:fxCounts.hearthVerts,torchGlow:fxCounts.torchGlow,torchVerts:fxCounts.torchVerts};
    if(fxCounts.totalVerts>0){
    gl.bindBuffer(gl.ARRAY_BUFFER,fxBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(fxArr));gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
    if(fxCounts.nightVerts>0)gl.drawArrays(gl.TRIANGLES,0,fxCounts.nightVerts);
    if(fxCounts.totalVerts>fxCounts.nightVerts){gl.uniform1f(uNightLoc,0);gl.uniform1f(uWarmLoc,0);gl.drawArrays(gl.TRIANGLES,fxCounts.nightVerts,fxCounts.totalVerts-fxCounts.nightVerts);gl.uniform1f(uNightLoc,nightFactor);gl.uniform1f(uWarmLoc,skyGrad.warm);}
    }
    // BUILD 1052: rain (stretch) — drawn with the night factor, only
    // while raining (deterministic afternoons, atmosphere.ts). Then
    // the figure cap: actors, the car, and corpses draw with uNight
    // capped at the old 0.55 so people stay readable at night while
    // the world itself goes dark (the 976 rationale, per segment).
    if(rainForMinutes(clockRef.current.day,clockRef.current.minutes)){
    const rainArr:number[]=[];
    // BUILD 1084 (1.5): rain is a real amount — the streak count
    // scales with the season's rainfall at the player's tile
    // (autumn full strength, summer about half), capped at the
    // buffer's 120 streaks by rainIntensityFor.
    const rainStreaks=Math.max(1,Math.round(RAIN_STREAKS*rainIntensityFor(seasonForDay(clockRef.current.day),player.x,player.y,playerBaseY)));
    const rainVerts=emitRainStreaks(rainArr,player.x+.5,player.y+.5,playerBaseY,skyDriftRef.current,rainStreaks);
    if(rainVerts>0){
    gl.bindBuffer(gl.ARRAY_BUFFER,rainBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(rainArr));gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
    gl.drawArrays(gl.TRIANGLES,0,rainVerts);
    }
    }
    gl.uniform1f(uNightLoc,Math.min(nightFactor,FIGURE_NIGHT_CAP));
    // BUILD 998: interpolated NPC motion + per-figure GPU slots (see
    // npcMotion.ts). Logical tiles come from the 900ms timer; figures
    // glide toward them at the demo speed, phase follows distance
    // actually traveled, yaw turns smoothly, and only slots whose
    // pose changed re-emit + re-upload (bufferSubData). Idle figures
    // cost zero emission and zero upload per frame. Corpses keep a
    // small separate buffer (few verts, full upload is negligible).
    // BUILD 1007: NO figure cull — residents, transients, and corpses
    // draw at whole-world range (were 22-tile culled, so the town
    // looked empty of people from any far viewpoint). Figures are
    // deliberately NOT fogged: at range they are a few pixels, and
    // vivid figures stay visible while hazed ground would swallow
    // them — visibility wins for "see everything". Figures still
    // depth-test against houses like any other geometry, in both
    // cameras.
    if(!this.actorSlotsAllocated){gl.bindBuffer(gl.ARRAY_BUFFER,actorBuffer);gl.bufferData(gl.ARRAY_BUFFER,figureSlots.totalVerts*24,gl.DYNAMIC_DRAW);this.actorSlotsAllocated=true;}
    gl.bindBuffer(gl.ARRAY_BUFFER,actorBuffer);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
    let emitted=0,reused=0,drawn=0;
    const emitFigureSlot=(slot:number,cx:number,cz:number,yaw:number,phase:number,spec:VillagerSpec,child:boolean,rx:number,rz:number,pre?:number[],baseY=0)=>{
    const key:FigurePoseKey={x:rx,z:rz,yaw,phase};
    if(!poseKeyEquals(slotUploaded.get(slot)??null,key)){
    const tmp:number[]=pre??[];
    // BUILD 1034: baseY lifts the figure onto the heightfield.
    // The pose key need not carry it — a standing figure's tile
    // (and so its base y) never changes while the key is stable,
    // and a moving figure re-emits every frame anyway.
    if(!pre)emitVillager(tmp,cx,cz,yaw,phase,spec,child,baseY);
    const count=pre?pre.length/6:figureSlotCounts[slot];
    figureScratch.set(tmp);
    gl.bufferSubData(gl.ARRAY_BUFFER,figureSlots.offsets[slot]*24,figureScratch.subarray(0,count*6));
    slotUploaded.set(slot,key);
    emitted++;
    } else reused++;
    // BUILD 1000: transient slots draw the occupant's actual count
    // (pre array), not the slot capacity — stale verts past the
    // occupant's count are never drawn.
    const drawCount=pre?pre.length/6:figureSlotCounts[slot];
    gl.drawArrays(gl.TRIANGLES,figureSlots.offsets[slot],drawCount);
    drawn++;
    };
    const nowMs=performance.now();
    // Uploaded medieval FBX people become real actor meshes once they are in
    // the shared asset library. Prefer the better-export variants; keep the
    // royalty models out of the ordinary resident pool. Until a pack is
    // imported, the established procedural figures remain the fallback.
    const fbxPeople=customAssetsRef.current.filter(a=>a.format==='fbx'&&/people_unity|unral_better_export/i.test(a.sourceFile||''));
    const preferredPeople=fbxPeople.filter(a=>/unral_better_export/i.test(a.sourceFile||''));
    const peoplePool=(preferredPeople.length?preferredPeople:fbxPeople).filter(a=>!/king|queen/i.test((a.sourceFile||'')+' '+a.name));
    const playerPeople=peoplePool.find(a=>/peasant_1/i.test((a.sourceFile||'')+' '+a.name))||peoplePool[0];
    const personForNpc=(name:string)=>peoplePool.length?peoplePool[(Array.from(name).reduce((n,c)=>((n*33+c.charCodeAt(0))>>>0),5381))%peoplePool.length]:undefined;
    for(const npc of npcActorsRef.current){
    if(npc.looted||!npc.alive)continue;
    const slot=slotByName.get(npc.name);if(slot===undefined)continue;
    const target={x:npc.x,y:npc.y};
    let st=npcRender.get(npc.name);
    if(!st){st={x:target.x,y:target.y,yaw:Math.PI,phase:0};npcRender.set(npc.name,st);}
    else if(needsRenderSnap({x:st.x,y:st.y},target)){st.x=target.x;st.y=target.y;}
    const step=advanceRenderPos({x:st.x,y:st.y},target,dtNpc);
    const moved=step.dist>0;
    let yaw=st.yaw;
    if(moved){yaw=turnYawToward(st.yaw,Math.atan2(step.pos.x-st.x,step.pos.y-st.y),FIGURE_TURN_RATE*dtNpc);}
    const phase=moved?phaseForDistance(st.phase,step.dist):easePhaseToNeutral(st.phase,dtNpc*1000);
    st.x=step.pos.x;st.y=step.pos.y;st.yaw=yaw;st.phase=phase;
    if(!personForNpc(npc.name))emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(npc.name),rosterArchetype(npc.name)==='child',st.x,st.y,undefined,surfaceElevation(effTerrainDraw,st.x+.5,st.y+.5));
    }
    // BUILD 1000: transient figures (travelers + adventurers) ride
    // the same glide/yaw/phase/slot machinery as residents: logical
    // tiles come from the 900ms transient timer, render positions
    // glide toward them at the demo speed, and only dirty slots
    // re-emit. Transients are adults (no child scale) and never use
    // the player spec. Slots are fixed per figure (base + slotId);
    // despawn frees the slot (the timer deletes the render + slot
    // state), so a later occupant re-emits instead of inheriting
    // stale verts.
    for(const t of transientActorsRef.current){
    const slot=transientSlotBase+t.slotId;
    const target={x:t.x,y:t.y};
    let st=npcRender.get(t.id);
    if(!st){st={x:target.x,y:target.y,yaw:Math.PI,phase:0};npcRender.set(t.id,st);}
    else if(needsRenderSnap({x:st.x,y:st.y},target)){st.x=target.x;st.y=target.y;}
    const step=advanceRenderPos({x:st.x,y:st.y},target,dtNpc);
    const moved=step.dist>0;
    let yaw=st.yaw;
    if(moved){yaw=turnYawToward(st.yaw,Math.atan2(step.pos.x-st.x,step.pos.y-st.y),FIGURE_TURN_RATE*dtNpc);}
    const phase=moved?phaseForDistance(st.phase,step.dist):easePhaseToNeutral(st.phase,dtNpc*1000);
    st.x=step.pos.x;st.y=step.pos.y;st.yaw=yaw;st.phase=phase;
    const pre:number[]=[];
    // BUILD 1034: transients stand on the heightfield (the pre
    // array is emitted here, so the base y goes into emitVillager).
    const tBaseY=surfaceElevation(effTerrainDraw,st.x+.5,st.y+.5);
    emitVillager(pre,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(t.name),false,tBaseY);
    emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(t.name),false,st.x,st.y,pre,tBaseY);
    }
    // BUILD 1057: founder figures ride the same glide/yaw/phase/slot
    // machinery as residents and transients: logical tiles come from
    // the 900ms founder timer, render positions glide toward them at
    // the demo speed, and only dirty slots re-emit. Founders are
    // adults (no child scale) and use villagerSpecFor(name) like
    // residents. Slots are fixed per founder (founderSlotBase +
    // index); the render key is namespaced ('founder:Marlow') so it
    // can never collide with a resident or transient key.
    for(let fi=0;fi<foundersRef.current.length;fi++){
    const f=foundersRef.current[fi];
    const slot=founderSlotBase+fi;
    const target={x:f.x,y:f.y};
    let st=npcRender.get('founder:'+f.name);
    if(!st){st={x:target.x,y:target.y,yaw:Math.PI,phase:0};npcRender.set('founder:'+f.name,st);}
    else if(needsRenderSnap({x:st.x,y:st.y},target)){st.x=target.x;st.y=target.y;}
    const step=advanceRenderPos({x:st.x,y:st.y},target,dtNpc);
    const moved=step.dist>0;
    let yaw=st.yaw;
    if(moved){yaw=turnYawToward(st.yaw,Math.atan2(step.pos.x-st.x,step.pos.y-st.y),FIGURE_TURN_RATE*dtNpc);}
    const phase=moved?phaseForDistance(st.phase,step.dist):easePhaseToNeutral(st.phase,dtNpc*1000);
    st.x=step.pos.x;st.y=step.pos.y;st.yaw=yaw;st.phase=phase;
    emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(f.name),false,st.x,st.y,undefined,surfaceElevation(effTerrainDraw,st.x+.5,st.y+.5));
    }
    // BUILD 1101 (0x24, Phase 4.3): the founding party rides the same
    // glide/yaw/phase/slot machinery as the founders: logical tiles
    // come from the 900ms founder timer, render positions glide toward
    // them at the demo speed, and only dirty slots re-emit. Slots are
    // fixed per member (foundingSlotBase + index); the render key is
    // namespaced ('founding:Corin') so it can never collide with a
    // resident, transient, or founder key.
    if(foundingRef.current){
    for(let fi=0;fi<foundingRef.current.party.length;fi++){
    const m=foundingRef.current.party[fi];
    const slot=foundingSlotBase+fi;
    const target={x:m.x,y:m.y};
    let st=npcRender.get('founding:'+m.name);
    if(!st){st={x:target.x,y:target.y,yaw:Math.PI,phase:0};npcRender.set('founding:'+m.name,st);}
    else if(needsRenderSnap({x:st.x,y:st.y},target)){st.x=target.x;st.y=target.y;}
    const step=advanceRenderPos({x:st.x,y:st.y},target,dtNpc);
    const moved=step.dist>0;
    let yaw=st.yaw;
    if(moved){yaw=turnYawToward(st.yaw,Math.atan2(step.pos.x-st.x,step.pos.y-st.y),FIGURE_TURN_RATE*dtNpc);}
    const phase=moved?phaseForDistance(st.phase,step.dist):easePhaseToNeutral(st.phase,dtNpc*1000);
    st.x=step.pos.x;st.y=step.pos.y;st.yaw=yaw;st.phase=phase;
    emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,villagerSpecFor(m.name),false,st.x,st.y,undefined,surfaceElevation(effTerrainDraw,st.x+.5,st.y+.5));
    }
    }
    // BUILD 1013: wild animals ride the same glide/yaw/phase/slot
    // machinery as residents and transients: logical tiles come from
    // the 900ms animal timer, render positions glide toward them at
    // the demo speed, and only dirty slots re-emit. Two render
    // dimensions the pose key cannot see — bird flight height and
    // graze amount — are eased in render state, and the loop deletes
    // the slot's uploaded key when either changes, forcing a
    // re-emit instead of a stale reuse. Geometry comes from
    // emitAnimal via `pre`, so the villager spec argument is unused
    // (PLAYER_SPEC is a dummy — never rendered as a villager).
    for(const a of animalActorsRef.current){
    const slot=animalSlotBase+a.slotId;
    const target={x:a.x,y:a.y};
    let st=animalRender.get(a.id);
    if(!st){st={x:target.x,y:target.y,h:a.kind==='bird'&&a.state==='flying'?BIRD_FLIGHT_HEIGHT:0,yaw:Math.PI,phase:0,graze:0,eh:-1,eg:-1};animalRender.set(a.id,st);}
    else if(needsRenderSnap({x:st.x,y:st.y},target)){st.x=target.x;st.y=target.y;}
    const step=advanceRenderPos({x:st.x,y:st.y},target,dtNpc);
    const moved=step.dist>0;
    let yaw=st.yaw;
    if(moved){yaw=turnYawToward(st.yaw,Math.atan2(step.pos.x-st.x,step.pos.y-st.y),FIGURE_TURN_RATE*dtNpc);}
    const phase=moved?phaseForDistance(st.phase,step.dist):easePhaseToNeutral(st.phase,dtNpc*1000);
    st.x=step.pos.x;st.y=step.pos.y;st.yaw=yaw;st.phase=phase;
    const targetH=a.kind==='bird'&&a.state==='flying'?BIRD_FLIGHT_HEIGHT:0;
    st.h+=Math.max(-4*dtNpc,Math.min(4*dtNpc,targetH-st.h));
    // BUILD 1016: chickens peck through the same graze channel
    // (head down while 'pecking') and flap while scuttling.
    const targetGraze=((a.kind==='goat'||a.kind==='deer')&&a.state==='grazing')||(a.kind==='chicken'&&a.state==='pecking')?1:0;
    st.graze+=Math.max(-2.5*dtNpc,Math.min(2.5*dtNpc,targetGraze-st.graze));
    if(Math.abs(st.h-st.eh)>0.01||Math.abs(st.graze-st.eg)>0.01){slotUploaded.delete(slot);st.eh=st.h;st.eg=st.graze;}
    const pre:number[]=[];
    // BUILD 1034: animals stand on the heightfield — the yBase is
    // the ground plus the flight height (birds), and the shadow
    // blob sits on the ground under them.
    const aBaseY=surfaceElevation(effTerrainDraw,st.x+.5,st.y+.5);
    emitAnimal(pre,a.kind,st.x+.5,st.y+.5,aBaseY+st.h,yaw,phase,animalSpecFor(a.id,a.kind),{graze:st.graze,flying:a.state==='flying',flutter:a.state==='scuttling'});
    // BUILD 1015 polish: shadow blob under ground animals (1013
    // shipped none; emitAnimalBlob in animals.ts). Landing/takeoff
    // forces a slot re-emit via the h-change check above, so the
    // blob appears and disappears with the bird.
    emitAnimalBlob(pre,a.kind,st.x+.5,st.y+.5,st.h,aBaseY);
    emitFigureSlot(slot,st.x+.5,st.y+.5,yaw,phase,PLAYER_SPEC,false,st.x,st.y,pre,aBaseY);
    }
    // BUILD 992: in first person the camera IS the player — hide the
    // player figure or it fills the frame. NPC figures still draw.
    // BUILD 1033: while driving the car IS the player — hide the
    // figure or it stands on the car's roof; the car mesh draws instead.
    let playerModelPose:{yaw:number;phase:number}|null=null;
    if(!firstPersonRef.current&&!drivingRef.current){
    const px=player.x+.5,pz=player.y+.5;
    const prev=figureState.get('__player');
    const dist=prev?Math.hypot(px-prev.px,pz-prev.pz):0;
    const pose=this.figurePose('__player',px,pz,nowMs,dt*1000,dist>0,dist);
    playerModelPose=pose;
    if(!playerPeople)emitFigureSlot(playerSlot,px,pz,pose.yaw,pose.phase,PLAYER_SPEC,false,player.x,player.y,undefined,playerBaseY);
    }
    // One dynamic vertex buffer batches the imported character meshes. This
    // avoids changing the fixed procedural figure-slot layout and keeps the
    // imported model path isolated from the rest of the renderer.
    if(peoplePool.length){
      const verts:number[]=[];
      const appendPerson=(asset:CustomAsset,cx:number,cz:number,yaw:number,baseY:number)=>{
        const count=Math.min(asset.indices.length,30000);
        const c=Math.cos(yaw),sn=Math.sin(yaw);
        for(let i=0;i<count;i++){
          const vi=asset.indices[i];
          const p=vi*3;
          if(p+2>=asset.positions.length)continue;
          const x=asset.positions[p],y=asset.positions[p+1],z=asset.positions[p+2];
          const q=vi*3;
          const wx=cx+x*c+z*sn,wz=cz-x*sn+z*c;
          verts.push(wx,baseY+y,wz,asset.colors[q]??asset.avgColor[0],asset.colors[q+1]??asset.avgColor[1],asset.colors[q+2]??asset.avgColor[2]);
        }
      };
      for(const npc of npcActorsRef.current){
        if(npc.looted||!npc.alive)continue;
        const asset=personForNpc(npc.name),st=npcRender.get(npc.name);
        if(asset&&st)appendPerson(asset,st.x+.5,st.y+.5,st.yaw,surfaceElevation(effTerrainDraw,st.x+.5,st.y+.5));
        if(verts.length>=600000)break;
      }
      if(playerPeople&&playerModelPose&&!firstPersonRef.current&&!drivingRef.current)appendPerson(playerPeople,player.x+.5,player.y+.5,playerModelPose.yaw,playerBaseY);
      if(verts.length){
        const data=new Float32Array(verts);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.customActorBuffer);
        if(data.byteLength>this.customActorCapacity){this.customActorCapacity=Math.max(data.byteLength,Math.ceil(this.customActorCapacity*1.5),262144);gl.bufferData(gl.ARRAY_BUFFER,this.customActorCapacity,gl.DYNAMIC_DRAW);}
        gl.bufferSubData(gl.ARRAY_BUFFER,0,data);
        gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
        gl.drawArrays(gl.TRIANGLES,0,data.length/6);
      }
    }
    this.motionStats={emitted,reused,drawn};
    // BUILD 1033: the red sports car — a small per-frame buffer (the
    // sky/fx pattern: allocated once, re-uploaded per frame), drawn
    // after the actor pass. While driving the car's position IS the
    // player position and its heading is the live carYawRef; parked
    // it draws from carRef. Suppressed inside a hut (the car cannot
    // be inside; the player cannot see outside). Depth-tested like
    // every other figure, so houses occlude it correctly.
    if(!insideHutRef.current){
    const carPos=drivingRef.current?{x:player.x+.5,z:player.y+.5,yaw:carYawRef.current}:(carRef.current?{x:carRef.current.x+.5,z:carRef.current.y+.5,yaw:carRef.current.yaw}:null);
    if(carPos){
    const carArr:number[]=[];
    // BUILD 1034: the car sits on the heightfield at its position.
    emitCar(carArr,carPos.x,carPos.z,carPos.yaw,surfaceElevation(effTerrainDraw,carPos.x,carPos.z));
    gl.bindBuffer(gl.ARRAY_BUFFER,carBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(carArr));gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
    gl.drawArrays(gl.TRIANGLES,0,carArr.length/6);
    }
    }
    const corpseVerts:number[]=[];
    const corpse=(x:number,z:number)=>{const color:Vec3=[.38,.18,.16],x0=x-.28,x1=x+.28,z0=z-.28,z1=z+.28,y0=0,y1=.18;const tri=(a:Vec3,b:Vec3,c:Vec3)=>{for(const p of [a,b,c])corpseVerts.push(...p,...color)};tri([x0,y0,z1],[x1,y0,z1],[x1,y1,z1]);tri([x0,y0,z1],[x1,y1,z1],[x0,y1,z1]);};
    for(const npc of npcActorsRef.current) if(!npc.looted&&!npc.alive)corpse(npc.x+.5,npc.y+.5);
    if(corpseVerts.length){this.upload(corpseBuffer,new Float32Array(corpseVerts));gl.drawArrays(gl.TRIANGLES,0,corpseVerts.length/6);}
    // BUILD 1037: keep the yellow selection overlay glued to the
    // ground as the camera moves — reposition it at the live
    // selection rect each frame, but only when the camera key
    // (yaw/zoom/player) changed, so a still camera costs no DOM
    // writes. Skipped while a drag or Duplicate is armed — those
    // previews own the overlay then (their handlers position it
    // per pointer).
    {
    const sel=areaSelectionRef.current;
    if(sel&&!isAreaSelectDragging()&&!isAreaMoveDragging()&&!buildRef.current.areaDuplicateArmed){
    const camKey=yaw.toFixed(4)+'|'+this.zoom.toFixed(2)+'|'+stateRef.current.position.x.toFixed(2)+'|'+stateRef.current.position.y.toFixed(2);
    if(camKey!==this.areaCamKey){this.areaCamKey=camKey;positionAreaSelectRect(sel.rect,areaSelectionLabel(sel));}
    }
    }
    this.raf=requestAnimationFrame(()=>this.draw());
  }

  start(): void {
    this.raf = requestAnimationFrame(() => this.draw());
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.worldBuffer);
    gl.deleteBuffer(this.actorBuffer);
    gl.deleteBuffer(this.corpseBuffer);
    gl.deleteBuffer(this.skyBuffer);
    gl.deleteBuffer(this.skyObjBuffer);
    gl.deleteBuffer(this.fxBuffer);
    gl.deleteBuffer(this.carBuffer);
    gl.deleteBuffer(this.rainBuffer);
    gl.deleteProgram(this.program);
    gl.deleteShader(this.vs);
    gl.deleteShader(this.fs);
  }
}
