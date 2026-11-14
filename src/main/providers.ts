import { execFile, spawn } from 'node:child_process'
import { access, readFile, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { AIModel, ProviderStatus } from '../shared/types'

const runFile = promisify(execFile)

export async function codexModels(): Promise<AIModel[]> {
  try {
    const cached = JSON.parse(await readFile(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'models_cache.json'), 'utf8'))
    if (!Array.isArray(cached.models)) return []
    return cached.models.filter((entry: { slug?: string; visibility?: string }) => typeof entry.slug === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(entry.slug) && entry.visibility === 'list')
      .map((entry: { slug: string; display_name?: string; additional_speed_tiers?: string[]; service_tiers?: { id: string }[] }) => ({ id: entry.slug, name: entry.display_name || entry.slug, supportsFast: entry.additional_speed_tiers?.includes('fast') === true || entry.service_tiers?.some((tier) => ['fast', 'priority'].includes(tier.id)) === true }))
  } catch { return [] }
}

export async function askProvider(id: 'codex' | 'claude', prompt: string, model?: string, fast = false): Promise<string> {
  if (typeof fast !== 'boolean') throw new Error('Fast 모드 설정을 확인해 줘.')
  if (id === 'claude' && fast) throw new Error('Claude Fast는 구독 외 크레딧 과금이 필요해. 이 앱에서는 Standard로 사용해 줘.')
  if (!['codex', 'claude'].includes(id) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 100000) throw new Error('AI 요청을 확인해 줘.')
  if (model !== undefined && (typeof model !== 'string' || (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model)))) throw new Error('올바른 AI 모델을 선택해 줘.')
  const directories = [...new Set((process.env.PATH ?? '').split(':').filter(Boolean)), join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin']
  let executable = ''
  for (const directory of directories) {
    const path = join(directory, id)
    try { await access(path); executable = path; break } catch { /* Try the next directory. */ }
  }
  if (!executable) throw new Error(`${id} CLI를 찾지 못했어. 설치하고 로그인해 줘.`)
  const selectedModel = id === 'codex' ? model || (await codexModels())[0]?.id : ''
  if (fast && !(await codexModels()).find((entry) => entry.id === selectedModel)?.supportsFast) throw new Error('선택한 모델의 Fast 지원을 확인할 수 없어. 다른 모델을 고르거나 Fast를 꺼줘.')
  const args = id === 'codex' ? ['exec', '--config', `service_tier="${fast ? 'fast' : 'default'}"`, ...(fast ? ['--enable', 'fast_mode'] : []), '--ephemeral', '--disable', 'memories', '--skip-git-repo-check', '--sandbox', 'read-only', ...(selectedModel ? ['--model', selectedModel] : []), '-'] : ['--print', '--no-session-persistence', '--tools', '', '--settings', '{"fastMode":false}', ...(model ? ['--model', model] : [])]
  const directory = await mkdtemp(join(tmpdir(), 'paperglim-ai-'))
  try { return await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, { cwd: directory, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', ...(id === 'claude' ? { CLAUDE_CODE_DISABLE_FAST_MODE: '1' } : {}) }, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    let errors = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, 180000)
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { errors = (errors + chunk.toString()).slice(-10000) })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) reject(new Error('AI 요청 시간이 초과됐어. 다시 시도해 줘.'))
      else if (code === 0 && output.trim()) resolve(output.trim())
      else if (fast && /service.?tier|fast.?mode/i.test(errors)) reject(new Error('Fast 요청이 거부됐어. 계정의 지원 여부·한도를 확인하거나 Fast를 끄고 다시 보내줘.'))
      else if (errors.includes('not supported when using Codex') || errors.includes('model_not_found')) reject(new Error('현재 계정에서 지원하지 않는 Codex 모델이야. 연결 설정에서 다른 모델을 선택해 줘.'))
      else reject(new Error(errors.slice(-1500) || 'AI 응답을 받지 못했어. 로그인 상태를 확인해 줘.'))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(prompt)
  }) } finally { await rm(directory, { recursive: true, force: true }) }
}

export async function getProviders(): Promise<ProviderStatus[]> {
  return Promise.all((['codex', 'claude'] as const).map(async (id) => {
    const directories = [
      ...new Set((process.env.PATH ?? '').split(':').filter(Boolean)),
      join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'
    ]
    for (const directory of directories) {
      const path = join(directory, id)
      try {
        await access(path)
        const { stdout } = await runFile(path, ['--version'], { timeout: 5000, maxBuffer: 16384 })
        const models = id === 'codex' ? await codexModels() : [{ id: 'opus', name: 'Opus' }, { id: 'sonnet', name: 'Sonnet' }, { id: 'haiku', name: 'Haiku' }, { id: 'fable', name: 'Fable' }]
        let fastMode = false
        if (id === 'codex') {
          try { const flags = await runFile(path, ['features', 'list'], { timeout: 5000, maxBuffer: 32768 }); fastMode = /^fast_mode\s/m.test(flags.stdout) }
          catch { /* Older CLIs can still use Standard mode. */ }
        }
        return { id, name: id === 'codex' ? 'Codex' : 'Claude Code', installed: true, version: stdout.trim().split('\n')[0], models, fastMode, fastModeNote: id === 'claude' ? 'Claude Fast는 구독 외 크레딧 과금이 필요해서 비활성화했어.' : fastMode ? 'Fast는 구독 한도를 더 소모해. 계정·모델의 지원 여부에 따라 요청이 거부될 수 있어.' : 'Fast를 지원하는 Codex CLI가 필요해.' }
      } catch { /* Try the next installed executable. */ }
    }
    return { id, name: id === 'codex' ? 'Codex' : 'Claude Code', installed: false, version: null }
  }))
}
