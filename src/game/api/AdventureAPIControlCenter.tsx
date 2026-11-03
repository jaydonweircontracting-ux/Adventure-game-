import { useEffect, useMemo, useState } from 'react';
import { createAdventureRuntime } from './AdventureRuntime';

/**
 * In-game API workbench. The current runtime is an isolated deterministic
 * sandbox so developers can exercise the public API without mutating a live
 * player save or creating a second source of truth for the active game.
 */
export default function AdventureAPIControlCenter({ onClose }: { onClose: () => void }) {
  const runtime = useMemo(() => createAdventureRuntime({ eventHistoryLimit: 80 }), []);
  const [, refresh] = useState(0);
  const [sampleX, setSampleX] = useState(0);
  const [sampleY, setSampleY] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [demoMood, setDemoMood] = useState(() => runtime.npc.createMood());
  const [itemSeed, setItemSeed] = useState(12345);
  const [demoItem, setDemoItem] = useState(() => runtime.items.generate(runtime.items.createRng(12345), 1));

  useEffect(() => () => runtime.dispose(), [runtime]);

  const clock = runtime.world.getClock();
  const terrain = runtime.terrain.sample(sampleX, sampleY);
  const navPreview = runtime.navigation.pathTo({ x: 10, y: 10 }, { x: 45, y: 36 }, []);
  const systems = runtime.api.listSystems();
  const events = runtime.api.events.getHistory().slice(-12).reverse();

  const advance = (ticks: number) => {
    runtime.world.advance(ticks);
    refresh(value => value + 1);
  };

  const setSimulationSpeed = (value: number) => {
    const next = Number(value);
    runtime.world.setSimulationSpeed(next);
    setSpeed(next);
    refresh(current => current + 1);
  };

  const panel: React.CSSProperties = {
    position: 'fixed', inset: 'max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom))',
    zIndex: 31000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: '#101a17', color: '#edf4ed', border: '1px solid #78927e',
    borderRadius: 12, boxShadow: '0 14px 48px #000d', font: '13px system-ui,sans-serif',
  };
  const button: React.CSSProperties = {
    border: '1px solid #718a78', borderRadius: 7, background: '#263d30',
    color: '#fff', padding: '8px 10px', fontWeight: 650,
  };
  const section: React.CSSProperties = {
    background: '#17251f', border: '1px solid #344b3d', borderRadius: 9, padding: 10,
  };
  const muted: React.CSSProperties = { color: '#b9c9bd', fontSize: 11 };

  return <section role="dialog" aria-label="Adventure API Control Center" style={panel}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: '1px solid #344b3d' }}>
      <div style={{ flex: 1 }}>
        <strong style={{ fontSize: 16 }}>Adventure API Control Center</strong>
        <div style={muted}>API v{runtime.api.version} · isolated sandbox · no player save changes</div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close API Control Center" style={button}>Close</button>
    </header>
    <div style={{ overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
      <div style={section}>
        <strong>World clock</strong>
        <div style={{ fontSize: 22, fontWeight: 750, margin: '7px 0' }}>
          {String(clock.hour).padStart(2, '0')}:{String(clock.minuteOfDay % 60).padStart(2, '0')}
          <span style={{ fontSize: 13, fontWeight: 500 }}> · Day {clock.day} · {clock.season}</span>
        </div>
        <div style={muted}>Tick {clock.tick} · Seed {runtime.world.core.seed} · Simulation speed {speed}×</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
          <button style={button} onClick={() => advance(1)}>+1 tick</button>
          <button style={button} onClick={() => advance(6)}>+1 hour</button>
          <button style={button} onClick={() => advance(144)}>+1 day</button>
          <select aria-label="Simulation speed" value={speed} onChange={event => setSimulationSpeed(Number(event.target.value))} style={{ background: '#202d28', color: 'white', border: '1px solid #53685c', borderRadius: 7, padding: 8 }}>
            {[0, 1, 2, 5, 10, 50, 100, 1000].map(value => <option key={value} value={value}>{value}× speed</option>)}
          </select>
        </div>
      </div>

      <div style={section}>
        <strong>Terrain query</strong>
        <p style={muted}>Sample the existing deterministic landscape adapter at world coordinates.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 3 }}>World X
            <input type="number" value={sampleX} onChange={event => setSampleX(Number(event.target.value) || 0)} style={{ width: 110, padding: 7, background: '#202d28', color: '#fff', border: '1px solid #53685c', borderRadius: 6 }} />
          </label>
          <label style={{ display: 'grid', gap: 3 }}>World Y
            <input type="number" value={sampleY} onChange={event => setSampleY(Number(event.target.value) || 0)} style={{ width: 110, padding: 7, background: '#202d28', color: '#fff', border: '1px solid #53685c', borderRadius: 6 }} />
          </label>
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#0c1411', padding: 9, borderRadius: 7, color: '#d8e8d9', fontSize: 11 }}>{JSON.stringify(terrain, null, 2)}</pre>
      </div>

      <div style={section}>
        <strong>Registered API systems ({systems.length})</strong>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {systems.map(system => <div key={system.id} style={{ borderTop: '1px solid #344b3d', paddingTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{system.id}</strong><span style={muted}>{system.domain} · v{system.version}</span>
            </div>
            <div style={muted}>{system.description}</div>
          </div>)}
        </div>
      </div>

      <div style={section}>
        <strong>Civilization simulation</strong>
        <div style={{ marginTop: 7 }}>Settlements: {runtime.civilization.state.settlements.length} · Kingdoms: {runtime.civilization.state.kingdoms.length} · Simulated through day {runtime.civilization.state.lastSimDay}</div>
        <div style={muted}>The sandbox advances settlement simulation automatically when its clock crosses a day boundary.</div>
      </div>

      <div style={section}>
        <strong>NPC psychology API</strong>
        <div style={muted}>Live test of the existing personality and mood engine. This demo NPC is sandbox-only.</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
          <button style={button} onClick={() => setDemoMood(mood => runtime.npc.applyEvent(mood, { id: 'danger-' + mood.processedEvents.length, category: 'credible_danger', severity: 0.8, witnessed: true }, 'worrier'))}>Simulate danger</button>
          <button style={button} onClick={() => setDemoMood(mood => runtime.npc.applyEvent(mood, { id: 'friendly-' + mood.processedEvents.length, category: 'friendly_conversation', severity: 0.8, witnessed: true }, 'social_butterfly'))}>Friendly conversation</button>
          <button style={button} onClick={() => setDemoMood(mood => runtime.npc.advanceTime(mood, 2, 'worrier'))}>Advance 2 hours</button>
          <button style={button} onClick={() => setDemoMood(runtime.npc.createMood())}>Reset demo</button>
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#0c1411', padding: 9, borderRadius: 7, color: '#d8e8d9', fontSize: 11 }}>{runtime.npc.summarize(demoMood)}</pre>
        <div style={muted}>Processed events: {demoMood.processedEvents.length} · Valid state: {runtime.npc.validate(demoMood) ? 'yes' : 'no'}</div>
      </div>

      <div style={section}>
        <strong>NPC navigation API</strong>
        <div style={muted}>Preview of the existing obstacle-aware pathfinder. The demo route is not applied to a live NPC.</div>
        <div style={{ marginTop: 8 }}>Route from (10, 10) to (45, 36): {navPreview ? 'path found' : 'no path'}</div>
        <div>Waypoints: {navPreview?.waypoints.length ?? 0} · Destination: {navPreview ? '(' + navPreview.destination.x.toFixed(1) + ', ' + navPreview.destination.y.toFixed(1) + ')' : 'unreachable'}</div>
        <div style={muted}>Movement stepping and stuck recovery are exposed through the same API service.</div>
      </div>

      <div style={section}>
        <strong>Items and equipment API</strong>
        <div style={muted}>Generate an item using the existing seeded item generator. Reusing a seed reproduces its item properties.</div>
        <div style={{ marginTop: 8, fontWeight: 700 }}>{demoItem.name}</div>
        <div>{demoItem.quality} · Level {demoItem.level} · Value {demoItem.value} gold · {demoItem.slot}</div>
        <div style={muted}>Weight: {runtime.items.itemWeight(demoItem)} · STR 5 carry capacity: {runtime.items.carryCapacity(5)}</div>
        <button style={{ ...button, marginTop: 8 }} onClick={() => { const nextSeed = itemSeed + 1; setItemSeed(nextSeed); setDemoItem(runtime.items.generate(runtime.items.createRng(nextSeed), 1)); }}>Generate seeded item</button>
      </div>

      <div style={section}>
        <strong>Combat geometry API</strong>
        <div style={muted}>Using the same melee geometry and line-of-sight rules as the existing game.</div>
        <div style={{ marginTop: 8 }}>Facing east · Adjacent target at 2 units: {runtime.combat.isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 }) ? 'in range' : 'out of range'}</div>
        <div>Melee arc at 0.5 units: {runtime.combat.isInMeleeArc({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 'right') ? 'valid' : 'miss'}</div>
        <div>Wall blocks line of sight: {runtime.combat.isLineBlocked({ x: 0, y: 0 }, { x: 10, y: 0 }, point => point.x > 4 && point.x < 6) ? 'yes' : 'no'}</div>
      </div>

      <div style={section}>
        <strong>Recent typed events</strong>
        {events.length === 0 ? <p style={muted}>Advance the sandbox clock to publish events.</p> : <div style={{ display: 'grid', gap: 6, marginTop: 7 }}>
          {events.map(event => <div key={event.id} style={{ borderTop: '1px solid #344b3d', paddingTop: 6 }}>
            <strong>{event.type}</strong><div style={muted}>tick {event.tick} · {JSON.stringify(event.payload)}</div>
          </div>)}
        </div>}
      </div>
    </div>
  </section>;
}
