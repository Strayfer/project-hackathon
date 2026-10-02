/**
 * Browser-local fallback for the Room 216 ledger.
 *
 * The Vercel deployment serves only the static Vite build, so there is no
 * Express process and `/api/*` returns Vercel's 404 page. Rather than showing a
 * dead error screen, the client probes the API once and, when it is absent,
 * swaps in this localStorage-backed store. It mirrors server/index.js route for
 * route — same seed data, same response shapes — so every component keeps
 * working unchanged.
 *
 * Tradeoff: this is per-browser. Two visitors to the Vercel URL get two
 * independent ledgers. Local `npm run dev` still uses the shared SQLite API.
 */

import {
  DUTIES,
  MATES,
  SEED_ACTIVITY,
  SEED_EXPENSES,
  buildRotation,
} from '../../shared/seed.js'

const KEY = 'united216:v1'
const SCHEMA_VERSION = 1

/** Mirrors the Rp formatting the server does with id-ID locale grouping. */
const rupiah = (n) => Number(n || 0).toLocaleString('id-ID')

const nowStamp = () =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/* ---------------------------------------------------------------- storage */

function seedState() {
  const mates = MATES.map((m, i) => ({ id: i + 1, sort: i, ...m }))
  const duties = DUTIES.map((name, i) => ({ id: i + 1, sort: i, name }))
  const rotation = buildRotation(
    mates.map((m) => m.id),
    duties.length
  )

  const expenses = []
  const payments = []
  SEED_EXPENSES.forEach((e, i) => {
    const id = i + 1
    expenses.push({
      id,
      desc: e.desc,
      amount: e.amount,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
    })
    mates.forEach((m, mi) => {
      payments.push({ expenseId: id, mateId: m.id, paid: e.paid[mi] ? 1 : 0 })
    })
  })

  const activity = SEED_ACTIVITY.map((a, i) => ({ id: i + 1, ...a }))

  return {
    schema: SCHEMA_VERSION,
    mates,
    duties,
    rotation,
    expenses,
    payments,
    activity,
    room: { currentWeek: 0, currentUser: null, soundOn: true },
  }
}

let state = null

function load() {
  if (state) return state
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // A schema bump (or a half-written record) falls back to a clean seed
      // rather than rendering a half-broken room.
      if (parsed?.schema === SCHEMA_VERSION && Array.isArray(parsed.mates)) {
        state = parsed
        return state
      }
    }
  } catch {
    /* corrupt or unavailable storage — fall through to a fresh seed */
  }
  state = seedState()
  save()
  return state
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode / quota exceeded — the session still works in memory */
  }
}

/* ------------------------------------------------------- response shaping */

/**
 * Same field-for-field shape as the server's fullState(), so the client can
 * treat local and remote responses identically.
 */
function fullState() {
  const s = load()
  const mateById = new Map(s.mates.map((m) => [m.id, m]))

  // Flat expense rows: one per (expense, mate) — same join the server returns.
  const expenseRows = []
  for (const e of [...s.expenses].sort((a, b) => b.id - a.id)) {
    for (const p of s.payments.filter((x) => x.expenseId === e.id)) {
      expenseRows.push({
        id: e.id,
        desc: e.desc,
        amount: e.amount,
        mateId: p.mateId,
        mateName: mateById.get(p.mateId)?.name ?? null,
        paid: p.paid,
      })
    }
  }

  return {
    mates: s.mates
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map(({ id, name, role, hair, skin, streak }) => ({ id, name, role, hair, skin, streak })),
    duties: s.duties
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map(({ id, name }) => ({ id, name })),
    rotation: s.rotation
      .slice()
      .sort((a, b) => a.dutyId - b.dutyId || a.week - b.week)
      .map((r) => ({ week: r.week, dutyId: r.dutyId, name: mateById.get(r.mateId)?.name ?? '—' })),
    expenses: expenseRows,
    activity: s.activity
      .slice()
      .sort((a, b) => b.id - a.id)
      .slice(0, 40)
      .map((a) => ({ id: a.id, time: a.createdAt, who: a.who, msg: a.msg })),
    currentUser: s.room.currentUser,
    currentWeek: s.room.currentWeek,
    soundOn: !!s.room.soundOn,
  }
}

