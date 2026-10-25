'use client';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, LoaderCircle, PackageCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout';
import { LoadingScreen } from '../../../components/loading';
import { StatusBadge } from '../../../components/shared';
import { showToast } from '../../../components/toast';
import { dayNumber, formatDate } from '../../../lib/dates';
import { isDelivered } from '../../../lib/tracking';
import { saveUserFields, useContainerDetail, useContainerOptions } from '../../../lib/container-store';
import { changedUserFields, containerNumber } from '../../../lib/backend';
import { errorMessage } from '../../../lib/api';
import type { UserFields } from '../../../lib/data';

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

function UpdatesContent(){
  const router=useRouter();const [selectedId,setSelectedId]=useState('');const [initialized,setInitialized]=useState(false);
  useEffect(()=>{const value=new URLSearchParams(window.location.search).get('container');if(value)setSelectedId(containerNumber(value).toLowerCase());setInitialized(true)},[]);
  const {containers,loading,error,retry}=useContainerOptions(initialized&&!selectedId);
  const leave=()=>{if(window.history.length>1)router.back();else router.push(selectedId?`/containers/${selectedId}`:'/containers')};
  return <div className="content"><button type="button" className="back-link muted" onClick={leave}><ArrowLeft size={15}/> Back</button>{selectedId?<ShipmentForm key={selectedId} id={selectedId} onBack={leave}/>:<><div className="eyebrow">Staff workspace · Delivery updates</div><h1 className="page-title">Select a shipment</h1><p className="page-subtitle" style={{marginBottom:26}}>Choose a shipment to record a delivery update.</p>{!initialized||loading?<LoadingScreen variant="inline" message="Loading shipments…"/>:error?<div className="panel detail-card"><div className="notice error" role="alert">{error}</div><button className="secondary-btn" onClick={retry} style={{marginTop:16}}>Try again</button></div>:<div className="panel detail-card"><div className="field"><label htmlFor="shipment-select">Shipment</label><select id="shipment-select" value={selectedId} onChange={event=>setSelectedId(event.target.value)}><option value="">Choose a shipment</option>{containers.map(item=><option key={item.id} value={item.id}>{item.container} · {item.user.destination||'No destination'} · {item.status}</option>)}</select>{!containers.length&&<p className="muted">No shipments are available.</p>}</div></div>}</>}</div>;
}
export default function Updates(){return <AppShell><UpdatesContent/></AppShell>}