const ENV_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function resolveApiUrl() {
  if (typeof window === 'undefined') return ENV_API_URL;
  const host = window.location.hostname;
  if (host === '100.65.239.74') return 'http://100.65.239.74:5051';
  if (host === '192.168.1.177') return 'http://192.168.1.177:5051';
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5000';
  return ENV_API_URL;
}

const API_URL = resolveApiUrl();

export function getApiUrl() {
  return API_URL;
}

export function imageUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;

  // Built-in public web assets should stay on the website domain.
  if (
    path.startsWith('/demo-posters/') ||
    path.startsWith('/prizetown-logo') ||
    path.startsWith('/favicon') ||
    path.startsWith('/arnold-')
  ) {
    return path;
  }

  // Uploaded files are served by the API.
  if (path.startsWith('/uploads/')) return `${API_URL}${path}`;

  // Default: keep normal site/public paths local.
  if (path.startsWith('/')) return path;

  return path;
}

export async function api(path, options = {}) {
  const token = localStorage.getItem('prizetown_token');
  const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
