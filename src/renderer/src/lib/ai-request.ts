import type { PaperSession } from './paper-session'

export class AIRequest {
  readonly id = crypto.randomUUID()
  cancelled = false
  private provider: 'codex' | 'claude'
  private model: string
  private fast: boolean
  private stopped: Promise<never>
  private reject!: (error: Error) => void
  constructor(provider: string, model: string, fast = false) { this.provider = provider === 'claude' ? 'claude' : 'codex'; this.model = model; this.fast = fast; this.stopped = new Promise((_, reject) => { this.reject = reject }); void this.stopped.catch(() => {}) }
  check() { if (this.cancelled) throw new Error('AI 요청을 중지했어.') }
  ask = async (prompt: string, image?: string) => {
    this.check()
    const answer = await Promise.race([window.paperglim.askAI(this.provider, prompt, this.model, this.fast, this.id, image), this.stopped])
    this.check()
    return answer
  }
  async reference(session: PaperSession) {
    try { const value = await Promise.race([session.reference(`${this.provider}:${this.model}`, this.ask), this.stopped]); this.check(); return value }
    catch (error) {
      this.check()
      if (error instanceof Error && error.message.includes('AI 요청을 중지했어.')) return Promise.race([session.reference(`${this.provider}:${this.model}`, this.ask), this.stopped])
      throw error
    }
  }
  async cancel() { this.cancelled = true; this.reject(new Error('AI 요청을 중지했어.')); await window.paperglim.cancelAI(this.id) }
}
