import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const bundle = resolve(process.argv[2] ?? 'release/mac-arm64/PaperGlim.app')
const profile = await mkdtemp(join(tmpdir(), 'paperglim-package-'))
const env = { ...process.env, PAPERGLIM_PROFILE_DIR: profile, PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const app = await _electron.launch({ executablePath: join(bundle, 'Contents/MacOS/PaperGlim'), env })
const errors = []
try {
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true)
  const page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: '논문을 열어 읽기' }).waitFor()
  await page.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  await page.locator('[data-reading-page="1"] canvas').waitFor({ timeout: 60000 })
  await page.keyboard.press('Meta+=')
  await page.waitForFunction(() => document.querySelector('.zoom-label')?.textContent === '115%')
  await page.locator('body').dispatchEvent('keydown', { key: '=', metaKey: true, isComposing: true })
  assert.equal(await page.locator('.zoom-label').innerText(), '115%', 'IME composition must not zoom')
  await page.keyboard.press('Meta+0')
  await page.waitForFunction(() => document.querySelector('.zoom-label')?.textContent === '100%')
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()), 1)
  assert.equal(await page.locator('.brand img').evaluate((img) => img.complete && img.naturalWidth > 0), true)
  const papers = await page.evaluate(() => window.paperglim.listPapers())
  assert.equal(papers.length, 1)
  assert.equal(papers[0].name, 'ResNet')
  await page.getByRole('button', { name: 'AI 패널 열기' }).click()
  await page.getByRole('button', { name: 'AI 모델', exact: true }).click()
  await page.getByRole('menu', { name: 'AI 모델 선택', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  assert.deepEqual(errors, [])
  console.log('Packaged app passed: standalone launch, bundled PDF, PDF zoom shortcuts and IME guard, icon, library and model menu')
} finally { await app.close() }
