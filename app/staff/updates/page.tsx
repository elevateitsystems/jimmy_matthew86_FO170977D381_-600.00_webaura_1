'use client';
import { Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ChevronDown, LoaderCircle, PackageCheck, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../components/layout';
import { LoadingScreen } from '../../../components/loading';
import { StatusBadge } from '../../../components/shared';
import { showToast } from '../../../components/toast';
import { dayNumber, formatDate } from '../../../lib/dates';
import { isDelivered } from '../../../lib/tracking';
import { saveUserFields, useContainerDetail, useContainerOptions } from '../../../lib/container-store';
import { changedUserFields, containerNumber } from '../../../lib/backend';
import type { BackendContainer } from '../../../lib/backend';
import { errorMessage } from '../../../lib/api';
import type { UserFields } from '../../../lib/data';
import { formatContainerNumber } from '../../../lib/data';

const schema=z.object({destination:z.string().trim().optional(),carrier:z.string().trim().optional(),appointment:z.string().optional(),deliveredDate:z.string().optional(),notes:z.string().optional()});
type FormData=z.infer<typeof schema>;
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&dayNumber(value)!==null}

function ShipmentForm({id,onBack}:{id:string;onBack:()=>void}){
  const {container,loading,error,retry}=useContainerDetail(id);
  const original=useRef<UserFields>({}); const [seeded,setSeeded]=useState(false);
  const {register,handleSubmit,reset,setError,clearErrors,formState:{errors,isSubmitting}}=useForm<FormData>({resolver:zodResolver(schema),defaultValues:{destination:'',carrier:'',appointment:'',deliveredDate:'',notes:''}});
  useEffect(()=>{if(container&&!seeded){const values={destination:container.user.destination||'',carrier:container.user.carrier||'',appointment:container.user.appointment||'',deliveredDate:container.user.deliveredDate||'',notes:container.user.notes||''};original.current=values;reset(values);setSeeded(true)}},[container,seeded,reset]);
  if(loading)return <LoadingScreen variant="inline" message="Loading shipment…"/>;
  if(error||!container)return <div className="panel detail-card"><div className="notice error" role="alert">{error||'Shipment not found.'}</div><button className="secondary-btn" style={{marginTop:16}} onClick={retry}>Try again</button></div>;
  const persist=async(values:FormData,markDelivered:boolean)=>{
    clearErrors('root');
    if(markDelivered){const missing=(['destination','carrier','deliveredDate'] as const).filter(field=>!values[field]?.trim());if(missing.length){missing.forEach(field=>setError(field,{type:'manual',message:field==='deliveredDate'?'Choose a delivered date.':field==='destination'?'Enter a final destination.':'Enter a carrier name.'}));return}}
    for(const key of ['appointment','deliveredDate'] as const)if(values[key]&&!validDate(values[key]!)){setError(key,{type:'manual',message:'Choose a valid date.'});return}
    try{const patch=changedUserFields(original.current,values);if(Object.keys(patch).length)await saveUserFields(id,patch);showToast(isDelivered(values)?'Delivery recorded':'Delivery update saved','The shipment has been updated.');onBack()}
    catch(error){setError('root',{message:errorMessage(error)})}
  };
  return <><div className="eyebrow">Staff workspace · Delivery updates</div><h1 className="page-title">Record a delivery update</h1><p className="page-subtitle" style={{marginBottom:26}}>Add operational details for <span className="mono">{container.container}</span>.</p>
    <div className="detail-grid"><section className="panel detail-card"><div className="notice">Save your delivery details to keep the operations team up to date.</div><form className="form-stack" style={{marginTop:24}} onSubmit={handleSubmit(values=>persist(values,false))} onChange={()=>clearErrors('root')}>
      {errors.root&&<div className="notice error" role="alert">{errors.root.message}</div>}
      <div className="field"><label htmlFor="destination">Final delivery destination</label><input id="destination" {...register('destination')} placeholder="e.g. Commerce, TX"/>{errors.destination&&<span className="error">{errors.destination.message}</span>}</div>
      <div className="field"><label htmlFor="carrier">Trucker / carrier</label><input id="carrier" {...register('carrier')} placeholder="Company or driver name"/>{errors.carrier&&<span className="error">{errors.carrier.message}</span>}</div>
      <div className="field"><label htmlFor="appointment">Delivery appointment</label><input id="appointment" type="date" {...register('appointment')}/>{errors.appointment&&<span className="error">{errors.appointment.message}</span>}</div>
      <div className="field"><label htmlFor="deliveredDate">Delivered date</label><input id="deliveredDate" type="date" {...register('deliveredDate')}/>{errors.deliveredDate&&<span className="error">{errors.deliveredDate.message}</span>}</div>
      <div className="field"><label htmlFor="notes">Notes for customer and operations <span className="muted">(optional)</span></label><textarea id="notes" {...register('notes')} placeholder="Add a helpful handoff note…"/></div>
      <div className="update-actions"><button className="primary-btn" type="submit" disabled={isSubmitting||!seeded}>{isSubmitting?<><LoaderCircle size={16} className="spin"/> Saving…</>:'Save delivery update'}</button><button className="secondary-btn" type="button" onClick={handleSubmit(values=>persist(values,true))} disabled={isSubmitting||!seeded}><PackageCheck size={16}/> Mark as Delivered</button></div>
    </form></section><section className="panel detail-card"><div className="eyebrow">Container snapshot</div><h2 className="mono" style={{fontSize:20}}>{container.container}</h2><div className="info-grid"><div><div className="info-label">MBL</div><div className="info-value">{container.mbl}</div></div><div><div className="info-label">Current status</div><div className="info-value"><StatusBadge status={container.delivered?'Delivered':!container.tracked?container.stage??'Not tracked':container.status}/></div></div><div><div className="info-label">{container.dateLabel}</div><div className="info-value">{container.dateText || formatDate(container.dateValue)} · {container.daysText}</div></div><div><div className="info-label">Origin</div><div className="info-value">{container.origin}</div></div><div><div className="info-label">Port</div><div className="info-value">{container.port}</div></div><div><div className="info-label">Delivered date</div><div className="info-value">{formatDate(container.user.deliveredDate)}</div></div></div></section></div>
  </>;
}

