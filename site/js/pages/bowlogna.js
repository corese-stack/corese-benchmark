// bowlogna.js — Bowlogna benchmark page
'use strict';

import state from '../state.js';
import { getQueryRuns, getLoadingRuns } from '../data-loader.js';
import { buildQueryTable, buildLoadingTableWithFilter } from '../components/result-table.js';
import { openResultDialog } from '../components/result-dialog.js';
import { renderQueryBreakdown } from '../charts/query-breakdown.js';
import { renderLoadingChart } from '../charts/loading-chart.js';
import { renderThroughputChart } from '../charts/throughput-chart.js';
import { renderCpuChart } from '../charts/cpu-chart.js';
import { addExpandButton } from '../chart-expand.js';

const DATASET = 'bowlogna';

const FILTERS = {
  all:           { label: 'All (17)', queries: null },
  aggregations:  { label: 'Aggregations',   queries: ['query_8','query_9','query_11','query_12','query_13'] },
  complex_joins: { label: 'Complex Joins',  queries: ['query_5','query_7','query_14'] },
  temporal_regex:{ label: 'Temporal & Regex', queries: ['query_3','query_4','query_6','query_10','query_16','query_17'] },
  simple_count:  { label: 'Simple & Count', queries: ['query_1','query_2','query_15'] },
};

let currentFilter = 'all';
let tableFilter   = 'all'; // 'all' | 'best' | 'pass' | 'failures'
let queriesRendered = false;

function getBestPerQuery(runs) {
  const best = {};
  runs.forEach(r => {
    if (r.status === 'PASS') {
      if (!best[r.queryId] || r.medianMs < best[r.queryId].medianMs) best[r.queryId] = r;
    }
  });
  // fallback: if no PASS for a query, show fastest non-PASS
  runs.forEach(r => { if (!best[r.queryId]) best[r.queryId] = r; });
  return Object.values(best).sort((a, b) =>
    parseInt(a.queryId.replace('query_','')) - parseInt(b.queryId.replace('query_',''))
  );
}

