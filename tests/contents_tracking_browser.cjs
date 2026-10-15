// Focused motion regression for the --theme fixture from prepare_footer.py.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
const [fixture,output]=process.argv.slice(2);
assert(fixture&&output,'Usage: node contents_tracking_browser.cjs FIXTURE_SITE OUTPUT_DIR');
const root=path.resolve(fixture),out=path.resolve(output);fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 let file=path.join(root,new URL(req.url,'http://localhost').pathname);
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.otf':'font/otf'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
function read(){
 const trigger=document.querySelector('[data-strio-panel-trigger="toc"]'),sidebar=trigger.closest('.md-sidebar--secondary'),popup=sidebar.querySelector('.md-sidebar__inner'),r=trigger.getBoundingClientRect();
 const brand=document.querySelector('.strio-footer__brandbar').getBoundingClientRect();
 const actions=[...document.querySelectorAll('.strio-pagination:not([hidden]) .md-footer__link')].map(e=>e.getBoundingClientRect()).filter(b=>b.width&&b.height&&b.left<r.right&&b.right>r.left);
 const boundary=Math.min(brand.top,...actions.map(b=>b.top)),expected=Math.min(innerHeight-32,boundary-5);
 const header=document.querySelector('.md-header').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
 return {t:performance.now(),scroll:scrollY,height:innerHeight,top:r.top,bottom:r.bottom,width:r.width,heightButton:r.height,right:innerWidth-r.right,boundary,expected,error:r.bottom-expected,header:header.height,paginationGutter:getComputedStyle(document.querySelector('.strio-pagination')).paddingRight,pagination:[...document.querySelectorAll('.strio-pagination .md-footer__link')].map(e=>{const b=e.getBoundingClientRect(),h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {rect:b.toJSON(),hit:h===e||e.contains(h)};}),fullyVisible:r.top>=header.bottom&&r.bottom<=innerHeight,triggerHit:hit===trigger||trigger.contains(hit),sidebarTransition:getComputedStyle(sidebar).transitionDuration,popupTransform:getComputedStyle(popup).transform,popupTransition:getComputedStyle(popup).transition,popupRect:popup.getBoundingClientRect().toJSON(),brand:brand.toJSON(),actions:actions.map(b=>b.toJSON())};
}
async function move(page,to){
 await page.evaluate(({source,to})=>{
  const measure=eval('('+source+')'),start=performance.now();window.__tracking=[];
  function frame(){window.__tracking.push(measure());if(performance.now()-start<800)requestAnimationFrame(frame);}
  requestAnimationFrame(frame);scrollTo({top:to,behavior:'smooth'});
 },{source:read.toString(),to});
 await page.waitForTimeout(900);return page.evaluate(()=>window.__tracking);
}
async function settlePopup(page){
 await page.waitForFunction(()=>document.querySelector('#__toc').checked&&getComputedStyle(document.querySelector('.md-sidebar--secondary .md-sidebar__inner')).transform==='none',null,{timeout:2000});
}
function validate(trace,label){
 assert(trace.length>10,`${label}: missing continuous frames`);
 for(const f of trace){assert(Math.abs(f.error)<.1,`${label}: tracking error ${f.error}px at scroll${f.scroll}`);assert.equal(f.width,38);assert.equal(f.heightButton,38);assert.equal(f.right,16);assert.equal(f.header,64);assert.equal(f.sidebarTransition,'0s');assert(f.fullyVisible&&f.triggerHit,`${label}: trigger must remain visible and pointer-accessible`);}
 for(let i=1;i<trace.length;i++){const a=trace[i-1],b=trace[i],dy=b.scroll-a.scroll;
  if(dy>0)assert(b.top<=a.top+.1,`${label}: control reversed down while scrolling down`);
  if(dy<0)assert(b.top>=a.top-.1,`${label}: control reversed up while scrolling up`);
  if(dy===0)assert(Math.abs(b.top-a.top)<.1,`${label}: control settles or oscillates without scrolling`);
 }
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'chromium',args:['--no-sandbox']});const proof=[];
 try{for(const [width,height]of[[390,844],[390,664],[390,401],[390,400],[390,320],[320,320],[320,568]])for(const mode of['light','dark'])for(const route of['/','/details/']){
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,colorScheme:mode});await page.goto(`http://127.0.0.1:${server.address().port}${route}`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
  const initial=await page.evaluate(read),max=await page.evaluate(()=>Math.max(0,document.scrollingElement.scrollHeight-innerHeight));
  if(initial.boundary>=height-27)assert.equal(initial.bottom,height-32,'Reading anchor must stay in corner');
  const start=Math.max(0,max-350);await page.evaluate(top=>scrollTo({top,behavior:'instant'}),start);await page.waitForTimeout(100);
  const prefix=`${mode}-${route==='/'?'home':'details'}-${width}x${height}`;
  await page.screenshot({path:path.join(out,prefix+'-corner.png')});
  const down=await move(page,max);validate(down,prefix+' down');const end=await page.evaluate(read);
  await page.screenshot({path:path.join(out,prefix+'-footer.png')});
  assert(end.pagination.every(link=>link.hit),'Pagination must remain pointer-accessible beside contents');
  assert.equal(end.paginationGutter,height<=400?'54px':'0px');
  const up=await move(page,start);validate(up,prefix+' up');
  await page.evaluate(top=>scrollTo({top,behavior:'instant'}),max);await page.waitForTimeout(100);
  const trigger=page.locator('[data-strio-panel-trigger="toc"]');await trigger.click();await settlePopup(page);
  const opened=await page.evaluate(()=>{
   const p=document.querySelector('.md-sidebar--secondary .md-sidebar__inner'),h=document.querySelector('.md-header').getBoundingClientRect(),r=p.getBoundingClientRect(),active=document.activeElement;
   return {checked:document.querySelector('#__toc').checked,inert:p.inert,rect:r.toJSON(),headerBottom:h.bottom,transform:getComputedStyle(p).transform,transition:getComputedStyle(p).transition,activeIn:p.contains(active)};
  });assert(opened.checked&&!opened.inert);assert.equal(opened.transform,'none');assert(opened.rect.top>=opened.headerBottom+7.99&&opened.rect.bottom<=height+.1,'Popup must clear header and viewport');
  await page.keyboard.press('Escape');assert(await trigger.evaluate(e=>document.activeElement===e),'Escape returns focus');
  await trigger.focus();await page.keyboard.press('Enter');await settlePopup(page);assert(await page.locator('#__toc').isChecked(),'Keyboard opens contents');assert(await page.locator('.md-sidebar--secondary .md-sidebar__inner').evaluate(e=>e.contains(document.activeElement)),'Keyboard places focus inside popup');await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'reduce'});await trigger.focus();await page.keyboard.press('Space');assert.equal(await page.locator('.md-sidebar--secondary .md-sidebar__inner').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await page.keyboard.press('Escape');
  proof.push({width,height,mode,route,initial,end,down,up,opened});console.log(JSON.stringify({width,height,mode,route,frames:down.length+up.length,maxError:Math.max(...down.concat(up).map(x=>Math.abs(x.error))),initialBottomInset:height-initial.bottom,footerInset:height-end.bottom,header:initial.header,footerTriggerFullyVisible:end.fullyVisible,footerTriggerHit:end.triggerHit,passed:true}));await page.close();
 }}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'tracking-proof.json'),JSON.stringify(proof,null,2)+'\n');}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
