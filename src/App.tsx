import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Keyboard, RotateCcw, Terminal } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';

const queryClient = new QueryClient();
const MAP_WIDTH = 11;
const MAP_HEIGHT = 9;

type Position = {
  x: number;
  y: number;
};

type Direction = 'north' | 'south' | 'east' | 'west';
type MoveVector = { dx: number; dy: number; direction: Direction };

type GameState = {
  position: Position;
  direction: Direction;
  steps: number;
  message: string;
  messages: string[];
};

const initialState: GameState = {
  position: { x: 5, y: 4 },
  direction: 'south',
  steps: 0,
  message: 'Awaiting input. The ground is quiet.',
  messages: ['Awaiting input. The ground is quiet.'],
};

const directionKeys: Record<string, MoveVector> = {
  ArrowUp: { dx: 0, dy: -1, direction: 'north' },
  w: { dx: 0, dy: -1, direction: 'north' },
  ArrowDown: { dx: 0, dy: 1, direction: 'south' },
  s: { dx: 0, dy: 1, direction: 'south' },
  ArrowLeft: { dx: -1, dy: 0, direction: 'west' },
  a: { dx: -1, dy: 0, direction: 'west' },
  ArrowRight: { dx: 1, dy: 0, direction: 'east' },
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

function gameReducer(state: GameState, action: { type: 'move'; vector: MoveVector } | { type: 'reset' }): GameState {
  if (action.type === 'reset') {
    return initialState;
  }

  const { dx, dy, direction } = action.vector;
  const nextPosition = {
    x: Math.max(0, Math.min(MAP_WIDTH - 1, state.position.x + dx)),
    y: Math.max(0, Math.min(MAP_HEIGHT - 1, state.position.y + dy)),
  };
  const changed = nextPosition.x !== state.position.x || nextPosition.y !== state.position.y;
  const message = changed
    ? `Moved ${direction}. Position ${positionLabel(nextPosition)}.`
    : `Boundary reached. Position remains ${positionLabel(state.position)}.`;

  return {
    ...state,
    position: nextPosition,
    direction,
    steps: state.steps + (changed ? 1 : 0),
    message,
    messages: [message, ...state.messages].slice(0, 5),
  };
}

function Home() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [showInfo, setShowInfo] = useState(false);

  const move = useCallback((vector: MoveVector) => {
    dispatch({ type: 'move', vector });
  }, []);

  const resetPosition = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const vector = directionKeys[key];

      if (!vector) {
        return;
      }

      event.preventDefault();
      move(vector);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  const cells = useMemo(
    () =>
      Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, index) => ({
        x: index % MAP_WIDTH,
        y: Math.floor(index / MAP_WIDTH),
      })),
    [],
  );

  return (
    <main className="game-shell min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1540px] flex-col px-3 py-3 sm:px-6 sm:py-5 lg:px-9">
        <header className="console-enter flex shrink-0 items-center justify-between gap-4 border-b border-border pb-3 sm:pb-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-accent bg-primary text-accent shadow-xs sm:h-11 sm:w-11">
              <Terminal size={18} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground sm:text-[10px]">
                FIELD CONSOLE / BUILD 01
              </p>
              <h1 className="truncate font-mono text-lg font-bold tracking-[-0.08em] text-primary sm:text-2xl">
                GREEN // FIELD
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground sm:flex">
              <span className="status-pip h-2 w-2 bg-accent" aria-hidden="true" />
              RUNNING
            </span>
            <button
              className="reset-button flex min-h-9 items-center gap-2 border border-border bg-card px-2.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-primary shadow-xs transition-transform hover:-translate-y-0.5 sm:px-3 sm:text-[10px]"
              onClick={resetPosition}
              type="button"
              data-testid="button-reset-position"
            >
              <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
        </header>

        <div className="game-layout grid min-h-0 flex-1 gap-3 py-3 sm:gap-5 sm:py-5 lg:gap-7 lg:py-6">
          <section className="console-enter order-1 flex min-h-0 min-w-0 flex-col lg:order-1">
            <div className="mx-auto flex min-h-0 w-full max-w-[800px] flex-1 flex-col justify-center">
              <div className="mb-2 flex shrink-0 items-end justify-between gap-3 sm:mb-3">
                <div>
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground sm:text-[10px]">
                    ACTIVE MAP
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-primary sm:text-xs">open ground / no features loaded</p>
                </div>
                <p className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground sm:text-[10px]">
                  {MAP_WIDTH.toString().padStart(2, '0')} × {MAP_HEIGHT.toString().padStart(2, '0')}
                </p>
              </div>

              <div className="border border-primary bg-primary p-1.5 shadow-md sm:p-3">
                <div className="border border-accent/30 bg-[#284b37] p-1.5 sm:p-3">
                  <div className="mb-1.5 grid grid-cols-[14px_1fr_14px] items-center gap-1.5 font-mono text-[8px] text-accent/75 sm:mb-3 sm:grid-cols-[18px_1fr_18px] sm:gap-2 sm:text-[9px]">
                    <span>Y</span>
                    <div className="grid grid-cols-11 text-center">
                      {Array.from({ length: MAP_WIDTH }, (_, index) => <span key={index}>{index}</span>)}
                    </div>
                    <span>Y</span>
                  </div>
                  <div
                    className="map-surface relative grid aspect-[11/9] grid-cols-11 overflow-hidden border border-accent/25"
                    aria-label="Eleven by nine open ground map"
                    data-testid="board-ground-map"
                  >
                    {cells.map((cell) => {
                      const isPlayer = cell.x === state.position.x && cell.y === state.position.y;
                      return (
                        <div
                          className={`map-cell ${isPlayer ? 'is-player' : ''}`}
                          key={`${cell.x}-${cell.y}`}
                          aria-label={isPlayer ? `Player at ${positionLabel(cell)}` : `Open ground at ${positionLabel(cell)}`}
                          data-testid={`tile-${cell.x}-${cell.y}`}
                        >
                          <span className={isPlayer ? 'player-glyph font-bold' : ''}>{isPlayer ? '@' : '.'}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 grid grid-cols-[14px_1fr_14px] items-center gap-1.5 font-mono text-[8px] text-accent/75 sm:mt-3 sm:grid-cols-[18px_1fr_18px] sm:gap-2 sm:text-[9px]">
                    <span>Y</span>
                    <div className="flex justify-between px-1">
                      <span>00</span>
                      <span>10</span>
                    </div>
                    <span>Y</span>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex shrink-0 items-center justify-between gap-3 border-t border-border pt-2 font-mono text-[8px] text-muted-foreground sm:mt-3 sm:pt-3 sm:text-[10px]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 bg-accent" aria-hidden="true" />
                  <span>YOU ARE HERE / <strong className="text-primary">@</strong></span>
                </span>
                <span className="hidden sm:inline" data-testid="text-map-bounds">movement clamped to map bounds</span>
              </div>
            </div>
          </section>

          <aside className="play-rail console-enter console-delay-1 order-2 grid min-h-0 gap-3 lg:order-2">
            <div id="mobile-info-panels" className={`info-panels grid min-h-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-1 ${showInfo ? 'is-open' : ''}`}>
              <StatusPanel state={state} />
              <MessagePanel state={state} />
            </div>
            <ControlPanel
              onMove={move}
              showInfo={showInfo}
              onToggleInfo={() => setShowInfo((visible) => !visible)}
            />
          </aside>
        </div>

        <footer className="console-enter console-delay-2 flex shrink-0 items-center justify-between gap-3 border-t border-border pt-2 font-mono text-[8px] text-muted-foreground sm:pt-3 sm:text-[10px]">
          <span className="flex items-center gap-1.5"><Keyboard size={11} aria-hidden="true" /> WASD / ARROWS</span>
          <span className="hidden sm:inline">WORLD STATE: EMPTY GROUND</span>
          <span>NO BACKEND REQUIRED</span>
        </footer>
      </div>
    </main>
  );
}

function StatusPanel({ state }: { state: GameState }) {
  return (
    <section className="console-panel min-h-0 border border-border p-3 sm:p-4" aria-label="Player status">
      <div className="flex items-center justify-between border-b border-border pb-2 sm:pb-3">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-primary sm:text-[10px]">STATUS</p>
        <span className="font-mono text-[8px] text-muted-foreground sm:text-[9px]">01</span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 font-mono text-[8px] sm:mt-4 sm:block sm:space-y-4 sm:text-[10px]">
        <div>
          <dt className="text-muted-foreground">COORDINATES</dt>
          <dd className="mt-1 text-sm font-bold tracking-[-0.06em] text-primary sm:text-lg" data-testid="text-current-coordinates">
            {positionLabel(state.position)}
          </dd>
        </div>
        <div className="data-rule pb-1 sm:pb-3">
          <dt className="text-muted-foreground">STEPS</dt>
          <dd className="mt-1 text-accent" data-testid="text-step-count">{state.steps.toString().padStart(3, '0')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">FACING</dt>
          <dd className="mt-1 text-primary" data-testid="text-facing">{directionLabel[state.direction]}</dd>
        </div>
      </dl>
    </section>
  );
}

function MessagePanel({ state }: { state: GameState }) {
  return (
    <section className="console-panel min-h-0 border border-border p-3 sm:p-4" aria-label="Game messages">
      <div className="flex items-center justify-between border-b border-border pb-2 sm:pb-3">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-primary sm:text-[10px]">MESSAGE BUFFER</p>
        <span className="status-pip h-2 w-2 bg-accent" aria-hidden="true" />
      </div>
      <p className="message-line mt-2 min-h-0 font-mono text-[9px] leading-relaxed text-primary sm:mt-4 sm:min-h-[55px] sm:text-[11px]" aria-live="polite" data-testid="text-game-message">
        {state.message}
      </p>
      <div className="mt-2 hidden border-t border-border pt-3 sm:block">
        <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">RECENT</p>
        <ol className="space-y-2 font-mono text-[9px] text-muted-foreground">
          {state.messages.slice(0, 3).map((message, index) => (
            <li className="flex gap-2" key={`${message}-${index}`}>
              <span className="text-accent">[{String(index).padStart(2, '0')}]</span>
              <span>{message}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ControlPanel({
  onMove,
  showInfo,
  onToggleInfo,
}: {
  onMove: (vector: MoveVector) => void;
  showInfo: boolean;
  onToggleInfo: () => void;
}) {
  const press = (vector: MoveVector) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onMove(vector);
  };

  const buttons = [
    { label: 'Move north', vector: { dx: 0, dy: -1, direction: 'north' } as MoveVector, icon: ChevronUp, key: 'W' },
    { label: 'Move west', vector: { dx: -1, dy: 0, direction: 'west' } as MoveVector, icon: ChevronLeft, key: 'A' },
    { label: 'Move south', vector: { dx: 0, dy: 1, direction: 'south' } as MoveVector, icon: ChevronDown, key: 'S' },
    { label: 'Move east', vector: { dx: 1, dy: 0, direction: 'east' } as MoveVector, icon: ChevronRight, key: 'D' },
  ];

  return (
    <section className="control-rail flex min-h-0 items-center justify-between gap-4 border border-primary p-3 shadow-md sm:p-4 lg:block" aria-label="Movement controls">
      <div className="min-w-0 self-stretch lg:flex lg:items-center lg:justify-between">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-accent sm:text-[10px]">MOVE</p>
          <p className="mt-1 font-mono text-[9px] text-primary-foreground/65">Tap a direction</p>
        </div>
        <div className="mt-2 flex items-center gap-1 font-mono text-[9px] text-primary-foreground/70 lg:mt-0">
          <span>W A S D</span><span className="text-accent">/</span><span>ARROWS</span>
        </div>
      </div>
      <button className="info-toggle sm:hidden" onClick={onToggleInfo} type="button" aria-expanded={showInfo} aria-controls="mobile-info-panels">
        <span>{showInfo ? 'Hide info' : 'Show info'}</span>
        <span aria-hidden="true">{showInfo ? '−' : '+'}</span>
      </button>
      <div className="dpad-shell grid shrink-0 grid-cols-3 grid-rows-2 gap-1.5 p-1.5 sm:gap-2 sm:p-2 lg:mx-auto lg:mt-3 lg:w-fit" aria-label="Touch movement controls">
        <span />
        <TouchButton button={buttons[0]} onPress={press(buttons[0].vector)} testId="button-move-north" />
        <span />
        <TouchButton button={buttons[1]} onPress={press(buttons[1].vector)} testId="button-move-west" />
        <TouchButton button={buttons[2]} onPress={press(buttons[2].vector)} testId="button-move-south" />
        <TouchButton button={buttons[3]} onPress={press(buttons[3].vector)} testId="button-move-east" />
      </div>
      <div className="hidden shrink-0 text-right font-mono text-[9px] leading-relaxed text-primary-foreground/65 sm:block lg:block">
        <p>1 press</p>
        <p>= 1 square</p>
      </div>
    </section>
  );
}

function TouchButton({
  button,
  onPress,
  testId,
}: {
  button: { label: string; icon: typeof ChevronUp; key: string };
  onPress: (event: PointerEvent<HTMLButtonElement>) => void;
  testId: string;
}) {
  const Icon = button.icon;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPress(event as unknown as PointerEvent<HTMLButtonElement>);
    }
  };

  return (
      <button
      className="touch-button flex h-[3.75rem] w-[3.75rem] flex-col items-center justify-center gap-0.5 border border-border bg-card text-primary sm:h-[4.25rem] sm:w-[4.25rem]"
      onKeyDown={handleKeyDown}
      onPointerDown={onPress}
      type="button"
      aria-label={`${button.label} (${button.key})`}
      data-testid={testId}
    >
      <span className="font-mono text-[10px] font-bold leading-none">{button.key}</span>
      <Icon size={19} strokeWidth={2.2} aria-hidden="true" />
      <span className="font-mono text-[8px] font-bold uppercase leading-none tracking-[0.08em]">{button.label.replace('Move ', '')}</span>
    </button>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;