// Rendered project-accent, shared-syntax and native-search isolation checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const [amberSite, blueSite, output] = process.argv.slice(2);
assert(amberSite && blueSite && output, 'Usage: node tests/palette_browser.cjs AMBER_SITE BLUE_SITE OUTPUT_DIR');
const directory = path.resolve(output);
fs.mkdirSync(directory, {recursive:true});
const sites = {amber:path.resolve(amberSite), blue:path.resolve(blueSite)};
const rgb = color => color.match(/[\d.]+/g).slice(0,3).map(Number);
const luminance = color => rgb(color).reduce((sum, channel, index) => {
  const value = channel / 255;
  return sum + [0.2126,0.7152,0.0722][index] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
}, 0);
const contrast = (a,b) => { const levels = [luminance(a),luminance(b)].sort((x,y)=>x-y); return (levels[1]+0.05)/(levels[0]+0.05); };
// Resolve the actual rendered surface, including transparent token backgrounds.
const syntax = page => page.evaluate(() => {
  const background = element => {
    let result = [0,0,0,0];
    for(let current=element; current && result[3]<1; current=current.parentElement) {
      const value=getComputedStyle(current).backgroundColor.match(/[\d.]+/g).map(Number);
      const alpha=value[3]??1;
      const nextAlpha=result[3]+alpha*(1-result[3]);
      if(nextAlpha)result=[...value.slice(0,3).map((channel,index)=>(result[index]*result[3]+channel*alpha*(1-result[3]))/nextAlpha),nextAlpha];
    }
    return `rgb(${result.slice(0,3).join(', ')})`;
  };
  return [...document.querySelectorAll('.md-content code, .md-content code span')]
    .filter(element=>element.textContent.trim())
    .map(element=>({text:element.textContent,class:element.className,color:getComputedStyle(element).color,background:background(element)}));
});
const nativeSearch = page => page.evaluate(() => {
  const search = [...document.querySelectorAll('body > div')].find(element => element.shadowRoot)?.shadowRoot;
  const triggers = [...document.querySelectorAll('.md-search__button, .md-header__button[for="__search"]')];
  const css = element => {
    const styles=getComputedStyle(element);
    return Object.fromEntries([...styles].filter(name=>!name.startsWith('--strio-palette-')).map(name=>[name,styles.getPropertyValue(name)]));
  };
  const snapshot=element=>({tag:element.tagName, css:css(element),rect:element.getBoundingClientRect().toJSON()});
  return {html:search?.innerHTML, elements:[...(search?.querySelectorAll('*')||[])].map(snapshot), triggers:triggers.map(snapshot)};
});
const startServer = async folder => {
  const server=http.createServer((request,response)=>{
    const location=new URL(request.url,'http://localhost').pathname.replace(/^\/acme\//,'/');
    let file=path.join(folder,location);
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!file.startsWith(folder+'/')||!fs.existsSync(file)){response.writeHead(404);response.end();return;}
    response.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,base:`http://127.0.0.1:${server.address().port}/acme/`};
};
(async()=>{
 const hosts={};
 for(const accent of ['amber','blue'])hosts[accent]=await startServer(sites[accent]);
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox']});
 const evidence=[];
 try {
  for(const colorScheme of ['light','dark'])for(const width of [390,1440]){
   const samples={};
   for(const accent of ['amber','blue']) {
    const page=await browser.newPage({viewport:{width,height:1000},colorScheme});
    await page.goto(hosts[accent].base,{waitUntil:'networkidle'});
    await page.waitForTimeout(220);
    const button=page.locator('.md-content .md-button--primary').first();
    const sample = () => button.evaluate(element=>{const style=getComputedStyle(element);return {color:style.color,background:style.backgroundColor,focus:style.outlineColor,outlineWidth:style.outlineWidth,focused:element.matches(':focus-visible')};});
    const normal=await sample();
    assert.equal(normal.background,accent==='amber'?'rgb(157, 107, 53)':'rgb(72, 118, 186)');
    assert(contrast(normal.color,normal.background)>=4.5);
    for(const surface of ['rgb(255,255,255)','rgb(245,246,245)','rgb(21,21,21)','rgb(32,32,32)'])assert(contrast(normal.background,surface)>=3);
    await button.hover();await page.waitForTimeout(220);
    const hover=await sample();assert.notEqual(hover.background,normal.background);assert(contrast(hover.color,hover.background)>=4.5);
    await page.mouse.move(0,0);await button.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    const focus=await sample();assert(focus.focused);assert.equal(focus.focus,normal.background);assert.equal(focus.outlineWidth,'2px');
    const code=await syntax(page);assert(code.length>15);
    const expectedSurface=colorScheme==='light'?'rgb(248, 248, 248)':'rgb(32, 32, 32)';
    for(const token of code) {
      assert.equal(token.background,expectedSurface,'Block and inline code must retain Coopr surface separation');
      assert(contrast(token.color,token.background)>=4.5,`syntax contrast ${token.class} ${token.color} on ${token.background}`);
    }
    const inline=page.locator('.md-content p code').first();
    assert(await inline.count(),'Fixture must exercise inline code');
    const syntaxTones=await page.locator('.md-content .highlight code').first().evaluate(element=>{
      const names=['fg','hl-keyword','hl-string','hl-number','hl-constant','hl-function','hl-name','hl-variable','hl-special','hl-operator','hl-punctuation','hl-comment','hl-generic','hl-error'];
      const probe=document.createElement('span');element.append(probe);
      const colors=Object.fromEntries(names.map(name=>{probe.style.color=`var(--md-code-${name}-color)`;return [name,getComputedStyle(probe).color];}));
      probe.remove();return colors;
    });
    for(const [name,color] of Object.entries(syntaxTones))assert(contrast(color,expectedSurface)>=4.5,`declared syntax contrast ${name} ${color}`);
    assert.equal(syntaxTones['hl-special'],colorScheme==='light'?'rgb(65, 107, 171)':'rgb(143, 172, 213)');
    const tabIndicator=await page.locator('.tabbed-labels').first().evaluate(element=>getComputedStyle(element,'::before').backgroundColor);
    assert.equal(tabIndicator,normal.background);
    await page.locator('.md-content .highlight').first().screenshot({path:path.join(directory,`${accent}-${colorScheme}-${width}-code.png`)});
    await page.goto(hosts[accent].base+'components/',{waitUntil:'networkidle'});await page.waitForTimeout(220);
    const link = await page.locator('.md-content p a:not(.md-button)').first().evaluate(element=>({color:getComputedStyle(element).color,decoration:getComputedStyle(element).textDecorationColor,style:getComputedStyle(element).textDecorationLine}));
    assert.equal(link.decoration,normal.background);assert(link.style.includes('underline'));
    await page.screenshot({path:path.join(directory,`${accent}-${colorScheme}-${width}-components.png`),fullPage:true});
    const trigger=page.locator(width<960?'.md-header__button[for="__search"]':'.md-search__button');
    await trigger.click();await page.getByPlaceholder('Search',{exact:true}).fill('guide');await page.waitForTimeout(650);
    const withPalette=await nativeSearch(page);
    await page.evaluate(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].filter(link=>/\/(palette|strio-accent)(?:\.[0-9a-f]{12})?\.css$/.test(link.href)).forEach(link=>link.disabled=true));
    await page.waitForTimeout(220);
    assert.deepEqual(await nativeSearch(page),withPalette,'Palette modified native search');
    await page.evaluate(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].filter(link=>/\/(palette|strio-accent)(?:\.[0-9a-f]{12})?\.css$/.test(link.href)).forEach(link=>link.disabled=false));
    await page.waitForTimeout(220);
    await page.keyboard.press('Escape');await page.mouse.move(0,0);await page.waitForTimeout(350);
    const escapeWithPalette = await nativeSearch(page);
    const escapeFocus = await page.evaluate(()=>document.activeElement.tagName);
    await trigger.click();await page.getByPlaceholder('Search',{exact:true}).fill('guide');await page.waitForTimeout(650);
    await page.evaluate(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].filter(link=>/\/(palette|strio-accent)(?:\.[0-9a-f]{12})?\.css$/.test(link.href)).forEach(link=>link.disabled=true));
    await page.waitForTimeout(220);await page.keyboard.press('Escape');await page.mouse.move(0,0);await page.waitForTimeout(350);
    // The native spring animation's transient rectangles vary by subpixel.
    // Open-state styles/geometry above are exact; dismissal compares DOM+focus.
    assert.equal((await nativeSearch(page)).html,escapeWithPalette.html,'Palette modified native Escape DOM');
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),escapeFocus,'Palette modified native Escape focus');
    samples[accent]={normal,hover,focus,syntax:code,syntaxTones,nativeSearchExactlyUnchanged:true,nativeEscapeHTMLExactlyUnchanged:true};
    await page.close();
   }
   assert.deepEqual(samples.amber.syntax,samples.blue.syntax,'Project accent modified shared syntax');
   assert.deepEqual(samples.amber.syntaxTones,samples.blue.syntaxTones,'Project accent modified declared syntax tones');
   evidence.push({colorScheme,width,amber:samples.amber.normal,blue:samples.blue.normal,amberHover:samples.amber.hover,blueHover:samples.blue.hover,amberFocus:samples.amber.focus,blueFocus:samples.blue.focus,nativeSearchExactlyUnchanged:true,nativeEscapeHTMLExactlyUnchanged:true,sharedSyntaxExactlyUnchanged:true,syntaxSamples:samples.amber.syntax.length,codeSurface:samples.amber.syntax[0].background,minimumSyntaxContrast:Math.min(...samples.amber.syntax.map(token=>contrast(token.color,token.background))),syntaxTones:samples.amber.syntaxTones});
  }
 } finally {await browser.close();for(const host of Object.values(hosts))host.server.close();}
 fs.writeFileSync(path.join(directory,'render-proof.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
})().catch(error=>{console.error(error);process.exit(1)});
