import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadDetail, loadList, useContainerDetail, useContainerOptions, useContainerTracker } from './container-store';

test('delivery updates uses the shared Manual Sync flow without production requests', async t => {
  // Observe the real external store without mounting React or running effects automatically.
  t.mock.method(React, 'useEffect', () => {});
  t.mock.method(React, 'useSyncExternalStore', <T,>(_subscribe: (onChange: () => void) => () => void, getSnapshot: () => T) => getSnapshot());
  const requests: { path: string; method: string; body: unknown }[] = [];
  let fresh = false;
  let failure: 'http' | 'reported' | undefined;
  let holdSync = false;
  let releaseSync = () => {};
  const selectedId = 'test0000000';
  const rows = () => Array.from({ length: 101 }, (_, index) => ({
    containerNumber: `TEST${String(index).padStart(7, '0')}`, status: 'ON_WATER', onOperationsList: false,
    keyDateLabel: 'ETA', keyDateText: fresh ? 'Nov 12, 2026' : 'Nov 3, 2026', daysLabel: fresh ? '11 days away' : '2 days away',
    destination: 'Saved destination', carrier: 'Saved carrier', notes: 'Saved note',
  }));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
    const url = new URL(String(input), 'http://frontend.test');
    const method = options?.method ?? 'GET';
    requests.push({ path: url.pathname + url.search, method, body: options?.body });
    if (url.pathname === '/api/backend/containers/sync' && method === 'POST') {
      if (holdSync) await new Promise<void>(resolve => { releaseSync = resolve; });
      if (failure === 'http') return json({ message: 'Fixture sync unavailable.' }, 503);
      if (failure === 'reported') return json({ success: false, message: 'Fixture shipment feed failed.' });
      fresh = true;
      return json({ success: true, lastSyncedAt: '2026-11-01T08:00:00.000Z', message: 'Fixture sync completed.' });
    }
    if (url.pathname === '/api/backend/containers/summary') return json({ cards: [{ id: 'on_water', count: 101 }] });
    if (url.pathname === '/api/backend/settings') return json({ emailUpdates: true, compactTable: false, defaultView: 'Active' });
    if (url.pathname === '/api/backend/containers') {
      const search = url.searchParams.get('search');
      const matching = rows().filter(row => !search || row.containerNumber.toLowerCase() === search.toLowerCase());
      const page = Number(url.searchParams.get('page') || 1);
      const perPage = Number(url.searchParams.get('perPage') || 100);
      return json({ data: matching.slice((page - 1) * perPage, page * perPage), pagination: { total: matching.length, page, perPage } });
    }
    if (url.pathname === '/api/backend/containers/TEST0000000') return json(rows()[0]);
    throw new Error(`Unexpected test request: ${method} ${url.pathname}`);
  });

  await t.test('sync reloads the filtered dashboard and invalidates delivery options and selected details', async () => {
    await useContainerOptions().retry();
    await loadDetail(selectedId);
    await loadList({ view: 'in_transit', search: 'TEST0000000', page: 1, perPage: 15 });
    assert.equal(useContainerOptions().containers.length, 101);
    assert.equal(useContainerDetail(selectedId).container?.dateText, 'Nov 3, 2026');
    const beforeRevision = useContainerTracker().revision;
    requests.length = 0;
    await useContainerTracker().refresh();
    const state = useContainerTracker();
    const posts = requests.filter(request => request.method === 'POST');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].path, '/api/backend/containers/sync');
    assert.equal(posts[0].body, undefined);
    assert.equal(state.revision, beforeRevision + 1);
    assert.equal(state.optionsLoaded, false);
    assert.equal(state.rows[0].dateText, 'Nov 12, 2026');
    assert.equal(state.rows[0].user.destination, 'Saved destination');
    assert.equal(state.lastSyncedAt, '2026-11-01T08:00:00.000Z');
    assert.equal(state.notice?.tone, 'success');
    assert.equal(state.refreshing, false);
    const query = requests.find(request => request.path.includes('/containers?'))?.path;
    assert.ok(query?.includes('view=in_transit') && query.includes('search=TEST0000000'));

    // The delivery hooks react to revision/options invalidation by loading these fresh resources.
    await Promise.all([useContainerOptions().retry(), loadDetail(selectedId)]);
    assert.equal(useContainerOptions().containers.length, 101);
    assert.ok(useContainerOptions().containers.every(container => container.dateText === 'Nov 12, 2026'));
    const selected = useContainerDetail(selectedId).container;
    assert.equal(selected?.id, selectedId);
    assert.equal(selected?.dateText, 'Nov 12, 2026');
    assert.equal(selected?.user.carrier, 'Saved carrier');
    assert.equal(selected?.user.notes, 'Saved note');
    assert.ok(requests.every(request => request.method !== 'PATCH'));
  });

  await t.test('repeated clicks do not start a second sync while one is pending', async () => {
    requests.length = 0;
    holdSync = true;
    const first = useContainerTracker().refresh();
    await useContainerTracker().refresh();
    assert.equal(useContainerTracker().refreshing, true);
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    releaseSync();
    await first;
    holdSync = false;
    assert.equal(useContainerTracker().refreshing, false);
  });

  for (const mode of ['http', 'reported'] as const) {
    await t.test(`${mode} sync failure keeps existing shipment data and exposes a retryable error`, async () => {
      await useContainerOptions().retry();
      const before = useContainerTracker();
      failure = mode;
      requests.length = 0;
      await useContainerTracker().refresh();
      const after = useContainerTracker();
      assert.equal(after.revision, before.revision);
      assert.equal(after.lastSyncedAt, before.lastSyncedAt);
      assert.equal(after.rows, before.rows);
      assert.equal(after.options, before.options);
      assert.equal(after.details, before.details);
      assert.equal(after.refreshing, false);
      assert.equal(after.notice?.tone, 'error');
      assert.equal(requests.length, 1);
      failure = undefined;
    });
  }
});
