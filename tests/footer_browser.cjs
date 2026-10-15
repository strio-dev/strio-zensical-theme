const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const home = process.env.PREVIEW_URL || 'http://127.0.0.1:8000/';
const middle = process.env.MIDDLE_URL;
assert(middle, 'MIDDLE_URL must point to the generated three-page fixture details/ page');

async function checkFocus(page, link, colorScheme) {
  await link.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await link.evaluate(async element => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  const focus = await link.evaluate(element => {
    const style = getComputedStyle(element);
    const context = document.createElement('canvas').getContext('2d');
    context.canvas.width = context.canvas.height = 1;
    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const background = [...context.getImageData(0, 0, 1, 1).data];
    let opacity = 1;
    for (let node = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    context.globalAlpha = opacity;
    context.fillStyle = style.outlineColor;
    context.fillRect(0, 0, 1, 1);
    const outline = [...context.getImageData(0, 0, 1, 1).data];
    const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const a = luminance(background), b = luminance(outline);
    return { active: element === document.activeElement, visible: element.matches(':focus-visible'), style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
  assert(focus.active && focus.visible);
  assert.equal(focus.style, 'solid');
  assert.equal(focus.width, '2px');
  assert.equal(focus.offset, '2px');
  if (colorScheme === 'light') assert(focus.contrast >= 3, `Light footer focus contrast must reach 3:1; got ${focus.contrast}`);
  return focus.contrast;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  try {
    for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 480, 481, 600, 601, 960, 1220, 1234, 1235, 1236, 1440, 1600, 2000]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.status() >= 400 && new URL(response.url()).origin === new URL(home).origin)
          errors.push(`${response.status()} ${response.url()}`);
      });
      for (const [name, url, count] of [['first', home, 1], ['middle', middle, 2], ['last', new URL('../next/', middle).href, 1]]) {
        await page.goto(url, { waitUntil: 'networkidle' });
        const pagination = page.locator('.md-content__inner > .strio-pagination');
        assert.equal(await pagination.count(), 1);
        assert.equal(await page.locator('.strio-footer .md-footer__link').count(), 0);
        const brand = page.getByRole('link', { name: 'Strio homepage', exact: true });
        assert.equal(await brand.getAttribute('href'), 'https://strio.dev');
        assert.equal(await brand.locator('svg').getAttribute('viewBox'), '108 148.617 396 110.766');
        const metrics = await pagination.evaluate(nav => {
          const footer = document.querySelector('.strio-footer'), bar = footer.querySelector('.strio-footer__brandbar');
          const n = nav.getBoundingClientRect(), f = footer.getBoundingClientRect(), b = bar.getBoundingClientRect();
          const article = nav.parentElement.getBoundingClientRect(), layout = document.querySelector('.md-main__inner').getBoundingClientRect();
          let previous = nav.previousElementSibling;
          while (previous && !previous.getBoundingClientRect().height) previous = previous.previousElementSibling;
          return { inArticle: !nav.closest('footer'), articleGap: n.top - previous.getBoundingClientRect().bottom, brandGap: b.top - n.bottom,
            navBorder: getComputedStyle(nav).borderTopWidth, navPaddingTop: getComputedStyle(nav).paddingTop, navPaddingBottom: getComputedStyle(nav).paddingBottom,
            navWidth: n.width, navX: n.x, articleWidth: article.width, articleX: article.x, footerWidth: f.width, footerX: f.x, layoutX: layout.x, layoutRight: layout.right, rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize), brandWidth: b.width, brandRight: b.right, brandHeight: b.height,
            brandLogoWidth: bar.querySelector('svg').getBoundingClientRect().width, brandLogoX: bar.querySelector('svg').getBoundingClientRect().x, brandX: b.x, brandPaddingTop: getComputedStyle(bar.firstElementChild).paddingTop, brandPaddingBottom: getComputedStyle(bar.firstElementChild).paddingBottom,
            brandBorder: getComputedStyle(bar).borderTopWidth, outerBorder: getComputedStyle(footer).borderTopWidth, brandBackground: getComputedStyle(bar).backgroundColor,
            containerWidth: document.querySelector('.md-container').getBoundingClientRect().width, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert(metrics.inArticle);
        assert(Math.abs(metrics.articleGap - (width <= 600 ? 32 : 48)) < 1, `${name}: article gap ${metrics.articleGap}`);
        assert(Math.abs(metrics.brandGap - 40) < 1, `${name}: brand gap ${metrics.brandGap}`);
        assert.equal(metrics.navBorder, '0px');
        assert.equal(metrics.navPaddingTop, '0px'); assert.equal(metrics.navPaddingBottom, '0px');
        assert.equal(metrics.brandPaddingTop, '27px'); assert.equal(metrics.brandPaddingBottom, '27px');
        assert.equal(metrics.brandBorder, '1px'); assert.equal(metrics.outerBorder, '0px');
        assert.equal(metrics.footerWidth, metrics.containerWidth);
        assert(Math.abs(metrics.brandX - metrics.layoutX) < .02 && Math.abs(metrics.brandRight - metrics.layoutRight) < .02, 'Footer divider must fill the available width up to the native docs grid');
        const logoInset = width <= 600 ? 24 : 40;
        assert(Math.abs(metrics.brandLogoX - metrics.brandX - logoInset) < .02, 'Footer wordmark must retain responsive padding at every width');
        assert(Math.abs(metrics.brandHeight - (55 + 89 * 110.766 / 396)) < .02); assert.equal(metrics.brandLogoWidth, 89);
        assert(Math.abs(metrics.navWidth - metrics.articleWidth) < 1); assert(Math.abs(metrics.navX - metrics.articleX) < 1);
        assert(!metrics.overflow); assert.equal(metrics.brandBackground, 'rgba(0, 0, 0, 0)');
        assert.equal(await page.locator('.strio-footer__brandbar a').count(), 1);
        assert.equal(await page.locator('.md-footer-meta').count(), 0);
        const links = pagination.locator('.md-footer__link');
        assert.equal(await links.count(), count);
        const focusContrasts = [];
        for (const link of await links.all()) {
          const previousLink = await link.evaluate(element => element.classList.contains('md-footer__link--prev'));
          const expectedTitle = name !== 'middle' ? 'Details' : previousLink ? 'Installing and configuring your first development environment' : 'Deploying and maintaining applications in production';
          assert.equal((await link.locator('.md-ellipsis').textContent()).trim(), expectedTitle);
          assert.equal(await link.getAttribute('aria-label'), `${previousLink ? 'Previous' : 'Next'}: ${expectedTitle}`);
          const bounds = await link.evaluate(element => {
            const r = element.getBoundingClientRect(), title = element.querySelector('.md-ellipsis'), t = title.getBoundingClientRect();
            const svg = element.querySelector('svg').getBoundingClientRect();
            return { height: r.height, contained: t.x >= r.x && t.right <= r.right && t.y >= r.y && t.bottom <= r.bottom,
              fullTitle: element.getAttribute('aria-label').endsWith(title.textContent.trim()), unclipped: title.scrollWidth <= title.clientWidth + 1 && title.scrollHeight <= title.clientHeight + 1,
              titleSize: getComputedStyle(element.querySelector('.md-footer__title')).fontSize, directionSize: getComputedStyle(element.querySelector('.md-footer__direction')).fontSize,
              fontFamily: getComputedStyle(title).fontFamily, bodyFont: getComputedStyle(document.body).fontFamily, arrowWidth: svg.width, arrowHeight: svg.height };
          });
          assert(bounds.height >= 44); assert(bounds.contained); assert(bounds.fullTitle); assert(bounds.unclipped);
          assert(Math.abs(parseFloat(bounds.titleSize) - metrics.rootFont * .8) < .02, 'Native pagination title must scale with the root font');
          assert(Math.abs(parseFloat(bounds.directionSize) - metrics.rootFont * .6) < .02, 'Native pagination direction must scale with the root font');
          assert.equal(bounds.fontFamily, bounds.bodyFont);
          assert(Math.abs(bounds.arrowWidth - metrics.rootFont * 1.2) < .02 && Math.abs(bounds.arrowHeight - metrics.rootFont * 1.2) < .02, 'Native pagination arrow must scale with the root font');
          focusContrasts.push(await checkFocus(page, link, colorScheme));
        }
        if (count === 2) {
          const previous = await pagination.locator('.md-footer__link--prev').boundingBox(), next = await pagination.locator('.md-footer__link--next').boundingBox();
          if (width <= 480) {
            assert(Math.abs(previous.x - next.x) < 1);
            assert(Math.abs(next.y - previous.y - previous.height - 16) < 1);
            assert(Math.abs(previous.width - metrics.navWidth) < 1 && Math.abs(next.width - metrics.navWidth) < 1);
          } else assert(previous.x + previous.width <= next.x);
        }
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        assert(await page.evaluate(() => {
          const button = document.querySelector('.md-sidebar-button'); if (!button || !button.getBoundingClientRect().height) return true;
          const b = button.getBoundingClientRect(); return [...document.querySelectorAll('.strio-pagination .md-footer__link')].every(element => {
            const r = element.getBoundingClientRect(); return r.bottom <= b.top || r.top >= b.bottom || r.right <= b.left || r.left >= b.right;
          });
        }), 'Floating contents button must clear pagination');
        focusContrasts.push(await checkFocus(page, brand, colorScheme));
        await page.locator('h1').click(); await page.mouse.move(width - 1, 1);
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/acme-article-pagination-${name}-${colorScheme}-${width}.png`, fullPage: true });
        console.log(JSON.stringify({ name, colorScheme, width, ...metrics, focusContrasts }));
      }
      await page.locator('.strio-pagination .md-footer__link--prev').click(); await page.waitForURL(middle);
      await page.locator('.strio-pagination .md-footer__link--next').waitFor({ state: 'visible' }); assert.equal(await page.locator('.strio-pagination .md-footer__link').count(), 2);
      await page.locator('.strio-pagination .md-footer__link--prev').click(); await page.waitForURL(home);
      await page.locator('.strio-pagination .md-footer__link--prev').waitFor({ state: 'detached' }); assert.equal(await page.locator('.strio-pagination .md-footer__link--next').count(), 1);
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
