// chart-expand.js — Fullscreen expand + PNG download buttons for chart boxes
'use strict';

import state from './state.js';

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
export function addExpandButton(chartBox) {
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
