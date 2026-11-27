import test from 'node:test';
import assert from 'node:assert/strict';
import { featureTimings, indexRuns, highlightSparql } from '../js/views/sparql-features.js';
import { parseUrlLoading, parseUrlSparql, updateUrlSparql, getCurrentView } from '../js/router.js';
import { loadBenchmarkReport } from '../js/api.js';
import { DATASET_CONFIGS, resolveDatasetCardConfig, resolveDatasetTripleCount, formatDatasetSizeBadge, populateDatasetCards } from '../js/components/protocol-tile.js';
const q = (id, feature = 'BGP_JOIN', dataset = 'bsbm') => ({ id, dataset, primaryFeature: feature });
const r = (queryId, engine, medianMs, status = 'PASS', dataset = 'bsbm') => ({ queryId, engine, medianMs, status, dataset });

test('source highlighting preserves original text and escapes executable markup', () => {
 const source = '# <script>alert(1)</script>\nSELECT ?x WHERE { ?x <urn:a#b> "<img src=x onerror=alert(1)>" }';
 const html = highlightSparql(source);
 assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
 assert.ok(html.includes('sf-token-keyword')); assert.ok(html.includes('sf-token-string'));
 assert.ok(html.includes('&lt;img'));
});
test('URL state preserves loading parameters, engines and hash; alias routes', () => {
 const state = parseUrlSparql('?sf-sort=name&sf-dir=desc&pin=query:Q01');
 assert.equal(state.sort,'name'); assert.equal(state.direction,'desc');
 assert.deepEqual(state.pin, {kind:'query',key:'Q01'});
 assert.equal(parseUrlSparql('?sf-sort=bad&sf-dir=oops').sort, 'id');
 let url;
 globalThis.window = { location: { search:'?dataset=lubm&engines=corese.next', pathname:'/site/', hash:'#sparql-features' }, history:{replaceState:(_,__,value)=>url=value} };
 updateUrlSparql(state);
 assert.ok(url.includes('sf-sort=name')); assert.ok(url.includes('pin=query%3AQ01'));
 assert.ok(url.includes('dataset=lubm')); assert.ok(url.endsWith('#sparql-features'));
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
 for (const status of ['TIMEOUT', 'ERROR', 'MISMATCH', 'DUPLICATE', 'INCONCLUSIVE', 'UNSTABLE']) {
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
  assert.equal(report.runs, report.loadingRuns);
  assert.equal(report.runs.length, 1);
  assert.equal(report.enginesCatalog.length, 1);
 } finally {
  globalThis.fetch = originalFetch;
 }
});


