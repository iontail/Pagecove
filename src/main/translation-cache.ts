import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateTranslationCache } from '../shared/translation-cache.ts'
import type { TranslationCache } from '../shared/translation-cache'

export class TranslationCacheStore {
  private directory: string
  private writes = new Map<string, Promise<void>>()
  constructor(directory: string) { this.directory = directory }
  private file(id: string) { return join(this.directory, `${encodeURIComponent(id)}.json`) }
  async get(id: string, fingerprint: string): Promise<TranslationCache | null> {
    try {
      const json = await readFile(this.file(id), 'utf8')
      if (json.length > 40000000) throw new Error('저장된 번역이 너무 커서 불러올 수 없어.')
      const cache: TranslationCache = JSON.parse(json)
      validateTranslationCache(cache)
      return cache.fingerprint === fingerprint ? cache : null
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  }
  async flush() { await Promise.allSettled([...this.writes.values()]) }
  put(id: string, cache: TranslationCache) {
    validateTranslationCache(cache)
    const json = JSON.stringify(cache)
    if (json.length > 40000000) throw new Error('이 논문의 번역 저장 용량이 커졌어. 필요 없는 페이지 번역을 지워줘.')
    const task = (this.writes.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true })
      await writeFile(`${this.file(id)}.tmp`, json, { mode: 0o600 })
      await rename(`${this.file(id)}.tmp`, this.file(id))
    })
    this.writes.set(id, task)
    return task
  }
}
