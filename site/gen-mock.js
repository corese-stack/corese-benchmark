// gen-mock.js — Generate complete mock-report-v2.json with all datasets
'use strict';
const fs = require('fs');

const ENGINES = ['corese.next', 'corese.4.6.5', 'jena.6.2.0', 'rdf4j.5.3.2'];
const HASH_OK = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function qrun(engine, dataset, queryId, status, medianMs, ttfrMs, rowCount, hash, err) {
  return {
    engine, dataset, queryId, status, medianMs,
    repetitionsMs: [Math.round(medianMs * 1.08), medianMs, Math.round(medianMs * 0.97)],
    medianTtfrMs: ttfrMs,
    repetitionsTtfrMs: ttfrMs === -1 ? [-1, -1, -1] : [Math.round(ttfrMs * 1.1), ttfrMs, Math.round(ttfrMs * 0.95)],
    rowCount: rowCount != null ? rowCount : null,
    hash: hash || '',
    errorMessage: err || null,
  };
}

function lrun(engine, dataset, file, triples, ms, tpSec, memBefore, memAfter, tsPoints) {
  return {
    engine, dataset, file, triples,
    loadingTimeMs: ms,
    repetitionsMs: [Math.round(ms * 1.06), ms, Math.round(ms * 0.97)],
    throughputTriplesPerSec: tpSec,
    memoryBeforeMb: memBefore,
    memoryAfterMb: memAfter,
    memoryDeltaMb: memAfter - memBefore,
    cpuPercent: Math.round(78 + Math.random() * 15),
    timeSeries: tsPoints || [],
  };
}

function ts(ms, triples, heap) { return { elapsedMs: ms, triplesLoaded: triples, heapUsedMb: heap }; }

// ── Bowlogna ──────────────────────────────────────────────────────────────────
const BOWLOGNA_QUERIES = {
  query_1:  { cat: 'GRAPH_PATTERN',  rows: 1,    sparql: 'SELECT (COUNT(?X) as ?n) WHERE { ?X a bb:Master_Thesis }' },
  query_2:  { cat: 'GRAPH_PATTERN',  rows: 312,  sparql: 'SELECT ?X WHERE { ?X a bb:Master_Thesis ; bb:hasMention ?m }' },
  query_3:  { cat: 'REGEX_TEMPORAL', rows: 980,  sparql: 'SELECT ?X WHERE { ?X a bb:Student ; bb:graduatedAt ?d . FILTER(xsd:dateTime(?d) < NOW()) }' },
  query_4:  { cat: 'REGEX_TEMPORAL', rows: 452,  sparql: 'SELECT ?X WHERE { ?X a bb:Student ; bb:enrolledIn ?m . FILTER(xsd:dateTime(?m) < NOW()) }' },
  query_5:  { cat: 'COMPLEX_JOIN',   rows: 62,   sparql: 'SELECT ?X (SUM(?c) as ?ects) WHERE { ?X bb:took ?u . ?u bb:hasCredits ?c } GROUP BY ?X' },
  query_6:  { cat: 'REGEX_TEMPORAL', rows: 145,  sparql: 'SELECT ?X WHERE { ?X a bb:Student ; bb:lastName ?ln . FILTER(regex(?ln,"^D")) }' },
  query_7:  { cat: 'COMPLEX_JOIN',   rows: 88,   sparql: 'SELECT ?X ?Y WHERE { ?X bb:attr1 ?A . ?A bb:attr2 ?Y }' },
  query_8:  { cat: 'AGGREGATION',    rows: 42,   sparql: 'SELECT ?X (COUNT(?E) as ?Failures) WHERE { ?X a bb:Teaching_Unit . ?E bb:hasMark ?Y . FILTER(?Y < 3) } GROUP BY ?X' },
  query_9:  { cat: 'AGGREGATION',    rows: 42,   sparql: 'SELECT ?X (COUNT(?E) as ?Evals) WHERE { ?X a bb:Teaching_Unit . ?E bb:evaluatesTeachingUnit ?X } GROUP BY ?X' },
  query_10: { cat: 'REGEX_TEMPORAL', rows: 1,    sparql: 'SELECT ?X (COUNT(?Y) as ?n) WHERE { ?X a bb:Professor . ?Y bb:supervisedBy ?X . FILTER REGEX(?t,"Thesis","i") } GROUP BY ?X ORDER BY DESC(?n) LIMIT 1' },
  query_11: { cat: 'AGGREGATION',    rows: 5,    sparql: 'SELECT ?X (AVG(?m) as ?avg) WHERE { ?X a bb:Student ; bb:hasMark ?m } GROUP BY ?X ORDER BY DESC(?avg) LIMIT 5' },
  query_12: { cat: 'AGGREGATION',    rows: 18,   sparql: 'SELECT ?T (AVG(?d) as ?dur) WHERE { ?T a bb:Track ; bb:duration ?d } GROUP BY ?T' },
  query_13: { cat: 'AGGREGATION',    rows: 1,    sparql: 'SELECT (AVG(?m) as ?avg) WHERE { ?X bb:hasMark ?m ; bb:atSemester 1 }' },
  query_14: { cat: 'COMPLEX_JOIN',   rows: 28,   sparql: 'SELECT ?D ?P WHERE { ?X a bb:Student ; bb:inDept ?D . ?P a bb:Professor ; bb:inDept ?D }' },
  query_15: { cat: 'GRAPH_PATTERN',  rows: 7,    sparql: 'SELECT ?U WHERE { ?U a bb:Teaching_Unit ; bb:language "en" }' },
  query_16: { cat: 'REGEX_TEMPORAL', rows: 220,  sparql: 'SELECT ?X WHERE { ?X a bb:Student ; bb:enrolledFrom ?s . FILTER(?s >= "2020-01-01"^^xsd:date) }' },
  query_17: { cat: 'REGEX_TEMPORAL', rows: 195,  sparql: 'SELECT ?X WHERE { ?X a bb:Student ; bb:enrolledTo ?e . FILTER(?e <= "2025-12-31"^^xsd:date) }' },
};

