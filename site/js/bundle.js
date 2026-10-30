// bundle.js — Auto-generated. Do not edit directly.
// Run: node build-bundle.js
(function () {
// sloppy mode intentional: block-level function declarations hoist to this scope

// ── state.js ──
// state.js — Global application state (singleton)

const state = {
  activeTab: 'overview',
  data: null,           // normalized data
  rawData: null,        // original JSON
  engines: [],          // engine id list
  activeEngines: [],    // currently visible engines
  charts: {},           // chart instance registry (id -> Chart)
  dataFormat: null,     // 'v1' or 'v2'
};



// ── formatters.js ──
// formatters.js — Number, duration, throughput, memory formatting

/** Format a number with locale (fr-FR) and fixed decimal digits */
function fmt(n, decimals = 0) {
  if (n == null || n === '') return '\u2014'; // em-dash
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: decimals });
}

/** Format milliseconds to human-readable string */
function fmtMs(ms) {
  if (ms == null || ms === -1) return '\u2014';
  if (ms >= 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${fmt(ms)} ms`;
}

/** Format throughput (triples/sec) */
function fmtThroughput(t) {
  if (t == null) return '\u2014';
  if (t >= 1000000) return `${(t / 1000000).toFixed(2)}M t/s`;
  if (t >= 1000) return `${(t / 1000).toFixed(1)}K t/s`;
  return `${fmt(t)} t/s`;
}

/** Format memory in MB — NEVER clamp to 0 (GC can produce negative) */
function fmtMemory(mb) {
  if (mb == null) return '\u2014';
  return `${Number(mb).toFixed(1)} MB`;
}

/** Format percentage */
function fmtPercent(p, decimals = 1) {
  if (p == null) return '\u2014';
  return `${Number(p).toFixed(decimals)}%`;
}

/** Coefficient of variation from array of values */
function computeCV(values) {
  if (!values || values.length < 2) return null;
  const nums = values.filter(v => v != null && v >= 0);
  if (nums.length < 2) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (mean === 0) return 0;
  const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nums.length;
  return (Math.sqrt(variance) / mean) * 100;
}

/** Escape HTML for safe textContent-equivalent in template strings */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// ── data-loader.js ──
// data-loader.js — Load and normalize benchmark JSON (v1 real + v2 mock)


/** Engine color palette */
const ENGINE_COLORS = {
  'corese':      '#4472C4',
  'corese.next': '#2E75B6',
  'jena':        '#ED7D31',
  'rdf4j':       '#70AD47',
};

// Versioned overrides (e.g. corese.4.6.5 → lighter blue to distinguish from v5)
function versionedColor(engineId) {
  const id = engineId.toLowerCase();
  if (id.startsWith('corese.') && id !== 'corese.next') return '#7EB3E8';
  return null;
}

function getEngineColor(engineId) {
  if (ENGINE_COLORS[engineId]) return ENGINE_COLORS[engineId];
  const versioned = versionedColor(engineId);
  if (versioned) return versioned;
  const family = engineId.split('.')[0].toLowerCase();
  return ENGINE_COLORS[family] || '#8b949e';
}

function getEngineLabel(engineId) {
  if (!state.data) return engineId;
  const eng = state.data.engines.find(e => e.id === engineId);
  return eng ? eng.label : engineId;
}

/** Try loading benchmark data: injected global → fetch JSON → fetch mock */
async function loadData() {
  let raw = null;
  let format = null;

  // 1. Prefer pre-injected data (works with file:// and GitHub Pages)
  if (window.__BENCHMARK_DATA__) {
    raw = window.__BENCHMARK_DATA__;
    format = detectFormat(raw);
  }

  // 2. Fetch real JSON (works when served over HTTP)
  if (!raw) {
    try {
      const res = await fetch('data/benchmark-report.json');
      if (res.ok) {
        raw = await res.json();
        format = detectFormat(raw);
      }
    } catch (_) { /* ignore */ }
  }

  // 3. Fallback to mock data
  if (!raw) {
    try {
      const res = await fetch('data/mock-report-v2.json');
      if (res.ok) {
        raw = await res.json();
        format = detectFormat(raw);
      }
    } catch (_) { /* ignore */ }
  }

  if (!raw) throw new Error('No benchmark data found');

  state.rawData = raw;
  state.dataFormat = format;
  state.data = normalize(raw, format);
  state.engines = state.data.engines.map(e => e.id);
  state.activeEngines = [...state.engines];

  return state.data;
}

function detectFormat(json) {
  // v2 has loadingRuns array and metadata.engines
  if (json.loadingRuns && json.metadata && json.metadata.engines) return 'v2';
  // v1 has runs array
  if (json.runs) return 'v1';
  // default to v2 if loadingRuns exists
  if (json.loadingRuns) return 'v2';
  return 'v1';
}

/**
 * Normalize both formats to a common internal structure:
 * {
 *   metadata: { generatedAt, protocol, environment },
 *   engines: [{ id, family, version, label }],
 *   loadingRuns: [{ engine, dataset, file, triples, loadingTimeMs, ... }],
 *   queryRuns: [{ engine, dataset, queryId, queryCategory, status, medianMs, medianTtfrMs, ... }],
 *   timeSeries: { "engine::dataset": [...] },
 *   datasetQueries: { dataset: [{ id, category, label, sparql, expectedRowCount, expectedHash }] }
 * }
 */
function normalize(raw, format) {
  if (format === 'v2') return normalizeV2(raw);
  return normalizeV1(raw);
}

function normalizeV2(raw) {
  const meta = raw.metadata || {};
  const env = meta.environment || {};
  const protocol = meta.protocol || {};

  const engines = (meta.engines || []).map(e => ({
    id: e.id,
    family: e.family || e.id.split('.')[0],
    version: e.version || '',
    label: e.label || e.id,
  }));

  const loadingRuns = (raw.loadingRuns || []).map(r => ({
    engine: r.engine,
    dataset: r.dataset,
    file: r.file,
    triples: r.triples,
    loadingTimeMs: r.loadingTimeMs,
    repetitionsMs: r.repetitionsMs || [],
    throughputTriplesPerSec: r.throughputTriplesPerSec,
    memoryBeforeMb: r.memoryBeforeMb,
    memoryAfterMb: r.memoryAfterMb,
    memoryDeltaMb: r.memoryDeltaMb, // can be negative!
    cpuPercent: r.cpuPercent,
  }));

  // Build timeSeries map
  const timeSeries = {};
  (raw.loadingRuns || []).forEach(r => {
    if (r.timeSeries && r.timeSeries.length > 0) {
      timeSeries[`${r.engine}::${r.dataset}`] = r.timeSeries;
    }
  });

  const queryRuns = (raw.queryRuns || []).map(r => ({
    engine: r.engine,
    dataset: r.dataset,
    queryId: r.queryId,
    queryCategory: r.queryCategory || '',
    status: r.status,
    medianMs: r.medianMs,
    repetitionsMs: r.repetitionsMs || [],
    medianTtfrMs: r.medianTtfrMs,
    repetitionsTtfrMs: r.repetitionsTtfrMs || [],
    rowCount: r.rowCount,
    hash: r.hash || r.resultHash || '',
    errorMessage: r.errorMessage || null,
    heapDeltaMb: r.heapDeltaMb,
  }));

  const datasetQueries = meta.datasetQueries || {};

  return {
    metadata: {
      generatedAt: meta.generatedAt,
      git: meta.git || {},
      protocol,
      environment: env,
    },
    engines,
    loadingRuns,
    queryRuns,
    timeSeries,
    datasetQueries,
  };
}

function normalizeV1(raw) {
  const meta = raw.metadata || {};
  const protocol = meta.protocol || {};

  // Extract engines from runs
  const engineSet = new Set();
  (raw.runs || []).forEach(r => engineSet.add(r.engine));
  (raw.queryRuns || []).forEach(r => engineSet.add(r.engine));

  const engines = [...engineSet].map(id => ({
    id,
    family: id.split('.')[0],
    version: id.split('.').slice(1).join('.') || '',
    label: id,
  }));

  // v1 "runs" -> loadingRuns
  const loadingRuns = (raw.runs || []).map(r => ({
    engine: r.engine,
    dataset: r.dataset,
    file: r.file,
    triples: r.triples,
    loadingTimeMs: r.loadingTimeMs,
    repetitionsMs: r.repetitionsMs || [],
    throughputTriplesPerSec: r.throughputTriplesPerSec || (r.triples && r.loadingTimeMs ? r.triples / (r.loadingTimeMs / 1000) : null),
    memoryBeforeMb: r.memoryBeforeMb,
    memoryAfterMb: r.memoryAfterMb,
    memoryDeltaMb: r.memoryDeltaMb,
    cpuPercent: r.cpuPercent,
  }));

  const queryRuns = (raw.queryRuns || []).map(r => ({
    engine: r.engine,
    dataset: r.dataset,
    queryId: r.queryId,
    queryCategory: r.queryCategory || '',
    status: r.status || 'PASS', // v1 only records successful runs
    medianMs: r.medianMs,
    repetitionsMs: r.repetitionsMs || [],
    medianTtfrMs: r.medianTtfrMs != null ? r.medianTtfrMs : -1,
    repetitionsTtfrMs: r.repetitionsTtfrMs || [],
    rowCount: r.rowCount != null ? r.rowCount : null,
    hash: r.resultHash || r.hash || '',
    errorMessage: r.errorMessage || null,
    heapDeltaMb: r.heapDeltaMb,
  }));

  // Build environment from v1 metadata
  const environment = {
    cpuModel: meta.cpu || '',
    cpuCores: meta.cpuCores,
    cpuThreads: meta.cpuThreads,
    ramTotalGb: meta.ramGb,
    osDistribution: meta.os || '',
    osKernel: meta.osKernel || '',
    jvmVersion: meta.java || '',
    jvmFlags: meta.jvmFlags || (protocol.jvmArgs ? protocol.jvmArgs : []),
  };

  return {
    metadata: {
      generatedAt: meta.generatedAt,
      git: meta.git || {},
      protocol,
      environment,
    },
    engines,
    loadingRuns,
    queryRuns,
    timeSeries: {},
    datasetQueries: meta.datasetQueries || {},
  };
}

/** Get unique datasets present in the data */
function getDatasets() {
  if (!state.data) return [];
  const sets = new Set();
  state.data.loadingRuns.forEach(r => sets.add(r.dataset));
  state.data.queryRuns.forEach(r => sets.add(r.dataset));
  return [...sets];
}

/** Filter queryRuns by dataset and optionally by engine */
function getQueryRuns(dataset, engines) {
  if (!state.data) return [];
  const eng = engines || state.activeEngines;
  return state.data.queryRuns.filter(r =>
    r.dataset === dataset && eng.includes(r.engine)
  );
}

/** Filter loadingRuns by dataset and optionally by engine */
function getLoadingRuns(dataset, engines) {
  if (!state.data) return [];
  const eng = engines || state.activeEngines;
  return state.data.loadingRuns.filter(r =>
    r.dataset === dataset && eng.includes(r.engine)
  );
}

/** Get query metadata for a dataset */
function getQueryMeta(dataset, queryId) {
  if (!state.data || !state.data.datasetQueries[dataset]) return null;
  return state.data.datasetQueries[dataset].find(q => q.id === queryId) || null;
}


// ── components/status-badge.js ──
// status-badge.js — Render status badges (PASS, MISMATCH, TIMEOUT, ERROR)

const STATUS_STYLES = {
  PASS:     { bg: '#2ecc71', color: '#fff', label: 'PASS' },
  MISMATCH: { bg: '#e74c3c', color: '#fff', label: 'MISMATCH' },
  TIMEOUT:  { bg: '#f39c12', color: '#fff', label: 'TIMEOUT' },
  ERROR:    { bg: '#8e44ad', color: '#fff', label: 'ERROR' },
};

/**
 * Create a status badge element.
 * @param {string} status - PASS, MISMATCH, TIMEOUT, ERROR
 * @param {object} [opts] - Optional: { clickable, onClick }
 * @returns {HTMLSpanElement}
 */
function createStatusBadge(status, opts = {}) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.ERROR;
  const span = document.createElement('span');
  span.className = 'status-badge';
  span.textContent = style.label;
  span.style.cssText = `
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    background: ${style.bg};
    color: ${style.color};
    cursor: ${opts.clickable ? 'pointer' : 'default'};
    user-select: none;
  `;

  if (opts.clickable && opts.onClick) {
    span.addEventListener('click', opts.onClick);
    span.title = 'Click to inspect';
  }

  return span;
}

/**
 * Return status badge as HTML string (for use in innerHTML-free contexts,
 * to be appended via DOM methods).
 */
function statusBadgeHTML(status) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.ERROR;
  // Returns a span element — caller must use textContent or DOM methods
  return { label: style.label, bg: style.bg, color: style.color };
}



// ── components/result-dialog.js ──
// result-dialog.js — Modal dialog for inspecting query results (diff inspector)


let dialogEl = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;

  dialogEl = document.createElement('dialog');
  dialogEl.className = 'result-dialog';
  dialogEl.addEventListener('click', (e) => {
    if (e.target === dialogEl) dialogEl.close();
  });

  document.body.appendChild(dialogEl);
  return dialogEl;
}

/**
 * Open the result inspection dialog for a query run.
 * @param {object} run - normalized queryRun
 */
function openResultDialog(run) {
  const dialog = ensureDialog();
  dialog.innerHTML = '';

  const inner = document.createElement('div');
  inner.className = 'result-dialog-inner';

  // Header
  const header = document.createElement('div');
  header.className = 'result-dialog-header';

  const title = document.createElement('h3');
  title.textContent = `${run.queryId} \u2014 ${getEngineLabel(run.engine)}`;
  header.appendChild(title);

  const badge = createStatusBadge(run.status);
  header.appendChild(badge);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'dialog-close-btn';
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('click', () => dialog.close());
  header.appendChild(closeBtn);

  inner.appendChild(header);

  // Query metadata
  const queryMeta = getQueryMeta(run.dataset, run.queryId);

  // SPARQL query display (XSS-safe: textContent only)
  if (queryMeta && queryMeta.sparql) {
    const sparqlSection = document.createElement('div');
    sparqlSection.className = 'result-dialog-section';

    const sparqlLabel = document.createElement('h4');
    sparqlLabel.textContent = 'SPARQL Query';
    sparqlSection.appendChild(sparqlLabel);

    const pre = document.createElement('pre');
    pre.className = 'sparql-display';
    const code = document.createElement('code');
    code.textContent = queryMeta.sparql; // XSS-safe
    pre.appendChild(code);
    sparqlSection.appendChild(pre);
    inner.appendChild(sparqlSection);
  }

  // Results comparison — only shown when at least one value is available (v2 data)
  const expectedRows = queryMeta ? queryMeta.expectedRowCount : null;
  const expectedHash = queryMeta ? queryMeta.expectedHash : null;
  const hasComparisonData = expectedRows != null || run.rowCount != null || expectedHash || run.hash;

  if (hasComparisonData) {
    const compSection = document.createElement('div');
    compSection.className = 'result-dialog-section';

    const compLabel = document.createElement('h4');
    compLabel.textContent = 'Result Comparison';
    compSection.appendChild(compLabel);

    const grid = document.createElement('div');
    grid.className = 'result-dialog-grid';

    addComparisonRow(grid, 'Row Count',
      expectedRows != null ? fmt(expectedRows) : '\u2014',
      run.rowCount != null ? fmt(run.rowCount) : '\u2014',
      expectedRows != null && run.rowCount !== expectedRows
    );

    addComparisonRow(grid, 'Result Hash (SHA-256)',
      expectedHash || '\u2014',
      run.hash || '\u2014',
      expectedHash != null && run.hash !== expectedHash
    );

    compSection.appendChild(grid);
    inner.appendChild(compSection);
  }

  // Metrics
  const metricsSection = document.createElement('div');
  metricsSection.className = 'result-dialog-section';

  const metricsLabel = document.createElement('h4');
  metricsLabel.textContent = 'Execution Metrics';
  metricsSection.appendChild(metricsLabel);

  const metricsList = document.createElement('dl');
  metricsList.className = 'result-dialog-metrics';

  addMetric(metricsList, 'Median Time', fmtMs(run.medianMs));
  addMetric(metricsList, 'TTFR', run.medianTtfrMs === -1 ? '\u2014' : fmtMs(run.medianTtfrMs));
  addMetric(metricsList, 'Repetitions (ms)', Array.isArray(run.repetitionsMs) && run.repetitionsMs.length ? run.repetitionsMs.join(', ') : '\u2014');

  if (run.errorMessage) {
    const errSection = document.createElement('div');
    errSection.className = 'result-dialog-error';
    const errLabel = document.createElement('strong');
    errLabel.textContent = 'Error: ';
    errSection.appendChild(errLabel);
    const errMsg = document.createElement('span');
    errMsg.textContent = run.errorMessage; // XSS-safe
    errSection.appendChild(errMsg);
    metricsSection.appendChild(errSection);
  }

  metricsSection.appendChild(metricsList);
  inner.appendChild(metricsSection);

  dialog.appendChild(inner);
  dialog.showModal();
}

function addComparisonRow(grid, label, expected, actual, isMismatch) {
  const row = document.createElement('div');
  row.className = 'comparison-row' + (isMismatch ? ' mismatch' : '');

  const lbl = document.createElement('div');
  lbl.className = 'comparison-label';
  lbl.textContent = label;

  const exp = document.createElement('div');
  exp.className = 'comparison-expected';
  const expLabel = document.createElement('small');
  expLabel.textContent = 'Expected: ';
  exp.appendChild(expLabel);
  const expVal = document.createElement('span');
  expVal.className = 'font-mono';
  expVal.textContent = expected;
  exp.appendChild(expVal);

  const act = document.createElement('div');
  act.className = 'comparison-actual';
  const actLabel = document.createElement('small');
  actLabel.textContent = 'Actual: ';
  act.appendChild(actLabel);
  const actVal = document.createElement('span');
  actVal.className = 'font-mono';
  actVal.textContent = actual;
  act.appendChild(actVal);

  row.appendChild(lbl);
  row.appendChild(exp);
  row.appendChild(act);
  grid.appendChild(row);
}

function addMetric(dl, label, value) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  dl.appendChild(dt);
  const dd = document.createElement('dd');
  dd.textContent = value;
  dd.className = 'font-mono';
  dl.appendChild(dd);
}



// ── components/result-table.js ──
// result-table.js — Interactive sortable result tables


/**
 * Build a loading runs table inside a container element.
 * @param {HTMLElement} container
 * @param {Array} runs - normalized loadingRuns
 */
function buildLoadingTable(container, runs) {
  container.innerHTML = '';

  const COLS = [
    { label: 'Engine',      key: r => getEngineLabel(r.engine),               fmt: r => getEngineLabel(r.engine),                                                      cls: '' },
    { label: 'Dataset',     key: r => r.dataset,                                 fmt: r => r.dataset,                                                                     cls: '' },
    { label: 'File',        key: r => r.file || '',                              fmt: r => r.file || '\u2014',                                                            cls: '' },
    { label: 'Triples',     key: r => r.triples || 0,                           fmt: r => fmt(r.triples),                                                                cls: 'text-right font-mono' },
    { label: 'Median Time', key: r => r.loadingTimeMs || 0,                     fmt: r => fmtMs(r.loadingTimeMs),                                                        cls: 'text-right font-mono' },
    { label: 'Throughput',  key: r => r.throughputTriplesPerSec || 0,           fmt: r => fmtThroughput(r.throughputTriplesPerSec),                                       cls: 'text-right font-mono' },
    { label: 'Heap \u0394', key: r => r.memoryDeltaMb != null ? r.memoryDeltaMb : -Infinity, fmt: r => fmtMemory(r.memoryDeltaMb),                                      cls: 'text-right font-mono' },
    { label: 'CPU %',      key: r => r.cpuPercent != null ? r.cpuPercent : -Infinity,       fmt: r => r.cpuPercent != null ? r.cpuPercent.toFixed(1) + '%' : '\u2014',   cls: 'text-right font-mono' },
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
function buildLoadingTableWithFilter(container, allRuns) {
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
function buildQueryTable(container, runs, onBadgeClick) {
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


// ── charts/loading-chart.js ──
// loading-chart.js — Bi-axis loading chart (heap memory + triples loaded over time)


/**
 * Render bi-axis loading chart on a canvas.
 * X = elapsed time (s), Y1 = heap used (MB), Y2 = triples loaded (cumulative)
 * @param {string} canvasId
 * @param {string} dataset
 * @returns {Chart|null}
 */
function renderLoadingChart(canvasId, dataset) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  // Destroy previous instance
  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
    delete state.charts[canvasId];
  }

  const ctx = canvas.getContext('2d');

  // Collect timeSeries data for this dataset
  const datasets = [];
  state.activeEngines.forEach(engineId => {
    const key = `${engineId}::${dataset}`;
    const ts = state.data.timeSeries[key];
    if (!ts || ts.length === 0) return;

    const color = getEngineColor(engineId);
    const label = getEngineLabel(engineId);

    // Heap line (Y1 - left axis)
    datasets.push({
      label: `${label} - Heap (MB)`,
      data: ts.map(p => ({ x: p.elapsedMs / 1000, y: p.heapUsedMb })),
      borderColor: color,
      backgroundColor: color + '33',
      borderWidth: 2,
      pointRadius: 2,
      fill: false,
      yAxisID: 'y1',
      tension: 0.3,
    });

    // Triples line (Y2 - right axis)
    datasets.push({
      label: `${label} - Triples`,
      data: ts.map(p => ({ x: p.elapsedMs / 1000, y: p.triplesLoaded })),
      borderColor: color,
      backgroundColor: color + '15',
      borderWidth: 2,
      borderDash: [5, 3],
      pointRadius: 0,
      fill: true,
      yAxisID: 'y2',
      tension: 0.3,
    });
  });

  // Fallback: no timeSeries data (v1 format) → bar chart of loading times
  if (datasets.length === 0) {
    const barLabels = [];
    const barValues = [];
    const barColors = [];
    state.activeEngines.forEach(engineId => {
      const run = state.data.loadingRuns.find(r => r.engine === engineId && r.dataset === dataset);
      if (!run) return;
      barLabels.push(getEngineLabel(engineId));
      barValues.push(run.loadingTimeMs);
      barColors.push(getEngineColor(engineId));
    });
    if (barLabels.length === 0) return null;
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: barLabels,
        datasets: [{
          label: 'Loading Time (ms)',
          data: barValues,
          backgroundColor: barColors.map(c => c + 'cc'),
          borderColor: barColors,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => {
            const ms = ctx.parsed.y;
            return `${ms >= 1000 ? (ms/1000).toFixed(1)+'s' : ms+' ms'}`;
          }}},
        },
        scales: {
          x: { ticks: { color: '#8b949e' }, grid: { display: false } },
          y: {
            title: { display: true, text: 'Loading Time (ms)', color: '#8b949e' },
            ticks: { color: '#8b949e', callback: v => v >= 1000 ? (v/1000).toFixed(1)+'s' : v },
            grid: { color: 'rgba(48,54,61,0.3)' },
          },
        },
      },
    });
    state.charts[canvasId] = chart;
    return chart;
  }

  const chart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#e6edf3', font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const label = ctx.dataset.label || '';
              const val = ctx.parsed.y;
              if (label.includes('Heap')) return `${label}: ${val.toFixed(1)} MB`;
              if (label.includes('Triples')) return `${label}: ${val.toLocaleString()}`;
              return `${label}: ${val}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Elapsed Time (s)', color: '#8b949e' },
          ticks: { color: '#8b949e' },
          grid: { color: 'rgba(48,54,61,0.5)' },
        },
        y1: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Heap Used (MB)', color: '#8b949e' },
          ticks: { color: '#8b949e' },
          grid: { color: 'rgba(48,54,61,0.3)' },
        },
        y2: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Triples Loaded', color: '#8b949e' },
          ticks: { color: '#8b949e' },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });

  state.charts[canvasId] = chart;
  return chart;
}



