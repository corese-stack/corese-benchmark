// data-loader.js — Load and normalize benchmark JSON (v1 real + v2 mock)
'use strict';

import state from './state.js';

/** Engine color palette */
const ENGINE_COLORS = {
  'corese':      '#4472C4',
  'corese.next': '#2E75B6',
  'jena':        '#ED7D31',
  'rdf4j':       '#70AD47',
};

// Versioned overrides (e.g. corese.4.6.5 → lighter blue to distinguish from v5)
function versionedColor(engineId) {
  const id = engineId.toLowerCase();
  if (id.startsWith('corese.') && id !== 'corese.next') return '#7EB3E8';
  return null;
}

export function getEngineColor(engineId) {
  if (ENGINE_COLORS[engineId]) return ENGINE_COLORS[engineId];
  const versioned = versionedColor(engineId);
  if (versioned) return versioned;
  const family = engineId.split('.')[0].toLowerCase();
  return ENGINE_COLORS[family] || '#8b949e';
}

export function getEngineLabel(engineId) {
  if (!state.data) return engineId;
  const eng = state.data.engines.find(e => e.id === engineId);
  return eng ? eng.label : engineId;
}

/** Try loading benchmark data: injected global → fetch JSON → fetch mock */
export async function loadData() {
  let raw = null;
  let format = null;

  // 1. Prefer pre-injected data (works with file:// and GitHub Pages)
  if (window.__BENCHMARK_DATA__) {
    raw = window.__BENCHMARK_DATA__;
    format = detectFormat(raw);
  }

  // 2. Fetch real JSON (works when served over HTTP)
  if (!raw) {
    try {
      const res = await fetch('data/benchmark-report.json');
      if (res.ok) {
        raw = await res.json();
        format = detectFormat(raw);
      }
    } catch (_) { /* ignore */ }
  }

  // 3. Fallback to mock data
  if (!raw) {
    try {
      const res = await fetch('data/mock-report-v2.json');
      if (res.ok) {
        raw = await res.json();
        format = detectFormat(raw);
      }
    } catch (_) { /* ignore */ }
  }

  if (!raw) throw new Error('No benchmark data found');

  state.rawData = raw;
  state.dataFormat = format;
  state.data = normalize(raw, format);
  state.engines = state.data.engines.map(e => e.id);
  state.activeEngines = [...state.engines];

  return state.data;
}

function detectFormat(json) {
  // v2 has loadingRuns array and metadata.engines
  if (json.loadingRuns && json.metadata && json.metadata.engines) return 'v2';
  // v1 has runs array
  if (json.runs) return 'v1';
  // default to v2 if loadingRuns exists
  if (json.loadingRuns) return 'v2';
  return 'v1';
}

/**
 * Normalize both formats to a common internal structure:
 * {
 *   metadata: { generatedAt, protocol, environment },
 *   engines: [{ id, family, version, label }],
 *   loadingRuns: [{ engine, dataset, file, triples, loadingTimeMs, ... }],
 *   queryRuns: [{ engine, dataset, queryId, queryCategory, status, medianMs, medianTtfrMs, ... }],
 *   timeSeries: { "engine::dataset": [...] },
 *   datasetQueries: { dataset: [{ id, category, label, sparql, expectedRowCount, expectedHash }] }
 * }
 */
function normalize(raw, format) {
  if (format === 'v2') return normalizeV2(raw);
  return normalizeV1(raw);
}

function normalizeV2(raw) {
  const meta = raw.metadata || {};
  const env = meta.environment || {};
  const protocol = meta.protocol || {};

  const engines = (meta.engines || []).map(e => ({
    id: e.id,
    family: e.family || e.id.split('.')[0],
    version: e.version || '',
    label: e.label || e.id,
  }));

  const loadingRuns = (raw.loadingRuns || []).map(r => ({
    engine: r.engine,
    dataset: r.dataset,
    file: r.file,
    triples: r.triples,
    loadingTimeMs: r.loadingTimeMs,
    repetitionsMs: r.repetitionsMs || [],
    throughputTriplesPerSec: r.throughputTriplesPerSec,
    memoryBeforeMb: r.memoryBeforeMb,
    memoryAfterMb: r.memoryAfterMb,
    memoryDeltaMb: r.memoryDeltaMb, // can be negative!
    cpuPercent: r.cpuPercent,
  }));

  // Build timeSeries map
  const timeSeries = {};
  (raw.loadingRuns || []).forEach(r => {
    if (r.timeSeries && r.timeSeries.length > 0) {
      timeSeries[`${r.engine}::${r.dataset}`] = r.timeSeries;
    }
  });

  const queryRuns = (raw.queryRuns || []).map(r => ({
    engine: r.engine,
    dataset: r.dataset,
    queryId: r.queryId,
    queryCategory: r.queryCategory || '',
    status: r.status,
    medianMs: r.medianMs,
    repetitionsMs: r.repetitionsMs || [],
    medianTtfrMs: r.medianTtfrMs,
    repetitionsTtfrMs: r.repetitionsTtfrMs || [],
    rowCount: r.rowCount,
    hash: r.hash || r.resultHash || '',
    errorMessage: r.errorMessage || null,
    heapDeltaMb: r.heapDeltaMb,
  }));

  const datasetQueries = meta.datasetQueries || {};

  return {
    metadata: {
      generatedAt: meta.generatedAt,
      git: meta.git || {},
      protocol,
      environment: env,
    },
    engines,
    loadingRuns,
    queryRuns,
    timeSeries,
    datasetQueries,
  };
}

