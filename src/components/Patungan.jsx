import { useState } from 'react'
import { sfx } from '../lib/sound.js'
import { perPerson, rp } from '../lib/format.js'

/** Groups the flat `expense_payments` join into one row per expense. */
function groupExpenses(rows) {
  const byId = new Map()
  for (const row of rows) {
    if (row.mateId == null) continue
    if (!byId.has(row.id)) {
      byId.set(row.id, { id: row.id, desc: row.desc, amount: row.amount, paid: [] })
    }
    byId.get(row.id).paid.push({ mateId: row.mateId, name: row.mateName, paid: !!row.paid })
  }
  return [...byId.values()]
}

export default function Patungan({ mates, expenses, meName, onAdd, onToggle, onError }) {
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const rows = groupExpenses(expenses)

  const submit = async () => {
    const amt = parseInt(amount, 10)
    if (!desc.trim() || !amt || amt < 1000) {
      sfx.error()
      onError('Fill in what it was and the total — min Rp 1.000.')
      return
    }
    setBusy(true)
    try {
      const ok = await onAdd(desc.trim(), amt)
      if (ok) {
        sfx.coin()
        setDesc('')
        setAmount('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="subpane active"
      id="sub-patungan"
      data-sub="patungan"
      role="tabpanel"
    >
      <form
        className="exp-form"
        data-law="Fitts's Law|Inputs and the split button are full-width and chunky — hard to miss, even half-asleep."
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          id="expDesc"
          type="text"
          placeholder="What did we buy? e.g. Electricity token"
          maxLength={48}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <input
          id="expAmt"
          className="amt"
          type="number"
          min="1000"
          step="500"
          placeholder="Rp"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className="pxbtn red" type="submit" disabled={busy}>
          {busy ? 'SAVING' : 'SPLIT /4'}
        </button>
      </form>

      <div data-law="Red = owes, Green = paid|Status reads at a glance from across the room. No decoding required.">
        <table className="ptable">
          <thead>
            <tr>
              <th>EXPENSE</th>
              <th>PER PERSON</th>
              <th>STATUS ({mates.map((m) => m.name.slice(0, 3).toUpperCase()).join(' · ')})</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} style={{ color: 'var(--muted)' }}>
                  Nothing logged yet. Add the first split above.
                </td>
              </tr>
            )}
            {rows.map((ex) => (
              <tr key={ex.id}>
                <td>
                  {ex.desc}
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{rp(ex.amount)} total</div>
                </td>
                <td>{rp(perPerson(ex.amount))}</td>
                <td className="pill-cell">
                  {ex.paid.map((p) => (
                    <button
                      key={p.mateId}
                      className={`pay-pill ${p.paid ? 'paid' : 'owes'}`}
                      title={`${p.name} (${meName === p.name ? 'you' : 'roommate'})`}
                      onClick={() => {
                        sfx[p.paid ? 'click' : 'coin']()
                        onToggle(ex.id, p.mateId)
                      }}
                    >
                      {p.paid ? 'PAID ✓' : 'OWES'}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
