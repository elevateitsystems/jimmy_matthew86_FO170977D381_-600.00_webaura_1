'use client';
import { useEffect, useState } from 'react';
import { containers as seed, Container, DEMO_DATA_EVENT, DEMO_STORAGE_KEY } from './data';

export function getDemoContainers(): Container[] {
  if (typeof window === 'undefined') return seed;
  const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!stored) return seed;
  try { return JSON.parse(stored) as Container[]; } catch { return seed; }
}

export function saveDemoContainers(next: Container[]) {
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(DEMO_DATA_EVENT));
}

export function useDemoContainers() {
  const [items, setItems] = useState<Container[]>(seed);
  useEffect(() => {
    setItems(getDemoContainers());
    const refresh = () => setItems(getDemoContainers());
    window.addEventListener(DEMO_DATA_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DEMO_DATA_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return [items, (next: Container[]) => { setItems(next); saveDemoContainers(next); }] as const;
}
