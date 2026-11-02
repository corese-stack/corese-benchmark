// bsbm.js — BSBM benchmark page
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

const DATASET = 'bsbm';

const FILTERS = {
  all:            { label: 'All Queries (12)', queries: null },
  search_product: { label: 'Search & Product Features', queries: ['query_1','query_2','query_3','query_4'] },
  simulations:    { label: 'Simulations & Joins',       queries: ['query_5'] },
  reviews:        { label: 'Reviews & Ratings',         queries: ['query_6','query_9','query_11','query_12'] },
  offers:         { label: 'Offers & Vendors',          queries: ['query_7','query_8','query_10'] },
};

let currentFilter   = 'all';
let tableFilter     = 'all'; // 'all' | 'best' | 'pass' | 'failures'
let logScale        = false;
let queriesRendered = false;

function getBestPerQuery(runs) {
  const best = {};
  runs.forEach(r => {
    if (r.status === 'PASS') {
      if (!best[r.queryId] || r.medianMs < best[r.queryId].medianMs) best[r.queryId] = r;
    }
  });
  runs.forEach(r => { if (!best[r.queryId]) best[r.queryId] = r; });
  return Object.values(best).sort((a, b) =>
    parseInt(a.queryId.replace('query_','')) - parseInt(b.queryId.replace('query_',''))
  );
}

export function renderBsbm(container) {
  container.innerHTML = '';
  currentFilter = 'all';
  tableFilter   = 'all';
  logScale      = false;
  queriesRendered = false;

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = 'BSBM Benchmark';
  container.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'page-desc';
  desc.textContent = 'Berlin SPARQL Benchmark \u2014 eCommerce dataset, 12 queries.';
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

  // ── Section A ──────────────────────────────────────────────────────────────
  const sectionA = document.createElement('div');

  const loadingBox = document.createElement('div');
  loadingBox.className = 'chart-box chart-box-full';
  const lh = document.createElement('div'); lh.className = 'chart-box-header';
  const lt = document.createElement('h4'); lt.textContent = 'Heap Memory & Triples Over Time';
  const ls = document.createElement('span'); ls.className = 'chart-subtitle'; ls.textContent = 'ms \u2014 lower is better';
  lh.appendChild(lt); lh.appendChild(ls); loadingBox.appendChild(lh);
  const lcw = document.createElement('div'); lcw.className = 'chart-canvas-wrap chart-canvas-tall';
  const lc = document.createElement('canvas'); lc.id = 'chart-bsbm-loading';
  lcw.appendChild(lc); loadingBox.appendChild(lcw);
  const tpBox = document.createElement('div');
  tpBox.className = 'chart-box';
  const th2 = document.createElement('div'); th2.className = 'chart-box-header';
  const tt2 = document.createElement('h4'); tt2.textContent = 'Average Throughput (t/s)';
  const ts2 = document.createElement('span'); ts2.className = 'chart-subtitle'; ts2.textContent = 'triples/s \u2014 higher is better';
  th2.appendChild(tt2); th2.appendChild(ts2); tpBox.appendChild(th2);
  const tcw = document.createElement('div'); tcw.className = 'chart-canvas-wrap';
  const tc = document.createElement('canvas'); tc.id = 'chart-bsbm-throughput';
  tcw.appendChild(tc); tpBox.appendChild(tcw);

  const cpuBox = document.createElement('div');
  cpuBox.className = 'chart-box';
  const ch2 = document.createElement('div'); ch2.className = 'chart-box-header';
  const ct2 = document.createElement('h4'); ct2.textContent = 'Average CPU Usage (%)';
  const cs2 = document.createElement('span'); cs2.className = 'chart-subtitle'; cs2.textContent = 'lower is better';
  ch2.appendChild(ct2); ch2.appendChild(cs2); cpuBox.appendChild(ch2);
  const ccw = document.createElement('div'); ccw.className = 'chart-canvas-wrap';
  const cc2 = document.createElement('canvas'); cc2.id = 'chart-bsbm-cpu';
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

  // ── Section B ──────────────────────────────────────────────────────────────
  const sectionB = document.createElement('div');
  sectionB.style.display = 'none';

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.id = 'bsbm-filter-bar';
  Object.entries(FILTERS).forEach(([key, f]) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (key === 'all' ? ' active' : '');
    btn.textContent = f.label;
    btn.addEventListener('click', () => {
      currentFilter = key;
      filterBar.querySelectorAll('.filter-btn:not(.log-scale-btn)').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateBsbm();
    });
    filterBar.appendChild(btn);
  });
  const logBtn = document.createElement('button');
  logBtn.className = 'filter-btn log-scale-btn';
  logBtn.textContent = 'Log Scale';
  logBtn.addEventListener('click', () => {
    logScale = !logScale;
    logBtn.classList.toggle('active', logScale);
    updateBsbm();
  });
  filterBar.appendChild(logBtn);
  sectionB.appendChild(filterBar);

  const chartBox = document.createElement('div');
  chartBox.className = 'chart-box chart-box-full';
  const ch = document.createElement('div'); ch.className = 'chart-box-header';
  const ct = document.createElement('h4'); ct.textContent = 'Time per Query';
  const cs = document.createElement('span'); cs.className = 'chart-subtitle'; cs.textContent = 'ms \u2014 lower is better';
  const chint = document.createElement('span'); chint.className = 'chart-legend-hint';
  chint.textContent = '\u2573 Hatched bar\u00a0=\u00a0Timeout (> 60\u00a0s)';
  ch.appendChild(ct); ch.appendChild(cs); ch.appendChild(chint); chartBox.appendChild(ch);
  const cw = document.createElement('div'); cw.className = 'chart-canvas-wrap chart-canvas-tall';
  const cc = document.createElement('canvas'); cc.id = 'chart-bsbm-breakdown';
  cw.appendChild(cc); chartBox.appendChild(cw);
  sectionB.appendChild(chartBox);

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
      updateBsbm();
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
  tableContainer.id = 'bsbm-table';
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
        updateBsbm();
        addExpandButton(chartBox);
      });
    }
  });

  requestAnimationFrame(() => {
    const runs = getLoadingRuns(DATASET);
    renderLoadingChart('chart-bsbm-loading', DATASET);
    renderThroughputChart('chart-bsbm-throughput', runs);
    renderCpuChart('chart-bsbm-cpu', runs);
    buildLoadingTableWithFilter(loadTableContainer, runs);
    addExpandButton(loadingBox);
    addExpandButton(tpBox);
    addExpandButton(cpuBox);
  });
}

function updateBsbm() {
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

  renderQueryBreakdown('chart-bsbm-breakdown', filteredRuns, queryIds, logScale);

  const tableContainer = document.getElementById('bsbm-table');
  if (tableContainer) {
    let tableRuns = filteredRuns;
    if (tableFilter === 'best')          tableRuns = getBestPerQuery(filteredRuns);
    else if (tableFilter === 'pass')     tableRuns = filteredRuns.filter(r => r.status === 'PASS');
    else if (tableFilter === 'failures') tableRuns = filteredRuns.filter(r => r.status !== 'PASS');
    buildQueryTable(tableContainer, tableRuns, openResultDialog);
  }
}

export default renderBsbm;
