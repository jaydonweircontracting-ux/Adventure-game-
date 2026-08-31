import { Compass, Info, LocateFixed, Map, Maximize2, Trees, X } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Position = { x: number; y: number };
type LocalPosition = { x: number; y: number };
type Direction = "north" | "south" | "east" | "west";
type Terrain = "water" | "shore" | "grass" | "meadow" | "woodland" | "autumn" | "rock" | "path" | "town";
type Town = { x: number; y: number; name: string; kind: string; color: string };

const WORLD_WIDTH = 48;
const WORLD_HEIGHT = 34;
const CHUNK_SIZE = 10;
const START: Position = { x: 24, y: 18 };
const START_LOCAL: LocalPosition = { x: 5, y: 5 };

const towns: Town[] = [
  { x: 7, y: 7, name: "Brackenford", kind: "river village", color: "ochre" },
  { x: 35, y: 6, name: "Cinder Vale", kind: "highland town", color: "coral" },
  { x: 14, y: 25, name: "Mossmere", kind: "woodland village", color: "moss" },
  { x: 36, y: 25, name: "Amberlow", kind: "harvest town", color: "orange" },
  { x: 24, y: 17, name: "Larkspur", kind: "central crossing", color: "rose" },
  { x: 6, y: 19, name: "Saltwick", kind: "shore settlement", color: "blue" },
];

const directionLabels: Record<Direction, string> = {
  north: "NORTH",
  south: "SOUTH",
  east: "EAST",
  west: "WEST",
};

const terrainLabels: Record<Terrain, string> = {
  water: "deep water",
  shore: "shoreline",
  grass: "open grassland",
  meadow: "wildflower meadow",
  woodland: "old woodland",
  autumn: "amber woodland",
  rock: "mountain pass",
  path: "stone trail",
  town: "town",
};

const directionKeys: Record<string, { dx: number; dy: number; direction: Direction }> = {
  KeyW: { dx: 0, dy: -1, direction: "north" },
  KeyA: { dx: -1, dy: 0, direction: "west" },
  KeyS: { dx: 0, dy: 1, direction: "south" },
  KeyD: { dx: 1, dy: 0, direction: "east" },
};

function hash(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + 19.19) * 43758.5453;
  return value - Math.floor(value);
}

function townForTile(x: number, y: number) {
  return towns.find((town) => x >= town.x && x < town.x + 2 && y >= town.y && y < town.y + 2);
}

function terrainAt(x: number, y: number): Terrain {
  if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return "rock";
  if (townForTile(x, y)) return "town";
  const riverX = 20 + Math.sin(y / 4.6) * 5 + Math.sin(y / 1.7) * 1.2;
  if (Math.abs(x - riverX) < 1.1 && y > 2 && y < WORLD_HEIGHT - 2) return "water";
  if (Math.abs(x - riverX) < 2.1 && y > 2 && y < WORLD_HEIGHT - 2) return "shore";
  const mountainRidge = x > 29 && y < 14 && hash(x * 0.7, y * 0.8) > 0.3;
  const westernCliffs = x < 9 && y > 26 && hash(x + 9, y) > 0.55;
  if (mountainRidge || westernCliffs) return hash(x + 4, y + 8) > 0.34 ? "rock" : "grass";
  const value = hash(x, y);
  if (value < 0.1) return "water";
  if (value < 0.17) return "shore";
  if (value < 0.3) return "woodland";
  if (value < 0.4) return "autumn";
  if (value < 0.58) return "meadow";
  if (value > 0.9) return "path";
  return "grass";
}


