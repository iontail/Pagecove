import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { askProvider, codexModels, getProviders, imageBytes } from '../src/main/providers.ts'

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

test('image requests pass real PNG bytes through isolated Codex files or Claude content blocks and clean up', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-image-provider-'))
  const oldPath = process.env.PATH
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII='
  try {
    process.env.PATH = root
    await writeFile(join(root, 'codex'), `#!${process.execPath}
const fs=require('node:fs');let prompt='';process.stdin.on('data',c=>prompt+=c);process.stdin.on('end',()=>{const args=process.argv.slice(2),path=args[args.indexOf('--image')+1];console.log(JSON.stringify({prompt,args,path,png:fs.readFileSync(path).toString('base64'),mode:fs.statSync(path).mode&511}))});`, { mode: 0o700 })
    await writeFile(join(root, 'claude'), `#!${process.execPath}
let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{console.log(JSON.stringify({type:'system',message:'private session metadata'}));console.log(JSON.stringify({type:'result',subtype:'success',result:JSON.stringify({input:JSON.parse(input),args:process.argv.slice(2)})}))});`, { mode: 0o700 })
    const result = JSON.parse(await askProvider('codex', 'public figure question', 'test', false, undefined, png))
    assert.equal(result.png, png.split(',')[1])
    assert.equal(result.mode, 0o600)
    assert.equal(result.prompt, 'public figure question')
    assert.ok(result.args.includes('--ephemeral'))
    await assert.rejects(() => access(result.path))
    const claude = JSON.parse(await askProvider('claude', 'public figure question', 'sonnet', false, undefined, png))
    assert.equal(claude.input.message.content[0].text, 'public figure question')
    assert.equal(claude.input.message.content[1].source.data, png.split(',')[1])
    assert.equal(claude.input.message.content[1].source.media_type, 'image/png')
    assert.ok(claude.args.includes('--no-session-persistence') && claude.args.includes('stream-json'))
    assert.equal(imageBytes(png).readUInt32BE(16), 1)
    for (const bad of ['file:///private/key', 'data:image/jpeg;base64,YQ==', 'data:image/png;base64,YQ==', 'x'.repeat(6000001), 42]) await assert.rejects(() => askProvider('codex', 'test', 'test', false, undefined, bad), /이미지/)
    const invalid = Buffer.from(png.split(',')[1], 'base64'); invalid.writeUInt32BE(9000, 16)
    assert.throws(() => imageBytes('data:image/png;base64,' + invalid.toString('base64')), /크기/)
  } finally { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; await rm(root, { recursive: true, force: true }) }
})

test('cancelling a provider kills its actual CLI process group and removes its temporary directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paperglim-cancel-test-'))
  const previousPath = process.env.PATH, previousHome = process.env.CODEX_HOME
  let state
  try {
    process.env.PATH = `${root}:${dirname(process.execPath)}`; process.env.CODEX_HOME = root
    const statePath = join(root, 'running.json')
    await writeFile(join(root, 'codex'), `#!${process.execPath}\nconst{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync(${JSON.stringify(statePath)},JSON.stringify({pid:process.pid,child:child.pid,cwd:process.cwd()}));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdin.resume();\n`, { mode: 0o700 })
    const controller = new AbortController()
    const result = askProvider('codex', 'Wait until cancelled.', undefined, false, controller.signal)
    const rejected = assert.rejects(result, /중지/)
    for (let i = 0; i < 100; i++) {
      try { state = JSON.parse(await (await import('node:fs/promises')).readFile(statePath, 'utf8')); break } catch { await new Promise((done) => setTimeout(done, 10)) }
    }
    assert.ok(state?.pid && state?.child)
    controller.abort(); await rejected
    const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
    for (let i = 0; i < 100 && (alive(state.pid) || alive(state.child)); i++) await new Promise((done) => setTimeout(done, 10))
    assert.equal(alive(state.pid), false)
    assert.equal(alive(state.child), false)
    await assert.rejects(() => access(state.cwd))
  } finally {
    if (state?.pid) { try { process.kill(-state.pid, 'SIGKILL') } catch {} }
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath
    if (previousHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousHome
    await rm(root, { recursive: true, force: true })
  }
})
