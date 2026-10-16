// BUILD 702: RPG character preview/debug tool.
// Standalone view (accessed via ?charPreview=1) for inspecting the RPG
// sprite system: bases, directions, animations, equipment layering.

import { useEffect, useRef, useState } from 'react';
import {
  type RpgAnim, type RpgBase,
  RPG_BASES, RPG_ANIM_FRAMES, RPG_CAM_FOR_FACE,
  RPG_W, RPG_H,
  rpgSprite, rpgAnchorFor, preloadRpgBase, rpgCacheStats,
} from './rpgSprites';
import type { Face8 } from './isoSprites';

const ANIMS: RpgAnim[] = ['Idle', 'Walk', 'Run', 'Attack', 'Bow', 'Cast', 'Death'];
const FACES: Face8[] = ['up', 'upright', 'right', 'downright', 'down', 'downleft', 'left', 'upleft'];
const FACE_LABELS: Record<Face8, string> = {
  up: 'N', upright: 'NE', right: 'E', downright: 'SE',
  down: 'S', downleft: 'SW', left: 'W', upleft: 'NW',
};
const BACKGROUNDS = [
  { name: 'Dark', color: '#1a1a2e' },
  { name: 'Grass', color: '#4a7c3a' },
  { name: 'Sand', color: '#d4b896' },
  { name: 'Stone', color: '#888888' },
  { name: 'White', color: '#ffffff' },
];

export default function RpgPreview(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [base, setBase] = useState<RpgBase>('BaseHumanMale');
  const [anim, setAnim] = useState<RpgAnim>('Idle');
  const [face, setFace] = useState<Face8>('down');
  const [bg, setBg] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState(0);
  const [showAllDirs, setShowAllDirs] = useState(false);

  useEffect(() => { preloadRpgBase(base); }, [base]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let phase = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(100, now - last);
      last = now;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const g = canvas.getContext('2d');
      if (!g) return;

      const frames = RPG_ANIM_FRAMES[anim];
      if (playing) {
        phase = (phase + (dt / 1000) * 8 * speed) % frames;
      }
      const fi = playing ? Math.floor(phase) : frame;

      const W = canvas.width, H = canvas.height;
      g.fillStyle = BACKGROUNDS[bg].color;
      g.fillRect(0, 0, W, H);

      if (showAllDirs) {
        // 4x2 grid of all directions
        const cw = W / 4, ch = H / 2;
        FACES.forEach((f, i) => {
          const cx = (i % 4) * cw + cw / 2;
          const cy = Math.floor(i / 4) * ch + ch * 0.75;
          const im = rpgSprite(base, anim, f, fi);
          if (im) {
            const a = rpgAnchorFor(base, anim, f, fi);
            const scale = (ch * 0.7) / RPG_H;
            const dw = RPG_W * scale, dh = RPG_H * scale;
            g.drawImage(im, cx - a.cx * scale, cy - a.cb * scale, dw, dh);
          }
          g.fillStyle = '#fff';
          g.font = '12px sans-serif';
          g.textAlign = 'center';
          g.fillText(`${FACE_LABELS[f]} (CAM${RPG_CAM_FOR_FACE[f]})`, cx, Math.floor(i / 4) * ch + 20);
        });
      } else {
        // Single large character, feet anchored at center-bottom
        const cx = W / 2, cy = H * 0.8;
        const im = rpgSprite(base, anim, face, fi);
        if (im) {
          const a = rpgAnchorFor(base, anim, face, fi);
          const scale = (H * 0.6) / RPG_H;
          const dw = RPG_W * scale, dh = RPG_H * scale;
          g.drawImage(im, cx - a.cx * scale, cy - a.cb * scale, dw, dh);
        } else {
          g.fillStyle = '#ff0';
          g.font = '14px sans-serif';
          g.textAlign = 'center';
          g.fillText('Loading...', cx, cy - 50);
        }
        // Info overlay
        g.fillStyle = '#fff';
        g.font = '14px sans-serif';
        g.textAlign = 'left';
        g.fillText(`${base}`, 10, 25);
        g.fillText(`${anim} - ${FACE_LABELS[face]} (CAM${RPG_CAM_FOR_FACE[face]})`, 10, 45);
        g.fillText(`Frame ${fi + 1}/${frames}`, 10, 65);
        const stats = rpgCacheStats();
        g.fillText(`Cached: ${stats.cached}`, 10, 85);
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [base, anim, face, bg, playing, speed, showAllDirs, frame]);

  return (
    <div style={{ padding: 10, background: '#222', minHeight: '100vh', color: '#fff' }}>
      <h2>RPG Character Preview (BUILD 702)</h2>
      <div style={{ marginBottom: 10 }}>
        <label>Base: </label>
        <select value={base} onChange={(e) => setBase(e.target.value as RpgBase)}>
          {RPG_BASES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <span style={{ marginLeft: 20, color: '#f88' }}>No female base in pack</span>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label>Animation: </label>
        {ANIMS.map((a) => (
          <button key={a} onClick={() => setAnim(a)}
            style={{ margin: 2, background: anim === a ? '#4a4' : '#444', color: '#fff', border: 'none', padding: '5px 10px' }}>
            {a} ({RPG_ANIM_FRAMES[a]}f)
          </button>
        ))}
        <span style={{ marginLeft: 10, color: '#f88' }}>No pain anim in pack</span>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label>Direction: </label>
        {FACES.map((f) => (
          <button key={f} onClick={() => setFace(f)}
            style={{ margin: 2, background: face === f ? '#44a' : '#444', color: '#fff', border: 'none', padding: '5px 10px' }}>
            {FACE_LABELS[f]}
          </button>
        ))}
        <button onClick={() => setShowAllDirs(!showAllDirs)}
          style={{ margin: 2, background: showAllDirs ? '#a44' : '#444', color: '#fff', border: 'none', padding: '5px 10px' }}>
          {showAllDirs ? 'Single' : 'All 8'}
        </button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => setPlaying(!playing)}
          style={{ margin: 2, background: '#444', color: '#fff', border: 'none', padding: '5px 15px' }}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <label style={{ marginLeft: 10 }}>Speed: </label>
        <input type="range" min="0.1" max="3" step="0.1" value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))} />
        <span> {speed.toFixed(1)}x</span>
        <label style={{ marginLeft: 15 }}>BG: </label>
        {BACKGROUNDS.map((b, i) => (
          <button key={b.name} onClick={() => setBg(i)}
            style={{ margin: 2, background: bg === i ? '#4a4' : '#444', color: '#fff', border: 'none', padding: '5px 10px' }}>
            {b.name}
          </button>
        ))}
      </div>
      <canvas ref={canvasRef} width={380} height={500}
        style={{ border: '1px solid #555', maxWidth: '100%' }} />
      <div style={{ marginTop: 10, fontSize: 12, color: '#aaa' }}>
        <p>Frame scrub: {!playing && <input type="range" min={0} max={RPG_ANIM_FRAMES[anim] - 1}
          value={frame} onChange={(e) => setFrame(parseInt(e.target.value))} />}</p>
        <p>Manifest: 100 folders catalogued (7 bases, 93 equipment). Equipment not yet in public/.</p>
      </div>
    </div>
  );
}
