import { formatMessage } from '../lib/format.js'

function Message({ msg }) {
  return (
    <>
      {formatMessage(msg).map((part) =>
        part.b !== undefined ? <b key={part.key}>{part.b}</b> : <span key={part.key}>{part.t}</span>
      )}
    </>
  )
}

export default function ActivityFeed({ activity }) {
  return (
    <div className="subpane active" id="sub-activity" data-sub="activity" role="tabpanel">
      <ul
        className="feed"
        data-law="Peak-End Rule|Every action leaves a friendly receipt, so using the app ends on a good note."
      >
        {activity.length === 0 && <li>No activity yet tonight.</li>}
        {activity.map((a, i) => (
          <li key={a.id} className={i === 0 ? 'fresh' : ''}>
            <span className="t">{a.time}</span>
            <span>
              <span className="who">{a.who}</span> <Message msg={a.msg} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
