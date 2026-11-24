import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addEngineComponent,
  createEngineEntity,
  createEngineProject,
  createEngineScene,
  deserializeEngineProject,
  removeEngineEntity,
  renameEngineEntity,
  renameEngineScene,
  serializeEngineProject,
  setActiveScene,
  updateEntityTransform,
  type EngineProject,
  type Transform3D,
} from './engineCore';

const STORAGE_KEY = 'adventure-engine-project-v1';
const panel: React.CSSProperties = {
  position: 'fixed', inset: 'max(12px, env(safe-area-inset-top)) 12px 12px',
  zIndex: 40000, display: 'flex', flexDirection: 'column', minHeight: 0,
  background: '#111a18', color: '#edf5ed', border: '1px solid #718879',
  borderRadius: 14, boxShadow: '0 16px 60px #000b', fontFamily: 'system-ui, sans-serif',
};
const button: React.CSSProperties = {
  border: '1px solid #60786a', borderRadius: 7, padding: '7px 10px',
  color: '#f3fff4', background: '#263b30', fontWeight: 650, cursor: 'pointer',
};
const input: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 8px',
  color: '#f3fff4', background: '#172521', border: '1px solid #536b5c',
  borderRadius: 6,
};
const muted: React.CSSProperties = { color: '#a8b9ad', fontSize: 11 };

function initialProject(): EngineProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const loaded = deserializeEngineProject(raw);
      if (loaded.ok) return loaded.value;
    }
  } catch {}
  return createEngineProject('My Game Project', 'my-game-project');
}

