import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const env = { ...process.env, PAPERGLIM_PROFILE_DIR: await mkdtemp(join(tmpdir(), 'paperglim-guide-')), PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const bundle = process.argv[2], errors = []
let app, page
await mkdir('artifacts/guide', { recursive: true })
async function launch() {
  app = await _electron.launch({ ...(bundle ? { executablePath: resolve(bundle, 'Contents/MacOS/PaperGlim') } : { args: [resolve('.')] }), env })
  page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', (error) => errors.push(error.message))
  await app.evaluate(({ ipcMain }) => {
    globalThis.guideCalls = 0
    ipcMain.removeHandler('ai:ask'); ipcMain.handle('ai:ask', () => { globalThis.guideCalls++; throw new Error('Guide must not request AI') })
    ipcMain.removeHandler('zotero:list'); ipcMain.handle('zotero:list', () => ({ papers: [], collections: [] }))
  })
  await page.locator('.brand').waitFor()
}
async function open() { await page.getByRole('button', { name: '사용 가이드 열기' }).click(); await page.getByRole('dialog', { name: 'PaperGlim 사용 가이드' }).waitFor() }
async function capture(name) {
  await page.screenshot()
  const bytes = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0], [width,height] = w.getContentSize(); return (await w.capturePage()).resize({ width,height }).toPNG() })
  await writeFile(`artifacts/guide/${name}.png`, Buffer.from(bytes))
}
async function fits() {
  const box = await page.getByRole('dialog', { name: 'PaperGlim 사용 가이드' }).boundingBox(), viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1)
  assert.equal(await page.locator('.guide-dialog').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true)
  const footer = await page.getByRole('button', { name: '가이드 닫기' }).boundingBox()
  assert.ok(footer.y >= box.y && footer.y + footer.height <= box.y + box.height + 1)
}
try {
  await launch()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.match(await page.getByRole('button', { name: '사용 가이드 열기' }).innerText(), /사용 가이드/)
  await open(); await fits(); await capture('start')
  const reading = page.getByRole('tab', { name: '읽기·번역', exact: true })
  await page.getByRole('tab', { name: '시작하기', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('heading', { name: '원문 바로 옆에서 번역 읽기' }).waitFor(); await capture('reading')
  assert.equal(await reading.getAttribute('aria-selected'), 'true')
  await page.getByRole('tab', { name: 'AI 학습', exact: true }).click()
  await page.getByRole('heading', { name: '그림·표를 영역으로 선택하기' }).waitFor(); await capture('study')
  await page.getByRole('tab', { name: '연결·관리', exact: true }).click(); await capture('manage')
  await page.getByRole('button', { name: '백업·복원 설정 열기' }).click()
  await page.getByRole('tab', { name: '데이터·앱 정보', exact: true }).waitFor()
  assert.equal(await page.getByRole('tab', { name: '데이터·앱 정보', exact: true }).getAttribute('aria-selected'), 'true')
  await page.keyboard.press('Escape'); await open()
  await page.getByRole('tab', { name: '시작하기', exact: true }).click()
  await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click()
  assert.equal(await page.getByRole('tab', { name: 'AI 연결', exact: true }).getAttribute('aria-selected'), 'true')
  await page.keyboard.press('Escape'); await open()
  await page.getByRole('button', { name: 'ResNet 예제로 시작', exact: true }).click()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0)
  const papers = await page.evaluate(() => window.paperglim.listPapers())
  assert.equal(papers.length, 1)
  await page.getByRole('button', { name: 'AI 패널 열기' }).click()
  const draft = page.getByRole('textbox', { name: '논문에 대한 질문' })
  await draft.fill('가이드를 열어도 유지할 질문')
  await open(); await page.keyboard.press('Escape')
  assert.equal(await draft.inputValue(), '가이드를 열어도 유지할 질문')
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '사용 가이드 열기')
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((entry) => entry.label === '도움말').submenu.items.find((entry) => entry.label === '사용 가이드').click())
  await page.getByRole('dialog', { name: 'PaperGlim 사용 가이드' }).waitFor()
  await page.keyboard.press('Meta+,')
  await page.getByRole('tab', { name: '화면·읽기', exact: true }).waitFor()
  for (let index = 0; index < 3; index++) await page.getByRole('button', { name: '앱 화면 확대', exact: true }).click()
  await page.keyboard.press('Escape')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 680))
  await open()
  for (const name of ['시작하기', '읽기·번역', 'AI 학습', '연결·관리']) { await page.getByRole('tab', { name, exact: true }).click(); await fits() }
  await capture('small-150')
  await page.getByRole('button', { name: 'Zotero 연결 창 열기', exact: true }).click()
  await page.getByRole('dialog', { name: 'Zotero 라이브러리', exact: true }).waitFor()
  assert.equal(await app.evaluate(() => globalThis.guideCalls), 0)
  await app.close(); await launch()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await page.getByRole('button', { name: '사용 가이드 열기' }).innerText(), '')
  assert.equal((await page.evaluate(() => window.paperglim.listPapers()))[0].id, papers[0].id)
  await open(); await fits()
  assert.deepEqual(errors, [])
  console.log('Guide passed: first-use hint, four topics, keyboard tabs, native Help menu, focus return, example/settings/Zotero links, draft retention, small150 scrolling and restart; no AI requests.')
} finally { await app?.close() }
