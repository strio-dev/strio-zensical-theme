const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const cases = [
  ['hidden', process.env.HIDDEN_URL],
  ['native', process.env.NATIVE_URL],
  ['empty', process.env.EMPTY_URL],
];
assert(cases.every(([, url]) => url), 'Set HIDDEN_URL, NATIVE_URL and EMPTY_URL to the footer fixtures');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  const failures = [];
  try {
    for (const width of [390, 1440]) for (const [name, url] of cases) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        const pagination = page.locator('.md-footer__inner');
        const metadata = page.locator('.md-footer-meta');
        assert.equal(await pagination.count(), 1);
        assert(await pagination.locator('.md-footer__link').count() > 0);
        if (name === 'hidden') {
          assert.equal(await page.locator('.strio-pagination-container > .strio-pagination').count(), 1);
          assert.equal(await page.locator('.strio-footer .md-footer__link').count(), 0);
          assert.equal(await pagination.getAttribute('hidden'), '');
          assert(!(await pagination.isVisible()), 'hide/footer must hide pagination');
          const brand = page.getByRole('link', { name: 'Strio homepage', exact: true });
          assert(await brand.isVisible(), 'hide/footer must retain branding');
          assert.equal(await brand.getAttribute('href'), 'https://strio.dev');
          assert.equal(await metadata.count(), 0);
        } else {
          assert.equal(await page.locator('.strio-pagination').count(), 0);
          assert.equal(await page.locator('footer > .md-footer__inner').count(), 1);
          assert.equal(await page.locator('.strio-footer, .strio-footer__brandbar, .strio-footer-brand').count(), 0);
          assert(await pagination.isVisible(), 'Footer opt-out must retain pagination');
          assert.equal(await metadata.count(), 1);
          if (name === 'native') {
            const copyright = metadata.locator('.md-copyright');
            assert.equal((await copyright.textContent()).trim(), 'Copyright 2026 Acme');
            assert(await copyright.isVisible(), 'Authored copyright must remain visible');
          } else {
            assert.equal((await metadata.textContent()).trim(), '');
            assert(!(await metadata.isVisible()), 'Empty footer metadata must be hidden');
            assert.equal(await metadata.evaluate(element => element.getBoundingClientRect().height), 0);
          }
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ name, width, pagination: name !== 'hidden', branding: name === 'hidden', copyright: name === 'native', metadataHidden: name === 'empty' }));
      } catch (error) {
        failures.push({ name, width, message: error.message });
      } finally {
        await page.close();
      }
    }
    assert.deepEqual(failures, [], 'Footer options checks failed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
