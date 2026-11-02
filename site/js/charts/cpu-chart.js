// cpu-chart.js — Horizontal bar chart for average CPU usage during loading
'use strict';

import state from '../state.js';
import { getEngineColor, getEngineLabel } from '../data-loader.js';

/**
 * Render CPU % horizontal bar chart.
 * @param {string} canvasId
 * @param {Array} loadingRuns - filtered loading runs
 */
export function renderCpuChart(canvasId, loadingRuns) {
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

export default renderCpuChart;
