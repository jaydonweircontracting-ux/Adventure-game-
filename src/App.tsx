import { useEffect, useRef, useState } from 'react';
import { Backpack, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Coins, Map, Minus, Plus, Volume2, VolumeX, X } from 'lucide-react';
import { type CSSProperties } from 'react';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
type Direction = 'up' | 'down' | 'left' | 'right';
type Point = { x: number; y: number };
const directionKeys: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const delta: Record<Direction, Point> = {
  up: { x: 0, y: -2.4 }, down: { x: 0, y: 2.4 }, left: { x: -2.4, y: 0 }, right: { x: 2.4, y: 0 },
};
const terrainTypes = ['meadow', 'woodland', 'rock', 'shore', 'autumn'] as const;
type Terrain = (typeof terrainTypes)[number];
const fieldPalettes: Record<Terrain, { field: string; path: string; glow: string }> = {
  meadow: { field: '#77a45b', path: '#d9b979', glow: 'rgba(255, 227, 157, .22)' },
  woodland: { field: '#658e58', path: '#c7a66b', glow: 'rgba(180, 214, 141, .18)' },
  rock: { field: '#87927a', path: '#c9b27d', glow: 'rgba(238, 228, 186, .2)' },
  shore: { field: '#6f9b88', path: '#dfc58d', glow: 'rgba(218, 239, 194, .2)' },
  autumn: { field: '#9b785d', path: '#d6ae70', glow: 'rgba(255, 198, 123, .2)' },
};

function chunkTerrain(chunk: Point): Terrain {
  const seed = Math.abs((chunk.x * 73856093) ^ (chunk.y * 19349663));
  return terrainTypes[seed % terrainTypes.length];
}

function chunkRegion(chunk: Point) {
  if (chunk.x >= 3 && chunk.x <= 5 && chunk.y >= 6 && chunk.y <= 8) return 'Mosslight';
  if (chunk.x < 3) return 'Amberfen';
  if (chunk.x > 5) return 'Stonewake';
  if (chunk.y < 6) return 'Highmere';
  return 'Redwater';
}

const initialLogs = [
  { text: 'You arrive at the Mosslight Crossing.', color: '' },
  { text: 'The east path is clear.', color: 'blue' },
  { text: 'Your field position was saved locally.', color: '' },
];

