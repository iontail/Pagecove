import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { appendFile, copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const metadata = JSON.parse(await readFile('package.json', 'utf8'))
const root = await mkdtemp(join(tmpdir(), 'paperglim-recovery-ui-')), profile = join(root, 'profile')
const control = join(root, 'control.json'), log = join(root, 'calls.jsonl'), backup = join(root, 'backup.json'), invalid = join(root, 'invalid.json'), other = join(root, 'other.pdf')
await writeFile(control, JSON.stringify({ mode: 'auth' })); await writeFile(log, '')
await writeFile(invalid, '{"format":"invalid"}')
await copyFile('resources/ResNet.pdf', other)
await writeFile(join(root, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'fixture', display_name: 'Fixture', visibility: 'list' }] }))
await writeFile(join(root, 'codex'), `#!${process.execPath}
const fs=require('node:fs');
if(process.argv.includes('--version')){console.log('codex-cli fixture');process.exit(0)}
if(process.argv.includes('features')){process.exit(0)}
let prompt='';process.stdin.on('data', chunk=>prompt+=chunk);process.stdin.on('end',()=>{
 const {mode}=JSON.parse(fs.readFileSync(${JSON.stringify(control)},'utf8'));
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({mode})+'\\n');
 if(mode==='wait'){setInterval(()=>{},1000);return}
 if(mode==='auth'||mode==='unknown'){console.error(mode==='auth'?'invalid_api_key Bearer SECRET_CREDENTIAL':'unclassified failure SECRET_CREDENTIAL');process.exitCode=1;return}
 if(prompt.includes('JSON 배열')){const blocks=JSON.parse(prompt.split('\\n').at(-1));console.log(JSON.stringify(blocks.flatMap(block=>block.sentences.map(({id,text})=>({id,text:'번역: '+text})))));return}
 if(prompt.includes('형식: {"sentences"')){console.log(JSON.stringify({sentences:['첫 문장.','둘째 문장.','셋째 문장.'],overview:'전체 흐름 [p. 4]',sections:{question:'문제', baselines: '원문에서 확인되는 비교 대상·기반 연구만 정리해. [p. 1]',method:'방법',equations: '수식 없음', insights: '결과의 의미', results:'결과',limitations:'한계'}}));return}
 console.log('근거를 확인하는 답변이야. $x_1$ [p. 3] [p. 999]');
});
`, { mode: 0o700 })
const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, CODEX_HOME: root, PAPERGLIM_PROFILE_DIR: profile, PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const bundle = process.argv[2]
const errors = []
let app, page
await mkdir('artifacts/recovery', { recursive: true })
const calls = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean)
const setMode = (mode) => writeFile(control, JSON.stringify({ mode }))
async function launch() {
  app = await _electron.launch({ ...(bundle ? { executablePath: resolve(bundle, 'Contents/MacOS/Pagecove') } : { args: [resolve('.')] }), env })
  page = await app.firstWindow(); page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.message))
  await app.evaluate(({ dialog }, paths) => {
    globalThis.restorePath = paths.backup
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.backup })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.restorePath] })
  }, { backup })
  await page.locator('.brand').waitFor()
}
async function go(number) {
  const input = page.getByRole('textbox', { name: '페이지 번호' })
  await input.fill(String(number)); await input.press('Enter')
  await page.waitForFunction((number) => document.querySelector('input[aria-label="페이지 번호"]')?.value === String(number), number)
}
async function dataSettings() {
  await page.getByRole('button', { name: '연결 설정 열기' }).click()
  await page.getByRole('tab', { name: '데이터·앱 정보', exact: true }).click()
}
async function capture(name) {
  await page.screenshot({ scale: 'css' })
  const bytes = await app.evaluate(async ({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; const [width,height] = window.getContentSize(); return (await window.capturePage()).resize({width,height}).toPNG() })
  await writeFile(`artifacts/recovery/${name}.png`, Buffer.from(bytes))
}
try {
  await launch()
  const info = await page.evaluate(() => window.paperglim.getAppInfo())
  assert.equal(info.version, metadata.version); assert.equal(info.build, metadata.buildNumber)
  if (bundle) assert.equal(info.packaged, true)
  await page.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  const [paper] = await page.evaluate(() => window.paperglim.listPapers())
  const { fingerprint } = await page.evaluate((id) => window.paperglim.readPdf(id), paper.id)
  if (await page.getByRole('button', { name: 'AI 패널 열기' }).isVisible()) await page.getByRole('button', { name: 'AI 패널 열기' }).click()
  await page.getByRole('button', { name: '이 논문의 핵심 기여는?', exact: true }).click()
  const recovery = page.locator('.composer-area .recovery-notice')
  await recovery.getByText(/AI 서비스에 다시 로그인/).waitFor()
  const question = page.getByRole('textbox', { name: '논문에 대한 질문' })
  assert.equal(await question.inputValue(), '이 논문의 핵심 기여는?')
  const failedCount = (await calls()).length
  await capture('auth-recovery')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 680))
  await page.getByRole('button', { name: '연결 설정 열기' }).click()
  for (let index = 0; index < 3; index++) await page.getByRole('button', { name: '앱 화면 확대', exact: true }).click()
  await page.keyboard.press('Escape')
  await recovery.scrollIntoViewIfNeeded()
  assert.ok(await page.locator('.composer-area').evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight + 1), 'An error must not push the composer outside a small enlarged window')
  await capture('auth-small-150')
  await page.getByRole('button', { name: '연결 설정 열기' }).click()
  await page.getByRole('button', { name: '기본값', exact: true }).click()
  await page.keyboard.press('Escape')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1420, 930))

  await recovery.getByRole('button', { name: '연결 설정', exact: true }).click()
  assert.equal(await page.getByRole('tab', { name: 'AI 연결', exact: true }).getAttribute('data-state'), 'active')
  await page.keyboard.press('Escape')
  assert.equal((await calls()).length, failedCount, 'Opening settings must not resubmit an AI request')
  await setMode('ok')
  await recovery.getByRole('button', { name: '다시 시도', exact: true }).click()
  const answer = page.locator('.chat-message.assistant').last()
  await answer.waitFor()
  await answer.locator('.answer-sources summary').click()
  assert.equal(await answer.getByRole('button', { name: 'p. 999', exact: true }).isDisabled(), true)
  await answer.getByRole('button', { name: 'p. 3', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[aria-label="페이지 번호"]').value === '3')
  await page.keyboard.press('Meta+[')
  await page.waitForFunction(() => document.querySelector('input[aria-label="페이지 번호"]').value === '1')
  await capture('citation-navigation')
  await setMode('unknown')
  await question.fill('UNKNOWN_ERROR')
  await page.getByRole('button', { name: 'AI에 보내기' }).click()
  await recovery.getByText(/요청을 완료하지 못했어요/).waitFor()
  assert.equal((await page.locator('body').innerText()).includes('SECRET_CREDENTIAL'), false)
  await setMode('ok')
  await recovery.getByRole('button', { name: '다시 시도', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.chat-message.assistant').length === 2)
  await page.getByRole('button', { name: '논문 요약', exact: true }).click()
  await page.locator('.paper-summary .answer-sources summary').first().click()
  await page.locator('.paper-summary').getByRole('button', { name: 'p. 4', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[aria-label="페이지 번호"]').value === '4')
  await page.getByRole('button', { name: 'AI 패널 접기' }).click()
  await go(1)
  await page.locator('[data-reading-page="1"] [data-text-index]').first().click({ clickCount: 3 })
  await page.getByRole('button', { name: '설명', exact: true }).click()
  const inline = page.getByRole('dialog', { name: '선택 영역 설명', exact: true })
  await inline.locator('.answer-sources summary').click()
  await inline.getByRole('button', { name: 'p. 3', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[aria-label="페이지 번호"]').value === '3')
  assert.equal(await page.locator('.selection-popover').count(), 0)
  await go(1)
  await page.getByRole('button', { name: '한글번역', exact: true }).first().click()
  await page.locator('.translation-sentence').first().waitFor()
  await page.waitForFunction(async ({ id, fingerprint }) => !!(await window.paperglim.getTranslations(id, fingerprint))?.entries.length, { id: paper.id, fingerprint })
  await page.getByRole('button', { name: '연결 설정 열기' }).click()
  await page.getByRole('button', { name: '앱 화면 확대', exact: true }).click()
  await page.getByRole('button', { name: '앱 화면 확대', exact: true }).click()
  await page.getByRole('tab', { name: '데이터·앱 정보', exact: true }).click()
  await page.getByRole('checkbox', { name: '저장한 번역도 백업에 포함' }).check()
  await page.getByRole('button', { name: '백업 저장', exact: true }).click()
  await page.getByText('백업 파일을 저장했어요.', { exact: true }).waitFor()
  const exported = JSON.parse(await readFile(backup, 'utf8'))
  assert.equal(exported.papers[0].id, paper.id)
  assert.equal(exported.annotations[paper.id].length, 1)
  assert.ok(exported.translations[paper.id].entries.length > 0)
  assert.equal(exported.preferences['paperglim:app-scale'], '1.25')
  assert.equal(Object.keys(exported.preferences).some((key) => key.includes('chat:')), false)
  await page.keyboard.press('Escape')
  const notes = await page.evaluate((id) => window.paperglim.getAnnotations(id), paper.id)
  await page.evaluate(({id, note}) => window.paperglim.removeAnnotation(id, note), {id: paper.id, note: notes[0].id})
  await page.getByRole('button', { name: 'ResNet 목록에서 지우기' }).click()
  await app.evaluate((_electron, path) => { globalThis.restorePath = path }, other)
  await page.getByRole('button', { name: 'PDF 선택', exact: true }).click()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  const [kept] = await page.evaluate(() => window.paperglim.listPapers())
  await page.getByRole('button', { name: '연결 설정 열기' }).click()
  await page.getByRole('button', { name: '기본값', exact: true }).click()
  await page.keyboard.press('Escape')
  await app.evaluate((_electron, path) => { globalThis.restorePath = path }, backup)
  const previewForBusy = await page.evaluate(() => window.paperglim.prepareRestore(Object.fromEntries(Object.entries(localStorage))))
  if (await page.getByRole('button', { name: 'AI 패널 열기' }).isVisible()) await page.getByRole('button', { name: 'AI 패널 열기' }).click()
  await setMode('wait')
  await page.getByRole('textbox', { name: '논문에 대한 질문' }).fill('WAIT_FOR_STOP')
  await page.getByRole('button', { name: 'AI에 보내기' }).click()
  await page.getByRole('button', { name: 'AI 요청 중지', exact: true }).waitFor()
  await page.waitForTimeout(150)
  await assert.rejects(() => page.evaluate((token) => window.paperglim.applyRestore(token, Object.fromEntries(Object.entries(localStorage)), false), previewForBusy.token), /실행 중인 작업/)
  await page.getByRole('button', { name: 'AI 요청 중지', exact: true }).click()
  await page.getByRole('button', { name: 'AI에 보내기' }).waitFor()
  await page.evaluate(() => window.paperglim.discardRestore())
  await page.getByRole('button', { name: 'AI 패널 접기' }).click()
  await setMode('ok')
  await dataSettings()
  await app.evaluate((_electron, path) => { globalThis.restorePath = path }, invalid)
  await page.getByRole('button', { name: '복원할 백업 선택', exact: true }).click()
  await page.locator('.backup-error').waitFor()
  assert.equal((await page.evaluate(() => window.paperglim.listPapers())).length, 1)
  await app.evaluate((_electron, path) => { globalThis.restorePath = path }, backup)
  await page.getByRole('button', { name: '복원할 백업 선택', exact: true }).click()
  const preview = page.getByLabel('복원 미리보기')
  await preview.waitFor()
  await capture('restore-preview')
  await preview.getByRole('button', { name: '취소', exact: true }).click()
  assert.equal((await page.evaluate(() => window.paperglim.listPapers())).length, 1)
  await page.getByRole('button', { name: '복원할 백업 선택', exact: true }).click()
  await page.getByRole('checkbox', { name: '백업의 화면·AI 선택 설정도 복원' }).check()
  const beforeRestoreCalls = (await calls()).length
  await preview.getByRole('button', { name: '백업 자료 추가', exact: true }).click()
  await page.getByText('기존 자료에 백업 내용을 추가했어요.', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('paperglim:app-scale')), '1.25')
  const restored = await page.evaluate(() => window.paperglim.listPapers())
  assert.equal(restored.length, 2)
  assert.ok(restored.some((entry) => entry.id === kept.id))
  assert.ok(restored.some((entry) => entry.id === paper.id))
  assert.equal((await page.evaluate((id) => window.paperglim.getAnnotations(id), paper.id)).length, 1)
  await page.locator('.paper-select').filter({ hasText: 'ResNet' }).click()
  await page.locator('[data-reading-page="1"]').getByRole('button', { name: '한글번역', exact: true }).click()
  await page.locator('.translation-sentence').first().waitFor()
  assert.equal((await calls()).length, beforeRestoreCalls, 'Restoring a backup must not call AI')
  await capture('restored-reading')
  await app.close(); await launch()
  assert.equal((await page.evaluate(() => window.paperglim.listPapers())).length, 2)
  assert.equal((await page.evaluate((id) => window.paperglim.getAnnotations(id), paper.id)).length, 1)
  assert.equal(await page.evaluate(() => localStorage.getItem('paperglim:app-scale')), '1.25')
  assert.deepEqual(errors, [])
  console.log('Recovery passed: chat/summary/inline source navigation and bounds, actionable auth/unknown failures, explicit retry without credential leakage, backup export/preview/cancel, busy/invalid restore rejection, merge retaining current documents, cache/settings/notes restore and full restart with no AI re-request')
} catch (error) {
  if (page && !page.isClosed()) { await capture('failure'); await writeFile('artifacts/recovery/failure.txt', `${error}\n${await page.locator('body').innerText()}`) }
  throw error
} finally { await app?.close() }
