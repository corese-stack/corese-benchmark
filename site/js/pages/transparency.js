// transparency.js — Machine & Transparency page (6 info cards)
'use strict';

import state from '../state.js';

/**
 * Render the Machine & Transparency page.
 * @param {HTMLElement} container
 */
export function renderTransparency(container) {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = 'Machine & Transparency';
  container.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'page-desc';
  desc.textContent = 'Complete identity card of the benchmark execution environment.';
  container.appendChild(desc);

  const env = (state.data && state.data.metadata.environment) || {};
  const protocol = (state.data && state.data.metadata.protocol) || {};
  const git = (state.data && state.data.metadata.git) || {};

  const grid = document.createElement('div');
  grid.className = 'transparency-grid';

  // 1. CPU
  grid.appendChild(createInfoCard('CPU', '\u2699\ufe0f', [
    { label: 'Model', value: env.cpuModel || '\u2014' },
    { label: 'Architecture', value: env.cpuArchitecture || '\u2014' },
    { label: 'Sockets', value: env.cpuSockets || '\u2014' },
    { label: 'Cores', value: env.cpuCores || '\u2014' },
    { label: 'Threads', value: env.cpuThreads || '\u2014' },
    { label: 'Frequency', value: env.cpuFrequencyMhz ? `${env.cpuFrequencyMhz} MHz` : '\u2014' },
    { label: 'Governor', value: env.cpuGovernor || '\u2014' },
  ]));

  // 2. Memory & Disk
  grid.appendChild(createInfoCard('Memory & Disk', '\ud83d\udcbe', [
    { label: 'RAM Total', value: env.ramTotalGb ? `${env.ramTotalGb} GB` : '\u2014' },
    { label: 'Swap', value: env.swapTotalGb ? `${env.swapTotalGb} GB` : '\u2014' },
    { label: 'Swappiness', value: env.swappiness != null ? String(env.swappiness) : '\u2014' },
  ]));

  // 3. OS & Kernel
  grid.appendChild(createInfoCard('OS & Kernel', '\ud83d\udda5\ufe0f', [
    { label: 'Distribution', value: env.osDistribution || '\u2014' },
    { label: 'Kernel', value: env.osKernel || '\u2014' },
  ]));

  // 4. JVM
  grid.appendChild(createInfoCard('JVM', '\u2615', [
    { label: 'Vendor', value: env.jvmVendor || '\u2014' },
    { label: 'Version', value: env.jvmVersion || '\u2014' },
    { label: 'Flags', value: env.jvmFlags ? env.jvmFlags.join(' ') : '\u2014' },
  ]));

  // 5. Protocol
  grid.appendChild(createInfoCard('Measurement Protocol', '\ud83d\udccf', [
    { label: 'Warmup Runs', value: protocol.warmup != null ? String(protocol.warmup) : '\u2014' },
    { label: 'Repetitions', value: protocol.repetitions != null ? String(protocol.repetitions) : '\u2014' },
    { label: 'Query Repetitions', value: protocol.queryRepetitions != null ? String(protocol.queryRepetitions) : '\u2014' },
    { label: 'Query Timeout', value: protocol.queryTimeoutMs ? `${protocol.queryTimeoutMs / 1000}s` : '\u2014' },
    { label: 'Load Timeout', value: protocol.loadTimeoutMs ? `${protocol.loadTimeoutMs / 1000}s` : '\u2014' },
    { label: 'Metric', value: protocol.metric || 'median' },
  ]));

  // 7. Engines
  const engines = (state.data && state.data.engines) || [];
  const engineItems = engines.map(e => ({
    label: e.label || e.id,
    value: e.version ? `v${e.version}` : '\u2014',
  }));
  if (engineItems.length > 0) {
    grid.appendChild(createInfoCard('Engines', '\u26a1', engineItems));
  }

  container.appendChild(grid);
}

function createInfoCard(title, icon, items) {
  const card = document.createElement('div');
  card.className = 'info-card';

  const header = document.createElement('div');
  header.className = 'info-card-header';

  const iconEl = document.createElement('span');
  iconEl.className = 'info-card-icon';
  iconEl.textContent = icon;
  header.appendChild(iconEl);

  const titleEl = document.createElement('h3');
  titleEl.className = 'info-card-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  card.appendChild(header);

  const list = document.createElement('dl');
  list.className = 'info-card-list';

  items.forEach(item => {
    const dt = document.createElement('dt');
    dt.textContent = item.label;
    list.appendChild(dt);

    const dd = document.createElement('dd');
    dd.className = 'font-mono';
    dd.textContent = item.value;
    list.appendChild(dd);
  });

  card.appendChild(list);
  return card;
}

export default renderTransparency;
