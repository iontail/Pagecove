import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import type { Paper, ZoteroCatalog, ZoteroCollection, ZoteroPaper } from '../shared/types'

type StoredPaper = Paper & { path: string }
const MAX_PDF_BYTES = 150 * 1024 * 1024

export class PaperLibrary {
  private papers: StoredPaper[] = []
  private pendingWrite = Promise.resolve()
  private collections: ZoteroCollection[] = []

  private directory: string

  constructor(directory: string) { this.directory = directory }

  async load() {
    await mkdir(this.directory, { recursive: true })
    try {
      const content = JSON.parse(await readFile(join(this.directory, 'library.json'), 'utf8'))
      if (!Array.isArray(content) || !content.every((paper) =>
        typeof paper.id === 'string' && typeof paper.path === 'string' &&
        typeof paper.name === 'string' && typeof paper.addedAt === 'string' &&
        typeof paper.lastOpenedAt === 'string' && Number.isInteger(paper.page) && paper.page >= 1
      )) throw new Error('논문 목록 파일을 읽을 수 없어. library.json을 확인해 줘.')
      this.papers = content
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    try {
      const collections = JSON.parse(await readFile(join(this.directory, 'zotero-collections.json'), 'utf8'))
      if (!Array.isArray(collections) || !collections.every((entry) => typeof entry.key === 'string' && typeof entry.name === 'string' && (entry.parentKey === null || typeof entry.parentKey === 'string'))) throw new Error('저장된 Zotero 컬렉션을 읽을 수 없어.')
      this.collections = collections
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }

  list(): Paper[] {
    return this.papers.toSorted((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
      .map(({ path: _path, ...paper }) => paper)
  }

  getCollections() { return this.collections }
  unlinkedZotero() { return this.papers.filter((paper) => paper.source === 'zotero' && !paper.zoteroKey).map(({ name, path }) => ({ name, path })) }

  async syncZotero(catalog: ZoteroCatalog, legacyPaths = new Map<string, string>()) {
    this.collections = catalog.collections
    const entries = new Map(catalog.papers.map((paper) => [paper.key, paper]))
    for (const paper of this.papers) {
      // Legacy imports have no attachment key; match their exact local path.
      if (paper.source === 'zotero' && !paper.zoteroKey) paper.zoteroKey = legacyPaths.get(paper.path)
      if (!paper.zoteroKey) continue
      const entry = entries.get(paper.zoteroKey)
      paper.collectionKeys = entry?.collections ?? []
      if (entry) paper.name = entry.title
    }
    await this.save()
  }

  async add(paths: string[], zotero?: ZoteroPaper) {
    const resolved = paths.map((file) => resolve(file))
    await Promise.all(resolved.map(validatePdf))
    const added = resolved.map((path) => this.register(path, zotero, true))
    await this.save()
    return added
  }

  async importZotero(files: { path: string; paper: ZoteroPaper }[]) {
    let unavailable = 0
    let available = 0
    for (const file of files) {
      const path = resolve(file.path)
      try { await validatePdf(path) }
      catch { unavailable++; continue }
      this.register(path, file.paper, false)
      available++
    }
    await this.save()
    return { available, unavailable }
  }

  private register(path: string, zotero: ZoteroPaper | undefined, opened: boolean) {
      let paper = this.papers.find((entry) => entry.path === path || (zotero && entry.zoteroKey === zotero.key))
      const now = new Date().toISOString()
      if (paper) { if (opened) paper.lastOpenedAt = now; paper.path = path }
      else {
        paper = { id: randomUUID(), path, name: basename(path, extname(path)), page: 1, addedAt: now, lastOpenedAt: opened ? now : '' }
        this.papers.push(paper)
      }
      if (zotero) { paper.name = zotero.title; paper.source = 'zotero'; paper.zoteroKey = zotero.key; paper.collectionKeys = zotero.collections }
      const { path: _path, ...publicPaper } = paper
      return publicPaper
  }

  async read(id: string) {
    const paper = this.papers.find((entry) => entry.id === id)
    if (!paper) throw new Error('목록에 없는 PDF야. 파일 열기로 다시 추가해 줘.')
    try {
      await validatePdf(paper.path)
      const bytes = await readFile(paper.path)
      paper.lastOpenedAt = new Date().toISOString()
      await this.save()
      return new Uint8Array(bytes)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('원본 PDF가 이동되었거나 삭제됐어. 파일 열기로 다시 추가해 줘.')
      }
      throw error
    }
  }

  async updatePage(id: string, page: number) {
    const paper = this.papers.find((entry) => entry.id === id)
    if (!paper || !Number.isInteger(page) || page < 1) throw new Error('올바르지 않은 페이지야.')
    paper.page = page
    await this.save()
  }

  async remove(id: string) {
    this.papers = this.papers.filter((paper) => paper.id !== id)
    await this.save()
  }

  private save() {
    const snapshot = JSON.stringify(this.papers, null, 2)
    const collections = JSON.stringify(this.collections, null, 2)
    const write = this.pendingWrite.then(async () => {
      const path = join(this.directory, 'library.json')
      await writeFile(`${path}.tmp`, snapshot, { mode: 0o600 })
      await rename(`${path}.tmp`, path)
      const collectionPath = join(this.directory, 'zotero-collections.json')
      await writeFile(`${collectionPath}.tmp`, collections, { mode: 0o600 })
      await rename(`${collectionPath}.tmp`, collectionPath)
    })
    this.pendingWrite = write.catch(() => {})
    return write
  }
}

async function validatePdf(path: string) {
  if (extname(path).toLowerCase() !== '.pdf') throw new Error('PDF 파일을 선택해 줘.')
  const info = await stat(path)
  if (!info.isFile()) throw new Error('PDF 파일을 선택해 줘.')
  if (info.size > MAX_PDF_BYTES) throw new Error('첫 버전에서는 150MB 이하 PDF를 열 수 있어.')
}
