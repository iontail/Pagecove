import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answerMarkdown } from '../src/shared/answer-format.ts'
import { paperPrompt, readingQuestions, summaryPrompt } from '../src/shared/paper-harness.ts'
import { selectionPopup } from '../src/shared/selection-layout.ts'
import pageCitations from '../src/shared/page-citations.ts'

test('answer sources collapse once, preserving claims, pages, math and code', () => {
  const math = { type: 'inlineMath', value: 'x_{[p. 8]}' }
  const code = { type: 'inlineCode', value: '[p. 9]' }
  const link = { type: 'link', url: 'https://example.com', children: [{ type: 'text', value: '[p. 10]' }] }
  const paragraph = { type: 'paragraph', children: [{ type: 'text', value: '첫 설명. [p. 3] ' }, math, { type: 'text', value: '다음 설명. [p. 3] [p. 4–5] [p. 7] ' }, code, link] }
  const other = { type: 'paragraph', children: [{ type: 'text', value: '다른 주장. [p. 3]' }] }
  const heading = { type: 'heading', depth: 3, children: [{ type: 'text', value: '결과 [p. 6]' }] }
  const cell = { type: 'tableCell', children: [{ type: 'text', value: '수치 [p. 7]' }] }
  const tree = { type: 'root', children: [paragraph, other, heading, { type: 'table', children: [{ type: 'tableRow', children: [cell] }] }] }
  pageCitations()(tree)
  const details = tree.children.at(-1)
  assert.equal(details.data.hName, 'details')
  assert.deepEqual(details.data.hProperties.className, ['answer-sources'])
  assert.equal(details.data.hProperties.open, undefined)
  assert.equal(details.children[0].data.hName, 'summary')
  assert.equal(details.children[0].children[0].value, '근거 보기')
  assert.match(details.children[1].children[0].value, /첫 설명/)
  assert.deepEqual(details.children[1].children.filter((child) => child.type === 'link').map((child) => [child.url, child.children[0].value]), [['#paperglim-page-3-5', 'p. 3–5'], ['#paperglim-page-7-7', 'p. 7']])
  assert.equal(details.children[2].children[1].url, '#paperglim-page-3-3')
  assert.equal(heading.children[0].value, '결과')
  assert.equal(cell.children[0].value, '수치')
  assert.equal(details.children.length, 5)
  assert.equal(paragraph.children[1], math)
  assert.ok(paragraph.children.includes(code) && paragraph.children.includes(link))
  assert.ok(!paragraph.children.filter((child) => child.type === 'text').some((child) => child.value.includes('[p.')))
  const invalid = { type: 'paragraph', children: [{ type: 'text', value: '원문 표기 [p. 5–2]' }] }
  pageCitations()({ type: 'root', children: [invalid] })
  assert.equal(invalid.children[0].value, '원문 표기 [p. 5–2]')
})

test('reading presets route distinct tasks while retaining source and citation safeguards', () => {
  const source = '[p. 1]\nSource text.\n[p. 3]\nMore source.'
  const prompts = readingQuestions.map(({ id, label }) => paperPrompt(source, label, [], null, id))
  assert.equal(new Set(prompts).size, 3)
  for (const prompt of prompts) {
    assert.ok(prompt.includes(`<paper>\n${source}\n</paper>`))
    assert.match(prompt, /수치·실험·인과관계는 만들지 마/)
    assert.match(prompt, /HTML, 외부 이미지/)
    assert.match(prompt, /문장 속 짧은 식에 \$\.\.\.\$/)
  }
  assert.match(prompts[0], /기존 연구·배경/)
  assert.match(prompts[1], /입력 → 핵심 처리 → 출력/)
  assert.match(prompts[2], /저자가 명시한 한계와 답변자의 해석/)
  assert.match(paperPrompt(source, '왜?', [], { page: 3, text: 'Selected text.' }), /응답 과제: selection/)
  assert.match(summaryPrompt(source), /응답 과제: summary/)
  assert.doesNotMatch(summaryPrompt(source), /출력은 읽기 쉬운 Markdown/)
})

test('math delimiters normalize without rewriting code, existing math or unmatched source', () => {
  const text = String.raw`문장 속 \(y=F(x)+x\)와 $x_i$.
\[\begin{aligned}a&=b\\c&=d\end{aligned}\]
코드 \`\(literal\)\`.
\(unclosed`
  const result = answerMarkdown(text.replaceAll('\\`', '`'))
  assert.ok(result.includes('$y=F(x)+x$'))
  assert.ok(result.includes('$x_i$'))
  assert.ok(result.includes('$$\n\\begin{aligned}a&=b\\\\c&=d\\end{aligned}\n$$'))
  assert.ok(result.includes('`\\(literal\\)`'))
  assert.ok(result.includes('\\(unclosed'))
  assert.equal(answerMarkdown('```latex\n\\(x_i\\)\n```'), '```latex\n\\(x_i\\)\n```')
})

const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height })
test('selection popup stays in the reader and disappears when its text scrolls out', () => {
  const reader = box(200, 140, 600, 500), viewport = { width: 1100, height: 700 }
  const source = box(230, 160, 540, 900), marks = [{ x: .1, y: .3, width: .4, height: .02 }]
  const position = selectionPopup(source, reader, marks, 180, 440, viewport)
  assert.ok(position.left >= reader.left && position.left + position.width <= reader.right)
  assert.ok(position.top >= reader.top && position.top + 180 <= reader.bottom)
  assert.ok(position.top + 180 < source.top + .3 * source.height)
  assert.equal(selectionPopup(box(230, -1200, 540, 900), reader, marks, 180, 440, viewport), null)
  const narrow = selectionPopup(source, box(200, 140, 260, 500), marks, 800, 440, viewport)
  assert.equal(narrow.width, 236)
  assert.equal(narrow.maxHeight, 274)
  assert.equal(narrow.top, 148)
  assert.ok(narrow.top + narrow.maxHeight < source.top + .3 * source.height, 'Keep the selected sentence visible when an answer can scroll above it')
})
