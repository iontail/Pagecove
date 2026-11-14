import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { askProvider, codexModels, getProviders } from '../src/main/providers.ts'

test('provider uses cached account models, isolates working files, and reports unsupported models', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-provider-test-'))
  const previousPath = process.env.PATH
  const previousHome = process.env.CODEX_HOME
  try {
    process.env.PATH = `${root}:${dirname(process.execPath)}`
    process.env.CODEX_HOME = root
    await writeFile(join(root, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'account-model', display_name: 'Account Model', visibility: 'list', service_tiers: [{ id: 'priority' }] }, { slug: 'standard-only', visibility: 'list' }, { slug: 'hidden-model', visibility: 'hide' }] }))
    await writeFile(join(root, 'codex'), `#!${process.execPath}\nif(process.argv.includes('--version')){console.log('codex-cli 0.157.1');process.exit(0)}if(process.argv.includes('features')){console.log('fast_mode stable true');process.exit(0)}let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{if(prompt==='unsupported'){process.stderr.write('model_not_found');process.exitCode=1}else console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),prompt}))});\n`, { mode: 0o700 })
    await writeFile(join(root, 'claude'), `#!${process.execPath}\nif(process.argv.includes('--version')){console.log('2.1.322');process.exit(0)}process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({args:process.argv.slice(2),fastDisabled:process.env.CLAUDE_CODE_DISABLE_FAST_MODE})));\n`, { mode: 0o700 })
    assert.deepEqual(await codexModels(), [{ id: 'account-model', name: 'Account Model', supportsFast: true }, { id: 'standard-only', name: 'standard-only', supportsFast: false }])
    const result = JSON.parse(await askProvider('codex', 'Translate this.'))
    assert.ok(result.args.includes('account-model'))
    assert.ok(result.args.includes('--ephemeral'))
    assert.ok(result.args.includes('service_tier="default"'))
    const fast = JSON.parse(await askProvider('codex', 'Fast request', 'account-model', true))
    assert.ok(fast.args.includes('service_tier="fast"'))
    assert.ok(fast.args.includes('fast_mode'))
    await assert.rejects(() => askProvider('codex', 'Fast request', 'standard-only', true), /Fast 지원/)
    await assert.rejects(() => askProvider('codex', 'Fast request', 'account-model', 'true'), /Fast 모드/)
    const providers = await getProviders()
    assert.equal(providers.find((entry) => entry.id === 'codex').fastMode, true)
    assert.equal(providers.find((entry) => entry.id === 'claude').fastMode, false)
    assert.ok(result.args.includes('memories'))
    assert.equal(result.args.includes('resume'), false)
    assert.equal(result.prompt, 'Translate this.')
    assert.match(result.cwd, /paperglim-ai-/)
    await assert.rejects(() => access(result.cwd))
    const custom = JSON.parse(await askProvider('codex', 'Translate this.', 'chosen-model'))
    assert.ok(custom.args.includes('chosen-model'))
    const claude = JSON.parse(await askProvider('claude', 'Translate this.', 'sonnet'))
    assert.ok(claude.args.includes('--no-session-persistence'))
    assert.equal(claude.args.includes('--continue'), false)
    assert.ok(claude.args.includes('sonnet'))
    assert.ok(claude.args.includes('{"fastMode":false}'))
    assert.equal(claude.fastDisabled, '1')
    await assert.rejects(() => askProvider('claude', 'Fast request', 'opus', true), /구독 외 크레딧/)
    await assert.rejects(() => askProvider('codex', 'unsupported'), /다른 모델/)
    await assert.rejects(() => askProvider('codex', 'Test', '--bad'), /올바른 AI 모델/)
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath
    if (previousHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousHome
    await rm(root, { recursive: true, force: true })
  }
})
