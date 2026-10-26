import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoFeed } from './testing/demo-feed.ts';
import { createInitialState, simulateRefresh } from './testing/tracker-fixture.ts';
import type { OpenTrackRecord } from './data.ts';
import { addDays, diffDays, formatDate } from './dates.ts';
import { buildView, buildViews, getDashboardCounts, getMilestones, getStatus, hasTrackingMilestone, isDelivered, mergeOpenTrackResponse, saveUserFields, sortContainers } from './tracking.ts';

const NOW = new Date(2026, 9, 21, 10, 0);
const TODAY = '2026-10-21';
const record = (over: Partial<OpenTrackRecord> = {}): OpenTrackRecord => ({ container: 'TEST 000001 0', mbl: '1', size: '40HC', origin: 'A', port: 'B', line: 'C', vessel: 'D', history: [], ...over });
const view = (over: Partial<OpenTrackRecord>, tracked = true, user = {}) => buildView('x', record(over), user, tracked, TODAY);
const off = (days: number) => addDays(TODAY, days);

test('date helpers are safe and DST-proof', () => {
  assert.equal(diffDays('2026-03-07', '2026-03-09'), 2);
  assert.equal(diffDays('2026-11-01', '2026-11-03'), 2);
  assert.equal(diffDays(undefined, TODAY), null);
  assert.equal(diffDays('TBD', TODAY), null);
  assert.equal(diffDays('2026-02-30', TODAY), null);
  assert.equal(diffDays('2026-10-19T23:59:00Z', TODAY), 2);
  assert.equal(formatDate(undefined), '—');
  assert.equal(formatDate('TBD'), 'TBD');
});

test('milestone detection: each trigger alone adds a container', () => {
  assert.deepEqual(getMilestones(record({ history: [{ type: 'AVAILABLE', date: TODAY }] })), ['AVAILABLE']);
  assert.deepEqual(getMilestones(record({ dischargedDate: TODAY })), ['dischargedDate']);
  assert.deepEqual(getMilestones(record({ outgatedDate: TODAY })), ['outgatedDate']);
  assert.deepEqual(getMilestones(record({ emptyReturnedDate: TODAY })), ['emptyReturnedDate']);
  assert.equal(hasTrackingMilestone(record({ history: [{ type: 'available', date: TODAY }] })), true);
});

test('milestone detection: other events and blank dates do not', () => {
  assert.equal(hasTrackingMilestone(record()), false);
  assert.equal(hasTrackingMilestone(record({ history: [{ type: 'LOADED', date: TODAY }, { type: 'VESSEL_ARRIVED', date: TODAY }, { type: 'AVAILABLE_SOON', date: TODAY }] })), false);
  assert.equal(hasTrackingMilestone(record({ dischargedDate: '', outgatedDate: '  ', emptyReturnedDate: undefined })), false);
});

test('status priority: Dehired > At warehouse > Not collected', () => {
  assert.equal(getStatus(record({ dischargedDate: TODAY })), 'Not collected');
  assert.equal(getStatus(record({ outgatedDate: TODAY })), 'At warehouse');
  assert.equal(getStatus(record({ outgatedDate: TODAY, emptyReturnedDate: TODAY })), 'Dehired');
  assert.equal(getStatus(record({ emptyReturnedDate: TODAY })), 'Dehired');
  assert.equal(view({}, false).status, 'Not tracked');
});

test('status picks the right date: LFD, detention LFD, days since empty return', () => {
  const notCollected = view({ dischargedDate: off(-3), lastFreeDay: off(5), detentionLastFreeDay: off(-9) });
  assert.deepEqual([notCollected.status, notCollected.dateLabel, notCollected.dateValue, notCollected.daysRemaining], ['Not collected', 'Last free day', off(5), 5]);
  const warehouse = view({ outgatedDate: off(-1), lastFreeDay: off(-4), detentionLastFreeDay: off(6) });
  assert.deepEqual([warehouse.status, warehouse.dateLabel, warehouse.tone, warehouse.daysText], ['At warehouse', 'Detention last free day', 'normal', '6 days left']);
  const dehired = view({ outgatedDate: off(-9), detentionLastFreeDay: off(-2), emptyReturnedDate: off(-4) });
  assert.deepEqual([dehired.status, dehired.dateLabel, dehired.tone, dehired.daysText], ['Dehired', 'Empty returned', 'normal', '4 days since return']);
});