function ShipmentSelector({containers,selectedId,onSelect}:{containers:BackendContainer[];selectedId:string;onSelect:(id:string)=>void}){
  const id=useId();
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const list=useRef<HTMLUListElement>(null);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [activeIndex,setActiveIndex]=useState(0);
  const matches=useMemo(()=>{
    const search=query.replace(/\s/g,'').toLowerCase();
    return containers.filter(item=>[item.container,item.mbl].some(value=>value.replace(/\s/g,'').toLowerCase().includes(search)));
  },[containers,query]);
  const active=matches[activeIndex];
  const selected=containers.find(item=>item.id===selectedId);
  const close=(restoreFocus=false)=>{setOpen(false);if(restoreFocus)trigger.current?.focus()};
  const show=(last=false)=>{setQuery('');const selectedIndex=containers.findIndex(item=>item.id===selectedId);setActiveIndex(last?Math.max(0,containers.length-1):Math.max(0,selectedIndex));setOpen(true)};
  const choose=(item:BackendContainer)=>{close(true);onSelect(item.id)};
  useEffect(()=>{
    if(!open)return;
    input.current?.focus();
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false)};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  useEffect(()=>{
    const options=list.current;
    const option=options?.children[activeIndex];
    if(!open||!options||!option)return;
    const bounds=options.getBoundingClientRect();
    const itemBounds=option.getBoundingClientRect();
    if(itemBounds.top<bounds.top)options.scrollTop-=bounds.top-itemBounds.top;
    else if(itemBounds.bottom>bounds.bottom)options.scrollTop+=itemBounds.bottom-bounds.bottom;
  },[open,activeIndex,query]);
  return <div className="field shipment-selector" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))close()}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close(true)}}}>
    <label id={`${id}-label`} className="shipment-label" htmlFor={`${id}-trigger`}>Select a Shipment</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" className="shipment-trigger" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} onClick={()=>open?close():show()} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show(event.key==='ArrowUp')}else if(event.key==='Escape')close()}}>
      <span id={`${id}-value`}>{selectedId?formatContainerNumber(selected?.container||selectedId):'Choose a shipment'}</span><ChevronDown size={21} className={open?'shipment-chevron open':'shipment-chevron'} aria-hidden="true"/>
    </button>
    {open&&<div className="shipment-dropdown">
      <div className="shipment-search">
        <Search size={17} aria-hidden="true"/>
        <input ref={input} type="text" role="combobox" aria-label="Search container number or MBL" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={active?`${id}-option-${active.id}`:undefined} autoComplete="off" placeholder="Search container or MBL..." value={query} onChange={event=>{setQuery(event.target.value);setActiveIndex(0)}} onKeyDown={event=>{
          if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActiveIndex(index=>matches.length?(index+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length:0)}
          else if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();if(active)choose(active)}
          else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true)}
        }}/>
        {query&&<button type="button" className="icon-btn shipment-clear" aria-label="Clear shipment search" onClick={()=>{setQuery('');setActiveIndex(0);input.current?.focus()}}><X size={16} aria-hidden="true"/></button>}
      </div>
      <p className={matches.length?'sr-only':'shipment-empty'} role="status">{matches.length?`${matches.length} shipment${matches.length===1?'':'s'}`:containers.length?'No matching shipments found':'No shipments are available.'}</p>
      <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Available shipments" className="shipment-options">
        {matches.map((item,index)=><li key={item.id} id={`${id}-option-${item.id}`} role="option" aria-selected={item.id===selectedId} className={`shipment-option ${index===activeIndex?'active':''} ${item.id===selectedId?'selected':''}`} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(item)} onMouseMove={()=>setActiveIndex(index)}>
          <strong>{formatContainerNumber(item.container)}</strong><span>MBL: {item.mbl||'Not available'}</span>
        </li>)}
      </ul>
    </div>}
    <p className="shipment-hint">Scroll to choose a shipment, or search by container number or MBL.</p>
  </div>;
}

