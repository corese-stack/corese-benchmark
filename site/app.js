'use strict';

// ── Palette ───────────────────────────────────────────────────────────────────
//
// Two levels:
//   1. ENGINE_FAMILIES  → color by family (prefix before the first ".")
//                         e.g. all "corese.*" versions share the same blue
//   2. ENGINE_OVERRIDES → specific color for an exact engine name
//                         e.g. "corese.local" gets a lighter blue
//
// To add an engine: add an entry in ENGINE_FAMILIES or ENGINE_OVERRIDES.
// No match → color auto-assigned from AUTO_COLORS.

const ENGINE_FAMILIES = {
  //  family       hex         bg (same hex + 0.75 opacity)
  corese:  { hex: '#4472C4', bg: 'rgba(68,114,196,0.75)'  },
  jena:    { hex: '#ED7D31', bg: 'rgba(237,125,49,0.75)'  },
  rdf4j:   { hex: '#70AD47', bg: 'rgba(112,173,71,0.75)'  },
  oxigraph:{ hex: '#E05C5C', bg: 'rgba(224,92,92,0.75)'   },
  blazegraph:{ hex: '#9B59B6', bg: 'rgba(155,89,182,0.75)'},
};

const ENGINE_OVERRIDES = {
  // Corese dev versions — light blue, same family as stable Corese
  'corese.local': { hex: '#5B9BD5', bg: 'rgba(91,155,213,0.75)' },
  'corese.next':  { hex: '#5B9BD5', bg: 'rgba(91,155,213,0.75)' },
};

// Fallback colors auto-assigned (priority order) for unknown engines
const AUTO_COLORS = [
  { hex: '#E74C3C', bg: 'rgba(231,76,60,0.75)'   },
  { hex: '#9B59B6', bg: 'rgba(155,89,182,0.75)'  },
  { hex: '#1ABC9C', bg: 'rgba(26,188,156,0.75)'  },
  { hex: '#F39C12', bg: 'rgba(243,156,18,0.75)'  },
  { hex: '#2ECC71', bg: 'rgba(46,204,113,0.75)'  },
  { hex: '#E91E63', bg: 'rgba(233,30,99,0.75)'   },
  { hex: '#00BCD4', bg: 'rgba(0,188,212,0.75)'   },
  { hex: '#FF5722', bg: 'rgba(255,87,34,0.75)'   },
];

// Dynamic resolution: builds engine → color map from data
let ENGINE_COLOR_MAP = {};

function buildColorMap(engines) {
  let autoIdx = 0;
  for (const engine of engines) {
    if (ENGINE_COLOR_MAP[engine]) continue; // already assigned

    if (ENGINE_OVERRIDES[engine]) {
      ENGINE_COLOR_MAP[engine] = ENGINE_OVERRIDES[engine];
    } else {
      const family = engine.split('.')[0].toLowerCase();
      if (ENGINE_FAMILIES[family]) {
        ENGINE_COLOR_MAP[engine] = ENGINE_FAMILIES[family];
      } else {
        ENGINE_COLOR_MAP[engine] = AUTO_COLORS[autoIdx % AUTO_COLORS.length];
        autoIdx++;
      }
    }
  }
}

function pal(engineName) {
  return ENGINE_COLOR_MAP[engineName]
    ?? { hex: '#8b949e', bg: 'rgba(139,148,158,0.7)' };
}

function badgeCls(engineName) {
  // Cherche la famille connue, sinon 'unknown'
  const family = engineName.split('.')[0].toLowerCase();
  return ENGINE_FAMILIES[family] ? `badge-${family}` : 'badge-unknown';
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch('data/benchmark-report.json');
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (_) {
    if (typeof window.__BENCHMARK_DATA__ !== 'undefined') return window.__BENCHMARK_DATA__;
    throw new Error('Aucune donnée. Lancez le benchmark d\'abord.');
  }
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
const fmt = (n, d = 0) =>
  n == null ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d });

function shortFile(f) { return f.replace('_en.nt', '').replace(/_/g, ' '); }

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const THEMES = ['auto', 'light', 'dark'];
let themeIdx = THEMES.indexOf(localStorage.getItem('theme') ?? 'auto');

function applyTheme() {
  const theme = THEMES[themeIdx];
  const icons = { auto: 'icon-auto', light: 'icon-sun', dark: 'icon-moon' };

  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);

  ['icon-auto', 'icon-sun', 'icon-moon'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === icons[theme] ? '' : 'none';
  });
  localStorage.setItem('theme', theme);
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  themeIdx = (themeIdx + 1) % THEMES.length;
  applyTheme();
});

applyTheme();

