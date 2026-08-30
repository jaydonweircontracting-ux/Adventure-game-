import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Compass, Keyboard, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

const WORLD_SIZE = 100;
const MAX_STAMINA = 100;
const REST_RECOVERY = 20;
const ZOOM_OPTIONS = [
  { id: 'close', label: 'Close', width: 21, height: 15, panStep: 5, showMarks: true },
  { id: 'region', label: 'Region', width: 39, height: 27, panStep: 7, showMarks: true },
  { id: 'survey', label: 'Survey', width: 61, height: 41, panStep: 10, showMarks: false },
  { id: 'world', label: 'World', width: 100, height: 100, panStep: 15, showMarks: false },
] as const;

type ZoomId = (typeof ZOOM_OPTIONS)[number]['id'];

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
  stamina: number;
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
  stamina: MAX_STAMINA,
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

function nearestTownDistance(position: Position) {
  return Math.min(...towns.map((town) => Math.abs(town.x - position.x) + Math.abs(town.y - position.y)));
}

function terrainStaminaCost(terrain: Terrain) {
  if (terrain === 'water') return 4;
  if (terrain === 'rock') return 3;
  if (terrain === 'woodland' || terrain === 'autumn') return 2;
  if (terrain === 'shore') return 2;
  return 1;
}

function movementStaminaCost(position: Position) {
  const terrain = terrainAt(position.x, position.y);
  const distance = nearestTownDistance(position);
  const distanceSurcharge = distance >= 45 ? 2 : distance >= 25 ? 1 : 0;
  return terrainStaminaCost(terrain) + distanceSurcharge;
}

function terrainLabel(terrain: Terrain) {
  return terrain.charAt(0).toUpperCase() + terrain.slice(1);
}