function UpdatesContent(){
  const router=useRouter();const searchParams=useSearchParams();
  const selectedId=containerNumber(searchParams.get('container')||'').toLowerCase();
  const {containers,loading,error,retry}=useContainerOptions();
  const leave=()=>{if(window.history.length>1)router.back();else router.push(selectedId?`/containers/${selectedId}`:'/containers')};
  return <div className="content"><button type="button" className="back-link muted" onClick={leave}><ArrowLeft size={15}/> Back</button><div className="eyebrow">Staff workspace · Delivery updates</div><h1 className="page-title">Delivery updates</h1><p className="page-subtitle" style={{marginBottom:26}}>Choose a shipment to record a delivery update.</p>{loading?<LoadingScreen variant="inline" message="Loading shipments…"/>:error?<div className="panel detail-card"><div className="notice error" role="alert">{error}</div><button className="secondary-btn" onClick={retry} style={{marginTop:16}}>Try again</button></div>:<div className="panel shipment-card"><ShipmentSelector containers={containers} selectedId={selectedId} onSelect={id=>router.push(`/staff/updates?container=${encodeURIComponent(id)}`,{scroll:false})}/></div>}{selectedId&&<div className="shipment-form-section"><ShipmentForm key={selectedId} id={selectedId} onBack={leave}/></div>}</div>;
}
export default function Updates(){return <AppShell><Suspense fallback={<LoadingScreen variant="inline" message="Loading shipments…"/>}><UpdatesContent/></Suspense></AppShell>}
