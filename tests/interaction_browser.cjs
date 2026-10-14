const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const args = process.argv.slice(2);
assert(args.length <= 1, 'Pass one preview URL');
assert(!(process.env.PREVIEW_URL && args.length), 'Use PREVIEW_URL or one URL argument');
const preview = process.env.PREVIEW_URL || args[0];
assert(preview, 'Set PREVIEW_URL or pass the controls fixture URL');

async function checkCopy(page, button, expected) {
  await button.click();
  await page.waitForFunction(element => element.dataset.copyState === 'copied', await button.elementHandle());
  assert.equal(await button.getAttribute('aria-label'), 'Copied');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || 'chromium',
    args: ['--no-sandbox'],
  });
  try {
    for (const colorScheme of ['light', 'dark']) for (const width of [390, 1440]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        colorScheme,
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      await page.goto(preview, { waitUntil: 'networkidle' });
      const home = page.url();
      assert.equal(await page.locator('body').getAttribute('data-md-color-scheme'), colorScheme === 'dark' ? 'slate' : 'default');

      await checkCopy(page, page.locator('.md-code__button').first(), 'nix build .#theme');
      const titledCode = page.locator('.highlight').filter({ has: page.locator('.filename', { hasText: 'build.sh' }) });
      assert.equal(await titledCode.count(), 1);
      await checkCopy(page, titledCode.locator('.md-code__button'), "printf 'clipboard specimen'");
      const authoredCopy = page.locator('[data-copy]');
      assert.equal(await authoredCopy.count(), 1);
      assert.notEqual((await authoredCopy.locator('code').textContent()).trim(), 'copy override specimen');
      await checkCopy(page, authoredCopy.locator('.md-code__button'), 'copy override specimen');
      assert.equal(await page.locator('.no-copy').count(), 1);
      assert.equal(await page.locator('.no-copy .md-code__button').count(), 0);

      const writeText = await page.evaluateHandle(() => navigator.clipboard.writeText);
      await page.evaluate(() => {
        navigator.clipboard.writeText = () => Promise.reject(new DOMException('Clipboard access denied', 'NotAllowedError'));
      });
      const failedCopy = titledCode.locator('.md-code__button');
      await failedCopy.click();
      await page.waitForFunction(element => element.dataset.copyState === 'error', await failedCopy.elementHandle());
      assert.equal(await failedCopy.getAttribute('aria-label'), 'Could not copy to clipboard');
      assert.equal(await failedCopy.getAttribute('title'), 'Could not copy to clipboard');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'copy override specimen');
      await page.evaluate(original => { navigator.clipboard.writeText = original; }, writeText);
      await writeText.dispose();
      await checkCopy(page, failedCopy, "printf 'clipboard specimen'");

      const tabs = page.locator('.tabbed-set');
      await tabs.locator('.tabbed-labels label').filter({ hasText: /^Nix$/ }).click();
      assert(await tabs.locator('.tabbed-block').nth(1).isVisible());
      assert(!(await tabs.locator('.tabbed-block').first().isVisible()));

      if (width === 390) await page.locator('[data-strio-panel-trigger="toc"]').click();
      const tableTarget = page.locator('.md-sidebar--secondary a[href$="#tables"]');
      await tableTarget.click();
      await page.waitForFunction(() => document.querySelector('.md-sidebar--secondary a[href$="#tables"]')?.getAttribute('aria-current') === 'location');
      assert.equal(await page.locator('[data-strio-toc-adjusted]').count(), 1);
      assert.equal(new URL(page.url()).hash, '#tables');

      await page.goto(home, { waitUntil: 'networkidle' });
      if (width === 390) await page.locator('.md-header__button[for="__search"]').click();
      else await page.locator('.md-search__button').click();
      await page.getByPlaceholder('Search', { exact: true }).fill('clipboard');
      const result = page.getByRole('link').filter({ has: page.getByRole('heading', { name: 'Filename and clipboard', exact: true }) });
      await result.waitFor({ state: 'visible' });
      await result.click();
      await page.waitForFunction(() => location.hash === '#filename-and-clipboard');

      await page.goto(home, { waitUntil: 'networkidle' });
      if (width === 390) {
        await page.locator('.md-header__button[for="__drawer"]').click();
        await page.waitForFunction(() => document.querySelector('#__drawer').checked);
        assert(await page.locator('.md-nav--primary').getByRole('link', { name: 'Details', exact: true }).isVisible());
      }
      const documentToken = `${colorScheme}:${width}`;
      await page.evaluate(token => { window.__strioInteractionDocument = token; }, documentToken);
      await page.locator('.md-nav--primary').getByRole('link', { name: 'Details', exact: true }).click();
      await page.waitForURL(new URL('details/', home).href);
      await page.waitForFunction(() => document.querySelector('h1')?.textContent.startsWith('Details'));
      assert.equal(await page.evaluate(() => window.__strioInteractionDocument), documentToken);
      await page.goBack();
      await page.waitForURL(home);
      await page.locator('#filename-and-clipboard').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => window.__strioInteractionDocument), documentToken);
      await checkCopy(page, page.locator('.md-code__button').first(), 'nix build .#theme');

      await page.evaluate(() => scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' }));
      await page.waitForFunction(() => scrollY >= document.scrollingElement.scrollHeight - innerHeight - 1);
      const headerY = await page.locator('.md-header').evaluate(element => element.getBoundingClientRect().y);
      assert.equal(headerY, 0);

      await page.goto(home, { waitUntil: 'networkidle' });
      const clipboard = await page.evaluateHandle(() => navigator.clipboard);
      await page.evaluate(() => navigator.clipboard.writeText('fallback pending'));
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
      assert.equal(await page.evaluate(() => navigator.clipboard), undefined);
      const fallbackCopy = page.locator('.md-code__button').first();
      await fallbackCopy.click();
      assert.equal(await page.evaluate(api => api.readText(), clipboard), 'nix build .#theme');
      assert.equal(await fallbackCopy.getAttribute('data-copy-state'), null);
      await clipboard.dispose();
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ colorScheme, width, clipboard: true, authoredCopy: true, noCopy: true, clipboardRejection: true, clipboardFallback: true, tabs: true, toc: true, search: true, drawer: width === 390, instantNavigation: true, headerY }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
