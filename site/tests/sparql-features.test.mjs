import test from 'node:test';
import assert from 'node:assert/strict';
import { featureTimings, aggregateFeatures, indexRuns, highlightSparql, statusOf, summarizeScope } from '../js/views/sparql-features.js';
import { parseUrlSparql, updateUrlSparql, getCurrentView } from '../js/router.js';
import { loadBenchmarkReport } from '../js/api.js';
import { DATASET_CONFIGS, resolveDatasetCardConfig, resolveDatasetTripleCount, formatDatasetSizeBadge } from '../js/components/protocol-tile.js';
const q = (id, feature = 'BGP_JOIN', dataset = 'bsbm') => ({ id, dataset, primaryFeature: feature });
const r = (queryId, engine, medianMs, status = 'PASS', dataset = 'bsbm') => ({ queryId, engine, medianMs, status, dataset });
const aggregate = (queries, runs) => aggregateFeatures(queries, indexRuns(runs), ['corese.next'], 'jena.6.2.0')[0].axes;

test('geometric mean of paired ratios, one weight per query; nine axes', () => {
 const axes = aggregate([q('Q01'), q('Q02')], [r('Q01','jena.6.2.0',20),r('Q01','corese.next',10),r('Q02','jena.6.2.0',80),r('Q02','corese.next',10)]);
 assert.equal(axes.length, 9); assert.ok(Math.abs(axes[0].speedup - 4) < 1e-12);
 assert.equal(axes[0].paired, 2); assert.equal(axes[1].speedup, null);
});
test('exclude non-PASS, missing and zero values on either side; preserve coverage', () => {
 const statuses = ['TIMEOUT','ERROR','MISMATCH','UNSTABLE','INCONCLUSIVE','UNKNOWN'];
 const queries = statuses.map((_,i) => q(`Q${i}`));
 const runs = statuses.flatMap((status,i) => [r(`Q${i}`,'corese.next',1,status),r(`Q${i}`,'jena.6.2.0',10)]);
 for (const [id, a, b] of [['zero',0,10],['refzero',10,0],['negative',-1,10],['infinite',Infinity,10],['missing',null,10]]) {
  queries.push(q(id)); runs.push(r(id,'corese.next',a),r(id,'jena.6.2.0',b));
 }
 assert.equal(aggregate(queries,runs)[0].speedup,null);
 assert.equal(aggregate(queries,runs)[0].paired,0);
 assert.equal(aggregate(queries,[r('Q0','corese.next',1),r('Q0','jena.6.2.0',5,'ERROR')])[0].paired,0);
});
test('dataset identity, storage identity, duplicate observations and missing statuses', () => {
 assert.equal(aggregate([q('Q01')],[r('Q01','corese.next',1),r('Q01','jena.6.2.0',10,'PASS','lubm')])[0].paired,0);
 assert.equal(aggregate([q('Q01')],[r('Q01','corese.next',1),r('Q01','jena.6.2.0.tdb2',10)])[0].paired,0);
 assert.equal(aggregate([q('Q01')],[r('Q01','corese.next',1),r('Q01','corese.next',2),r('Q01','jena.6.2.0',10)])[0].paired,0);
 assert.equal(statusOf({}), 'UNKNOWN'); assert.equal(statusOf(null), 'MISSING');
});
test('logs handle extreme individual ratios without intermediate overflow', () => {
 const a = aggregate([q('a'),q('b')],[r('a','corese.next',1e-300),r('a','jena.6.2.0',1e300),r('b','corese.next',1e300),r('b','jena.6.2.0',1e-300)])[0];
 assert.equal(a.speedup,1);
});
test('source highlighting preserves original text and escapes executable markup', () => {
 const source = '# <script>alert(1)</script>\nSELECT ?x WHERE { ?x <urn:a#b> "<img src=x onerror=alert(1)>" }';
 const html = highlightSparql(source);
 assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
 assert.ok(html.includes('sf-token-keyword')); assert.ok(html.includes('sf-token-string'));
 assert.ok(html.includes('&lt;img'));
});
test('URL state preserves loading parameters, engines and hash; alias routes', () => {
 const state = parseUrlSparql('?sf-sort=bad&sf-dir=oops&sf-q=Q01&sf-ref=corese.next');
 assert.equal(state.sort,'id'); assert.equal(state.direction,'asc');
 let url;
 globalThis.window = { location: { search:'?dataset=lubm&engines=corese.next', pathname:'/site/', hash:'#sparql-features' }, history:{replaceState:(_,__,value)=>url=value} };
 updateUrlSparql(state);
 assert.ok(url.includes('dataset=lubm')); assert.ok(url.includes('sf-q=Q01')); assert.ok(url.endsWith('#sparql-features'));
 assert.equal(getCurrentView(),'sparql'); delete globalThis.window;
});
test('query-only engines are selectable and absent status is not fabricated as PASS', async () => {
 const previous = globalThis.fetch;
 globalThis.fetch = async () => ({ok:true,json:async()=>({queryRuns:[r('Q01','corese.next',1,undefined), {engine:'jena.6.2.0',queryId:'Q01',dataset:'bsbm',medianMs:-1}]})});
 try {
  const data = await loadBenchmarkReport();
  assert.equal(data.enginesCatalog.length,2); assert.equal(data.queryRuns[1].status,'UNKNOWN'); assert.equal(data.queryRuns[1].medianMs,null);
 } finally {globalThis.fetch=previous;}
});

