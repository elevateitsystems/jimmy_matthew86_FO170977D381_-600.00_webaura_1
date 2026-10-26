'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { AppShell } from '../../components/layout';
import { LoadingScreen } from '../../components/loading';
import { ContainerTable, Metrics } from '../../components/shared';
import { formatDate } from '../../lib/dates';
import { getDashboardCounts } from '../../lib/tracking';
import { getAllContainers, useContainerList, useContainerTracker } from '../../lib/container-store';
import { apiResponse, errorMessage } from '../../lib/api';
import { trackerFilters as filters } from '../../lib/backend';
import type { TrackerView } from '../../lib/backend';

type View = TrackerView;
const emptySummary = getDashboardCounts([]);
function download(blob: Blob, filename: string) {
  const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function ContainerContent() {
  const {summary,settings,metadataLoaded,metadataError,refreshing,notice,refresh,dismissNotice,reloadMetadata}=useContainerTracker();
  const [query,setQuery]=useState(''); const [search,setSearch]=useState(''); const [view,setView]=useState<View>('Active');
  const [initialized,setInitialized]=useState(false); const [page,setPage]=useState(1); const [perPage,setPerPage]=useState(15);
  const [exporting,setExporting]=useState(false); const [exportError,setExportError]=useState('');
  useEffect(()=>{if(metadataLoaded&&!initialized){setView(settings?.defaultView??'Active');setInitialized(true)}},[metadataLoaded,initialized,settings]);
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(1)},300);return()=>clearTimeout(timer)},[query]);
  const request=useMemo(()=>({...filters(view),search,page,perPage}),[view,search,page,perPage]);
  const {rows,total,loading,error,retry}=useContainerList(request,initialized);
  useEffect(()=>{if(!loading&&!error&&page>Math.max(1,Math.ceil(total/perPage)))setPage(Math.max(1,Math.ceil(total/perPage)))},[loading,error,page,total,perPage]);
  const changeView=(value:View)=>{setView(value);setPage(1);setExportError('')};
  const {active,inTransit,deliveredRecent,metrics:counts,summary:summaryCounts}=summary??emptySummary;
  const isTransit=['In transit','At origin','On water / arriving'].includes(view);
  const showActiveSection=!isTransit&&view!=='Delivered'&&view!=='All containers';
  const tabs:[string,View,number,boolean][]=[['Arrived','Active',active,showActiveSection],['In transit','In transit',inTransit,isTransit],['Delivered','Delivered',counts.Delivered.count,view==='Delivered'],['All containers','All containers',active+inTransit+counts.Delivered.count,view==='All containers']];
  const metricCounts={'At origin':counts['At origin'].count,'On water / arriving':counts['On water / arriving'].count,'Not collected':counts['Not collected'].count,'At warehouse':counts['At warehouse'].count,Dehired:counts.Dehired.count,Delivered:counts.Delivered.count};
  const notes={'Not collected':counts['Not collected'].red?`${counts['Not collected'].red} past terminal LFD`:'','At warehouse':counts['At warehouse'].red?`${counts['At warehouse'].red} past detention LFD`:'',Dehired:counts.Dehired.red?`${counts.Dehired.red} over 10 days`:'',Delivered:`${deliveredRecent} in last 30 days`};
  const alerts=(['Not collected','At warehouse','Dehired'] as const).filter(key=>counts[key].red>0);
  const cards:[string,View,number,string,string][]=[['Available, not collected','Not collected',counts['Not collected'].count,notes['Not collected'],counts['Not collected'].red?'red':''],['At warehouse, not unpacked','At warehouse',counts['At warehouse'].count,notes['At warehouse'],counts['At warehouse'].red?'red':''],['Dehired, awaiting delivery','Dehired',counts.Dehired.count,notes.Dehired,counts.Dehired.red?'red':''],['No destination yet','Awaiting destination',summaryCounts['Awaiting destination'],'','amber']];
  const chips:[string,View,number][]=[['All open','Active',active],['Dehired','Dehired',counts.Dehired.count],['Not collected','Not collected',counts['Not collected'].count],['No destination','Awaiting destination',summaryCounts['Awaiting destination']],['At warehouse','At warehouse',counts['At warehouse'].count],['Overdue','Overdue',summaryCounts.Overdue]];
  const exportToExcel=async()=>{
    setExporting(true);setExportError('');
    try{
      if(search||view==='In transit'){
        // The collection documents bucket-only exports. Preserve search/transit filters by exporting all matching API pages.
        const matching=await getAllContainers(filters(view).view?{...filters(view),search}:{bucket:filters(view).bucket,search});
        const XLSX=await import('xlsx');
        const sheet=XLSX.utils.json_to_sheet(matching.map(item=>({Container:item.container,MBL:item.mbl,Size:item.size,'Port · terminal':item.port,Status:item.delivered?'Delivered':item.status,'Key date':`${item.dateLabel}: ${formatDate(item.dateValue)}`,Days:item.daysText,'Final destination':item.user.destination||'',Carrier:item.user.carrier||'',Appointment:formatDate(item.user.appointment),Delivered:formatDate(item.user.deliveredDate),Notes:item.user.notes||''})));
        sheet['!cols']=[18,16,14,24,22,36,22,22,28,14,14,30].map(wch=>({wch})); const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Containers');XLSX.writeFile(book,'containers.xlsx');
      }else{
        const response=await apiResponse(`/containers/export?${new URLSearchParams({bucket:filters(view).bucket||'all'})}`);
        download(await response.blob(),'containers.xlsx');
      }
    }catch(error){setExportError(errorMessage(error))}finally{setExporting(false)}
  };
  return <>{refreshing&&<LoadingScreen variant="overlay" message="Syncing container data…"/>}<div className="content">
    <div className="title-row"><div><div className="eyebrow">JAVA MARYLAND · IMPORT CONTAINERS</div><h1 className="page-title">Container Tracker</h1></div><Link href="/settings" className="secondary-btn"><SlidersHorizontal size={16}/> Manage views</Link></div>
    {notice&&<div className={`notice ${notice.tone==='error'?'error':'success'} notice-row`} role={notice.tone==='error'?'alert':'status'}><span>{notice.text}</span><button className="icon-btn" type="button" onClick={dismissNotice} aria-label="Dismiss notification"><X size={15}/></button></div>}
    {metadataError&&<div className="notice error notice-row" role="alert"><span>{metadataError}</span><button className="secondary-btn" type="button" onClick={reloadMetadata}>Retry summary</button></div>}
    <Metrics counts={metricCounts} notes={notes} alerts={alerts} onSelect={changeView}/>
    <div className="tabs">{tabs.map(([label,value,count,current])=><button key={label} className={`tab ${current?'active':''}`} onClick={()=>changeView(value)}>{label} <span className="muted">{count}</span></button>)}</div>
    {showActiveSection&&<><p className="dashboard-description">Containers stay here until a final destination, a carrier and a delivered date are recorded. Deadline alerts help your team prioritize collections, warehouse returns and final deliveries.</p><div className="summary-cards">{cards.map(([label,value,count,note,tone])=><button type="button" className={`summary-card ${view===value?'active':''}`} key={label} onClick={()=>changeView(value)} aria-pressed={view===value}><div>{label}</div><strong className={tone}>{count}</strong>{note&&<small>{note}</small>}</button>)}</div></>}
    {isTransit&&<p className="dashboard-description">Containers at origin, on the water or arriving. Open a shipment to plan its destination, carrier and delivery before it reaches the terminal.</p>}
    <div className={`panel ${settings?.compactTable?'compact-table':''}`}><div className="toolbar"><div className="search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search container, MBL, destination, carrier" aria-label="Search containers"/></div>{showActiveSection&&<div className="chip-group" role="group" aria-label="Filter active containers">{chips.map(([label,value,count])=><button type="button" key={label} className={`chip ${view===value?'active':''}`} onClick={()=>changeView(value)} aria-pressed={view===value}>{label} <span>{count}</span></button>)}</div>}<button className="secondary-btn export-btn" type="button" onClick={refresh} disabled={refreshing}><RefreshCw size={16} className={refreshing?'spin':undefined}/>{refreshing?'Refreshing…':'Refresh data'}</button><button className="secondary-btn export-btn" type="button" onClick={exportToExcel} disabled={exporting||loading||!total}><Download size={16}/>{exporting?'Exporting…':'Export to Excel'}</button></div>
    {exportError&&<div className="notice error" role="alert" style={{margin:16}}>{exportError}</div>}
    {loading?<LoadingScreen variant="inline" message="Loading containers…"/>:error?<div className="detail-card"><div className="notice error" role="alert">{error}</div><button className="secondary-btn" style={{marginTop:16}} type="button" onClick={retry}>Try again</button></div>:<ContainerTable rows={rows} pagination={{page,perPage,total,onPageChange:setPage,onPageSizeChange:value=>{setPerPage(value);setPage(1)}}}/>}
    </div>
  </div></>;
}
export default function Containers(){return <AppShell><ContainerContent/></AppShell>}