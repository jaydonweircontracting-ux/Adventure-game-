#!/usr/bin/env node
/**
 * Generate src/monster-sprites.gen.css from src/game/monsterSprites/*.json.
 *
 * One authoritative grid convention drives every monster sheet; this script
 * turns each JSON definition into the container size, background geometry,
 * facing rows, animation keyframes (idle/walk/attack/hurt/death), variant
 * filters, and shadow for that kind. Re-run after editing a definition:
 *   node scripts/gen-monster-sprite-css.mjs
 * The sim test fails if the checked-in CSS is out of sync.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const defDir = join(root, 'src', 'game', 'monsterSprites');

const kinds = readdirSync(defDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();

const animKey = { idle: 'idle', walk: 'walk', attack: 'attack', hurt: 'hurt', death: 'die' };

let css = `/* GENERATED — do not edit by hand. Source: src/game/monsterSprites/*.json\n   Regenerate: node scripts/gen-monster-sprite-css.mjs\n   Grid: 8 cols x 5 rows of 64px cells. Rows 0-3 = facings down/left/right/up\n   (cols 0-1 idle, 2-5 walk, 6-7 attack). Row 4 = hurt (cols 0-1) + death (cols 2-5).\n   Extends the existing .monster button renderer; no architecture changes. */\n`;

for (const kind of kinds) {
  const def = JSON.parse(readFileSync(join(defDir, kind + '.json'), 'utf8'));
  const S = def.displaySize;
  const W = S * def.cols;
  const H = S * def.rows;
  const px = (cells) => `${cells * S}px`;
  const rowY = (row) => `calc(var(--mrow, 0) * -${S}px)`;
  const [fDown, fLeft, fRight, fUp] = [def.facingRows.down, def.facingRows.left, def.facingRows.right, def.facingRows.up];
  const A = def.animations;
  const dur = (anim) => `${A[anim].frames * A[anim].frameMs}ms`;

  css += `\n/* ===== ${kind} ===== */\n`;
  css += `.monster-${kind} { width: ${S}px; height: ${S}px; filter: drop-shadow(${def.shadow.dx}px ${def.shadow.dy}px 0 rgba(43, 61, 41, ${def.shadow.alpha})); }\n`;
  css += `.monster-${kind} .monster-sprite {\n`;
  css += `  width: ${S}px; height: ${S}px;\n`;
  css += `  background-image: url('/mobs/${kind}_sheet.png');\n`;
  css += `  background-size: ${W}px ${H}px;\n`;
  css += `  background-repeat: no-repeat;\n`;
  css += `  image-rendering: pixelated;\n`;
  css += `  background-position: 0 ${rowY()};\n`;
  css += `  animation: ${kind}-idle ${dur('idle')} steps(${A.idle.frames}, end) infinite;\n`;
  css += `}\n`;
  css += `.monster-${kind} .monster-sprite::before, .monster-${kind} .monster-sprite::after { content: none; }\n`;
  css += `.monster-${kind}[data-facing='down'] .monster-sprite { --mrow: ${fDown}; }\n`;
  css += `.monster-${kind}[data-facing='left'] .monster-sprite { --mrow: ${fLeft}; }\n`;
  css += `.monster-${kind}[data-facing='right'] .monster-sprite { --mrow: ${fRight}; }\n`;
  css += `.monster-${kind}[data-facing='up'] .monster-sprite { --mrow: ${fUp}; }\n`;
  // State rules come after facing rules (equal specificity → later wins).
  css += `.monster-${kind}.is-moving .monster-sprite { animation: ${kind}-walk ${dur('walk')} steps(${A.walk.frames}, end) infinite; }\n`;
  css += `.monster-${kind}.is-attacking .monster-sprite { animation: ${kind}-attack ${dur('attack')} steps(${A.attack.frames}, end) infinite; }\n`;
  css += `.monster-${kind}.is-hit .monster-sprite { --mrow: ${A.hurt.row}; animation: ${kind}-hurt ${dur('hurt')} steps(${A.hurt.frames}, end) infinite; filter: brightness(1.8) saturate(0.5); }\n`;
  css += `.monster-${kind}.is-dead { cursor: default; }\n`;
  css += `.monster-${kind}.is-dead .monster-sprite { --mrow: ${A.death.row}; animation: ${kind}-die ${dur('death')} steps(${A.death.frames}, end) 1 forwards; }\n`;
  const kf = (name, anim) => {
    const from = -A[anim].startCol * S;
    const to = -(A[anim].startCol + A[anim].frames) * S;
    return `@keyframes ${kind}-${name} { from { background-position-x: ${from}px; } to { background-position-x: ${to}px; } }\n`;
  };
  css += kf('idle', 'idle') + kf('walk', 'walk') + kf('attack', 'attack') + kf('hurt', 'hurt') + kf('die', 'death');
  for (const [variant, vdef] of Object.entries(def.variants)) {
    if (variant === 'default') continue;
    const v = vdef;
    const decls = [v.filter ? `filter: ${v.filter};` : '', v.scale ? `transform: scale(${v.scale});` : '']
      .filter(Boolean).join(' ');
    if (decls) css += `.monster-${kind}[data-variant='${variant}'] .monster-sprite { ${decls} }\n`;
  }
}

css += `
/* Marker-mode debug label for sheet monsters (name/variant, state, frame, pos, chunk). */
.monster-debug {
  position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
  white-space: nowrap; font: 9px/1.4 monospace; background: rgba(0, 0, 0, .78);
  color: #ffe9a8; padding: 1px 5px; border-radius: 3px; pointer-events: none; z-index: 30;
}
`;

const out = join(root, 'src', 'monster-sprites.gen.css');
writeFileSync(out, css);
console.log('wrote', out, `(${kinds.length} kinds)`);
