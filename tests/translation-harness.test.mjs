import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { graphicRegions } from '../src/shared/pdf-regions.ts'
import { planTranslation, selectedBlocks, runTranslation } from '../src/shared/translation-harness.ts'
import { parseTranslation } from '../src/shared/reading.ts'

test('real ResNet charts are excluded while body, inline markers, and captions retain their source indexes', async () => {
  const task = getDocument({ data: new Uint8Array(await readFile(new URL('../resources/ResNet.pdf', import.meta.url))), useSystemFonts: true })
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    const { items } = await page.getTextContent()
    const graphics = graphicRegions(await page.getOperatorList(), OPS)
    const plan = planTranslation(items, page.view, graphics)
    const excludedIndexes = new Set(plan.excluded.flatMap(({ block }) => block.itemIndexes))
    const includedIndexes = new Set(plan.blocks.flatMap((block) => block.itemIndexes))
    for (const text of ['training error (%)', 'test error (%)', 'iter. (1e4)', '56-layer', '20-layer']) {
      const indexes = items.flatMap((item, index) => item.str === text ? [index] : [])
      assert.ok(indexes.length)
      assert.ok(indexes.every((index) => excludedIndexes.has(index)), text)
    }
    assert.ok(plan.blocks.some((block) => block.kind === 'caption' && block.text.startsWith('Figure 1.')))
    assert.ok(plan.blocks.some((block) => block.text.includes('Deeper neural networks are more difficult')))
    const marker = items.findIndex((item) => item.str === '1' && Math.abs(item.transform[5] - 302.3) < 1)
    assert.ok(includedIndexes.has(marker), 'body superscript marker must stay')
    const axis = plan.excluded.find(({ block }) => block.text === 'training error (%)')
    assert.ok(selectedBlocks(plan, [axis.block.id]).some((block) => block.id === axis.block.id))
    assert.equal([...includedIndexes].some((index) => excludedIndexes.has(index)), false)
    assert.equal(plan.partial, false)
    const connective = items.findIndex((item) => item.str === 'and' && item.transform[5] < 100)
    assert.ok(excludedIndexes.has(connective), 'URL footnote connective must not become an orphan translation')
  } finally { await task.destroy() }
})

test('graphics detection handles transforms, raster figures, vector charts, and whole-page form wrappers', () => {
  const ops = OPS
  const figure = graphicRegions({ fnArray: [ops.save, ops.transform, ops.paintFormXObjectBegin, ops.paintFormXObjectEnd, ops.restore], argsArray: [[], [2, 0, 0, 2, 100, 200], [null, [0, 0, 100, 50]], [], []] }, ops)
  assert.deepEqual(figure.regions[0].box, [100, 200, 300, 300])
  const raster = graphicRegions({ fnArray: [ops.transform, ops.paintImageXObject], argsArray: [[100, 0, 0, 50, 10, 20], ['image']] }, ops)
  assert.deepEqual(raster.regions[0].box, [10, 20, 110, 70])
  const vector = graphicRegions({ fnArray: Array(4).fill(ops.constructPath), argsArray: [[ops.stroke, [], [100, 100, 200, 100]], [ops.stroke, [], [100, 100, 100, 200]], [ops.stroke, [], [100, 110, 200, 150]], [ops.stroke, [], [100, 120, 200, 180]]] }, ops)
  assert.ok(vector.regions.some(({ kind }) => kind === 'drawing'))
  const item = { str: 'Article body must remain even when the PDF page is a Form XObject.', transform: [10, 0, 0, 10, 20, 600], width: 300, height: 10, hasEOL: true }
  const plan = planTranslation([item], [0, 0, 600, 800], { regions: [{ kind: 'figure', box: [0, 0, 600, 800] }], partial: false })
  assert.equal(plan.blocks.length, 1)
})

test('validation rejects numerical changes, lost citations, and fabricated quantitative claims', async () => {
  const blocks = [{ id: 'b1', text: 'Error is -3.57% on 1,000 samples [41].', itemIndexes: [0] }]
  const good = '표본 1,000개에서 오류는 -3.57%다 [41].'
  assert.equal(parseTranslation(JSON.stringify([{ id: 'b1s1', text: good }]), blocks)[0].text, good)
  for (const text of ['표본 1,000개에서 오류는 3.57%다 [41].', '표본 1,000개에서 오류는 -4.57%다 [41].', '표본 1,000개에서 오류는 -3.57%다.', `${good} 성능이 20배 향상됐다.`]) {
    assert.throws(() => parseTranslation(JSON.stringify([{ id: 'b1s1', text }]), blocks), /수치|인용/)
  }
  let calls = 0
  const fallback = await runTranslation(blocks, async (prompt) => {
    calls++
    assert.match(prompt, /그래프.*해석/)
    return JSON.stringify([{ id: 'b1s1', text: '90%로 좋아졌다.' }])
  })
  assert.equal(fallback[0].text, blocks[0].text)
  assert.match(fallback[0].sentences[0].warning, /수치/)
  assert.equal(calls, 1, 'failed validation must not silently issue another paid request')
})
