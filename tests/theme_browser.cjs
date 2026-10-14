// Browser checks for navigation, reading styles and native search regressions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const [url, baselineFile, mode] = process.argv.slice(2);
assert(!mode || mode === "--record-search", "Unknown mode");
assert(url && baselineFile, 'Usage: node tests/theme_browser.cjs URL SEARCH_BASELINE_JSON [--record-search]');
const baseline = mode ? [] : JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const directory = process.env.SCREENSHOT_DIR || path.dirname(baselineFile);
fs.mkdirSync(directory, { recursive: true });
if(mode)fs.mkdirSync(path.dirname(baselineFile),{recursive:true});
const snapshot = el => ({
  html: el.outerHTML,
  elements: [el, ...el.querySelectorAll('*')].map(e => ({
    tag: e.tagName, cls: e.className,
    style: Object.fromEntries([...getComputedStyle(e)].map(k => [k, getComputedStyle(e).getPropertyValue(k)])),
    rect: e.getBoundingClientRect().toJSON(),
  })),
});
function compareStyles(expected, actual, label) {
  // New unused custom properties are harmless; every baseline property must match.
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `${label}: ${key}`);
}
async function recordSearch(page, width, colorScheme) {
  const trigger=page.locator(width<960?'.md-header__button[for="__search"]':'.md-search__button');
  const before=await trigger.evaluate(el=>({html:el.outerHTML,style:Object.fromEntries([...getComputedStyle(el)].map(k=>[k,getComputedStyle(el).getPropertyValue(k)])),rect:el.getBoundingClientRect().toJSON()}));
  await trigger.click();
  const input=page.getByPlaceholder('Search',{exact:true});await input.fill('clipboard');await page.waitForTimeout(600);
  const panel=input.locator('xpath=../../..');const snap=await panel.evaluate(snapshot);
  await panel.screenshot({path:path.join(path.dirname(baselineFile),`search-before-${colorScheme}-${width}.png`)});
  await page.keyboard.press('Escape');await page.waitForTimeout(200);
  const escape=await page.evaluate(()=>({searchChecked:document.querySelector('#__search').checked,active:document.activeElement.outerHTML}));
  await trigger.click();await input.fill('clipboard');
  const result=panel.locator('a[href*="#filename-and-clipboard"]').first();await result.waitFor({state:'visible'});await result.click();
  await page.waitForFunction(()=>location.hash==='#filename-and-clipboard');
  return {width,colorScheme,before,snap,escape,resultHash:await page.evaluate(()=>location.hash)};
}
async function searchCheck(page, reference, width, colorScheme) {
  const trigger = page.locator(width < 960 ? '.md-header__button[for="__search"]' : '.md-search__button');
  const before = await trigger.evaluate(el => ({ html: el.outerHTML, style: Object.fromEntries([...getComputedStyle(el)].map(k => [k, getComputedStyle(el).getPropertyValue(k)])), rect: el.getBoundingClientRect().toJSON() }));
  assert.equal(before.html, reference.before.html, 'Search trigger HTML changed');
  compareStyles(reference.before.style, before.style, 'Search trigger');
  assert.deepEqual(before.rect, reference.before.rect, 'Search trigger layout changed');
  await trigger.click();
  const input = page.getByPlaceholder('Search', { exact: true });
  await input.fill('clipboard');
  await page.waitForTimeout(600); // Let native dialog/result transitions finish.
  const panel = input.locator('xpath=../../..');
  const current = await panel.evaluate(snapshot);
  assert.equal(current.html, reference.snap.html, 'Native search HTML changed');
  assert.equal(current.elements.length, reference.snap.elements.length);
  current.elements.forEach((el, i) => {
    const previous = reference.snap.elements[i];
    assert.equal(el.tag, previous.tag); assert.deepEqual(el.cls, previous.cls);
    compareStyles(previous.style, el.style, `Search element ${i}`);
    assert.deepEqual(el.rect, previous.rect, `Search element ${i} layout changed`);
  });
  const shot=await panel.screenshot({ path: path.join(directory, `search-after-${colorScheme}-${width}.png`) });
  const old=fs.readFileSync(path.join(path.dirname(baselineFile),`search-before-${colorScheme}-${width}.png`));
  const pixels=await page.evaluate(async sources=>{
    const images=await Promise.all(sources.map(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;})));
    if(images[0].width!==images[1].width||images[0].height!==images[1].height)return{changed:-1,maxDelta:255};
    const data=images.map(i=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data;});
    let changed=0,maxDelta=0;for(let k=0;k<data[0].length;k+=4){const delta=Math.max(...[0,1,2,3].map(j=>Math.abs(data[0][k+j]-data[1][k+j])));if(delta)changed++;maxDelta=Math.max(maxDelta,delta);}return{changed,maxDelta};
  },[old,shot].map(buffer=>'data:image/png;base64,'+buffer.toString('base64')));
  // Native glass can reflect approved article reflow. Foreground HTML/styles/layout
  // and native behavior are authoritative; report pixels without altering search.
  console.log(JSON.stringify({width,colorScheme,searchPixels:pixels}));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const escape = await page.evaluate(() => ({ searchChecked: document.querySelector('#__search').checked, active: document.activeElement.outerHTML }));
  assert.equal(escape.searchChecked, reference.escape.searchChecked, 'Native search toggle behavior changed');
  // Compare focus identity, not the entire body HTML which contains unrelated panels.
  assert.equal(escape.active.match(/^<([a-z0-9-]+)/i)?.[1], reference.escape.active.match(/^<([a-z0-9-]+)/i)?.[1], 'Native search Escape focus changed');
  const drawer = page.locator('.md-header__button[for="__drawer"]');
  if (await drawer.isVisible()) {
    await drawer.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#__drawer').checked);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#__drawer').checked);
    assert(await drawer.evaluate(el => document.activeElement === el), 'Drawer keyboard handling broke after native search Escape');
  }
  await trigger.click(); await input.fill('clipboard');
  const result = panel.locator('a[href*="#filename-and-clipboard"]').first();
  await result.waitFor({ state: 'visible' }); await result.click();
  await page.waitForFunction(() => location.hash === '#filename-and-clipboard');
  assert.equal(await page.evaluate(() => location.hash), reference.resultHash);
  return pixels;
}
async function panelsCheck(page) {
  for (const [id, selector, navigation] of [
    ['__drawer', '.md-header__button[for="__drawer"]', '.md-sidebar--primary'],
    ['__toc', '[data-strio-panel-trigger="toc"]', '.md-sidebar--secondary .md-sidebar__inner'],
  ]) {
    const trigger = page.locator(selector);
    if (!await trigger.isVisible()) continue;
    const closed = page.locator(navigation);
    assert.equal(await closed.evaluate(el => el.inert), true, `${id}: closed navigation must be inert`);
    for (const key of ['Enter', 'Space']) {
      await trigger.focus(); await page.keyboard.press(key);
      await page.waitForFunction(id => document.getElementById(id).checked, id);
      assert.equal(await closed.evaluate(el => el.inert), false, `${id}: open panel remains inert`);
      await page.keyboard.press('Tab');
      assert.equal(await closed.evaluate(el => el.contains(document.activeElement)), true, `${id}: Tab did not enter panel`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(id => !document.getElementById(id).checked, id);
      assert.equal(await trigger.evaluate(el => document.activeElement === el), true, `${id}: focus not returned`);
      assert.equal(await closed.evaluate(el => el.inert), true, `${id}: dismissed panel remains focusable`);
    }
    await trigger.click();
    if (id === '__drawer') {
      assert.equal(await closed.locator('.strio-panel-close').count(), 0, 'Drawer injected an extra Close control');
      const label = closed.locator('.md-nav--primary > .md-nav__title[for="__drawer"]');
      const bounds = await label.boundingBox();
      await label.click({ position: { x: bounds.width - 12, y: bounds.height / 2 } });
    } else {
      const close = closed.locator('.strio-panel-close');
      await page.waitForFunction(id => {
        const element = document.querySelector(`#strio-${id.slice(2)}-panel .strio-panel-close`);
        if (!element) return false;
        const bounds = element.getBoundingClientRect();
        const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return bounds.width > 0 && bounds.height > 0 && (target === element || element.contains(target));
      }, id);
      await close.click();
    }
    await page.waitForFunction(id => !document.getElementById(id).checked,id);
    assert(await trigger.evaluate(el=>document.activeElement===el),`${id}: pointer Close did not restore focus`);
  }
  const toc = page.locator('.md-sidebar--secondary');
  const trigger = page.locator('[data-strio-panel-trigger="toc"]');
  if (await trigger.isVisible()) await trigger.click();
  const target = toc.locator('a[href$="#admonitions"]').first();
  if (await target.count()) {
    await target.click();
    await page.waitForTimeout(300);
    if (await trigger.isVisible()) { await trigger.click(); await page.waitForTimeout(300); }
    const current = toc.locator('a[aria-current="location"], a.md-nav__link--active').last();
    assert(await current.count(), 'No active TOC entry');
    const visible = await current.evaluate(el => {
      const box = el.getBoundingClientRect(); let parent = el.parentElement;
      while (parent) { const c = getComputedStyle(parent); if (['auto','scroll'].includes(c.overflowY)) { const p = parent.getBoundingClientRect(); return box.height > 0 && box.top >= p.top - 1 && box.bottom <= p.bottom + 1; } parent = parent.parentElement; }
      return true;
    });
    assert(visible, 'Active TOC entry is outside its scroll container');
    if (await trigger.isVisible()) {
      const clip=await toc.evaluate(el=>{
        const nav=el.querySelector('.md-nav--secondary'),title=nav.querySelector(':scope > .md-nav__title'),list=nav.querySelector(':scope > .md-nav__list');
        const oldScroll=list.scrollTop;const before=title.getBoundingClientRect();list.scrollTop=list.scrollHeight;
        const after=title.getBoundingClientRect(),box=list.getBoundingClientRect();
        const hit=document.elementFromPoint(before.left+12,before.bottom-2);
        const result={titleStable:Math.abs(after.top-before.top)<1,belowTitle:box.top>=after.bottom-1,clipped:['auto','scroll'].includes(getComputedStyle(list).overflowY),noHeaderOverlap:!list.contains(hit)};
        list.scrollTop=oldScroll;return result;
      });
      assert(clip.titleStable&&clip.belowTitle&&clip.clipped&&clip.noHeaderOverlap,`TOC scrolling overlaps title: ${JSON.stringify(clip)}`);
      const close=toc.locator('.strio-panel-close');
      assert(await close.evaluate(el=>{const r=el.getBoundingClientRect();const target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&(target===el||el.contains(target));}),'TOC Close is not visibly reachable after active-entry reveal');
      await close.click();
    }
  }
}
async function articleCheck(page) {
  return page.evaluate(() => {
    const article = document.querySelector('.md-content__inner');
    const reading = [...article.querySelectorAll('p')].find(el => el.textContent.startsWith('This paragraph exercises'));
    const lines = {};
    if (reading) {
      const walker = document.createTreeWalker(reading, NodeFilter.SHOW_TEXT); let node;
      while ((node = walker.nextNode())) for (let i = 0; i < node.length; i++) {
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
        const y = range.getBoundingClientRect().y.toFixed(1); lines[y] = (lines[y] || '') + node.textContent[i];
      }
    }
    let within75ch = false;
    if (reading) {const span=document.createElement('span');span.style.cssText='display:block;position:absolute;visibility:hidden;width:75ch';reading.append(span);within75ch=reading.getBoundingClientRect().width<=span.getBoundingClientRect().width+1;span.remove();}
    return {
      within75ch,
      maxLine: Math.max(0, ...Object.values(lines).map(s => s.trim().length)),
      hasReading: !!reading,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      tables: [...article.querySelectorAll('table')].map(el => parseFloat(getComputedStyle(el).fontSize)),
      callouts: [...article.querySelectorAll('.admonition, details')].map(el => parseFloat(getComputedStyle(el).fontSize)),
      wideCode: [...article.querySelectorAll('pre > code')].filter(el => el.scrollWidth > el.clientWidth).map(el => getComputedStyle(el).overflowX),
      footer: (() => {const el = document.querySelector('.strio-footer-brand'); const box = el?.getBoundingClientRect(); return {count: document.querySelectorAll('.strio-footer-brand').length, height: box?.height, svgWidth: el?.querySelector('svg')?.getBoundingClientRect().width};})(),
    };
  });
}
async function focusCheck(page, colorScheme) {
  const selectors = [
    '.md-content__inner .md-button--primary',
    '.md-content__inner .md-button:not(.md-button--primary)',
    '.md-content__inner .md-code__button',
    '.md-content__inner p a:not(.md-button)',
    '.md-sidebar--primary a.md-nav__link',
    '.md-header [data-strio-panel-trigger]',
    '[data-strio-panel-trigger="toc"]',
    '.strio-footer-brand',
  ];
  const rows = [];
  for (const selector of selectors) {
    const control = page.locator(selector).filter({ visible: true }).first();
    if (!await control.count() || await control.evaluate(el => Boolean(el.closest('[inert]')))) continue;
    assert.equal(await page.locator('body').getAttribute('data-md-color-scheme'), colorScheme==='dark'?'slate':'default', 'Palette changed before focus sample');
    for (const hover of (selector.includes('.md-button:not') || selector.includes('.md-code__button') ? [false,true] : [false])) {
    if (hover) await control.hover(); else await page.mouse.move(0,0);
    const normal = await control.evaluate(el => {const c=getComputedStyle(el);return {border:c.borderColor,shadow:c.boxShadow};});
    await control.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    rows.push(await control.evaluate((el, normal) => {
      const rgba = color => {const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data];};
      const composite = (fg,bg) => fg.slice(0,3).map((v,i) => v*fg[3]/255 + bg[i]*(1-fg[3]/255));
      const ancestors=[]; for(let p=el;p;p=p.parentElement) ancestors.push(p);
      let outerBackground=[255,255,255]; for(const p of ancestors.slice(1).reverse()) outerBackground=composite(rgba(getComputedStyle(p).backgroundColor),outerBackground);
      const background=composite(rgba(getComputedStyle(el).backgroundColor),outerBackground);
      const lum = rgb => rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
      const contrast = (color,surface) => {const values=[lum(composite(rgba(color),surface)),lum(surface)].sort((a,b)=>a-b);return(values[1]+.05)/(values[0]+.05);};
      const c=getComputedStyle(el), colors=[];
      if(c.outlineStyle!=='none')colors.push([c.outlineColor,outerBackground]);
      if(c.borderStyle!=='none' && c.borderColor!==normal.border)colors.push([c.borderColor,background]);
      if(c.boxShadow!==normal.shadow)colors.push(...(c.boxShadow.match(/(?:rgba?|oklab|oklch|color)\([^)]*\)/g)||[]).map(color=>[color,c.boxShadow.includes('inset')?background:outerBackground]));
      return {label:el.getAttribute('aria-label')||el.textContent.trim(),visible:el.matches(':focus-visible'),ratio:Math.max(0,...colors.map(([color,surface])=>contrast(color,surface))),outline:c.outline,shadow:c.boxShadow,scheme:document.body.dataset.mdColorScheme,color:c.color,background:c.backgroundColor,outerBackground,fill:background,indicators:colors,token:c.getPropertyValue('--strio-control-focus'),fgLight:c.getPropertyValue('--md-default-fg-color--light')};
    }, normal));
    rows[rows.length-1].hover=hover;
    }
  }
  rows.forEach(row => {assert(row.visible, `Missing keyboard focus: ${row.label}`);assert(row.ratio >= 3, `Focus contrast ${row.ratio.toFixed(2)}: ${JSON.stringify(row)}`);});
  return rows;
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'chromium', args: ['--no-sandbox'] });
  const results=[];
  try {
    for (const colorScheme of ['light','dark']) for (const width of [320,390,768,1440]) {
      const page = await browser.newPage({ viewport: {width,height:900}, colorScheme });
      await page.goto(url, {waitUntil:'networkidle'});
      if(mode){results.push(await recordSearch(page,width,colorScheme));await page.close();continue;}
      const reference=baseline.find(row=>row.width===width&&row.colorScheme===colorScheme);assert(reference);
      const searchPixels=await searchCheck(page,reference,width,colorScheme);
      await page.goto(url,{waitUntil:'networkidle'});
      await panelsCheck(page);
      const article=await articleCheck(page);
      assert(article.hasReading,'Reading-measure specimen missing');assert(article.maxLine<80||article.within75ch,`Prose line has ${article.maxLine} characters and exceeds75ch`);
      assert(!article.documentOverflow,'Page overflows horizontally');
      assert(article.tables.length && article.tables.every(size=>size>=14),'Table text below14px');
      assert(article.callouts.length && article.callouts.every(size=>size>=14),'Callout text below14px');
      assert(article.wideCode.length && article.wideCode.every(x=>['auto','scroll'].includes(x)),'Wide code must scroll locally');
      assert.equal(article.footer.count,1);assert(article.footer.height>=44);assert.equal(article.footer.svgWidth,56);
      const focus=await focusCheck(page,colorScheme);
      await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(directory,`theme-after-${colorScheme}-${width}.png`),fullPage:true});
      results.push({colorScheme,width,article,focus,searchUnchanged:true,searchPixels,panels:true});await page.close();
    }
    if(mode){fs.writeFileSync(baselineFile,JSON.stringify(results,null,2));console.log(`Recorded ${results.length} native search states`);return;}
    fs.writeFileSync(path.join(directory,'theme-browser-results.json'),JSON.stringify(results,null,2));console.log(`Passed ${results.length} theme states; native search unchanged`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
