// Focused fixed-corner regression for the --theme fixture from prepare_footer.py.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const [fixture, output] = process.argv.slice(2);
assert(fixture && output, 'Usage: node contents_tracking_browser.cjs FIXTURE_SITE OUTPUT_DIR');
const root = fs.realpathSync(path.resolve(fixture)), out = path.resolve(output);
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((request, response) => {
  let file = path.join(root, new URL(request.url, 'http://localhost').pathname);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.otf': 'font/otf' })[path.extname(file)] || 'application/octet-stream');
  response.end(fs.readFileSync(file));
});
function read() {
  const trigger = document.querySelector('[data-strio-panel-trigger="toc"]'), sidebar = trigger.closest('.md-sidebar--secondary');
  const rect = trigger.getBoundingClientRect(), header = document.querySelector('.md-header').getBoundingClientRect();
  const measure = element => {
    const bounds = element.getBoundingClientRect(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    const visible = bounds.width > 0 && bounds.height > 0 && x >= 0 && x < innerWidth && y > header.bottom && y < innerHeight;
    const hit = visible ? document.elementFromPoint(x, y) : null;
    return { rect: bounds.toJSON(), visible, hit: visible ? hit === element || element.contains(hit) : null };
  };
  return {
    scroll: scrollY, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
    width: rect.width, height: rect.height, rightInset: innerWidth - rect.right, bottomInset: innerHeight - rect.bottom,
    headerHeight: header.height, fullyVisible: rect.top >= header.bottom && rect.bottom <= innerHeight, triggerHit: measure(trigger).hit,
    pagination: [...document.querySelectorAll('.strio-pagination:not([hidden]) .md-footer__link')].map(measure),
    brand: measure(document.querySelector('.strio-footer-brand')), sidebarTransition: getComputedStyle(sidebar).transitionDuration,
    collisionOffsets: ['--strio-toc-footer-offset', '--strio-toc-popup-bottom', '--strio-toc-popup-right'].map(property => sidebar.style.getPropertyValue(property)),
  };
}
async function move(page, to) {
  await page.evaluate(({ source, to }) => {
    const measure = eval('(' + source + ')'), start = performance.now(); window.__tracking = [];
    function frame() { window.__tracking.push(measure()); if (performance.now() - start < 800) requestAnimationFrame(frame); }
    requestAnimationFrame(frame); scrollTo({ top: to, behavior: 'smooth' });
  }, { source: read.toString(), to });
  await page.waitForTimeout(900); return page.evaluate(() => window.__tracking);
}
function validate(trace, label) {
  assert(trace.length > 10, `${label}: missing continuous frames`);
  for (const frame of trace) {
    assert.equal(frame.width, 38); assert.equal(frame.height, 38); assert.equal(frame.rightInset, 16); assert.equal(frame.headerHeight, 64);
    assert(Math.abs(frame.bottomInset - 32) < .1, `${label}: corner inset changed to ${frame.bottomInset}px at scroll ${frame.scroll}`);
    assert(Math.abs(frame.top - trace[0].top) < .1, `${label}: control moves while scrolling`);
    assert.equal(frame.sidebarTransition, '0s');
    assert(frame.fullyVisible && frame.triggerHit, `${label}: trigger must remain visible and pointer-accessible`);
    assert(frame.collisionOffsets.every(value => value === ''), `${label}: footer collision tracking remains active`);
    for (const [kind, item] of [...frame.pagination.map(item => ['pagination', item]), ['footer brand', frame.brand]]) {
      const bounds = item.rect;
      const overlap = bounds.width > 0 && bounds.height > 0 && bounds.left < frame.right && bounds.right > frame.left && bounds.top < frame.bottom && bounds.bottom > frame.top;
      if (kind === 'footer brand') assert(!overlap, `${label}: contents overlaps ${kind}`);
      if (item.visible && !overlap) assert(item.hit, `${label}: unobstructed ${kind} must remain pointer-accessible`);
    }
  }
}
async function settlePopup(page) {
  await page.waitForFunction(() => document.querySelector('#__toc').checked && getComputedStyle(document.querySelector('.md-sidebar--secondary .md-sidebar__inner')).transform === 'none', null, { timeout: 2000 });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] }), proof = [];
  // Cover tall/short layouts, both modes and routes, and the narrowest supported width.
  const cases = [[390, 844, 'light', '/'], [390, 844, 'dark', '/details/'], [320, 320, 'light', '/details/'], [390, 280, 'dark', '/']];
  try {
    for (const [width, height, mode, route] of cases) {
      const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, colorScheme: mode });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}${route}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(100);
      const initial = await page.evaluate(read), max = await page.evaluate(() => Math.max(0, document.scrollingElement.scrollHeight - innerHeight));
      const start = Math.max(0, max - 350), prefix = `${mode}-${route === '/' ? 'home' : 'details'}-${width}x${height}`;
      await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), start); await page.waitForTimeout(100);
      const down = await move(page, max); validate(down, prefix + ' down'); const end = await page.evaluate(read);
      await page.screenshot({ path: path.join(out, prefix + '-footer.png') });
      const up = await move(page, start); validate(up, prefix + ' up');
      await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), max); await page.waitForTimeout(100);
      const trigger = page.locator('[data-strio-panel-trigger="toc"]'); await trigger.click(); await settlePopup(page);
      const opened = await page.evaluate(() => {
        const popup = document.querySelector('.md-sidebar--secondary .md-sidebar__inner'), header = document.querySelector('.md-header').getBoundingClientRect();
        return { checked: document.querySelector('#__toc').checked, inert: popup.inert, rect: popup.getBoundingClientRect().toJSON(), headerBottom: header.bottom, transform: getComputedStyle(popup).transform };
      });
      assert(opened.checked && !opened.inert); assert.equal(opened.transform, 'none');
      assert(opened.rect.top >= opened.headerBottom + 7.99 && opened.rect.bottom <= height + .1, 'Popup must clear header and viewport');
      assert(opened.rect.left >= 0 && opened.rect.right <= width, 'Popup must fit horizontally');
      await page.keyboard.press('Escape'); assert(await trigger.evaluate(element => document.activeElement === element), 'Escape returns focus');
      await trigger.focus(); await page.keyboard.press('Enter'); await settlePopup(page);
      assert(await page.locator('#__toc').isChecked(), 'Keyboard opens contents');
      assert(await page.locator('.md-sidebar--secondary .md-sidebar__inner').evaluate(element => element.contains(document.activeElement)), 'Keyboard places focus inside popup');
      await page.keyboard.press('Escape'); await page.emulateMedia({ reducedMotion: 'reduce' }); await trigger.focus(); await page.keyboard.press('Space');
      assert.equal(await page.locator('.md-sidebar--secondary .md-sidebar__inner').evaluate(element => getComputedStyle(element).transitionDuration), '0s');
      await page.keyboard.press('Escape'); assert.equal(errors.length, 0, errors.join('; '));
      proof.push({ width, height, mode, route, initial, end, down, up, opened });
      console.log(JSON.stringify({ width, height, mode, route, frames: down.length + up.length, maxCornerError: Math.max(...down.concat(up).map(frame => Math.abs(frame.bottomInset - 32))), footerTriggerHit: end.triggerHit, passed: true }));
      await page.close();
    }
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(out, 'tracking-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
