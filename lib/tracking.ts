import { buildDemoFeed, containerId, formatContainerNumber } from './data.ts';
import type { OpenTrackEvent, OpenTrackRecord, UserFields } from './data.ts';
import { diffDays, formatTime, todayISO } from './dates.ts';

export type ContainerStatus = 'Not collected' | 'At warehouse' | 'Dehired' | 'Not tracked';
export type Tone = 'red' | 'amber' | 'normal';
export type Milestone = 'AVAILABLE' | 'dischargedDate' | 'outgatedDate' | 'emptyReturnedDate';

/** Amber when this many days (or fewer) remain; red once the date has passed. */
export const AMBER_DAYS = 2;
/** Dehired containers go amber at 8 days since the empty was returned and red after this many. */
export const DEHIRE_LIMIT_DAYS = 10;
/** Every Nth refresh attempt fails, to demonstrate the connection-error behaviour. */
export const FAILURE_EVERY = 3;

export type TrackerState = {
  version: 1;
  /** Every OpenTrack record ever received, keyed by container id. Records are never removed. */
  records: Record<string, OpenTrackRecord>;
  /** Containers added to the tracking list, in the order they were added. Containers are never un-tracked. */
  trackedIds: string[];
  /** Staff-entered fields, keyed by container id. Never touched by a refresh. */
  userFields: Record<string, UserFields>;
  refreshAttempts: number;
  /** Index of the next demo OpenTrack response to serve. */
  feedIndex: number;
  lastSyncedAt: string;
  connection: 'connected' | 'failed';
  lastError?: string;
};

export type ContainerView = OpenTrackRecord & {
  id: string; user: UserFields; tracked: boolean; delivered: boolean; status: ContainerStatus; tone: Tone;
  /** Label and value of the date that drives the status (e.g. "Detention last free day"). */
  dateLabel: string; dateValue?: string;
  /** Days left until the deadline (negative once passed); for Dehired, days left until the 10-day limit. Null when the date is missing or invalid. */
  daysRemaining: number | null; daysText: string;
};

export type RefreshOutcome =
  | { ok: true; received: number; duplicates: number; added: number; updated: number; statusChanges: number; missing: number }
  | { ok: false; error: string };

const present = (value?: string | null): value is string => typeof value === 'string' && value.trim() !== '';

/** Which tracking milestones a record contains. Any one of them adds the container to the tracking list. */
export function getMilestones(record: OpenTrackRecord): Milestone[] {
  const found: Milestone[] = [];
  if ((record.history ?? []).some((event) => event.type?.trim().toUpperCase() === 'AVAILABLE')) found.push('AVAILABLE');
  if (present(record.dischargedDate)) found.push('dischargedDate');
  if (present(record.outgatedDate)) found.push('outgatedDate');
  if (present(record.emptyReturnedDate)) found.push('emptyReturnedDate');
  return found;
}
export const hasTrackingMilestone = (record: OpenTrackRecord) => getMilestones(record).length > 0;

/** Priority: Dehired (empty returned) → At warehouse (outgated) → Not collected. */
export function getStatus(record: OpenTrackRecord): Exclude<ContainerStatus, 'Not tracked'> {
  if (present(record.emptyReturnedDate)) return 'Dehired';
  if (present(record.outgatedDate)) return 'At warehouse';
  return 'Not collected';
}

/** A container moves to the Delivered list only when destination, carrier and delivered date are all filled in. */
export const isDelivered = (user: UserFields) => present(user.destination) && present(user.carrier) && present(user.deliveredDate);

