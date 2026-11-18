import assert from 'node:assert/strict'
import { _electron } from 'playwright'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const env = { ...process.env, PAPERGLIM_PROFILE_DIR: await mkdtemp(join(tmpdir(), 'paperglim-tooltips-')), PAPERGLIM_BACKGROUND: '' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const bundle = process.argv[2]
const app = await _electron.launch({ ...(bundle ? { executablePath: resolve(bundle, 'Contents/MacOS/Pagecove') } : { args: [resolve('.')] }), env })
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(15000)
  const errors = []; page.on('pageerror', (error) => errors.push(error.message))
  async function audit() {
    const missing = await page.locator('button').evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length && button.querySelector('svg') && !button.textContent.trim() && !button.title.trim() && !button.dataset.tooltipLabel).map((button) => button.getAttribute('aria-label') || button.outerHTML))
    assert.deepEqual(missing, [])
  }
  await page.locator('.brand').waitFor(); await audit()
  assert.match(await page.getByRole('button', { name: '연결 설정 열기' }).getAttribute('data-tooltip-label'), /설정.*⌘,/)
  await page.getByRole('button', { name: 'ResNet 예제 열기' }).click()
  await page.locator('[data-reading-page="1"] canvas').waitFor(); await audit()
  const previous = page.getByRole('button', { name: '이전 페이지', exact: true })
  assert.equal(await previous.isDisabled(), true)
  assert.equal(await previous.getAttribute('data-tooltip-label'), '이전 페이지')
  await previous.locator('..').hover()
  await page.locator('.app-tooltip').filter({ hasText: '이전 페이지' }).waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await previous.locator('..').evaluate((trigger) => getComputedStyle(trigger).pointerEvents), 'auto')
  await previous.evaluate((button) => button.click())
  assert.equal(await page.getByRole('textbox', { name: '페이지 번호' }).inputValue(), '1')
  assert.match(await page.getByRole('button', { name: '본문 검색', exact: true }).getAttribute('data-tooltip-label'), /⌘F/)
  await page.getByRole('button', { name: '본문 검색', exact: true }).click(); await audit()
  assert.equal(await page.getByRole('button', { name: '본문 검색 닫기' }).getAttribute('data-tooltip-label'), '본문 검색 닫기')
  await page.keyboard.press('Escape')
  await page.locator('[data-reading-page="1"] [data-text-index]').filter({ hasText: /\S/ }).first().click({ clickCount: 3 })
  await page.getByRole('toolbar', { name: '선택 영역 도구' }).waitFor(); await audit()
  assert.equal(await page.getByRole('button', { name: '선택 영역 도구 닫기' }).getAttribute('data-tooltip-label'), '선택 영역 도구 닫기')
  await page.keyboard.press('Escape')
  if (await page.getByRole('button', { name: 'AI 패널 열기' }).isVisible()) await page.getByRole('button', { name: 'AI 패널 열기' }).click(); await audit()
  assert.equal(await page.getByRole('button', { name: 'AI 패널 접기' }).getAttribute('data-tooltip-label'), 'AI 패널 접기')
  await page.getByRole('button', { name: '연결 설정 열기' }).click(); await audit()
  assert.equal(await page.locator('[data-slot="dialog-close"]').getAttribute('title'), '닫기')
  assert.equal(await page.getByRole('button', { name: '앱 화면 확대', exact: true }).getAttribute('data-tooltip-label'), '앱 화면 확대')
  await page.getByRole('button', { name: '앱 화면 확대', exact: true }).focus()
  await page.locator('.app-tooltip').filter({ hasText: '앱 화면 확대' }).waitFor()
  await page.keyboard.press('Escape')
  assert.deepEqual(errors, [])
  console.log('Icon tooltips passed: library, PDF, disabled controls, shortcuts, search, selection, AI and settings; disabled actions remain blocked.')
} finally { await app.close() }
