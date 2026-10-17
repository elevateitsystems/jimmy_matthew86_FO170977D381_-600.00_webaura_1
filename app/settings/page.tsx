'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, Save } from 'lucide-react';
import { AppShell } from '../../components/layout';

const SETTINGS_KEY = 'jm_demo_settings';
type Settings = { emailUpdates: boolean; compactTable: boolean; defaultView: 'After dehire' | 'All containers' };
const defaults: Settings = { emailUpdates: true, compactTable: false, defaultView: 'After dehire' };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [saved, setSaved] = useState(false);
  useEffect(() => { const stored = localStorage.getItem(SETTINGS_KEY); if (stored) { try { setSettings({ ...defaults, ...JSON.parse(stored) }); } catch { /* use defaults */ } } }, []);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => { setSettings((current) => ({ ...current, [key]: value })); setSaved(false); };
  const save = () => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); setSaved(true); };
  const reset = () => { setSettings(defaults); localStorage.removeItem(SETTINGS_KEY); setSaved(true); };
  return <AppShell><div className="content"><div className="title-row"><div><div className="eyebrow">WORKSPACE · DEMO DATA</div><h1 className="page-title">Settings</h1><p className="page-subtitle">Manage dashboard preferences for this browser.</p></div></div><div className="settings-grid"><section className="panel detail-card"><div className="eyebrow">Dashboard preferences</div><div className="settings-fields"><label className="setting-row"><span><strong>Email delivery updates</strong><small>Show notifications for changes to delivery records.</small></span><input type="checkbox" checked={settings.emailUpdates} onChange={(event) => update('emailUpdates', event.target.checked)} /></label><label className="setting-row"><span><strong>Compact table rows</strong><small>Use a denser layout on container lists.</small></span><input type="checkbox" checked={settings.compactTable} onChange={(event) => update('compactTable', event.target.checked)} /></label><div className="field"><label htmlFor="default-view">Default dashboard view</label><select id="default-view" value={settings.defaultView} onChange={(event) => update('defaultView', event.target.value as Settings['defaultView'])}><option value="After dehire">After dehire</option><option value="All containers">All containers</option></select></div></div><div className="update-actions settings-actions"><button type="button" className="primary-btn" onClick={save}>{saved ? <><CheckCircle2 size={16}/> Saved</> : <><Save size={16}/> Save settings</>}</button><button type="button" className="secondary-btn" onClick={reset}><RotateCcw size={16}/> Reset defaults</button></div></section><section className="panel detail-card"><div className="eyebrow">Workspace status</div><h2>Demo mode</h2><p className="muted">Your container records and preferences are stored locally in this browser. OpenTrack integration will be added in Phase 2.</p><div className="notice">No settings changes are sent to a server.</div></section></div></div></AppShell>;
}
