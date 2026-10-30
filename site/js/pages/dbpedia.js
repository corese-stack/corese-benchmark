// dbpedia.js — DBpedia Scale page with file selector and bilogarithmic chart
'use strict';

import state from '../state.js';
import { getLoadingRuns } from '../data-loader.js';
import { getEngineColor, getEngineLabel } from '../data-loader.js';
import { buildLoadingTableWithFilter } from '../components/result-table.js';
import { fmtMemory } from '../formatters.js';
import { addExpandButton } from '../chart-expand.js';

const DATASET = 'dbpedia';

const DBPEDIA_FILES = [
  'persondata_en.nt',
  'homepages_en.nt',
  'category_labels_en.nt',
  'disambiguations_en.nt',
  'specific_mappingbased_properties_en.nt',
];

let selectedFile = null; // null = all files

export function renderDbpedia(container) {
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
  });
}

function updateDbpedia() {
  let runs = getLoadingRuns(DATASET);
  if (selectedFile) runs = runs.filter(r => r.file === selectedFile);

  const tableContainer = document.getElementById('dbpedia-table');
  if (tableContainer) buildLoadingTableWithFilter(tableContainer, runs);

  renderScaleChart(runs);
  renderMemoryChart(runs);
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

export default renderDbpedia;
