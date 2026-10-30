// app.js — Bootstrap & navigation for Corese Benchmark Dashboard v2
'use strict';

import state from './state.js';
import { loadData, getEngineColor } from './data-loader.js';
import { downloadMarkdownReport } from './export-md.js';
import { downloadPdfReport } from './export-pdf.js';
import { renderOverview } from './pages/overview.js';
import { renderBowlogna } from './pages/bowlogna.js';
import { renderBsbm } from './pages/bsbm.js';
import { renderLubm } from './pages/lubm.js';
import { renderDbpedia } from './pages/dbpedia.js';
import { renderW3c } from './pages/w3c.js';
import { renderTransparency } from './pages/transparency.js';

const TABS = [
  { id: 'overview',     label: 'Global Overview',         render: renderOverview },
  { id: 'bowlogna',    label: 'Bowlogna',                render: renderBowlogna },
  { id: 'bsbm',        label: 'BSBM',                    render: renderBsbm },
  { id: 'lubm',        label: 'LUBM',                    render: renderLubm },
  { id: 'dbpedia',     label: 'DBpedia',                 render: renderDbpedia },
  { id: 'w3c',         label: 'W3C Conformance',         render: renderW3c },
  { id: 'transparency', label: 'Environment & Protocol', render: renderTransparency },
];

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const mainContent = document.getElementById('main-content');
  const tabBar = document.getElementById('tab-bar');
  const stickyPill = document.getElementById('sticky-pill');
  const errorState = document.getElementById('error-state');

  try {
    await loadData();

    // Build sticky header pill
    buildStickyPill(stickyPill);

    // Wire export buttons
    const exportBtn = document.getElementById('export-md-btn');
    if (exportBtn) {
      exportBtn.style.display = '';
      exportBtn.addEventListener('click', downloadMarkdownReport);
    }
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) {
      exportPdfBtn.style.display = '';
      exportPdfBtn.addEventListener('click', downloadPdfReport);
    }

    // Build engine filter bar
    const engineBar = document.getElementById('engine-bar');
    buildEngineBar(engineBar, mainContent, tabBar);

    // Build tab bar
    buildTabBar(tabBar);

    // Render initial tab
    const hash = window.location.hash.replace('#', '');
    const initialTab = TABS.find(t => t.id === hash) ? hash : 'overview';
    switchTab(initialTab, mainContent, tabBar);

  } catch (err) {
    console.error('Failed to load data:', err);
    if (mainContent) mainContent.style.display = 'none';
    if (errorState) {
      errorState.style.display = 'block';
      const errMsg = errorState.querySelector('.error-message');
      if (errMsg) errMsg.textContent = err.message;
    }
  }

  // Export JSON button
  const exportJsonBtn = document.getElementById('export-json-btn');
  if (exportJsonBtn && state.rawData) {
    exportJsonBtn.style.display = '';
    exportJsonBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state.rawData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `corese-benchmark-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
});

function buildTabBar(tabBar) {
  if (!tabBar) return;
  tabBar.innerHTML = '';

  TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    btn.addEventListener('click', () => {
      const mainContent = document.getElementById('main-content');
      switchTab(tab.id, mainContent, tabBar);
    });
    tabBar.appendChild(btn);
  });
}

function switchTab(tabId, mainContent, tabBar) {
  state.activeTab = tabId;

  // Update URL hash
  window.location.hash = tabId;

  // Update tab buttons
  if (tabBar) {
    tabBar.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
  }

  // Destroy all existing charts
  Object.keys(state.charts).forEach(key => {
    if (state.charts[key]) {
      state.charts[key].destroy();
      delete state.charts[key];
    }
  });

  // Render page
  const tab = TABS.find(t => t.id === tabId);
  if (tab && mainContent) {
    tab.render(mainContent);
  }
}

function buildStickyPill(pillEl) {
  if (!pillEl || !state.data) return;

  const env = state.data.metadata.environment || {};
  const protocol = state.data.metadata.protocol || {};

  const parts = [];

  // Location — derive from context
  parts.push('\ud83d\udccd Inria SED Sophia');

  // CPU
  if (env.cpuCores && env.cpuThreads) {
    parts.push(`${env.cpuCores}c/${env.cpuThreads}t CPU`);
  }

  // RAM
  if (env.ramTotalGb) {
    parts.push(`${env.ramTotalGb} GB RAM`);
  }

  // OS
  if (env.osKernel) {
    const kernelShort = env.osKernel.replace(/-generic$/, '').replace(/^Linux /, '');
    parts.push(`Linux ${kernelShort}`);
  } else if (env.osDistribution) {
    parts.push(env.osDistribution);
  }

  // JVM
  if (env.jvmVersion) {
    const jdkVersion = env.jvmVersion.match(/^(\d+)/);
    const flags = env.jvmFlags ? env.jvmFlags.filter(f => f.startsWith('-X')).join(' ') : '';
    parts.push(`OpenJDK ${jdkVersion ? jdkVersion[1] : '?'}${flags ? ` (${flags})` : ''}`);
  }

  // Protocol
  if (protocol.warmup != null && protocol.repetitions) {
    parts.push(`Protocol: Warmup + ${protocol.repetitions} Reps (Median)`);
  }

  pillEl.textContent = parts.join(' \u00b7 ');

  // Click -> navigate to transparency tab
  pillEl.style.cursor = 'pointer';
  pillEl.addEventListener('click', () => {
    const mainContent = document.getElementById('main-content');
    const tabBar = document.getElementById('tab-bar');
    switchTab('transparency', mainContent, tabBar);
  });
}

function buildEngineBar(engineBar, mainContent, tabBar) {
  if (!engineBar || !state.data) return;
  engineBar.innerHTML = '';

  let dragSrc = null;

  state.engines.forEach(engineId => {
    const eng = state.data.engines.find(e => e.id === engineId);
    const label = eng ? eng.label : engineId;
    const color = getEngineColor(engineId);

    const btn = document.createElement('button');
    btn.dataset.engine = engineId;
    btn.style.setProperty('--engine-color', color);
    btn.draggable = true;

    function updateBtn() {
      const isActive = state.activeEngines.includes(engineId);
      btn.className = 'engine-btn' + (isActive ? ' active' : '');
      btn.innerHTML = isActive
        ? `${label} <span class="engine-btn-icon">\u00d7</span>`
        : `<span class="engine-btn-icon">+</span> ${label}`;
      btn.title = isActive ? `Hide ${label}` : `Show ${label}`;
    }

    updateBtn();

    btn.addEventListener('click', () => {
      const isActive = state.activeEngines.includes(engineId);
      if (isActive && state.activeEngines.length === 1) return;

      state.activeEngines = isActive
        ? state.activeEngines.filter(e => e !== engineId)
        : [...state.activeEngines, engineId];

      updateBtn();

      const tab = TABS.find(t => t.id === state.activeTab);
      if (tab && mainContent) tab.render(mainContent);
    });

    // ── Drag & drop reorder ──────────────────────────────────────────────────
    btn.addEventListener('dragstart', (e) => {
      dragSrc = btn;
      e.dataTransfer.effectAllowed = 'move';
      btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      engineBar.querySelectorAll('.engine-btn').forEach(b => b.classList.remove('drag-over'));
    });
    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (btn !== dragSrc) btn.classList.add('drag-over');
    });
    btn.addEventListener('dragleave', () => {
      btn.classList.remove('drag-over');
    });
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      if (!dragSrc || dragSrc === btn) return;

      // Reorder in DOM
      const btns = [...engineBar.querySelectorAll('.engine-btn')];
      const srcIdx = btns.indexOf(dragSrc);
      const tgtIdx = btns.indexOf(btn);
      if (srcIdx < tgtIdx) engineBar.insertBefore(dragSrc, btn.nextSibling);
      else engineBar.insertBefore(dragSrc, btn);

      // Sync state.engines and state.activeEngines to new DOM order
      const newOrder = [...engineBar.querySelectorAll('.engine-btn')].map(b => b.dataset.engine);
      state.engines = newOrder;
      state.activeEngines = newOrder.filter(e => state.activeEngines.includes(e));

      // Re-render current tab
      const tab = TABS.find(t => t.id === state.activeTab);
      if (tab && mainContent) tab.render(mainContent);
    });

    engineBar.appendChild(btn);
  });
}

// Handle hash changes
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  const tab = TABS.find(t => t.id === hash);
  if (tab && tab.id !== state.activeTab) {
    const mainContent = document.getElementById('main-content');
    const tabBar = document.getElementById('tab-bar');
    switchTab(tab.id, mainContent, tabBar);
  }
});
