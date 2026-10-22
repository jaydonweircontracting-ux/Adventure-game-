import { artUrl } from './artCache';
import { foodIconUrl } from './foodSprites';
import { LAYOUT_LABELS } from './dungeonLayouts';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  buyFromDungeonShop,
  castSpell,
  closeDungeonShop,
  collectItem,
  createGame,
  descend,
  dungeonShopDisplay,
  getItemAtPlayer,
  openDungeonShop,
  spellBook,
  step,
  tryOpenVault,
  useInventoryItem,
  waitTurn,
  type GameState,
  type Item,
  type SpellId,
} from './stoneSoupEngine';
import { PRY_CHEST_CLOSED, pryDecorFor, pryDoorTileFor, pryFloorTileFor, pryPlaceablePath, pryTilePath, pryWallTileFor } from './dungeonPry';
import { caveDecorFor, caveDoorTileFor, caveFloorTileFor, caveKitPath, caveWallTileFor } from './caveKit';
import { audioEngine } from './audio';
import type { ShopItemKey } from './shops';
import './stoneSoupDungeon.css';

type Props = { onExit: () => void; variant?: 'dungeon' | 'cave'; siteName?: string };

const assetUrl = (path: string) => artUrl(path);

const glyphs: Record<GameState['tiles'][number][number]['kind'], string> = {
  wall: '', floor: '·', door: '+', stairs: '↓', altar: 'A', water: '≈', lava: '^',
};