// ── Dataset metadata ──────────────────────────────────────────────────────────
//
// Maps dataset label → { label, description, url }
// Add a new entry here when a new dataset is supported.
const DATASET_META = {
  dbpedia: {
    label:       'DBpedia',
    description: 'Real-world RDF dump — 5 N-Triples files from DBpedia 3.5.1',
    url:         'https://downloads.dbpedia.org/3.5.1/en/',
  },
  bowlogna: {
    label:       'Bowlogna',
    description: 'Synthetic university dataset with SPARQL queries (HOBBIT benchmark)',
    url:         'https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip',
  },
  bsbm: {
    label:       'BSBM',
    description: 'Berlin SPARQL Benchmark — synthetic e-commerce dataset',
    url:         'https://sourceforge.net/projects/bsbmtools/',
  },
  lubm: {
    label:       'LUBM',
    description: 'Lehigh University Benchmark — university domain with RDFS reasoning',
    url:         'https://swat.cse.lehigh.edu/projects/lubm/',
  },
};

function renderDatasetCards(runs, queries) {
  const datasets = [...new Set(runs.map(r => r.dataset))];
  const grid = document.getElementById('dataset-grid');
  if (!grid) return;
  const meta = document.getElementById('datasets-meta');
  if (meta) meta.textContent = `${datasets.length} dataset${datasets.length > 1 ? 's' : ''}`;
  // Collapse by default when more than one dataset (keeps the page compact)
  const details = grid.closest('details');
  if (details && datasets.length > 1) details.removeAttribute('open');

  grid.innerHTML = datasets.map(ds => {
    const meta      = DATASET_META[ds.toLowerCase()] ?? { label: ds, description: '', url: null };
    const dsRuns    = runs.filter(r => r.dataset === ds);
    const files     = [...new Set(dsRuns.map(r => r.file))];
    const engines   = [...new Set(dsRuns.map(r => r.engine))];
    const totalTrip = dsRuns.reduce((s, r) => s + r.triples, 0) / engines.length;

    const linkHtml = meta.url
      ? `<a class="dataset-source-link" href="${meta.url}" target="_blank" rel="noopener">
           <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
           Source
         </a>`
      : '';

    // File tags
    const fileTags = files.map(f =>
      `<span class="file-tag">${shortFile(f)}</span>`
    ).join('');

    // SPARQL queries collapsible (only if queries embedded in JSON)
    let queriesHtml = '';
    if (queries && queries.length > 0) {
      const queryItems = queries.map((q, i) => `
        <div class="query-item">
          <span class="query-item-id">Q${i + 1}</span>
          <pre class="query-item-text">${q.trim().replace(/</g, '&lt;')}</pre>
        </div>`).join('');
      queriesHtml = `
        <details class="queries-details">
          <summary class="queries-summary">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            ${queries.length} SPARQL queries
          </summary>
          <div class="queries-list">${queryItems}</div>
        </details>`;
    }

    return `
      <div class="suite-item dataset-card">
        <div class="suite-item-header">
          <span class="suite-name">${meta.label}</span>
          ${linkHtml}
        </div>
        ${meta.description ? `<p class="dataset-desc">${meta.description}</p>` : ''}
        <div class="suite-stats">
          <div class="stat-item">
            <div class="stat-label">Files</div>
            <div class="stat-value">${files.length}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Total triples</div>
            <div class="stat-value">${fmt(totalTrip, 0)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Format</div>
            <div class="stat-value">N-Triples (.nt)</div>
          </div>
        </div>
        <div class="file-tags">${fileTags}</div>
        ${queriesHtml}
      </div>`;
  }).join('');
}

// ── Table sort state ─────────────────────────────────────────────────────────
let sortField = null;
let sortAsc   = true;

function initTableSort() {
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) {
        sortAsc = !sortAsc;
      } else {
        sortField = field;
        sortAsc   = true;
      }
      // Update indicators
      document.querySelectorAll('th[data-sort]').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
      updateTable();
    });
  });
}

// ── Engine filter state ───────────────────────────────────────────────────────
// activeEngines: Set of selected engine names. Empty = all engines shown.
let activeEngines = new Set();
let allCharts     = {};

// ── Header ────────────────────────────────────────────────────────────────────

