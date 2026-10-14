const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const home = process.env.PREVIEW_URL || 'http://127.0.0.1:8000/';
const middle = process.env.MIDDLE_URL;
assert(middle, 'MIDDLE_URL must point to the generated three-page fixture details/ page');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  try {
    for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
      for (const [name, url, count] of [['first', home, 1], ['middle', middle, 2], ['last', new URL('../next/', middle).href, 1]]) {
        await page.goto(url, { waitUntil: 'networkidle' });
        const brand = page.getByRole('link', { name: 'Strio homepage', exact: true });
        assert.equal(await brand.getAttribute('href'), 'https://strio.dev');
        assert.equal(await brand.locator('svg').getAttribute('viewBox'), '108 148.617 396 110.766');
        const metrics = await page.locator('.strio-footer').evaluate(el => {
          const nav = el.querySelector('nav'), bar = el.querySelector('.strio-footer__brandbar');
          const n = nav.getBoundingClientRect(), f = el.getBoundingClientRect(), b = bar.getBoundingClientRect();
          const article = document.querySelector('.md-content__inner').getBoundingClientRect();
          return { height: f.height, navWidth: n.width, navX: n.x, navBorder: getComputedStyle(nav).borderTopWidth, navPaddingTop: getComputedStyle(nav).paddingTop, navPaddingBottom: getComputedStyle(nav).paddingBottom,
            articleWidth: article.width, articleX: article.x, footerWidth: f.width, brandWidth: b.width,
            brandHeight: b.height, brandPaddingTop: getComputedStyle(bar.firstElementChild).paddingTop, brandPaddingBottom: getComputedStyle(bar.firstElementChild).paddingBottom, brandBorder: getComputedStyle(bar).borderTopWidth,
            outerBorder: getComputedStyle(el).borderTopWidth, background: getComputedStyle(el).backgroundColor,
            brandBackground: getComputedStyle(bar).backgroundColor, separated: b.y >= n.bottom,
            overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(metrics.navPaddingTop, '16px'); assert.equal(metrics.navPaddingBottom, '16px'); assert.equal(metrics.brandPaddingTop, '10px'); assert.equal(metrics.brandPaddingBottom, '10px');
        assert.equal(metrics.navBorder, '1px'); assert.equal(metrics.brandBorder, '1px'); assert.equal(metrics.outerBorder, '0px');
        assert.equal(metrics.brandWidth, metrics.footerWidth); assert.equal(metrics.brandHeight, 65);
        assert(Math.abs(metrics.navWidth - metrics.articleWidth) < 1); assert(Math.abs(metrics.navX - metrics.articleX) < 1);
        assert(metrics.separated); assert(!metrics.overflow); assert.equal(metrics.brandBackground, 'rgba(0, 0, 0, 0)');
        assert.equal(await page.locator('.strio-footer__brandbar a').count(), 1);
        assert.equal(await page.locator('.md-footer-meta').count(), 0);
        const links = page.locator('.md-footer__link'); assert.equal(await links.count(), count);
        for (const link of await links.all()) {
          const bounds = await link.evaluate(el => {
            const r = el.getBoundingClientRect(), title = el.querySelector('.md-ellipsis'), t = title.getBoundingClientRect();
            return { height: r.height, contained: t.x >= r.x && t.right <= r.right && t.y >= r.y && t.bottom <= r.bottom,
              fullTitle: el.getAttribute('aria-label').endsWith(title.textContent.trim()), unclipped: title.scrollWidth <= title.clientWidth + 1 && title.scrollHeight <= title.clientHeight + 1 };
          });
          assert(bounds.height >= 44); assert(bounds.contained); assert(bounds.fullTitle); assert(bounds.unclipped);
        }
        if (count === 2) {
          const previous = await page.locator('.md-footer__link--prev').boundingBox(), next = await page.locator('.md-footer__link--next').boundingBox();
          if (width <= 360) assert(previous.y + previous.height <= next.y); else assert(previous.x + previous.width <= next.x);
        }
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        assert(await page.evaluate(() => {
          const button = document.querySelector('.md-sidebar-button'); if (!button || !button.getBoundingClientRect().height) return true;
          const b = button.getBoundingClientRect(); return [...document.querySelectorAll('.md-footer__link')].every(el => {
            const r = el.getBoundingClientRect(); return r.bottom <= b.top || r.top >= b.bottom || r.right <= b.left || r.left >= b.right;
          });
        }), 'Floating contents button must clear pagination');
        await brand.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
        assert(await brand.evaluate(el => el === document.activeElement));
        assert.equal(await brand.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        await page.locator('h1').click(); await page.mouse.move(width - 1, 1);
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/tmp'}/acme-padded-two-dividers-${name}-${colorScheme}-${width}.png`, fullPage: true });
        console.log(JSON.stringify({ name, colorScheme, width, ...metrics }));
      }
      await page.locator('.md-footer__link--prev').click(); await page.waitForURL('**/details/');
      await page.locator('.md-footer__link--next').waitFor({ state: 'visible' }); assert.equal(await page.locator('.md-footer__link').count(), 2);
      await page.locator('.md-footer__link--prev').click(); await page.waitForURL('**/middle/');
      await page.locator('.md-footer__link--prev').waitFor({ state: 'detached' }); assert.equal(await page.locator('.md-footer__link--next').count(), 1);
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
