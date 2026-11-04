import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'next/dist/build/swc';
import { changedUserFields, parseContainer, staffPatch } from './backend';
import type { BackendContainer } from './backend';
import { getDashboardCounts, isDelivered } from './tracking';
import { loadDetail, loadMetadata, saveUserFields, useContainerDetail } from './container-store';

const rail = {
  containerNumber: 'TEST1234567', status: 'AT_OCEAN_TERMINAL', statusLabel: 'At ocean terminal',
  onOperationsList: true, portTerminal: 'Ocean port · Terminal', finalDestinationName: 'Rail city',
  keyDateText: 'Nov 10, 2026', keyDateLabel: 'ETA', daysLabel: '7 days away',
  destination: null, deliveryAddress: null,
};

// Render the actual shipment views with read-only fixtures and navigation/store boundaries stubbed.
// TSX is transpiled in memory so these tests need no extra runner or browser dependencies.
function renderShipment(container: BackendContainer, surface: 'details' | 'table' | 'staff' = 'details', rows = [container]) {
  const runtimeRequire = createRequire(__filename);
  const states = [{ id: container.id, form: container.user, original: container.user }, false, undefined];
  const pageReact = { ...React, useState: () => [states.shift(), () => {}] };
  const loadTsx = (path: string): { default?: React.ComponentType; [key: string]: unknown } => {
    const filename = resolve(process.cwd(), path);
    const { code } = transformSync(readFileSync(filename, 'utf8'), {
      filename,
      jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2020' },
      module: { type: 'commonjs' },
    });
    const module = { exports: {} };
    const requireFixture = (name: string): unknown => {
      if (name === 'react') return path === 'app/containers/[id]/page.tsx' ? pageReact : React;
      if (name === 'next/navigation') return {
        useParams: () => ({ id: container.id }), useRouter: () => ({ push: () => {}, back: () => {} }),
        useSearchParams: () => new URLSearchParams({ container: container.id }),
      };
      if (name === 'react-hook-form') return { useForm: () => ({
        register: (name: keyof BackendContainer['user']) => ({ name, defaultValue: container.user[name] || '' }),
        handleSubmit: () => () => {}, reset: () => {}, setError: () => {}, clearErrors: () => {},
        formState: { errors: {}, isSubmitting: false },
      }) };
      if (name === 'next/link') return ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', props, children);
      if (name.endsWith('/components/layout')) return { AppShell: ({ children }: React.PropsWithChildren) => children };
      if (name.endsWith('/components/shared')) return loadTsx('components/shared.tsx');
      if (name.endsWith('/components/loading')) return {};
      if (name.endsWith('/components/toast')) return {};
      if (name.endsWith('/lib/container-store')) return {
        useContainerDetail: () => ({ container, loading: false }),
        useContainerOptions: () => ({ containers: rows, loading: false }),
        useContainerTracker: () => ({ refreshing: false }),
        saveUserFields: () => { throw new Error('Rendering must never save delivery data.'); },
      };
      if (name.includes('/lib/')) return runtimeRequire(`./${name.split('/').pop()}.js`);
      return runtimeRequire(name);
    };
    runInNewContext(code, { module, exports: module.exports, require: requireFixture });
    return module.exports;
  };
  if (surface === 'table') {
    const Table = loadTsx('components/shared.tsx').ContainerTable as React.ComponentType<{ rows: BackendContainer[]; pagination: unknown }>;
    return renderToStaticMarkup(React.createElement(Table, { rows, pagination: { page: 1, perPage: 15, total: rows.length, onPageChange: () => {}, onPageSizeChange: () => {} } }));
  }
  const Page = loadTsx(surface === 'staff' ? 'app/staff/updates/page.tsx' : 'app/containers/[id]/page.tsx').default!;
  return renderToStaticMarkup(React.createElement(Page));
}
const renderDetails = (container: BackendContainer) => renderShipment(container);

test('the verified API rail field maps once to railDestination, outside the staff model', () => {
  const container = parseContainer({ ...rail, containerNumber: 'BMOU2460440', finalDestinationName: 'Memphis' });
  assert.equal(container.railDestination, 'Memphis');
  assert.equal('finalDestinationName' in container, false);
  assert.equal(container.user.destination, '');
  assert.equal('railDestination' in container.user, false);
  assert.equal('finalDestinationName' in container.user, false);
});

