/*
 * Browser test for the reaction flow: the typed emoji input, the placement
 * of the picker popup on a phone screen and the reaction bubbles.
 *
 * It needs Chrome, so it is not part of `npm run verify`. It boots the
 * production build against throwaway data directories, so the real database
 * is never touched.
 *
 *   npm run test:browser
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const PORT = Number(process.env.BROWSER_TEST_PORT || 3998)
const BASE = 'http://127.0.0.1:' + PORT
const CDP_PORT = Number(process.env.BROWSER_TEST_CDP_PORT || 9559)
const OUT = join(tmpdir(), 'lingling-preview', 'reaction-shots')
const WORK = mkdtempSync(join(tmpdir(), 'lingling-reaction-test-'))
const PROFILE = join(WORK, 'chrome-profile')
const WIDTH = 390
const HEIGHT = 844

/** The emoji keyboard on a phone is the reason the input exists. */
const TYPED_EMOJIS = [
  ['\u{1F9E0}', '\u{1F9E0}', 'brain'],
  ['\u2764\uFE0F', '\u2764\uFE0F', 'heart with a variation selector'],
  ['\u{1F1E8}\u{1F1F3}', '\u{1F1E8}\u{1F1F3}', 'flag'],
  ['\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', 'ZWJ family'],
  ['1\uFE0F\u20E3', '1\uFE0F\u20E3', 'keycap'],
  ['\u{1F44D}\u{1F3FD}', '\u{1F44D}\u{1F3FD}', 'skin tone modifier'],
]

/** Where Chrome lives, on the machines this is likely to run on. */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  return candidates.find(path => existsSync(path)) || ''
}

let pass = 0
let fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + '   ' + extra) }
}
const section = title => { console.log(''); console.log('== ' + title + ' ==') }
const sleep = ms => new Promise(r => setTimeout(r, ms))

const chromePath = findChrome()
if (!chromePath) {
  console.error('Chrome was not found. Set CHROME_PATH to run this test.')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

const server = spawn(process.execPath, [join(ROOT, 'dist/server/index.js')], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    DATA_DIR: join(WORK, 'data'),
    UPLOADS_DIR: join(WORK, 'uploads'),
    BACKUP_DIR: join(WORK, 'backups'),
    BACKUP_INITIAL_DELAY_MS: '600000',
    BACKUP_INTERVAL_MS: '600000',
    AUTH_SECRET: 'browser-test-secret',
    PERSON_A_PASSWORD: 'lingling',
    PERSON_B_PASSWORD: 'lianlian',
    CORS_ORIGIN: '*',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stderr.on('data', d => process.stderr.write('[server] ' + d))

const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + PROFILE, 'about:blank',
], { stdio: 'ignore' })

const cleanup = () => {
  try { chrome.kill() } catch { /* already gone */ }
  try { server.kill() } catch { /* already gone */ }
  try { rmSync(WORK, { recursive: true, force: true }) } catch { /* ignore */ }
}
process.on('exit', cleanup)

let nextId = 1
function connect(url) {
  const socket = new WebSocket(url)
  const pending = new Map()
  const consoleErrors = []
  socket.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { resolve: res, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : res(m.result)
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '))
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      consoleErrors.push(m.params.entry.text)
    }
  })
  const ready = new Promise((res, rej) => {
    socket.addEventListener('open', res)
    socket.addEventListener('error', rej)
  })
  const send = (method, params = {}) => new Promise((res, reject) => {
    const id = nextId++
    pending.set(id, { resolve: res, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  return { socket, send, ready, consoleErrors }
}

async function evaluate(client, expression) {
  const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) {
    throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
  }
  return r.result?.value
}

async function shot(client, name) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name + '.png'), Buffer.from(data, 'base64'))
  console.log('  shot: ' + name)
}

async function api(path, options = {}) {
  const res = await fetch(BASE + path, options)
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, json }
}

const login = (personId, password) => api('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personId, password }),
})

