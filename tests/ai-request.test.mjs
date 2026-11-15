import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AIRequest } from '../src/renderer/src/lib/ai-request.ts'
import { PaperSession } from '../src/renderer/src/lib/paper-session.ts'
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

test('cancelled context preparation ends the UI wait immediately and never starts a later AI call', async () => {
  let finish, calls = 0
  globalThis.window = { paperglim: { askAI: async () => { calls++; return 'answer' }, cancelAI: async () => {} } }
  const operation = new AIRequest('codex', 'model')
  const reference = operation.reference({ reference: () => new Promise((resolve) => { finish = resolve }) })
  const rejected = assert.rejects(reference, /중지/)
  await operation.cancel(); await rejected
  finish('prepared text')
  await assert.rejects(operation.ask('Do not send'), /중지/)
  assert.equal(calls, 0)
})

test('another active question can rebuild shared context after its first owner is cancelled', async () => {
  const session = new PaperSession('paper', OPS)
  let reads = 0, ownerReject, ownerId
  const ids = []
  session.attach({ numPages: 3, fingerprints: ['f'], getPage: async () => ({ view: [0, 0, 600, 800], getTextContent: async () => { reads++; return { items: [{ str: 'Long paper text. '.repeat(1800), transform: [10, 0, 0, 10, 50, 600], width: 400, height: 10 }] } }, getOperatorList: async () => ({ fnArray: [], argsArray: [] }) }) }, OPS)
  globalThis.window = { paperglim: {
    askAI: async (_provider, _prompt, _model, _fast, id) => { ids.push(id); if (id === ownerId) return new Promise((_, reject) => { ownerReject = reject }); return 'Shared evidence [p. 1] [p. 2] [p. 3].' },
    cancelAI: async (id) => { if (id === ownerId) ownerReject(Error('AI 요청을 중지했어.')) }
  } }
  const owner = new AIRequest('codex', 'model'); ownerId = owner.id
  const follower = new AIRequest('codex', 'model')
  const first = owner.reference(session)
  const rejected = assert.rejects(first, /중지/)
  while (!ownerReject) await new Promise((done) => setTimeout(done, 1))
  const second = follower.reference(session)
  await owner.cancel(); await rejected
  assert.match(await second, /근거 요약/)
  assert.equal(reads, 3)
  assert.equal(ids.filter((id) => id === owner.id).length, 1)
  assert.ok(ids.some((id) => id === follower.id))
})
