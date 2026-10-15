"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, LoaderCircle, Pencil, Save, Truck } from 'lucide-react';
import { AppShell } from '../../../components/layout';
import { StatusBadge } from '../../../components/shared';
import { Container, events } from '../../../lib/data';
import { useDemoContainers } from '../../../lib/container-store';

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const [containers, setContainers] = useDemoContainers();
  const [container, setContainer] = useState<Container>();
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<Partial<Container>>({});
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{type:'success'|'error',text:string}>();

  useEffect(() => { const found = containers.find((item) => item.id === id); setContainer(found); if (found) setForm(found); setLoaded(true); }, [containers, id]);
  if (!loaded) return <AppShell><div className="content"><div className="panel" style={{padding:30}}>Loading container details…</div></div></AppShell>;
  if (!container) return <AppShell><div className="content"><div className="panel" style={{padding:30}}><h2>Shipment not found</h2><p className="muted">This shipment ID does not match an available demo record.</p><Link href="/dashboard" className="primary-btn" style={{marginTop:16}}>Back to dashboard</Link></div></div></AppShell>;
  const update = (field: keyof Container, value: string) => { setForm((current) => ({...current, [field]: value})); setErrors((current) => ({...current, [field]: ''})); setFeedback(undefined); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors:Record<string,string> = {};
    if (!form.carrier?.trim()) nextErrors.carrier = 'Carrier is required before offloading.';
    if (!form.driver?.trim()) nextErrors.driver = 'Driver or dispatcher name is required.';
    if (!form.truckNumber?.trim()) nextErrors.truckNumber = 'Truck number is required.';
    if (!form.destination?.trim()) nextErrors.destination = 'Final destination is required.';
    if (!form.destinationAddress?.trim()) nextErrors.destinationAddress = 'Delivery address is required.';
    if (!form.appointment?.trim()) nextErrors.appointment = 'Delivery appointment is required.';
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setFeedback({type:'error',text:'Please complete the required delivery details.'}); return; }
    setSaving(true); setFeedback(undefined);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const updated = {...container, ...form} as Container;
    setContainers(containers.map((item) => item.id === id ? updated : item));
    setContainer(updated); setForm(updated); setSaving(false); setFeedback({type:'success',text:'Container delivery details saved locally.'});
  };
  const required = container.status === 'Out to warehouse' || container.status === 'After dehire' || container.status === 'Delivered';
  return <AppShell><div className="content">
    <Link href="/dashboard" className="muted" style={{display:'inline-flex',gap:7,alignItems:'center',fontSize:13,marginBottom:24}}><ArrowLeft size={15}/> Back to containers</Link>
    <div className="title-row"><div><div className="eyebrow">Container detail</div><h1 className="page-title mono">{container.container}</h1><p className="page-subtitle">{container.mbl} · {container.line} · {container.vessel}</p></div><Link href={`/staff/updates?container=${container.id}`} className="primary-btn"><Pencil size={15}/> Add delivery update</Link></div>
    <div className="detail-grid"><section className="panel detail-card"><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><div className="eyebrow">Current shipment status</div><h2 style={{margin:'7px 0 0',fontSize:22}}>{container.milestone}</h2></div><StatusBadge status={container.status}/></div><div className="info-grid"><div><div className="info-label">Origin</div><div className="info-value">{container.origin}</div></div><div><div className="info-label">Port · terminal</div><div className="info-value">{container.port}</div></div><div><div className="info-label">Final destination</div><div className="info-value">{container.destination}</div></div><div><div className="info-label">Estimated arrival</div><div className="info-value">{container.eta}</div></div><div><div className="info-label">Delivered date</div><div className="info-value">{container.deliveredDate ? formatDate(container.deliveredDate) : 'Not yet delivered'}</div></div><div><div className="info-label">Equipment</div><div className="info-value">{container.size}</div></div><div><div className="info-label">Dray carrier</div><div className="info-value">{container.carrier||'Not yet assigned'}</div></div></div><div className="notice" style={{marginTop:24}}><Truck size={16} style={{verticalAlign:'middle',marginRight:7}}/> {required ? 'Delivery details are required for this container before offloading.' : 'Add delivery details now so the receiving team is ready when the container arrives.'}</div></section>
    <section className="panel detail-card"><div className="eyebrow">Shipment timeline</div><div className="timeline">{events.map((e)=><div className="event" key={e.title}><div className="event-title">{e.title}</div><div className="event-date">{e.date}</div><div className="event-desc">{e.desc}</div></div>)}</div></section></div>
    <form className="panel detail-card" style={{marginTop:20}} onSubmit={save}><div className="title-row" style={{marginBottom:20,alignItems:'center'}}><div><div className="eyebrow">Delivery planning</div><h2 style={{margin:'7px 0 0',fontSize:20}}>Trucking & final destination</h2></div><button className="primary-btn" type="submit" disabled={saving}>{saving?<><LoaderCircle size={16} className="spin"/> Saving…</>:<><Save size={16}/> Save changes</>}</button></div>{feedback&&<div className={feedback.type==='success'?'success notice':'error notice'} style={{marginBottom:16}}>{feedback.type==='success'?<CheckCircle2 size={15} style={{verticalAlign:'middle',marginRight:6}}/>:null}{feedback.text}</div>}<div className="form-stack"><div className="info-grid" style={{marginTop:0}}><Field label="Dray carrier" value={form.carrier} error={errors.carrier} onChange={(v)=>update('carrier',v)} required/><Field label="Driver / dispatcher" value={form.driver} error={errors.driver} onChange={(v)=>update('driver',v)} required/><Field label="Truck number" value={form.truckNumber} error={errors.truckNumber} onChange={(v)=>update('truckNumber',v)} required/><Field label="Delivery appointment" value={form.appointment} error={errors.appointment} onChange={(v)=>update('appointment',v)} required/><Field label="Final destination" value={form.destination} error={errors.destination} onChange={(v)=>update('destination',v)} required/><Field label="Receiving contact" value={form.contactName} onChange={(v)=>update('contactName',v)}/><Field label="Delivery address" value={form.destinationAddress} error={errors.destinationAddress} onChange={(v)=>update('destinationAddress',v)} required/><Field label="Contact phone" value={form.contactPhone} onChange={(v)=>update('contactPhone',v)}/></div><div className="field"><label>Operations notes</label><textarea value={form.notes||''} onChange={(e)=>update('notes',e.target.value)} placeholder="Add appointment, accessorial, or receiving notes"/></div></div></form>
  </div></AppShell>;
}
function Field({label,value,error,onChange,required}:{label:string;value?:string;error?:string;onChange:(value:string)=>void;required?:boolean}) { return <div className="field"><label>{label}{required?' *':''}</label><input value={value||''} onChange={(e)=>onChange(e.target.value)} aria-invalid={!!error}/>{error&&<span className="error">{error}</span>}</div>; }
function formatDate(value:string) { const [year,month,day] = value.split('-').map(Number); return year && month && day ? new Date(year, month - 1, day).toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}) : value; }