test('reference self-comparison is 1x and missing axes stay absent', () => {
 const queries = [q('Q01'),q('Q02'),q('Q03','PROPERTY_PATH')];
 const runs = indexRuns([r('Q01','jena.6.2.0',20),r('Q02','jena.6.2.0',0)]);
 const axes = aggregateFeatures(queries,runs,['jena.6.2.0'],'jena.6.2.0')[0].axes;
 assert.equal(axes[0].speedup,1); assert.equal(axes[0].paired,1);
 assert.equal(axes[0].passed,2); assert.equal(axes[0].total,2);
 assert.equal(axes[1].speedup,null); assert.equal(axes[1].passed,0);
});


test('summary counts scoped observations and failures; mean excludes the reference', () => {
 const queries = [q('a'),q('b'),q('c')];
 const index = indexRuns([r('a','jena.6.2.0',20),r('a','corese.next',10),
  r('b','jena.6.2.0',80),r('b','corese.next',10),r('c','corese.next',1,'MISMATCH')]);
 const summary = summarizeScope(queries,index,['jena.6.2.0','corese.next'],'jena.6.2.0');
 assert.equal(summary.total,6); assert.equal(summary.present,5); assert.equal(summary.passed,4);
 assert.equal(summary.paired,2); assert.ok(Math.abs(summary.speedup-4)<1e-12);
 assert.equal(summarizeScope(queries,index,['jena.6.2.0'],'jena.6.2.0').speedup,null);
 assert.deepEqual(summarizeScope([],index,[],'jena.6.2.0'),{total:0,present:0,passed:0,paired:0,speedup:null});
});
test('summary excludes ambiguous duplicates and invalid ratios without inventing coverage', () => {
 const queries = [q('a'),q('b'),q('c')];
 const index = indexRuns([r('a','jena.6.2.0',20),r('a','corese.next',1),r('a','corese.next',2),
  r('b','jena.6.2.0',20),r('b','corese.next',0),r('c','corese.next',5,'INCONCLUSIVE')]);
 const summary = summarizeScope(queries,index,['corese.next'],'jena.6.2.0');
 assert.equal(summary.present,3); assert.equal(summary.passed,1);
 assert.equal(summary.paired,0); assert.equal(summary.speedup,null);
});
test('chart URL defaults to bars and restores radar without touching RDF filters', () => {
 assert.equal(parseUrlSparql('').chart,'bar');
 assert.equal(parseUrlSparql('?sf-chart=invalid').chart,'bar');
 const state = parseUrlSparql('?sf-chart=radar');
 assert.equal(state.chart,'radar');
 let url;
 globalThis.window = {location:{search:'?dataset=lubm&engines=corese.next',pathname:'/site/',hash:'#sparql'},history:{replaceState:(_,__,value)=>url=value}};
 try {
  updateUrlSparql(state); assert.ok(url.includes('sf-chart=radar')); assert.ok(url.includes('dataset=lubm'));
  window.location.search = new URL(url,'https://example.org').search;
  updateUrlSparql({...state,chart:'bar'}); assert.ok(!url.includes('sf-chart=')); assert.ok(url.includes('engines=corese.next'));
 } finally {delete globalThis.window;}
});