test('dataset card files follow the view without changing SPARQL configurations', () => {
 for (const dataset of Object.keys(DATASET_CONFIGS)) {
  assert.equal(resolveDatasetCardConfig(dataset), DATASET_CONFIGS[dataset]);
 }
 assert.equal(resolveDatasetCardConfig('lubm').shortFile, 'lubm_small.nt');
 for (const [dataset, shortFile] of [
  ['bsbm', 'bsbm_medium.nt'],
  ['lubm', 'lubm_medium.nt'],
  ['dbpedia', 'persondata_en.nt'],
  ['bowlogna', 'Department0.nt'],
 ]) {
  const config = resolveDatasetCardConfig(dataset, 'loading');
  assert.equal(config.shortFile, shortFile);
 }
 assert.equal(resolveDatasetCardConfig('named-graphs', 'loading').shortFile, 'corese-feature-lubm.nq');
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

test('loading report aliases fall back when only one run collection is present', async () => {
 const { loadBenchmarkReport } = await import('../js/api.js');
 const originalFetch = globalThis.fetch;
 try {
  for (const field of ['loadingRuns', 'runs']) {
   globalThis.fetch = async () => new Response(JSON.stringify({ [field]: [null, {
    engine: 'jena.6.2.0', dataset: 'lubm', triples: 100, loadingTimeMs: 10,
    memoryDeltaMb: -1,
   }] }));
   const report = await loadBenchmarkReport();
   assert.deepEqual(report.runs, report.loadingRuns);
   assert.equal(report.loadingRuns.length, 1);
   assert.equal(report.loadingRuns[0].status, 'SUCCESS');
   assert.equal(report.loadingRuns[0].memoryDeltaMb, null);
   assert.equal(report.enginesCatalog[0].id, 'jena');
  }
 } finally { globalThis.fetch = originalFetch; }
});

test('retainEngines clears stale engine pins and hovers while retaining query focus', async () => {
 const { FocusStore } = await import('../js/focus-store.js');
 const store = new FocusStore();
 store.pin({ kind: 'cell', key: 'jena.6.2.0|["lubm","Q01"]' });
 store.beginHover({ kind: 'engine', key: 'corese.next' });
 store.retainEngines(['corese.next']);
 assert.equal(store.state.pinned, null);
 assert.equal(store.effectiveFocus.target.key, 'corese.next');
	store.pin({ kind: 'query', key: '["lubm","Q01"]' });
	store.retainEngines([]);
	assert.equal(store.state.hover, null);
	assert.equal(store.state.pinned.kind, 'query');
});

test('parseUrlLoading defaults to bowlogna and accepts named-graphs', () => {
	assert.equal(parseUrlLoading('').dataset, 'bowlogna');
	assert.equal(parseUrlLoading('?dataset=named-graphs').dataset, 'named-graphs');
	assert.equal(parseUrlLoading('?dataset=unknown').dataset, 'bowlogna');
});


test('dataset sizes survive loading pruning and take precedence', () => {
  const loadingRuns = [{ dataset: 'bsbm', file: 'bsbm_medium.nt', triples: 1700000 }];
  assert.equal(resolveDatasetTripleCount('bsbm', {
    metadata: { datasetSizes: { 'bsbm:bsbm_small.nt': 374911 } }, loadingRuns,
  }), 374911);
  assert.equal(resolveDatasetTripleCount('bsbm', { loadingRuns }), null);
  assert.equal(resolveDatasetTripleCount('bsbm', { loadingRuns }, 'loading'), 1700000);
});

test('feature summary uses status priority across uncertainty and failures', async () => {
 const { featureStatusSummary } = await import('../js/views/sparql-features.js');
 const priority = ['DUPLICATE', 'MISMATCH', 'OOM', 'ERROR', 'TIMEOUT', 'INCONCLUSIVE', 'UNSTABLE'];
 for (const [position, status] of priority.entries()) {
  const statuses = priority.slice(position).reverse();
  const queries = statuses.map((_, i) => q(String(i)));
  const index = indexRuns(statuses.map((value, i) => r(String(i), 'corese.next', null, value)));
  assert.equal(featureStatusSummary(queries, index, 'corese.next').status, status);
 }
});

test('dataset cards link only tracked preparation scripts and escape generated filenames', () => {
 const container = { innerHTML: '' };
 populateDatasetCards(container);
 assert.match(container.innerHTML, /<code>lubm_small\.nt<\/code>/);
 assert.match(container.innerHTML, /<code>bsbm_small\.nt<\/code>/);
 const links = [...container.innerHTML.matchAll(/href="(https:\/\/github\.com[^"]+)"/g)].map(match => match[1]);
 assert.equal(links.length, 2);
 assert.ok(links.every(link => link.endsWith('/input/queries/v1/named-graphs/prepare_dataset.py')));
 assert.match(container.innerHTML, /<code>corese-feature-lubm\.nq<\/code>/);
});

test('keyboard item selection delegates to the shared engine selection methods', async () => {
 const { EngineManager } = await import('../js/engines.js');
 const version = { id: 'next' }, storage = { id: 'in-memory' };
 const engine = { id: 'corese', versions: [version], storages: [storage] };
 const selected = [];
 const manager = {
  catalog: [engine], draftEngine: engine,
  selectEngine: item => selected.push(item),
  selectVersion: item => selected.push(item),
  selectStorage: item => selected.push(item),
 };
 for (const [column, id] of [['engines', engine.id], ['versions', version.id], ['storages', storage.id]]) {
  const element = { classList: { contains: value => value === `miller__col--${column}` } };
  EngineManager.prototype.triggerItemSelection.call(manager, element, id);
  EngineManager.prototype.triggerItemSelection.call(manager, element, 'absent');
 }
 assert.deepEqual(selected, [engine, version, storage]);
});

test('shared chart pointers preserve hover, tooltip, badge pin and abort cleanup', async () => {
 const { attachChartPointerInteraction } = await import('../js/chart-utils.js');
 const previousWindow = globalThis.window;
 const canvas = new EventTarget();
 canvas.getBoundingClientRect = () => ({ left: 10, top: 20 });
 const controller = new AbortController();
 let hover = null, active = [], tooltip = [], clicks = 0;
 const chart = {
  data: { datasets: [{ data: [12] }] },
  isPointInArea: ({ x, y }) => x >= 0 && y >= 0,
  getDatasetMeta: () => ({ data: [{ inRange: (x, y) => x === 5 && y === 6 }] }),
  setActiveElements: elements => { active = elements; },
  tooltip: { setActiveElements: elements => { tooltip = elements; } },
  update: () => {},
  options: { onClick: () => { clicks++; } },
  _statusBadgeHitBoxes: [{ x: 20, y: 20, w: 10, h: 10, datasetIndex: 0, index: 0 }],
 };
 const move = (x, y) => {
  const event = new Event('pointermove');
  Object.assign(event, { clientX: x + 10, clientY: y + 20 });
  canvas.dispatchEvent(event);
 };
 globalThis.window = new EventTarget();
 try {
  attachChartPointerInteraction(chart, canvas, { set: target => { hover = target; }, clear: () => { hover = null; } }, controller.signal,
   () => ({ kind: 'engine', key: 'corese.next' }));
  move(5, 6);
  assert.deepEqual(hover, { kind: 'engine', key: 'corese.next' });
  assert.deepEqual(active, [{ datasetIndex: 0, index: 0 }]);
  assert.deepEqual(tooltip, active);
  for (const event of ['pointerleave', 'pointercancel', 'mouseout']) {
   canvas.dispatchEvent(new Event(event));
   assert.equal(hover, null); assert.deepEqual(tooltip, []);
   move(5, 6);
  }
  window.dispatchEvent(new Event('scroll'));
  assert.equal(hover, null); assert.deepEqual(active, []);
  move(-1, 6); assert.equal(hover, null);
  move(50, 60); assert.equal(hover, null);
  const click = new Event('click');
  Object.assign(click, { clientX: 35, clientY: 45 });
  canvas.dispatchEvent(click);
  assert.equal(clicks, 1); assert.equal(click._statusBadgeHandled, true);
  controller.abort();
  move(5, 6); assert.equal(hover, null);
 } finally {
  controller.abort();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
 }
});
