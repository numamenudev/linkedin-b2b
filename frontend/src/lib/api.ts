/**
 * API client — thin fetch wrapper.
 *
 * Design decisions (DC-01):
 *  - credentials: 'include' so the browser always sends the HttpOnly JWT cookie.
 *  - No token stored in localStorage or memory.
 *  - 401 responses automatically redirect to /login.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiError extends Error {
  status: number;
  data?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createApiError(status: number, message: string, data?: unknown): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.data = data;
  return error;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    // Redirect to login — but avoid redirect loop
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw createApiError(401, 'Non autenticato');
  }

  if (response.status === 204) {
    // No Content
    return undefined as T;
  }

  let data: unknown;
  const contentType = response.headers.get('Content-Type') ?? '';

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else if (contentType.includes('text/')) {
    data = await response.text();
  } else {
    data = await response.blob();
  }

  if (!response.ok) {
    let message = `HTTP ${response.status} ${response.statusText}`;
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if ('message' in obj) message = String(obj.message);
      else if ('error' in obj) message = String(obj.error);
    }
    throw createApiError(response.status, message, data);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

export async function apiClient<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const defaultHeaders: HeadersInit = {};

  // Only set Content-Type for non-FormData bodies
  if (options.body && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  return handleResponse<T>(response);
}

// ---------------------------------------------------------------------------
// Convenience methods
// ---------------------------------------------------------------------------

/** HTTP GET */
export function get<T = unknown>(path: string, headers?: HeadersInit): Promise<T> {
  return apiClient<T>(path, { method: 'GET', headers });
}

/** HTTP POST — body is JSON-serialised automatically */
export function post<T = unknown>(
  path: string,
  body?: unknown,
  headers?: HeadersInit,
): Promise<T> {
  return apiClient<T>(path, {
    method: 'POST',
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    headers,
  });
}

/** HTTP PUT — body is JSON-serialised automatically */
export function put<T = unknown>(
  path: string,
  body?: unknown,
  headers?: HeadersInit,
): Promise<T> {
  return apiClient<T>(path, {
    method: 'PUT',
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    headers,
  });
}

/** HTTP PATCH — body is JSON-serialised automatically */
export function patch<T = unknown>(
  path: string,
  body?: unknown,
  headers?: HeadersInit,
): Promise<T> {
  return apiClient<T>(path, {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers,
  });
}

/** HTTP DELETE — aliased as `del` to avoid reserved keyword */
export function del<T = unknown>(path: string, headers?: HeadersInit): Promise<T> {
  return apiClient<T>(path, { method: 'DELETE', headers });
}

// ---------------------------------------------------------------------------
// Named export as a namespaced object (for convenience)
// ---------------------------------------------------------------------------

export const api = { get, post, put, patch, del };

export default api;
