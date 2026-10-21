import Image from 'next/image';

/** Centered branded loader. `screen` fills the viewport, `inline` fills a content area, `overlay` dims the content beneath it. */
export function LoadingScreen({ message = 'Loading…', variant = 'screen' }: { message?: string; variant?: 'screen' | 'inline' | 'overlay' }) {
  return <div className={`loader loader-${variant}`} role="status" aria-live="polite"><div className="loader-card"><Image src="/logo.jpeg" alt="Java Maryland" width={154} height={86} priority/><div className="loader-bar" aria-hidden="true"><span/></div><div className="loader-text">{message}</div></div></div>;
}
