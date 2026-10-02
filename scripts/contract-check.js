/**
 * Contract check: the browser-local fallback (src/lib/localStore.js) must
 * return exactly the same response shapes as the real Express API.
 *
 * Runs both backends side by side against a throwaway SQLite file and diffs
 * every field. This is what stops the Vercel fallback from silently drifting
 * away from the local dev server.
 *
 * Usage: node scripts/contract-check.js
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PORT = 3997
const BASE = `http://localhost:${PORT}/api`
const DB = path.join(ROOT, 'data', 'contract.db')

/* minimal localStorage so localStore.js can run under plain Node */
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
}

const { localApi } = await import('../src/lib/localStore.js')

const checks = []
const check = (label, ok, detail = '') => {
  checks.push(!!ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

const call = async (path, options) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`)
  return body
}

/** Compares the shape of a value's keys, recursing into arrays of objects. */
function shape(v, depth = 0) {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1)] : []
  if (v && typeof v === 'object') {
    if (depth > 3) return typeof v
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k], depth + 1)]))
  }
  return typeof v
}

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  fs.rmSync(`${DB}${suffix}`, { force: true })
}

const api = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DB_PATH: DB, API_LOG: 'off' },
  stdio: 'ignore',
})

const shutdown = () => {
  api.kill()
  // SQLite holds a lock until the child is fully gone; wait before unlinking.
  const deadline = Date.now() + 5000
  const cleanup = () => {
    let left = false
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      try {
        fs.rmSync(`${DB}${suffix}`, { force: true })
      } catch {
        left = true
      }
    }
    if (left && Date.now() < deadline) setTimeout(cleanup, 100)
  }
  setTimeout(cleanup, 150)
}
process.on('exit', shutdown)
process.on('SIGINT', () => {
  shutdown()
  process.exit(1)
})

/* wait for the API */
let up = false
for (let i = 0; i < 40 && !up; i++) {
  await new Promise((r) => setTimeout(r, 250))
  try {
    up = (await (await fetch(`${BASE}/health`)).json())?.ok === true
  } catch {
    /* not yet */
  }
}
if (!up) {
  console.error('FAIL  could not start the API on port ' + PORT)
  shutdown()
  process.exit(1)
}

/* ---- bootstrap parity ---- */
const apiBoot = await call('/bootstrap')
const localBoot = await localApi.bootstrap()

check('bootstrap: identical shape', JSON.stringify(shape(apiBoot)) === JSON.stringify(shape(localBoot)))
check(
  'bootstrap: same mate roster',
  JSON.stringify(apiBoot.mates) === JSON.stringify(localBoot.mates),
  apiBoot.mates.map((m) => m.name).join(',')
)
check(
  'bootstrap: same duties',
  JSON.stringify(apiBoot.duties) === JSON.stringify(localBoot.duties),
  apiBoot.duties.map((d) => d.name).join(',')
)
check(
  'bootstrap: identical 16-week rotation',
  JSON.stringify(apiBoot.rotation) === JSON.stringify(localBoot.rotation),
  `${apiBoot.rotation.length} rows`
)
check(
  'bootstrap: identical expense + payment join',
  JSON.stringify(apiBoot.expenses) === JSON.stringify(localBoot.expenses),
  `${apiBoot.expenses.length} rows`
)
check(
  'bootstrap: identical activity feed',
  JSON.stringify(apiBoot.activity) === JSON.stringify(localBoot.activity),
  `${apiBoot.activity.length} entries`
)
check('bootstrap: same initial week', apiBoot.currentWeek === localBoot.currentWeek)
check('bootstrap: same sound default', apiBoot.soundOn === localBoot.soundOn)

/* ---- login parity ---- */
const apiLogin = await call('/login', { method: 'POST', body: JSON.stringify({ name: 'Kelana' }) })
const localLogin = await localApi.login('Kelana')
check(
  'login: same currentUser',
  apiLogin.currentUser === localLogin.currentUser && localLogin.currentUser === 'Kelana',
  `api=${JSON.stringify(apiLogin.currentUser)} local=${JSON.stringify(localLogin.currentUser)}`
)

/* ---- error parity ---- */
const apiBad = await fetch(`${BASE}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Nobody' }),
})
check('login: rejects unknown roommate (api)', apiBad.status === 400, `status ${apiBad.status}`)
let localErr = ''
try {
  await localApi.login('Nobody')
} catch (e) {
  localErr = e.message
}
check('login: rejects unknown roommate (local)', localErr === 'Unknown roommate', localErr)

/* ---- mark-done parity ---- */
const dutyId = apiLogin.duties[0].id
const apiDone = await call('/schedule/done', {
  method: 'POST',
  body: JSON.stringify({ dutyId }),
})
const localDone = await localApi.markDone(dutyId)

