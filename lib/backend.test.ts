import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allContainersQuery, apiDate, changedUserFields, parseContainer, parsePage, parseSettings, parseSummary, queryString, staffPatch, trackerFilters } from './backend';

const dehired = {
  containerNumber: 'TEST1234567', container: 'TEST 123456 7', masterBillNumber: 'BILL-1', steamshipLine: 'Example Line', vesselName: 'Example Vessel', portTerminal: 'Houston · Bayport',
  status: 'DEHIRED', trackingStatus: 'EMPTY_RETURNED', keyDate: '2026-06-23T22:15:00.000Z', keyDateText: 'Jun 23, 2026', keyDateLabel: 'Empty returned',
  days: 124, daysLabel: '124 days since return', daysUntil: -124, urgency: 'RED', onOperationsList: true, destination: null, carrier: null,
};

test('real list envelope retains server pagination instead of treating one page as the full list', () => {
  const page = parsePage({ view: 'arrived', data: [dehired], pagination: { page: 2, perPage: 15, total: 371, totalPages: 25 } }, { page: 2, perPage: 15 });
  assert.equal(page.total, 371);
  assert.equal(page.page, 2);
  assert.equal(page.rows.length, 1);
});

test('sparse table rows preserve server days, urgency, carrier line and formatted key date', () => {
  const row = parseContainer(dehired);
  assert.equal(row.status, 'Dehired');
  assert.equal(row.tracked, true);
  assert.equal(row.tone, 'red');
  assert.equal(row.daysText, '124 days since return');
  assert.equal(row.daysRemaining, -124);
  assert.equal(row.line, 'Example Line');
  assert.equal(row.dateText, 'Jun 23, 2026');
});

test('in-transit containers retain the stage and stay unhighlighted even after the ETA', () => {
  const row = parseContainer({ ...dehired, status: 'ON_WATER', trackingStatus: 'VESSEL_BERTHED', onOperationsList: false, urgency: 'NONE', daysLabel: '1 day past', daysUntil: -1 });
  assert.equal(row.tracked, false);
  assert.equal(row.stage, 'On water / arriving');
  assert.equal(row.tone, 'normal');
  assert.equal(row.daysText, '1 day past');
});

test('delivered rows retain the physical state and expose a separate delivered flag', () => {
  const row = parseContainer({ ...dehired, status: 'DELIVERED', destination: 'Example warehouse', carrier: 'Example carrier', deliveredAt: '2026-10-26T16:00:00.000Z', appointmentAt: '2026-10-25T16:00:00.000Z', urgency: 'NONE', keyDateText: 'Oct 26, 2026', daysLabel: '1 day away' });
  assert.equal(row.delivered, true);
  assert.equal(row.status, 'Dehired');
  assert.equal(row.tone, 'normal');
  assert.equal(row.user.appointment, '2026-10-25');
  assert.equal(row.user.deliveredDate, '2026-10-26');
});

test('detail mapping retains staff fields and backend timeline calendar dates', () => {
  const row = parseContainer({ ...dehired, originName: 'Melbourne', driverName: 'Example Driver', receivingContact: 'Warehouse desk', deliveryAddress: 'Example address', timeline: [{ title: 'Discharged', description: 'Discharged from vessel.', timestamp: '2026-07-16T01:13:00Z', date: 'Jul 15, 2026' }] });
  assert.equal(row.origin, 'Melbourne');
  assert.equal(row.user.driver, 'Example Driver');
  assert.equal(row.user.contactName, 'Warehouse desk');
  assert.equal(row.user.destinationAddress, 'Example address');
  assert.equal(row.timeline?.[0].date, 'Jul 15, 2026');
  assert.equal(row.timeline?.[0].desc, 'Discharged from vessel.');
});

