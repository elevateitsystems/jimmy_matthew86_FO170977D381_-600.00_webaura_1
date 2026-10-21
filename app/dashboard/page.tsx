'use client';
import { useMemo, useState } from 'react';
import { Download, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppShell } from '../../components/layout';
import { LoadingScreen } from '../../components/loading';
import { ContainerTable, Metrics } from '../../components/shared';
import { formatDate } from '../../lib/dates';
import { getDashboardCounts, isActive, matchesSummary, sortContainers, summaryFilters } from '../../lib/tracking';
import type { ContainerStatus, ContainerView, SummaryFilter } from '../../lib/tracking';
import { useContainerTracker } from '../../lib/container-store';

type StatusView = Exclude<ContainerStatus, 'Not tracked'>;
type TransitView = 'In transit' | 'At origin' | 'On water / arriving';
type View = 'Active' | 'Delivered' | 'All containers' | TransitView | StatusView | SummaryFilter;
const transitViews: View[] = ['In transit', 'At origin', 'On water / arriving'];
const statusViews: StatusView[] = ['Not collected', 'At warehouse', 'Dehired'];

function matchesView(item: ContainerView, view: View) {
  if (view === 'All containers') return true;
  if (view === 'Active') return isActive(item);
  if (view === 'Delivered') return item.tracked && item.delivered;
  if (view === 'In transit') return !item.tracked;
  if (view === 'At origin' || view === 'On water / arriving') return !item.tracked && item.stage === view;
  if ((statusViews as string[]).includes(view)) return isActive(item) && item.status === view;
  return isActive(item) && matchesSummary(item, view as SummaryFilter);
}
export default function Dashboard() {
  const { containers, tracker, refreshing, notice, refresh, dismissNotice } = useContainerTracker();
  const [query, setQuery] = useState(''); const [view, setView] = useState<View>('Active');
  const { active, inTransit, deliveredRecent, metrics: counts, summary: summaryCounts } = useMemo(() => getDashboardCounts(containers), [containers]);
  const rows = useMemo(() => sortContainers(containers.filter((item) => matchesView(item, view) && [item.container, item.mbl, item.user.destination, item.user.carrier].join(' ').toLowerCase().includes(query.toLowerCase()))), [containers, query, view]);
  const isStatusView = (statusViews as string[]).includes(view);
  const isSummaryView = summaryFilters.includes(view as SummaryFilter);
  const showActiveSection = view === 'Active' || isStatusView || isSummaryView;
  const tabs: [string, View, number, boolean][] = [['Arrived', 'Active', active, showActiveSection], ['In transit', 'In transit', inTransit, transitViews.includes(view)], ['Delivered', 'Delivered', counts.Delivered.count, view === 'Delivered']];
  const metricCounts = { 'At origin': counts['At origin'].count, 'On water / arriving': counts['On water / arriving'].count, 'Not collected': counts['Not collected'].count, 'At warehouse': counts['At warehouse'].count, Dehired: counts.Dehired.count, Delivered: counts.Delivered.count };
  const notes = { 'Not collected': counts['Not collected'].red ? `${counts['Not collected'].red} past terminal LFD` : '', 'At warehouse': counts['At warehouse'].red ? `${counts['At warehouse'].red} past detention LFD` : '', Dehired: counts.Dehired.red ? `${counts.Dehired.red} over 10 days` : '', Delivered: `${deliveredRecent} in last 30 days` };
  const alerts = (['Not collected', 'At warehouse', 'Dehired'] as const).filter((key) => counts[key].red > 0);
  const summary: [string, View, number, string, string][] = [
    ['Available, not collected', 'Not collected', counts['Not collected'].count, notes['Not collected'], counts['Not collected'].red ? 'red' : ''],
    ['At warehouse, not unpacked', 'At warehouse', counts['At warehouse'].count, notes['At warehouse'], counts['At warehouse'].red ? 'red' : ''],
    ['Dehired, awaiting delivery', 'Dehired', counts.Dehired.count, notes.Dehired, counts.Dehired.red ? 'red' : ''],
    ['No destination yet', 'Awaiting destination', summaryCounts['Awaiting destination'], '', 'amber'],
  ];
  const chips: [string, View, number][] = [['All open', 'Active', active], ['Dehired', 'Dehired', counts.Dehired.count], ['Not collected', 'Not collected', counts['Not collected'].count], ['No destination', 'Awaiting destination', summaryCounts['Awaiting destination']], ['At warehouse', 'At warehouse', counts['At warehouse'].count], ['Overdue', 'Overdue', summaryCounts.Overdue]];
  const exportRows = rows.map((item) => ({ Container: item.container, MBL: item.mbl, Size: item.size, 'Port · terminal': item.port, Status: item.delivered ? `${item.status} · Delivered` : item.status, 'Key date': `${item.dateLabel}: ${formatDate(item.dateValue)}`, Days: item.daysText, 'Final destination': item.user.destination || '', Carrier: item.user.carrier || '', Appt: item.user.appointment ? formatDate(item.user.appointment) : '', Delivered: item.user.deliveredDate ? formatDate(item.user.deliveredDate) : '', Notes: item.user.notes || '' }));
  const exportToExcel = () => { const headers = ['Container', 'MBL', 'Size', 'Port · terminal', 'Status', 'Key date', 'Days', 'Final destination', 'Carrier', 'Appt', 'Delivered', 'Notes']; const sheet = XLSX.utils.json_to_sheet(exportRows, { header: headers }); sheet['!cols'] = [18, 16, 14, 24, 22, 36, 22, 22, 28, 14, 14, 30].map((wch) => ({ wch })); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Containers'); XLSX.writeFile(book, `container-tracking-${view.toLowerCase().replaceAll(' ', '-')}.xlsx`); };
  return <AppShell>{refreshing && <LoadingScreen variant="overlay" message="Syncing OpenTrack demo data…"/>}<div className="content"><div className="title-row"><div><div className="eyebrow">JAVA MARYLAND · IMPORT CONTAINERS</div><h1 className="page-title">Container Tracker</h1></div><button className="secondary-btn" type="button"><SlidersHorizontal size={16}/> Manage views</button></div>
    {notice && <div className={`notice ${notice.tone === 'error' ? 'error' : 'success'} notice-row`} role={notice.tone === 'error' ? 'alert' : 'status'}><span>{notice.text}</span><button type="button" className="icon-btn" onClick={dismissNotice} aria-label="Dismiss notification"><X size={15}/></button></div>}
    <Metrics counts={metricCounts} notes={notes} alerts={alerts} onSelect={setView}/>
    <div className="tabs">{tabs.map(([label, value, count, current]) => <button key={label} className={`tab ${current ? 'active' : ''}`} onClick={() => setView(value)}>{label} <span className="muted">{count}</span></button>)}</div>
    {showActiveSection && <><p className="dashboard-description">Containers land here as soon as they are available at the terminal, and stay until a final delivery destination, a carrier and a delivered date are all recorded. Uncollected containers are flagged against the last free day, containers at the warehouse against the detention last free day, and dehired containers against the 10 days since the empty was returned.</p><div className="summary-cards">{summary.map(([label, value, count, note, tone]) => <button type="button" className={`summary-card ${view === value ? 'active' : ''}`} key={label} onClick={() => setView(value)} aria-pressed={view === value}><div>{label}</div><strong className={tone}>{count}</strong>{note && <small>{note}</small>}</button>)}</div></>}
    {transitViews.includes(view) && <p className="dashboard-description">These containers are at origin, on the water or arriving, and have not reached an AVAILABLE, discharge, out-gate or empty-return milestone yet. You can still open one to enter a destination, carrier, appointment, delivered date or notes; they are kept for when the container is added to tracking.</p>}
    <div className="panel"><div className="toolbar"><div className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search container, MBL, destination, carrier" aria-label="Search containers"/></div>{showActiveSection && <div className="chip-group" role="group" aria-label="Filter active containers">{chips.map(([label, value, count]) => <button type="button" key={label} className={`chip ${view === value ? 'active' : ''}`} onClick={() => setView(value)} aria-pressed={view === value}>{label} <span>{count}</span></button>)}</div>}<button className="secondary-btn export-btn" type="button" onClick={refresh} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'spin' : undefined}/> {refreshing ? 'Refreshing…' : 'Refresh data'}</button><button className="secondary-btn export-btn" type="button" onClick={exportToExcel} disabled={!rows.length}><Download size={16}/> Export to Excel</button></div><ContainerTable rows={rows}/></div></div></AppShell>;
}
