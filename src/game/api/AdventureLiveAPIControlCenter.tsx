import { useEffect, useState } from 'react';
import type { AdventureLiveBridge, AdventureLiveSnapshot } from './AdventureLiveBridge';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

export default function AdventureLiveAPIControlCenter({
  bridge,
  onClose,
}: {
  bridge: AdventureLiveBridge;
  onClose: () => void;
}) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setRevision(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const snapshot: AdventureLiveSnapshot = bridge.readSnapshot();
  const world = record(snapshot.world);
  const player = record(snapshot.player);
  const npcs = record(snapshot.npcs);
  const inventory = record(snapshot.inventory);
  const quests = record(snapshot.quests);
  const civilization = record(snapshot.civilization);
  const roster = list(npcs.roster);
  const localNpcs = list(npcs.localNpcs);
  const questList = list(quests.active);
  const taskList = list(quests.tasks);
  const settlements = list(civilization.settlements);
  const systems = bridge.api.listSystems();

  const panel: React.CSSProperties = {
    position: 'fixed', inset: 'max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom))',
    zIndex: 31000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: '#101a17', color: '#edf4ed', border: '1px solid #78927e',
    borderRadius: 12, boxShadow: '0 14px 48px #000d', font: '13px system-ui,sans-serif',
  };
  const button: React.CSSProperties = { border: '1px solid #718a78', borderRadius: 7, background: '#263d30', color: '#fff', padding: '8px 10px', fontWeight: 650 };
  const section: React.CSSProperties = { background: '#17251f', border: '1px solid #344b3d', borderRadius: 9, padding: 10, minWidth: 0 };
  const muted: React.CSSProperties = { color: '#b9c9bd', fontSize: 11 };
  const pre: React.CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 190, overflowY: 'auto', background: '#0c1411', padding: 9, borderRadius: 7, color: '#d8e8d9', fontSize: 10, margin: '8px 0 0' };

  return <section role="dialog" aria-label="Live Adventure API Control Center" style={panel}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: '1px solid #344b3d' }}>
      <div style={{ flex: 1 }}>
        <strong style={{ fontSize: 16 }}>Adventure API · Live Game</strong>
        <div style={muted}>API v{bridge.api.version} · connected to active save · refreshes every second · read-only diagnostics</div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close live API Control Center" style={button}>Close</button>
    </header>
    <div style={{ overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
      <div style={section}>
        <strong>Live world</strong>
        <div style={{ fontSize: 12, marginTop: 6 }}>Day {String(record(world.clock).day ?? '—')} · {String(record(world.clock).season ?? '—')} · Tick {String(record(world.clock).tick ?? '—')}</div>
        <div style={muted}>Player chunk: ({String(record(world.chunk).x ?? '—')}, {String(record(world.chunk).y ?? '—')})</div>
        <pre style={pre}>{pretty(snapshot.world)}</pre>
      </div>
      <div style={section}>
        <strong>Player state</strong>
        <div style={muted}>Level {String(player.level ?? '—')} · {String(player.className ?? 'Adventurer')} · HP {String(player.hp ?? '—')} · XP {String(player.xp ?? '—')}</div>
        <pre style={pre}>{pretty(snapshot.player)}</pre>
      </div>
      <div style={section}>
        <strong>NPC roster · {roster.length} townsfolk · {localNpcs.length} local NPCs</strong>
        <div style={muted}>This is the actual townsfolk roster used by the live simulation, not generated demo NPCs.</div>
        <pre style={pre}>{pretty(roster.slice(0, 30))}{roster.length > 30 ? '\n… ' + (roster.length - 30) + ' more NPCs' : ''}</pre>
      </div>
      <div style={section}>
        <strong>Inventory & equipment</strong>
        <div style={muted}>{list(inventory.equipment).length} equipped/carried equipment records · live inventory resource counts</div>
        <pre style={pre}>{pretty(snapshot.inventory)}</pre>
      </div>
      <div style={section}>
        <strong>Quests & tasks</strong>
        <div style={muted}>{questList.length} quest records · {taskList.length} task records</div>
        <pre style={pre}>{pretty(snapshot.quests)}</pre>
      </div>
      <div style={section}>
        <strong>Live civilization</strong>
        <div style={muted}>{settlements.length} settlements · {list(civilization.kingdoms).length} kingdoms · live economy data</div>
        <pre style={pre}>{pretty(snapshot.civilization)}</pre>
      </div>
      <div style={section}>
        <strong>Registered API systems · {systems.length}</strong>
        <div style={muted}>Read-only game-state adapters plus existing shared gameplay services.</div>
        {systems.map(system => <div key={system.id} style={{ padding: '6px 0', borderBottom: '1px solid #344b3d' }}>
          <strong>{system.id}</strong><div style={muted}>{system.domain} · v{system.version} · {system.description}</div>
        </div>)}
      </div>
      <div style={muted}>Live refresh #{revision}. This panel does not advance time, modify the save, or create another NPC/world simulation.</div>
    </div>
  </section>;
}
