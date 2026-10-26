'use client';
import { useEffect, useState } from 'react';
import { LoaderCircle, Mail, RotateCcw, Save } from 'lucide-react';
import { AppShell } from '../../components/layout';
import { LoadingScreen } from '../../components/loading';
import { showToast } from '../../components/toast';
import { updateSettings, useContainerTracker } from '../../lib/container-store';
import { apiJson, errorMessage } from '../../lib/api';
import type { WorkspaceSettings } from '../../lib/backend';

type Preferences=Pick<WorkspaceSettings,'emailUpdates'|'compactTable'|'defaultView'>;
function preferences(settings:WorkspaceSettings):Preferences{return {emailUpdates:settings.emailUpdates,compactTable:settings.compactTable,defaultView:settings.defaultView}}
function SettingsContent(){
  const {settings,metadataLoaded,metadataError,reloadMetadata}=useContainerTracker();
  const [draft,setDraft]=useState<Preferences>();const [busy,setBusy]=useState<'save'|'reset'|'email'>();const [feedback,setFeedback]=useState<{error:boolean;text:string}>();
  useEffect(()=>{if(settings)setDraft(preferences(settings))},[settings]);
  const update=<K extends keyof Preferences>(key:K,value:Preferences[K])=>{setDraft(current=>current?{...current,[key]:value}:current);setFeedback(undefined)};
  const perform=async(action:'save'|'reset'|'email')=>{
    setBusy(action);setFeedback(undefined);
    try{
      if(action==='email'){await apiJson('/settings/test-email',{method:'POST'});setFeedback({error:false,text:'The test email request was accepted.'});showToast('Test email requested','Check the configured alert inbox.')}
      else{await updateSettings(action==='save'?draft:undefined);setFeedback({error:false,text:action==='save'?'Your workspace settings have been saved.':'Default workspace settings restored.'});showToast(action==='save'?'Settings saved':'Defaults restored')}
    }catch(error){setFeedback({error:true,text:errorMessage(error)})}finally{setBusy(undefined)}
  };
  const dirty=!!draft&&!!settings&&JSON.stringify(draft)!==JSON.stringify(preferences(settings));
  return <div className="content"><div className="title-row"><div><div className="eyebrow">WORKSPACE PREFERENCES</div><h1 className="page-title">Settings</h1><p className="page-subtitle">Manage your workspace preferences and delivery notifications.</p></div></div>
    {!draft?(!metadataLoaded?<LoadingScreen variant="inline" message="Loading workspace settings…"/>:<div className="panel detail-card"><div className="notice error" role="alert">{metadataError||'Unable to load settings.'}</div><button className="secondary-btn" onClick={reloadMetadata} style={{marginTop:16}}>Try again</button></div>):<>
    {feedback&&<div className={`notice ${feedback.error?'error':'success'}`} role={feedback.error?'alert':'status'} style={{marginBottom:20}}>{feedback.text}</div>}
    <div className="settings-grid"><section className="panel detail-card"><div className="eyebrow">Dashboard preferences</div><fieldset className="settings-fieldset" disabled={!!busy}><div className="settings-fields"><label className="setting-row"><span><strong>Email delivery updates</strong><small>Receive notifications when delivery records change.</small></span><input type="checkbox" checked={draft.emailUpdates} onChange={event=>update('emailUpdates',event.target.checked)}/></label><label className="setting-row"><span><strong>Compact table rows</strong><small>Use a denser layout on container lists.</small></span><input type="checkbox" checked={draft.compactTable} onChange={event=>update('compactTable',event.target.checked)}/></label><div className="field"><label htmlFor="default-view">Default container view</label><select id="default-view" value={draft.defaultView} onChange={event=>update('defaultView',event.target.value as Preferences['defaultView'])}><option value="Active">Active containers</option><option value="All containers">All containers</option></select></div></div></fieldset><div className="update-actions settings-actions"><button type="button" className="primary-btn" disabled={!!busy||!dirty} onClick={()=>perform('save')}>{busy==='save'?<><LoaderCircle size={16} className="spin"/> Saving…</>:<><Save size={16}/> Save settings</>}</button><button type="button" className="secondary-btn" disabled={!!busy} onClick={()=>perform('reset')}>{busy==='reset'?<LoaderCircle size={16} className="spin"/>:<RotateCcw size={16}/>} Reset defaults</button></div></section>
    <section className="panel detail-card"><div className="eyebrow">Workspace status</div><h2>Email notifications</h2><p className="muted">Delivery alerts are managed by your workspace email service.</p><div className="info-grid"><div><div className="info-label">Mail connection</div><div className="info-value">{settings?.mailConfigured===true?'Configured':settings?.mailConfigured===false?'Not configured':'Status not reported'}</div></div><div><div className="info-label">Alert inbox</div><div className="info-value" style={{overflowWrap:'anywhere'}}>{settings?.alertEmail||'Not provided'}</div></div></div><div className="notice" style={{marginTop:22}}>A test email will be sent to the configured alert inbox when you select the button below.</div><button className="secondary-btn" type="button" style={{marginTop:18,display:'inline-flex',gap:8,alignItems:'center'}} onClick={()=>perform('email')} disabled={!!busy||settings?.mailConfigured===false}>{busy==='email'?<LoaderCircle size={16} className="spin"/>:<Mail size={16}/>} Send test email</button>{settings?.mailConfigured===false&&<p className="muted" style={{fontSize:12}}>Ask your administrator to configure the mail service.</p>}</section></div></>}
  </div>;
}
export default function SettingsPage(){return <AppShell><SettingsContent/></AppShell>}