export default function StoneSoupDungeon({ onExit, variant = 'dungeon', siteName = '' }: Props) {
  const [game, setGame] = useState<GameState>(() => createGame(undefined, 0, 0, { variant, siteName }));
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  // BUILD 927: testmode-only dungeon hooks (same precedent as the
  // __gameTest hooks in App.tsx) — vault verification in the harness.
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (!window.location.search.includes('testmode=1')) return;
      (window as unknown as { __dungeonTest: unknown }).__dungeonTest = {
        getVaults: () => game.vaults ?? [],
        getLayout: () => game.layout,
        getVariant: () => game.variant,
        getSiteName: () => game.siteName,
        getFloor: () => game.floor,
        getPlayer: () => ({ x: game.player.x, y: game.player.y }),
        getLog: () => [...game.log],
        getMonsters: () => game.monsters.filter((m) => m.hp > 0).map((m) => ({ x: m.x, y: m.y, name: m.name, unique: !!m.unique })),
        getUniques: () => game.spawnedUniques ?? [],
        getTiles: () => game.tiles.map((row) => row.map((t) => t.kind)),
        getShops: () => (game.shops ?? []).map((s) => ({ id: s.id, x: s.x, y: s.y, shopName: s.shopName, keeperName: s.keeperName, vaultName: s.vaultName, stock: { ...s.stock.stock }, merchantGold: s.stock.merchantGold })),
        getTraps: () => (game.traps ?? []).map((t) => ({ id: t.id, vaultName: t.vaultName, kind: t.kind, plates: [...t.plates], fired: t.fired, release: t.release.length, cache: t.cache.length })),
        getActiveShop: () => game.activeShopId ?? null,
        getGold: () => game.player.gold,
        getInventory: () => game.player.inventory.map((i) => i.name),
      };
    } catch { /* test hook only */ }
  }, [game]);
  const run = useCallback((action: (state: GameState) => GameState) => {
    setGame((current) => {
      const next = structuredClone(current);
      return action(next);
    });
  }, []);
  const move = useCallback((dx: number, dy: number) => run((state) => step(state, dx, dy)), [run]);
  // BUILD 957: Ember Bolt crackles with the fireball SFX (dungeon-only
  // scope — spells are dungeon-only today, so this is the only cast path).
  // The sound plays on the CAST, even if the bolt fizzles with no target.
  const castWithSound = useCallback((spellId: SpellId) => {
    if (spellId === 'ember-bolt') audioEngine.playSfx('fireball');
    run((state) => castSpell(state, spellId));
  }, [run]);
  const handleKey = useCallback((event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const directions: Record<string, [number, number]> = {
      ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
      ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
    };
    const direction = directions[event.key];
    if (direction) { event.preventDefault(); move(direction[0], direction[1]); return; }
    if (event.key === ' ') { event.preventDefault(); run(waitTurn); return; }
    if (event.key === 'e' || event.key === 'E') { run(collectItem); return; }
    if (event.key === '>' || event.key === '.') { run(descend); return; }
    if (event.key === '1' || event.key === '2' || event.key === '3') {
      const spell = game.player.spells[Number(event.key) - 1];
      if (spell) castWithSound(spell);
      return;
    }
    if (event.key === 'i' || event.key === 'I') {
      const item = game.player.inventory.find((entry) => ['food', 'potion', 'scroll'].includes(entry.kind));
      if (item) run((state) => useInventoryItem(state, item.id));
    }
  }, [game.player.inventory, game.player.spells, move, run]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const alive = game.monsters.filter((monster) => monster.hp > 0);
  // BUILD 927: vault floors read as authored rooms, not generated ones.
  const vaultCells = new Set((game.vaults ?? []).flatMap((vault) => vault.cells));
  // BUILD 931: trap plates read as pressure plates (armed = amber ring
  // + `=` glyph, spent = dim floor), and unfired hidden cells read as
  // cracked masonry — the fairness signal that a plate is a choice,
  // not a gotcha. Spent plates and fired-trap walls render normally.
  const armedPlates = new Set((game.traps ?? []).filter((t) => !t.fired).flatMap((t) => t.plates));
  const spentPlates = new Set((game.traps ?? []).filter((t) => t.fired).flatMap((t) => t.plates));
  const crackedCells = new Set((game.traps ?? []).filter((t) => !t.fired).flatMap((t) => [...t.release.map((r) => `${r.x}:${r.y}`), ...t.cache.map((c) => `${c.x}:${c.y}`)]));
  // BUILD 930: the open shop (if any) and a shopkeeper standing beside
  // the player (whose tile opens the shop when stepped toward).
  const activeShop = (game.shops ?? []).find((s) => s.id === game.activeShopId) ?? null;
  const adjacentShop = (game.shops ?? []).find((s) => Math.abs(s.x - game.player.x) + Math.abs(s.y - game.player.y) === 1) ?? null;
  const currentTile = game.tiles[game.player.y][game.player.x];
  const currentItem = getItemAtPlayer(game);
  const relic = game.player.inventory.some((item) => item.kind === 'relic');
  // BUILD 964: cave wording for the same mechanics (stairs / relic / altar).
  const objective = game.variant === 'cave'
    ? (game.floor === 1 ? 'Find the stairs and descend before the caverns wake.' : game.floor === 2 ? 'Survive the lower cavern. The First Flame is close.' : relic ? 'Carry the First Flame shard to the sealed altar.' : 'Search the lower cavern for the First Flame shard.')
    : (game.floor === 1 ? 'Find the stairs and descend before the galleries wake.' : game.floor === 2 ? 'Survive the lower gallery. The First Flame is close.' : relic ? 'Carry the First Flame shard to the sealed altar.' : 'Search the lower vault for the First Flame shard.');
  const hpPercent = Math.max(0, game.player.hp / game.player.maxHp);
  const mpPercent = Math.max(0, game.player.mp / game.player.maxMp);
  const xpPercent = Math.min(1, game.player.xp / game.player.nextXp);
  const itemDescription = selectedItem ? game.player.inventory.find((item) => item.id === selectedItem)?.description : 'Click a consumable to use it. Relics stay with you between depths.';

  const tileClick = (x: number, y: number) => {
    if (Math.abs(x - game.player.x) + Math.abs(y - game.player.y) !== 1) return;
    move(x - game.player.x, y - game.player.y);
  };
  const useItem = (item: Item) => {
    setSelectedItem(item.id);
    if (['food', 'potion', 'scroll'].includes(item.kind)) run((state) => useInventoryItem(state, item.id));
  };
  const restart = () => setGame(createGame(undefined, 0, 0, { variant, siteName }));

  return (
    <div
      className="stone-soup-dungeon"
      role="dialog"
      aria-modal="true"
      aria-label="Stone Soup dungeon"
      style={{
        '--ssd-tiles': `url("${assetUrl('dungeon/character%20and%20tileset/Dungeon_Tileset.png')}")`,
        '--ssd-hero': `url("${assetUrl('dungeon/character%20and%20tileset/Dungeon_Character.png')}")`,
        '--ssd-mon1': `url("${assetUrl('dungeon/Character_animation/monsters_idle/skeleton1/v1/skeleton_v1_1.png')}")`,
        '--ssd-mon2': `url("${assetUrl('dungeon/Character_animation/monsters_idle/skeleton1/v1/skeleton_v1_2.png')}")`,
        '--ssd-mon3': `url("${assetUrl('dungeon/Character_animation/monsters_idle/skeleton1/v1/skeleton_v1_3.png')}")`,
        '--ssd-mon4': `url("${assetUrl('dungeon/Character_animation/monsters_idle/skeleton1/v1/skeleton_v1_4.png')}")`,
      } as CSSProperties}
    >
      <div className="ssd-shell">
        <header className="ssd-header">
          <div className="ssd-brand"><span className="ssd-brand-mark">◈</span><span><strong>Stone Soup</strong><small>The Ember Vault</small></span></div>
          <div className="ssd-header-right"><span className="ssd-live" /> depth {String(game.floor).padStart(2, '0')} / 03 <span>·</span> turn {game.turn}<button className="ssd-exit" onClick={onExit}>{game.variant === 'cave' ? 'return to the surface' : 'return to Mosslight'}</button></div>
        </header>
        <div className="ssd-layout">
          <main className="ssd-main">
            <section className="ssd-panel ssd-hero"><div><span className="ssd-kicker">{game.variant === 'cave' ? `cave descent / natural caverns — ${game.siteName}` : 'dungeon descent / procedural gallery'}</span><h1>{game.player.name}</h1><p>{game.player.species} · {game.player.background} · level {String(game.player.level).padStart(2, '0')}</p></div><div className="ssd-seed">seed {game.seed.toString(16).slice(-6).toUpperCase()}</div><div className="ssd-meters"><Meter label="vitality" value={game.player.hp + ' / ' + game.player.maxHp} percent={hpPercent} className="hp" /><Meter label="focus" value={game.player.mp + ' / ' + game.player.maxMp} percent={mpPercent} className="mp" /><Meter label="attunement" value={game.player.xp + ' / ' + game.player.nextXp} percent={xpPercent} className="xp" /></div></section>
            <section className="ssd-panel ssd-map-panel"><div className="ssd-panel-head"><h2>{game.variant === 'cave' ? game.siteName : 'The Cinder Galleries'}</h2><span>{alive.length} signatures · {LAYOUT_LABELS[game.layout] ?? game.layout} · fog of war active</span></div><div className="ssd-map-scroll"><div className="ssd-map" role="grid" aria-label={game.variant === 'cave' ? 'Cave map' : 'Dungeon map'} style={{ gridTemplateColumns: 'repeat(' + game.width + ', minmax(17px, 1fr))' }}>{game.tiles.flatMap((row) => row.map((tile) => { const explored = tile.visible || tile.seen; const monster = game.monsters.find((entry) => entry.x === tile.x && entry.y === tile.y && entry.hp > 0); const item = game.groundItems.find((entry) => entry.x === tile.x && entry.y === tile.y); const shop = (game.shops ?? []).find((entry) => entry.x === tile.x && entry.y === tile.y); const player = game.player.x === tile.x && game.player.y === tile.y; const cellKey = tile.x + ':' + tile.y; const pryStyle: CSSProperties | undefined = (() => {
  // BUILD 946: Dungeon Pry art as inline backgrounds. Inline style beats
  // the tile classes, so it is ONLY set where no entity image must win:
  // never on unexplored cells (would pierce fog), never under a player /
  // monster / shopkeeper (would hide them). Stairs, altar, water, and
  // lava keep the old tileset art (no Pry match exists for them).
  if (!explored || player || monster || shop) return undefined;
  const seed = game.seed; const depth = game.floor;
  // BUILD 964: cave variant swaps Pry tiles for Kenney cave-kit tiles.
  // Same fog/entity rules as dungeons; ground loot keeps the Pry chest
  // visual (the cave kit has no chest piece) so loot stays readable.
  if (game.variant === 'cave') {
    if (tile.kind === 'wall') return { backgroundImage: `url("${assetUrl(caveKitPath(caveWallTileFor(seed, depth, tile.x, tile.y)))}")`, backgroundSize: 'cover', backgroundPosition: 'center', imageRendering: 'auto' };
    if (tile.kind === 'door') return { backgroundImage: `url("${assetUrl(caveKitPath(caveDoorTileFor(seed, depth, tile.x, tile.y)))}")`, backgroundSize: 'cover', backgroundPosition: 'center', imageRendering: 'auto' };
    if (tile.kind !== 'floor') return undefined;
    if (item && tile.visible) return { backgroundImage: `url("${assetUrl(pryPlaceablePath(PRY_CHEST_CLOSED))}")`, backgroundSize: 'cover', backgroundPosition: 'center', imageRendering: 'auto' };
    const floorFile = caveFloorTileFor(seed, depth, tile.x, tile.y);
    const decor = !item && !armedPlates.has(cellKey) && !spentPlates.has(cellKey) ? caveDecorFor(seed, depth, tile.x, tile.y) : null;
    if (!decor) return { backgroundImage: `url("${assetUrl(caveKitPath(floorFile))}")`, backgroundSize: 'cover', backgroundPosition: 'center', imageRendering: 'auto' };
    return { backgroundImage: `url("${assetUrl(caveKitPath(decor))}"), url("${assetUrl(caveKitPath(floorFile))}")`, backgroundSize: 'cover, cover', backgroundPosition: 'center, center', imageRendering: 'auto' };
  }
  if (tile.kind === 'wall') return { backgroundImage: `url("${assetUrl(pryTilePath(pryWallTileFor(seed, depth, tile.x, tile.y)))}")`, backgroundSize: 'cover', backgroundPosition: 'center', imageRendering: 'auto' };
  if (tile.kind === 'door') return { backgroundImage: `url("${assetUrl(pryTilePath(pryDoorTileFor(seed, depth, tile.x, tile.y)))}")`, backgroundSize: 'cover', backgroundPosition: 'center', imageRendering: 'auto' };
  if (tile.kind !== 'floor') return undefined;
  if (item && tile.visible) return { backgroundImage: `url("${assetUrl(pryPlaceablePath(PRY_CHEST_CLOSED))}")`, backgroundSize: 'cover', backgroundPosition: 'center', imageRendering: 'auto' };
  const floorFile = pryFloorTileFor(seed, depth, tile.x, tile.y);
  const decor = !item && !armedPlates.has(cellKey) && !spentPlates.has(cellKey) ? pryDecorFor(seed, depth, tile.x, tile.y) : null;
  if (!decor) return { backgroundImage: `url("${assetUrl(pryTilePath(floorFile))}")`, backgroundSize: 'cover', backgroundPosition: 'center', imageRendering: 'auto' };
  return { backgroundImage: `url("${assetUrl(pryPlaceablePath(decor))}"), url("${assetUrl(pryTilePath(floorFile))}")`, backgroundSize: 'cover, cover', backgroundPosition: 'center, center', imageRendering: 'auto' };
})(); const className = ['ssd-tile', !explored ? 'unknown' : tile.kind === 'wall' ? 'wall' : tile.kind === 'door' && tile.visible ? 'door' : tile.visible ? 'floor' : 'seen', monster && tile.visible ? 'monster' : '', monster && monster.unique && tile.visible ? 'unique' : '', item && tile.visible ? 'loot' : '', shop && tile.visible ? 'shopkeeper' : '', tile.kind === 'stairs' ? 'stairs' : '', tile.kind === 'altar' ? 'altar' : '', vaultCells.has(cellKey) && tile.visible ? 'vault' : '', armedPlates.has(cellKey) && tile.visible ? 'trap-plate' : '', spentPlates.has(cellKey) && tile.visible ? 'trap-spent' : '', crackedCells.has(cellKey) && tile.kind === 'wall' && tile.visible ? 'trap-cracked' : '', player ? 'player' : ''].filter(Boolean).join(' '); return <button key={tile.x + '-' + tile.y} className={className} style={pryStyle} disabled={!tile.visible || tile.kind === 'wall'} onClick={() => tileClick(tile.x, tile.y)} aria-label={explored ? (shop ? 'shopkeeper' : armedPlates.has(cellKey) ? 'pressure plate' : tile.kind) : 'unexplored stone'}><span>{!explored ? '' : player ? '@' : shop && tile.visible ? '$' : monster && tile.visible ? monster.glyph : item && tile.visible ? item.glyph : armedPlates.has(cellKey) && tile.visible ? '=' : glyphs[tile.kind]}</span></button>; }))}</div></div><div className="ssd-actions"><span><i className="ssd-legend-chip ssd-chip-hero" /> you</span><span><i className="ssd-legend-chip ssd-chip-monster" /> threat</span><span><i className="ssd-legend-chip ssd-chip-loot" /> loot</span><span><i className="ssd-legend-chip ssd-chip-stairs" /> stairs</span><span><i className="ssd-legend-chip ssd-chip-shop" /> shop</span><span><i className="ssd-legend-chip ssd-chip-trap" /> trap</span>{currentItem && <button onClick={() => run(collectItem)}>E · collect {currentItem.name}</button>}{currentTile.kind === 'stairs' && <button onClick={() => run(descend)}>&gt; · descend</button>}{currentTile.kind === 'altar' && <button onClick={() => run(tryOpenVault)}>attune altar</button>}{adjacentShop && !activeShop && <button onClick={() => run((state) => openDungeonShop(state, adjacentShop.id))}>browse {adjacentShop.shopName}</button>}</div></section>
            {activeShop && <section className="ssd-panel ssd-shop"><div className="ssd-panel-head"><h2>{activeShop.shopName}</h2><span>{activeShop.keeperName} · gold {game.player.gold}</span></div><p>{activeShop.keeperName} waves you over: “{activeShop.flavor}”</p><div className="ssd-shop-rows">{activeShop.def.goods.map((good) => { const display = dungeonShopDisplay(good.key as ShopItemKey); const left = Math.max(0, Math.floor(activeShop.stock.stock[good.key as ShopItemKey] ?? 0)); const afford = game.player.gold >= good.buyPrice; return <div className="ssd-shop-row" key={good.key}>{foodIconUrl(good.key) ? <img src={foodIconUrl(good.key)!} alt="" className="inventory-item-img" /> : <b style={{ color: display.color }}>{display.glyph}</b>}<span><strong>{display.name}</strong><small>{display.description}</small></span><em>{good.buyPrice}g · {left} left</em><button disabled={left < 1 || !afford || game.phase !== 'playing'} onClick={() => run((state) => buyFromDungeonShop(state, activeShop.id, good.key as ShopItemKey))}>Buy</button></div>; })}</div><button className="ssd-shop-close" onClick={() => run(closeDungeonShop)}>Close shop</button></section>}
            <section className="ssd-panel ssd-log"><div className="ssd-panel-head"><h2>Field readout</h2><span>one turn at a time</span></div>{game.log.map((entry, index) => <div className={'ssd-log-row ' + (index === 0 ? 'latest' : '')} key={entry + index}><time>t.{String(Math.max(1, game.turn - index)).padStart(2, '0')}</time><span>{entry}</span></div>)}</section>
          </main>
          <aside className="ssd-side"><section className="ssd-panel ssd-card"><span className="ssd-kicker">next decision</span><h2>Bearing</h2><p>{objective}</p><div className="ssd-stats"><span>gold <b>{game.player.gold}</b></span><span>kills <b>{game.player.kills}</b></span><span>armor <b>{game.player.armor}</b></span></div></section><section className="ssd-panel ssd-card"><div className="ssd-card-head"><h2>Ember rites</h2><span>mana {game.player.mp}</span></div>{(Object.keys(spellBook) as SpellId[]).map((spellId, index) => { const spell = spellBook[spellId]; const learned = game.player.spells.includes(spellId); return <button className="ssd-spell" key={spellId} disabled={!learned || game.player.mp < spell.cost || game.phase !== 'playing'} onClick={() => castWithSound(spellId)}><b>{index + 1}</b><span><strong>{spell.name}</strong><small>{learned ? spell.description : 'not learned in this calling'}</small></span><em>{spell.cost} fp</em></button>; })}</section><section className="ssd-panel ssd-card"><div className="ssd-card-head"><h2>Satchel</h2><span>{game.player.inventory.length} items</span></div><div className="ssd-inventory">{game.player.inventory.map((item) => <button key={item.id} className={'ssd-item ' + (selectedItem === item.id ? 'selected' : '')} onClick={() => useItem(item)} title={item.description}><b>{item.glyph}</b><small>{item.name}</small></button>)}</div><p className="ssd-item-note">{itemDescription}</p></section><section className="ssd-panel ssd-card ssd-controls"><p><kbd>WASD</kbd> / arrows · move</p><p><kbd>1 2 3</kbd> · rites · <kbd>E</kbd> · collect</p><p><kbd>space</kbd> · wait · <kbd>&gt;</kbd> · descend</p></section></aside>
        </div>
        {(game.phase === 'defeat' || game.phase === 'victory') && <div className="ssd-result"><div><span className="ssd-kicker">{game.phase === 'victory' ? 'the ember vault opens' : 'the dark has its due'}</span><h2>{game.phase === 'victory' ? 'The vault remembers you.' : 'Your light goes out.'}</h2><p>{game.phase === 'victory' ? 'You carry the First Flame back into the living world.' : 'The galleries close over your footprints. Another wayfinder can try again.'}</p><button onClick={restart}>new descent</button></div></div>}
      </div>
    </div>
  );
}

function Meter({ label, value, percent, className }: { label: string; value: string; percent: number; className: string }) {
  return <div className="ssd-meter"><div><span>{label}</span><b>{value}</b></div><i className={className} style={{ transform: 'scaleX(' + percent + ')' }} /></div>;
}
