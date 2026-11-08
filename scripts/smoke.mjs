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
import Database from 'better-sqlite3'

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

/** The Shanghai calendar date, worked out without asking the server. */
function shanghaiDateKey(daysAgo = 0) {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000 - daysAgo * 86400000)
  return shifted.toISOString().slice(0, 10)
}

/** Whole days from one date key to another. */
function daysBetweenKeys(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)
}

/**
 * The gift date of the cycle that is running now: the first 11 January on or
 * after today. Worked out here, without the server, so the test can state
 * what the server owes it.
 */
function giftTargetKey() {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000)
  const year = shifted.getUTCFullYear()
  const todayUtc = Date.UTC(year, shifted.getUTCMonth(), shifted.getUTCDate())
  const thisYear = Date.UTC(year, 0, 11)
  const target = todayUtc > thisYear ? Date.UTC(year + 1, 0, 11) : thisYear
  return new Date(target).toISOString().slice(0, 10)
}

/**
 * The gift date of Lianlian's box: the first 28 June on or after today.
 */
function lianlianTargetKey() {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000)
  const year = shifted.getUTCFullYear()
  const todayUtc = Date.UTC(year, shifted.getUTCMonth(), shifted.getUTCDate())
  const thisYear = Date.UTC(year, 5, 28)
  const target = todayUtc > thisYear ? Date.UTC(year + 1, 5, 28) : thisYear
  return new Date(target).toISOString().slice(0, 10)
}

/** The day a new cycle starts: the day after the gift date before this one. */
function cycleStartKey() {
  const targetYear = Number(giftTargetKey().slice(0, 4))
  return new Date(Date.UTC(targetYear - 1, 0, 11) + 86400000).toISOString().slice(0, 10)
}

