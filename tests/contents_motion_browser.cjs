// Verify motion separately from native trigger/footer positioning.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const [fixture, destination] = process.argv.slice(2);
assert(fixture && destination, 'Usage: node tests/contents_motion_browser.cjs FIXTURE_SITE OUTPUT_DIR');
const root = fs.realpathSync(path.resolve(fixture)), output = path.resolve(destination);
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  let file = path.join(root, new URL(request.url, 'http://localhost').pathname);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.otf': 'font/otf' })[path.extname(file)] || 'application/octet-stream');
  response.end(fs.readFileSync(file));
});

function read() {
  const popup = document.querySelector('.md-sidebar--secondary .md-sidebar__inner');
  const sidebar = popup.closest('.md-sidebar--secondary');
  const trigger = sidebar.querySelector('[data-strio-panel-trigger="toc"]');
  const style = getComputedStyle(popup), rect = trigger.getBoundingClientRect();
  const matrix = style.transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform);
  const brand = document.querySelector('.strio-footer__brandbar').getBoundingClientRect();
  const obstacles = [...document.querySelectorAll('.strio-pagination:not([hidden]) .md-footer__link')]
    .map(element => element.getBoundingClientRect()).filter(bounds => bounds.width && bounds.height && bounds.left < rect.right && bounds.right > rect.left);
  const boundary = Math.min(brand.top, ...obstacles.map(bounds => bounds.top));
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return {
    time: performance.now(), checked: document.querySelector('#__toc').checked,
    opacity: Number(style.opacity), scale: matrix.a, scaleY: matrix.d, translateY: matrix.f,
    transform: style.transform, origin: style.transformOrigin, transition: style.transition,
    durations: style.transitionDuration, pointerEvents: style.pointerEvents, inert: popup.inert,
    popup: popup.getBoundingClientRect().toJSON(), offsetHeight: popup.offsetHeight, offsetWidth: popup.offsetWidth,
    trigger: rect.toJSON(), header: document.querySelector('.md-header').getBoundingClientRect().toJSON(),
    expectedBottom: Math.min(innerHeight - 32, boundary - 5), triggerHit: hit === trigger || trigger.contains(hit),
    activeInside: popup.contains(document.activeElement), sidebarTransition: getComputedStyle(sidebar).transitionDuration,
    radius: style.borderRadius, scroll: scrollY, viewportWidth: innerWidth, viewportHeight: innerHeight,
  };
}

async function trace(page, action) {
  await page.evaluate(source => {
    const measure = eval('(' + source + ')'), start = performance.now();
    window.__motionTrace = [measure()];
    window.__motionFinished = false;
    function frame() {
      window.__motionTrace.push(measure());
      if (performance.now() - start < 400) requestAnimationFrame(frame);
      else window.__motionFinished = true;
    }
    requestAnimationFrame(frame);
  }, read.toString());
  await action();
  await page.waitForFunction(() => window.__motionFinished);
  return page.evaluate(() => window.__motionTrace);
}

