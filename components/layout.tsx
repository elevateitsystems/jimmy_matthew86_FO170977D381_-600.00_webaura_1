'use client';
import Image from 'next/image'; import Link from 'next/link'; import { usePathname, useRouter } from 'next/navigation'; import { Boxes, ClipboardCheck, HelpCircle, LogOut, Menu, Settings, X } from 'lucide-react'; import { useEffect, useState } from 'react';
import { useContainerTracker } from '../lib/container-store';
import { formatTime } from '../lib/dates';
import { LoadingScreen } from './loading';
import { apiJson, ApiError, errorMessage, SESSION_EXPIRED_EVENT } from '../lib/api';
export function Sidebar(){const path=usePathname();const router=useRouter();const [open,setOpen]=useState(false);const nav=[['/containers','All containers',Boxes],['/staff/updates','Delivery updates',ClipboardCheck]] as const;const logout=async()=>{try{await apiJson('/auth/logout',{method:'POST'});window.location.assign('/login')}catch{window.alert('Unable to sign out. Please try again.')}};return <><button className="mobile-menu icon-btn" onClick={()=>setOpen(!open)} aria-label="Toggle navigation">{open?<X/>:<Menu/>}</button><aside className={`sidebar ${open?'open':''}`}><Link href="/containers" className="brand" onClick={()=>setOpen(false)}><Image src="/logo.jpeg" alt="Java Maryland" width={154} height={86} priority/><span className="sr-only">Java Maryland</span></Link><div className="nav-scroll"><div className="nav-label">Workspace</div>{nav.map(([href,label,Icon])=><Link key={href} href={href} className={`nav-item ${path===href?'active':''}`} onClick={()=>setOpen(false)}><Icon size={17}/>{label}</Link>)}<div className="nav-label" style={{marginTop:28}}>Support</div><Link href="/help" className={`nav-item support-button support-help ${path==='/help'?'active':''}`} onClick={()=>setOpen(false)}><HelpCircle size={20}/>Help center</Link><Link href="/settings" className={`nav-item support-button support-settings ${path==='/settings'?'active':''}`} onClick={()=>setOpen(false)}><Settings size={20}/>Settings</Link></div><div className="sidebar-bottom"><div style={{display:'flex',gap:10,alignItems:'center'}}><div className="avatar">JM</div><div><div style={{color:'#fff'}}>Operations team</div><div>Staff workspace</div></div></div><button className="logout-btn" onClick={logout}><LogOut size={15}/> Log out</button></div></aside></>}
function AuthGate({children}:{children:React.ReactNode}) {
  const router=useRouter();
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    const expired=()=>{setReady(false);router.replace('/login')};
    window.addEventListener(SESSION_EXPIRED_EVENT,expired);
    apiJson('/auth/me',{signal:controller.signal}).then(()=>{if(active){setError('');setReady(true)}}).catch((error)=>{if(!active)return;if(error instanceof ApiError&&error.status===401)router.replace('/login');else setError(errorMessage(error))});
    return ()=>{active=false;controller.abort();window.removeEventListener(SESSION_EXPIRED_EVENT,expired)};
  },[router,attempt]);
  if(error)return <main className="content"><div className="panel detail-card"><h1 className="page-title">Unable to open workspace</h1><p role="alert">{error}</p><button className="primary-btn" onClick={()=>{setError('');setAttempt(value=>value+1)}}>Try again</button> <Link href="/login" className="secondary-btn">Back to sign in</Link></div></main>;
  if(!ready)return <LoadingScreen message="Checking workspace access?"/>;
  return <>{children}</>;
}
function SyncStatus(){const {tracker,refreshing}=useContainerTracker();return <span className="muted" style={{fontSize:12}} role="status">{refreshing?'Syncing…':`Last synced ${formatTime(tracker.lastSyncedAt)}`}</span>}
export function AppShell({children}:{children:React.ReactNode}){return <AuthGate><div className="shell"><Sidebar/><main className="main"><header className="topbar"><div className="crumb">Java Maryland Ocean Tracking</div><div className="top-actions"><SyncStatus/><div className="avatar">JM</div></div></header>{children}</main></div></AuthGate>}
