import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { mkdtemp, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const metadata = JSON.parse(await readFile('package.json', 'utf8'))
const nextVersion = metadata.version.split('.').map(Number); nextVersion[2]++
const futureVersion = nextVersion.join('.')
const root = await mkdtemp(join(tmpdir(), 'paperglim-core-'))
const profile = join(root, 'profile'), original = join(root, 'core-paper.pdf'), moved = join(root, 'moved.pdf'), different = join(root, 'different.pdf')
function fixture(title) {
  const streams = ['PageOne Introduction', 'PageTwo Methods', 'PageThree Results'].map((text) => `BT /F1 18 Tf 60 700 Td (${title} ${text}) Tj ET`)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Outlines 10 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    ...[7, 8, 9].map((content) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >> /Contents ${content} 0 R >>`),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', ...streams.map((stream) => `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`),
    '<< /Type /Outlines /First 11 0 R /Last 13 0 R /Count 3 >>',
    '<< /Title (Introduction) /Parent 10 0 R /Dest [3 0 R /Fit] /Next 12 0 R >>',
    '<< /Title (Methods) /Parent 10 0 R /Dest [4 0 R /Fit] /Prev 11 0 R /Next 13 0 R >>',
    '<< /Title (Results) /Parent 10 0 R /Dest [5 0 R /Fit] /Prev 12 0 R >>'
  ]
  let pdf = '%PDF-1.7\n', offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}
await writeFile(original, fixture('Core'))
await writeFile(different, fixture('Different'))
await mkdir('artifacts/core', { recursive: true })
const env = { ...process.env, PAPERGLIM_PROFILE_DIR: profile, PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const bundle = process.argv[2]
let app, page
const errors = []
async function launch() {
  app = await _electron.launch({ ...(bundle ? { executablePath: resolve(bundle, 'Contents/MacOS/PaperGlim') } : { args: [resolve('.')] }), env })
  page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))
  await app.evaluate(({ ipcMain, dialog }, paths) => {
    globalThis.corePath = paths.original; globalThis.exportKind = 'answer'; globalThis.updateOffline = false
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.corePath] })
    dialog.showSaveDialog = async () => ({ canceled: globalThis.exportKind === 'cancel', filePath: `${paths.root}/${globalThis.exportKind}.md` })
    ipcMain.removeHandler('providers:list')
    ipcMain.handle('providers:list', () => [{ id: 'codex', name: 'Codex', installed: true, version: 'fixture', models: [{ id: 'fixture', name: 'Fixture' }] }])
    ipcMain.removeHandler('ai:ask')
    ipcMain.handle('ai:ask', (_event, _provider, prompt) => prompt.includes('형식: {"sentences"') ? JSON.stringify({ sentences: ['첫 문장.', '둘째 문장.', '셋째 문장.'], overview: '전체 흐름 [p. 1]', sections: { question: '문제', method: '방법', results: '결과', limitations: '한계' } }) : 'Core answer with $x_1$ and a source. [p. 1]')
    const fetchOriginal = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith('https://api.github.com/repos/iontail/PaperGlim/releases')) {
        if (globalThis.updateOffline) throw Error('offline')
        return new Response(JSON.stringify([{ tag_name: `v${paths.futureVersion}`, body: 'Core release changes', assets: [{ name: `PaperGlim-${paths.futureVersion}-mac-arm64.dmg` }] }]))
      }
      return fetchOriginal(input, init)
    }
  }, { root, original, futureVersion })
  await page.reload()
  await page.locator('.brand').waitFor()
}
async function atPage(number) { await page.waitForFunction((value) => document.querySelector('input[aria-label="페이지 번호"]')?.value === String(value), number) }
async function go(number) { const input = page.getByRole('textbox', { name: '페이지 번호' }); await input.fill(String(number)); await input.press('Enter'); await atPage(number) }
async function menu(label) {
  await app.evaluate(({ Menu }, label) => {
    const item = Menu.getApplicationMenu().items.flatMap((entry) => entry.submenu?.items ?? []).find((entry) => entry.label === label)
    if (!item) throw Error(`Missing menu: ${label}`)
    item.click()
  }, label)
}
try {
  await launch()
  const info = await page.evaluate(() => window.paperglim.getAppInfo())
  assert.equal(info.version, metadata.version); assert.equal(info.build, metadata.buildNumber)
  await menu('설정…')
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Meta+,')
  await page.getByRole('dialog').waitFor()
  await page.getByRole('tab', { name: '데이터·앱 정보', exact: true }).click()
  await page.getByRole('button', { name: '업데이트 확인', exact: true }).click()
  await page.getByText(`${futureVersion} 버전을 내려받을 수 있어.`, { exact: true }).waitFor()
  await app.evaluate(() => { globalThis.updateOffline = true })
  await page.getByRole('button', { name: '업데이트 확인', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '업데이트 확인에 실패' }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'PDF 열기', exact: true }).first().click()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  const [paper] = await page.evaluate(() => window.paperglim.listPapers())
  await menu('PDF 확대')
  await page.waitForFunction(() => document.querySelector('.zoom-label')?.textContent === '115%')
  await menu('PDF 기본 배율')
  await page.waitForFunction(() => document.querySelector('.zoom-label')?.textContent === '100%')
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()), 1)
  await go(3)
  await page.keyboard.press('Meta+['); await atPage(1)
  await page.keyboard.press('Meta+]'); await atPage(3)
  await menu('이전 읽기 위치'); await atPage(1)
  await menu('다음 읽기 위치'); await atPage(3)
  await page.getByRole('button', { name: '문서 목차', exact: true }).click()
  await page.getByRole('complementary', { name: '문서 목차 목록' }).getByRole('button', { name: /Methods/ }).click()
  await atPage(2)
  await page.getByRole('button', { name: '이전 읽기 위치', exact: true }).click(); await atPage(3)
  await page.getByRole('button', { name: '다음 읽기 위치', exact: true }).click(); await atPage(2)
  await page.keyboard.press('Meta+f')
  await page.getByRole('textbox', { name: '본문 검색어' }).fill('PageOne')
  await page.locator('.source-search-highlight').first().waitFor(); await atPage(1)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Meta+['); await atPage(2)
  await page.getByRole('button', { name: 'AI 패널 열기' }).click()
  await page.getByRole('button', { name: '이 논문의 핵심 기여는?', exact: true }).click()
  await page.locator('.chat-message.assistant').waitFor()
  await page.getByRole('button', { name: '답변 Markdown 내보내기' }).click()
  assert.match(await readFile(join(root, 'answer.md'), 'utf8'), /# core-paper[\s\S]*\$x_1\$/)
  await app.evaluate(() => { globalThis.exportKind = 'summary' })
  await page.getByRole('button', { name: '논문 요약', exact: true }).click()
  await page.getByRole('button', { name: '요약 내보내기' }).waitFor()
  await page.getByRole('button', { name: '요약 내보내기' }).click()
  assert.match(await readFile(join(root, 'summary.md'), 'utf8'), /3문장 요약[\s\S]*전체 흐름/)
  await app.evaluate(() => { globalThis.exportKind = 'cancel' })
  await page.getByRole('button', { name: '요약 내보내기' }).click()
  await assert.rejects(() => page.evaluate((id) => window.paperglim.exportMarkdown(id, '', '요약'), paper.id))
  await page.getByRole('button', { name: 'AI 패널 접기' }).click()
  await go(1)
  await page.locator('[data-reading-page="1"] [data-text-index]').first().click({ clickCount: 3 })
  await page.getByRole('button', { name: '설명', exact: true }).click()
  await page.locator('.selection-message.assistant').waitFor()
  await app.evaluate(() => { globalThis.exportKind = 'selection' })
  await page.getByRole('button', { name: '선택 영역 설명 내보내기' }).click()
  assert.match(await readFile(join(root, 'selection.md'), 'utf8'), /p\. 1[\s\S]*Core answer/)
  await page.getByRole('button', { name: '선택 영역 설명 닫기' }).click()
  await go(2)
  await page.getByRole('button', { name: 'core-paper 목록에서 지우기' }).click()
  assert.equal((await page.evaluate(() => window.paperglim.listPapers())).length, 0)
  await page.getByRole('button', { name: '실행 취소', exact: true }).click()
  await page.locator('[data-reading-page="2"] canvas').waitFor(); await atPage(2)
  assert.equal((await page.evaluate(() => window.paperglim.listPapers()))[0].id, paper.id)
  assert.equal((await page.evaluate((id) => window.paperglim.getAnnotations(id), paper.id)).length, 1)
  await rename(original, moved)
  await page.reload()
  await page.getByRole('button', { name: '파일 위치 다시 지정', exact: true }).waitFor()
  await app.evaluate((_electron, path) => { globalThis.corePath = path }, different)
  await page.getByRole('button', { name: '파일 위치 다시 지정', exact: true }).click()
  await page.getByText(/원래 PDF와 내용이 달라/).waitFor()
  await app.evaluate((_electron, path) => { globalThis.corePath = path }, moved)
  await page.getByRole('button', { name: '파일 위치 다시 지정', exact: true }).click()
  await page.locator('[data-reading-page="2"] canvas').waitFor(); await atPage(2)
  assert.equal((await page.evaluate(() => window.paperglim.listPapers()))[0].id, paper.id)
  assert.equal((await page.evaluate((id) => window.paperglim.getAnnotations(id), paper.id)).length, 1)
  await page.screenshot({ path: 'artifacts/core/relinked.png', scale: 'css' })
  await app.close(); await launch()
  await page.locator('[data-reading-page="2"] canvas').waitFor(); await atPage(2)
  assert.equal((await page.evaluate(() => window.paperglim.listPapers()))[0].id, paper.id)
  assert.deepEqual(errors, [])
  console.log('Core passed: version/build, native settings and navigation shortcuts, updates/offline, PDF outline, search return, three Markdown exports/cancel, delete undo, content-verified relink and restart with notes retained')
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: 'artifacts/core/failure.png', scale: 'css' }); await writeFile('artifacts/core/failure.txt', `${error}\n${await page.locator('body').innerText()}`) }
  throw error
} finally { await app?.close() }