// [corese.next_ms, corese.4.6.5_ms, jena.6.2.0_ms, rdf4j.5.3.2_ms] — null = TIMEOUT
const BOWLOGNA_PERF = {
  query_1:  [8,    12,   9,    11   ], query_2:  [35,   55,   30,   45   ],
  query_3:  [280,  420,  250,  320  ], query_4:  [190,  290,  170,  210  ],
  query_5:  [1200, 1850, 900,  1500 ], query_6:  [95,   140,  80,   110  ],
  query_7:  [420,  650,  350,  480  ], query_8:  [280,  null, 320,  410  ],
  query_9:  [265,  null, 305,  390  ], query_10: [45,   72,   48,   null ],
  query_11: [310,  null, 290,  null ], query_12: [185,  280,  170,  220  ],
  query_13: [22,   35,   19,   28   ], query_14: [650,  980,  520,  780  ],
  query_15: [12,   18,   11,   15   ], query_16: [350,  null, 320,  null ],
  query_17: [340,  null, 310,  null ],
};

// ── BSBM ──────────────────────────────────────────────────────────────────────
const BSBM_QUERIES = {
  query_1:  { cat: 'SEARCH', rows: 10, sparql: 'SELECT DISTINCT ?product WHERE { ?product a bsbm:Product ; bsbm:productFeature ?f1 ; bsbm:productPropertyNumeric1 ?v1 . FILTER(?v1 > 450) } ORDER BY ?product LIMIT 10' },
  query_2:  { cat: 'SEARCH', rows: 1,  sparql: 'SELECT ?label ?comment ?producer WHERE { ?p rdfs:label ?label ; rdfs:comment ?comment ; bsbm:producer ?producer }' },
  query_3:  { cat: 'SEARCH', rows: 10, sparql: 'SELECT ?product WHERE { ?product a bsbm:Product ; bsbm:productFeature ?f ; bsbm:productPropertyNumeric1 ?v1 ; bsbm:productPropertyNumeric3 ?v3 . FILTER(?v1 > 350 && ?v3 < 950) } LIMIT 10' },
  query_4:  { cat: 'SEARCH', rows: 10, sparql: 'SELECT ?product ?label WHERE { { ?product bsbm:productFeature ?f } UNION { ?product rdfs:label ?label . FILTER regex(?label,"en") } } ORDER BY ?label LIMIT 10' },
  query_5:  { cat: 'JOIN',   rows: 5,  sparql: 'SELECT DISTINCT ?product WHERE { ?product bsbm:productFeature ?f . ?p2 bsbm:productFeature ?f . FILTER(?product != ?p2) } LIMIT 5' },
  query_6:  { cat: 'REVIEW', rows: 10, sparql: 'SELECT ?review ?title WHERE { ?review a bsbm:Review ; dc:title ?title ; bsbm:reviewFor ?product } LIMIT 10' },
  query_7:  { cat: 'OFFER',  rows: 10, sparql: 'SELECT ?offer ?price WHERE { ?offer a bsbm:Offer ; bsbm:price ?price ; bsbm:product ?product } ORDER BY ?price LIMIT 10' },
  query_8:  { cat: 'OFFER',  rows: 1,  sparql: 'SELECT ?title ?text WHERE { ?review dc:title ?title ; rev:text ?text ; bsbm:reviewFor ?product }' },
  query_9:  { cat: 'REVIEW', rows: 10, sparql: 'SELECT DISTINCT ?reviewer WHERE { ?review bsbm:reviewFor ?product ; rev:reviewer ?reviewer } LIMIT 10' },
  query_10: { cat: 'OFFER',  rows: 10, sparql: 'SELECT DISTINCT ?offer ?vendor WHERE { ?offer bsbm:vendor ?vendor ; bsbm:product ?product } LIMIT 10' },
  query_11: { cat: 'REVIEW', rows: 10, sparql: 'SELECT ?review ?rating WHERE { ?review bsbm:rating1 ?r1 ; bsbm:rating2 ?r2 . BIND((?r1+?r2)/2 AS ?rating) } LIMIT 10' },
  query_12: { cat: 'REVIEW', rows: 5,  sparql: 'SELECT ?review WHERE { ?review a bsbm:Review ; bsbm:reviewFor ?product . FILTER NOT EXISTS { ?other bsbm:reviewFor ?product . FILTER(?other != ?review) } } LIMIT 5' },
};

