import { randomUUID } from 'node:crypto'

export class AIRequests {
  private active = new Map<string, AbortController>()
  async run<T>(owner: number, id: string | undefined, task: (signal: AbortSignal) => Promise<T>) {
    id ??= randomUUID()
    if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw new Error('AI 요청 ID가 올바르지 않아.')
    const key = `${owner}:${id}`
    if (this.active.has(key)) throw new Error('이미 실행 중인 요청이야.')
    const controller = new AbortController()
    this.active.set(key, controller)
    try { return await task(controller.signal) }
    finally { this.active.delete(key) }
  }
  cancel(owner: number, id: string) { this.active.get(`${owner}:${id}`)?.abort() }
  cancelOwner(owner: number) { for (const [key, controller] of this.active) if (key.startsWith(`${owner}:`)) controller.abort() }
}
