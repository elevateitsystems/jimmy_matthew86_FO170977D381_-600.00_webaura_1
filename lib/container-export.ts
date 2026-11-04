import type { BackendContainer } from './backend';
import { formatDate } from './dates';

export function containerExportRow(item: BackendContainer) {
  return {
    Container: item.container,
    MBL: item.mbl,
    Size: item.size,
    'Port · terminal': item.port,
    Status: item.delivered ? 'Delivered' : item.status,
    'Key date': `${item.dateLabel}: ${item.dateText || '—'}`,
    Days: item.daysText,
    'Rail destination': item.railDestination || '',
    'Customer delivery': item.user.destination || '',
    Carrier: item.user.carrier || '',
    Appointment: formatDate(item.user.appointment),
    Delivered: formatDate(item.user.deliveredDate),
    Notes: item.user.notes || '',
  };
}
