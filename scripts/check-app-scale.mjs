import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const profile = await mkdtemp(join(tmpdir(), 'paperglim-app-scale-'))
const bundle = process.argv[2]
const env = { ...process.env, PAPERGLIM_PROFILE_DIR: profile, PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
await mkdir('artifacts/app-scale', { recursive: true })
const errors = []
let app, page
async function launch() {
  app = await _electron.launch({ ...(bundle ? { executablePath: resolve(bundle, 'Contents/MacOS/PaperGlim') } : { args: [resolve('.')] }), env })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('.brand').waitFor()
}
async function settings() {
  await page.getByRole('button', { name: '연결 설정 열기' }).click()
  await page.getByRole('dialog').waitFor()
}
async function factor() { return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()) }
async function setScale(percent) {
  await settings()
  let current = Number((await page.locator('output[aria-label="앱 화면 배율"]').innerText()).replace('%', ''))
  while (current !== percent) {
    await page.getByRole('button', { name: current < percent ? '앱 화면 확대' : '앱 화면 축소', exact: true }).click()
    const previous = current
    await page.waitForFunction((previous) => document.querySelector('output[aria-label="앱 화면 배율"]').textContent !== `${previous}%`, previous)
    current = Number((await page.locator('output[aria-label="앱 화면 배율"]').innerText()).replace('%', ''))
  }
  assert.ok(Math.abs(await factor() - percent / 100) < .001)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('[role="dialog"][data-state="open"]'))
}
async function checkLayout(label) {
  const result = await page.evaluate(() => {
    const selectors = ['.titlebar', '.reading-main', '.reader-toolbar', '.reader-header-actions', '.assistant-pane:not([hidden])', '.composer-area']
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, regions: selectors.flatMap((selector) => [...document.querySelectorAll(selector)].filter((element) => element.getClientRects().length).map((element) => ({ selector, ...Object.fromEntries(['left', 'top', 'right', 'bottom'].map((key) => [key, element.getBoundingClientRect()[key]])) }))) }
  })
  assert.ok(result.scrollWidth <= result.width, `${label}: root overflow`)
  for (const box of result.regions) assert.ok(box.left >= -1 && box.top >= -1 && box.right <= result.width + 1 && box.bottom <= result.height + 1, `${label}: ${JSON.stringify(box)}, viewport ${result.width}x${result.height}`)
}
async function capture(name) {
  await page.screenshot({ scale: 'css' })
  const bytes = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const [width, height] = window.getContentSize()
    return (await window.capturePage()).resize({ width, height }).toPNG()
  })
  await writeFile(`artifacts/app-scale/${name}.png`, Buffer.from(bytes))
}
try {
  await launch()
  await page.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  await page.locator('[data-reading-page="1"] canvas').waitFor()
  const preferences = await page.evaluate(() => localStorage.getItem('paperglim:panels'))
  for (const width of [1420, 1040]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, width === 1040 ? 680 : 900), width)
    for (const percent of [100, 110, 125, 150]) {
      await setScale(percent)
      await checkLayout(`${width}px at ${percent}%`)
      assert.equal(await page.locator('.zoom-label').innerText(), '100%', 'App scale must not change PDF zoom')
      if (percent === 125) {
        await page.keyboard.press('Meta+=')
        await page.waitForFunction(() => document.querySelector('.zoom-label')?.textContent === '115%')
        assert.ok(Math.abs(await factor() - 1.25) < .001, 'PDF shortcuts must keep app scale')
        await page.keyboard.press('Meta+0')
        await page.waitForFunction(() => document.querySelector('.zoom-label')?.textContent === '100%')
        assert.ok(Math.abs(await factor() - 1.25) < .001, 'PDF reset must keep app scale')
      }
      await page.getByRole('button', { name: 'AI 패널 열기' }).click()
      await checkLayout(`${width}px at ${percent}% with chat`)
      assert.equal(await page.locator('#library-pane').isVisible(), await page.evaluate(() => innerWidth >= 900))
      if (percent === 150) await capture(`reading-${width}-150`)
      await page.getByRole('button', { name: 'AI 패널 접기' }).click()
      assert.equal(await page.locator('#library-pane').isVisible(), true)
      assert.equal(await page.evaluate(() => localStorage.getItem('paperglim:panels')), preferences, 'Keep preferred panel widths')
    }
  }
  await settings()
  assert.equal(await page.getByRole('button', { name: '앱 화면 확대', exact: true }).isDisabled(), true)
  await capture('settings-150')
  await app.close(); await launch()
  assert.ok(Math.abs(await factor() - 1.5) < .001, 'App scale survives restart')
  await settings()
  assert.equal(await page.locator('output[aria-label="앱 화면 배율"]').innerText(), '150%')
  await page.getByRole('button', { name: '기본값', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('output[aria-label="앱 화면 배율"]').textContent === '100%')
  assert.ok(Math.abs(await factor() - 1) < .001)
  assert.equal(await page.getByRole('button', { name: '앱 화면 축소', exact: true }).isDisabled(), true)
  assert.equal(await page.evaluate(() => { try { window.paperglim.setAppScale(5); return false } catch { return true } }), true, 'Reject unsupported scale at the bridge')
  await page.evaluate(() => localStorage.setItem('paperglim:app-scale', 'invalid'))
  await page.reload(); await page.locator('.brand').waitFor()
  assert.ok(Math.abs(await factor() - 1) < .001, 'Invalid saved value restores the default')
  assert.equal(await page.evaluate(() => localStorage.getItem('paperglim:app-scale')), '1')
  assert.deepEqual(errors, [])
  console.log('App scale passed: 100/110/125/150%, 1420/1040px, PDF and chat layout, panel restoration, restart persistence, reset and invalid-value guards')
} finally { await app?.close() }
