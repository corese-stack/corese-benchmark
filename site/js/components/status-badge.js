// status-badge.js — Render status badges (PASS, MISMATCH, TIMEOUT, ERROR)
'use strict';

const STATUS_STYLES = {
  PASS:     { bg: '#2ecc71', color: '#fff', label: 'PASS' },
  MISMATCH: { bg: '#e74c3c', color: '#fff', label: 'MISMATCH' },
  TIMEOUT:  { bg: '#f39c12', color: '#fff', label: 'TIMEOUT' },
  ERROR:    { bg: '#8e44ad', color: '#fff', label: 'ERROR' },
};

/**
 * Create a status badge element.
 * @param {string} status - PASS, MISMATCH, TIMEOUT, ERROR
 * @param {object} [opts] - Optional: { clickable, onClick }
 * @returns {HTMLSpanElement}
 */
export function createStatusBadge(status, opts = {}) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.ERROR;
  const span = document.createElement('span');
  span.className = 'status-badge';
  span.textContent = style.label;
  span.style.cssText = `
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    background: ${style.bg};
    color: ${style.color};
    cursor: ${opts.clickable ? 'pointer' : 'default'};
    user-select: none;
  `;

  if (opts.clickable && opts.onClick) {
    span.addEventListener('click', opts.onClick);
    span.title = 'Click to inspect';
  }

  return span;
}

/**
 * Return status badge as HTML string (for use in innerHTML-free contexts,
 * to be appended via DOM methods).
 */
export function statusBadgeHTML(status) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.ERROR;
  // Returns a span element — caller must use textContent or DOM methods
  return { label: style.label, bg: style.bg, color: style.color };
}

export default createStatusBadge;
