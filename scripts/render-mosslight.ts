// Render Mosslight Crossing engine candidates as SVGs for seed selection.
// Run: npx tsx scripts/render-mosslight.ts
// Output: ~/workspace/your_files/mosslight-candidate-<seed>.svg
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  generateTownLayout, validateTownLayout, toChunkSpace,
  type TownLayout, type TLRoad,
} from '../src/game/townLayout';
import {
  MOSSLIGHT_FIXED_RECTS_280, mosslightCottageRects280,
} from '../src/game/settlements';
import {
  fieldDoorPosition, isNewStyleDoorBuilding, newHouseDoorPosition,
} from '../src/game/doorGeometry';

const OUT = join(process.env.HOME ?? '/tmp', 'workspace/your_files');

const PINNED_NAMES = [
  'tutorial', 'guild', 'chapel', 'tavern',
  'cottage-1', 'cottage-2', 'cottage-3', 'cottage-4', 'cottage-5', 'cottage-6',
  'town-n1', 'town-n2', 'town-s1', 'town-s2',
  'town-e1', 'town-e2', 'town-w1', 'town-w2',
];

function mosslightConfig(seed: number) {
  const rects = [
    ...MOSSLIGHT_FIXED_RECTS_280.slice(0, 4),
    ...mosslightCottageRects280(),
    ...MOSSLIGHT_FIXED_RECTS_280.slice(4),
  ];
  const pinnedLots = rects.map((r: any, i: number) => ({
    id: PINNED_NAMES[i],
    footprint: {
      left: r.left - 140, top: r.top - 140,
      right: r.right - 140, bottom: r.bottom - 140,
    },
    facing: 'south' as const,
    district: 'residential' as const,
    kind: 'building' as const,
  }));
  return {
    size: 'town' as const,
    arterialCount: 3,
    radius: 150,
    plazaCenter: { x: 4, y: 4 },
    plazaRadius: 13,
    pinnedLots,
    maxFillerLots: 8,
    suburbs: false,
  };
}

const ROAD_STYLE: Record<TLRoad['kind'], { color: string; w: number }> = {
  arterial: { color: '#4a3d2c', w: 1.6 },
  street: { color: '#5d4e3a', w: 1.0 },
  lane: { color: '#8a2be2', w: 0.7 }, // lanes (door spurs) highlighted
};

function renderSVG(layout: TownLayout): string {
  const S = 4;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const eat = (x: number, y: number) => {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  };
  for (const p of layout.boundary) eat(p.x, p.y);
  for (const l of layout.lots) { eat(l.parcel.left, l.parcel.top); eat(l.parcel.right, l.parcel.bottom); }
  for (const r of layout.roads) for (const p of r.points) eat(p.x, p.y);
  const pad = 12;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const W = (maxX - minX) * S, H = (maxY - minY) * S;
  const X = (x: number) => (x - minX) * S;
  const Y = (y: number) => (y - minY) * S;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}">`);
  parts.push(`<rect width="100%" height="100%" fill="#8fbf6a"/>`);
  parts.push(`<text x="16" y="30" font-family="sans-serif" font-size="22" font-weight="bold" fill="#2c3a22">Mosslight candidate seed ${layout.seed}</text>`);
  parts.push(`<text x="16" y="52" font-family="sans-serif" font-size="13" fill="#2c3a22">${layout.roads.length} roads · ${layout.lots.length} lots · ${layout.props.length} props</text>`);
  parts.push(`<text x="16" y="68" font-family="sans-serif" font-size="11" fill="#5a3a22">gold=pinned building · brown=filler · purple=door spur · green dot=door</text>`);

  // boundary
  const bAttr = layout.boundary.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ') + ' Z';
  parts.push(`<path d="${bAttr}" fill="none" stroke="#3a3226" stroke-width="2.5" stroke-dasharray="10,6"/>`);

  // roads (lanes, then streets, then arterials)
  const order = { lane: 0, street: 1, arterial: 2 } as const;
  for (const r of [...layout.roads].sort((a, b) => order[a.kind] - order[b.kind])) {
    const st = ROAD_STYLE[r.kind];
    const dAttr = r.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    parts.push(`<path d="${dAttr}" fill="none" stroke="${st.color}" stroke-width="${(r.width * S * st.w).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // lots
  for (const l of layout.lots) {
    const f = l.footprint;
    if (l.kind === 'plaza') {
      parts.push(`<circle cx="${X((f.left + f.right) / 2).toFixed(1)}" cy="${Y((f.top + f.bottom) / 2).toFixed(1)}" r="${(((f.right - f.left) / 2) * S).toFixed(1)}" fill="#c9bfa8" stroke="#8a7a5a" stroke-width="2"/>`);
      continue;
    }
    const fill = l.pinned ? '#d4a017' : '#8a5a3b';
    parts.push(`<rect x="${X(f.left).toFixed(1)}" y="${Y(f.top).toFixed(1)}" width="${((f.right - f.left) * S).toFixed(1)}" height="${((f.bottom - f.top) * S).toFixed(1)}" fill="${fill}" stroke="#4a3524" stroke-width="1.5"/>`);
    if (l.pinned) {
      const door = isNewStyleDoorBuilding(l.id) ? newHouseDoorPosition(f) : fieldDoorPosition(f);
      parts.push(`<circle cx="${X(door.x).toFixed(1)}" cy="${Y(door.y).toFixed(1)}" r="3" fill="#22cc44" stroke="#114411" stroke-width="1"/>`);
      parts.push(`<text x="${X((f.left + f.right) / 2).toFixed(1)}" y="${Y(f.top).toFixed(1) - 4}" font-family="sans-serif" font-size="10" fill="#3a2a10" text-anchor="middle">${l.id}</text>`);
    }
  }

  // props
  for (const p of layout.props) {
    const c = p.kind === 'fountain' ? '#4a9ad4' : p.kind === 'stall' ? '#c46a4a' : p.kind === 'lamp' ? '#ffdd44' : '#7a5a3a';
    parts.push(`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.kind === 'fountain' ? 5 : 2.5}" fill="${c}" stroke="#333" stroke-width="0.8"/>`);
  }

  parts.push('</svg>');
  return parts.join('\n');
}

const SEEDS = [4242, 1234, 555, 31415, 271828, 161803, 98765, 43210];
mkdirSync(OUT, { recursive: true });
for (const seed of SEEDS) {
  const layout = generateTownLayout(seed, mosslightConfig(seed));
  const errs = validateTownLayout(layout);
  // worst door-endpoint distance
  let worst = 0;
  for (const l of layout.lots) {
    if (!l.pinned || l.kind !== 'building') continue;
    const door = isNewStyleDoorBuilding(l.id) ? newHouseDoorPosition(l.footprint) : fieldDoorPosition(l.footprint);
    let best = Infinity;
    for (const r of layout.roads) {
      for (const e of [r.points[0], r.points[r.points.length - 1]]) {
        const d = Math.hypot(e.x - door.x, e.y - door.y);
        if (d < best) best = d;
      }
    }
    if (best > worst) worst = best;
  }
  const path = join(OUT, `mosslight-candidate-${seed}.svg`);
  writeFileSync(path, renderSVG(toChunkSpace(layout, 4, 7)));
  console.log(`seed ${seed}: ${layout.roads.length} roads, ${layout.lots.length} lots, errors: ${errs.length}, worst door: ${worst.toFixed(2)}`);
  for (const e of errs) console.log(`   - ${e}`);
}
