// build-bundle.js — Concatenate ES6 modules into a single non-module script
// Usage: node build-bundle.js
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'js');

// Files in dependency order
const FILES = [
  'state.js',
  'formatters.js',
  'data-loader.js',
  'components/status-badge.js',
  'components/result-dialog.js',
  'components/result-table.js',
  'charts/loading-chart.js',
  'charts/throughput-chart.js',
  'charts/query-breakdown.js',
  'chart-expand.js',
  'pages/overview.js',
  'pages/bowlogna.js',
  'pages/bsbm.js',
  'pages/lubm.js',
  'pages/dbpedia.js',
  'pages/w3c.js',
  'pages/transparency.js',
  'export-md.js',
  'export-pdf.js',
  'app.js',
];

// Files whose top-level consts should be block-scoped to avoid collisions
// (these files are wrapped in { } blocks; function declarations hoist in sloppy mode)
const BLOCK_WRAP = new Set([
  'pages/bowlogna.js', 'pages/bsbm.js', 'pages/lubm.js', 'pages/dbpedia.js',
  'charts/query-breakdown.js',
]);

let bundle = '// bundle.js — Auto-generated. Do not edit directly.\n// Run: node build-bundle.js\n(function () {\n// sloppy mode intentional: block-level function declarations hoist to this scope\n\n';

for (const file of FILES) {
  let src = fs.readFileSync(path.join(BASE, file), 'utf8');

  const cleaned = src
    .split('\n')
    .filter(line => !line.match(/^'use strict';?$/))
    .filter(line => !line.match(/^import .+from .+;$/))
    .filter(line => !line.match(/^export default \w+;$/))
    .map(line => line.replace(/^export (async function|function|const|let|class) /, '$1 '))
    .join('\n');

  if (BLOCK_WRAP.has(file)) {
    bundle += `// ── ${file} ──\n{\n${cleaned}\n}\n\n`;
  } else {
    bundle += `// ── ${file} ──\n${cleaned}\n\n`;
  }
}

bundle += '})();\n';

const out = path.join(__dirname, 'js', 'bundle.js');
fs.writeFileSync(out, bundle, 'utf8');
console.log(`Written ${out} (${(bundle.length / 1024).toFixed(1)} KB)`);
