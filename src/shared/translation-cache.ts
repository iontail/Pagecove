import type { Translation } from './reading'

export type TranslationCache = { version: 1; fingerprint: string; entries: { page: number; included: string[]; results: Translation[]; selected?: boolean }[]; visible: number[] }

export function validateTranslationCache(value: TranslationCache) {
  const text = (value: unknown) => typeof value === 'string' && value.length <= 100000
  const indexes = (value: unknown) => Array.isArray(value) && value.every((n) => Number.isSafeInteger(n) && n >= 0)
  const block = (value: Translation['source']) => value && text(value.id) && text(value.text) && indexes(value.itemIndexes)
  if (!value || value.version !== 1 || typeof value.fingerprint !== 'string' || !value.fingerprint || value.fingerprint.length > 200 || !Array.isArray(value.visible) || !value.visible.every((page) => Number.isSafeInteger(page) && page > 0) || !Array.isArray(value.entries) || value.entries.length > 10000 || !value.entries.every((entry) => entry && Number.isSafeInteger(entry.page) && entry.page > 0 && (entry.selected === undefined || typeof entry.selected === 'boolean') && Array.isArray(entry.included) && entry.included.every((id) => typeof id === 'string' && id.length < 200) && Array.isArray(entry.results) && entry.results.every((result) => block(result?.source) && text(result.text) && Array.isArray(result.sentences) && result.sentences.every((sentence) => block(sentence?.source) && text(sentence.text) && (sentence.warning === undefined || text(sentence.warning)) && Array.isArray(sentence.source.ranges) && sentence.source.ranges.every((range) => range && Number.isSafeInteger(range.itemIndex) && range.itemIndex >= 0 && Number.isSafeInteger(range.start) && range.start >= 0 && Number.isSafeInteger(range.end) && range.end >= range.start))))) throw new Error('저장된 번역 형식이 올바르지 않아.')
}
