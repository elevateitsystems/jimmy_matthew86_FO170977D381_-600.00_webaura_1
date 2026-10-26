/** One event in an OpenTrack container history, e.g. { type: 'AVAILABLE', date: '2026-10-19' }. */
export type OpenTrackEvent = { type: string; date: string };

/** Fields that come from OpenTrack. Never edited by users and replaced wholesale on refresh. */
export type OpenTrackRecord = {
  container: string; mbl: string; size: string; origin: string; port: string; line: string; vessel: string; eta?: string;
  history: OpenTrackEvent[];
  dischargedDate?: string; outgatedDate?: string; emptyReturnedDate?: string; lastFreeDay?: string; detentionLastFreeDay?: string;
};

/** Fields entered by staff. Stored separately from OpenTrack data so a refresh can never overwrite them. */
export type UserFields = { destination?: string; carrier?: string; appointment?: string; deliveredDate?: string; notes?: string; driver?: string; truckNumber?: string; destinationAddress?: string; contactName?: string; contactPhone?: string };

const normalize = (value: string) => value.replace(/[^a-z0-9]/gi, '').toUpperCase();
export const containerId = (container: string) => normalize(container).toLowerCase();
export function formatContainerNumber(container: string) { const key = normalize(container); return /^[A-Z]{4}\d{7}$/.test(key) ? `${key.slice(0, 4)} ${key.slice(4, 10)} ${key.slice(10)}` : key; }
