import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnnotationStore } from '../src/main/annotations.ts'

test('selection discussions persist with exact anchors, survive concurrent saves and can be removed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-notes-'))
  try {
    const store = new AnnotationStore(root)
    const note = { id: 'n1', page: 1, text: 'Selected text', ranges: [{ itemIndex: 2, start: 0, end: 8 }], rects: [{ x: .1, y: .2, width: .3, height: .02 }], messages: [{ role: 'user', text: 'Question' }, { role: 'assistant', text: 'Answer [p. 3]' }], updatedAt: new Date().toISOString() }
    await Promise.all([store.put('paper', note), store.put('paper', { ...note, id: 'n2', page: 2 })])
    assert.equal((await new AnnotationStore(root).get('paper')).length, 2)
    assert.deepEqual((await store.get('paper'))[0].ranges, note.ranges)
    assert.throws(() => store.put('paper', { ...note, rects: [{ x: -1, y: 0, width: 1, height: 1 }] }))
    assert.equal((await store.get('paper')).length, 2)
    await store.put('paper', null, 'n1')
    assert.equal((await store.get('paper'))[0].id, 'n2')
    assert.deepEqual(await store.get('different-paper'), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})
