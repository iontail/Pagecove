import { backupPreferences } from '../src/shared/backup.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, access, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BackupStore, mergeBackup, validateBackup } from '../src/main/backup.ts'

const paper = (id = 'p1') => ({ id, name: id, path: `/papers/${id}.pdf`, page: 4, addedAt: '2026-11-16T00:00:00Z', lastOpenedAt: '', fingerprint: 'a'.repeat(64) })
const note = (id = 'n1') => ({ id, page: 1, text: 'Selected text', ranges: [{ itemIndex: 0, start: 0, end: 8 }], rects: [{ x: .1, y: .2, width: .3, height: .02 }], messages: [{ role: 'assistant', text: 'Answer [p. 3]' }], updatedAt: '2026-11-16T00:00:00Z' })
const cache = (pages = [1]) => ({ version: 1, fingerprint: 'a'.repeat(64), entries: pages.map((page) => ({ page, included: [], results: [], selected: true })), visible: pages })
const data = (extra = {}) => ({ format: 'PaperGlim', version: 1, appVersion: '0.1.9', createdAt: '2026-11-16T00:00:00Z', papers: [paper()], collections: [], annotations: { p1: [note()] }, translations: { p1: cache() }, preferences: { 'paperglim:app-scale': '1.25' }, ...extra })
async function seed(directory, snapshot) {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'library.json'), JSON.stringify(snapshot.papers))
  await writeFile(join(directory, 'zotero-collections.json'), JSON.stringify(snapshot.collections))
  for (const [name, records] of [['annotations', snapshot.annotations], ['translations', snapshot.translations]]) {
    await mkdir(join(directory, name), { recursive: true })
    for (const [id, value] of Object.entries(records)) await writeFile(join(directory, name, `${encodeURIComponent(id)}.json`), JSON.stringify(value))
  }
}
test('backup includes only domain data and allowlisted preferences, with translation caches optional', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-backup-'))
  try {
    const directory = join(root, 'profile'), store = new BackupStore(directory, '0.1.9')
    await seed(directory, data())
    const preferences = { 'paperglim:app-scale': '1.25', 'paperglim:chat:p1': 'private draft', token: 'secret' }
    await store.export(join(root, 'backup.json'), preferences, false)
    const exported = JSON.parse(await readFile(join(root, 'backup.json'), 'utf8'))
    assert.equal(exported.papers[0].id, 'p1')
    assert.equal(exported.annotations.p1.length, 1)
    assert.deepEqual(exported.preferences, { 'paperglim:app-scale': '1.25' })
    assert.deepEqual(exported.translations, {})
    assert.equal(JSON.stringify(exported).includes('private draft'), false)
    await store.export(join(root, 'cached.json'), preferences, true)
    assert.equal(JSON.parse(await readFile(join(root, 'cached.json'), 'utf8')).translations.p1.entries.length, 1)
    await assert.rejects(() => store.export(join(directory, 'library.json'), preferences, false), /자료 폴더 밖/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('restore merges missing records and keeps existing positions, explanations and translation pages', () => {
  const current = data({ annotations: { p1: [{ ...note(), text: 'Current' }] }, preferences: {} })
  const incoming = data({ papers: [paper(), paper('p2'), { ...paper('p3'), path: '/papers/p1.pdf' }], annotations: { p1: [note(), note('n2')] }, translations: { p1: cache([1, 2]) } })
  const result = mergeBackup(validateBackup(current), validateBackup(incoming))
  assert.equal(result.addedDocuments, 1)
  assert.equal(result.conflicts, 1)
  assert.equal(result.explanations, 1)
  assert.equal(result.translationPages, 1)
  assert.equal(result.data.papers[0].page, 4)
  assert.equal(result.data.annotations.p1[0].text, 'Current')
  assert.equal(result.data.translations.p1.entries.length, 2)
  assert.deepEqual(current.translations.p1.visible, [1], 'Preview must not modify live data')
})
test('backup preserves review marks, concept mode and figure geometry without image payloads', () => {
  const notes = [{ ...note('review'), messages: [], review: true, study: 'concept' }, { ...note('figure'), kind: 'figure', ranges: [], review: true }]
  const result = mergeBackup(validateBackup(data({ annotations: {} })), validateBackup(data({ annotations: { p1: notes } })))
  assert.deepEqual(result.data.annotations.p1, notes)
})
test('malformed backups, unrelated record IDs and cyclic collections are rejected before writing', () => {
  for (const value of [null, data({ version: 2 }), data({ papers: [{ ...paper(), path: 'https://example.org/file.pdf' }] }), data({ annotations: { other: [note()] } }), data({ collections: [{ key: 'a', name: 'A', parentKey: 'b' }, { key: 'b', name: 'B', parentKey: 'a' }] }), data({ preferences: { 'paperglim:app-scale': '99' } })]) assert.throws(() => validateBackup(value))
})
test('restore verifies the preview is current and applies settings only when requested', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-restore-'))
  try {
    const directory = join(root, 'profile'), source = join(root, 'backup.json'), store = new BackupStore(directory, '0.1.9')
    await seed(directory, data({ papers: [], annotations: {}, translations: {}, preferences: {} }))
    await writeFile(source, JSON.stringify(data()))
    const plan = await store.prepare(source, { 'paperglim:app-scale': '1' })
    assert.equal(plan.summary.addedDocuments, 1)
    await store.restore(plan, { 'paperglim:app-scale': '1' }, true)
    assert.equal(JSON.parse(await readFile(join(directory, 'library.json'), 'utf8'))[0].id, 'p1')
    assert.equal((await store.restoredPreferences()).preferences['paperglim:app-scale'], '1.25')
    const stale = await store.prepare(source, {})
    await writeFile(join(directory, 'library.json'), JSON.stringify([{ ...paper(), page: 8 }]))
    await assert.rejects(() => store.restore(stale, {}, false), /資料|자료가 바뀌었어/)
    assert.equal(JSON.parse(await readFile(join(directory, 'library.json'), 'utf8'))[0].page, 8)
    const fresh = await store.prepare(source, {})
    await store.restore(fresh, {}, false)
    assert.deepEqual((await store.restoredPreferences()).preferences, {}, 'Settings restore must be explicitly selected')
    await assert.rejects(() => access(join(directory, 'restore-journal.json')))
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('a disk failure after partial writes rolls back every domain file and newly created records', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-rollback-'))
  try {
    const directory = join(root, 'profile'), source = join(root, 'backup.json'), store = new BackupStore(directory, '0.1.9')
    await seed(directory, data())
    await writeFile(source, JSON.stringify(data({ papers: [paper(), paper('p2')], annotations: { p2: [note('new')] }, translations: {} })))
    const before = await readFile(join(directory, 'library.json'), 'utf8')
    const plan = await store.prepare(source, {})
    const write = store.write.bind(store)
    let failed = false
    t.mock.method(store, 'write', async (path, content) => { await write(path, content); if (path.endsWith('/annotations/p2.json') && !failed) { failed = true; throw Error('disk failure') } })
    await assert.rejects(() => store.restore(plan, {}, true), /disk failure/)
    assert.equal(await readFile(join(directory, 'library.json'), 'utf8'), before)
    assert.equal(JSON.parse(await readFile(join(directory, 'annotations/p1.json'), 'utf8'))[0].id, 'n1')
    await assert.rejects(() => access(join(directory, 'annotations/p2.json')))
    await assert.rejects(() => access(join(directory, 'restored-preferences.json')))
    await assert.rejects(() => access(join(directory, 'restore-journal.json')))
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('startup recovers an interrupted transaction and refuses symlinked output folders', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-recovery-'))
  try {
    const directory = join(root, 'profile'), store = new BackupStore(directory, '0.1.9'), id = randomUUID()
    await seed(directory, data())
    const original = await readFile(join(directory, 'library.json'), 'utf8')
    await mkdir(join(directory, `restore-${id}`))
    await writeFile(join(directory, `restore-${id}`, '0'), original)
    await writeFile(join(directory, 'library.json'), '[]')
    await writeFile(join(directory, 'restore-journal.json'), JSON.stringify({ id, status: 'pending', files: [{ path: 'library.json', existed: true }] }))
    await store.recover()
    assert.equal(await readFile(join(directory, 'library.json'), 'utf8'), original)
    await rm(join(directory, 'annotations'), { recursive: true })
    await mkdir(join(root, 'outside'))
    await symlink(join(root, 'outside'), join(directory, 'annotations'))
    await assert.rejects(() => store.transaction(new Map([['annotations/new.json', '[]']])), /연결 경로/)
    await assert.rejects(() => access(join(root, 'outside/new.json')))
  } finally { await rm(root, { recursive: true, force: true }) }
})

 test('shelf preferences survive backup filtering while invalid view modes are rejected', () => {
  const settings = { 'paperglim:shelf-view': 'list', 'paperglim:shelf-sort': 'title', 'paperglim:library-collapsed': 'true' }
  assert.deepEqual(backupPreferences(settings), settings)
  assert.throws(() => backupPreferences({ 'paperglim:shelf-view': 'unknown' }))
})


test('appearance backup preserves valid themes and rejects unknown theme values', () => {
  assert.deepEqual(backupPreferences({ 'paperglim:theme': 'dark' }), { 'paperglim:theme': 'dark' })
  assert.deepEqual(backupPreferences({ 'paperglim:theme': 'light' }), { 'paperglim:theme': 'light' })
  assert.throws(() => backupPreferences({ 'paperglim:theme': 'automatic' }), /테마/)
})

test('backup keeps palette separately from brightness and rejects unsupported palettes', () => {
  for (const palette of ['neutral', 'cream']) assert.deepEqual(backupPreferences({ 'paperglim:palette': palette, 'paperglim:theme': 'dark' }), { 'paperglim:palette': palette, 'paperglim:theme': 'dark' })
  assert.throws(() => backupPreferences({ 'paperglim:palette': 'unknown' }), /색상 테마/)
})
