// Development-only browser checks. Runtime site has no Playwright dependency.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('site');
const catalogue = JSON.parse(await readFile(`${root}/data/sparql/v1/catalogue.json`));
const fixture = { metadata: {}, runs: [], queryRuns: catalogue.queries.flatMap((q,i) =>
 ['corese.next','jena.6.2.0','rdf4j.5.1.3'].map((engine,j) => ({
  engine, dataset:q.dataset, queryId:q.id, queryCategory:q.primaryFeature,
  medianMs: j === 0 ? 10 : j === 1 ? 20 : 40, medianTtfrMs: j + 0.25,
  status:i === 1 && j === 0 ? 'TIMEOUT' : i === 2 && j === 0 ? 'MISMATCH' : 'PASS',
  repetitionsStatuses:['PASS','PASS','PASS'], repetitionsMs:[10,10,10],
 }))) };
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
   series:c.data.datasets.map(s=>({label:s.label,data:s.data,color:s.backgroundColor})),
   count:Object.keys(Chart.instances).length};
 });
 const view = page.locator('.sf-view');
 assert.equal(await view.locator('[data-sf-query]').count(),15);
 assert.equal(await view.locator('h3').allTextContents().then(t=>t.slice(0,2).join('|')),'Feature comparison|Query details');
 assert.equal(await view.locator('input, select, [data-sf-state="chart"], [data-sf-state="reference"], [data-sf-state="feature"], [data-sf-notice], .kpi-grid').count(),0);
 assert.equal(await view.locator('details').count(),1);
 assert.equal(await view.locator('details').evaluate(e=>e.open),false);
 assert.equal(await view.locator('[data-sf-state="dataset"]').count(),6);
 assert.equal(await view.locator('[data-sf-chart-meta]').textContent(),'15 queries · Median execution time (ms) · Grouped by feature');
 assert.equal(await view.locator('[data-sf-table-meta]').textContent(),'15 queries · Reported medians and W3C validation status');
 let data = await chart();
 assert.equal(data.type,'bar'); assert.equal(data.indexAxis,'y'); assert.equal(data.count,1);
 assert.equal(data.labels.length,9);
 assert.deepEqual(data.series.find(s=>s.label==='corese.next').data,Array(9).fill(10));
 assert.equal(data.series.find(s=>s.label==='corese.next').color,'#00b4d8');
 assert.equal(data.series.find(s=>s.label==='jena.6.2.0').color,'#d55e00');
 assert.equal(data.series.find(s=>s.label==='rdf4j.5.1.3').color,'#009e73');
 assert.ok(!page.url().includes('sf-chart=')); assert.ok(!page.url().includes('sf-q='));
 await page.screenshot({path:'preview-desktop.png',fullPage:true});
 await view.locator('[data-sf-state="dataset"][data-sf-value="lubm"]').click();
 assert.equal(await view.locator('[data-sf-query]').count(),4);
 assert.equal((await chart()).labels.length,1);
 await view.locator('summary').click();
 assert.ok((await view.locator('[data-sf-inputs]').textContent()).includes('unzip_small/lubm_small.nt'));
 await view.locator('[data-sf-state="dataset"][data-sf-value="named-graphs"]').click();
 assert.equal(await view.locator('[data-sf-query]').count(),2);
 assert.equal(await view.locator('details').evaluate(e=>e.open),true);
 await page.reload(); await page.waitForSelector('[data-sf-query]');
 assert.equal(await view.locator('[data-sf-query]').count(),2);
 await view.locator('[data-sf-state="dataset"][data-sf-value=""]').click();
 await view.locator('[data-sf-sort="medianMs:corese.next"]').click();
 assert.equal(await view.locator('th[aria-sort="ascending"]').count(),1);
 assert.equal(await view.locator('[data-sf-sort="medianMs:corese.next"]').evaluate(e=>e===document.activeElement),true);
 await view.locator('[data-sf-query]').first().locator('td').first().click();
 await page.waitForSelector('dialog[open] code .sf-token-keyword');
 assert.ok((await view.locator('dialog code').textContent()).includes('SELECT'));
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('dialog[open]').count(),0);
 await view.locator('[data-sf-query] button').first().focus(); await page.keyboard.press('Enter');
 await page.waitForSelector('dialog[open]'); await page.keyboard.press('Escape');
 assert.equal(await view.locator('[data-sf-query] button').first().evaluate(e=>e===document.activeElement),true);
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';window.dispatchEvent(new Event('theme-changed'));});
 assert.equal((await chart()).count,1);
 await page.screenshot({path:'preview-dark.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'preview-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.locator('[data-view="loading"]').click();
 await page.waitForFunction(()=>!document.querySelector('.sf-view'));
 await page.locator('[data-view="sparql"]').click(); await page.waitForSelector('[data-sf-query]');
 assert.equal((await chart()).count,1);
 await page.route('**/data/sparql/v1/catalogue.json',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.reload(); await page.waitForSelector('[data-sf-retry]');
 await page.unroute('**/data/sparql/v1/catalogue.json');
 await page.locator('[data-sf-retry]').click(); await page.waitForSelector('[data-sf-query]');
 assert.deepEqual(errors,[]);
 console.log('Browser: minimal layout, absolute timings, official colors, datasets, sorting, source dialog, keyboard, URL, theme, mobile, teardown and retry passed.');
} finally {await browser.close();}
