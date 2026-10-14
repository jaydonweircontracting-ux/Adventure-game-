/**
 * GROUND TRUTH playtest — core loop: boot -> move -> combat -> loot ->
 * enter/exit -> save -> reload -> load -> verify.
 * Run: node tests/real-game/ground-truth.mjs (server on :8901 required)
 */
import { chromium } from 'playwright';
import { makeChecker } from './helpers.mjs';

const URL = 'http://localhost:8901/?testmode=1';
const SHOT = '/tmp/gt-shots';
const { results, check } = makeChecker();
const pageErrors = [];
const resFailures = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => pageErrors.push(e.message.slice(0, 200)));
page.on('requestfailed', r => resFailures.push(r.url().slice(0, 80)));

const T = (expr) => page.evaluate(new Function('return (' + expr + ')'));
const pos = () => T(`window.__gameTest.isInInterior() ? window.__gameTest.getInteriorPos() : window.__gameTest.getPlayerPos()`);

async function boot() {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2000);
}
async function exitInteriorWalk() {
  for (let i = 0; i < 20; i++) {
    if (!(await T(`window.__gameTest.isInInterior()`))) return true;
    const p = await T(`window.__gameTest.getInteriorPos()`);
    const key = Math.abs(p.x - 50) > 4 ? (p.x < 50 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowDown';
    await page.keyboard.down(key); await page.waitForTimeout(500); await page.keyboard.up(key);
  }
  return !(await T(`window.__gameTest.isInInterior()`));
}

await boot();
check('boot: zero JS page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
console.log('  build =', await T(`window.__gameTest.getBuild()`));
await page.screenshot({ path: `${SHOT}/gt1-interior.png` });
check('spawn: inside tutorial house', await T(`window.__gameTest.isInInterior()`) === true);

check('exit: walked out via doorway', await exitInteriorWalk());
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOT}/gt2-exterior.png` });

// walk EAST clear of the door trigger before direction test
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(3500); await page.keyboard.up('ArrowRight');
const clear = await pos();
console.log('  clear pos:', JSON.stringify(clear));

// 4-direction movement (now safely away from any doorway)
const moved = {};
for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
  const before = await pos();
  await page.keyboard.down(key); await page.waitForTimeout(900); await page.keyboard.up(key);
  const after = await pos();
  moved[key] = Math.hypot(after.x - before.x, after.y - before.y);
}
check('move: all 4 directions displace player', Object.values(moved).every(d => d > 0.5),
  Object.entries(moved).map(([k, d]) => `${k}:${d.toFixed(1)}`).join(' '));
await page.screenshot({ path: `${SHOT}/gt3-moved.png` });

// re-enter tutorial house while still near the door: align tightly to door x
// (trigger is narrow by design), then push up
const door = (await T(`window.__gameTest.getBuildings()`)).find(b => b.id === 'tutorial-house-door');
let reentered = false;
if (door) {
  for (let i = 0; i < 40 && !reentered; i++) {
    const p = await pos();
    if (await T(`window.__gameTest.isInInterior()`)) { reentered = true; break; }
    const dx = door.x - p.x;
    const key = Math.abs(dx) > 0.6 ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp';
    await page.keyboard.down(key); await page.waitForTimeout(350); await page.keyboard.up(key);
  }
}
check('enter: walked back into tutorial house', reentered);
await page.screenshot({ path: `${SHOT}/gt4-reentered.png` });
if (reentered) check('exit2: walked back out via doorway', await exitInteriorWalk());

// combat — continuous-hold chase (player 4 u/s outruns fleeing goat at 2 u/s;
// the old staccato down/up chase lost too much ground between key presses).
const goatId = await T(`window.__gameTest.spawnTestGoat()`);
check('combat: goat spawned', typeof goatId === 'number');
// helper: hold a movement key toward a target without releasing between polls
let heldKey = null;
const holdToward = async (tx, ty, arriveDist) => {
  for (let c = 0; c < 80; c++) {
    const p = await pos();
    const dx = tx - p.x, dy = ty - p.y;
    if (Math.hypot(dx, dy) < arriveDist) break;
    const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
    if (heldKey !== key) {
      if (heldKey) await page.keyboard.up(heldKey);
      await page.keyboard.down(key);
      heldKey = key;
    }
    await page.waitForTimeout(150);
  }
  if (heldKey) { await page.keyboard.up(heldKey); heldKey = null; }
};
let dead = false, swings = 0;
if (typeof goatId === 'number') {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/gt4-goat.png` });
  for (; swings < 30 && !dead; swings++) {
    const g = (await T(`window.__gameTest.getGoats()`)).find(x => String(x.id) === String(goatId));
    if (!g || g.hp <= 0) { dead = true; break; }
    await holdToward(g.x, g.y, 4.2);
    const g2 = (await T(`window.__gameTest.getGoats()`)).find(x => String(x.id) === String(goatId));
    if (!g2 || g2.hp <= 0) { dead = true; break; }
    const gp = await pos();
    const dx = g2.x - gp.x, dy = g2.y - gp.y;
    const faceKey = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
    await page.keyboard.down(faceKey); await page.waitForTimeout(120); await page.keyboard.up(faceKey);
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);
  }
}
check('combat: goat killed with swings', dead, `swings=${swings}`);
await page.waitForTimeout(1200);
const loot = await T(`window.__gameTest.getDroppedLoot()`);
check('combat: loot dropped', loot.length > 0, `drops=${loot.length}`);
await page.screenshot({ path: `${SHOT}/gt5-loot.png` });
if (loot.length > 0) {
  const lp = loot[0];
  await holdToward(lp.x, lp.y, 0.7);
  await page.waitForTimeout(1000); // let camera settle on the player
  // iso pickup: player is standing on the drop; tap screen center (camera
  // centers the player, drop is within the 48px hit-test radius)
  await page.mouse.click(640, 400);
  await page.waitForTimeout(800);
  const after = await T(`window.__gameTest.getDroppedLoot()`);
  check('combat: loot picked up (iso tap)', after.length < loot.length, `${loot.length}->${after.length}`);
}