export function renderBowlogna(container) {
  container.innerHTML = '';
  currentFilter = 'all';
  tableFilter   = 'all';
  queriesRendered = false;

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = 'Bowlogna Benchmark';
  container.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'page-desc';
  desc.textContent = 'Academic benchmark \u2014 1.23M triples, 17 SPARQL queries.';
  container.appendChild(desc);

  // ── Sub-navigation ─────────────────────────────────────────────────────────
  const subNav = document.createElement('nav');
  subNav.className = 'subnav-bar';
  const btnA = document.createElement('button');
  btnA.className = 'subnav-btn active';
  btnA.textContent = 'Ingestion & Memory';
  const btnB = document.createElement('button');
  btnB.className = 'subnav-btn';
  btnB.textContent = 'SPARQL Queries';
  subNav.appendChild(btnA);
  subNav.appendChild(btnB);
  container.appendChild(subNav);

  // ── Section A: Ingestion ───────────────────────────────────────────────────
  const sectionA = document.createElement('div');

  const loadingBox = document.createElement('div');
  loadingBox.className = 'chart-box chart-box-full';
  const lh = document.createElement('div'); lh.className = 'chart-box-header';
  const lt = document.createElement('h4'); lt.textContent = 'Heap Memory & Triples Over Time';
  const ls = document.createElement('span'); ls.className = 'chart-subtitle'; ls.textContent = 'ms \u2014 lower is better';
  lh.appendChild(lt); lh.appendChild(ls); loadingBox.appendChild(lh);
  const lcw = document.createElement('div'); lcw.className = 'chart-canvas-wrap chart-canvas-tall';
  const lc = document.createElement('canvas'); lc.id = 'chart-bowlogna-loading';
  lcw.appendChild(lc); loadingBox.appendChild(lcw);
  const tpBox = document.createElement('div');
  tpBox.className = 'chart-box';
  const th2 = document.createElement('div'); th2.className = 'chart-box-header';
  const tt2 = document.createElement('h4'); tt2.textContent = 'Average Throughput (t/s)';
  const ts2 = document.createElement('span'); ts2.className = 'chart-subtitle'; ts2.textContent = 'triples/s \u2014 higher is better';
  th2.appendChild(tt2); th2.appendChild(ts2); tpBox.appendChild(th2);
  const tcw = document.createElement('div'); tcw.className = 'chart-canvas-wrap';
  const tc = document.createElement('canvas'); tc.id = 'chart-bowlogna-throughput';
  tcw.appendChild(tc); tpBox.appendChild(tcw);

  const cpuBox = document.createElement('div');
  cpuBox.className = 'chart-box';
  const ch2 = document.createElement('div'); ch2.className = 'chart-box-header';
  const ct2 = document.createElement('h4'); ct2.textContent = 'Average CPU Usage (%)';
  const cs2 = document.createElement('span'); cs2.className = 'chart-subtitle'; cs2.textContent = 'lower is better';
  ch2.appendChild(ct2); ch2.appendChild(cs2); cpuBox.appendChild(ch2);
  const ccw = document.createElement('div'); ccw.className = 'chart-canvas-wrap';
  const cc2 = document.createElement('canvas'); cc2.id = 'chart-bowlogna-cpu';
  ccw.appendChild(cc2); cpuBox.appendChild(ccw);

  const chartsRow = document.createElement('div');
  chartsRow.className = 'charts-row charts-row-ingestion';
  loadingBox.className = 'chart-box chart-box-wide';
  chartsRow.appendChild(loadingBox);
  chartsRow.appendChild(tpBox);
  chartsRow.appendChild(cpuBox);
  sectionA.appendChild(chartsRow);

  const loadTableTitle = document.createElement('h4');
  loadTableTitle.className = 'table-section-title';
  loadTableTitle.textContent = 'Ingestion Results';
  sectionA.appendChild(loadTableTitle);

  const loadTableContainer = document.createElement('div');
  sectionA.appendChild(loadTableContainer);
  container.appendChild(sectionA);

  // ── Section B: SPARQL Queries ──────────────────────────────────────────────
  const sectionB = document.createElement('div');
  sectionB.style.display = 'none';

  // Query-family filter bar
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.id = 'bowlogna-filter-bar';
  Object.entries(FILTERS).forEach(([key, f]) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (key === 'all' ? ' active' : '');
    btn.textContent = f.label;
    btn.addEventListener('click', () => {
      currentFilter = key;
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateBowlogna();
    });
    filterBar.appendChild(btn);
  });
  sectionB.appendChild(filterBar);

  // TTFR chart
  const chartBox = document.createElement('div');
  chartBox.className = 'chart-box chart-box-full';
  const ch = document.createElement('div'); ch.className = 'chart-box-header';
  const ct = document.createElement('h4'); ct.textContent = 'Time per Query';
  const cs = document.createElement('span'); cs.className = 'chart-subtitle'; cs.textContent = 'ms \u2014 lower is better';
  const chint = document.createElement('span'); chint.className = 'chart-legend-hint';
  chint.textContent = '\u2573 Hatched bar\u00a0=\u00a0Timeout (> 60\u00a0s)';
  ch.appendChild(ct); ch.appendChild(cs); ch.appendChild(chint); chartBox.appendChild(ch);
  const cw = document.createElement('div'); cw.className = 'chart-canvas-wrap chart-canvas-tall';
  const cc = document.createElement('canvas'); cc.id = 'chart-bowlogna-ttfr';
  cw.appendChild(cc); chartBox.appendChild(cw);
  sectionB.appendChild(chartBox);

  // Table filter bar
  const tableFilterBar = document.createElement('div');
  tableFilterBar.className = 'table-filter-bar';

  const TABLE_FILTERS = [
    { key: 'all',      label: 'All Results' },
    { key: 'best',     label: '\ud83c\udfc6 Best per Query' },
    { key: 'pass',     label: '\u2713 PASS only' },
    { key: 'failures', label: '\u2715 Failures' },
  ];
  const tfBtns = TABLE_FILTERS.map(f => {
    const btn = document.createElement('button');
    btn.className = 'table-filter-btn' + (f.key === 'all' ? ' active' : '');
    btn.textContent = f.label;
    btn.addEventListener('click', () => {
      tableFilter = f.key;
      tfBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateBowlogna();
    });
    tableFilterBar.appendChild(btn);
    return btn;
  });

  const tableTitle = document.createElement('h4');
  tableTitle.className = 'table-section-title';
  tableTitle.textContent = 'Query Results';
  sectionB.appendChild(tableTitle);
  sectionB.appendChild(tableFilterBar);

  const tableContainer = document.createElement('div');
  tableContainer.id = 'bowlogna-table';
  sectionB.appendChild(tableContainer);
  container.appendChild(sectionB);

  // ── Sub-nav handlers ───────────────────────────────────────────────────────
  btnA.addEventListener('click', () => {
    sectionA.style.display = '';
    sectionB.style.display = 'none';
    btnA.classList.add('active');
    btnB.classList.remove('active');
  });

  btnB.addEventListener('click', () => {
    sectionA.style.display = 'none';
    sectionB.style.display = '';
    btnA.classList.remove('active');
    btnB.classList.add('active');
    if (!queriesRendered) {
      queriesRendered = true;
      requestAnimationFrame(() => {
        updateBowlogna();
        addExpandButton(chartBox);
      });
    }
  });

  requestAnimationFrame(() => {
    const runs = getLoadingRuns(DATASET);
    renderLoadingChart('chart-bowlogna-loading', DATASET);
    renderThroughputChart('chart-bowlogna-throughput', runs);
    renderCpuChart('chart-bowlogna-cpu', runs);
    buildLoadingTableWithFilter(loadTableContainer, runs);
    addExpandButton(loadingBox);
    addExpandButton(tpBox);
    addExpandButton(cpuBox);
  });
}

function updateBowlogna() {
  const allRuns = getQueryRuns(DATASET);
  const filter  = FILTERS[currentFilter];

  const allQueryIds = [...new Set(allRuns.map(r => r.queryId))].sort((a, b) =>
    parseInt(a.replace('query_','')) - parseInt(b.replace('query_',''))
  );

  const queryIds = filter.queries
    ? allQueryIds.filter(id => filter.queries.includes(id))
    : allQueryIds;

  const filteredRuns = filter.queries
    ? allRuns.filter(r => filter.queries.includes(r.queryId))
    : allRuns;

  renderQueryBreakdown('chart-bowlogna-ttfr', filteredRuns, queryIds);

  const tableContainer = document.getElementById('bowlogna-table');
  if (tableContainer) {
    let tableRuns = filteredRuns;
    if (tableFilter === 'best')     tableRuns = getBestPerQuery(filteredRuns);
    else if (tableFilter === 'pass')     tableRuns = filteredRuns.filter(r => r.status === 'PASS');
    else if (tableFilter === 'failures') tableRuns = filteredRuns.filter(r => r.status !== 'PASS');
    buildQueryTable(tableContainer, tableRuns, openResultDialog);
  }
}

export default renderBowlogna;
