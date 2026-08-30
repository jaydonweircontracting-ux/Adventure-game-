import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Compass, Keyboard, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

const WORLD_SIZE = 100;
const VIEW_WIDTH = 21;
const VIEW_HEIGHT = 15;

type Position = { x: number; y: number };
type Direction = 'north' | 'south' | 'east' | 'west';
type Terrain = 'water' | 'shore' | 'grass' | 'meadow' | 'woodland' | 'autumn' | 'rock' | 'path' | 'town';
type MoveVector = { dx: number; dy: number; direction: Direction };
type Town = { x: number; y: number; name: string; kind: string; color: string };

type GameState = {
  position: Position;
  direction: Direction;
  steps: number;
  message: string;
  messages: string[];
  moveTick: number;
};

const towns: Town[] = [
  { x: 16, y: 22, name: 'Brackenford', kind: 'river village', color: 'ochre' },
  { x: 77, y: 18, name: 'Cinder Vale', kind: 'highland town', color: 'coral' },
  { x: 31, y: 73, name: 'Mossmere', kind: 'woodland village', color: 'moss' },
  { x: 79, y: 76, name: 'Amberlow', kind: 'harvest town', color: 'orange' },
  { x: 53, y: 48, name: 'Larkspur', kind: 'central crossing', color: 'rose' },
  { x: 15, y: 56, name: 'Saltwick', kind: 'shore settlement', color: 'blue' },
];

const initialState: GameState = {
  position: { x: 50, y: 52 },
  direction: 'south',
  steps: 0,
  message: 'The continent opens in every direction.',
  messages: ['The continent opens in every direction.'],
  moveTick: 0,
};

const directionKeys: Record<string, MoveVector> = {
  ArrowUp: { dx: 0, dy: -1, direction: 'north' },
  KeyW: { dx: 0, dy: -1, direction: 'north' },
  w: { dx: 0, dy: -1, direction: 'north' },
  ArrowDown: { dx: 0, dy: 1, direction: 'south' },
  KeyS: { dx: 0, dy: 1, direction: 'south' },
  s: { dx: 0, dy: 1, direction: 'south' },
  ArrowLeft: { dx: -1, dy: 0, direction: 'west' },
  KeyA: { dx: -1, dy: 0, direction: 'west' },
  a: { dx: -1, dy: 0, direction: 'west' },
  ArrowRight: { dx: 1, dy: 0, direction: 'east' },
  KeyD: { dx: 1, dy: 0, direction: 'east' },
  d: { dx: 1, dy: 0, direction: 'east' },
};

const directionLabel: Record<Direction, string> = {
  north: 'NORTH',
  south: 'SOUTH',
  east: 'EAST',
  west: 'WEST',
};

function positionLabel(position: Position) {
  return `(${String(position.x).padStart(2, '0')}, ${String(position.y).padStart(2, '0')})`;
}

function hash(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + 19.19) * 43758.5453;
  return value - Math.floor(value);
}

function townAt(x: number, y: number) {
  return towns.find((town) => town.x === x && town.y === y);
}

function terrainAt(x: number, y: number): Terrain {
  const islandDistance = Math.sqrt(((x - 50) / 46) ** 2 + ((y - 49) / 42) ** 2);
  if (islandDistance > 1.03) return 'water';
  if (islandDistance > 0.93) return 'shore';

  const town = townAt(x, y);
  if (town) return 'town';

  const mountainBand = x < 43 && y < 42 && x + y < 71;
  const highland = x > 47 && x < 68 && y > 11 && y < 34 && (Math.sin(x * 0.48 + y * 0.22) + hash(x, y) > 0.72);
  if (mountainBand || highland) return 'rock';

  const autumnRegion = x > 65 && y < 65;
  if (autumnRegion && (hash(x, y) > 0.13 || y < 25)) return 'autumn';

  const woodlandRegion = y > 57 && x > 18 && x < 64;
  if (woodlandRegion && hash(x, y) > 0.24) return 'woodland';

  const river = Math.abs(y - (47 + Math.sin(x * 0.13) * 5)) < 0.72 && x > 30 && x < 76;
  const southernCreek = Math.abs(x - (57 + Math.sin(y * 0.16) * 8)) < 0.58 && y > 45 && y < 84;
  if (river || southernCreek) return 'water';

  if (Math.abs(y - (48 + Math.sin(x * 0.12) * 5)) < 1.35 && x > 25 && x < 80) return 'path';
  if (hash(x, y) > 0.76) return 'meadow';
  return 'grass';
}