test('details show the feed rail city while the customer form remains independent', () => {
  const container = parseContainer({ ...rail, portTerminal: 'Prince Rupert', finalDestinationName: 'Memphis', destination: 'Hubbard, OH', deliveryAddress: 'Customer street address' });
  const html = renderDetails(container);
  assert.match(html, /Rail destination<\/div><div class="info-value">Memphis/);
  assert.match(html, /Port \u00b7 terminal<\/div><div class="info-value">Prince Rupert/);
  assert.match(html, /Trucking &amp; customer delivery/);
  assert.match(html, /<label[^>]*>Customer delivery<\/label><input[^>]*value="Hubbard, OH"/);
  assert.equal(container.user.destinationAddress, 'Customer street address');
  assert.doesNotMatch(html, /<input[^>]*value="Memphis"/);
  const summary = html.slice(html.indexOf('class="info-grid"'), html.indexOf('Shipment timeline'));
  assert.doesNotMatch(summary, /Hubbard, OH/);
});

test('a missing staff destination leaves the customer input empty even with an API rail city', () => {
  const container = parseContainer(rail);
  const html = renderDetails(container);
  assert.match(html, /Rail destination<\/div><div class="info-value">Rail city/);
  assert.match(html, /<label[^>]*>Customer delivery<\/label><input[^>]*value=""/);
  assert.equal(container.user.destination, '');
});

test('missing or unusable feed rail cities show an em dash without port or staff fallbacks', () => {
  for (const finalDestinationName of [undefined, null, '', '   ', 123, {}]) {
    const container = parseContainer({ ...rail, finalDestinationName, destination: 'Customer warehouse' });
    assert.equal(container.railDestination, undefined);
    for (const surface of ['details', 'staff'] as const) {
      assert.match(renderShipment(container, surface), /Rail destination<\/div><div class="info-value">\u2014/);
    }
    assert.equal(container.user.destination, 'Customer warehouse');
    assert.equal(container.port, rail.portTerminal);
  }
});

