/**
 * Verifies the Vercel failure mode is fixed: serves ONLY the static Vite build
 * from dist/ with no /api backend, then drives it in headless Edge and asserts
 * the app boots, logs in, and mutates data through the browser-local fallback.
 *
 * Any unknown path returns the SPA's index.html, exactly as Vercel does — which
 * is what previously produced "Unexpected token 'T', "The page c"... is not
 * valid JSON".
 *
 * Usage: node scripts/static-check.js
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 5188
const CDP = 9333
const BASE = `http://localhost:${PORT}`

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('FAIL  dist/ not found — run: npm run build')
  process.exit(1)
}

/* ---------- static server with NO /api, SPA fallback like Vercel ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, BASE)
  let file = path.join(DIST, decodeURIComponent(url.pathname))

  // Vercel behaviour: unknown /api/* falls through to the SPA HTML document,
  // which is exactly the HTML that used to break JSON.parse().
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html')
  }
  const body = fs.readFileSync(file)
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  res.end(body)
})

await new Promise((r) => server.listen(PORT, r))

/* verify the failure mode is actually reproduced by this server */
const probe = await fetch(`${BASE}/api/bootstrap`)
const probeBody = await probe.text()
const reproduces =
  !probe.ok || (() => {
    try {
      JSON.parse(probeBody)
      return false
    } catch {
      return true
    }
  })()

const checks = []
const check = (label, ok, detail = '') => {
  checks.push(!!ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

check(
  'static host answers /api with non-JSON (reproduces the Vercel bug)',
  reproduces,
  `status=${probe.status} looksLikeHtml=${probeBody.trimStart().startsWith('<')}`
)

/* ---------- headless Edge ---------- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'u216-static-'))
const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${CDP}`,
  `--user-data-dir=${profile}`,
  BASE,
])
edge.stdout.resume()
edge.stderr.resume()

const cleanup = () => {
  try {
    edge.kill()
  } catch {
    /* gone */
  }
  server.close()
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    /* OS temp will clean it */
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(1)
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let target = null
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250)
  try {
    const list = await (await fetch(`http://localhost:${CDP}/json/list`)).json()
    target = list.find((t) => t.type === 'page' && t.url.includes(String(PORT)))
  } catch {
    /* not up yet */
  }
}
if (!target) {
  check('attached to the Edge page target', false)
  console.log(`\n${checks.filter(Boolean).length}/${checks.length} static-host checks passed`)
  cleanup()
  process.exit(1)
}
check('attached to the Edge page target', true)

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
    consoleErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''))
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

const waitFor = async (selector, timeout = 12000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return true
    await sleep(150)
  }
  return false
}

/* the old build showed this screen — it must never appear now */
await waitFor('.gate-card, .boot', 15000)

const showedError = await evaluate(`!!document.querySelector('.boot')`)
const bootText = showedError ? await evaluate(`document.querySelector('.boot').innerText`) : ''
check(
  'app does NOT show "CANNOT REACH THE ROOM LEDGER"',
  !showedError,
  bootText.replace(/\s+/g, ' ').slice(0, 70)
)
check('login gate renders', await waitFor('.gate-card'))
check(
  '4 roommates seeded from the local fallback',
  (await evaluate(`document.querySelectorAll('.mate-pick').length`)) === 4
)
check(
  'LOCAL LEDGER badge shows the active backend',
  (await evaluate(`!![...document.querySelectorAll('.chip-mode')].find(e=>e.textContent.includes('LOCAL LEDGER'))`))
)

/* log in through the fallback */
await evaluate(`document.querySelectorAll('.mate-pick')[0].click()`)
check('app shell reveals after login', await waitFor('#app.on'))
check(
  'topbar shows the logged-in roommate',
  (await evaluate(`document.querySelector('.chip-user span')?.textContent`)) === 'Kelana'
)
check(
  'patungan table shows seeded expenses',
  (await evaluate(`document.querySelectorAll('.ptable tbody tr').length`)) >= 2
)

/* mutate data — this is what silently failed before */
await evaluate(`
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el)
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  set(document.getElementById('expDesc'), 'Static host check')
  set(document.getElementById('expAmt'), '9000')
  document.getElementById('expDesc').form.requestSubmit()
`)
await sleep(900)
check(
  'expense saves through the fallback',
  await evaluate(`document.body.innerText.includes('Static host check')`)
)

/* schedule advance */
await evaluate(`document.querySelectorAll('.tabbtn')[1].click()`)
await sleep(1400)
const weekBefore = await evaluate(`document.querySelector('.hero-week')?.textContent?.trim()`)
await evaluate(`document.querySelector('.done-zone .pxbtn')?.click()`)
await sleep(1000)
const weekAfter = await evaluate(`document.querySelector('.hero-week')?.textContent?.trim()`)
check('mark-as-done rolls the week forward', weekBefore !== weekAfter, `${weekBefore} -> ${weekAfter}`)

/* the write must survive a reload via localStorage */
await send('Page.navigate', { url: BASE })
await sleep(1200)
await waitFor('.gate-card', 12000)
await evaluate(`document.querySelectorAll('.mate-pick')[0].click()`)
await sleep(900)
check(
  'data persists across a reload (localStorage)',
  await evaluate(`document.body.innerText.includes('Static host check')`)
)

const syntaxErrors = consoleErrors.filter((e) => /is not valid JSON|SyntaxError/.test(e))
check(
  'no JSON.parse / SyntaxError in the console',
  syntaxErrors.length === 0,
  syntaxErrors.slice(0, 2).join(' | ')
)
check(
  'no uncaught exceptions during the whole run',
  consoleErrors.length === 0,
  consoleErrors.slice(0, 2).join(' | ')
)

const passed = checks.filter(Boolean).length
console.log(`\n${passed}/${checks.length} static-host checks passed`)
ws.close()
cleanup()
await sleep(300)
process.exit(passed === checks.length ? 0 : 1)