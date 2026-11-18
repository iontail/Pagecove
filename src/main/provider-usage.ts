import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { codexUsage, claudeUsage } from '../shared/provider-usage.ts'
import type { ProviderUsage } from '../shared/types'
import { providerExecutable } from './providers.ts'

export function readCodexRateLimits(executable: string, timeout = 12000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['app-server', '--listen', 'stdio://'], { detached: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } })
    let buffer = '', settled = false
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      child.stdin.end()
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
      }
      if (error) reject(error); else resolve(result)
    }
    const timer = setTimeout(() => finish(new Error('사용량 확인 시간이 초과됐어요.')), timeout)
    const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + '\n')
    child.stdin.on('error', () => {})
    child.stderr.resume()
    child.on('error', () => finish(new Error('CLI를 실행하지 못했어요.')))
    child.on('close', () => finish(new Error('사용량 정보를 받지 못했어요.')))
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      if (buffer.length > 1048576) { finish(new Error('사용량 정보를 읽지 못했어요.')); return }
      let end: number
      while (!settled && (end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        let value
        try { value = JSON.parse(line) } catch { continue }
        if (!value || typeof value !== 'object') continue
        if (value.id !== 1 && value.id !== 2) continue
        if (value.error) { finish(new Error('CLI 버전과 로그인 상태를 확인해 주세요.')); return }
        if (value.id === 1) { send({ method: 'initialized' }); send({ method: 'account/rateLimits/read', id: 2 }) }
        if (value.id === 2) finish(undefined, value.result)
      }
    })
    send({ method: 'initialize', id: 1, params: { clientInfo: { name: 'paperglim', title: 'Pagecove', version: '0.1.18' }, capabilities: { explicitGatewayOauth: true } } })
  })
}

let pending: Promise<ProviderUsage[]> | null = null
let cached: ProviderUsage[] = []
let fetchedAt = 0
export function getProviderUsage(force = false): Promise<ProviderUsage[]> {
  if (pending) return pending
  if (cached.length && Date.now() - fetchedAt < (force ? 5000 : 60000)) return Promise.resolve(cached)
  pending = Promise.all((['codex', 'claude'] as const).map(async (provider): Promise<ProviderUsage> => {
    const executable = await providerExecutable(provider)
    if (!executable) return { provider, status: 'not-installed', windows: [], checkedAt: null, source: provider === 'codex' ? 'live' : 'local', message: `${provider === 'codex' ? 'Codex' : 'Claude Code'} CLI를 설치한 뒤 로그인해 주세요.` }
    try {
      if (provider === 'codex') return codexUsage(await readCodexRateLimits(executable))
      const path = process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : join(homedir(), '.claude.json')
      return claudeUsage(JSON.parse(await readFile(path, 'utf8')))
    } catch {
      return { provider, status: 'unavailable', windows: [], checkedAt: null, source: provider === 'codex' ? 'live' : 'local', message: provider === 'codex' ? '사용량을 확인하지 못했어요. 인터넷 연결, Codex 로그인 상태, CLI 버전을 확인하고 새로고침해 주세요.' : '사용량을 불러오지 못했어요. Claude Code에서 /usage를 실행해 확인해 주세요.' }
    }
  })).then((values) => { cached = values; fetchedAt = Date.now(); return values }).finally(() => { pending = null })
  return pending
}