function pushActivity(who, msg) {
  const s = load()
  const entry = {
    id: s.activity.reduce((max, a) => Math.max(max, a.id), 0) + 1,
    createdAt: `Today ${nowStamp()}`,
    who,
    msg,
  }
  s.activity.push(entry)
  return entry
}

const nameOfDuty = (id) => load().duties.find((d) => d.id === Number(id))?.name
const mateName = (mateId) => load().mates.find((m) => m.id === Number(mateId))?.name

/**
 * Resolves who holds `dutyId` in `week`. Internal rotation rows store mateId,
 * so the name has to be resolved through the roster.
 */
const rotationName = (dutyId, week) => {
  const s = load()
  const row = s.rotation.find((r) => r.dutyId === Number(dutyId) && r.week === week)
  return row ? mateName(row.mateId) : null
}

/* ----------------------------------------------------------------- routes */

export const localApi = {
  bootstrap: async () => fullState(),

  login: async (name) => {
    const s = load()
    if (!s.mates.some((m) => m.name === name)) throw new Error('Unknown roommate')
    s.room.currentUser = name
    save()
    return fullState()
  },

  logout: async () => {
    load().room.currentUser = null
    save()
    return fullState()
  },

  setSound: async (soundOn) => {
    load().room.soundOn = !!soundOn
    save()
    return { soundOn: !!soundOn }
  },

  markDone: async (dutyId) => {
    const s = load()
    const dutyName = nameOfDuty(dutyId)
    if (!dutyName) throw new Error('Unknown duty')

    const from = s.room.currentWeek
    const to = from + 1
    const who = rotationName(dutyId, from)
    const actor = s.room.currentUser || 'Someone'

    s.room.currentWeek = to
    const latestActivity = pushActivity(
      actor,
      `marked **${dutyName}** as done — schedule rolled forward`
    )
    save()

    return {
      ...fullState(),
      week: to,
      who,
      nextWho: rotationName(dutyId, to),
      // Field names match the raw SQLite row the API returns here
      // (created_at, not the aliased `time` used in bootstrap).
      latestActivity: {
        id: latestActivity.id,
        created_at: latestActivity.createdAt,
        who: latestActivity.who,
        msg: latestActivity.msg,
      },
    }
  },

  addExpense: async (desc, amount) => {
    const s = load()
    const clean = String(desc ?? '').trim()
    const total = Math.round(Number(amount))

    if (!clean) throw new Error('Describe the expense')
    if (!Number.isFinite(total) || total < 1000) {
      throw new Error('Amount must be at least Rp 1.000')
    }

    const actor = s.room.currentUser || 'Someone'
    const per = Math.round(total / s.mates.length)
    const id = s.expenses.reduce((max, e) => Math.max(max, e.id), 0) + 1

    s.expenses.push({
      id,
      desc: clean,
      amount: total,
      createdBy: actor,
      createdAt: `Today ${nowStamp()}`,
    })
    for (const m of s.mates) {
      s.payments.push({ expenseId: id, mateId: m.id, paid: m.name === actor ? 1 : 0 })
    }
    pushActivity(
      actor,
      `logged **${clean}** — Rp ${rupiah(total)} split ${s.mates.length} ways (Rp ${rupiah(per)} each)`
    )
    save()
    return fullState()
  },

  togglePayment: async (expenseId, mateId) => {
    const s = load()
    const expense = s.expenses.find((e) => e.id === Number(expenseId))
    const mate = mateName(mateId)
    if (!expense || !mate) throw new Error('Unknown expense or roommate')

    const row = s.payments.find(
      (p) => p.expenseId === Number(expenseId) && p.mateId === Number(mateId)
    )
    if (!row) throw new Error('That roommate was not part of the split')

    const next = row.paid ? 0 : 1
    row.paid = next
    pushActivity(
      s.room.currentUser || 'Someone',
      `marked ${mate} as **${next ? 'paid' : 'still owing'}** for **${expense.desc}**`
    )
    save()
    return { paid: !!next, ...fullState() }
  },
}

/** Wipes the local ledger and re-seeds Room 216. Exposed for debugging. */
export function resetLocal() {
  state = seedState()
  save()
  return fullState()
}