const BSBM_PERF = {
  query_1:  [42,   68,   38,   55   ], query_2:  [8,    13,   7,    10   ],
  query_3:  [65,   98,   58,   80   ], query_4:  [120,  185,  105,  145  ],
  query_5:  [380,  590,  310,  450  ], query_6:  [28,   44,   25,   35   ],
  query_7:  [52,   80,   45,   65   ], query_8:  [15,   23,   13,   18   ],
  query_9:  [95,   145,  85,   115  ], query_10: [45,   70,   40,   58   ],
  query_11: [75,   115,  68,   92   ], query_12: [null, null, 280,  null ],
};

// ── LUBM ──────────────────────────────────────────────────────────────────────
const LUBM_QUERIES = {
  query_1:  { cat: 'SELECTIVE',    rows: 4,    sparql: 'SELECT ?X WHERE { ?X a ub:GraduateStudent ; ub:takesCourse ?C . ?C a ub:GraduateCourse ; ub:subOrganizationOf <Dept0.Univ0.edu> }' },
  query_2:  { cat: 'LARGE_RESULT', rows: 2348, sparql: 'SELECT ?X ?Y ?Z WHERE { ?X a ub:GraduateStudent ; ub:memberOf ?Y . ?Y a ub:Department ; ub:subOrganizationOf ?Z . ?Z a ub:University }' },
  query_3:  { cat: 'SELECTIVE',    rows: 6,    sparql: 'SELECT ?X WHERE { ?X a ub:Publication ; ub:publicationAuthor ?Y . ?Y ub:memberOf <Dept0.Univ0.edu> }' },
  query_4:  { cat: 'TRANSITIVE',   rows: 34,   sparql: 'SELECT ?X ?Y1 ?Y2 ?Y3 WHERE { ?X a ub:Professor ; ub:worksFor <Dept0.Univ0.edu> ; ub:name ?Y1 ; ub:emailAddress ?Y2 ; ub:telephone ?Y3 }' },
  query_5:  { cat: 'SELECTIVE',    rows: 719,  sparql: 'SELECT ?X WHERE { ?X a ub:Person ; ub:memberOf <Dept0.Univ0.edu> }' },
  query_6:  { cat: 'LARGE_RESULT', rows: 7790, sparql: 'SELECT ?X WHERE { ?X a ub:Student }' },
  query_7:  { cat: 'SELECTIVE',    rows: 67,   sparql: 'SELECT ?X ?Y WHERE { ?X a ub:Student ; ub:takesCourse ?Y . ?Y a ub:Course . ?Y ub:teachingAssistantOf ?X }' },
  query_8:  { cat: 'SELECTIVE',    rows: 7790, sparql: 'SELECT ?X ?Y ?Z WHERE { ?X a ub:Student ; ub:emailAddress ?Y ; ub:memberOf ?Z . ?Z a ub:Department ; ub:subOrganizationOf <Univ0.edu> }' },
  query_9:  { cat: 'LARGE_RESULT', rows: 208,  sparql: 'SELECT ?X ?Y ?Z WHERE { ?X a ub:Student ; ub:advisor ?Y ; ub:takesCourse ?Z . ?Y ub:teacherOf ?Z }' },
  query_10: { cat: 'SELECTIVE',    rows: 4,    sparql: 'SELECT ?X WHERE { ?X a ub:Student ; ub:takesCourse ?C . ?C a ub:GraduateCourse ; ub:subOrganizationOf <Dept0.Univ0.edu> }' },
  query_11: { cat: 'TRANSITIVE',   rows: 224,  sparql: 'SELECT ?X WHERE { ?X a ub:ResearchGroup ; ub:subOrganizationOf <Univ0.edu> }' },
  query_12: { cat: 'TRANSITIVE',   rows: 15,   sparql: 'SELECT ?X ?Y WHERE { ?X a ub:Chair ; ub:worksFor ?Y . ?Y ub:subOrganizationOf <Univ0.edu> }' },
  query_13: { cat: 'TRANSITIVE',   rows: 1,    sparql: 'SELECT ?X WHERE { ?X a ub:Person ; ub:hasAlumnus <Univ0.edu> }' },
  query_14: { cat: 'SELECTIVE',    rows: 5916, sparql: 'SELECT ?X WHERE { ?X a ub:UndergraduateStudent }' },
};