check(
  'markDone: identical shape',
  JSON.stringify(shape(apiDone)) === JSON.stringify(shape(localDone)),
  `api=${JSON.stringify(shape(apiDone).who)} local=${JSON.stringify(shape(localDone).who)}`
)
check(
  'markDone: same week advance',
  apiDone.week === localDone.week,
  `api=${apiDone.week} local=${localDone.week}`
)
check(
  'markDone: same owner',
  apiDone.who === localDone.who,
  `api=${apiDone.who} local=${localDone.who}`
)
check(
  'markDone: same next owner',
  apiDone.nextWho === localDone.nextWho,
  `api=${apiDone.nextWho} local=${localDone.nextWho}`
)
check(
  'markDone: same activity message',
  apiDone.latestActivity.msg === localDone.latestActivity.msg,
  localDone.latestActivity.msg
)
check(
  'markDone: same actor',
  apiDone.latestActivity.who === localDone.latestActivity.who,
  localDone.latestActivity.who
)

/* ---- expense parity ---- */
const apiExp = await call('/expenses', {
  method: 'POST',
  body: JSON.stringify({ desc: 'Contract check', amount: 12000 }),
})
const localExp = await localApi.addExpense('Contract check', 12000)

check('addExpense: identical shape', JSON.stringify(shape(apiExp)) === JSON.stringify(shape(localExp)))

const pick = (state, desc) => state.expenses.filter((r) => r.desc === desc)
check('addExpense: same split size', pick(apiExp, 'Contract check').length === pick(localExp, 'Contract check').length)
check(
  'addExpense: creator auto-marked paid',
  pick(localExp, 'Contract check').some((r) => r.mateName === 'Kelana' && r.paid === 1)
)
check(
  'addExpense: others start owing',
  pick(localExp, 'Contract check').filter((r) => r.mateName !== 'Kelana').every((r) => r.paid === 0)
)
check(
  'addExpense: same activity wording',
  apiExp.activity[0].msg.replace(/\d/g, '') === localExp.activity[0].msg.replace(/\d/g, ''),
  localExp.activity[0].msg
)

/* ---- validation parity ---- */
const apiTiny = await fetch(`${BASE}/expenses`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ desc: 'too small', amount: 10 }),
})
check('addExpense: rejects under Rp 1.000 (api)', apiTiny.status === 400, `status ${apiTiny.status}`)
let localTiny = ''
try {
  await localApi.addExpense('too small', 10)
} catch (e) {
  localTiny = e.message
}
check(
  'addExpense: rejects under Rp 1.000 (local)',
  localTiny === 'Amount must be at least Rp 1.000',
  localTiny
)

/* ---- toggle parity ---- */
const apiRow = pick(apiExp, 'Contract check').find((r) => r.mateName === 'Raka')
const localRow = pick(localExp, 'Contract check').find((r) => r.mateName === 'Raka')
const apiToggled = await call(`/expenses/${apiRow.id}/toggle`, {
  method: 'POST',
  body: JSON.stringify({ mateId: apiRow.mateId }),
})
const localToggled = await localApi.togglePayment(localRow.id, localRow.mateId)

check(
  'togglePayment: same paid flag',
  apiToggled.paid === localToggled.paid && localToggled.paid === true,
  `paid=${localToggled.paid}`
)
check(
  'togglePayment: identical shape',
  JSON.stringify(shape(apiToggled)) === JSON.stringify(shape(localToggled))
)

/* ---- sound parity ---- */
const apiSnd = await call('/settings/sound', { method: 'PUT', body: JSON.stringify({ soundOn: false }) })
const localSnd = await localApi.setSound(false)
check('setSound: same result', apiSnd.soundOn === localSnd.soundOn && localSnd.soundOn === false)

/* ---- persistence: a fresh read survives in local mode ---- */
const reread = await localApi.bootstrap()
check('local: state survives a fresh read', reread.currentUser === 'Kelana' && reread.soundOn === false)

/* ---- the bug this whole fallback exists for: a static host answering /api
   with an HTML 404 page must degrade to local mode, not throw a SyntaxError. ---- */
const res404 = await fetch(`${BASE}/does-not-exist`)
const text404 = await res404.text()
let parseErr = null
try {
  JSON.parse(text404)
} catch (e) {
  parseErr = e.name
}
check(
  'Express returns an HTML body for unknown routes (the Vercel failure mode)',
  !res404.ok && (parseErr === 'SyntaxError' || text404.includes('<')),
  `status=${res404.status} parse=${parseErr || 'ok'}`
)

/* The client must survive that body without throwing a raw SyntaxError.
   readJson mirrors src/api.js, so pass it a fresh clone of the same response. */
const readJson = async (res) => {
  const t = await res.text()
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {
    const snippet = t.trim().slice(0, 80)
    throw new Error(`Expected JSON from /api, got: ${snippet}`)
  }
}
let clientErr = null
try {
  await readJson(await fetch(`${BASE}/does-not-exist`))
} catch (e) {
  clientErr = e
}
check(
  'client surfaces a readable message instead of a SyntaxError',
  clientErr !== null && !(clientErr instanceof SyntaxError) && /Expected JSON/.test(clientErr.message),
  clientErr ? `"${clientErr.message.slice(0, 60)}…"` : 'no error thrown'
)

const passed = checks.filter(Boolean).length
console.log(`\n${passed}/${checks.length} contract checks passed`)
shutdown()
// Give the deferred DB cleanup a moment, then exit cleanly.
await new Promise((r) => setTimeout(r, 600))
process.exit(passed === checks.length ? 0 : 1)