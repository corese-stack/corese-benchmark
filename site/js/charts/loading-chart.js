// loading-chart.js — Bi-axis loading chart (heap memory + triples loaded over time)
'use strict';

import state from '../state.js';
import { getEngineColor, getEngineLabel } from '../data-loader.js';

/**
 * Render bi-axis loading chart on a canvas.
 * X = elapsed time (s), Y1 = heap used (MB), Y2 = triples loaded (cumulative)
 * @param {string} canvasId
 * @param {string} dataset
 * @returns {Chart|null}
 */
export function renderLoadingChart(canvasId, dataset) {
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

export default renderLoadingChart;
