// Development-only browser checks. Runtime site has no Playwright dependency.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('site');
const catalogue = JSON.parse(await readFile(`${root}/data/sparql/v1/catalogue.json`));
function queryStatus(query, queryIndex, engineIndex) {
 if (engineIndex !== 0) return 'PASS';
 if (query.primaryFeature === 'PROPERTY_PATH' || queryIndex === 1) return 'TIMEOUT';
 return queryIndex === 2 ? 'MISMATCH' : 'PASS';
}
function loadingError(status) {
 if (status === 'OOM') return 'Heap limit (8 GB) exceeded';
 return status === 'TIMEOUT' ? 'Load timed out after 600 s' : '';
}
const fixture = { metadata: {}, runs: [], queryRuns: catalogue.queries.flatMap((q,i) =>
 ['corese.next','jena.6.2.0','rdf4j.5.1.3'].map((engine,j) => ({
  engine, dataset:q.dataset, queryId:q.id, queryCategory:q.primaryFeature,
  medianMs: [10, 20, 40][j], medianTtfrMs: j + 0.25,
  status:queryStatus(q, i, j),
  repetitionsStatuses:['PASS','PASS','PASS'], repetitionsMs:[10,10,10],
 }))) };
fixture.queryRuns = fixture.queryRuns.filter(run=>!(run.engine==='rdf4j.5.1.3' && run.queryCategory==='NAMED_GRAPH'));
fixture.loadingRuns = [
 ['corese.next','SUCCESS'], ['jena.6.2.0','OOM'], ['corese.4.6.5','TIMEOUT'], ['corese.4.6.4','TIMEOUT'],
 ['jena.6.2.0.tdb2','SUCCESS'], ['rdf4j.6.1.0.native','OOM'], ['rdf4j.6.1.0.lmdb','OOM'],
].map(([engine,status])=>({engine,status,dataset:'bsbm',file:'bsbm_medium.nt',format:'nt',triples:1000000,
 loadingTimeMs:status==='SUCCESS'?1000:-1,throughputTriplesPerSec:status==='SUCCESS'?1000000:-1,
 memoryDeltaMb:status==='SUCCESS'?128:-1,diskFootprintBytes:status==='SUCCESS'?2000000:-1,
 repetitionsMs:status==='SUCCESS'?[1000,1000,1000]:[-1],errorMessage:loadingError(status),
 timeSeries:status==='SUCCESS'?[{elapsedMs:0,heapUsedMb:1},{elapsedMs:1000,heapUsedMb:128}]:[]}));
