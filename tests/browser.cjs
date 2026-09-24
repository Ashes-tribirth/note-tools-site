const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/analytics/data.json',r=>r.fulfill({status:404,body:''}));
 await page.route('**/analytics/status.json',r=>r.fulfill({json:{state:'setup_required'}}));
 await page.goto('http://127.0.0.1:8765/analytics/');await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('設定待ち'));
 assert(await page.locator('#report').isHidden());
 const rows=[{name:'分析',count:14,previous:9,scope:'all'}];
 const period={start:'2026-09-17',end:'2026-09-23',previousStart:'2026-09-10',previousEnd:'2026-09-16',current:{users:42,sessions:63,views:136,searches:31,clicks:57},previous:{users:35,sessions:51,views:122,searches:32,clicks:46},daily:Array.from({length:7},(_,i)=>({date:`2026-09-${17+i}`,users:i+2,views:i*3,searches:i,clicks:i+1})),tools:{status:'ok',rows:[{name:'これは検証用のとても長いツール名です・公開データではありません',author:'テスト作者',count:26,previous:0}]},keywords:{status:'ok',rows,withheld:3},zeroSearches:{status:'ok',rows},filters:{status:'ok',rows:[{name:'活動を分析・記録する',kind:'カテゴリ',count:7,previous:2}]},sources:[{name:'note',count:30},{name:'検索エンジン',count:14},{name:'直接アクセス',count:18},{name:'その他',count:1}],audience:{new:24,returning:22}};
 let fixture={schemaVersion:1,generatedAt:new Date().toISOString(),timezone:'Asia/Tokyo',periods:{'7':period,'30':{...period,current:{...period.current,users:120}},today:{...period,throughHour:8}},warnings:[]};
 await page.route('**/analytics/data.json',r=>r.fulfill({json:fixture}));
 await page.route('**/analytics/status.json',r=>r.fulfill({json:{state:'ok'}}));
 await page.reload();await page.waitForSelector('#report:not([hidden])');
 assert((await page.locator('#metrics').innerText()).includes('42'));
 await page.screenshot({path:'mobile-check.png',fullPage:true});
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);}
 await page.locator('[data-period="30"]').click();assert((await page.locator('#metrics').innerText()).includes('120'));
 await page.locator('[data-period="today"]').click();assert((await page.locator('#notice').innerText()).includes('0時〜8時'));
 fixture.generatedAt='2020-01-01T00:00:00Z';await page.route('**/analytics/status.json',r=>r.fulfill({json:{state:'error'}}));await page.reload();await page.waitForSelector('#report:not([hidden])');assert((await page.locator('#notice').innerText()).includes('前回成功'));
 fixture.periods['7'].tools={status:'unavailable',reason:'GA4のカスタム定義が未登録です',rows:[]};fixture.periods['7'].keywords={status:'ok',rows:[]};await page.reload();await page.waitForSelector('#report:not([hidden])');assert((await page.locator('#tools').innerText()).includes('未登録'));assert((await page.locator('#keywords').innerText()).includes('記録はありません'));
 // Existing app, captured analytics with all external requests blocked.
 await page.route('https://**/*',r=>r.abort());
 await page.goto('http://127.0.0.1:8765/');await page.waitForSelector('.card');
 const count=await page.locator('.card').count();assert(count>0);
 await page.evaluate(()=>{window.captured=[];window.compassAnalytics={event:(name,params)=>captured.push({name,params})};});
 await page.locator('#searchInput').fill('zzzzzz-no-match');await page.waitForTimeout(850);
 let tracked=await page.evaluate(()=>captured);assert(tracked.some(e=>e.name==='compass_search_zero'&&e.params.result_count===0&&e.params.search_scope==='all'));
 await page.locator('#searchInput').fill('private@example.com');await page.waitForTimeout(850);tracked=await page.evaluate(()=>captured);assert(tracked.some(e=>e.params.search_term==='[非収集]'));
 await page.locator('#resetBtn').click();assert.equal(await page.locator('.card').count(),count);
 await page.locator('#categoryFilter').selectOption({index:1});await page.locator('#searchInput').fill('zzzz-no-match');await page.waitForTimeout(850);tracked=await page.evaluate(()=>captured);assert(tracked.some(e=>e.name==='compass_search_zero'&&e.params.search_scope==='filtered'));
 await page.locator('#resetBtn').click();await page.locator('.favorite-btn').first().click();await page.locator('#favoriteFilter').check();assert.equal(await page.locator('.card').count(),1);await page.locator('#resetBtn').click();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',existingCards:count,widths:[320,390,768,1440],checks:['periods','charts','rankings','missing','stale','zero results','masked search','filters','favorites','no JS errors']}));
 await browser.close();
})();
