import { runTranslation, selectedBlocks } from '../../../shared/translation-harness.ts'
import type { PageContext, Translation } from '../../../shared/reading'
import type { TranslationCache } from '../../../shared/translation-cache'
import type { PaperSession } from './paper-session'

export type TranslationRequest = { ask: (prompt: string) => Promise<string>; cancel: () => Promise<void> }
export type TranslationPersistence = { fingerprint: string; load: () => Promise<TranslationCache | null>; save: (cache: TranslationCache) => Promise<void> }
export type PageTranslation = { page: number; included: string[]; status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'; results: Translation[]; error?: string }
export class TranslationSession {
  private listeners = new Set<() => void>()
  private revision = 0
  private records = new Map<string, PageTranslation>()
  private scopes = new Map<number, string[]>()
  private jobs = new Map<string, Promise<void>>()
  private queue = Promise.resolve()
  private generation = 0
  private active: TranslationRequest | null = null
  private paper: PaperSession
  private createRequest: () => TranslationRequest
  private cache?: TranslationPersistence
  private visibilityTouched = false
  visible = new Set<number>()
  all = { running: false, completed: 0, total: 0, failed: 0, cancelled: false }
  stopping = false
  loading = false
  storageError = ''
  readonly restored: Promise<void>
  constructor(paper: PaperSession, createRequest: () => TranslationRequest, cache?: TranslationPersistence) {
    this.paper = paper; this.createRequest = createRequest; this.cache = cache
    this.loading = !!cache
    this.restored = cache ? this.restore() : Promise.resolve()
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  snapshot = () => this.revision
  private emit() { this.revision++; this.listeners.forEach((listener) => listener()) }
  private key(page: number, included: string[]) { return `${page}:${included.toSorted().join(',')}` }
  private async restore() {
    try {
      const cache = await this.cache!.load()
      if (!cache || cache.fingerprint !== this.cache!.fingerprint) return
      for (const entry of cache.entries) if (entry.page <= this.paper.pageCount) { this.records.set(this.key(entry.page, entry.included), { ...entry, status: 'done' }); if (entry.selected) this.scopes.set(entry.page, entry.included) }
      if (!this.visibilityTouched) for (const page of cache.visible) if ([...this.records.values()].some((entry) => entry.page === page)) this.visible.add(page)
    } catch { this.storageError = '저장한 번역을 불러오지 못했어요. ‘다시 번역’을 눌러 새 번역을 받을 수 있어요.' }
    finally { this.loading = false; this.emit() }
  }
  async save() {
    if (!this.cache || this.loading) return true
    const entries = [...this.records.values()].filter((record) => record.status === 'done' || record.results.length > 0).map(({ page, included, results }) => ({ page, included, results, selected: this.key(page, this.scope(page)) === this.key(page, included) }))
    try {
      await this.cache.save({ version: 1, fingerprint: this.cache.fingerprint, entries, visible: [...this.visible].filter((page) => entries.some((entry) => entry.page === page)) })
      this.storageError = ''; this.emit(); return true
    } catch { this.storageError = '번역을 저장하지 못했어요. 앱을 닫기 전에 다시 저장해 주세요.'; this.emit(); return false }
  }
  get running() { return this.jobs.size > 0 || this.all.running }
  scope(page: number) { return this.scopes.get(page) ?? [] }
  read(page: number, included: string[] = []) { return this.records.get(this.key(page, included)) }
  open(page: number) { this.visibilityTouched = true; this.visible.add(page); this.emit(); void this.save() }
  close(page: number) { this.visibilityTouched = true; this.visible.delete(page); this.emit(); void this.save() }
  async stop() {
    if (!this.jobs.size && !this.all.running) return
    this.generation++; this.stopping = true; this.all.cancelled = this.all.running; this.emit()
    try { await this.active?.cancel() }
    catch { this.storageError = '번역을 중지하지 못했어요. 다시 시도해 주세요.'; this.emit() }
  }
  async clearPage(page: number) {
    await this.restored
    if (this.jobs.size) throw new Error('진행 중인 번역을 먼저 중지해 주세요.')
    const previous = [...this.records].filter(([, record]) => record.page === page)
    const scope = this.scope(page)
    for (const [key] of previous) this.records.delete(key)
    this.scopes.delete(page)
    if (!await this.save()) { for (const [key, record] of previous) this.records.set(key, record); this.scopes.set(page, scope); this.emit(); throw new Error('저장한 번역을 지우지 못했어요. 다시 시도해 주세요.') }
    this.emit()
  }
  async translate(context: PageContext, included: string[] = [], force = false) {
    const generation = this.generation
    this.open(context.page)
    await this.restored
    if (generation !== this.generation) return
    const key = this.key(context.page, included)
    if (this.jobs.has(key)) return this.jobs.get(key)!
    const previous = this.records.get(key)
    if (!force && previous?.status === 'done') return
    const record = (status: PageTranslation['status'], results = previous?.results ?? [], error?: string) => { this.records.set(key, { page: context.page, included, status, results, error }); this.emit() }
    record('queued')
    const task = this.queue.then(async () => {
      if (generation !== this.generation) { if (previous) this.records.set(key, previous); else record('cancelled'); this.jobs.delete(key); this.stopping = false; this.emit(); return }
      const request = this.createRequest()
      this.active = request; record('running')
      try {
        const blocks = context.translation ? selectedBlocks(context.translation, included) : context.blocks
        const ask = (prompt: string) => { if (generation !== this.generation) throw new Error('AI 요청을 중지했어.'); return request.ask(prompt) }
        const results = blocks.length ? await runTranslation(blocks, ask) : []
        if (generation !== this.generation) throw new Error('AI 요청을 중지했어.')
        this.scopes.set(context.page, included); record('done', results); await this.save()
      } catch (error) {
        if (generation !== this.generation) { if (previous) this.records.set(key, previous); else record('cancelled') }
        else record('error', previous?.results ?? [], (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, ''))
      } finally { if (this.active === request) this.active = null; this.jobs.delete(key); this.stopping = false; this.emit() }
    })
    this.jobs.set(key, task)
    this.queue = task.catch(() => {})
    return task
  }
  async translateAll() {
    if (this.all.running) return
    const generation = this.generation
    this.all = { running: true, completed: 0, total: this.paper.pageCount, failed: 0, cancelled: false }; this.emit()
    try {
      await this.restored
      for (let number = 1; number <= this.paper.pageCount && generation === this.generation; number++) {
        this.open(number)
        try { const previous = this.read(number); await this.translate(await this.paper.page(number), [], previous?.results.some((block) => block.sentences.some((sentence) => sentence.warning)) ?? false) }
        catch (error) { this.records.set(this.key(number, []), { page: number, included: [], status: 'error', results: [], error: error instanceof Error ? error.message : String(error) }) }
        if (generation !== this.generation) break
        const record = this.read(number)
        this.all.completed++
        if (record?.status === 'error' || record?.results.some((block) => block.sentences.some((sentence) => sentence.warning))) this.all.failed++
        this.emit()
      }
    } finally { this.all.running = false; this.stopping = false; this.emit() }
  }
}