async function serverReactions(token, ids) {
  const res = await api('/api/reactions?postIds=' + encodeURIComponent(ids.join(',')), {
    headers: { Authorization: 'Bearer ' + token },
  })
  return Object.values(res.json?.reactions ?? {}).flat().map(r => r.person_id + ':' + r.emoji)
}

/** Opens the picker, retrying only while the popup is genuinely closed. */
async function openPicker(client) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await evaluate(client, 'Boolean(document.querySelector(".emoji-picker-input"))')) return true
    await evaluate(client, 'document.querySelectorAll(".reaction-trigger-btn")[0].click()')
    await sleep(700)
  }
  return evaluate(client, 'Boolean(document.querySelector(".emoji-picker-input"))')
}

/** Types into the input the way a phone keyboard would and sends it. */
async function typeAndSend(client, text) {
  if (!await openPicker(client)) return { ok: false }
  await evaluate(client, 'document.querySelector(".emoji-picker-input").focus()')
  await sleep(150)
  await client.send('Input.insertText', { text })
  await sleep(250)
  const value = await evaluate(client, 'document.querySelector(".emoji-picker-input").value')
  const disabled = await evaluate(client, 'document.querySelector(".emoji-picker-send").disabled')
  await evaluate(client, 'document.querySelector(".emoji-picker-send").click()')
  await sleep(1200)
  return { ok: true, value, disabled }
}

const popupBox = client => evaluate(client, `(() => {
  const p = document.querySelector('.emoji-picker-overlay')
  if (!p) return null
  const r = p.getBoundingClientRect()
  return {
    top: Math.round(r.top), bottom: Math.round(r.bottom),
    left: Math.round(r.left), right: Math.round(r.right),
    onScreen: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
  }
})()`)

