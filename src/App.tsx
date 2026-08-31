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
type HorseState = { chunk: Point; position: Point };

const WALK_SPEED = 32;
const HORSE_SPEED = 180;
const HORSE_MOUNT_DISTANCE = 4.5;
const initialHorseState: HorseState = { chunk: { x: 4, y: 7 }, position: { x: 58, y: 52 } };

const directionKeys: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const delta: Record<Direction, Point> = {
  up: { x: 0, y: -2.4 }, down: { x: 0, y: 2.4 }, left: { x: -2.4, y: 0 }, right: { x: 2.4, y: 0 },
};
const terrainTypes = ['meadow', 'woodland', 'rock', 'shore', 'autumn', 'ocean'] as const;
type Terrain = (typeof terrainTypes)[number];
const fieldPalettes: Record<Terrain, { field: string; path: string; glow: string }> = {
  meadow: { field: '#77a45b', path: '#d9b979', glow: 'rgba(255, 227, 157, .22)' },
  woodland: { field: '#658e58', path: '#c7a66b', glow: 'rgba(180, 214, 141, .18)' },
  rock: { field: '#87927a', path: '#c9b27d', glow: 'rgba(238, 228, 186, .2)' },
  shore: { field: '#6f9b88', path: '#dfc58d', glow: 'rgba(218, 239, 194, .2)' },
  autumn: { field: '#9b785d', path: '#d6ae70', glow: 'rgba(255, 198, 123, .2)' },
  ocean: { field: '#2a6f8d', path: '#8ab8bd', glow: 'rgba(140, 213, 219, .2)' },
};

type RegionStyle = 'greenvale' | 'brackenfen' | 'ironwood' | 'northwatch' | 'sunwash' | 'ocean';
const regionPalettes: Record<Exclude<RegionStyle, 'ocean'>, { field: string; path: string; glow: string }> = {
  greenvale: { field: '#77a45b', path: '#d9b979', glow: 'rgba(255, 227, 157, .22)' },
  brackenfen: { field: '#617d51', path: '#bca979', glow: 'rgba(186, 207, 135, .2)' },
  ironwood: { field: '#587b58', path: '#c4a26c', glow: 'rgba(188, 219, 157, .18)' },
  northwatch: { field: '#858a78', path: '#d0bd8b', glow: 'rgba(238, 228, 186, .2)' },
  sunwash: { field: '#9a7658', path: '#d7ac6b', glow: 'rgba(255, 198, 123, .2)' },
};

function regionStyleFor(point: Point): RegionStyle {
  const distanceFromGreenvale = Math.max(Math.abs(point.x - 4), Math.abs(point.y - 7));
  if (distanceFromGreenvale >= 7) return 'ocean';
  if (point.y <= 5) return 'northwatch';
  if (point.x <= 3) return 'brackenfen';
  if (point.x >= 6) return 'ironwood';
  if (point.y >= 9) return 'sunwash';
  return 'greenvale';
}

function chunkTerrain(chunk: Point): Terrain {
  const seed = Math.abs((chunk.x * 73856093) ^ (chunk.y * 19349663));
  return terrainTypes[seed % terrainTypes.length];
}

type SettlementKind = 'village' | 'town';
type MapTile = {
  x: number;
  y: number;
  terrain: Terrain;
  regionStyle: RegionStyle;
  waterFeature: 'river' | 'lake' | 'sea' | null;
  road: 'horizontal' | 'vertical' | 'cross' | 'none';
  bridge: boolean;
  landmark: { name: string; kind: SettlementKind } | null;
};

const mapLandmarks: Record<string, { name: string; kind: SettlementKind }> = {
  '4,7': { name: 'Mosslight Crossing', kind: 'town' },
  '2,6': { name: 'Fenmere Hamlet', kind: 'village' },
  '6,8': { name: 'Ironwood Southhold', kind: 'town' },
  '5,4': { name: 'Northwatch Beacon', kind: 'village' },
};

