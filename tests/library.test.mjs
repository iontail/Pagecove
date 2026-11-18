import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PaperLibrary } from '../src/main/library.ts'

test('shelf previews leave reading recency, position and persisted metadata unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-preview-'))
  try {
    const pdf = join(root, 'paper.pdf'), directory = join(root, 'profile')
    await writeFile(pdf, '%PDF-1.7\nfixture')
    const library = new PaperLibrary(directory)
    await library.load()
    await library.importZotero([{ path: pdf, paper: { key: 'PREVIEW1', title: 'Preview test', filename: 'paper.pdf', authors: '', year: '', collections: [] } }])
    const [paper] = library.list()
    await library.updatePage(paper.id, 5)
    const before = await readFile(join(directory, 'library.json'), 'utf8')
    assert.match(Buffer.from(await library.read(paper.id, false)).toString(), /^%PDF/)
    assert.equal(await readFile(join(directory, 'library.json'), 'utf8'), before)
    assert.equal(library.list()[0].lastOpenedAt, '')
    assert.equal(library.list()[0].page, 5)
    await library.read(paper.id)
    assert.ok(library.list()[0].lastOpenedAt)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('recent PDFs retain their identity and reading position across reloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-library-'))
  try {
    const pdf = join(root, 'paper.pdf')
    await writeFile(pdf, '%PDF-1.7\nfixture')
    const library = new PaperLibrary(join(root, 'profile'))
    await library.load()
    const [paper] = await library.add([pdf])
    const zotero = { key: 'PDF00001', title: 'A Zotero paper', filename: 'paper.pdf', authors: '', year: '', collections: ['CHILD001'] }
    const [linked] = await library.add([pdf], zotero)
    assert.equal(linked.id, paper.id)
    assert.equal(linked.name, 'A Zotero paper')
    assert.equal(linked.source, 'zotero')
    const collections = [{ key: 'ROOT0001', name: 'Research', parentKey: null }, { key: 'CHILD001', name: 'Vision', parentKey: 'ROOT0001' }]
    await library.syncZotero({ papers: [{ ...zotero, collections: ['ROOT0001'] }], collections })
    assert.deepEqual(library.list()[0].collectionKeys, ['ROOT0001'])
    await library.updatePage(paper.id, 4)
    const [reopened] = await library.add([pdf])
    assert.equal(reopened.id, paper.id)
    assert.equal(reopened.page, 4)
    assert.equal(library.list().length, 1)
    assert.equal('path' in library.list()[0], false)
    const restored = new PaperLibrary(join(root, 'profile'))
    await restored.load()
    assert.deepEqual(restored.getCollections(), collections)
    assert.deepEqual(restored.list()[0].collectionKeys, ['ROOT0001'])
    assert.equal(restored.list()[0].page, 4)
    assert.match(Buffer.from(await restored.read(paper.id)).toString(), /^%PDF/)
    await restored.remove(paper.id)
    assert.equal(restored.list().length, 0)
    assert.match(await readFile(pdf, 'utf8'), /^%PDF/)
    await assert.rejects(() => restored.read(paper.id), /목록에 없는/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('invalid page updates and non-PDF files do not overwrite valid state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-validation-'))
  try {
    const library = new PaperLibrary(join(root, 'profile'))
    await library.load()
    const pdf = join(root, 'paper.pdf')
    const text = join(root, 'notes.txt')
    await writeFile(pdf, '%PDF-1.7\nfixture')
    await writeFile(text, 'private notes')
    const [paper] = await library.add([pdf])
    for (const page of [0, -1, 1.5, NaN]) await assert.rejects(() => library.updatePage(paper.id, page))
    await assert.rejects(() => library.add([text]), /PDF 파일/)
    await assert.rejects(() => library.read(text), /목록에 없는/)
    assert.equal(library.list()[0].page, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('legacy Zotero imports recover memberships by exact path and moved attachments retain identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-migration-'))
  try {
    const directory = join(root, 'profile')
    const original = join(root, 'old.pdf')
    const moved = join(root, 'moved.pdf')
    await writeFile(original, '%PDF-1.7\nfixture')
    await writeFile(moved, '%PDF-1.7\nfixture')
    const library = new PaperLibrary(directory)
    await library.load()
    const [paper] = await library.add([original])
    const stored = JSON.parse(await readFile(join(directory, 'library.json'), 'utf8'))
    stored[0].source = 'zotero'
    await writeFile(join(directory, 'library.json'), JSON.stringify(stored))
    const restored = new PaperLibrary(directory)
    await restored.load()
    assert.equal(restored.unlinkedZotero().length, 1)
    const remote = { key: 'PDF00001', title: 'Updated title', filename: 'moved.pdf', authors: '', year: '', collections: ['ROOT0001'] }
    await restored.syncZotero({ papers: [remote], collections: [] }, new Map([[original, remote.key]]))
    assert.equal(restored.unlinkedZotero().length, 0)
    assert.deepEqual(restored.list()[0].collectionKeys, ['ROOT0001'])
    const [relinked] = await restored.add([moved], remote)
    assert.equal(relinked.id, paper.id)
    assert.equal(restored.list().length, 1)
    await restored.syncZotero({ papers: [], collections: [] })
    assert.deepEqual(restored.list()[0].collectionKeys, [])
    assert.match(Buffer.from(await restored.read(paper.id)).toString(), /^%PDF/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Zotero bulk sync registers local PDFs, skips missing files, and preserves reading positions on resync', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-bulk-'))
  try {
    const library = new PaperLibrary(join(root, 'profile'))
    await library.load()
    const path = join(root, 'paper.pdf')
    await writeFile(path, '%PDF-1.7\nfixture')
    const remote = { key: 'PDF00001', title: 'A paper', filename: 'paper.pdf', authors: '', year: '', collections: ['COLLECT1'] }
    const files = [{ path, paper: remote }, { path: join(root, 'missing.pdf'), paper: { ...remote, key: 'PDF00002' } }]
    assert.deepEqual(await library.importZotero(files), { available: 1, unavailable: 1 })
    const first = library.list()[0]
    await library.updatePage(first.id, 5)
    assert.deepEqual(await library.importZotero(files), { available: 1, unavailable: 1 })
    const [paper] = library.list()
    assert.equal(library.list().length, 1)
    assert.equal(paper.id, first.id)
    assert.equal(paper.lastOpenedAt, first.lastOpenedAt)
    assert.equal(paper.page, 5)
    assert.deepEqual(paper.collectionKeys, ['COLLECT1'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('relink verifies PDF contents and preserves identity, page and removal undo across a move', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-relink-'))
  try {
    const original = join(root, 'original.pdf'), moved = join(root, 'moved.pdf'), other = join(root, 'other.pdf')
    await writeFile(original, '%PDF-1.7\noriginal')
    await writeFile(moved, '%PDF-1.7\noriginal')
    await writeFile(other, '%PDF-1.7\ndifferent')
    const library = new PaperLibrary(join(root, 'profile'))
    await library.load()
    const [paper] = await library.add([original])
    await library.read(paper.id)
    await library.updatePage(paper.id, 7)
    const restored = new PaperLibrary(join(root, 'profile'))
    await restored.load()
    await rm(original)
    await assert.rejects(() => restored.read(paper.id), /다시 지정/)
    await assert.rejects(() => restored.relink(paper.id, other), /내용이 달라/)
    const linked = await restored.relink(paper.id, moved)
    assert.equal(linked.id, paper.id)
    assert.equal(linked.page, 7)
    assert.equal('path' in linked, false)
    assert.equal('fingerprint' in linked, false)
    assert.match(Buffer.from(await restored.read(paper.id)).toString(), /original/)
    await restored.remove(paper.id)
    assert.equal(restored.list().length, 0)
    const undone = await restored.undoRemove()
    assert.equal(undone.id, paper.id)
    assert.equal(undone.page, 7)
    await assert.rejects(() => restored.undoRemove(), /되돌릴/)
    assert.equal(restored.list().length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('legacy relinking requires explicit confirmation and duplicate undo cannot overwrite a new registration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-relink-legacy-'))
  try {
    const path = join(root, 'paper.pdf')
    await writeFile(path, '%PDF-1.7\nfixture')
    const library = new PaperLibrary(join(root, 'profile'))
    await library.load()
    const [paper] = await library.add([path])
    await assert.rejects(() => library.relink(paper.id, path), { code: 'UNVERIFIED_PDF' })
    assert.equal((await library.relink(paper.id, path, true)).id, paper.id)
    await library.remove(paper.id)
    await library.add([path])
    await assert.rejects(() => library.undoRemove(), /이미 다시 등록/)
    assert.equal(library.list().length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('bundled ResNet reconnects after an app upgrade without changing its document identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-example-migration-'))
  try {
    const source = join(root, 'new-example.pdf')
    await writeFile(source, '%PDF-1.7\nexample')
    const directory = join(root, 'profile')
    const library = new PaperLibrary(directory)
    await library.load()
    const [paper] = await library.add([source])
    await library.read(paper.id)
    await library.updatePage(paper.id, 3)
    const stored = JSON.parse(await readFile(join(directory, 'library.json'), 'utf8'))
    stored[0].path = join(root, 'old/PaperGlim.app/Contents/Resources/app.asar/resources/ResNet.pdf')
    await writeFile(join(directory, 'library.json'), JSON.stringify(stored))
    const updated = new PaperLibrary(directory, source)
    await updated.load()
    assert.match(Buffer.from(await updated.read(paper.id)).toString(), /example/)
    assert.equal(updated.list()[0].id, paper.id)
    assert.equal(updated.list()[0].page, 3)
  } finally { await rm(root, { recursive: true, force: true }) }
})