try {
  section('server')
  let up = false
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) { up = true; break } } catch { /* not yet */ }
    await sleep(250)
  }
  check('the production build serves the API', up)
  if (!up) throw new Error('the server did not start')

  const a = await login('person-a', 'lingling')
  const b = await login('person-b', 'lianlian')
  check('both people can log in', a.status === 200 && b.status === 200)
  const tokenA = a.json?.token || ''
  const tokenB = b.json?.token || ''

  const post = await api('/api/posts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tokenA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'a post to react to' }),
  })
  check('a post exists to react to', post.status === 201)
  const ids = [post.json?.id]

  section('browser')
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version'); if (r.ok) break } catch { /* not yet */ }
    await sleep(250)
  }
  const created = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/new?about:blank', { method: 'PUT' }).then(r => r.json())
  const client = connect(created.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Log.enable')
  await client.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true })
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  await client.send('Page.navigate', { url: BASE + '/' })
  await sleep(1200)
  await evaluate(client, 'localStorage.setItem("linglinglianlian.token", ' + JSON.stringify(tokenA) + ')')
  await client.send('Page.navigate', { url: BASE + '/timeline/person-a' })
  await sleep(3000)

  section('the page')
  const title = await evaluate(client, 'document.querySelector(".timeline-page-title")?.textContent.trim() ?? null')
  check('the timeline title is English', title === 'Lingling\u2019s Timeline', JSON.stringify(title))
  const publish = await evaluate(client, '(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent.includes("Keep this moment")); return b ? b.textContent.trim() : null })()')
  check('the publish button says Keep this moment', publish === 'Keep this moment', JSON.stringify(publish))
  await shot(client, '01-timeline')

  await evaluate(client, 'document.querySelectorAll(".reaction-trigger-btn")[0].scrollIntoView({block:"center"})')
  await sleep(800)

  section('the picker')
  check('the picker opens', await openPicker(client))
  const box = await popupBox(client)
  check('the popup is fully on screen', box?.onScreen === true, JSON.stringify(box))
  const inputVisible = await evaluate(client, '(() => { const i = document.querySelector(".emoji-picker-input"); if (!i) return false; const r = i.getBoundingClientRect(); return r.width > 40 && r.height > 10 })()')
  check('the typed input is visible', inputVisible === true)
  await shot(client, '02-picker')

  section('typing an emoji')
  for (const [typed, expected, label] of TYPED_EMOJIS) {
    const r = await typeAndSend(client, typed)
    const stored = await serverReactions(tokenA, ids)
    check('a typed ' + label + ' is stored verbatim', stored.includes('person-a:' + expected), JSON.stringify(stored))
    if (label === 'brain') {
      check('the input held what was typed', r.value === typed, JSON.stringify(r.value))
      check('the send button was enabled', r.disabled === false)
      const shown = await evaluate(client, '(() => { const b = document.querySelector(".reaction-trigger-btn.has-reaction"); return b ? b.textContent.trim() : null })()')
      check('the trigger shows the new emoji', shown === typed, JSON.stringify(shown))
      await shot(client, '03-sent')
    }
  }

  section('plain text')
  const before = await serverReactions(tokenA, ids)
  const plain = await typeAndSend(client, 'hello')
  const after = await serverReactions(tokenA, ids)
  check('the plain text reached the input', plain.value === 'hello', JSON.stringify(plain.value))
  check('no reaction was created', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after))
  const toast = await evaluate(client, 'document.querySelector(".toast")?.textContent ?? null')
  check('an error toast is shown', /表情/.test(toast ?? ''), JSON.stringify(toast))
  await shot(client, '04-rejected')

  section('the emoji library')
  check('the picker opens again', await openPicker(client))
  await evaluate(client, 'document.querySelector(".emoji-quick-toggle").click()')
  await sleep(1000)
  check('the library renders', await evaluate(client, 'Boolean(document.querySelector(".emoji-picker-content [data-epr-part]"))'))
  const expanded = await popupBox(client)
  check('the expanded popup is still on screen', expanded?.onScreen === true, JSON.stringify(expanded))
  await shot(client, '05-library')

  section('the other person')
  const bReaction = await api('/api/reactions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tokenB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId: ids[0], emoji: '\u2764\uFE0F' }),
  })
  check('the other person can react', bReaction.status === 200, String(bReaction.status))
  await client.send('Page.reload')
  await sleep(3000)
  await evaluate(client, 'document.querySelectorAll(".reaction-trigger-btn")[0].scrollIntoView({block:"center"})')
  await sleep(600)
  const bubble = await evaluate(client, '(() => { const b = document.querySelector(".reaction-bubble"); return b ? b.textContent.trim() : null })()')
  check('the reaction bubble shows the emoji', bubble === '\u2764\uFE0F', JSON.stringify(bubble))
  const radius = await evaluate(client, '(() => { const b = document.querySelector(".reaction-bubble"); return b ? parseFloat(getComputedStyle(b).borderRadius) : 0 })()')
  check('the bubble is a rounded pill', radius >= 10, String(radius))
  await shot(client, '06-bubble')

  section('withdrawing')
  check('the picker opens for removal', await openPicker(client))
  const removed = await evaluate(client, '(() => { const b = document.querySelector(".emoji-quick-remove"); if (!b) return "no button"; b.click(); return "clicked" })()')
  await sleep(1500)
  const left = await serverReactions(tokenA, ids)
  check('the remove button was there', removed === 'clicked', removed)
  check('my reaction is gone', !left.some(r => r.startsWith('person-a:')), JSON.stringify(left))
  check("the other person's reaction is kept", left.some(r => r.startsWith('person-b:')), JSON.stringify(left))

  section('the console')
  check('nothing is blocked by the content security policy',
    !client.consoleErrors.some(e => /Content Security Policy|fonts\.googleapis|fonts\.gstatic/.test(e)),
    JSON.stringify(client.consoleErrors))
  check('there are no console errors', client.consoleErrors.length === 0, JSON.stringify(client.consoleErrors))

  client.socket.close()
} catch (err) {
  console.error('FAILED', err)
  fail++
} finally {
  cleanup()
}

console.log('')
console.log('=========== ' + pass + ' passed, ' + fail + ' failed ===========')
process.exit(fail === 0 ? 0 : 1)
