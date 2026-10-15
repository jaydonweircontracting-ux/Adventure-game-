/**
 * BUILD 700 ground truth: NPC shop transactions.
 * Boots the game, waits for NPCs to enter a market browse pause naturally,
 * then verifies purchases fire: getNpcPurchaseCount > 0, merchant gold > 0,
 * stock decremented — all through the shared ledger. Zero page errors.
 * Run: node tests/real-game/gt700-npc-shops.mjs (server on :8901 required)
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:8901/?testmode=1';
const SHOT = '/tmp/gt700-shots';
const pageErrors = [];
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => pageErrors.push(e.message.slice(0, 200)));

const T = (expr) => page.evaluate(new Function('return (' + expr + ')'));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
await page.click('[data-testid="button-new-game"]');
await page.waitForFunction(() => typeof window.__gameTest !== 'undefined', null, { timeout: 30000 });
await page.mouse.click(640, 400);
await page.waitForTimeout(2000);
check('boot: game loaded', true);
console.log('  build =', await T(`window.__gameTest.getBuild()`));

// Walk out of the tutorial interior.
for (let i = 0; i < 20; i++) {
  if (!(await T(`window.__gameTest.isInInterior()`))) break;
  const p = await T(`window.__gameTest.getInteriorPos()`);
  const key = Math.abs(p.x - 50) > 4 ? (p.x < 50 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowDown';
  await page.keyboard.down(key); await page.waitForTimeout(500); await page.keyboard.up(key);
}
check('exit: outside tutorial house', !(await T(`window.__gameTest.isInInterior()`)));

// Sanity: 40 townsfolk exist.
const folk0 = await T(`window.__gameTest.getTownsfolk()`);
check('npcs: 40 townsfolk live', Array.isArray(folk0) && folk0.length === 40, `got ${folk0?.length}`);

// Snapshot stall economy before any NPC purchase can happen.
const before = [];
for (let i = 0; i < 21; i++) before.push(await T(`window.__gameTest.getStallEconomy(${i})`));
const beforePurchases = await T(`window.__gameTest.getNpcPurchaseCount()`);
console.log('  purchases before:', beforePurchases);

// Wait (up to ~4 min real) for NPCs to enter a browse pause naturally.
// Game starts 6:00, clock advances 10 game-min per 3s real; browse pauses
// are 10:00-10:30 and 11:30-12:00 game time.
let browsingSeen = false;
let browsers = [];
for (let i = 0; i < 80; i++) {
  const folk = await T(`window.__gameTest.getTownsfolk()`);
  browsers = folk.filter(f => f.activity === 'Browsing the stalls');
  if (browsers.length > 0) { browsingSeen = true; break; }
  await page.waitForTimeout(3000);
}
check('market: NPCs browsing stalls', browsingSeen,
  browsingSeen ? `${browsers.length} browsers (e.g. ${browsers.slice(0, 3).map(b => b.name).join(', ')})` : 'none seen in 4 min');

// Once browsing, purchase decisions fire within a few 120ms ticks.
let count = 0;
for (let i = 0; i < 40; i++) {
  count = await T(`window.__gameTest.getNpcPurchaseCount()`);
  if (count > beforePurchases) break;
  await page.waitForTimeout(3000);
}
check('economy: NPC purchase decisions recorded', count > beforePurchases,
  `${beforePurchases} -> ${count}`);

// Merchant gold moved and/or stock decremented on at least one stall.
const after = [];
for (let i = 0; i < 21; i++) after.push(await T(`window.__gameTest.getStallEconomy(${i})`));
const goldMoved = after.filter((a, i) => a && a.merchantGold > (before[i]?.merchantGold ?? 0));
const stockMoved = after.filter((a, i) => {
  if (!a || !before[i]) return false;
  return Object.keys(a.stock).some(k => a.stock[k] < before[i].stock[k]);
});
check('economy: merchant gold received', goldMoved.length > 0,
  goldMoved.length ? `stalls ${goldMoved.map(g => g.index).join(',')} now hold ${goldMoved.map(g => g.merchantGold + 'g').join(', ')}` : 'no merchant gold yet');
check('economy: shared stock decremented by NPC buys', stockMoved.length > 0,
  stockMoved.length ? `stalls ${stockMoved.map(s => s.index).join(',')}` : 'no stock change yet');

await page.screenshot({ path: `${SHOT}/gt700-market.png` });
check('screenshot: market captured', true, `${SHOT}/gt700-market.png`);
check('errors: zero JS page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const failed = results.filter(r => !r.ok);
console.log(`\nGT700: ${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
