import { useState } from 'react';
import type { PlacedObject } from '../worldEditor';

type Props = {
  objects: PlacedObject[];
  onMove: (id: string, x: number, y: number, chunk: string) => void;
  onClose: () => void;
  onMinimize?: () => void;
};
export default function WorldObjectCoordinates({ objects, onMove, onClose, onMinimize }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [xText, setXText] = useState('');
  const [yText, setYText] = useState('');
  const [chunkText, setChunkText] = useState('');
  const filtered = objects.filter(o => (o.id + ' ' + o.kind + ' ' + o.chunk).toLowerCase().includes(search.toLowerCase()));
  const selected = objects.find(o => o.id === selectedId);
  const select = (o: PlacedObject) => { setSelectedId(o.id); setXText(String(o.x)); setYText(String(o.y)); setChunkText(o.chunk); };
  const apply = () => {
    const x = Number(xText), y = Number(yText), chunk = chunkText.trim();
    if (!selected || !xText.trim() || !yText.trim() || !Number.isFinite(x) || !Number.isFinite(y) || !/^[-]?\d+\s*,\s*[-]?\d+$/.test(chunk)) return;
    onMove(selected.id, Math.round(x * 10) / 10, Math.round(y * 10) / 10, chunk.replace(/\s/g, ''));
  };
  return <section role="dialog" aria-label="World object coordinates" style={{ position:'fixed', inset:'max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom))', zIndex:22500, display:'flex', flexDirection:'column', overflow:'hidden', background:'#111b19', color:'#f3f6ef', border:'1px solid #5a7567', borderRadius:12, boxShadow:'0 12px 40px #000c', font:'13px system-ui' }}>
    <header style={{ display:'flex', alignItems:'center', gap:8, padding:12, borderBottom:'1px solid #35483e' }}><div style={{flex:1}}><strong style={{fontSize:16}}>World Object Coordinates</strong><div style={{color:'#b8c8bd',marginTop:3}}>Move placed houses, trees, rocks and roads by local coordinates and chunk.</div></div>{onMinimize && <button onClick={onMinimize} aria-label="Minimize World Object Coordinates" style={{background:'#263b31',color:'white',border:'1px solid #6d8a79',borderRadius:8,padding:'8px 11px'}}>—</button>}<button onClick={onClose} style={{background:'#263b31',color:'white',border:'1px solid #6d8a79',borderRadius:8,padding:'8px 11px'}}>✕</button></header>
    <div style={{padding:10,display:'grid',gap:10,overflow:'auto',minHeight:0}}>
      <input aria-label="Search placed world objects" placeholder="Search by ID, type or chunk…" value={search} onChange={e=>setSearch(e.target.value)} style={{background:'#202d28',color:'white',border:'1px solid #53685c',borderRadius:6,padding:9}} />
      <div style={{color:'#c2d0c6'}}>{filtered.length} of {objects.length} placed world objects</div>
      <div style={{display:'grid',gap:5,maxHeight:'32vh',overflow:'auto'}}>{filtered.map(o=><button key={o.id} onClick={()=>select(o)} style={{textAlign:'left',background:o.id===selectedId?'#54302d':'#202d28',color:'white',border:o.id===selectedId?'2px solid #ff5656':'1px solid #3d5548',borderRadius:6,padding:9}}><strong>{o.kind}</strong> · {o.id}<div style={{color:'#c2d0c6',marginTop:3}}>X {o.x} · Y {o.y} · chunk {o.chunk}</div></button>)}</div>
      {selected && <div style={{border:'1px solid #a44',borderRadius:8,padding:10,display:'grid',gap:8}}><strong>Selected: {selected.kind}</strong><label>Local X<input type="number" step="0.1" value={xText} onChange={e=>setXText(e.target.value)} style={{display:'block',boxSizing:'border-box',width:'100%',background:'#202d28',color:'white',border:'1px solid #53685c',borderRadius:5,padding:8}} /></label><label>Local Y<input type="number" step="0.1" value={yText} onChange={e=>setYText(e.target.value)} style={{display:'block',boxSizing:'border-box',width:'100%',background:'#202d28',color:'white',border:'1px solid #53685c',borderRadius:5,padding:8}} /></label><label>Chunk X,Y<input value={chunkText} onChange={e=>setChunkText(e.target.value)} placeholder="4,7" style={{display:'block',boxSizing:'border-box',width:'100%',background:'#202d28',color:'white',border:'1px solid #53685c',borderRadius:5,padding:8}} /></label><button onClick={apply} style={{background:'#286341',color:'white',border:'1px solid #7caf8b',borderRadius:7,padding:11,fontWeight:700}}>OK · Move object</button><small style={{color:'#c2d0c6'}}>Coordinates are editor-local values for the chosen chunk. Moving changes the saved placement, not the object type.</small></div>}
    </div>
  </section>;
}
