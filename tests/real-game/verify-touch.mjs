// Touch fix verification with hasTouch
import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const T = (expr) => page.evaluate(expr);

page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));

await page.goto('http://localhost:8901/?testmode=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.click('text=New Game');
await page.waitForTimeout(4000);

// Check canvases
const canvasInfo = await T(`Array.from(document.querySelectorAll('canvas')).map(c => ({
  touchAction: getComputedStyle(c).touchAction,
  width: c.width,
  height: c.height
}))`);
console.log('canvases:', JSON.stringify(canvasInfo, null, 2));

// Check the iso wrapper div
const wrapperInfo = await T(`(() => {
  const canvases = document.querySelectorAll('canvas');
  for (const c of canvases) {
    const parent = c.parentElement;
    if (parent) return { parentTouchAction: getComputedStyle(parent).touchAction };
  }
  return null;
})()`);
console.log('wrapper:', JSON.stringify(wrapperInfo));

await browser.close();
console.log('DONE');