const LUBM_PERF = {
  query_1:  [12,  18,   10,   15   ], query_2:  [450, 720,  380,  null ],
  query_3:  [8,   12,   7,    9    ], query_4:  [18,  28,   15,   22   ],
  query_5:  [95,  145,  85,   110  ], query_6:  [null,null, null, null ],
  query_7:  [280, 430,  250,  330  ], query_8:  [null,null, null, null ],
  query_9:  [520, null, 460,  null ], query_10: [15,  22,   13,   18   ],
  query_11: [42,  65,   38,   50   ], query_12: [28,  42,   25,   34   ],
  query_13: [null,null, 220,  null ], query_14: [380, null, 350,  null ],
};

// ── DBpedia loading (5 files × 3 engines) ─────────────────────────────────────
const DBPEDIA_FILES = [
  { file: 'persondata_en.nt',                       triples: 356914  },
  { file: 'homepages_en.nt',                        triples: 394897  },
  { file: 'category_labels_en.nt',                  triples: 565108  },
  { file: 'disambiguations_en.nt',                  triples: 768924  },
  { file: 'specific_mappingbased_properties_en.nt', triples: 182530  },
];

// ── Build loadingRuns ─────────────────────────────────────────────────────────
const loadingRuns = [];

// Bowlogna
const bowlognaTs = {
  'corese.next':  [ts(0,0,42),ts(500,310000,115),ts(1000,650000,198),ts(1500,980000,280),ts(2000,1234567,387)],
  'corese.4.6.5': [ts(0,0,44),ts(500,260000,125),ts(1000,560000,215),ts(1500,880000,310),ts(2000,1150000,405),ts(2500,1234567,430)],
  'jena.6.2.0':   [ts(0,0,45),ts(500,350000,130),ts(1000,720000,220),ts(1500,1050000,315),ts(2000,1234567,412)],
  'rdf4j.5.3.2':  [ts(0,0,40),ts(500,220000,110),ts(1000,480000,210),ts(1500,750000,320),ts(2000,1020000,430),ts(2500,1234567,510)],
};
const bowlognaTimes = { 'corese.next': 2450, 'corese.4.6.5': 3850, 'jena.6.2.0': 2180, 'rdf4j.5.3.2': 3150 };
ENGINES.forEach(eng => {
  const ms = bowlognaTimes[eng];
  loadingRuns.push(lrun(eng,'bowlogna','bowlogna.ttl',1234567,ms,Math.round(1234567/(ms/1000)),40,380+Math.random()*130,bowlognaTs[eng]));
});

// BSBM
const bsbmTimes = { 'corese.next': 3800, 'corese.4.6.5': 5900, 'jena.6.2.0': 3200, 'rdf4j.5.3.2': 5100 };
ENGINES.forEach(eng => {
  const ms = bsbmTimes[eng];
  loadingRuns.push(lrun(eng,'bsbm','bsbm_1m.nt',1800000,ms,Math.round(1800000/(ms/1000)),45,500+Math.random()*100,[]));
});

// LUBM
const lubmTimes = { 'corese.next': 7200, 'corese.4.6.5': 11400, 'jena.6.2.0': 5800, 'rdf4j.5.3.2': 9400 };
ENGINES.forEach(eng => {
  const ms = lubmTimes[eng];
  loadingRuns.push(lrun(eng,'lubm','lubm_univ10.nt',3200000,ms,Math.round(3200000/(ms/1000)),50,850+Math.random()*180,[]));
});