fixture.runs = fixture.loadingRuns;
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}), args:['--no-sandbox']});
try {
 const page = await browser.newPage({viewport:{width:1440,height:1050}});
 const errors = [];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='warning') errors.push(message.text());});
 const base = 'http://corese.test';
 await page.route('**/*', async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === '/data/benchmark-report.json') {
   await route.fulfill({json:fixture}); return;
  }
  try {
   const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
   if (!path.startsWith(`${root}/`)) {await route.fulfill({status:403});return;}
   await route.fulfill({body:await readFile(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.rq':'text/plain'})[extname(path)] || 'application/octet-stream'});
  } catch {await route.fulfill({status:404});}
 });
 await page.goto(`${base}/?engines=corese.next,jena.6.2.0,rdf4j.5.1.3&sf-chart=radar&sf-q=absent&sf-feature=NAMED_GRAPH#sparql`);
 await page.waitForSelector('[data-sf-query]');
 const chart = () => page.evaluate(() => {
  const c = Chart.getChart(document.querySelector('.sf-view canvas'));
  return {type:c.config.type, indexAxis:c.options.indexAxis, labels:c.data.labels,
   series:c.data.datasets.map(s=>({label:s.label,data:s.data,color:Array.isArray(s.backgroundColor) ? s.backgroundColor[0] : s.backgroundColor})),
   count:Object.keys(Chart.instances).length};
 });
 const view = page.locator('.sf-view');
 assert.equal(await view.locator('[data-sf-query]').count(),15);
 assert.equal(await view.locator('h3').allTextContents().then(t=>t.slice(0,2).join('|')),'Feature comparison|Query details');
 assert.equal(await view.locator('input, select, [data-sf-state="chart"], [data-sf-state="reference"], [data-sf-state="feature"], [data-sf-notice], .kpi-grid').count(),0);
 assert.equal(await view.locator('.protocol-tile').count(),1);
 assert.equal(await view.locator('.protocol-tile').evaluate(e=>e.open),false);
 assert.equal(await view.locator('.sf-dataset-card').count(),5);
 assert.equal(await view.locator('[data-sf-chart-meta]').textContent(),'15 queries · Median of query medians · Lower is better');
 assert.equal(await view.locator('[data-sf-table-meta]').textContent(),'15 queries · Median execution time (ms) · Lower is better · Result validation');
 let data = await chart();
 assert.equal(data.type,'bar'); assert.equal(data.indexAxis,'y'); assert.equal(data.count,1);
 assert.equal(data.labels.length,9);
 assert.equal(await page.evaluate(()=>Chart.getChart(document.querySelector('.sf-view canvas'))._statusBadgeHitBoxes.some(box=>box.statusInfo.status==='MISSING')),true);
 assert.equal(await view.locator('.sf-badge--missing').count(),2);
 assert.deepEqual(data.series.find(s=>s.label==='corese.next').data,[10,null,10,10,10,10,10,10,10]);
 assert.equal(data.series.find(s=>s.label==='corese.next').color,'#00b4d8');
 assert.equal(data.series.find(s=>s.label==='jena.6.2.0').color,'#d55e00');
 assert.equal(data.series.find(s=>s.label==='rdf4j.5.1.3').color,'#00664b');
 assert.ok(!page.url().includes('sf-chart=')); assert.ok(!page.url().includes('sf-q='));
 // Null badges must be interactive through real DOM pointer events and native tooltips.
 const badgePoint = await page.evaluate(() => {
  const canvas = document.querySelector('.sf-view canvas'), c = Chart.getChart(canvas);
  const box = c._statusBadgeHitBoxes.find(b => b.statusInfo.status === 'TIMEOUT');
  const rect = canvas.getBoundingClientRect();
  return {x:rect.left+box.x+box.w/2,y:rect.top+box.y+box.h/2};
 });
 await page.mouse.move(badgePoint.x,badgePoint.y);
 await page.waitForFunction(() => {
  const c = Chart.getChart(document.querySelector('.sf-view canvas'));
  return c.tooltip.opacity > 0 && c.tooltip.dataPoints?.[0]?.raw === null;
 });
 assert.ok(await page.evaluate(() => Chart.getChart(document.querySelector('.sf-view canvas')).tooltip.body.some(b=>b.lines.some(l=>l.includes('TIMEOUT')))));
 await page.mouse.click(badgePoint.x,badgePoint.y);
 assert.equal(await page.evaluate(()=>window.focusStore.state.pinned.kind),'bar');
 await page.keyboard.press('Escape');
 await view.locator('.protocol-tile > summary').click();
 assert.ok((await view.locator('[data-sf-inputs]').textContent()).includes('lubm_small.nt'));
 assert.equal(await view.locator('[data-sf-inputs] a[href*="unzip_small/lubm_small.nt"]').count(), 1);
 assert.equal(await view.locator('[data-sf-inputs] [data-sf-dataset-size]').count(), 5);
 assert.equal(await view.locator('[data-sf-dataset-size="bsbm"]').textContent(), '—');
 await view.locator('[data-sf-sort="medianMs:corese.next"]').click();
 assert.equal(await view.locator('th[aria-sort="ascending"]').count(),1);
 assert.equal(await view.locator('[data-sf-sort="medianMs:corese.next"]').evaluate(e=>e===document.activeElement),true);
 await view.locator('[data-sf-query-toggle]').first().focus();
 await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>window.focusStore.state.pinned.kind),'query');
 await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.focusStore.state.pinned),null);
 const cellPin = view.locator('td[data-cell-key] .table-pin').first();
 await cellPin.focus();
 await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>window.focusStore.state.pinned.kind),'cell');
 assert.equal(await cellPin.getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Space');
 assert.equal(await page.evaluate(()=>window.focusStore.state.pinned),null);
 assert.equal(await cellPin.getAttribute('aria-pressed'),'false');
 await view.locator('[data-sf-jump-query]').first().click();
 await page.waitForSelector('.sf-query-item[open] code .sf-token-keyword');
 assert.ok((await view.locator('.sf-query-item[open] code').textContent()).includes('SELECT'));
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';window.dispatchEvent(new Event('theme-changed'));});
 assert.equal((await chart()).count,1);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.goto(`${base}/?dataset=bsbm&formats=nt&engines=${fixture.loadingRuns.map(run=>run.engine).join(',')}#loading`);
 await page.waitForSelector('#loading-summary-chart');
 await page.locator('.protocol-tile > summary').click();
 assert.equal(await page.locator('[data-sf-dataset-size="bsbm"]').textContent(), '1,000,000 triples');
 assert.equal(await page.locator('[data-sf-dataset-size]').count(), 5);
 assert.equal(await page.locator('[data-sf-inputs] a[href*="view_small_medium/bsbm_medium.nt"]').count(), 1);
 await page.waitForFunction(()=>Chart.getChart(document.getElementById('loading-memory-chart'))?._statusBadgeHitBoxes?.length===3);
 const loading = await page.evaluate(()=>Object.fromEntries(['summary','memory','disk'].map(name=>{
  const c=Chart.getChart(document.getElementById(`loading-${name}-chart`));
  return [name,{badges:c._statusBadgeHitBoxes.map(box=>box.statusInfo.status), data:c.data.datasets.flatMap(ds=>ds.data)}];
 })));
 assert.equal(loading.summary.badges.length,5);
 assert.deepEqual(loading.memory.badges.sort(),['OOM','TIMEOUT','TIMEOUT']);
 assert.deepEqual(loading.disk.badges.sort(),['OOM','OOM']);
 assert.equal(loading.memory.data.filter(value=>value===null).length,3);
 assert.equal(loading.disk.data.filter(value=>value===null).length,2);
 assert.equal(await page.locator('.telemetry-status-strip button').count(),5);
 assert.ok(!(await page.locator('.data-table').textContent()).includes('-1'));
 const telemetryFailure = page.locator('.telemetry-status-strip button').first();
 await telemetryFailure.click();
 assert.equal(await telemetryFailure.getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Escape');
 fixture.loadingRuns = fixture.loadingRuns.map(run=>({...run,status:'ERROR',timeSeries:[],errorMessage:'Loading failed'}));
 await page.reload(); await page.waitForSelector('.telemetry-status-strip');
 assert.equal(await page.locator('.telemetry-status-strip button').count(),7);
 assert.equal(await page.locator('#loading-telemetry-chart').count(),0);
 await page.goto(`${base}/?engines=corese.next,jena.6.2.0,rdf4j.5.1.3#sparql`);
 await page.waitForSelector('[data-sf-query]');
 assert.equal((await chart()).count,1);
 // With every run failed, render badges instead of hiding the whole chart.
 fixture.queryRuns = fixture.queryRuns.map(run => ({...run,status:'ERROR',medianMs:null}));
 await page.reload(); await page.waitForSelector('[data-sf-query]');
 await page.waitForFunction(()=>Chart.getChart(document.querySelector('.sf-view canvas'))?._statusBadgeHitBoxes?.length===27);
 assert.equal(await view.locator('[data-sf-chart-empty]').isVisible(),false);
 assert.ok((await chart()).series.every(series=>series.data.every(value=>value===null)));
 await page.route('**/data/sparql/v1/catalogue.json',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.reload(); await page.waitForSelector('[data-sf-retry]');
 await page.unroute('**/data/sparql/v1/catalogue.json');
 await page.locator('[data-sf-retry]').click(); await page.waitForSelector('[data-sf-query]');
 assert.deepEqual(errors,[]);
 console.log('Browser: minimal layout, absolute timings, official colors, status badges, null tooltips, pinning, all-failed coverage, sorting, query sources, keyboard, URL, theme, mobile, teardown and retry passed.');
} finally {await browser.close();}
