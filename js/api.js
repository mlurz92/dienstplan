async function parseJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return { ok: false, error: text || 'Ungültige Serverantwort' }; }
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  bootstrap: () => request('/api/bootstrap'),
  getMonth: (year, month) => request(`/api/month/${year}/${String(month).padStart(2, '0')}`),
  saveMonth: (year, month, payload) => request(`/api/month/${year}/${String(month).padStart(2, '0')}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getSettings: () => request('/api/settings'),
  saveSettings: payload => request('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  getStaff: () => request('/api/staff'),
  saveStaff: payload => request('/api/staff', { method: 'PUT', body: JSON.stringify(payload) }),
  getRbnNames: () => request('/api/rbn-names'),
  saveRbnNames: payload => request('/api/rbn-names', { method: 'PUT', body: JSON.stringify(payload) }),
  exportJson: () => request('/api/export'),
  importJson: payload => request('/api/import', { method: 'POST', body: JSON.stringify(payload) })
};