export default function EngineStudio({ onClose }: { onClose: () => void }) {
  const [project, setProject] = useState<EngineProject>(initialProject);
  const [past, setPast] = useState<EngineProject[]>([]);
  const [future, setFuture] = useState<EngineProject[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(true);
  const importRef = useRef<HTMLInputElement>(null);

  const scene = useMemo(
    () => project.scenes.find((item) => item.id === project.activeSceneId) ?? project.scenes[0],
    [project],
  );
  const selected = scene?.entities.find((entity) => entity.id === selectedEntityId) ?? null;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeEngineProject(project));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [project]);

  const commit = (next: EngineProject) => {
    setPast((items) => [...items.slice(-49), project]);
    setFuture([]);
    setProject(next);
    setError('');
  };
  const run = (result: EngineResult<EngineProject>) => {
    if (result.ok) commit(result.value);
    else setError(result.error);
  };
  const updateTransform = (axis: 'position' | 'rotation' | 'scale', index: number, value: number) => {
    if (!selected || !Number.isFinite(value)) return;
    const transform: Transform3D = {
      ...selected.transform,
      [axis]: selected.transform[axis].map((entry, i) => i === index ? value : entry) as [number, number, number],
    };
    run(updateEntityTransform(project, scene.id, selected.id, transform));
  };
  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setFuture((items) => [project, ...items].slice(0, 50));
    setPast((items) => items.slice(0, -1));
    setProject(previous);
    setError('');
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast((items) => [...items, project].slice(-50));
    setFuture((items) => items.slice(1));
    setProject(next);
    setError('');
  };
  const exportProject = () => {
    const blob = new Blob([serializeEngineProject(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = project.id + '.adventure.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      const result = deserializeEngineProject(await file.text());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPast((items) => [...items.slice(-49), project]);
      setFuture([]);
      setProject(result.value);
      setSelectedEntityId(null);
      setError('');
    } catch {
      setError('Could not read the selected project file.');
    }
  };
  const field = (label: string, axis: 'position' | 'rotation' | 'scale') => (
    <div key={axis} style={{ marginTop: 10 }}>
      <div style={{ ...muted, marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5 }}>
        {selected!.transform[axis].map((value, index) => (
          <label key={index} style={{ ...muted, display: 'block' }}>
            {['X', 'Y', 'Z'][index]}
            <input aria-label={label + ' ' + ['X', 'Y', 'Z'][index]} style={input} type="number" step="0.1" value={value}
              onChange={(event) => updateTransform(axis, index, Number(event.target.value))} />
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <section role="dialog" aria-modal="true" aria-label="Adventure Engine Studio" style={panel}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderBottom: '1px solid #354a40' }}>
        <div>
          <strong style={{ fontSize: 16 }}>Adventure Engine Studio</strong>
          <div style={muted}>Scene authoring · Project format v{project.schemaVersion}</div>
        </div>
        <button type="button" style={button} onClick={onClose}>Close</button>
      </header>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 9, borderBottom: '1px solid #354a40' }}>
        <button type="button" style={button} onClick={undo} disabled={!past.length}>↶ Undo</button>
        <button type="button" style={button} onClick={redo} disabled={!future.length}>↷ Redo</button>
        <button type="button" style={button} onClick={() => run(createEngineScene(project, 'New Scene'))}>+ Scene</button>
        <button type="button" style={button} onClick={() => importRef.current?.click()}>Import project</button>
        <button type="button" style={button} onClick={exportProject}>Export project</button>
        <input ref={importRef} type="file" accept=".json,.adventure.json,application/json" style={{ display: 'none' }}
          onChange={(event) => { void importProject(event.target.files?.[0]); event.currentTarget.value = ''; }} />
        <span style={{ ...muted, alignSelf: 'center', marginLeft: 'auto' }}>{saved ? 'Saved locally' : 'Local save unavailable'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(135px, 0.85fr) minmax(0, 1.5fr)', gap: 1, flex: 1, minHeight: 0, overflow: 'hidden', background: '#354a40' }}>
        <aside style={{ minWidth: 0, overflowY: 'auto', background: '#17231f', padding: 10 }}>
          <div style={{ ...muted, fontWeight: 800, letterSpacing: '.08em', marginBottom: 7 }}>SCENES</div>
          {project.scenes.map((item) => (
            <button key={item.id} type="button" style={{ ...button, display: 'block', width: '100%', textAlign: 'left', marginBottom: 5, background: item.id === scene.id ? '#496b50' : '#263b30' }}
              onClick={() => { run(setActiveScene(project, item.id)); setSelectedEntityId(null); }}>
              {item.active ? '● ' : '○ '}{item.name}
            </button>
          ))}
          <div style={{ ...muted, fontWeight: 800, letterSpacing: '.08em', margin: '16px 0 7px' }}>HIERARCHY</div>
          <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
            <button type="button" style={{ ...button, flex: 1 }} onClick={() => {
              const result = createEngineEntity(project, scene.id, 'Entity');
              if (result.ok) {
                const id = result.value.scenes.find((item) => item.id === scene.id)!.entities.at(-1)!.id;
                commit(result.value); setSelectedEntityId(id);
              } else setError(result.error);
            }}>+ Entity</button>
            <button type="button" style={{ ...button, flex: 1 }} disabled={!selected} onClick={() => {
              const result = createEngineEntity(project, scene.id, 'Child Entity', selected!.id);
              if (result.ok) {
                const id = result.value.scenes.find((item) => item.id === scene.id)!.entities.at(-1)!.id;
                commit(result.value); setSelectedEntityId(id);
              } else setError(result.error);
            }}>+ Child</button>
          </div>
          {scene.entities.length === 0 && <p style={muted}>This scene is empty. Add an entity to begin.</p>}
          {scene.entities.map((entity) => (
            <button key={entity.id} type="button" onClick={() => setSelectedEntityId(entity.id)}
              style={{ ...button, display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, paddingLeft: entity.parentId ? 22 : 9, background: selectedEntityId === entity.id ? '#496b50' : '#202f29', borderColor: selectedEntityId === entity.id ? '#b4d2b5' : '#42574b' }}>
              {entity.parentId ? '↳ ' : '◇ '}{entity.name}{entity.active ? '' : ' (off)'}
            </button>
          ))}
        </aside>
        <main style={{ minWidth: 0, overflowY: 'auto', background: '#1b2924', padding: 12 }}>
          <section style={{ marginBottom: 14, border: '1px solid #43584c', borderRadius: 9, overflow: 'hidden', background: '#15211d' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #354a40' }}>
              <strong style={{ fontSize: 12 }}>Scene Viewport · Top-down X/Z</strong>
              <span style={muted}>Select an object to inspect</span>
            </div>
            <svg viewBox="0 0 600 360" role="img" aria-label="Top-down scene viewport showing entity positions on an editor grid" style={{ display: 'block', width: '100%', maxHeight: 260, background: '#1b3028', touchAction: 'pan-y' }}>
              {Array.from({ length: 21 }, (_, index) => {
                const offset = 60 + index * 24;
                return <g key={index} stroke={index === 10 ? '#829d86' : '#395448'} strokeWidth={index === 10 ? 1.5 : 0.7} opacity={index === 10 ? 0.9 : 0.7}>
                  <line x1={offset} y1="60" x2={offset} y2="300" />
                  <line x1="60" y1={offset + 60} x2="540" y2={offset + 60} />
                </g>;
              })}
              <text x="548" y="180" fill="#b9cbbb" fontSize="12">X</text>
              <text x="300" y="24" fill="#b9cbbb" fontSize="12">Z</text>
              <circle cx="300" cy="180" r="4" fill="#a4bda8" />
              {scene.entities.map((entity) => {
                const x = Math.max(60, Math.min(540, 300 + entity.transform.position[0] * 12));
                const y = Math.max(60, Math.min(300, 180 + entity.transform.position[2] * 12));
                const active = selectedEntityId === entity.id;
                return <g key={entity.id} onClick={() => setSelectedEntityId(entity.id)} style={{ cursor: 'pointer' }}>
                  {active && <circle cx={x} cy={y} r="17" fill="none" stroke="#f5d78b" strokeWidth="2" />}
                  <circle cx={x} cy={y} r="9" fill={active ? '#f5d78b' : entity.active ? '#78b88a' : '#87938b'} stroke="#102019" strokeWidth="2" />
                  <text x={x + 12} y={y - 10} fill="#f0f5ef" fontSize="11">{entity.name.slice(0, 18)}</text>
                </g>;
              })}
            </svg>
            {selected && <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: 8, borderTop: '1px solid #354a40' }}>
              <span style={{ ...muted, marginRight: 4 }}>Move selected:</span>
              {([['X −', 'x', -1], ['X +', 'x', 1], ['Z −', 'z', -1], ['Z +', 'z', 1]] as const).map(([label, axis, delta]) => (
                <button key={label} type="button" style={button} onClick={() => {
                  const position: [number, number, number] = [...selected.transform.position];
                  position[axis === 'x' ? 0 : 2] += delta;
                  run(updateEntityTransform(project, scene.id, selected.id, { ...selected.transform, position }));
                }}>{label}</button>
              ))}
              <span style={muted}>Grid movement: 1 unit</span>
            </div>}
          </section>
          {!selected ? (
            <div style={{ padding: 12 }}>
              <strong>Scene settings</strong>
              <p style={muted}>Select an entity in the hierarchy to edit it, or rename the active scene below.</p>
              <label style={muted}>Scene name
                <input style={{ ...input, marginTop: 5 }} value={scene.name}
                  onChange={(event) => run(renameEngineScene(project, scene.id, event.target.value))} />
              </label>
              <div style={{ marginTop: 16, border: '1px dashed #536b5c', borderRadius: 9, padding: 12 }}>
                <strong>Viewport integration is next</strong>
                <p style={muted}>This first editor slice provides editable scene data, hierarchy, inspector, project files and undo/redo. It does not yet draw or manipulate 3D objects in a viewport.</p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <strong>Entity Inspector</strong>
                <button type="button" style={{ ...button, background: '#58312c', borderColor: '#96665b' }} onClick={() => {
                  run(removeEngineEntity(project, scene.id, selected.id)); setSelectedEntityId(null);
                }}>Delete</button>
              </div>
              <label style={{ ...muted, display: 'block', marginTop: 12 }}>Name
                <input style={{ ...input, marginTop: 5 }} value={selected.name}
                  onChange={(event) => run(renameEngineEntity(project, scene.id, selected.id, event.target.value))} />
              </label>
              {field('Position', 'position')}
              {field('Rotation (radians)', 'rotation')}
              {field('Scale', 'scale')}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
                <strong>Components</strong>
                <button type="button" style={button} onClick={() => run(addEngineComponent(project, scene.id, selected.id, {
                  type: 'adventure.empty-component', version: 1, enabled: true, data: {},
                }))}>+ Component</button>
              </div>
              {selected.components.length === 0 && <p style={muted}>No components attached.</p>}
              {selected.components.map((component, index) => (
                <div key={component.type + index} style={{ marginTop: 7, padding: 9, border: '1px solid #43584c', borderRadius: 7 }}>
                  <strong style={{ fontSize: 12 }}>{component.type}</strong>
                  <div style={muted}>Version {component.version} · {component.enabled ? 'Enabled' : 'Disabled'}</div>
                  <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 10, color: '#b8c9bd' }}>{JSON.stringify(component.data, null, 2)}</pre>
                </div>
              ))}
            </>
          )}
        </main>
      </div>
      {error && <div role="alert" style={{ padding: 9, color: '#ffd0c8', background: '#522b27', fontSize: 12 }}>{error}</div>}
      <footer style={{ ...muted, padding: '7px 12px', borderTop: '1px solid #354a40' }}>
        {project.name} · {project.scenes.length} scenes · {scene.entities.length} entities · Local project storage
      </footer>
    </section>
  );
}
