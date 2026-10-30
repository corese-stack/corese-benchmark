// formatters.js — Number, duration, throughput, memory formatting
'use strict';

/** Format a number with locale (fr-FR) and fixed decimal digits */
export function fmt(n, decimals = 0) {
  if (n == null || n === '') return '\u2014'; // em-dash
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: decimals });
}

/** Format milliseconds to human-readable string */
export function fmtMs(ms) {
  if (ms == null || ms === -1) return '\u2014';
  if (ms >= 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${fmt(ms)} ms`;
}

/** Format throughput (triples/sec) */
export function fmtThroughput(t) {
  if (t == null) return '\u2014';
  if (t >= 1000000) return `${(t / 1000000).toFixed(2)}M t/s`;
  if (t >= 1000) return `${(t / 1000).toFixed(1)}K t/s`;
  return `${fmt(t)} t/s`;
}

/** Format memory in MB — NEVER clamp to 0 (GC can produce negative) */
export function fmtMemory(mb) {
  if (mb == null) return '\u2014';
  return `${Number(mb).toFixed(1)} MB`;
}

/** Format percentage */
export function fmtPercent(p, decimals = 1) {
  if (p == null) return '\u2014';
  return `${Number(p).toFixed(decimals)}%`;
}

/** Coefficient of variation from array of values */
export function computeCV(values) {
  if (!values || values.length < 2) return null;
  const nums = values.filter(v => v != null && v >= 0);
  if (nums.length < 2) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (mean === 0) return 0;
  const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nums.length;
  return (Math.sqrt(variance) / mean) * 100;
}

/** Escape HTML for safe textContent-equivalent in template strings */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