function mapTileFor(point: Point): MapTile {
  // Wide regional bands keep the world readable while the outer rim is reserved for ocean.
  const regionStyle = regionStyleFor(point);
  const riverX = Math.round(2.8 + Math.sin((point.y - 7) * 0.68) * 1.45);
  const mainRiver = point.x === riverX;
  const branchRiverY = Math.round(8 + Math.sin(point.x * 0.55) * 0.8);
  const branchRiver = point.y === branchRiverY && point.x >= 2 && point.x <= 7;
  const lake = (point.x === 6 && point.y === 5) || (point.x === 7 && point.y === 5);
  const waterFeature = regionStyle === 'ocean' ? 'sea' : lake ? 'lake' : mainRiver || branchRiver ? 'river' : null;
  const isOcean = waterFeature === 'sea';

  const ridgeBoundary = 4 + Math.sin(point.x * 0.5) * 1.1;
  const isRidge = point.y <= ridgeBoundary || point.x <= 0;
  const isWoodland = !isRidge && ((point.x <= 3 && point.y >= 6) || (point.x >= 6 && point.y >= 7) || (point.x === 5 && point.y === 5));
  const isAutumn = !isRidge && !isWoodland && point.y >= 9 && point.x <= 3;
  const terrain = isOcean ? 'ocean' : isRidge ? 'rock' : isWoodland ? 'woodland' : isAutumn ? 'autumn' : 'meadow';

  const horizontalRoadY = Math.round(7 + Math.sin((point.x - 2) * 0.65) * 0.55);
  const verticalRoadX = Math.round(4 + Math.sin((point.y - 7) * 0.45) * 0.4);
  const horizontalRoad = !isOcean && point.y === horizontalRoadY;
  const verticalRoad = !isOcean && point.x === verticalRoadX;
  const road = horizontalRoad && verticalRoad ? 'cross' : horizontalRoad ? 'horizontal' : verticalRoad ? 'vertical' : 'none';
  const bridge = waterFeature !== null && !isOcean && road !== 'none';

  return {
    ...point,
    terrain,
    regionStyle,
    waterFeature,
    road,
    bridge,
    landmark: mapLandmarks[point.x + ',' + point.y] || null,
  };
}

type FieldTree = { id: number; x: number; y: number; scale: number; variant: number; style: RegionStyle };
type FieldRect = { left: number; top: number; right: number; bottom: number };

function fieldHouseRects(kind: SettlementKind): FieldRect[] {
  const parent = kind === 'town'
    ? { left: 19, top: 21, width: 62, height: 58 }
    : { left: 23, top: 24, width: 54, height: 52 };
  const specs = [
    { left: 8, top: 11, width: 19, height: 13, scale: 1 },
    { left: 73, top: 12, width: 19, height: 13, scale: 1 },
    { left: 8, top: 75, width: 19, height: 13, scale: 1 },
    { left: 73, top: 75, width: 19, height: 13, scale: 1 },
    { left: 39, top: 7, width: 19, height: 13, scale: 0.8 },
    { left: 39, top: 80, width: 19, height: 13, scale: 0.8 },
  ];

  return specs.map((spec) => {
    const width = spec.width * spec.scale;
    const height = spec.height * spec.scale;
    const left = spec.left + (spec.width - width) / 2;
    const top = spec.top + (spec.height - height) / 2;
    return {
      left: parent.left + (left / 100) * parent.width,
      top: parent.top + (top / 100) * parent.height,
      right: parent.left + ((left + width) / 100) * parent.width,
      bottom: parent.top + ((top + height) / 100) * parent.height,
    };
  });
}

function pointInRect(point: Point, rect: FieldRect, padding = 0) {
  return point.x >= rect.left - padding && point.x <= rect.right + padding && point.y >= rect.top - padding && point.y <= rect.bottom + padding;
}

function fieldTreesFor(chunk: Point): FieldTree[] {
  let seed = Math.abs((chunk.x * 92837111) + (chunk.y * 689287499)) + 1;
  const random = () => {
    const value = Math.sin(seed++) * 10000;
    return value - Math.floor(value);
  };
  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
  const houseRects = landmark ? fieldHouseRects(landmark.kind) : [];
  const treeStyle = regionStyleFor(chunk);
  const trees: FieldTree[] = [];
  const targetCount = 8 + Math.floor(random() * 5);
  let attempts = 0;

  while (trees.length < targetCount && attempts < targetCount * 24) {
    attempts += 1;
    const x = 14 + random() * 72;
    const y = 13 + random() * 74;
    const scale = 0.72 + random() * 0.48;
    const center = { x: x + 3.2 * scale, y: y + 2.5 * scale };
    const tooCloseToStart = Math.hypot(center.x - 50, center.y - 52) < 12;
    const tooCloseToBuilding = houseRects.some((rect) => pointInRect(center, rect, 5));
    const tooCloseToTree = trees.some((tree) => Math.hypot(center.x - (tree.x + 3.2 * tree.scale), center.y - (tree.y + 2.5 * tree.scale)) < 9);
    if (tooCloseToStart || tooCloseToBuilding || tooCloseToTree) continue;
    trees.push({ id: trees.length, x, y, scale, variant: Math.floor(random() * 3), style: treeStyle });
  }

  return trees;
}