test('actual summary cards and filter arrays retain alerts, counts and last successful sync', () => {
  const summary = parseSummary({ atOrigin: 0, onWater: 168, notCollectedPastLastFreeDay: 0, dehiredOverTenDays: 144, arrived: 202, inTransit: 168, deliveredLast30Days: 1, noDestination: 202, overdue: 159,
    cards: [{ id: 'at_origin', count: 0 }, { id: 'on_water', count: 168 }, { id: 'not_collected', count: 1 }, { id: 'at_warehouse', count: 22 }, { id: 'dehired', count: 179 }, { id: 'delivered', count: 1 }],
    filters: [{ id: 'no_destination', count: 202 }, { id: 'overdue', count: 159 }], lastSync: { success: true, finishedAt: '2026-10-25T06:49:56.237Z' },
  });
  assert.equal(summary.metrics.Dehired.red, 144);
  assert.equal(summary.metrics['At warehouse'].red, 15);
  assert.equal(summary.summary['Awaiting destination'], 202);
  assert.equal(summary.summary.Overdue, 159);
  assert.equal(summary.active, 202);
  assert.equal(summary.inTransit, 168);
  assert.equal(summary.deliveredRecent, 1);
  assert.equal(summary.lastSyncedAt, '2026-10-25T06:49:56.237Z');
});

test('failed sync timestamps are not presented as successful sync times', () => {
  const summary = parseSummary({ cards: [{ id: 'dehired', count: 1 }], lastSync: { success: false, finishedAt: '2026-10-25T07:00:00Z' } });
  assert.equal(summary.syncFailed, true);
  assert.equal(summary.lastSyncedAt, undefined);
});

test('nested mail configuration is shown on the settings screen', () => {
  const settings = parseSettings({ emailUpdates: true, compactTable: false, defaultView: 'Active', mail: { configured: true, deliveryEmails: true, alertEmail: 'alerts@example.com' } });
  assert.equal(settings.mailConfigured, true);
  assert.equal(settings.alertEmail, 'alerts@example.com');
  assert.throws(() => parseSettings({ emailUpdates: true }));
});

test('transit queries never receive bucket=all, which overrides the backend view filter', () => {
  const filters = trackerFilters('In transit');
  const query = allContainersQuery(filters);
  assert.equal(query.view, 'in_transit');
  assert.equal(query.bucket, undefined);
  assert.ok(!queryString(query).includes('bucket='));
  assert.equal(allContainersQuery().bucket, 'all');
  assert.equal(trackerFilters('All containers').bucket, 'all');
});

test('staff PATCH sends only changed fields, maps names and preserves explicit field clearing', () => {
  const changed = changedUserFields({ destination: 'Warehouse', notes: 'Old note', carrier: 'Carrier' }, { destination: 'Warehouse', notes: '', carrier: 'New carrier' });
  assert.deepEqual(staffPatch(changed), { notes: '', carrier: 'New carrier' });
  assert.deepEqual(staffPatch({ appointment: '2026-10-25', deliveredDate: '', driver: ' Example Driver ' }), { appointmentAt: '10/25/2026', deliveredAt: '', driverName: 'Example Driver' });
  assert.throws(() => apiDate('2026-02-30'));
});

test('invalid container responses fail visibly instead of silently using demo data', () => {
  assert.throws(() => parseContainer({ id: 'database-id-with-no-container-number' }));
  assert.throws(() => parsePage({ message: 'No list supplied' }, { page: 1, perPage: 15 }));
});

test('rail ETA contract preserves the destination-local date across a UTC calendar boundary', () => {
  const row = parseContainer({
    containerNumber: 'CAAU2252335', status: 'ON_WATER', onOperationsList: false,
    eta: '2026-11-13T03:00:00.000Z', etaAtDestination: '2026-11-13T03:00:00.000Z',
    etaAtTerminal: '2026-11-03T17:00:00.000Z', keyDate: '2026-11-13T03:00:00.000Z',
    keyDateText: 'Nov 12, 2026', keyDateLabel: 'ETA', keyDateTimeZone: 'America/Chicago',
    daysLabel: '11 days away', daysUntil: 11,
    destination: 'Staff-entered warehouse', appointmentAt: '2026-11-15',
  });
  assert.equal(row.dateText, 'Nov 12, 2026');
  assert.equal(row.dateLabel, 'ETA');
  assert.equal(row.daysText, '11 days away');
  assert.equal(row.daysRemaining, 11);
  assert.equal(row.stage, 'On water / arriving');
  assert.equal(row.tone, 'normal');
  assert.equal(row.user.destination, 'Staff-entered warehouse');
  assert.equal(row.user.appointment, '2026-11-15');
});

