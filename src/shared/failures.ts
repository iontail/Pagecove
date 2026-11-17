export type FailureKind = 'install' | 'auth' | 'model' | 'limit' | 'timeout' | 'network' | 'fast' | 'zotero' | 'unknown'
export type RequestFailure = { kind: FailureKind; message: string }
const marker = 'PAPERGLIM_FAILURE:'
const messages: Record<FailureKind, string> = {
  install: 'AI CLI를 찾지 못했어. 설치한 뒤 연결 상태를 다시 확인해 줘.',
  auth: 'AI 서비스 인증을 확인해야 해. 해당 CLI에서 다시 로그인한 뒤 요청해 줘.',
  model: '현재 계정에서 지원하지 않는 모델이야. 연결 설정에서 다른 모델을 선택해 줘.',
  limit: 'AI 서비스가 사용량 또는 요청 한도를 알렸어. 계정의 한도를 확인하고 잠시 후 다시 시도해 줘.',
  timeout: 'AI 요청 시간이 초과됐어. 질문은 남아 있으니 필요할 때 다시 시도해 줘.',
  network: 'AI 서비스에 연결하지 못했어. 인터넷 연결을 확인한 뒤 다시 시도해 줘.',
  fast: 'Fast 요청을 사용할 수 없어. 모델과 계정의 지원 여부를 확인해 줘.',
  zotero: 'Zotero 연결을 확인해 줘. 앱을 실행하고 고급 설정의 앱 통신 허용을 켠 뒤 다시 동기화해.',
  unknown: 'AI 요청을 완료하지 못했어. 연결 설정을 확인하고 다시 시도해 줘.'
}

function kindOf(message: string): FailureKind {
  if (/CLI를 찾|ENOENT|command not found/i.test(message)) return 'install'
  if (/authentication_error|invalid_api_key|not (?:logged|signed) in|unauthorized|authentication required|(?:access|refresh) token[^\n]{0,60}expired|HTTP\s*401/i.test(message)) return 'auth'
  if (/model_not_found|unsupported.model|model[^\n]{0,60}not supported|지원하지 않는.*모델/i.test(message)) return 'model'
  if (/rate_limit|usage_limit|quota.exceeded|limit[^\n]{0,30}(?:reached|exceeded)|too many requests|HTTP\s*429/i.test(message)) return 'limit'
  if (/Fast[^\n]{0,50}(?:거부|지원|unavailable|not supported)|service.?tier[^\n]{0,50}(?:invalid|unsupported|denied)/i.test(message)) return 'fast'
  if (/ETIMEDOUT|timed?\s*out|timeout|시간[이 ]*초과/i.test(message)) return 'timeout'
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|network error|fetch failed|connection error/i.test(message)) return 'network'
  return 'unknown'
}
export function requestError(message: string) {
  const kind = kindOf(message)
  return new Error(marker + JSON.stringify({ kind, message: messages[kind] }))
}
export function requestFailure(error: unknown, scope: 'ai' | 'zotero' = 'ai'): RequestFailure {
  const message = (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '')
  const index = message.indexOf(marker)
  if (index >= 0) {
    try {
      const value = JSON.parse(message.slice(index + marker.length))
      if (value && Object.hasOwn(messages, value.kind)) return { kind: value.kind, message: messages[value.kind as FailureKind] }
    } catch { /* Treat an invalid envelope as an unknown failure. */ }
    return { kind: 'unknown', message: messages.unknown }
  }
  if (scope === 'zotero') return { kind: 'zotero', message: message.slice(0, 500) }
  const kind = kindOf(message)
  return { kind, message: kind === 'unknown' ? message.slice(0, 500) || messages.unknown : messages[kind] }
}
