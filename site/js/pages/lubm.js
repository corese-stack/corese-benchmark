// lubm.js — LUBM benchmark page
'use strict';

import state from '../state.js';
import { getQueryRuns, getLoadingRuns } from '../data-loader.js';
import { buildQueryTable, buildLoadingTableWithFilter } from '../components/result-table.js';
import { openResultDialog } from '../components/result-dialog.js';
import { renderQueryBreakdown } from '../charts/query-breakdown.js';
import { renderLoadingChart } from '../charts/loading-chart.js';
import { renderThroughputChart } from '../charts/throughput-chart.js';
import { addExpandButton } from '../chart-expand.js';

const DATASET = 'lubm';

const FILTERS = {
  all:           { label: 'All Queries (14)', queries: null },
  large_results: { label: 'Large Result Sets',       queries: ['query_2','query_6','query_9'] },
  selective:     { label: 'Selective Graph Patterns', queries: ['query_1','query_3','query_5','query_7','query_8','query_10','query_14'] },
  transitive:    { label: 'Transitive & SubOrganization', queries: ['query_4','query_11','query_12','query_13'] },
};

let currentFilter   = 'all';
let tableFilter     = 'all'; // 'all' | 'best' | 'pass' | 'failures'
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

export function renderLubm(container) {
  container.innerHTML = '';
  currentFilter = 'all';
  tableFilter   = 'all';
  queriesRendered = false;

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = 'LUBM Benchmark';
  container.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'page-desc';
  desc.textContent = 'Lehigh University Benchmark \u2014 Inference & RDFS, 14 queries.';
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
  const lc = document.createElement('canvas'); lc.id = 'chart-lubm-loading';
  lcw.appendChild(lc); loadingBox.appendChild(lcw);
  const tpBox = document.createElement('div');
  tpBox.className = 'chart-box';
  const th2 = document.createElement('div'); th2.className = 'chart-box-header';
  const tt2 = document.createElement('h4'); tt2.textContent = 'Average Throughput (t/s)';
  const ts2 = document.createElement('span'); ts2.className = 'chart-subtitle'; ts2.textContent = 'triples/s \u2014 higher is better';
  th2.appendChild(tt2); th2.appendChild(ts2); tpBox.appendChild(th2);
  const tcw = document.createElement('div'); tcw.className = 'chart-canvas-wrap';
  const tc = document.createElement('canvas'); tc.id = 'chart-lubm-throughput';
  tcw.appendChild(tc); tpBox.appendChild(tcw);

  const chartsRow = document.createElement('div');
  chartsRow.className = 'charts-row';
  loadingBox.className = 'chart-box chart-box-wide';
  chartsRow.appendChild(loadingBox);
  chartsRow.appendChild(tpBox);
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
  Object.entries(FILTERS).forEach(([key, f]) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (key === 'all' ? ' active' : '');
    btn.textContent = f.label;
    btn.addEventListener('click', () => {
      currentFilter = key;
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateLubm();
    });
    filterBar.appendChild(btn);
  });
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
  const cc = document.createElement('canvas'); cc.id = 'chart-lubm-breakdown';
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
      updateLubm();
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
  tableContainer.id = 'lubm-table';
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
        updateLubm();
        addExpandButton(chartBox);
      });
    }
  });

  requestAnimationFrame(() => {
    const runs = getLoadingRuns(DATASET);
    renderLoadingChart('chart-lubm-loading', DATASET);
    renderThroughputChart('chart-lubm-throughput', runs);
    buildLoadingTableWithFilter(loadTableContainer, runs);
    addExpandButton(loadingBox);
    addExpandButton(tpBox);
  });
}

function updateLubm() {
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

  renderQueryBreakdown('chart-lubm-breakdown', filteredRuns, queryIds);

  const tableContainer = document.getElementById('lubm-table');
  if (tableContainer) {
    let tableRuns = filteredRuns;
    if (tableFilter === 'best')          tableRuns = getBestPerQuery(filteredRuns);
    else if (tableFilter === 'pass')     tableRuns = filteredRuns.filter(r => r.status === 'PASS');
    else if (tableFilter === 'failures') tableRuns = filteredRuns.filter(r => r.status !== 'PASS');
    buildQueryTable(tableContainer, tableRuns, openResultDialog);
  }
}

export default renderLubm;