test('last free day and detention last free day thresholds', () => {
  const expected: [number, string][] = [[5, 'normal'], [3, 'normal'], [2, 'amber'], [1, 'amber'], [0, 'amber'], [-1, 'red'], [-30, 'red']];
  for (const [remaining, tone] of expected) {
    assert.equal(view({ dischargedDate: off(-2), lastFreeDay: off(remaining) }).tone, tone, `LFD ${remaining}`);
    assert.equal(view({ outgatedDate: off(-2), detentionLastFreeDay: off(remaining) }).tone, tone, `DLFD ${remaining}`);
  }
  assert.equal(view({ dischargedDate: off(-2), lastFreeDay: off(0) }).daysText, 'Due today');
  assert.equal(view({ dischargedDate: off(-2), lastFreeDay: off(-1) }).daysText, '1 day overdue');
});

test('dehired thresholds: amber at 8–10 days, red after 10', () => {
  const expected: [number, string][] = [[0, 'normal'], [7, 'normal'], [8, 'amber'], [9, 'amber'], [10, 'amber'], [11, 'red'], [40, 'red']];
  for (const [days, tone] of expected) assert.equal(view({ emptyReturnedDate: off(-days) }).tone, tone, `${days} days`);
  assert.equal(view({ emptyReturnedDate: off(0) }).daysText, 'Returned today');
});

test('missing or invalid dates are handled safely', () => {
  for (const status of [{ dischargedDate: off(-1) }, { outgatedDate: off(-1) }, { emptyReturnedDate: 'unknown' }, { dischargedDate: off(-1), lastFreeDay: 'TBD' }]) {
    const v = view(status);
    assert.equal(v.tone, 'normal'); assert.equal(v.daysRemaining, null); assert.equal(v.daysText, 'No date');
  }
});

test('delivered containers and untracked containers are never highlighted', () => {
  const complete = { destination: 'Richmond, VA', carrier: 'Priority 1', deliveredDate: off(-1) };
  assert.equal(view({ dischargedDate: off(-9), lastFreeDay: off(-5) }, true, complete).tone, 'normal');
  assert.equal(view({ dischargedDate: off(-9), lastFreeDay: off(-5) }, false).tone, 'normal');
});

test('sorting: red, then amber, then normal; soonest deadline first; missing dates last', () => {
  const views = [
    { ...view({ dischargedDate: off(-1), lastFreeDay: off(9) }), id: 'normal-9' }, { ...view({ dischargedDate: off(-1) }), id: 'no-date' },
    { ...view({ dischargedDate: off(-1), lastFreeDay: off(1) }), id: 'amber-1' }, { ...view({ dischargedDate: off(-1), lastFreeDay: off(-1) }), id: 'red-1' },
    { ...view({ emptyReturnedDate: off(-30) }), id: 'dehired-red-30' }, { ...view({ emptyReturnedDate: off(-8) }), id: 'dehired-amber-8' },
    { ...view({ outgatedDate: off(-1), detentionLastFreeDay: off(0) }), id: 'amber-0' }, { ...view({ dischargedDate: off(-1), lastFreeDay: off(5) }), id: 'normal-5' },
  ];
  assert.deepEqual(sortContainers(views).map((item) => item.id), ['dehired-red-30', 'red-1', 'amber-0', 'amber-1', 'dehired-amber-8', 'normal-5', 'normal-9', 'no-date']);
});

test('Delivered requires destination, carrier and delivered date, and nothing else', () => {
  const full = { destination: 'A', carrier: 'B', deliveredDate: TODAY };
  assert.equal(isDelivered(full), true);
  assert.equal(isDelivered({ ...full, destination: ' ' }), false);
  assert.equal(isDelivered({ ...full, carrier: undefined }), false);
  assert.equal(isDelivered({ ...full, deliveredDate: '' }), false);
  assert.equal(isDelivered({ appointment: TODAY, notes: 'x' }), false);
  const dehiredOnly = view({ emptyReturnedDate: off(-3) });
  assert.equal(dehiredOnly.status, 'Dehired'); assert.equal(dehiredOnly.delivered, false);
  assert.equal(view({ emptyReturnedDate: off(-3) }, true, full).delivered, true);
  assert.equal(view({}, false, full).delivered, false);
});