// ── charts/throughput-chart.js ──
// throughput-chart.js — Horizontal bar chart for loading throughput with min/max error bars


/** Inline Chart.js plugin to draw horizontal error bar whiskers */
const errorBarPlugin = {
  id: 'errorBars',
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || !opts.bars || opts.bars.length === 0) return;
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(200,200,210,0.85)';
    ctx.lineWidth = 2;
    const CAP = 5;

    opts.bars.forEach((bar, i) => {
      if (!bar) return;
      const element = meta.data[i];
      if (!element) return;
      const y = element.y;
      const xMin = xScale.getPixelForValue(bar.min);
      const xMax = xScale.getPixelForValue(bar.max);

      // Whisker line
      ctx.beginPath(); ctx.moveTo(xMin, y); ctx.lineTo(xMax, y); ctx.stroke();
      // End caps
      ctx.beginPath(); ctx.moveTo(xMin, y - CAP); ctx.lineTo(xMin, y + CAP); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xMax, y - CAP); ctx.lineTo(xMax, y + CAP); ctx.stroke();
    });

    ctx.restore();
  },
};

/**
 * Render throughput horizontal bar chart with min/max error bars.
 * @param {string} canvasId
 * @param {Array} loadingRuns - filtered loading runs
 */
function renderThroughputChart(canvasId, loadingRuns) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
    delete state.charts[canvasId];
  }

  const ctx = canvas.getContext('2d');

  // Group by engine
  const engineData = {};
  loadingRuns.forEach(r => {
    if (!state.activeEngines.includes(r.engine)) return;
    if (!engineData[r.engine]) engineData[r.engine] = [];
    engineData[r.engine].push(r);
  });

  const labels = [];
  const data = [];
  const bgColors = [];
  const borderColors = [];
  const errorBars = [];

  Object.entries(engineData).forEach(([engine, runs]) => {
    const avgThroughput = runs.reduce((s, r) => s + (r.throughputTriplesPerSec || 0), 0) / runs.length;

    // Compute per-repetition throughputs for min/max whiskers
    const allRepThroughputs = runs.flatMap(r => {
      if (!r.repetitionsMs || !r.triples) return [];
      return r.repetitionsMs.filter(ms => ms > 0).map(ms => r.triples / (ms / 1000));
    });

    labels.push(getEngineLabel(engine));
    data.push(Math.round(avgThroughput));
    bgColors.push(getEngineColor(engine) + 'cc');
    borderColors.push(getEngineColor(engine));

    errorBars.push(allRepThroughputs.length >= 2 ? {
      min: Math.round(Math.min(...allRepThroughputs)),
      max: Math.round(Math.max(...allRepThroughputs)),
    } : null);
  });

  if (data.length === 0) return null;

  const chart = new Chart(ctx, {
    type: 'bar',
    plugins: [errorBarPlugin],
    data: {
      labels,
      datasets: [{
        label: 'Throughput (triples/s)',
        data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        errorBars: { bars: errorBars },
        tooltip: {
          callbacks: {
            label(ctx) {
              const bar = errorBars[ctx.dataIndex];
              let line = `Avg: ${ctx.parsed.x.toLocaleString()} t/s`;
              if (bar) line += `  |  Min: ${bar.min.toLocaleString()}  Max: ${bar.max.toLocaleString()}`;
              return line;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Throughput (triples/s)', color: '#8b949e' },
          ticks: { color: '#8b949e', callback: v => v.toLocaleString() },
          grid: { color: 'rgba(48,54,61,0.3)' },
        },
        y: {
          ticks: { color: '#8b949e' },
          grid: { display: false },
        },
      },
    },
  });

  state.charts[canvasId] = chart;
  return chart;
}



// ── charts/cpu-chart.js ──
// cpu-chart.js — Horizontal bar chart for average CPU usage during loading


/**
 * Render CPU % horizontal bar chart.
 * @param {string} canvasId
 * @param {Array} loadingRuns - filtered loading runs
 */
function renderCpuChart(canvasId, loadingRuns) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
    delete state.charts[canvasId];
  }

  const ctx = canvas.getContext('2d');

  const labels = [];
  const data = [];
  const bgColors = [];
  const borderColors = [];

  state.activeEngines.forEach(engine => {
    const runs = loadingRuns.filter(r => r.engine === engine && r.cpuPercent != null);
    if (runs.length === 0) return;
    const avg = runs.reduce((s, r) => s + r.cpuPercent, 0) / runs.length;
    labels.push(getEngineLabel(engine));
    data.push(+avg.toFixed(1));
    bgColors.push(getEngineColor(engine) + 'cc');
    borderColors.push(getEngineColor(engine));
  });

  if (data.length === 0) return null;

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg CPU (%)',
        data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.x.toFixed(1)} %`,
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          title: { display: true, text: 'CPU Usage (%)', color: '#8b949e' },
          ticks: { color: '#8b949e', callback: v => v + '%' },
          grid: { color: 'rgba(48,54,61,0.3)' },
        },
        y: {
          ticks: { color: '#8b949e' },
          grid: { display: false },
        },
      },
    },
  });

  state.charts[canvasId] = chart;
  return chart;
}



// ── charts/query-breakdown.js ──
{
// query-breakdown.js — Grouped bar chart: median time per query per engine


const TIMEOUT_MS = 60000;

/** Create a diagonal hatch CanvasPattern for TIMEOUT bars */
function createHatchPattern(ctx, color) {
  const size = 8;
  const pc = document.createElement('canvas');
  pc.width = size; pc.height = size;
  const pctx = pc.getContext('2d');
  pctx.strokeStyle = color;
  pctx.lineWidth = 1.5;
  // diagonal stripe
  pctx.beginPath(); pctx.moveTo(0, size); pctx.lineTo(size, 0); pctx.stroke();
  pctx.beginPath(); pctx.moveTo(-size/2, size/2); pctx.lineTo(size/2, -size/2); pctx.stroke();
  pctx.beginPath(); pctx.moveTo(size/2, size*1.5); pctx.lineTo(size*1.5, size/2); pctx.stroke();
  return ctx.createPattern(pc, 'repeat');
}

/**
 * Render grouped bar chart: one bar per engine per query, showing median ms.
 * TIMEOUT queries shown at 60000ms with diagonal hatch pattern.
 *
 * @param {string} canvasId
 * @param {Array} queryRuns - filtered queryRuns for one dataset
 * @param {Array} queryIds - ordered query IDs to display
 * @param {boolean} [logScale=false]
 * @returns {Chart|null}
 */
function renderQueryBreakdown(canvasId, queryRuns, queryIds, logScale = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
    delete state.charts[canvasId];
  }

  const ctx = canvas.getContext('2d');
  const engines = state.activeEngines;

  const labels = queryIds.map(qid => qid.replace('query_', 'Q'));

  const datasets = engines.map(eng => {
    const color = getEngineColor(eng);
    const label = getEngineLabel(eng);
    const data = [];
    const statuses = [];

    queryIds.forEach(qid => {
      const run = queryRuns.find(r => r.engine === eng && r.queryId === qid);
      if (!run) {
        data.push(null);
        statuses.push(null);
      } else if (run.status === 'TIMEOUT') {
        data.push(TIMEOUT_MS);
        statuses.push('TIMEOUT');
      } else {
        data.push(run.medianMs || 0);
        statuses.push(run.status);
      }
    });

    const hatch = createHatchPattern(ctx, color);

    return {
      label,
      data,
      backgroundColor: data.map((_, i) => statuses[i] === 'TIMEOUT' ? hatch : color + 'cc'),
      borderColor: color,
      borderWidth: 1,
      borderRadius: 2,
      _statuses: statuses,
    };
  });

  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#8b949e',
            font: { size: 11 },
            boxWidth: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const ds = context.dataset;
              const i = context.dataIndex;
              const val = context.parsed.y;
              if (val === null) return `${ds.label}: N/A`;
              if (ds._statuses && ds._statuses[i] === 'TIMEOUT') {
                return `${ds.label}: > 60s (TIMEOUT)`;
              }
              return `${ds.label}: ${val.toLocaleString()} ms`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8b949e', font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          type: logScale ? 'logarithmic' : 'linear',
          title: { display: true, text: 'ms — lower is better', color: '#8b949e' },
          ticks: {
            color: '#8b949e',
            callback: v => v === 0 ? '0 ms' : v.toLocaleString() + ' ms',
          },
          grid: { color: 'rgba(48,54,61,0.3)' },
        },
      },
    },
  });

  state.charts[canvasId] = chart;
  return chart;
}


}

// ── chart-expand.js ──
// chart-expand.js — Fullscreen expand + PNG download buttons for chart boxes


function collapseChart(box) {
  box.classList.remove('chart-fullscreen');
  const backdrop = document.querySelector('.chart-backdrop');
  if (backdrop) backdrop.remove();
  const canvas = box.querySelector('canvas');
  if (canvas && canvas.id && state.charts[canvas.id]) {
    setTimeout(() => state.charts[canvas.id].resize(), 50);
  }
}

function downloadChartPng(chartBox) {
  const canvas = chartBox.querySelector('canvas');
  if (!canvas) return;

  // Draw chart onto a white-background offscreen canvas for clean PNG
  const offscreen = document.createElement('canvas');
  offscreen.width  = canvas.width;
  offscreen.height = canvas.height;
  const ctx = offscreen.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);
  ctx.drawImage(canvas, 0, 0);

  const title = chartBox.querySelector('h4')?.textContent || 'chart';
  const name  = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const a = document.createElement('a');
  a.download = `corese-benchmark-${name}.png`;
  a.href = offscreen.toDataURL('image/png');
  a.click();
}

/**
 * Add expand (⛶) and download (⬇) buttons to a chart box header.
 * @param {HTMLElement} chartBox - element with class chart-box
 */
function addExpandButton(chartBox) {
  if (!chartBox) return;
  const header = chartBox.querySelector('.chart-box-header');
  if (!header || header.querySelector('.chart-expand-btn')) return;

  const btnGroup = document.createElement('div');
  btnGroup.className = 'chart-btn-group';

  // Download PNG button
  const dlBtn = document.createElement('button');
  dlBtn.className = 'chart-expand-btn';
  dlBtn.title = 'Download PNG';
  dlBtn.textContent = '\u2193'; // ↓
  dlBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadChartPng(chartBox);
  });

  // Expand button
  const expBtn = document.createElement('button');
  expBtn.className = 'chart-expand-btn';
  expBtn.title = 'Enlarge chart';
  expBtn.textContent = '\u26f6'; // ⛶

  expBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = chartBox.classList.contains('chart-fullscreen');

    document.querySelectorAll('.chart-fullscreen').forEach(b => collapseChart(b));

    if (!isExpanded) {
      const backdrop = document.createElement('div');
      backdrop.className = 'chart-backdrop';
      backdrop.addEventListener('click', () => collapseChart(chartBox));
      document.body.appendChild(backdrop);

      chartBox.classList.add('chart-fullscreen');
      const canvas = chartBox.querySelector('canvas');
      if (canvas && canvas.id && state.charts[canvas.id]) {
        setTimeout(() => state.charts[canvas.id].resize(), 50);
      }
    }
  });

  btnGroup.appendChild(dlBtn);
  btnGroup.appendChild(expBtn);
  header.appendChild(btnGroup);
}


// ── pages/overview.js ──
// overview.js — Overview page with KPI cards and summary charts


/**
 * Render the overview page.
 * @param {HTMLElement} container
 */
function renderOverview(container) {
  container.innerHTML = '';

  const data = state.data;
  if (!data) return;

  // Section heading
  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = 'Overview';
  container.appendChild(heading);

  // KPI cards grid
  const kpiGrid = document.createElement('div');
  kpiGrid.className = 'kpi-grid';

  // Compute KPIs per engine
  state.activeEngines.forEach(engineId => {
    const loadRuns = data.loadingRuns.filter(r => r.engine === engineId);
    const queryRuns = data.queryRuns.filter(r => r.engine === engineId);

    // Avg throughput
    const avgThroughput = loadRuns.length > 0
      ? loadRuns.reduce((s, r) => s + (r.throughputTriplesPerSec || 0), 0) / loadRuns.length
      : null;

    // Avg median latency (PASS only)
    const passRuns = queryRuns.filter(r => r.status === 'PASS');
    const avgLatency = passRuns.length > 0
      ? passRuns.reduce((s, r) => s + r.medianMs, 0) / passRuns.length
      : null;

    // Pass rate
    const totalQueries = queryRuns.length;
    const passCount = passRuns.length;
    const passRate = totalQueries > 0 ? (passCount / totalQueries) * 100 : null;

    const card = createKpiCard(getEngineLabel(engineId), getEngineColor(engineId), [
      { label: 'Avg Throughput', value: fmtThroughput(avgThroughput) },
      { label: 'Avg Latency (PASS)', value: fmtMs(avgLatency) },
      { label: 'Pass Rate', value: passRate != null ? fmtPercent(passRate) : '\u2014' },
      { label: 'Queries', value: `${passCount} / ${totalQueries}` },
    ]);
    kpiGrid.appendChild(card);
  });

  container.appendChild(kpiGrid);

  // Charts section
  const chartsRow = document.createElement('div');
  chartsRow.className = 'charts-row';

  // Throughput bar chart
  const throughputBox = createChartBox('Average Ingestion Throughput', 'chart-overview-throughput');
  chartsRow.appendChild(throughputBox);

  // Latency bar chart
  const latencyBox = createChartBox('Average Query Latency (PASS only)', 'chart-overview-latency');
  chartsRow.appendChild(latencyBox);

  container.appendChild(chartsRow);

  // Render charts after DOM is in place
  requestAnimationFrame(() => {
    renderThroughputOverview('chart-overview-throughput');
    renderLatencyOverview('chart-overview-latency');
  });
}

function createKpiCard(title, color, metrics) {
  const card = document.createElement('div');
  card.className = 'kpi-card';
  card.style.borderTopColor = color;

  const h3 = document.createElement('h3');
  h3.className = 'kpi-card-title';
  h3.textContent = title;
  h3.style.color = color;
  card.appendChild(h3);

  const metricsDiv = document.createElement('div');
  metricsDiv.className = 'kpi-card-metrics';

  metrics.forEach(m => {
    const row = document.createElement('div');
    row.className = 'kpi-metric-row';

    const label = document.createElement('span');
    label.className = 'kpi-metric-label';
    label.textContent = m.label;
    row.appendChild(label);

    const value = document.createElement('span');
    value.className = 'kpi-metric-value font-mono';
    value.textContent = m.value;
    row.appendChild(value);

    metricsDiv.appendChild(row);
  });

  card.appendChild(metricsDiv);
  return card;
}

function createChartBox(title, canvasId) {
  const box = document.createElement('div');
  box.className = 'chart-box';

  const header = document.createElement('div');
  header.className = 'chart-box-header';
  const h4 = document.createElement('h4');
  h4.textContent = title;
  header.appendChild(h4);
  box.appendChild(header);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'chart-canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.id = canvasId;
  canvasWrap.appendChild(canvas);
  box.appendChild(canvasWrap);

  return box;
}

function renderThroughputOverview(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
    delete state.charts[canvasId];
  }

  const labels = [];
  const values = [];
  const colors = [];

  state.activeEngines.forEach(eng => {
    const runs = state.data.loadingRuns.filter(r => r.engine === eng);
    if (runs.length === 0) return;
    const avg = runs.reduce((s, r) => s + (r.throughputTriplesPerSec || 0), 0) / runs.length;
    labels.push(getEngineLabel(eng));
    values.push(Math.round(avg));
    colors.push(getEngineColor(eng));
  });

  state.charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 1 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toLocaleString()} t/s` } } },
      scales: {
        y: { title: { display: true, text: 'Throughput (t/s)', color: '#8b949e' }, ticks: { color: '#8b949e', callback: v => v.toLocaleString() }, grid: { color: 'rgba(48,54,61,0.3)' } },
        x: { ticks: { color: '#8b949e' }, grid: { display: false } },
      },
    },
  });
}

