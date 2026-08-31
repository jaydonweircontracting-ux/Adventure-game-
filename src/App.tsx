import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Coins, Map, Settings, Shield, Sword, Volume2, VolumeX, X } from 'lucide-react';
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

const initialLogs = [
  { text: 'You arrive at the Mosslight Crossing.', color: '' },
  { text: 'The east path is clear.', color: 'blue' },
  { text: 'Your field position was saved locally.', color: '' },
];

function WorldMap({ chunk, onClose }: { chunk: Point; onClose: () => void }) {
  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="map-title" data-testid="overlay-world-map">
      <div className="map-sheet">
        <div className="map-sheet-heading">
          <h2 id="map-title">Field atlas</h2>
          <button className="map-close" onClick={onClose} aria-label="Close world map" data-testid="button-close-map"><X size={19} /></button>
        </div>
        <div className="big-map" data-testid="map-world-preview">
          <span className="map-region region-one">Amberfen</span>
          <span className="map-region region-two">Stonewake</span>
          <span className="map-region region-three">Mosslight</span>
          <span className="map-player" title="Your position" />
        </div>
        <div className="map-legend">
          <span className="legend-item"><span className="legend-dot" /> You are here</span>
          <span className="legend-item"><span className="legend-dot gold" /> Waypoint</span>
          <span className="legend-item">Chunk {chunk.x}, {chunk.y}</span>
        </div>
      </div>
    </div>
  );
}

function GameField({ onOpenMap, onChunkChange, muted, onToggleMute }: { onOpenMap: () => void; onChunkChange: (chunk: Point) => void; muted: boolean; onToggleMute: () => void }) {
  const [position, setPosition] = useState<Point>({ x: 51, y: 52 });
  const [chunk, setChunk] = useState<Point>({ x: 4, y: 7 });
  const [stamina, setStamina] = useState(78);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState<Direction>('down');
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState(initialLogs);
  const [time, setTime] = useState('08:43');
  const keysRef = useRef<Partial<Record<Direction, boolean>>>({});
  const positionRef = useRef(position);
  const chunkRef = useRef(chunk);
  const lastTravelRef = useRef('');

  useEffect(() => {
    ['/assets/gameplay/shining-fields/characters/player/idle.png', '/assets/gameplay/shining-fields/characters/player/run.png'].forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { chunkRef.current = chunk; }, [chunk]);

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
        let travelLabel = '';
        if (next.x < 10) { next.x = 88; nextChunk.x -= 1; travelLabel = 'west'; }
        if (next.x > 90) { next.x = 12; nextChunk.x += 1; travelLabel = 'east'; }
        if (next.y < 12) { next.y = 86; nextChunk.y -= 1; travelLabel = 'north'; }
        if (next.y > 88) { next.y = 14; nextChunk.y += 1; travelLabel = 'south'; }
        positionRef.current = next;
        setPosition(next);
        setStamina((value) => Math.max(12, value - 5 * elapsed));
        const chunkKey = nextChunk.x + ',' + nextChunk.y;
        if (travelLabel && lastTravelRef.current !== chunkKey) {
          lastTravelRef.current = chunkKey;
          chunkRef.current = nextChunk;
          setChunk(nextChunk);
          onChunkChange(nextChunk);
          setLogs((currentLogs) => [{ text: 'You travel ' + travelLabel + ' into a new field chunk.', color: 'blue' }, ...currentLogs].slice(0, 3));
        }
      } else {
        setStamina((value) => Math.min(100, value + 8.5 * elapsed));
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
      <div className="field-header">
        <div>
          <div className="field-kicker">Live field / chapter one</div>
          <h1 className="field-title" data-testid="text-location-name">Mosslight Crossing</h1>
        </div>
        <div className="field-coordinates" data-testid="text-chunk-coordinates">CHUNK {chunk.x} : {chunk.y}</div>
      </div>
      <div className="game-frame" tabIndex={0} aria-label="Playable Mosslight Crossing field" data-testid="game-field">
        <div className="pixel-field">
          <span className="field-edge top" /><span className="field-edge bottom" /><span className="field-edge left" /><span className="field-edge right" />
           <div className="field-path path-main" aria-hidden="true" />
           <div className="field-path path-crossing" aria-hidden="true" />
          <div className={`player ${moving ? 'is-moving' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} data-facing={facing} data-testid="player-character">
            <span className="player-sprite" />
          </div>
        </div>
        <div className="world-hud">
          <div className="hud-card" data-testid="hud-player">
            <div className="hud-label"><span>Adventurer</span><span>08</span></div>
            <div className="hud-name">Rowan of the Vale</div>
            <div className="bar" aria-label="Health 84 percent"><div className="bar-fill health" style={{ width: '84%' }} /></div>
            <div className="bar" aria-label={`Stamina ${Math.round(stamina)} percent`}><div className="bar-fill stamina" style={{ width: `${stamina}%` }} /></div>
          </div>
          <div className="hud-card right">
            <div className="hud-label"><span>Satchel</span><Coins size={12} /></div>
            <div className="hud-coins" data-testid="text-coin-count">1,284 c</div>
            <div className="hud-time" data-testid="text-game-time">{time} / clear</div>
          </div>
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
         </div>
      </div>
      <div className="game-footer">
        <div className="control-hint"><span className="key">W</span><span className="key">A</span><span className="key">S</span><span className="key">D</span><span>or arrow keys to move</span></div>
        <div className="autosave">Progress saved locally</div>
         <button className="icon-button" onClick={onToggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={muted} data-testid="button-toggle-sound">{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
      </div>
      <div className="sr-only" aria-live="polite" data-testid="status-movement">{moving ? 'Moving through Mosslight Crossing' : 'Standing still'}</div>
      <div className="sr-only" aria-live="polite" data-testid="status-field-log">{logs[0].text}</div>
    </div>
  );
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title" data-testid="overlay-settings">
      <div className="map-sheet" style={{ maxWidth: 430 }}>
        <div className="map-sheet-heading"><h2 id="settings-title">Field settings</h2><button className="map-close" onClick={onClose} aria-label="Close settings" data-testid="button-close-settings"><X size={19} /></button></div>
        <div className="quest">
          <div className="quest-status">Local play</div>
          <h3 className="quest-title">Tune your expedition</h3>
          <p className="quest-copy">Movement, progress, and your field position are kept on this device for the next time you return.</p>
          <div className="map-legend" style={{ padding: '18px 0 0' }}><span className="legend-item"><Shield size={13} /> Safe local session</span><span className="legend-item"><Sword size={13} /> Combat ready</span></div>
        </div>
      </div>
    </div>
  );
}

function Home() {
  const [mapOpen, setMapOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chunk, setChunk] = useState({ x: 4, y: 7 });

  useEffect(() => {
    const closeSheets = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMapOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', closeSheets);
    return () => window.removeEventListener('keydown', closeSheets);
  }, []);

  return (
    <main className="game-app">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true" />
          <div className="brand-copy"><strong>Adventure Game</strong><span>Field journal · online</span></div>
        </div>
        <div className="topbar-actions">
          <div className="status-pill"><span className="online-dot" /> 12,408 adventurers online</div>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings" data-testid="button-open-settings"><Settings size={16} /></button>
          <button className="icon-button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} data-testid="button-header-sound">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        </div>
      </header>
      <div className="game-layout">
        <GameField onOpenMap={() => setMapOpen(true)} onChunkChange={setChunk} muted={muted} onToggleMute={() => setMuted((value) => !value)} />
      </div>
      {mapOpen && <WorldMap chunk={chunk} onClose={() => setMapOpen(false)} />}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
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