function isFieldPositionBlocked(position: Point, chunk: Point) {
  const tile = mapTileFor(chunk);
  if (tile.waterFeature === 'sea' || (tile.waterFeature !== null && !tile.bridge)) return true;

  const treeBlocked = fieldTreesFor(chunk).some((tree) => {
    const center = { x: tree.x + 3.2 * tree.scale, y: tree.y + 2.5 * tree.scale };
    return Math.hypot(position.x - center.x, position.y - center.y) < 5.2 * tree.scale;
  });
  if (treeBlocked) return true;

  const landmark = mapLandmarks[chunk.x + ',' + chunk.y];
  return landmark ? fieldHouseRects(landmark.kind).some((rect) => pointInRect(position, rect, 2.5)) : false;
}

function mapTileClass(tile: MapTile & { current: boolean }) {
  return [
    'map-tile',
    'map-terrain-' + tile.terrain,
    'map-region-' + tile.regionStyle,
    tile.waterFeature ? 'is-' + tile.waterFeature : '',
    tile.road !== 'none' ? 'has-road road-' + tile.road : '',
    tile.bridge ? 'has-bridge' : '',
    tile.current ? 'is-current' : '',
  ].filter(Boolean).join(' ');
}

function chunkRegion(chunk: Point) {
  // Every land chunk gets a named reach; Greenvale is reserved for the village itself.
  if (chunk.x === 4 && chunk.y === 7) return 'Greenvale';

  const latitudeNames = ['Far North', 'North', 'Upper', 'Northgate', 'Central', 'Southgate', 'Lower', 'South', 'Far South'];
  const latitude = latitudeNames[Math.max(0, Math.min(latitudeNames.length - 1, chunk.y - 3))];
  const coastalSea = Math.abs(chunk.x - 4) >= 4 || Math.abs(chunk.y - 7) >= 4;
  if (coastalSea) return latitude + (chunk.x < 4 ? ' Western Sea' : chunk.x > 4 ? ' Eastern Sea' : ' Open Sea');

  if (chunk.x <= 3) {
    const reach = chunk.x <= 1 ? 'Deep Brackenfen' : chunk.x === 2 ? 'Outer Brackenfen' : 'Brackenfen Gate';
    return latitude === 'Central' ? reach : latitude + ' ' + reach;
  }
  if (chunk.x >= 5) {
    const reach = chunk.x >= 7 ? 'Deep Ironwood March' : chunk.x === 6 ? 'Outer Ironwood March' : 'Ironwood Gate';
    return latitude === 'Central' ? reach : latitude + ' ' + reach;
  }
  if (chunk.y <= 6) return chunk.y <= 4 ? 'High Northwatch Heights' : chunk.y === 5 ? 'Outer Northwatch Heights' : 'Northwatch Foothills';
  return chunk.y >= 10 ? 'Far Sunwash Coast' : chunk.y === 9 ? 'Outer Sunwash Coast' : 'Sunwash Foothills';
}

const initialLogs = [
  { text: 'You arrive at the Mosslight Crossing.', color: '' },
  { text: 'A test horse waits just east of the square.', color: 'blue' },
  { text: 'The east path is clear.', color: 'blue' },
  { text: 'Your field position was saved locally.', color: '' },
];

