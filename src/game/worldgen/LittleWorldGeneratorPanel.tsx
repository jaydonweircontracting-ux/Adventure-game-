import React, { useEffect, useMemo, useState } from 'react';
import {
  generateWorld, renderWorldPixels, raiseMountains, smoothTerrain,
  serializeWorld, deserializeWorld,
  type GeneratedWorld, type WorldOverlay,
} from './littleWorldGenerator';

const OVERLAYS: WorldOverlay[] = ['geographic', 'water', 'height', 'temperature', 'biome', 'plates'];

export default function LittleWorldGeneratorPanel() {
  const [width, setWidth] = useState(96);
  const [height, setHeight] = useState(64);
  const [seed, setSeed] = useState(20261019);
  const [overlay, setOverlay] = useState<WorldOverlay>('geographic');
  const [world, setWorld] = useState<GeneratedWorld | null>(null);
  const [message, setMessage] = useState('Choose settings and generate a world.');

  const pixels = useMemo(() => world ? renderWorldPixels(world, overlay) : null, [world, overlay]);

  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#little-world-generator-preview');
    if (!canvas || !world || !pixels) return;
    canvas.width = world.width;
    canvas.height = world.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = new ImageData(pixels, world.width, world.height);
    ctx.putImageData(image, 0, 0);
  }, [world, pixels]);

  const generate = () => {
    try {
      const next = generateWorld({ width, height, seed, erosionIterations: 2 });
      setWorld(next);
      setMessage('Generated ' + next.width + ' × ' + next.height + ' world from seed ' + (next.seed >>> 0) + '.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'World generation failed.');
    }
  };

  const downloadSave = () => {
    if (!world) return;
    const blob = new Blob([serializeWorld(world)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'world-' + world.seed + '.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('World save exported.');
  };

  const loadSave = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = deserializeWorld(await file.text());
      setWorld(next);
      setWidth(next.width);
      setHeight(next.height);
      setSeed(next.seed);
      setMessage('Loaded saved world ' + next.width + ' × ' + next.height + '.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load that world save.');
    } finally {
      event.target.value = '';
    }
  };

  const editMountains = () => {
    if (!world) return;
    setWorld(raiseMountains(world, Math.floor(world.width / 2), Math.floor(world.height / 2), Math.max(3, Math.floor(Math.min(world.width, world.height) / 8)), 0.24));
    setMessage('Raised a mountain range near the centre.');
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-auto rounded-xl border border-white/15 bg-slate-950/95 p-3 text-slate-100">
      <header>
        <h2 className="text-lg font-semibold">Little World Generator</h2>
        <p className="text-xs text-slate-400">Native seeded terrain, climate, rivers and biome preview</p>
      </header>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">Width
          <input className="rounded border border-white/20 bg-slate-900 px-2 py-2" type="number" min={8} max={512} value={width} onChange={e => setWidth(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-xs">Height
          <input className="rounded border border-white/20 bg-slate-900 px-2 py-2" type="number" min={8} max={512} value={height} onChange={e => setHeight(Number(e.target.value))} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs">Seed
          <input className="rounded border border-white/20 bg-slate-900 px-2 py-2" type="number" value={seed} onChange={e => setSeed(Number(e.target.value) || 0)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500" onClick={generate}>Generate world</button>
        <button className="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600" disabled={!world} onClick={() => world && setWorld(smoothTerrain(world, 1))}>Smooth terrain</button>
        <button className="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600" disabled={!world} onClick={editMountains}>Raise mountains</button>
        <button className="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600" disabled={!world} onClick={downloadSave}>Export save</button>
        <label className="cursor-pointer rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600">Load save
          <input className="hidden" type="file" accept="application/json,.json" onChange={loadSave} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs">Map overlay
        <select className="rounded border border-white/20 bg-slate-900 px-2 py-2" value={overlay} onChange={e => setOverlay(e.target.value as WorldOverlay)}>
          {OVERLAYS.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-white/10 bg-slate-900 p-2">
        {world ? (
          <canvas id="little-world-generator-preview" className="max-h-full max-w-full object-contain [image-rendering:pixelated]" style={{ width: '100%', height: 'auto', aspectRatio: world.width + ' / ' + world.height, imageRendering: 'pixelated' }} />
        ) : (
          <p className="text-sm text-slate-500">Your generated world preview appears here.</p>
        )}
      </div>
      <p aria-live="polite" className="text-xs text-slate-300">{message}</p>
      <p className="text-[11px] text-slate-500">This is a clean-room implementation based on documented behavior, not a decompilation of the original executable.</p>
    </section>
  );
}
