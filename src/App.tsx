import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw, Terminal } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useReducer } from 'react';
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

  const move = useCallback((vector: MoveVector) => {
    dispatch({ type: 'move', vector });
  }, []);

  const resetPosition = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1440px] flex-col px-4 py-4 sm:px-7 sm:py-7 lg:px-10">
        <header className="console-enter flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center border border-primary bg-primary text-accent sm:h-11 sm:w-11">
              <Terminal size={19} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                FIELD CONSOLE / BUILD 01
              </p>
              <h1 className="mt-1 font-mono text-2xl font-bold tracking-[-0.07em] text-primary sm:text-3xl">
                GREEN // FIELD
              </h1>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              <span className="h-2 w-2 bg-accent" aria-hidden="true" />
              RUNNING
            </span>
            <button
              className="reset-button flex items-center gap-2 border border-border bg-card px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-primary shadow-xs transition-transform hover:-translate-y-0.5"
              onClick={resetPosition}
              type="button"
              data-testid="button-reset-position"
            >
              <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
              Reset
            </button>
          </div>
        </header>

        <div className="grid flex-1 gap-5 py-6 sm:py-8 lg:grid-cols-[190px_minmax(0,1fr)_230px] lg:items-center lg:gap-7 lg:py-10">
          <aside className="console-enter console-delay-1 order-2 flex flex-col gap-4 lg:order-1">
            <StatusPanel state={state} />
            <div className="hidden border border-border bg-secondary/70 p-4 lg:block">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">LEGEND</p>
              <div className="mt-4 space-y-3 font-mono text-[10px] text-muted-foreground">
                <p className="flex items-center gap-3"><span className="text-lg leading-none text-accent">@</span> player</p>
                <p className="flex items-center gap-3"><span className="text-lg leading-none text-primary">.</span> open ground</p>
              </div>
            </div>
          </aside>

          <section className="console-enter order-1 min-w-0 lg:order-2">
            <div className="mx-auto w-full max-w-[720px]">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    ACTIVE MAP
                  </p>
                  <p className="mt-1 font-mono text-xs text-primary">open ground / no features loaded</p>
                </div>
                <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
                  {MAP_WIDTH.toString().padStart(2, '0')} × {MAP_HEIGHT.toString().padStart(2, '0')}
                </p>
              </div>

              <div className="border border-primary bg-primary p-2 shadow-md sm:p-3">
                <div className="border border-accent/30 bg-[#2a4936] p-2 sm:p-3">
                  <div className="mb-2 grid grid-cols-[18px_1fr_18px] items-center gap-2 font-mono text-[9px] text-accent/75 sm:mb-3">
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
                  <div className="mt-2 grid grid-cols-[18px_1fr_18px] items-center gap-2 font-mono text-[9px] text-accent/75 sm:mt-3">
                    <span>Y</span>
                    <div className="flex justify-between px-1">
                      <span>00</span>
                      <span>10</span>
                    </div>
                    <span>Y</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 bg-accent" aria-hidden="true" />
                  <span>YOU ARE HERE / <strong className="text-primary">@</strong></span>
                </span>
                <span data-testid="text-map-bounds">movement clamped to map bounds</span>
              </div>
            </div>
          </section>

          <aside className="console-enter console-delay-2 order-3 flex flex-col gap-4 lg:order-3">
            <MessagePanel state={state} />
            <ControlPanel onMove={move} />
          </aside>
        </div>

        <footer className="console-enter console-delay-3 flex flex-col gap-3 border-t border-border pt-4 font-mono text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>INPUT: ARROW KEYS / W A S D</span>
          <span>WORLD STATE: EMPTY GROUND</span>
          <span>NO BACKEND REQUIRED</span>
        </footer>
      </div>
    </main>
  );
}

function StatusPanel({ state }: { state: GameState }) {
  return (
    <section className="console-panel border border-border p-4" aria-label="Player status">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">STATUS</p>
        <span className="font-mono text-[9px] text-muted-foreground">01</span>
      </div>
      <dl className="mt-4 space-y-4 font-mono text-[10px]">
        <div>
          <dt className="text-muted-foreground">COORDINATES</dt>
          <dd className="mt-1 text-lg font-bold tracking-[-0.05em] text-primary" data-testid="text-current-coordinates">
            {positionLabel(state.position)}
          </dd>
        </div>
        <div className="data-rule pb-3">
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
    <section className="console-panel border border-border p-4" aria-label="Game messages">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">MESSAGE BUFFER</p>
        <span className="h-2 w-2 bg-accent" aria-hidden="true" />
      </div>
      <p className="mt-4 min-h-[55px] font-mono text-[11px] leading-relaxed text-primary" data-testid="text-game-message">
        {state.message}
      </p>
      <div className="mt-4 border-t border-border pt-3">
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

function ControlPanel({ onMove }: { onMove: (vector: MoveVector) => void }) {
  const press = (vector: MoveVector) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onMove(vector);
  };

  const buttons = [
    { label: 'Move north', vector: { dx: 0, dy: -1, direction: 'north' } as MoveVector, icon: ChevronUp },
    { label: 'Move west', vector: { dx: -1, dy: 0, direction: 'west' } as MoveVector, icon: ChevronLeft },
    { label: 'Move south', vector: { dx: 0, dy: 1, direction: 'south' } as MoveVector, icon: ChevronDown },
    { label: 'Move east', vector: { dx: 1, dy: 0, direction: 'east' } as MoveVector, icon: ChevronRight },
  ];

  return (
    <section className="border border-border bg-secondary/70 p-4" aria-label="Movement controls">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">INPUT</p>
        <p className="font-mono text-[9px] text-muted-foreground">MOVE</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="grid grid-cols-3 grid-rows-2 gap-1.5" aria-label="Touch movement controls">
          <span />
          <TouchButton button={buttons[0]} onPress={press(buttons[0].vector)} testId="button-move-north" />
          <span />
          <TouchButton button={buttons[1]} onPress={press(buttons[1].vector)} testId="button-move-west" />
          <TouchButton button={buttons[2]} onPress={press(buttons[2].vector)} testId="button-move-south" />
          <TouchButton button={buttons[3]} onPress={press(buttons[3].vector)} testId="button-move-east" />
        </div>
        <div className="hidden space-y-2 text-right font-mono text-[9px] leading-relaxed text-muted-foreground sm:block">
          <p>W A S D</p>
          <p>or arrow keys</p>
        </div>
      </div>
      <p className="mt-4 font-mono text-[9px] leading-relaxed text-muted-foreground sm:hidden">Touch controls active on this viewport.</p>
    </section>
  );
}

function TouchButton({
  button,
  onPress,
  testId,
}: {
  button: { label: string; icon: typeof ChevronUp };
  onPress: (event: PointerEvent<HTMLButtonElement>) => void;
  testId: string;
}) {
  const Icon = button.icon;
  return (
    <button
      className="touch-button flex h-9 w-9 items-center justify-center border border-border bg-card text-primary shadow-xs transition-transform hover:-translate-y-0.5 hover:border-accent hover:text-accent active:translate-y-0 active:shadow-none sm:h-10 sm:w-10"
      onPointerDown={onPress}
      type="button"
      aria-label={button.label}
      data-testid={testId}
    >
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
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