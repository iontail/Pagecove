import { chromium } from 'playwright'
import { readFile, mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const directory = await mkdtemp(join(tmpdir(), 'paperglim-icon-'))
const iconset = join(directory, 'icon.iconset')
await mkdir(iconset)
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:1024px;height:1024px}</style>${await readFile('resources/icon.svg', 'utf8')}`)
  await page.screenshot({ path: 'resources/icon.png', omitBackground: true })
} finally { await browser.close() }
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    await run('sips', ['-z', String(size * scale), String(size * scale), resolve('resources/icon.png'), '--out', join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)])
  }
}
await run('iconutil', ['-c', 'icns', iconset, '-o', resolve('resources/icon.icns')])
console.log('Created resources/icon.png and resources/icon.icns')
