import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const metadata = JSON.parse(await readFile('package.json', 'utf8'))
const env = { ...process.env, PAPERGLIM_PROFILE_DIR: await mkdtemp(join(tmpdir(), 'paperglim-wheel-')), PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const bundle = process.argv[2]
const app = await _electron.launch({ ...(bundle ? { executablePath: resolve(bundle, 'Contents/MacOS/PaperGlim') } : { args: [resolve('.')] }), env })
const errors = []
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (/passive event listener/i.test(message.text())) errors.push(message.text()) })
  const info = await page.evaluate(() => window.paperglim.getAppInfo())
  assert.equal(info.version, metadata.version)
  if (bundle) assert.equal(info.packaged, true)
  await page.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  await page.locator('.react-pdf__Page canvas').first().waitFor()
  const area = page.locator('.reader-scroll')
  async function zoom(expected) { await page.waitForFunction((expected) => document.querySelector('.zoom-label')?.textContent === expected, expected) }
  async function reset() { await page.keyboard.press('Meta+0'); await zoom('100%') }
  async function hardwareWheel(delta) {
    await area.hover()
    await page.keyboard.down('Meta')
    try { await page.mouse.wheel(0, delta) } finally { await page.keyboard.up('Meta') }
  }
  await hardwareWheel(-100); await zoom('115%')
  await hardwareWheel(100); await zoom('100%')
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()), 1)
  const number = page.getByRole('textbox', { name: '페이지 번호' })
  await number.fill('2'); await number.press('Enter')
  await page.waitForFunction(() => document.querySelector('input[aria-label="페이지 번호"]').value === '2')
  await hardwareWheel(-100); await zoom('115%')
  assert.equal(await number.inputValue(), '2', 'Wheel zoom should retain the reading page')
  await reset()
  const before = await area.evaluate((element) => element.scrollTop)
  await area.hover(); await page.mouse.wheel(0, 120)
  await page.waitForFunction((before) => document.querySelector('.reader-scroll').scrollTop > before, before)
  await zoom('100%')
  async function synthetic(options, count = 1) {
    return area.evaluate((element, {options, count}) => {
      let prevented = false
      for (let index = 0; index < count; index++) {
        const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, metaKey: true, ...options })
        element.dispatchEvent(event); prevented = event.defaultPrevented
      }
      return prevented
    }, {options, count})
  }
  assert.equal(await synthetic({deltaY: -100}, 20), true)
  await zoom('115%')
  await reset()
  assert.equal(await synthetic({deltaY: -3, deltaMode: 1}), true)
  await zoom('107%')
  await reset()
  assert.equal(await synthetic({deltaY: -1, deltaMode: 2}), true)
  await zoom('115%')
  await reset()
  assert.equal(await synthetic({deltaY: 0, deltaX: 100}), false)
  assert.equal(await synthetic({deltaY: -100, metaKey: false}), false)
  assert.equal(await synthetic({deltaY: -100, altKey: true}), false)
  for (let index = 0; index < 10; index++) { await synthetic({deltaY: -100}); await page.evaluate(() => new Promise(requestAnimationFrame)) }
  await zoom('200%')
  for (let index = 0; index < 12; index++) { await synthetic({deltaY: 100}); await page.evaluate(() => new Promise(requestAnimationFrame)) }
  await zoom('50%')
  await reset()
  await page.getByRole('button', { name: 'AI 패널 열기' }).click()
  await page.locator('.assistant-body').hover()
  await page.keyboard.down('Meta'); await page.mouse.wheel(0, -100); await page.keyboard.up('Meta')
  await zoom('100%')
  await page.getByRole('button', { name: 'AI 패널 접기' }).click()
  await page.getByRole('button', { name: '연결 설정 열기' }).click()
  await page.getByRole('dialog').waitFor()
  await synthetic({deltaY: -100})
  await page.waitForTimeout(40)
  assert.equal(await page.locator('.zoom-label').innerText(), '100%', 'An open settings dialog must block PDF wheel zoom')
  await page.getByRole('button', { name: '앱 화면 확대', exact: true }).click()
  await page.getByRole('button', { name: '앱 화면 확대', exact: true }).click()
  await page.keyboard.press('Escape')
  await hardwareWheel(-100)
  await page.waitForFunction(() => document.querySelector('.zoom-label').textContent !== '100%')
  assert.ok(Math.abs(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()) - 1.25) < .001)
  await reset()
  await page.getByRole('button', { name: '시작 화면으로 돌아가기' }).click()
  await page.getByRole('heading', { name: '논문을 열어 읽기' }).waitFor()
  assert.equal(await synthetic({deltaY: -100}), false)
  await page.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  await page.locator('.react-pdf__Page canvas').first().waitFor()
  await synthetic({deltaY: -100}); await zoom('115%')
  await reset()
  assert.deepEqual(errors, [])
  console.log('Wheel zoom passed: real Cmd+wheel input, ordinary scroll, retained page, batched high-frequency input, pixel/line/page deltas, 50–200% bounds, modal/sidebar/empty-view guards and app-scale independence')
} finally { await app.close() }
