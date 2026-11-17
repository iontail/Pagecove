import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releaseUpdate } from '../src/main/app-info.ts'

const release = (version, extra = {}) => ({ tag_name: `v${version}`, body: 'Changes', assets: [{ name: `PaperGlim-${version}-mac-arm64.dmg` }], ...extra })
test('update checks compare numeric versions and only advertise published installable releases', () => {
  const releases = [release('0.1.9'), release('0.1.10'), release('0.2.0', { draft: true }), release('0.3.0', { assets: [] }), { tag_name: '../../bad', assets: [] }]
  const result = releaseUpdate(releases, '0.1.8')
  assert.equal(result.version, '0.1.10')
  assert.equal(result.available, true)
  assert.equal(result.url, 'https://github.com/iontail/PaperGlim/releases/tag/v0.1.10')
  assert.equal(releaseUpdate([release('0.1.8')], '0.1.8').available, false)
  assert.equal(releaseUpdate([release('0.1.7', { prerelease: true })], '0.1.8').ahead, true)
  assert.throws(() => releaseUpdate([], '0.1.8'))
  assert.throws(() => releaseUpdate(null, '0.1.8'))
})
