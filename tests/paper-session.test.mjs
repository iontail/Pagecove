import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PaperSession } from '../src/renderer/src/lib/paper-session.ts'
import { paperPrompt, parseSummary, summaryPrompt } from '../src/shared/paper-harness.ts'
import { protectedSentence, parseTranslation } from '../src/shared/reading.ts'
import { TranslationSession } from '../src/renderer/src/lib/translation-session.ts'

function fakePdf(count, text = 'This is the paper page.') {
  const reads = []
  return { reads, pdf: { numPages: count, fingerprints: ['fixture'], getPage: async (page) => ({ view: [0, 0, 600, 800], getTextContent: async () => { reads.push(page); return { items: [{ str: `${text} Page ${page}.`, transform: [10, 0, 0, 10, 50, 600], width: 400, height: 10, hasEOL: true }] } }, getOperatorList: async () => ({ fnArray: [], argsArray: [] }) }) } }
}

test('questions, selections and summary share one whole-paper extraction, including concurrent requests', async () => {
  const { pdf, reads } = fakePdf(3)
  const session = new PaperSession('paper', OPS)
  session.attach(pdf, OPS)
  await session.page(1)
  const [first, second] = await Promise.all([session.prepare(), session.prepare()])
  assert.equal(first, second)
  assert.deepEqual(reads, [1, 2, 3])
  const [reference, shared] = await Promise.all([session.reference('model', () => { throw Error('no AI needed for raw text') }), session.reference('model', () => { throw Error('must reuse') })])
  assert.equal(reference, shared)
  assert.match(reference, /\[p\. 3\]/)
  const history = [{ role: 'user', text: 'earlier question' }, { role: 'assistant', text: 'earlier answer' }]
  assert.match(paperPrompt(reference, 'followup', history), /earlier answer/)
  assert.doesNotMatch(paperPrompt(reference, 'new thread'), /earlier answer/)
  assert.match(summaryPrompt(reference), /정확히 3개/)
  assert.deepEqual(reads, [1, 2, 3])
})

test('large paper context is condensed once per model and never silently truncated', async () => {
  const { pdf, reads } = fakePdf(3, 'Long source. '.repeat(2300))
  const session = new PaperSession('long', OPS); session.attach(pdf, OPS)
  let calls = 0
  const ask = async () => { calls++; return 'Evidence [p. 1] [p. 2] [p. 3].' }
  const reference = await session.reference('model', ask)
  assert.match(reference, /전체 3페이지/)
  assert.ok(calls >= 3)
  const previous = calls
  assert.equal(await session.reference('model', ask), reference)
  assert.equal(calls, previous)
  assert.equal(reads.length, 3)
})

test('summary enforces three sentences and all overview sections', () => {
  const valid = { sentences: ['One.', 'Two.', 'Three.'], overview: 'Overview [p. 2]', sections: { question: 'Q', method: 'M', results: 'R', limitations: 'L' } }
  assert.deepEqual(parseSummary(JSON.stringify(valid)), valid)
  assert.throws(() => parseSummary(JSON.stringify({ ...valid, sentences: ['Only one.'] })))
  assert.throws(() => parseSummary(JSON.stringify({ ...valid, sections: {} })))
})

test('protected translation tokens restore numbers and English while isolating a bad sentence', () => {
  const blocks = [{ id: 'b1', text: 'ResNet has 1,000 layers [41]. Error is 3.57%.', itemIndexes: [0] }]
  const shield = protectedSentence('ResNet has 1,000 layers [41].')
  assert.doesNotMatch(shield.text, /ResNet|1,000|41/)
  const result = parseTranslation(JSON.stringify([{ id: 'b1s1', text: shield.text }, { id: 'b1s2', text: 'Error is 90%.' }]), blocks, true)
  assert.equal(result[0].sentences[0].text, 'ResNet has 1,000 layers [41].')
  assert.equal(result[0].sentences[0].warning, undefined)
  assert.equal(result[0].sentences[1].text, 'Error is 3.57%.')
  assert.match(result[0].sentences[1].warning, /수치/)
  assert.equal(parseTranslation('[{"id":"b1s1","text":"100000개다."}]', [{ id: 'b1', text: '100 000 samples.', itemIndexes: [0] }])[0].text, '100000개다.')
})

test('all-page translation queues requests, reuses cached pages and can stop after current page', async () => {
  const paper = { pageCount: 3, page: async (page) => ({ paperId: 'paper', page, blocks: [{ id: 'b1', text: `Page ${page}.`, itemIndexes: [0] }] }) }
  let calls = 0, active = 0, maximum = 0
  const store = new TranslationSession(paper, async (prompt) => {
    calls++; active++; maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active--
    return JSON.stringify(JSON.parse(prompt.split('\n').at(-1)).flatMap((block) => block.sentences.map(({ id, text }) => ({ id, text }))))
  })
  await store.translate(await paper.page(1))
  await store.translateAll()
  assert.equal(calls, 3)
  assert.equal(maximum, 1)
  assert.equal(store.all.completed, 3)
  await store.translateAll(); assert.equal(calls, 3)
  let release
  const stopped = new TranslationSession(paper, (prompt) => new Promise((resolve) => { release = () => resolve(JSON.stringify(JSON.parse(prompt.split('\n').at(-1)).flatMap((block) => block.sentences.map(({ id, text }) => ({ id, text }))))) }))
  const all = stopped.translateAll()
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1))
  stopped.stop(); release(); await all
  assert.equal(stopped.all.completed, 1)
  assert.equal(stopped.visible.has(2), false)
})