function worldTerrainAt(x: number, y: number): Terrain {
  if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return "water";
  const island =
    (((x - 24) / 18) ** 2 + ((y - 16) / 13) ** 2 < 1) ||
    (((x - 8) / 7) ** 2 + ((y - 25) / 5) ** 2 < 1) ||
    (((x - 41) / 5) ** 2 + ((y - 7) / 5) ** 2 < 1) ||
    (((x - 38) / 4) ** 2 + ((y - 27) / 4) ** 2 < 1);
  if (!island) return "water";
  if (townForTile(x, y)) return "town";

  const northRiver = Math.abs(y - (7 + x * 0.22 + Math.sin(x / 3.2) * 1.2));
  const southRiver = Math.abs(y - (25 - Math.sin(x / 3.8) * 2.3));
  if ((northRiver < 0.55 || southRiver < 0.5) && x > 5 && x < 43) return "water";
  if ((northRiver < 1.25 || southRiver < 1.1) && x > 5 && x < 43) return "shore";

  const ridgeLine = 8 + Math.sin(x / 3.4) * 2 + x * 0.14;
  const ridge = Math.abs(y - ridgeLine) < 2.2 && x > 14 && x < 39;
  const forestNoise = hash(Math.floor(x / 2), Math.floor(y / 2));
  const warmSouth = y > 21 && x > 24;
  if (ridge || (x > 33 && y < 11 && forestNoise > 0.44)) return "rock";
  if (forestNoise < 0.25) return warmSouth ? "autumn" : "woodland";
  if (forestNoise > 0.86) return "path";
  if (forestNoise > 0.62) return "meadow";
  return "grass";
}


function sceneNpcCount(terrain: Terrain) {
  return terrain === "town" ? 7 : terrain === "woodland" || terrain === "autumn" ? 4 : 3;
}

function regionAt(position: Position) {
  if (position.x > 28 && position.y < 15) return "The Crownspine";
  if (position.x < 17 && position.y > 21) return "Mosswood";
  if (position.y > 23) return "Amberlow Fields";
  if (position.x < 14) return "The Salt Coast";
  return "The Green March";
}

function positionLabel(position: Position) {
  return "(" + String(position.x).padStart(2, "0") + ", " + String(position.y).padStart(2, "0") + ")";
}

function movementCost(terrain: Terrain) {
  if (terrain === "water") return 3;
  if (terrain === "rock") return 2;
  if (terrain === "woodland" || terrain === "autumn") return 2;
  return 1;
}

function localTileAt(position: Position, local: LocalPosition, terrain: Terrain) {
  const { x, y } = local;
  const edgePath = (x === 4 || x === 5) && (y === 0 || y === 9);
  const horizontalPath = (y === 4 || y === 5) && (x === 0 || x === 9);
  if (terrain === "water") return "water";
  if (terrain === "rock") return hash(position.x * 3 + x, position.y * 3 + y) > 0.25 ? "rock" : "stone";
  if (terrain === "town") {
    if (x >= 3 && x <= 6 && y >= 2 && y <= 4) return "building";
    if (edgePath || horizontalPath) return "path";
    return hash(position.x + x * 2, position.y + y * 2) > 0.74 ? "garden" : "town-ground";
  }
  if (edgePath || horizontalPath || (terrain === "path" && y >= 4 && y <= 5)) return "path";
  if (terrain === "woodland" || terrain === "autumn") {
    return hash(position.x * 7 + x, position.y * 11 + y) > 0.68 ? "tree" : terrain;
  }
  if (terrain === "meadow") return hash(position.x * 5 + x, position.y * 5 + y) > 0.78 ? "flower" : "meadow";
  return terrain;
}