/** Calendar days until the relevant deadline, negative once it has passed. Dehired counts against the 10-day limit. */
export function getDaysRemaining(record: OpenTrackRecord, status: ContainerStatus, today: string): number | null {
  if (status === 'Dehired') { const since = diffDays(record.emptyReturnedDate, today); return since === null ? null : DEHIRE_LIMIT_DAYS - since; }
  if (status === 'At warehouse') return diffDays(today, record.detentionLastFreeDay);
  if (status === 'Not collected') return diffDays(today, record.lastFreeDay);
  return null;
}
export const getTone = (daysRemaining: number | null): Tone => daysRemaining === null || daysRemaining > AMBER_DAYS ? 'normal' : daysRemaining < 0 ? 'red' : 'amber';

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;
function describeDays(status: ContainerStatus, daysRemaining: number | null): string {
  if (status === 'Not tracked') return '—';
  if (daysRemaining === null) return 'No date';
  if (status === 'Dehired') { const since = DEHIRE_LIMIT_DAYS - daysRemaining; return since <= 0 ? 'Returned today' : `${plural(since, 'day')} since return`; }
  return daysRemaining < 0 ? `${plural(-daysRemaining, 'day')} overdue` : daysRemaining === 0 ? 'Due today' : `${plural(daysRemaining, 'day')} left`;
}

export function buildView(id: string, record: OpenTrackRecord, user: UserFields, tracked: boolean, today: string): ContainerView {
  const status: ContainerStatus = tracked ? getStatus(record) : 'Not tracked';
  const delivered = tracked && isDelivered(user);
  const daysRemaining = getDaysRemaining(record, status, today);
  const [dateLabel, dateValue] = status === 'Dehired' ? ['Empty returned', record.emptyReturnedDate] : status === 'At warehouse' ? ['Detention last free day', record.detentionLastFreeDay] : status === 'Not collected' ? ['Last free day', record.lastFreeDay] : ['ETA', record.eta];
  // Deadlines no longer matter once a container is delivered, so it is never highlighted.
  return { ...record, id, user, tracked, delivered, status, tone: delivered ? 'normal' : getTone(daysRemaining), dateLabel, dateValue, daysRemaining, daysText: describeDays(status, daysRemaining) };
}

export function buildViews(state: TrackerState, today: string = todayISO()): ContainerView[] {
  const tracked = new Set(state.trackedIds);
  return Object.entries(state.records).map(([id, record]) => buildView(id, record, state.userFields[id] ?? {}, tracked.has(id), today));
}

const toneRank: Record<Tone, number> = { red: 0, amber: 1, normal: 2 };
/** Red first, then amber, then normal. Within a tone: soonest deadline first (missing dates last), delivered last, newest delivery first. */
export function compareContainers(a: ContainerView, b: ContainerView): number {
  return toneRank[a.tone] - toneRank[b.tone]
    || Number(a.delivered) - Number(b.delivered)
    || (a.delivered ? (b.user.deliveredDate ?? '').localeCompare(a.user.deliveredDate ?? '') : (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity) || 0)
    || a.container.localeCompare(b.container);
}
export const sortContainers = (views: ContainerView[]) => [...views].sort(compareContainers);

const EVENT_LABELS: Record<string, [string, string]> = {
  GATE_IN: ['Gate in at origin', 'Container received at the origin terminal.'], LOADED: ['Loaded on vessel', 'Loaded at origin port.'], VESSEL_ARRIVED: ['Vessel arrived', 'Vessel arrived at the destination port.'],
  DISCHARGED: ['Discharged from vessel', 'Discharged at the destination terminal.'], AVAILABLE: ['Available for pickup', 'Released and available at the terminal.'], OUTGATED: ['Out-gated from terminal', 'Full container released to the dray carrier.'], EMPTY_RETURNED: ['Empty returned', 'Empty container returned (dehired).'],
};
/** OpenTrack history, newest first, plus any milestone dates that have no matching history event. */
export function buildTimeline(record: OpenTrackRecord): { title: string; date: string; desc: string }[] {
  const events: OpenTrackEvent[] = [...(record.history ?? [])];
  const fromFields: [string, string | undefined][] = [['DISCHARGED', record.dischargedDate], ['OUTGATED', record.outgatedDate], ['EMPTY_RETURNED', record.emptyReturnedDate]];
  for (const [type, date] of fromFields) if (present(date) && !events.some((event) => event.type === type)) events.push({ type, date });
  return events.sort((a, b) => b.date.localeCompare(a.date)).map((event) => { const [title, desc] = EVENT_LABELS[event.type] ?? [event.type, 'Reported by OpenTrack.']; return { title, date: event.date, desc }; });
}