function terrainMark(terrain: Terrain) {
  if (terrain === 'water') return '≈';
  if (terrain === 'rock') return '⌃';
  if (terrain === 'woodland') return '♠';
  if (terrain === 'autumn') return '✦';
  if (terrain === 'shore') return '·';
  if (terrain === 'meadow') return '·';
  if (terrain === 'path') return '·';
  return '';
}

function gameReducer(state: GameState, action: { type: 'move'; vector: MoveVector } | { type: 'reset' }): GameState {
  if (action.type === 'reset') return initialState;
  const { dx, dy, direction } = action.vector;
  const nextPosition = {
    x: Math.max(0, Math.min(WORLD_SIZE - 1, state.position.x + dx)),
    y: Math.max(0, Math.min(WORLD_SIZE - 1, state.position.y + dy)),
  };
  const changed = nextPosition.x !== state.position.x || nextPosition.y !== state.position.y;
  const destination = terrainAt(nextPosition.x, nextPosition.y);
  const nearbyTown = townAt(nextPosition.x, nextPosition.y);
  const message = changed
    ? nearbyTown
      ? `Arrived at ${nearbyTown.name}, a ${nearbyTown.kind}.`
      : `Moved ${direction}. ${destination === 'water' ? 'The water holds the route.' : 'New ground underfoot.'} ${positionLabel(nextPosition)}.`
    : `World edge reached. Position remains ${positionLabel(state.position)}.`;

  return {
    ...state,
    position: nextPosition,
    direction,
    steps: state.steps + (changed ? 1 : 0),
    message,
    messages: [message, ...state.messages].slice(0, 5),
    moveTick: state.moveTick + (changed ? 1 : 0),
  };
}

