import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { resolve } from 'node:path'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { readingQuestions } from '../src/shared/paper-harness.ts'

const env = { ...process.env, PAPERGLIM_PROFILE_DIR: await mkdtemp(`${tmpdir()}/paperglim-chat-`), PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const app = await _electron.launch({ args: [resolve('.')], env })
const errors = []
let page
await mkdir('artifacts', { recursive: true })
try {
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await app.evaluate(({ ipcMain }) => {
    globalThis.chatChecks = []
    ipcMain.removeHandler('providers:list')
    ipcMain.handle('providers:list', () => [{ id: 'codex', name: 'Codex', installed: true, version: 'fixture', models: [{ id: 'fixture', name: 'Fixture' }] }])
    ipcMain.removeHandler('ai:ask')
    ipcMain.handle('ai:ask', async (_event, _provider, prompt) => {
      globalThis.chatChecks.push(prompt)
      await new Promise((done) => setTimeout(done, 50))
      if (prompt.includes('BAD_MATH')) return String.raw`수식 원문을 유지해: $\frac{1}{}{}{$. <script>window.untrustedScript=true</script>`
      if (prompt.includes('LONG_MATH')) return `문장 속 긴 식 $${Array.from({ length: 40 }, (_, index) => `x_{${index + 1}}`).join('+')}$도 확인해. [p. 3]`
      return String.raw`### 핵심
**Residual learning(잔차 학습)**은 목표 함수를 직접 학습하는 대신 차이를 학습해. [p. 3] 문장 안에서 $y=F(x)+x$로 쓸 수 있어. [p. 3] [p. 4]

### 식의 의미
$$
\begin{aligned}y&=F(x,\{W_i\})+x\\y&=F(x,\{W_i\})+W_sx\end{aligned}
$$

- **입력**: \(x_i\)는 입력의 한 성분이야.
- **출력**: $y$는 블록의 출력이야.

| 개념 | 의미 |
| --- | --- |
| Shortcut | 입력을 더하는 경로 |

코드의 수식은 그대로: \`\(literal\)\`.
`.replaceAll('\\`', '`')
    })
  })
  await page.reload()
  await page.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  const source = page.locator('[data-reading-page="1"] .pdf-page-wrap')
  await source.locator('canvas').waitFor()
  async function drag() {
    await source.locator('[data-text-index]').filter({ hasText: /^Deeper neural/ }).first().hover()
    const points = await source.evaluate((element) => {
      const items = [...element.querySelectorAll('[data-text-index]')]
      const index = items.findIndex((el) => el.textContent.startsWith('Deeper neural'))
      const first = items[index].getBoundingClientRect(), last = items[index + 3].getBoundingClientRect()
      return { start: { x: first.left + 2, y: first.top + first.height / 2 }, end: { x: last.right - 2, y: last.top + last.height / 2 } }
    })
    await page.mouse.move(points.start.x, points.start.y); await page.mouse.down(); await page.mouse.move(points.end.x, points.end.y, { steps: 15 }); await page.mouse.up()
    await page.getByRole('toolbar', { name: '선택 영역 도구' }).waitFor()
    const popup = await page.locator('.selection-popover').boundingBox(), reader = await page.locator('.reader-scroll').boundingBox()
    assert.ok(popup.y >= reader.y && popup.x >= reader.x && popup.x + popup.width <= reader.x + reader.width)
    assert.equal(await source.locator('[data-text-index]').first().evaluate((el) => getComputedStyle(el, '::selection').color), 'rgba(0, 0, 0, 0)')
  }
  await drag()
  await page.screenshot({ path: 'artifacts/drag-fixed.png', scale: 'css' })
  await page.locator('.reader-scroll').evaluate((el) => el.scrollTop = 650)
  await page.getByRole('toolbar', { name: '선택 영역 도구' }).waitFor({ state: 'hidden' })
  await page.locator('.reader-scroll').evaluate((el) => el.scrollTop = 0)
  await page.getByRole('toolbar', { name: '선택 영역 도구' }).waitFor()
  const bounds = await source.boundingBox()
  await page.mouse.click(bounds.x + 10, bounds.y + 300)
  assert.equal(await page.locator('.selection-popover').count(), 0)
  if (await page.getByRole('button', { name: 'AI 패널 열기' }).isVisible()) await page.getByRole('button', { name: 'AI 패널 열기' }).click()
  for (const [index, { id, label }] of readingQuestions.entries()) {
    if (index) await page.getByRole('button', { name: '새 대화', exact: true }).click()
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.locator('.chat-message.assistant').waitFor()
    const calls = await app.evaluate(() => globalThis.chatChecks)
    assert.equal(calls.length, index + 1, 'One click sends exactly one request')
    assert.ok(calls.at(-1).includes(`응답 과제: ${id}`))
    assert.ok(calls.at(-1).includes('선택 영역: null'))
    assert.ok(calls.at(-1).includes('[p. 12]'))
    assert.equal(await page.locator('.chat-message.user .answer-text').innerText(), label)
    assert.equal(await page.locator('.chat-message.assistant .answer-text strong').first().innerText(), 'Residual learning(잔차 학습)')
    const sources = page.locator('.chat-message.assistant .answer-sources')
    assert.equal(await sources.count(), 1)
    assert.equal(await sources.getAttribute('open'), null)
    assert.doesNotMatch(await page.locator('.chat-message.assistant .answer-text').innerText(), /p\. 3/)
    assert.equal(await page.locator('.chat-message.user .answer-sources').count(), 0)
    assert.equal(await page.locator('.katex-display').count(), 1)
    assert.ok(await page.locator('.katex').count() >= 4)
    assert.equal(await page.locator('.katex-error').count(), 0)
    assert.equal(await page.locator('.answer-table table').count(), 1)
    const questionTop = await page.locator('.chat-message.user').boundingBox(), paneTop = await page.locator('.assistant-body').boundingBox()
    assert.ok(questionTop.y >= paneTop.y - 1 && questionTop.y < paneTop.y + 60, 'Start at the current question, not the bottom of a long answer')
    await sources.locator('summary').focus()
    await page.keyboard.press('Enter')
    assert.match(await sources.innerText(), /p\. 3–4/)
    await page.keyboard.press('Enter')
    assert.equal(await sources.getAttribute('open'), null)
    await page.locator('.assistant-body').evaluate((el) => el.scrollTop = 0)
    await page.evaluate(() => document.fonts.ready)
  }
  await page.screenshot({ path: 'artifacts/chat-math.png', scale: 'css' })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 680))
  assert.ok(await page.locator('.assistant-pane').evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
  await page.screenshot({ path: 'artifacts/chat-math-narrow.png', scale: 'css' })
  await page.getByRole('button', { name: '새 대화', exact: true }).click()
  await page.getByRole('textbox', { name: '논문에 대한 질문' }).fill('BAD_MATH')
  await page.getByRole('button', { name: 'AI에 보내기' }).click()
  await page.locator('.chat-message.assistant').waitFor()
  assert.equal(await page.locator('.katex-error').count(), 1)
  assert.equal(await page.evaluate(() => window.untrustedScript), undefined)
  await page.getByRole('button', { name: '새 대화', exact: true }).click()
  await page.getByRole('textbox', { name: '논문에 대한 질문' }).fill('LONG_MATH')
  await page.getByRole('button', { name: 'AI에 보내기' }).click()
  await page.locator('.chat-message.assistant .katex').waitFor()
  assert.ok(await page.locator('.assistant-body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'Long inline math must not overflow the chat')
  await page.getByRole('button', { name: 'AI 패널 접기' }).click()
  await page.locator('.reader-scroll').evaluate((el) => el.scrollTop = 0)
  await drag()
  await page.getByRole('button', { name: '설명', exact: true }).click()
  const popup = page.getByRole('dialog', { name: '선택 영역 설명' })
  await popup.locator('.selection-message.assistant').waitFor()
  assert.equal(await popup.locator('.katex-display').count(), 1)
  const popupBox = await popup.boundingBox(), readerBox = await page.locator('.reader-scroll').boundingBox()
  assert.ok(popupBox.y >= readerBox.y && popupBox.y + popupBox.height <= readerBox.y + readerBox.height + 1)
  await page.screenshot({ path: 'artifacts/inline-math-narrow.png', scale: 'css' })
  assert.deepEqual(errors, [])
  console.log('Passed: real mouse drag, transparent text selection, clear/hide/reposition, three immediate preset requests, full-paper context, Markdown, inline/display math, narrow layout, unsafe HTML and invalid math fallback, inline explanation')
} catch (error) {
  if (page) await page.screenshot({ path: 'artifacts/chat-failure.png', scale: 'css' })
  throw error
} finally { await app.close() }
