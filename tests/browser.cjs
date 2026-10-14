const {chromium}=require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM || 'chromium',headless:true,args:['--no-sandbox']});
 const errors=[]; const results=[];
 for(const scheme of ['light','dark']) for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:900},colorScheme:scheme});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url()+':'+r.status())});
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8000/',{waitUntil:'networkidle'});
  const state=await page.evaluate(()=>({scheme:document.body.dataset.mdColorScheme,bg:getComputedStyle(document.body).backgroundColor,code:getComputedStyle(document.querySelector('pre code')).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,copies:document.querySelectorAll('.md-code__button').length}));
  if(state.overflow||state.copies<2||state.scheme!==(scheme==='dark'?'slate':'default'))throw Error(JSON.stringify(state));
  const logo = page.locator('.md-header__button.md-logo img');
  if (!await logo.isVisible()) throw Error('Acme logo hidden');
  const logoState = await logo.evaluate(el => ({src:el.getAttribute('src'), loaded:el.complete && el.naturalWidth>0, filter:getComputedStyle(el).filter, width:el.getBoundingClientRect().width}));
  if (!logoState.src.endsWith('assets/acme-corner.svg') || !logoState.loaded || logoState.width < 50 || logoState.filter !== (scheme==='dark'?'invert(1)':'none')) throw Error(JSON.stringify(logoState));
  if (width === 390) {
    const menuBox = await page.locator('.md-header__button[for="__drawer"]').boundingBox();
    const logoBox = await logo.boundingBox();
    if (!menuBox || menuBox.x + menuBox.width > logoBox.x) throw Error('Hamburger must precede the logo, matching Coopr');
  }
  await page.screenshot({path:`${process.env.SCREENSHOT_DIR || '/tmp'}/acme-${scheme}-${width}.png`,fullPage:true});
  await page.getByRole('link',{name:'Read details'}).click();await page.waitForURL('**/details/');
  results.push({scheme,width,...state});await page.close();
 }
 await browser.close();if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
