import { ApiError } from './api';
import { containerId } from './data';
import type { UserFields, OpenTrackRecord } from './data';
import { buildView, getDashboardCounts, getDaysRemaining, getTone, hasTrackingMilestone, isDelivered } from './tracking';
import type { ContainerStatus, ContainerView, MetricCount } from './tracking';
import { dayNumber, todayISO } from './dates';

type ObjectValue = Record<string, unknown>;
export type TimelineEvent = { title: string; date: string; desc: string };
export type BackendContainer = ContainerView & { timeline?: TimelineEvent[]; dateText?: string };
export type DashboardSummary = ReturnType<typeof getDashboardCounts> & { lastSyncedAt?: string; syncFailed?: boolean };
export type WorkspaceSettings = { emailUpdates: boolean; compactTable: boolean; defaultView: 'Active' | 'All containers'; mailConfigured?: boolean; alertEmail?: string };
export type ContainerQuery = { view?: 'arrived' | 'in_transit' | 'delivered'; bucket?: string; search?: string; page: number; perPage: number };
export type ContainerPage = { rows: BackendContainer[]; total: number; page: number; perPage: number };
export type TrackerView = 'At origin' | 'On water / arriving' | 'Not collected' | 'At warehouse' | 'Dehired' | 'Delivered' | 'Active' | 'All containers' | 'In transit' | 'Awaiting destination' | 'Overdue';

export function trackerFilters(view: TrackerView): Pick<ContainerQuery, 'view' | 'bucket'> {
  const groups: Record<TrackerView, Pick<ContainerQuery, 'view' | 'bucket'>> = {
    Active: { view: 'arrived', bucket: 'open' }, 'All containers': { bucket: 'all' }, 'In transit': { view: 'in_transit' },
    'At origin': { view: 'in_transit', bucket: 'at_origin' }, 'On water / arriving': { view: 'in_transit', bucket: 'on_water' },
    'Not collected': { view: 'arrived', bucket: 'not_collected' }, 'At warehouse': { view: 'arrived', bucket: 'at_warehouse' }, Dehired: { view: 'arrived', bucket: 'dehired' },
    Delivered: { view: 'delivered', bucket: 'delivered' }, 'Awaiting destination': { view: 'arrived', bucket: 'no_destination' }, Overdue: { view: 'arrived', bucket: 'overdue' },
  };
  return groups[view];
}

export function allContainersQuery(filters: Partial<ContainerQuery> = {}): ContainerQuery {
  // bucket=all overrides view on this backend. Do not add it to a transit export.
  return { ...(!filters.view && !filters.bucket ? { bucket: 'all' } : {}), ...filters, page: 1, perPage: 100 };
}

export function object(value: unknown): ObjectValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}; }
export function unwrap(value: unknown): unknown { const root = object(value); return root.data !== undefined ? root.data : value; }
const text = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const number = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const labelKey = (value: unknown): string => text(value).toLowerCase().replace(/[^a-z0-9]/g, '');

export function inputDate(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = us ? `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}` : raw.slice(0, 10);
  return dayNumber(iso) === null ? undefined : iso;
}