test('feature timings show absolute milliseconds without reference pairing', () => {
 const queries = [q('a'), q('b'), q('c'), q('d', 'NAMED_GRAPH')];
 const index = indexRuns([r('a', 'corese.next', 2), r('b', 'corese.next', 10), r('c', 'corese.next', 90),
  r('a', 'jena.6.2.0', 20), r('b', 'jena.6.2.0', 40), r('c', 'jena.6.2.0', 0, 'TIMEOUT')]);
 const series = featureTimings(queries, index, ['corese.next', 'jena.6.2.0']);
 assert.deepEqual(series[0].axes[0], { feature: 'BGP_JOIN', total: 3, count: 3, medianMs: 10 });
 assert.equal(series[1].axes[0].medianMs, 30);
 assert.equal(series[0].axes[7].medianMs, null);
});

test('absolute timings preserve zero, exclude ambiguity and failures, and keep dataset identity', () => {
 const queries = [q('zero'), q('duplicate'), q('failed'), q('invalid'), q('other')];
 const index = indexRuns([r('zero', 'corese.next', 0), r('duplicate', 'corese.next', 2), r('duplicate', 'corese.next', 4),
  r('failed', 'corese.next', 3, 'MISMATCH'), r('invalid', 'corese.next', Infinity), r('other', 'corese.next', 5, 'PASS', 'lubm')]);
 const axis = featureTimings(queries, index, ['corese.next'])[0].axes[0];
 assert.equal(axis.count, 1); assert.equal(axis.medianMs, 0);
 assert.equal(featureTimings(queries, index, ['rdf4j.5'])[0].axes[0].medianMs, null);
});

test('status normalization, labels and Node palettes share canonical semantics', async () => {
 const { normalizeRunStatus, formatStatusBadgeLabel, getStatusBadgePalette } = await import('../js/chart-utils.js');
 for (const [input, expected] of [[' success ', 'SUCCESS'], ['pass', 'PASS'], ['out-of-memory', 'OOM'], ['timed out', 'TIMEOUT'], [null, 'MISSING'], ['not_tested', 'MISSING'], ['duplicate', 'DUPLICATE']]) assert.equal(normalizeRunStatus(input), expected);
 for (const [status, label] of [['OOM', '⚠ OOM'], ['TIMEOUT', '◷ TIMEOUT'], ['ERROR', '× ERROR'], ['MISMATCH', '≠ MISMATCH'], ['DUPLICATE', '⊘ DUPLICATE'], ['MISSING', '— MISSING']]) assert.equal(formatStatusBadgeLabel(status), label);
 assert.deepEqual(getStatusBadgePalette('ERROR'), getStatusBadgePalette('OOM'));
 assert.notDeepEqual(getStatusBadgePalette('TIMEOUT'), getStatusBadgePalette('ERROR'));
});

