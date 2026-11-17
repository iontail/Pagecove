import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestError, requestFailure } from '../src/shared/failures.ts'

test('known provider failures survive IPC wrapping without displaying raw credentials', () => {
  const cases = [['invalid_api_key Bearer SECRET', 'auth'], ['model_not_found', 'model'], ['rate_limit_exceeded', 'limit'], ['ETIMEDOUT', 'timeout'], ['fetch failed', 'network'], ['command not found', 'install'], ['Fast 요청이 거부됐어', 'fast'], ['service_tier default; unrelated error SECRET', 'unknown']]
  for (const [raw, expected] of cases) {
    const failure = requestFailure(new Error(`Error invoking remote method 'ai:ask': Error: ${requestError(raw).message}`))
    assert.equal(failure.kind, expected)
    assert.equal(failure.message.includes('SECRET'), false)
  }
  assert.equal(requestFailure(new Error('Zotero 통신이 허용되지 않았어.'), 'zotero').kind, 'zotero')
  assert.equal(requestFailure(new Error('Unknown failure')).kind, 'unknown')
})