export function apiDate(value: string): string {
  if (!value) return '';
  const iso = inputDate(value);
  if (!iso) throw new ApiError('Choose a valid date before saving.', 400);
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

export function staffPatch(fields: UserFields): Record<string, string> {
  const names: Record<keyof UserFields, string> = { destination: 'destination', carrier: 'carrier', appointment: 'appointmentAt', deliveredDate: 'deliveredAt', driver: 'driverName', truckNumber: 'truckNumber', contactName: 'receivingContact', contactPhone: 'contactPhone', destinationAddress: 'deliveryAddress', notes: 'notes' };
  const patch: Record<string, string> = {};
  for (const key of Object.keys(fields) as (keyof UserFields)[]) {
    if (fields[key] === undefined || !names[key]) continue;
    const value = fields[key]!.trim();
    patch[names[key]] = key === 'appointment' || key === 'deliveredDate' ? apiDate(value) : value;
  }
  return patch;
}

export function changedUserFields(original: UserFields, edited: UserFields): UserFields {
  const patch: UserFields = {};
  for (const key of Object.keys(edited) as (keyof UserFields)[]) if ((edited[key] ?? '').trim() !== (original[key] ?? '').trim()) patch[key] = edited[key] ?? '';
  return patch;
}

export function containerNumber(value: string) { return value.replace(/[^a-z0-9]/gi, '').toUpperCase(); }

export function parseContainer(value: unknown): BackendContainer {
  const unwrapped = object(unwrap(value));
  const row = typeof unwrapped.container === 'object' ? object(unwrapped.container) : unwrapped;
  const numberValue = containerNumber(text(row.containerNumber ?? row.container ?? row.number));
  if (!/^[A-Z]{4}\d{7}$/.test(numberValue)) throw new ApiError('The backend returned a container without a valid container number.', 502);
  const staff = { ...row, ...object(row.staffFields), ...object(row.userFields), ...object(row.delivery), ...object(row.user) };
  const user: UserFields = {
    destination: text(staff.destination), carrier: text(staff.carrier), appointment: inputDate(staff.appointmentAt ?? staff.appointment), deliveredDate: inputDate(staff.deliveredAt ?? staff.deliveredDate),
    driver: text(staff.driverName ?? staff.driver), truckNumber: text(staff.truckNumber), contactName: text(staff.receivingContact ?? staff.contactName), contactPhone: text(staff.contactPhone), destinationAddress: text(staff.deliveryAddress ?? staff.destinationAddress), notes: text(staff.notes),
  };
  const history = Array.isArray(row.history) ? row.history : Array.isArray(row.events) ? row.events : [];
  const record: OpenTrackRecord = {
    container: numberValue, mbl: text(row.mbl ?? row.masterBill ?? row.masterBillNumber), size: text(row.size ?? row.equipmentSize ?? row.equipmentType), origin: text(row.origin ?? row.originName ?? row.originPort), port: text(row.port ?? row.portTerminal ?? row.destinationPort), line: text(row.line ?? row.steamshipLine ?? row.shippingLine), vessel: text(row.vessel ?? row.vesselName),
    eta: inputDate(row.eta ?? row.etaAtTerminal), dischargedDate: inputDate(row.dischargedDate ?? row.dischargedAt), outgatedDate: inputDate(row.outgatedDate ?? row.outgatedAt), emptyReturnedDate: inputDate(row.emptyReturnedDate ?? row.emptyReturnedAt), lastFreeDay: inputDate(row.lastFreeDay ?? row.terminalLastFreeDay), detentionLastFreeDay: inputDate(row.detentionLastFreeDay),
    history: history.map((event) => object(event)).map((event) => ({ type: text(event.type ?? event.eventType), date: text(event.date ?? event.occurredAt ?? event.timestamp) })),
  };
  const statusKey = labelKey(row.status ?? row.trackingStatus);
  const transit = ['atorigin', 'onwater', 'onwaterarriving', 'intransit', 'nottracked'].includes(statusKey);
  const statusMap: Record<string, ContainerStatus> = { notcollected: 'Not collected', atwarehouse: 'At warehouse', dehired: 'Dehired', nottracked: 'Not tracked', emptyreturned: 'Dehired', fulloutgated: 'At warehouse', available: 'Not collected', discharged: 'Not collected' };
  const tracked = typeof row.onOperationsList === 'boolean' ? row.onOperationsList : typeof row.tracked === 'boolean' ? row.tracked : typeof row.isTracked === 'boolean' ? row.isTracked : !transit && (hasTrackingMilestone(record) || !!statusMap[statusKey] || statusKey === 'delivered' || row.delivered === true || row.isDelivered === true);
  const result: BackendContainer = buildView(containerId(numberValue), record, user, tracked, todayISO());
  const status = statusMap[statusKey] ?? (statusKey === 'delivered' ? statusMap[labelKey(row.trackingStatus)] : undefined) ?? result.status;
  if (status !== result.status) {
    result.status = status;
    result.daysRemaining = getDaysRemaining(record, status, todayISO());
    result.tone = getTone(result.daysRemaining);
    result.dateLabel = status === 'Dehired' ? 'Empty returned' : status === 'At warehouse' ? 'Detention last free day' : status === 'Not collected' ? 'Last free day' : 'ETA';
    result.dateValue = status === 'Dehired' ? record.emptyReturnedDate : status === 'At warehouse' ? record.detentionLastFreeDay : status === 'Not collected' ? record.lastFreeDay : record.eta;
    const remaining = result.daysRemaining;
    if (remaining === null) result.daysText = status === 'Not tracked' ? '—' : 'No date';
    else if (status === 'Dehired') result.daysText = `${10 - remaining} days since return`;
    else result.daysText = remaining < 0 ? `${-remaining} days overdue` : remaining === 0 ? 'Due today' : `${remaining} days left`;
  }
  result.delivered = typeof row.delivered === 'boolean' ? row.delivered : typeof row.isDelivered === 'boolean' ? row.isDelivered : statusKey === 'delivered' || tracked && isDelivered(user);
  const stage = labelKey(row.stage ?? row.transitStage ?? row.status);
  if (!tracked) result.stage = stage === 'atorigin' ? 'At origin' : stage.includes('water') || stage === 'intransit' ? 'On water / arriving' : result.stage;
  const days = object(row.days);
  const tone = text(row.tone ?? row.urgency ?? days.tone).toLowerCase();
  if (['red', 'amber', 'normal'].includes(tone)) result.tone = tone as ContainerView['tone'];
  if (result.delivered || tone === 'none' || !tracked) result.tone = 'normal';
  if (typeof (row.daysRemaining ?? row.daysUntil) === 'number') result.daysRemaining = number(row.daysRemaining ?? row.daysUntil);
  if (typeof (row.daysText ?? row.daysLabel ?? days.text) === 'string') result.daysText = text(row.daysText ?? row.daysLabel ?? days.text);
  const keyDate = object(row.keyDate);
  if (row.dateLabel || row.keyDateLabel || keyDate.label) result.dateLabel = text(row.dateLabel ?? row.keyDateLabel ?? keyDate.label);
  result.dateValue = inputDate(row.dateValue ?? row.keyDateValue ?? keyDate.value ?? keyDate.date ?? (typeof row.keyDate === 'string' ? row.keyDate : undefined)) ?? result.dateValue;
  result.dateText = text(row.keyDateText) || undefined;
  if (Array.isArray(row.timeline)) result.timeline = row.timeline.map((entry) => { const event = object(entry); return { title: text(event.title ?? event.label ?? event.type), date: text(event.date ?? event.occurredAt ?? event.timestamp), desc: text(event.desc ?? event.description) }; });
  return result;
}

export function parsePage(payload: unknown, query: ContainerQuery): ContainerPage {
  const root = object(payload);
  const data = unwrap(payload);
  const body = object(data);
  const rows = Array.isArray(data) ? data : body.items ?? body.containers ?? body.rows ?? body.results;
  if (!Array.isArray(rows)) throw new ApiError('The container list response must include an items or containers array.', 502);
  const meta = { ...root, ...object(root.meta), ...object(root.pagination), ...body, ...object(body.meta), ...object(body.pagination) };
  return { rows: rows.map(parseContainer), total: number(meta.total ?? meta.totalItems ?? meta.totalCount, rows.length), page: number(meta.page, query.page), perPage: number(meta.perPage ?? meta.pageSize, query.perPage) };
}

export function parseSummary(payload: unknown): DashboardSummary {
  const body = object(unwrap(payload));
  const metrics = body.metrics ?? body.cards ?? body.counts ?? body.totals ?? body;
  const entries = Array.isArray(metrics) ? metrics : Object.entries(object(metrics)).map(([key, value]) => ({ key, ...typeof value === 'number' ? { count: value } : object(value) }));
  const find = (keys: string[]) => entries.find((entry) => { const row = object(entry); return keys.includes(labelKey(row.key ?? row.id ?? row.label ?? row.status)); });
  const read = (keys: string[]): MetricCount => {
    const item = object(find(keys));
    return { count: number(item.count ?? item.total ?? item.value), red: number(item.red ?? item.overdue ?? item.overdueCount), amber: number(item.amber ?? item.dueSoon ?? item.dueSoonCount) };
  };
  if (!entries.length || !find(['atorigin', 'notcollected', 'atwarehouse', 'delivered', 'dehired', 'onwater', 'onwaterarriving'])) throw new ApiError('The backend returned an unsupported dashboard summary format.', 502);
  const values = { 'At origin': read(['atorigin']), 'On water / arriving': read(['onwater', 'onwaterarriving']), 'Not collected': read(['notcollected']), 'At warehouse': read(['atwarehouse']), Dehired: read(['dehired']), Delivered: read(['delivered']) };
  values['Not collected'].red = number(body.notCollectedPastLastFreeDay, values['Not collected'].red);
  values.Dehired.red = number(body.dehiredOverTenDays, values.Dehired.red);
  // These three operational states partition the overdue total reported by the API.
  values['At warehouse'].red = number(body.atWarehousePastDetentionLastFreeDay, typeof body.overdue === 'number' ? Math.max(0, body.overdue - values['Not collected'].red - values.Dehired.red) : values['At warehouse'].red);
  const tabs = object(body.tabs);
  const rawFilters = body.summary ?? body.filters;
  const filters = Array.isArray(rawFilters) ? Object.fromEntries(rawFilters.map(item => { const filter = object(item); return [text(filter.id), filter.count]; })) : object(rawFilters);
  const lastSync = object(body.lastSync);
  return {
    metrics: values,
    active: number(body.active ?? body.arrived ?? body.open ?? tabs.arrived ?? tabs.active, values['Not collected'].count + values['At warehouse'].count + values.Dehired.count),
    inTransit: number(body.inTransit ?? tabs.inTransit ?? tabs.in_transit, values['At origin'].count + values['On water / arriving'].count),
    deliveredRecent: number(body.deliveredRecent ?? body.deliveredLast30Days ?? object(find(['delivered'])).recent),
    summary: { 'Awaiting destination': number(body.noDestination ?? filters['Awaiting destination'] ?? filters.noDestination ?? filters.no_destination), 'Awaiting carrier': number(filters['Awaiting carrier'] ?? filters.noCarrier), 'Booked, not yet delivered': number(filters['Booked, not yet delivered'] ?? filters.booked), 'Due soon': number(filters['Due soon'] ?? filters.dueSoon), Overdue: number(body.overdue ?? filters.Overdue ?? filters.overdue, values['Not collected'].red + values['At warehouse'].red + values.Dehired.red) },
    lastSyncedAt: text(body.lastSyncedAt ?? object(body.sync).lastSyncedAt ?? (lastSync.success === true ? lastSync.finishedAt : undefined)) || undefined,
    syncFailed: lastSync.success === false,
  };
}

export function parseSettings(payload: unknown): WorkspaceSettings {
  const data = object(unwrap(payload));
  const body = { ...data, ...object(data.settings) };
  const mail = object(body.mail);
  if (typeof body.emailUpdates !== 'boolean' || typeof body.compactTable !== 'boolean' || !['Active', 'All containers'].includes(text(body.defaultView))) throw new ApiError('The backend returned invalid workspace settings.', 502);
  return { emailUpdates: body.emailUpdates, compactTable: body.compactTable, defaultView: body.defaultView as WorkspaceSettings['defaultView'], mailConfigured: typeof body.mailConfigured === 'boolean' ? body.mailConfigured : typeof body.emailConfigured === 'boolean' ? body.emailConfigured : typeof mail.configured === 'boolean' ? mail.configured : undefined, alertEmail: text(body.alertEmail ?? body.alertAddress ?? mail.alertEmail) || undefined };
}

export function queryString(query: ContainerQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  return params.toString();
}
