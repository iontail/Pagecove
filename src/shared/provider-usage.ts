import type { ProviderUsage, UsageWindow } from './types.ts'

export function usageWindow(used: unknown, durationMins: unknown, resets: unknown, now = Date.now()): UsageWindow | null {
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100) return null
  const resetsAt = typeof resets === 'number' && Number.isFinite(resets) && resets > 0 ? resets * 1000 : null
  if (resetsAt !== null && resetsAt <= now) return null
  return { remainingPercent: Math.floor(100 - used), durationMins: typeof durationMins === 'number' && Number.isFinite(durationMins) && durationMins > 0 ? durationMins : null, resetsAt }
}

export function codexUsage(result: any, now = Date.now()): ProviderUsage {
  const bucket = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits
  const validBucket = bucket && (!bucket.limitId || bucket.limitId === 'codex')
  const windows: UsageWindow[] = validBucket ? [bucket.primary, bucket.secondary].filter(Boolean).flatMap((entry) => {
    const window = usageWindow(entry.usedPercent, entry.windowDurationMins, entry.resetsAt, now)
    return window ? [window] : []
  }) : []
  return { provider: 'codex', status: windows.length ? 'ready' : 'unavailable', windows, checkedAt: now, source: 'live', message: windows.length ? '' : '사용 한도를 확인하지 못했어요. Codex 로그인 상태와 CLI 버전을 확인해 주세요.' }
}

export function claudeUsage(config: any, now = Date.now()): ProviderUsage {
  const cached = config?.cachedUsageUtilization
  const checkedAt = cached?.fetchedAtMs
  const fresh = typeof checkedAt === 'number' && Number.isFinite(checkedAt) && checkedAt <= now && now - checkedAt <= 600000
  const accountMatches = !cached?.accountUuid || cached.accountUuid === config?.oauthAccount?.accountUuid
  // shortcut: Claude's local cache is version-dependent; unknown layouts remain unavailable.
  const windows: UsageWindow[] = fresh && accountMatches ? ([['five_hour', 300], ['seven_day', 10080]] as const).flatMap(([key, mins]) => {
    const entry = cached.utilization?.[key]
    const seconds = typeof entry?.resets_at === 'string' ? Date.parse(entry.resets_at) / 1000 : entry?.resets_at
    const window = usageWindow(entry?.utilization, mins, seconds, now)
    return window ? [window] : []
  }) : []
  return { provider: 'claude', status: windows.length ? 'ready' : 'unavailable', windows, checkedAt: windows.length ? checkedAt : null, source: 'local', message: windows.length ? '' : '최근 사용량 정보가 없어요. Claude Code에서 /usage를 실행한 뒤 새로고침해 주세요. CLI 버전에 따라 사용량을 가져오지 못할 수 있어요.' }
}

export function usageLabel(window: UsageWindow, index = 0) {
  const minutes = window.durationMins
  if (minutes === null) return index ? '추가 한도' : '기본 한도'
  if (minutes % 1440 === 0) return `${minutes / 1440}일`
  if (minutes % 60 === 0) return `${minutes / 60}시간`
  return `${minutes}분`
}