function normalizeV1(raw) {
  const meta = raw.metadata || {};
  const protocol = meta.protocol || {};

  // Extract engines from runs
  const engineSet = new Set();
  (raw.runs || []).forEach(r => engineSet.add(r.engine));
  (raw.queryRuns || []).forEach(r => engineSet.add(r.engine));

  const engines = [...engineSet].map(id => ({
    id,
    family: id.split('.')[0],
    version: id.split('.').slice(1).join('.') || '',
    label: id,
  }));

  // v1 "runs" -> loadingRuns
  const loadingRuns = (raw.runs || []).map(r => ({
    engine: r.engine,
    dataset: r.dataset,
    file: r.file,
    triples: r.triples,
    loadingTimeMs: r.loadingTimeMs,
    repetitionsMs: r.repetitionsMs || [],
    throughputTriplesPerSec: r.throughputTriplesPerSec || (r.triples && r.loadingTimeMs ? r.triples / (r.loadingTimeMs / 1000) : null),
    memoryBeforeMb: r.memoryBeforeMb,
    memoryAfterMb: r.memoryAfterMb,
    memoryDeltaMb: r.memoryDeltaMb,
    cpuPercent: r.cpuPercent,
  }));

  const queryRuns = (raw.queryRuns || []).map(r => ({
    engine: r.engine,
    dataset: r.dataset,
    queryId: r.queryId,
    queryCategory: r.queryCategory || '',
    status: r.status || 'PASS', // v1 only records successful runs
    medianMs: r.medianMs,
    repetitionsMs: r.repetitionsMs || [],
    medianTtfrMs: r.medianTtfrMs != null ? r.medianTtfrMs : -1,
    repetitionsTtfrMs: r.repetitionsTtfrMs || [],
    rowCount: r.rowCount != null ? r.rowCount : null,
    hash: r.resultHash || r.hash || '',
    errorMessage: r.errorMessage || null,
    heapDeltaMb: r.heapDeltaMb,
  }));

  // Build environment from v1 metadata
  const environment = {
    cpuModel: meta.cpu || '',
    cpuCores: meta.cpuCores,
    cpuThreads: meta.cpuThreads,
    ramTotalGb: meta.ramGb,
    osDistribution: meta.os || '',
    osKernel: meta.osKernel || '',
    jvmVersion: meta.java || '',
    jvmFlags: meta.jvmFlags || (protocol.jvmArgs ? protocol.jvmArgs : []),
  };

  return {
    metadata: {
      generatedAt: meta.generatedAt,
      git: meta.git || {},
      protocol,
      environment,
    },
    engines,
    loadingRuns,
    queryRuns,
    timeSeries: {},
    datasetQueries: meta.datasetQueries || {},
  };
}

/** Get unique datasets present in the data */
export function getDatasets() {
  if (!state.data) return [];
  const sets = new Set();
  state.data.loadingRuns.forEach(r => sets.add(r.dataset));
  state.data.queryRuns.forEach(r => sets.add(r.dataset));
  return [...sets];
}

/** Filter queryRuns by dataset and optionally by engine */
export function getQueryRuns(dataset, engines) {
  if (!state.data) return [];
  const eng = engines || state.activeEngines;
  return state.data.queryRuns.filter(r =>
    r.dataset === dataset && eng.includes(r.engine)
  );
}

/** Filter loadingRuns by dataset and optionally by engine */
export function getLoadingRuns(dataset, engines) {
  if (!state.data) return [];
  const eng = engines || state.activeEngines;
  return state.data.loadingRuns.filter(r =>
    r.dataset === dataset && eng.includes(r.engine)
  );
}

/** Get query metadata for a dataset */
export function getQueryMeta(dataset, queryId) {
  if (!state.data || !state.data.datasetQueries[dataset]) return null;
  return state.data.datasetQueries[dataset].find(q => q.id === queryId) || null;
}