function near(actual, expected, label, tolerance = .015) {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual}, expected ${expected}`);
}

function geometry(frames, label) {
  const first = frames[0];
  for (const frame of frames) {
    near(frame.trigger.width, 38, `${label}: trigger width`);
    near(frame.trigger.height, 38, `${label}: trigger height`);
    near(frame.trigger.right, first.trigger.right, `${label}: trigger horizontal drift`);
    near(frame.trigger.top, first.trigger.top, `${label}: trigger vertical drift`);
    near(frame.trigger.bottom, frame.expectedBottom, `${label}: footer collision tracking`);
    assert.equal(frame.sidebarTransition, '0s', `${label}: trigger container position animation`);
    assert(frame.triggerHit, `${label}: trigger covered during motion`);
    assert.equal(frame.offsetHeight, first.offsetHeight, `${label}: transformed popup changes measured layout height`);
    assert.equal(frame.radius, '8px', `${label}: panel corner changed`);
    assert(frame.opacity >= 0 && frame.opacity <= 1, `${label}: opacity overshoots`);
    assert(frame.scale >= .94999 && frame.scale <= 1.00001, `${label}: scale overshoots`);
    near(frame.scaleY, frame.scale, `${label}: nonuniform scaling`);
    assert(frame.translateY >= -.001 && frame.translateY <= 8.001, `${label}: translation overshoots`);
    if (frame.opacity > .001) {
      assert(frame.popup.top >= frame.header.bottom + 7.9 && frame.popup.bottom <= frame.viewportHeight + .1, `${label}: visible popup clips header or viewport`);
      assert(frame.popup.left >= -.1 && frame.popup.right <= frame.viewportWidth + .1, `${label}: visible popup exceeds horizontal viewport`);
    }
    const [originX, originY] = frame.origin.split(' ').map(parseFloat);
    near(originX, frame.offsetWidth, `${label}: physical right transform origin`);
    near(originY, frame.offsetHeight, `${label}: bottom transform origin`);
  }
}

function monotonic(frames, opening, label) {
  geometry(frames, label);
  const direction = opening ? 1 : -1;
  for (let index = 1; index < frames.length; index++) {
    const a = frames[index - 1], b = frames[index];
    assert((b.opacity - a.opacity) * direction >= -.0001, `${label}: opacity reverses`);
    assert((b.scale - a.scale) * direction >= -.0001, `${label}: scale reverses`);
    assert((b.translateY - a.translateY) * direction <= .001, `${label}: position reverses`);
  }
  const intermediate = frames.filter(frame => frame.opacity > .001 && frame.opacity < .999);
  assert(intermediate.length >= 2, `${label}: missing visible transition frames`);
  if (!opening) assert(intermediate.some(frame => !frame.checked && frame.inert && frame.pointerEvents === 'none'),
    `${label}: closing must remain visible while already inert and noninteractive`);
  const last = frames.at(-1);
  near(last.opacity, opening ? 1 : 0, `${label}: final opacity`);
  near(last.scale, opening ? 1 : .95, `${label}: final scale`);
  near(last.translateY, opening ? 0 : 8, `${label}: final shift`);
  assert.equal(last.inert, !opening, `${label}: native inert state`);
  assert.equal(last.pointerEvents, opening ? 'auto' : 'none', `${label}: native pointer state`);
}

async function checkReduced(page, trigger) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const states = [];
  for (const opening of [true, false]) {
    await trigger.focus();
    await page.keyboard.press(opening ? 'Space' : 'Escape');
    const state = await page.evaluate(read);
    assert.equal(state.checked, opening); assert.equal(state.transform, 'none'); assert.equal(state.durations, '0s');
    near(state.opacity, opening ? 1 : 0, 'Reduced motion immediate opacity');
    assert.equal(state.inert, !opening); assert.equal(state.pointerEvents, opening ? 'auto' : 'none');
    states.push(state);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(180);
  return states;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  const proof = [];
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    for (const [width, height] of [[320, 568], [390, 320], [390, 1000]]) for (const mode of ['light', 'dark']) for (const direction of ['ltr', 'rtl']) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true, colorScheme: mode });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(url, { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready);
      await page.evaluate(dir => { document.documentElement.dir = dir; scrollTo({ top: 420, behavior: 'instant' }); }, direction);
      await page.waitForTimeout(200);
      const trigger = page.locator('[data-strio-panel-trigger="toc"]');
      const label = `${width}x${height}-${mode}-${direction}`;
      const initial = await page.evaluate(read);
      near(initial.scale, .95, `${label}: closed scale`); near(initial.translateY, 8, `${label}: closed shift`);
      await trigger.focus();
      const opening = await trace(page, () => page.keyboard.press('Enter'));
      monotonic(opening, true, `${label}: opening`);
      assert(opening.at(-1).activeInside, `${label}: keyboard opening focus`);
      if (width === 390 && height === 1000 && direction === 'ltr') {
        await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(6, 200);
        await page.screenshot({ path: path.join(output, `strio-docs-contents-mobile-${mode}.png`) });
      }
      const closing = await trace(page, () => page.keyboard.press('Escape'));
      monotonic(closing, false, `${label}: closing`);
      assert(await trigger.evaluate(element => document.activeElement === element), `${label}: Escape focus return`);
      const rapid = await trace(page, async () => {
        for (const key of ['Enter', 'Escape', 'Enter', 'Escape']) { await page.keyboard.press(key); await page.waitForTimeout(45); }
      });
      geometry(rapid, `${label}: rapid toggles`);
      for (let index = 1; index < rapid.length; index++) {
        const a = rapid[index - 1], b = rapid[index];
        if (a.checked === b.checked) {
          const sign = b.checked ? 1 : -1;
          assert((b.opacity - a.opacity) * sign >= -.0001, `${label}: rapid opacity bounces`);
          assert((b.scale - a.scale) * sign >= -.0001, `${label}: rapid scale bounces`);
        } else if (b.time - a.time < 34) assert(Math.abs(b.opacity - a.opacity) < .6, `${label}: interrupted transition jumps`);
      }
      assert(!rapid.at(-1).checked && rapid.at(-1).inert, `${label}: rapid toggles leave stale open state`);
      near(rapid.at(-1).opacity, 0, `${label}: rapid final opacity`);
      const reduced = await checkReduced(page, trigger);
      await trigger.click(); await page.waitForTimeout(200);
      await page.locator('[data-strio-panel-close="toc"]').click(); await page.waitForTimeout(200);
      assert(!await page.locator('#__toc').isChecked(), `${label}: pointer Close`);
      assert.equal(errors.length, 0, errors.join('; '));
      proof.push({ width, height, mode, direction, initial, opening, closing, rapid, reduced, pointerClose: true });
      console.log(JSON.stringify({ label, openingFrames: opening.length, closingFrames: closing.length, rapidFrames: rapid.length, visibleClosingFrames: closing.filter(frame => frame.opacity > .001 && frame.opacity < .999 && frame.inert).length, maxTriggerDrift: Math.max(...opening.concat(closing, rapid).map(frame => Math.abs(frame.trigger.top - initial.trigger.top))), passed: true }));
      await page.close();
    }
    for (const width of [959, 960, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'light' });
      await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(200);
      const state = await page.evaluate(read);
      const tabindex = await page.locator('[data-strio-panel-trigger="toc"]').getAttribute('tabindex');
      if (width === 959) { near(state.scale, .95, 'Compact cutoff scale'); assert.equal(tabindex, '0'); }
      else { assert.equal(state.transform, 'none'); assert(!state.transition.includes('0.15s'), 'Desktop sidebar inherited compact animation'); assert.equal(tabindex, '-1'); }
      proof.push({ width, cutoffState: state, tabindex }); await page.close();
    }
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(output, 'motion-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
