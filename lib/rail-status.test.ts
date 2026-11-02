import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allContainersQuery, parseContainer, parseSummary, queryString, trackerFilters } from './backend';
import type { TrackerView } from './backend';
import { getDashboardCounts, getDisplayStatus } from './tracking';

const shipment = {
  containerNumber: 'TEST1234567', status: 'AT_OCEAN_TERMINAL', statusLabel: 'At ocean terminal',
  trackingStatus: 'DISCHARGED', onOperationsList: true, portTerminal: 'PRINCE RUPERT, BC · Fairview Container Terminal',
  dischargedAt: '2026-10-29T22:35:00.000Z', etaAtDestination: '2026-11-10T12:47:00.000Z', etaAtTerminal: '2026-11-03T13:00:00.000Z',
  eta: '2026-11-10T12:47:00.000Z', keyDate: '2026-11-10T12:47:00.000Z', keyDateLabel: 'ETA', keyDateText: 'Nov 10, 2026', daysLabel: '8 days away',
};

test('all three rail statuses and API labels survive mapping and display selection', () => {
  for (const [status, label] of [['AT_OCEAN_TERMINAL', 'At ocean terminal'], ['ON_RAIL', 'On rail'], ['AT_RAIL_TERMINAL', 'At rail terminal']]) {
    for (const onOperationsList of [true, false]) {
      const item = parseContainer({ ...shipment, status, statusLabel: label, onOperationsList });
      assert.equal(item.status, label);
      assert.equal(item.statusLabel, label);
      assert.equal(getDisplayStatus(item), label);
      assert.equal(item.dateText, 'Nov 10, 2026');
      assert.equal(item.daysText, '8 days away');
    }
  }
});

test('API statusLabel remains separate from the canonical status and missing labels fall back', () => {
  const item = parseContainer({ ...shipment, status: 'AT_RAIL_TERMINAL', statusLabel: 'At rail terminal · available' });
  assert.equal(item.status, 'At rail terminal');
  assert.equal(item.statusLabel, 'At rail terminal · available');
  assert.equal(getDisplayStatus(item), 'At rail terminal');
  const missing = parseContainer({ ...shipment, statusLabel: null });
  assert.equal(missing.statusLabel, undefined);
  assert.equal(getDisplayStatus(missing), 'At ocean terminal');
});

test('BMOU reference maps to At ocean terminal with the backend port and final ETA text', () => {
  const item = parseContainer({ ...shipment, containerNumber: 'BMOU2460440' });
  assert.equal(item.id, 'bmou2460440');
  assert.equal(item.status, 'At ocean terminal');
  assert.equal(item.port, shipment.portTerminal);
  assert.equal(item.dateLabel, 'ETA');
  assert.equal(item.dateText, 'Nov 10, 2026');
  assert.notEqual(item.status, 'Not collected');
});

test('loaded/departed rail feed cases use the API ON_RAIL classification and rail city', () => {
  for (const trackingStatus of ['LOADED_ON_RAIL', 'DEPARTED_ON_RAIL']) {
    const item = parseContainer({ ...shipment, status: 'ON_RAIL', statusLabel: 'On rail', trackingStatus, port: 'Prince Rupert', portTerminal: 'Memphis, TN', finalDestinationName: 'Memphis, TN', destination: 'Staff warehouse' });
    assert.equal(item.status, 'On rail');
    assert.equal(item.port, 'Memphis, TN');
    assert.equal(item.user.destination, 'Staff warehouse');
    assert.equal(item.dateLabel, 'ETA');
    assert.equal(item.dateText, shipment.keyDateText);
  }
});

test('rail arrival feed cases preserve the API status, rail city and either headline-date label', () => {
  for (const trackingStatus of ['ARRIVED_AT_RAIL_FACILITY', 'UNLOADED_FROM_RAIL', 'AVAILABLE_AT_RAIL_FACILITY']) {
    for (const keyDateLabel of ['Rail last free day', 'ETA']) {
      const item = parseContainer({ ...shipment, status: 'AT_RAIL_TERMINAL', statusLabel: 'At rail terminal', trackingStatus, port: 'Prince Rupert', portTerminal: 'Memphis, TN', keyDateLabel, keyDateText: 'Nov 12, 2026', lastFreeDayAtRailStation: keyDateLabel === 'ETA' ? null : '2026-11-12T23:00:00.000Z', urgency: 'RED', daysLabel: '1 day overdue' });
      assert.equal(item.status, 'At rail terminal');
      assert.equal(item.port, 'Memphis, TN');
      assert.equal(item.dateLabel, keyDateLabel);
      assert.equal(item.dateText, 'Nov 12, 2026');
      assert.equal(item.daysText, '1 day overdue');
      assert.equal(item.tone, 'red');
    }
  }
});

test('ocean pickup remains Not collected according to the backend classification', () => {
  const item = parseContainer({ ...shipment, status: 'NOT_COLLECTED', statusLabel: 'Not collected', etaAtDestination: null, portTerminal: 'HOUSTON, TX · Bayport', keyDateLabel: 'Last free day', keyDateText: 'Nov 5, 2026' });
  assert.equal(item.status, 'Not collected');
  assert.equal(item.port, 'HOUSTON, TX · Bayport');
  assert.equal(item.dateLabel, 'Last free day');
  assert.equal(item.dateText, 'Nov 5, 2026');
});