function GameplayChunk({ position, localPosition, terrain, direction, stamina, steps, message }: { position: Position; localPosition: LocalPosition; terrain: Terrain; direction: Direction; stamina: number; steps: number; message: string }) {
  const cells = useMemo(() => Array.from({ length: CHUNK_SIZE * CHUNK_SIZE }, (_, index) => ({
    x: index % CHUNK_SIZE,
    y: Math.floor(index / CHUNK_SIZE),
  })), []);
  const npcs = useMemo(() => Array.from({ length: sceneNpcCount(terrain) }, (_, index) => ({
    left: 10 + hash(position.x * 11 + index, position.y * 7 + index) * 80,
    top: 18 + hash(position.x * 5 + index + 3, position.y * 13 + index + 1) * 62,
    variant: index % 4,
  })), [position.x, position.y, terrain]);
  const assetObjects = useMemo(() => {
    const objects: Array<{ asset: "chest" | "dust" | "wasp"; left: number; top: number }> = [];
    const place = (asset: "chest" | "dust" | "wasp", index: number) => objects.push({
      asset,
      left: 14 + hash(position.x * 17 + index, position.y * 19 + index) * 72,
      top: 22 + hash(position.x * 23 + index + 5, position.y * 29 + index + 2) * 55,
    });
    if (terrain === "town" || terrain === "meadow" || terrain === "path") place("chest", 1);
    if (terrain === "path" || terrain === "town") place("dust", 2);
    if (terrain === "meadow" || terrain === "woodland" || terrain === "autumn") place("wasp", 3);
    return objects;
  }, [position.x, position.y, terrain]);
  const playerSprite = steps > 0 && steps % 3 !== 0 ? "/assets/gameplay/shining-fields/characters/player/run.png" : "/assets/gameplay/shining-fields/characters/player/idle.png";
  const playerStyle = { backgroundImage: `url("${playerSprite}")` };
  return (
    <div className={"zelda-scene zelda-" + terrain}>
      <div className="scene-skywash" />
      <div className="scene-online-hud" aria-hidden="true">
        <div className="scene-top-frame">
          <div className="scene-avatar-chip"><span className="scene-avatar">W</span><span><strong>TRAVELER</strong><small>LEVEL 01 · {regionAt(position)}</small></span></div>
          <div className="scene-bars"><span className="scene-bar hp"><i style={{ width: "82%" }} /></span><span className="scene-bar mp"><i style={{ width: Math.max(18, stamina) + "%" }} /></span></div>
          <span className="scene-gold">✦ {steps * 2}</span>
        </div>
        <div className="scene-bottom-frame"><div className="scene-action-slots"><span className="scene-slot active">W</span><span className="scene-slot">✦</span><span className="scene-slot">◇</span><span className="scene-slot">✚</span><span className="scene-slot">?</span></div><span className="scene-chat">{message}</span><span className="scene-compass">N</span></div>
      </div>
      <div className="scene-signpost"><span>CHUNK {positionLabel(position)}</span><strong>10 × 10 PLAY TILES</strong></div>
      {npcs.map((npc, index) => <div className={"scene-npc npc-" + npc.variant} style={{ left: npc.left + "%", top: npc.top + "%" }} key={index}><span className="npc-shadow" /><span className="npc-head" /><span className="npc-body" /></div>)}
      {assetObjects.map((asset, index) => asset.asset === "wasp" ? <span className="scene-asset scene-asset-wasp" style={{ left: asset.left + "%", top: asset.top + "%" }} key={asset.asset + index} /> : <img className={"scene-asset scene-asset-" + asset.asset} src={asset.asset === "chest" ? "/assets/gameplay/shining-fields/objects/chest-01.png" : "/assets/gameplay/shining-fields/particles/dust-01.png"} style={{ left: asset.left + "%", top: asset.top + "%" }} alt="" draggable="false" key={asset.asset + index} />)}
      <div className="gameplay-grid">
        {cells.map((cell) => {
          const microTerrain = localTileAt(position, cell, terrain);
          const isPlayer = cell.x === localPosition.x && cell.y === localPosition.y;
          return (
            <div className={"micro-tile micro-" + microTerrain} key={cell.x + ":" + cell.y}>
              <span className="micro-grain" />
              {microTerrain === "tree" && <img className="gameplay-tree" src="/assets/tree.svg" alt="" draggable="false" />}
              {microTerrain === "rock" && <img className="gameplay-rock" src="/assets/mountain.svg" alt="" draggable="false" />}
              {microTerrain === "flower" && <img className="gameplay-flower" src="/assets/gameplay/shining-fields/tileset/grass-decor.png" alt="" draggable="false" />}
              {microTerrain === "building" && <img className="gameplay-building" src="/assets/town.svg" alt="" draggable="false" />}
              {isPlayer && <span className={"zelda-player facing-" + direction} style={playerStyle} aria-label="Player" />}
            </div>
          );
        })}
      </div>
      <div className="scene-edge-label scene-edge-north">NORTH · W</div>
      <div className="scene-edge-label scene-edge-south">S · walk to continue</div>
      <div className="scene-edge-label scene-edge-west">A</div>
      <div className="scene-edge-label scene-edge-east">D</div>
    </div>
  );
}