// BUILD 697: market stall shop — tap a stall (live decor positions), buy, sell.
// Re-anchor to the market chunk first: the combat chase can wander across a
// chunk boundary, and stalls only exist in (4,7).
await T(`window.__gameTest.teleportToChunk(4, 7, 144, 130)`);
await page.waitForTimeout(1000);
const stalls = await T(`window.__gameTest.getStalls()`);
check('shop: stalls found from live decor', Array.isArray(stalls) && stalls.length > 0, `stalls=${stalls.length}`);
let shopOpened = false, shopInfo = null;
if (stalls.length > 0) {
  const s = stalls[0];
  // stand on an unblocked spot near the stall so the camera frames it
  const cands = [[s.x, s.y + 7], [s.x, s.y - 7], [s.x + 7, s.y], [s.x - 7, s.y], [144, 130]];
  for (const [cx, cy] of cands) {
    if (await T(`window.__gameTest.isBlocked(${cx.toFixed(1)}, ${cy.toFixed(1)})`) === false) {
      await T(`window.__gameTest.teleportPlayer(${cx.toFixed(1)}, ${cy.toFixed(1)})`);
      break;
    }
  }
  await page.waitForTimeout(2500); // camera settle
  for (let attempt = 0; attempt < 4 && !shopOpened; attempt++) {
    // tap math mirrors IsoFieldView.onTap: iso feet pos -> camera-relative screen
    const pt = await page.evaluate(([sx, sy]) => {
      const t = window.__gameTest;
      const p = t.getPlayerPos(); const zm = t.getIsoZoom();
      const r = document.querySelector('[data-testid="iso-field-canvas"]').getBoundingClientRect();
      const w = { x: (sx - sy) * 32, y: (sx + sy) * 16 };
      const cam = { x: (p.x - p.y) * 32, y: (p.x + p.y) * 16 - 24 };
      return {
        x: r.left + (w.x - cam.x) * zm + r.width / 2,
        y: r.top + (w.y - cam.y) * zm + r.height / 2 - 24,
      };
    }, [s.x, s.y]);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(700);
    shopInfo = await T(`window.__gameTest.getShopState()`);
    if (shopInfo) { shopOpened = true; break; }
    // an NPC browsing the stall may have intercepted the tap — dismiss and retry
    const dlg = await page.$('[data-testid="townsfolk-dialogue"]');
    if (dlg) {
      await page.click('[data-testid="button-close-townsfolk-dialogue"]');
      await page.waitForTimeout(400);
    }
  }
}
check('shop: tapping a stall opens the shop panel', shopOpened, shopInfo ? shopInfo.shopName : 'no panel');
if (shopOpened) {
  await page.screenshot({ path: `${SHOT}/gt7-shop-open.png` });
  check('shop: minimap hidden while shop open', await page.$('[data-testid="minimap-canvas"]') === null);
  // BUY: grant exact gold, click the first good's Buy button
  const good = shopInfo.goods[0];
  await T(`window.__gameTest.giveTestItem('coins', ${good.price})`);
  await page.waitForTimeout(400);
  const goldBefore = await T(`window.__gameTest.getGold()`);
  await page.click(`[data-testid="button-shop-buy-${good.key}"]`);
  await page.waitForTimeout(600);
  const goldAfter = await T(`window.__gameTest.getGold()`);
  check('shop: buy deducts gold', goldAfter === goldBefore - good.price, `${goldBefore}->${goldAfter} (price ${good.price})`);
  const afterBuy = await T(`window.__gameTest.getShopState()`);
  const bought = afterBuy.goods.find(g => g.key === good.key);
  check('shop: buy reduces stall stock', bought.stock === good.stock - 1, `stock ${good.stock}->${bought.stock}`);
  await page.screenshot({ path: `${SHOT}/gt7-shop-bought.png` });
  // SELL: grant 2 bone, sell one
  await T(`window.__gameTest.giveTestItem('bone', 2)`);
  await page.waitForTimeout(600);
  check('shop: sell button appears for held bone', await page.$(`[data-testid="button-shop-sell-bone"]`) !== null);
  const g2 = await T(`window.__gameTest.getGold()`);
  await page.click(`[data-testid="button-shop-sell-bone"]`);
  await page.waitForTimeout(600);
  const g3 = await T(`window.__gameTest.getGold()`);
  check('shop: sell awards gold', g3 === g2 + 2, `${g2}->${g3} (+2)`);
  await page.screenshot({ path: `${SHOT}/gt7-shop-sold.png` });
  await page.click('[data-testid="button-close-shop"]');
  await page.waitForTimeout(400);
  check('shop: panel closes', await T(`window.__gameTest.getShopState()`) === null);
}

