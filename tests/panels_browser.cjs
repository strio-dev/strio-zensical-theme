const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const preview = process.env.PREVIEW_URL || process.argv[2];
assert(preview, 'Pass the panels fixture URL or set PREVIEW_URL');
const out = process.env.EVIDENCE_DIR;
if (out) fs.mkdirSync(out, { recursive: true });
const rows = [];
const same = (actual, expected, name) => assert.deepEqual(actual, expected, name);

async function measure(page) {
  return page.evaluate(() => {
    const corners = el => {
      const s = getComputedStyle(el);
      return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(parseFloat);
    };
    const style = el => ({ corners: corners(el), overflow: getComputedStyle(el).overflow, text: el.textContent.trim().slice(0, 60) });
    const enclosure = selector => [...document.querySelectorAll(selector)].map(style);
    return {
      rootSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
      panelToken: getComputedStyle(document.documentElement).getPropertyValue('--strio-panel-radius').trim(),
      cards: enclosure('.md-content__inner .strio-path, .md-content__inner .grid.cards > ul > li, .md-content__inner .grid > .card'),
      callouts: enclosure('.md-content__inner .admonition'),
      details: enclosure('.md-content__inner details'),
      tables: enclosure('.md-content__inner .md-typeset__table table:not([class])'),
      outputs: [...document.querySelectorAll('.md-content__inner .highlight + .result')].map(el => {
        const before = el.previousElementSibling.getBoundingClientRect(), current = el.getBoundingClientRect();
        return { ...style(el), edgeDifference: Math.max(Math.abs(before.left - current.left), Math.abs(before.right - current.right)) };
      }),
      inlineCode: style(document.querySelector('.md-content__inner p > code')),
      button: style(document.querySelector('.md-content__inner .md-button')),
      navigation: style(document.querySelector('.md-nav--primary a.md-nav__link')),
      tabSet: style(document.querySelector('.tabbed-set')),
      tabs: (() => {
        const set = document.querySelector('.tabbed-set'), rail = set.querySelector('.tabbed-labels');
        const r = rail.getBoundingClientRect(), panel = set.querySelector('.tabbed-block');
        const css = getComputedStyle(rail);
        return {
          railHeight: r.height, railWidth: r.width, padding: css.padding, radius: css.borderRadius,
          shadow: css.boxShadow, indicator: getComputedStyle(rail, '::before').display,
          gap: panel.getBoundingClientRect().top - r.bottom,
          labels: [...rail.children].filter(el => el.matches('label')).map(el => {
            const b = el.getBoundingClientRect(), t = getComputedStyle(el);
            return { width: b.width, height: b.height, radius: t.borderRadius, font: t.fontSize, line: t.lineHeight, weight: t.fontWeight, background: t.backgroundColor };
          }),
        };
      })(),
      code: [...document.querySelectorAll('.md-content__inner .highlight')].map(block => {
        const table = block.querySelector(':scope > .highlighttable');
        const code = table ? table.querySelector('.code > div > pre > code') : block.querySelector(':scope > pre > code');
        const pre = code.parentElement;
        const directTitle = block.querySelector(':scope > span.filename');
        const tableTitle = table?.querySelector('th.filename > span.filename');
        const gutter = table?.querySelector('td.linenos');
        const tabStart = block.parentElement.classList.contains('tabbed-block') && block === block.parentElement.firstElementChild;
        const output = block.nextElementSibling?.classList.contains('result') || false;
        return {
          text: code.textContent.trim().slice(0, 80),
          title: (directTitle || tableTitle)?.textContent || null,
          directTitle: Boolean(directTitle), numbered: Boolean(table), tabStart, output,
          code: style(code), pre: style(pre),
          filename: (directTitle || tableTitle) ? style(directTitle || tableTitle) : null,
          gutter: gutter ? style(gutter) : null,
          hasCopy: Boolean(pre.querySelector(':scope > .md-code__nav')),
          codeScrollWidth: code.scrollWidth, codeClientWidth: code.clientWidth,
        };
      }),
    };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  try {
    for (const mode of ['light', 'dark']) for (const width of [320, 390, 1440, 1600, 2000]) {
      const touch = width < 600;
      const context = await browser.newContext({
        viewport: { width, height: width === 1440 ? 1100 : 1000 }, colorScheme: mode,
        isMobile: touch, hasTouch: touch, deviceScaleFactor: 1,
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const page = await context.newPage(), errors = [], repositoryMetadataResponses = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', response => {
        if (new URL(response.url()).origin === new URL(preview).origin && response.status() >= 400) errors.push(response.status() + ' ' + response.url());
        if (response.url().startsWith('https://api.github.com/')) repositoryMetadataResponses.push({ status: response.status(), url: response.url() });
      });
      await page.goto(preview, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('body').getAttribute('data-md-color-scheme'), mode === 'dark' ? 'slate' : 'default');
      const state = await measure(page);
      assert.equal(state.panelToken, '8px');
      for (const group of ['cards', 'callouts', 'details', 'tables', 'outputs']) {
        assert(state[group].length > 0, group + ' specimen exists');
        for (const item of state[group]) same(item.corners, group === 'outputs' ? [0, 0, 8, 8] : [8, 8, 8, 8], group + ': ' + item.text);
      }
      assert(state.outputs.every(item => item.edgeDifference <= 1), 'Code and output share the same outer edges');
      assert(state.button.corners.every(n => n > 8), 'Buttons retain rounded corners');
      assert(state.navigation.corners.every(n => n > 8), 'Navigation pills retain rounded corners');
      assert(state.inlineCode.corners.every(n => n !== 8), 'Inline code retains native corners');
      assert(state.details.every(s => s.overflow === 'visible'), 'Details retain visible overflow');
      assert(state.tabSet.corners.every(n => n !== 8), 'Tab content remains open rather than becoming an enclosure');
      assert.equal(state.tabs.railHeight, touch ? 52 : 36, 'Luma rail retains its compact desktop and touch sizes');
      assert.equal(state.tabs.padding, '4px', 'Luma rail inset');
      assert.equal(state.tabs.radius, '9999px', 'Luma capsule rail');
      assert.equal(state.tabs.shadow, 'none', 'Native underline separator is removed');
      assert.equal(state.tabs.indicator, 'none', 'Default Luma tabs have no moving underline');
      assert.equal(state.tabs.gap, 8, 'Tab controls stay separate from content');
      assert(state.tabs.labels.every(label => label.height === (touch ? 44 : 28)), 'Tab target heights');
      assert(state.tabs.labels.every(label => label.radius === '9999px' && label.font === '14px' && label.line === '20px' && label.weight === '500'), 'Luma tab labels retain the same scale at all root sizes');
      assert(state.tabs.labels[0].background !== 'rgba(0, 0, 0, 0)' && state.tabs.labels.slice(1).every(label => label.background === 'rgba(0, 0, 0, 0)'), 'One selected capsule supplies the quiet highlight');
      if (touch) assert(state.tabs.labels.every(label => label.width >= 44), 'Tab target widths');
      for (const item of state.code) {
        let code, pre;
        if (item.numbered) {
          code = [0, item.title ? 0 : 8, 8, 0];
          pre = [...code];
          if (touch && item.hasCopy && !item.title) code[1] = code[2] = 0;
          // Gutter supplies only the left edge.
          same(item.gutter.corners, [item.title ? 0 : 8, 0, 0, item.output ? 0 : 8], 'Line-number gutter');
        } else {
          code = item.directTitle ? [0, 0, 8, 8] : [8, 8, 8, 8];
          pre = [...code];
          if (touch && item.hasCopy && !item.directTitle) code[1] = code[2] = 0;
        }
        if (item.output) { code[2] = code[3] = pre[2] = pre[3] = 0; }
        same(item.code.corners, code, 'Code: ' + item.text);
        same(item.pre.corners, pre, 'Copy-gutter surface: ' + item.text);
        if (item.filename) same(item.filename.corners, [8, 8, 0, 0], 'Filename: ' + item.title);
      }

      const details = page.locator('.md-content__inner details.info');
      assert(!(await details.getAttribute('open')), 'Initial details is closed');
      if (touch) await details.locator('summary').tap(); else await details.locator('summary').click();
      assert.notEqual(await details.getAttribute('open'), null, 'Pointer opens details');
      await details.locator('summary').focus(); await page.keyboard.press('Space');
      assert.equal(await details.getAttribute('open'), null, 'Keyboard closes details');
      await details.locator('summary').focus(); await page.keyboard.press('Enter');
      assert.notEqual(await details.getAttribute('open'), null, 'Keyboard reopens details');

      const tabs = page.locator('.tabbed-set');
      if (touch) {
        const shortWidth = await tabs.locator('.tabbed-labels label').first().evaluate(label => {
          const text = label.querySelector('a') || label, previous = text.textContent;
          text.textContent = 'A'; const width = label.getBoundingClientRect().width;
          text.textContent = previous; return width;
        });
        assert(shortWidth >= 44, 'Short tab labels retain a 44px-wide touch target');
      }
      const nixLabel = tabs.locator('.tabbed-labels label').filter({ hasText: /^Nix$/ });
      if (touch) await nixLabel.tap(); else await nixLabel.click();
      assert(await tabs.locator('.tabbed-block').nth(1).isVisible(), 'Pointer switches tab');
      await tabs.locator('input').nth(1).focus(); await page.keyboard.press('ArrowRight');
      assert(await tabs.locator('input').nth(2).isChecked(), 'Keyboard switches native radio tab');
      const focusedTab = await tabs.locator('.tabbed-labels label').nth(2).evaluate(el => {
        const s = getComputedStyle(el); return { outline: s.outlineStyle, shadow: s.boxShadow, radius: s.borderRadius };
      });
      assert.equal(focusedTab.outline, 'solid', 'Hidden radio paints a visible outline on its matching label');
      assert.notEqual(focusedTab.shadow, 'none', 'Keyboard focus retains the project accent ring');
      assert.equal(focusedTab.radius, '9999px');
      assert(await tabs.locator('.tabbed-block').nth(2).isVisible(), 'Keyboard reveals tab panel');
      const shellLabel = tabs.locator('.tabbed-labels label').first();
      if (touch) await shellLabel.tap(); else await shellLabel.click();

      const titled = page.locator('.highlight').filter({ has: page.locator(':scope > span.filename', { hasText: /^build.sh$/ }) });
      const copy = titled.locator('.md-code__button');
      await copy.scrollIntoViewIfNeeded(); await copy.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('.highlight > span.filename')?.parentElement.querySelector('.md-code__button')?.dataset.copyState === 'copied');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "printf 'panel clipboard specimen'");
      const numbered = page.locator('.highlight').filter({ has: page.locator('th.filename > span.filename', { hasText: /^numbered.py$/ }) });
      const numberedCopy = numbered.locator('.md-code__button');
      assert.equal(await numberedCopy.count(), 1, 'Numbered titled block has one copy control');
      await numberedCopy.scrollIntoViewIfNeeded(); await numberedCopy.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => [...document.querySelectorAll('.highlight')].find(block => block.querySelector('th.filename > span.filename')?.textContent === 'numbered.py')?.querySelector('.md-code__button')?.dataset.copyState === 'copied');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'name = "example"\nprint(name)', 'Numbered titled block copies code without line numbers');
      const controls = await page.locator('.md-content__inner .md-code__button:visible').evaluateAll(buttons => buttons.map(button => {
        const b = button.getBoundingClientRect(), pre = button.closest('pre'), c = pre.querySelector('code').getBoundingClientRect();
        const block = pre.closest('.highlight'), title = block.querySelector(':scope > span.filename, :scope > .highlighttable th.filename > span.filename');
        const titleBounds = title?.getBoundingClientRect();
        const buttonStyle = getComputedStyle(button);
        const focusExtent = Math.max(2, parseFloat(buttonStyle.outlineWidth) + Math.max(0, parseFloat(buttonStyle.outlineOffset)));
        const clipped = [];
        for (let el = button.parentElement; el && !el.classList.contains('md-content__inner'); el = el.parentElement) {
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          if (['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowX) && (b.left - focusExtent < r.left - 1 || b.right + focusExtent > r.right + 1)) clipped.push(el.className);
          if (['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowY) && (b.top - focusExtent < r.top - 1 || b.bottom + focusExtent > r.bottom + 1)) clipped.push(el.className);
        }
        return {
          width: b.width, height: b.height, clipped, focusExtent,
          title: title?.textContent || null,
          topInset: titleBounds ? b.top - titleBounds.top : null,
          rightInset: titleBounds ? titleBounds.right - b.right : null,
          clear: titleBounds ? b.top >= titleBounds.top && b.bottom <= titleBounds.bottom + 1 : b.left >= c.right - 1,
        };
      }));
      assert(controls.every(c => c.clipped.length === 0), 'Copy targets and focus remain outside clipping');
      const plainTitleControl = controls.find(c => c.title === 'build.sh');
      const numberedTitleControl = controls.find(c => c.title === 'numbered.py');
      assert(plainTitleControl.clear && numberedTitleControl.clear, 'Both titled copy controls fit inside their filename headers');
      assert.equal(numberedTitleControl.topInset, plainTitleControl.topInset, 'Numbered title matches plain title copy top inset');
      assert.equal(numberedTitleControl.rightInset, plainTitleControl.rightInset, 'Numbered title matches plain title copy right inset');
      if (touch) assert(controls.every(c => c.width >= 44 && c.height >= 44 && c.clear), 'Touch targets remain clear of scrolling code');
      const longCode = page.locator('.highlight > pre > code').filter({ hasText: 'a deliberately long command' });
      if (touch) {
        const scroll = await longCode.evaluate(el => { el.scrollLeft = el.scrollWidth; return { left: el.scrollLeft, range: el.scrollWidth - el.clientWidth }; });
        assert(scroll.range > 0 && scroll.left > 0, 'Long code scrolls horizontally');
      }

      if (width === 390) {
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.locator('.md-header__button[for="__drawer"]').tap();
        await page.waitForFunction(() => document.querySelector('#__drawer').checked);
        const card = await page.locator('.md-sidebar--primary .md-nav__source').evaluate(el => {
          const s = getComputedStyle(el); return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(parseFloat);
        });
        same(card, [8, 8, 8, 8], 'Drawer repository card');
        await page.keyboard.press('Escape');
        await page.locator('[data-strio-panel-trigger="toc"]').tap();
        const panel = await page.locator('.md-sidebar--secondary .md-sidebar__inner').evaluate(el => {
          const s = getComputedStyle(el); return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(parseFloat);
        });
        same(panel, [8, 8, 8, 8], 'Compact Contents panel');
        await page.keyboard.press('Escape');
      }

      const shots = [];
      if (out && [390, 1440].includes(width)) {
        await page.waitForFunction(() => !document.querySelector('.md-code__button[data-copy-state="copied"]'));
        await page.evaluate(async () => {
          document.activeElement?.blur();
          document.querySelectorAll('.md-content__inner pre > code').forEach(el => { el.scrollLeft = 0; });
          document.querySelectorAll('.md-content__inner details').forEach(el => { el.open = true; });
          scrollTo({ top: 0, behavior: 'instant' });
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        const galleryFile = path.join(out, 'strio-docs-panels-' + (touch ? 'mobile' : 'desktop') + '-' + mode + '.png');
        await page.screenshot({ path: galleryFile, fullPage: true }); shots.push(galleryFile);
        await page.goto(new URL('../', preview).href, { waitUntil: 'networkidle' });
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); scrollTo({ top: 0, behavior: 'instant' }); });
        const overviewFile = path.join(out, 'strio-docs-overview-' + (touch ? 'mobile' : 'desktop') + '-' + mode + '.png');
        await page.screenshot({ path: overviewFile, fullPage: true }); shots.push(overviewFile);
      }
      assert.deepEqual(errors, []);
      rows.push({ width, mode, touch, ...state, controls, repositoryMetadataResponses, detailsPointerKeyboard: true, tabsPointerKeyboard: true, copied: true, shots });
      console.log(JSON.stringify({ width, mode, rootSize: state.rootSize, codePanels: state.code.length, fixedPanelRadius: 8, detailsPointerKeyboard: true, tabsPointerKeyboard: true, copyControls: controls.length, shots }));
      await context.close();
    }
  } finally { await browser.close(); }
  if (out) fs.writeFileSync(path.join(out, 'panel-proof.json'), JSON.stringify(rows, null, 2) + '\n');
})().catch(error => { console.error(error); process.exit(1); });