function renderLatencyOverview(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
    delete state.charts[canvasId];
  }

  const labels = [];
  const values = [];
  const colors = [];

  state.activeEngines.forEach(eng => {
    const passRuns = state.data.queryRuns.filter(r => r.engine === eng && r.status === 'PASS');
    if (passRuns.length === 0) return;
    const avg = passRuns.reduce((s, r) => s + r.medianMs, 0) / passRuns.length;
    labels.push(getEngineLabel(eng));
    values.push(Math.round(avg));
    colors.push(getEngineColor(eng));
  });

  state.charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 1 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toLocaleString()} ms` } } },
      scales: {
        y: { title: { display: true, text: 'Median Latency (ms)', color: '#8b949e' }, ticks: { color: '#8b949e' }, grid: { color: 'rgba(48,54,61,0.3)' } },
        x: { ticks: { color: '#8b949e' }, grid: { display: false } },
      },
    },
  });
}



// ── pages/bowlogna.js ──
{
// bowlogna.js — Bowlogna benchmark page


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

function renderBowlogna(container) {
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


}

// ── pages/bsbm.js ──
{
// bsbm.js — BSBM benchmark page


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

function renderBsbm(container) {
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


}

// ── pages/lubm.js ──
{
// lubm.js — LUBM benchmark page


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

function renderLubm(container) {
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

  const cpuBox = document.createElement('div');
  cpuBox.className = 'chart-box';
  const ch2 = document.createElement('div'); ch2.className = 'chart-box-header';
  const ct2 = document.createElement('h4'); ct2.textContent = 'Average CPU Usage (%)';
  const cs2 = document.createElement('span'); cs2.className = 'chart-subtitle'; cs2.textContent = 'lower is better';
  ch2.appendChild(ct2); ch2.appendChild(cs2); cpuBox.appendChild(ch2);
  const ccw = document.createElement('div'); ccw.className = 'chart-canvas-wrap';
  const cc2 = document.createElement('canvas'); cc2.id = 'chart-lubm-cpu';
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
    renderCpuChart('chart-lubm-cpu', runs);
    buildLoadingTableWithFilter(loadTableContainer, runs);
    addExpandButton(loadingBox);
    addExpandButton(tpBox);
    addExpandButton(cpuBox);
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


}

// ── pages/dbpedia.js ──
{
// dbpedia.js — DBpedia Scale page with file selector and bilogarithmic chart


const DATASET = 'dbpedia';

const DBPEDIA_FILES = [
  'persondata_en.nt',
  'homepages_en.nt',
  'category_labels_en.nt',
  'disambiguations_en.nt',
  'specific_mappingbased_properties_en.nt',
];

let selectedFile = null; // null = all files

function renderDbpedia(container) {
  container.innerHTML = '';
  selectedFile = null;

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = 'DBpedia Scale';
  container.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'page-desc';
  desc.textContent = 'Scalability testing on real-world DBpedia datasets \u2014 bilogarithmic curve (triples \u00d7 loading time).';
  container.appendChild(desc);

  // ── File selector ──────────────────────────────────────────────────────────
  const fileBar = document.createElement('div');
  fileBar.className = 'filter-bar';

  const allBtn = document.createElement('button');
  allBtn.className = 'filter-btn active';
  allBtn.textContent = 'All Files';
  allBtn.addEventListener('click', () => {
    selectedFile = null;
    fileBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    updateDbpedia();
  });
  fileBar.appendChild(allBtn);

  DBPEDIA_FILES.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.textContent = f.replace('_en.nt', '');
    btn.addEventListener('click', () => {
      selectedFile = f;
      fileBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateDbpedia();
    });
    fileBar.appendChild(btn);
  });

  container.appendChild(fileBar);

  // ── Charts row ─────────────────────────────────────────────────────────────
  const chartsRow = document.createElement('div');
  chartsRow.className = 'charts-row';

  const scaleBox = document.createElement('div');
  scaleBox.className = 'chart-box';
  const sh = document.createElement('div'); sh.className = 'chart-box-header';
  const st = document.createElement('h4'); st.textContent = 'Triples vs Loading Time (log\u2013log)';
  const ss = document.createElement('span'); ss.className = 'chart-subtitle'; ss.textContent = 'bilogarithmic scale';
  sh.appendChild(st); sh.appendChild(ss); scaleBox.appendChild(sh);
  const sw = document.createElement('div'); sw.className = 'chart-canvas-wrap';
  const sc = document.createElement('canvas'); sc.id = 'chart-dbpedia-scale';
  sw.appendChild(sc); scaleBox.appendChild(sw);
  chartsRow.appendChild(scaleBox);

  const memBox = document.createElement('div');
  memBox.className = 'chart-box';
  const mh = document.createElement('div'); mh.className = 'chart-box-header';
  const mt = document.createElement('h4'); mt.textContent = 'Memory Efficiency (MB / M triples)';
  const ms2 = document.createElement('span'); ms2.className = 'chart-subtitle'; ms2.textContent = 'lower is better';
  mh.appendChild(mt); mh.appendChild(ms2); memBox.appendChild(mh);
  const mw = document.createElement('div'); mw.className = 'chart-canvas-wrap';
  const mc = document.createElement('canvas'); mc.id = 'chart-dbpedia-memory';
  mw.appendChild(mc); memBox.appendChild(mw);
  chartsRow.appendChild(memBox);

  const cpuBox = document.createElement('div');
  cpuBox.className = 'chart-box';
  const ch2 = document.createElement('div'); ch2.className = 'chart-box-header';
  const ct2 = document.createElement('h4'); ct2.textContent = 'Average CPU Usage (%)';
  const cs2 = document.createElement('span'); cs2.className = 'chart-subtitle'; cs2.textContent = 'lower is better';
  ch2.appendChild(ct2); ch2.appendChild(cs2); cpuBox.appendChild(ch2);
  const ccw = document.createElement('div'); ccw.className = 'chart-canvas-wrap';
  const cc2 = document.createElement('canvas'); cc2.id = 'chart-dbpedia-cpu';
  ccw.appendChild(cc2); cpuBox.appendChild(ccw);
  chartsRow.appendChild(cpuBox);

  container.appendChild(chartsRow);

  const tableTitle = document.createElement('h4');
  tableTitle.className = 'table-section-title';
  tableTitle.textContent = 'Loading Results';
  container.appendChild(tableTitle);

  const tableContainer = document.createElement('div');
  tableContainer.id = 'dbpedia-table';
  container.appendChild(tableContainer);

  requestAnimationFrame(() => {
    updateDbpedia();
    addExpandButton(scaleBox);
    addExpandButton(memBox);
    addExpandButton(cpuBox);
  });
}

function updateDbpedia() {
  let runs = getLoadingRuns(DATASET);
  if (selectedFile) runs = runs.filter(r => r.file === selectedFile);

  const tableContainer = document.getElementById('dbpedia-table');
  if (tableContainer) buildLoadingTableWithFilter(tableContainer, runs);

  renderScaleChart(runs);
  renderMemoryChart(runs);
  renderCpuChart('chart-dbpedia-cpu', runs);
}

function renderScaleChart(runs) {
  const canvasId = 'chart-dbpedia-scale';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (state.charts[canvasId]) { state.charts[canvasId].destroy(); delete state.charts[canvasId]; }

  const datasets = [];
  state.activeEngines.forEach(eng => {
    const engRuns = runs.filter(r => r.engine === eng).sort((a, b) => a.triples - b.triples);
    if (engRuns.length === 0) return;
    datasets.push({
      label: getEngineLabel(eng),
      data: engRuns.map(r => ({ x: r.triples, y: r.loadingTimeMs })),
      borderColor: getEngineColor(eng),
      backgroundColor: getEngineColor(eng) + '33',
      borderWidth: 2,
      pointRadius: 4,
      fill: false,
      tension: 0.3,
    });
  });

  state.charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#8b949e' } } },
      scales: {
        x: {
          type: 'logarithmic',
          title: { display: true, text: 'Triples (log)', color: '#8b949e' },
          ticks: { color: '#8b949e', callback: v => v >= 1000000 ? (v / 1000000).toFixed(0) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v },
          grid: { color: 'rgba(48,54,61,0.3)' },
        },
        y: {
          type: 'logarithmic',
          title: { display: true, text: 'Loading Time ms (log)', color: '#8b949e' },
          ticks: { color: '#8b949e', callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 's' : v + 'ms' },
          grid: { color: 'rgba(48,54,61,0.3)' },
        },
      },
    },
  });
}

function renderMemoryChart(runs) {
  const canvasId = 'chart-dbpedia-memory';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (state.charts[canvasId]) { state.charts[canvasId].destroy(); delete state.charts[canvasId]; }

  const files = selectedFile ? [selectedFile] : [...new Set(runs.map(r => r.file))];
  const datasets = [];

  state.activeEngines.forEach(eng => {
    const engData = files.map(f => {
      const run = runs.find(r => r.engine === eng && r.file === f);
      if (run && run.memoryDeltaMb != null && run.triples > 0) {
        return run.memoryDeltaMb / (run.triples / 1000000); // DO NOT clamp to 0 — GC can produce negative
      }
      return 0;
    });
    datasets.push({
      label: getEngineLabel(eng),
      data: engData,
      backgroundColor: getEngineColor(eng) + 'cc',
      borderColor: getEngineColor(eng),
      borderWidth: 1,
    });
  });

  state.charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: files.map(f => f.replace('_en.nt', '')), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#8b949e' } } },
      scales: {
        x: { ticks: { color: '#8b949e' }, grid: { display: false } },
        y: {
          title: { display: true, text: 'MB / M triples', color: '#8b949e' },
          ticks: { color: '#8b949e' },
          grid: { color: 'rgba(48,54,61,0.3)' },
        },
      },
    },
  });
}


}

// ── pages/w3c.js ──
// w3c.js — W3C Conformance page (static data from corese-w3c portal)

const SUMMARY = { total: 2915, passed: 2897, failed: 3, inapplicable: 13, untested: 0, cantTell: 2 };

const SUITES = [
  { name: 'JSON-LD 1.1 (fromRdf)',       spec: 'https://www.w3.org/TR/json-ld11-api/#dom-jsonldprocessor-fromrdf', total:  54, passed:  51, failed: 2, inapplicable:  1, cantTell: 0 },
  { name: 'JSON-LD 1.1 (toRdf)',         spec: 'https://www.w3.org/TR/json-ld11-api/#dom-jsonldprocessor-tordf',  total: 467, passed: 454, failed: 1, inapplicable: 12, cantTell: 0 },
  { name: 'N-Quads (RDF 1.1)',           spec: 'https://www.w3.org/TR/n-quads/',                                  total:  87, passed:  87, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'N-Triples (RDF 1.1)',         spec: 'https://www.w3.org/TR/n-triples/',                                total:  70, passed:  70, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDFC-1.0 (Canonicalization)', spec: 'https://www.w3.org/TR/rdf-canon/',                                total:  86, passed:  86, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDF/XML (RDF 1.1)',           spec: 'https://www.w3.org/TR/rdf-syntax-grammar/',                       total: 166, passed: 166, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDFa 1.1 (SVG)',             spec: 'https://www.w3.org/TR/SVG11/',                                    total:  31, passed:  31, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDFa 1.1 (XHTML)',           spec: 'https://www.w3.org/TR/rdfa-core/',                                total: 181, passed: 181, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDFa 1.1 (XML)',             spec: 'https://www.w3.org/TR/rdfa-core/',                                total: 126, passed: 126, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'SPARQL 1.0',                 spec: 'https://www.w3.org/TR/rdf-sparql-query/',                         total: 482, passed: 482, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'SPARQL 1.1',                 spec: 'https://www.w3.org/TR/sparql11-query/',                           total: 495, passed: 493, failed: 0, inapplicable:  0, cantTell: 2 },
  { name: 'TriG (RDF 1.1)',             spec: 'https://www.w3.org/TR/trig/',                                     total: 357, passed: 357, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'Turtle (RDF 1.1)',           spec: 'https://www.w3.org/TR/turtle/',                                   total: 313, passed: 313, failed: 0, inapplicable:  0, cantTell: 0 },
];

const FAILED_TESTS = [
  {
    suite: 'JSON-LD 1.1 (fromRdf)',
    test: 'use native types flag with values that cannot be serialized to JSON',
    description: 'useNativeTypes flag being true is disregarded for a value that cannot be serialized into a native JSON value.',
    error: 'Character I is neither a decimal digit nor \u201c.\u201d',
  },
  {
    suite: 'JSON-LD 1.1 (fromRdf)',
    test: 'use native types flag with non-native values',
    description: 'Ensure that useNativeTypes flag being true does not interfere with values that cannot be serialized to a native value.',
    error: 'For input string: \u201cAAA\u201d',
  },
  {
    suite: 'JSON-LD 1.1 (toRdf)',
    test: 'List with bad @base.',
    description: 'Tests list elements expanded to IRIs with a bad @base.',
    error: 'JsonLdError[code=An invalid base IRI has been detected]',
  },
];

const CANNOT_TELL_TESTS = [
  {
    suite: 'SPARQL 1.1',
    test: 'agg-empty-group',
    description: 'Aggregate on empty group returns correct result.',
    error: 'Result differs \u2014 ambiguous specification',
  },
  {
    suite: 'SPARQL 1.1',
    test: 'agg-empty-group-count',
    description: 'COUNT on empty group.',
    error: 'Result differs \u2014 ambiguous specification',
  },
];

function renderW3c(container) {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = 'W3C Conformance';
  container.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'page-desc';
  desc.textContent = 'Official W3C certification for Corese v5 \u2014 13 test suites, source: corese-w3c.';
  container.appendChild(desc);

  // ── KPI cards ──────────────────────────────────────────────────────────────
  const kpiGrid = document.createElement('div');
  kpiGrid.className = 'w3c-kpi-grid';

  const KPIS = [
    { label: 'TOTAL TESTS',   value: SUMMARY.total.toLocaleString(),   sub: '13 standard suites', color: 'var(--text-main)' },
    { label: 'PASSED',        value: SUMMARY.passed.toLocaleString(),  sub: (SUMMARY.passed/SUMMARY.total*100).toFixed(1)+'% of all entries', color: 'var(--status-pass)' },
    { label: 'FAILURES',      value: SUMMARY.failed.toString(),        sub: 'Failed tests', color: SUMMARY.failed > 0 ? 'var(--status-mismatch)' : 'var(--status-pass)' },
    { label: 'UNTESTED',      value: SUMMARY.untested.toString(),             sub: '', color: 'var(--text-muted)' },
    { label: 'INAPPLICABLE',  value: SUMMARY.inapplicable.toString(),         sub: 'See rationale', color: 'var(--status-timeout)' },
    { label: 'CANNOT TELL',   value: SUMMARY.cantTell.toString(),             sub: 'See rationale', color: '#8e44ad' },
  ];

  KPIS.forEach(kpi => {
    const card = document.createElement('div');
    card.className = 'w3c-kpi-card';

    const lbl = document.createElement('div');
    lbl.className = 'w3c-kpi-label';
    lbl.textContent = kpi.label;
    card.appendChild(lbl);

    const val = document.createElement('div');
    val.className = 'w3c-kpi-value';
    val.textContent = kpi.value;
    val.style.color = kpi.color;
    card.appendChild(val);

    if (kpi.sub) {
      const sub = document.createElement('div');
      sub.className = 'w3c-kpi-sub';
      sub.textContent = kpi.sub;
      card.appendChild(sub);
    }

    kpiGrid.appendChild(card);
  });

  container.appendChild(kpiGrid);

  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'w3c-progress';
  const progressFill = document.createElement('div');
  progressFill.className = 'w3c-progress-fill';
  progressFill.style.width = (SUMMARY.passed / SUMMARY.total * 100).toFixed(2) + '%';
  progressBar.appendChild(progressFill);
  container.appendChild(progressBar);

  // Link button
  const linkBtn = document.createElement('a');
  linkBtn.className = 'w3c-link-btn';
  linkBtn.href = 'https://corese-stack.github.io/corese-w3c/';
  linkBtn.target = '_blank';
  linkBtn.rel = 'noopener noreferrer';
  linkBtn.textContent = 'View the official W3C conformance portal (corese-w3c) \u2197';
  container.appendChild(linkBtn);

  // ── Suite table ────────────────────────────────────────────────────────────
  const tableTitle = document.createElement('h3');
  tableTitle.className = 'page-subtitle';
  tableTitle.textContent = 'Detail by test suite';
  container.appendChild(tableTitle);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-surface';
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  ['Suite', 'Specification', 'Total', 'Passed', 'Failures', 'Inapplicable', 'Cannot Tell', 'Rate'].forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i > 1) th.className = 'text-right';
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  SUITES.forEach(row => {
    const rate = (row.passed / row.total * 100).toFixed(2) + '%';
    const tr = document.createElement('tr');

    // Suite name cell
    const tdName = document.createElement('td');
    tdName.textContent = row.name;
    tr.appendChild(tdName);

    // Specification link cell
    const tdSpec = document.createElement('td');
    const a = document.createElement('a');
    a.href = row.spec;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = row.spec.replace('https://www.w3.org/TR/', '').replace(/\/$/, '');
    a.className = 'w3c-spec-link';
    tdSpec.appendChild(a);
    tr.appendChild(tdSpec);

    // Numeric cells: Total, Passed, Failed, Inapplicable, Cannot Tell, Rate
    const nums = [row.total, row.passed, row.failed, row.inapplicable, row.cantTell, rate];
    nums.forEach((val, i) => {
      const td = document.createElement('td');
      td.textContent = val;
      td.className = 'text-right font-mono';
      if (i === 2 && val > 0) { td.style.color = 'var(--status-mismatch)'; td.style.fontWeight = '600'; }
      if (i === 2 && val === 0) td.style.color = 'var(--status-pass)';
      if (i === 3 && val > 0) td.style.color = 'var(--status-timeout)';
      if (i === 4 && val > 0) td.style.color = '#8e44ad';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // Total row
  const trTotal = document.createElement('tr');
  trTotal.style.fontWeight = '700';
  trTotal.style.borderTop = '2px solid var(--border-color)';
  const grandRate = (SUMMARY.passed / SUMMARY.total * 100).toFixed(2) + '%';
  [
    'Total', '', SUMMARY.total, SUMMARY.passed,
    SUMMARY.failed, SUMMARY.inapplicable, SUMMARY.cantTell, grandRate
  ].forEach((val, i) => {
    const td = document.createElement('td');
    td.textContent = val;
    if (i > 1) td.className = 'text-right font-mono';
    trTotal.appendChild(td);
  });
  tbody.appendChild(trTotal);

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrapper.appendChild(scroll);
  container.appendChild(wrapper);

  // ── Failure / Cannot-Tell detail tables ───────────────────────────────────
  buildDetailTable(container, 'Failed (3)', FAILED_TESTS, 'failed');
  buildDetailTable(container, 'Cannot Tell (2)', CANNOT_TELL_TESTS, 'cannot-tell');
}

function buildDetailTable(container, title, rows, kind) {
  const titleEl = document.createElement('h3');
  titleEl.className = 'page-subtitle';
  titleEl.textContent = title;
  container.appendChild(titleEl);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-surface';
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  ['Suite', 'Test', 'Description', 'Error'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');

    const tdSuite = document.createElement('td');
    tdSuite.textContent = row.suite;
    tdSuite.style.whiteSpace = 'nowrap';
    tr.appendChild(tdSuite);

    const tdTest = document.createElement('td');
    tdTest.className = 'font-mono';
    tdTest.textContent = row.test;
    tr.appendChild(tdTest);

    const tdDesc = document.createElement('td');
    tdDesc.textContent = row.description;
    tdDesc.style.color = 'var(--text-muted)';
    tdDesc.style.fontSize = '0.85rem';
    tr.appendChild(tdDesc);

    const tdErr = document.createElement('td');
    tdErr.textContent = row.error;
    tdErr.style.fontSize = '0.82rem';
    if (kind === 'failed') {
      tdErr.style.color = 'var(--status-mismatch)';
    } else {
      tdErr.style.color = '#8e44ad';
    }
    tr.appendChild(tdErr);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrapper.appendChild(scroll);
  container.appendChild(wrapper);
}



// ── pages/transparency.js ──
// transparency.js — Machine & Transparency page (6 info cards)


/**
 * Render the Machine & Transparency page.
 * @param {HTMLElement} container
 */
function renderTransparency(container) {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = 'Machine & Transparency';
  container.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'page-desc';
  desc.textContent = 'Complete identity card of the benchmark execution environment.';
  container.appendChild(desc);

  const env = (state.data && state.data.metadata.environment) || {};
  const protocol = (state.data && state.data.metadata.protocol) || {};
  const git = (state.data && state.data.metadata.git) || {};

  const grid = document.createElement('div');
  grid.className = 'transparency-grid';

  // 1. CPU
  grid.appendChild(createInfoCard('CPU', '\u2699\ufe0f', [
    { label: 'Model', value: env.cpuModel || '\u2014' },
    { label: 'Architecture', value: env.cpuArchitecture || '\u2014' },
    { label: 'Sockets', value: env.cpuSockets || '\u2014' },
    { label: 'Cores', value: env.cpuCores || '\u2014' },
    { label: 'Threads', value: env.cpuThreads || '\u2014' },
    { label: 'Frequency', value: env.cpuFrequencyMhz ? `${env.cpuFrequencyMhz} MHz` : '\u2014' },
    { label: 'Governor', value: env.cpuGovernor || '\u2014' },
  ]));

  // 2. Memory & Disk
  grid.appendChild(createInfoCard('Memory & Disk', '\ud83d\udcbe', [
    { label: 'RAM Total', value: env.ramTotalGb ? `${env.ramTotalGb} GB` : '\u2014' },
    { label: 'Swap', value: env.swapTotalGb ? `${env.swapTotalGb} GB` : '\u2014' },
    { label: 'Swappiness', value: env.swappiness != null ? String(env.swappiness) : '\u2014' },
  ]));

  // 3. OS & Kernel
  grid.appendChild(createInfoCard('OS & Kernel', '\ud83d\udda5\ufe0f', [
    { label: 'Distribution', value: env.osDistribution || '\u2014' },
    { label: 'Kernel', value: env.osKernel || '\u2014' },
  ]));

  // 4. JVM
  grid.appendChild(createInfoCard('JVM', '\u2615', [
    { label: 'Vendor', value: env.jvmVendor || '\u2014' },
    { label: 'Version', value: env.jvmVersion || '\u2014' },
    { label: 'Flags', value: env.jvmFlags ? env.jvmFlags.join(' ') : '\u2014' },
  ]));

  // 5. Protocol
  grid.appendChild(createInfoCard('Measurement Protocol', '\ud83d\udccf', [
    { label: 'Warmup Runs', value: protocol.warmup != null ? String(protocol.warmup) : '\u2014' },
    { label: 'Repetitions', value: protocol.repetitions != null ? String(protocol.repetitions) : '\u2014' },
    { label: 'Query Repetitions', value: protocol.queryRepetitions != null ? String(protocol.queryRepetitions) : '\u2014' },
    { label: 'Query Timeout', value: protocol.queryTimeoutMs ? `${protocol.queryTimeoutMs / 1000}s` : '\u2014' },
    { label: 'Load Timeout', value: protocol.loadTimeoutMs ? `${protocol.loadTimeoutMs / 1000}s` : '\u2014' },
    { label: 'Metric', value: protocol.metric || 'median' },
  ]));

  // 7. Engines
  const engines = (state.data && state.data.engines) || [];
  const engineItems = engines.map(e => ({
    label: e.label || e.id,
    value: e.version ? `v${e.version}` : '\u2014',
  }));
  if (engineItems.length > 0) {
    grid.appendChild(createInfoCard('Engines', '\u26a1', engineItems));
  }

  container.appendChild(grid);
}

function createInfoCard(title, icon, items) {
  const card = document.createElement('div');
  card.className = 'info-card';

  const header = document.createElement('div');
  header.className = 'info-card-header';

  const iconEl = document.createElement('span');
  iconEl.className = 'info-card-icon';
  iconEl.textContent = icon;
  header.appendChild(iconEl);

  const titleEl = document.createElement('h3');
  titleEl.className = 'info-card-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  card.appendChild(header);

  const list = document.createElement('dl');
  list.className = 'info-card-list';

  items.forEach(item => {
    const dt = document.createElement('dt');
    dt.textContent = item.label;
    list.appendChild(dt);

    const dd = document.createElement('dd');
    dd.className = 'font-mono';
    dd.textContent = item.value;
    list.appendChild(dd);
  });

  card.appendChild(list);
  return card;
}



// ── export-md.js ──
// export-md.js — Generate and download a Markdown benchmark report


function downloadMarkdownReport() {
  if (!state.data) return;

  const md = buildMarkdown();
  const blob = new Blob([md], { type: 'text/markdown; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `corese-benchmark-report-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildMarkdown() {
  const data = state.data;
  const meta = data.metadata;
  const env = meta.environment || {};
  const protocol = meta.protocol || {};
  const engines = state.activeEngines;
  const lines = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push('# Corese Benchmark Report');
  lines.push('');
  lines.push(`> Generated: ${meta.generatedAt || new Date().toISOString()}`);
  if (meta.git && meta.git.benchmarkCommit) {
    lines.push(`> Commit: \`${meta.git.benchmarkCommit}\` (${meta.git.branch || 'main'})`);
  }
  lines.push('');

  // ── Environment ───────────────────────────────────────────────────────────
  lines.push('## Environment');
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  if (env.cpuModel)       lines.push(`| CPU | ${env.cpuModel} |`);
  if (env.cpuCores)       lines.push(`| Cores / Threads | ${env.cpuCores}c / ${env.cpuThreads}t |`);
  if (env.ramTotalGb)     lines.push(`| RAM | ${env.ramTotalGb} GB |`);
  if (env.osDistribution) lines.push(`| OS | ${env.osDistribution} |`);
  if (env.osKernel)       lines.push(`| Kernel | ${env.osKernel} |`);
  if (env.jvmVersion)     lines.push(`| JVM | ${env.jvmVersion} |`);
  if (env.jvmFlags && Array.isArray(env.jvmFlags)) lines.push(`| JVM Flags | \`${env.jvmFlags.join(' ')}\` |`);
  lines.push('');

  // ── Protocol ──────────────────────────────────────────────────────────────
  lines.push('## Protocol');
  lines.push('');
  lines.push(`- Warmup: ${protocol.warmup ?? 1} run`);
  lines.push(`- Repetitions: ${protocol.repetitions ?? 3}`);
  lines.push(`- Metric: ${protocol.metric || 'median'}`);
  lines.push(`- Query timeout: ${(protocol.queryTimeoutMs || 60000) / 1000}s`);
  lines.push(`- Load timeout: ${(protocol.loadTimeoutMs || 120000) / 1000}s`);
  lines.push('');

  // ── Engines ───────────────────────────────────────────────────────────────
  lines.push('## Engines');
  lines.push('');
  lines.push('| ID | Label | Version |');
  lines.push('|----|-------|---------|');
  (data.engines || []).filter(e => engines.includes(e.id)).forEach(e => {
    lines.push(`| \`${e.id}\` | ${e.label} | ${e.version || '—'} |`);
  });
  lines.push('');

  // ── Loading & Ingestion ───────────────────────────────────────────────────
  const datasets = [...new Set(data.loadingRuns.map(r => r.dataset))];

  lines.push('## Loading & Ingestion');
  lines.push('');

  datasets.forEach(ds => {
    lines.push(`### ${ds}`);
    lines.push('');
    lines.push('| Engine | File | Triples | Median Time | Throughput | Heap Δ |');
    lines.push('|--------|------|---------|-------------|------------|--------|');
    data.loadingRuns
      .filter(r => r.dataset === ds && engines.includes(r.engine))
      .forEach(r => {
        lines.push(`| ${getEngineLabel(r.engine)} | ${r.file || '—'} | ${(r.triples || 0).toLocaleString()} | ${fmtMs(r.loadingTimeMs)} | ${fmtThroughput(r.throughputTriplesPerSec)} | ${fmtMemory(r.memoryDeltaMb)} |`);
      });
    lines.push('');
  });

  // ── Query Results per dataset ─────────────────────────────────────────────
  const queryDatasets = [...new Set(data.queryRuns.map(r => r.dataset))];

  lines.push('## Query Results');
  lines.push('');

  queryDatasets.forEach(ds => {
    lines.push(`### ${ds}`);
    lines.push('');

    const queryIds = [...new Set(
      data.queryRuns.filter(r => r.dataset === ds).map(r => r.queryId)
    )].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''));
      const nb = parseInt(b.replace(/\D/g, ''));
      return na - nb;
    });

    // Header: Query | Engine1 | Engine2 | ...
    const engLabels = engines.map(e => getEngineLabel(e));
    lines.push(`| Query | ${engLabels.join(' | ')} |`);
    lines.push(`|-------|${engines.map(() => '----').join('|')}|`);

    queryIds.forEach(qid => {
      const cells = engines.map(eng => {
        const run = data.queryRuns.find(r => r.dataset === ds && r.engine === eng && r.queryId === qid);
        if (!run) return '—';
        if (run.status === 'TIMEOUT') return `\`> ${(protocol.queryTimeoutMs || 60000) / 1000}s (TIMEOUT)\``;
        if (run.status !== 'PASS') return `\`${run.status}\``;
        return fmtMs(run.medianMs);
      });
      lines.push(`| ${qid.replace('query_', 'Q')} | ${cells.join(' | ')} |`);
    });
    lines.push('');

    // TTFR sub-table
    lines.push(`**TTFR (Time To First Result) — ${ds}**`);
    lines.push('');
    lines.push(`| Query | ${engLabels.join(' | ')} |`);
    lines.push(`|-------|${engines.map(() => '----').join('|')}|`);

    queryIds.forEach(qid => {
      const cells = engines.map(eng => {
        const run = data.queryRuns.find(r => r.dataset === ds && r.engine === eng && r.queryId === qid);
        if (!run || run.status !== 'PASS') return '—';
        if (run.medianTtfrMs === -1) return '—';
        return fmtMs(run.medianTtfrMs);
      });
      lines.push(`| ${qid.replace('query_', 'Q')} | ${cells.join(' | ')} |`);
    });
    lines.push('');
  });

  // ── Failed Queries Summary ────────────────────────────────────────────────
  const failed = data.queryRuns.filter(r => engines.includes(r.engine) && r.status !== 'PASS');
  if (failed.length > 0) {
    lines.push('## Failures & Timeouts');
    lines.push('');
    lines.push('| Engine | Dataset | Query | Status | Message |');
    lines.push('|--------|---------|-------|--------|---------|');
    failed.forEach(r => {
      const msg = (r.errorMessage || '').replace(/\|/g, '\\|');
      lines.push(`| ${getEngineLabel(r.engine)} | ${r.dataset} | ${r.queryId.replace('query_', 'Q')} | **${r.status}** | ${msg || '—'} |`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated by [Corese Benchmark Dashboard](https://github.com/corese-stack/corese-benchmark)*');

  return lines.join('\n');
}


// ── export-pdf.js ──
// export-pdf.js — Generate and print a PDF benchmark report


function downloadPdfReport() {
  if (!state.data) return;

  const html = buildHtml();

  let iframe = document.getElementById('_pdf-print-frame');
  if (iframe) iframe.remove();
  iframe = document.createElement('iframe');
  iframe.id = '_pdf-print-frame';
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 400);
}

function buildHtml() {
  const data    = state.data;
  const meta    = data.metadata || {};
  const env     = meta.environment || {};
  const proto   = meta.protocol || {};
  const engines = state.activeEngines;
  const now     = new Date().toISOString().slice(0, 10);

  const ENGINE_COLORS = ['#4e79a7','#f28e2b','#59a14f','#e15759','#76b7b2','#edc948','#b07aa1','#ff9da7'];
  const colorMap = {};
  engines.forEach((e, i) => { colorMap[e] = ENGINE_COLORS[i % ENGINE_COLORS.length]; });

  const th  = `style="padding:6px 10px;text-align:right;border:1px solid #ddd;background:#f5f5f5;font-weight:600"`;
  const th0 = `style="padding:6px 10px;text-align:left;border:1px solid #ddd;background:#f5f5f5;font-weight:600"`;
  const td  = `style="padding:5px 10px;text-align:right;border:1px solid #ddd"`;
  const td0 = `style="padding:5px 10px;text-align:left;border:1px solid #ddd;font-family:monospace"`;
  const tdW = `style="padding:5px 10px;text-align:right;border:1px solid #ddd;font-weight:700;background:#fffbe6"`;

  function queryTable(title, runs) {
    const queryIds = [...new Set(runs.map(r => r.queryId))].sort((a, b) =>
      parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,''))
    );
    const header = `<tr><th ${th0}>Query</th>${engines.map(e =>
      `<th ${th}><span style="color:${colorMap[e]}">${getEngineLabel(e)}</span></th>`
    ).join('')}<th ${th}>Best</th></tr>`;

    const rows = queryIds.map(qid => {
      const vals = engines.map(eng => {
        const run = runs.find(r => r.engine === eng && r.queryId === qid);
        if (!run) return null;
        if (run.status === 'TIMEOUT') return 'TIMEOUT';
        if (run.status !== 'PASS') return run.status;
        return run.medianMs;
      });
      const nums = vals.map(v => (typeof v === 'number') ? v : null);
      const minV = Math.min(...nums.filter(v => v !== null));
      const winIdx = isFinite(minV) ? nums.indexOf(minV) : -1;

      const cells = vals.map((v, i) => {
        const style = (i === winIdx) ? tdW : td;
        const disp = v === null ? '—' : typeof v === 'number' ? v.toLocaleString() + ' ms' : v;
        return `<td ${style}>${disp}</td>`;
      }).join('');
      const best = winIdx >= 0
        ? `<span style="color:${colorMap[engines[winIdx]]}">${getEngineLabel(engines[winIdx])}</span>`
        : '—';
      return `<tr><td ${td0}>${qid.replace('query_', 'Q')}</td>${cells}<td ${td}>${best}</td></tr>`;
    }).join('');

    return `<h2 style="margin:28px 0 8px;font-size:15px;color:#333">${title}</h2>
      <table style="border-collapse:collapse;width:100%;font-size:12px">${header}${rows}</table>`;
  }

  const datasets = [...new Set(data.queryRuns.map(r => r.dataset))];
  const sections = datasets.map(ds => {
    const runs = data.queryRuns.filter(r => r.dataset === ds && engines.includes(r.engine));
    return `<h2 style="margin:32px 0 4px;font-size:16px;border-bottom:2px solid #4e79a7;padding-bottom:4px">${ds}</h2>
      ${queryTable('Median Execution Time', runs)}`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
    <title>Corese Benchmark — ${now}</title>
    <style>
      @media print { @page { margin:18mm 15mm; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
      body { font-family:system-ui,sans-serif; font-size:13px; color:#222; margin:0; padding:20px 30px; }
      h1 { font-size:20px; margin-bottom:6px; }
    </style>
  </head><body>
    <h1>Corese Benchmark Report</h1>
    <p style="margin:4px 0;color:#555"><strong>Generated:</strong> ${meta.generatedAt || now}</p>
    <p style="margin:4px 0;color:#555"><strong>CPU:</strong> ${env.cpuModel || '—'} (${env.cpuCores || '?'}c/${env.cpuThreads || '?'}t) &nbsp;·&nbsp; <strong>RAM:</strong> ${env.ramTotalGb || '?'} GB</p>
    <p style="margin:4px 0;color:#555"><strong>OS:</strong> ${env.osDistribution || '—'} &nbsp;·&nbsp; <strong>JVM:</strong> ${env.jvmVersion || '—'}</p>
    <p style="margin:4px 0;color:#555"><strong>Protocol:</strong> warmup + ${proto.repetitions || 3} repetitions, median — timeout ${(proto.queryTimeoutMs || 60000) / 1000}s</p>
    ${sections}
    <p style="margin-top:32px;font-size:11px;color:#aaa">Generated by Corese Benchmark Dashboard — ${now}</p>
  </body></html>`;
}



// ── export-csv.js ──
// export-csv.js — CSV export for loading runs and query runs


function escape(v) {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadLoadingCsv() {
  if (!state.data) return;
  const date = new Date().toISOString().slice(0, 10);

  const headers = ['engine', 'engine_label', 'dataset', 'file', 'triples',
    'loading_time_ms', 'throughput_triples_per_sec', 'memory_delta_mb',
    'cpu_percent', 'repetitions_ms', 'cv_percent'];

  const rows = state.data.loadingRuns.map(r => [
    r.engine,
    getEngineLabel(r.engine),
    r.dataset,
    r.file || '',
    r.triples,
    r.loadingTimeMs,
    r.throughputTriplesPerSec != null ? r.throughputTriplesPerSec.toFixed(0) : '',
    r.memoryDeltaMb != null ? r.memoryDeltaMb.toFixed(2) : '',
    r.cpuPercent != null ? r.cpuPercent.toFixed(1) : '',
    Array.isArray(r.repetitionsMs) ? r.repetitionsMs.join(';') : '',
    computeCV(r.repetitionsMs) != null ? computeCV(r.repetitionsMs).toFixed(2) : '',
  ]);

  const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
  triggerDownload(csv, `corese-benchmark-loading-${date}.csv`);
}

function downloadQueryCsv() {
  if (!state.data) return;
  const date = new Date().toISOString().slice(0, 10);

  const headers = ['engine', 'engine_label', 'dataset', 'query_id',
    'status', 'median_ms', 'ttfr_ms', 'row_count',
    'repetitions_ms', 'hash'];

  const rows = state.data.queryRuns.map(r => [
    r.engine,
    getEngineLabel(r.engine),
    r.dataset,
    r.queryId,
    r.status,
    r.medianMs,
    r.medianTtfrMs != null && r.medianTtfrMs !== -1 ? r.medianTtfrMs : '',
    r.rowCount != null ? r.rowCount : '',
    Array.isArray(r.repetitionsMs) ? r.repetitionsMs.join(';') : '',
    r.hash || '',
  ]);

  const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
  triggerDownload(csv, `corese-benchmark-queries-${date}.csv`);
}


// ── app.js ──
// app.js — Bootstrap & navigation for Corese Benchmark Dashboard v2


const TABS = [
  { id: 'overview',     label: 'Global Overview',         render: renderOverview },
  { id: 'bowlogna',    label: 'Bowlogna',                render: renderBowlogna },
  { id: 'bsbm',        label: 'BSBM',                    render: renderBsbm },
  { id: 'lubm',        label: 'LUBM',                    render: renderLubm },
  { id: 'dbpedia',     label: 'DBpedia',                 render: renderDbpedia },
  { id: 'w3c',         label: 'W3C Conformance',         render: renderW3c },
  { id: 'transparency', label: 'Environment & Protocol', render: renderTransparency },
];

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const mainContent = document.getElementById('main-content');
  const tabBar = document.getElementById('tab-bar');
  const stickyPill = document.getElementById('sticky-pill');
  const errorState = document.getElementById('error-state');

  try {
    await loadData();

    // Build sticky header pill
    buildStickyPill(stickyPill);

    // Wire export buttons
    const exportBtn = document.getElementById('export-md-btn');
    if (exportBtn) {
      exportBtn.style.display = '';
      exportBtn.addEventListener('click', downloadMarkdownReport);
    }
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) {
      exportPdfBtn.style.display = '';
      exportPdfBtn.addEventListener('click', downloadPdfReport);
    }
    const exportLoadingCsvBtn = document.getElementById('export-loading-csv-btn');
    if (exportLoadingCsvBtn) {
      exportLoadingCsvBtn.style.display = '';
      exportLoadingCsvBtn.addEventListener('click', downloadLoadingCsv);
    }
    const exportQueryCsvBtn = document.getElementById('export-query-csv-btn');
    if (exportQueryCsvBtn) {
      exportQueryCsvBtn.style.display = '';
      exportQueryCsvBtn.addEventListener('click', downloadQueryCsv);
    }

    // Build engine filter bar
    const engineBar = document.getElementById('engine-bar');
    buildEngineBar(engineBar, mainContent, tabBar);

    // Build tab bar
    buildTabBar(tabBar);

    // Render initial tab
    const hash = window.location.hash.replace('#', '');
    const initialTab = TABS.find(t => t.id === hash) ? hash : 'overview';
    switchTab(initialTab, mainContent, tabBar);

  } catch (err) {
    console.error('Failed to load data:', err);
    if (mainContent) mainContent.style.display = 'none';
    if (errorState) {
      errorState.style.display = 'block';
      const errMsg = errorState.querySelector('.error-message');
      if (errMsg) errMsg.textContent = err.message;
    }
  }

  // Export JSON button
  const exportJsonBtn = document.getElementById('export-json-btn');
  if (exportJsonBtn && state.rawData) {
    exportJsonBtn.style.display = '';
    exportJsonBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state.rawData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `corese-benchmark-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
});

function buildTabBar(tabBar) {
  if (!tabBar) return;
  tabBar.innerHTML = '';

  TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    btn.addEventListener('click', () => {
      const mainContent = document.getElementById('main-content');
      switchTab(tab.id, mainContent, tabBar);
    });
    tabBar.appendChild(btn);
  });
}

function switchTab(tabId, mainContent, tabBar) {
  state.activeTab = tabId;

  // Update URL hash
  window.location.hash = tabId;

  // Update tab buttons
  if (tabBar) {
    tabBar.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
  }

  // Destroy all existing charts
  Object.keys(state.charts).forEach(key => {
    if (state.charts[key]) {
      state.charts[key].destroy();
      delete state.charts[key];
    }
  });

  // Render page
  const tab = TABS.find(t => t.id === tabId);
  if (tab && mainContent) {
    tab.render(mainContent);
  }
}

function buildStickyPill(pillEl) {
  if (!pillEl || !state.data) return;

  const env = state.data.metadata.environment || {};
  const protocol = state.data.metadata.protocol || {};

  const parts = [];

  // Location — derive from context
  parts.push('\ud83d\udccd Inria SED Sophia');

  // CPU
  if (env.cpuCores && env.cpuThreads) {
    parts.push(`${env.cpuCores}c/${env.cpuThreads}t CPU`);
  }

  // RAM
  if (env.ramTotalGb) {
    parts.push(`${env.ramTotalGb} GB RAM`);
  }

  // OS
  if (env.osKernel) {
    const kernelShort = env.osKernel.replace(/-generic$/, '').replace(/^Linux /, '');
    parts.push(`Linux ${kernelShort}`);
  } else if (env.osDistribution) {
    parts.push(env.osDistribution);
  }

  // JVM
  if (env.jvmVersion) {
    const jdkVersion = env.jvmVersion.match(/^(\d+)/);
    const flags = env.jvmFlags ? env.jvmFlags.filter(f => f.startsWith('-X')).join(' ') : '';
    parts.push(`OpenJDK ${jdkVersion ? jdkVersion[1] : '?'}${flags ? ` (${flags})` : ''}`);
  }

  // Protocol
  if (protocol.warmup != null && protocol.repetitions) {
    parts.push(`Protocol: Warmup + ${protocol.repetitions} Reps (Median)`);
  }

  pillEl.textContent = parts.join(' \u00b7 ');

  // Click -> navigate to transparency tab
  pillEl.style.cursor = 'pointer';
  pillEl.addEventListener('click', () => {
    const mainContent = document.getElementById('main-content');
    const tabBar = document.getElementById('tab-bar');
    switchTab('transparency', mainContent, tabBar);
  });
}

function buildEngineBar(engineBar, mainContent, tabBar) {
  if (!engineBar || !state.data) return;
  engineBar.innerHTML = '';

  let dragSrc = null;

  state.engines.forEach(engineId => {
    const eng = state.data.engines.find(e => e.id === engineId);
    const label = eng ? eng.label : engineId;
    const color = getEngineColor(engineId);

    const btn = document.createElement('button');
    btn.dataset.engine = engineId;
    btn.style.setProperty('--engine-color', color);
    btn.draggable = true;

    function updateBtn() {
      const isActive = state.activeEngines.includes(engineId);
      btn.className = 'engine-btn' + (isActive ? ' active' : '');
      btn.innerHTML = isActive
        ? `${label} <span class="engine-btn-icon">\u00d7</span>`
        : `<span class="engine-btn-icon">+</span> ${label}`;
      btn.title = isActive ? `Hide ${label}` : `Show ${label}`;
    }

    updateBtn();

    btn.addEventListener('click', () => {
      const isActive = state.activeEngines.includes(engineId);
      if (isActive && state.activeEngines.length === 1) return;

      state.activeEngines = isActive
        ? state.activeEngines.filter(e => e !== engineId)
        : [...state.activeEngines, engineId];

      updateBtn();

      const tab = TABS.find(t => t.id === state.activeTab);
      if (tab && mainContent) tab.render(mainContent);
    });

    // ── Drag & drop reorder ──────────────────────────────────────────────────
    btn.addEventListener('dragstart', (e) => {
      dragSrc = btn;
      e.dataTransfer.effectAllowed = 'move';
      btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      engineBar.querySelectorAll('.engine-btn').forEach(b => b.classList.remove('drag-over'));
    });
    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (btn !== dragSrc) btn.classList.add('drag-over');
    });
    btn.addEventListener('dragleave', () => {
      btn.classList.remove('drag-over');
    });
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      if (!dragSrc || dragSrc === btn) return;

      // Reorder in DOM
      const btns = [...engineBar.querySelectorAll('.engine-btn')];
      const srcIdx = btns.indexOf(dragSrc);
      const tgtIdx = btns.indexOf(btn);
      if (srcIdx < tgtIdx) engineBar.insertBefore(dragSrc, btn.nextSibling);
      else engineBar.insertBefore(dragSrc, btn);

      // Sync state.engines and state.activeEngines to new DOM order
      const newOrder = [...engineBar.querySelectorAll('.engine-btn')].map(b => b.dataset.engine);
      state.engines = newOrder;
      state.activeEngines = newOrder.filter(e => state.activeEngines.includes(e));

      // Re-render current tab
      const tab = TABS.find(t => t.id === state.activeTab);
      if (tab && mainContent) tab.render(mainContent);
    });

    engineBar.appendChild(btn);
  });
}

// Handle hash changes
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  const tab = TABS.find(t => t.id === hash);
  if (tab && tab.id !== state.activeTab) {
    const mainContent = document.getElementById('main-content');
    const tabBar = document.getElementById('tab-bar');
    switchTab(tab.id, mainContent, tabBar);
  }
});


})();
