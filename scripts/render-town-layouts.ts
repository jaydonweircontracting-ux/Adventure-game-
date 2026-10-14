// Render sample town layouts as standalone SVGs (BUILD 688 proof).
// Run: npx tsx scripts/render-town-layouts.ts
// Output: ~/workspace/your_files/town-layout-seed-<seed>-<size>.svg
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  generateTownLayout, validateTownLayout, toChunkSpace,
  type TownLayout, type DistrictKind, type TLRoad,
} from '../src/game/townLayout';

const OUT = join(process.env.HOME ?? '/tmp', 'workspace/your_files');

const DISTRICT_FILL: Record<DistrictKind, string> = {
  residential: 'rgba(217, 194, 122, 0.28)',
  commercial: 'rgba(224, 138, 138, 0.30)',
  industrial: 'rgba(154, 154, 154, 0.32)',
  civic: 'rgba(138, 180, 224, 0.35)',
  park: 'rgba(111, 174, 111, 0.45)',
};
const ROAD_STYLE: Record<TLRoad['kind'], { color: string; w: number }> = {
  arterial: { color: '#4a3d2c', w: 1.6 },
  street: { color: '#5d4e3a', w: 1.0 },
  lane: { color: '#6e5f49', w: 0.6 },
};

function renderSVG(layout: TownLayout): string {
  const S = 4; // px per unit
  // bounds over boundary + lots + roads
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
  parts.push(`<text x="16" y="30" font-family="sans-serif" font-size="22" font-weight="bold" fill="#2c3a22">Town seed ${layout.seed} (${layout.config.size})</text>`);
  parts.push(`<text x="16" y="52" font-family="sans-serif" font-size="13" fill="#2c3a22">${layout.roads.length} roads · ${layout.lots.length} lots · ${layout.districts.length} districts</text>`);

  // district zones
  for (const d of layout.districts) {
    if (d.zone === 'circle') {
      parts.push(`<circle cx="${X(d.center.x).toFixed(1)}" cy="${Y(d.center.y).toFixed(1)}" r="${(d.radius * S).toFixed(1)}" fill="${DISTRICT_FILL[d.kind]}" stroke="none"/>`);
    } else if (d.zone === 'edge-sector') {
      const r = 100 * S;
      const a0 = ((d.sectorAngle! - d.sectorWidth!) * 180) / Math.PI;
      const a1 = ((d.sectorAngle! + d.sectorWidth!) * 180) / Math.PI;
      const cx = X(0), cy = Y(0);
      // SVG y-down: negate angles
      parts.push(`<path d="M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${(cx + r * Math.cos(-a0 * Math.PI / 180)).toFixed(1)} ${(cy + r * Math.sin(-a0 * Math.PI / 180)).toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(cx + r * Math.cos(-a1 * Math.PI / 180)).toFixed(1)} ${(cy + r * Math.sin(-a1 * Math.PI / 180)).toFixed(1)} Z" fill="${DISTRICT_FILL[d.kind]}"/>`);
    } else if (d.zone === 'arterial-corridor') {
      for (const r of layout.roads) {
        if (r.kind !== 'arterial') continue;
        const dAttr = r.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
        parts.push(`<path d="${dAttr}" fill="none" stroke="${DISTRICT_FILL[d.kind]}" stroke-width="${(d.corridorDist! * 2 * S).toFixed(1)}" stroke-linecap="round"/>`);
      }
    }
    parts.push(`<text x="${X(d.center.x).toFixed(1)}" y="${Y(d.center.y).toFixed(1)}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#3a4a2c" text-anchor="middle" opacity="0.75">${d.kind}</text>`);
  }

  // boundary
  const bAttr = layout.boundary.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ') + ' Z';
  parts.push(`<path d="${bAttr}" fill="none" stroke="#3a3226" stroke-width="2.5" stroke-dasharray="10,6"/>`);

  // roads (lanes, then streets, then arterials on top)
  const order = { lane: 0, street: 1, arterial: 2 } as const;
  for (const r of [...layout.roads].sort((a, b) => order[a.kind] - order[b.kind])) {
    const st = ROAD_STYLE[r.kind];
    const dAttr = r.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    parts.push(`<path d="${dAttr}" fill="none" stroke="${st.color}" stroke-width="${(r.width * S * st.w).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // lots: parcels faint, footprints solid
  for (const l of layout.lots) {
    const p = l.parcel, f = l.footprint;
    parts.push(`<rect x="${X(p.left).toFixed(1)}" y="${Y(p.top).toFixed(1)}" width="${((p.right - p.left) * S).toFixed(1)}" height="${((p.bottom - p.top) * S).toFixed(1)}" fill="none" stroke="#5a4a33" stroke-width="0.8" opacity="0.5"/>`);
    const fill = l.kind === 'farm' ? '#a0824a' : l.kind === 'plaza' ? '#c9bfa8' : '#8a5a3b';
    parts.push(`<rect x="${X(f.left).toFixed(1)}" y="${Y(f.top).toFixed(1)}" width="${((f.right - f.left) * S).toFixed(1)}" height="${((f.bottom - f.top) * S).toFixed(1)}" fill="${fill}" stroke="#4a3524" stroke-width="1"/>`);
    if (l.kind === 'plaza') {
      parts.push(`<circle cx="${X((f.left + f.right) / 2).toFixed(1)}" cy="${Y((f.top + f.bottom) / 2).toFixed(1)}" r="${(((f.right - f.left) / 4) * S).toFixed(1)}" fill="#7fa8c9" stroke="#4a6a8a" stroke-width="1.5"/>`);
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

const jobs: [number, 'hamlet' | 'village' | 'town'][] = [
  [4242, 'town'],
  [7777, 'village'],
  [909, 'hamlet'],
];
mkdirSync(OUT, { recursive: true });
for (const [seed, size] of jobs) {
  const layout = generateTownLayout(seed, { size });
  const errs = validateTownLayout(layout);
  const path = join(OUT, `town-layout-seed-${seed}-${size}.svg`);
  writeFileSync(path, renderSVG(layout));
  console.log(`${path}: ${layout.roads.length} roads, ${layout.lots.length} lots, validation errors: ${errs.length}`);
}
