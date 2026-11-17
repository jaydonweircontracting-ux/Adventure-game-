// BUILD 1077 (NEURON HEX 0x0D, area 7): the HUD/interface —
// the presentational layer that used to live inline in
// Engine3DWorldView.tsx: the minimap + world-map components, the
// asset preview canvas, the HUD strip, the wait sheet/progress,
// the top-left control buttons, the Build cluster, and the
// interior/car buttons. Behavior-preserving: the three standalone
// components move verbatim (only `export` is added); the
// presentational components reuse the view's own JSX with ONLY
// the handler bindings changed from view-scope closures to props.
// The Build panel + import hub JSX stays in the view: its prop
// surface is ~40 fields incl. the import hub's whole state machine
// — a rewrite, not an extraction. The preview overlay divs stay
// too (DOM-write refs owned by the pointer handlers). No crafting
// system exists in 3D yet (separate program, awaiting the user's
// go-ahead); this module is the interface only.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { inBounds, type HutRect, type IsoWorld } from '../iso/isoWorld';
import { effTerrainFor, renderTerrain, wildTreeAt } from './wildTerrain';
import { buildMinimap3dFrame, paintMinimap3d, minimap3dTapToWorld, MINIMAP3D_SIZE, MINIMAP3D_REDRAW_MS } from './minimap3d';
import { buildWorldMap3dFrame, paintWorldMap3d, worldmap3dCanvasToWorld, worldmap3dClampPan, worldmap3dPanForPlayer, worldmap3dTerrainLabel, WORLDMAP3D_SIZE, WORLDMAP3D_ZOOM_SCALES, WORLDMAP3D_DEFAULT_ZOOM } from './worldmap3d';
import { mineralMapColor } from './geology';
import { renderAssetPreview } from './assetLibrary';
import { type CustomAsset } from './customAssets';
import { formatDayClock, waitOptionsFor, waitRemainingLabel, WAIT_STEP_MINUTES } from './worldclock';
import { SEASON_EMOJI, seasonForDay, seasonLabel } from './climate';
import { type DayClock } from './townsfolk3d';
import { type StaminaState } from './sprint';
import { type Inventory3D } from './inventoryCrafting3d';
import { type BuildingInteractions } from './buildingInteractions3d';
import { type PaletteKind } from './placements';
import { type AreaSelection } from './areaSelect';
import { type FounderState } from './founders';
import { WILDERNESS_ONLY } from './wilderness';
import { classifySwipe, SWIPE_HANDLE_MIN_PX } from './swipe';

// Asset preview canvas (BUILD 1045) — moved verbatim.
export function AssetPreviewCanvas({ asset, size, testid }: { asset: CustomAsset; size: number; testid: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const preview = renderAssetPreview(asset, size);
    ctx.clearRect(0, 0, size, size);
    if (!preview) return;
    const img = new ImageData(new Uint8ClampedArray(preview.pixels), size, size);
    ctx.putImageData(img, 0, 0);
  }, [asset, size]);
  return <canvas ref={ref} width={size} height={size} data-testid={testid} style={{ display: 'block', width: size, height: size, borderRadius: 6, background: '#d8e2d4', border: '1px solid rgba(255,255,255,.25)' }} />;
}

