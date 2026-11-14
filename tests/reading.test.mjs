import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectionRows, inCollection } from '../src/shared/collections.ts'
import { textBlocks, sentenceBlocks, sourceMarkup, translationPrompt, parseTranslation, questionPrompt, protectedTerms } from '../src/shared/reading.ts'

test('nested collections retain paths and include descendants without duplicating papers', () => {
  const collections = [{ key: 'root', name: 'Research', parentKey: null }, { key: 'child', name: 'Vision', parentKey: 'root' }, { key: 'leaf', name: 'ResNet', parentKey: 'child' }]
  assert.equal(collectionRows(collections)[2].path, 'Research / Vision / ResNet')
  assert.equal(collectionRows(collections)[2].depth, 2)
  assert.equal(inCollection(['leaf', 'root'], 'root', collections), true)
  assert.equal(inCollection(['root'], 'leaf', collections), false)
  assert.equal(inCollection([], '', collections), true)
  const cycle = [{ key: 'a', name: 'A', parentKey: 'b' }, { key: 'b', name: 'B', parentKey: 'a' }]
  assert.equal(inCollection(['a'], 'absent', cycle), false)
  assert.equal(collectionRows(cycle).length, 2)
})

test('PDF paragraph extraction keeps exact source indexes across lines and columns', () => {
  const item = (str, x, y, width = 100) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL: true })
  const blocks = textBlocks([item('Residual learning', 10, 700), { type: 'beginMarkedContent' }, item('improves networks.', 10, 688), item('Second column', 310, 700), item('continues here.', 310, 688), item('New paragraph.', 310, 650)])
  assert.equal(blocks.length, 3)
  assert.equal(blocks[0].text, 'Residual learning improves networks.')
  assert.deepEqual(blocks[0].itemIndexes, [0, 2])
  assert.deepEqual(blocks[1].itemIndexes, [3, 4])
  assert.equal(sourceMarkup('<img src=x onerror="evil()">&', 3), '<span data-text-index="3">&lt;img src=x onerror=&quot;evil()&quot;&gt;&amp;</span>')
})

test('translation parser rejects missing or fabricated anchors and restores source ordering', () => {
  const blocks = [{ id: 'b1', text: 'First', itemIndexes: [0] }, { id: 'b2', text: 'Second', itemIndexes: [1] }]
  assert.match(translationPrompt(blocks), /b1/)
  const parsed = parseTranslation('```json\n[{"id":"b2s1","text":"두 번째"},{"id":"b1s1","text":"첫 번째"}]\n```', blocks)
  assert.equal(parsed[0].text, '첫 번째')
  assert.deepEqual(parsed[1].source.itemIndexes, [1])
  for (const answer of ['bad', '[{"id":"b1s1","text":"하나"}]', '[{"id":"b1s1","text":"하나"},{"id":"b1s1","text":"둘"}]', '[{"id":"b1s1","text":"하나"},{"id":"fake","text":"둘"}]']) assert.throws(() => parseTranslation(answer, blocks))
  assert.throws(() => translationPrompt([]), /스캔 PDF/)
})

test('sentences map exact character ranges while translated sentences remain in one paragraph', () => {
  const str = 'First sentence. Second sentence.'
  const blocks = textBlocks([{ str, transform: [10, 0, 0, 10, 10, 700], width: 100, height: 10, hasEOL: true }])
  const [{ sentences }] = sentenceBlocks(blocks)
  assert.equal(sentences.length, 2)
  assert.deepEqual(sentences[0].ranges, [{ itemIndex: 0, start: 0, end: str.indexOf(' Second') }])
  assert.deepEqual(sentences[1].ranges, [{ itemIndex: 0, start: str.indexOf('Second'), end: str.length }])
  const translated = parseTranslation('[{"id":"b1s2","text":"두 번째 문장."},{"id":"b1s1","text":"첫 번째 문장."}]', blocks)
  assert.equal(translated.length, 1)
  assert.equal(translated[0].sentences.length, 2)
  assert.equal(translated[0].text, '첫 번째 문장. 두 번째 문장.')
})

test('sentence ranges survive line joins, hyphenation, and scientific abbreviations', () => {
  const texts = ['A resid-', 'ual method works. Another result.']
  const blocks = textBlocks(texts.map((str, index) => ({ str, transform: [10, 0, 0, 10, 10, 700 - index * 12], width: 100, height: 10, hasEOL: true })))
  const [{ sentences }] = sentenceBlocks(blocks)
  assert.equal(sentences[0].text, 'A residual method works.')
  assert.equal(sentences[0].ranges.map((range) => texts[range.itemIndex].slice(range.start, range.end)).join(''), 'A residual method works.')
  assert.deepEqual(sentences[1].ranges, [{ itemIndex: 1, start: texts[1].indexOf('Another'), end: texts[1].length }])
  const scientific = sentenceBlocks([{ id: 'b1', text: 'See Fig. 1 for results. Accuracy is 92.5%.', itemIndexes: [0] }])
  assert.equal(scientific[0].sentences.length, 2)
  assert.equal(scientific[0].sentences[0].text, 'See Fig. 1 for results.')
})

test('indented paragraph starts remain separate without breaking their following lines', () => {
  const blocks = textBlocks(['First paragraph.', 'Second paragraph', 'continues here.'].map((str, index) => ({ str, transform: [10, 0, 0, 10, index === 1 ? 20 : 10, 700 - index * 12], width: 100, height: 10, hasEOL: true })))
  assert.equal(blocks.length, 2)
  assert.equal(blocks[1].text, 'Second paragraph continues here.')
})

test('questions carry only the new question and explicitly attached PDF text', () => {
  const context = { paperId: 'paper', page: 3, blocks: [{ id: 'b1', text: 'Current page source.', itemIndexes: [0] }] }
  const first = questionPrompt('FIRST_QUESTION', context, null)
  assert.match(first, /Current page source/)
  const second = questionPrompt('SECOND_QUESTION', context, { page: 2, text: 'Explicit selection.' })
  assert.doesNotMatch(second, /FIRST_QUESTION/)
  assert.match(second, /SECOND_QUESTION/)
  assert.match(second, /Explicit selection/)
  assert.doesNotMatch(questionPrompt('Question only', null, null), /Current page source|Explicit selection/)
})

test('translation preserves key English terms, names, and acronyms', () => {
  const source = 'ResNet uses residual learning on ImageNet.'
  const terms = protectedTerms(source)
  for (const term of ['ResNet', 'residual learning', 'ImageNet']) assert.ok(terms.includes(term))
  const blocks = [{ id: 'b1', text: source, itemIndexes: [0] }]
  assert.match(translationPrompt(blocks), /영어.*유지/)
  const good = 'ResNet은 ImageNet에서 residual learning을 사용한다.'
  assert.equal(parseTranslation(JSON.stringify([{ id: 'b1s1', text: good }]), blocks)[0].text, good)
  assert.throws(() => parseTranslation(JSON.stringify([{ id: 'b1s1', text: 'ResNet은 ImageNet에서 잔차 학습을 사용한다.' }]), blocks), /영어 용어/)
})
