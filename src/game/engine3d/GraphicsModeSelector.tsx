import { useState } from 'react';
import type { GraphicsMode } from './engine3d';

export default function GraphicsModeSelector({ onChange }: { onChange?: (mode: GraphicsMode) => void }) {
 const [mode,setMode] = useState<GraphicsMode>('2.5d');
 const choose = (next: GraphicsMode) => { setMode(next); onChange?.(next); try { localStorage.setItem('ag-graphics-mode-v1',next); } catch {} };
 return <section aria-label="Graphics Mode" style={{padding:12,border:'1px solid #66736a',borderRadius:10}}><strong>Graphics Mode</strong><div style={{display:'flex',gap:8,marginTop:8}}>{(['2d','2.5d','3d'] as GraphicsMode[]).map(value=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>choose(value)}>{value.toUpperCase()}</button>)}</div><p style={{fontSize:12}}>3D is experimental. Existing renderers remain separate.</p></section>;
}
