// result-table.js — Interactive sortable result tables
'use strict';

import { fmt, fmtMs, fmtThroughput, fmtMemory, computeCV } from '../formatters.js';
import { createStatusBadge } from './status-badge.js';
import { getEngineColor, getEngineLabel } from '../data-loader.js';

/**
 * Build a loading runs table inside a container element.
 * @param {HTMLElement} container
 * @param {Array} runs - normalized loadingRuns
 */
export function buildLoadingTable(container, runs) {
  container.innerHTML = '';

  const COLS = [
    { label: 'Engine',      key: r => getEngineLabel(r.engine),               fmt: r => getEngineLabel(r.engine),                                                      cls: '' },
    { label: 'Dataset',     key: r => r.dataset,                                 fmt: r => r.dataset,                                                                     cls: '' },
    { label: 'File',        key: r => r.file || '',                              fmt: r => r.file || '\u2014',                                                            cls: '' },
    { label: 'Triples',     key: r => r.triples || 0,                           fmt: r => fmt(r.triples),                                                                cls: 'text-right font-mono' },
    { label: 'Median Time', key: r => r.loadingTimeMs || 0,                     fmt: r => fmtMs(r.loadingTimeMs),                                                        cls: 'text-right font-mono' },
    { label: 'Throughput',  key: r => r.throughputTriplesPerSec || 0,           fmt: r => fmtThroughput(r.throughputTriplesPerSec),                                       cls: 'text-right font-mono' },
    { label: 'Heap \u0394', key: r => r.memoryDeltaMb != null ? r.memoryDeltaMb : -Infinity, fmt: r => fmtMemory(r.memoryDeltaMb),                                      cls: 'text-right font-mono' },
    { label: 'Repetitions', key: null,                                           fmt: r => r.repetitionsMs ? r.repetitionsMs.map(v => fmt(v)).join(', ') : '\u2014',     cls: 'font-mono' },
    { label: 'CV (%)',      key: r => computeCV(r.repetitionsMs) ?? -Infinity,   fmt: r => computeCV(r.repetitionsMs) != null ? computeCV(r.repetitionsMs).toFixed(1) + '%' : '\u2014', cls: 'text-right font-mono' },
  ];

  let sortCol = null;
  let sortAsc = true;

  const wrapper = document.createElement('div');
  wrapper.className = 'table-surface';

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';

  const table = document.createElement('table');
  table.className = 'data-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thEls = COLS.map((col, i) => {
    const th = document.createElement('th');
    th.className = col.cls.includes('text-right') ? 'text-right' : '';
    if (col.key) {
      th.classList.add('sortable');
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        if (sortCol === i) { sortAsc = !sortAsc; }
        else { sortCol = i; sortAsc = true; }
        renderBody();
        updateHeaders();
      });
    }
    th.innerHTML = `${col.label} <span class="sort-icon"></span>`;
    headerRow.appendChild(th);
    return th;
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  function updateHeaders() {
    thEls.forEach((th, i) => {
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      icon.textContent = sortCol === i ? (sortAsc ? ' \u25b2' : ' \u25bc') : '';
    });
  }

  function renderBody() {
    tbody.innerHTML = '';
    let sorted = [...runs];
    if (sortCol !== null && COLS[sortCol].key) {
      const keyFn = COLS[sortCol].key;
      sorted.sort((a, b) => {
        const va = keyFn(a), vb = keyFn(b);
        if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortAsc ? va - vb : vb - va;
      });
    }
    sorted.forEach(r => {
      const tr = document.createElement('tr');
      COLS.forEach(col => {
        const td = document.createElement('td');
        td.textContent = col.fmt(r);
        if (col.cls) td.className = col.cls;
        tr.appendChild(td);
      });
      tr.style.borderLeft = `3px solid ${getEngineColor(r.engine)}`;
      tbody.appendChild(tr);
    });
  }

  renderBody();
  scroll.appendChild(table);
  wrapper.appendChild(scroll);
  container.appendChild(wrapper);
}