test('non-rail destination ETA uses the API display date without changing the port shipment', () => {
  const row = parseContainer({ containerNumber: 'HASU1322250', status: 'ON_WATER', onOperationsList: false, eta: '2026-11-10T18:00:00.000Z', etaAtDestination: null, etaAtTerminal: '2026-11-10T18:00:00.000Z', keyDate: '2026-11-10T18:00:00.000Z', keyDateText: 'Nov 10, 2026', keyDateLabel: 'ETA', keyDateTimeZone: 'America/Chicago', daysLabel: '9 days away', daysUntil: 9 });
  assert.equal(row.dateText, 'Nov 10, 2026');
  assert.equal(row.dateLabel, 'ETA');
  assert.equal(row.daysText, '9 days away');
  assert.equal(row.daysRemaining, 9);
});

test('missing destination display text remains missing instead of inventing a formatted ETA', () => {
  for (const keyDateText of [undefined, null, '']) {
    const row = parseContainer({ containerNumber: 'TEST1234567', status: 'ON_WATER', onOperationsList: false, etaAtDestination: null, etaAtTerminal: '2026-11-03T17:00:00.000Z', keyDateText, keyDateLabel: 'ETA' });
    assert.equal(row.dateText, undefined);
  }
});

test('API relative days and past-ETA text are preserved without local UTC recalculation', () => {
  const row = parseContainer({ containerNumber: 'TEST1234567', status: 'ON_WATER', onOperationsList: false, eta: '2000-01-02T03:00:00.000Z', keyDateText: 'Jan 1, 2000', keyDateLabel: 'ETA', daysLabel: '2 days past', daysUntil: -2 });
  assert.equal(row.dateText, 'Jan 1, 2000');
  assert.equal(row.daysText, '2 days past');
  assert.equal(row.daysRemaining, -2);
  assert.equal(row.tone, 'normal');
});

test('backend display labels and dates retain their meaning in other container views', () => {
  for (const [status, label] of [['NOT_COLLECTED', 'Last free day'], ['AT_WAREHOUSE', 'Detention last free day'], ['DEHIRED', 'Empty returned']]) {
    const row = parseContainer({ ...dehired, status, keyDateLabel: label, keyDateText: 'Nov 1, 2026', daysLabel: 'API relative text' });
    assert.equal(row.dateLabel, label);
    assert.equal(row.dateText, 'Nov 1, 2026');
    assert.equal(row.daysText, 'API relative text');
  }
});

test('ETA response mapping retains searched transit query and server pagination', () => {
  const query = allContainersQuery({ ...trackerFilters('In transit'), search: 'CAAU2252335' });
  const encoded = new URLSearchParams(queryString(query));
  assert.equal(encoded.get('search'), 'CAAU2252335');
  assert.equal(encoded.get('view'), 'in_transit');
  assert.equal(encoded.has('bucket'), false);
  const page = parsePage({ data: [{ containerNumber: 'CAAU2252335', status: 'ON_WATER', onOperationsList: false, keyDateLabel: 'ETA', keyDateText: 'Nov 12, 2026', daysLabel: '11 days away' }], pagination: { total: 1, page: 1, perPage: 100 } }, query);
  assert.equal(page.rows[0].dateText, 'Nov 12, 2026');
  assert.equal(page.total, 1);
  assert.equal(page.page, 1);
  assert.equal(page.perPage, 100);
});
