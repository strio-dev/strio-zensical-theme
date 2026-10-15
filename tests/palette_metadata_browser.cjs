const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const [fixture] = process.argv.slice(2);
assert(fixture, 'Usage: node tests/palette_metadata_browser.cjs FIXTURE_SITE');
const root = path.resolve(fixture);
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(404); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

function snapshot() {
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const active = metas.filter(meta => !meta.media || matchMedia(meta.media).matches);
  const body = getComputedStyle(document.body), header = getComputedStyle(document.querySelector('.md-header'));
  return {
    metas: metas.map(meta => ({ content: meta.content, media: meta.media, active: active.includes(meta) })),
    background: body.backgroundColor, scheme: document.body.dataset.mdColorScheme,
    headerBackground: header.backgroundColor, colorScheme: header.colorScheme,
    nativeColorScheme: document.querySelector('meta[name="color-scheme"]').content,
    saved: __md_get('__palette'),
    controls: [...document.querySelectorAll('[data-md-component="palette"] input')].map(input => ({
      type: input.type, name: input.name, scheme: input.dataset.mdColorScheme,
      label: input.getAttribute('aria-label'), target: input.nextElementSibling.htmlFor,
      targetExists: !!document.getElementById(input.nextElementSibling.htmlFor),
    })),
    sameNode: !window.__metadataNode || active[0] === window.__metadataNode,
  };
}

async function check(page, expected) {
  await page.waitForFunction(() => document.querySelector('meta[name="theme-color"][media="not all"]')?.content);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = await page.evaluate(snapshot), active = state.metas.filter(meta => meta.active);
  assert.equal(active.length, 1, 'Exactly one theme-color must match the current media');
  assert.match(active[0].content, /^#[0-9a-f]{6}$/i, 'Browser tint must be supported opaque RGB');
  const dark = state.scheme === 'slate';
  assert.equal(active[0].content, dark ? '#151515' : '#ffffff');
  assert.equal(state.background, dark ? 'rgb(21, 21, 21)' : 'rgb(255, 255, 255)');
  if (expected) assert.equal(state.scheme, expected);
  assert.equal(state.metas.length, 2, 'Native tint is retained alongside one owned tint');
  const native = state.metas.find(meta => meta.media === 'not all');
  assert(native && !native.active, 'Native malformed tint must have nonmatching media');
  assert(!/^#[0-9a-f]{6}$/i.test(native.content), 'Fixture must exercise native translucent-header serialization');
  assert.match(state.headerBackground, /^rgba\(/, 'Header must retain its translucent glass');
  assert.equal(state.nativeColorScheme, state.colorScheme, 'Native color-scheme metadata must remain intact');
  assert.equal(state.saved.color.scheme, state.scheme, 'Native palette persistence must retain the selected scheme');
  assert.equal(state.controls.length, 2);
  assert(state.controls.every(control => control.type === 'radio' && control.name === '__palette' && control.label && control.targetExists));
  assert(state.sameNode, 'Instant navigation must retain the active metadata node');
  return state;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  try {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const home = `http://127.0.0.1:${server.address().port}/`;
      await page.goto(home, { waitUntil: 'networkidle' });
      const initial = await check(page, colorScheme === 'dark' ? 'slate' : 'default');
      await page.evaluate(() => { window.__metadataNode = [...document.querySelectorAll('meta[name="theme-color"]')].find(meta => !meta.media || matchMedia(meta.media).matches); });

      // Exercise an OS change before an explicit user selection; native palette
      // behavior remains authoritative, and the tint must follow its actual surface.
      await page.emulateMedia({ colorScheme: colorScheme === 'light' ? 'dark' : 'light' });
      const osChange = await check(page);
      const next = osChange.scheme === 'slate' ? 'default' : 'slate';
      await page.locator(`[data-md-component="palette"] input[data-md-color-scheme="${osChange.scheme}"]`).focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(scheme => document.body.dataset.mdColorScheme === scheme, next);
      const toggled = await check(page, next);
      assert(await page.locator(`[data-md-component="palette"] input[data-md-color-scheme="${next}"]`).evaluate(input => document.activeElement === input), 'Native keyboard toggle must retain radio focus');
      assert.deepEqual(toggled.controls, initial.controls, 'Palette accessibility and label targets must remain unchanged');

      await page.locator('.strio-pagination a[href$="details/"]').first().click();
      await page.waitForURL(new URL('details/', home).href);
      await check(page, next);
      await page.reload({ waitUntil: 'networkidle' });
      await check(page, next);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ colorScheme, initial: initial.scheme, afterOSChange: osChange.scheme, selected: next, activeTint: toggled.metas.find(meta => meta.active).content, persistence: true, keyboard: true, instantNavigation: true, headerGlass: true }));
      await page.close();
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
