import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '../components/toast';

export const metadata: Metadata = { title: 'Java Maryland · Container Tracking', description: 'Import container operations dashboard' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}<Toaster/></body></html>; }
