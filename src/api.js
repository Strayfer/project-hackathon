const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`)
  }
  return data
}

export const api = {
  bootstrap: () => request('/bootstrap'),
  login: (name) => request('/login', { method: 'POST', body: JSON.stringify({ name }) }),
  logout: () => request('/logout', { method: 'POST' }),
  setSound: (soundOn) =>
    request('/settings/sound', { method: 'PUT', body: JSON.stringify({ soundOn }) }),
  markDone: (dutyId) => request('/schedule/done', { method: 'POST', body: JSON.stringify({ dutyId }) }),
  addExpense: (desc, amount) =>
    request('/expenses', { method: 'POST', body: JSON.stringify({ desc, amount }) }),
  togglePayment: (expenseId, mateId) =>
    request(`/expenses/${expenseId}/toggle`, { method: 'POST', body: JSON.stringify({ mateId }) }),
}
