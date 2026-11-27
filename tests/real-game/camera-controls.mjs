import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://localhost:8901/?testmode=1';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

async function drag(x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

try {
  await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.click('[data-testid="button-new-game"]');
  await page.waitForSelector('[data-testid="button-confirm-rpg-character"]', { state: 'visible', timeout: 15000 });
  await page.click('[data-testid="button-confirm-rpg-character"]');
  await page.waitForTimeout(700);
  await page.click('button[aria-label="Open graphics options"]');
  await page.getByRole('button', { name: '3D Experimental' }).click();
  await page.waitForFunction(() => typeof window.__ag3dTest?.getPitch === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(700);

  const centre = { x: 195, y: 422 };
  await page.evaluate(() => { window.__ag3dTest.setFirstPerson(false); window.__ag3dTest.setYaw(0); });
  const yawBefore = await page.evaluate(() => window.__ag3dTest.getYaw());
  await drag(centre.x, centre.y, centre.x + 40, centre.y);
  const yawAfter = await page.evaluate(() => window.__ag3dTest.getYaw());
  if (!(yawAfter < yawBefore)) throw new Error(`Rightward drag did not turn the view right: yaw ${yawBefore} -> ${yawAfter}`);

  const orbitPitchBefore = await page.evaluate(() => window.__ag3dTest.getPitch());
  await drag(centre.x, centre.y, centre.x, centre.y + 45);
  const orbitPitchAfter = await page.evaluate(() => window.__ag3dTest.getPitch());
  if (Math.abs(orbitPitchAfter - orbitPitchBefore) > 1e-9) throw new Error(`Orbit vertical drag changed pitch: ${orbitPitchBefore} -> ${orbitPitchAfter}`);

  await page.evaluate(() => window.__ag3dTest.setFirstPerson(true));
  const fpPitchBefore = await page.evaluate(() => window.__ag3dTest.getLookPitch());
  await drag(centre.x, centre.y, centre.x, centre.y - 45);
  const fpPitchAfter = await page.evaluate(() => window.__ag3dTest.getLookPitch());
  if (Math.abs(fpPitchAfter - fpPitchBefore) > 1e-9) throw new Error(`First-person vertical drag changed look pitch: ${fpPitchBefore} -> ${fpPitchAfter}`);

  await page.screenshot({ path: 'tests/real-game/camera-controls-screenshot.png' });
  if (pageErrors.length) throw new Error('Browser errors: ' + pageErrors.join(' | '));
  console.log(`Camera controls passed: right drag yaw ${yawBefore.toFixed(3)} -> ${yawAfter.toFixed(3)}; orbit pitch and first-person look pitch unchanged.`);
} finally {
  await browser.close();
}
