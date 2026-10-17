'use client';
import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Mail, Search } from 'lucide-react';
import { AppShell } from '../../components/layout';

const faqs = [
  ['How do I update a container?', 'Open Delivery updates, select a container, enter the available delivery details, and save the update. The demo workspace stores changes locally.'],
  ['What does After dehire mean?', 'These containers have been unpacked and the empty equipment has been returned. They remain here until delivery details are complete.'],
  ['How do summary cards work?', 'Select a summary card on the dashboard to see only the matching demo records. Cards with no matching records show an empty state.'],
  ['Is this connected to OpenTrack?', 'Not yet. This workspace currently uses demo data; OpenTrack integration is planned for Phase 2.'],
] as const;

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const results = useMemo(() => faqs.filter(([question, answer]) => `${question} ${answer}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <AppShell><div className="content"><div className="title-row"><div><div className="eyebrow">SUPPORT · DEMO WORKSPACE</div><h1 className="page-title">Help center</h1><p className="page-subtitle">Find answers about container tracking and delivery updates.</p></div></div><div className="panel help-panel"><div className="help-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help articles" aria-label="Search help articles"/></div><div className="faq-list">{results.length ? results.map(([question, answer]) => <div className="faq-item" key={question}><button type="button" className="faq-question" onClick={() => setOpen(open === question ? null : question)} aria-expanded={open === question}>{question}<ChevronDown size={17} className={open === question ? 'faq-chevron open' : 'faq-chevron'}/></button>{open === question && <p className="faq-answer">{answer}</p>}</div>) : <div className="empty-help">No help articles match your search.</div>}</div></div><section className="help-contact panel"><div><div className="eyebrow">NEED MORE HELP?</div><h2>Contact the operations team</h2><p className="muted">Send a demo support request. No external message is sent.</p></div><button type="button" className="primary-btn" onClick={() => setSent(true)} disabled={sent}>{sent ? <><CheckCircle2 size={16}/> Request noted</> : <><Mail size={16}/> Contact support</>}</button></section></div></AppShell>;
}