function Home() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [showInfo, setShowInfo] = useState(false);
  const move = useCallback((vector: MoveVector) => dispatch({ type: 'move', vector }), []);
  const resetPosition = useCallback(() => dispatch({ type: 'reset' }), []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const vector = directionKeys[event.code] ?? directionKeys[key];
      if (!vector) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      event.preventDefault();
      move(vector);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  const visibleCells = useMemo(() => {
    const cameraX = Math.max(0, Math.min(WORLD_SIZE - VIEW_WIDTH, state.position.x - Math.floor(VIEW_WIDTH / 2)));
    const cameraY = Math.max(0, Math.min(WORLD_SIZE - VIEW_HEIGHT, state.position.y - Math.floor(VIEW_HEIGHT / 2)));
    return Array.from({ length: VIEW_WIDTH * VIEW_HEIGHT }, (_, index) => {
      const x = cameraX + (index % VIEW_WIDTH);
      const y = cameraY + Math.floor(index / VIEW_WIDTH);
      return { x, y, terrain: terrainAt(x, y) };
    });
  }, [state.position.x, state.position.y]);

  const cameraOrigin = visibleCells[0];
  const nearestTown = towns
    .map((town) => ({ ...town, distance: Math.abs(town.x - state.position.x) + Math.abs(town.y - state.position.y) }))
    .sort((a, b) => a.distance - b.distance)[0];

  return (
    <main className="game-shell min-h-[100dvh] bg-background text-foreground">
      <div className="atlas-frame mx-auto flex min-h-[100dvh] w-full max-w-[1360px] flex-col px-3 py-3 sm:px-6 sm:py-5 lg:px-10">
        <header className="topbar console-enter flex shrink-0 items-end justify-between gap-4 pb-3 sm:pb-5" aria-label="Playtest header">
          <div className="brand-lockup flex items-center gap-3 sm:gap-4">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <div>
              <p className="eyebrow">FIELD NOTES / 04</p>
              <h1 className="brand-title">The Far Meadow</h1>
              <p className="brand-subtitle">a hand-drawn continent playtest</p>
            </div>
          </div>
          <div className="header-meta hidden items-center gap-5 sm:flex">
            <div><span className="meta-label">WORLD</span><strong>100 × 100</strong></div>
            <div><span className="meta-label">WINDOW</span><strong>21 × 15</strong></div>
            <div className="compass-badge" aria-label="Compass marker"><Compass size={18} /><span>N</span></div>
          </div>
        </header>

        <div className="game-layout grid min-h-0 flex-1 gap-3 py-3 sm:gap-5 sm:py-5 lg:gap-7">
          <section className="map-column console-enter order-1 flex min-h-0 min-w-0 flex-col" aria-label="Active overworld map">
            <div className="map-heading flex shrink-0 items-end justify-between gap-3 pb-2 sm:pb-3">
              <div>
                <p className="eyebrow text-teal">THE CONTINENT, UNFOLDED</p>
                <p className="map-caption">Every tile is one quiet step. The window follows you.</p>
              </div>
              <button className="reset-button flex min-h-9 shrink-0 items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] sm:text-[9px]" onClick={resetPosition} type="button" data-testid="button-reset-position">
                <RotateCcw size={12} strokeWidth={2} aria-hidden="true" /><span>Reset trail</span>
              </button>
            </div>

            <div className="map-console" data-testid="map-console">
              <div className="map-coordinate-bar">
                <span>W {String(cameraOrigin.x).padStart(2, '0')}</span>
                <span className="coordinate-rule" />
                <span>E {String(cameraOrigin.x + VIEW_WIDTH - 1).padStart(2, '0')}</span>
              </div>
              <div className="map-window-shell">
                <div className="map-surface" aria-label="Twenty-one by fifteen tile camera window of the hundred by hundred overworld" data-testid="board-ground-map" role="img">
                  {visibleCells.map((cell) => {
                    const isPlayer = cell.x === state.position.x && cell.y === state.position.y;
                    const town = townAt(cell.x, cell.y);
                    const label = isPlayer ? `Player at ${positionLabel(cell)}` : town ? `${town.name}, ${town.kind}, at ${positionLabel(cell)}` : `${cell.terrain} at ${positionLabel(cell)}`;
                    return (
                      <div className={`map-cell terrain-${cell.terrain} ${isPlayer ? `is-player move-${state.moveTick % 3} face-${state.direction}` : ''}`} key={`${cell.x}-${cell.y}`} aria-label={label} data-testid={`tile-${cell.x}-${cell.y}`}>
                        <span className="terrain-mark" aria-hidden="true">{terrainMark(cell.terrain)}</span>
                        {town && <img className={`village-sprite town-${town.color}`} src="/village-sprite.svg" alt="" aria-hidden="true" />}
                        {isPlayer && <img className="player-sprite" src="/player-sprite.svg" alt="" aria-hidden="true" />}
                        {town && <span className="town-name" aria-hidden="true">{town.name}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="map-coordinate-bar bottom">
                <span>N {String(cameraOrigin.y).padStart(2, '0')}</span>
                <span className="coordinate-rule" />
                <span>S {String(cameraOrigin.y + VIEW_HEIGHT - 1).padStart(2, '0')}</span>
              </div>
            </div>
            <div className="map-footnote mt-2 flex shrink-0 items-center justify-between gap-3 pt-2 font-mono text-[8px] sm:mt-3 sm:pt-3 sm:text-[10px]">
              <span><i className="legend-dot player-dot" /> YOU ARE HERE <strong>@</strong></span>
              <span className="hidden sm:inline">CAMERA CLAMPED AT WORLD EDGE</span>
              <span><i className="legend-dot town-dot" /> {towns.length} TOWNS MAPPED</span>
            </div>
          </section>

          <aside className="play-rail console-enter console-delay-1 order-2 grid min-h-0 gap-3" aria-label="Playtest controls and status">
            <div id="mobile-info-panels" className={`info-panels grid min-h-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-1 ${showInfo ? 'is-open' : ''}`}>
              <StatusPanel state={state} nearestTown={nearestTown} />
              <MessagePanel state={state} />
            </div>
            <ControlPanel onMove={move} showInfo={showInfo} onToggleInfo={() => setShowInfo((visible) => !visible)} />
          </aside>
        </div>

        <footer className="footer console-enter console-delay-2 flex shrink-0 items-center justify-between gap-3 pt-2 font-mono text-[8px] sm:pt-3 sm:text-[10px]">
          <span className="flex items-center gap-1.5"><Keyboard size={11} aria-hidden="true" /> WASD / ARROWS</span>
          <span className="hidden sm:inline">DETERMINISTIC CARTOGRAPHY / NO BACKEND</span>
          <span>ONE PRESS / ONE TILE</span>
        </footer>
      </div>
    </main>
  );
}

function StatusPanel({ state, nearestTown }: { state: GameState; nearestTown: Town & { distance: number } }) {
  return (
    <section className="console-panel status-panel min-h-0 border p-3 sm:p-4" aria-label="Player status">
      <div className="panel-heading flex items-center justify-between pb-2 sm:pb-3">
        <p className="eyebrow">TRAVEL LOG</p><span className="panel-index">01</span>
      </div>
      <dl className="status-list mt-2 grid grid-cols-3 gap-2 font-mono text-[8px] sm:mt-4 sm:block sm:space-y-4 sm:text-[10px]">
        <div><dt>COORDINATES</dt><dd className="coordinate-value" data-testid="text-current-coordinates">{positionLabel(state.position)}</dd></div>
        <div className="data-rule"><dt>STEPS TAKEN</dt><dd className="accent-value" data-testid="text-step-count">{state.steps.toString().padStart(3, '0')}</dd></div>
        <div><dt>FACING</dt><dd data-testid="text-facing">{directionLabel[state.direction]}</dd></div>
      </dl>
      <div className="nearest-town mt-3 border-t pt-3 sm:mt-5">
        <span className="meta-label">NEXT LANDMARK</span>
        <strong data-testid="text-nearest-town">{nearestTown.name}</strong>
        <span>{nearestTown.distance} tiles away</span>
      </div>
    </section>
  );
}

function MessagePanel({ state }: { state: GameState }) {
  return (
    <section className="console-panel message-panel min-h-0 border p-3 sm:p-4" aria-label="Game messages">
      <div className="panel-heading flex items-center justify-between pb-2 sm:pb-3"><p className="eyebrow">FIELD NOTES</p><span className="status-pip" aria-hidden="true" /></div>
      <p className="message-line mt-2 min-h-0 font-mono text-[9px] leading-relaxed sm:mt-4 sm:min-h-[55px] sm:text-[11px]" aria-live="polite" data-testid="text-game-message">{state.message}</p>
      <div className="recent-list mt-2 hidden border-t pt-3 sm:block"><p className="meta-label mb-2">RECENT STEPS</p><ol className="space-y-2 font-mono text-[9px]">{state.messages.slice(0, 3).map((message, index) => <li className="flex gap-2" key={`${message}-${index}`}><span className="accent-value">[{String(index).padStart(2, '0')}]</span><span>{message}</span></li>)}</ol></div>
    </section>
  );
}

function ControlPanel({ onMove, showInfo, onToggleInfo }: { onMove: (vector: MoveVector) => void; showInfo: boolean; onToggleInfo: () => void }) {
  const press = (vector: MoveVector) => () => onMove(vector);
  const buttons = [
    { label: 'Move north', vector: { dx: 0, dy: -1, direction: 'north' } as MoveVector, icon: ChevronUp, key: 'W' },
    { label: 'Move west', vector: { dx: -1, dy: 0, direction: 'west' } as MoveVector, icon: ChevronLeft, key: 'A' },
    { label: 'Move south', vector: { dx: 0, dy: 1, direction: 'south' } as MoveVector, icon: ChevronDown, key: 'S' },
    { label: 'Move east', vector: { dx: 1, dy: 0, direction: 'east' } as MoveVector, icon: ChevronRight, key: 'D' },
  ];
  return (
    <section className="control-rail relative flex min-h-0 items-center justify-between gap-3 border p-2.5 sm:p-3 lg:block" aria-label="Movement controls">
      <div><p className="eyebrow text-sand">NAVIGATE</p><p className="control-copy">Choose a bearing.</p></div>
      <button className="info-toggle sm:hidden" onClick={onToggleInfo} type="button" aria-expanded={showInfo} aria-controls="mobile-info-panels" data-testid="button-toggle-info"><span>{showInfo ? 'Hide notes' : 'Show notes'}</span><span aria-hidden="true">{showInfo ? '−' : '+'}</span></button>
      <div className="dpad-shell grid shrink-0 grid-cols-3 grid-rows-2 gap-1.5 p-1.5 sm:gap-2 sm:p-2 lg:mx-auto lg:mt-4 lg:w-fit" aria-label="Touch movement controls">
        <span aria-hidden="true" /><TouchButton button={buttons[0]} onPress={press(buttons[0].vector)} testId="button-move-north" /><span aria-hidden="true" />
        <TouchButton button={buttons[1]} onPress={press(buttons[1].vector)} testId="button-move-west" /><TouchButton button={buttons[2]} onPress={press(buttons[2].vector)} testId="button-move-south" /><TouchButton button={buttons[3]} onPress={press(buttons[3].vector)} testId="button-move-east" />
      </div>
      <div className="hidden shrink-0 text-right font-mono text-[9px] leading-relaxed text-sand/75 sm:block"><p>tap / click</p><p>one tile at a time</p></div>
    </section>
  );
}

function TouchButton({ button, onPress, testId }: { button: { label: string; icon: typeof ChevronUp; key: string }; onPress: () => void; testId: string }) {
  const Icon = button.icon;
  return <button className="touch-button flex h-[3.5rem] w-[3.5rem] flex-col items-center justify-center gap-0.5 border sm:h-[3.75rem] sm:w-[3.75rem]" onClick={onPress} type="button" aria-label={`${button.label} (${button.key})`} data-testid={testId}><span className="font-mono text-[10px] font-bold leading-none">{button.key}</span><Icon size={19} strokeWidth={2.2} aria-hidden="true" /><span className="font-mono text-[8px] font-bold uppercase leading-none tracking-[0.08em]">{button.label.replace('Move ', '')}</span></button>;
}

function App() {
  return <Home />;
}

export default App;