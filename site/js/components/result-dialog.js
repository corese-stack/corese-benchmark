// result-dialog.js — Modal dialog for inspecting query results (diff inspector)
'use strict';

import { fmt, fmtMs, escapeHtml } from '../formatters.js';
import { getEngineLabel, getQueryMeta } from '../data-loader.js';
import { createStatusBadge } from './status-badge.js';

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
export function openResultDialog(run) {
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

export default openResultDialog;
