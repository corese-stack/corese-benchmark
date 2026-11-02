// w3c.js — W3C Conformance page (static data from corese-w3c portal)
'use strict';

const SUMMARY = { total: 2915, passed: 2897, failed: 3, inapplicable: 13, untested: 0, cantTell: 2 };

const SUITES = [
  { name: 'JSON-LD 1.1 (fromRdf)',       spec: 'https://www.w3.org/TR/json-ld11-api/#dom-jsonldprocessor-fromrdf', total:  54, passed:  51, failed: 2, inapplicable:  1, cantTell: 0 },
  { name: 'JSON-LD 1.1 (toRdf)',         spec: 'https://www.w3.org/TR/json-ld11-api/#dom-jsonldprocessor-tordf',  total: 467, passed: 454, failed: 1, inapplicable: 12, cantTell: 0 },
  { name: 'N-Quads (RDF 1.1)',           spec: 'https://www.w3.org/TR/n-quads/',                                  total:  87, passed:  87, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'N-Triples (RDF 1.1)',         spec: 'https://www.w3.org/TR/n-triples/',                                total:  70, passed:  70, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDFC-1.0 (Canonicalization)', spec: 'https://www.w3.org/TR/rdf-canon/',                                total:  86, passed:  86, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDF/XML (RDF 1.1)',           spec: 'https://www.w3.org/TR/rdf-syntax-grammar/',                       total: 166, passed: 166, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDFa 1.1 (SVG)',             spec: 'https://www.w3.org/TR/SVG11/',                                    total:  31, passed:  31, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDFa 1.1 (XHTML)',           spec: 'https://www.w3.org/TR/rdfa-core/',                                total: 181, passed: 181, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'RDFa 1.1 (XML)',             spec: 'https://www.w3.org/TR/rdfa-core/',                                total: 126, passed: 126, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'SPARQL 1.0',                 spec: 'https://www.w3.org/TR/rdf-sparql-query/',                         total: 482, passed: 482, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'SPARQL 1.1',                 spec: 'https://www.w3.org/TR/sparql11-query/',                           total: 495, passed: 493, failed: 0, inapplicable:  0, cantTell: 2 },
  { name: 'TriG (RDF 1.1)',             spec: 'https://www.w3.org/TR/trig/',                                     total: 357, passed: 357, failed: 0, inapplicable:  0, cantTell: 0 },
  { name: 'Turtle (RDF 1.1)',           spec: 'https://www.w3.org/TR/turtle/',                                   total: 313, passed: 313, failed: 0, inapplicable:  0, cantTell: 0 },
];

const FAILED_TESTS = [
  {
    suite: 'JSON-LD 1.1 (fromRdf)',
    test: 'use native types flag with values that cannot be serialized to JSON',
    description: 'useNativeTypes flag being true is disregarded for a value that cannot be serialized into a native JSON value.',
    error: 'Character I is neither a decimal digit nor \u201c.\u201d',
  },
  {
    suite: 'JSON-LD 1.1 (fromRdf)',
    test: 'use native types flag with non-native values',
    description: 'Ensure that useNativeTypes flag being true does not interfere with values that cannot be serialized to a native value.',
    error: 'For input string: \u201cAAA\u201d',
  },
  {
    suite: 'JSON-LD 1.1 (toRdf)',
    test: 'List with bad @base.',
    description: 'Tests list elements expanded to IRIs with a bad @base.',
    error: 'JsonLdError[code=An invalid base IRI has been detected]',
  },
];

const CANNOT_TELL_TESTS = [
  {
    suite: 'SPARQL 1.1',
    test: 'agg-empty-group',
    description: 'Aggregate on empty group returns correct result.',
    error: 'Result differs \u2014 ambiguous specification',
  },
  {
    suite: 'SPARQL 1.1',
    test: 'agg-empty-group-count',
    description: 'COUNT on empty group.',
    error: 'Result differs \u2014 ambiguous specification',
  },
];

export function renderW3c(container) {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'page-title';
  heading.textContent = 'W3C Conformance';
  container.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'page-desc';
  desc.textContent = 'Official W3C certification for Corese v5 \u2014 13 test suites, source: corese-w3c.';
  container.appendChild(desc);

  // ── KPI cards ──────────────────────────────────────────────────────────────
  const kpiGrid = document.createElement('div');
  kpiGrid.className = 'w3c-kpi-grid';

  const KPIS = [
    { label: 'TOTAL TESTS',   value: SUMMARY.total.toLocaleString(),   sub: '13 standard suites', color: 'var(--text-main)' },
    { label: 'PASSED',        value: SUMMARY.passed.toLocaleString(),  sub: (SUMMARY.passed/SUMMARY.total*100).toFixed(1)+'% of all entries', color: 'var(--status-pass)' },
    { label: 'FAILURES',      value: SUMMARY.failed.toString(),        sub: 'Failed tests', color: SUMMARY.failed > 0 ? 'var(--status-mismatch)' : 'var(--status-pass)' },
    { label: 'UNTESTED',      value: SUMMARY.untested.toString(),             sub: '', color: 'var(--text-muted)' },
    { label: 'INAPPLICABLE',  value: SUMMARY.inapplicable.toString(),         sub: 'See rationale', color: 'var(--status-timeout)' },
    { label: 'CANNOT TELL',   value: SUMMARY.cantTell.toString(),             sub: 'See rationale', color: '#8e44ad' },
  ];

  KPIS.forEach(kpi => {
    const card = document.createElement('div');
    card.className = 'w3c-kpi-card';

    const lbl = document.createElement('div');
    lbl.className = 'w3c-kpi-label';
    lbl.textContent = kpi.label;
    card.appendChild(lbl);

    const val = document.createElement('div');
    val.className = 'w3c-kpi-value';
    val.textContent = kpi.value;
    val.style.color = kpi.color;
    card.appendChild(val);

    if (kpi.sub) {
      const sub = document.createElement('div');
      sub.className = 'w3c-kpi-sub';
      sub.textContent = kpi.sub;
      card.appendChild(sub);
    }

    kpiGrid.appendChild(card);
  });

  container.appendChild(kpiGrid);

  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'w3c-progress';
  const progressFill = document.createElement('div');
  progressFill.className = 'w3c-progress-fill';
  progressFill.style.width = (SUMMARY.passed / SUMMARY.total * 100).toFixed(2) + '%';
  progressBar.appendChild(progressFill);
  container.appendChild(progressBar);

  // Link button
  const linkBtn = document.createElement('a');
  linkBtn.className = 'w3c-link-btn';
  linkBtn.href = 'https://corese-stack.github.io/corese-w3c/';
  linkBtn.target = '_blank';
  linkBtn.rel = 'noopener noreferrer';
  linkBtn.textContent = 'View the official W3C conformance portal (corese-w3c) \u2197';
  container.appendChild(linkBtn);

  // ── Suite table ────────────────────────────────────────────────────────────
  const tableTitle = document.createElement('h3');
  tableTitle.className = 'page-subtitle';
  tableTitle.textContent = 'Detail by test suite';
  container.appendChild(tableTitle);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-surface';
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  ['Suite', 'Specification', 'Total', 'Passed', 'Failures', 'Inapplicable', 'Cannot Tell', 'Rate'].forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i > 1) th.className = 'text-right';
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  SUITES.forEach(row => {
    const rate = (row.passed / row.total * 100).toFixed(2) + '%';
    const tr = document.createElement('tr');

    // Suite name cell
    const tdName = document.createElement('td');
    tdName.textContent = row.name;
    tr.appendChild(tdName);

    // Specification link cell
    const tdSpec = document.createElement('td');
    const a = document.createElement('a');
    a.href = row.spec;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = row.spec.replace('https://www.w3.org/TR/', '').replace(/\/$/, '');
    a.className = 'w3c-spec-link';
    tdSpec.appendChild(a);
    tr.appendChild(tdSpec);

    // Numeric cells: Total, Passed, Failed, Inapplicable, Cannot Tell, Rate
    const nums = [row.total, row.passed, row.failed, row.inapplicable, row.cantTell, rate];
    nums.forEach((val, i) => {
      const td = document.createElement('td');
      td.textContent = val;
      td.className = 'text-right font-mono';
      if (i === 2 && val > 0) { td.style.color = 'var(--status-mismatch)'; td.style.fontWeight = '600'; }
      if (i === 2 && val === 0) td.style.color = 'var(--status-pass)';
      if (i === 3 && val > 0) td.style.color = 'var(--status-timeout)';
      if (i === 4 && val > 0) td.style.color = '#8e44ad';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // Total row
  const trTotal = document.createElement('tr');
  trTotal.style.fontWeight = '700';
  trTotal.style.borderTop = '2px solid var(--border-color)';
  const grandRate = (SUMMARY.passed / SUMMARY.total * 100).toFixed(2) + '%';
  [
    'Total', '', SUMMARY.total, SUMMARY.passed,
    SUMMARY.failed, SUMMARY.inapplicable, SUMMARY.cantTell, grandRate
  ].forEach((val, i) => {
    const td = document.createElement('td');
    td.textContent = val;
    if (i > 1) td.className = 'text-right font-mono';
    trTotal.appendChild(td);
  });
  tbody.appendChild(trTotal);

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrapper.appendChild(scroll);
  container.appendChild(wrapper);

  // ── Failure / Cannot-Tell detail tables ───────────────────────────────────
  buildDetailTable(container, 'Failed (3)', FAILED_TESTS, 'failed');
  buildDetailTable(container, 'Cannot Tell (2)', CANNOT_TELL_TESTS, 'cannot-tell');
}

function buildDetailTable(container, title, rows, kind) {
  const titleEl = document.createElement('h3');
  titleEl.className = 'page-subtitle';
  titleEl.textContent = title;
  container.appendChild(titleEl);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-surface';
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  ['Suite', 'Test', 'Description', 'Error'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');

    const tdSuite = document.createElement('td');
    tdSuite.textContent = row.suite;
    tdSuite.style.whiteSpace = 'nowrap';
    tr.appendChild(tdSuite);

    const tdTest = document.createElement('td');
    tdTest.className = 'font-mono';
    tdTest.textContent = row.test;
    tr.appendChild(tdTest);

    const tdDesc = document.createElement('td');
    tdDesc.textContent = row.description;
    tdDesc.style.color = 'var(--text-muted)';
    tdDesc.style.fontSize = '0.85rem';
    tr.appendChild(tdDesc);

    const tdErr = document.createElement('td');
    tdErr.textContent = row.error;
    tdErr.style.fontSize = '0.82rem';
    if (kind === 'failed') {
      tdErr.style.color = 'var(--status-mismatch)';
    } else {
      tdErr.style.color = '#8e44ad';
    }
    tr.appendChild(tdErr);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrapper.appendChild(scroll);
  container.appendChild(wrapper);
}

export default renderW3c;
