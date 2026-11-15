import assert from 'node:assert/strict'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { _electron } from 'playwright'

const profile = resolve('artifacts', `reading-profile-${Date.now()}`)
await mkdir(profile, { recursive: true })
const secondPdf = resolve(profile, 'second.pdf')
await copyFile('resources/ResNet.pdf', secondPdf)
const env = { ...process.env, PAPERGLIM_BACKGROUND: '1', PAPERGLIM_PROFILE_DIR: profile }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const app = await _electron.launch({ args: [resolve('.')], env })
const errors = []
try {
  const window = await app.firstWindow()
  window.on('pageerror', (error) => errors.push(error.message))
  await window.getByRole('button', { name: 'ResNet 예제 열기' }).waitFor()
  await app.evaluate(({ ipcMain }, files) => {
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = new URL(input)
      if (url.port !== '23119') return original(input, init)
      const headers = { 'Zotero-Server-ID': 'reading-fixture' }
      if (url.pathname.endsWith('/file/view/url')) {
        const key = url.pathname.split('/')[5]
        if (key === 'PDF00003') return new Response('', { status: 404 })
        return new Response(`file://${key === 'PDF00002' ? files.second : files.first}`, { headers })
      }
      return new Response(JSON.stringify(url.pathname.endsWith('/collections') ? [
        { key: 'ROOT0001', data: { name: 'Research', parentCollection: false } },
        { key: 'CHILD001', data: { name: 'Vision', parentCollection: 'ROOT0001' } },
        { key: 'OTHER001', data: { name: 'Other', parentCollection: false } }
      ] : [1, 2, 3].flatMap((number) => [
        { key: `PARENT0${number}`, data: { itemType: 'journalArticle', title: `ResNet ${number}`, collections: [number === 1 ? 'CHILD001' : 'OTHER001'] } },
        { key: `PDF0000${number}`, data: { itemType: 'attachment', parentItem: `PARENT0${number}`, contentType: 'application/pdf', filename: 'ResNet.pdf' } }
      ])), { headers })
    }
    globalThis.testPrompts = []
    globalThis.translationCalls = 0
    ipcMain.removeHandler('ai:ask')
    ipcMain.handle('ai:ask', (_event, provider, prompt) => {
      globalThis.testPrompts.push(prompt)
      if (prompt.includes('JSON 배열')) {
        globalThis.translationCalls++
        const blocks = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1))
        if (blocks.some(({ sentences }) => sentences.some(({ text }) => text === 'training error (%)' || text === 'test error (%)'))) throw Error('Graph label leaked')
        const answer = blocks.flatMap(({ sentences }) => sentences.map(({ id, text }) => ({ id, text: `번역: ${text}` })))
        if (globalThis.badTranslation) answer[0].text += ' 123456789'
        return JSON.stringify(answer)
      }
      if (prompt.includes('형식: {"sentences"')) return JSON.stringify({ sentences: ['핵심 기여다 [p. 1].', '방법을 설명한다 [p. 3].', '결과가 있다 [p. 12].'], overview: '전체 논문의 흐름 [p. 1] [p. 12]', sections: { question: '문제 [p. 1]', method: '방법 [p. 3]', results: '결과 [p. 12]', limitations: '한계 [p. 12]' } })
      if (!prompt.includes('[p. 12]')) throw Error('Whole-paper context missing')
      globalThis.chatCalls = (globalThis.chatCalls ?? 0) + 1
      return `**전체 논문 근거 응답 ${globalThis.chatCalls}** [p. 12]`

    })
  }, { first: resolve('resources/ResNet.pdf'), second: secondPdf })


  await window.locator('button.nav-row').filter({ hasText: 'Zotero' }).click()
  await window.getByText('2개 PDF 사용 가능 · 1개 로컬 파일 확인 필요', { exact: true }).waitFor()
  await window.keyboard.press('Escape')
  assert.equal(await window.locator('.paper-row').count(), 2)
  await window.locator('.paper-select').filter({ hasText: 'ResNet 1' }).click()
  const first = window.locator('[data-reading-page="1"]')
  const second = window.locator('[data-reading-page="2"]')
  await first.locator('canvas').waitFor()
  assert.equal(await window.locator('[data-reading-page]').count(), 12)
  assert.ok(await window.locator('.react-pdf__Page canvas').count() < 12)
  assert.equal(await window.locator('.translation-page-body').count(), 0)
  const number = window.getByRole('textbox', { name: '페이지 번호' })
  await window.locator('.reader-scroll').hover(); await window.mouse.wheel(0, 900)
  await window.waitForFunction(() => document.querySelector('input[aria-label="페이지 번호"]')?.value === '2')
  assert.equal(await app.evaluate(() => globalThis.translationCalls), 0)
  await number.fill('1'); await number.press('Enter')
  await first.getByRole('button', { name: '한글번역', exact: true }).click()
  await first.locator('.translation-sentence').first().waitFor()
  assert.equal(await app.evaluate(() => globalThis.translationCalls), 1)
  assert.equal(await second.locator('.translation-page-wrap').count(), 0)
  const alignment = await second.evaluate((element) => ({ source: element.querySelector('.pdf-page-wrap').getBoundingClientRect().right, button: element.querySelector('.page-translation-actions').getBoundingClientRect().right }))
  assert.ok(Math.abs(alignment.source - alignment.button) < 1)
  const sentence = first.locator('.translation-sentence').nth(5)
  await sentence.hover()
  await first.locator('.source-highlight').first().waitFor()
  assert.equal((await first.locator('.source-highlight').allTextContents()).join('').replace(/[\s-]/g, ''), (await sentence.getAttribute('data-source-text')).replace(/[\s-]/g, ''))
  await window.locator('.reader-document-header').hover()
  await app.evaluate(() => { globalThis.badTranslation = true })
  await first.getByRole('button', { name: '다시 번역' }).click()
  await first.locator('[data-fallback="true"]').waitFor()
  assert.ok(await first.locator('.translation-sentence:not([data-fallback])').count() > 0)
  assert.doesNotMatch(await first.locator('.translation-paragraphs').innerText(), /123456789/)
  await app.evaluate(() => { globalThis.badTranslation = false })

  const selectedText = first.locator('.pdf-page-wrap [data-text-index]').filter({ hasText: 'Deeper neural networks' }).first()
  await selectedText.click({ clickCount: 3 })
  const tools = window.getByRole('toolbar', { name: '선택 영역 도구' })
  await tools.waitFor()
  assert.equal(await window.locator('.assistant-pane').isVisible(), false)
  await tools.getByRole('button', { name: '설명', exact: true }).click()
  let popup = window.getByRole('dialog', { name: '선택 영역 설명' })
  await popup.locator('.selection-message.assistant').waitFor()
  await first.locator('.annotation-mark').first().waitFor()
  assert.ok(await popup.locator('.answer-text strong').first().isVisible())
  await popup.getByRole('textbox', { name: '선택 영역 후속 질문' }).fill('FOLLOW_SELECTION_SENTINEL')
  await popup.getByRole('button', { name: '선택 영역 질문 보내기' }).click()
  await window.waitForFunction(() => document.querySelectorAll('.selection-message.assistant').length === 2)
  const inlinePrompt = (await app.evaluate(() => globalThis.testPrompts)).at(-1)
  assert.match(inlinePrompt, /전체 논문 근거 응답 1/)
  assert.match(inlinePrompt, /FOLLOW_SELECTION_SENTINEL/)
  assert.match(inlinePrompt, /\[p\. 12\]/)
  await window.screenshot({ path: 'artifacts/selection-discussion.png' })
  await popup.getByRole('button', { name: '선택 영역 설명 닫기' }).click()
  let mark = await first.locator('.annotation-mark').first().boundingBox()
  await window.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2)
  await popup.waitFor()
  assert.equal(await popup.locator('.selection-message.assistant').count(), 2)
  await window.keyboard.press('Escape')

  await window.getByRole('button', { name: 'AI 패널 열기' }).click()
  const question = window.getByRole('textbox', { name: '논문에 대한 질문' })
  await question.fill('FIRST_PANEL_SENTINEL')
  await window.getByRole('button', { name: 'AI에 보내기' }).click()
  await window.locator('.chat-message.assistant').waitFor()
  await question.fill('SECOND_PANEL_SENTINEL')
  await window.getByRole('button', { name: 'AI에 보내기' }).click()
  await window.waitForFunction(() => document.querySelectorAll('.chat-message.assistant').length === 2)
  const panelPrompt = (await app.evaluate(() => globalThis.testPrompts)).at(-1)
  assert.match(panelPrompt, /FIRST_PANEL_SENTINEL/)
  assert.doesNotMatch(panelPrompt, /FOLLOW_SELECTION_SENTINEL/)
  assert.equal(panelPrompt.match(/<paper>\n([\s\S]*?)\n<\/paper>/)[1], inlinePrompt.match(/<paper>\n([\s\S]*?)\n<\/paper>/)[1])
  await window.getByRole('button', { name: '새 대화', exact: true }).click()
  await question.fill('NEW_PANEL_SENTINEL')
  await window.getByRole('button', { name: 'AI에 보내기' }).click()
  await window.locator('.chat-message.assistant').waitFor()
  assert.doesNotMatch((await app.evaluate(() => globalThis.testPrompts)).at(-1), /FIRST_PANEL_SENTINEL|SECOND_PANEL_SENTINEL/)
  await window.getByRole('button', { name: '논문 요약', exact: true }).click()
  await window.getByRole('heading', { name: '3문장 요약' }).waitFor()
  assert.equal(await window.locator('.paper-summary ol li').count(), 3)
  assert.equal(await window.locator('.paper-summary .answer-sources').count(), 1)
  assert.equal(await window.locator('.paper-summary .answer-sources').getAttribute('open'), null)
  assert.doesNotMatch(await window.locator('.paper-summary').innerText(), /p\. 12/)
  await window.getByRole('heading', { name: '전체 흐름' }).waitFor()
  await window.getByRole('heading', { name: '한계와 적용 범위' }).waitFor()
  await window.screenshot({ path: 'artifacts/paper-summary.png' })
  const callsBefore = (await app.evaluate(() => globalThis.testPrompts)).length
  await window.getByRole('button', { name: '논문 요약', exact: true }).click()
  assert.equal((await app.evaluate(() => globalThis.testPrompts)).length, callsBefore)
  await window.getByRole('button', { name: 'AI 패널 접기' }).click()
  await number.fill('1'); await number.press('Enter')
  const beforeAll = await app.evaluate(() => globalThis.translationCalls)
  await first.getByRole('button', { name: '모두 번역', exact: true }).click()
  await window.waitForFunction(() => document.querySelector('.reader-status')?.textContent.includes('전체 번역 12 / 12'))
  assert.equal(await window.locator('.translation-paper').count(), 12)
  assert.equal(await app.evaluate(() => globalThis.translationCalls), beforeAll + 12)
  assert.equal(await window.locator('[data-fallback="true"]').count(), 0)
  const completed = await app.evaluate(() => globalThis.translationCalls)
  await first.getByRole('button', { name: '모두 번역', exact: true }).click()
  await window.waitForFunction(() => document.querySelector('.reader-status')?.textContent.includes('전체 번역 12 / 12'))
  assert.equal(await app.evaluate(() => globalThis.translationCalls), completed)
  await window.screenshot({ path: 'artifacts/all-pages-translation.png' })

  await window.reload()
  await first.locator('canvas').waitFor()
  await first.locator('.annotation-mark').first().waitFor()
  mark = await first.locator('.annotation-mark').first().boundingBox()
  await window.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2)
  popup = window.getByRole('dialog', { name: '선택 영역 설명' })
  await popup.waitFor()
  assert.equal(await popup.locator('.selection-message.assistant').count(), 2)
  await window.keyboard.press('Escape')
  assert.equal(await window.locator('.translation-page-body').count(), 0)
  await window.getByRole('button', { name: 'AI 패널 열기' }).click()
  assert.equal(await window.locator('.chat-message').count(), 0)
  assert.deepEqual(await window.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('paperglim:chat:') || key.startsWith('paperglim:draft:'))), [])
  assert.deepEqual(errors, [])
  console.log('Passed: whole-paper shared context, isolated follow-up threads, inline selection tools, persisted hover history, structured summary, all-page translation cache, partial validation recovery, stable translation tabs, Zotero bulk sync, continuous reading.')
} catch (error) {
  const window = await app.firstWindow()
  await window.screenshot({ path: 'artifacts/reading-failure.png' })
  await writeFile('artifacts/reading-failure.txt', `${String(error)}\n${errors.join('\n')}\n${await window.locator('body').innerText()}`)
  throw error
} finally { await app.close() }
