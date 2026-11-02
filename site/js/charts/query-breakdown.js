// query-breakdown.js — Grouped bar chart: median time per query per engine
'use strict';

import state from '../state.js';
import { getEngineColor, getEngineLabel } from '../data-loader.js';

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
export function renderQueryBreakdown(canvasId, queryRuns, queryIds, logScale = false) {
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

export default renderQueryBreakdown;
