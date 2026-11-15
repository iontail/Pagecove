import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { searchPages } from '../src/shared/pdf-search.ts'
import { AIRequests } from '../src/main/ai-requests.ts'
import { TranslationCacheStore } from '../src/main/translation-cache.ts'
import { TranslationSession } from '../src/renderer/src/lib/translation-session.ts'

const page = { paperId: 'paper', page: 2, blocks: [{ id: 'b1', text: 'Residual learning uses 3.57%. Residual learning helps.', itemIndexes: [4, 5], spans: [{ itemIndex: 4, start: 0, end: 29 }, { itemIndex: 5, start: 30, end: 53 }] }] }
test('PDF find keeps literal punctuation and maps case-insensitive matches to exact source characters', () => {
  const matches = searchPages([page], 'residual learning')
  assert.equal(matches.length, 2)
  assert.equal(matches[0].page, 2)
  assert.deepEqual(matches[0].location.ranges, [{ itemIndex: 4, start: 0, end: 17 }])
  assert.deepEqual(matches[1].location.ranges, [{ itemIndex: 5, start: 0, end: 17 }])
  assert.equal(searchPages([page], '3.57%').length, 1)
  assert.equal(searchPages([page], '3x57%').length, 0)
  assert.equal(searchPages([page], '[.*]').length, 0)
  assert.equal(searchPages([page], '   ').length, 0)
  assert.equal(searchPages([page], 'Residual   learning').length, 2)
})

test('AI cancellation is scoped to the request and owning window', async () => {
  const requests = new AIRequests()
  const pending = (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }))
  const first = requests.run(1, 'first', pending)
  const second = requests.run(2, 'first', pending)
  await assert.rejects(requests.run(1, 'first', pending), /이미/)
  await assert.rejects(requests.run(1, '../bad', pending), /ID/)
  requests.cancel(3, 'first')
  requests.cancel(1, 'first')
  await assert.rejects(first, /cancelled/)
  requests.cancelOwner(2)
  await assert.rejects(second, /cancelled/)
  assert.equal(await requests.run(1, 'first', async () => 'new request'), 'new request')
})

const translated = { source: { id: 'b1', text: 'A short paragraph.', itemIndexes: [0] }, text: '짧은 문단.', sentences: [{ source: { id: 'b1s1', text: 'A short paragraph.', itemIndexes: [0], ranges: [{ itemIndex: 0, start: 0, end: 18 }] }, text: '짧은 문단.' }] }
const cache = { version: 1, fingerprint: 'sha256-content', entries: [{ page: 1, included: [], results: [translated], selected: true }], visible: [1] }
test('translation cache is atomic, validates records, and refuses a changed PDF identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-cache-'))
  try {
    const store = new TranslationCacheStore(root)
    assert.equal(await store.get('paper', cache.fingerprint), null)
    await Promise.all([store.put('paper', cache), store.put('paper', { ...cache, visible: [] })])
    assert.deepEqual(await store.get('paper', cache.fingerprint), { ...cache, visible: [] })
    assert.equal(await store.get('paper', 'changed-content'), null)
    assert.throws(() => store.put('paper', { ...cache, entries: [{ page: -1 }] }), /형식/)
    assert.throws(() => store.put('paper', { ...cache, entries: [{ ...cache.entries[0], results: [{ ...translated, sentences: [{ text: 'corrupt' }] }] }] }), /형식/)
    assert.deepEqual(await store.get('paper', cache.fingerprint), { ...cache, visible: [] })
    assert.equal((await readFile(join(root, 'paper.json'), 'utf8')).includes('chat'), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

const paper = { pageCount: 2, page: async (number) => ({ paperId: 'paper', page: number, blocks: [{ id: 'b1', text: 'A short paragraph.', itemIndexes: [0] }] }) }
const echo = async (prompt) => JSON.stringify(JSON.parse(prompt.split('\n').at(-1)).flatMap((block) => block.sentences.map(({ id, text }) => ({ id, text }))))
test('restored translations reopen without AI, support alternate scopes, and can be cleared durably', async () => {
  let saved = structuredClone({ ...cache, entries: [{ ...cache.entries[0], included: ['b2'] }] })
  let calls = 0
  const persistence = { fingerprint: cache.fingerprint, load: async () => structuredClone(saved), save: async (value) => { saved = structuredClone(value) } }
  const factory = () => ({ ask: async (prompt) => { calls++; return echo(prompt) }, cancel: async () => {} })
  const restored = new TranslationSession(paper, factory, persistence)
  await restored.restored
  assert.equal(restored.visible.has(1), true)
  assert.deepEqual(restored.scope(1), ['b2'])
  await restored.translate(await paper.page(1), ['b2'])
  assert.equal(calls, 0)
  await restored.close(1)
  const restart = new TranslationSession(paper, factory, persistence)
  await restart.restored
  assert.equal(restart.visible.has(1), false)
  assert.equal(restart.read(1, ['b2']).results[0].text, '짧은 문단.')
  await restart.clearPage(1)
  assert.equal(saved.entries.length, 0)
  const empty = new TranslationSession(paper, factory, persistence)
  await empty.restored
  assert.equal(empty.read(1), undefined)
  await empty.translate(await paper.page(1))
  assert.equal(calls, 1)
})

test('stopping translation cancels the active request and leaves completed pages intact', async () => {
  let release, cancelled = 0, calls = 0
  const store = new TranslationSession(paper, () => ({
    ask: async (prompt) => { calls++; if (calls === 1) return echo(prompt); return new Promise((_, reject) => { release = () => reject(Error('stopped')) }) },
    cancel: async () => { cancelled++; release() }
  }))
  await store.translate(await paper.page(1))
  const all = store.translateAll()
  while (!release) await new Promise((done) => setTimeout(done, 1))
  await store.stop(); await all
  assert.equal(cancelled, 1)
  assert.equal(store.read(1).status, 'done')
  assert.equal(store.read(2).status, 'cancelled')
  assert.equal(store.all.completed, 1)
  assert.equal(store.all.cancelled, true)
})

test('storage failures keep the visible translation and expose recovery without another AI call', async () => {
  let fail = true, calls = 0
  const store = new TranslationSession(paper, () => ({ ask: async (prompt) => { calls++; return echo(prompt) }, cancel: async () => {} }), { fingerprint: 'f', load: async () => null, save: async () => { if (fail) throw Error('disk full') } })
  await store.translate(await paper.page(1))
  assert.equal(store.read(1).status, 'done')
  assert.match(store.storageError, /저장/)
  fail = false
  await store.save()
  assert.equal(store.storageError, '')
  assert.equal(calls, 1)
})

test('a failed cache deletion keeps the translation available and reports the failure', async () => {
  const store = new TranslationSession(paper, () => ({ ask: echo, cancel: async () => {} }), { fingerprint: cache.fingerprint, load: async () => structuredClone(cache), save: async () => { throw Error('disk unavailable') } })
  await store.restored
  await assert.rejects(store.clearPage(1), /지우지 못했어/)
  assert.equal(store.read(1).results[0].text, '짧은 문단.')
})
