import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { access, appendFile, copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const root = await mkdtemp(join(tmpdir(), 'paperglim-tools-'))
const profile = join(root, 'profile'), paper = join(root, 'paper.pdf')
const log = join(root, 'requests.jsonl'), control = join(root, 'control.json')
await copyFile('resources/ResNet.pdf', paper)
await writeFile(log, ''); await writeFile(control, '{}')
await writeFile(join(root, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'test-one', display_name: '첫 모델', visibility: 'list' }, { slug: 'test-two', display_name: '다른 모델', visibility: 'list' }] }))
await writeFile(join(root, 'codex'), `#!${process.execPath}
const fs=require('node:fs');
if(process.argv.includes('--version')){console.log('codex-cli fixture');process.exit(0)}
if(process.argv.includes('features')){console.log('fast_mode stable true');process.exit(0)}
let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{
 const translation=prompt.includes('JSON 배열'),summary=prompt.includes('형식: {"sentences"');
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({pid:process.pid,prompt,translation,summary})+'\\n');
 const control=JSON.parse(fs.readFileSync(${JSON.stringify(control)},'utf8'));
 if(prompt.includes('WAIT_CHAT')||prompt.includes('WAIT_INLINE')||(translation&&control.translation)||(summary&&control.summary)){setInterval(()=>{},1000);return}
 if(translation){const blocks=JSON.parse(prompt.split('\\n').at(-1));console.log(JSON.stringify(blocks.flatMap(block=>block.sentences.map(({id,text})=>({id,text:'번역: '+text})))));return}
 if(summary){console.log(JSON.stringify({sentences:['첫 문장.','둘째 문장.','셋째 문장.'],overview:'전체 흐름 [p. 1]',sections:{question:'문제 [p. 1]', baselines: '원문에서 확인되는 비교 대상·기반 연구만 정리해. [p. 1]',method:'방법 [p. 3]',equations: '수식 없음', insights: '결과의 의미', results:'결과 [p. 5]',limitations:'한계 [p. 8]'}}));return}
 console.log('전체 논문의 맥락을 참고한 설명이야. [p. 3]');
});
`, { mode: 0o700 })
execFileSync(process.execPath, ['--check', join(root, 'codex')])
const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, CODEX_HOME: root, PAPERGLIM_PROFILE_DIR: profile, PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
await mkdir('artifacts/reading-tools', { recursive: true })
const calls = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
const wait = async (predicate) => { for (let i = 0; i < 300; i++) { if (await predicate()) return; await new Promise((done) => setTimeout(done, 20)) } throw Error('Timed out waiting for the reading-tools fixture') }
let app, page
const errors = []
async function launch() {
  app = await _electron.launch({ args: [resolve('.')], env })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
}
async function openAI() { if (await page.getByRole('button', { name: 'AI 패널 열기' }).isVisible()) await page.getByRole('button', { name: 'AI 패널 열기' }).click() }
async function firstPage() {
  const input = page.getByRole('textbox', { name: '페이지 번호' })
  await input.fill('1'); await input.press('Enter')
  await page.locator('[data-reading-page="1"] [data-text-index]').filter({ hasText: /^Deeper neural/ }).first().hover()
}
try {
  await launch()
  await app.evaluate(({ dialog }, paper) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paper] }) }, paper)
  await page.getByRole('button', { name: 'PDF 선택', exact: true }).click()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  assert.equal(await page.locator('#assistant-pane').getAttribute('hidden'), null, 'AI opens by default')
  await page.getByRole('button', { name: 'AI 패널 접기' }).click()
  const openFile = await page.getByRole('button', { name: '다른 PDF 열기' }).boundingBox()
  const reopenAI = await page.getByRole('button', { name: 'AI 패널 열기' }).boundingBox()
  assert.ok(openFile.x + openFile.width <= reopenAI.x, 'Reader actions must leave room for reopening the AI panel')
  await page.keyboard.press('Meta+f')
  const find = page.getByRole('textbox', { name: '본문 검색어' })
  await find.waitFor()
  await find.fill('shortcut')
  await page.locator('.source-search-highlight').first().waitFor()
  assert.match(await page.locator('.source-search-highlight').first().innerText(), /shortcut/i)
  const count = await page.locator('.pdf-search-count').innerText()
  assert.ok(Number(count.split('/')[1]) > 1)
  await find.press('Enter'); assert.match(await page.locator('.pdf-search-count').innerText(), /^2 \/ /)
  await find.press('Shift+Enter'); assert.match(await page.locator('.pdf-search-count').innerText(), /^1 \/ /)
  await find.fill('1202')
  await page.locator('.source-search-highlight').filter({ hasText: '1202' }).first().waitFor()
  assert.ok(Number(await page.getByRole('textbox', { name: '페이지 번호' }).inputValue()) >= 6)
  await page.screenshot({ path: 'artifacts/reading-tools/search.png', scale: 'css' })
  await find.fill('3.57%'); await page.locator('.source-search-highlight').filter({ hasText: '3.57%' }).first().waitFor()
  await find.fill('NO_SUCH_SOURCE_TERM'); await page.getByText('일치하는 본문이 없어.').waitFor()
  assert.equal((await calls()).length, 0, 'PDF search never sends an AI request')
  console.log('Passed local search and source mapping')
  await find.press('Escape')
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '본문 검색')

  await page.getByRole('button', { name: '저장된 설명', exact: true }).click()
  await page.getByText(/저장된 설명이 없어/).waitFor()
  await page.getByRole('button', { name: '저장된 설명 목록 닫기' }).click()
  await firstPage()
  const sentence = page.locator('[data-reading-page="1"] [data-text-index]').filter({ hasText: /^Deeper neural/ }).first()
  await sentence.click({ clickCount: 3 })
  await page.getByRole('button', { name: '설명', exact: true }).click()
  const popup = page.getByRole('dialog', { name: '선택 영역 설명' })
  await popup.locator('.selection-message.assistant').waitFor()
  await popup.getByRole('button', { name: '선택 영역 설명 닫기' }).click()
  const beforeRecall = (await calls()).length
  await page.getByRole('textbox', { name: '페이지 번호' }).fill('8')
  await page.getByRole('textbox', { name: '페이지 번호' }).press('Enter')
  await page.getByRole('button', { name: '저장된 설명', exact: true }).click()
  assert.equal(await page.locator('.saved-discussion-row').count(), 1)
  await page.screenshot({ path: 'artifacts/reading-tools/saved-list.png', scale: 'css' })
  await page.locator('.saved-discussion-row').click()
  await popup.locator('.selection-message.assistant').waitFor()
  assert.equal(await page.getByRole('textbox', { name: '페이지 번호' }).inputValue(), '1')
  assert.equal((await calls()).length, beforeRecall)
  await popup.getByRole('textbox', { name: '선택 영역 후속 질문' }).fill('WAIT_INLINE')
  await popup.getByRole('button', { name: '선택 영역 질문 보내기' }).click()
  await wait(async () => (await calls()).at(-1).prompt.includes('WAIT_INLINE'))
  const inlinePid = (await calls()).at(-1).pid
  const inlineCalls = (await calls()).length
  await popup.getByRole('button', { name: '선택 영역 요청 중지' }).click()
  await wait(() => !alive(inlinePid))
  await popup.getByRole('button', { name: '선택 영역 질문 보내기' }).waitFor()
  await page.waitForTimeout(120)
  assert.equal((await calls()).length, inlineCalls, 'Cancel must not submit the restored draft again')
  assert.equal(await popup.locator('.selection-message.assistant').count(), 1)
  assert.equal(await popup.getByRole('textbox', { name: '선택 영역 후속 질문' }).inputValue(), 'WAIT_INLINE')
  await popup.getByRole('button', { name: '선택 영역 설명 닫기' }).click()

  console.log('Passed saved note navigation and inline cancellation')
  await openAI()
  const question = page.getByRole('textbox', { name: '논문에 대한 질문' })
  await question.fill('WAIT_CHAT')
  await page.getByRole('button', { name: 'AI에 보내기' }).click()
  await wait(async () => (await calls()).at(-1).prompt.includes('WAIT_CHAT'))
  const chatPid = (await calls()).at(-1).pid
  await page.getByRole('button', { name: 'AI 요청 중지', exact: true }).click()
  await wait(() => !alive(chatPid))
  await page.getByRole('button', { name: 'AI에 보내기' }).waitFor()
  assert.equal(await question.inputValue(), 'WAIT_CHAT')
  assert.equal(await page.locator('.chat-message.assistant').count(), 0)
  await question.fill('NORMAL_CHAT_SENTINEL')
  await page.getByRole('button', { name: 'AI에 보내기' }).click()
  await page.locator('.chat-message.assistant').waitFor()

  await writeFile(control, JSON.stringify({ summary: true }))
  await page.getByRole('button', { name: '논문 요약', exact: true }).click()
  await wait(async () => (await calls()).at(-1).summary)
  const summaryPid = (await calls()).at(-1).pid
  await page.getByRole('button', { name: 'AI 요청 중지', exact: true }).click()
  await wait(() => !alive(summaryPid))
  await page.getByRole('button', { name: 'AI 요청 중지', exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await question.isVisible(), false, 'Summary keeps the reading space clear')
  assert.equal(await page.getByRole('button', { name: 'AI 모델', exact: true }).isVisible(), true)
  await writeFile(control, '{}')
  await page.getByRole('button', { name: '논문 요약', exact: true }).click()
  await page.getByRole('heading', { name: '3문장 요약' }).waitFor()

  console.log('Passed chat and summary cancellation')
  await firstPage()
  await writeFile(control, JSON.stringify({ translation: true }))
  await page.getByRole('button', { name: '한글번역', exact: true }).first().click()
  await wait(async () => (await calls()).at(-1).translation)
  const translationPid = (await calls()).at(-1).pid
  await page.getByRole('textbox', { name: '페이지 번호' }).fill('8')
  await page.getByRole('textbox', { name: '페이지 번호' }).press('Enter')
  await page.getByRole('button', { name: '진행 중인 번역 중지' }).click()
  await wait(() => !alive(translationPid))
  await firstPage()
  await page.getByText(/번역을 중지했어/).waitFor()
  assert.equal(await page.locator('.translation-sentence').count(), 0)
  await writeFile(control, '{}')
  await page.getByRole('button', { name: '다시 번역', exact: true }).click()
  await page.locator('.translation-sentence').first().waitFor()
  const translated = await page.locator('.translation-sentence').allTextContents()
  const translationsBefore = (await calls()).filter((call) => call.translation).length
  await wait(async () => { try { const files = await readdir(join(profile, 'translations')); return files.some((name) => name.endsWith('.json')) } catch { return false } })
  const cacheFile = join(profile, 'translations', (await readdir(join(profile, 'translations'))).find((name) => name.endsWith('.json')))
  assert.doesNotMatch(await readFile(cacheFile, 'utf8'), /WAIT_CHAT|NORMAL_CHAT_SENTINEL|WAIT_INLINE/)
  await openAI()
  await page.getByRole('button', { name: 'AI 모델', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '다른 모델', exact: true }).click()
  await page.getByRole('button', { name: '한글번역', exact: true }).first().click()
  await page.locator('.translation-sentence').first().waitFor()
  assert.deepEqual(await page.locator('.translation-sentence').allTextContents(), translated)
  assert.equal((await calls()).filter((call) => call.translation).length, translationsBefore)
  await page.getByRole('button', { name: '나란히 번역 닫기' }).first().click()
  await page.getByRole('button', { name: '한글번역', exact: true }).first().click()
  await page.locator('.translation-sentence').first().waitFor()
  assert.equal((await calls()).filter((call) => call.translation).length, translationsBefore)
  await page.screenshot({ path: 'artifacts/reading-tools/translation-restored.png', scale: 'css' })

  console.log('Passed translation stop and model retention')
  await page.reload()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  assert.equal(await page.locator('#assistant-pane').getAttribute('hidden'), null)
  await page.getByRole('button', { name: '한글번역', exact: true }).first().click()
  await page.locator('.translation-sentence').first().waitFor()
  assert.deepEqual(await page.locator('.translation-sentence').allTextContents(), translated)
  assert.equal((await calls()).filter((call) => call.translation).length, translationsBefore)
  await app.close(); await launch()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  assert.equal(await page.locator('#assistant-pane').getAttribute('hidden'), null)
  await page.getByRole('button', { name: '한글번역', exact: true }).first().click()
  await page.locator('.translation-sentence').first().waitFor()
  assert.deepEqual(await page.locator('.translation-sentence').allTextContents(), translated)
  assert.equal((await calls()).filter((call) => call.translation).length, translationsBefore)

  await appendFile(paper, '\n% changed content identity for cache test\n')
  await page.getByRole('button', { name: '서재로 돌아가기' }).click()
  await page.locator('.paper-select').first().click()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.translation-sentence').count(), 0, 'Changed PDF content must not restore an old translation')
  await page.getByRole('button', { name: '한글번역', exact: true }).first().click()
  await page.locator('.translation-sentence').first().waitFor()
  assert.equal((await calls()).filter((call) => call.translation).length, translationsBefore + 1)
  await page.getByRole('button', { name: '1페이지 저장 번역 삭제' }).click()
  await page.getByText(/저장된 번역을 지웠어/).waitFor()
  await page.reload()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  assert.equal(await page.locator('.translation-sentence').count(), 0)
  await openAI()
  for (const width of [1420, 1040]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, width === 1040 ? 680 : 900), width)
    await page.getByRole('button', { name: '본문 검색', exact: true }).click()
    await page.getByRole('textbox', { name: '본문 검색어' }).fill('residual')
    await page.locator('.source-search-highlight').first().waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    for (const selector of ['.pdf-search', '.reader-header-actions', '.composer-area']) assert.ok(await page.locator(selector).evaluate((el) => { const rect = el.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 }))
    await page.screenshot({ path: `artifacts/reading-tools/layout-${width}.png`, scale: 'css' })
    await page.getByRole('button', { name: '본문 검색 닫기' }).click()
    await page.getByRole('button', { name: '저장된 설명', exact: true }).click()
    assert.ok(await page.locator('.saved-discussions').evaluate((el) => el.getBoundingClientRect().right <= innerWidth))
    await page.screenshot({ path: `artifacts/reading-tools/saved-${width}.png`, scale: 'css' })
    await page.getByRole('button', { name: '저장된 설명 목록 닫기' }).click()
  }
  assert.deepEqual(errors, [])
  console.log('Passed: local full-text search and source mapping; saved discussion navigation; actual CLI cancellation for chat, inline, summary and translation; durable translation restore, model changes, PDF identity invalidation and cache deletion; 1420/1040px layout')
} catch (error) {
  if (page) await page.screenshot({ path: 'artifacts/reading-tools/failure.png', scale: 'css' }).catch(() => {})
  console.error('Reading-tools fixture:', root)
  throw error
} finally { if (app) await app.close() }
