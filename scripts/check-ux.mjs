import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const env = { ...process.env, PAPERGLIM_PROFILE_DIR: await mkdtemp(`${tmpdir()}/paperglim-ux-`), PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const app = await _electron.launch({ args: [resolve('.')], env })
await mkdir('artifacts/ux-review', { recursive: true })
const errors = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await app.evaluate(({ ipcMain, shell }) => {
    globalThis.uxCalls = []; globalThis.uxLinks = []
    shell.openExternal = async (url) => { globalThis.uxLinks.push(url) }
    ipcMain.removeHandler('providers:list')
    ipcMain.handle('providers:list', () => [{ id: 'codex', name: 'Codex', installed: true, version: 'fixture', models: [{ id: 'fixture', name: 'Fixture' }] }])
    ipcMain.removeHandler('ai:ask')
    ipcMain.handle('ai:ask', async (_event, _provider, prompt) => {
      globalThis.uxCalls.push(prompt)
      if (prompt.includes('WAIT_FOR_ANSWER')) await new Promise((done) => { globalThis.finishUxAnswer = done })
      return '본문 전체를 참고한 답변이야. [p. 3]\n\n[관련 자료](https://example.org/paper)'
    })
  })
  await page.reload()
  if (await page.getByRole('button', { name: 'AI 패널 열기' }).isVisible()) await page.getByRole('button', { name: 'AI 패널 열기' }).click()
  const question = page.getByRole('textbox', { name: '논문에 대한 질문' })
  assert.equal(await question.isDisabled(), true, 'Do not accept a draft that opening the first PDF will discard')
  await page.getByRole('button', { name: 'AI 패널 접기' }).click()
  await page.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  const source = page.locator('[data-reading-page="1"] .pdf-page-wrap')
  await source.locator('[data-text-index]').first().waitFor()
  if (await page.getByRole('button', { name: 'AI 패널 열기' }).isVisible()) await page.getByRole('button', { name: 'AI 패널 열기' }).click()
  await question.fill('전체 논문의 핵심 기여를 설명해 줘.')
  await source.locator('[data-text-index]').filter({ hasText: /^Deeper neural/ }).first().hover()
  const points = await source.locator('[data-text-index]').evaluateAll((items) => {
    const index = items.findIndex((item) => item.textContent.startsWith('Deeper neural'))
    const first = items[index].getBoundingClientRect(), last = items[index + 2].getBoundingClientRect()
    return { x: first.left + 2, y: first.top + first.height / 2, endX: last.right - 2, endY: last.top + last.height / 2 }
  })
  await page.mouse.move(points.x, points.y); await page.mouse.down(); await page.mouse.move(points.endX, points.endY, { steps: 12 }); await page.mouse.up()
  await page.getByRole('toolbar', { name: '선택 영역 도구' }).waitFor()
  assert.equal(await page.locator('.passage-card').count(), 0)
  assert.equal(await question.inputValue(), '전체 논문의 핵심 기여를 설명해 줘.')
  await page.keyboard.press('Escape')
  await page.getByRole('toolbar', { name: '선택 영역 도구' }).waitFor({ state: 'hidden' })
  await question.dispatchEvent('keydown', { key: 'Enter', metaKey: true, isComposing: true })
  assert.equal((await app.evaluate(() => globalThis.uxCalls)).length, 0, 'Composing Korean text must not send')
  await question.press('Meta+Enter')
  await page.locator('.chat-message.assistant').waitFor()
  const prompt = (await app.evaluate(() => globalThis.uxCalls))[0]
  assert.match(prompt, /응답 과제: chat/)
  assert.match(prompt, /선택 영역: null/)
  assert.match(prompt, /\[p\. 12\]/)
  await page.getByRole('link', { name: '관련 자료' }).click()
  await page.waitForTimeout(200)
  assert.deepEqual(await app.evaluate(() => globalThis.uxLinks), ['https://example.org/paper'])
  await page.evaluate(() => { window.open('file:///private/tmp/example.pdf', '_blank'); window.open('javascript:alert(1)', '_blank') })
  await page.waitForTimeout(100)
  assert.deepEqual(await app.evaluate(() => globalThis.uxLinks), ['https://example.org/paper'], 'Only HTTP(S) can leave the app')
  await page.getByRole('button', { name: '새 대화', exact: true }).click()
  await question.fill('WAIT_FOR_ANSWER')
  await page.getByRole('button', { name: 'AI에 보내기' }).click()
  await page.waitForFunction(() => !!document.querySelector('.chat-messages [role="status"]'))
  await page.getByRole('button', { name: '논문 요약', exact: true }).click()
  assert.doesNotMatch(await page.locator('.paper-summary').innerText(), /요약하는 중/)
  assert.match(await page.locator('.paper-summary').innerText(), /답변/)
  assert.equal((await app.evaluate(() => globalThis.uxCalls)).length, 2, 'Switching a busy tab must not start another AI request')
  await app.evaluate(() => globalThis.finishUxAnswer())
  await page.getByRole('button', { name: '대화', exact: true }).click()
  await page.locator('.chat-message.assistant').waitFor()
  await page.screenshot({ path: 'artifacts/ux-review/chat-clean.png', scale: 'css' })
  for (const width of [1420, 1040]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, width === 1040 ? 680 : 900), width)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    for (const selector of ['.reader-toolbar', '.composer-area', '.library-bottom']) {
      assert.ok(await page.locator(selector).evaluate((el) => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 }))
    }
    await page.screenshot({ path: `artifacts/ux-review/layout-${width}.png`, scale: 'css' })
  }
  assert.deepEqual(errors, [])
  console.log('Passed: no sidebar selection or hidden selection context, retained draft, inline close, full-paper chat, Korean IME guard, external web links only, honest busy-summary feedback, 1420/1040px layout')
} finally { await app.close() }
