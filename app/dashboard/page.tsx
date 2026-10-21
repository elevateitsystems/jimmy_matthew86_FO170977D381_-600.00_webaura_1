'use client';
import { useMemo, useState } from 'react';
import { Download, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppShell } from '../../components/layout';
import { LoadingScreen } from '../../components/loading';
import { ContainerTable, MetricCount, MetricKey, Metrics } from '../../components/shared';
import { formatDate } from '../../lib/dates';
import { sortContainers } from '../../lib/tracking';
import type { ContainerStatus, ContainerView } from '../../lib/tracking';
import { useContainerTracker } from '../../lib/container-store';

type SummaryFilter = 'Awaiting destination' | 'Awaiting carrier' | 'Booked, not yet delivered' | 'Due soon' | 'Overdue';
type StatusView = Exclude<ContainerStatus, 'Not tracked'>;
type View = 'Active' | 'Delivered' | 'Not yet tracked' | 'All containers' | StatusView | SummaryFilter;
const statusViews: StatusView[] = ['Not collected', 'At warehouse', 'Dehired'];
const summaryFilters: SummaryFilter[] = ['Awaiting destination', 'Awaiting carrier', 'Booked, not yet delivered', 'Due soon', 'Overdue'];
const summaryHints: Record<SummaryFilter, string> = { 'Awaiting destination': '', 'Awaiting carrier': '', 'Booked, not yet delivered': '', 'Due soon': 'amber', Overdue: 'red' };

const isActive = (item: ContainerView) => item.tracked && !item.delivered;
function matchesSummary(item: ContainerView, filter: SummaryFilter) {
  if (filter === 'Awaiting destination') return !item.user.destination;
  if (filter === 'Awaiting carrier') return !item.user.carrier;
  if (filter === 'Booked, not yet delivered') return Boolean(item.user.appointment) && !item.user.deliveredDate;
  return item.tone === (filter === 'Overdue' ? 'red' : 'amber');
}
function matchesView(item: ContainerView, view: View) {
  if (view === 'All containers') return true;
  if (view === 'Active') return isActive(item);
  if (view === 'Delivered') return item.tracked && item.delivered;
  if (view === 'Not yet tracked') return !item.tracked;
  if ((statusViews as string[]).includes(view)) return isActive(item) && item.status === view;
  return isActive(item) && matchesSummary(item, view as SummaryFilter);
}
const toMetric = (items: ContainerView[]): MetricCount => ({ count: items.length, red: items.filter((item) => item.tone === 'red').length, amber: items.filter((item) => item.tone === 'amber').length });