function Tile({ x, y, compact, world, position, onSelect }: { x: number; y: number; compact?: boolean; world?: boolean; position: Position; onSelect?: (x: number, y: number) => void }) {
  const terrain = world ? worldTerrainAt(x, y) : terrainAt(x, y);
  const town = townForTile(x, y);
  const isPlayer = x === position.x && y === position.y;
  const isTownAnchor = town && x === town.x && y === town.y;
  const asset = terrain === "woodland" || terrain === "autumn" ? "/assets/tree.svg" : terrain === "rock" ? "/assets/mountain.svg" : terrain === "town" && isTownAnchor ? "/assets/town.svg" : "";
  return (
    <button
      type="button"
      className={"hex hex-" + terrain + (isPlayer ? " is-player" : "") + (town ? " is-town" : "") + (isTownAnchor ? " is-town-anchor" : "")}
      title={town ? town.name + " · " + terrainLabels[terrain] : terrainLabels[terrain]}
      aria-label={"" + x + ", " + y + " " + terrainLabels[terrain]}
      onClick={() => onSelect && onSelect(x, y)}
    >
      <span className="hex-texture" />
      {asset && <img className={"tile-asset " + (terrain === "town" ? "town-asset" : "") + (compact ? " compact-asset" : "")} src={asset} alt="" draggable="false" />}
      {terrain === "path" && <span className="path-stone" />}
      {isTownAnchor && <span className="town-pin">{town?.name}</span>}
      {isPlayer && <span className="player-marker"><LocateFixed size={compact ? 12 : 19} strokeWidth={2.5} /></span>}
    </button>
  );
}