/** The later of two date keys. */
function laterKey(a, b) {
  return a > b ? a : b
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

  section('gift box')
  check('gift state without a token -> 401', (await req('/api/gift/lingling-gift')).status === 401)
  check('tearing without a token -> 401',
    (await req('/api/gift/lingling-gift/open', { method: 'POST' })).status === 401)
  check('a box that does not exist -> 404',
    (await req('/api/gift/no-such-gift', { headers: authA })).status === 404)
  check('opening a box that does not exist -> 404',
    (await req('/api/gift/no-such-gift/open', { method: 'POST', headers: authA })).status === 404)

  // The second box: its own id, its own date, its own progress.
  const lianlian = await req('/api/gift/lianlian-gift', { headers: { Authorization: 'Bearer ' + tokenA } })
  check('the second box -> 200', lianlian.status === 200)
  check('the second box says which box it is',
    lianlian.json?.state?.giftId === 'lianlian-gift')
  check('the second box is due on its own date',
    lianlian.json?.state?.targetDate === lianlianTargetKey(),
    'got ' + lianlian.json?.state?.targetDate)
  const lianlianTear = await req('/api/gift/lianlian-gift/open', { method: 'POST', headers: authA })
  check('the second box tears on its own', lianlianTear.json?.justOpened === true)
  check('the second box has its own anchor',
    lianlianTear.json?.state?.anchorDate === shanghaiDateKey())
  const linglingStill = await req('/api/gift/lingling-gift', { headers: { Authorization: 'Bearer ' + tokenA } })
  check('the second box does not touch the first',
    linglingStill.json?.state?.anchorDate === null)

  const giftBefore = await req('/api/gift/lingling-gift', { headers: { Authorization: 'Bearer ' + tokenA } })
  check('gift state -> 200', giftBefore.status === 200)
  check('the state says which box it is', giftBefore.json?.state?.giftId === 'lingling-gift')
  check('an unopened box has no anchor date', giftBefore.json?.state?.anchorDate === null)
  check('an unopened box has no cycle', giftBefore.json?.state?.cycleStart === null)
  check('an unopened box has torn nothing',
    giftBefore.json?.state?.elapsedDays === 0 && giftBefore.json?.state?.cycleDays === 0)
  check('an unopened box has torn no paper', giftBefore.json?.state?.progress === 0)
  check('the state says when the gift is due',
    giftBefore.json?.state?.targetDate === giftTargetKey(),
    'got ' + giftBefore.json?.state?.targetDate)
  check('the server counts days in Asia/Shanghai',
    giftBefore.json?.state?.today === shanghaiDateKey(),
    'got ' + giftBefore.json?.state?.today)

  const firstTear = await req('/api/gift/lingling-gift/open', { method: 'POST', headers: authA })
  check('the first tear of the day -> 200', firstTear.status === 200)
  check('the first tear says it tore', firstTear.json?.justOpened === true)
  check('the first tear anchors the box to today',
    firstTear.json?.state?.anchorDate === shanghaiDateKey())
  check('the first tear starts the cycle today',
    firstTear.json?.state?.cycleStart === shanghaiDateKey())
  check('the first tear has torn nothing yet',
    firstTear.json?.state?.elapsedDays === 0)
  check('the first tear takes the first piece of paper off',
    firstTear.json?.state?.progress === 0,
    'got ' + firstTear.json?.state?.progress)
  check('the cycle runs to the gift date',
    firstTear.json?.state?.cycleDays ===
      daysBetweenKeys(shanghaiDateKey(), giftTargetKey()),
    'got ' + firstTear.json?.state?.cycleDays)

  const secondTear = await req('/api/gift/lingling-gift/open', { method: 'POST', headers: authA })
  check('a second tear the same day is not a new tear', secondTear.json?.justOpened === false)
  check('a second tear does not peel any more',
    secondTear.json?.state?.elapsedDays === 0)

  const otherView = await req('/api/gift/lingling-gift', { headers: { Authorization: 'Bearer ' + tokenB } })
  check('the other person sees the same box',
    otherView.json?.state?.cycleStart === shanghaiDateKey())
  check('the other person sees the same anchor',
    otherView.json?.state?.anchorDate === shanghaiDateKey())
  const otherTear = await req('/api/gift/lingling-gift/open', { method: 'POST', headers: authB })
  check('the other person cannot peel a second layer on the same day',
    otherTear.json?.justOpened === false && otherTear.json?.state?.elapsedDays === 0)

  // Missing a few days must not lose progress, so the box is moved back four
  // days and today's tear is taken away again.
  const db = new Database(join(ROOT, '.smoke-data/posts.db'))
  db.prepare('UPDATE gift_progress SET anchor_date = ? WHERE gift_id = ?')
    .run(shanghaiDateKey(4), 'lingling-gift')
  db.prepare('DELETE FROM gift_opens WHERE open_date = ?').run(shanghaiDateKey())
  db.close()

  // The cycle starts on the later of the anchor and the day after the last
  // gift date, so the box is never torn further back than it was.
  const caughtUpStart = laterKey(shanghaiDateKey(4), cycleStartKey())
  /** How much of the paper should be off, this many days into the cycle. */
  const caughtUpProgress = (extra = 0) => {
    const elapsed = daysBetweenKeys(caughtUpStart, shanghaiDateKey())
    const cycle = daysBetweenKeys(caughtUpStart, giftTargetKey())
    return (Math.min(elapsed + extra, cycle) - 1) / (cycle - 1)
  }
  const caughtUp = await req('/api/gift/lingling-gift', { headers: { Authorization: 'Bearer ' + tokenA } })
  check('four missed days are made up for',
    caughtUp.json?.state?.elapsedDays === daysBetweenKeys(caughtUpStart, shanghaiDateKey()),
    'got ' + caughtUp.json?.state?.elapsedDays)
  check('the cycle starts where it should',
    caughtUp.json?.state?.cycleStart === caughtUpStart,
    'got ' + caughtUp.json?.state?.cycleStart)
  check('today still counts as not torn yet', caughtUp.json?.state?.openedToday === false)
  check('the paper is torn as far as the missed days say',
    caughtUp.json?.state?.progress === caughtUpProgress(),
    'got ' + caughtUp.json?.state?.progress)

  const catchUpTear = await req('/api/gift/lingling-gift/open', { method: 'POST', headers: authA })
  check('tearing after a gap catches up with today',
    catchUpTear.json?.state?.openedToday === true &&
      catchUpTear.json?.state?.elapsedDays === daysBetweenKeys(caughtUpStart, shanghaiDateKey()),
    'got ' + catchUpTear.json?.state?.elapsedDays)
  check("today's tear takes the paper a little further",
    catchUpTear.json?.state?.progress === caughtUpProgress(1),
    'got ' + catchUpTear.json?.state?.progress)

  // Once the gift date has passed the wrapping starts again, so the box counts
  // down to the next year's gift instead of snapping back to half-torn.
  const db2 = new Database(join(ROOT, '.smoke-data/posts.db'))
  db2.prepare('UPDATE gift_progress SET anchor_date = ? WHERE gift_id = ?')
    .run(shanghaiDateKey(400), 'lingling-gift')
  db2.close()

  const newCycle = await req('/api/gift/lingling-gift', { headers: { Authorization: 'Bearer ' + tokenA } })
  check('a new cycle starts the day after the last gift date',
    newCycle.json?.state?.cycleStart === cycleStartKey(),
    'got ' + newCycle.json?.state?.cycleStart)
  check('the new cycle counts towards the next gift',
    newCycle.json?.state?.targetDate === giftTargetKey(),
    'got ' + newCycle.json?.state?.targetDate)
  check('the new cycle has not been torn yet',
    newCycle.json?.state?.elapsedDays === daysBetweenKeys(cycleStartKey(), shanghaiDateKey()),
    'got ' + newCycle.json?.state?.elapsedDays)
  check('the new cycle is shorter than the days that are left',
    newCycle.json?.state?.elapsedDays < newCycle.json?.state?.cycleDays)

  // A date that cannot be read must not make the box look unwrapped: the box
  // is treated as one that has never been opened, and opening it again puts
  // the anchor back where it belongs.
  const db3 = new Database(join(ROOT, '.smoke-data/posts.db'))
  db3.prepare('UPDATE gift_progress SET anchor_date = ? WHERE gift_id = ?')
    .run('not-a-date', 'lingling-gift')
  db3.close()

  const broken = await req('/api/gift/lingling-gift', { headers: { Authorization: 'Bearer ' + tokenA } })
  check('a broken anchor is a box that was never opened',
    broken.json?.state?.anchorDate === null && broken.json?.state?.cycleStart === null,
    'got ' + broken.json?.state?.anchorDate)
  check('a broken anchor leaves the paper untouched',
    broken.json?.state?.progress === 0,
    'got ' + broken.json?.state?.progress)

  const repaired = await req('/api/gift/lingling-gift/open', { method: 'POST', headers: authA })
  check('opening the box puts the anchor back',
    repaired.json?.state?.anchorDate === shanghaiDateKey(),
    'got ' + repaired.json?.state?.anchorDate)

  // An anchor that has not happened yet is just as broken as one that cannot
  // be read: it would put the whole cycle in the future and undo every tear of
  // the day, so the box is treated as one that has never been opened.
  const db4 = new Database(join(ROOT, '.smoke-data/posts.db'))
  db4.prepare('UPDATE gift_progress SET anchor_date = ? WHERE gift_id = ?')
    .run('2099-01-01', 'lingling-gift')
  db4.close()

  const future = await req('/api/gift/lingling-gift', { headers: { Authorization: 'Bearer ' + tokenA } })
  check('an anchor in the future is a box that has never been opened',
    future.json?.state?.anchorDate === null && future.json?.state?.cycleStart === null,
    'got ' + future.json?.state?.anchorDate)
  check('an anchor in the future leaves the paper untouched',
    future.json?.state?.progress === 0,
    'got ' + future.json?.state?.progress)

  const futureRepaired = await req('/api/gift/lingling-gift/open', { method: 'POST', headers: authA })
  check('opening the box puts a future anchor back',
    futureRepaired.json?.state?.anchorDate === shanghaiDateKey(),
    'got ' + futureRepaired.json?.state?.anchorDate)
  const futureAgain = await req('/api/gift/lingling-gift/open', { method: 'POST', headers: authA })
  check('a future anchor does not tear the paper again and again',
    futureAgain.json?.justOpened === false,
    'got ' + futureAgain.json?.justOpened)

  // A cycle of a single day still has to be finished on the day of the gift:
  // the whole of the paper comes off then, however short the cycle was.
  process.env.DATA_DIR = join(ROOT, '.smoke-data')
  process.env.UPLOADS_DIR = join(ROOT, '.smoke-uploads')
  const giftModule = await import('../dist/server/gift.js')
  const db5 = new Database(join(ROOT, '.smoke-data/posts.db'))
  db5.prepare('UPDATE gift_progress SET anchor_date = ? WHERE gift_id = ?')
    .run('2026-01-10', 'lingling-gift')
  db5.close()

  const oneDay = giftModule.getGiftState('lingling-gift', new Date('2026-01-11T04:00:00Z'))
  check('a cycle of one day is one day long', oneDay.cycleDays === 1, 'got ' + oneDay.cycleDays)
  check('a cycle of one day is finished on the day of the gift',
    oneDay.progress === 1, 'got ' + oneDay.progress)

  section('date maths')
  const serverDates = await import('../dist/server/dates.js')
  check('the server date matches Asia/Shanghai', serverDates.todayKey(new Date()) === shanghaiDateKey())
  check('a day is a day', serverDates.daysBetweenKeys('2026-01-11', '2026-01-12') === 1)
  check('a month is not a month', serverDates.daysBetweenKeys('2026-01-11', '2026-02-11') === 31)
  check('a leap day counts', serverDates.daysBetweenKeys('2028-02-28', '2028-03-01') === 2)
  check('the count can go backwards', serverDates.daysBetweenKeys('2026-01-12', '2026-01-11') === -1)
  check('a broken date counts as no days at all',
    serverDates.daysBetweenKeys('not-a-date', '2026-01-11') === 0)
  check('a day can be added to a date',
    serverDates.addDays({ year: 2026, month: 1, day: 11 }, 1).day === 12)
  check('the last day of a month is handled',
    serverDates.addDays({ year: 2026, month: 1, day: 31 }, 1).month === 2)
  check('a date that does not exist is not a date',
    serverDates.parseDateKey('2026-02-31') === null)
  check('a leap day is a date', serverDates.parseDateKey('2028-02-29') !== null)
  check('a leap day is not a date in an ordinary year',
    serverDates.parseDateKey('2026-02-29') === null)

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