test('an ocean-only shipment with no rail field has no fabricated rail city in any view', () => {
  const container = parseContainer({ ...rail, status: 'NOT_COLLECTED', statusLabel: 'Not collected', finalDestinationName: null, portTerminal: 'Houston', destination: 'Customer warehouse' });
  assert.match(renderDetails(container), /Rail destination<\/div><div class="info-value">\u2014/);
  const table = renderShipment(container, 'table');
  const cells = [...table.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map(match => match[1]);
  assert.equal(cells[3], 'Houston');
  assert.equal(cells[7], '\u2014');
  assert.equal(cells[8], 'Customer warehouse');
  assert.equal(container.status, 'Not collected');
});

test('API rail values are preserved without location suffixes or status-dependent guesses', () => {
  for (const status of ['AT_OCEAN_TERMINAL', 'ON_RAIL', 'AT_RAIL_TERMINAL', 'ON_WATER', 'NOT_COLLECTED']) {
    const container = parseContainer({ ...rail, status, finalDestinationName: 'Memphis' });
    assert.equal(container.railDestination, 'Memphis');
    assert.match(renderDetails(container), /Rail destination<\/div><div class="info-value">Memphis<\/div>/);
  }
  assert.equal(parseContainer({ ...rail, finalDestinationName: ' Feed label ' }).railDestination, ' Feed label ');
});

test('table keeps two independent destination columns, the other headers, and container links', () => {
  const rows = [
    parseContainer({ ...rail, containerNumber: 'BMOU2460440', finalDestinationName: 'Memphis', destination: 'Hubbard, OH' }),
    parseContainer({ ...rail, containerNumber: 'TEST7654321', status: 'NOT_COLLECTED', statusLabel: 'Not collected', finalDestinationName: null, destination: 'Customer warehouse' }),
  ];
  const html = renderShipment(rows[0], 'table', rows);
  const headers = [...html.matchAll(/<th>(.*?)<\/th>/g)].map(match => match[1]);
  assert.deepEqual(headers, ['Container', 'MBL', 'Size', 'Port \u00b7 terminal', 'Status', 'Key date', 'Days', 'Rail destination', 'Customer delivery', 'Carrier', 'Appt', 'Delivered', 'Notes']);
  assert.equal(headers.filter(header => header === 'Rail destination').length, 1);
  assert.equal(headers.filter(header => header === 'Customer delivery').length, 1);
  const cells = [...html.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map(match => match[1]);
  assert.equal(cells.length, 26);
  assert.equal(cells[7], 'Memphis');
  assert.equal(cells[8], 'Hubbard, OH');
  assert.equal(cells[20], '\u2014');
  assert.equal(cells[21], 'Customer warehouse');
  assert.match(html, /href="\/containers\/bmou2460440"/);
  assert.match(html, /href="\/containers\/test7654321"/);
  assert.equal((html.match(/class="clickable-row" tabindex="0"/g) || []).length, 2);
  assert.match(html, /class="table-wrap"/);
  assert.doesNotMatch(html, /<colgroup|<col\b|<td[^>]*style=|<th[^>]*style=/);
});

test('staff snapshot uses the migrated feed field without changing editable input names', () => {
  const container = parseContainer({ ...rail, destination: 'Customer warehouse', carrier: 'Staff carrier', appointmentAt: '2026-11-11' });
  const html = renderShipment(container, 'staff');
  const snapshot = html.slice(html.indexOf('Container snapshot'));
  assert.match(snapshot, /Rail destination<\/div><div class="info-value">Rail city/);
  assert.match(snapshot, /Final customer delivery destination<\/div><div class="info-value">Customer warehouse/);
  assert.doesNotMatch(snapshot, /<input|<textarea|<select/);
  assert.match(html, /<input[^>]*id="destination"[^>]*name="destination"[^>]*value="Customer warehouse"/);
  assert.deepEqual([...html.matchAll(/<(?:input|textarea)[^>]*name="([^"]+)"/g)].map(match => match[1]), ['destination', 'carrier', 'appointment', 'deliveredDate', 'notes']);
  assert.doesNotMatch(html, /<input[^>]*value="Rail city"/);
});

test('rail destination alone never completes staff delivery or the missing-staff-destination count', () => {
  const container = parseContainer({ ...rail, finalDestinationName: 'Memphis', destination: null, carrier: 'Staff carrier', deliveredAt: '2026-11-02' });
  assert.equal(container.delivered, false);
  assert.equal(isDelivered(container.user), false);
  const counts = getDashboardCounts([container], '2026-11-04');
  assert.equal(counts.metrics.Delivered.count, 0);
  assert.equal(counts.summary['Awaiting destination'], 1);
  assert.equal(counts.active, 1);
});

test('delivered details retain the physical state and history without the incorrect At origin badge', () => {
  const container = parseContainer({ ...rail, containerNumber: 'ONEU2811209', status: 'DELIVERED', statusLabel: 'Delivered', trackingStatus: 'EMPTY_RETURNED', onOperationsList: false,
    destination: 'Customer warehouse', carrier: 'Staff carrier', deliveredAt: '2026-11-02',
    timeline: [{ title: 'Empty returned', date: 'Nov 1, 2026', desc: 'Backend movement history' }],
  });
  const html = renderDetails(container);
  assert.deepEqual([...html.matchAll(/<span class="status [^"]+">([^<]+)<\/span>/g)].map(match => match[1]), ['Dehired', 'Delivered']);
  assert.equal(container.stage, 'At origin');
  assert.equal(container.delivered, true);
  assert.equal(container.status, 'Dehired');
  assert.match(html, /Backend movement history/);
  const missing = renderDetails(parseContainer({ ...rail, status: 'DELIVERED', trackingStatus: null, onOperationsList: false }));
  assert.match(missing, /class="status green">Delivered/);
  assert.doesNotMatch(missing, />At origin<|>Not tracked</);
});

test('delivered discharged shipments omit the derived pickup badge without changing shipment data', () => {
  for (const containerNumber of ['BMOU2460440', 'TEST7654321']) {
    for (const onOperationsList of [true, false]) {
      const timeline = [{ title: 'Discharged from vessel', date: 'Oct 29, 2026', desc: 'Original backend discharge history' }];
      const container = parseContainer({ ...rail, containerNumber, status: 'DELIVERED', statusLabel: 'Delivered', trackingStatus: 'DISCHARGED', onOperationsList,
        finalDestinationName: 'Memphis', destination: 'Customer warehouse', carrier: 'Staff carrier', deliveredAt: '2026-11-12',
        keyDateLabel: 'Delivered', keyDateText: 'Nov 12, 2026', daysLabel: 'Backend relative days', timeline,
      });
      const original = structuredClone(container);
      const counts = getDashboardCounts([container], '2026-11-04');
      const html = renderDetails(container);
      assert.deepEqual([...html.matchAll(/<span class="status [^"]+">([^<]+)<\/span>/g)].map(match => match[1]), ['Delivered']);
      assert.equal(container.delivered, true);
      assert.equal(container.status, 'Not collected'); // Keep the internal mapping; suppress presentation only.
      assert.deepEqual(container.timeline, timeline);
      assert.match(html, /Original backend discharge history/);
      assert.match(html, /Nov 12, 2026/);
      assert.match(html, /Backend relative days/);
      assert.match(html, /Rail destination<\/div><div class="info-value">Memphis/);
      assert.match(html, /<label[^>]*>Customer delivery<\/label><input[^>]*value="Customer warehouse"/);
      assert.deepEqual(container, original);
      assert.deepEqual(getDashboardCounts([container], '2026-11-04'), counts);
    }
  }
});

test('undelivered ocean pickup and ocean-terminal rail badges remain distinct', () => {
  for (const [status, label, tone, finalDestinationName] of [
    ['NOT_COLLECTED', 'Not collected', 'blue', null],
    ['AT_OCEAN_TERMINAL', 'At ocean terminal', 'gray', 'Rail city'],
  ] as const) {
    const container = parseContainer({ ...rail, status, statusLabel: label, trackingStatus: 'DISCHARGED', finalDestinationName });
    const html = renderDetails(container);
    assert.equal(container.delivered, false);
    assert.equal(container.status, label);
    assert.deepEqual([...html.matchAll(/<span class="status ([^"]+)">([^<]+)<\/span>/g)].map(match => [match[1], match[2]]), [[tone, label]]);
  }
});

test('rail statuses preserve backend port locations and destination-local ETA text', () => {
  for (const [status, label, port] of [['AT_OCEAN_TERMINAL', 'At ocean terminal', 'Prince Rupert'], ['ON_RAIL', 'On rail', 'Memphis'], ['AT_RAIL_TERMINAL', 'At rail terminal', 'Memphis']]) {
    const container = parseContainer({ ...rail, status, statusLabel: label, finalDestinationName: 'Memphis', portTerminal: port,
      keyDateText: 'Nov 12, 2026', keyDateTimeZone: 'America/Chicago', etaAtDestination: '2026-11-13T03:00:00Z', etaAtTerminal: '2026-11-03T17:00:00Z', daysLabel: '2 days away' });
    const html = renderDetails(container);
    assert.equal(container.status, label);
    assert.equal(container.port, port);
    assert.equal(container.dateText, 'Nov 12, 2026');
    assert.equal(container.dateLabel, 'ETA');
    assert.equal(container.daysText, '2 days away');
    assert.match(html, /Nov 12, 2026/);
    assert.match(html, /2 days away/);
    assert.match(html, new RegExp(label));
  }
});

test('staff PATCH contains only the customer destination and existing staff fields', () => {
  const container = parseContainer({ ...rail, finalDestinationName: 'Memphis', destination: 'Hubbard, OH', carrier: 'Staff carrier', deliveredAt: '2026-11-02', appointmentAt: '2026-11-01', deliveryAddress: 'Customer street address', notes: 'Staff note' });
  assert.equal(container.delivered, true);
  const patch = staffPatch(container.user);
  assert.deepEqual(patch, {
    destination: 'Hubbard, OH', carrier: 'Staff carrier', appointmentAt: '11/01/2026', deliveredAt: '11/02/2026',
    driverName: '', truckNumber: '', receivingContact: '', contactPhone: '', deliveryAddress: 'Customer street address', notes: 'Staff note',
  });
  assert.equal('railDestination' in patch, false);
  assert.equal('finalDestinationName' in patch, false);
  assert.deepEqual(changedUserFields(container.user, { ...container.user, notes: 'Updated note' }), { notes: 'Updated note' });
});

test('mock customer save and feed reload keep both destinations separate without production requests', async t => {
  t.mock.method(React, 'useEffect', () => {});
  t.mock.method(React, 'useSyncExternalStore', <T,>(_subscribe: (listener: () => void) => () => void, getSnapshot: () => T) => getSnapshot());
  let customerDestination = '';
  let railCity = 'Rail city';
  const writes: unknown[] = [];
  const id = 'test9000001';
  const payload = () => ({ ...rail, containerNumber: 'TEST9000001', finalDestinationName: railCity, destination: customerDestination });
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
    const path = String(input);
    const method = options?.method ?? 'GET';
    if (path === '/api/backend/containers/TEST9000001') {
      if (method === 'PATCH') {
        const patch = JSON.parse(String(options?.body));
        writes.push(patch);
        customerDestination = patch.destination;
      } else assert.equal(method, 'GET');
      return json(payload());
    }
    assert.equal(method, 'GET');
    if (path === '/api/backend/containers/summary') return json({ cards: [{ id: 'at_ocean_terminal', count: 1 }] });
    if (path === '/api/backend/settings') return json({ emailUpdates: true, compactTable: false, defaultView: 'Active' });
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  });
  await loadDetail(id);
  assert.equal(useContainerDetail(id).container?.user.destination, '');
  await saveUserFields(id, { destination: 'Customer warehouse' });
  await loadMetadata();
  assert.deepEqual(writes, [{ destination: 'Customer warehouse' }]);
  assert.equal(useContainerDetail(id).container?.railDestination, 'Rail city');
  railCity = 'Updated feed city';
  await loadDetail(id);
  const reloaded = useContainerDetail(id).container!;
  assert.equal(reloaded.railDestination, 'Updated feed city');
  assert.equal(reloaded.user.destination, 'Customer warehouse');
  assert.equal(reloaded.delivered, false);
});
