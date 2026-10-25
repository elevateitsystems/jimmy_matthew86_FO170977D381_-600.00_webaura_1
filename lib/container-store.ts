'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { apiJson, ApiError, errorMessage } from './api';
import { allContainersQuery, containerNumber, parseContainer, parsePage, parseSettings, parseSummary, queryString, staffPatch, object, unwrap } from './backend';
import type { BackendContainer, ContainerQuery, DashboardSummary, WorkspaceSettings } from './backend';
import type { UserFields } from './data';

export type Notice = { id: number; tone: 'success' | 'error'; text: string };
type Snapshot = {
  rows: BackendContainer[]; total: number; listKey: string; listLoading: boolean; listError?: string;
  summary?: DashboardSummary; settings?: WorkspaceSettings; metadataLoaded: boolean; metadataLoading: boolean; metadataError?: string;
  refreshing: boolean; notice?: Notice; lastSyncedAt?: string; connection: 'connected' | 'failed' | 'unknown'; revision: number;
  details: Record<string, BackendContainer>; detailLoading: Record<string, boolean>; detailErrors: Record<string, string | undefined>;
  options: BackendContainer[]; optionsLoading: boolean; optionsLoaded: boolean; optionsError?: string;
};
const initial: Snapshot = { rows: [], total: 0, listKey: '', listLoading: false, metadataLoaded: false, metadataLoading: false, refreshing: false, connection: 'unknown', revision: 0, details: {}, detailLoading: {}, detailErrors: {}, options: [], optionsLoading: false, optionsLoaded: false };
let snapshot = initial;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;
const getServerSnapshot = () => initial;
function update(patch: Partial<Snapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); }
export function notify(text: string, tone: Notice['tone'] = 'success') { update({ notice: { id: Date.now(), tone, text } }); }
function dismissNotice() { update({ notice: undefined }); }
let metadataRequest: Promise<void> | undefined;
let listController: AbortController | undefined;
let listRequest = 0;
let currentQuery: ContainerQuery | undefined;
const detailRequests = new Map<string, Promise<BackendContainer>>();

export function loadMetadata(force = false): Promise<void> {
  if (metadataRequest) return metadataRequest;
  if (snapshot.metadataLoaded && !force) return Promise.resolve();
  update({ metadataLoading: true, metadataError: undefined });
  metadataRequest = (async () => {
    const results = await Promise.allSettled([apiJson('/containers/summary').then(parseSummary), apiJson('/settings').then(parseSettings)]);
    const [summary, settings] = results;
    const errors: string[] = [];
    if (summary.status === 'fulfilled') update({ summary: summary.value, lastSyncedAt: summary.value.lastSyncedAt ?? snapshot.lastSyncedAt, connection: summary.value.syncFailed ? 'failed' : 'connected' });
    else errors.push(errorMessage(summary.reason));
    if (settings.status === 'fulfilled') update({ settings: settings.value });
    else errors.push(errorMessage(settings.reason));
    update({ metadataLoading: false, metadataLoaded: true, metadataError: errors.length ? errors.join(' ') : undefined });
  })().finally(() => { metadataRequest = undefined; });
  return metadataRequest;
}

export async function loadList(query: ContainerQuery) {
  currentQuery = query;
  listController?.abort();
  const controller = new AbortController();
  listController = controller;
  const request = ++listRequest;
  update({ listLoading: true, listError: undefined, listKey: queryString(query) });
  try {
    const page = parsePage(await apiJson(`/containers?${queryString(query)}`, { signal: controller.signal }), query);
    if (request === listRequest) update({ rows: page.rows, total: page.total, listLoading: false });
  } catch (error) { if (request === listRequest && !controller.signal.aborted) update({ listLoading: false, listError: errorMessage(error) }); }
}

export async function getAllContainers(filters: Partial<ContainerQuery> = {}): Promise<BackendContainer[]> {
  const query = allContainersQuery(filters);
  const first = parsePage(await apiJson(`/containers?${queryString(query)}`), query);
  const rows = [...first.rows];
  for (let page = 2; page <= Math.ceil(first.total / query.perPage); page++) {
    const nextQuery = { ...query, page };
    const next = parsePage(await apiJson(`/containers?${queryString(nextQuery)}`), nextQuery);
    if (!next.rows.length) throw new Error('The backend returned an incomplete container list. Please try again.');
    rows.push(...next.rows);
  }
  return [...new Map(rows.map(row => [row.id, row])).values()];
}

