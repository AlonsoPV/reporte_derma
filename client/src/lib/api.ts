export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  doctorId: string | null;
};

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let message = 'Error de solicitud';
    try {
      const data = await res.json();
      message = data.error || message;
      const err = new Error(message) as Error & { status: number; data?: unknown };
      err.status = res.status;
      err.data = data;
      throw err;
    } catch (e) {
      if (e instanceof Error && 'status' in e) throw e;
      throw Object.assign(new Error(message), { status: res.status });
    }
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  throw Object.assign(new Error('La API no respondió JSON'), { status: res.status });
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
};
