const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='https://ashes-tribirth.github.io';
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
 const r=await page.goto(origin+'/note-tools-site/analytics/');assert.equal(r.status(),200);
 await page.waitForFunction(()=>!document.querySelector('#notice').textContent.includes('読み込んでいます'));
 assert(!(await page.locator('#notice').innerText()).includes('形式を読み取れません'));
 await page.screenshot({path:'live-mobile.png',fullPage:true});
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 for(const period of ['today','30','7']){await page.locator(`[data-period="${period}"]`).click();assert.equal(await page.locator(`[data-period="${period}"]`).getAttribute('aria-pressed'),'true');}
 await page.goto(origin+'/note-tools-site/');await page.waitForSelector('.card');
 const count=await page.locator('.card').count();assert(count>0);
 await page.locator('#searchInput').fill('zzzz-no-match');assert.equal(await page.locator('.card').count(),0);
 await page.locator('#resetBtn').click();assert.equal(await page.locator('.card').count(),count);
 assert(await page.locator('.card a').evaluateAll(links=>links.every(link=>new URL(link.href).hostname==='note.com')));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({live:'passed',existingCards:count}));await browser.close();
})();
