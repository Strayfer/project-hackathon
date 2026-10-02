import { useRef, useEffect } from 'react'
import { sfx } from '../lib/sound.js'
import { rotationAhead } from '../lib/format.js'

export default function SchedulePanel({ duties, dutyId, onPickDuty, rotation, week, meName, onMarkDone }) {
  const bigRef = useRef(null)
  const duty = duties.find((d) => d.id === dutyId)
  const ahead = rotationAhead(rotation, dutyId, week, 4)
  const who = ahead[0]?.name ?? '—'
  const mine = who === meName

  useEffect(() => {
    bigRef.current?.animate(
      [
        { transform: 'scale(.6)', opacity: 0 },
        { transform: 'scale(1.06)', opacity: 1, offset: 0.7 },
        { transform: 'scale(1)' },
      ],
      { duration: 420, easing: 'cubic-bezier(.2,1,.2,1)' }
    )
  }, [dutyId, week])

  return (
    <section className="panel active" id="panel-schedule" role="tabpanel" aria-label="Schedule">
      <div className="sec-head">
        <div className="sec-title px">PICK A DUTY</div>
        <div className="sec-hint">the table decides, not memory</div>
      </div>

      <div className="duty-chips" id="dutyChips">
        {duties.map((d) => (
          <button
            key={d.id}
            className={`dchip${d.id === dutyId ? ' sel' : ''}`}
            onClick={() => {
              sfx.click()
              onPickDuty(d.id)
            }}
          >
            {d.name.toUpperCase()}
          </button>
        ))}
      </div>

      <div
        className="hero-turn"
        data-law="Miller's Law|One week, one name, one duty. The screen chunks the answer so nobody has to think."
      >
        <div className="marquee">
          <span>{` ROOM 216 ROTATION ★ ${duty?.name.toUpperCase()} ★ ${who.toUpperCase()}'S TURN ★`.repeat(4)}</span>
        </div>
        <div className="label px">THIS WEEK'S TURN</div>
        <div className="bigname px" ref={bigRef}>
          {who.toUpperCase()}
        </div>
        <div className="dutyof">
          is on <b>{duty?.name ?? '—'}</b> duty
        </div>
        <div className="hero-week px">
          WEEK {week + 1} ·{' '}
          {mine ? <b>THAT&apos;S YOU. GO GO GO.</b> : 'NOT YOU. RELAX.'}
        </div>
      </div>

      <div className="done-zone">
        <button
          className="pxbtn red"
          data-law="Fitts's Law|The most important action gets the biggest button on the page, placed right under the answer."
          onClick={onMarkDone}
        >
          MARK AS DONE ✓
          <span className="sub">logs it + rolls the schedule forward, one tap</span>
        </button>
        <div className="done-note">One press updates the feed, the ledger, and next week&apos;s table.</div>
      </div>

      <div className="sec-head">
        <div className="sec-title px">ROTATION AHEAD</div>
        <div className="sec-hint">auto-calculated, no arguing</div>
      </div>

      <table className="rtable" id="rotTable">
        <thead>
          <tr>
            <th>WEEK</th>
            <th>DUTY</th>
            <th>WHOSE TURN</th>
          </tr>
        </thead>
        <tbody>
          {ahead.map((row, i) => (
            <tr key={row.week} className={i === 0 ? 'now' : ''}>
              <td>{i === 0 ? 'THIS WEEK' : `WEEK +${i}`}</td>
              <td className={i ? 'future' : ''}>{duty?.name}</td>
              <td className={`who${i ? ' future' : ''}`}>
                {row.name}
                {row.name === meName ? ' (you)' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