test('failed feature summaries preserve all causes and count missing and ambiguous queries', async () => {
 const { featureStatusSummary } = await import('../js/views/sparql-features.js');
 const queries = [q('a'), q('b')];
 for (const status of ['TIMEOUT', 'ERROR', 'MISMATCH', 'DUPLICATE']) {
  const runs = indexRuns([r('a', 'corese.next', -1, status), r('b', 'corese.next', -1, status)]);
  const summary = featureStatusSummary(queries, runs, 'corese.next');
  assert.equal(summary.status, status); assert.match(summary.detail, /0\/2 queries passed/);
  assert.equal(featureTimings(queries, runs, ['corese.next'])[0].axes[0].medianMs, null);
 }
 const mixed = featureStatusSummary(queries, indexRuns([r('a', 'corese.next', -1, 'TIMEOUT')]), 'corese.next');
 assert.equal(mixed.status, 'TIMEOUT'); assert.match(mixed.detail, /TIMEOUT: 1, MISSING: 1/);
 assert.equal(featureStatusSummary(queries, new Map(), 'corese.next').status, 'MISSING');
 const duplicate = indexRuns([r('a', 'corese.next', 1), r('a', 'corese.next', 2)]);
 assert.equal(featureStatusSummary(queries, duplicate, 'corese.next').status, 'DUPLICATE');
});

test('real bundled Chart.js null badges preserve data, native tooltip, hit testing and click', async () => {
 const { readFile } = await import('node:fs/promises');
 const { runInThisContext } = await import('node:vm');
 const { createStatusBadgePlugin, findBarElement } = await import('../js/chart-utils.js');
 runInThisContext(await readFile(new URL('../vendor/chart.umd.min.js', import.meta.url), 'utf8'));
 const Chart = globalThis.Chart;
 try {
  for (const indexAxis of ['x', 'y']) {
   const canvas = { width: 600, height: 400, style: {}, getAttribute: () => null };
   const context = new Proxy({ canvas, measureText: (text) => ({ width: String(text).length * 7 }), getLineDash: () => [] }, { get: (object, key) => object[key] || (() => {}) });
   canvas.getContext = () => context;
   let clicked = null;
   const chart = new Chart(canvas, { type: 'bar', plugins: [createStatusBadgePlugin()],
    data: { labels: ['measured', 'failed'], datasets: [{ data: [10, null], _statuses: [null, { status: 'TIMEOUT', detail: 'unmeasurable', engineKey: 'corese.next' }] }] },
    options: { indexAxis, responsive: false, animation: false, onClick: (_e, elements) => { clicked = elements[0]; }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.raw === null ? item.dataset._statuses[item.dataIndex].detail : String(item.raw) } } } } });
   const box = chart._statusBadgeHitBoxes[0];
   assert.ok(box); assert.deepEqual(chart.data.datasets[0].data, [10, null]);
   assert.ok(box.x >= chart.chartArea.left && box.x + box.w <= chart.chartArea.right + 0.001);
   assert.ok(box.y >= chart.chartArea.top && box.y + box.h <= chart.chartArea.bottom + 0.001);
   const point = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
   assert.equal(findBarElement(chart, point.x, point.y).index, 1);
   chart.tooltip.setActiveElements([{ datasetIndex: 0, index: 1 }], point);
   assert.equal(chart.tooltip.opacity, 1); assert.equal(chart.tooltip.dataPoints[0].raw, null);
   assert.deepEqual(chart.tooltip.body[0].lines, ['unmeasurable']);
   assert.ok(Number.isFinite(chart.tooltip.x) && Number.isFinite(chart.tooltip.y));
   chart.notifyPlugins('beforeEvent', { event: { ...point, type: 'click' } });
   assert.equal(clicked.index, 1);
   chart.destroy();
  }
 } finally { delete globalThis.Chart; }
});