// BUILD 1053: 3D minimap — circular, north-up, player-centred, TOP-LEFT.
// Top-left is the only free corner: top-right holds Exit 3D + Options
// (and the Options dialog below it), the right edge is the Build
// cluster (bottom 14–448), bottom-left is the HUD strip, bottom-centre
// is Enter/Exit. 120px like the 2D minimap. The parent gates visibility
// (hidden inside a hut, while Hide UI is on, and while the world map
// is open — BUILD 1055 added the overlay, so the third hide condition
// exists now).
// Redraw is throttled: immediately when the player's tile changes,
// plus a 250ms interval so NPC/car dots stay live while the player
// stands still — never per frame, and the frame builder samples one
// effTerrain closure over a 61x61 window only (the BUILD 1050 lesson).
// Tap-to-travel goes through the same 1030 A* path as a field tap,
// via the travelRequestRef bridge (moveTarget lives in the frame-loop
// effect's closure, not at component level).
export function Minimap3D({ world, playerX, playerY, npcsRef, foundersRef, car, onTapTravel }: {
  world: IsoWorld;
  playerX: number;
  playerY: number;
  npcsRef: { current: Array<{ x: number; y: number; alive: boolean }> | null };
  foundersRef: { current: FounderState[] | null };
  car: { x: number; y: number } | null;
  onTapTravel: (dest: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileX = Math.round(playerX);
  const tileY = Math.round(playerY);
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const g = canvas.getContext('2d');
      if (!g) return;
      const frame = buildMinimap3dFrame({
        terrainAt: effTerrainFor(world),
        // BUILD 1061: forest on the minimap — the same tree closure
        // the world map uses (stored list in-map, wild rule past the
        // edge, chopped wild trees excluded), so the map can never
        // show a forest where no tree stands.
        treeAt: (() => {
          const treeSet = new Set((world.trees ?? []).map((t) => t.tx + ',' + t.ty));
          const removedWild = new Set(world.removedWildTrees ?? []);
          return (x: number, y: number) => {
            if (inBounds(world, x, y)) return treeSet.has(x + ',' + y);
            return wildTreeAt(x, y) && !removedWild.has(x + ',' + y);
          };
        })(),
        playerX, playerY,
        huts: world.huts, stalls: world.stalls,
        placements: world.placements ?? [],
        // BUILD 1081: live deposits on the minimap (mineral-tinted
        // dots) — the deposits the map can point at. Mined-out
        // deposits have nothing left to find, so they are not shown.
        deposits: (world.mineralDeposits ?? []).filter((d) => d.remaining > 0).map((d) => ({ x: d.x, y: d.y, color: mineralMapColor(d.mineral) })),
        landmarks: world.landmarks ?? [],
        npcs: [...(npcsRef.current ?? []).filter((n) => n.alive).map((n) => ({ x: n.x, y: n.y })), ...(foundersRef.current ?? []).map((f) => ({ x: f.x, y: f.y }))],
        car,
      });
      paintMinimap3d(g, frame);
    };
    draw();
    const id = window.setInterval(draw, MINIMAP3D_REDRAW_MS);
    return () => window.clearInterval(id);
  }, [world, tileX, tileY, car]);
  return (
    <canvas
      ref={canvasRef}
      data-testid="minimap-3d-canvas"
      width={MINIMAP3D_SIZE}
      height={MINIMAP3D_SIZE}
      aria-label="Minimap — tap to move"
      onPointerDown={(e) => {
        const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const dest = minimap3dTapToWorld(e.clientX - rect.left, e.clientY - rect.top, playerX, playerY);
        if (dest) onTapTravel(dest);
      }}
      style={{
        position: 'absolute', left: 12, top: 'max(12px, env(safe-area-inset-top))', zIndex: 4,
        width: MINIMAP3D_SIZE, height: MINIMAP3D_SIZE, borderRadius: '50%',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)', cursor: 'crosshair', touchAction: 'manipulation',
      }}
    />
  );
}

