/*
 * End-to-end smoke test. Boots the production build against throwaway data
 * directories and exercises auth, ownership, uploads and response headers.
 *
 *   npm run verify   # typecheck + build + this
 */
import { spawn } from 'node:child_process'
import { rmSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.SMOKE_PORT || 3997)
const BASE = 'http://127.0.0.1:' + PORT
const TMP = ['.smoke-data', '.smoke-uploads', '.smoke-backups']

let pass = 0
let fail = 0

function check(name, ok, extra = '') {
  if (ok) {
    pass++
    console.log('  PASS  ' + name)
  } else {
    fail++
    console.log('  FAIL  ' + name + '   ' + extra)
  }
}

const section = title => {
  console.log('')
  console.log('== ' + title + ' ==')
}

async function req(path, options = {}) {
  const res = await fetch(BASE + path, options)
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers }
}

const jsonAuth = token => ({
  Authorization: 'Bearer ' + token,
  'Content-Type': 'application/json',
})

async function login(personId, password) {
  return req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personId, password }),
  })
}

const server = spawn(process.execPath, [join(ROOT, 'dist/server/index.js')], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    DATA_DIR: '.smoke-data',
    UPLOADS_DIR: '.smoke-uploads',
    AUTH_SECRET: 'smoke-test-secret',
    PERSON_A_PASSWORD: 'alpha-pass',
    PERSON_B_PASSWORD: 'beta-pass',
    CORS_ORIGIN: 'https://good.example.com',
    BACKUP_DIR: '.smoke-backups',
    BACKUP_INITIAL_DELAY_MS: '500',
    BACKUP_INTERVAL_MS: '600000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const serverLog = []
server.stdout.on('data', d => serverLog.push(String(d)))
server.stderr.on('data', d => serverLog.push(String(d)))

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE + '/api/auth/login')
      if (res.status < 500) return true
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

async function waitFor(predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // await, so an async predicate is not silently always-truthy
    if (await predicate()) return true
    await new Promise(r => setTimeout(r, 200))
  }
  return await predicate()
}

