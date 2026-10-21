'use client';
import { useSyncExternalStore } from 'react';
import { CheckCircle2, X } from 'lucide-react';

type Toast = { id: number; title: string; message?: string };
const DURATION_MS = 4000;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const dismiss = (id: number) => { toasts = toasts.filter((toast) => toast.id !== id); emit(); };

/** Shows a success toast in the top-right corner. Lives in the root layout, so it survives page navigation. */
export function showToast(title: string, message?: string) {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, title, message }]; emit();
  setTimeout(() => dismiss(id), DURATION_MS);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const empty: Toast[] = [];

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => empty);
  return <div className="toast-region" aria-live="polite">{items.map((toast) => <div className="toast" role="status" key={toast.id}><CheckCircle2 size={20} className="toast-icon"/><div className="toast-body"><strong>{toast.title}</strong>{toast.message && <span>{toast.message}</span>}</div><button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss"><X size={15}/></button><span className="toast-timer" style={{ animationDuration: `${DURATION_MS}ms` }}/></div>)}</div>;
}
