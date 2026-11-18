import { requestError } from '../shared/failures.ts'
import { execFile, spawn } from 'node:child_process'
import { access, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

export async function providerExecutable(id: 'codex' | 'claude') {
  const directories = [...new Set((process.env.PATH ?? '').split(':').filter(Boolean)), join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin']
  let executable = ''
  for (const directory of directories) {
    const path = join(directory, id)
    try { await access(path); executable = path; break } catch { /* Try the next directory. */ }
  }
  return executable
}

export function imageBytes(image: string) {
  if (typeof image !== 'string' || image.length > 6000000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('선택한 이미지를 읽지 못했어요. 그림이나 표의 영역을 다시 선택해 주세요.')
  const bytes = Buffer.from(image.slice('data:image/png;base64,'.length), 'base64')
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) || bytes.readUInt32BE(16) > 4096 || bytes.readUInt32BE(20) > 4096) throw new Error('선택한 이미지의 크기나 형식을 확인해 주세요.')
  return bytes
}

export async function askProvider(id: 'codex' | 'claude', prompt: string, model?: string, fast = false, signal?: AbortSignal, image?: string): Promise<string> {
  const png = image === undefined ? null : imageBytes(image)
  if (typeof fast !== 'boolean') throw new Error('Fast 모드 설정을 확인해 주세요.')
  if (id === 'claude' && fast) throw new Error('Claude Fast는 구독 외 크레딧이 필요해요. 이 앱에서는 Standard를 사용해 주세요.')
  if (!['codex', 'claude'].includes(id) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 100000) throw new Error('AI에 보낼 내용을 확인해 주세요.')
  if (model !== undefined && (typeof model !== 'string' || (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model)))) throw new Error('올바른 AI 모델을 선택해 주세요.')
  const executable = await providerExecutable(id)
  if (!executable) throw new Error(`${id} CLI를 찾지 못했어요. 설치한 뒤 로그인해 주세요.`)
  const selectedModel = id === 'codex' ? model || (await codexModels())[0]?.id : ''
  if (fast && !(await codexModels()).find((entry) => entry.id === selectedModel)?.supportsFast) throw new Error('이 모델의 Fast 지원 여부를 확인할 수 없어요. 다른 모델을 고르거나 Fast를 꺼 주세요.')
  const args = id === 'codex' ? ['exec', '--config', `service_tier="${fast ? 'fast' : 'default'}"`, ...(fast ? ['--enable', 'fast_mode'] : []), '--ephemeral', '--disable', 'memories', '--skip-git-repo-check', '--sandbox', 'read-only', ...(selectedModel ? ['--model', selectedModel] : []), '-'] : ['--print', '--no-session-persistence', '--tools', '', '--settings', '{"fastMode":false}', ...(model ? ['--model', model] : [])]
  if (signal?.aborted) throw new Error('AI 요청을 중지했어.')
  const directory = await mkdtemp(join(tmpdir(), 'paperglim-ai-'))
  try {
    if (png && id === 'codex') { const file = join(directory, 'selection.png'); await writeFile(file, png, { mode: 0o600 }); args.splice(args.length - 1, 0, '--image', file) }
    if (png && id === 'claude') args.push('--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose')
    return await new Promise<string>((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('AI 요청을 중지했어.')); return }
    const child = spawn(executable, args, { detached: true, cwd: directory, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', ...(id === 'claude' ? { CLAUDE_CODE_DISABLE_FAST_MODE: '1' } : {}) }, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    let errors = ''
    let timedOut = false
    const stop = () => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
      try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    }
    signal?.addEventListener('abort', stop, { once: true })
    if (signal?.aborted) stop()
    const timer = setTimeout(() => { timedOut = true; stop() }, 180000)
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { errors = (errors + chunk.toString()).slice(-10000) })
    child.on('error', (error) => { clearTimeout(timer); signal?.removeEventListener('abort', stop); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
      if (signal?.aborted) reject(new Error('AI 요청을 중지했어.'))
      else if (timedOut) reject(new Error('AI 요청 시간이 초과됐어요. 다시 시도해 주세요.'))
      else if (code === 0 && output.trim()) {
        if (png && id === 'claude') {
          try {
            const result = output.trim().split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line)).findLast((entry) => entry.type === 'result')
            if (result?.is_error) reject(requestError(Array.isArray(result.errors) ? result.errors.filter((entry: unknown) => typeof entry === 'string').join('\n') : 'AI 응답을 받지 못했어요.'))
            else if (!result || typeof result.result !== 'string' || !result.result.trim()) reject(new Error('그림이나 표의 해설을 받지 못했어요. CLI와 모델이 이미지 입력을 지원하는지 확인해 주세요.'))
            else resolve(result.result.trim())
          } catch { reject(new Error('그림이나 표의 해설을 읽지 못했어요. Claude Code CLI를 업데이트한 뒤 다시 시도해 주세요.')) }
        } else resolve(output.trim())
      }
      else if (/image.*(?:not supported|unsupported)|(?:not support|unsupported).*image|input.format|unexpected argument.*--image/i.test(errors)) reject(new Error('현재 CLI나 모델에서 이미지를 읽을 수 없어요. CLI를 업데이트하거나 이미지 입력을 지원하는 모델을 선택하세요.'))
      else if (fast && /service.?tier|fast.?mode/i.test(errors)) reject(new Error('Fast 요청이 거부됐어요. 계정의 Fast 지원 여부와 한도를 확인하거나 Fast를 끄고 다시 보내 주세요.'))
      else if (errors.includes('not supported when using Codex') || errors.includes('model_not_found')) reject(new Error('현재 계정에서 지원하지 않는 Codex 모델이에요. ‘AI 연결’ 설정에서 다른 모델을 선택하세요.'))
      else reject(requestError(errors || 'AI 응답을 받지 못했어요.'))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(png && id === 'claude' ? `${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } }] }, parent_tool_use_id: null })}\n` : prompt)
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
        return { id, name: id === 'codex' ? 'Codex' : 'Claude Code', installed: true, version: stdout.trim().split('\n')[0], models, fastMode, fastModeNote: id === 'claude' ? 'Claude Fast는 별도 크레딧이 필요해 이 앱에서 사용할 수 없어요.' : fastMode ? 'Fast는 구독 한도를 더 빨리 소모해요. 연결한 계정과 모델이 Fast를 지원해야 해요.' : 'Fast를 지원하는 Codex CLI가 필요해요.' }
      } catch { /* Try the next installed executable. */ }
    }
    return { id, name: id === 'codex' ? 'Codex' : 'Claude Code', installed: false, version: null }
  }))
}
