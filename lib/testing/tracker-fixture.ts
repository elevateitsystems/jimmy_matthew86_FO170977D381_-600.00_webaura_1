import { buildDemoFeed } from './demo-feed.ts';
import { mergeOpenTrackResponse } from '../tracking.ts';
import type { TrackerState, RefreshOutcome } from '../tracking.ts';
import { todayISO, formatTime } from '../dates.ts';

const FAILURE_EVERY = 3;

export function createInitialState(now: Date = new Date()): TrackerState {
  const { frames, userFields } = buildDemoFeed(todayISO(now));
  const empty: TrackerState = { version: 1, records: {}, trackedIds: [], userFields, refreshAttempts: 0, feedIndex: 1, lastSyncedAt: now.toISOString(), connection: 'connected' };
  return mergeOpenTrackResponse(empty, frames[0], now).state;
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

