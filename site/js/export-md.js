// export-md.js — Generate and download a Markdown benchmark report
'use strict';

import state from './state.js';
import { getEngineLabel } from './data-loader.js';
import { fmtMs, fmtThroughput, fmtMemory } from './formatters.js';

export function downloadMarkdownReport() {
  if (!state.data) return;

  const md = buildMarkdown();
  const blob = new Blob([md], { type: 'text/markdown; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `corese-benchmark-report-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildMarkdown() {
  const data = state.data;
  const meta = data.metadata;
  const env = meta.environment || {};
  const protocol = meta.protocol || {};
  const engines = state.activeEngines;
  const lines = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push('# Corese Benchmark Report');
  lines.push('');
  lines.push(`> Generated: ${meta.generatedAt || new Date().toISOString()}`);
  if (meta.git && meta.git.benchmarkCommit) {
    lines.push(`> Commit: \`${meta.git.benchmarkCommit}\` (${meta.git.branch || 'main'})`);
  }
  lines.push('');

  // ── Environment ───────────────────────────────────────────────────────────
  lines.push('## Environment');
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  if (env.cpuModel)       lines.push(`| CPU | ${env.cpuModel} |`);
  if (env.cpuCores)       lines.push(`| Cores / Threads | ${env.cpuCores}c / ${env.cpuThreads}t |`);
  if (env.ramTotalGb)     lines.push(`| RAM | ${env.ramTotalGb} GB |`);
  if (env.osDistribution) lines.push(`| OS | ${env.osDistribution} |`);
  if (env.osKernel)       lines.push(`| Kernel | ${env.osKernel} |`);
  if (env.jvmVersion)     lines.push(`| JVM | ${env.jvmVersion} |`);
  if (env.jvmFlags && Array.isArray(env.jvmFlags)) lines.push(`| JVM Flags | \`${env.jvmFlags.join(' ')}\` |`);
  lines.push('');

  // ── Protocol ──────────────────────────────────────────────────────────────
  lines.push('## Protocol');
  lines.push('');
  lines.push(`- Warmup: ${protocol.warmup ?? 1} run`);
  lines.push(`- Repetitions: ${protocol.repetitions ?? 3}`);
  lines.push(`- Metric: ${protocol.metric || 'median'}`);
  lines.push(`- Query timeout: ${(protocol.queryTimeoutMs || 60000) / 1000}s`);
  lines.push(`- Load timeout: ${(protocol.loadTimeoutMs || 120000) / 1000}s`);
  lines.push('');

  // ── Engines ───────────────────────────────────────────────────────────────
  lines.push('## Engines');
  lines.push('');
  lines.push('| ID | Label | Version |');
  lines.push('|----|-------|---------|');
  (data.engines || []).filter(e => engines.includes(e.id)).forEach(e => {
    lines.push(`| \`${e.id}\` | ${e.label} | ${e.version || '—'} |`);
  });
  lines.push('');

  // ── Loading & Ingestion ───────────────────────────────────────────────────
  const datasets = [...new Set(data.loadingRuns.map(r => r.dataset))];

  lines.push('## Loading & Ingestion');
  lines.push('');

  datasets.forEach(ds => {
    lines.push(`### ${ds}`);
    lines.push('');
    lines.push('| Engine | File | Triples | Median Time | Throughput | Heap Δ |');
    lines.push('|--------|------|---------|-------------|------------|--------|');
    data.loadingRuns
      .filter(r => r.dataset === ds && engines.includes(r.engine))
      .forEach(r => {
        lines.push(`| ${getEngineLabel(r.engine)} | ${r.file || '—'} | ${(r.triples || 0).toLocaleString()} | ${fmtMs(r.loadingTimeMs)} | ${fmtThroughput(r.throughputTriplesPerSec)} | ${fmtMemory(r.memoryDeltaMb)} |`);
      });
    lines.push('');
  });

  // ── Query Results per dataset ─────────────────────────────────────────────
  const queryDatasets = [...new Set(data.queryRuns.map(r => r.dataset))];

  lines.push('## Query Results');
  lines.push('');

  queryDatasets.forEach(ds => {
    lines.push(`### ${ds}`);
    lines.push('');

    const queryIds = [...new Set(
      data.queryRuns.filter(r => r.dataset === ds).map(r => r.queryId)
    )].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''));
      const nb = parseInt(b.replace(/\D/g, ''));
      return na - nb;
    });

    // Header: Query | Engine1 | Engine2 | ...
    const engLabels = engines.map(e => getEngineLabel(e));
    lines.push(`| Query | ${engLabels.join(' | ')} |`);
    lines.push(`|-------|${engines.map(() => '----').join('|')}|`);

    queryIds.forEach(qid => {
      const cells = engines.map(eng => {
        const run = data.queryRuns.find(r => r.dataset === ds && r.engine === eng && r.queryId === qid);
        if (!run) return '—';
        if (run.status === 'TIMEOUT') return `\`> ${(protocol.queryTimeoutMs || 60000) / 1000}s (TIMEOUT)\``;
        if (run.status !== 'PASS') return `\`${run.status}\``;
        return fmtMs(run.medianMs);
      });
      lines.push(`| ${qid.replace('query_', 'Q')} | ${cells.join(' | ')} |`);
    });
    lines.push('');

    // TTFR sub-table
    lines.push(`**TTFR (Time To First Result) — ${ds}**`);
    lines.push('');
    lines.push(`| Query | ${engLabels.join(' | ')} |`);
    lines.push(`|-------|${engines.map(() => '----').join('|')}|`);

    queryIds.forEach(qid => {
      const cells = engines.map(eng => {
        const run = data.queryRuns.find(r => r.dataset === ds && r.engine === eng && r.queryId === qid);
        if (!run || run.status !== 'PASS') return '—';
        if (run.medianTtfrMs === -1) return '—';
        return fmtMs(run.medianTtfrMs);
      });
      lines.push(`| ${qid.replace('query_', 'Q')} | ${cells.join(' | ')} |`);
    });
    lines.push('');
  });

  // ── Failed Queries Summary ────────────────────────────────────────────────
  const failed = data.queryRuns.filter(r => engines.includes(r.engine) && r.status !== 'PASS');
  if (failed.length > 0) {
    lines.push('## Failures & Timeouts');
    lines.push('');
    lines.push('| Engine | Dataset | Query | Status | Message |');
    lines.push('|--------|---------|-------|--------|---------|');
    failed.forEach(r => {
      const msg = (r.errorMessage || '').replace(/\|/g, '\\|');
      lines.push(`| ${getEngineLabel(r.engine)} | ${r.dataset} | ${r.queryId.replace('query_', 'Q')} | **${r.status}** | ${msg || '—'} |`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated by [Corese Benchmark Dashboard](https://github.com/corese-stack/corese-benchmark)*');

  return lines.join('\n');
}
