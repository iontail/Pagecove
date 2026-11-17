import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studyPrompt, studyMarkdown } from '../src/shared/study-harness.ts'
import { figureRect, keyboardFigureRect } from '../src/renderer/src/lib/figure-selection.ts'

const anchor = { id: 'n', page: 3, text: 'y = F(x) + x', ranges: [], rects: [{ x: .1, y: .2, width: .3, height: .2 }] }
test('study tasks enforce distinct evidence rules, bounded output, exact page context and isolated history', () => {
  const history = [{ role: 'user', text: '이전 질문' }]
  const concept = studyPrompt('[p. 3] 논문 본문', '개념 설명', history, anchor, 'concept', '압축되지 않은 식과 기호')
  assert.match(concept, /학습 과제: concept/)
  assert.match(concept, /차원은 원문에서 확인되는 것만/)
  assert.match(concept, /이해를 위한 예시/)
  assert.match(concept, /깨진 수식을 복원하지 마/)
  assert.match(concept, /JSON 객체만/)
  assert.match(concept, /압축되지 않은 식과 기호/)
  assert.match(concept, /이전 질문/)
  const figure = studyPrompt('논문 본문', '그림 설명', [], { ...anchor, kind: 'figure' }, 'figure', '캡션')
  assert.match(figure, /첨부된 선택 이미지 범위만 직접 볼 수 있어/)
  assert.doesNotMatch(figure, /추출된 텍스트만 있으므로 그림 자체를 보았다고 말하지 마/)
  assert.match(figure, /읽을 수 없는 숫자는 추측하지 마/)
  assert.match(figure, /저자의 주장과 눈으로 관찰한 사실을 구분/)
  assert.doesNotMatch(figure, /이전 질문/)
  assert.throws(() => studyPrompt('a'.repeat(99000), 'q', [], anchor, 'concept', 'p'.repeat(16000)), /너무 길어/)
})

test('study answers use app-owned headings, retain math and citations, omit irrelevant sections and reject malformed responses', () => {
  const value = { overview: '직접 답변 [p. 3]', details: '기호 $x_i$', reasoning: '$$\ny=F(x)+x\n$$', connection: '', limits: '확인할 수 없는 조건' }
  const markdown = studyMarkdown(JSON.stringify(value), 'concept')
  assert.ok(markdown.startsWith('직접 답변 [p. 3]'))
  assert.match(markdown, /### 개념과 기호/)
  assert.ok(markdown.includes('$$\ny=F(x)+x\n$$'))
  assert.doesNotMatch(markdown, /작은 예시/)
  assert.match(studyMarkdown('```json\n' + JSON.stringify(value) + '\n```', 'figure'), /축·범례·비교 조건/)
  for (const bad of ['주절주절', 'null', '[]', JSON.stringify({ ...value, limits: '' }), JSON.stringify({ ...value, overview: 3 }), JSON.stringify({ ...value, reasoning: null })]) assert.throws(() => studyMarkdown(bad, 'concept'), /형식|누락/)
})

test('image rectangles support reverse drags and clip selection to the PDF page', () => {
  assert.deepEqual(figureRect({ x: .8, y: .9 }, { x: .2, y: .3 }), { x: .2, y: .3, width: .8 - .2, height: .9 - .3 })
  assert.deepEqual(figureRect({ x: -.1, y: .2 }, { x: 1.1, y: 2 }), { x: 0, y: .2, width: 1, height: .8 })
})
test('keyboard crops move and resize without escaping the page or collapsing', () => {
  const rect = { x: .25, y: .3, width: .5, height: .3 }
  assert.deepEqual(keyboardFigureRect(rect, 'ArrowRight', false), { ...rect, x: .26 })
  assert.deepEqual(keyboardFigureRect(rect, 'ArrowUp', true), { ...rect, height: .29 })
  assert.equal(keyboardFigureRect({ ...rect, x: 0 }, 'ArrowLeft', false).x, 0)
  assert.equal(keyboardFigureRect({ ...rect, width: .75 }, 'ArrowRight', true).width, .75)
  assert.equal(keyboardFigureRect({ ...rect, height: .03 }, 'ArrowUp', true).height, .03)
})
