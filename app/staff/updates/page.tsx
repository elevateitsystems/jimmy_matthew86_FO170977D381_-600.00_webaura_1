'use client';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, LoaderCircle, PackageCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout';
import { StatusBadge } from '../../../components/shared';
import { formatDate } from '../../../lib/dates';
import { isDelivered, sortContainers } from '../../../lib/tracking';
import { useContainerTracker } from '../../../lib/container-store';
import { useEffect, useMemo, useState } from 'react';

const schema = z.object({ destination: z.string().trim().optional(), carrier: z.string().trim().optional(), appointment: z.string().optional(), deliveredDate: z.string().optional(), notes: z.string().optional() });
type FormData = z.infer<typeof schema>;

export default function Updates() {
  const router = useRouter();
  const { ready, containers, saveUserFields } = useContainerTracker();
  const [selectedId, setSelectedId] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const selected = useMemo(() => containers.find((item) => item.id === selectedId), [containers, selectedId]);
  const options = useMemo(() => sortContainers(containers), [containers]);
  useEffect(() => { if (!ready) return; const id = new URLSearchParams(window.location.search).get('container'); if (id && containers.some((item) => item.id === id)) setSelectedId(id); }, [ready]);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { destination: '', carrier: '', appointment: '', deliveredDate: '', notes: '' } });
  // Reset only when a different container is chosen, so a background refresh never wipes what is being typed.
  useEffect(() => { if (ready && selected) reset({ destination: selected.user.destination || '', carrier: selected.user.carrier || '', appointment: selected.user.appointment || '', deliveredDate: selected.user.deliveredDate || '', notes: selected.user.notes || '' }); }, [ready, selectedId, reset]);

  const fallbackPath = selected ? `/containers/${selected.id}` : '/dashboard';
  const leave = () => { if (window.history.length > 1) router.back(); else router.push(fallbackPath); };
  const persist = (values: FormData) => { saveUserFields(selected!.id, { destination: values.destination, carrier: values.carrier, appointment: values.appointment, deliveredDate: values.deliveredDate, notes: values.notes }); return isDelivered(values); };
  const submit = async (values: FormData) => { if (!selected) return; if (values.deliveredDate && !isValidDate(values.deliveredDate)) { setError('deliveredDate', { type: 'manual', message: 'Choose a valid delivered date.' }); return; } const delivered = persist(values); setSavedMessage(delivered && selected.tracked ? 'Update saved. This container moves to the Delivered list.' : 'Update saved successfully for this session.'); await new Promise((resolve) => setTimeout(resolve, 700)); leave(); };
  const markDelivered = async (values: FormData) => {
    if (!selected) return;
    const missing = (['destination', 'carrier', 'deliveredDate'] as const).filter((field) => !values[field]?.trim());
    if (missing.length) { missing.forEach((field) => setError(field, { type: 'manual', message: field === 'deliveredDate' ? 'Choose a valid delivered date.' : field === 'destination' ? 'Enter a final delivery destination.' : 'Enter a trucker or carrier name.' })); return; }
    if (!isValidDate(values.deliveredDate!)) { setError('deliveredDate', { type: 'manual', message: 'Choose a valid delivered date.' }); return; }
    persist(values); setSavedMessage(selected.tracked ? 'Shipment marked as delivered. Returning…' : 'Saved. This container is not tracked yet, so it moves to Delivered once OpenTrack reports a milestone. Returning…'); await new Promise((resolve) => setTimeout(resolve, 700)); leave();
  };
  if (!selected) return <AppShell><div className="content"><button type="button" className="back-link muted" onClick={leave}><ArrowLeft size={15}/> Back</button><div className="eyebrow">Staff workspace · Delivery updates</div><h1 className="page-title">Select a shipment</h1><p className="page-subtitle" style={{marginBottom:26}}>Choose a shipment from the existing container list to record a delivery update.</p><div className="panel detail-card"><div className="field"><label htmlFor="shipment-select">Shipment</label><select id="shipment-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Choose a shipment</option>{options.map((item) => <option key={item.id} value={item.id}>{item.container} · {item.user.destination || 'No destination'} · {item.status}</option>)}</select></div></div></div></AppShell>;
  return <AppShell><div className="content">
    <button type="button" className="back-link muted" onClick={leave}><ArrowLeft size={15}/> Back</button>
    <div className="eyebrow">Staff workspace · Delivery updates</div><h1 className="page-title">Record a delivery update</h1><p className="page-subtitle" style={{marginBottom:26}}>Add operational details for <span className="mono">{selected.container}</span>.</p>
    <div className="detail-grid"><section className="panel detail-card"><div className="notice">This is a frontend prototype. Changes are simulated locally and are not written to a backend.</div><form className="form-stack" style={{marginTop:24}} onSubmit={handleSubmit(submit)}><div className="field"><label htmlFor="destination">Final delivery destination</label><input id="destination" {...register('destination')} placeholder="e.g. Commerce, TX"/>{errors.destination&&<span className="error">{errors.destination.message}</span>}</div><div className="field"><label htmlFor="carrier">Trucker / carrier</label><input id="carrier" {...register('carrier')} placeholder="Company or driver name"/>{errors.carrier&&<span className="error">{errors.carrier.message}</span>}</div><div className="field"><label htmlFor="appointment">Delivery appointment</label><input id="appointment" type="date" {...register('appointment')}/>{errors.appointment&&<span className="error">{errors.appointment.message}</span>}</div><div className="field"><label htmlFor="deliveredDate">Delivered Date</label><input id="deliveredDate" type="date" {...register('deliveredDate')}/>{errors.deliveredDate&&<span className="error">{errors.deliveredDate.message}</span>}</div><div className="field"><label htmlFor="notes">Notes for customer and operations <span className="muted">(optional)</span></label><textarea id="notes" {...register('notes')} placeholder="Add a helpful handoff note..."/><div className="update-actions"><button className="primary-btn" type="submit" disabled={isSubmitting||!!savedMessage}>{isSubmitting&&!savedMessage?<><LoaderCircle size={16} className="spin"/> Saving…</>: 'Save delivery update'}</button><button className="secondary-btn" type="button" onClick={handleSubmit(markDelivered)} disabled={isSubmitting||!!savedMessage}><PackageCheck size={16}/> Mark as Delivered</button></div>{savedMessage&&<div className="success notice" role="status"><CheckCircle2 size={15} style={{verticalAlign:'middle',marginRight:6}}/>{savedMessage}</div>}</div></form></section><section className="panel detail-card"><div className="eyebrow">Container snapshot</div><h2 className="mono" style={{fontSize:20}}>{selected.container}</h2><div className="info-grid"><div><div className="info-label">MBL</div><div className="info-value">{selected.mbl}</div></div><div><div className="info-label">Current status</div><div className="info-value"><StatusBadge status={selected.status}/></div></div><div><div className="info-label">{selected.dateLabel}</div><div className="info-value">{formatDate(selected.dateValue)} · {selected.daysText}</div></div><div><div className="info-label">Origin</div><div className="info-value">{selected.origin}</div></div><div><div className="info-label">Port</div><div className="info-value">{selected.port}</div></div><div><div className="info-label">Delivered date</div><div className="info-value">{selected.user.deliveredDate ? formatDate(selected.user.deliveredDate) : 'Not yet delivered'}</div></div></div></section></div>
  </div></AppShell>;
}
function isValidDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const [year, month, day] = value.split('-').map(Number); const date = new Date(year, month - 1, day); return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day; }
