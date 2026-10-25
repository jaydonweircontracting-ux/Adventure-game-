import { useState } from 'react';
import App from '../../App';
import Engine3DView from './Engine3DView';
import Engine3DTouchControls from './Engine3DTouchControls';
import type { GraphicsMode } from './engine3d';

const MODE_KEY = 'ag-graphics-mode-v1';

function initialMode(): GraphicsMode {
  try {
    const query = new URLSearchParams(window.location.search).get('mode');
    if (query === '3d') return '3d';
    const saved = localStorage.getItem(MODE_KEY);
    return saved === '3d' ? '3d' : saved === '2d' ? '2d' : '2.5d';
  } catch {
    return '2.5d';
  }
}

/**
 * Keeps the 3D renderer isolated from the legacy app. The Options control is
 * always available (including on mobile), rather than hidden behind a debug
 * flag that made the graphics-mode selector impossible to find.
 */
export default function GraphicsModeHost() {
  const [mode, setMode] = useState<GraphicsMode>(initialMode);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const choose = (next: GraphicsMode) => {
    try { localStorage.setItem(MODE_KEY, next); } catch {}
    setOptionsOpen(false);

    if (next === '3d') {
      // Drop any test query so the choice is controlled by the saved setting.
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      window.history.replaceState({}, '', url.toString());
      setMode('3d');
      return;
    }

    try { localStorage.setItem('ag-view-mode', next === '2.5d' ? '2.5d' : '2d'); } catch {}
    setMode(next);
    // The existing renderers read their preferred mode during boot.
    window.location.reload();
  };

  if (mode === '3d') {
    return <>
      <Engine3DView onExit={() => choose('2.5d')} />
      <Engine3DTouchControls />
      <button
        type="button"
        onClick={() => setOptionsOpen(v => !v)}
        aria-label="Open graphics options"
        style={{position:'fixed',right:12,bottom:'max(16px, env(safe-area-inset-bottom))',zIndex:30002,padding:'11px 14px',border:'1px solid #8c9b8d',borderRadius:10,background:'#172c23ee',color:'#fff',fontWeight:700}}
      >Options</button>
      {optionsOpen && <section role="dialog" aria-label="Graphics options" style={{position:'fixed',right:12,bottom:'max(64px, calc(env(safe-area-inset-bottom) + 56px))',zIndex:30003,width:230,padding:14,borderRadius:12,background:'#172c23f5',border:'1px solid #8c9b8d',boxShadow:'0 6px 24px #0007',fontFamily:'system-ui,sans-serif',color:'#fff'}}>
        <strong style={{display:'block',marginBottom:10}}>Graphics Mode</strong>
        {(['2d','2.5d','3d'] as GraphicsMode[]).map(value =>
          <button key={value} type="button" onClick={() => choose(value)} aria-pressed={value === mode} style={{display:'block',width:'100%',textAlign:'left',marginTop:6,padding:10,borderRadius:8,border:'1px solid #8c9b8d',background:value===mode?'#526d42':'#22392d',color:'#fff',fontWeight:value===mode?700:500}}>
            {value === '2.5d' ? '2.5D Isometric' : value === '3d' ? '3D Experimental' : '2D'}
            {value === mode ? ' ✓' : ''}
          </button>
        )}
        <p style={{fontSize:11,lineHeight:1.4,opacity:.82,marginBottom:0}}>3D is a separate experimental renderer. Existing 2D/2.5D remains available.</p>
      </section>}
    </>;
  }

  return <>
    <App />
    <div style={{position:'fixed',right:10,top:'max(10px, env(safe-area-inset-top))',zIndex:30000,fontFamily:'system-ui,sans-serif',color:'#fff'}}>
      <button type="button" onClick={() => setOptionsOpen(v => !v)} aria-expanded={optionsOpen} aria-label="Open graphics options" style={{border:'1px solid #8c9b8d',borderRadius:9,padding:'10px 13px',background:'#172c23ee',color:'#fff',fontWeight:700,boxShadow:'0 3px 12px #0005'}}>Options ⚙</button>
      {optionsOpen && <section role="dialog" aria-label="Graphics options" style={{marginTop:6,width:230,padding:14,borderRadius:12,background:'#172c23f5',border:'1px solid #8c9b8d',boxShadow:'0 6px 24px #0007'}}>
        <strong style={{display:'block',marginBottom:10}}>Graphics Mode</strong>
        {(['2d','2.5d','3d'] as GraphicsMode[]).map(value =>
          <button key={value} type="button" onClick={() => choose(value)} aria-pressed={value === mode} style={{display:'block',width:'100%',textAlign:'left',marginTop:6,padding:10,borderRadius:8,border:'1px solid #8c9b8d',background:value===mode?'#526d42':'#22392d',color:'#fff',fontWeight:value===mode?700:500}}>
            {value === '2.5d' ? '2.5D Isometric' : value === '3d' ? '3D Experimental' : '2D'}
            {value === mode ? ' ✓' : ''}
          </button>
        )}
        <p style={{fontSize:11,lineHeight:1.4,opacity:.82,marginBottom:0}}>3D opens the separate experimental renderer. It does not replace the existing game.</p>
      </section>}
    </div>
  </>;
}
