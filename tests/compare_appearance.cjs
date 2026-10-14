// Identical content and identity are prerequisites; compare_pixels includes mobile drawer.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const [baseline, consumer] = process.argv.slice(2);
assert(baseline && consumer, "Pass baseline and consumer URLs");
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || "chromium", args: ["--no-sandbox"]});
  try {
    const compare = await browser.newPage();
    for (const colorScheme of (process.env.SCHEMES || "light,dark").split(",")) for (const width of (process.env.WIDTHS || "390,599,600,601,719,720,959,960,1219,1220,1440").split(",").map(Number)) {
      const captures = [];
      const geometry = [];
      for (const url of [baseline, consumer]) {
        const page = await browser.newPage({viewport: {width, height: 900}, colorScheme});
        await page.goto(url, {waitUntil: "networkidle"});
        await page.addStyleTag({content: '.md-source__facts {display:none!important} *, *::before, *::after {animation:none!important;transition:none!important;caret-color:transparent!important}'});
        geometry.push(await page.evaluate(() => {
          const rect = selector => {const box=document.querySelector(selector).getBoundingClientRect(); return [box.x, box.y, box.width, box.height];};
          return {logo:rect('.md-header__button.md-logo img'), hamburger:rect('.md-header__button[for="__drawer"]')};
        }));
        const shots=[await page.screenshot({fullPage:true})];
        if (await page.locator('.md-header__button[for="__drawer"]').isVisible()) {
          await page.locator('.md-header__button[for="__drawer"]').click();
          assert.equal(await page.locator('#__drawer').isChecked(), true);
          shots.push(await page.screenshot({fullPage:true}));
        }
        captures.push(shots);
        await page.close();
      }
      assert.deepEqual(geometry[0], geometry[1], "Header/hamburger geometry differs");
      for (let state=0;state<captures[0].length;state++) {
        const data=captures.map(shots=>'data:image/png;base64,'+shots[state].toString('base64'));
        const difference=await compare.evaluate(async sources=>{
          const images=await Promise.all(sources.map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=src;})));
          if(images[0].width!==images[1].width||images[0].height!==images[1].height)return {changed:-1,maxDelta:255};
          const pixels=images.map(i=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data;});
          let changed=0,maxDelta=0;for(let k=0;k<pixels[0].length;k+=4){const delta=Math.max(...[0,1,2,3].map(j=>Math.abs(pixels[0][k+j]-pixels[1][k+j])));if(delta)changed++;maxDelta=Math.max(maxDelta,delta);}
          return {changed,maxDelta};
        },data);

        const directory=process.env.SCREENSHOT_DIR || "/tmp";
        captures.forEach((shots,i)=>fs.writeFileSync(`${directory}/parity-${i}-${colorScheme}-${width}-${state}.png`,shots[state]));
        console.log(JSON.stringify({colorScheme,width,state,...difference,header:geometry[0]}));
        // Chromium produced sparse 1-level raster noise when comparing the same
        // baseline twice. Geometry is exact and all raw differences are reported.
        assert(difference.changed>=0 && difference.changed<=10 && difference.maxDelta<=1, `Drawer pixels differ: ${JSON.stringify(difference)}`);
      }
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