// DBpedia
DBPEDIA_FILES.forEach(({ file, triples }) => {
  ENGINES.forEach(eng => {
    const factor = eng === 'corese.next' ? 1.0 : eng === 'corese.4.6.5' ? 1.60 : eng === 'jena.6.2.0' ? 0.85 : 1.35;
    const ms = Math.round((triples / 480000) * 1000 * factor);
    const mem = 80 + triples / 3500;
    loadingRuns.push(lrun(eng,'dbpedia',file,triples,ms,Math.round(triples/(ms/1000)),45,mem,[]));
  });
});

// ── Build queryRuns ───────────────────────────────────────────────────────────
const queryRuns = [];

function addQueryRuns(dataset, queries, perf) {
  Object.entries(queries).forEach(([qid, meta]) => {
    const times = perf[qid] || [50, 45, 60];
    ENGINES.forEach((eng, i) => {
      const ms = times[i];
      if (ms === null) {
        queryRuns.push(qrun(eng, dataset, qid, 'TIMEOUT', 60000, -1, 0, '', 'Query execution exceeded timeout of 60000 ms'));
      } else {
        queryRuns.push(qrun(eng, dataset, qid, 'PASS', ms, Math.round(ms * 0.12), meta.rows, HASH_OK, null));
      }
    });
  });
}

addQueryRuns('bowlogna', BOWLOGNA_QUERIES, BOWLOGNA_PERF);
addQueryRuns('bsbm',     BSBM_QUERIES,     BSBM_PERF);
addQueryRuns('lubm',     LUBM_QUERIES,     LUBM_PERF);

// ── datasetQueries metadata ────────────────────────────────────────────────────
function buildDsMeta(queries) {
  return Object.entries(queries).map(([id, m]) => ({
    id, category: m.cat, label: id.replace('query_','Q'), sparql: m.sparql,
    expectedRowCount: m.rows, expectedHash: HASH_OK,
  }));
}

// ── Assemble & write ──────────────────────────────────────────────────────────
const mock = {
  metadata: {
    version: '2.0',
    generatedAt: '2026-10-29T16:00:00Z',
    git: { benchmarkCommit: '360e097', coreseCommit: '3a7b8e1', branch: 'main' },
    environment: {
      cpuModel: 'AMD EPYC 7763 64-Core Processor', cpuArchitecture: 'x86_64',
      cpuSockets: 1, cpuCores: 16, cpuThreads: 32, cpuFrequencyMhz: 2450.0,
      cpuGovernor: 'performance', ramTotalGb: 64.0, swapTotalGb: 8.0, swappiness: 1,
      osDistribution: 'Ubuntu 24.04.1 LTS', osKernel: '6.8.0-45-generic',
      jvmVendor: 'Ubuntu', jvmVersion: '21.0.4+7-Ubuntu-1ubuntu224.04',
      jvmFlags: ['-Xms4g', '-Xmx8g', '-XX:+UseG1GC'],
    },
    protocol: { warmup: 1, repetitions: 3, queryRepetitions: 3, queryTimeoutMs: 60000, loadTimeoutMs: 120000, metric: 'median' },
    engines: [
      { id: 'corese.next',  family: 'corese', version: '5.0.0-SNAPSHOT', label: 'Corese v5 (Next)' },
      { id: 'corese.4.6.5', family: 'corese', version: '4.6.5',          label: 'Corese v4.6.5' },
      { id: 'jena.6.2.0',   family: 'jena',   version: '6.2.0',          label: 'Apache Jena 6.2.0' },
      { id: 'rdf4j.5.3.2',  family: 'rdf4j',  version: '5.3.2',          label: 'Eclipse RDF4J 5.3.2' },
    ],
    datasetQueries: {
      bowlogna: buildDsMeta(BOWLOGNA_QUERIES),
      bsbm:     buildDsMeta(BSBM_QUERIES),
      lubm:     buildDsMeta(LUBM_QUERIES),
    },
  },
  loadingRuns,
  queryRuns,
};

fs.writeFileSync('C:/DEV/corese-benchmark/site/data/mock-report-v2.json', JSON.stringify(mock, null, 2), 'utf8');
const js = 'window.__BENCHMARK_DATA__ = ' + JSON.stringify(mock) + ';\n';
fs.writeFileSync('C:/DEV/corese-benchmark/site/data/report-data.js', js, 'utf8');

console.log('loadingRuns:', mock.loadingRuns.length, '| datasets:', [...new Set(mock.loadingRuns.map(r=>r.dataset))].join(', '));
console.log('queryRuns:  ', mock.queryRuns.length,   '| datasets:', [...new Set(mock.queryRuns.map(r=>r.dataset))].join(', '));
console.log('report-data.js:', (js.length/1024).toFixed(1), 'KB');
