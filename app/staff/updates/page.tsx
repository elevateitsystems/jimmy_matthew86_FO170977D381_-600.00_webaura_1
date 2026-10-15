'use client';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, LoaderCircle, PackageCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout';
import { Container } from '../../../lib/data';
import { useDemoContainers } from '../../../lib/container-store';
import { useEffect, useState } from 'react';

const schema = z.object({ destination: z.string().trim().min(2, 'Enter a final delivery destination.'), carrier: z.string().trim().min(2, 'Enter a trucker or carrier name.'), appointment: z.string().min(1, 'Choose an appointment date.'), deliveredDate: z.string().optional(), notes: z.string().optional() });
type FormData = z.infer<typeof schema>;

export default function Updates() {
  const router = useRouter();
  const [containers, setContainers] = useDemoContainers();
  const [selectedId, setSelectedId] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [selected, setSelected] = useState<Container>();
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('container'); setSelectedId(id && containers.some((item) => item.id === id) ? id : ''); }, [containers]);
  useEffect(() => { setSelected(containers.find((item) => item.id === selectedId)); }, [containers, selectedId]);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { destination: '', carrier: '', appointment: '', deliveredDate: '', notes: '' } });
  useEffect(() => { if (selected) reset({ destination: selected.destination, carrier: selected.carrier || '', appointment: toDateInput(selected.appointment), deliveredDate: selected.deliveredDate || '', notes: selected.notes || '' }); }, [selected, reset]);

  const fallbackPath = selected ? `/containers/${selected.id}` : '/dashboard';
  const leave = () => { if (window.history.length > 1) router.back(); else router.push(fallbackPath); };
  const persist = (values: FormData, status: Container['status'] = selected!.status) => { const updated = { ...selected!, destination: values.destination, carrier: values.carrier, appointment: values.appointment, deliveredDate: status === 'Delivered' ? values.deliveredDate || undefined : selected!.deliveredDate, notes: values.notes, status, milestone: status === 'Delivered' ? 'Delivered' : selected!.milestone }; setContainers(containers.map((item) => item.id === selected!.id ? updated : item)); };
  const submit = async (values: FormData) => { if (!selected) return; persist(values); setSavedMessage('Update saved successfully for this session.'); await new Promise((resolve) => setTimeout(resolve, 700)); leave(); };
  const markDelivered = async (values: FormData) => {
    if (!selected) return;
    if (!values.deliveredDate || !isValidDate(values.deliveredDate)) { setError('deliveredDate', { type: 'manual', message: 'Choose a valid delivered date.' }); return; }
    persist(values, 'Delivered'); setSavedMessage('Shipment marked as delivered. Returning…'); await new Promise((resolve) => setTimeout(resolve, 700)); leave();
  };
  if (!selected) return <AppShell><div className="content"><button type="button" className="back-link muted" onClick={leave}><ArrowLeft size={15}/> Back</button><div className="eyebrow">Staff workspace · Delivery updates</div><h1 className="page-title">Select a shipment</h1><p className="page-subtitle" style={{marginBottom:26}}>Choose a shipment from the existing container list to record a delivery update.</p><div className="panel detail-card"><div className="field"><label htmlFor="shipment-select">Shipment</label><select id="shipment-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Choose a shipment</option>{containers.map((item) => <option key={item.id} value={item.id}>{item.container} · {item.destination} · {item.status}</option>)}</select></div></div></div></AppShell>;
  return <AppShell><div className="content">
    <button type="button" className="back-link muted" onClick={leave}><ArrowLeft size={15}/> Back</button>
    <div className="eyebrow">Staff workspace · Delivery updates</div><h1 className="page-title">Record a delivery update</h1><p className="page-subtitle" style={{marginBottom:26}}>Add operational details for <span className="mono">{selected.container}</span>.</p>
    <div className="detail-grid"><section className="panel detail-card"><div className="notice">This is a frontend prototype. Changes are simulated locally and are not written to a backend.</div><form className="form-stack" style={{marginTop:24}} onSubmit={handleSubmit(submit)}><div className="field"><label htmlFor="destination">Final delivery destination</label><input id="destination" {...register('destination')} placeholder="e.g. Commerce, TX"/>{errors.destination&&<span className="error">{errors.destination.message}</span>}</div><div className="field"><label htmlFor="carrier">Trucker / carrier</label><input id="carrier" {...register('carrier')} placeholder="Company or driver name"/>{errors.carrier&&<span className="error">{errors.carrier.message}</span>}</div><div className="field"><label htmlFor="appointment">Delivery appointment</label><input id="appointment" type="date" {...register('appointment')}/>{errors.appointment&&<span className="error">{errors.appointment.message}</span>}</div><div className="field"><label htmlFor="deliveredDate">Delivered Date</label><input id="deliveredDate" type="date" {...register('deliveredDate')}/>{errors.deliveredDate&&<span className="error">{errors.deliveredDate.message}</span>}</div><div className="field"><label htmlFor="notes">Notes for customer and operations <span className="muted">(optional)</span></label><textarea id="notes" {...register('notes')} placeholder="Add a helpful handoff note..."/><div className="update-actions"><button className="primary-btn" type="submit" disabled={isSubmitting||!!savedMessage}>{isSubmitting&&!savedMessage?<><LoaderCircle size={16} className="spin"/> Saving…</>: 'Save delivery update'}</button><button className="secondary-btn" type="button" onClick={handleSubmit(markDelivered)} disabled={isSubmitting||!!savedMessage}><PackageCheck size={16}/> Mark as Delivered</button></div>{savedMessage&&<div className="success notice" role="status"><CheckCircle2 size={15} style={{verticalAlign:'middle',marginRight:6}}/>{savedMessage}</div>}</div></form></section><section className="panel detail-card"><div className="eyebrow">Container snapshot</div><h2 className="mono" style={{fontSize:20}}>{selected.container}</h2><div className="info-grid"><div><div className="info-label">MBL</div><div className="info-value">{selected.mbl}</div></div><div><div className="info-label">Current status</div><div className="info-value">{selected.status}</div></div><div><div className="info-label">Origin</div><div className="info-value">{selected.origin}</div></div><div><div className="info-label">Port</div><div className="info-value">{selected.port}</div></div><div><div className="info-label">Delivered date</div><div className="info-value">{selected.deliveredDate ? formatDate(selected.deliveredDate) : 'Not yet delivered'}</div></div></div></section></div>
  </div></AppShell>;
}
function isValidDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const [year, month, day] = value.split('-').map(Number); const date = new Date(year, month - 1, day); return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day; }
function toDateInput(value?: string) { if (!value) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value; const match = value.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i); if (!match) return ''; const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase()) + 1; return `2024-${String(month).padStart(2,'0')}-${String(Number(match[1])).padStart(2,'0')}`; }
function formatDate(value:string) { const [year,month,day] = value.split('-').map(Number); return year && month && day ? new Date(year, month - 1, day).toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}) : value; }
