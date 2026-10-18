import { useState } from 'react';

type Props = { build: string; onClose: () => void; onMinimize?: () => void };

/**
 * In-game development workspace. It deliberately does not claim to call an AI
 * service directly: it prepares a portable, context-rich request for ChatGPT/Muse
 * and links to the source-of-truth branch until a secure bridge endpoint exists.
 */
export default function DevConsole({ build, onClose, onMinimize }: Props) {
  const [request, setRequest] = useState('');
  const [context, setContext] = useState('debug-tools');
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem('ag-dev-console-notes') ?? ''; } catch { return ''; }
  });
  const [status, setStatus] = useState('Requests stay in this browser until copied or exported.');
  const [history, setHistory] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem('ag-dev-console-history') || '[]'); return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string').slice(-20) : []; } catch { return []; }
  });
  const saveNotes = (value: string) => {
    setNotes(value);
    try { localStorage.setItem('ag-dev-console-notes', value); } catch { /* browser storage may be full */ }
  };
  const buildPrompt = () => [
    'Adventure Game development request',
    'Repository: jaydonweircontracting-ux/Adventure-game-',
    'Branch: feature/world-dev-foundation (PR #38; do not assume it is merged or deployed)',
    'Current game build marker: ' + build,
    'Area: ' + context,
    'Safety rules: inspect current source and latest commits first; preserve existing gameplay, map, starting house, and player saves; make the smallest complete change; run typecheck, relevant regression tests, and production build; report exact commit, CI, and deployment status. Do not claim deployment until verified.',
    'Request: ' + request.trim(),
    notes.trim() ? 'Project notes / extra context:\n' + notes.trim() : ''
  ].filter(Boolean).join('\n\n');
  const copyRequest = async () => {
    if (!request.trim()) { setStatus('Write a request first.'); return; }
    const prompt = buildPrompt();
    try {
      await navigator.clipboard.writeText(prompt);
      const next = [...history, request.trim()].slice(-20);
      setHistory(next);
      try { localStorage.setItem('ag-dev-console-history', JSON.stringify(next)); } catch {}
      setStatus('Development prompt copied. Paste it into ChatGPT or Muse to run the work.');
    } catch {
      setStatus('Clipboard unavailable. Use Export request to download/copy the prompt manually.');
    }
  };
  const exportRequest = () => {
    if (!request.trim()) { setStatus('Write a request first.'); return; }
    const blob = new Blob([buildPrompt()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'adventure-game-dev-request.txt'; anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Request exported as a text file.');
  };
  return <section role="dialog" aria-label="Muse Dev Console" data-debug-window="true" style={{ position: 'fixed', inset: 'max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom))', zIndex: 23000, background: '#101a17', color: '#f2f5f0', border: '1px solid #597667', borderRadius: 12, boxShadow: '0 12px 40px #000c', display: 'flex', flexDirection: 'column', overflow: 'hidden', font: '13px system-ui' }}>
    <header style={{ padding: 12, borderBottom: '1px solid #35483e', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1 }}><strong style={{ fontSize: 16 }}>Muse Dev Console</strong><div style={{ color: '#b8c8bd', marginTop: 3 }}>Build {build} · in-game development workspace</div></div>
      {onMinimize && <button onClick={onMinimize} aria-label="Minimize Muse Dev Console" style={{ background: '#263b31', color: 'white', border: '1px solid #6d8a79', borderRadius: 8, padding: '8px 11px' }}>—</button>}<button onClick={onClose} style={{ background: '#263b31', color: 'white', border: '1px solid #6d8a79', borderRadius: 8, padding: '8px 11px' }}>✕</button>
    </header>
    <div style={{ overflow: 'auto', padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ border: '1px solid #3d5548', borderRadius: 8, padding: 10, background: '#17251f' }}>
        <strong>Request → review → test → commit → deploy</strong>
        <p style={{ color: '#c2d0c6', margin: '6px 0 0' }}>This console packages your request with project and safety context. Direct in-game AI execution needs a secure Muse Bridge/backend connection; this panel does not pretend to have one yet.</p>
      </div>
      <label style={{ display: 'grid', gap: 5 }}>Development area
        <select value={context} onChange={e => setContext(e.target.value)} style={{ background: '#202d28', color: 'white', border: '1px solid #53685c', borderRadius: 6, padding: 9 }}>
          <option value="debug-tools">Debug tools / World Studio</option><option value="world-map">World map / chunks / tiles</option><option value="sprites">Sprites / assets / placement</option><option value="NPCs">NPCs / AI / simulation</option><option value="gameplay">Gameplay / controls / combat</option><option value="engine">Engine architecture / performance</option><option value="build-deployment">Build / GitHub / deployment</option>
        </select>
      </label>
      <label style={{ display: 'grid', gap: 5 }}>What should we change?
        <textarea value={request} onChange={e => setRequest(e.target.value)} rows={5} placeholder="Example: let me tap any editable sprite, inspect its world coordinates, and move it to a new coordinate..." style={{ resize: 'vertical', background: '#17231e', color: 'white', border: '1px solid #53685c', borderRadius: 6, padding: 10, font: 'inherit' }} />
      </label>
      <label style={{ display: 'grid', gap: 5 }}>Persistent project notes
        <textarea value={notes} onChange={e => saveNotes(e.target.value)} rows={3} placeholder="Rules, known bugs, acceptance checks…" style={{ resize: 'vertical', background: '#17231e', color: 'white', border: '1px solid #53685c', borderRadius: 6, padding: 10, font: 'inherit' }} />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={copyRequest} style={{ flex: '1 1 150px', background: '#286341', color: 'white', border: '1px solid #7caf8b', borderRadius: 7, padding: 11, fontWeight: 700 }}>Copy request for ChatGPT / Muse</button>
        <button onClick={exportRequest} style={{ flex: '1 1 120px', background: '#263b31', color: 'white', border: '1px solid #6d8a79', borderRadius: 7, padding: 11 }}>Export .txt</button>
      </div>
      <div style={{ color: '#d7e4d9' }} aria-live="polite">{status}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href="https://github.com/jaydonweircontracting-ux/Adventure-game-/pull/38" target="_blank" rel="noreferrer" style={{ color: '#a9d7ff' }}>Open development PR #38 ↗</a>
        <a href="https://github.com/jaydonweircontracting-ux/Adventure-game-/actions" target="_blank" rel="noreferrer" style={{ color: '#a9d7ff' }}>Check automated tests ↗</a>
      </div>
      {history.length > 0 && <div><strong>Recent requests</strong><div style={{ display: 'grid', gap: 5, marginTop: 6 }}>{history.slice().reverse().slice(0, 5).map((item, index) => <button key={index} onClick={() => setRequest(item)} style={{ textAlign: 'left', background: '#202d28', color: '#e8eee9', border: '1px solid #3d5548', borderRadius: 6, padding: 8 }}>{item}</button>)}</div></div>}
    </div>
  </section>;
}
