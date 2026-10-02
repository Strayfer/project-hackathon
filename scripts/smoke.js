/**
 * End-to-end API smoke test against a running dev API.
 * Usage: node scripts/smoke.js   (requires `npm run dev` in another terminal)
 */
const BASE = 'http://localhost:3001/api'

const call = async (path, options) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`)
  return body
}

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: !!condition, detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

const start = await call('/bootstrap')
check('bootstrap returns 4 mates / 5 duties', start.mates.length === 4 && start.duties.length === 5)
check('rotation is materialised for 16 weeks', start.rotation.length === 80, `${start.rotation.length} rows`)
check('seeded expenses + payments join', start.expenses.length === 8, `${start.expenses.length} payment rows`)

const who0 = start.rotation.find((r) => r.dutyId === start.duties[0].id && r.week === 0)
const who1 = start.rotation.find((r) => r.dutyId === start.duties[0].id && r.week === 1)
check('rotation advances week over week', who0 && who1 && who0.name !== who1.name, `${who0?.name} -> ${who1?.name}`)

const bad = await fetch(`${BASE}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Nobody' }),
})
check('rejects unknown roommate', bad.status === 400, `status ${bad.status}`)

const logged = await call('/login', { method: 'POST', body: JSON.stringify({ name: 'Kelana' }) })
check('login persists current user', logged.currentUser === 'Kelana')

const before = logged.currentWeek
const done = await call('/schedule/done', { method: 'POST', body: JSON.stringify({ dutyId: logged.duties[0].id }) })
check('mark-as-done rolls the week forward', done.week === before + 1, `week ${before} -> ${done.week}`)
check('mark-as-done writes activity', done.latestActivity.who === 'Kelana', done.latestActivity.msg)
check('mark-as-done reports the next owner', !!done.nextWho, `next: ${done.nextWho}`)

const added = await call('/expenses', {
  method: 'POST',
  body: JSON.stringify({ desc: 'Smoke test rice', amount: 12000 }),
})
const newExpense = added.expenses.find((r) => r.desc === 'Smoke test rice')
check('new expense splits 4 ways', newExpense && added.expenses.filter((r) => r.id === newExpense.id).length === 4)
check('creator is auto-marked paid', added.expenses.find((r) => r.id === newExpense.id && r.mateName === 'Kelana')?.paid === 1)
check('activity records the split', added.activity[0].msg.includes('Smoke test rice'), added.activity[0].msg)

const toToggle = added.expenses.find((r) => r.id === newExpense.id && r.mateName === 'Raka')
const toggled = await call(`/expenses/${newExpense.id}/toggle`, {
  method: 'POST',
  body: JSON.stringify({ mateId: toToggle.mateId }),
})
check(
  'payment toggle flips a roommate',
  toggled.expenses.find((r) => r.id === newExpense.id && r.mateId === toToggle.mateId).paid === 1
)

const tiny = await fetch(`${BASE}/expenses`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ desc: 'too small', amount: 10 }),
})
check('rejects expenses under Rp 1.000', tiny.status === 400, `status ${tiny.status}`)

const sound = await call('/settings/sound', { method: 'PUT', body: JSON.stringify({ soundOn: false }) })
check('sound preference persists', sound.soundOn === false)

const after = await call('/bootstrap')
check('room state survives a fresh read', after.currentUser === 'Kelana' && after.soundOn === false)

await call('/logout', { method: 'POST' })
await call('/settings/sound', { method: 'PUT', body: JSON.stringify({ soundOn: true }) })

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