function cleanup() {
  for (const dir of TMP) {
    try { rmSync(join(ROOT, dir), { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

let tokenA = ''
let tokenB = ''
let authA = {}
let authB = {}

async function run() {
  section('auth gate')
  check('timeline without token -> 401', (await req('/api/timeline')).status === 401)
  check('persons without token -> 401', (await req('/api/persons')).status === 401)
  check('create post without token -> 401',
    (await req('/api/posts', { method: 'POST', body: '{}' })).status === 401)
  check('upload without token -> 401',
    (await req('/api/upload/image', { method: 'POST' })).status === 401)

  section('login')
  const wrong = await login('person-a', 'nope')
  check('wrong password -> 401', wrong.status === 401)
  check('wrong password returns no token', wrong.json?.token === undefined)
  const unknown = await login('person-zzz', 'alpha-pass')
  check('unknown person -> identical 401',
    unknown.status === 401 && unknown.json?.error === wrong.json?.error)
  const la = await login('person-a', 'alpha-pass')
  check('correct password -> 200 + token', la.status === 200 && !!la.json?.token)
  const lb = await login('person-b', 'beta-pass')
  check('second person can log in', lb.status === 200 && !!lb.json?.token)
  tokenA = la.json?.token || ''
  tokenB = lb.json?.token || ''
  authA = jsonAuth(tokenA)
  authB = jsonAuth(tokenB)

  section('token integrity')
  check('tampered token -> 401',
    (await req('/api/timeline', { headers: { Authorization: 'Bearer ' + tokenA + 'x' } })).status === 401)
  check('garbage token -> 401',
    (await req('/api/timeline', { headers: { Authorization: 'Bearer aaa.bbb' } })).status === 401)
  check('/api/auth/me works',
    (await req('/api/auth/me', { headers: { Authorization: 'Bearer ' + tokenA } })).status === 200)

  section('post creation')
  const spoof = await req('/api/posts', {
    method: 'POST', headers: authA,
    body: JSON.stringify({ author_id: 'person-b', content: 'spoof attempt', media: [] }),
  })
  check('text post -> 201', spoof.status === 201)
  check('author_id from token not body', spoof.json?.author_id === 'person-a',
    'got ' + spoof.json?.author_id)
  check('empty post -> 400',
    (await req('/api/posts', { method: 'POST', headers: authA, body: JSON.stringify({ content: '  ' }) })).status === 400)
  const mediaOnly = await req('/api/posts', {
    method: 'POST', headers: authA,
    body: JSON.stringify({ content: '', media: [{ id: 'm1', type: 'image', url: '/uploads/x.jpg' }] }),
  })
  check('media-only post -> 201', mediaOnly.status === 201)
  check('non-uploads media url -> 400',
    (await req('/api/posts', {
      method: 'POST', headers: authA,
      body: JSON.stringify({ content: 'x', media: [{ id: 'm', type: 'image', url: 'javascript:alert(1)' }] }),
    })).status === 400)

  section('ownership')
  const id = spoof.json?.id
  check("B editing A's post -> 403",
    (await req('/api/posts/' + id, { method: 'PUT', headers: authB, body: JSON.stringify({ content: 'hijack' }) })).status === 403)
  check("B deleting A's post -> 403",
    (await req('/api/posts/' + id, { method: 'DELETE', headers: authB })).status === 403)
  check('A editing own post -> 200',
    (await req('/api/posts/' + id, { method: 'PUT', headers: authA, body: JSON.stringify({ content: 'edited' }) })).status === 200)

  section('upload whitelist')
  const evil = new FormData()
  evil.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'evil.html')
  check('text/html disguised as image -> 400',
    (await req('/api/upload/image', { method: 'POST', headers: { Authorization: 'Bearer ' + tokenA }, body: evil })).status === 400)
  const good = new FormData()
  good.append('file', new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])], { type: 'image/jpeg' }), 'ok.jpg')
  const upload = await req('/api/upload/image', {
    method: 'POST', headers: { Authorization: 'Bearer ' + tokenA }, body: good,
  })
  check('image/jpeg accepted -> 201', upload.status === 201)
  const url = upload.json?.url || ''
  check('stored url is uuid + .jpg',
    url.startsWith('/uploads/') && url.endsWith('.jpg') && url.length === 49, url)

  section('security headers + cors')
  const root = await fetch(BASE + '/', { headers: { Origin: 'https://good.example.com' } })
  check('good origin gets ACAO',
    root.headers.get('access-control-allow-origin') === 'https://good.example.com')
  check('bad origin gets no ACAO',
    (await fetch(BASE + '/', { headers: { Origin: 'https://evil.example.com' } })).headers.get('access-control-allow-origin') === null)
  check('X-Content-Type-Options nosniff', root.headers.get('x-content-type-options') === 'nosniff')
  check('X-Frame-Options DENY', root.headers.get('x-frame-options') === 'DENY')
  check('CSP on html', (root.headers.get('content-security-policy') || '').includes("default-src 'self'"))

  section('malformed json')
  check('malformed JSON -> 400 not 500',
    (await req('/api/posts', { method: 'POST', headers: authA, body: '{not json' })).status === 400)

  section('conditional polling (ETag)')
  const first = await req('/api/timeline', { headers: { Authorization: 'Bearer ' + tokenA } })
  const etag = first.headers.get('etag')
  check('first fetch returns an ETag', !!etag, String(etag))
  const second = await req('/api/timeline', {
    headers: { Authorization: 'Bearer ' + tokenA, 'If-None-Match': etag },
  })
  check('unchanged timeline -> 304', second.status === 304, String(second.status))
  check('304 has an empty body', second.text === '')
  await req('/api/posts', { method: 'POST', headers: authA, body: JSON.stringify({ content: 'bump' }) })
  const third = await req('/api/timeline', {
    headers: { Authorization: 'Bearer ' + tokenA, 'If-None-Match': etag },
  })
  check('new post invalidates the ETag', third.status === 200, String(third.status))
  check('new ETag differs', third.headers.get('etag') !== etag)
  const etagAfterAdd = third.headers.get('etag')
  const deleted = await req('/api/posts/' + third.json.find(p => p.content === 'bump').id, {
    method: 'DELETE', headers: authA,
  })
  check('delete -> 204', deleted.status === 204)
  const fourth = await req('/api/timeline', {
    headers: { Authorization: 'Bearer ' + tokenA, 'If-None-Match': etagAfterAdd },
  })
  check('delete invalidates the ETag', fourth.status === 200, String(fourth.status))

  section('delete removes media from disk')
  check('delete media-only post -> 204',
    (await req('/api/posts/' + mediaOnly.json?.id, { method: 'DELETE', headers: authA })).status === 204)
  check('media file removed from disk',
    url ? !existsSync(join(ROOT, '.smoke-uploads' + url)) : false)

  section('rate limit')
  const burst = await Promise.all(Array.from({ length: 30 }, () => login('person-a', 'wrong')))
  check('brute force throttled', burst.some(r => r.status === 429))

  section('health + backup')
  const health = await req('/api/health')
  check('/api/health -> 200 without a token', health.status === 200)
  check('/api/health reports ok', health.json?.ok === true)

  // The server was started with a short BACKUP_INTERVAL_MS, so by now at least
  // one backup should exist in .smoke-backups.
  const backupDir = join(ROOT, '.smoke-backups')
  // A backup is only finished once BOTH artefacts exist: runBackup() writes
  // the database first and copies the uploads afterwards, so waiting on the
  // .db alone races the media copy.
  const backupComplete = () => {
    if (!existsSync(backupDir)) return false
    try {
      const files = readdirSync(backupDir)
      return (
        files.some(f => f.startsWith('posts-') && f.endsWith('.db')) &&
        files.some(f => f.startsWith('uploads-'))
      )
    } catch {
      return false
    }
  }
  const made = await waitFor(backupComplete)
  check('scheduled backup produced database + media copies', made)
  if (made) {
    const files = readdirSync(backupDir)
    check('backup includes the uploads dir', files.some(f => f.startsWith('uploads-')))
    const dbBackup = join(backupDir, files.find(f => f.startsWith('posts-')))
    const header = readFileSync(dbBackup).subarray(0, 15).toString('latin1')
    check('backup is a real SQLite database', header.startsWith('SQLite format 3'))
  }
}

try {
  if (!await waitForServer()) {
    console.log('SERVER FAILED TO START')
    console.log(serverLog.join(''))
    process.exit(1)
  }
  await run()
} catch (err) {
  console.log('HARNESS ERROR:', err)
  fail++
} finally {
  server.kill('SIGTERM')
  // The server checkpoints SQLite on the way out, so wait for it to actually
  // exit before deleting its data directories -- otherwise it recreates them.
  await new Promise(resolve => {
    if (server.exitCode !== null || server.signalCode !== null) {
      resolve()
      return
    }
    server.once('exit', resolve)
    setTimeout(resolve, 12000)
  })
  cleanup()
}

console.log('')
console.log('=========== ' + pass + ' passed, ' + fail + ' failed ===========')
process.exit(fail === 0 ? 0 : 1)
