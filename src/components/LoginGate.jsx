import { useState } from 'react'
import Avatar from './Avatar.jsx'
import { sfx } from '../lib/sound.js'

export default function LoginGate({ mates, onLogin, leaving = false }) {
  const [pressed, setPressed] = useState(null)

  const pick = (mate) => {
    if (pressed) return
    sfx.login()
    setPressed(mate.name)
    onLogin(mate.name)
  }

  return (
    <div id="gate" className={leaving ? 'leaving' : ''}>
      <div className="gate-card">
        <div className="gate-badge px">TELKOM UNIVERSITY DORM · ROOM 216</div>
        <h1 className="px">
          UNITED <span>216</span>
        </h1>
        <p className="gate-sub">
          No more <b>"wait, whose turn was it?"</b>
          <br />
          Duties, rotation &amp; patungan — one tiny app for the whole room.
        </p>
        <p className="gate-prompt px">
          &gt; WHO'S LOGGING IN?
          <span className="cursor-blink" />
        </p>
        <div
          className="gate-names"
          data-law="Hick's Law|Only 4 clear choices, one question. Tired roommates decide fast."
        >
          {mates.map((m) => (
            <button
              key={m.name}
              className={`pxbtn mate-pick${pressed === m.name ? ' pressed' : ''}`}
              onClick={() => pick(m)}
              onMouseEnter={() => sfx.hover()}
              disabled={!!pressed}
            >
              <Avatar mate={m} />
              <span>{m.name.toUpperCase()}</span>
            </button>
          ))}
        </div>
        <p className="gate-foot">Live build · data lives in the room&apos;s SQLite database</p>
      </div>
    </div>
  )
}
