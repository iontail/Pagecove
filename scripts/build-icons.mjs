import { chromium } from 'playwright'
import { readFile, writeFile, copyFile, mkdtemp, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const directory = await mkdtemp(join(tmpdir(), 'paperglim-icon-'))
const iconset = join(directory, 'icon.iconset')
await mkdir(iconset)
const source = await readFile('resources/icon.svg', 'utf8')
const defs = source.match(/<defs>[\s\S]*?<\/defs>/)?.[0]
const markGroup = source.match(/  <g id="mark"[\s\S]*<\/g>/)?.[0]
assert.ok(defs && markGroup, 'The icon needs its definitions and mark group')
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="220 300 600 420" fill="none">\n${defs}\n${markGroup}\n</svg>\n`
await writeFile('src/renderer/src/assets/paperglim.svg', mark)
await writeFile('website/assets/mark.svg', mark)
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:1024px;height:1024px}</style>${source}`)
  await page.screenshot({ path: 'resources/icon.png', omitBackground: true })
} finally { await browser.close() }
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    await run('sips', ['-z', String(size * scale), String(size * scale), resolve('resources/icon.png'), '--out', join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)])
  }
}
await run('iconutil', ['-c', 'icns', iconset, '-o', resolve('resources/icon.icns')])
await copyFile('resources/icon.svg', 'website/assets/icon.svg')
await copyFile('resources/icon.png', 'website/assets/icon.png')
console.log('Created macOS icon and matching app/site marks from resources/icon.svg')