function WorldMap({ chunk, onClose }: { chunk: Point; onClose: () => void }) {
  const [zoom, setZoom] = useState(2);
  const radius = 6 - zoom;
  const gridSize = radius * 2 + 1;
  const mapScale = [0.72, 0.86, 1, 1.12][zoom - 1];
  const tiles = Array.from({ length: gridSize * gridSize }, (_, index) => {
    const row = Math.floor(index / gridSize);
    const column = index % gridSize;
    const point = {
      x: chunk.x + column - radius,
      y: chunk.y + row - radius,
    };
    return { ...mapTileFor(point), current: point.x === chunk.x && point.y === chunk.y };
  });

  return (
    <div className="map-overlay" role="dialog" aria-modal="true" aria-labelledby="map-title" data-testid="overlay-world-map">
      <div className="map-sheet">
        <div className="map-sheet-heading">
          <h2 id="map-title">Field atlas</h2>
          <button className="map-close" onClick={onClose} aria-label="Close world map" data-testid="button-close-map"><X size={19} /></button>
        </div>
        <div className="map-toolbar">
          <span className="map-area-label">{chunkRegion(chunk)} region · {mapTileFor(chunk).terrain}</span>
          <div className="map-zoom-controls" aria-label="Map zoom controls">
            <button className="map-zoom-button" onClick={() => setZoom((value) => Math.max(1, value - 1))} disabled={zoom === 1} aria-label="Zoom out" data-testid="button-map-zoom-out"><Minus size={15} /></button>
            <span className="map-zoom-level">×{zoom}</span>
            <button className="map-zoom-button" onClick={() => setZoom((value) => Math.min(4, value + 1))} disabled={zoom === 4} aria-label="Zoom in" data-testid="button-map-zoom-in"><Plus size={15} /></button>
          </div>
        </div>
        <div className="big-map" data-testid="map-world-preview">
          <div className="map-grid" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, transform: `scale(${mapScale})` }}>
            {tiles.map((tile) => (
              <div className={mapTileClass(tile)} key={tile.x + '-' + tile.y} title={'Chunk ' + tile.x + ', ' + tile.y + ' · ' + (tile.landmark?.name || chunkRegion(tile))}>
                {tile.landmark && <span className={`map-settlement ${tile.landmark.kind}`} aria-label={tile.landmark.name} />}
                {tile.current && <span className="map-tile-player" aria-label="Your current position" />}
                {tile.current && <span className="map-tile-label">{tile.x}, {tile.y}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="map-legend">
          <span className="legend-item"><span className="legend-dot" /> You are here</span>
          <span className="legend-item"><span className="legend-dot gold" /> Waypoint</span>
          <span className="legend-item"><span className="legend-line river" /> River</span>
          <span className="legend-item"><span className="legend-line road" /> Road</span>
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
  const [mounted, setMounted] = useState(false);
  const [horse, setHorse] = useState<HorseState>(initialHorseState);
  const [horseFacing, setHorseFacing] = useState<Direction>('down');
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState(initialLogs);
  const [time, setTime] = useState('08:43');
  const keysRef = useRef<Partial<Record<Direction, boolean>>>({});
  const positionRef = useRef(position);
  const chunkRef = useRef(chunk);
  const mountedRef = useRef(mounted);
  const horseRef = useRef(horse);
  const horseIdleAnchorRef = useRef(initialHorseState.position);
  const gameFrameRef = useRef<HTMLDivElement>(null);
  const areaFlashIdRef = useRef(0);

  useEffect(() => {
    ['/assets/gameplay/shining-fields/characters/player/idle.png', '/assets/gameplay/shining-fields/characters/player/run.png'].forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { chunkRef.current = chunk; }, [chunk]);
  useEffect(() => { mountedRef.current = mounted; }, [mounted]);
  useEffect(() => { horseRef.current = horse; }, [horse]);

  useEffect(() => {
    if (mounted) return;

    const idleDirections: Direction[] = ['up', 'down', 'left', 'right'];
    let idleTimer = 0;
    const scheduleIdleAction = () => {
      idleTimer = window.setTimeout(() => {
        if (mountedRef.current) return;

        const direction = idleDirections[Math.floor(Math.random() * idleDirections.length)];
        setHorseFacing(direction);

        if (Math.random() < 0.38) {
          const currentHorse = horseRef.current;
          const idleStep = 3;
          const nextPosition = {
            x: currentHorse.position.x + (direction === 'left' ? -idleStep : direction === 'right' ? idleStep : 0),
            y: currentHorse.position.y + (direction === 'up' ? -idleStep : direction === 'down' ? idleStep : 0),
          };
          const anchor = horseIdleAnchorRef.current;
          const withinIdleArea = Math.hypot(nextPosition.x - anchor.x, nextPosition.y - anchor.y) <= 9;
          const withinField = nextPosition.x >= 12 && nextPosition.x <= 88 && nextPosition.y >= 12 && nextPosition.y <= 88;

          if (withinIdleArea && withinField) {
            setHorse((current) => ({ ...current, position: nextPosition }));
          }
        }

        if (!mountedRef.current) scheduleIdleAction();
      }, 2200 + Math.random() * 2800);
    };

    scheduleIdleAction();
    return () => window.clearTimeout(idleTimer);
  }, [mounted]);

  useEffect(() => {
    areaFlashIdRef.current += 1;
    setAreaFlash({ id: String(areaFlashIdRef.current), label: chunkRegion(chunk) });
  }, [chunk]);

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
        const speed = mountedRef.current ? HORSE_SPEED : WALK_SPEED;
        const frameWidth = gameFrameRef.current?.clientWidth || window.innerWidth;
        const frameHeight = gameFrameRef.current?.clientHeight || window.innerHeight;
        const movement = {
          x: (input.x / length) * speed * elapsed * 100 / frameWidth,
          y: (input.y / length) * speed * elapsed * 100 / frameHeight,
        };
        const current = positionRef.current;
        const next = { x: current.x + movement.x, y: current.y + movement.y };
        const nextChunk = { ...chunkRef.current };
        const travelLabels: string[] = [];
        if (next.x < 10) { next.x = 88; nextChunk.x -= 1; travelLabels.push('west'); }
        if (next.x > 90) { next.x = 12; nextChunk.x += 1; travelLabels.push('east'); }
        if (next.y < 12) { next.y = 86; nextChunk.y -= 1; travelLabels.push('north'); }
        if (next.y > 88) { next.y = 14; nextChunk.y += 1; travelLabels.push('south'); }
        if (!isFieldPositionBlocked(next, nextChunk)) {
          positionRef.current = next;
          setPosition(next);
          if (travelLabels.length > 0) {
            chunkRef.current = nextChunk;
            setChunk(nextChunk);
            onChunkChange(nextChunk);
            setLogs((currentLogs) => [{
              text: `You travel ${travelLabels.join(' and ')} into ${chunkRegion(nextChunk)} · chunk ${nextChunk.x}, ${nextChunk.y}.`,
              color: 'blue',
            }, ...currentLogs].slice(0, 3));
          }
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

  const horseHere = horse.chunk.x === chunk.x && horse.chunk.y === chunk.y;
  const horseDistance = Math.hypot(position.x - horse.position.x, position.y - horse.position.y);
  const canMount = !mounted && horseHere && horseDistance <= HORSE_MOUNT_DISTANCE;
  const showHorse = mounted || horseHere;
  const horseDisplayPosition = mounted ? position : horse.position;

  const toggleMount = () => {
    if (mounted) {
      const currentPosition = positionRef.current;
      const currentChunk = chunkRef.current;
      const preferredOffset = facing === 'right' ? -6 : facing === 'left' ? 6 : currentPosition.x < 50 ? 6 : -6;
      const dismountPosition = {
        x: Math.min(88, Math.max(12, currentPosition.x + preferredOffset)),
        y: Math.min(88, Math.max(12, currentPosition.y)),
      };
      horseIdleAnchorRef.current = dismountPosition;

      setHorse({ chunk: currentChunk, position: currentPosition });
      positionRef.current = dismountPosition;
      setPosition(dismountPosition);
      setMounted(false);
      setLogs((currentLogs) => [{ text: 'You dismount and leave the horse here.', color: '' }, ...currentLogs].slice(0, 3));
      return;
    }

    if (!canMount) {
      setLogs((currentLogs) => [{ text: horseHere ? 'The horse is too far away to mount.' : 'Your horse is in another field.', color: 'blue' }, ...currentLogs].slice(0, 3));
      return;
    }

    const currentChunk = chunkRef.current;
    const mountPosition = { ...horse.position };
    positionRef.current = mountPosition;
    setPosition(mountPosition);
    setHorse({ chunk: currentChunk, position: mountPosition });
    setMounted(true);
    setLogs((currentLogs) => [{ text: 'You mount the horse. The road opens ahead.', color: 'blue' }, ...currentLogs].slice(0, 3));
  };

  const currentWorldTile = mapTileFor(chunk);
  const fieldTrees = fieldTreesFor(chunk);
  const fieldPalette = currentWorldTile.regionStyle === 'ocean' ? fieldPalettes.ocean : regionPalettes[currentWorldTile.regionStyle];

  return (
    <div className="field-column">
      <div ref={gameFrameRef} className="game-frame" tabIndex={0} aria-label="Playable Mosslight Crossing field" data-testid="game-field">
        <div className={'pixel-field world-field world-region-' + currentWorldTile.regionStyle + ' map-terrain-' + currentWorldTile.terrain + (currentWorldTile.waterFeature ? ' world-is-' + currentWorldTile.waterFeature : '')} data-terrain={currentWorldTile.terrain} data-region={currentWorldTile.regionStyle} style={{
          '--field-color': fieldPalette.field,
          '--path-color': fieldPalette.path,
          '--field-glow': fieldPalette.glow,
        } as CSSProperties}>
          <span className="field-edge top" /><span className="field-edge bottom" /><span className="field-edge left" /><span className="field-edge right" />
          {currentWorldTile.waterFeature && <div className={'field-water world-water-' + currentWorldTile.waterFeature} aria-hidden="true" />}
          {currentWorldTile.road !== 'none' && <div className={'field-road field-road-' + currentWorldTile.road + (currentWorldTile.bridge ? ' field-bridge' : '')} aria-hidden="true" />}
          <div className="field-trees" aria-hidden="true">
            {fieldTrees.map((tree) => (
              <span
                className={'field-tree tree-' + tree.style + ' variant-' + tree.variant}
                key={tree.id}
                style={{ left: tree.x + '%', top: tree.y + '%', transform: 'scale(' + tree.scale + ')' }}
              />
            ))}
          </div>
          {currentWorldTile.landmark && (
            <div className={'field-village ' + currentWorldTile.landmark.kind + ' world-region-' + currentWorldTile.regionStyle} aria-label={currentWorldTile.landmark.name}>
              <span className="field-village-square" />
              <span className="field-house house-1" /><span className="field-house house-2" /><span className="field-house house-3" />
              <span className="field-house house-4" /><span className="field-house house-5" /><span className="field-house house-6" />
              {currentWorldTile.landmark?.name === 'Mosslight Crossing' ? (
                <span className="field-village-fountain" aria-label="Greenvale fountain"><span className="fountain-spray" /></span>
              ) : (
                <span className="field-village-well" />
              )}
            </div>
          )}
          {showHorse && (
            <>
              <div className={'horse ' + (mounted ? 'is-mounted' : '')} style={{ left: horseDisplayPosition.x + '%', top: horseDisplayPosition.y + '%' }} data-facing={mounted ? facing : horseFacing} aria-label={mounted ? 'Mounted horse' : 'Your horse'} data-testid="horse-character">
                <span className="horse-sprite" />
              </div>
              {canMount && <button className="horse-mount-button" style={{ left: horseDisplayPosition.x + '%', top: Math.min(88, Math.max(12, horseDisplayPosition.y + 10)) + '%' }} onClick={toggleMount} aria-label="Mount horse" data-testid="button-toggle-mount">Mount</button>}
            </>
          )}
          <div className={'player ' + (!mounted && moving ? 'is-moving ' : '') + (mounted ? 'is-mounted' : '')} style={{ left: position.x + '%', top: position.y + '%' }} data-facing={facing} data-testid="player-character">
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
            {mounted && <button className="horse-dismount-button" onClick={toggleMount} aria-label="Dismount horse" data-testid="button-dismount-horse">Dismount</button>}
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
      <div className="sr-only" aria-live="polite" data-testid="status-movement">{moving ? (mounted ? 'Riding through Mosslight Crossing' : 'Moving through Mosslight Crossing') : (mounted ? 'Mounted and ready' : 'Standing still')}</div>
      <div className="sr-only" aria-live="polite" data-testid="status-mount">{mounted ? 'Mounted on the horse' : canMount ? 'Horse nearby and ready to mount' : horseHere ? 'Horse is parked in this field' : 'Horse is in another field'}</div>
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
