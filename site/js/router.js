/**
 * Corese Benchmark Dashboard - URL Engine Serializer
 * Deep linking for selected engines comparison in URL query parameter (?engines=...)
 */

import { parseEngineId, formatEngineId } from './engine-id.js?v=29';

export function parseUrlEngines(searchStr, catalog = []) {
  const params = new URLSearchParams(searchStr || '');
  const rawEngines = (params.get('engines') || params.get('e') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawEngines.length === 0 || catalog.length === 0) {
    return null;
  }

  const validEngines = [];
  const seenKeys = new Set();

  rawEngines.forEach((str) => {
    const parsed = parseEngineId(str);
    const eng = catalog.find((e) => e.id.toLowerCase() === parsed.engineId.toLowerCase());
    if (!eng) return;

    let resolvedVersion = eng.versions.find(
      (v) => v.id.toLowerCase() === parsed.versionId.toLowerCase()
    );
    if (!resolvedVersion) {
      resolvedVersion = eng.versions.find((v) => v.isLatest) || eng.versions[0];
    }
    if (!resolvedVersion) return;

    let resolvedStorage = (eng.storages || []).find(
      (s) => s.id.toLowerCase() === parsed.storageId.toLowerCase()
    );
    if (!resolvedStorage) {
      resolvedStorage = (eng.storages || []).find((s) => s.isDefault) ||
        eng.storages?.[0] ||
        { id: 'in-memory' };
    }

    const key = formatEngineId({
      engineId: eng.id,
      versionId: resolvedVersion.id,
      storageId: resolvedStorage.id
    });

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      validEngines.push({
        engineId: eng.id,
        versionId: resolvedVersion.id,
        storageId: resolvedStorage.id
      });
    }
  });

  return validEngines.length > 0 ? validEngines : null;
}

export function updateUrlEngines(selectedEngines = [], push = false) {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  params.delete('e');

  if (selectedEngines.length > 0) {
    const serialized = selectedEngines.map((e) => formatEngineId(e)).join(',');
    params.set('engines', serialized);
  } else {
    params.delete('engines');
  }

  // Preserve readable commas instead of %2C, and preserve existing location.hash
  const query = params.toString().replace(/%2C/g, ',');
  const hash = window.location.hash || '';
  const newUrl = (query ? `${window.location.pathname}?${query}` : window.location.pathname) + hash;

  if (push) {
    window.history.pushState(null, '', newUrl);
  } else {
    window.history.replaceState(null, '', newUrl);
  }
}
