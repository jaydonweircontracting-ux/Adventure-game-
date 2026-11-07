import { useState } from 'react';
import App from '../../App';
import Engine3DWorldView from './Engine3DWorldView';
import type { Diagnostics3D } from './Engine3DWorldView';
import type { GraphicsMode } from './engine3d';

const MODE_KEY = 'ag-graphics-mode-v1';
// BUILD 992: first-person-auto setting (3D mode only). Default ON:
// zooming all the way in steps into first person, zooming out returns
// to orbit. Stored as '1'/'0'; any missing/unreadable value means ON.
const FP_AUTO_KEY = 'ag-first-person-auto-v1';
// BUILD 1017: Hide UI setting (3D mode only). Default OFF (UI shown).
// Stored as '1'/'0'; any missing/unreadable value means OFF. Follows the
// exact 992 first-person-auto persistence pattern.
const HIDE_UI_KEY = 'ag-hide-ui-v1';
// BUILD 1017: the controls sentences, moved verbatim off the 3D play
// screen (Engine3DWorldView) into Options > Controls.
const HELP_ORBIT = 'Tap ground to move · drag to rotate · pinch to zoom · E: interact · F/Space: attack · Enter: step inside at a door · Hold Sprint/Shift: sprint';
const HELP_FP = 'Tap ground to move · drag to look · pinch to zoom out · E: interact · F/Space: attack · Enter: step inside at a door · Hold Sprint/Shift: sprint';

function initialMode(): GraphicsMode {
  // Always boot into the established 2.5D game, regardless of a previously
  // saved 3D choice or a stale ?mode=3d test URL. Players can switch modes
  // manually from Options after the game has loaded.
  try {
    localStorage.setItem(MODE_KEY, '2.5d');
    localStorage.setItem('ag-view-mode', '2.5d');
  } catch {}
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('mode')) {
      url.searchParams.delete('mode');
      window.history.replaceState({}, '', url.toString());
    }
  } catch {}
  return '2.5d';
}

/**
 * Keeps the 3D renderer isolated from the legacy app. The Options control is
 * always available (including on mobile), rather than hidden behind a debug
 * flag that made the graphics-mode selector impossible to find.
 */