// save via inventory -> options -> save to browser (on the field, before re-entry)
const savePos = await pos();
await page.click('[data-testid="button-open-inventory"]');
await page.waitForTimeout(600);
await page.click('[data-testid="button-open-options"]');
await page.waitForTimeout(600);
await page.click('[data-testid="button-save-browser"]');
await page.waitForTimeout(1000);
const hasSave = await page.evaluate(() => {
  try { const s = localStorage.getItem('adventure-game-save-v2'); return !!(s && s.length > 100); }
  catch { return false; }
});
check('save: browser save written', hasSave);
await page.screenshot({ path: `${SHOT}/gt6-saved.png` });

// reload + load (exits to main menu via fresh page load)
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('[data-testid="button-load-game-menu"]', { timeout: 15000 });
const loadLabel = await page.textContent('[data-testid="button-load-game-menu"]');
check('load: save offered on main menu', !/No Save Yet/.test(loadLabel || ''), (loadLabel || '').slice(0, 40));
await page.click('[data-testid="button-load-game-menu"]');
await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
await page.waitForTimeout(2000);
const loadedPos = await pos();
const dist = Math.hypot(loadedPos.x - savePos.x, loadedPos.y - savePos.y);
check('load: position restored', dist < 3, `drift=${dist.toFixed(1)}`);
await page.screenshot({ path: `${SHOT}/gt8-loaded.png` });

check('runtime: zero JS page errors total', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
console.log('  resource failures (offline env):', resFailures.length);
console.log(`\nGROUND TRUTH: ${results.passed} passed, ${results.failed} failed`);
await browser.close();
process.exit(results.failed > 0 ? 1 : 0);
