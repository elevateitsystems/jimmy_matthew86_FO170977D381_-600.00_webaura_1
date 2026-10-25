"use client";
import { useId, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, LoaderCircle, Pencil, Save, Truck } from 'lucide-react';
import { AppShell } from '../../../components/layout';
import { LoadingScreen } from '../../../components/loading';
import { DaysBadge, StatusBadge } from '../../../components/shared';
import type { UserFields } from '../../../lib/data';
import { formatDate } from '../../../lib/dates';
import { buildTimeline, isDelivered } from '../../../lib/tracking';
import { saveUserFields, useContainerDetail } from '../../../lib/container-store';
import { errorMessage } from '../../../lib/api';
import { changedUserFields } from '../../../lib/backend';

function DetailContent() {
  const { id } = useParams<{ id: string }>();
  const { container, loading, error, retry } = useContainerDetail(id);
  // The draft is seeded once per container so a background refresh never overwrites what is being typed.
  const [draft, setDraft] = useState<{ id: string; form: UserFields; original: UserFields }>();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{type:'success'|'error',text:string}>();
  if (loading) return <AppShell><LoadingScreen variant="inline" message="Loading container details…"/></AppShell>;
  if (error || !container) return <div className="content"><div className="panel detail-card"><h2>Unable to load shipment</h2><p className="notice error" role="alert">{error || 'The requested container could not be found.'}</p><div className="update-actions"><button className="secondary-btn" onClick={retry}>Try again</button><Link href="/containers" className="primary-btn">Back to containers</Link></div></div></div>;
  if (draft?.id !== id) { setDraft({ id, form: container.user, original: container.user }); return null; }
  const form = draft.form;
  const update = (field: keyof UserFields, value: string) => { setDraft({ id, form: { ...form, [field]: value }, original: draft.original }); setFeedback(undefined); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setFeedback(undefined);
    try {
      const patch = changedUserFields(draft.original, form);
      if (Object.keys(patch).length) await saveUserFields(id, patch);
      setDraft({ id, form, original: { ...form } });
      setFeedback({type:'success',text:isDelivered(form)?'Changes saved. This shipment will appear in Delivered when it is tracked.':'Delivery planning changes saved successfully.'});
    } catch(error) { setFeedback({type:'error',text:errorMessage(error)}); }
    finally { setSaving(false); }
  };
  const timeline = container.timeline ?? buildTimeline(container);
  return <div className="content">
    <Link href="/containers" className="muted" style={{display:'inline-flex',gap:7,alignItems:'center',fontSize:13,marginBottom:24}}><ArrowLeft size={15}/> Back to containers</Link>
    <div className="title-row"><div><div className="eyebrow">Container detail</div><h1 className="page-title mono">{container.container}</h1><p className="page-subtitle">{container.mbl} · {container.line} · {container.vessel}</p></div><Link href={`/staff/updates?container=${container.id}`} className="primary-btn"><Pencil size={15}/> Add delivery update</Link></div>
    <div className="detail-grid"><section className="panel detail-card"><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><div className="eyebrow">{container.dateLabel}</div><h2 style={{margin:'7px 0 0',fontSize:22}}>{container.dateText || formatDate(container.dateValue)} <span style={{fontSize:14,fontWeight:600}}><DaysBadge container={container}/></span></h2></div><div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}><StatusBadge status={!container.tracked ? container.stage ?? 'Not tracked' : container.status}/>{container.delivered && <StatusBadge status="Delivered"/>}</div></div><div className="info-grid"><div><div className="info-label">Origin</div><div className="info-value">{container.origin}</div></div><div><div className="info-label">Port · terminal</div><div className="info-value">{container.port}</div></div><div><div className="info-label">Last free day</div><div className="info-value">{formatDate(container.lastFreeDay)}</div></div><div><div className="info-label">Detention last free day</div><div className="info-value">{formatDate(container.detentionLastFreeDay)}</div></div><div><div className="info-label">Final destination</div><div className="info-value">{container.user.destination || 'Not yet entered'}</div></div><div><div className="info-label">Dray carrier</div><div className="info-value">{container.user.carrier||'Not yet assigned'}</div></div><div><div className="info-label">Delivered date</div><div className="info-value">{container.user.deliveredDate ? formatDate(container.user.deliveredDate) : 'Not yet delivered'}</div></div><div><div className="info-label">Equipment</div><div className="info-value">{container.size}</div></div></div><div className="notice" style={{marginTop:24}}><Truck size={16} style={{verticalAlign:'middle',marginRight:7}}/> {container.tracked ? 'Destination, carrier and delivered date move this container to the Delivered list once all three are saved.' : 'This container is not on the tracking list yet. Anything you save now is kept and applies once OpenTrack reports a milestone.'}</div></section>
    <section className="panel detail-card"><div className="eyebrow">Shipment timeline</div><div className="timeline">{timeline.length ? timeline.map((e)=><div className="event" key={`${e.title}-${e.date}`}><div className="event-title">{e.title}</div><div className="event-date">{formatDate(e.date)}</div><div className="event-desc">{e.desc}</div></div>) : <p className="muted">No OpenTrack events yet.</p>}</div></section></div>
    <form className="panel detail-card" style={{marginTop:20}} onSubmit={save}><fieldset className="delivery-fieldset" disabled={saving}><div className="title-row" style={{marginBottom:20,alignItems:'center'}}><div><div className="eyebrow">Delivery planning</div><h2 style={{margin:'7px 0 0',fontSize:20}}>Trucking & final destination</h2></div><button className="primary-btn" type="submit" disabled={saving}>{saving?<><LoaderCircle size={16} className="spin"/> Saving…</>:<><Save size={16}/> Save changes</>}</button></div>{feedback&&<div className={feedback.type==='success'?'success notice':'error notice'} role="status" style={{marginBottom:16}}>{feedback.type==='success'?<CheckCircle2 size={15} style={{verticalAlign:'middle',marginRight:6}}/>:null}{feedback.text}</div>}<div className="form-stack"><div className="info-grid" style={{marginTop:0}}><Field label="Final destination" value={form.destination} onChange={(v)=>update('destination',v)}/><Field label="Dray carrier" value={form.carrier} onChange={(v)=>update('carrier',v)}/><Field label="Appointment date" type="date" value={form.appointment} onChange={(v)=>update('appointment',v)}/><Field label="Delivered date" type="date" value={form.deliveredDate} onChange={(v)=>update('deliveredDate',v)}/><Field label="Driver / dispatcher" value={form.driver} onChange={(v)=>update('driver',v)}/><Field label="Truck number" value={form.truckNumber} onChange={(v)=>update('truckNumber',v)}/><Field label="Receiving contact" value={form.contactName} onChange={(v)=>update('contactName',v)}/><Field label="Contact phone" value={form.contactPhone} onChange={(v)=>update('contactPhone',v)}/><Field label="Delivery address" value={form.destinationAddress} onChange={(v)=>update('destinationAddress',v)}/></div><div className="field"><label htmlFor="notes">Notes</label><textarea id="notes" value={form.notes||''} onChange={(e)=>update('notes',e.target.value)} placeholder="Add appointment, accessorial, or receiving notes"/></div></div></fieldset></form>
  </div>;
}
function Field({label,value,onChange,type='text'}:{label:string;value?:string;onChange:(value:string)=>void;type?:string}) { const inputId = useId(); return <div className="field"><label htmlFor={inputId}>{label}</label><input id={inputId} type={type} value={value||''} onChange={(e)=>onChange(e.target.value)}/></div>; }

export default function Detail() { return <AppShell><DetailContent/></AppShell>; }
