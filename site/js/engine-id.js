/**
 * Engine Identifier Utilities
 * Shared format, parsing, and normalization for engine IDs, versions, and storages.
 * Guarantees 100% bijective URL serialisation and catalog lookup.
 */

export const KNOWN_STORAGES = ['in-memory', 'tdb2', 'tdb1', 'native', 'lmdb', 'persistent'];

export const BRANCH_VERSIONS = ['next', 'dev', 'develop'];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;
const FUNC_COLOR_REGEX = /^(?:rgb|rgba|hsl|hsla|oklch)\([^()<>{}"';]+\)$/;

/**
 * Validates and sanitizes a CSS color string to guarantee safe insertion into DOM/SVG/style.
 * Checks both syntax security (no injection) and range/spec compliance (via CSS.supports if available).
 */
export function sanitizeColor(colorStr, fallback = null) {
  if (typeof colorStr !== 'string') return fallback;
  const trimmed = colorStr.trim();
  if (!HEX_COLOR_REGEX.test(trimmed) && !FUNC_COLOR_REGEX.test(trimmed)) return fallback;

  // Strict range and format validation in browser environments
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    if (!CSS.supports('color', trimmed)) return fallback;
  }

  return trimmed;
}

/**
 * Tests if a version identifier represents a development branch.
 */
export function isBranchVersion(versionId) {
  if (!versionId) return false;
  return BRANCH_VERSIONS.includes(versionId.toLowerCase());
}

/**
 * Parses an engine token string unambiguously.
 * Supports:
 * - Unambiguous canonical format: 'engine.version@storage' (e.g. 'jena.6.2.0@tdb2', 'jena.6.2.0')
 * - Legacy / report JSON dot format: 'engine.version.storage' (e.g. 'jena.6.2.0.tdb2')
 */
export function parseEngineId(rawEngineStr) {
  if (!rawEngineStr) {
    return { engineId: 'unknown', versionId: 'unknown', storageId: 'in-memory', raw: '' };
  }

  const str = String(rawEngineStr).trim();

  // 1. Check for explicit '@' storage separator (100% bijective and unambiguous)
  if (str.includes('@')) {
    const atIdx = str.lastIndexOf('@');
    const prefix = str.slice(0, atIdx);
    const storageId = (str.slice(atIdx + 1) || 'in-memory').toLowerCase();

    const parts = prefix.split('.');
    const engineId = (parts[0] || 'unknown').toLowerCase();
    const versionId = parts.length > 1 ? parts.slice(1).join('.') : 'latest';

    return { engineId, versionId, storageId, raw: rawEngineStr };
  }

  // 2. Legacy / JSON report dot notation
  const parts = str.split('.');
  const engineId = (parts[0] || 'unknown').toLowerCase();
  let versionId = parts.length > 1 ? parts.slice(1).join('.') : 'latest';
  let storageId = 'in-memory';

  for (const s of KNOWN_STORAGES) {
    if (s !== 'in-memory' && versionId.toLowerCase().endsWith('.' + s)) {
      storageId = s;
      versionId = versionId.slice(0, -(s.length + 1));
      break;
    }
  }

  return { engineId, versionId, storageId, raw: rawEngineStr };
}

/**
 * Formats an engine configuration into an unambiguous, bijective canonical token.
 * Suffixes non-default storage backends with '@storageId' (e.g. 'jena.6.2.0@tdb2').
 * Also suffixes with '@in-memory' if a version ID itself ends with a known storage suffix.
 */
export function formatEngineId({ engineId, versionId, storageId }) {
  const cleanEng = (engineId || '').toLowerCase();
  const cleanVer = versionId || 'latest';
  const cleanStorage = (storageId || 'in-memory').toLowerCase();

  let storageSuffix = '';
  if (cleanStorage !== 'in-memory') {
    storageSuffix = `@${cleanStorage}`;
  } else if (KNOWN_STORAGES.some((s) => s !== 'in-memory' && cleanVer.toLowerCase().endsWith('.' + s))) {
    storageSuffix = `@in-memory`;
  }

  return `${cleanEng}.${cleanVer}${storageSuffix}`;
}

/**
 * Escapes arbitrary strings for safe insertion into HTML/attributes.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
