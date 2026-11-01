import { useEffect, useRef, useState } from 'react';
import { isWalkableWorld, loadWorld, saveWorld, terrainAt, terrainKey, type IsoWorld } from '../iso/isoWorld';
import { mosslightEngineChunkLayout } from '../mosslightLayout';
import { rpgSprite, rpgAnchorFor, preloadRpgBase, type RpgAnim, type RpgBase } from '../iso/rpgSprites';
import {
  houseDesignFor, streetSlabsFor, cobbleSquaresFor,
  SKY_TOP, SKY_HORIZON, DIRT_TAN, COBBLE_GAP, MORTAR,
  GLASS_DARK, GLASS_LIT, DOOR_WOOD, GROUND_FLOOR_H, UPPER_FLOOR_H, roofRise,
} from './townLook';
import {
  placedHutRects, placedTreeTiles, placedStallRects, placedPathKeys,
  validatePlacement, removePlacementAt, removeGeneratedAt, addPlacement, walkableWithPlacements,
  type PaletteKind,
} from './placements';
import { emitNaturalGrass, emitPlacedGrass } from './grassTufts';
import type { Face8 } from '../iso/isoSprites';

type Vec3 = [number, number, number];
type Vertex = number[];
const SAVE_KEY = 'ag-3d-player-v1';
const NPC_SAVE_KEY = 'ag-3d-npcs-v1';
const INVENTORY_KEY = 'ag-3d-inventory-v1';
const HEALTH_KEY = 'ag-3d-health-v1';
type NpcActor3D = { name: string; x: number; y: number; waypoint: number; hp: number; alive: boolean; looted?: boolean };
type Inventory3D = Record<string, number>;
function readSaved<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? { ...fallback, ...JSON.parse(value) } : fallback; } catch { return fallback; }
}
const COLORS: Record<string, Vec3> = {
  grass: [0.31, 0.41, 0.22], dirt: DIRT_TAN, sand: [0.68, 0.59, 0.39],
  stone: [0.48, 0.49, 0.46], water: [0.12, 0.36, 0.57],
};
type Position = { x: number; y: number };

function savedPosition(world: IsoWorld): Position {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Position;
      if (Number.isFinite(p.x) && Number.isFinite(p.y) && walkableWithPlacements(world, world.crates, Math.round(p.x), Math.round(p.y))) return p;
    }
  } catch { /* use the world's authored spawn */ }
  return { x: world.playerStart.tx, y: world.playerStart.ty };
}

/**
 * Project the authored Mosslight Crossing town blueprint into the independent
 * 3D map. The 2D/2.5D world renderer is untouched: this adapter only changes
 * the 3D view's world snapshot. A fixed transform keeps the whole town inside
 * the 200x200 3D map and keeps the layout deterministic across sessions.
 */
// Exported for standalone build-verification asserts (crate/stall counts
// in the adapted world); the game itself calls it internally only.
export function applyMosslightTownLayout(source: IsoWorld): IsoWorld {
  const world: IsoWorld = {
    ...source,
    terrain: { ...source.terrain },
    walls: source.walls.filter(w => Math.abs(w.x - 100) > 68 || Math.abs(w.y - 100) > 68),
    huts: source.huts.filter(h => Math.abs((h.x0 + h.x1) / 2 - 100) > 68 || Math.abs((h.y0 + h.y1) / 2 - 100) > 68),
    stalls: source.stalls.filter(st => Math.abs((st.x0 + st.x1) / 2 - 100) > 68 || Math.abs(st.y0 - 100) > 68),
    trees: [...source.trees],
    rocks: [...source.rocks],
    crates: [...source.crates],
    npcSpawns: source.npcSpawns.map(n => ({ ...n, waypoints: [...(n.waypoints || [])] })),
  };
  // Remove the old demo's straight cross-road stamps; Mosslight's generated
  // street network below replaces them while preserving the pond and other
  // authored terrain outside those legacy road lines.
  for (const [key, terrain] of Object.entries(world.terrain)) {
    if (terrain !== 'dirt') continue;
    const [x, y] = key.split(',').map(Number);
    if (x === 99 || x === 100 || y === 99 || y === 100) delete world.terrain[key];
  }
  const layout = mosslightEngineChunkLayout();
  const scale = 0.42;
  const tile = (v: number) => 100 + (v - 140) * scale;
  const clamp = (v: number) => Math.max(2, Math.min(197, Math.round(v)));
  // BUILD 987: paths the user removed stay removed — the road/plaza
  // rasterizer below would otherwise re-stamp them on every load.
  const removedPathKeys = new Set(world.removedPaths ?? []);
  const setTerrain = (x: number, y: number, terrain: 'dirt' | 'sand') => {
    if (removedPathKeys.has(terrainKey(x, y))) return;
    if (x >= 0 && y >= 0 && x < world.w && y < world.h) world.terrain[terrainKey(x, y)] = terrain;
  };

  // Rasterize the actual generated road network into the 3D walk/collision grid.
  for (const road of layout.roads) {
    const pts = road.points.map(p => ({ x: tile(p.x), y: tile(p.y) }));
    const radius = Math.max(0.55, road.width * scale / 2);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius - 1));
      const maxX = Math.min(world.w - 1, Math.ceil(Math.max(a.x, b.x) + radius + 1));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius - 1));
      const maxY = Math.min(world.h - 1, Math.ceil(Math.max(a.y, b.y) + radius + 1));
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const t = len2 ? Math.max(0, Math.min(1, ((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy) / len2)) : 0;
        if (Math.hypot(x + 0.5 - (a.x + t * dx), y + 0.5 - (a.y + t * dy)) <= radius) setTerrain(x, y, 'dirt');
      }
    }
  }

  // The generator's authored plaza becomes the town square, over the road fill.
  for (const plaza of layout.plazas) {
    const cx = tile(plaza.x), cy = tile(plaza.y), radius = Math.max(1, plaza.r * scale);
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++)
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) setTerrain(x, y, 'sand');
  }

  // Convert pinned story-critical buildings and generated filler lots to solid
  // 3D footprints. Facing determines the doorway tile used by movement checks.
  world.huts = [...world.huts];
  for (const lot of layout.lots.filter(l => l.kind === 'building')) {
    const r = lot.footprint;
    const x0 = clamp(Math.floor(tile(r.left))), y0 = clamp(Math.floor(tile(r.top)));
    const x1 = clamp(Math.max(x0, Math.floor(tile(r.right)))), y1 = clamp(Math.max(y0, Math.floor(tile(r.bottom))));
    // BUILD 987: houses the user removed stay removed — the generator
    // would otherwise re-push the same footprint on every load.
    if ((world.removedHuts ?? []).some(h => h.x0 === x0 && h.y0 === y0 && h.x1 === x1 && h.y1 === y1)) continue;
    const midX = Math.round((x0 + x1) / 2), midY = Math.round((y0 + y1) / 2);
    const door = lot.facing === 'north' ? { x: midX, y: y0 }
      : lot.facing === 'south' ? { x: midX, y: y1 }
      : lot.facing === 'west' ? { x: x0, y: midY } : { x: x1, y: midY };
    world.huts.push({ x0, y0, x1, y1, doorX: door.x, doorY: door.y });
  }

  // Bring the layout generator's authored market/utility props into the
  // 3D collision grid. Stalls retain their counter collision; other solid
  // props use the current 3D crate placeholder until dedicated prop meshes land.
  for (const prop of layout.props) {
    const x = clamp(tile(prop.x)), y = clamp(tile(prop.y));
    if (!prop.solid || world.huts.some(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1)) continue;
    if (prop.kind === 'stall') {
      world.stalls.push({ x0: x, y0: y, x1: Math.min(world.w - 1, x + 1) });
    } else if (!world.crates.some(c => c.tx === x && c.ty === y)) {
      world.crates.push({ tx: x, ty: y });
    }
  }

  // Remove harvestables accidentally placed under the new building footprints.
  const insideBuilding = (x: number, y: number) => world.huts.some(h =>
    x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  world.trees = world.trees.filter(t => !insideBuilding(t.tx, t.ty));
  world.rocks = world.rocks.filter(t => !insideBuilding(t.tx, t.ty));
  world.crates = world.crates.filter(t => !insideBuilding(t.tx, t.ty));

  // Keep existing 3D NPC save names/schedules, but nudge authored demo spawns
  // off new building footprints so they can still walk around the town.
  world.npcSpawns = world.npcSpawns.map((npc, index) => {
    if (!insideBuilding(Math.round(npc.x), Math.round(npc.y))) return npc;
    const originX = Math.round(npc.x), originY = Math.round(npc.y);
    for (let radius = 1; radius <= 8; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = originX + dx, y = originY + dy;
      if (isWalkableWorld(world, world.crates, x, y)) {
        const waypoints = (npc.waypoints || []).map((p, i) => i === 0 ? { tx: x, ty: y } : p);
        return { ...npc, x, y, waypoints };
      }
    }
    return { ...npc, x: 100 + index, y: 106 };
  });
  return world;
}

