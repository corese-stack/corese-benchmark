import test from 'node:test';
import assert from 'node:assert/strict';
import { featureTimings, aggregateFeatures, indexRuns, highlightSparql, statusOf, summarizeScope } from '../js/views/sparql-features.js';
import { parseUrlSparql, updateUrlSparql, getCurrentView } from '../js/router.js';
import { loadBenchmarkReport } from '../js/api.js';
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
