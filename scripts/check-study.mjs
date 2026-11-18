import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'paperglim-study-')), log = join(root, 'calls.jsonl'), control = join(root, 'control')
await mkdir('artifacts/study', { recursive: true })
await writeFile(log, ''); await writeFile(control, 'ok')
await writeFile(join(root, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'fixture', visibility: 'list' }] }))
await writeFile(join(root, 'codex'), `#!${process.execPath}
const fs=require('node:fs'),args=process.argv.slice(2);
if(args.includes('--version')){console.log('fixture');process.exit(0)}if(args.includes('features'))process.exit(0);
let prompt='';process.stdin.on('data',c=>prompt+=c);process.stdin.on('end',()=>{
 const mode=fs.readFileSync(${JSON.stringify(control)},'utf8'),path=args.includes('--image')?args[args.indexOf('--image')+1]:null;
 let image=null;if(path){const bytes=fs.readFileSync(path);image={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};fs.copyFileSync(path,${JSON.stringify(resolve('artifacts/study/selected-figure.png'))})}
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({prompt,image})+'\\n');
 if(mode==='wait'){setInterval(()=>{},1000);return}if(mode==='invalid'){console.log('not json');return}
 console.log(JSON.stringify({overview:'선택한 '+(path?'그림은 학습 오차를 비교해.':'개념은 residual mapping을 설명해.')+' [p. 1]',details:path?'가로축은 iteration, 세로축은 training error야.':'$x$는 입력, $F(x)$는 residual mapping이야.',reasoning:path?'깊은 plain network의 오차가 더 높아.':'1. 입력을 유지해.\\n2. residual mapping을 더해.\\n\\n$$\\ny=F(x)+x\\n$$',connection:'이해를 위한 예시: $F(x)=0$이면 $y=x$야.',limits:'배경 설명과 원문 결과를 구분해야 해. [p. 2]'}));
});`, { mode: 0o700 })
const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, CODEX_HOME: root, PAPERGLIM_PROFILE_DIR: join(root, 'profile'), PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const bundle = process.argv[2], errors = []
let app, page, paper
const calls = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)
async function launch() {
  app = await _electron.launch({ ...(bundle ? { executablePath: resolve(bundle, 'Contents/MacOS/Pagecove') } : { args: [resolve('.')] }), env })
  page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('.brand').waitFor()
}
async function capture(name) {
  await page.screenshot()
  const bytes = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0], [width,height] = w.getContentSize(); return (await w.capturePage()).resize({ width,height }).toPNG() })
  await writeFile(`artifacts/study/${name}.png`, Buffer.from(bytes))
}
async function selectText(index = 0) {
  const input = page.getByRole('textbox', { name: '페이지 번호' }); await input.fill('1'); await input.press('Enter')
  await page.locator('[data-reading-page="1"] [data-text-index]').filter({ hasText: /\S/ }).nth(index).click({ clickCount: 3 })
  await page.getByRole('toolbar', { name: '선택 영역 도구', exact: true }).waitFor()
}
const notes = () => page.evaluate((id) => window.paperglim.getAnnotations(id), paper.id)
try {
  await launch()
  await page.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  ;[paper] = await page.evaluate(() => window.paperglim.listPapers())
  await selectText()
  await page.getByRole('button', { name: '다시 보기', exact: true }).click()
  await page.waitForFunction(async (id) => (await window.paperglim.getAnnotations(id))[0]?.review, paper.id)
  assert.equal((await calls()).length, 0)
  const mark = (await notes())[0]; assert.equal(mark.messages.length, 0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '저장된 설명', exact: true }).click()
  await page.getByRole('button', { name: '다시 보기 1', exact: true }).click()
  await page.locator('.saved-discussion-row').click()
  let inline = page.getByRole('dialog', { name: '선택 영역 설명', exact: true })
  await inline.getByRole('button', { name: '다시 보기 해제', exact: true }).click()
  await inline.getByText('이 부분의 설명을 요청하거나 다시 볼 부분으로 표시해.', { exact: true }).waitFor()
  assert.equal((await notes()).length, 0)
  assert.equal((await calls()).length, 0)
  await capture('review-unmarked')
  await inline.getByRole('button', { name: '다시 보기', exact: true }).click()
  await inline.getByRole('button', { name: '수식·개념 풀이', exact: true }).click()
  await inline.locator('.selection-message.assistant .katex').first().waitFor()
  await page.waitForFunction(async (id) => (await window.paperglim.getAnnotations(id))[0]?.study === 'concept', paper.id)
  assert.equal((await notes())[0].review, true)
  const first = (await calls())[0]; assert.match(first.prompt, /학습 과제: concept/); assert.equal(first.image, null)
  await capture('concept')
  await inline.getByRole('textbox', { name: '선택 영역 후속 질문' }).fill('この質問だけの追跡マーカー')
  await inline.getByRole('button', { name: '선택 영역 질문 보내기' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.selection-message.assistant').length === 2)
  assert.match((await calls()).at(-1).prompt, /학습 과제: concept/)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '1페이지 그림·표 질문', exact: true }).click()
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowUp')
  await capture('keyboard-selection')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '그림·표 해설', exact: true }).waitFor()
  await page.waitForFunction(() => document.activeElement?.closest('.selection-popover'))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '1페이지 그림·표 질문', exact: true }).click()
  const overlay = page.getByLabel('그림·표 영역 선택', { exact: true }), box = await overlay.boundingBox()
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .25)
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .91, box.y + box.height * .41, { steps: 8 }); await page.mouse.up()
  await page.getByRole('button', { name: '그림·표 해설', exact: true }).waitFor()
  await capture('figure-selection')
  await page.getByRole('button', { name: '그림·표 해설', exact: true }).click()
  await inline.getByRole('heading', { name: '축·범례·비교 조건', exact: true }).waitFor()
  const figure = (await calls()).at(-1)
  assert.ok(figure.image?.width > 300 && figure.image?.height > 100)
  assert.match(figure.prompt, /학습 과제: figure/)
  assert.doesNotMatch(figure.prompt, /この質問だけの追跡マーカー/)
  await capture('figure-answer')
  await inline.getByRole('button', { name: '다시 보기', exact: true }).click()
  await page.waitForFunction(async (id) => (await window.paperglim.getAnnotations(id)).filter((n) => n.review).length === 2, paper.id)
  assert.equal((await notes()).find((n) => n.kind === 'figure').ranges.length, 0)
  await page.keyboard.press('Escape')
  await app.close(); await launch()
  inline = page.getByRole('dialog', { name: '선택 영역 설명', exact: true })
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  assert.equal((await notes()).filter((n) => n.review).length, 2)
  const count = (await calls()).length
  await page.getByRole('button', { name: '저장된 설명', exact: true }).click()
  await page.getByRole('button', { name: '다시 보기 2', exact: true }).click()
  await page.locator('.saved-discussion-row').filter({ hasText: '선택한 그림·표' }).click()
  await inline.getByRole('heading', { name: '축·범례·비교 조건', exact: true }).waitFor()
  assert.equal((await calls()).length, count)
  await inline.getByRole('button', { name: '다시 보기 해제', exact: true }).click()
  await page.waitForFunction(async (id) => (await window.paperglim.getAnnotations(id)).find((n) => n.kind === 'figure')?.review === false, paper.id)
  assert.ok((await notes()).find((n) => n.kind === 'figure').messages.length)
  await writeFile(control, 'invalid')
  await inline.getByRole('textbox', { name: '선택 영역 후속 질문' }).fill('잘린 축은?')
  await inline.getByRole('button', { name: '선택 영역 질문 보내기' }).click()
  await inline.getByText(/답변을 읽을 수 없어요/).waitFor()
  assert.equal((await inline.innerText()).includes('not json'), false)
  await writeFile(control, 'ok')
  await inline.getByRole('button', { name: '다시 시도', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.selection-message.assistant').length === 2)
  await capture('figure-retry')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 680))
  await page.getByRole('button', { name: '연결 설정 열기' }).click()
  for (let n = 0; n < 3; n++) await page.getByRole('button', { name: '앱 화면 확대', exact: true }).click()
  await page.keyboard.press('Escape')
  await selectText(1)
  await capture('small-150')
  const popup = await page.locator('.selection-popover').boundingBox()
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert.ok(popup.x >= 0 && popup.y >= 0 && popup.x + popup.width <= viewport.width + 1 && popup.y + popup.height <= viewport.height + 1)
  assert.deepEqual(errors, [])
  console.log('Study UI passed: concept harness, math, review without AI, figure crop/input, isolated follow-ups, restart, retry, small enlarged UI.')
} finally { await app?.close() }
