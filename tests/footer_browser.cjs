const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const home = process.env.PREVIEW_URL || 'http://127.0.0.1:8000/';
const middle = process.env.MIDDLE_URL;
assert(middle, 'Set MIDDLE_URL to the three-page fixture details/ page');

async function focus(page, link, colorScheme) {
  await link.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  await link.evaluate(async element => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  const state = await link.evaluate(element => {
    const s = getComputedStyle(element), context = document.createElement('canvas').getContext('2d');
    context.canvas.width = context.canvas.height = 1;
    context.fillStyle = getComputedStyle(document.body).backgroundColor; context.fillRect(0, 0, 1, 1);
    const background = context.getImageData(0, 0, 1, 1).data;
    let opacity = 1;
    for (let parent = element; parent; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity);
    context.globalAlpha = opacity; context.fillStyle = s.outlineColor; context.fillRect(0, 0, 1, 1);
    const outline = context.getImageData(0, 0, 1, 1).data;
    const luminance = color => [...color].slice(0, 3).reduce((sum, value, index) => {
      value /= 255; return sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
    }, 0);
    const a = luminance(background), b = luminance(outline);
    return { visible: element.matches(':focus-visible') && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
      contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  });
  assert(state.visible, 'Footer link has visible keyboard focus');
  if (colorScheme === 'light') assert(state.contrast >= 3, 'Light footer focus remains distinguishable after ancestor opacity');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  try {
    for (const [width, colorScheme] of [[390, 'dark'], [1440, 'light']]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      for (const [url, count] of [[home, 1], [middle, 2], [process.env.LAST_URL || new URL('../next/', middle).href, 1]]) {
        await page.goto(url, { waitUntil: 'networkidle' });
        const pagination = page.locator('.strio-pagination-container > .strio-pagination');
        const brand = page.getByRole('link', { name: 'Strio homepage', exact: true });
        assert.equal(await brand.getAttribute('href'), 'https://strio.dev');
        assert.equal(await page.locator('.strio-footer .md-footer__link, .md-footer-meta').count(), 0, 'Branded footer does not duplicate native pagination or metadata');
        const layout = await pagination.evaluate(nav => {
          const article = document.querySelector('article.md-content__inner');
          let last = article.lastElementChild;
          while (last && !last.getBoundingClientRect().height) last = last.previousElementSibling;
          const n = nav.getBoundingClientRect(), footer = document.querySelector('.strio-footer').getBoundingClientRect();
          const container = document.querySelector('.md-container').getBoundingClientRect();
          const bar = document.querySelector('.strio-footer__brandbar').getBoundingClientRect();
          return { afterArticle: nav.parentElement.previousElementSibling === article,
            articleGap: n.top - last.getBoundingClientRect().bottom, brandGap: bar.top - n.bottom,
            footerHeight: footer.height, footerBottom: footer.bottom, containerBottom: container.bottom,
            fillsViewport: container.bottom >= innerHeight - 1, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert(layout.afterArticle && layout.articleGap >= (width <= 600 ? 32 : 48) - 1, 'Pagination follows the growing article with its minimum clearance');
        assert(Math.abs(layout.brandGap - 40) < 1, 'Navigation retains the requested gap above branding');
        assert(layout.footerHeight >= 75 && layout.footerHeight <= 85, 'Footer stays compact on short and long pages');
        assert(layout.fillsViewport && Math.abs(layout.footerBottom - layout.containerBottom) < 1, 'Spare viewport height stays above the footer');
        assert(!layout.overflow);
        const links = pagination.locator('.md-footer__link');
        assert.equal(await links.count(), count);
        for (const link of await links.all()) {
          assert(await link.evaluate(element => {
            const r = element.getBoundingClientRect(), title = element.querySelector('.md-ellipsis');
            return r.height >= 44 && title.scrollWidth <= title.clientWidth + 1 && title.scrollHeight <= title.clientHeight + 1
              && element.getAttribute('aria-label').endsWith(title.textContent.trim());
          }), 'Navigation keeps complete titles, accessible names and usable targets');
          await focus(page, link, colorScheme);
        }
        if (count === 2) {
          const previous = await links.first().boundingBox(), next = await links.last().boundingBox();
          assert(Math.abs(previous.y - next.y) < 1 && previous.x + previous.width <= next.x, 'Previous and Next stay side by side without overlap');
        }
        await focus(page, brand, colorScheme);
        await page.evaluate(() => scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' }));
        assert(await brand.evaluate(element => {
          const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return r.top >= 0 && r.bottom <= innerHeight && (hit === element || element.contains(hit));
        }), 'Footer homepage link remains fully visible and clickable');
      }
      await page.goto(middle, { waitUntil: 'networkidle' });
      await page.locator('.strio-pagination .md-footer__link--prev').click(); await page.waitForURL(home);
      await page.locator('.strio-pagination .md-footer__link--prev').waitFor({ state: 'detached' });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, colorScheme, pagination: true, shortPageFill: true, compactFooter: true }));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
