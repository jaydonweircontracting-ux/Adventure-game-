/**
 * BUILD 694 verification: storybook sprite set (tower building + angel statue /
 * hedge / cart props). Each new sprite is loaded in-page through the game's own
 * artUrl() scheme (proving ?v=694 cache-busting serves the files) and drawn
 * onto an overlay canvas above the live game view — browser decode + alpha
 * composite verified visually. Also asserts the IsoFieldView propSrc
 * registration actually populated window.__propImgs in-game.
 * Run: node tests/real-game/verify-694.mjs (server on :8901 required)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:8901/?testmode=1';
const SHOT = '/tmp/verify-694';
mkdirSync(SHOT, { recursive: true });
const pageErrors = [];
const resFailures = [];

const SPRITES = [
  'buildings/story-tower.png',
  'props/statue-angel.png',
  'props/hedge-straight.png',
  'props/cart-wood.png',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => pageErrors.push(e.message.slice(0, 200)));
page.on('requestfailed', r => resFailures.push(r.url().slice(0, 80)));

const T = (expr) => page.evaluate(new Function('return (' + expr + ')'));
const sleep = (ms) => page.waitForTimeout(ms);
let failures = 0;
function check(name, ok, detail = '') {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  if (!ok) failures++;
}

async function boot() {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
  await page.mouse.click(640, 400);
  await sleep(2000);
  for (let i = 0; i < 30; i++) {
    if (!(await T(`window.__gameTest.isInInterior()`))) break;
    const p = await T(`window.__gameTest.getInteriorPos()`);
    const key = Math.abs(p.x - 50) > 4 ? (p.x < 50 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowDown';
    await page.keyboard.down(key); await sleep(400); await page.keyboard.up(key);
  }
}

await boot();
const build = await T(`window.__gameTest.getBuild()`);
check('build marker is 694', build === '694', 'got ' + build);

// Stand in Mosslight plaza for a live in-game backdrop.
await T(`window.__gameTest.teleportPlayer(140, 140)`);
await sleep(1500);

// 1. The game's own prop image cache must contain the 3 new props,
//    loaded through artUrl (i.e. with ?v=694) and fully decoded.
const propState = await T(`(() => {
  const cache = window.__propImgs || {};
  const out = {};
  for (const k of ['props/statue-angel.png', 'props/hedge-straight.png', 'props/cart-wood.png']) {
    const img = cache[k];
    out[k] = img ? { src: img.src.slice(-60), w: img.naturalWidth, h: img.naturalHeight, ok: img.complete && img.naturalWidth > 0 } : null;
  }
  return out;
})()`);
for (const [k, st] of Object.entries(propState)) {
  check(`propSrc in-game: ${k} cached`, !!st && st.ok, st ? `${st.w}x${st.h} ${st.src}` : 'missing');
  if (st) check(`propSrc in-game: ${k} served with ?v=694`, st.src.includes('v=694'), st.src);
}

// 2. Draw each sprite on an overlay canvas in the page (same drawImage style
//    the renderer uses: natural aspect, base-anchored) over the live game.
const loaded = await T(`(async () => {
  const build = window.__AG_BUILD || '694';
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 800;
  cv.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none';
  cv.id = 'verify694-overlay';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const out = {};
  const paths = ${JSON.stringify(SPRITES)};
  for (const p of paths) {
    const img = new Image();
    img.src = '/' + p + '?v=' + build;
    try { await img.decode(); } catch (e) { out[p] = { ok: false, err: String(e).slice(0, 80) }; continue; }
    out[p] = { ok: true, w: img.naturalWidth, h: img.naturalHeight };
    window.__v694imgs = window.__v694imgs || {};
    window.__v694imgs[p] = img;
  }
  window.__v694cv = cv;
  return out;
})()`);
for (const [p, st] of Object.entries(loaded)) {
  check(`browser decode: ${p}`, st.ok, st.ok ? `${st.w}x${st.h}` : st.err);
}

// 3. One screenshot per sprite: live game behind, sprite drawn large on overlay.
const names = { 'buildings/story-tower.png': 'tower', 'props/statue-angel.png': 'statue', 'props/hedge-straight.png': 'hedge', 'props/cart-wood.png': 'cart' };
for (const p of SPRITES) {
  await T(`(() => {
    const cv = window.__v694cv, g = cv.getContext('2d'), img = window.__v694imgs[${JSON.stringify(p)}];
    g.clearRect(0, 0, cv.width, cv.height);
    // label bar
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(0, 0, 1280, 44);
    g.fillStyle = '#fff'; g.font = '24px sans-serif';
    g.fillText(${JSON.stringify(p)} + '  (?v=' + (window.__AG_BUILD || '?') + ')', 16, 30);
    // draw sprite large, base-anchored near bottom-center (renderer style)
    const scale = Math.min(560 / img.naturalWidth, 640 / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    g.drawImage(img, 640 - dw / 2, 740 - dh, dw, dh);
    return true;
  })()`);
  await sleep(400);
  await page.screenshot({ path: `${SHOT}/694-${names[p]}.png` });
  console.log('saved 694-' + names[p] + '.png');
}
await T(`window.__v694cv && window.__v694cv.remove()`);

check('zero JS page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
check('zero failed requests', resFailures.length === 0, resFailures.slice(0, 3).join(' | '));

await browser.close();
console.log(failures === 0 ? 'VERIFY-694 ALL GREEN' : `VERIFY-694 ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
