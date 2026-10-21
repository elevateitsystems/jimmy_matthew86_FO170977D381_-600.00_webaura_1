import { addDays } from './dates.ts';

/** One event in an OpenTrack container history, e.g. { type: 'AVAILABLE', date: '2026-10-19' }. */
export type OpenTrackEvent = { type: string; date: string };

/** Fields that come from (demo) OpenTrack. Never edited by users and replaced wholesale on refresh. */
export type OpenTrackRecord = {
  container: string; mbl: string; size: string; origin: string; port: string; line: string; vessel: string; eta?: string;
  history: OpenTrackEvent[];
  dischargedDate?: string; outgatedDate?: string; emptyReturnedDate?: string; lastFreeDay?: string; detentionLastFreeDay?: string;
};

/** Fields entered by staff. Stored separately from OpenTrack data so a refresh can never overwrite them. */
export type UserFields = { destination?: string; carrier?: string; appointment?: string; deliveredDate?: string; notes?: string; driver?: string; truckNumber?: string; destinationAddress?: string; contactName?: string; contactPhone?: string };

export const DEMO_STORAGE_KEY = 'jm_container_tracker_v2';

const normalize = (value: string) => value.replace(/[^a-z0-9]/gi, '').toUpperCase();
export const containerId = (container: string) => normalize(container).toLowerCase();
export function formatContainerNumber(container: string) { const key = normalize(container); return /^[A-Z]{4}\d{7}$/.test(key) ? `${key.slice(0, 4)} ${key.slice(4, 10)} ${key.slice(10)}` : key; }

const routes = [['Ningbo, CN', 'Norfolk · NIT', 'Richmond, VA', 'Maersk', 'HAIPHONG EXPRESS'], ['Yantian, CN', 'Norfolk · NIT', 'Landover, MD', 'Maersk', 'MAERSK EDIRNE'], ['Shanghai, CN', 'Houston · Bayport', 'Commerce, TX', 'MSC', 'MSC VIVIANA'], ['Qingdao, CN', 'Baltimore · Seagirt', 'Baltimore, MD', 'CMA CGM', 'CMA CGM TANYA'], ['Busan, KR', 'Savannah · Garden City', 'Atlanta, GA', 'Hapag-Lloyd', 'ALGOLUNA']] as const;
const carriers = ['Middle Bay Transportation LLC', 'Chesapeake Haulage', 'Priority 1', 'Triangle Freight'] as const;

/** A date given as a day offset from today, literal text (to simulate bad data), or null/undefined for "absent". */
type DateSpec = number | string | null;
type Milestones = { gateIn?: number; loaded?: number; arrived?: number; discharged?: number; available?: number; outgated?: number; emptyReturned?: DateSpec; eta?: number; lastFreeDay?: DateSpec; detentionLastFreeDay?: DateSpec };

function baseRecord(index: number): OpenTrackRecord {
  const route = routes[index % routes.length], prefix = ['HASU', 'MRKU', 'TCNU', 'TGHU', 'MSCU', 'SEKU', 'CMAU'][index % 7], number = String(401413 + index * 137).padStart(6, '0').slice(-6);
  return { container: formatContainerNumber(`${prefix}${number}${index % 10}`), mbl: `${272932148 + (index % 8) * 14987}`, size: index % 4 === 0 ? '20' : '40HC (45G1)', origin: route[0], port: route[1], line: route[3], vessel: route[4], history: [] };
}

/** Adds milestones to a record the way a later OpenTrack response would: date fields plus matching history events. */
function withMilestones(record: OpenTrackRecord, today: string, m: Milestones): OpenTrackRecord {
  const at = (spec: DateSpec | undefined) => (typeof spec === 'number' ? addDays(today, spec) : spec ?? undefined);
  const next: OpenTrackRecord = { ...record, history: [...record.history] };
  const event = (type: string, spec: DateSpec | undefined) => { if (spec === undefined) return; next.history = next.history.filter((item) => item.type !== type); next.history.push({ type, date: at(spec)! }); };
  event('GATE_IN', m.gateIn); event('LOADED', m.loaded); event('VESSEL_ARRIVED', m.arrived); event('DISCHARGED', m.discharged); event('AVAILABLE', m.available); event('OUTGATED', m.outgated); event('EMPTY_RETURNED', m.emptyReturned);
  if (m.discharged !== undefined) next.dischargedDate = at(m.discharged);
  if (m.outgated !== undefined) next.outgatedDate = at(m.outgated);
  if (m.emptyReturned !== undefined) next.emptyReturnedDate = at(m.emptyReturned);
  if ('lastFreeDay' in m) next.lastFreeDay = at(m.lastFreeDay);
  if ('detentionLastFreeDay' in m) next.detentionLastFreeDay = at(m.detentionLastFreeDay);
  if (m.eta !== undefined) next.eta = at(m.eta); else if (m.arrived !== undefined) next.eta = at(m.arrived);
  next.history.sort((a, b) => a.date.localeCompare(b.date));
  return next;
}

