import { useMemo, useState } from 'react';
import type { MapPaints, MapPaintTile } from '../mapBuilder';

export type ChunkMapPoint = { x: number; y: number };
export type ChunkMapInfo = {
  terrain: string;
  biome: string;
  road?: string;
  landmark?: string | null;
};
type Props = {
  selectedChunk: ChunkMapPoint;
  onSelectChunk: (point: ChunkMapPoint) => void;
  getChunkInfo: (x: number, y: number) => ChunkMapInfo;
  mapPaints: MapPaints;
  onClose: () => void;
};

const BIOME_COLORS: Record<string, string> = {
  ocean: '#315b83', shore: '#b8a66a', meadow: '#6f9b56', forest: '#3f7048',
  desert: '#c6a15d', tundra: '#a8b7b5', rock: '#777d82',
};
const PAINT_COLORS: Record<string, string> = {
  grass: '#6f9b56', dirt: '#936c49', water: '#315bba', sand: '#d0b36e',
  forest: '#315c3a', path: '#b99b70',
};
function paintColor(tile: MapPaintTile): string {
  if (tile.startsWith('color:')) return /^#[0-9a-f]{6}$/i.test(tile.slice(6)) ? tile.slice(6) : '#888888';
  return PAINT_COLORS[tile] ?? '#888888';
}
const keyOf = ({ x, y }: ChunkMapPoint) => x + ',' + y;

/** Mobile-first chunk picker. The overview is the generated world map; the detail
 * grid shows the selected chunk's saved paint edits over its generated biome. */