function terrainAt(x: number, y: number): Terrain {
  const islandDistance = Math.sqrt(((x - 50) / 46) ** 2 + ((y - 49) / 42) ** 2);
  if (islandDistance > 1.06) return 'water';
  if (islandDistance > 0.94) return 'shore';

  const town = townAt(x, y);
  if (town) return 'town';

  const lake = ((x - 54) / 11) ** 2 + ((y - 25) / 9) ** 2 < 1;
  const mainRiver = Math.abs(y - (47 + Math.sin(x * 0.13) * 5)) < 1.05 && x > 22 && x < 88;
  const southernCreek = Math.abs(x - (57 + Math.sin(y * 0.16) * 8)) < 0.78 && y > 42 && y < 91;
  const easternRiver = Math.abs(y - (35 + Math.sin(x * 0.1) * 5)) < 0.7 && x > 68;
  if (lake || mainRiver || southernCreek || easternRiver) return 'water';

  const mountainRange = (x < 43 && y < 42 && x + y < 71) || (x > 41 && x < 60 && y < 24 && hash(x, y) > 0.28);
  if (mountainRange) return 'rock';

  const autumnRegion = x > 65 && y < 65;
  if (autumnRegion && (hash(x, y) > 0.13 || y < 25)) return 'autumn';

  const woodlandRegion = y > 54 && x > 17 && x < 68;
  if (woodlandRegion && hash(x, y) > 0.2) return 'woodland';

  const path = Math.abs(y - (48 + Math.sin(x * 0.12) * 5)) < 1.7 && x > 18 && x < 88;
  if (path) return 'path';
  if (hash(x, y) > 0.74) return 'meadow';
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

function gameReducer(state: GameState, action: { type: 'move'; vector: MoveVector } | { type: 'reset' } | { type: 'rest' }): GameState {
  if (action.type === 'reset') return initialState;
  if (action.type === 'rest') {
    if (state.stamina >= MAX_STAMINA) {
      const message = 'Stamina is already full.';
      return { ...state, message, messages: [message, ...state.messages].slice(0, 5) };
    }
    const recovered = Math.min(REST_RECOVERY, MAX_STAMINA - state.stamina);
    const message = 'Rested in the field. +' + recovered + ' stamina.';
    return { ...state, stamina: state.stamina + recovered, message, messages: [message, ...state.messages].slice(0, 5) };
  }

  const { dx, dy, direction } = action.vector;
  const nextPosition = {
    x: Math.max(0, Math.min(WORLD_SIZE - 1, state.position.x + dx)),
    y: Math.max(0, Math.min(WORLD_SIZE - 1, state.position.y + dy)),
  };
  const changed = nextPosition.x !== state.position.x || nextPosition.y !== state.position.y;
  if (!changed) {
    const message = 'World edge reached. Position remains ' + positionLabel(state.position) + '.';
    return { ...state, direction, message, messages: [message, ...state.messages].slice(0, 5) };
  }

  const destination = terrainAt(nextPosition.x, nextPosition.y);
  const nearbyTown = townAt(nextPosition.x, nextPosition.y);
  const staminaCost = movementStaminaCost(nextPosition);
  if (state.stamina < staminaCost) {
    const message = 'Too tired to move there. Need ' + staminaCost + ' stamina; rest before continuing.';
    return { ...state, direction, message, messages: [message, ...state.messages].slice(0, 5) };
  }

  const message = nearbyTown
    ? 'Arrived at ' + nearbyTown.name + '. -' + staminaCost + ' stamina.'
    : 'Moved ' + direction + '. -' + staminaCost + ' stamina. ' + (destination === 'water' ? 'The water holds the route.' : 'New ground underfoot.') + ' ' + positionLabel(nextPosition) + '.';
  return {
    ...state,
    position: nextPosition,
    direction,
    steps: state.steps + 1,
    stamina: state.stamina - staminaCost,
    message,
    messages: [message, ...state.messages].slice(0, 5),
    moveTick: state.moveTick + 1,
  };
}

function Home() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [showInfo, setShowInfo] = useState(false);
  const [zoomId, setZoomId] = useState<ZoomId>('close');
  const [mapCenter, setMapCenter] = useState<Position>(initialState.position);
  const [followPlayer, setFollowPlayer] = useState(true);
  const [selectedTile, setSelectedTile] = useState<Position | null>(null);
  const zoom = ZOOM_OPTIONS.find((option) => option.id === zoomId) ?? ZOOM_OPTIONS[0];
  const move = useCallback((vector: MoveVector) => {
    dispatch({ type: 'move', vector });
    setFollowPlayer(true);
  }, []);
  const rest = useCallback(() => dispatch({ type: 'rest' }), []);
  const resetPosition = useCallback(() => {
    dispatch({ type: 'reset' });
    setMapCenter(initialState.position);
    setSelectedTile(null);
    setFollowPlayer(true);
  }, []);
  const panMap = useCallback((dx: number, dy: number) => {
    setFollowPlayer(false);
    setMapCenter((center) => ({
      x: Math.max(0, Math.min(WORLD_SIZE - 1, center.x + dx)),
      y: Math.max(0, Math.min(WORLD_SIZE - 1, center.y + dy)),
    }));
  }, []);
  const selectTile = useCallback((position: Position) => {
    setSelectedTile(position);
    setShowInfo(true);
  }, []);

  useEffect(() => {
    if (followPlayer) setMapCenter(state.position);
  }, [followPlayer, state.position]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (event.code === 'KeyR') {
        event.preventDefault();
        rest();
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const vector = directionKeys[event.code] ?? directionKeys[key];
      if (!vector) return;
      event.preventDefault();
      move(vector);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move, rest]);

  const mapView = useMemo(() => {
    const cameraX = Math.max(0, Math.min(WORLD_SIZE - zoom.width, mapCenter.x - Math.floor(zoom.width / 2)));
    const cameraY = Math.max(0, Math.min(WORLD_SIZE - zoom.height, mapCenter.y - Math.floor(zoom.height / 2)));
    const cells = Array.from({ length: zoom.width * zoom.height }, (_, index) => {
      const x = cameraX + (index % zoom.width);
      const y = cameraY + Math.floor(index / zoom.width);
      return { x, y, terrain: terrainAt(x, y) };
    });
    return { cameraX, cameraY, cells };
  }, [mapCenter.x, mapCenter.y, zoom.height, zoom.width]);

  const cameraOrigin = { x: mapView.cameraX, y: mapView.cameraY };
  const nearestTown = towns
    .map((town) => ({ ...town, distance: Math.abs(town.x - state.position.x) + Math.abs(town.y - state.position.y) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const staminaPercent = (state.stamina / MAX_STAMINA) * 100;

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
          <div className="header-controls">
            <div className="stamina-panel" aria-label={'Stamina ' + state.stamina + ' of ' + MAX_STAMINA}>
              <div className="stamina-heading"><span className="meta-label">STAMINA</span><strong>{state.stamina}/{MAX_STAMINA}</strong></div>
              <div className="stamina-track" role="progressbar" aria-valuemin={0} aria-valuemax={MAX_STAMINA} aria-valuenow={state.stamina}><span style={{ width: Math.max(0, Math.min(100, staminaPercent)) + '%' }} /></div>
              <span className="stamina-hint">R / REST +{REST_RECOVERY}</span>
            </div>
            <div className="header-meta hidden items-center gap-5 sm:flex">
              <div><span className="meta-label">WORLD</span><strong>100 × 100</strong></div>
              <div><span className="meta-label">VIEW</span><strong>{zoom.width} × {zoom.height}</strong></div>
              <div className="compass-badge" aria-label="Compass marker"><Compass size={18} /><span>N</span></div>
            </div>
          </div>
        </header>

        <div className="game-layout grid min-h-0 flex-1 gap-3 py-3 sm:gap-5 sm:py-5 lg:gap-7">
          <section className="map-column console-enter order-1 flex min-h-0 min-w-0 flex-col" aria-label="Active overworld map">
            <div className="map-heading flex shrink-0 items-end justify-between gap-3 pb-2 sm:pb-3">
              <div>
                <p className="eyebrow text-teal">THE CONTINENT, UNFOLDED</p>
                <p className="map-caption">{zoom.label} view · {zoom.width} × {zoom.height} tiles · {followPlayer ? 'tracking player' : 'map pan mode'}</p>
              </div>
              <div className="map-tools">
                <label className="zoom-control"><span>ZOOM</span><select value={zoomId} onChange={(event) => { setZoomId(event.currentTarget.value as ZoomId); setFollowPlayer(true); }} aria-label="Map zoom level" data-testid="select-map-zoom">{ZOOM_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label} · {option.width}×{option.height}</option>)}</select></label>
                <button className="reset-button flex min-h-9 shrink-0 items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] sm:text-[9px]" onClick={resetPosition} type="button" data-testid="button-reset-position">
                  <RotateCcw size={12} strokeWidth={2} aria-hidden="true" /><span>Reset trail</span>
                </button>
              </div>
            </div>

            <div className="map-console" data-testid="map-console">
              <div className="map-coordinate-bar">
                <span>W {String(cameraOrigin.x).padStart(2, '0')}</span>
                <span className="coordinate-rule" />
                <span>E {String(Math.min(WORLD_SIZE - 1, cameraOrigin.x + zoom.width - 1)).padStart(2, '0')}</span>
              </div>
              <div className="map-navigation-frame">
                <div className="map-pan-top"><MapPanButton label="Pan map north" icon={ChevronUp} onPress={() => panMap(0, -zoom.panStep)} disabled={cameraOrigin.y === 0} testId="button-pan-map-north" /></div>
                <div className="map-pan-row">
                  <MapPanButton label="Pan map west" icon={ChevronLeft} onPress={() => panMap(-zoom.panStep, 0)} disabled={cameraOrigin.x === 0} testId="button-pan-map-west" />
                  <div className="map-window-shell">
                    <div className={'map-surface zoom-' + zoom.id} aria-label={zoom.label + ' view of the 100 by 100 overworld'} data-testid="board-ground-map" role="img" style={{ gridTemplateColumns: 'repeat(' + zoom.width + ', minmax(0, 1fr))', gridTemplateRows: 'repeat(' + zoom.height + ', minmax(0, 1fr))', aspectRatio: zoom.width + ' / ' + zoom.height }}>
                      {mapView.cells.map((cell) => {
                        const isPlayer = cell.x === state.position.x && cell.y === state.position.y;
                        const isSelected = selectedTile?.x === cell.x && selectedTile?.y === cell.y;
                        const town = townAt(cell.x, cell.y);
                        const label = isPlayer ? 'Player at ' + positionLabel(cell) : town ? town.name + ', ' + town.kind + ', at ' + positionLabel(cell) : cell.terrain + ' at ' + positionLabel(cell);
                        return (
                          <div className={'map-cell terrain-' + cell.terrain + (isPlayer ? ' is-player move-' + (state.moveTick % 3) + ' face-' + state.direction : '') + (isSelected ? ' is-selected' : '')} key={cell.x + '-' + cell.y} aria-label={label + '. Select for tile information.'} data-testid={'tile-' + cell.x + '-' + cell.y} role="button" tabIndex={0} onClick={() => selectTile({ x: cell.x, y: cell.y })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTile({ x: cell.x, y: cell.y }); } }}>
                            {zoom.showMarks && <span className="terrain-mark" aria-hidden="true">{terrainMark(cell.terrain)}</span>}
                            {town && <img className={'village-sprite town-' + town.color} src="/village-sprite.svg" alt="" aria-hidden="true" />}
                            {isPlayer && <img className="player-sprite" src="/player-sprite.svg" alt="" aria-hidden="true" />}
                            {town && <span className="town-name" aria-hidden="true">{town.name}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <MapPanButton label="Pan map east" icon={ChevronRight} onPress={() => panMap(zoom.panStep, 0)} disabled={cameraOrigin.x + zoom.width >= WORLD_SIZE} testId="button-pan-map-east" />
                </div>
                <div className="map-pan-bottom"><MapPanButton label="Pan map south" icon={ChevronDown} onPress={() => panMap(0, zoom.panStep)} disabled={cameraOrigin.y + zoom.height >= WORLD_SIZE} testId="button-pan-map-south" /></div>
              </div>
              <div className="map-coordinate-bar bottom">
                <span>N {String(cameraOrigin.y).padStart(2, '0')}</span>
                <span className="coordinate-rule" />
                <span>S {String(Math.min(WORLD_SIZE - 1, cameraOrigin.y + zoom.height - 1)).padStart(2, '0')}</span>
              </div>
            </div>
            <div className="map-footnote mt-2 flex shrink-0 items-center justify-between gap-3 pt-2 font-mono text-[8px] sm:mt-3 sm:pt-3 sm:text-[10px]">
              <span><i className="legend-dot player-dot" /> YOU ARE HERE <strong>@</strong></span>
              <span className="hidden sm:inline">SELECT A TILE FOR INTEL</span>
              <span><i className="legend-dot town-dot" /> {towns.length} TOWNS MAPPED</span>
            </div>
          </section>

          <aside className="play-rail console-enter console-delay-1 order-2 grid min-h-0 gap-3" aria-label="Playtest controls and status">
            <div id="mobile-info-panels" className={'info-panels grid min-h-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-1 ' + (showInfo ? 'is-open' : '')}>
              <StatusPanel state={state} nearestTown={nearestTown} />
              <TileInfoPanel selectedTile={selectedTile} />
              <MessagePanel state={state} />
            </div>
            <ControlPanel onMove={move} onRest={rest} showInfo={showInfo} onToggleInfo={() => setShowInfo((visible) => !visible)} />
          </aside>
        </div>

        <footer className="footer console-enter console-delay-2 flex shrink-0 items-center justify-between gap-3 pt-2 font-mono text-[8px] sm:pt-3 sm:text-[10px]">
          <span className="flex items-center gap-1.5"><Keyboard size={11} aria-hidden="true" /> WASD / ARROWS MOVE</span>
          <span className="hidden sm:inline">DETERMINISTIC CARTOGRAPHY / NO BACKEND</span>
          <span>R RESTS / CLICK A TILE</span>
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

function TileInfoPanel({ selectedTile }: { selectedTile: Position | null }) {
  return (
    <section className="console-panel tile-info-panel min-h-0 border p-3 sm:p-4" aria-label="Selected tile information" data-testid="panel-tile-info">
      <div className="panel-heading flex items-center justify-between pb-2 sm:pb-3"><p className="eyebrow">TILE INTEL</p><span className="panel-index">02</span></div>
      {!selectedTile ? (
        <p className="tile-empty font-mono text-[9px] leading-relaxed sm:text-[10px]">Select any tile on the map to inspect its terrain, landmark, distance, and stamina cost.</p>
      ) : (() => {
        const terrain = terrainAt(selectedTile.x, selectedTile.y);
        const town = townAt(selectedTile.x, selectedTile.y);
        const nearest = towns.map((candidate) => ({ ...candidate, distance: Math.abs(candidate.x - selectedTile.x) + Math.abs(candidate.y - selectedTile.y) })).sort((a, b) => a.distance - b.distance)[0];
        const cost = movementStaminaCost(selectedTile);
        return (
          <div className="tile-details">
            <div className="tile-detail-heading"><strong>{positionLabel(selectedTile)}</strong><span>{terrainLabel(terrain)}</span></div>
            <dl className="tile-detail-list font-mono text-[9px] sm:text-[10px]">
              <div><dt>TRAVEL COST</dt><dd className="accent-value">{cost} STAMINA</dd></div>
              <div><dt>NEAREST TOWN</dt><dd>{nearest.name} · {nearest.distance} TILES</dd></div>
            </dl>
            {town ? <div className="town-intel"><span className="meta-label">LANDMARK</span><strong>{town.name}</strong><span>{town.kind}</span><small>HORSE CART / FAST TRAVEL: TOWN SYSTEM COMING LATER</small></div> : <p className="tile-note">Every step toward remote territory adds travel strain. Water and rock are harder going.</p>}
          </div>
        );
      })()}
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

function ControlPanel({ onMove, onRest, showInfo, onToggleInfo }: { onMove: (vector: MoveVector) => void; onRest: () => void; showInfo: boolean; onToggleInfo: () => void }) {
  const press = (vector: MoveVector) => () => onMove(vector);
  const buttons = [
    { label: 'Move north', vector: { dx: 0, dy: -1, direction: 'north' } as MoveVector, icon: ChevronUp, key: 'W' },
    { label: 'Move west', vector: { dx: -1, dy: 0, direction: 'west' } as MoveVector, icon: ChevronLeft, key: 'A' },
    { label: 'Move south', vector: { dx: 0, dy: 1, direction: 'south' } as MoveVector, icon: ChevronDown, key: 'S' },
    { label: 'Move east', vector: { dx: 1, dy: 0, direction: 'east' } as MoveVector, icon: ChevronRight, key: 'D' },
  ];
  return (
    <section className="control-rail relative flex min-h-0 items-center justify-between gap-3 border p-2.5 sm:p-3 lg:block" aria-label="Movement controls">
      <div><p className="eyebrow text-sand">NAVIGATE</p><p className="control-copy">Each route spends stamina.</p></div>
      <button className="rest-button" onClick={onRest} type="button" aria-label={'Rest and recover ' + REST_RECOVERY + ' stamina'} data-testid="button-rest"><span>REST</span><small>+{REST_RECOVERY}</small></button>
      <button className="info-toggle sm:hidden" onClick={onToggleInfo} type="button" aria-expanded={showInfo} aria-controls="mobile-info-panels" data-testid="button-toggle-info"><span>{showInfo ? 'Hide notes' : 'Show notes'}</span><span aria-hidden="true">{showInfo ? '−' : '+'}</span></button>
      <div className="dpad-shell grid shrink-0 grid-cols-3 grid-rows-2 gap-1.5 p-1.5 sm:gap-2 sm:p-2 lg:mx-auto lg:mt-4 lg:w-fit" aria-label="Touch movement controls">
        <span aria-hidden="true" /><TouchButton button={buttons[0]} onPress={press(buttons[0].vector)} testId="button-move-north" /><span aria-hidden="true" />
        <TouchButton button={buttons[1]} onPress={press(buttons[1].vector)} testId="button-move-west" /><TouchButton button={buttons[2]} onPress={press(buttons[2].vector)} testId="button-move-south" /><TouchButton button={buttons[3]} onPress={press(buttons[3].vector)} testId="button-move-east" />
      </div>
      <div className="hidden shrink-0 text-right font-mono text-[9px] leading-relaxed text-sand/75 sm:block"><p>tap / click</p><p>R rests in place</p></div>
    </section>
  );
}

function MapPanButton({ label, icon: Icon, onPress, disabled, testId }: { label: string; icon: typeof ChevronUp; onPress: () => void; disabled: boolean; testId: string }) {
  return <button className="map-pan-button" onClick={onPress} type="button" aria-label={label} disabled={disabled} data-testid={testId}><Icon size={16} strokeWidth={2.4} aria-hidden="true" /></button>;
}

function TouchButton({ button, onPress, testId }: { button: { label: string; icon: typeof ChevronUp; key: string }; onPress: () => void; testId: string }) {
  const Icon = button.icon;
  return <button className="touch-button flex h-[3.5rem] w-[3.5rem] flex-col items-center justify-center gap-0.5 border sm:h-[3.75rem] sm:w-[3.75rem]" onClick={onPress} type="button" aria-label={`${button.label} (${button.key})`} data-testid={testId}><span className="font-mono text-[10px] font-bold leading-none">{button.key}</span><Icon size={19} strokeWidth={2.2} aria-hidden="true" /><span className="font-mono text-[8px] font-bold uppercase leading-none tracking-[0.08em]">{button.label.replace('Move ', '')}</span></button>;
}

function App() {
  return <Home />;
}

export default App;