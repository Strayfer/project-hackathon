import Avatar from './Avatar.jsx'
import { sfx } from '../lib/sound.js'

export default function MateGrid({ mates, meName }) {
  return (
    <div
      className="mates"
      data-law="Aesthetic-Usability|Friendly pixel faces make the app feel forgiving, so people actually use it."
    >
      {mates.map((m) => (
        <div key={m.id} className="mate" onMouseEnter={() => sfx.hover()}>
          <Avatar mate={m} isMe={m.name === meName} />
          <div className="mname">{m.name}</div>
          <div className="mrole">{m.role}</div>
          <span className="streak px">STREAK ×{m.streak}</span>
        </div>
      ))}
    </div>
  )
}
