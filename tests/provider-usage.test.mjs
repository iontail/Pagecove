import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { codexUsage, claudeUsage, usageLabel, usageWindow } from '../src/shared/provider-usage.ts'
import { readCodexRateLimits } from '../src/main/provider-usage.ts'

const now = 1800000000000
const future = now / 1000 + 3600

test('quota parsing preserves zero, rejects invalid data and labels actual windows', () => {
  assert.equal(usageWindow(100, 10080, future, now).remainingPercent, 0)
  assert.equal(usageWindow(0, 300, future, now).remainingPercent, 100)
  assert.equal(usageWindow(94.3, 10080, future, now).remainingPercent, 5)
  for (const used of [null, undefined, '94', -1, 101, NaN, Infinity]) assert.equal(usageWindow(used, 300, future, now), null)
  assert.equal(usageWindow(0, 300, now / 1000, now), null)
  assert.equal(usageLabel(usageWindow(94, 10080, future, now)), '7일')
  assert.equal(usageLabel(usageWindow(94, 300, future, now)), '5시간')
  const real = { primary: { usedPercent: 94, windowDurationMins: 10080, resetsAt: future }, secondary: null }
  assert.equal(codexUsage({ rateLimitsByLimitId: { codex: real } }, now).windows[0].remainingPercent, 6)
  assert.equal(codexUsage({ rateLimits: { ...real, limitId: 'code_review' } }, now).status, 'unavailable')
  assert.equal(codexUsage(null, now).windows.length, 0)
})
test('Claude cache requires freshness and matching accounts; missing stats never become 100%', () => {
  const config = { oauthAccount: { accountUuid: 'account' }, cachedUsageUtilization: { fetchedAtMs: now, accountUuid: 'account', utilization: { five_hour: { utilization: 20, resets_at: new Date(future * 1000).toISOString() }, seven_day: { utilization: 100, resets_at: future } } } }
  assert.deepEqual(claudeUsage(config, now).windows.map(w => w.remainingPercent), [80, 0])
  assert.equal(claudeUsage(config, now + 600001).status, 'unavailable')
  assert.equal(claudeUsage(config, now - 1).status, 'unavailable')
  assert.equal(claudeUsage({ ...config, oauthAccount: { accountUuid: 'other' } }, now).status, 'unavailable')
  assert.equal(claudeUsage({ cachedUsageUtilization: { fetchedAtMs: now, utilization: {} } }, now).status, 'unavailable')
  assert.equal(claudeUsage(null, now).status, 'unavailable')
})
test('read-only Codex transport initializes then reads quota without opening a model thread', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paperglim-quota-test-'))
  try {
    const executable = join(directory, 'fixture')
    await writeFile(executable, `#!${process.execPath}\nconst rl=require('node:readline').createInterface({input:process.stdin});let initialized=false;rl.on('line',line=>{const value=JSON.parse(line);if(value.method==='initialize'){if(value.params.capabilities.explicitGatewayOauth!==true)process.exit(2);process.stdout.write('null\\n{"id":1,"result":{}}\\n')}else if(value.method==='initialized')initialized=true;else if(value.method==='account/rateLimits/read'&&initialized){const reply=JSON.stringify({id:2,result:{rateLimits:{primary:{usedPercent:44}}}})+'\\n';process.stdout.write(reply.slice(0,12));setTimeout(()=>process.stdout.write(reply.slice(12)),5)}else process.exit(3)})`, { mode: 0o700 })
    assert.equal((await readCodexRateLimits(executable)).rateLimits.primary.usedPercent, 44)
    await writeFile(executable, `#!${process.execPath}\nsetInterval(()=>{},1000)`, { mode: 0o700 })
    await assert.rejects(readCodexRateLimits(executable, 100), /시간이 초과/)
    await writeFile(executable, `#!${process.execPath}\nprocess.stdout.write('{"id":1,"error":{"message":"secret-token"}}\\n');setInterval(()=>{},1000)`, { mode: 0o700 })
    await assert.rejects(readCodexRateLimits(executable), error => !error.message.includes('secret-token') && /로그인/.test(error.message))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
