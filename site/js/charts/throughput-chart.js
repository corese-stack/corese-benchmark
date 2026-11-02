// throughput-chart.js — Horizontal bar chart for loading throughput with min/max error bars
'use strict';

import state from '../state.js';
import { getEngineColor, getEngineLabel } from '../data-loader.js';

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
export function renderThroughputChart(canvasId, loadingRuns) {
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

export default renderThroughputChart;