function HexMap({ position, world, onSelect }: { position: Position; world?: boolean; onSelect?: (x: number, y: number) => void }) {
  const tiles = useMemo(() => {
    if (world) {
      return Array.from({ length: WORLD_HEIGHT }, (_, y) => ({ y, xs: Array.from({ length: WORLD_WIDTH }, (_, x) => x) }));
    }
    const startX = position.x - Math.floor(CHUNK_SIZE / 2);
    const startY = position.y - Math.floor(CHUNK_SIZE / 2);
    return Array.from({ length: CHUNK_SIZE }, (_, row) => ({ y: startY + row, xs: Array.from({ length: CHUNK_SIZE }, (_, column) => startX + column) }));
  }, [position, world]);
  return (
    <div className={world ? "hex-map world-hex-map" : "hex-map local-hex-map"}>
      {tiles.map((row) => (
        <div className={"hex-row " + (row.y % 2 !== 0 ? "offset-row" : "")} key={row.y}>
          {row.xs.map((x) => <Tile key={x + ":" + row.y} x={x} y={row.y} compact={world} world={world} position={position} onSelect={onSelect} />)}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [position, setPosition] = useState<Position>(START);
  const [localPosition, setLocalPosition] = useState<LocalPosition>(START_LOCAL);
  const [direction, setDirection] = useState<Direction>("south");
  const [steps, setSteps] = useState(0);
  const [stamina, setStamina] = useState(100);
  const [mapOpen, setMapOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [message, setMessage] = useState("The trail begins where the wildlands meet.");
  const [selectedTile, setSelectedTile] = useState<Position | null>(null);
  const gameFrameRef = useRef<HTMLDivElement>(null);

  const move = useCallback((key: string) => {
    const vector = directionKeys[key];
    if (!vector) return;
    setDirection(vector.direction);
    let nextLocal = { x: localPosition.x + vector.dx, y: localPosition.y + vector.dy };
    let chunkDelta = { x: 0, y: 0 };
    if (nextLocal.x < 0) {
      chunkDelta = { x: -1, y: 0 };
      nextLocal = { x: CHUNK_SIZE - 1, y: localPosition.y };
    } else if (nextLocal.x >= CHUNK_SIZE) {
      chunkDelta = { x: 1, y: 0 };
      nextLocal = { x: 0, y: localPosition.y };
    } else if (nextLocal.y < 0) {
      chunkDelta = { x: 0, y: -1 };
      nextLocal = { x: localPosition.x, y: CHUNK_SIZE - 1 };
    } else if (nextLocal.y >= CHUNK_SIZE) {
      chunkDelta = { x: 0, y: 1 };
      nextLocal = { x: localPosition.x, y: 0 };
    }
    const nextPosition = { x: position.x + chunkDelta.x, y: position.y + chunkDelta.y };
    if (nextPosition.x < 0 || nextPosition.y < 0 || nextPosition.x >= WORLD_WIDTH || nextPosition.y >= WORLD_HEIGHT) {
      setMessage("The frontier ends here. Turn back and find another trail.");
      return;
    }
    const nextTerrain = terrainAt(nextPosition.x, nextPosition.y);
    const crossedChunk = chunkDelta.x !== 0 || chunkDelta.y !== 0;
    const cost = crossedChunk ? movementCost(nextTerrain) : 1;
    if (stamina < cost) {
      setMessage("Your pack is heavy. Rest at a town before crossing more ground.");
      return;
    }
    const town = townForTile(nextPosition.x, nextPosition.y);
    setPosition(nextPosition);
    setLocalPosition(nextLocal);
    setStamina((value) => Math.max(0, value - cost));
    setSteps((value) => value + 1);
    setSelectedTile(null);
    if (crossedChunk) {
      if (town && !townForTile(position.x, position.y)) setMessage("You arrive at " + town.name + ", a " + town.kind + ".");
      else if (nextTerrain === "rock") setMessage("The path climbs into the Crownspine. Snow catches the last light.");
      else if (nextTerrain === "woodland" || nextTerrain === "autumn") setMessage("The forest closes around the trail; birds move in the canopy above.");
      else setMessage("A new " + terrainLabels[nextTerrain] + " chunk unfolds to the " + directionLabels[vector.direction].toLowerCase() + ".");
    }
  }, [localPosition, position, stamina]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") setMapOpen(false);
      if (event.code === "KeyM") setMapOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    gameFrameRef.current?.focus();
  }, []);

  const handleGameKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!directionKeys[event.code]) return;
    event.preventDefault();
    event.stopPropagation();
    move(event.code);
  };

  const currentTerrain = terrainAt(position.x, position.y);
  const currentTown = townForTile(position.x, position.y);
  const selectedTown = selectedTile ? townForTile(selectedTile.x, selectedTile.y) : null;
  const discovered = Math.min(100, Math.round((steps + 12) / 2.4));

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Compass size={25} /></div>
          <div><p className="eyebrow">FRONTIER ONLINE · CHUNK 01</p><h1>Wildlands</h1></div>
        </div>
        <div className="topbar-actions">
          <div className="coordinate-readout"><span>POSITION</span><strong>{positionLabel(position)}</strong></div>
          <button type="button" className="utility-button" onClick={() => setInfoOpen((open) => !open)}><Info size={16} />{infoOpen ? "Close info" : "Info"}</button>
          <button type="button" className="map-button" onClick={() => setMapOpen((open) => !open)}><Map size={17} />{mapOpen ? "Close map" : "World map"}</button>
        </div>
      </header>

      <section className="game-grid">
        <section className="play-panel">
          <div className="play-header"><div><span className="status-label">ACTIVE PLAY SPACE</span><h2>{currentTown ? currentTown.name : terrainLabels[currentTerrain]}</h2></div><div className="play-header-actions"><button type="button" className="header-icon-button" onClick={() => setInfoOpen(true)} aria-label="Open game info"><Info size={16} /></button><div className="compass-badge"><span>N</span><Compass size={25} /><span>S</span></div></div></div>
          <div
            className="map-frame game-frame"
            ref={gameFrameRef}
            tabIndex={0}
            onKeyDown={handleGameKeyDown}
            onClick={() => gameFrameRef.current?.focus()}
            aria-label="2D gameplay area. Use W A S D to move."
          >
            <div className="map-frame-label"><span>PLAYABLE CHUNK · 10 × 10 TILES</span><span>{directionLabels[direction]} · {steps} STEPS</span></div>
            <GameplayChunk position={position} localPosition={localPosition} terrain={currentTerrain} direction={direction} stamina={stamina} steps={steps} message={message} />
            {mapOpen && <div className="world-map-overlay"><div className="overlay-head"><div><span className="status-label">CARTOGRAPHER'S VIEW</span><h2>World map</h2><p>Each hex is one 10 × 10 playable chunk.</p></div><button type="button" className="icon-button" onClick={() => setMapOpen(false)} aria-label="Close world map"><X size={19} /></button></div><div className="world-map-wrap"><HexMap position={position} world onSelect={(x, y) => setSelectedTile({ x, y })} /></div><div className="overlay-foot"><span><span className="legend-dot player-dot" /> YOU ARE HERE · CHUNK {positionLabel(position)}</span><span><span className="legend-dot town-dot" /> SETTLEMENTS</span><span><span className="legend-dot mountain-dot" /> HIGH COUNTRY</span></div></div>}
          </div>
          <div className="play-footer"><div className="movement-message"><Maximize2 size={15} /><span>{message}</span></div><div className="touch-controls" aria-label="Movement controls"><button type="button" onClick={() => move("KeyW")} aria-label="Move north">W</button><button type="button" onClick={() => move("KeyA")} aria-label="Move west">A</button><button type="button" onClick={() => move("KeyS")} aria-label="Move south">S</button><button type="button" onClick={() => move("KeyD")} aria-label="Move east">D</button></div><div className="map-hint">CLICK GAME · WASD TO MOVE · <strong>M</strong> MAP</div></div>
        </section>
      </section>
      {infoOpen && <div className="drawer-backdrop" onClick={() => setInfoOpen(false)}><aside className="info-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="status-label">GAME INFO</span><h2>Field guide</h2></div><button type="button" className="icon-button" onClick={() => setInfoOpen(false)} aria-label="Close game info"><X size={19} /></button></div><div className="drawer-scroll"><section className="drawer-section"><span className="status-label">CURRENT CHUNK</span><strong>{positionLabel(position)}</strong><p>{regionAt(position)} · {terrainLabels[currentTerrain]}</p></section><section className="drawer-section"><div className="drawer-section-heading"><span className="status-label">TRAVEL</span><Trees size={17} /></div><p>Move one tile at a time with W A S D. A 10 × 10 chunk connects directly to the next chunk when you reach its edge.</p><div className="drawer-wasd"><button type="button" onClick={() => move("KeyW")}>W</button><button type="button" onClick={() => move("KeyA")}>A</button><button type="button" onClick={() => move("KeyS")}>S</button><button type="button" onClick={() => move("KeyD")}>D</button></div></section><section className="drawer-section"><span className="status-label">TRAVEL RESOLVE</span><div className="drawer-stat"><strong>{stamina}<small>/100</small></strong><span>{steps} steps</span></div><div className="stamina-track"><i style={{ width: stamina + "%" }} /></div></section><section className="drawer-section"><span className="status-label">WORLD</span><p>{WORLD_WIDTH} × {WORLD_HEIGHT} world chunks · {towns.length} settlements known</p><button type="button" className="drawer-map-link" onClick={() => { setInfoOpen(false); setMapOpen(true); }}>Open world map <Map size={15} /></button></section>{(selectedTown || currentTown) && <section className="drawer-section town-drawer-section"><span className="status-label">SETTLEMENT</span><h3>{(selectedTown || currentTown)?.name}</h3><p>{(selectedTown || currentTown)?.kind}</p><span className="town-card-note">Four world-map hexes form this settlement.</span></section>}<section className="drawer-section drawer-message"><span className="status-label">LATEST MESSAGE</span><p>{message}</p></section></div></aside></div>}
      <footer className="bottom-bar"><span>WILDLANDS</span><span>WORLD {WORLD_WIDTH} × {WORLD_HEIGHT} CHUNKS · 10 × 10 TILES EACH</span><span>V. 0.6.0</span></footer>
    </main>
  );
}