/** A vessel that arrived and was discharged `ago` days ago and is now AVAILABLE. */
const landed = (ago: number): Milestones => ({ loaded: -ago - 25, arrived: -ago - 3, discharged: -ago - 1, available: -ago });
/** A container whose empty was returned `days` days ago (outgated three days before that). */
const dehired = (days: number): Milestones => ({ ...landed(days + 8), outgated: -days - 3, emptyReturned: -days, lastFreeDay: -days - 2, detentionLastFreeDay: -days + 4 });

// Index → milestones. Indexes 0–29 cover every detection, status and date-colour scenario; 30+ have not reached a tracking milestone yet.
const scenarios: Milestones[] = [
  // Not collected: last free day 7, 3 (normal), 2, 1, 0 (amber), -1, -5 (red), missing, unparsable; then AVAILABLE-only and dischargedDate-only detection.
  { ...landed(3), lastFreeDay: 7 }, { ...landed(4), lastFreeDay: 3 }, { ...landed(5), lastFreeDay: 2 }, { ...landed(5), lastFreeDay: 1 }, { ...landed(6), lastFreeDay: 0 }, { ...landed(7), lastFreeDay: -1 }, { ...landed(12), lastFreeDay: -5 }, { ...landed(2) }, { ...landed(2), lastFreeDay: 'TBD' },
  { loaded: -20, arrived: -2, available: -1, lastFreeDay: 4 }, { loaded: -22, arrived: -3, discharged: -2, lastFreeDay: 9 },
  // At warehouse: detention last free day 6, 3 (normal), 2, 0 (amber), -1, -4 (red), missing; then outgatedDate-only detection and a 1-day amber.
  { ...landed(8), outgated: -2, lastFreeDay: -2, detentionLastFreeDay: 6 }, { ...landed(8), outgated: -3, lastFreeDay: -1, detentionLastFreeDay: 3 }, { ...landed(9), outgated: -4, lastFreeDay: -2, detentionLastFreeDay: 2 }, { ...landed(9), outgated: -5, lastFreeDay: -3, detentionLastFreeDay: 0 }, { ...landed(14), outgated: -9, lastFreeDay: -6, detentionLastFreeDay: -1 }, { ...landed(20), outgated: -14, lastFreeDay: -10, detentionLastFreeDay: -4 }, { ...landed(8), outgated: -3 },
  { loaded: -30, outgated: -1, lastFreeDay: -3, detentionLastFreeDay: 5 }, { ...landed(10), outgated: -6, lastFreeDay: -4, detentionLastFreeDay: 1 },
  // Dehired: 2 and 7 days (normal), 8, 9, 10 (amber), 11, 24 (red); then emptyReturnedDate-only, a passed detention date, and an unparsable date.
  dehired(2), dehired(7), dehired(8), dehired(9), dehired(10), dehired(11), dehired(24), { loaded: -40, emptyReturned: -5 }, { ...dehired(3), outgated: -9, detentionLastFreeDay: -2 }, { ...dehired(1), emptyReturned: 'unknown' },
];
const untrackedCount = 169, untrackedStart = scenarios.length;
function untrackedMilestones(position: number): Milestones {
  return position % 3 === 0 ? { loaded: -22, arrived: -(position % 4), eta: -(position % 4) } : { loaded: -(5 + position % 12), eta: 8 + position % 14 };
}

/** Bulk containers that are on the tracking list, sized so the dashboard totals match the client's reference figures. */
const BULK_NOT_COLLECTED = 7, BULK_AT_WAREHOUSE = 22, BULK_DEHIRED_RED = 55, BULK_DEHIRED_OTHER = [1, 3, 4, 5, 6, 7, 8, 9, 10, 2, 6, 7, 8, 9], BULK_DELIVERED = 13, BULK_WITH_DESTINATION = 57;
type Bulk = { m: Milestones; delivered?: number };
const bulk: Bulk[] = [
  ...Array.from({ length: BULK_NOT_COLLECTED }, (_, i): Bulk => ({ m: { ...landed(2 + i % 4), lastFreeDay: 1 + i % 7 } })),
  ...Array.from({ length: BULK_AT_WAREHOUSE }, (_, i): Bulk => ({ m: { ...landed(9 + i % 5), outgated: -(1 + i % 8), lastFreeDay: -(2 + i % 4), detentionLastFreeDay: i % 11 === 0 ? 1 : 3 + i % 7 } })),
  ...Array.from({ length: BULK_DEHIRED_RED }, (_, i): Bulk => ({ m: dehired(12 + i % 20) })),
  ...BULK_DEHIRED_OTHER.map((days): Bulk => ({ m: dehired(days) })),
  // Delivered: seven in the last 30 days, the rest older.
  ...Array.from({ length: BULK_DELIVERED }, (_, i): Bulk => i < 7 ? { m: dehired(3 + i * 2), delivered: 1 + i * 2 } : { m: dehired(48 + (i - 7) * 6), delivered: 38 + (i - 7) * 6 }),
];
const bulkActive = bulk.length - BULK_DELIVERED;

