function firstHeader(headers: Headers, name: string): string | undefined {
  return headers.get(name)?.split(',')[0].trim() || undefined;
}

function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function requestOrigin(headers: Headers, fallbackOrigin: string, appOrigin?: string): string | null {
  // An explicit public origin also works when a reverse proxy rewrites Host.
  if (appOrigin?.trim()) return httpOrigin(appOrigin.trim());
  try {
    const fallback = new URL(fallbackOrigin);
    // The deployment's trusted proxy must overwrite these headers, not append client values.
    const protocol = firstHeader(headers, 'x-forwarded-proto') ?? fallback.protocol.slice(0, -1);
    const host = firstHeader(headers, 'x-forwarded-host') ?? headers.get('host') ?? fallback.host;
    return httpOrigin(`${protocol}://${host}`);
  } catch {
    return null;
  }
}