function savedNpcActors(world: IsoWorld): NpcActor3D[] {
  try {
    const raw = localStorage.getItem(NPC_SAVE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as NpcActor3D[];
      if (Array.isArray(saved)) return world.npcSpawns.filter(npc => !saved.some(a => a.name === npc.name && a.looted)).map((npc, i) => {
        const actor = saved.find(a => a.name === npc.name) || saved[i];
        return actor && Number.isFinite(actor.x) && Number.isFinite(actor.y)
          ? { name: npc.name, x: actor.x, y: actor.y, waypoint: Number.isFinite(actor.waypoint) ? actor.waypoint : 0, hp: Number.isFinite(actor.hp) ? actor.hp : 100, alive: actor.alive !== false }
          : { name: npc.name, x: npc.x, y: npc.y, waypoint: 0, hp: 100, alive: true };
      });
    }
  } catch { /* use authored NPC spawn positions */ }
  return world.npcSpawns.map(npc => ({ name: npc.name, x: npc.x, y: npc.y, waypoint: 0, hp: 100, alive: true }));
}

// Exported for standalone build-verification asserts (synthetic render
// proofs); the game itself calls it internally only.
export function buildWorldVertices(world: IsoWorld, center: Position): Float32Array {
  const data: Vertex = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3, color: Vec3) => {
    for (const p of [a, b, c]) data.push(...p, ...color);
  };
  // BUILD 985: per-vertex-colour triangle for grass blades (the flat
  // tri() above forces one colour per triangle; grass needs the shader
  // gradient evaluated at each corner, interpolated by the rasterizer).
  const triV = (a: Vec3, ca: Vec3, b: Vec3, cb: Vec3, c: Vec3, cc: Vec3) => {
    data.push(...a, ...ca, ...b, ...cb, ...c, ...cc);
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3) => { tri(a, b, c, color); tri(a, c, d, color); };
  const cube = (x: number, z: number, w: number, h: number, d: number, color: Vec3) => {
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y0=0,y1=h;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],color);
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],color.map(v=>v*.75) as Vec3);
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],color.map(v=>v*.84) as Vec3);
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],color.map(v=>v*.68) as Vec3);
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],color.map(v=>Math.min(1,v*1.15)) as Vec3);
  };
  const minX=Math.max(0,Math.floor(center.x)-22), maxX=Math.min(world.w-1,Math.floor(center.x)+22);
  const minY=Math.max(0,Math.floor(center.y)-22), maxY=Math.min(world.h-1,Math.floor(center.y)+22);
  // BUILD 984: placed paths render exactly like generated dirt roads.
  const placedPaths=placedPathKeys(world);
  const effTerrain=(x:number,y:number)=>placedPaths.has(terrainKey(x,y))?'dirt':terrainAt(world,x,y);
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
    const terrain=effTerrain(x,y);
    const c=COLORS[terrain]||COLORS.grass;
    const shade=((x*13+y*7)&3)*.012;
    quad([x,0,y],[x+1,0,y],[x+1,0,y+1],[x,0,y+1],[c[0]+shade,c[1]+shade,c[2]+shade]);
    // BUILD 983 street: scattered stone slabs on dirt, grey cobble shoulders
    // on grass/stone tiles beside a dirt tile. Overlays sit slightly above
    // the ground (slabs staggered per index) so nothing z-fights.
    if(terrain==='dirt'){
      const slabs=streetSlabsFor(x,y);
      for(let i=0;i<slabs.length;i++){
        const s=slabs[i],sy=.03+i*.002;
        quad([x+s.dx,sy,y+s.dz],[x+s.dx+s.w,sy,y+s.dz],[x+s.dx+s.w,sy,y+s.dz+s.d],[x+s.dx,sy,y+s.dz+s.d],[s.shade,s.shade,s.shade*.96]);
      }
    } else if(terrain==='grass'||terrain==='stone'){
      const nearDirt=(x>0&&effTerrain(x-1,y)==='dirt')||(x<world.w-1&&effTerrain(x+1,y)==='dirt')||(y>0&&effTerrain(x,y-1)==='dirt')||(y<world.h-1&&effTerrain(x,y+1)==='dirt');
      if(nearDirt){
        quad([x,.018,y],[x+1,.018,y],[x+1,.018,y+1],[x,.018,y+1],COBBLE_GAP);
        for(const sq of cobbleSquaresFor(x,y)){
          quad([x+sq.dx,.022,y+sq.dz],[x+sq.dx+sq.size,.022,y+sq.dz],[x+sq.dx+sq.size,.022,y+sq.dz+sq.size],[x+sq.dx,.022,y+sq.dz+sq.size],[sq.shade,sq.shade,sq.shade*.97]);
        }
      }
    }
  }
  // BUILD 986: houseBox moved above the stall loop so the shared tree
  // renderer below can serve stalls and crates too (same scope, same
  // code — only its position in the function changed).
  const houseBox=(x:number,z:number,w:number,h:number,d:number,y0:number,color:Vec3)=>{
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y1=y0+h;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],color);
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],color.map(v=>v*.78) as Vec3);
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],color.map(v=>v*.88) as Vec3);
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],color.map(v=>v*.72) as Vec3);
  };
  // BUILD 986: the exact 983 tapered-tier tree (trunk + 3 shrinking
  // foliage tiers), shared by real trees, converted crates and converted
  // generated stalls — one renderer, never a second tree.
  const treeAt=(tx:number,ty:number)=>{
    houseBox(tx+.5,ty+.5,.22,1.1,.22,0,[.36,.23,.12]);
    houseBox(tx+.5,ty+.5,1.15,.9,1.15,1.0,[.13,.30,.14]);
    houseBox(tx+.5,ty+.5,.85,.7,.85,1.7,[.16,.34,.16]);
    houseBox(tx+.5,ty+.5,.55,.6,.55,2.2,[.19,.37,.18]);
  };
  // Walls and stall counters use the editor-authored collision geometry.
  for(const wall of world.walls) if(wall.x>=minX&&wall.x<=maxX&&wall.y>=minY&&wall.y<=maxY) cube(wall.x+.5,wall.y+.5,1,.85,1,[.43,.39,.32]);
  // BUILD 986: generated/authored stalls render as 983 trees, not brown
  // counter cubes. Stall data + collision are untouched; only the mesh
  // changes. User-PLACED stalls keep the brown counter cube below — a
  // deliberate Build-panel choice is never silently converted.
  for(const stall of world.stalls) if(stall.y0>=minY&&stall.y0<=maxY) for(let x=stall.x0;x<=stall.x1;x++) if(x>=minX&&x<=maxX) treeAt(x,stall.y0);
  for(const stall of placedStallRects(world)) if(stall.y0>=minY&&stall.y0<=maxY) for(let x=stall.x0;x<=stall.x1;x++) if(x>=minX&&x<=maxX) cube(x+.5,stall.y0+.5,1,.75,1,[.57,.31,.16]);
  // BUILD 983 town look (reference match): varied low-poly houses —
  // stone-block ground floors, dark timber framing, plaster upper walls,
  // steep pitched roofs, small square windows (some warm-lit), open
  // colonnade fronts on some lots. Designs come from townLook.ts, seeded
  // by hut coordinates (stable across rebuilds and cameras — the old
  // code cycled colours by visible-window order, so houses changed
  // colour while panning). Layout is never moved: footprints, doors and
  // collision come from world.huts exactly as the layout produced them.
  // This renderer uses vertex colours only (no textures), so the FBX
  // atlas trap does not apply here; the generated native geometry is
  // the single source of truth for buildings in this mode.
  type FaceDir='north'|'south'|'west'|'east';
  // A flat rect centred on a face: a = position along the face, y = centre
  // height, fixed = the face plane coordinate (proud of the wall).
  const faceRect=(face:FaceDir,a:number,wA:number,y:number,h:number,fixed:number,color:Vec3)=>{
    const a0=a-wA/2,a1=a+wA/2,y0=y-h/2,y1=y+h/2;
    if(face==='south')quad([a0,y0,fixed],[a1,y0,fixed],[a1,y1,fixed],[a0,y1,fixed],color);
    else if(face==='north')quad([a1,y0,fixed],[a0,y0,fixed],[a0,y1,fixed],[a1,y1,fixed],color);
    else if(face==='west')quad([fixed,y0,a1],[fixed,y0,a0],[fixed,y1,a0],[fixed,y1,a1],color);
    else quad([fixed,y0,a0],[fixed,y0,a1],[fixed,y1,a1],[fixed,y1,a0],color);
  };
  // Mortar joints for one stone ground-floor face: horizontal courses plus
  // staggered vertical joints, drawn proud of the stone box.
  const stoneJoints=(face:FaceDir,cx:number,cz:number,w:number,d:number)=>{
    const fixed=face==='south'?cz+d/2+.008:face==='north'?cz-d/2-.008:face==='west'?cx-w/2-.008:cx+w/2+.008;
    const span=face==='south'||face==='north'?w:d;
    const a0=face==='south'||face==='north'?cx-w/2:cz-d/2;
    const courses=3,courseH=GROUND_FLOOR_H/courses,blockW=.85;
    for(let c=0;c<courses;c++){
      const y0=c*courseH,y1=(c+1)*courseH;
      if(c>0)faceRect(face,a0+span/2,span,y0,.035,fixed,MORTAR);
      const joints=Math.max(1,Math.round(span/blockW));
      const step=span/joints,offset=(c%2)*step/2;
      for(let j=0;j<=joints;j++){
        const a=a0+offset+j*step;
        if(a<=a0+.02||a>=a0+span-.02)continue;
        faceRect(face,a,.035,(y0+y1)/2,courseH-.035,fixed,MORTAR);
      }
    }
  };
  const warmTint=(c:Vec3):Vec3=>[Math.min(1,c[0]*1.04),Math.min(1,c[1]*1.0),Math.min(1,c[2]*.94)];
  for(const hut of [...world.huts, ...placedHutRects(world)]) {
    if(hut.x1<minX||hut.x0>maxX||hut.y1<minY||hut.y0>maxY) continue;
    const x=(hut.x0+hut.x1+1)/2,z=(hut.y0+hut.y1+1)/2,w=Math.max(2,hut.x1-hut.x0+1),d=Math.max(2,hut.y1-hut.y0+1);
    const hDoorX=(hut as {doorX?:number}).doorX ?? Math.round(x);
    const hDoorY=(hut as {doorY?:number}).doorY ?? hut.y1;
    const design=houseDesignFor(hut.x0,hut.y0,hut.x1,hut.y1,hDoorX,hDoorY);
    const topY=GROUND_FLOOR_H+(design.stories-1)*UPPER_FLOOR_H;
    const span=design.roofAxis==='x'?d:w;
    const ridgeY=topY+roofRise(span);
    const face=design.doorFace;
    const faceFixed=face==='south'?z+d/2:face==='north'?z-d/2:face==='west'?x-w/2:x+w/2;
    const faceOut=face==='south'||face==='east'?1:-1;
    const facePlane=(o:number)=>faceFixed+faceOut*o;
    const aC=face==='south'||face==='north'?x:z;
    const spanA=face==='south'||face==='north'?w:d;
    // Soft contact shadow + sun-side blob (no shadow maps in this
    // renderer; darkened ground quads ground the volumes instead).
    quad([x-w/2-.45+.25,.005,z-d/2-.45+.35],[x+w/2+.45+.25,.005,z-d/2-.45+.35],[x+w/2+.45+.25,.005,z+d/2+.45+.35],[x-w/2-.45+.25,.005,z+d/2+.45+.35],[.28,.27,.24]);
    quad([x-w/2-.15+.12,.008,z-d/2-.15+.15],[x+w/2+.15+.12,.008,z-d/2-.15+.15],[x+w/2+.15+.12,.008,z+d/2+.15+.15],[x-w/2-.15+.12,.008,z+d/2+.15+.15],[.2,.19,.17]);
    // Stone ground floor + mortar joints on all faces.
    houseBox(x,z,w,GROUND_FLOOR_H,d,0,design.stone);
    (['north','south','west','east'] as const).forEach(f=>stoneJoints(f,x,z,w,d));
    if(design.openFront){
      // Dark shopfront interior on the door face, timber posts + beam in
      // front of it, door offset to one side on the dark face.
      faceRect(face,aC,spanA-.3,GROUND_FLOOR_H/2,GROUND_FLOOR_H-.14,facePlane(.01),[.12,.1,.08]);
      const posts=3;
      for(let i=0;i<posts;i++){
        const a=aC-spanA/2+spanA*(i+1)/(posts+1);
        if(face==='south'||face==='north')houseBox(a,facePlane(.06),.14,GROUND_FLOOR_H,.14,0,design.timber);
        else houseBox(facePlane(.06),a,.14,GROUND_FLOOR_H,.14,0,design.timber);
      }
      if(face==='south'||face==='north')houseBox(x,facePlane(.06),w,.14,.14,GROUND_FLOOR_H-.14,design.timber);
      else houseBox(facePlane(.06),z,.14,.14,d,GROUND_FLOOR_H-.14,design.timber);
      faceRect(face,aC+spanA*.28,.52,.53,1.06,facePlane(.03),DOOR_WOOD);
    } else {
      // Door + timber lintel + stone step on the door face.
      faceRect(face,aC,.52,.53,1.06,facePlane(.02),DOOR_WOOD);
      faceRect(face,aC,.72,GROUND_FLOOR_H+.06,.12,facePlane(.02),design.timber);
      if(face==='south')houseBox(x,z+d/2+.15,.72,.12,.3,0,design.stone);
      else if(face==='north')houseBox(x,z-d/2-.15,.72,.12,.3,0,design.stone);
      else if(face==='west')houseBox(x-w/2-.15,z,.12,.12,.72,0,design.stone);
      else houseBox(x+w/2+.15,z,.12,.12,.72,0,design.stone);
    }
    // Upper floors: plaster boxes + timber corner posts + floor beams.
    for(let s=1;s<design.stories;s++){
      const y0=GROUND_FLOOR_H+(s-1)*UPPER_FLOOR_H;
      houseBox(x,z,w,UPPER_FLOOR_H,d,y0,design.plaster);
    }
    const po=.06;
    houseBox(x-w/2+po,z-d/2+po,.13,topY-GROUND_FLOOR_H,.13,GROUND_FLOOR_H,design.timber);
    houseBox(x+w/2-po,z-d/2+po,.13,topY-GROUND_FLOOR_H,.13,GROUND_FLOOR_H,design.timber);
    houseBox(x-w/2+po,z+d/2-po,.13,topY-GROUND_FLOOR_H,.13,GROUND_FLOOR_H,design.timber);
    houseBox(x+w/2-po,z+d/2-po,.13,topY-GROUND_FLOOR_H,.13,GROUND_FLOOR_H,design.timber);
    for(let s=0;s<design.stories-1;s++){
      const y=GROUND_FLOOR_H+s*UPPER_FLOOR_H;
      houseBox(x,z+d/2+.01,w,.13,.07,y-.065,design.timber);
      houseBox(x,z-d/2-.01,w,.13,.07,y-.065,design.timber);
      houseBox(x-w/2-.01,z,.07,.13,d,y-.065,design.timber);
      houseBox(x+w/2+.01,z,.07,.13,d,y-.065,design.timber);
    }
    // Small square windows: 2 on the door face per upper floor, 1 on each
    // side face per upper floor, 1 on the back per upper floor. Lit flags
    // cycle through the design's 8 slots.
    let winSlot=0;
    const win=(f:FaceDir,a:number,y:number)=>{
      const fixed=f==='south'?z+d/2:f==='north'?z-d/2:f==='west'?x-w/2:x+w/2;
      const out=f==='south'||f==='east'?1:-1;
      const lit=design.lit[winSlot%8];winSlot++;
      faceRect(f,a,.46,y,.56,fixed+out*.015,design.timber);
      faceRect(f,a,.34,y,.44,fixed+out*.03,lit?GLASS_LIT:GLASS_DARK);
    };
    for(let s=1;s<design.stories;s++){
      const yC=GROUND_FLOOR_H+(s-1)*UPPER_FLOOR_H+UPPER_FLOOR_H/2;
      win(face,aC-spanA*.22,yC);
      win(face,aC+spanA*.22,yC);
      const sideA=face==='south'||face==='north'?z:x;
      const sideL:FaceDir=face==='south'?'west':face==='north'?'east':face==='west'?'north':'south';
      const sideR:FaceDir=face==='south'?'east':face==='north'?'west':face==='west'?'south':'north';
      win(sideL,sideA,yC);
      win(sideR,sideA,yC);
      const back:FaceDir=face==='south'?'north':face==='north'?'south':face==='west'?'east':'west';
      win(back,aC,yC);
    }
    // Steep pitched roof (ridge along the longer side), eaves overhang,
    // timber gables at the ridge ends, ridge beam, optional chimney.
    const e=.18;
    const x0=x-w/2-e,x1=x+w/2+e,z0=z-d/2-e,z1=z+d/2+e;
    if(design.roofAxis==='x'){
      quad([x0,topY,z1],[x1,topY,z1],[x1,ridgeY,z],[x0,ridgeY,z],warmTint(design.roof));
      quad([x0,topY,z0],[x0,ridgeY,z],[x1,ridgeY,z],[x1,topY,z0],design.roof.map(v=>v*.85) as Vec3);
      tri([x-w/2,topY,z-d/2],[x-w/2,topY,z+d/2],[x-w/2,ridgeY,z],design.plaster);
      tri([x+w/2,topY,z+d/2],[x+w/2,topY,z-d/2],[x+w/2,ridgeY,z],design.plaster.map(v=>v*.85) as Vec3);
      houseBox(x,z,w+2*e,.1,.1,ridgeY,design.timber);
    } else {
      quad([x1,topY,z1],[x1,topY,z0],[x,ridgeY,z0],[x,ridgeY,z1],warmTint(design.roof));
      quad([x0,topY,z0],[x0,topY,z1],[x,ridgeY,z1],[x,ridgeY,z0],design.roof.map(v=>v*.85) as Vec3);
      tri([x-w/2,topY,z-d/2],[x+w/2,topY,z-d/2],[x,ridgeY,z-d/2],design.plaster);
      tri([x+w/2,topY,z+d/2],[x-w/2,topY,z+d/2],[x,ridgeY,z+d/2],design.plaster.map(v=>v*.85) as Vec3);
      houseBox(x,z,.1,.1,d+2*e,ridgeY,design.timber);
    }
    if(design.chimney){
      const chX=design.roofAxis==='x'?x+w*.28:x;
      const chZ=design.roofAxis==='x'?z:z+d*.28;
      houseBox(chX,chZ,.35,1.1,.35,ridgeY-.3,design.stone);
      quad([chX-.19,ridgeY+.8,chZ-.19],[chX+.19,ridgeY+.8,chZ-.19],[chX+.19,ridgeY+.8,chZ+.19],[chX-.19,ridgeY+.8,chZ+.19],[.15,.14,.12]);
    }
  }
  for(const t of [...world.trees, ...placedTreeTiles(world)]) if(t.tx>=minX&&t.tx<=maxX&&t.ty>=minY&&t.ty<=maxY) {
    // BUILD 983: low-poly tapered tree (trunk + 3 shrinking foliage
    // tiers) instead of the old single green cube. Visual only — same
    // tile, same collision, same positions. BUILD 986: now the shared
    // treeAt renderer (identical geometry).
    treeAt(t.tx,t.ty);
  }
  // BUILD 985: stylized grass tufts (StayAtHomeDev MIT meshes, baked in
  // grassMeshes.ts, coloured by grassTufts.ts: base-to-tip gradient x
  // world-XZ noise). Natural tufts seed by tile so they never reshuffle
  // across window rebuilds; placed grass from the Build panel renders
  // the same way. Emitted after trees so blades sit above the ground
  // quads, before rocks/crates (draw order is irrelevant — one buffer).
  emitNaturalGrass(triV, world, effTerrain, minX, maxX, minY, maxY);
  emitPlacedGrass(triV, world, minX, maxX, minY, maxY);
  for(const r of world.rocks) if(r.tx>=minX&&r.tx<=maxX&&r.ty>=minY&&r.ty<=maxY) cube(r.tx+.5,r.ty+.5,.7,.6,.7,[.43,.45,.44]);
  // BUILD 986: generated/authored crates + layout prop placeholders render
  // as 983 trees, not brown cubes. Data untouched — the wood interaction
  // still finds and removes the crate entry (see the E-key handler).
  for(const c of world.crates) if(c.tx>=minX&&c.tx<=maxX&&c.ty>=minY&&c.ty<=maxY) treeAt(c.tx,c.ty);
  // BUILD 984: the 983 castle backdrop group (7-peak silhouette + 4 foot
  // houses) was removed at the user's request — no skyline, no foot
  // houses. The blue sky gradient pass above is unchanged.
  return new Float32Array(data);
}