test('demo data covers every scenario on the first response', () => {
  const state = createInitialState(NOW);
  const views = buildViews(state, TODAY);
  const tracked = views.filter((item) => item.tracked);
  assert.equal(tracked.length, 141);
  assert.equal(views.filter((item) => !item.tracked).length, 169);
  for (const status of ['Not collected', 'At warehouse', 'Dehired']) for (const tone of ['red', 'amber', 'normal']) if (status !== 'At warehouse' || tone !== 'red') assert.ok(tracked.some((item) => item.status === status && item.tone === tone && !item.delivered), `${status}/${tone}`);
  assert.ok(tracked.some((item) => item.delivered) && tracked.some((item) => item.status === 'Dehired' && !item.delivered));
  const sources = new Set(tracked.flatMap((item) => getMilestones(item).length === 1 ? getMilestones(item) : []));
  assert.deepEqual([...sources].sort(), ['AVAILABLE', 'dischargedDate', 'emptyReturnedDate', 'outgatedDate']);
  assert.equal(new Set(views.map((item) => item.id)).size, views.length);
});

test('refresh adds new milestones without duplicating and keeps vanished containers', () => {
  let state = createInitialState(NOW);
  const before = Object.keys(state.records).length, trackedBefore = state.trackedIds.length;
  const first = simulateRefresh(state, NOW); state = first.state;
  assert.ok(first.outcome.ok);
  if (first.outcome.ok) { assert.equal(first.outcome.added, 2); assert.equal(first.outcome.duplicates, 1); assert.equal(first.outcome.missing, 1); assert.equal(first.outcome.statusChanges, 2); }
  assert.equal(state.trackedIds.length, trackedBefore + 2);
  assert.equal(Object.keys(state.records).length, before);
  assert.equal(new Set(state.trackedIds).size, state.trackedIds.length);
  const vanished = buildViews(state, TODAY).find((item) => item.container === buildDemoFeed(TODAY).frames[0][26].container)!;
  assert.ok(vanished.tracked, 'container missing from the response stays tracked');
  state = simulateRefresh(state, NOW).state;
  assert.equal(state.refreshAttempts, 2);
  assert.ok(state.records[vanished.id] && state.trackedIds.includes(vanished.id), 'still present while absent from two responses');
  assert.equal(Object.keys(state.records).length, before + 1, 'brand-new container appears once');
});

test('replaying the same response is idempotent (no duplicates)', () => {
  const state = createInitialState(NOW);
  const response = buildDemoFeed(TODAY).frames[0];
  const again = mergeOpenTrackResponse(mergeOpenTrackResponse(state, response, NOW).state, [...response, ...response], NOW);
  assert.deepEqual(again.state.trackedIds, state.trackedIds);
  assert.equal(Object.keys(again.state.records).length, Object.keys(state.records).length);
  assert.equal(again.outcome.added, 0); assert.equal(again.outcome.updated, 0);
});

test('container number formatting variants collapse to one container', () => {
  const state = mergeOpenTrackResponse(createInitialState(NOW), [record({ container: 'abcd 123456 7', outgatedDate: TODAY }), record({ container: 'ABCD1234567', outgatedDate: TODAY, lastFreeDay: TODAY })], NOW);
  assert.equal(state.outcome.duplicates, 1); assert.equal(state.outcome.added, 1);
  assert.equal(state.state.records['abcd1234567'].container, 'ABCD 123456 7');
});

test('every third refresh fails and keeps all data, notification state and edits', () => {
  let state = createInitialState(NOW);
  state = saveUserFields(state, state.trackedIds[0], { notes: 'keep me' });
  state = simulateRefresh(state, NOW).state; state = simulateRefresh(state, NOW).state;
  const snapshot = JSON.stringify({ records: state.records, trackedIds: state.trackedIds, userFields: state.userFields, feedIndex: state.feedIndex, lastSyncedAt: state.lastSyncedAt });
  const failed = simulateRefresh(state, NOW);
  assert.equal(failed.outcome.ok, false);
  assert.equal(failed.state.connection, 'failed'); assert.ok(failed.state.lastError);
  assert.equal(JSON.stringify({ records: failed.state.records, trackedIds: failed.state.trackedIds, userFields: failed.state.userFields, feedIndex: failed.state.feedIndex, lastSyncedAt: failed.state.lastSyncedAt }), snapshot);
  const recovered = simulateRefresh(failed.state, NOW);
  assert.ok(recovered.outcome.ok); assert.equal(recovered.state.connection, 'connected'); assert.equal(recovered.state.lastError, undefined);
});