export function createInitialState(now: Date = new Date()): TrackerState {
  const { frames, userFields } = buildDemoFeed(todayISO(now));
  const empty: TrackerState = { version: 1, records: {}, trackedIds: [], userFields, refreshAttempts: 0, feedIndex: 1, lastSyncedAt: now.toISOString(), connection: 'connected' };
  return mergeOpenTrackResponse(empty, frames[0], now).state;
}

/**
 * Applies one OpenTrack response. Duplicate rows (same container number in any formatting) collapse to one, the last row wins;
 * new containers are tracked when they contain a milestone; containers missing from the response are kept; user fields are untouched.
 */
export function mergeOpenTrackResponse(state: TrackerState, response: OpenTrackRecord[], now: Date = new Date()): { state: TrackerState; outcome: Extract<RefreshOutcome, { ok: true }> } {
  const unique = new Map<string, OpenTrackRecord>();
  for (const row of response) { const id = containerId(row.container); if (id) unique.set(id, { ...row, history: row.history ?? [], container: formatContainerNumber(row.container) }); }
  const records = { ...state.records }, trackedIds = [...state.trackedIds], tracked = new Set(trackedIds);
  let added = 0, updated = 0, statusChanges = 0;
  for (const [id, next] of unique) {
    const previous = records[id];
    if (previous && JSON.stringify(previous) !== JSON.stringify(next)) updated++;
    if (previous && tracked.has(id) && getStatus(previous) !== getStatus(next)) statusChanges++;
    records[id] = next;
    if (hasTrackingMilestone(next) && !tracked.has(id)) { tracked.add(id); trackedIds.push(id); added++; }
  }
  const missing = Object.keys(state.records).filter((id) => !unique.has(id)).length;
  return { state: { ...state, records, trackedIds, connection: 'connected', lastError: undefined, lastSyncedAt: now.toISOString() }, outcome: { ok: true, received: response.length, duplicates: response.length - unique.size, added, updated, statusChanges, missing } };
}

/** Simulates a refresh: every FAILURE_EVERY-th attempt fails and keeps all current data; otherwise the next demo response is applied. */
export function simulateRefresh(state: TrackerState, now: Date = new Date()): { state: TrackerState; outcome: RefreshOutcome } {
  const attempt = state.refreshAttempts + 1;
  if (attempt % FAILURE_EVERY === 0) {
    const error = 'Could not reach OpenTrack (simulated connection timeout).';
    return { state: { ...state, refreshAttempts: attempt, connection: 'failed', lastError: error }, outcome: { ok: false, error } };
  }
  const { frames } = buildDemoFeed(todayISO(now));
  const merged = mergeOpenTrackResponse(state, frames[Math.min(state.feedIndex, frames.length - 1)], now);
  return { state: { ...merged.state, refreshAttempts: attempt, feedIndex: state.feedIndex + 1 }, outcome: merged.outcome };
}

export function describeOutcome(outcome: RefreshOutcome, state: TrackerState): string {
  if (!outcome.ok) return `${outcome.error} Showing the data last synced at ${formatTime(state.lastSyncedAt)}; your edits are unchanged.`;
  const parts = [`${outcome.added} added to tracking`, `${outcome.updated} updated`, `${outcome.statusChanges} status change${outcome.statusChanges === 1 ? '' : 's'}`];
  if (outcome.duplicates) parts.push(`${outcome.duplicates} duplicate row${outcome.duplicates === 1 ? '' : 's'} ignored`);
  if (outcome.missing) parts.push(`${outcome.missing} not in response (kept)`);
  return `OpenTrack demo data refreshed: ${parts.join(' · ')}.`;
}

/** Merges staff edits into one container's user fields. Blank values clear a field. Works for containers that are not tracked yet. */
export function saveUserFields(state: TrackerState, id: string, patch: UserFields): TrackerState {
  if (!state.records[id]) return state;
  const next: Record<string, string> = { ...state.userFields[id] };
  for (const [key, value] of Object.entries(patch)) { const text = (value ?? '').trim(); if (text) next[key] = text; else delete next[key]; }
  return { ...state, userFields: { ...state.userFields, [id]: next } };
}
