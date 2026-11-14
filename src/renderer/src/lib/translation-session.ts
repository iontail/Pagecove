import { runTranslation, selectedBlocks } from '../../../shared/translation-harness.ts'
import type { PageContext, Translation } from '../../../shared/reading'
import type { PaperSession } from './paper-session'

export type PageTranslation = { status: 'queued' | 'running' | 'done' | 'error'; results: Translation[]; error?: string }
export class TranslationSession {
  private listeners = new Set<() => void>()
  private revision = 0
  private records = new Map<string, PageTranslation>()
  private jobs = new Map<string, Promise<void>>()
  private queue = Promise.resolve()
  visible = new Set<number>()
  all = { running: false, completed: 0, total: 0, failed: 0 }
  private stopped = false
  stopping = false
  private paper: PaperSession
  private ask: (prompt: string) => Promise<string>
  constructor(paper: PaperSession, ask: (prompt: string) => Promise<string>) { this.paper = paper; this.ask = ask }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  snapshot = () => this.revision
  private emit() { this.revision++; this.listeners.forEach((listener) => listener()) }
  private key(page: number, included: string[]) { return `${page}:${included.toSorted().join(',')}` }
  read(page: number, included: string[] = []) { return this.records.get(this.key(page, included)) }
  open(page: number) { this.visible.add(page); this.emit() }
  close(page: number) { this.visible.delete(page); this.emit() }
  stop() { this.stopped = true; if (this.all.running) { this.stopping = true; this.emit() } }
  translate(context: PageContext, included: string[] = [], force = false) {
    this.open(context.page)
    const key = this.key(context.page, included)
    if (this.jobs.has(key)) return this.jobs.get(key)!
    const previous = this.records.get(key)
    if (!force && previous?.status === 'done') return Promise.resolve()
    this.records.set(key, { status: 'queued', results: previous?.results ?? [] }); this.emit()
    const task = this.queue.then(async () => {
      this.records.set(key, { status: 'running', results: previous?.results ?? [] }); this.emit()
      try {
        const blocks = context.translation ? selectedBlocks(context.translation, included) : context.blocks
        const results = blocks.length ? await runTranslation(blocks, this.ask) : []
        this.records.set(key, { status: 'done', results })
      } catch (error) { this.records.set(key, { status: 'error', results: previous?.results ?? [], error: (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '') }) }
      finally { this.jobs.delete(key); this.emit() }
    })
    this.jobs.set(key, task)
    this.queue = task.catch(() => {})
    return task
  }
  async translateAll() {
    if (this.all.running) return
    this.stopped = false; this.stopping = false
    this.all = { running: true, completed: 0, total: this.paper.pageCount, failed: 0 }; this.emit()
    try {
      for (let number = 1; number <= this.paper.pageCount && !this.stopped; number++) {
        this.open(number)
        try { const previous = this.read(number); await this.translate(await this.paper.page(number), [], previous?.results.some((block) => block.sentences.some((sentence) => sentence.warning)) ?? false) }
        catch (error) { this.records.set(this.key(number, []), { status: 'error', results: [], error: error instanceof Error ? error.message : String(error) }) }
        const record = this.read(number)
        this.all.completed++
        if (record?.status === 'error' || record?.results.some((block) => block.sentences.some((sentence) => sentence.warning))) this.all.failed++
        this.emit()
      }
    } finally { this.all.running = false; this.emit() }
  }
}