test('user edits are separate from OpenTrack data and survive refreshes, including for untracked containers', () => {
  let state = createInitialState(NOW);
  const untracked = buildViews(state, TODAY).find((item) => !item.tracked && !item.user.destination)!;
  const tracked = buildViews(state, TODAY).find((item) => item.tracked && !item.user.destination)!;
  const edit = { destination: 'Atlanta, GA', carrier: 'Priority 1', appointment: TODAY, deliveredDate: off(-1), notes: 'call ahead' };
  state = saveUserFields(saveUserFields(state, untracked.id, edit), tracked.id, edit);
  assert.deepEqual(state.records, createInitialState(NOW).records, 'OpenTrack fields untouched by edits');
  for (let i = 0; i < 7; i++) state = simulateRefresh(state, NOW).state;
  for (const id of [untracked.id, tracked.id]) assert.deepEqual(state.userFields[id], edit);
  state = saveUserFields(state, tracked.id, { notes: '', carrier: ' ' });
  assert.deepEqual(state.userFields[tracked.id], { destination: 'Atlanta, GA', appointment: TODAY, deliveredDate: off(-1) });
  assert.equal(saveUserFields(state, 'nope', { notes: 'x' }), state);
});

test('containers move between active and Delivered as fields are completed and keep their fields', () => {
  let state = createInitialState(NOW);
  const target = buildViews(state, TODAY).find((item) => item.status === 'Dehired' && !item.user.destination && !item.user.carrier && !item.user.deliveredDate)!;
  const find = () => buildViews(state, TODAY).find((item) => item.id === target.id)!;
  assert.equal(find().delivered, false);
  state = saveUserFields(state, target.id, { destination: 'Richmond, VA', carrier: 'Priority 1', notes: 'n' });
  assert.equal(find().delivered, false, 'two of three fields is not enough');
  state = saveUserFields(state, target.id, { deliveredDate: off(-1) });
  assert.equal(find().delivered, true); assert.equal(find().user.notes, 'n');
  state = saveUserFields(state, target.id, { carrier: '' });
  assert.equal(find().delivered, false, 'clearing a field moves it back to active');
  assert.equal(find().user.destination, 'Richmond, VA');
  // A container completed while untracked goes straight to Delivered once a milestone arrives.
  const pending = buildViews(state, TODAY).find((item) => !item.tracked)!;
  state = saveUserFields(state, pending.id, { destination: 'A', carrier: 'B', deliveredDate: off(-1) });
  assert.equal(buildViews(state, TODAY).find((item) => item.id === pending.id)!.delivered, false);
  state = mergeOpenTrackResponse(state, [{ ...state.records[pending.id], dischargedDate: off(-1) }], NOW).state;
  assert.equal(buildViews(state, TODAY).find((item) => item.id === pending.id)!.delivered, true);
});

test('dashboard numbers on the initial demo data match the client reference', () => {
  const { active, inTransit, deliveredRecent, metrics, summary } = getDashboardCounts(buildViews(createInitialState(NOW), TODAY), TODAY);
  assert.equal(active, 122); assert.equal(inTransit, 169); assert.equal(deliveredRecent, 13);
  assert.deepEqual(Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, value.count])), { 'At origin': 0, 'On water / arriving': 169, 'Not collected': 17, 'At warehouse': 28, Dehired: 77, Delivered: 19 });
  assert.equal(metrics['Not collected'].count + metrics['At warehouse'].count + metrics.Dehired.count, active);
  assert.equal(metrics['Not collected'].red, 1); assert.equal(metrics['At warehouse'].red, 0); assert.equal(metrics.Dehired.red, 57);
  assert.equal(summary['Awaiting destination'], 62); assert.equal(summary.Overdue, 58);
  assert.equal(summary.Overdue, metrics['Not collected'].red + metrics['At warehouse'].red + metrics.Dehired.red);
});
