import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answerMarkdown } from '../src/shared/answer-format.ts'
import { paperPrompt, readingQuestions, summaryPrompt } from '../src/shared/paper-harness.ts'
import { selectionPopup } from '../src/shared/selection-layout.ts'

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
