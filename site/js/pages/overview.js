// overview.js — Overview page with KPI cards and summary charts
'use strict';

import state from '../state.js';
import { fmt, fmtMs, fmtThroughput, fmtPercent } from '../formatters.js';
import { getEngineColor, getEngineLabel } from '../data-loader.js';

/**
 * Render the overview page.
 * @param {HTMLElement} container
 */
export function renderOverview(container) {
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

export default renderOverview;
