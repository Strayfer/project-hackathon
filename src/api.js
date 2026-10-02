import { localApi } from './lib/localStore.js'

const BASE = '/api'

/**
 * Which backend answered: 'api' (shared Express + SQLite) or 'local'
 * (browser-localStorage fallback used on static hosts like Vercel).
 * 'unknown' until the first probe resolves.
 */
export let backend = 'unknown'

const listeners = new Set()

/** Subscribe to backend changes so the UI can show which mode is active. */
export function onBackendChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function setBackend(next) {
  if (backend === next) return
  backend = next
  listeners.forEach((fn) => fn(next))
}

/**
 * Parses a response as JSON without ever throwing on an HTML error page.
 * A static host answers /api/* with its own 404 markup, so a bare
 * JSON.parse() here would surface as a confusing syntax error instead of a
 * clean "no API" signal.
 */
async function readJson(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // Not JSON — almost certainly the host's HTML 404/spa fallback.
    const snippet = text.trim().slice(0, 80)
    throw new ApiUnavailable(`Expected JSON from ${BASE}, got: ${snippet}`)
  }
}

class ApiUnavailable extends Error {}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (err) {
    // Network-level failure: refused connection, DNS, offline.
    throw new ApiUnavailable(`Could not reach ${BASE}: ${err.message}`)
  }

  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`)
  }
  return data
}

/**
 * Decides once whether to use the real API or the local fallback.
 *
 * GET /api/health is cheap and side-effect free. If it does not answer with
 * `{ok:true}`, we fall back permanently for this page load — retrying on every
 * action would add a round trip to every click.
 */
async function probe() {
  if (backend !== 'unknown') return backend
  try {
    const data = await request('/health')
    setBackend(data?.ok ? 'api' : 'local')
  } catch {
    setBackend('local')
  }
  return backend
}

/**
 * Runs a call against the chosen backend. Real API errors (400 "Unknown
 * roommate", validation failures) propagate as-is; only an *unavailable* API
 * triggers the fallback.
 */
async function call(method, ...args) {
  const mode = await probe()
  if (mode === 'local') return localApi[method](...args)
  try {
    return await request(API_ROUTES[method](...args))
  } catch (err) {
    if (!(err instanceof ApiUnavailable)) throw err
    // The API vanished mid-session (dev server stopped, host restarted).
    setBackend('local')
    return localApi[method](...args)
  }
}

const API_ROUTES = {
  bootstrap: () => ['/bootstrap'],
  login: (name) => ['/login', { method: 'POST', body: JSON.stringify({ name }) }],
  logout: () => ['/logout', { method: 'POST' }],
  setSound: (soundOn) => [
    '/settings/sound',
    { method: 'PUT', body: JSON.stringify({ soundOn }) },
  ],
  markDone: (dutyId) => [
    '/schedule/done',
    { method: 'POST', body: JSON.stringify({ dutyId }) },
  ],
  addExpense: (desc, amount) => [
    '/expenses',
    { method: 'POST', body: JSON.stringify({ desc, amount }) },
  ],
  togglePayment: (expenseId, mateId) => [
    `/expenses/${expenseId}/toggle`,
    { method: 'POST', body: JSON.stringify({ mateId }) },
  ],
}

export const api = {
  bootstrap: () => call('bootstrap'),
  login: (name) => call('login', name),
  logout: () => call('logout'),
  setSound: (soundOn) => call('setSound', soundOn),
  markDone: (dutyId) => call('markDone', dutyId),
  addExpense: (desc, amount) => call('addExpense', desc, amount),
  togglePayment: (expenseId, mateId) => call('togglePayment', expenseId, mateId),
}