export function buildDemoFeed(today: string) {
  const bulkStart = untrackedStart + untrackedCount, newContainerIndex = bulkStart + bulk.length;
  const indexes = Array.from({ length: newContainerIndex }, (_, index) => index);
  const base = indexes.map((index) => baseRecord(index));
  const milestones = (index: number) => index < untrackedStart ? scenarios[index] : index < bulkStart ? untrackedMilestones(index - untrackedStart) : bulk[index - bulkStart].m;
  const world0 = base.map((record, index) => withMilestones(record, today, milestones(index)));
  const advance = (world: OpenTrackRecord[], changes: [number, Milestones][]) => changes.reduce((current, [index, m]) => current.map((record) => record.container === base[index].container ? withMilestones(record, today, m) : record), world);
  const without = (world: OpenTrackRecord[], omitted: number[]) => world.filter((record) => !omitted.some((index) => base[index].container === record.container));
  const duplicateOf = (world: OpenTrackRecord[], index: number) => { const original = world.find((record) => record.container === base[index].container)!; return { ...original, container: original.container.replace(/ /g, '') }; };

  // Each frame is the full response of one successful refresh; the world keeps evolving between them.
  const world1 = advance(world0, [[untrackedStart, { discharged: -1, available: 0, lastFreeDay: 5 }], [untrackedStart + 3, { discharged: 0, lastFreeDay: 6 }], [5, { outgated: 0, detentionLastFreeDay: 4 }], [14, { emptyReturned: 0 }], [4, { lastFreeDay: 3 }]]);
  const world2 = [...advance(world1, [[untrackedStart + 6, { available: 0, lastFreeDay: 2 }], [untrackedStart + 9, { outgated: -1, detentionLastFreeDay: 3 }], [untrackedStart + 1, { eta: 6 }]]), withMilestones(baseRecord(newContainerIndex), today, { ...landed(0), lastFreeDay: 5 })];
  const world3 = advance(world2, [[untrackedStart + 12, { discharged: -1, lastFreeDay: 6 }]]);
  const frames = [world0, [...without(world1, [26]), duplicateOf(world1, 2)], without(world2, [26, 15]), world3];

  const destination = (index: number) => routes[index % routes.length][2];
  const seeds: [number, UserFields][] = [
    [20, { destination: destination(20), carrier: carriers[0], appointment: addDays(today, -2), deliveredDate: addDays(today, -1) }],
    [21, { destination: destination(21), carrier: carriers[1], appointment: addDays(today, -4), deliveredDate: addDays(today, -3) }],
    [12, { destination: destination(12), carrier: carriers[2], appointment: addDays(today, -1), deliveredDate: addDays(today, -1) }],
    [22, { destination: destination(22), carrier: carriers[3] }], [23, { destination: destination(23), deliveredDate: addDays(today, -2) }], [24, { carrier: carriers[0], deliveredDate: addDays(today, -1) }],
    [6, { destination: destination(6), carrier: carriers[3], appointment: addDays(today, -6), deliveredDate: addDays(today, -5) }],
    [15, { destination: destination(15), carrier: carriers[0], appointment: addDays(today, -9), deliveredDate: addDays(today, -8) }],
    [16, { destination: destination(16), carrier: carriers[1], appointment: addDays(today, -13), deliveredDate: addDays(today, -12) }],
    [11, { destination: destination(11), carrier: carriers[1], appointment: addDays(today, 1), notes: 'Appointment confirmed with the receiving desk.' }],
    [untrackedStart, { destination: destination(untrackedStart), carrier: carriers[2], appointment: addDays(today, 9), notes: 'Pre-booked before arrival.' }],
  ];
  bulk.forEach((item, position) => {
    const index = bulkStart + position;
    if (item.delivered !== undefined) { seeds.push([index, { destination: destination(index), carrier: carriers[index % 4], appointment: addDays(today, -item.delivered - 1), deliveredDate: addDays(today, -item.delivered) }]); return; }
    // (57 × k) mod 98 visits every residue once, so exactly BULK_WITH_DESTINATION of the active bulk containers get a destination.
    if ((position * BULK_WITH_DESTINATION) % bulkActive < BULK_WITH_DESTINATION) seeds.push([index, { destination: destination(index), carrier: carriers[index % 4], ...(position % 5 === 0 ? { appointment: addDays(today, 2 + position % 6) } : {}) }]);
  });
  const userFields = Object.fromEntries(seeds.map(([index, fields]) => [containerId(base[index].container), fields]));
  return { frames, userFields };
}
