/**
 * Headless browser check: boots the Vite app in Edge via CDP, logs in,
 * switches tabs, adds an expense, marks a duty done, and asserts the DOM.
 * Usage: node scripts/browser-check.js
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = 'http://localhost:5173/'
const PORT = 9222
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'u216-edge-'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  URL,
])
edge.stdout.resume()
edge.stderr.resume()

process.on('exit', () => cleanup())

const cleanup = () => {
  try {
    edge.kill()
  } catch {
    /* already gone */
  }
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    /* Edge still holding the profile — the OS temp dir will clean up */
  }
}
process.on('SIGINT', () => {
  cleanup()
  process.exit(1)
})

/* wait for the debugger endpoint */
let target = null
for (let i = 0; i < 40; i++) {
  await sleep(250)
  try {
    const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json()
    target = list.find((t) => t.type === 'page' && t.url.includes('5173'))
    if (target) break
  } catch {
    /* not up yet */
  }
}
if (!target) {
  console.error('FAIL  could not attach to the Edge page target')
  cleanup()
  process.exit(1)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let msgId = 0
const pending = new Map()
const consoleErrors = []

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(msg.params.exceptionDetails.text)
  }
}

const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++msgId
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
await send('Page.enable')

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (res.result?.exceptionDetails) {
    throw new Error(res.result.exceptionDetails.text + ' :: ' + expression)
  }
  return res.result?.result?.value
}

const checks = []
const check = (label, ok, detail = '') => {
  checks.push(!!ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

/* wait until a selector appears */
const waitFor = async (selector, timeout = 10000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return true
    await sleep(150)
  }
  return false
}

check('React mounts the login gate', await waitFor('.gate-card'))
check('4 roommate buttons come from SQLite', (await evaluate(`document.querySelectorAll('.mate-pick').length`)) === 4)
check('login gate copy renders', (await evaluate(`document.querySelector('.gate-card h1').textContent`)) === 'UNITED 216')

await evaluate(`document.querySelectorAll('.mate-pick')[0].click()`)
check('app shell reveals after login', await waitFor('#app.on'))
check('topbar shows the logged-in roommate', (await evaluate(`document.querySelector('.chip-user span').textContent`)) === 'Kelana')
check('roommate grid renders 4 cards', (await evaluate(`document.querySelectorAll('.mate').length`)) === 4)
check('avatars painted as pixel canvases', (await evaluate(`[...document.querySelectorAll('.mate canvas')].every(c => c.getContext('2d').getImageData(0,0,8,8).data.some(v => v > 0))`)))
check('patungan table shows seeded expenses', (await evaluate(`document.querySelectorAll('.ptable tbody tr').length`)) >= 2)
check('expense pills render as 4 per row', (await evaluate(`document.querySelectorAll('.ptable tbody tr:first-child .pay-pill').length`)) === 4)

/* activity feed sub-tab */
await evaluate(`document.querySelectorAll('.subtab')[1].click()`)
await sleep(500)
check('activity feed renders entries', (await evaluate(`document.querySelectorAll('.feed li').length`)) >= 1)

/* back to patungan and add an expense */
await evaluate(`document.querySelectorAll('.subtab')[0].click()`)
await sleep(400)
await evaluate(`
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el)
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  set(document.getElementById('expDesc'), 'Browser check buns')
  set(document.getElementById('expAmt'), '8000')
  document.getElementById('expDesc').form.requestSubmit()
`)
await sleep(900)
check('new expense appears in the ledger', await evaluate(`document.body.innerText.includes('Browser check buns')`))
check('creator pill is auto-marked paid', await evaluate(`!!document.querySelector('.pay-pill.paid')`))

/* toggle a pill */
const beforeToggle = await evaluate(`document.querySelectorAll('.pay-pill.owes').length`)
await evaluate(`document.querySelector('.pay-pill.owes').click()`)
await sleep(700)
const afterToggle = await evaluate(`document.querySelectorAll('.pay-pill.owes').length`)
check('payment pill toggles paid/owes', afterToggle === beforeToggle - 1, `${beforeToggle} -> ${afterToggle}`)

/* switch to the schedule tab via the pixel wipe */
await evaluate(`document.querySelectorAll('.tabbtn')[1].click()`)
await sleep(400)
check('pixel wipe covers the panel mid-swap', await evaluate(`document.getElementById('wipe').classList.contains('cover')`))
await sleep(1200)
check('schedule panel is active', await evaluate(`!!document.querySelector('#panel-schedule.active')`))
check('duty chips render 5 duties', (await evaluate(`document.querySelectorAll('.dchip').length`)) === 5)
check('hero names this week\'s owner', (await evaluate(`document.querySelector('.bigname').textContent`)).length > 0)
check('rotation table lists 4 weeks', (await evaluate(`document.querySelectorAll('#rotTable tbody tr').length`)) === 4)

const weekBefore = await evaluate(`document.querySelector('.hero-week').textContent`)
await evaluate(`document.querySelector('.done-zone .pxbtn').click()`)
await sleep(1000)
const weekAfter = await evaluate(`document.querySelector('.hero-week').textContent`)
check('mark as done rolls the week forward', weekBefore !== weekAfter, `${weekBefore.trim()} -> ${weekAfter.trim()}`)
check('confetti canvas is present', await evaluate(`!!document.getElementById('confetti')`))

/* UX law annotations */
await evaluate(`[...document.querySelectorAll('.pxbtn')].find(b => b.textContent.includes('UX LAWS')).click()`)
await sleep(700)
const chipCount = await evaluate(`document.querySelectorAll('.law-chip').length`)
const annotated = await evaluate(`[...document.querySelectorAll('[data-law]')].map(e => e.dataset.law.split('|')[0])`)
check(
  'UX law chips mount 1:1 with annotated elements',
  chipCount === annotated.length && chipCount > 0,
  `${chipCount} chips for [${annotated.join(', ')}]`
)
check('law chips are visible', await evaluate(`[...document.querySelectorAll('.law-chip')].some(c => getComputedStyle(c).opacity === '1')`))
check('laws-on body class applied', await evaluate(`document.body.classList.contains('laws-on')`))

check('no console errors during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

const passed = checks.filter(Boolean).length
console.log(`\n${passed}/${checks.length} browser checks passed`)

ws.close()
cleanup()
process.exit(passed === checks.length ? 0 : 1)
