import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { ZoteroClient } from '../src/main/zotero.ts'

test('Zotero maps parent metadata, collections, and protects file resolution with server identity', async () => {
  let switched = false
  const server = createServer((request, response) => {
    assert.equal(request.headers['zotero-api-version'], '3')
    assert.equal(request.headers['zotero-allowed-request'], 'true')
    response.setHeader('Zotero-Server-ID', 'fixture-A')
    if (request.url.includes('file/view/url')) {
      assert.equal(request.headers['zotero-server-id'], 'fixture-A')
      if (switched) { response.writeHead(412); response.end(); return }
      response.end('file:///tmp/a%20paper.pdf'); return
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(request.url.includes('collections') ? [{ key: 'COLLECT0', data: { name: 'Research', parentCollection: false } }, { key: 'COLLECT1', data: { name: 'Vision', parentCollection: 'COLLECT0' } }] : [
      { key: 'PARENT01', data: { itemType: 'journalArticle', title: 'ResNet', date: '2015-12-10', creators: [{ firstName: 'Kaiming', lastName: 'He' }], collections: ['COLLECT1'] } },
      { key: 'PDF00001', data: { itemType: 'attachment', parentItem: 'PARENT01', contentType: 'application/pdf', filename: 'resnet.pdf' } },
      { key: 'HTML0001', data: { itemType: 'attachment', contentType: 'text/html' } }
    ]))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const client = new ZoteroClient(`http://127.0.0.1:${server.address().port}/api/`)
    const catalog = await client.catalog()
    assert.equal(catalog.papers.length, 1)
    assert.equal(catalog.papers[0].authors, 'Kaiming He')
    assert.equal(catalog.papers[0].title, 'ResNet')
    assert.equal(catalog.papers[0].year, '2015')
    assert.deepEqual(catalog.papers[0].collections, ['COLLECT1'])
    assert.deepEqual(catalog.collections[1], { key: 'COLLECT1', name: 'Vision', parentKey: 'COLLECT0' })
    assert.deepEqual(await client.resolvePdf('PDF00001'), { path: '/tmp/a paper.pdf', paper: catalog.papers[0] })
    await assert.rejects(() => client.resolvePdf('../private'), /목록/)
    switched = true
    await assert.rejects(() => client.resolvePdf('PDF00001'), /바뀌었어/)
    await assert.rejects(() => client.resolvePdf('PDF00001'), /목록/)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('Zotero rejects disabled access and non-local attachment URLs', async () => {
  let blocked = true
  let empty = false
  const server = createServer((request, response) => {
    if (blocked) { response.writeHead(403); response.end(); return }
    if (request.url.includes('file/view/url')) { response.end(empty ? '' : 'https://example.org/private.pdf'); return }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(request.url.includes('collections') ? [] : [{ key: 'PDF00001', data: { itemType: 'attachment', contentType: 'application/pdf' } }]))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const client = new ZoteroClient(`http://127.0.0.1:${server.address().port}/api/`)
    await assert.rejects(() => client.catalog(), /통신이 허용되지/)
    blocked = false
    await client.catalog()
    await assert.rejects(() => client.resolvePdf('PDF00001'), /로컬 PDF 경로/)
    empty = true
    await assert.rejects(() => client.resolvePdf('PDF00001'), (error) => error.code === 'ZOTERO_MISSING' && /다운로드/.test(error.message))
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
