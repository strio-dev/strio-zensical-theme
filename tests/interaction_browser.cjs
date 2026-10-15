const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const preview = process.env.PREVIEW_URL || process.argv[2];
assert(preview, 'Pass the controls fixture URL or set PREVIEW_URL');

async function copy(page, button, expected) {
  await button.click();
  await page.waitForFunction(element => element.dataset.copyState === 'copied', await button.elementHandle());
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
  assert.equal(await button.getAttribute('aria-label'), 'Copied');
}

async function navigation(page, kind) {
  const trigger = page.locator(`[data-strio-panel-trigger="${kind}"]`);
  const panel = page.locator(`#strio-${kind}-panel`);
  assert(await panel.evaluate(element => element.inert), `${kind}: closed panel must not receive focus`);
  await trigger.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(name => document.querySelector(`#__${name}`).checked, kind);
  assert(!(await panel.evaluate(element => element.inert)));
  await page.keyboard.press('Tab');
  assert(await panel.evaluate(element => element.contains(document.activeElement)), `${kind}: Tab enters the open panel`);
  await page.keyboard.press('Escape');
  assert(await panel.evaluate(element => element.inert));
  assert(await trigger.evaluate(element => document.activeElement === element), `${kind}: Escape restores focus`);
}

async function contents(page) {
  const trigger = page.locator('[data-strio-panel-trigger="toc"]');
  const popup = page.locator('#strio-toc-panel');
  await navigation(page, 'toc');
  const start = await trigger.boundingBox();
  await page.evaluate(async () => {
    const trigger = document.querySelector('[data-strio-panel-trigger="toc"]');
    window.__contentsPositions = [];
    const sample = () => {
      const rect = trigger.getBoundingClientRect();
      window.__contentsPositions.push([rect.x, rect.y]);
      if (window.__contentsSampling) requestAnimationFrame(sample);
    };
    window.__contentsSampling = true; requestAnimationFrame(sample);
    scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'smooth' });
  });
  await page.waitForFunction(() => scrollY >= document.scrollingElement.scrollHeight - innerHeight - 1);
  const positions = await page.evaluate(() => { window.__contentsSampling = false; return window.__contentsPositions; });
  assert(positions.length > 1 && positions.every(([x, y]) => Math.abs(x - start.x) < 1 && Math.abs(y - start.y) < 1), 'Contents stays fixed while scrolling');
  const hit = await trigger.evaluate(element => {
    const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { reached: hit === element || element.contains(hit), target: hit?.outerHTML, trigger: r.toJSON() };
  });
  assert(hit.reached, 'Contents remains clickable at the footer: ' + JSON.stringify(hit));
  for (const control of await page.locator('.strio-footer-brand, .strio-pagination a').all()) {
    assert(await control.evaluate(element => {
      const r = element.getBoundingClientRect();
      if (r.bottom <= 64 || r.top >= innerHeight) return true;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === element || element.contains(hit);
    }), 'Visible footer navigation remains clickable');
  }
  for (const key of ['Enter', 'Escape', 'Enter', 'Escape']) { await trigger.focus(); await page.keyboard.press(key); }
  assert(!(await page.locator('#__toc').isChecked()) && await popup.evaluate(element => element.inert), 'Rapid toggles end closed and inert');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 320 });
  await trigger.focus(); await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('#__toc').checked);
  assert(await popup.evaluate(element => {
    const r = element.getBoundingClientRect(), active = document.activeElement;
    const hit = node => { const b = node.getBoundingClientRect(); const target = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return target === node || node.contains(target); };
    return getComputedStyle(element).transitionDuration === '0s' && r.top >= 64 && r.bottom <= innerHeight
      && r.left >= 0 && r.right <= innerWidth && element.contains(active) && hit(active) && hit(element.querySelector('.strio-panel-close'));
  }), 'Short reduced-motion popup keeps its current link and Close reachable');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  try {
    for (const [width, colorScheme] of [[390, 'dark'], [1440, 'light']]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme,
        hasTouch: width === 390, permissions: ['clipboard-read', 'clipboard-write'] });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(preview).origin) errors.push(`${response.status()} ${response.url()}`); });
      await page.goto(preview, { waitUntil: 'networkidle' });
      const home = page.url();
      const logo = page.locator('.md-header__button.md-logo img');
      assert(await logo.isVisible() && await logo.evaluate(image => image.complete && image.naturalWidth > 0), 'Consumer logo loads');
      assert.equal(await page.locator('body').getAttribute('data-md-color-scheme'), colorScheme === 'dark' ? 'slate' : 'default');
      await copy(page, page.locator('.md-code__button').first(), 'nix build .#theme');
      const titled = page.locator('.highlight').filter({ has: page.locator('.filename', { hasText: /^build.sh$/ }) });
      await copy(page, titled.locator('.md-code__button'), "printf 'clipboard specimen'");
      await copy(page, page.locator('[data-copy] .md-code__button'), 'copy override specimen');
      assert.equal(await page.locator('.no-copy:not(.copy) .md-code__button').count(), 0, 'Authored no-copy opts out');
      await copy(page, page.locator('.copy.no-copy .md-code__button'), 'explicit copy specimen');

      const writeText = await page.evaluateHandle(() => navigator.clipboard.writeText);
      await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('Denied', 'NotAllowedError')); });
      const failedCopy = titled.locator('.md-code__button'); await failedCopy.click();
      await page.waitForFunction(element => element.dataset.copyState === 'error', await failedCopy.elementHandle());
      assert.equal(await failedCopy.getAttribute('aria-label'), 'Could not copy to clipboard');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'explicit copy specimen', 'Rejected copy must not report or replace clipboard content');
      await page.evaluate(original => { navigator.clipboard.writeText = original; }, writeText); await writeText.dispose();
      await copy(page, failedCopy, "printf 'clipboard specimen'");

      await page.waitForFunction(() => !document.querySelector('.md-dialog--active'));
      if (width === 390) { await navigation(page, 'drawer'); await contents(page); }
      await page.goto(home, { waitUntil: 'networkidle' });
      if (width === 390) await page.locator('[data-strio-panel-trigger="toc"]').click();
      const lateHeading = page.locator('.md-sidebar--secondary a.md-nav__link').last();
      const lateHash = new URL(await lateHeading.getAttribute('href'), home).hash;
      await lateHeading.click();
      await page.waitForFunction(hash => location.hash === hash && [...document.querySelectorAll('.md-sidebar--secondary a')].some(link => link.hash === hash && link.getAttribute('aria-current') === 'location'), lateHash);
      if (width === 390) {
        await page.locator('[data-strio-panel-trigger="toc"]').click();
        const current = lateHeading;
        assert(await current.evaluate(element => {
          let scroller = element.parentElement;
          while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
          const r = element.getBoundingClientRect(), s = scroller.getBoundingClientRect();
          return r.top >= s.top - 1 && r.bottom <= s.bottom + 1;
        }), 'Reopening Contents reveals the selected heading');
        await page.keyboard.press('Escape');
      }
      await page.goto(home, { waitUntil: 'networkidle' });
      await page.locator(width === 390 ? '.md-header__button[for="__search"]' : '.md-search__button').click();
      await page.getByPlaceholder('Search', { exact: true }).fill('clipboard');
      await page.getByRole('link').filter({ has: page.getByRole('heading', { name: 'Filename and clipboard', exact: true }) }).click();
      await page.waitForFunction(() => location.hash === '#filename-and-clipboard');

      await page.goto(home, { waitUntil: 'networkidle' });
      if (width === 390) await page.locator('[data-strio-panel-trigger="drawer"]').click();
      await page.evaluate(() => { window.__interactionDocument = true; });
      await page.locator('.md-nav--primary').getByRole('link', { name: 'Details', exact: true }).click();
      await page.waitForURL(new URL('details/', home).href);
      assert(await page.evaluate(() => window.__interactionDocument), 'Native instant navigation retains the document');
      await page.goBack(); await page.waitForURL(home); await page.locator('#filename-and-clipboard').waitFor();
      await copy(page, page.locator('.md-code__button').first(), 'nix build .#theme');
      await page.evaluate(() => navigator.clipboard.writeText('fallback pending'));
      const clipboard = await page.evaluateHandle(() => navigator.clipboard);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
      await page.locator('.md-code__button').first().click();
      assert.equal(await page.evaluate(api => api.readText(), clipboard), 'nix build .#theme', 'Native ClipboardJS fallback remains usable');
      await clipboard.dispose();
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'No horizontal page overflow');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, colorScheme, copy: true, navigation: true, search: true, instantNavigation: true }));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
