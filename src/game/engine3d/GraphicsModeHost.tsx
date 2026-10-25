import { useState } from 'react';
import App from '../../App';
import Engine3DView from './Engine3DView';
import type { GraphicsMode } from './engine3d';

const MODE_KEY = 'ag-graphics-mode-v1';
function initialMode(): GraphicsMode {
  try {
    const query = new URLSearchParams(window.location.search).get('mode');
    if (query === '3d') return '3d';
    const saved = localStorage.getItem(MODE_KEY);
    return saved === '3d' ? '3d' : saved === '2d' ? '2d' : '2.5d';
  } catch { return '2.5d'; }
}

/**
 * Root-level mode bridge. Debug control is opt-in via ?debug=1 so normal play
 * remains visually unchanged until the new mode is explicitly enabled.
 */
export default function GraphicsModeHost() {
  const [mode, setMode] = useState<GraphicsMode>(initialMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const debugEnabled = (() => { try { return new URLSearchParams(window.location.search).get('debug') === '1' || localStorage.getItem('ag-debug-enabled') === '1'; } catch { return false; } })();

  const choose = (next: GraphicsMode) => {
    try { localStorage.setItem(MODE_KEY, next); } catch {}
    if (next === '3d') { setMode('3d'); setMenuOpen(false); return; }
    try { localStorage.setItem('ag-view-mode', next === '2.5d' ? '2.5d' : '2d'); } catch {}
    // Remove a direct-test query before reloading so it cannot force 3D again.
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    window.history.replaceState({}, '', url.toString());
    // Legacy renderer reads its mode during boot; reload it cleanly.
    window.location.reload();
  };

  if (mode === '3d') return <Engine3DView onExit={() => choose('2.5d')} />;

  return <>
    <App />
    {debugEnabled && <div style={{position:'fixed',right:10,top:'max(10px, env(safe-area-inset-top))',zIndex:30000,fontFamily:'system-ui,sans-serif',color:'#fff'}}>
      <button type="button" onClick={()=>setMenuOpen(v=>!v)} style={{border:'1px solid #8c9b8d',borderRadius:8,padding:'9px 12px',background:'#172c23ee',color:'#fff',fontWeight:700}}>Debug · Graphics</button>
      {menuOpen && <div role="dialog" aria-label="Graphics mode setting" style={{marginTop:6,width:220,padding:12,borderRadius:10,background:'#172c23f5',border:'1px solid #8c9b8d',boxShadow:'0 6px 24px #0007'}}>
        <strong style={{display:'block',marginBottom:9}}>Graphics Mode</strong>
        {(['2d','2.5d','3d'] as GraphicsMode[]).map(value=><button key={value} type="button" onClick={()=>choose(value)} style={{display:'block',width:'100%',textAlign:'left',marginTop:6,padding:10,borderRadius:7,border:'1px solid #8c9b8d',background:value===mode?'#425b3d':'#22392d',color:'#fff'}}>{value==='2.5d'?'2.5D Isometric':value==='3d'?'3D Experimental':'2D'}</button>)}
        <p style={{fontSize:11,lineHeight:1.4,opacity:.8,marginBottom:0}}>3D opens the separate WebGL test scene. Legacy modes reload using their existing renderer.</p>
      </div>}
    </div>}
  </>;
}
