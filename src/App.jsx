import { useCallback, useEffect, useRef, useState } from 'react'
import { api, backend, onBackendChange } from './api.js'
import { sfx } from './lib/sound.js'
import { burstConfetti } from './lib/confetti.js'
import { perPerson, rp } from './lib/format.js'

import Backdrop from './components/Backdrop.jsx'
import LoginGate from './components/LoginGate.jsx'
import Avatar from './components/Avatar.jsx'
import MateGrid from './components/MateGrid.jsx'
import Patungan from './components/Patungan.jsx'
import ActivityFeed from './components/ActivityFeed.jsx'
import SchedulePanel from './components/SchedulePanel.jsx'
import PixelWipe, { WIPE_SWAP_MS, WIPE_TOTAL_MS } from './components/PixelWipe.jsx'
import LawAnnotations from './components/LawAnnotations.jsx'
import Toast from './components/Toast.jsx'

const EMPTY = {
  mates: [],
  duties: [],
  rotation: [],
  expenses: [],
  activity: [],
  currentUser: null,
  currentWeek: 0,
  soundOn: true,
}

export default function App() {
  const [data, setData] = useState(EMPTY)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [fatal, setFatal] = useState('')
  const [entering, setEntering] = useState(false)
  const [tab, setTab] = useState('general')
  const [sub, setSub] = useState('patungan')
  const [dutyId, setDutyId] = useState(null)
  const [toast, setToast] = useState(null)
  const [lawsOn, setLawsOn] = useState(false)
  const [covered, setCovered] = useState(false)
  const [wipeRun, setWipeRun] = useState(0)
  const [backendMode, setBackendMode] = useState(backend)
  const timers = useRef([])

  useEffect(() => onBackendChange(setBackendMode), [])

  /* ---------- toast helpers ---------- */
  const say = useCallback((node) => setToast({ id: Date.now() + Math.random(), node }), [])
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  /* ---------- initial load ---------- */
  useEffect(() => {
    let alive = true
    api
      .bootstrap()
      .then((res) => {
        if (!alive) return
        setData(res)
        setDutyId((prev) => prev ?? res.duties[0]?.id ?? null)
        sfx.setOn(res.soundOn)
        setStatus('ready')
      })
      .catch((err) => {
        if (!alive) return
        setFatal(err.message)
        setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [])

  /* ---------- auth ---------- */
  const login = async (name) => {
    try {
      const res = await api.login(name)
      setData(res)
      clearTimers()
      timers.current.push(
        setTimeout(() => {
          setEntering(true)
          say(
            <>
              Welcome back, <b>{name}</b>. The room missed you.
            </>
          )
        }, 380)
      )
    } catch (err) {
      sfx.error()
      say(err.message)
    }
  }

  const logout = async () => {
    try {
      setData(await api.logout())
    } catch (err) {
      say(err.message)
    }
  }

  /* ---------- settings ---------- */
  const toggleSound = async () => {
    const next = !data.soundOn
    sfx.setOn(next)
    setData((d) => ({ ...d, soundOn: next }))
    if (next) sfx.coin()
    try {
      await api.setSound(next)
    } catch (err) {
      say(err.message)
    }
  }

  const toggleLaws = () => {
    sfx.click()
    const next = !lawsOn
    setLawsOn(next)
    document.body.classList.toggle('laws-on', next)
    say(
      next
        ? 'UX law annotations on — hover the red badges.'
        : 'Annotations off. Back to the room.'
    )
  }

  /* ---------- tabs ---------- */
  const switchTab = (next) => {
    if (next === tab || covered) return
    sfx.tab()
    setCovered(true)
    setWipeRun((n) => n + 1)
    clearTimers()
    timers.current.push(
      setTimeout(() => setTab(next), WIPE_SWAP_MS),
      setTimeout(() => setCovered(false), WIPE_TOTAL_MS)
    )
  }

  const switchSub = (next) => {
    if (next === sub) return
    sfx.click()
    setSub(next)
  }

  /* ---------- schedule ---------- */
  const markDone = async () => {
    if (dutyId == null) return
    sfx.done()
    burstConfetti()
    try {
      const res = await api.markDone(dutyId)
      setData(res)
      const duty = res.duties.find((d) => d.id === dutyId)
      say(
        <>
          Nice one, <b>{res.who}</b>! {duty?.name} is handled. Next up:{' '}
          <b>{res.nextWho}</b>.
        </>
      )
    } catch (err) {
      sfx.error()
      say(err.message)
    }
  }

  /* ---------- patungan ---------- */
  const addExpense = async (desc, amount) => {
    try {
      const res = await api.addExpense(desc, amount)
      setData(res)
      say(
        <>
          Split done — everyone owes <b>{rp(perPerson(amount))}</b>. No excuses now.
        </>
      )
      return true
    } catch (err) {
      sfx.error()
      say(err.message)
      return false
    }
  }

  const togglePayment = async (expenseId, mateId) => {
    setData((d) => ({
      ...d,
      expenses: d.expenses.map((r) =>
        r.id === expenseId && r.mateId === mateId ? { ...r, paid: r.paid ? 0 : 1 } : r
      ),
    }))
    try {
      setData(await api.togglePayment(expenseId, mateId))
    } catch (err) {
      sfx.error()
      say(err.message)
    }
  }

  /* ---------- render ---------- */
  if (status === 'loading') {
    return (
      <>
        <Backdrop />
        <div className="boot px">WAKING ROOM 216…</div>
      </>
    )
  }

  if (status === 'error') {
    return (
      <>
        <Backdrop />
        <div className="boot px">
          <p>CANNOT REACH THE ROOM LEDGER</p>
          <p style={{ color: 'var(--muted)', fontSize: 9, lineHeight: 2 }}>
            {fatal}
            <br />
            Both the shared API and the browser-local ledger failed.
            <br />
            Check that the API is running: npm run dev
          </p>
          <button
            className="pxbtn red"
            style={{ marginTop: 14 }}
            onClick={() => window.location.reload()}
          >
            TRY AGAIN
          </button>
        </div>
      </>
    )
  }

  const me = data.mates.find((m) => m.name === data.currentUser)
  const loggedIn = !!me

  return (
    <>
      <Backdrop />
      <LawAnnotations enabled={lawsOn} />

      {!entering && (
        <LoginGate mates={data.mates} onLogin={login} leaving={loggedIn} />
      )}

      <main id="app" className={loggedIn && entering ? 'on' : ''}>
        <header className="topbar">
          <div className="logo">
            <div className="logo-mark">216</div>
            <div className="logo-name px">
              UNITED 216<small>room harmony engine</small>
            </div>
          </div>
          <div className="top-actions">
            {backendMode === 'local' && (
              <span
                className="chip-mode px"
                title="No shared API answered, so this browser keeps its own copy of the ledger in localStorage. Data is not shared with other devices."
              >
                LOCAL LEDGER
              </span>
            )}
            <button
              className={`pxbtn ghost${lawsOn ? ' active' : ''}`}
              style={{ fontSize: 9, padding: '11px 13px' }}
              onClick={toggleLaws}
            >
              UX LAWS
            </button>
            <button
              className="pxbtn ghost"
              style={{ fontSize: 9, padding: '11px 13px' }}
              onClick={toggleSound}
            >
              SOUND: {data.soundOn ? 'ON' : 'OFF'}
            </button>
            {loggedIn && (
              <button
                className="chip-user"
                data-law="Jakob's Law|Avatar + name up top, exactly like every app you already use."
                onClick={logout}
                title="Switch roommate"
              >
                <Avatar mate={me} isMe />
                <span>{me.name}</span>
                <span className="chip-out px">SWITCH</span>
              </button>
            )}
          </div>
        </header>

        <nav
          className="tabs"
          data-law="Hick's Law|Two tabs. Not twelve. Choosing takes under a second."
        >
          {['general', 'schedule'].map((key) => (
            <button
              key={key}
              className={`tabbtn${tab === key ? ' active' : ''}`}
              onClick={() => switchTab(key)}
              onMouseEnter={() => sfx.hover()}
            >
              <span className="dot" />
              {key.toUpperCase()}
            </button>
          ))}
        </nav>

        <div className="panel-wrap">
          <PixelWipe covered={covered} runId={wipeRun} />

          {tab === 'general' ? (
            <section className="panel active" id="panel-general" role="tabpanel">
              <div className="sec-head">
                <div className="sec-title px">THE ROOM</div>
                <div className="sec-hint">
                  {data.mates.length} inhabitants · rotation of {data.mates.length}
                </div>
              </div>

              <MateGrid mates={data.mates} meName={data.currentUser} />

              <div className="sec-head">
                <div className="sec-title px">SUB-LEDGER</div>
                <div className="sec-hint">patungan &amp; room activity</div>
              </div>

              <div className="subtabs">
                {[
                  ['patungan', 'PATUNGAN'],
                  ['activity', 'ACTIVITY FEED'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={`subtab${sub === key ? ' active' : ''}`}
                    onClick={() => switchSub(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {sub === 'patungan' ? (
                <Patungan
                  mates={data.mates}
                  expenses={data.expenses}
                  meName={data.currentUser}
                  onAdd={addExpense}
                  onToggle={togglePayment}
                  onError={say}
                />
              ) : (
                <ActivityFeed activity={data.activity} />
              )}
            </section>
          ) : (
            <SchedulePanel
              duties={data.duties}
              dutyId={dutyId}
              onPickDuty={setDutyId}
              rotation={data.rotation}
              week={data.currentWeek}
              meName={data.currentUser}
              onMarkDone={markDone}
            />
          )}
        </div>

        <footer className="foot">
          <div className="px">UNITED 216 — BUILT BY ROOM 216, FOR EVERY ROOM</div>
          coordination · financial discipline · harmony. data lives in SQLite at
          data/room216.db when the API is running, otherwise in this browser.
        </footer>
      </main>

      <Toast toast={toast} />
      <canvas id="confetti" />
    </>
  )
}