// BUILD 1055: 3D overworld map — full-screen overlay, whole world.
// The Map button sits below the minimap (top-left, left:12, top:140 —
// the only free slot in that corner; top-right holds Exit 3D +
// Options, the right edge is the Build cluster, bottom-left is the
// HUD strip). The overlay follows the 2D WorldMap modal's UX: opens
// centered on the player, zoom buttons, drag to pan, tap a place to
// walk there, close button, minimap hidden while it is open, game
// keeps running (the 2D map only locks input; it does not pause).
// The canvas draws ONCE per open/zoom (never per frame — the BUILD
// 1050 lesson); pan is a CSS transform on the wrapper, like the 2D
// atlas. The terrain comes from effTerrainFor (the same definition
// the renderer uses), trees from the world tree list + wildTreeAt —
// so the map can never disagree with the surface. Tap-to-travel
// reuses the 1030 A* bridge (travelRequestRef), exactly like the
// minimap tap; the map closes when a journey starts.
export function WorldMap3D({ world, playerX, playerY, day, onClose, onTapTravel }: {
  world: IsoWorld;
  playerX: number;
  playerY: number;
  day: number;
  onClose: () => void;
  onTapTravel: (dest: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(WORLDMAP3D_DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  const tileX = Math.round(playerX);
  const tileY = Math.round(playerY);
  const zoomScale = WORLDMAP3D_ZOOM_SCALES[zoom];
  // Lock body scroll while the map is open (the 2D modal does the
  // same for iOS Safari); the 3D view is full-screen, but the lock
  // is harmless and keeps a swipe panning the map, never the page.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  // Draw once per open / zoom / player-tile change. The player cannot
  // move while the overlay is open (it covers the field), so the tile
  // dep is a safety net, not a redraw loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const treeSet = new Set((world.trees ?? []).map((t) => t.tx + ',' + t.ty));
    const removedWild = new Set(world.removedWildTrees ?? []);
    const eff = effTerrainFor(world);
    const frame = buildWorldMap3dFrame({
      terrainAt: (x, y) => renderTerrain(eff, x, y),
      treeAt: (x, y) => {
        if (inBounds(world, x, y)) return treeSet.has(x + ',' + y);
        return wildTreeAt(x, y) && !removedWild.has(x + ',' + y);
      },
      playerX, playerY,
      // BUILD 1081: live deposits on the world map (same dots as
      // the minimap, mineral-tinted) — the full deposit inventory
      // at a glance, including deposits far from the player.
      deposits: (world.mineralDeposits ?? []).filter((d) => d.remaining > 0).map((d) => ({ x: d.x, y: d.y, color: mineralMapColor(d.mineral) })),
    });
    paintWorldMap3d(g, frame);
  }, [world, zoom, tileX, tileY, playerX, playerY]);
  // Open centered on the player (the 2D modal centers on the player's
  // chunk the same way). Runs once on mount.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setPan(worldmap3dPanForPlayer(playerX, playerY, zoomScale, stage.clientWidth, stage.clientHeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clampPan = (x: number, y: number, scale: number) => {
    const stage = stageRef.current;
    if (!stage) return { x, y };
    return worldmap3dClampPan(x, y, scale, stage.clientWidth, stage.clientHeight);
  };
  const changeZoom = (next: number) => {
    const clamped = Math.min(WORLDMAP3D_ZOOM_SCALES.length - 1, Math.max(0, next));
    const oldScale = WORLDMAP3D_ZOOM_SCALES[zoom];
    const newScale = WORLDMAP3D_ZOOM_SCALES[clamped];
    const ratio = newScale / oldScale;
    setZoom(clamped);
    // Zoom anchors on the viewport center (the 2D modal does the
    // same): scale pan by the ratio so the point under the center
    // stays under it instead of drifting to a corner.
    setPan((p) => clampPan(p.x * ratio, p.y * ratio, newScale));
  };
  const onStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  };
  const onStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) setPan(clampPan(drag.panX + dx, drag.panY + dy, zoomScale));
  };
  const endStageDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    // A tap (no drag) travels to the tile under the finger — the
    // minimap's tap-to-travel, through the same 1030 A* bridge. The
    // map closes so the player sees the world as they walk. The
    // canvas rect already accounts for the wrapper's pan/scale.
    if (drag && !drag.moved) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) {
          const px = ((e.clientX - rect.left) / rect.width) * WORLDMAP3D_SIZE;
          const py = ((e.clientY - rect.top) / rect.height) * WORLDMAP3D_SIZE;
          const dest = worldmap3dCanvasToWorld(px, py);
          if (dest) {
            onTapTravel(dest);
            onClose();
          }
        }
      }
    }
  };
  const hereTerrain = renderTerrain(effTerrainFor(world), tileX, tileY);
  return (
    <div data-testid="world-map-overlay" role="dialog" aria-modal="true" aria-label="World map" style={{ position: 'absolute', inset: 0, zIndex: 10, background: '#0a100c', display: 'flex', flexDirection: 'column', color: '#fff', paddingTop: 'max(58px, calc(env(safe-area-inset-top) + 50px))' }}>
      {/* Top padding clears the host Options button: the overlay lives
          inside the 3D view's own stacking context (game-view-3d is
          position:fixed zIndex 20000), so no z-index here can ever put
          it above the host Options button (fixed, zIndex 30002) — the
          button floats above the overlay's top-right corner by design.
          The padding (the same offset the Options dialog itself uses)
          keeps every overlay control below the button instead of
          fighting it. zIndex 10 already beats everything inside the
          3D view (Build panel 4, minimap 4, Enter/Exit 6). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <strong style={{ flex: 1, fontSize: 16 }}>World Map</strong>
        <span data-testid="world-map-season" style={{ fontSize: 12, fontWeight: 700 }}>{SEASON_EMOJI[seasonForDay(day)]} {seasonLabel(seasonForDay(day))}</span>
        <span data-testid="world-map-area-label" style={{ fontSize: 12, opacity: 0.85 }}>{worldmap3dTerrainLabel(hereTerrain)} · ({tileX}, {tileY})</span>
        <button type="button" data-testid="world-map-close" aria-label="Close world map" onClick={onClose} style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid #c4d1bd', background: '#22392d', color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 10px' }}>
        <span style={{ flex: 1, fontSize: 12, opacity: 0.75 }}>Drag to look around · Tap a place to walk there</span>
        <div aria-label="Map zoom controls" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" data-testid="world-map-zoom-out" aria-label="Zoom out" disabled={zoom === 0} onClick={() => changeZoom(zoom - 1)} style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid #c4d1bd', background: '#22392d', color: '#fff', fontWeight: 700, fontSize: 16, opacity: zoom === 0 ? 0.45 : 1 }}>−</button>
          <span data-testid="world-map-zoom-level" style={{ fontSize: 13, minWidth: 44, textAlign: 'center' }}>×{zoomScale}</span>
          <button type="button" data-testid="world-map-zoom-in" aria-label="Zoom in" disabled={zoom === WORLDMAP3D_ZOOM_SCALES.length - 1} onClick={() => changeZoom(zoom + 1)} style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid #c4d1bd', background: '#22392d', color: '#fff', fontWeight: 700, fontSize: 16, opacity: zoom === WORLDMAP3D_ZOOM_SCALES.length - 1 ? 0.45 : 1 }}>+</button>
        </div>
      </div>
      <div ref={stageRef} data-testid="world-map-stage" style={{ position: 'relative', flex: 1, overflow: 'hidden', touchAction: 'none' }}
        onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={endStageDrag} onPointerCancel={() => { dragRef.current = null; }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: 12, top: 8, zIndex: 2, fontSize: 13, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.8)', pointerEvents: 'none' }}>N ↑</span>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: WORLDMAP3D_SIZE, height: WORLDMAP3D_SIZE, marginLeft: -WORLDMAP3D_SIZE / 2, marginTop: -WORLDMAP3D_SIZE / 2, transformOrigin: 'center', transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + zoomScale + ')' }}>
          <canvas ref={canvasRef} data-testid="world-map-canvas" width={WORLDMAP3D_SIZE} height={WORLDMAP3D_SIZE} aria-label="Overworld map" style={{ display: 'block', width: WORLDMAP3D_SIZE, height: WORLDMAP3D_SIZE }} />
        </div>
      </div>
    </div>
  );
}

export interface HudCampUi { wood: number; stone: number; food: number; grain: number; hut: string; storehouse: string; forest: string; }

export interface HudStripProps {
  message: string;
  clockUi: DayClock;
  health: number;
  staminaUi: StaminaState;
  sprintingUi: boolean;
  sprintLatchedUi: boolean;
  sprintRearmUi: boolean;
  inventory: Inventory3D;
  campUi: HudCampUi;
  onWaitToggle: () => void;
  onSprintPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onSprintPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onSprintPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

export function HudStrip(props: HudStripProps) {
  const { message, clockUi, health, staminaUi, sprintingUi, sprintLatchedUi, sprintRearmUi, inventory, campUi, onWaitToggle, onSprintPointerDown, onSprintPointerUp, onSprintPointerCancel } = props;
  return (
    <div data-testid="hud-text" style={{position:'absolute',left:10,bottom:10,maxWidth:260,padding:'6px 10px',borderRadius:8,background:'#14241ddf',color:'#fff',fontSize:12}}>
      <div title={message} style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:240}}>{message}</div>
      {/* BUILD 1056: world clock readout + Wait button — the clock reads
          the real 3D day clock (clockUi refreshes every second), same
          format as the 2D game minus the year (the 3D clock has none).
          Lives in the HUD strip, so Hide UI hides it with the rest. */}
      <div style={{marginTop:2,display:'flex',alignItems:'center',gap:6}}><span data-testid="clock-readout" style={{fontWeight:700}}>🕐 {formatDayClock(clockUi)}</span><span data-testid="season-readout" style={{fontWeight:700}}>{SEASON_EMOJI[seasonForDay(clockUi.day)]} {seasonLabel(seasonForDay(clockUi.day))}</span><button type="button" data-testid="wait-open" aria-label="Wait" onClick={onWaitToggle} style={{padding:'2px 8px',border:'1px solid #c4d1bd',borderRadius:6,background:'#22392d',color:'#fff',fontWeight:700,fontSize:11,lineHeight:1.4}}>⏳ Wait</button></div>
      <div style={{marginTop:2}}>HP {health}/100<div style={{display:'inline-block',width:80,height:8,marginLeft:6,borderRadius:4,background:'#3a4a3f',verticalAlign:'middle',overflow:'hidden'}}><div data-testid="hp-bar" style={{width:health+'%',height:'100%',background:'#5fbf6f'}} /></div></div>
      <div style={{marginTop:2}}>Stamina {Math.round(staminaUi.stamina)}/100<div style={{display:'inline-block',width:100,height:8,marginLeft:6,borderRadius:4,background:'#3a4a3f',verticalAlign:'middle',overflow:'hidden'}}><div data-testid="sprint-stamina-bar" style={{width:Math.round(staminaUi.stamina)+'%',height:'100%',background:staminaUi.exhausted?'#c0392b':'#5fbf6f'}} /></div>{staminaUi.exhausted?' · Tired':''}</div>
      {/* BUILD 1028: the Sprint control is a SMALL icon at the bottom
          next to Gold — the big right-side button is gone. Same
          handlers, same state (tap-to-toggle latch, "Release!" while
          the rearm gate is armed, "Tired" while exhausted, green
          while sprinting); only the size and the seat changed. The
          stamina bar above keeps its sprint-stamina-bar testid, and
          the icon keeps the sprint-toggle testid the 1026 probes use.
          Consequence, stated: Hide UI hides this whole strip, so the
          icon hides with it (the old button stayed visible) — the
          user asked for it next to Gold, which lives in this strip. */}
      <div style={{marginTop:2,display:'flex',alignItems:'center',flexWrap:'wrap',gap:6}}><span>Wood {inventory.wood||0} · Stone {inventory.stone||0} · Gold {inventory.gold||0} · Wheat {inventory.wheat||0}</span><button type="button" data-testid="sprint-toggle" aria-label="Sprint" title="Sprint (tap to toggle)" onPointerDown={onSprintPointerDown} onPointerUp={onSprintPointerUp} onPointerCancel={onSprintPointerCancel} onContextMenu={(e)=>e.preventDefault()} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 6px',border:'1px solid #c4d1bd',borderRadius:6,background:(sprintingUi||sprintLatchedUi)&&!staminaUi.exhausted?'#3f7d4e':staminaUi.exhausted?'#5a3a2e':'#22392d',color:'#fff',fontWeight:700,fontSize:11,lineHeight:1,opacity:staminaUi.exhausted?0.65:1,touchAction:'none',WebkitTouchCallout:'none',userSelect:'none'}}><span style={{fontSize:13}}>⚡</span><span>{staminaUi.exhausted?'Tired':sprintRearmUi?'Release!':sprintLatchedUi?'Sprinting':'Sprint'}</span></button></div>
      {/* BUILD 1057: the founders' camp — the real stockpile count
          (wood delivered by the founders) and the shared food stock.
          Lives in the HUD strip, so Hide UI hides it with the rest. */}
      <div style={{marginTop:2}}><span data-testid="camp-stockpile">🏕️ Camp · Wood {campUi.wood} · Stone {campUi.stone} · Food {campUi.food} · Grain {campUi.grain} · Hut {campUi.hut} · Storehouse {campUi.storehouse} · Forest {campUi.forest}%</span></div>
    </div>
  );
}

