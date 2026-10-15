'use client';
import { useEffect, useMemo, useState } from 'react'; import { useRouter } from 'next/navigation'; import { ChevronLeft, ChevronRight, PackageSearch } from 'lucide-react'; import Link from 'next/link'; import { Container, ShipmentStatus } from '../lib/data';
export function StatusBadge({ status }: { status: ShipmentStatus }) { const cls = status === 'After dehire' ? 'gold' : status === 'Delivered' ? 'green' : status === 'At origin' ? 'gray' : status === 'On water' ? 'blue' : 'green'; return <span className={`status ${cls}`}>{status}</span> }
export function Metrics({ counts, onSelect }: { counts: Record<ShipmentStatus, number>; onSelect: (status: ShipmentStatus) => void }) { const cards: [ShipmentStatus, string, string][] = [['At origin', '', ''], ['On water', '', ''], ['At port', '', ''], ['Out to warehouse', '', ''], ['After dehire', '', 'gold'], ['Delivered', '', '']]; return <div className="metrics">{cards.map(([status, note, tone]) => <button type="button" key={status} className={`metric metric-button ${tone}`} onClick={() => onSelect(status)} aria-label={`View ${status} containers`}><div className="metric-label">{status === 'After dehire' ? 'Dehired · awaiting delivery' : status}</div><div className="metric-value">{counts[status]}</div>{note && <div className="metric-note">{note}</div>}</button>)}</div> }
export function ContainerTable({ rows }: { rows: Container[] }) {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const visibleRows = useMemo(() => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [rows, currentPage, pageSize]);
    useEffect(() => { setPage(1); }, [rows, pageSize]);
    useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
    const first = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
    const last = rows.length ? Math.min(currentPage * pageSize, rows.length) : 0;
    const openRow = (id: string) => router.push(`/containers/${id}`);
    const onRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, id: string) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRow(id); }
    };
    return <>
        {rows.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Container</th><th>MBL</th><th>Size</th><th>Port · terminal</th><th>Dehired</th><th>Days</th><th>Step</th><th>Final destination</th><th>Carrier</th><th>Appt</th><th>Notes</th></tr></thead><tbody>{visibleRows.map(c => <tr key={c.id} className="clickable-row" tabIndex={0} aria-label={`Open ${c.container}`} onClick={(event) => { if ((event.target as HTMLElement).closest('a,button,input,select,textarea')) return; openRow(c.id); }} onKeyDown={(event) => onRowKeyDown(event, c.id)}><td><Link href={`/containers/${c.id}`} className="mono">{c.container}</Link></td><td className="mono">{c.mbl}</td><td>{c.size}</td><td>{c.port}</td><td>{c.status === 'After dehire' ? '—' : c.deliveredDate || '—'}</td><td>{c.days || '—'}</td><td><span className={`status ${c.status === 'After dehire' ? 'gold' : c.status === 'Delivered' ? 'green' : c.status === 'On water' ? 'blue' : 'gray'}`}>{c.milestone}</span></td><td>{c.destination}</td><td>{c.carrier || '—'}</td><td>{c.appointment || '—'}</td><td>{c.notes || '—'}</td></tr>)}</tbody></table></div> : <div style={{ padding: '60px 20px', textAlign: 'center' }}><PackageSearch size={34} color="#9aa9b5" /><h3>No containers found</h3><p className="muted">Try adjusting your search or filter.</p></div>}
        <div className="pagination"><div className="pagination-summary">Showing {first}–{last} of {rows.length} containers</div><div className="pagination-controls"><label className="page-size">Rows <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Rows per page"><option value={10}>10</option><option value={15}>15</option><option value={25}>25</option></select></label><div className="pages"><button className="page" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Previous page"><ChevronLeft size={15} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <button key={number} className={`page ${number === currentPage ? 'active' : ''}`} type="button" onClick={() => setPage(number)} aria-current={number === currentPage ? 'page' : undefined}>{number}</button>)}<button className="page" type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="Next page"><ChevronRight size={15} /></button></div></div></div>
    </>;
}