test('rail filters retain exact backend view/bucket pairs, search and pagination', () => {
  const cases: [TrackerView, 'arrived' | 'in_transit', string][] = [['At ocean terminal', 'arrived', 'at_ocean_terminal'], ['On rail', 'in_transit', 'on_rail'], ['At rail terminal', 'arrived', 'at_rail_terminal']];
  for (const [view, expectedView, expectedBucket] of cases) {
    assert.deepEqual(trackerFilters(view), { view: expectedView, bucket: expectedBucket });
    const query = { ...trackerFilters(view), search: 'TEST1234567', page: 2, perPage: 15 };
    const params = new URLSearchParams(queryString(query));
    assert.equal(params.get('view'), expectedView);
    assert.equal(params.get('bucket'), expectedBucket);
    assert.equal(params.get('search'), 'TEST1234567');
    assert.equal(params.get('page'), '2');
    assert.equal(params.get('perPage'), '15');
    assert.equal(allContainersQuery(trackerFilters(view)).bucket, expectedBucket);
  }
});

const cards = [
  { id: 'at_origin', count: 2 }, { id: 'on_water', count: 10 }, { id: 'at_ocean_terminal', count: 4 },
  { id: 'on_rail', count: 5 }, { id: 'at_rail_terminal', count: 3, red: 99 },
  { id: 'not_collected', count: 2 }, { id: 'at_warehouse', count: 6 }, { id: 'dehired', count: 7 }, { id: 'delivered', count: 8 },
];

test('summary maps rail cards/overdue and trusts backend tab totals without double counting', () => {
  const summary = parseSummary({ cards, arrived: 22, inTransit: 17, overdue: 7, notCollectedPastLastFreeDay: 1, railPastLastFreeDay: 2, dehiredOverTenDays: 3 });
  assert.equal(summary.metrics['At ocean terminal'].count, 4);
  assert.equal(summary.metrics['On rail'].count, 5);
  assert.equal(summary.metrics['At rail terminal'].count, 3);
  assert.equal(summary.metrics['At rail terminal'].red, 2);
  assert.equal(summary.metrics['At warehouse'].red, 1);
  assert.equal(summary.inTransit, 17);
  assert.equal(summary.active, 22);
  assert.equal(summary.summary.Overdue, 7);
});

test('summary fallback includes on-rail once and keeps arrived rail terminals in Arrived', () => {
  const summary = parseSummary({ cards: cards.map(card => ({ ...card, red: 0 })) });
  assert.equal(summary.inTransit, 2 + 10 + 5);
  assert.equal(summary.active, 4 + 3 + 2 + 6 + 7);
  assert.equal(summary.metrics.Delivered.count, 8);
  assert.equal(summary.active + summary.inTransit + summary.metrics.Delivered.count, 47);
});

test('rail-only summary formats and legacy summaries are both accepted', () => {
  assert.equal(parseSummary({ cards: [{ id: 'at_ocean_terminal', count: 4 }] }).active, 4);
  const legacy = parseSummary({ cards: [{ id: 'on_water', count: 10 }] });
  assert.equal(legacy.inTransit, 10);
  assert.equal(legacy.metrics['On rail'].count, 0);
  assert.equal(legacy.metrics['At ocean terminal'].count, 0);
  assert.equal(legacy.metrics['At rail terminal'].count, 0);
});

test('local view counts partition rail rows without counting them as ocean transit or pickups', () => {
  for (const onOperationsList of [true, false]) {
    const items = ['AT_OCEAN_TERMINAL', 'ON_RAIL', 'AT_RAIL_TERMINAL'].map((status, index) => parseContainer({ ...shipment, containerNumber: `TEST000000${index}`, status, statusLabel: undefined, onOperationsList }));
    items.push(parseContainer({ ...shipment, containerNumber: 'TEST0000003', status: 'ON_WATER', statusLabel: 'On water / arriving', onOperationsList: false }));
    const summary = getDashboardCounts(items);
    assert.equal(summary.active, 2);
    assert.equal(summary.inTransit, 2);
    assert.equal(summary.metrics['At ocean terminal'].count, 1);
    assert.equal(summary.metrics['On rail'].count, 1);
    assert.equal(summary.metrics['At rail terminal'].count, 1);
    assert.equal(summary.metrics['On water / arriving'].count, 1);
    assert.equal(summary.metrics['At origin'].count, 0);
    assert.equal(summary.metrics['Not collected'].count, 0);
  }
});

test('a delivered rail row is counted only in Delivered', () => {
  const item = parseContainer({ ...shipment, status: 'ON_RAIL', statusLabel: 'On rail', delivered: true });
  const summary = getDashboardCounts([item]);
  assert.equal(summary.active, 0);
  assert.equal(summary.inTransit, 0);
  assert.equal(summary.metrics['On rail'].count, 0);
  assert.equal(summary.metrics.Delivered.count, 1);
});