export interface WaitSheetProps {
  clockUi: DayClock;
  onStartWait: (minutes: number, label: string) => void;
  onClose: () => void;
}

export function WaitSheet({ clockUi, onStartWait, onClose }: WaitSheetProps) {
  return (
      <div data-testid="wait-sheet" style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',zIndex:30,width:280,padding:14,borderRadius:12,border:'1px solid #c4d1bd',background:'#172c23f2',color:'#fff'}}>
        <div style={{fontWeight:700,fontSize:16}}>Wait</div>
        <div style={{fontSize:12,opacity:.85,marginTop:2,lineHeight:1.4}}>Time passes — the sun, the lights and the rain move with it. A wolf attack ends the wait.</div>
        {waitOptionsFor(clockUi).map(o=>(
          <button key={o.id} type="button" data-testid={'wait-option-'+o.id} onClick={()=>onStartWait(o.minutes,o.label)} style={{display:'block',width:'100%',textAlign:'left',marginTop:6,padding:'10px 12px',border:'1px solid #c4d1bd',borderRadius:9,background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>{o.label}</button>
        ))}
        <button type="button" data-testid="wait-close" onClick={onClose} style={{display:'block',width:'100%',marginTop:10,padding:'8px 12px',border:'1px solid #c4d1bd',borderRadius:9,background:'transparent',color:'#fff',fontWeight:700,fontSize:14}}>Close</button>
      </div>
  );
}

export interface WaitProgressValue { done: number; total: number; label: string; }

export interface WaitProgressProps {
  progress: WaitProgressValue;
  clockUi: DayClock;
  onCancel: () => void;
}

export function WaitProgress({ progress: waitProgress, clockUi, onCancel }: WaitProgressProps) {
  return (
      <div data-testid="wait-progress" style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',zIndex:30,width:280,padding:14,borderRadius:12,border:'1px solid #c4d1bd',background:'#172c23f2',color:'#fff',textAlign:'center'}}>
        <div style={{fontWeight:700,fontSize:16}}>Waiting…</div>
        <div style={{fontSize:12,opacity:.85,marginTop:4}}>{waitProgress.label} · {waitRemainingLabel((waitProgress.total-waitProgress.done)*WAIT_STEP_MINUTES)}</div>
        <div style={{height:8,marginTop:10,borderRadius:4,background:'#3a4a3f',overflow:'hidden'}}><div style={{width:(waitProgress.done/waitProgress.total*100)+'%',height:'100%',background:'#5fbf6f'}} /></div>
        <div data-testid="wait-clock" style={{fontSize:13,marginTop:8,fontWeight:700}}>🕐 {formatDayClock(clockUi)}</div>
        <button type="button" data-testid="wait-cancel" onClick={onCancel} style={{marginTop:10,padding:'8px 16px',border:'1px solid #c4d1bd',borderRadius:9,background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Cancel</button>
      </div>
  );
}

export interface TopLeftButtonsProps {
  onToggleMap: () => void;
  onToggleControl: () => void;
}

export function TopLeftButtons({ onToggleMap, onToggleControl }: TopLeftButtonsProps) {
  return (
    <>
    <button type="button" data-testid="world-map-open" aria-label="Open world map" onClick={onToggleMap} style={{position:'absolute',left:12,top:140,zIndex:4,padding:'10px 16px',border:'1px solid #c4d1bd',borderRadius:9,background:'#172c23e8',color:'#fff',fontWeight:700,fontSize:15}}>🗺 Map</button>
    <button type="button" data-testid="control-center-open" aria-label="Open Control Center" onClick={onToggleControl} style={{position:'absolute',left:12,top:188,zIndex:4,padding:'10px 16px',border:'1px solid #c4d1bd',borderRadius:9,background:'#172c23e8',color:'#fff',fontWeight:700,fontSize:15}}>🎛 Control</button>
    </>
  );
}

export interface BuildClusterProps {
  buildOpen: boolean;
  buildMinimized: boolean;
  palette: PaletteKind | null;
  customSelection: string | null;
  removeMode: boolean;
  moveMode: boolean;
  saveAreaMode: boolean;
  pasteName: string | null;
  areaSelectMode: boolean;
  areaSelection: AreaSelection | null;
  walkSuspended: boolean;
  undoAvailable: boolean;
  redoAvailable: boolean;
  driving: boolean;
  insideHut: boolean;
  buildIx: BuildingInteractions;
  handleSwipeRef: { current: { id: number; x: number; y: number } | null };
  onToggleBuild: () => void;
  onOpenBuild: () => void;
  onSummonCar: () => void;
}

export function BuildCluster(props: BuildClusterProps) {
  const { buildOpen, buildMinimized, palette, customSelection, removeMode, moveMode, saveAreaMode, pasteName, areaSelectMode, areaSelection, walkSuspended, undoAvailable, redoAvailable, driving, insideHut, buildIx, handleSwipeRef, onToggleBuild, onOpenBuild, onSummonCar } = props;
  return (
    <>
    <button type="button" data-testid="build-toggle" onClick={onToggleBuild} style={{position:'absolute',right:12,bottom:14,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:(buildOpen||palette||removeMode||moveMode)?'#526d42':'#172c23e8',color:'#fff',fontWeight:700,fontSize:16}}>Build</button>
    {!WILDERNESS_ONLY&&<button type="button" data-testid="car-summon" disabled={driving||!!insideHut} onClick={onSummonCar} style={{position:'absolute',right:12,bottom:262,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:'#7a1f1f',color:'#fff',fontWeight:700,fontSize:16,opacity:(driving||insideHut)?0.45:1}}>Car</button>}
    {!buildOpen&&(palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName||areaSelectMode||areaSelection)&&<button type="button" data-testid="build-walk-toggle" onClick={()=>buildIx.setWalk(!walkSuspended)} style={{position:'absolute',right:12,bottom:76,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:walkSuspended?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:16}}>{walkSuspended?(buildIx.walkToolLabel()?'Resume '+buildIx.walkToolLabel():'Resume'):'Walk'}</button>}
    {!buildOpen&&((palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName||areaSelectMode||areaSelection)||undoAvailable||redoAvailable)&&<button type="button" data-testid="build-undo" disabled={!undoAvailable} onClick={buildIx.doUndo} style={{position:'absolute',right:12,bottom:138,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,opacity:undoAvailable?1:0.45}}>Undo</button>}
    {!buildOpen&&((palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName||areaSelectMode||areaSelection)||undoAvailable||redoAvailable)&&<button type="button" data-testid="build-redo" disabled={!redoAvailable} onClick={buildIx.doRedo} style={{position:'absolute',right:12,bottom:200,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,opacity:redoAvailable?1:0.45}}>Redo</button>}
    {!buildOpen&&((palette||customSelection||removeMode||moveMode||saveAreaMode||pasteName||areaSelectMode||areaSelection)||undoAvailable||redoAvailable)&&<button type="button" data-testid="build-remove-quick-toggle" onClick={buildIx.toggleRemove} style={{position:'absolute',right:12,bottom:324,zIndex:4,padding:'14px 18px',border:'1px solid #c4d1bd',borderRadius:12,background:removeMode?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:16}}>Remove</button>}
    {buildMinimized&&<button type="button" data-testid="build-swipe-handle" title="Swipe or tap to reopen Build" onClick={onOpenBuild} onPointerDown={(e)=>{handleSwipeRef.current={id:e.pointerId,x:e.clientX,y:e.clientY};}} onPointerMove={(e)=>{const s=handleSwipeRef.current;if(!s||s.id!==e.pointerId)return;const d=classifySwipe(e.clientX-s.x,e.clientY-s.y,SWIPE_HANDLE_MIN_PX);if(d==='left'||d==='right'){handleSwipeRef.current=null;onOpenBuild();}}} onPointerUp={(e)=>{if(handleSwipeRef.current?.id===e.pointerId)handleSwipeRef.current=null;}} onPointerCancel={(e)=>{if(handleSwipeRef.current?.id===e.pointerId)handleSwipeRef.current=null;}} style={{position:'absolute',right:0,bottom:392,zIndex:4,width:30,height:56,padding:0,border:'1px solid #c4d1bd',borderRight:'none',borderRadius:'9px 0 0 9px',background:'#526d42',color:'#fff',fontWeight:700,fontSize:20,touchAction:'none'}}>‹</button>}
    </>
  );
}

export interface InteriorCarButtonsProps {
  insideHut: boolean;
  driving: boolean;
  nearDoorHut: HutRect | null;
  nearCar: boolean;
  onEnterHut: () => void;
  onExitHut: () => void;
  onEnterCar: () => void;
  onExitCar: () => void;
}

export function InteriorCarButtons({ insideHut, driving, nearDoorHut, nearCar, onEnterHut, onExitHut, onEnterCar, onExitCar }: InteriorCarButtonsProps) {
  return (
    <>
    {!insideHut&&!driving&&nearDoorHut&&<button type="button" data-testid="interior-enter" onClick={onEnterHut} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:110,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#526d42',color:'#fff',fontWeight:700,fontSize:16}}>Enter</button>}
    {insideHut&&<button type="button" data-testid="interior-exit" onClick={onExitHut} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:110,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#526d42',color:'#fff',fontWeight:700,fontSize:16}}>Exit</button>}
    {!driving&&nearCar&&<button type="button" data-testid="car-enter" onClick={onEnterCar} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:170,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#7a1f1f',color:'#fff',fontWeight:700,fontSize:16}}>Enter Car</button>}
    {driving&&<button type="button" data-testid="car-exit" onClick={onExitCar} style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:110,zIndex:6,padding:'14px 22px',border:'1px solid #c4d1bd',borderRadius:12,background:'#7a1f1f',color:'#fff',fontWeight:700,fontSize:16}}>Exit Car</button>}
    </>
  );
}
