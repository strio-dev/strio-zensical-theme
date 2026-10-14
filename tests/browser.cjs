const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || 'chromium',
    args: ['--no-sandbox'],
  });
  const errors = [];
  const results = [];
  try {
    for (const colorScheme of ['light', 'dark']) for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.status() >= 400) errors.push(`${response.url()}: ${response.status()}`);
      });
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
      const state = await page.evaluate(() => ({
        scheme: document.body.dataset.mdColorScheme,
        background: getComputedStyle(document.body).backgroundColor,
        code: getComputedStyle(document.querySelector('pre code')).backgroundColor,
        overflow: document.documentElement.scrollWidth > innerWidth,
        copies: document.querySelectorAll('.md-code__button').length,
      }));
      assert(!state.overflow);
      assert(state.copies >= 2);
      assert.equal(state.scheme, colorScheme === 'dark' ? 'slate' : 'default');
      assert.equal(state.background, colorScheme === 'dark' ? 'rgb(21, 21, 21)' : 'rgb(255, 255, 255)');
      assert.equal(state.code, colorScheme === 'dark' ? 'rgb(32, 32, 32)' : 'rgb(248, 248, 248)');
      const logo = page.locator('.md-header__button.md-logo img');
      assert(await logo.isVisible(), 'Acme logo hidden');
      const logoState = await logo.evaluate(element => ({
        src: element.getAttribute('src'),
        loaded: element.complete && element.naturalWidth > 0,
        filter: getComputedStyle(element).filter,
        width: element.getBoundingClientRect().width,
      }));
      assert(logoState.src.endsWith('assets/acme-corner.svg'));
      assert(logoState.loaded && logoState.width >= 50);
      assert.equal(logoState.filter, colorScheme === 'dark' ? 'invert(1)' : 'none');
      if (width === 390) {
        const menuBox = await page.locator('.md-header__button[for="__drawer"]').boundingBox();
        const logoBox = await logo.boundingBox();
        assert(menuBox && menuBox.x + menuBox.width <= logoBox.x, 'Menu must precede the logo');
      }
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/tmp'}/acme-${colorScheme}-${width}.png`, fullPage: true });
      await page.getByRole('link', { name: 'Read details' }).click();
      await page.waitForURL('**/details/');
      results.push({ colorScheme, width, ...state });
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