export default function Dashboard() {
  const { containers, tracker, refreshing, notice, refresh, dismissNotice } = useContainerTracker();
  const [query, setQuery] = useState(''); const [view, setView] = useState<View>('Active');
  const active = useMemo(() => containers.filter(isActive), [containers]);
  const counts = useMemo<Record<MetricKey, MetricCount>>(() => ({
    'Not yet tracked': toMetric(containers.filter((item) => !item.tracked)),
    ...Object.fromEntries(statusViews.map((status) => [status, toMetric(active.filter((item) => item.status === status))])) as Record<StatusView, MetricCount>,
    Delivered: toMetric(containers.filter((item) => item.tracked && item.delivered)),
  }), [containers, active]);
  const rows = useMemo(() => sortContainers(containers.filter((item) => matchesView(item, view) && [item.container, item.mbl, item.user.destination, item.user.carrier].join(' ').toLowerCase().includes(query.toLowerCase()))), [containers, query, view]);
  const tabs: [View, number][] = [['Active', active.length], ['Delivered', counts.Delivered.count], ['Not yet tracked', counts['Not yet tracked'].count]];
  const isStatusView = (statusViews as string[]).includes(view);
  const filter = isStatusView || view === 'Not yet tracked' ? view : 'All';
  const selectFilter = (value: string) => setView(value === 'All' ? 'All containers' : value as View);
  const summary = summaryFilters.map((label) => [label, active.filter((item) => matchesSummary(item, label)).length, summaryHints[label]] as const);
  const isSummaryView = summaryFilters.includes(view as SummaryFilter);
  const showActiveSection = view === 'Active' || isStatusView || isSummaryView;
  const exportRows = rows.map((item) => ({ Container: item.container, MBL: item.mbl, Size: item.size, 'Port · terminal': item.port, Status: item.delivered ? `${item.status} · Delivered` : item.status, 'Key date': `${item.dateLabel}: ${formatDate(item.dateValue)}`, Days: item.daysText, 'Final destination': item.user.destination || '', Carrier: item.user.carrier || '', Appt: item.user.appointment ? formatDate(item.user.appointment) : '', Delivered: item.user.deliveredDate ? formatDate(item.user.deliveredDate) : '', Notes: item.user.notes || '' }));
  const exportToExcel = () => { const headers = ['Container', 'MBL', 'Size', 'Port · terminal', 'Status', 'Key date', 'Days', 'Final destination', 'Carrier', 'Appt', 'Delivered', 'Notes']; const sheet = XLSX.utils.json_to_sheet(exportRows, { header: headers }); sheet['!cols'] = [18, 16, 14, 24, 22, 36, 22, 22, 28, 14, 14, 30].map((wch) => ({ wch })); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Containers'); XLSX.writeFile(book, `container-tracking-${view.toLowerCase().replaceAll(' ', '-')}.xlsx`); };
  return <AppShell>{refreshing && <LoadingScreen variant="overlay" message="Syncing OpenTrack demo data…"/>}<div className="content"><div className="title-row"><div><div className="eyebrow">JAVA MARYLAND · IMPORT CONTAINERS</div><h1 className="page-title">Container Tracker</h1></div><button className="secondary-btn" type="button"><SlidersHorizontal size={16}/> Manage views</button></div>
    {notice && <div className={`notice ${notice.tone === 'error' ? 'error' : 'success'} notice-row`} role={notice.tone === 'error' ? 'alert' : 'status'}><span>{notice.text}</span><button type="button" className="icon-btn" onClick={dismissNotice} aria-label="Dismiss notification"><X size={15}/></button></div>}
    <Metrics counts={counts} onSelect={setView}/>
    <div className="tabs">{tabs.map(([label, count]) => <button key={label} className={`tab ${view === label ? 'active' : ''}`} onClick={() => setView(label)}>{label} <span className="muted">{count}</span></button>)}</div>
    {showActiveSection && <><p className="dashboard-description">Containers are added automatically once OpenTrack reports an AVAILABLE event, a discharge, an out-gate or an empty return. They stay on this list until a final destination, a carrier and a delivered date are all recorded. Red dates are overdue; amber dates are due within 2 days (Dehired: 8–10 days since the empty was returned).</p><div className="summary-cards">{summary.map(([label, value, tone]) => <button type="button" className={`summary-card ${view === label ? 'active' : ''}`} key={label} onClick={() => setView(label)} aria-pressed={view === label}><div>{label}</div><strong className={tone}>{value}</strong></button>)}</div></>}
    {view === 'Not yet tracked' && <p className="dashboard-description">These containers have not reached an AVAILABLE, discharge, out-gate or empty-return milestone yet. You can still open one to enter a destination, carrier, appointment, delivered date or notes; they are kept for when the container is added to tracking.</p>}
    <div className="panel"><div className="toolbar"><div className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search container, MBL, destination, carrier" aria-label="Search containers"/></div><select className="filter" value={filter} onChange={(event) => selectFilter(event.target.value)} aria-label="Filter containers"><option>All</option><option>Not yet tracked</option>{statusViews.map((status) => <option key={status}>{status}</option>)}</select><button className="secondary-btn export-btn" type="button" onClick={refresh} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'spin' : undefined}/> {refreshing ? 'Refreshing…' : 'Refresh data'}</button><button className="secondary-btn export-btn" type="button" onClick={exportToExcel} disabled={!rows.length}><Download size={16}/> Export to Excel</button></div><ContainerTable rows={rows}/></div></div></AppShell>;
}
