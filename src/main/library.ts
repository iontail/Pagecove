import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import type { Paper, ZoteroCatalog, ZoteroCollection, ZoteroPaper } from '../shared/types'

export type StoredPaper = Paper & { path: string; fingerprint?: string }
const MAX_PDF_BYTES = 150 * 1024 * 1024

export class PaperLibrary {
  private papers: StoredPaper[] = []
  private pendingWrite = Promise.resolve()
  private collections: ZoteroCollection[] = []
  private removed: StoredPaper | null = null

  private directory: string
  private examplePath?: string

  constructor(directory: string, examplePath?: string) { this.directory = directory; this.examplePath = examplePath }

  async load() {
    this.removed = null
    await mkdir(this.directory, { recursive: true })
    try {
      const content = JSON.parse(await readFile(join(this.directory, 'library.json'), 'utf8'))
      if (!Array.isArray(content) || !content.every((paper) =>
        typeof paper.id === 'string' && typeof paper.path === 'string' &&
        typeof paper.name === 'string' && typeof paper.addedAt === 'string' &&
        typeof paper.lastOpenedAt === 'string' && Number.isInteger(paper.page) && paper.page >= 1
      )) throw new Error('논문 목록을 읽지 못했어요. library.json 파일을 확인해 주세요.')
      this.papers = content
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    try {
      const collections = JSON.parse(await readFile(join(this.directory, 'zotero-collections.json'), 'utf8'))
      if (!Array.isArray(collections) || !collections.every((entry) => typeof entry.key === 'string' && typeof entry.name === 'string' && (entry.parentKey === null || typeof entry.parentKey === 'string'))) throw new Error('저장한 Zotero 컬렉션을 읽지 못했어요.')
      this.collections = collections
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }

  async flush() { await this.pendingWrite }

  list(): Paper[] {
    return this.papers.toSorted((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
      .map(({ path: _path, fingerprint: _fingerprint, ...paper }) => paper)
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
      const { path: _path, fingerprint: _fingerprint, ...publicPaper } = paper
      return publicPaper
  }

  async read(id: string, opened = true): Promise<Uint8Array> {
    const paper = this.papers.find((entry) => entry.id === id)
    if (!paper) throw new Error('목록에 없는 PDF예요. ‘PDF 열기’로 다시 추가해 주세요.')
    try {
      await validatePdf(paper.path)
      const bytes = await readFile(paper.path)
      if (opened) {
        paper.fingerprint = createHash('sha256').update(bytes).digest('hex')
        paper.lastOpenedAt = new Date().toISOString()
        await this.save()
      }
      return new Uint8Array(bytes)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (this.examplePath && paper.path !== this.examplePath && /\/(?:PaperGlim|Pagecove)\.app\/Contents\/Resources\/app\.asar\/resources\/ResNet\.pdf$/.test(paper.path)) {
          await this.relink(id, this.examplePath, true)
          return this.read(id, opened)
        }
        throw new Error('원본 PDF를 찾지 못했어요. 파일 위치를 다시 지정해 주세요.')
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
    this.removed = this.papers.find((paper) => paper.id === id) ?? null
    this.papers = this.papers.filter((paper) => paper.id !== id)
    await this.save()
  }

  async undoRemove() {
    const paper = this.removed
    if (!paper) throw new Error('되돌릴 작업이 없어요.')
    if (this.papers.some((entry) => entry.id === paper.id || entry.path === paper.path || (paper.zoteroKey && entry.zoteroKey === paper.zoteroKey))) throw new Error('이미 다시 등록된 논문이야.')
    this.papers.push(paper)
    await this.save()
    this.removed = null
    return this.list().find((entry) => entry.id === paper.id)!
  }

  async relink(id: string, path: string, allowUnverified = false) {
    const paper = this.papers.find((entry) => entry.id === id)
    if (!paper) throw new Error('목록에 없는 PDF야.')
    path = resolve(path)
    await validatePdf(path)
    if (this.papers.some((entry) => entry.id !== id && entry.path === path)) throw new Error('이미 다른 항목에 연결된 파일이야.')
    const fingerprint = createHash('sha256').update(await readFile(path)).digest('hex')
    if (paper.fingerprint && fingerprint !== paper.fingerprint) throw new Error('원래 PDF와 내용이 달라요. 같은 파일을 선택하세요. 다른 PDF는 서재에 새로 추가할 수 있어요.')
    if (!paper.fingerprint && !allowUnverified) throw Object.assign(new Error('원래 PDF와 내용이 같은지 확인할 수 없어요.'), { code: 'UNVERIFIED_PDF' })
    paper.path = path
    paper.fingerprint = fingerprint
    await this.save()
    return this.list().find((entry) => entry.id === id)!
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
  if (extname(path).toLowerCase() !== '.pdf') throw new Error('PDF 파일을 선택해 주세요.')
  const info = await stat(path)
  if (!info.isFile()) throw new Error('PDF 파일을 선택해 주세요.')
  if (info.size > MAX_PDF_BYTES) throw new Error('150MB 이하의 PDF를 선택해 주세요.')
}
