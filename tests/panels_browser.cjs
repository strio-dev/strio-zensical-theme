const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const preview = process.env.PREVIEW_URL || process.argv[2];
assert(preview, 'Pass the panels fixture URL or set PREVIEW_URL');
const output = process.env.EVIDENCE_DIR;
if (output) fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  try {
    for (const [width, colorScheme] of [[390, 'dark'], [1440, 'light']]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme,
        hasTouch: width === 390, permissions: ['clipboard-read', 'clipboard-write'] });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(preview, { waitUntil: 'networkidle' });
      const details = page.locator('details.info');
      await details.locator('summary').click();
      assert.notEqual(await details.getAttribute('open'), null, 'Pointer opens native details');
      await details.locator('summary').focus(); await page.keyboard.press('Space');
      assert.equal(await details.getAttribute('open'), null, 'Keyboard closes native details');

      const tabs = page.locator('.tabbed-set'), labels = tabs.locator('.tabbed-labels label');
      await labels.filter({ hasText: /^Nix$/ }).click();
      assert(await tabs.locator('.tabbed-block').nth(1).isVisible(), 'Pointer switches native tabs');
      await tabs.locator('input').nth(1).focus(); await page.keyboard.press('ArrowRight');
      assert(await tabs.locator('input').nth(2).isChecked() && await tabs.locator('.tabbed-block').nth(2).isVisible(), 'Keyboard changes the selected tab and visible content');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.tabbed-labels label:nth-child(3)'), '::after').opacity === '1');
      const selected = await labels.nth(2).evaluate(element => ({
        focus: getComputedStyle(element).outlineStyle,
        line: getComputedStyle(element, '::after').opacity,
      }));
      assert.equal(selected.focus, 'solid', 'Hidden radio paints keyboard focus on its visible label');
      assert.equal(selected.line, '1', 'Active line follows the selected native tab');
      assert(await labels.first().evaluate(element => Number(getComputedStyle(element, '::after').opacity) < .01), 'Unselected tab has no visible active line');
      if (width === 390) {
        assert(await labels.evaluateAll(elements => elements.every(element => { const r = element.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })), 'Tab touch targets remain usable');
        await labels.last().evaluate(element => { element.textContent = 'A long tab label '.repeat(12); });
        assert(await tabs.locator('.tabbed-labels').evaluate(element => { element.scrollLeft = element.scrollWidth; return element.scrollLeft > 0; }), 'Long tab labels scroll locally');
      }
      await labels.first().click();

      for (const [filename, expected] of [['build.sh', "printf 'panel clipboard specimen'"], ['numbered.py', 'name = "example"\nprint(name)']]) {
        const block = page.locator('.highlight').filter({ has: page.locator('.filename', { hasText: new RegExp('^' + filename.replace('.', '\\.') + '$') }) });
        const button = block.locator('.md-code__button');
        assert.equal(await button.count(), 1, `${filename}: one native copy control`);
        await button.scrollIntoViewIfNeeded(); await button.focus(); await page.keyboard.press('Enter');
        await page.waitForFunction(element => element.dataset.copyState === 'copied', await button.elementHandle());
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected, `${filename}: clipboard excludes line numbers`);
        assert(await button.evaluate(element => {
          const title = element.closest('.highlight').querySelector('.filename'), r = element.getBoundingClientRect(), t = title.getBoundingClientRect();
          const css = getComputedStyle(element), extent = parseFloat(css.outlineWidth) + Math.max(0, parseFloat(css.outlineOffset));
          if (!(r.top >= t.top && r.bottom <= t.bottom + 1 && r.left >= t.left && r.right <= t.right)) return false;
          for (let parent = element.parentElement; parent && !parent.classList.contains('md-content__inner'); parent = parent.parentElement) {
            const s = getComputedStyle(parent), p = parent.getBoundingClientRect();
            if (/hidden|clip|auto|scroll/.test(s.overflowX) && (r.left - extent < p.left - 1 || r.right + extent > p.right + 1)) return false;
            if (/hidden|clip|auto|scroll/.test(s.overflowY) && (r.top - extent < p.top - 1 || r.bottom + extent > p.bottom + 1)) return false;
          }
          return true;
        }), `${filename}: copy target and focus fit inside the filename header`);
      }
      if (width === 390) {
        const code = page.locator('.highlight > pre > code').filter({ hasText: 'a deliberately long command' });
        assert(await code.evaluate(element => { element.scrollLeft = element.scrollWidth; return element.scrollLeft > 0; }), 'Wide code remains horizontally readable');
      }
      assert(await page.locator('.admonition, .md-typeset__table table').evaluateAll(elements => elements.every(element => parseFloat(getComputedStyle(element).fontSize) >= 14)), 'Supporting text remains readable');
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Panels must not widen the page');
      assert.deepEqual(errors, []);
      if (output) await page.screenshot({ path: path.join(output, `panels-${width}-${colorScheme}.png`), fullPage: true });
      console.log(JSON.stringify({ width, colorScheme, copy: true, tabs: true, details: true, overflow: false }));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