function WorldMap({ chunk, onClose }: { chunk: Point; onClose: () => void }) {
  const [zoom, setZoom] = useState(2);
  const radius = 5 - zoom;
  const gridSize = radius * 2 + 1;
  const mapScale = [0.72, 0.86, 1, 1.12][zoom - 1];
  const tiles = Array.from({ length: gridSize * gridSize }, (_, index) => {
    const row = Math.floor(index / gridSize);
    const column = index % gridSize;
    const tile = {
      x: chunk.x + column - radius,
      y: chunk.y + row - radius,
    };
    return { ...tile, terrain: chunkTerrain(tile), current: tile.x === chunk.x && tile.y === chunk.y };
  });

  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="map-title" data-testid="overlay-world-map">
      <div className="map-sheet">
        <div className="map-sheet-heading">
          <h2 id="map-title">Field atlas</h2>
          <button className="map-close" onClick={onClose} aria-label="Close world map" data-testid="button-close-map"><X size={19} /></button>
        </div>
        <div className="map-toolbar">
          <span className="map-area-label">{chunkRegion(chunk)} region · {chunkTerrain(chunk)}</span>
          <div className="map-zoom-controls" aria-label="Map zoom controls">
            <button className="map-zoom-button" onClick={() => setZoom((value) => Math.max(1, value - 1))} disabled={zoom === 1} aria-label="Zoom out" data-testid="button-map-zoom-out"><Minus size={15} /></button>
            <span className="map-zoom-level">×{zoom}</span>
            <button className="map-zoom-button" onClick={() => setZoom((value) => Math.min(4, value + 1))} disabled={zoom === 4} aria-label="Zoom in" data-testid="button-map-zoom-in"><Plus size={15} /></button>
          </div>
        </div>
        <div className="big-map" data-testid="map-world-preview">
          <div className="map-grid" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, transform: `scale(${mapScale})` }}>
            {tiles.map((tile) => (
              <div className={`map-tile map-terrain-${tile.terrain} ${tile.current ? 'is-current' : ''}`} key={`${tile.x}-${tile.y}`} title={`Chunk ${tile.x}, ${tile.y} · ${chunkRegion(tile)}`}>
                {tile.current && <span className="map-tile-player" aria-label="Your current position" />}
                {tile.current && <span className="map-tile-label">{tile.x}, {tile.y}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="map-legend">
          <span className="legend-item"><span className="legend-dot" /> You are here</span>
          <span className="legend-item"><span className="legend-dot gold" /> Waypoint</span>
          <span className="legend-item">Chunk {chunk.x}, {chunk.y} · {chunkRegion(chunk)}</span>
        </div>
      </div>
    </div>
  );
}

function InventorySheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="inventory-title" data-testid="overlay-inventory">
      <div className="map-sheet inventory-sheet">
        <div className="map-sheet-heading">
          <h2 id="inventory-title">Inventory</h2>
          <button className="map-close" onClick={onClose} aria-label="Close inventory" data-testid="button-close-inventory"><X size={19} /></button>
        </div>
        <div className="inventory-body">
          <div className="inventory-count">0 items carried</div>
          <div className="inventory-empty">
            <Backpack size={30} strokeWidth={1.5} />
            <strong>Your pack is empty</strong>
            <span>Items you discover on the road will appear here.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameField({ onOpenMap, onOpenInventory, onChunkChange, muted, onToggleMute }: { onOpenMap: () => void; onOpenInventory: () => void; onChunkChange: (chunk: Point) => void; muted: boolean; onToggleMute: () => void }) {
  const [position, setPosition] = useState<Point>({ x: 51, y: 52 });
  const [chunk, setChunk] = useState<Point>({ x: 4, y: 7 });
  const [areaFlash, setAreaFlash] = useState<{ id: string; label: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState<Direction>('down');
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState(initialLogs);
  const [time, setTime] = useState('08:43');
  const keysRef = useRef<Partial<Record<Direction, boolean>>>({});
  const positionRef = useRef(position);
  const chunkRef = useRef(chunk);

  useEffect(() => {
    ['/assets/gameplay/shining-fields/characters/player/idle.png', '/assets/gameplay/shining-fields/characters/player/run.png'].forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { chunkRef.current = chunk; }, [chunk]);

  useEffect(() => {
    if (!areaFlash) return;
    const timer = window.setTimeout(() => setAreaFlash(null), 1700);
    return () => window.clearTimeout(timer);
  }, [areaFlash]);

  useEffect(() => {
    const clearInput = () => {
      keysRef.current = {};
      setMoving(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = directionKeys[event.code];
      if (!direction) return;
      event.preventDefault();
      keysRef.current[direction] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const direction = directionKeys[event.code];
      if (!direction) return;
      event.preventDefault();
      keysRef.current[direction] = false;
    };
    const onVisibilityChange = () => { if (document.hidden) clearInput(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', onVisibilityChange);

    let animationFrame = 0;
    let lastFrame = performance.now();
    const animate = (now: number) => {
      const elapsed = Math.min(50, now - lastFrame) / 1000;
      lastFrame = now;
      const input = {
        x: (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0),
        y: (keysRef.current.down ? 1 : 0) - (keysRef.current.up ? 1 : 0),
      };
      const length = Math.hypot(input.x, input.y);
      const active = length > 0;
      setMoving(active);

      if (active) {
        const direction = input.x > 0 ? 'right' : input.x < 0 ? 'left' : input.y < 0 ? 'up' : 'down';
        setFacing(direction);
        const speed = 20;
        const movement = { x: (input.x / length) * speed * elapsed, y: (input.y / length) * speed * elapsed };
        const current = positionRef.current;
        const next = { x: current.x + movement.x, y: current.y + movement.y };
        const nextChunk = { ...chunkRef.current };
        const travelLabels: string[] = [];
        if (next.x < 10) { next.x = 88; nextChunk.x -= 1; travelLabels.push('west'); }
        if (next.x > 90) { next.x = 12; nextChunk.x += 1; travelLabels.push('east'); }
        if (next.y < 12) { next.y = 86; nextChunk.y -= 1; travelLabels.push('north'); }
        if (next.y > 88) { next.y = 14; nextChunk.y += 1; travelLabels.push('south'); }
        positionRef.current = next;
        setPosition(next);
        if (travelLabels.length > 0) {
          const previousRegion = chunkRegion(chunkRef.current);
          const nextRegion = chunkRegion(nextChunk);
          chunkRef.current = nextChunk;
          setChunk(nextChunk);
          onChunkChange(nextChunk);
          if (nextRegion !== previousRegion) {
            setAreaFlash({ id: String(nextChunk.x) + ':' + String(nextChunk.y), label: nextRegion });
          }
          setLogs((currentLogs) => [{
            text: `You travel ${travelLabels.join(' and ')} into ${chunkRegion(nextChunk)} · chunk ${nextChunk.x}, ${nextChunk.y}.`,
            color: 'blue',
          }, ...currentLogs].slice(0, 3));
        }
      }
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    const clock = window.setInterval(() => {
      setTime((current) => {
        const [hours, minutes] = current.split(':').map(Number);
        const nextMinutes = minutes + 1;
        return String((hours + Math.floor(nextMinutes / 60)) % 24).padStart(2, '0') + ':' + String(nextMinutes % 60).padStart(2, '0');
      });
    }, 3000);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearInterval(clock);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onChunkChange]);

  const pressDirection = (direction: Direction) => {
    keysRef.current[direction] = true;
    setMoving(true);
  };
  const releaseDirection = (direction: Direction) => {
    keysRef.current[direction] = false;
    setMoving(Object.values(keysRef.current).some(Boolean));
  };

  return (
    <div className="field-column">
      <div className="game-frame" tabIndex={0} aria-label="Playable Mosslight Crossing field" data-testid="game-field">
        <div className="pixel-field" data-terrain={chunkTerrain(chunk)} style={{
          '--field-color': fieldPalettes[chunkTerrain(chunk)].field,
          '--path-color': fieldPalettes[chunkTerrain(chunk)].path,
          '--field-glow': fieldPalettes[chunkTerrain(chunk)].glow,
        } as CSSProperties}>
          <span className="field-edge top" /><span className="field-edge bottom" /><span className="field-edge left" /><span className="field-edge right" />
           <div className="field-path path-main" aria-hidden="true" />
           <div className="field-path path-crossing" aria-hidden="true" />
          <div className={`player ${moving ? 'is-moving' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} data-facing={facing} data-testid="player-character">
            <span className="player-sprite" />
          </div>
        </div>
        {areaFlash && (
          <div className="area-flash" key={areaFlash.id} aria-live="polite" data-testid="area-entry-flash">
            <span className="area-flash-kicker">Entering</span>
            <strong>{areaFlash.label}</strong>
          </div>
        )}
        <div className="world-hud">
          <div className="hud-card" data-testid="hud-player">
            <div className="hud-label"><span>Adventurer</span><span>08</span></div>
            <div className="hud-name">Rowan of the Vale</div>
            <div className="bar" aria-label="Health 84 percent"><div className="bar-fill health" style={{ width: '84%' }} /></div>
          </div>
          <button className="hud-card right hud-button" onClick={onOpenInventory} aria-label="Open inventory" data-testid="button-open-inventory">
            <div className="hud-label"><span>Satchel</span><Coins size={12} /></div>
            <div className="hud-coins" data-testid="text-coin-count">1,284 c</div>
            <div className="hud-time" data-testid="text-game-time">{time} / clear</div>
          </button>
        </div>
        <div className="touch-controls" aria-label="Touch movement controls">
           <button className="touch-control up" aria-label="Move north" data-testid="button-move-up" onPointerDown={() => pressDirection('up')} onPointerUp={() => releaseDirection('up')} onPointerCancel={() => releaseDirection('up')} onPointerLeave={() => releaseDirection('up')}><ChevronUp size={18} /></button>
           <button className="touch-control left" aria-label="Move west" data-testid="button-move-left" onPointerDown={() => pressDirection('left')} onPointerUp={() => releaseDirection('left')} onPointerCancel={() => releaseDirection('left')} onPointerLeave={() => releaseDirection('left')}><ChevronLeft size={18} /></button>
           <button className="touch-control down" aria-label="Move south" data-testid="button-move-down" onPointerDown={() => pressDirection('down')} onPointerUp={() => releaseDirection('down')} onPointerCancel={() => releaseDirection('down')} onPointerLeave={() => releaseDirection('down')}><ChevronDown size={18} /></button>
           <button className="touch-control right" aria-label="Move east" data-testid="button-move-right" onPointerDown={() => pressDirection('right')} onPointerUp={() => releaseDirection('right')} onPointerCancel={() => releaseDirection('right')} onPointerLeave={() => releaseDirection('right')}><ChevronRight size={18} /></button>
        </div>
         {logOpen && (
           <section id="field-log-drawer" className="field-log-drawer" aria-label="Field log" data-testid="panel-field-log">
             <div className="field-log-heading">
               <h2>Field log</h2>
               <button className="field-log-close" onClick={() => setLogOpen(false)} aria-label="Close field log" data-testid="button-close-field-log"><X size={16} /></button>
             </div>
             <div className="log-list">
               {logs.map((log, index) => <div className="log-row" key={`${log.text}-${index}`} data-testid={`log-entry-${index}`}><span className={`log-dot ${log.color}`} /><span>{log.text}</span></div>)}
             </div>
           </section>
         )}
         <div className="field-actions">
           <button className="field-log-toggle" onClick={() => setLogOpen((value) => !value)} aria-expanded={logOpen} aria-controls="field-log-drawer" data-testid="button-toggle-field-log"><BookOpen size={14} /> {logOpen ? 'Hide log' : 'Field log'}</button>
           <button className="map-button" onClick={onOpenMap} data-testid="button-open-map"><Map size={14} /> Field atlas</button>
            <button className="icon-button field-sound-button" onClick={onToggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={muted} data-testid="button-toggle-sound">{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
         </div>
      </div>
      <div className="sr-only" aria-live="polite" data-testid="status-movement">{moving ? 'Moving through Mosslight Crossing' : 'Standing still'}</div>
      <div className="sr-only" aria-live="polite" data-testid="status-field-log">{logs[0].text}</div>
    </div>
  );
}

function Home() {
  const [mapOpen, setMapOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chunk, setChunk] = useState({ x: 4, y: 7 });

  useEffect(() => {
    const closeSheets = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMapOpen(false);
        setInventoryOpen(false);
      }
    };
    window.addEventListener('keydown', closeSheets);
    return () => window.removeEventListener('keydown', closeSheets);
  }, []);

  return (
    <main className="game-app">
      <div className="game-layout">
        <GameField onOpenMap={() => setMapOpen(true)} onOpenInventory={() => setInventoryOpen(true)} onChunkChange={setChunk} muted={muted} onToggleMute={() => setMuted((value) => !value)} />
      </div>
      {mapOpen && <WorldMap chunk={chunk} onClose={() => setMapOpen(false)} />}
      {inventoryOpen && <InventorySheet onClose={() => setInventoryOpen(false)} />}
    </main>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
