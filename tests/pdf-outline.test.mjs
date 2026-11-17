import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pdfOutline } from '../src/renderer/src/lib/pdf-outline.ts'

test('PDF outline resolves named and reference destinations without inventing headings or opening URLs', async () => {
  const entries = await pdfOutline({
    numPages: 12,
    getOutline: async () => [{ title: 'Introduction', dest: [0], items: [{ title: 'Method', dest: 'method' }] }, { title: 'Results', dest: [{ num: 21, gen: 0 }] }, { title: 'Invalid', dest: [99] }, { title: 'External', url: 'https://example.com' }, { title: 'Broken', dest: 'broken' }],
    getDestination: async (name) => { if (name === 'broken') throw Error('bad PDF'); return [3] },
    getPageIndex: async () => 7
  })
  assert.deepEqual(entries, [{ title: 'Introduction', page: 1, depth: 0 }, { title: 'Method', page: 4, depth: 1 }, { title: 'Results', page: 8, depth: 0 }])
  assert.deepEqual(await pdfOutline({ getOutline: async () => null }), [])
})
