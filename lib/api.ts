export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

export const SESSION_EXPIRED_EVENT = 'jm-session-expired';

export async function apiResponse(path: string, options: RequestInit = {}): Promise<Response> {
  let response: Response;
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  try { response = await fetch(`/api/backend${path}`, { ...options, credentials: 'same-origin', cache: 'no-store', headers }); }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('Unable to reach the server. Check your connection and try again.', 0);
  }
  if (!response.ok) {
    let message = `The request failed (${response.status}). Please try again.`;
    try {
      const payload = await response.json();
      const detail = payload.message ?? payload.error?.message ?? payload.error;
      if (typeof detail === 'string') message = detail;
      else if (Array.isArray(detail)) message = detail.filter((item) => typeof item === 'string').join(' ');
    } catch { /* use the status message when the upstream sends a non-JSON error */ }
    if (response.status === 401 && path !== '/auth/login' && typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(message, response.status);
  }
  return response;
}

export async function apiJson<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiResponse(path, options);
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; }
  catch { throw new ApiError('The backend returned an invalid response.', 502); }
}

export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
