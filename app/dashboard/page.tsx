'use client';
import { useMemo, useState } from 'react';
import { Download, Search, SlidersHorizontal } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppShell } from '../../components/layout';
import { ContainerTable, Metrics } from '../../components/shared';
import { ShipmentStatus } from '../../lib/data';
import { useDemoContainers } from '../../lib/container-store';

type SummaryFilter = 'Awaiting destination' | 'Awaiting carrier' | 'Booked, not yet delivered' | '8–10 days since dehire' | 'Over 10 days';
type View = 'All containers' | 'After dehire' | 'In transit' | 'Delivered' | SummaryFilter | ShipmentStatus;
const statuses: ShipmentStatus[] = ['At origin', 'On water', 'At port', 'Out to warehouse', 'After dehire', 'Delivered'];
const summaryFilters: SummaryFilter[] = ['Awaiting destination', 'Awaiting carrier', 'Booked, not yet delivered', '8–10 days since dehire', 'Over 10 days'];

export default function Dashboard() {
  const [containers] = useDemoContainers(); const [query, setQuery] = useState(''); const [view, setView] = useState<View>('After dehire');
  const counts = useMemo(() => Object.fromEntries(statuses.map((status) => [status, containers.filter((item) => item.status === status).length])) as Record<ShipmentStatus, number>, [containers]);
  const dehireRows = useMemo(() => containers.filter((item) => item.status === 'After dehire'), [containers]);
  const matchesSummary = (item: (typeof containers)[number], filter: SummaryFilter) => {
    if (item.status !== 'After dehire') return false;
    if (filter === 'Awaiting destination') return !item.destination;
    if (filter === 'Awaiting carrier') return !item.carrier;
    if (filter === 'Booked, not yet delivered') return Boolean(item.appointment) && !item.deliveredDate;
    if (filter === '8–10 days since dehire') return item.days >= 8 && item.days <= 10;
    return item.days > 10;
  };
  const rows = useMemo(() => containers.filter((item) => {
    const viewMatch = summaryFilters.includes(view as SummaryFilter)
      ? matchesSummary(item, view as SummaryFilter)
      : view === 'All containers' || (view === 'In transit' && ['At origin', 'On water', 'At port', 'Out to warehouse'].includes(item.status)) || item.status === view;
    return viewMatch && [item.container, item.mbl, item.destination, item.carrier].join(' ').toLowerCase().includes(query.toLowerCase());
  }), [containers, query, view]);
  const tabs: [View, string][] = [['After dehire', String(counts['After dehire'])], ['In transit', String(containers.filter((item) => item.status !== 'After dehire' && item.status !== 'Delivered').length)], ['Delivered', String(counts.Delivered)]];
  const filter = statuses.includes(view as ShipmentStatus) ? view : view === 'In transit' ? 'In transit' : 'All';
  const selectFilter = (value: string) => setView(value === 'All' ? 'All containers' : value === 'In transit' ? 'In transit' : value as View);
  const summary = summaryFilters.map((label) => [label, dehireRows.filter((item) => matchesSummary(item, label)).length, label === 'Over 10 days' ? 'red' : ''] as const);
  const isSummaryView = summaryFilters.includes(view as SummaryFilter);
  const isDehireSection = view === 'After dehire' || isSummaryView;
  const exportRows = rows.map((item) => ({ Container: item.container, MBL: item.mbl, Size: item.size, 'Port · terminal': item.port, Dehired: item.status === 'After dehire' ? '' : item.deliveredDate || '', Days: item.days || '', Step: item.milestone, 'Final destination': item.destination, Carrier: item.carrier || '', Appt: item.appointment || '', Notes: item.notes || '' }));
  const exportToExcel = () => { const headers = ['Container', 'MBL', 'Size', 'Port · terminal', 'Dehired', 'Days', 'Step', 'Final destination', 'Carrier', 'Appt', 'Notes']; const sheet = XLSX.utils.json_to_sheet(exportRows, { header: headers }); sheet['!cols'] = [18, 16, 14, 24, 14, 10, 22, 22, 28, 14, 30].map((wch) => ({ wch })); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Containers'); XLSX.writeFile(book, `container-tracking-${view.toLowerCase().replaceAll(' ', '-')}.xlsx`); };
  return <AppShell><div className="content"><div className="title-row"><div><div className="eyebrow">JAVA MARYLAND · IMPORT CONTAINERS</div><h1 className="page-title">Container Tracker</h1></div><button className="secondary-btn" type="button"><SlidersHorizontal size={16}/> Manage views</button></div><Metrics counts={counts} onSelect={(status) => setView(status)}/><div className="tabs">{tabs.map(([label, count]) => <button key={label} className={`tab ${view === label ? 'active' : ''}`} onClick={() => setView(label)}>{label} <span className="muted">{count}</span></button>)}</div>{isDehireSection && <><p className="dashboard-description">Containers land here once they are unpacked and the empty is returned. They stay until a final delivery destination, a carrier and a delivered date are all recorded.</p><div className="summary-cards">{summary.map(([label, value, tone]) => <button type="button" className={`summary-card ${view === label ? 'active' : ''}`} key={label} onClick={() => setView(label)} aria-pressed={view === label}><div>{label}</div><strong className={tone}>{value}</strong></button>)}</div></>}<div className="panel"><div className="toolbar"><div className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search container, MBL, destination, carrier" aria-label="Search containers"/></div><select className="filter" value={filter} onChange={(event) => selectFilter(event.target.value)} aria-label="Filter containers"><option>All</option><option>In transit</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select><button className="secondary-btn export-btn" type="button" onClick={exportToExcel} disabled={!rows.length}><Download size={16}/> Export to Excel</button></div><ContainerTable rows={rows}/></div></div></AppShell>;
}
