import assert from 'node:assert/strict'
import { mkdir, copyFile, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { _electron } from 'playwright'

const fixture = process.argv[2]
if (!fixture) throw new Error('Pass a real multi-page PDF: node scripts/check-ui.mjs /path/to/paper.pdf')
const artifacts = resolve('artifacts')
await mkdir(artifacts, { recursive: true })
const source = resolve(artifacts, 'qa-paper.pdf')
await copyFile(fixture, source)
const profile = resolve(artifacts, `qa-profile-${Date.now()}`)
const env = { ...process.env, PAPERGLIM_BACKGROUND: '1', PAPERGLIM_PROFILE_DIR: profile }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const electronApp = await _electron.launch({ args: [resolve('.')], env, timeout: 30_000 })
const errors = []
const previousClipboard = await electronApp.evaluate(({ clipboard }) => clipboard.readText())

async function capture(name) {
  const window = await electronApp.firstWindow()
  await window.screenshot({ scale: 'css' })
  const bytes = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const [width, height] = window.getContentSize()
    const image = await window.capturePage()
    return image.resize({ width, height }).toPNG()
  })
  await writeFile(resolve(artifacts, name), Buffer.from(bytes))
}

try {
  const window = await electronApp.firstWindow()
  window.on('pageerror', (error) => errors.push(error.message))
  await electronApp.evaluate(() => {
    const original = globalThis.fetch
    globalThis.fetch = (input, init) => new URL(input).port === '23119' ? Promise.resolve(new Response('', { status: 403 })) : original(input, init)
  })
  await window.getByRole('heading', { name: '논문을 열어 읽기' }).waitFor()
  const bounds = await electronApp.evaluate(({ BrowserWindow, screen }) => ({ window: BrowserWindow.getAllWindows()[0].getBounds(), workArea: screen.getPrimaryDisplay().workArea }))
  const inventory = []
  async function checkFit(label) {
    const result = await window.evaluate(() => {
      const viewport = { width: innerWidth, height: innerHeight }
      const regions = ['.titlebar', '.library-pane', '.reading-main', '.assistant-pane', '.composer-area', '.reader-status']
        .flatMap((selector) => {
          const element = document.querySelector(selector)
          if (!element) return []
          const box = element.getBoundingClientRect()
          return [{ selector, x: box.x, y: box.y, right: box.right, bottom: box.bottom }]
        })
      return { viewport, regions, scrollWidth: document.documentElement.scrollWidth }
    })
    assert.ok(result.scrollWidth <= result.viewport.width, label)
    for (const region of result.regions) assert.ok(region.x >= 0 && region.y >= 0 && region.right <= result.viewport.width + 1 && region.bottom <= result.viewport.height + 1, `${label}: ${region.selector}`)
    inventory.push({ label, ...result })
  }
  await checkFit('initial empty view')
  await capture('empty.png')

  await window.locator('button.nav-row').filter({ hasText: 'Zotero' }).click()
  await window.getByRole('heading', { name: 'Zotero 라이브러리' }).waitFor()
  await window.getByRole('button', { name: 'Zotero 연결 방법' }).click()
  if (!await window.getByText('처음 연결할 때', { exact: true }).isVisible()) await window.getByRole('button', { name: 'Zotero 연결 방법' }).click()
  await window.getByText('처음 연결할 때', { exact: true }).waitFor()
  await capture('zotero.png')
  await window.keyboard.press('Escape')

  await window.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  await window.getByRole('heading', { name: 'ResNet', exact: true }).waitFor()
  await window.locator('.react-pdf__Page canvas').first().waitFor()
  await capture('resnet.png')
  await window.getByRole('button', { name: 'ResNet 목록에서 지우기' }).click()
  await window.getByRole('heading', { name: '논문을 열어 읽기' }).waitFor()

  await window.getByRole('button', { name: 'AI 패널 열기' }).click()
  await window.getByRole('button', { name: 'AI 패널 접기' }).click()
  await window.getByRole('button', { name: 'AI 패널 열기' }).click()
  assert.equal(await window.getByRole('button', { name: '이 논문의 핵심 기여는?' }).isDisabled(), true)
  assert.equal(await window.getByRole('textbox', { name: '논문에 대한 질문' }).isDisabled(), true)

  await window.getByRole('button', { name: '연결 설정 열기' }).click()
  await window.getByRole('dialog').waitFor()
  await window.getByRole('button', { name: /Claude Code/ }).click()
  await capture('settings.png')
  await window.keyboard.press('Escape')
  assert.match(await window.locator('.provider-picker').innerText(), /Claude Code/)

  await electronApp.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, source)
  await window.getByRole('button', { name: '다른 PDF 열기' }).click()
  await window.locator('.react-pdf__Page canvas').first().waitFor()
  await window.locator('.react-pdf__Page__textContent span').first().waitFor()
  assert.equal(await window.getByRole('textbox', { name: '페이지 번호' }).inputValue(), '1')
  await window.getByRole('button', { name: '다음 페이지' }).click()
  await window.waitForFunction(() => document.querySelector('input[aria-label="페이지 번호"]')?.value === '2')
  const pageInput = window.getByRole('textbox', { name: '페이지 번호' })
  await pageInput.fill('invalid')
  await pageInput.press('Enter')
  assert.equal(await pageInput.inputValue(), '2')

  await window.getByRole('button', { name: '확대', exact: true }).click()
  assert.match(await window.locator('.zoom-label').innerText(), /115%/)
  await window.getByRole('button', { name: '너비에 맞추기' }).click()
  assert.match(await window.locator('.zoom-label').innerText(), /100%/)
  await window.locator('[data-reading-page="2"] [data-text-index]').first().click({ clickCount: 3 })
  await window.getByRole('toolbar', { name: '선택 영역 도구' }).waitFor()
  assert.equal(await window.locator('.passage-card').count(), 0)
  await window.getByRole('textbox', { name: '논문에 대한 질문' }).fill('이 문장을 원문 맥락에서 설명해 줘.')
  await window.getByRole('button', { name: '질문 복사', exact: true }).click()
  await window.getByRole('button', { name: '복사했어', exact: true }).waitFor()
  const clipboard = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
  assert.equal(clipboard, '이 문장을 원문 맥락에서 설명해 줘.')
  await checkFit('PDF and inline selection')
  await capture('reader.png')

  await window.reload()
  await window.locator('.react-pdf__Page canvas').first().waitFor()
  await window.waitForFunction(() => document.querySelector('input[aria-label="페이지 번호"]')?.value === '2')
  await window.getByRole('button', { name: 'AI 패널 열기' }).click()
  assert.equal(await window.getByRole('textbox', { name: '논문에 대한 질문' }).inputValue(), '')
  assert.match(await window.locator('.provider-picker').innerText(), /Claude Code/)
  await window.getByRole('textbox', { name: '논문 검색' }).fill('not-a-paper-title')
  await window.getByText('일치하는 논문이 없어').waitFor()
  await window.getByRole('textbox', { name: '논문 검색' }).fill('')

  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 680))
  await window.waitForFunction(() => {
    const canvas = document.querySelector('.react-pdf__Page canvas')
    const reader = document.querySelector('.reader-scroll')
    return canvas && reader && canvas.getBoundingClientRect().width <= reader.clientWidth - 46
  })
  await checkFit('minimum window')
  await capture('minimum.png')

  await window.getByRole('button', { name: /목록에서 지우기/ }).click()
  await window.getByRole('heading', { name: '논문을 열어 읽기' }).waitFor()
  await access(source)
  const invalid = resolve(artifacts, 'invalid.pdf')
  await writeFile(invalid, 'not a PDF')
  await electronApp.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, invalid)
  await window.getByRole('button', { name: '다른 PDF 열기' }).click()
  await window.getByRole('heading', { name: 'PDF를 열 수 없어' }).waitFor()
  await window.getByRole('button', { name: /목록에서 지우기/ }).click()
  await electronApp.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }) })
  await window.getByRole('button', { name: '다른 PDF 열기' }).click()
  await window.getByRole('heading', { name: '논문을 열어 읽기' }).waitFor()
  assert.deepEqual(errors, [])
  await writeFile(resolve(artifacts, 'qa.json'), JSON.stringify({ passed: true, bounds, inventory, checks: ['native file selection handoff', 'real PDF rendering and text selection', 'navigation and invalid page', 'zoom and fit', 'prompt clipboard', 'reading-position restore and temporary draft reset', 'search', 'provider selection', 'remove keeps original', 'invalid PDF', 'cancel file picker'], errors }, null, 2))
  console.log('UI checks passed. Screenshots and results: artifacts/')
} catch (error) {
  const window = await electronApp.firstWindow()
  await capture('failure.png')
  await writeFile(resolve(artifacts, 'failure.txt'), `${String(error)}\n${errors.join('\n')}\n${await window.locator('body').innerText()}`)
  console.error('UI failure details: artifacts/failure.txt')
  throw error
} finally {
  await electronApp.evaluate(({ clipboard }, text) => clipboard.writeText(text), previousClipboard)
  await electronApp.close()
}
