import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SelectionThread } from '../shared/paper-harness'

export class AnnotationStore {
  private writes = new Map<string, Promise<void>>()
  private directory: string
  constructor(directory: string) { this.directory = directory }
  private file(id: string) { return join(this.directory, `${encodeURIComponent(id)}.json`) }
  async get(id: string): Promise<SelectionThread[]> {
    try {
      const data = JSON.parse(await readFile(this.file(id), 'utf8'))
      if (!Array.isArray(data)) throw new Error('저장된 설명을 읽을 수 없어.')
      data.forEach(validateAnnotation)
      return data
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  async flush() { await Promise.all([...this.writes.values()]) }
  put(id: string, thread: SelectionThread | null, removeId?: string) {
    if (thread) validateAnnotation(thread)
    const task = (this.writes.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const notes = (await this.get(id)).filter((note) => note.id !== (thread?.id ?? removeId))
      if (thread) notes.push(thread)
      const json = JSON.stringify(notes)
      if (json.length > 5000000) throw new Error('이 논문의 설명 저장 용량이 커졌어. 필요 없는 설명을 지워줘.')
      await mkdir(this.directory, { recursive: true })
      await writeFile(`${this.file(id)}.tmp`, json)
      await rename(`${this.file(id)}.tmp`, this.file(id))
    })
    this.writes.set(id, task)
    return task
  }
}

export function validateAnnotation(value: SelectionThread) {
  if (!value || typeof value.id !== 'string' || value.id.length > 300 || !Number.isInteger(value.page) || value.page < 1 || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 20000 || (value.kind !== undefined && value.kind !== 'figure') || (value.review !== undefined && typeof value.review !== 'boolean') || (value.study !== undefined && value.study !== 'concept') || !Array.isArray(value.ranges) || (value.kind !== 'figure' && !value.ranges.length) || !value.ranges.every((range) => Number.isInteger(range.itemIndex) && range.itemIndex >= 0 && Number.isInteger(range.start) && range.start >= 0 && Number.isInteger(range.end) && range.end > range.start) || !Array.isArray(value.rects) || !value.rects.length || !value.rects.every((rect) => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1.001 && rect.y + rect.height <= 1.001) || !Array.isArray(value.messages) || !value.messages.every((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.text === 'string' && message.text.length <= 100000) || typeof value.updatedAt !== 'string') throw new Error('설명 저장 형식이 올바르지 않아.')
}