export default function GraphicsModeHost() {
  const [mode, setMode] = useState<GraphicsMode>(initialMode);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [fpAuto, setFpAuto] = useState<boolean>(() => {
    try { return localStorage.getItem(FP_AUTO_KEY) !== '0'; } catch { return true; }
  });
  // BUILD 1017: Hide UI (3D mode only) + the live diagnostics snapshot
  // reported by the 3D view (terrain vertices, map size, player position).
  const [hideUi, setHideUi] = useState<boolean>(() => {
    try { return localStorage.getItem(HIDE_UI_KEY) === '1'; } catch { return false; }
  });
  const [diag, setDiag] = useState<Diagnostics3D | null>(null);

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
      <Engine3DWorldView onExit={() => choose('2.5d')} fpAuto={fpAuto} hideUi={hideUi} onDiagnostics={setDiag} />
      <button
        type="button"
        onClick={() => setOptionsOpen(v => !v)}
        aria-label="Open graphics options"
        style={{position:'fixed',right:12,top:'max(12px, env(safe-area-inset-top))',zIndex:30002,padding:'11px 14px',border:'1px solid #8c9b8d',borderRadius:10,background:'#172c23ee',color:'#fff',fontWeight:700}}
      >Options</button>
      {optionsOpen && <section role="dialog" aria-label="Graphics options" style={{position:'fixed',right:12,top:'max(58px, calc(env(safe-area-inset-top) + 50px))',zIndex:30003,width:230,maxHeight:'calc(100vh - 380px)',overflowY:'auto',padding:14,borderRadius:12,background:'#172c23f5',border:'1px solid #8c9b8d',boxShadow:'0 6px 24px #0007',fontFamily:'system-ui,sans-serif',color:'#fff'}}>
        <strong style={{display:'block',marginBottom:10}}>Graphics Mode</strong>
        {(['2d','2.5d','3d'] as GraphicsMode[]).map(value =>
          <button key={value} type="button" onClick={() => choose(value)} aria-pressed={value === mode} style={{display:'block',width:'100%',textAlign:'left',marginTop:6,padding:10,borderRadius:8,border:'1px solid #8c9b8d',background:value===mode?'#526d42':'#22392d',color:'#fff',fontWeight:value===mode?700:500}}>
            {value === '2.5d' ? '2.5D Isometric' : value === '3d' ? '3D Experimental' : '2D'}
            {value === mode ? ' ✓' : ''}
          </button>
        )}
        <p style={{fontSize:11,lineHeight:1.4,opacity:.82,marginBottom:0}}>3D now reads the data-driven tile world and uses collision-checked movement. Existing 2D/2.5D remains available.</p>
        <strong style={{display:'block',marginTop:14,marginBottom:6}}>First person</strong>
        <button type="button" data-testid="fp-auto-toggle" onClick={() => { const next = !fpAuto; try { localStorage.setItem(FP_AUTO_KEY, next ? '1' : '0'); } catch {} setFpAuto(next); }} aria-pressed={fpAuto} style={{display:'block',width:'100%',textAlign:'left',padding:10,borderRadius:8,border:'1px solid #8c9b8d',background:fpAuto?'#526d42':'#22392d',color:'#fff',fontWeight:fpAuto?700:500}}>
          First person: auto on full zoom {fpAuto ? '✓' : ''}
        </button>
        <p style={{fontSize:11,lineHeight:1.4,opacity:.82,marginBottom:0}}>Zoom all the way in to step into first person and look around by dragging; zoom out to return to orbit. Turn this off to stay in orbit at full zoom.</p>
        {/* BUILD 1017: the 3D play screen is clean now — the banner, the
            controls help, and the diagnostic line moved here. The dialog
            is capped at 100vh-380px so its bottom always clears the
            right-side button stack (Sprint's top edge sits at 100vh-316);
            it scrolls internally. Known corner case, stated in the build
            report: the minimized Build-panel swipe handle (bottom 392)
            can sit under the dialog while a build tool is armed — closing
            Options brings it back. */}
        <strong style={{display:'block',marginTop:14,marginBottom:6}}>About</strong>
        <p style={{fontSize:11,lineHeight:1.4,opacity:.82,marginTop:0,marginBottom:0}}>ADVENTURE 3D · WORLD SIMULATION — Editable terrain · collision · walking NPC schedules · saved progress.</p>
        <strong style={{display:'block',marginTop:14,marginBottom:6}}>Hide UI</strong>
        <button type="button" data-testid="hide-ui-toggle" onClick={() => { const next = !hideUi; try { localStorage.setItem(HIDE_UI_KEY, next ? '1' : '0'); } catch {} setHideUi(next); }} aria-pressed={hideUi} style={{display:'block',width:'100%',textAlign:'left',padding:10,borderRadius:8,border:'1px solid #8c9b8d',background:hideUi?'#526d42':'#22392d',color:'#fff',fontWeight:hideUi?700:500}}>
          Hide UI {hideUi ? '✓' : ''}
        </button>
        <p style={{fontSize:11,lineHeight:1.4,opacity:.82,marginBottom:0}}>Hides the status strip and message line on the play screen. Buttons (Options, Build, Sprint, Enter/Exit) always stay visible — tap Options to bring the UI back.</p>
        <strong style={{display:'block',marginTop:14,marginBottom:6}}>Controls</strong>
        <p style={{fontSize:11,lineHeight:1.4,opacity:.82,marginTop:0,marginBottom:6}}>Orbit — {HELP_ORBIT}</p>
        <p style={{fontSize:11,lineHeight:1.4,opacity:.82,marginTop:0,marginBottom:0}}>First person — {HELP_FP}</p>
        <strong style={{display:'block',marginTop:14,marginBottom:6}}>Diagnostics</strong>
        <p data-testid="options-diagnostics" style={{fontSize:11,lineHeight:1.4,opacity:.82,marginTop:0,marginBottom:0}}>{diag ? `${diag.verts.toLocaleString()} terrain vertices · ${diag.mapW}×${diag.mapH} map · ${diag.x},${diag.y}` : '—'}</p>
      </section>}
    </>
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