async function loadOptions() {
  if (snapshot.optionsLoading) return;
  update({ optionsLoading: true, optionsError: undefined });
  try { update({ options: await getAllContainers(), optionsLoaded: true, optionsLoading: false }); }
  catch (error) { update({ optionsError: errorMessage(error), optionsLoading: false }); }
}

export function loadDetail(id: string): Promise<BackendContainer> {
  const key = containerNumber(id).toLowerCase();
  const pending = detailRequests.get(key);
  if (pending) return pending;
  update({ detailLoading: { ...snapshot.detailLoading, [key]: true }, detailErrors: { ...snapshot.detailErrors, [key]: undefined } });
  const request = apiJson(`/containers/${encodeURIComponent(containerNumber(id))}`).then(parseContainer).then(container => {
    update({ details: { ...snapshot.details, [key]: container }, detailLoading: { ...snapshot.detailLoading, [key]: false } });
    return container;
  }).catch(error => {
    update({ detailLoading: { ...snapshot.detailLoading, [key]: false }, detailErrors: { ...snapshot.detailErrors, [key]: errorMessage(error) } });
    throw error;
  }).finally(() => detailRequests.delete(key));
  detailRequests.set(key, request);
  return request;
}

async function refresh() {
  if (snapshot.refreshing) return;
  update({ refreshing: true, notice: undefined });
  try {
    const result = object(unwrap(await apiJson('/containers/sync', { method: 'POST' })));
    if (result.success === false) throw new ApiError(typeof result.message === 'string' ? result.message : 'The shipment feed could not be synced.', 502);
    update({ lastSyncedAt: typeof result.lastSyncedAt === 'string' ? result.lastSyncedAt : new Date().toISOString(), connection: 'connected', revision: snapshot.revision + 1, optionsLoaded: false });
    await loadMetadata(true);
    if (currentQuery) await loadList(currentQuery);
    notify(typeof result.message === 'string' ? result.message : 'Container data synced successfully.');
  } catch (error) { update({ connection: 'failed' }); notify(errorMessage(error), 'error'); }
  finally { update({ refreshing: false }); }
}

export async function saveUserFields(id: string, patch: UserFields) {
  const payload = await apiJson(`/containers/${encodeURIComponent(containerNumber(id))}`, { method: 'PATCH', body: JSON.stringify(staffPatch(patch)) });
  let saved: BackendContainer | undefined;
  try { saved = parseContainer(payload); } catch { /* A successful PATCH may return only a confirmation. Reload below. */ }
  if (saved) update({ details: { ...snapshot.details, [saved.id]: saved } });
  update({ revision: snapshot.revision + 1, optionsLoaded: false });
  void loadMetadata(true);
  if (currentQuery) void loadList(currentQuery);
}

export async function updateSettings(values?: Pick<WorkspaceSettings, 'emailUpdates' | 'compactTable' | 'defaultView'>) {
  const payload = await apiJson(values ? '/settings' : '/settings/reset', { method: values ? 'PATCH' : 'POST', ...values ? { body: JSON.stringify(values) } : {} });
  let settings: WorkspaceSettings;
  try { settings = parseSettings(payload); }
  catch { settings = parseSettings(await apiJson('/settings')); }
  update({ settings });
  return settings;
}

export function useContainerTracker() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { void loadMetadata(); }, []);
  return { ...state, tracker: { lastSyncedAt: state.lastSyncedAt, connection: state.connection }, refresh, dismissNotice, saveUserFields, reloadMetadata: () => loadMetadata(true) };
}

export function useContainerList(query: ContainerQuery, enabled: boolean) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const key = queryString(query);
  useEffect(() => { if (enabled) void loadList(query); }, [key, enabled]);
  return { rows: state.rows, total: state.total, loading: state.listLoading || !enabled || state.listKey !== key, error: state.listError, retry: () => loadList(query) };
}

export function useContainerDetail(id: string) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const key = containerNumber(id).toLowerCase();
  useEffect(() => { void loadDetail(key).catch(() => {}); }, [key, state.revision]);
  return { container: state.details[key], loading: !state.details[key] && (state.detailLoading[key] !== false && !state.detailErrors[key]), error: state.detailErrors[key], retry: () => loadDetail(key).catch(() => {}) };
}

export function useContainerOptions(enabled = true) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { if (enabled && !state.optionsLoaded && !state.optionsLoading) void loadOptions(); }, [state.optionsLoaded, enabled]);
  return { containers: state.options, loading: state.optionsLoading || !state.optionsLoaded && !state.optionsError, error: state.optionsError, retry: loadOptions };
}