function renderHeader(meta, runs) {
  const datasets = [...new Set(runs.map(r => r.dataset))];
  const badgeContainer = document.getElementById('hdr-datasets');
  if (badgeContainer) {
    badgeContainer.innerHTML = datasets.map(d => `<span class="badge-tag">${d}</span>`).join('');
  }
  document.getElementById('hdr-date').textContent = formatDate(meta.generatedAt);
  document.getElementById('hdr-java').textContent = `Java ${meta.java}`;

  const engines = [...new Set(runs.map(r => r.engine))];
  const engineHtml = engines.map(e => `<strong>${e}</strong>`).join(' · ');
  const desc = document.getElementById('main-desc');
  if (desc) desc.innerHTML =
    `Corese reference benchmark dashboard — Loading performance comparison&nbsp;: ${engineHtml}`;
}

// ── Run info bar ──────────────────────────────────────────────────────────────
function renderRunInfo(meta) {
  document.getElementById('info-date').textContent     = formatDate(meta.generatedAt);
  document.getElementById('info-java').textContent     = meta.java ?? '—';
  document.getElementById('info-os').textContent       = meta.os ?? '—';
  document.getElementById('info-protocol').textContent =
    `${meta.protocol.repetitions} repetitions + warmup`;
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKPI(runs) {
  const engines = [...new Set(runs.map(r => r.engine))];
  const files   = [...new Set(runs.map(r => r.file))];
  const totalTrip = runs.reduce((s, r) => s + r.triples, 0);
  const bestR     = runs.reduce((best, r) =>
    r.throughputTriplesPerSec > best.throughputTriplesPerSec ? r : best, runs[0]);

  const kpis = [
    { label: 'Engines tested',  num: engines.length,       note: engines.join(' · ') },
    { label: 'Files tested',    num: files.length,          note: '.nt (N-Triples) files' },
    { label: 'Total triples',   num: fmt(totalTrip),        note: 'loaded in total' },
    { label: 'Best throughput', num: fmt(bestR.throughputTriplesPerSec, 0), note: bestR.engine },
  ];

  document.getElementById('metrics-grid').innerHTML = kpis.map(k => `
    <div class="metric-block">
      <div class="metric-label">${k.label}</div>
      <div class="metric-num">${k.num}</div>
      <div class="metric-note">${k.note}</div>
    </div>
  `).join('');
}

// ── Global meter (proportion bars per engine) ─────────────────────────────────
function renderGlobalMeter(runs) {
  const engines = [...new Set(runs.map(r => r.engine))];
  const total   = runs.length;
  const meter   = document.getElementById('global-meter');
  meter.innerHTML = engines.map(e => {
    const count = runs.filter(r => r.engine === e).length;
    const pct   = (count / total * 100).toFixed(1);
    return `<div class="meter-segment" style="width:${pct}%; background:${pal(e).hex}" title="${e}: ${count} fichiers"></div>`;
  }).join('');
}

// ── Engine cards ──────────────────────────────────────────────────────────────
// Detects if an engine is a Corese development version
const isDevCorese    = e => e === 'corese.local' || e === 'corese.next' || e.startsWith('corese.commit.');
const isStableCorese = e => e.startsWith('corese.') && !isDevCorese(e);

function renderEngineCards(runs) {
  const engines = [...new Set(runs.map(r => r.engine))];

  // Average throughput per engine
  const avgThruMap = {};
  engines.forEach(engine => {
    const eruns = runs.filter(r => r.engine === engine);
    avgThruMap[engine] = eruns.reduce((s, r) => s + r.throughputTriplesPerSec, 0) / eruns.length;
  });

  // Reference: stable Corese version if present, otherwise the best engine
  const stableCorese = engines.find(isStableCorese);
  const maxAvgThru   = Math.max(...Object.values(avgThruMap));
  const refEngine    = stableCorese ?? engines.find(e => avgThruMap[e] === maxAvgThru);
  const refThru      = avgThruMap[refEngine];

  document.getElementById('engine-grid').innerHTML = engines.map(engine => {
    const eruns   = runs.filter(r => r.engine === engine);
    const avgTime = eruns.reduce((s, r) => s + r.loadingTimeMs, 0) / eruns.length;
    const avgMem  = eruns.reduce((s, r) => s + r.memoryDeltaMb, 0) / eruns.length;
    const avgThru = avgThruMap[engine];
    const score   = Math.round(avgThru / refThru * 100);
    const p       = pal(engine);

    // Libellé "vitesse relative" selon le contexte
    let relativeLabel, tooltip, scoreDisplay;
    if (engine === refEngine) {
      relativeLabel = '🏆 reference';
      tooltip       = 'Stable Corese reference version';
      scoreDisplay  = '100 / 100';
    } else if (stableCorese && isDevCorese(engine)) {
      const delta = score - 100;
      if (delta >= 0) {
        relativeLabel = `<span style="color:#3fb950">📈 +${delta}% improvement</span>`;
        tooltip       = `${delta}% faster than ${refEngine}`;
      } else {
        relativeLabel = `<span style="color:#f85149">📉 ${delta}% regression</span>`;
        tooltip       = `${Math.abs(delta)}% slower than ${refEngine}`;
      }
      scoreDisplay = `${score} / 100`;
    } else {
      const ratio   = (refThru / avgThru).toFixed(1);
      relativeLabel = ratio > 1 ? `${ratio}× slower` : `${(1/ratio).toFixed(1)}× faster`;
      tooltip       = `Compared to ${refEngine}`;
      scoreDisplay  = `${score} / 100`;
    }

    const meterW = Math.min(score, 100); // bar capped at 100% visually

    return `
      <div class="suite-item" data-engine="${engine}" draggable="true"
           onclick="toggleEngine('${engine}')"
           ondragstart="dragStart(event)" ondragover="dragOver(event)"
           ondrop="dragDrop(event)" ondragend="dragEnd(event)"
           ondragleave="dragLeave(event)">
        <div class="suite-item-header">
          <span class="suite-name">
            <span class="engine-dot" style="background:${p.hex}"></span>
            ${engine}
          </span>
          <span class="suite-pct" title="${tooltip}" style="cursor:help">${scoreDisplay}</span>
        </div>
        <div class="suite-stats">
          <div class="stat-item">
            <div class="stat-label">Avg. time</div>
            <div class="stat-value">${fmt(avgTime, 0)} ms</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Avg. throughput</div>
            <div class="stat-value">${fmt(avgThru, 0)} t/s</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Avg. memory</div>
            <div class="stat-value">${fmt(avgMem, 1)} MB</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Relative speed</div>
            <div class="stat-value">${relativeLabel}</div>
          </div>
        </div>
        <div class="suite-meter">
          <div class="meter-segment" style="width:${meterW}%; background:${p.hex}"></div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleEngine(engine) {
  if (activeEngines.has(engine)) {
    activeEngines.delete(engine);
  } else {
    activeEngines.add(engine);
  }
  document.querySelectorAll('.suite-item[data-engine]').forEach(el => {
    el.classList.toggle('active', activeEngines.has(el.dataset.engine));
  });
  // Show/hide clear button
  const btn = document.getElementById('clear-engines-btn');
  if (btn) btn.style.display = activeEngines.size > 0 ? '' : 'none';
  updateCharts();
  updateTable();
}

function clearEngineFilter() {
  activeEngines.clear();
  document.querySelectorAll('.suite-item[data-engine]').forEach(el => el.classList.remove('active'));
  const btn = document.getElementById('clear-engines-btn');
  if (btn) btn.style.display = 'none';
  updateCharts();
  updateTable();
}

// ── Engine card drag & drop ───────────────────────────────────────────────────
let dragSrc = null;

function dragStart(e) {
  dragSrc = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrc.dataset.engine);
  dragSrc.classList.add('dragging');
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target !== dragSrc) target.classList.add('drag-over');
}

function dragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function dragDrop(e) {
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove('drag-over');
  if (!dragSrc || dragSrc === target) return;

  // Guard: source and target must be in the same grid
  const grid = document.getElementById('engine-grid');
  if (!grid.contains(dragSrc) || !grid.contains(target)) return;

  const items = [...grid.querySelectorAll('.suite-item[data-engine]')];
  const srcIdx = items.indexOf(dragSrc);
  const tgtIdx = items.indexOf(target);

  if (srcIdx < tgtIdx) grid.insertBefore(dragSrc, target.nextSibling);
  else                  grid.insertBefore(dragSrc, target);

  const order = [...grid.querySelectorAll('.suite-item[data-engine]')].map(el => el.dataset.engine);
  localStorage.setItem('engineOrder', JSON.stringify(order));
}

function dragQueryDrop(e) {
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove('drag-over');
  if (!dragSrc || dragSrc === target) return;

  // Guard: source and target must be in the same grid
  const grid = document.getElementById('query-cards-grid');
  if (!grid || !grid.contains(dragSrc) || !grid.contains(target)) return;

  const items = [...grid.querySelectorAll('.query-engine-card[data-engine]')];
  const srcIdx = items.indexOf(dragSrc);
  const tgtIdx = items.indexOf(target);

  if (srcIdx < tgtIdx) grid.insertBefore(dragSrc, target.nextSibling);
  else                  grid.insertBefore(dragSrc, target);
}

function dragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.suite-item').forEach(el => el.classList.remove('drag-over'));
}

function applyStoredEngineOrder() {
  const stored = localStorage.getItem('engineOrder');
  if (!stored) return;
  try {
    const order = JSON.parse(stored);
    const grid  = document.getElementById('engine-grid');

    // 1. Move engines that are in the stored order (skip unknowns)
    order.forEach(engine => {
      const el = grid.querySelector(`.suite-item[data-engine="${engine}"]`);
      if (el) grid.appendChild(el);
    });

    // 2. Append engines NOT in stored order at the end (new engines from a different run)
    grid.querySelectorAll('.suite-item[data-engine]').forEach(el => {
      if (!order.includes(el.dataset.engine)) grid.appendChild(el);
    });
  } catch (_) {}
}

// ── Charts ────────────────────────────────────────────────────────────────────
let allRuns = [];

const CHART_OPT = (yLabel) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12, font: { size: 11, family: "'Inter'" } } },
    tooltip: { mode: 'index', intersect: false },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 20 } },
    y: {
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { font: { size: 10 } },
      beginAtZero: true,
      title: { display: true, text: yLabel, font: { size: 10 }, color: '#8b949e' },
    },
  },
});

function buildDatasets(field) {
  const engines = [...new Set(allRuns.map(r => r.engine))];
  const files   = [...new Set(allRuns.map(r => r.file))];
  return engines.map(engine => {
    const p = pal(engine);
    const visible = activeEngines.size === 0 || activeEngines.has(engine);
    return {
      label: engine,
      data: files.map(f => {
        const r = allRuns.find(x => x.engine === engine && x.file === f);
        return r ? +r[field].toFixed(1) : null;
      }),
      backgroundColor: visible ? p.bg : 'rgba(100,100,100,0.15)',
      borderColor:     visible ? p.hex : 'rgba(100,100,100,0.3)',
      borderWidth: 1,
      borderRadius: 3,
    };
  });
}

function initCharts() {
  const files  = [...new Set(allRuns.map(r => r.file))];
  const labels = files.map(shortFile);

  const configs = [
    { id: 'chart-loading',    field: 'loadingTimeMs',          yLabel: 'ms' },
    { id: 'chart-throughput', field: 'throughputTriplesPerSec', yLabel: 'triples/s' },
    { id: 'chart-memory',     field: 'memoryDeltaMb',           yLabel: 'MB' },
    { id: 'chart-cpu',        field: 'cpuPercent',              yLabel: '%' },
  ];

  for (const { id, field, yLabel } of configs) {
    allCharts[id] = new Chart(document.getElementById(id).getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: buildDatasets(field) },
      options: CHART_OPT(yLabel),
    });
    allCharts[id]._field = field;
  }
}

function updateCharts() {
  for (const [id, chart] of Object.entries(allCharts)) {
    chart.data.datasets = buildDatasets(chart._field);
    chart.update('none');
  }
}

// ── Tableau ────────────────────────────────────────────────────────────────────
function renderTable(runs) {
  updateTable(runs);
}

function updateTable(runsArg) {
  let runs = (runsArg ?? allRuns).filter(r =>
    activeEngines.size === 0 || activeEngines.has(r.engine)
  );

  if (sortField) {
    runs = [...runs].sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
  }

  const tbody  = document.getElementById('results-body');
  const thead  = tbody.closest('table').querySelector('thead tr');
  tbody.innerHTML = '';

  // 2-engine diff mode: when exactly 2 engines are selected
  const diffMode = activeEngines.size === 2;
  const [engA, engB] = diffMode ? [...activeEngines] : [null, null];

  // Update thead diff column
  const existingDiff = thead.querySelector('th.diff-col');
  if (existingDiff) existingDiff.remove();
  if (diffMode) {
    const th = document.createElement('th');
    th.className = 'text-right diff-col';
    th.title = `${engA} vs ${engB}`;
    th.textContent = 'Δ throughput';
    thead.insertBefore(th, thead.lastElementChild);
  }

  // Group by file for diff calculation
  const files = [...new Set(runs.map(r => r.file))];
  const grouped = {};
  if (diffMode) {
    files.forEach(f => {
      grouped[f] = {};
      runs.filter(r => r.file === f).forEach(r => { grouped[f][r.engine] = r; });
    });
  }

  for (const r of runs) {
    const tr = document.createElement('tr');
    let diffCell = '';
    if (diffMode) {
      const peer = grouped[r.file]?.[r.engine === engA ? engB : engA];
      if (peer) {
        const peerThru = peer.throughputTriplesPerSec;
        const delta = peerThru > 0
          ? ((r.throughputTriplesPerSec - peerThru) / peerThru * 100).toFixed(1)
          : null;
        const cls   = delta == null ? '' : delta > 0 ? 'diff-better' : delta < 0 ? 'diff-worse' : '';
        diffCell = delta == null
          ? `<td class="text-right">—</td>`
          : `<td class="text-right ${cls}">${delta > 0 ? '+' : ''}${delta}%</td>`;
      } else {
        diffCell = `<td class="text-right">—</td>`;
      }
    }
    tr.innerHTML = `
      <td><span class="engine-badge" style="background:${pal(r.engine).hex}">${r.engine}</span></td>
      <td>${shortFile(r.file)}</td>
      <td class="text-right">${fmt(r.triples)}</td>
      <td class="text-right">${fmt(r.loadingTimeMs)}</td>
      <td class="text-right">${fmt(r.throughputTriplesPerSec, 0)}</td>
      <td class="text-right">${fmt(r.memoryDeltaMb, 1)}</td>
      <td class="text-right">${fmt(r.cpuPercent, 1)}</td>
      ${diffMode ? diffCell : ''}
      <td class="reps">${r.repetitionsMs.join(' · ')}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ── Query benchmark section ───────────────────────────────────────────────────
let activeQueryEngines = new Set();
let queryChart = null;
let allQueryRuns = [];

function toggleQueryEngine(engine) {
  if (activeQueryEngines.has(engine)) {
    activeQueryEngines.delete(engine);
  } else {
    activeQueryEngines.add(engine);
  }
  document.querySelectorAll('.query-engine-card[data-engine]').forEach(el => {
    el.classList.toggle('active', activeQueryEngines.has(el.dataset.engine));
  });
  const btn = document.getElementById('clear-query-engines-btn');
  if (btn) btn.style.display = activeQueryEngines.size > 0 ? '' : 'none';
  updateQueryChart();
  updateQueryTable();
}

function clearQueryEngineFilter() {
  activeQueryEngines.clear();
  document.querySelectorAll('.query-engine-card[data-engine]').forEach(el => el.classList.remove('active'));
  const btn = document.getElementById('clear-query-engines-btn');
  if (btn) btn.style.display = 'none';
  updateQueryChart();
  updateQueryTable();
}

function updateQueryChart() {
  if (!queryChart) return;
  const engines = [...document.querySelectorAll('.query-engine-card[data-engine]')]
    .map(el => el.dataset.engine);
  queryChart.data.datasets = queryChart.data.datasets.map(ds => {
    const visible = activeQueryEngines.size === 0 || activeQueryEngines.has(ds.label);
    const p = pal(ds.label);
    return { ...ds,
      backgroundColor: visible ? p.bg  : 'rgba(100,100,100,0.15)',
      borderColor:     visible ? p.hex : 'rgba(100,100,100,0.3)',
    };
  });
  queryChart.update('none');
}

function updateQueryTable() {
  const tbody = document.getElementById('query-results-body');
  if (!tbody) return;
  const table = tbody.closest('table');
  if (!table) return;

  // Map engine → column index (0-based) from thead
  const headers = [...table.querySelectorAll('thead th')];
  const engineColIndex = {};
  headers.forEach((th, i) => {
    if (th.dataset.engine) engineColIndex[th.dataset.engine] = i;
  });

  // Apply opacity per cell using direct column index
  const allRows = [...table.querySelectorAll('tr')];
  allRows.forEach(tr => {
    const cells = [...tr.children];
    headers.forEach((th, i) => {
      const engine = th.dataset.engine;
      if (!engine) return;
      const visible = activeQueryEngines.size === 0 || activeQueryEngines.has(engine);
      if (cells[i]) cells[i].style.opacity = visible ? '' : '0.25';
    });
  });
}

function renderQuerySection(queryRuns) {
  if (!queryRuns || queryRuns.length === 0) return;
  allQueryRuns = queryRuns;

  const engines  = [...new Set(queryRuns.map(r => r.engine))];
  const queryIds = [...new Set(queryRuns.map(r => r.queryId))].sort(
    (a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1])
  );

  // Summary cards per engine — draggable + clickable
  const cards = engines.map(engine => {
    const eruns  = queryRuns.filter(r => r.engine === engine && r.medianMs >= 0);
    const avgMs  = eruns.length ? eruns.reduce((s, r) => s + r.medianMs, 0) / eruns.length : 0;
    const sorted = eruns.map(r => r.medianMs).sort((a,b)=>a-b);
    const p50    = sorted.length ? sorted[Math.floor(sorted.length * 0.50)] : 0;
    const p95    = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const p99    = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] : 0;
    const p      = pal(engine);
    return `
      <div class="query-engine-card suite-item" data-engine="${engine}"
           draggable="true"
           onclick="toggleQueryEngine('${engine}')"
           ondragstart="dragStart(event)" ondragover="dragOver(event)"
           ondrop="dragQueryDrop(event)" ondragend="dragEnd(event)"
           ondragleave="dragLeave(event)">
        <div class="query-engine-header">
          <span class="engine-dot" style="background:${p.hex}"></span>
          <strong>${engine}</strong>
        </div>
        <div class="suite-stats">
          <div class="stat-item"><div class="stat-label">Avg.</div><div class="stat-value">${fmt(avgMs,0)} ms</div></div>
          <div class="stat-item"><div class="stat-label">p50</div><div class="stat-value">${fmt(p50,0)} ms</div></div>
          <div class="stat-item"><div class="stat-label">p95</div><div class="stat-value">${fmt(p95,0)} ms</div></div>
          <div class="stat-item"><div class="stat-label">p99</div><div class="stat-value">${fmt(p99,0)} ms</div></div>
          <div class="stat-item"><div class="stat-label">Queries</div><div class="stat-value">${eruns.length}</div></div>
        </div>
      </div>`;
  }).join('');

  // Bar chart data
  const datasets = engines.map(engine => {
    const p = pal(engine);
    return {
      label: engine,
      data: queryIds.map(qid => {
        const r = queryRuns.find(r => r.engine === engine && r.queryId === qid);
        return r && r.medianMs >= 0 ? r.medianMs : null;
      }),
      backgroundColor: p.bg,
      borderColor: p.hex,
      borderWidth: 1,
    };
  });

  const section = document.createElement('section');
  section.className = 'query-section';
  section.innerHTML = `
    <details class="query-details" open>
      <summary class="query-summary">
        <h2 class="section-heading" style="margin:0;display:inline">SPARQL Queries</h2>
        <span class="query-summary-meta">${queryIds.length} queries · ${engines.length} engines · ms, lower is better</span>
      </summary>
    <div class="section-heading-row" style="margin-top:8px">
      <p class="section-note" style="margin:0">Median execution time per query — 3 repetitions</p>
      <button id="clear-query-engines-btn" class="btn-clear-filter" onclick="clearQueryEngineFilter()" style="display:none">✕ Clear filter</button>
    </div>
    <div class="query-cards" id="query-cards-grid">${cards}</div>
    <div class="chart-card" style="margin-top:16px">
      <div class="chart-header">
        <span class="chart-title">Time per query</span>
        <span class="chart-unit">ms — lower is better</span>
      </div>
      <canvas id="chart-queries" height="80"></canvas>
    </div>
    <div class="table-surface" style="margin-top:16px">
      <div class="table-scroll">
      <table class="report-table">
        <thead><tr>
          <th>Requête</th>
          ${engines.map(e => `<th class="text-right" data-engine="${e}"><span class="engine-dot" style="background:${pal(e).hex}"></span> ${e}</th>`).join('')}
          <th class="text-right">Best</th>
        </tr></thead>
        <tbody id="query-results-body">
          ${queryIds.map(qid => {
            // Valid values for this query
            const rowData = engines.map(engine => {
              const r = queryRuns.find(r => r.engine === engine && r.queryId === qid);
              return r && r.medianMs >= 0 ? r.medianMs : null;
            });
            const validTimes = rowData.filter(v => v !== null);
            const minMs  = validTimes.length ? Math.min(...validTimes) : null;
            const maxMs  = validTimes.length ? Math.max(...validTimes) : null;
            const winner = minMs !== null ? engines[rowData.indexOf(minMs)] : null;
            const allFailed = validTimes.length === 0;

            const cells = engines.map((engine, i) => {
              const ms = rowData[i];
              if (ms === null) return `<td class="text-right query-fail">—</td>`;
              const isBest  = ms === minMs;
              const r       = minMs ? ms / minMs : 1;
              const isRed   = !isBest && r >= 20;
              const isOrange= !isBest && r >= 5 && r < 20;
              const ratio   = !isBest && r >= 2 ? ` <span class="query-ratio">×${r.toFixed(1)}</span>` : '';
              const cls     = isBest ? 'query-best' : isRed ? 'query-worst' : isOrange ? 'query-slow' : '';
              return `<td class="text-right ${cls}">${fmt(ms)} ms${ratio}</td>`;
            }).join('');

            const bestCell = winner
              ? `<td class="text-right" style="color:${pal(winner).hex};font-size:11px">${winner}</td>`
              : `<td class="text-right query-fail">—</td>`;

            return `<tr>${'<td>' + qid + '</td>'}${cells}${bestCell}</tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
    </div>
    </details>
  `;
  document.querySelector('.app-wrapper').appendChild(section);

  // Render chart — store reference for filter updates
  queryChart = new Chart(document.getElementById('chart-queries'), {
    type: 'bar',
    data: { labels: queryIds, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12, font: { size: 11, family: "'Inter'" } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw, 0)} ms` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { callback: v => fmt(v, 0) + ' ms' } },
      },
    },
  });
}

