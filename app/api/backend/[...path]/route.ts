import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
const SESSION_COOKIE = 'jm_backend_session';
const routes: Record<string, string[]> = {
  'auth/login': ['POST'],
  'auth/logout': ['POST'],
  'auth/me': ['GET'],
  containers: ['GET'],
  'containers/summary': ['GET'],
  'containers/sync': ['POST'],
  'containers/export': ['GET'],
  settings: ['GET', 'PATCH'],
  'settings/reset': ['POST'],
  'settings/test-email': ['POST'],
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  const path = parts.join('/');
  const methods = routes[path] ?? (/^containers\/[a-zA-Z]{4}\d{7}$/.test(path) ? ['GET', 'PATCH'] : undefined);
  if (!methods) return NextResponse.json({ message: 'Endpoint not found.' }, { status: 404 });
  if (!methods.includes(request.method)) return NextResponse.json({ message: 'Method not allowed.' }, { status: 405, headers: { Allow: methods.join(', ') } });
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ message: 'Request origin is not allowed.' }, { status: 403 });
  }
  if (path === 'auth/logout') {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
    return response;
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (path !== 'auth/login' && !token) return NextResponse.json({ message: 'Please sign in to continue.' }, { status: 401 });
  try {
    const base = new URL(process.env.API_BASE_URL || 'http://localhost:4003/api');
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid backend URL');
    base.pathname = `${base.pathname.replace(/\/$/, '')}/${path}`;
    base.search = request.nextUrl.search;
    const headers = new Headers({ Accept: path === 'containers/export' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json' });
    if (token && path !== 'auth/login') headers.set('Authorization', `Bearer ${token}`);
    let body: string | undefined;
    if (request.method !== 'GET') {
      const text = await request.text();
      if (text) {
        try { JSON.parse(text); } catch { return NextResponse.json({ message: 'Invalid JSON request.' }, { status: 400 }); }
        body = text;
        headers.set('Content-Type', 'application/json');
      }
    }
    const upstream = await fetch(base, { method: request.method, headers, body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(path === 'containers/sync' ? 55_000 : 25_000) });
    if (upstream.status >= 300 && upstream.status < 400) return NextResponse.json({ message: 'The backend returned an unexpected redirect. Check API_BASE_URL.' }, { status: 502 });
    if (path === 'auth/login' && upstream.ok) {
      const payload = object(await upstream.json());
      const data = object(payload.data);
      const accessToken = payload.accessToken ?? payload.token ?? payload.access_token ?? data.accessToken ?? data.token ?? data.access_token;
      if (typeof accessToken !== 'string' || !accessToken) return NextResponse.json({ message: 'The login response did not include an access token.' }, { status: 502 });
      const response = NextResponse.json({ ok: true });
      response.cookies.set(SESSION_COOKIE, accessToken, { httpOnly: true, sameSite: 'lax', path: '/', secure: request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https' });
      return response;
    }
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['Content-Type', 'Content-Disposition']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    const response = new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
    if (upstream.status === 401) response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
    return response;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      const failure = error as { name?: string; message?: string; cause?: { code?: string } };
      console.error('Backend connection failed', { method: request.method, path, error: failure.name, message: failure.message ?? String(error), code: failure.cause?.code });
    }
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return NextResponse.json({ message: timeout ? 'The backend took too long to respond. Please try again.' : 'Cannot connect to the backend. Please check that the API server is running.' }, { status: timeout ? 504 : 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH };
