// export-csv.js — CSV export for loading runs and query runs
'use strict';

import state from './state.js';
import { getEngineLabel } from './data-loader.js';
import { computeCV } from './formatters.js';

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

export function downloadLoadingCsv() {
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

export function downloadQueryCsv() {
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
