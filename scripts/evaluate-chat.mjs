import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import katex from 'katex'
import { PaperSession } from '../src/renderer/src/lib/paper-session.ts'
import { askProvider } from '../src/main/providers.ts'
import { paperPrompt, readingQuestions } from '../src/shared/paper-harness.ts'
import { answerMarkdown } from '../src/shared/answer-format.ts'

const model = process.argv[2]
if (!model) throw Error('Runs real AI requests: node scripts/evaluate-chat.mjs <authenticated Codex model>')
const loading = getDocument({ data: new Uint8Array(await readFile('resources/ResNet.pdf')), standardFontDataUrl: `${resolve('node_modules/pdfjs-dist/standard_fonts')}/` })
const pdf = await loading.promise
const session = new PaperSession('resnet-evaluation', OPS)
session.attach(pdf, OPS)
const reference = await session.reference(model, () => { throw Error('ResNet should not require context compression') })
const cases = [...readingQuestions.map(({ id, label }) => ({ id, question: label })),
  { id: 'chat', question: '왜 residual learning이 최적화를 쉽게 하는지 필요한 개념부터 설명하고, 문장 속 수식과 별도 줄 수식을 써서 identity shortcut과 차원이 다를 때의 식을 구분해 줘.' },
  { id: 'chat', question: 'ResNet이 overfitting을 완전히 없앴다는 논문의 결론을 3문장으로 설명해 줘.' }
]
const outputs = []
for (let start = 0; start < cases.length; start += 2) {
  const batch = await Promise.all(cases.slice(start, start + 2).map(async ({ id, question }) => {
    const answer = await askProvider('codex', paperPrompt(reference, question, [], null, id), model, false)
    const markdown = answerMarkdown(answer)
    const math = [...markdown.matchAll(/\$\$([\s\S]*?)\$\$|(?<![\\$])\$(?!\$)([^\n$]+?)\$/g)].map((match) => match[1] ?? match[2])
    const mathErrors = math.flatMap((source) => { try { katex.renderToString(source, { throwOnError: true, trust: false }); return [] } catch (error) { return [error.message] } })
    const pages = [...answer.matchAll(/\[p\.\s*(\d+)/g)].map((match) => Number(match[1]))
    const report = { characters: answer.length, equations: math.length, mathErrors, pages }
    assert.ok(answer.trim(), question)
    assert.deepEqual(mathErrors, [], question)
    assert.ok(pages.every((page) => page >= 1 && page <= pdf.numPages), question)
    console.log(JSON.stringify({ task: id, ...report }))
    return { task: id, question, answer, report }
  }))
  outputs.push(...batch)
}
await mkdir('artifacts', { recursive: true })
await writeFile('artifacts/chat-evaluation.json', JSON.stringify({ model, pageCount: pdf.numPages, outputs }, null, 2))
await loading.destroy()
console.log('Saved artifacts/chat-evaluation.json for factual and readability review')