export default function Engine3DWorldView({ onExit }: { onExit?: () => void }) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [message,setMessage]=useState('Connected to the editable world map');
  // BUILD 983 street view: ground-level camera matching the reference
  // street shot. The ref is what the render loop reads; the state only
  // drives the toggle button label.
  const [streetViewOn,setStreetViewOn]=useState(false);
  const streetViewRef=useRef(false);
  const [position,setPosition]=useState<Position>(()=>savedPosition(applyMosslightTownLayout(loadWorld())));
  const [inventory,setInventory]=useState<Inventory3D>(()=>readSaved<Inventory3D>(INVENTORY_KEY,{}));
  const [health,setHealth]=useState<number>(()=>{try{const n=Number(localStorage.getItem(HEALTH_KEY));return Number.isFinite(n)&&n>0?Math.min(100,n):100}catch{return 100}});
  const inventoryRef=useRef<Inventory3D>(inventory); inventoryRef.current=inventory;
  const healthRef=useRef<number>(health); healthRef.current=health;
  const stateRef=useRef({position,world:loadWorld()});
  const needsWorldRebuild=useRef(true);
  const npcActorsRef=useRef<NpcActor3D[]>([]);
  // BUILD 984 placement tool. The ref mirrors the state for the
  // render-loop closures (which capture refs, not state).
  const [buildOpen,setBuildOpen]=useState(false);
  const [palette,setPalette]=useState<PaletteKind|null>(null);
  const [removeMode,setRemoveMode]=useState(false);
  const [placedCount,setPlacedCount]=useState(0);
  const buildRef=useRef<{palette:PaletteKind|null;removeMode:boolean}>({palette:null,removeMode:false});
  stateRef.current={position,world:stateRef.current.world};
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const world=applyMosslightTownLayout(loadWorld());stateRef.current.world=world;
    if(!world.placements)world.placements=[];
    setPlacedCount(world.placements.length);
    npcActorsRef.current=savedNpcActors(world);
    // This mode uses the generated Daggerfall-inspired cottage meshes below.
    // Do not load or render the separately uploaded FBX house pack here.
    const html=document.documentElement,body=document.body;
    const oldHtml={overflow:html.style.overflow,touchAction:html.style.touchAction,overscrollBehavior:html.style.overscrollBehavior};
    const oldBody={overflow:body.style.overflow,touchAction:body.style.touchAction,overscrollBehavior:body.style.overscrollBehavior,position:body.style.position,width:body.style.width};
    html.style.overflow='hidden';html.style.touchAction='none';html.style.overscrollBehavior='none';
    body.style.overflow='hidden';body.style.touchAction='none';body.style.overscrollBehavior='none';body.style.position='fixed';body.style.width='100%';
    const stopTouch=(e:TouchEvent)=>{if(e.cancelable)e.preventDefault()};
    window.addEventListener('touchmove',stopTouch,{passive:false});
    const gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
    if(!gl){setMessage('WebGL is unavailable in this browser');return;}
    const vs=gl.createShader(gl.VERTEX_SHADER)!;gl.shaderSource(vs,'attribute vec3 p;attribute vec3 c;uniform mat4 m;varying vec3 v;void main(){gl_Position=m*vec4(p,1.0);v=c;}');gl.compileShader(vs);
    const fs=gl.createShader(gl.FRAGMENT_SHADER)!;gl.shaderSource(fs,'precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.0);}');gl.compileShader(fs);
    if(!gl.getShaderParameter(vs,gl.COMPILE_STATUS)){setMessage('3D vertex shader failed: '+(gl.getShaderInfoLog(vs)||'unknown shader error'));return;}if(!gl.getShaderParameter(fs,gl.COMPILE_STATUS)){setMessage('3D fragment shader failed: '+(gl.getShaderInfoLog(fs)||'unknown shader error'));return;}const program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){setMessage(gl.getProgramInfoLog(program)||'3D renderer setup failed');return}
    gl.useProgram(program);
    const worldBuffer=gl.createBuffer()!,actorBuffer=gl.createBuffer()!;
    const playerSpriteProgram=gl.createProgram();
    let playerSpriteBuffer:WebGLBuffer|null=null,playerSpriteTexture:WebGLTexture|null=null;
    if(playerSpriteProgram){
      const spriteVs=gl.createShader(gl.VERTEX_SHADER)!,spriteFs=gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(spriteVs,'attribute vec3 p;attribute vec2 uv;uniform mat4 m;varying vec2 vUv;void main(){gl_Position=m*vec4(p,1.0);vUv=uv;}');gl.compileShader(spriteVs);
      gl.shaderSource(spriteFs,'precision mediump float;uniform sampler2D tex;varying vec2 vUv;void main(){vec4 color=texture2D(tex,vUv);if(color.a<0.08)discard;gl_FragColor=color;}');gl.compileShader(spriteFs);
      if(gl.getShaderParameter(spriteVs,gl.COMPILE_STATUS)&&gl.getShaderParameter(spriteFs,gl.COMPILE_STATUS)){
        gl.attachShader(playerSpriteProgram,spriteVs);gl.attachShader(playerSpriteProgram,spriteFs);gl.linkProgram(playerSpriteProgram);
        if(gl.getProgramParameter(playerSpriteProgram,gl.LINK_STATUS)){
          playerSpriteBuffer=gl.createBuffer();playerSpriteTexture=gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D,playerSpriteTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          // Use the real RPG pack already shipped in public/rpg. The old
          // game-sprites/baseHumanMale URL did not exist, leaving the player
          // as a blank/placeholder shape in the 3D mode.
          preloadRpgBase('BaseHumanMale');
          (window as any).__ag3dRpgSpriteReady=true;
        }
      }
    }
    const pLoc=gl.getAttribLocation(program,'p'),cLoc=gl.getAttribLocation(program,'c'),mLoc=gl.getUniformLocation(program,'m');
    if(pLoc<0||cLoc<0||!mLoc){setMessage('3D renderer missing required shader attributes');return;}
    gl.enableVertexAttribArray(pLoc);gl.enableVertexAttribArray(cLoc);
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(SKY_HORIZON[0],SKY_HORIZON[1],SKY_HORIZON[2],1);
    // BUILD 983 sky gradient: a static clip-space quad (horizon colour at
    // the bottom, clear blue at the top) drawn with depth off before the
    // world, so the world draws over it. Same vertex-colour program.
    const skyBuffer=gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      -1,-1,1,...SKY_HORIZON, 1,-1,1,...SKY_HORIZON, 1,1,1,...SKY_TOP,
      -1,-1,1,...SKY_HORIZON, 1,1,1,...SKY_TOP, -1,1,1,...SKY_TOP,
    ]),gl.STATIC_DRAW);
    let yaw=.65,pitch=.7,zoom=12,drag=false,lx=0,ly=0,raf=0;
    let lookPitch=.08,lastBuildX=stateRef.current.position.x,lastBuildY=stateRef.current.position.y;
    const pointers=new Map<number,{x:number;y:number}>();let pinchDistance=0;
    // Continuous click-to-move target, in the same free world-space units as
    // the base game's tapMove system (not tile-by-tile stepping).
    let moveTarget:{x:number;y:number}|null=null;
    let gestureMoved=false,gestureStartX=0,gestureStartY=0;
    let lastFrameTime=performance.now(),lastPositionPublish=0,lastPositionSave=0;
    let walkingNow=false;
    // Keep the last facing while idle; update it from the actual world-space
    // movement vector, transformed into camera-relative screen directions.
    let playerFace:Face8='down';
    const walkableAt=(x:number,y:number)=>{
      const gx=Math.round(x),gy=Math.round(y);
      if(npcActorsRef.current.some(n=>n.alive&&Math.hypot(n.x-x,n.y-y)<.42))return false;
      return walkableWithPlacements(world,world.crates,gx,gy);
    };
    const pickGround=(clientX:number,clientY:number)=>{
      const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
      const nx=((clientX-rect.left)/rect.width)*2-1,ny=1-((clientY-rect.top)/rect.height)*2;
      const p=stateRef.current.position;
      const tx=p.x+.5,tz=p.y+.5,ty=.8;
      // BUILD 984: street view uses the eye-level camera, not the orbit
      // camera — the old code always used orbit math, so street-view
      // taps mis-picked (BUILD 983 delta #4). Branching here fixes both
      // street-view tap-to-move and placement taps.
      let eyeX:number,eyeZ:number,eyeY:number,forward:number[];
      if(streetViewRef.current){
        eyeX=tx;eyeZ=tz;eyeY=1.6;
        forward=[-Math.sin(yaw)*Math.cos(lookPitch),Math.sin(lookPitch),-Math.cos(yaw)*Math.cos(lookPitch)];
      } else {
        eyeX=tx+Math.sin(yaw)*zoom*Math.cos(pitch);eyeZ=tz+Math.cos(yaw)*zoom*Math.cos(pitch);eyeY=ty+zoom*Math.sin(pitch);
        forward=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
      }
      const right=[Math.cos(yaw),0,-Math.sin(yaw)];
      const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
      const scale=Math.tan(Math.PI/6),aspect=rect.width/rect.height;
      const dx=forward[0]+right[0]*nx*scale*aspect+up[0]*ny*scale;
      const dy=forward[1]+right[1]*nx*scale*aspect+up[1]*ny*scale;
      const dz=forward[2]+right[2]*nx*scale*aspect+up[2]*ny*scale;
      if(dy>=-0.001)return null;
      const t=-eyeY/dy;if(t<=0)return null;
      const x=eyeX+dx*t-.5,y=eyeZ+dz*t-.5;
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=world.w||y>=world.h)return null;
      return {x,y};
    };
    const wheel=(e:WheelEvent)=>{e.preventDefault();zoom=Math.max(4,Math.min(32,zoom+e.deltaY*.012));};
    const keys=new Set<string>();
    const keydown=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','f',' '].includes(k)){e.preventDefault();keys.add(k);}};
    const keyup=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
    const down=(e:PointerEvent)=>{if((e.target as HTMLElement).closest('button'))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){drag=true;gestureMoved=false;gestureStartX=e.clientX;gestureStartY=e.clientY;lx=e.clientX;ly=e.clientY;}else{drag=false;gestureMoved=true;pinchDistance=pointerDistance();}canvas.setPointerCapture?.(e.pointerId)};
    const pointerDistance=()=>{const pts=[...pointers.values()];return pts.length<2?0:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)};
    const move=(e:PointerEvent)=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>=2){const distance=pointerDistance();if(pinchDistance>0&&distance>0)zoom=Math.max(4,Math.min(32,zoom+(pinchDistance-distance)*.025));pinchDistance=distance;return;}if(!drag)return;
      if(Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>7)gestureMoved=true;
      if(!gestureMoved)return;
      yaw+=(e.clientX-lx)*.008;
      if(streetViewRef.current)lookPitch=Math.max(-.3,Math.min(.5,lookPitch+(e.clientY-ly)*.006));
      else pitch=Math.max(.22,Math.min(1.25,pitch+(e.clientY-ly)*.006));
      lx=e.clientX;ly=e.clientY;
    };
    const up=(e:PointerEvent)=>{const wasTap=pointers.size===1&&drag&&!gestureMoved&&Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)<=10;
      pointers.delete(e.pointerId);drag=false;pinchDistance=0;
      if(wasTap){
        const build=buildRef.current;
        if(build.palette||build.removeMode){
          // BUILD 984: a build-mode tap places or removes instead of
          // moving. Build taps never set moveTarget.
          const destination=pickGround(e.clientX,e.clientY);
          if(!destination){setMessage('Tap the ground to place');}
          else{
            const world=stateRef.current.world;
            const tx=Math.floor(destination.x),ty=Math.floor(destination.y);
            if(build.removeMode){
              // BUILD 987: placed items first (existing behavior), then
              // generated house (whole rect), then generated path tile.
              const removed=removePlacementAt(world,tx,ty);
              if(removed){saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);setMessage('Removed '+removed.kind);}
              else{
                const gen=removeGeneratedAt(world,tx,ty);
                if(gen){saveWorld(world);needsWorldRebuild.current=true;setMessage(gen.kind==='house'?'Removed house':'Removed path');}
                else setMessage('Nothing to remove here');
              }
            } else if(build.palette){
              const player=stateRef.current.position;
              const playerTile={x:Math.round(player.x),y:Math.round(player.y)};
              const npcTiles=npcActorsRef.current.filter(n=>n.alive).map(n=>({x:Math.round(n.x),y:Math.round(n.y)}));
              const result=validatePlacement(world,build.palette,tx,ty,playerTile,npcTiles);
              if(!result.ok){setMessage('Cannot place here: '+result.reason);}
              else{addPlacement(world,result.item);saveWorld(world);needsWorldRebuild.current=true;setPlacedCount(world.placements?.length??0);setMessage('Placed '+result.item.kind);}
            }
          }
        } else {
          const destination=pickGround(e.clientX,e.clientY);
          if(destination&&walkableAt(destination.x,destination.y)){moveTarget=destination;setMessage('Walking to destination');}
          else if(destination){setMessage('That destination is blocked');}
        }
      }
      if(pointers.size===1){const p=[...pointers.values()][0];lx=p.x;ly=p.y;drag=true;gestureMoved=true;}
    };
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
    const perspective=(f:number,a:number,n:number,far:number)=>{const t=1/Math.tan(f/2),nf=1/(n-far);return [t/a,0,0,0,0,t,0,0,0,0,(far+n)*nf,-1,0,0,2*far*n*nf,0]};
    const lookAt=(eye:number[],center:number[])=>{const norm=(v:number[])=>{const l=Math.hypot(...v)||1;return v.map(n=>n/l)};const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const sub=(a:number[],b:number[])=>a.map((n,i)=>n-b[i]);const z=norm(sub(eye,center)),x=norm(cross([0,1,0],z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1]};
    const mul=(a:number[],b:number[])=>{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o};
    const upload=(buffer:WebGLBuffer,data:Float32Array)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12)};
    const draw=()=>{
      const now=performance.now(),dt=Math.min(.05,Math.max(0,(now-lastFrameTime)/1000));lastFrameTime=now;
      // Smooth, non-grid movement with collision checks along the path. A tap
      // gives a continuous world-space destination and walking stops on release
      // of the path target, like the 2.5D game's tap-to-move behaviour.
      const current=stateRef.current;
      let player=current.position;
      walkingNow=false;
      let moveDx=0,moveDy=0,hasInput=false;
      if(moveTarget){
        moveDx=moveTarget.x-player.x;moveDy=moveTarget.y-player.y;
        if(Math.hypot(moveDx,moveDy)<.08){moveTarget=null;moveDx=0;moveDy=0;}
        else hasInput=true;
      }else{
        const held=[...keys].filter(k=>['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k));
        moveDx=(held.includes('d')||held.includes('arrowright')?1:0)-(held.includes('a')||held.includes('arrowleft')?1:0);
        moveDy=(held.includes('s')||held.includes('arrowdown')?1:0)-(held.includes('w')||held.includes('arrowup')?1:0);
        hasInput=moveDx!==0||moveDy!==0;
      }
      if(hasInput){
        // The player sprite is a camera-facing billboard, so choose its RPG
        // CAM direction from movement relative to the camera, not from camera
        // yaw alone. Positive screen-y points toward the camera/front of sprite.
        const screenDx=moveDx*Math.cos(yaw)-moveDy*Math.sin(yaw);
        const screenDy=moveDx*Math.sin(yaw)+moveDy*Math.cos(yaw);
        const octant=((Math.round(Math.atan2(screenDy,screenDx)/(Math.PI/4))%8)+8)%8;
        const movementFaces:Face8[]=['right','downright','down','downleft','left','upleft','up','upright'];
        playerFace=movementFaces[octant];
        const dist=Math.hypot(moveDx,moveDy),step=Math.min(dist,3.15*dt);
        const nx=player.x+moveDx/dist*step,ny=player.y+moveDy/dist*step;
        if(walkableAt(nx,ny)){player={x:nx,y:ny};current.position=player;walkingNow=true;}
        else{
          // Slide along walls while retaining smooth world-space movement.
          const sx=player.x+moveDx/dist*step,sy=player.y;
          const ax=player.x,ay=player.y+moveDy/dist*step;
          if(walkableAt(sx,sy)){player={x:sx,y:sy};current.position=player;walkingNow=true;}
          else if(walkableAt(ax,ay)){player={x:ax,y:ay};current.position=player;walkingNow=true;}
          else if(moveTarget){moveTarget=null;setMessage('Path blocked');}
        }
        if(moveTarget&&Math.hypot(moveTarget.x-player.x,moveTarget.y-player.y)<.08)moveTarget=null;
        if(walkingNow&&now-lastPositionPublish>90){lastPositionPublish=now;setPosition(player);}
        if(walkingNow&&now-lastPositionSave>400){lastPositionSave=now;try{localStorage.setItem(SAVE_KEY,JSON.stringify(player));}catch{}}
      }
      const dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;needsWorldRebuild.current=true}
      player=stateRef.current.position;
      // BUILD 983: the old code only rebuilt on resize/interactions, so
      // the 45×45 window went stale after walking ~20 tiles. Rebuild when
      // the player moves >8 tiles from the last build centre.
      if(Math.hypot(player.x-lastBuildX,player.y-lastBuildY)>8)needsWorldRebuild.current=true;
      if(needsWorldRebuild.current){const terrainVertices=buildWorldVertices(world,player);if(terrainVertices.length===0){setMessage('3D diagnostic: world generated zero terrain vertices');}else{upload(worldBuffer,terrainVertices);setMessage('3D diagnostic: '+(terrainVertices.length/6).toLocaleString()+' terrain vertices · '+world.w+'×'+world.h+' map');}needsWorldRebuild.current=false;lastBuildX=player.x;lastBuildY=player.y}
      gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      // Sky gradient pass (identity matrix, depth off), then the world.
      gl.disable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
      gl.uniformMatrix4fv(mLoc,false,new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
      gl.drawArrays(gl.TRIANGLES,0,6);
      gl.enable(gl.DEPTH_TEST);
      // Orbit around the player's tile center, not its top-left grid corner.
      // Keeping the camera target and orbit origin aligned prevents the player
      // sprite drifting sideways while the camera rotates; pitch now controls
      // the actual orbit elevation as well.
      const targetX=player.x+.5,targetZ=player.y+.5,targetY=.8;
      const horizontal=zoom*Math.cos(pitch);
      const ex=targetX+Math.sin(yaw)*horizontal,ez=targetZ+Math.cos(yaw)*horizontal,ey=targetY+zoom*Math.sin(pitch);
      // BUILD 983 street view: eye-level camera at the player, looking
      // along yaw with a slight up/down look pitch (yaw 0 faces north,
      // toward the castle backdrop). Far plane 200 so the castle ridge
      // (z=24, ~100 tiles north of town) stays inside the frustum.
      const mat=streetViewRef.current
        ? mul(perspective(Math.PI/3,w/h,.1,200),lookAt([targetX,1.6,targetZ],[targetX-Math.sin(yaw)*Math.cos(lookPitch)*10,1.6+Math.sin(lookPitch)*10,targetZ-Math.cos(yaw)*Math.cos(lookPitch)*10]))
        : mul(perspective(Math.PI/3,w/h,.1,200),lookAt([ex,ey,ez],[targetX,targetY,targetZ]));
      gl.uniformMatrix4fv(mLoc,false,new Float32Array(mat));
      gl.bindBuffer(gl.ARRAY_BUFFER,worldBuffer);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
      gl.drawArrays(gl.TRIANGLES,0,gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/24);const renderError=gl.getError();if(renderError!==gl.NO_ERROR)setMessage('3D WebGL draw error: 0x'+renderError.toString(16));
      const actors:number[]=[];
      const corpse=(x:number,z:number)=>{const color:Vec3=[.38,.18,.16],x0=x-.28,x1=x+.28,z0=z-.28,z1=z+.28,y0=0,y1=.18;const tri=(a:Vec3,b:Vec3,c:Vec3)=>{for(const p of [a,b,c])actors.push(...p,...color)};tri([x0,y0,z1],[x1,y0,z1],[x1,y1,z1]);tri([x0,y0,z1],[x1,y1,z1],[x0,y1,z1]);};
      for(const npc of npcActorsRef.current) if(!npc.looted&&!npc.alive&&Math.abs(npc.x-player.x)<22&&Math.abs(npc.y-player.y)<22)corpse(npc.x+.5,npc.y+.5);
      upload(actorBuffer,new Float32Array(actors));gl.drawArrays(gl.TRIANGLES,0,actors.length/6);
      if(playerSpriteProgram&&playerSpriteBuffer&&playerSpriteTexture){
        const rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);
        const face=playerFace;
        const drawNpcSprite=(x:number,z:number,base:RpgBase,frameIndex:number)=>{
          const half=.34,height=1.42,left=[x-rightX*half,0,z-rightZ*half],right=[x+rightX*half,0,z+rightZ*half];
          const topLeft=[left[0],height,left[2]],topRight=[right[0],height,right[2]];
          const data=new Float32Array([...left,0,1,...right,1,1,...topRight,1,0,...left,0,1,...topRight,1,0,...topLeft,0,0]);
          const im=rpgSprite(base,'Idle',face,frameIndex);
          if(!im?.complete||im.naturalWidth===0)return;
          gl.useProgram(playerSpriteProgram);
          const pAttr=gl.getAttribLocation(playerSpriteProgram,'p'),uvAttr=gl.getAttribLocation(playerSpriteProgram,'uv');
          gl.bindBuffer(gl.ARRAY_BUFFER,playerSpriteBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(pAttr);gl.vertexAttribPointer(pAttr,3,gl.FLOAT,false,20,0);
          gl.enableVertexAttribArray(uvAttr);gl.vertexAttribPointer(uvAttr,2,gl.FLOAT,false,20,12);
          gl.uniformMatrix4fv(gl.getUniformLocation(playerSpriteProgram,'m'),false,new Float32Array(mat));
          gl.bindTexture(gl.TEXTURE_2D,playerSpriteTexture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,1);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);
          gl.uniform1i(gl.getUniformLocation(playerSpriteProgram,'tex'),0);
          gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
          gl.drawArrays(gl.TRIANGLES,0,6);gl.depthMask(true);gl.disable(gl.BLEND);gl.useProgram(program);
        };
        // Use real RPG character sprites for the townspeople, not blue cubes.
        const npcBases:RpgBase[]=['BaseHumanMale','BaseElf','BaseDwarf','BaseHumanBlank','BaseShaman','BaseSkeleton','BaseAhoul'];
        npcActorsRef.current.forEach((npc,index)=>{
          if(npc.looted||!npc.alive||Math.abs(npc.x-player.x)>=22||Math.abs(npc.y-player.y)>=22)return;
          drawNpcSprite(npc.x+.5,npc.y+.5,npcBases[index%npcBases.length],(index+Math.floor(performance.now()/900))%4);
        });
        // BUILD 983: in street view the camera IS the player — hide the
        // player billboard or it fills the frame. NPC sprites still draw.
        if(!streetViewRef.current){
        const moving=walkingNow||[...keys].some(k=>['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k));
        const anim:RpgAnim=moving?'Walk':'Idle';
        const frameCount=moving?11:4;
        const frameIndex=moving?Math.floor(performance.now()/85)%frameCount:Math.floor(performance.now()/650)%frameCount;
        const px=player.x+.5,pz=player.y+.5,half=.34,height=1.48;
        // Use the source frame's measured opaque-foot anchor. The texture's
        // transparent rows are cropped away, so the visible feet touch y=0
        // instead of floating above the ground.
        const frameAnchor=rpgAnchorFor('BaseHumanMale',moving?'Walk':'Idle',face,frameIndex);
        const bottomV=Math.max(.72,Math.min(1,frameAnchor.cb/130));
        const left=[px-rightX*half,0,pz-rightZ*half],right=[px+rightX*half,0,pz+rightZ*half];
        const topLeft=[left[0],height,left[2]],topRight=[right[0],height,right[2]];
        const spriteData=new Float32Array([
          ...left,0,bottomV, ...right,1,bottomV, ...topRight,1,0,
          ...left,0,bottomV, ...topRight,1,0, ...topLeft,0,0
        ]);
        gl.useProgram(playerSpriteProgram);
        const sp=gl.getAttribLocation(playerSpriteProgram,'p'),su=gl.getAttribLocation(playerSpriteProgram,'uv');
        gl.bindBuffer(gl.ARRAY_BUFFER,playerSpriteBuffer);gl.bufferData(gl.ARRAY_BUFFER,spriteData,gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(sp);gl.vertexAttribPointer(sp,3,gl.FLOAT,false,20,0);
        gl.enableVertexAttribArray(su);gl.vertexAttribPointer(su,2,gl.FLOAT,false,20,12);
        gl.uniformMatrix4fv(gl.getUniformLocation(playerSpriteProgram,'m'),false,new Float32Array(mat));
        // Camera-relative eight-way facing matches the RPG pack's CAM0-7
        // mapping. Cycle through actual idle/walk frames rather than two
        // nonexistent placeholder URLs.

        const frame=rpgSprite('BaseHumanMale',anim,face,frameIndex);
        if(frame?.complete&&frame.naturalWidth>0){gl.bindTexture(gl.TEXTURE_2D,playerSpriteTexture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,frame);}
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,playerSpriteTexture);
        gl.uniform1i(gl.getUniformLocation(playerSpriteProgram,'tex'),0);
        gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES,0,6);gl.depthMask(true);gl.disable(gl.BLEND);gl.useProgram(program);
        }
      }
      raf=requestAnimationFrame(draw);
    };
    const tryMove=(dx:number,dy:number)=>{const nextX=Math.round(stateRef.current.position.x+dx),nextY=Math.round(stateRef.current.position.y+dy);const occupied=npcActorsRef.current.some(n=>Math.round(n.x)===nextX&&Math.round(n.y)===nextY);if(!occupied&&walkableWithPlacements(world,world.crates,nextX,nextY)){const next={x:nextX,y:nextY};stateRef.current.position=next;setPosition(next);try{localStorage.setItem(SAVE_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true}};
    const action=(e:KeyboardEvent)=>{if(e.type!=='keydown')return;const k=e.key.toLowerCase();const p=stateRef.current.position;
      if(k==='f'||k===' '){
        const target=npcActorsRef.current.filter(n=>n.alive&&Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
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
        const dead=npcActorsRef.current.find(n=>!n.alive&&Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1);
        if(dead){const currentInventory=inventoryRef.current;const next={...currentInventory,gold:(currentInventory.gold||0)+5,[dead.name+' loot']:(currentInventory[dead.name+' loot']||0)+1};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}dead.looted=true;try{localStorage.setItem(NPC_SAVE_KEY,JSON.stringify(npcActorsRef.current))}catch{}setMessage('Looted '+dead.name+': 5 gold and 1 keepsake');return}
        const near=npcActorsRef.current.find(n=>n.alive&&Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1);
        if(near){setMessage('You speak with '+near.name+'. They are going about their day.');return}
        const key=(x:number,y:number)=>Math.abs(x-p.x)<=1&&Math.abs(y-p.y)<=1;
        const crate=world.crates.find(c=>key(c.tx,c.ty));
        if(crate){world.crates=world.crates.filter(c=>c!==crate);saveWorld(world);const currentInventory=inventoryRef.current;const next={...currentInventory,wood:(currentInventory.wood||0)+1};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true;setMessage('Collected 1 wood');return}
        const rock=world.rocks.find(c=>key(c.tx,c.ty));
        if(rock){world.rocks=world.rocks.filter(c=>c!==rock);saveWorld(world);const currentInventory=inventoryRef.current;const next={...currentInventory,stone:(currentInventory.stone||0)+1};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true;setMessage('Mined 1 stone');return}
        const tree=world.trees.find(c=>key(c.tx,c.ty));
        if(tree){world.trees=world.trees.filter(c=>c!==tree);saveWorld(world);const currentInventory=inventoryRef.current;const next={...currentInventory,wood:(currentInventory.wood||0)+2};inventoryRef.current=next;setInventory(next);try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true;setMessage('Chopped tree · collected 2 wood');return}
        setMessage('Nothing close enough to interact with');return
      }
      // Directional keys are integrated continuously by the render loop;
      // never quantize movement into one-tile jumps.
    };
    window.addEventListener('keydown',action);
    // BUILD 983 screenshot harness: drive the street camera without UI.
    (window as any).__ag3dTest={
      setYaw:(v:number)=>{yaw=v},
      setLookPitch:(v:number)=>{lookPitch=v},
      setStreetView:(v:boolean)=>{streetViewRef.current=v;setStreetViewOn(v)},
      setPlayer:(x:number,y:number)=>{stateRef.current.position={x,y};setPosition({x,y});needsWorldRebuild.current=true},
      getPlacements:()=>JSON.parse(JSON.stringify(stateRef.current.world.placements??[])),
      getPlayer:()=>({...stateRef.current.position}),
      // BUILD 987 test hook (read-only): adapted-world summary for the
      // browser harness — hut rects, dirt keys, removed sets, placements.
      getWorldSummary:()=>({
        huts: stateRef.current.world.huts.map(h=>({x0:h.x0,y0:h.y0,x1:h.x1,y1:h.y1})),
        dirtKeys: Object.entries(stateRef.current.world.terrain).filter(([,t])=>t==='dirt').map(([k])=>k),
        removedHuts: stateRef.current.world.removedHuts??[],
        removedPaths: stateRef.current.world.removedPaths??[],
        placements: JSON.parse(JSON.stringify(stateRef.current.world.placements??[])),
      }),
    };
    draw();
    const npcTimer=window.setInterval(()=>{
      const actors=npcActorsRef.current;
      actors.forEach((actor,i)=>{
        if(!actor.alive)return;
        const authored=world.npcSpawns.find(n=>n.name===actor.name);
        if(!authored?.waypoints.length)return;
        const target=authored.waypoints[((actor.waypoint%authored.waypoints.length)+authored.waypoints.length)%authored.waypoints.length];
        const dx=target.tx-actor.x,dy=target.ty-actor.y;
        if(Math.abs(dx)<0.05&&Math.abs(dy)<0.05){actor.waypoint=(actor.waypoint+1)%authored.waypoints.length;return;}
        const sx=Math.abs(dx)>=Math.abs(dy)?Math.sign(dx):0,sy=sx===0?Math.sign(dy):0;
        const nx=Math.round(actor.x+sx),ny=Math.round(actor.y+sy);
        const player=stateRef.current.position;
        const occupied=(Math.round(player.x)===nx&&Math.round(player.y)===ny)||actors.some((other,j)=>j!==i&&Math.round(other.x)===nx&&Math.round(other.y)===ny);
        if(!occupied&&walkableWithPlacements(world,world.crates,nx,ny)){actor.x=nx;actor.y=ny;if(nx===target.tx&&ny===target.ty)actor.waypoint=(actor.waypoint+1)%authored.waypoints.length;}
      });
      try{localStorage.setItem(NPC_SAVE_KEY,JSON.stringify(actors))}catch{}
    },900);

    return()=>{cancelAnimationFrame(raf);window.clearInterval(npcTimer);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('keydown',action);window.removeEventListener('touchmove',stopTouch);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);html.style.overflow=oldHtml.overflow;html.style.touchAction=oldHtml.touchAction;html.style.overscrollBehavior=oldHtml.overscrollBehavior;body.style.overflow=oldBody.overflow;body.style.touchAction=oldBody.touchAction;body.style.overscrollBehavior=oldBody.overscrollBehavior;body.style.position=oldBody.position;body.style.width=oldBody.width;gl.deleteBuffer(worldBuffer);gl.deleteBuffer(actorBuffer);gl.deleteBuffer(skyBuffer);if(playerSpriteBuffer)gl.deleteBuffer(playerSpriteBuffer);if(playerSpriteTexture)gl.deleteTexture(playerSpriteTexture);if(playerSpriteProgram)gl.deleteProgram(playerSpriteProgram);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs)};
  },[]);
  const move=(dx:number,dy:number)=>{const world=stateRef.current.world;const p=stateRef.current.position;const length=Math.hypot(dx,dy)||1;const target={x:Math.max(0,Math.min(world.w-1,p.x+dx/length*3)),y:Math.max(0,Math.min(world.h-1,p.y+dy/length*3))};if(walkableWithPlacements(world,world.crates,Math.round(target.x),Math.round(target.y))){try{localStorage.setItem(SAVE_KEY,JSON.stringify(target))}catch{}stateRef.current.position=target;setPosition(target);needsWorldRebuild.current=true }};
  return <div data-testid="game-view-3d" style={{position:'fixed',inset:0,zIndex:20000,overflow:'hidden',background:'#789ebf',touchAction:'none',fontFamily:'system-ui,sans-serif'}}>
    <canvas ref={canvasRef} aria-label="3D Adventure world" style={{width:'100%',height:'100%',display:'block',touchAction:'none'}}/>
    <div style={{position:'absolute',left:10,top:10,padding:'7px 10px',borderRadius:8,background:'#14241ddf',color:'#f2f7f2',font:'700 11px/1.4 system-ui',pointerEvents:'none'}}>ADVENTURE 3D · WORLD SIMULATION <span style={{opacity:.8,fontWeight:400}}>Editable terrain · collision · walking NPC schedules · saved progress</span></div>
    <div style={{position:'absolute',left:10,bottom:14,padding:'7px 10px',borderRadius:8,background:'#14241ddf',color:'#fff',fontSize:12}}>{message} · {Math.round(position.x)},{Math.round(position.y)}<div style={{marginTop:5}}>HP {health}/100 · Wood {inventory.wood||0} · Stone {inventory.stone||0} · Gold {inventory.gold||0}</div><div style={{opacity:.8,marginTop:3}}>Tap ground to move · drag to rotate · pinch to zoom · E: interact · F/Space: attack</div></div>
    <button type="button" onClick={onExit} style={{position:'absolute',right:12,top:12,zIndex:4,padding:'10px 13px',border:'1px solid #c4d1bd',borderRadius:9,background:'#172c23e8',color:'#fff',fontWeight:700}}>Exit 3D</button>
    <button type="button" data-testid="street-view-toggle" onClick={()=>{const v=!streetViewRef.current;streetViewRef.current=v;setStreetViewOn(v);}} style={{position:'absolute',right:12,top:58,zIndex:4,padding:'10px 13px',border:'1px solid #c4d1bd',borderRadius:9,background:'#172c23e8',color:'#fff',fontWeight:700}}>Street view: {streetViewOn?'On':'Off'}</button>
    {/* BUILD 984 placement tool: bottom-right, clear of Options (top-right),
        the Street view toggle (top:58), and the diagnostic (bottom-left). */}
    <button type="button" data-testid="build-toggle" onClick={()=>setBuildOpen(v=>!v)} style={{position:'absolute',right:12,bottom:14,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:(buildOpen||palette||removeMode)?'#526d42':'#172c23e8',color:'#fff',fontWeight:700,fontSize:16}}>Build</button>
    {buildOpen&&<div data-testid="build-panel" style={{position:'absolute',right:12,bottom:76,zIndex:4,width:248,padding:14,borderRadius:12,background:'#172c23f5',border:'1px solid #8c9b8d',color:'#fff',fontFamily:'system-ui,sans-serif'}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <strong style={{flex:1,fontSize:15}}>Build — free, no resource cost</strong>
        <button type="button" data-testid="build-minimize" title="Minimize (keeps your tool)" onClick={()=>setBuildOpen(false)} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,lineHeight:1}}>—</button>
        <button type="button" data-testid="build-close" title="Close (clears your tool)" onClick={()=>{setBuildOpen(false);setPalette(null);setRemoveMode(false);buildRef.current={palette:null,removeMode:false};}} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,lineHeight:1}}>×</button>
      </div>
      <div style={{fontSize:12,opacity:.85,marginTop:4,lineHeight:1.4}}>Tap an item, then tap the ground to place it. Tap Remove, then an item, path, or house to take it down. Minimize (—) keeps your tool; close (×) clears it.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
        {(['path','house','tree','stall','grass'] as PaletteKind[]).map(kind=><button key={kind} type="button" data-testid={'build-palette-'+kind} onClick={()=>{const next=palette===kind?null:kind;setPalette(next);setRemoveMode(false);buildRef.current={palette:next,removeMode:false};}} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:palette===kind?'#526d42':'#22392d',color:'#fff',fontWeight:palette===kind?700:500,fontSize:14}}>{{path:'Pathway',house:'House',tree:'Tree',stall:'Market Stall',grass:'Grass'}[kind]}</button>)}
      </div>
      <button type="button" data-testid="build-remove-toggle" onClick={()=>{const next=!removeMode;setRemoveMode(next);if(next)setPalette(null);buildRef.current={palette:next?null:palette,removeMode:next};}} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:removeMode?'#7a3b2e':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Remove: {removeMode?'On':'Off'}</button>
      <div data-testid="build-count" style={{fontSize:12,opacity:.85,marginTop:10}}>Placed: {placedCount}</div>
      <div style={{fontSize:11,opacity:.7,marginTop:6,lineHeight:1.4}}>Placed houses are decorative for now — no interior yet. Placed items show in 3D mode; the 2.5D view does not show them yet.</div>
    </div>}
  </div>;
}