/**
 * Build a loading table preceded by an All / Best-per-file filter bar.
 * @param {HTMLElement} container
 * @param {Array} allRuns - normalized loadingRuns
 */
export function buildLoadingTableWithFilter(container, allRuns) {
  container.innerHTML = '';

  // Compute best (lowest loadingTimeMs) per (dataset, file)
  function getBest(runs) {
    const best = {};
    runs.forEach(r => {
      const key = `${r.dataset}::${r.file || ''}`;
      if (!best[key] || r.loadingTimeMs < best[key].loadingTimeMs) best[key] = r;
    });
    return Object.values(best);
  }

  let tableFilter = 'all';

  const LOADING_FILTERS = [
    { key: 'all',  label: 'All Results' },
    { key: 'best', label: '\ud83c\udfc6 Best per File' },
  ];

  const filterBar = document.createElement('div');
  filterBar.className = 'table-filter-bar';

  const tableContainer = document.createElement('div');

  const btns = LOADING_FILTERS.map(f => {
    const btn = document.createElement('button');
    btn.className = 'table-filter-btn' + (f.key === 'all' ? ' active' : '');
    btn.textContent = f.label;
    btn.addEventListener('click', () => {
      tableFilter = f.key;
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
    filterBar.appendChild(btn);
    return btn;
  });

  function render() {
    const runs = tableFilter === 'best' ? getBest(allRuns) : allRuns;
    buildLoadingTable(tableContainer, runs);
  }

  container.appendChild(filterBar);
  container.appendChild(tableContainer);
  render();
}

/**
 * Build a query runs table with status badges.
 * @param {HTMLElement} container
 * @param {Array} runs - normalized queryRuns
 * @param {Function} onBadgeClick - callback(run) when badge is clicked
 */
export function buildQueryTable(container, runs, onBadgeClick) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'table-surface';

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';

  const table = document.createElement('table');
  table.className = 'data-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Engine', 'Query', 'Status', 'Median (ms)', 'TTFR (ms)', 'Rows', 'Repetitions'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    if (['Median (ms)', 'TTFR (ms)', 'Rows'].includes(h)) {
      th.className = 'text-right';
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  runs.forEach(r => {
    const tr = document.createElement('tr');

    // Engine
    const tdEngine = document.createElement('td');
    tdEngine.textContent = getEngineLabel(r.engine);
    tr.appendChild(tdEngine);

    // Query
    const tdQuery = document.createElement('td');
    tdQuery.textContent = r.queryId;
    tdQuery.className = 'font-mono';
    tr.appendChild(tdQuery);

    // Status badge
    const tdStatus = document.createElement('td');
    const badge = createStatusBadge(r.status, {
      clickable: true,
      onClick: () => onBadgeClick && onBadgeClick(r),
    });
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    // Median
    const tdMedian = document.createElement('td');
    tdMedian.textContent = r.status === 'TIMEOUT' ? '> 60s (TIMEOUT)' : fmtMs(r.medianMs);
    tdMedian.className = 'text-right font-mono';
    tr.appendChild(tdMedian);

    // TTFR — display dash if -1
    const tdTtfr = document.createElement('td');
    tdTtfr.textContent = (r.medianTtfrMs == null || r.medianTtfrMs === -1) ? '\u2014' : fmtMs(r.medianTtfrMs);
    tdTtfr.className = 'text-right font-mono';
    tr.appendChild(tdTtfr);

    // Rows
    const tdRows = document.createElement('td');
    tdRows.textContent = fmt(r.rowCount);
    tdRows.className = 'text-right font-mono';
    tr.appendChild(tdRows);

    // Repetitions
    const tdReps = document.createElement('td');
    tdReps.textContent = r.repetitionsMs ? r.repetitionsMs.map(v => fmt(v)).join(', ') : '\u2014';
    tdReps.className = 'font-mono';
    tr.appendChild(tdReps);

    tr.style.borderLeft = `3px solid ${getEngineColor(r.engine)}`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrapper.appendChild(scroll);
  container.appendChild(wrapper);
}
