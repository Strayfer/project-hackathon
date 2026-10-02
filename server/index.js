import express from 'express'
import { getDb, closeDb, DB_PATH } from './db.js'

const PORT = Number(process.env.PORT) || 3001
const app = express()
const db = getDb()

app.use(express.json())

/* ---------------- dev request log ---------------- */
if (process.env.API_LOG !== 'off') {
  app.use((req, _res, next) => {
    if (req.path !== '/api/health') console.log(`[api] ${req.method} ${req.originalUrl}`)
    next()
  })
}

/* ---------------- helpers ---------------- */

const nowStamp = () => {
  const d = new Date()
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const readState = () => db.prepare('SELECT * FROM room_state WHERE id = 1').get()

function pushActivity(who, msg) {
  const info = db
    .prepare('INSERT INTO activity (created_at, who, msg) VALUES (?, ?, ?)')
    .run(`Today ${nowStamp()}`, who, msg)
  return db.prepare('SELECT * FROM activity WHERE id = ?').get(info.lastInsertRowid)
}

const fullState = () => {
  const state = readState()
  return {
    mates: db.prepare('SELECT id, name, role, hair, skin, streak FROM mates ORDER BY sort').all(),
    duties: db.prepare('SELECT id, name FROM duties ORDER BY sort').all(),
    rotation: db
      .prepare(
        `SELECT r.week AS week, r.duty_id AS dutyId, m.name AS name
         FROM rotation r JOIN mates m ON m.id = r.mate_id
         ORDER BY r.duty_id, r.week`
      )
      .all(),
    expenses: db
      .prepare(
        `SELECT e.id AS id, e.desc AS desc, e.amount AS amount,
                p.mate_id AS mateId, m.name AS mateName, p.paid AS paid
         FROM expenses e
         LEFT JOIN expense_payments p ON p.expense_id = e.id
         LEFT JOIN mates m ON m.id = p.mate_id
         ORDER BY e.id DESC`
      )
      .all(),
    activity: db.prepare('SELECT id, created_at AS time, who, msg FROM activity ORDER BY id DESC LIMIT 40').all(),
    currentUser: state.current_user,
    currentWeek: state.current_week,
    soundOn: !!state.sound_on,
  }
}

/* ---------------- routes ---------------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: DB_PATH })
})

app.get('/api/bootstrap', (_req, res) => {
  res.json(fullState())
})

app.post('/api/login', (req, res) => {
  const name = String(req.body?.name || '').trim()
  const mate = db.prepare('SELECT name FROM mates WHERE name = ?').get(name)
  if (!mate) return res.status(400).json({ error: 'Unknown roommate' })
  db.prepare('UPDATE room_state SET current_user = ? WHERE id = 1').run(mate.name)
  res.json(fullState())
})

app.post('/api/logout', (_req, res) => {
  db.prepare('UPDATE room_state SET current_user = NULL WHERE id = 1').run()
  res.json(fullState())
})

app.put('/api/settings/sound', (req, res) => {
  const on = req.body?.soundOn ? 1 : 0
  db.prepare('UPDATE room_state SET sound_on = ? WHERE id = 1').run(on)
  res.json({ soundOn: !!on })
})

app.post('/api/schedule/done', (req, res) => {
  const dutyId = Number(req.body?.dutyId)
  const duty = db.prepare('SELECT id, name FROM duties WHERE id = ?').get(dutyId)
  if (!duty) return res.status(400).json({ error: 'Unknown duty' })

  const state = readState()
  const from = state.current_week
  const to = from + 1
  const whoRow = db
    .prepare(
      `SELECT m.name AS name FROM rotation r JOIN mates m ON m.id = r.mate_id
       WHERE r.duty_id = ? AND r.week = ?`
    )
    .get(dutyId, from)

  const actor = state.current_user || 'Someone'
  let entry
  const tx = db.transaction(() => {
    db.prepare('UPDATE room_state SET current_week = ? WHERE id = 1').run(to)
    entry = pushActivity(
      actor,
      `marked **${duty.name}** as done — schedule rolled forward`
    )
  })
  tx()

  const nextWho = db
    .prepare(
      `SELECT m.name AS name FROM rotation r JOIN mates m ON m.id = r.mate_id
       WHERE r.duty_id = ? AND r.week = ?`
    )
    .get(dutyId, to)

  res.json({
    ...fullState(),
    week: to,
    who: whoRow?.name || null,
    nextWho: nextWho?.name || null,
    latestActivity: entry,
  })
})

app.post('/api/expenses', (req, res) => {
  const desc = String(req.body?.desc || '').trim()
  const amount = Math.round(Number(req.body?.amount))
  if (!desc) return res.status(400).json({ error: 'Describe the expense' })
  if (!Number.isFinite(amount) || amount < 1000) {
    return res.status(400).json({ error: 'Amount must be at least Rp 1.000' })
  }

  const state = readState()
  const actor = state.current_user || 'Someone'
  const per = Math.round(amount / 4)
  const entries = db
    .prepare('SELECT id, name FROM mates ORDER BY sort')
    .all()

  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO expenses (desc, amount, created_by) VALUES (?, ?, ?)')
      .run(desc, amount, actor)
    const id = Number(info.lastInsertRowid)
    const insPay = db.prepare(
      'INSERT INTO expense_payments (expense_id, mate_id, paid) VALUES (?, ?, ?)'
    )
    for (const m of entries) insPay.run(id, m.id, m.name === state.current_user ? 1 : 0)
    pushActivity(
      actor,
      `logged **${desc}** — Rp ${amount.toLocaleString('id-ID')} split ${entries.length} ways (Rp ${per.toLocaleString('id-ID')} each)`
    )
    return id
  })
  tx()

  res.status(201).json(fullState())
})

app.post('/api/expenses/:id/toggle', (req, res) => {
  const id = Number(req.params.id)
  const mateId = Number(req.body?.mateId)
  const expense = db.prepare('SELECT id, desc FROM expenses WHERE id = ?').get(id)
  const mate = db.prepare('SELECT name FROM mates WHERE id = ?').get(mateId)
  if (!expense || !mate) return res.status(400).json({ error: 'Unknown expense or roommate' })

  const nowPaid = db
    .prepare('SELECT paid FROM expense_payments WHERE expense_id = ? AND mate_id = ?')
    .get(id, mateId)
  if (!nowPaid) return res.status(400).json({ error: 'That roommate was not part of the split' })

  const next = nowPaid.paid ? 0 : 1
  db.prepare(
    'UPDATE expense_payments SET paid = ? WHERE expense_id = ? AND mate_id = ?'
  ).run(next, id, mateId)
  pushActivity(
    readState().current_user || 'Someone',
    `marked ${mate.name} as **${next ? 'paid' : 'still owing'}** for **${expense.desc}**`
  )

  res.json({ paid: !!next, ...fullState() })
})

/* ---------------- lifecycle ---------------- */

app.listen(PORT, () => {
  console.log(`[api] United 216 API on http://localhost:${PORT}`)
  console.log(`[api] SQLite database: ${DB_PATH}`)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    closeDb()
    process.exit(0)
  })
}