// ── Tendance historique ───────────────────────────────────────────────────────
async function renderTrend() {
  let valid;

  // Priority: inline data (file:// compatible)
  if (window.__HISTORY_DATA__ && window.__HISTORY_DATA__.length >= 2) {
    valid = window.__HISTORY_DATA__;
  } else {
    // Fallback : fetch (fonctionne sur serveur HTTP)
    let index;
    try {
      const res = await fetch('data/history/index.json');
      if (!res.ok) return;
      index = await res.json();
    } catch (_) { return; }
    if (!index || index.length < 2) return;

    const reports = await Promise.all(
      index.map(async entry => {
        try {
          const r = await fetch(`data/history/${entry.file}`);
          if (!r.ok) return null;
          const d = await r.json();
          return { date: entry.date, data: d };
        } catch (_) { return null; }
      })
    );
    valid = reports.filter(Boolean);
    if (valid.length < 2) return;
  }

  // Engines: only those present in the current run (allRuns), to keep the chart focused
  const currentEngines = new Set(allRuns.map(r => r.engine));
  const engines = [...new Set(valid.flatMap(r => r.data.runs.map(run => run.engine)))]
    .filter(e => currentEngines.has(e));

  // Time series: average throughput per engine
  const datasets = engines.map(engine => {
    const p = pal(engine);
    return {
      label: engine,
      data: valid.map(r => {
        const runs = r.data.runs.filter(run => run.engine === engine);
        if (!runs.length) return null;
        return Math.round(runs.reduce((s, run) => s + run.throughputTriplesPerSec, 0) / runs.length);
      }),
      borderColor: p.hex,
      backgroundColor: p.bg,
      tension: 0.3,
      fill: false,
      pointRadius: 4,
    };
  });

  const labels = valid.map(r => {
    const d = r.date; // format YYYYMMDD_HHMMSS
    return `${d.slice(6,8)}/${d.slice(4,6)} ${d.slice(9,11)}:${d.slice(11,13)}`;
  });

  const section = document.createElement('section');
  section.innerHTML = `
    <details class="query-details">
      <summary class="query-summary" style="margin-top:32px">
        <h2 class="section-heading" style="margin:0;display:inline">Historical trend</h2>
        <span class="query-summary-meta">${valid.length} runs · avg throughput per engine</span>
      </summary>
    <div class="chart-card" style="margin-top:12px">
      <div class="chart-header">
        <span class="chart-title">Throughput over time</span>
        <span class="chart-unit">triples/s — higher is better</span>
      </div>
      <canvas id="chart-trend" height="60"></canvas>
    </div>
    </details>
  `;
  document.querySelector('.app-wrapper').appendChild(section);

  new Chart(document.getElementById('chart-trend'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12, font: { size: 11, family: "'Inter'" } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw, 0)} t/s` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { beginAtZero: false, ticks: { callback: v => fmt(v, 0) } },
      },
    },
  });
}

// ── PNG export ────────────────────────────────────────────────────────────────
function downloadChart(canvasId, name) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const a = document.createElement('a');
  a.download = `corese-benchmark-${name}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    document.querySelector('.app-wrapper').innerHTML +=
      `<div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">No benchmark data</div>
        <div class="empty-state-msg">${err.message}</div>
        <div class="empty-state-hint">
          Run <code>make compare</code> or <code>make all</code> to generate a report,
          then refresh this page.
        </div>
      </div>`;
    return;
  }

  allRuns = data.runs;

  // Build color map from engines present in the data
  const engines = [...new Set(allRuns.map(r => r.engine))];
  buildColorMap(engines);

  renderHeader(data.metadata, allRuns);
  renderRunInfo(data.metadata);
  renderKPI(allRuns);
  renderGlobalMeter(allRuns);
  renderDatasetCards(allRuns, data.metadata.queries ?? null);
  renderEngineCards(allRuns);
  applyStoredEngineOrder();
  initCharts();
  initTableSort();
  renderTable(allRuns);
  const meta = document.getElementById('full-results-meta');
  if (meta) meta.textContent = `${allRuns.length} rows · ${[...new Set(allRuns.map(r=>r.engine))].length} engines`;

  // Query section (optional — only if queryRuns present in JSON)
  if (data.queryRuns && data.queryRuns.length > 0) {
    renderQuerySection(data.queryRuns);
  }

  // Historical trend (async, non-blocking)
  renderTrend();
}

main();
