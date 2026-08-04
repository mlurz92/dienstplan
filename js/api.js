async function parseJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return { ok: false, error: { message: text || 'Ungültige Serverantwort' } }; }
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const error = new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
    error.name = 'ApiError';
    error.status = res.status;
    error.code = data?.error?.code || null;
    error.traceId = data?.error?.traceId || null;
    error.details = data;
    throw error;
  }
  return data;
}

function monthMutationKey(year, month, payload) {
  const revision = Math.max(0, Math.round(Number(payload?.revision) || 0));
  const stamp = String(payload?.updatedAt || 'unstamped').replace(/[^0-9A-Za-z_.:-]/g, '-');
  return `month-${year}-${String(month).padStart(2, '0')}-r${revision}-${stamp}`.slice(0, 180);
}

export const api = {
  bootstrap: () => request('/api/bootstrap'),
  getMonth: (year, month) => request(`/api/month/${year}/${String(month).padStart(2, '0')}`),
  saveMonth: (year, month, payload) => request(`/api/month/${year}/${String(month).padStart(2, '0')}`, {
    method: 'PUT',
    headers: { 'Idempotency-Key': monthMutationKey(year, month, payload) },
    body: JSON.stringify(payload)
  }),
  getSettings: () => request('/api/settings'),
  saveSettings: payload => request('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  getStaff: () => request('/api/staff'),
  saveStaff: payload => request('/api/staff', { method: 'PUT', body: JSON.stringify(payload) }),
  getRbnNames: () => request('/api/rbn-names'),
  saveRbnNames: payload => request('/api/rbn-names', { method: 'PUT', body: JSON.stringify(payload) }),
  exportJson: () => request('/api/export'),
  importJson: payload => request('/api/import', { method: 'POST', body: JSON.stringify(payload) })
};