export default function ChunkZoneSelector({ selectedChunk, onSelectChunk, getChunkInfo, mapPaints, onClose }: Props) {
  const [zonesVisible, setZonesVisible] = useState(true);
  const [region, setRegion] = useState<'main' | 'second'>('main');
  const [searchX, setSearchX] = useState(String(selectedChunk.x));
  const [searchY, setSearchY] = useState(String(selectedChunk.y));
  const minX = region === 'main' ? -10 : 117, maxX = region === 'main' ? 20 : 196, minY = region === 'main' ? -8 : -28, maxY = region === 'main' ? 22 : 51;
  const columns = maxX - minX + 1, rows = maxY - minY + 1;
  const points = useMemo(() => {
    const out: Array<{ x: number; y: number; info: ChunkMapInfo }> = [];
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) out.push({ x, y, info: getChunkInfo(x, y) });
    return out;
  }, [getChunkInfo, minX, maxX, minY, maxY]);
  const selectedInfo = getChunkInfo(selectedChunk.x, selectedChunk.y);
  const paints = mapPaints[keyOf(selectedChunk)] ?? [];
  const paintByTile = new Map(paints.map(p => [p.tx + ',' + p.ty, p.tile]));
  const jumpToCoordinates = () => {
    const x = Number(searchX), y = Number(searchY);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isInteger(x) && Number.isInteger(y)) { setRegion(x >= 117 && x <= 196 && y >= -28 && y <= 51 ? 'second' : 'main'); onSelectChunk({ x, y }); }
  };
  return (
    <section role="dialog" aria-label="Chunk zone selector" style={{ position: 'fixed', inset: 'max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom))', zIndex: 22000, background: '#111b19', color: '#f3f6ef', border: '1px solid #5a7567', borderRadius: 12, boxShadow: '0 12px 40px #000c', display: 'flex', flexDirection: 'column', overflow: 'hidden', font: '12px system-ui' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #35483e' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 15 }}>Chunk Zone Selector</strong>
          <div style={{ color: '#b8c8bd', marginTop: 3 }}>Choose a chunk to inspect its map and saved tile paints.</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close chunk selector" style={{ background: '#263b31', color: 'white', border: '1px solid #6d8a79', borderRadius: 8, padding: '8px 11px', fontWeight: 700 }}>Close</button>
      </header>
      <div style={{ padding: 10, overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', gap: 5, alignItems: 'center', minHeight: 34 }}>
            <input type="checkbox" checked={zonesVisible} onChange={e => setZonesVisible(e.target.checked)} />
            Show chunk zones
          </label>
          <span style={{ color: '#c9d7ce' }}>Red lines = chunk boundaries · selected chunk is labelled</span>
          <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>Map region <select value={region} onChange={e => setRegion(e.target.value as 'main' | 'second')} style={{ background: '#202d28', color: 'white', border: '1px solid #53685c', borderRadius: 5, padding: 6 }}><option value="main">Main world</option><option value="second">Second continent</option></select></label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
            <label htmlFor="chunk-x">X</label><input id="chunk-x" inputMode="numeric" value={searchX} onChange={e => setSearchX(e.target.value)} style={{ width: 54, background: '#202d28', color: 'white', border: '1px solid #53685c', borderRadius: 5, padding: 6 }} />
            <label htmlFor="chunk-y">Y</label><input id="chunk-y" inputMode="numeric" value={searchY} onChange={e => setSearchY(e.target.value)} style={{ width: 54, background: '#202d28', color: 'white', border: '1px solid #53685c', borderRadius: 5, padding: 6 }} />
            <button type="button" onClick={jumpToCoordinates} style={{ background: '#31523e', color: 'white', border: '1px solid #769b82', borderRadius: 6, padding: '7px 9px' }}>Go</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 6 }}>
          <strong>World chunk map · select a square</strong>
          <div style={{ width: '100%', maxWidth: 650, margin: '0 auto', aspectRatio: columns + ' / ' + rows, display: 'grid', gridTemplateColumns: 'repeat(' + columns + ',minmax(0,1fr))', gridTemplateRows: 'repeat(' + rows + ',minmax(0,1fr))', border: '1px solid #82968a', background: '#17251f', gap: 0 }}>
            {points.map(({ x, y, info }) => {
              const selected = x === selectedChunk.x && y === selectedChunk.y;
              return <button key={x + ',' + y} type="button" title={'Chunk ' + x + ',' + y + ' · ' + info.biome + (info.landmark ? ' · ' + info.landmark : '')} aria-label={'Select chunk ' + x + ',' + y} onClick={() => { onSelectChunk({ x, y }); setSearchX(String(x)); setSearchY(String(y)); }} style={{ position: 'relative', minWidth: 0, minHeight: 0, padding: 0, background: BIOME_COLORS[info.biome] ?? '#4b6954', border: selected ? '2px solid #ff3030' : zonesVisible ? '1px solid #e34444' : '1px solid #ffffff12', outline: selected ? '1px solid #ff3030' : 'none', zIndex: selected ? 2 : 1, overflow: 'visible' }}>{selected && <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 4, whiteSpace: 'nowrap', color: 'white', background: '#a71919', border: '1px solid #ffd0d0', borderRadius: 3, padding: '2px 4px', fontSize: 10, fontWeight: 900, pointerEvents: 'none' }}>{x},{y}</span>}</button>;
            })}
          </div>
          <div style={{ color: '#c2d0c6', textAlign: 'center' }}>Showing {region === 'main' ? 'main world' : 'second continent'} · chunks X {minX}–{maxX}, Y {minY}–{maxY}. Select a region or use coordinate jump for any chunk.</div>
        </div>
        <div style={{ border: '2px solid #ff3030', borderRadius: 8, padding: 8, background: '#19251f' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'start', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <strong style={{ color: '#ff6464', fontSize: 14 }}>CHUNK {selectedChunk.x},{selectedChunk.y}</strong>
              <div style={{ marginTop: 3 }}>{selectedInfo.biome} · terrain: {selectedInfo.terrain}{selectedInfo.road && selectedInfo.road !== 'none' ? ' · road: ' + selectedInfo.road : ''}</div>
              {selectedInfo.landmark && <div style={{ color: '#e8d69a' }}>Landmark: {selectedInfo.landmark}</div>}
            </div>
            <div style={{ color: '#c2d0c6' }}>{paints.length} saved painted tiles</div>
          </div>
          <div aria-label={'Map preview of chunk ' + selectedChunk.x + ',' + selectedChunk.y} style={{ width: '100%', maxWidth: 520, margin: '0 auto', aspectRatio: '1', display: 'grid', gridTemplateColumns: 'repeat(28,minmax(0,1fr))', gridTemplateRows: 'repeat(28,minmax(0,1fr))', border: '3px solid #ff3030', position: 'relative', background: BIOME_COLORS[selectedInfo.biome] ?? '#4b6954' }}>
            {Array.from({ length: 28 * 28 }, (_, i) => {
              const tx = i % 28, ty = Math.floor(i / 28), tile = paintByTile.get(tx + ',' + ty);
              return <div key={i} title={tile ? 'Painted ' + tile : 'Generated ' + selectedInfo.biome} style={{ background: tile ? paintColor(tile) : 'transparent', borderRight: '1px solid #ffffff12', borderBottom: '1px solid #ffffff12', minWidth: 0, minHeight: 0 }} />;
            })}
            <div style={{ position: 'absolute', top: 3, left: 3, background: '#9b1717ed', color: 'white', border: '1px solid #ffaaaa', borderRadius: 4, padding: '3px 6px', fontSize: 11, fontWeight: 900, pointerEvents: 'none' }}>CHUNK {selectedChunk.x},{selectedChunk.y}</div>
          </div>
          <div style={{ color: '#d2ded5', marginTop: 8 }}>This view uses the generated biome as its base and overlays exact saved tile paints. It is an editor map preview, not a full screenshot of every in-world object.</div>
        </div>
      </div>
    </section>
  );
}
