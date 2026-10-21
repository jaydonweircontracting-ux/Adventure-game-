// BUILD 944 browser verification (local dist, phone viewport, testmode).
// Arrow keys + on-screen arrows rotate (getCameraRotation hook), repeat
// keydowns do not spin, the canvas image actually turns, tap-to-move still
// reaches the tapped world point at k=1, and WASD / ArrowUp / D-pad still
// move after the Left/Right rebind.
const { chromium } = require('/home/hatch/workspace/adventure-game/node_modules/playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoToScreen = (tx, ty) => ({ x: (tx - ty) * 32, y: (tx + ty) * 16 });
const rotK = (sx, sy, k) => {
  if (k === 0) return { x: sx, y: sy };
  if (k === 1) return { x: -2 * sy, y: sx / 2 };
  if (k === 2) return { x: -sx, y: -sy };
  return { x: 2 * sy, y: -sx / 2 };
};
const unrotK = (sx, sy, k) => rotK(sx, sy, (4 - k) % 4);
const screenToTile = (sx, sy) => ({ tx: sx / 64 + sy / 32, ty: sy / 32 - sx / 64 });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => { try { localStorage.setItem('ag-show-dpad-v2', '1'); } catch {} });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  let errMark = 0;
  const mark = (label) => {
    const fresh = errors.slice(errMark);
    errMark = errors.length;
    console.log(`errors since ${label}:`, fresh.length, JSON.stringify(fresh.slice(0, 3)));
  };
  const clickText = async (re) => {
    const loc = page.locator('button', { hasText: re }).first();
    if (await loc.count()) { await loc.click(); return true; }
    return false;
  };
  const gt = () => page.evaluate(() => {
    const h = window.__gameTest;
    if (!h) return null;
    return {
      build: h.getBuild?.(), pos: h.getPlayerPos?.(), chunk: h.getChunk?.(),
      interior: h.isInInterior?.(), rot: h.getCameraRotation?.(), zm: h.getIsoZoom?.(),
    };
  });
  const waitFor = async (fn, label, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const v = await fn();
      if (v) return v;
      await sleep(500);
    }
    throw new Error('timeout waiting for ' + label);
  };
  const rot = async () => (await gt()).rot;

  await page.goto('http://localhost:8901/?testmode=1', { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  await clickText(/new game/i);
  await sleep(2000);
  await clickText(/begin adventure/i);
  await sleep(9000);
  let st = await waitFor(async () => {
    const s = await gt();
    return s && s.pos ? s : null;
  }, 'player position');
  console.log('BUILD:', st.build, 'pos:', JSON.stringify(st.pos), 'chunk:', JSON.stringify(st.chunk), 'interior:', st.interior, 'rot:', st.rot, 'zm:', st.zm);
  if (st.interior) {
    const ok = await clickText(/Exit/);
    console.log('clicked interior Exit:', ok);
    await sleep(3000);
    st = await gt();
    console.log('after exit: interior:', st.interior, 'pos:', JSON.stringify(st.pos), 'rot:', st.rot);
  }
  await sleep(2000); // camera settles on the player
  const fps = await page.evaluate(() => new Promise((res) => {
    let frames = 0; const t0 = performance.now();
    const step = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(step); else res(Math.round(frames / 3)); };
    requestAnimationFrame(step);
  }));
  console.log('FPS town:', fps);

  // ---- rotation via keys ----
  console.log('rot start:', await rot());
  await page.keyboard.press('ArrowRight'); await sleep(400);
  console.log('after ArrowRight:', await rot(), '(expect 1)');
  await page.keyboard.press('ArrowRight'); await sleep(400);
  console.log('after ArrowRight x2:', await rot(), '(expect 2)');
  await page.keyboard.press('ArrowLeft'); await sleep(400);
  console.log('after ArrowLeft:', await rot(), '(expect 1)');
  await page.keyboard.press('ArrowLeft'); await sleep(400);
  console.log('after ArrowLeft x2:', await rot(), '(expect 0)');
  await page.keyboard.press('ArrowLeft'); await sleep(400);
  console.log('after ArrowLeft wrap:', await rot(), '(expect 3)');
  await page.keyboard.press('ArrowRight'); await sleep(400);
  console.log('after ArrowRight back:', await rot(), '(expect 0)');
  mark('keys');

  // ---- repeat guard: synthetic repeat keydown must NOT rotate ----
  // NOTE: dispatch on document.body, not window: the BUILD 667 text-input
  // guard reads event.target.tagName, and a window-targeted synthetic event
  // throws there (harness artifact, not a game bug — real key events always
  // target an element). Body-targeted dispatch reaches the real handler.
  const beforeRepeat = await rot();
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', repeat: true, bubbles: true })));
  await sleep(300);
  console.log('after synthetic repeat ArrowRight:', await rot(), `(expect ${beforeRepeat}, unchanged)`);

  // ---- rotation via on-screen buttons (real taps) ----
  const btnR = page.locator('[data-testid="button-rotate-camera-right"]');
  const btnL = page.locator('[data-testid="button-rotate-camera-left"]');
  console.log('rotate buttons visible:', await btnR.count(), await btnL.count(),
    'boxR:', JSON.stringify(await btnR.boundingBox().catch(() => null)));
  await btnR.click(); await sleep(400);
  console.log('after tapping right button:', await rot(), '(expect 1)');
  await btnL.click(); await sleep(400);
  console.log('after tapping left button:', await rot(), '(expect 0)');
  mark('buttons');

  // ---- canvas pixels actually turn (k=0 vs k=1) ----
  // Pick the VISIBLE canvas (largest on-screen rect): hidden/offscreen
  // canvases have a 0 rect and never change, which fooled the first run.
  const visibleCanvas = () => page.evaluate(() => {
    const list = [...document.querySelectorAll('canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      return { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, backing: { w: c.width, h: c.height } };
    });
    return list;
  });
  const pix = () => page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      return { el: c, area: r.width * r.height };
    }).filter((c) => c.area > 0);
    cs.sort((a, b) => b.area - a.area);
    const c = cs[0].el;
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const out = [];
    const step = 4;
    for (let y = 0; y < c.height; y += step) {
      for (let x = 0; x < c.width; x += step) {
        const i = (y * c.width + x) * 4;
        out.push(d[i], d[i + 1], d[i + 2]);
      }
    }
    return out;
  });
  const diffFrac = (a, b) => {
    let diff = 0;
    for (let i = 0; i < a.length; i += 3) {
      if (Math.abs(a[i] - b[i]) > 12 || Math.abs(a[i + 1] - b[i + 1]) > 12 || Math.abs(a[i + 2] - b[i + 2]) > 12) diff++;
    }
    return diff / (a.length / 3);
  };
  const p0a = await pix();
  await sleep(1000);
  const p0b = await pix();
  const noise = diffFrac(p0a, p0b);
  console.log('pixel noise k=0 vs k=0 (1s apart):', noise.toFixed(3));
  await btnR.click(); await sleep(800);
  console.log('rot now:', await rot(), '(expect 1)');
  const p1 = await pix();
  const turned = diffFrac(p0a, p1);
  console.log('pixel diff k=0 vs k=1:', turned.toFixed(3), '(expect >> noise, > 0.25)');
  mark('pixels');

  // ---- tap-to-move at k=1 still reaches the tapped world point ----
  const P0 = (await gt()).pos;
  const zm = (await gt()).zm;
  console.log('all canvases:', JSON.stringify(await visibleCanvas()));
  const box = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      return { el: c, area: r.width * r.height };
    }).filter((c) => c.area > 0);
    cs.sort((a, b) => b.area - a.area);
    const r = cs[0].el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  console.log('tap test: P0:', JSON.stringify(P0), 'zm:', zm, 'canvas:', JSON.stringify(box));
  const anchor = rotK(isoToScreen(P0.x, P0.y).x, isoToScreen(P0.x, P0.y).y, 1);
  let tapOk = false;
  for (const [dx, dy] of [[200, 0], [-200, 0], [0, 200], [0, -200]]) {
    const rs = { x: anchor.x + dx / zm, y: anchor.y + dy / zm };
    const u = unrotK(rs.x, rs.y, 1);
    const t = screenToTile(u.x, u.y);
    const before = (await gt()).pos;
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await sleep(900);
    const after = (await gt()).pos;
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    const dot = (after.x - before.x) * (t.tx - before.x) + (after.y - before.y) * (t.ty - before.y);
    console.log(`tap offset (${dx},${dy}) -> world (${t.tx.toFixed(1)},${t.ty.toFixed(1)}): moved ${moved.toFixed(2)}, dot ${dot.toFixed(2)}`);
    if (moved > 0.5 && dot > 0) { tapOk = true; break; }
  }
  console.log('TAP-TO-MOVE at k=1:', tapOk ? 'PASS' : 'FAIL');
  mark('tap');

  // ---- WASD / ArrowUp / D-pad still move after the rebind ----
  const moveCheck = async (label, fn) => {
    const b = (await gt()).pos;
    await fn();
    const a = (await gt()).pos;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    console.log(`${label}: moved ${d.toFixed(2)} (from ${JSON.stringify(b)} to ${JSON.stringify(a)})`);
    return d > 0.5;
  };
  const wasdOk = await moveCheck('KeyW hold', async () => {
    await page.keyboard.down('KeyW'); await sleep(800); await page.keyboard.up('KeyW'); await sleep(200);
  });
  const upOk = await moveCheck('ArrowUp hold', async () => {
    await page.keyboard.down('ArrowUp'); await sleep(800); await page.keyboard.up('ArrowUp'); await sleep(200);
  });
  let dpadOk = false;
  const dpadUp = page.locator('[data-dir="up"]').first();
  if (await dpadUp.count()) {
    const bb = await dpadUp.boundingBox().catch(() => null);
    console.log('dpad up box:', JSON.stringify(bb));
    if (bb) {
      dpadOk = await moveCheck('D-pad up hold', async () => {
        await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await page.mouse.down(); await sleep(800); await page.mouse.up(); await sleep(200);
      });
    }
  } else {
    console.log('D-pad up button not found (localStorage toggle may not have applied)');
  }
  console.log('WASD:', wasdOk ? 'PASS' : 'FAIL', '| ArrowUp:', upOk ? 'PASS' : 'FAIL', '| D-pad:', dpadOk ? 'PASS' : 'FAIL (or not rendered)');

  mark('end');
  const benign = errors.filter((e) => !/proxy-tunnel|ERR_TUNNEL|net::ERR/i.test(e));
  console.log('page errors (non-benign):', benign.length, JSON.stringify(benign.slice(0, 5)));
  console.log('page errors total (incl benign proxy noise):', errors.length);
  await browser.close();
  console.log('DONE944');
})().catch((e) => { console.error('PLAY944 FAILED:', e.message); process.exit(1); });
