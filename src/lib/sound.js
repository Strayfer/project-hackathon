let soundOn = true
let AC = null

function beep(freq = 440, dur = 0.06, type = 'square', vol = 0.05, when = 0) {
  if (!soundOn) return
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)()
    const o = AC.createOscillator()
    const g = AC.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(vol, AC.currentTime + when)
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + when + dur)
    o.connect(g)
    g.connect(AC.destination)
    o.start(AC.currentTime + when)
    o.stop(AC.currentTime + when + dur + 0.02)
  } catch {
    /* audio unavailable — silent is fine */
  }
}

export const sfx = {
  setOn(v) {
    soundOn = v
  },
  isOn: () => soundOn,
  click: () => beep(660, 0.05, 'square', 0.04),
  hover: () => beep(880, 0.02, 'square', 0.015),
  error: () => beep(180, 0.12, 'sawtooth', 0.05),
  tab: () => {
    beep(520, 0.05, 'square', 0.04)
    beep(760, 0.05, 'square', 0.04, 0.05)
  },
  login: () => [523, 659, 784].forEach((f, i) => beep(f, 0.09, 'square', 0.05, i * 0.07)),
  done: () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.1, 'square', 0.05, i * 0.06)),
  coin: () => {
    beep(988, 0.06, 'square', 0.05)
    beep(1319, 0.12, 'square', 0.05, 0.06)
  },
}
