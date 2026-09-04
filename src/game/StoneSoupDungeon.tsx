import { useCallback, useEffect, useState } from 'react';
import {
  castSpell,
  collectItem,
  createGame,
  descend,
  getItemAtPlayer,
  spellBook,
  step,
  tryOpenVault,
  useInventoryItem,
  waitTurn,
  type GameState,
  type Item,
  type SpellId,
} from './stoneSoupEngine';
import './stoneSoupDungeon.css';

type Props = { onExit: () => void };

const glyphs: Record<GameState['tiles'][number][number]['kind'], string> = {
  wall: '', floor: '·', door: '+', stairs: '↓', altar: 'A', water: '≈', lava: '^',
};

export default function StoneSoupDungeon({ onExit }: Props) {
  const [game, setGame] = useState<GameState>(() => createGame());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const run = useCallback((action: (state: GameState) => GameState) => {
    setGame((current) => {
      const next = structuredClone(current);
      return action(next);
    });
  }, []);
  const move = useCallback((dx: number, dy: number) => run((state) => step(state, dx, dy)), [run]);
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
      if (spell) run((state) => castSpell(state, spell));
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
  const currentTile = game.tiles[game.player.y][game.player.x];
  const currentItem = getItemAtPlayer(game);
  const relic = game.player.inventory.some((item) => item.kind === 'relic');
  const objective = game.floor === 1 ? 'Find the stairs and descend before the galleries wake.' : game.floor === 2 ? 'Survive the lower gallery. The First Flame is close.' : relic ? 'Carry the First Flame shard to the sealed altar.' : 'Search the lower vault for the First Flame shard.';
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
  const restart = () => setGame(createGame());

  return (
    <div className="stone-soup-dungeon" role="dialog" aria-modal="true" aria-label="Stone Soup dungeon">
      <div className="ssd-shell">
        <header className="ssd-header">
          <div className="ssd-brand"><span className="ssd-brand-mark">◈</span><span><strong>Stone Soup</strong><small>The Ember Vault</small></span></div>
          <div className="ssd-header-right"><span className="ssd-live" /> depth {String(game.floor).padStart(2, '0')} / 03 <span>·</span> turn {game.turn}<button className="ssd-exit" onClick={onExit}>return to Mosslight</button></div>
        </header>
        <div className="ssd-layout">
          <main className="ssd-main">
            <section className="ssd-panel ssd-hero"><div><span className="ssd-kicker">dungeon descent / procedural gallery</span><h1>{game.player.name}</h1><p>{game.player.species} · {game.player.background} · level {String(game.player.level).padStart(2, '0')}</p></div><div className="ssd-seed">seed {game.seed.toString(16).slice(-6).toUpperCase()}</div><div className="ssd-meters"><Meter label="vitality" value={game.player.hp + ' / ' + game.player.maxHp} percent={hpPercent} className="hp" /><Meter label="focus" value={game.player.mp + ' / ' + game.player.maxMp} percent={mpPercent} className="mp" /><Meter label="attunement" value={game.player.xp + ' / ' + game.player.nextXp} percent={xpPercent} className="xp" /></div></section>
            <section className="ssd-panel ssd-map-panel"><div className="ssd-panel-head"><h2>The Cinder Galleries</h2><span>{alive.length} signatures · fog of war active</span></div><div className="ssd-map-scroll"><div className="ssd-map" role="grid" aria-label="Dungeon map" style={{ gridTemplateColumns: 'repeat(' + game.width + ', minmax(17px, 1fr))' }}>{game.tiles.flatMap((row) => row.map((tile) => { const explored = tile.visible || tile.seen; const monster = game.monsters.find((entry) => entry.x === tile.x && entry.y === tile.y && entry.hp > 0); const item = game.groundItems.find((entry) => entry.x === tile.x && entry.y === tile.y); const player = game.player.x === tile.x && game.player.y === tile.y; const className = ['ssd-tile', !explored ? 'unknown' : tile.kind === 'wall' ? 'wall' : tile.visible ? 'floor' : 'seen', monster && tile.visible ? 'monster' : '', item && tile.visible ? 'loot' : '', tile.kind === 'stairs' ? 'stairs' : '', tile.kind === 'altar' ? 'altar' : '', player ? 'player' : ''].filter(Boolean).join(' '); return <button key={tile.x + '-' + tile.y} className={className} disabled={!tile.visible || tile.kind === 'wall'} onClick={() => tileClick(tile.x, tile.y)} aria-label={explored ? tile.kind : 'unexplored stone'}><span>{!explored ? '' : player ? '@' : monster && tile.visible ? monster.glyph : item && tile.visible ? item.glyph : glyphs[tile.kind]}</span></button>; }))}</div></div><div className="ssd-actions"><span><b>@</b> you</span><span><b className="red">s</b> threat</span><span><b className="gold">*</b> loot</span><span><b className="blue">↓</b> stairs</span>{currentItem && <button onClick={() => run(collectItem)}>E · collect {currentItem.name}</button>}{currentTile.kind === 'stairs' && <button onClick={() => run(descend)}>&gt; · descend</button>}{currentTile.kind === 'altar' && <button onClick={() => run(tryOpenVault)}>attune altar</button>}</div></section>
            <section className="ssd-panel ssd-log"><div className="ssd-panel-head"><h2>Field readout</h2><span>one turn at a time</span></div>{game.log.map((entry, index) => <div className={'ssd-log-row ' + (index === 0 ? 'latest' : '')} key={entry + index}><time>t.{String(Math.max(1, game.turn - index)).padStart(2, '0')}</time><span>{entry}</span></div>)}</section>
          </main>
          <aside className="ssd-side"><section className="ssd-panel ssd-card"><span className="ssd-kicker">next decision</span><h2>Bearing</h2><p>{objective}</p><div className="ssd-stats"><span>gold <b>{game.player.gold}</b></span><span>kills <b>{game.player.kills}</b></span><span>armor <b>{game.player.armor}</b></span></div></section><section className="ssd-panel ssd-card"><div className="ssd-card-head"><h2>Ember rites</h2><span>mana {game.player.mp}</span></div>{(Object.keys(spellBook) as SpellId[]).map((spellId, index) => { const spell = spellBook[spellId]; const learned = game.player.spells.includes(spellId); return <button className="ssd-spell" key={spellId} disabled={!learned || game.player.mp < spell.cost || game.phase !== 'playing'} onClick={() => run((state) => castSpell(state, spellId))}><b>{index + 1}</b><span><strong>{spell.name}</strong><small>{learned ? spell.description : 'not learned in this calling'}</small></span><em>{spell.cost} fp</em></button>; })}</section><section className="ssd-panel ssd-card"><div className="ssd-card-head"><h2>Satchel</h2><span>{game.player.inventory.length} items</span></div><div className="ssd-inventory">{game.player.inventory.map((item) => <button key={item.id} className={'ssd-item ' + (selectedItem === item.id ? 'selected' : '')} onClick={() => useItem(item)} title={item.description}><b>{item.glyph}</b><small>{item.name}</small></button>)}</div><p className="ssd-item-note">{itemDescription}</p></section><section className="ssd-panel ssd-card ssd-controls"><p><kbd>WASD</kbd> / arrows · move</p><p><kbd>1 2 3</kbd> · rites · <kbd>E</kbd> · collect</p><p><kbd>space</kbd> · wait · <kbd>&gt;</kbd> · descend</p></section></aside>
        </div>
        {(game.phase === 'defeat' || game.phase === 'victory') && <div className="ssd-result"><div><span className="ssd-kicker">{game.phase === 'victory' ? 'the ember vault opens' : 'the dark has its due'}</span><h2>{game.phase === 'victory' ? 'The vault remembers you.' : 'Your light goes out.'}</h2><p>{game.phase === 'victory' ? 'You carry the First Flame back into the living world.' : 'The galleries close over your footprints. Another wayfinder can try again.'}</p><button onClick={restart}>new descent</button></div></div>}
      </div>
    </div>
  );
}

function Meter({ label, value, percent, className }: { label: string; value: string; percent: number; className: string }) {
  return <div className="ssd-meter"><div><span>{label}</span><b>{value}</b></div><i className={className} style={{ transform: 'scaleX(' + percent + ')' }} /></div>;
}
