import { appScales } from './appearance.ts'

export type RestoreSummary = { token: string; createdAt: string; documents: number; explanations: number; translationPages: number; addedDocuments: number; conflicts: number; settings: number }
export function backupPreferences(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('백업 설정 형식이 올바르지 않아.')
  const result: Record<string, string> = {}
  for (const [key, content] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    if (!['paperglim:provider', 'paperglim:codex-model', 'paperglim:claude-model', 'paperglim:fast', 'paperglim:app-scale', 'paperglim:panels', 'paperglim:translation-share'].includes(key)) continue
    if (typeof content !== 'string') throw new Error('백업 설정 값이 올바르지 않아.')
    if (key === 'paperglim:provider' && !['codex', 'claude'].includes(content)) throw new Error('백업 AI 설정이 올바르지 않아.')
    if (key.endsWith('-model') && !/^[a-zA-Z0-9._:-]{0,100}$/.test(content)) throw new Error('백업 모델 설정이 올바르지 않아.')
    if (key === 'paperglim:fast' && !['true', 'false'].includes(content)) throw new Error('백업 Fast 설정이 올바르지 않아.')
    if (key === 'paperglim:app-scale' && !appScales.includes(Number(content))) throw new Error('백업 화면 크기가 올바르지 않아.')
    if (key === 'paperglim:translation-share' && (!Number.isFinite(Number(content)) || Number(content) < .2 || Number(content) > .65)) throw new Error('백업 번역 폭이 올바르지 않아.')
    if (key === 'paperglim:panels') {
      const panels = JSON.parse(content)
      if (!panels || ![panels.library, panels.assistant].every((number) => Number.isFinite(number) && number >= 0 && number <= 10000)) throw new Error('백업 패널 크기가 올바르지 않아.')
    }
    result[key] = content
  }
  return result
}
