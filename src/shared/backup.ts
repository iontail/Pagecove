import { appScales } from './appearance.ts'

export type RestoreSummary = { token: string; createdAt: string; documents: number; explanations: number; translationPages: number; addedDocuments: number; conflicts: number; settings: number }
export function backupPreferences(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('백업 설정 형식이 올바르지 않아요.')
  const result: Record<string, string> = {}
  for (const [key, content] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    if (!['paperglim:palette', 'paperglim:theme', 'paperglim:provider', 'paperglim:codex-model', 'paperglim:claude-model', 'paperglim:fast', 'paperglim:app-scale', 'paperglim:panels', 'paperglim:translation-share', 'paperglim:shelf-view', 'paperglim:shelf-sort', 'paperglim:library-collapsed'].includes(key)) continue
    if (typeof content !== 'string') throw new Error('백업 설정 값이 올바르지 않아요.')
    if (key === 'paperglim:palette' && !['neutral', 'cream'].includes(content)) throw new Error('백업 색상 테마가 올바르지 않아요.')
    if (key === 'paperglim:theme' && !['light', 'dark'].includes(content)) throw new Error('백업 테마 설정이 올바르지 않아요.')
    if (key === 'paperglim:provider' && !['codex', 'claude'].includes(content)) throw new Error('백업 AI 설정이 올바르지 않아요.')
    if (key.endsWith('-model') && !/^[a-zA-Z0-9._:-]{0,100}$/.test(content)) throw new Error('백업 모델 설정이 올바르지 않아요.')
    if (key === 'paperglim:shelf-view' && !['grid', 'list'].includes(content)) throw new Error('백업 서재 보기 설정이 올바르지 않아요.')
    if (key === 'paperglim:shelf-sort' && !['recent', 'added', 'title'].includes(content)) throw new Error('백업 서재 정렬 설정이 올바르지 않아요.')
    if (key === 'paperglim:library-collapsed' && !['true', 'false'].includes(content)) throw new Error('백업 사이드바 설정이 올바르지 않아요.')
    if (key === 'paperglim:fast' && !['true', 'false'].includes(content)) throw new Error('백업 Fast 설정이 올바르지 않아요.')
    if (key === 'paperglim:app-scale' && !appScales.includes(Number(content))) throw new Error('백업 화면 크기가 올바르지 않아요.')
    if (key === 'paperglim:translation-share' && (!Number.isFinite(Number(content)) || Number(content) < .2 || Number(content) > .65)) throw new Error('백업 번역 폭이 올바르지 않아요.')
    if (key === 'paperglim:panels') {
      const panels = JSON.parse(content)
      if (!panels || ![panels.library, panels.assistant].every((number) => Number.isFinite(number) && number >= 0 && number <= 10000)) throw new Error('백업 패널 크기가 올바르지 않아요.')
    }
    result[key] = content
  }
  return result
}
