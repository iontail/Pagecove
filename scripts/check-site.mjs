import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'

const root = resolve('website')
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  const file = resolve(root, `.${path === '/' ? '/index.html' : path}`)
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return }
  try { response.setHeader('Content-Type', types[extname(file)] ?? 'text/plain'); response.end(await readFile(file)) }
  catch { response.writeHead(404).end() }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const browser = await chromium.launch({ channel: 'chrome' })
await mkdir('artifacts', { recursive: true })
try {
  const page = await browser.newPage()
  const failures = []
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`) })
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['mobile', 390, 844], ['small', 320, 720]]) {
    await page.setViewportSize({ width, height })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.evaluate(async () => {
      await document.fonts.ready
      document.querySelectorAll('img').forEach((image) => image.loading = 'eager')
      await Promise.all([...document.images].map((image) => image.decode()))
    })
    assert.equal(await page.locator('h1').count(), 1)
    const downloads = await page.locator('a[href$=".dmg"]').evaluateAll((links) => links.map((link) => link.href))
    assert.equal(downloads.length, 1, 'Offer one Apple Silicon download')
    assert.ok(downloads[0].endsWith('-mac-arm64.dmg'))
    assert.ok(downloads[0].endsWith(`/v${version}/PaperGlim-${version}-mac-arm64.dmg`), 'Download must match the current app release')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`)
    const anchors = await page.locator('a[href^="#"]').evaluateAll((links) => links.map((link) => ({ href: link.getAttribute('href'), exists: !!document.querySelector(link.getAttribute('href')) })))
    assert.ok(anchors.every((anchor) => anchor.exists), `${name}: broken section link`)
    assert.equal(await page.locator('.setup-list details[open]').count(), 0, 'Setup guides start collapsed')
    await page.locator('.faq summary').first().focus()
    await page.keyboard.press('Enter')
    assert.equal(await page.locator('.faq details').first().getAttribute('open'), '')
    await page.keyboard.press('Enter')
    await page.locator('.faq summary').first().blur()
    await page.screenshot({ path: `artifacts/site-${name}.png`, fullPage: true })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('#start-guide summary').click()
  assert.equal(await page.locator('#start-guide .guide-shot').isVisible(), true)
  await page.locator('#start-guide').screenshot({ path: 'artifacts/site-usage-open.png' })
  await page.locator('#start-guide a[href="#ai-setup"]').click()
  assert.equal(await page.locator('#ai-setup').getAttribute('open'), '')
  await page.locator('.install-note').click()
  assert.equal(await page.locator('#first-open').getAttribute('open'), '')
  await page.locator('#first-open summary').click()
  await page.locator('.install-note').click()
  assert.equal(await page.locator('#first-open').getAttribute('open'), '', 'Same guide link reopens a closed guide')
  await page.locator('a[href="#zotero-setup"]').click()
  assert.equal(await page.locator('#zotero-setup').getAttribute('open'), '')
  await page.reload()
  assert.equal(await page.locator('#zotero-setup').getAttribute('open'), '', 'Direct guide links survive reload')
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto')
  assert.deepEqual(failures, [])
  console.log('Site passed: 1440/820/390/320px, current download, real app images, usage guide links, setup opening/reopening/deep links, keyboard FAQ, reduced motion and no page errors')
} finally { await browser.close(); await new Promise((done) => server.close(done)) }