test('semantic status text meets WCAG AA in each declared theme', async () => {
 const { readFile } = await import('node:fs/promises');
 const css = await readFile(new URL('../css/00-base.css', import.meta.url), 'utf8');
 const luminance = (hex) => hex.match(/[0-9a-f]{2}/gi).map(part => parseInt(part, 16) / 255)
  .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i], 0);
 const themes = css.split('}').filter(block => block.includes('--status-fail-bg'));
 assert.equal(themes.length, 4);
 for (const block of themes) {
  const tokens = Object.fromEntries([...block.matchAll(/--status-(fail|timeout|muted)-(bg|text|border):\s*(#[0-9a-f]{6})/g)].map(match => [`${match[1]}-${match[2]}`, match[3]]));
  for (const group of ['fail', 'timeout', 'muted']) {
   const a = luminance(tokens[`${group}-bg`]), b = luminance(tokens[`${group}-text`]);
   assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${group} text contrast`);
  }
 }
});

test('dense all-null vertical groups rotate without overlap and discard hidden hit boxes', async () => {
 const { readFile } = await import('node:fs/promises');
 const { runInThisContext } = await import('node:vm');
 const { createStatusBadgePlugin } = await import('../js/chart-utils.js');
 runInThisContext(await readFile(new URL('../vendor/chart.umd.min.js', import.meta.url), 'utf8'));
 const Chart = globalThis.Chart;
 const canvas = { width: 300, height: 400, style: {}, getAttribute: () => null };
 const context = new Proxy({ canvas, measureText: (text) => ({ width: String(text).length * 7 }), getLineDash: () => [] }, { get: (object, key) => object[key] || (() => {}) });
 canvas.getContext = () => context;
 const chart = new Chart(canvas, { type: 'bar', plugins: [createStatusBadgePlugin()],
  data: { labels: ['NT'], datasets: Array.from({length:16}, () => ({data:[null],_statuses:[{status:'OOM'}]})) },
  options: { responsive:false,animation:false,plugins:{legend:{display:false}} } });
 try {
  const boxes = chart._statusBadgeHitBoxes;
  assert.equal(boxes.length,16);
  for (let i=0;i<boxes.length;i++) {
   assert.ok(boxes[i].h > boxes[i].w);
   if(i) assert.ok(boxes[i-1].x+boxes[i-1].w <= boxes[i].x);
  }
  chart.setDatasetVisibility(0,false); chart.update('none');
  assert.equal(chart._statusBadgeHitBoxes.length,15);
  assert.ok(chart._statusBadgeHitBoxes.every(box=>box.datasetIndex!==0));
 } finally {chart.destroy();delete globalThis.Chart;}
});

test('loadBenchmarkReport infers SUCCESS only for legacy loading runs with valid measurements', async () => {
 const { loadBenchmarkReport } = await import('../js/api.js');
 const payload = {
  metadata: {},
  runs: [
   { engine: 'rdf4j.5.3.2.native', dataset: 'lubm', file: 'lubm_medium.nt', triples: 1340939, loadingTimeMs: 12000, throughputTriplesPerSec: 111744, status: null, errorMessage: null },
   { engine: 'jena.6.2.0', dataset: 'bsbm', file: 'bsbm_medium.nt', triples: -1, loadingTimeMs: -1, throughputTriplesPerSec: -1, status: null, errorMessage: null },
   { engine: 'corese.4.6.5', dataset: 'bsbm', file: 'bsbm_medium.nt', triples: -1, loadingTimeMs: -1, throughputTriplesPerSec: -1, status: 'TIMEOUT', errorMessage: 'Timed out' },
  ],
  loadingRuns: [
   { engine: 'rdf4j.5.3.2.native', dataset: 'lubm', file: 'lubm_medium.nt', triples: 1340939, loadingTimeMs: 12000, throughputTriplesPerSec: 111744, status: null, errorMessage: null },
  ],
  queryRuns: [],
 };
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
 try {
  const report = await loadBenchmarkReport('data/benchmark-report.json');
  assert.equal(report.runs[0].status, 'SUCCESS');
  assert.equal(report.loadingRuns[0].status, 'SUCCESS');
  assert.equal(report.runs[1].status, null);
  assert.equal(report.runs[1].loadingTimeMs, null);
  assert.equal(report.runs[2].status, 'TIMEOUT');
 } finally {
  globalThis.fetch = originalFetch;
 }
});


test('dataset card files follow the view without changing SPARQL configurations', () => {
 for (const dataset of Object.keys(DATASET_CONFIGS)) {
  assert.equal(resolveDatasetCardConfig(dataset), DATASET_CONFIGS[dataset]);
 }
 assert.equal(resolveDatasetCardConfig('lubm').shortFile, 'lubm_small.nt');
 assert.equal(resolveDatasetCardConfig('lubm').fullFile, 'input/lubm/unzip_small/lubm_small.nt');
 for (const [dataset, shortFile, fullFile] of [
  ['bsbm', 'bsbm_medium.nt', 'input/bsbm/view_small_medium/bsbm_medium.nt'],
  ['lubm', 'lubm_medium.nt', 'input/lubm/unzip_medium/lubm_medium.nt'],
  ['dbpedia', 'persondata_en.nt', 'input/dbpedia/unzip/persondata_en.nt'],
  ['bowlogna', 'Department0.nt', 'input/bowlogna/unzip/Department0.nt'],
 ]) {
  const config = resolveDatasetCardConfig(dataset, 'loading');
  assert.equal(config.shortFile, shortFile);
  assert.equal(config.fullFile, fullFile);
 }
 assert.equal(resolveDatasetCardConfig('named-graphs', 'loading').shortFile, 'named-graphs.nq');
 assert.equal(resolveDatasetCardConfig('named-graphs', 'loading').format, 'N-Quads');
});

test('dataset triple counts use the exact median of the canonical file for each mode', () => {
 const runs = [
  ...[1000003, 1000000, 1000001, 999999].map(triples => ({ dataset: 'bsbm', file: 'bsbm_medium.nt', triples })),
  ...[102, 100, 900].map(triples => ({ dataset: 'bsbm', file: 'bsbm_small.nt', triples })),
  { dataset: 'lubm', file: 'bsbm_medium.nt', triples: 42 },
  { dataset: 'bsbm', file: 'other.nt', triples: 42 },
 ];
 const before = structuredClone(runs);
 assert.equal(resolveDatasetTripleCount('bsbm', { runs }, 'loading'), 1000001);
 assert.equal(resolveDatasetTripleCount('bsbm', { runs }), 102);
 assert.equal(resolveDatasetTripleCount('bsbm', { loadingRuns: runs, runs: [] }, 'loading'), 1000001);
 assert.equal(resolveDatasetTripleCount('bsbm', { loadingRuns: [], runs }, 'loading'), null);
 assert.deepEqual(runs, before);
});

test('named graph counts accept all canonical aliases and ignore failed sentinel runs', () => {
 const loadingRuns = [
  { dataset: 'named-graphs', file: 'named-graphs.nq', triples: 101 },
  { dataset: 'named-graphs', file: 'corese-feature-lubm.nq', triples: 103 },
  { dataset: 'named-graphs', file: 'lubm_named.nq', triples: 105 },
  { dataset: 'named-graphs', file: 'named-graphs.nq', triples: -1, status: 'ERROR' },
  { dataset: 'named-graphs', file: 'corese-feature-lubm.nq', triples: -1, status: 'TIMEOUT' },
  { dataset: 'named-graphs', file: 'other.nq', triples: 900 },
  { dataset: 'lubm', file: 'named-graphs.nq', triples: 900 },
 ];
 for (const mode of ['loading', 'sparql']) {
  assert.equal(resolveDatasetTripleCount('named-graphs', { loadingRuns }, mode), 103);
 }
});

test('dataset counts stay unknown without finite positive measurements', () => {
 const runs = [-1, 0, NaN, Infinity, -Infinity, null, undefined, '100'].map(triples =>
  ({ dataset: 'bsbm', file: 'bsbm_small.nt', triples }));
 assert.equal(resolveDatasetTripleCount('bsbm', { runs }), null);
 assert.equal(resolveDatasetTripleCount('bsbm', { runs: [] }), null);
 assert.equal(resolveDatasetTripleCount('bsbm', null), null);
 assert.equal(resolveDatasetTripleCount('bsbm'), null);
});

test('dataset size badges format measured triples and quads or show an em dash', () => {
 assert.equal(formatDatasetSizeBadge(1000000, 'bsbm'), '1,000,000 triples');
 assert.equal(formatDatasetSizeBadge(1000000, 'named-graphs'), '1,000,000 quads');
 for (const value of [null, undefined, -1, 0, NaN, Infinity, '100']) {
  assert.equal(formatDatasetSizeBadge(value, 'bsbm'), '—');
 }
});
