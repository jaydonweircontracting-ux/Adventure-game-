/**
 * Build 847: Mobile World Editor regression test.
 *
 * Runs the real production React bundle in Chromium at an iPhone-sized
 * viewport, using the actual options/editor controls and touch input.
 */
import { setupGame, makeChecker } from './helpers.mjs';

const { check, results } = makeChecker();
let browser;
let page;
let errors = [];

try {
  ({ browser, page, errors } = await setupGame({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }));
  await page.setViewportSize({ width: 390, height: 844 });

    check('Editor test hooks are available', await page.evaluate(() => typeof window.__gameTest?.getEditorState === 'function'));

  // Enter the editor using the same options action the player uses.
  await page.evaluate(() => window.__gameTest.openOptions());
  await page.locator('[data-testid="button-debug-world-editor"]').tap();
  await page.waitForFunction(() => window.__gameTest.getEditorState().mapBuilderMode === true);
  await page.waitForTimeout(250);
  check('World Editor opens from Debug options', (await page.evaluate(() => window.__gameTest.getEditorState())).mapBuilderMode === true);

  // Movement must stay stopped even if a keyboard movement input is held.
  const frozenBefore = await page.evaluate(() => window.__gameTest.getPlayerPos());
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(200);
  const frozenAfter = await page.evaluate(() => window.__gameTest.getPlayerPos());
  const frozenDistance = Math.hypot(frozenAfter.x - frozenBefore.x, frozenAfter.y - frozenBefore.y);
  check('Player remains stationary while editing', frozenDistance < 0.05, `delta=${frozenDistance.toFixed(3)}`);

  // Minimize/restore should free the view without switching the tool off.
  await page.locator('[aria-label="Minimize map builder"]').tap();
  await page.waitForFunction(() => !!document.querySelector('[aria-label="Expand map builder"]'));
  check('Map Builder minimizes independently', !(await page.locator('.map-builder-bar').isVisible()));
  await page.locator('[aria-label="Expand map builder"]').tap();
  await page.waitForFunction(() => !!document.querySelector('[aria-label="Exit map builder"]'));
  check('Map Builder restores without leaving edit mode', (await page.evaluate(() => window.__gameTest.getEditorState())).mapBuilderMode === true);

  // Asset Studio also needs to minimize/restore on a narrow viewport.
  await page.evaluate(() => window.__gameTest.openOptions());
  await page.locator('[data-testid="button-debug-asset-studio"]').tap();
  await page.waitForSelector('[aria-label="Asset Studio"]');
  await page.locator('[aria-label="Minimize Asset Studio"]').tap();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.includes('Asset Studio') && b.classList.contains('editor-minimized-chip')));
  check('Asset Studio minimizes independently', !(await page.locator('[aria-label="Asset Studio"]').isVisible()));
  await page.locator('button.editor-minimized-chip').filter({ hasText: 'Asset Studio' }).tap();
  await page.waitForSelector('[aria-label="Asset Studio"]');
  check('Asset Studio restores from its own chip', await page.locator('[aria-label="Asset Studio"]').isVisible());

  // Hide Debug UI must hide every debug surface but preserve active editing.
  await page.locator('.ag-debug-clutter-toggle').tap();
  await page.waitForFunction(() => document.querySelector('.field-column')?.getAttribute('data-debug-ui-hidden') === 'true');
  check('Hide Debug UI hides Asset Studio', !(await page.locator('[aria-label="Asset Studio"]').isVisible()));
  check('Hide Debug UI hides World Editor panel', !(await page.locator('.map-builder-bar').isVisible()));
  check('Hiding panels does not deactivate the editor', (await page.evaluate(() => window.__gameTest.getEditorState())).mapBuilderMode === true);
  const hiddenBefore = await page.evaluate(() => window.__gameTest.getPlayerPos());
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowDown');
  const hiddenAfter = await page.evaluate(() => window.__gameTest.getPlayerPos());
  check('Player stays paused while Debug UI is hidden', Math.hypot(hiddenAfter.x - hiddenBefore.x, hiddenAfter.y - hiddenBefore.y) < 0.05);
  await page.locator('.ag-debug-reveal').tap();
  await page.waitForFunction(() => document.querySelector('.field-column')?.getAttribute('data-debug-ui-hidden') === 'false');

  // Paint a real tile with a touch event and verify the state is saved.
  const paintCountBefore = await page.evaluate(() => window.__gameTest.getPaintedTileCount());
  const overlay = await page.locator('.map-builder-overlay').boundingBox();
  if (!overlay) throw new Error('World Editor touch overlay has no visible bounds');
  await page.touchscreen.tap(overlay.x + overlay.width * 0.78, overlay.y + overlay.height * 0.78);
  await page.waitForFunction((before) => window.__gameTest.getPaintedTileCount() > before, paintCountBefore, { timeout: 8000 });
  const paintCountAfter = await page.evaluate(() => window.__gameTest.getPaintedTileCount());
  check('Touch painting updates live world state', paintCountAfter > paintCountBefore, `${paintCountBefore} → ${paintCountAfter} painted tiles`);
  await page.waitForFunction(() => {
    try {
      const data = JSON.parse(localStorage.getItem('mapBuilderPaints') || '{}');
      return Object.values(data).reduce((sum, tiles) => sum + tiles.length, 0) > 0;
    } catch { return false; }
  }, null, { timeout: 8000 });
  check('Painted tiles are persisted to browser storage', true);

  // Exit all editor tools and ensure the regular game can move again.
  await page.locator('[aria-label="Close all Debug tools"]').tap();
  await page.waitForFunction(() => {
    const s = window.__gameTest.getEditorState();
    return !s.mapBuilderMode && !s.tileEditMode && !s.assetPlacementMode && !s.assetMoveMode && !s.assetStudioOpen && !s.debugHubOpen && !s.chunkSelectorOpen && !s.worldObjectCoordinatesOpen && !s.devConsoleOpen && !s.inspectorOpen && !s.npcRosterOpen && !s.debugConsoleOpen && !s.controlCenterOpen && !s.carriageDebugOpen;
  });
  check('Close all clears every open Debug tool', true);
  const normalBefore = await page.evaluate(() => window.__gameTest.getPlayerPos());
  const canRight = await page.evaluate(() => window.__gameTest.canMove(1, 0));
  const canLeft = await page.evaluate(() => window.__gameTest.canMove(-1, 0));
  const key = canRight ? 'ArrowRight' : canLeft ? 'ArrowLeft' : null;
  if (key) {
    await page.keyboard.down(key);
    await page.waitForTimeout(900);
    await page.keyboard.up(key);
  }
  const normalAfter = await page.evaluate(() => window.__gameTest.getPlayerPos());
  const moved = key === 'ArrowRight' ? normalAfter.x > normalBefore.x : key === 'ArrowLeft' ? normalAfter.x < normalBefore.x : false;
  check('Normal movement returns after exiting editor', moved, key || 'no clear horizontal path');

  // Reload the actual app and verify painted state is reconstructed from storage.
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-testid="button-new-game"]', { timeout: 15000 });
  await page.locator('[data-testid="button-new-game"]').tap();
  await page.waitForFunction(() => typeof window.__gameTest?.getPaintedTileCount === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const paintCountReloaded = await page.evaluate(() => window.__gameTest.getPaintedTileCount());
  check('Paint edits survive a full reload', paintCountReloaded === paintCountAfter, `before reload=${paintCountAfter}, after reload=${paintCountReloaded}`);

  check('No uncaught browser exceptions', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: 'tests/real-game/editor-screenshot.png', fullPage: false });
} catch (error) {
  check('World Editor browser test completes', false, String(error?.message || error).slice(0, 240));
} finally {
  if (browser) await browser.close();
}

console.log(`\\n${results.passed} passed, ${results.failed} failed`);
process.exit(results.failed > 0 ? 1 : 0);
