import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { StoredPaper } from './library'
import type { ZoteroCollection } from '../shared/types'
import type { SelectionThread } from '../shared/paper-harness'
import type { TranslationCache } from '../shared/translation-cache'
import { validateTranslationCache } from '../shared/translation-cache.ts'
import { validateAnnotation } from './annotations.ts'
import { backupPreferences } from '../shared/backup.ts'

export type BackupData = { format: 'PaperGlim'; version: 1; appVersion: string; createdAt: string; papers: StoredPaper[]; collections: ZoteroCollection[]; annotations: Record<string, SelectionThread[]>; translations: Record<string, TranslationCache>; preferences: Record<string, string> }
const MAX_BYTES = 256 * 1024 * 1024
const fail = () => { throw new Error('올바른 PaperGlim 백업 파일이 아니야. 현재 자료는 변경하지 않았어.') }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max = 1000): value is string => typeof value === 'string' && value.length <= max
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const allowedFile = (name: string) => /^(library\.json|zotero-collections\.json|restored-preferences\.json|(?:annotations|translations)\/[^/]+\.json)$/.test(name)

export function validateBackup(value: unknown): BackupData {
  if (!record(value) || value.format !== 'PaperGlim' || value.version !== 1 || !text(value.appVersion, 100) || !text(value.createdAt, 100) || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.papers) || value.papers.length > 10000 || !Array.isArray(value.collections) || value.collections.length > 10000 || !record(value.annotations) || !record(value.translations)) return fail()
  const ids = new Set<string>()
  const papers: StoredPaper[] = value.papers.map((paper) => {
    if (record(paper) && text(paper.id) && (Object.hasOwn(Object.prototype, paper.id) || paper.id === 'prototype')) return fail()
    if (!record(paper) || !text(paper.id, 200) || !paper.id || ids.has(paper.id) || !text(paper.name) || !text(paper.path, 10000) || !isAbsolute(paper.path) || !/\.pdf$/i.test(paper.path) || !text(paper.addedAt, 100) || !text(paper.lastOpenedAt, 100) || !Number.isSafeInteger(paper.page) || (paper.page as number) < 1 || (paper.source !== undefined && paper.source !== 'zotero') || (paper.zoteroKey !== undefined && !text(paper.zoteroKey, 200)) || (paper.collectionKeys !== undefined && (!Array.isArray(paper.collectionKeys) || !paper.collectionKeys.every((key) => text(key, 200)))) || (paper.fingerprint !== undefined && (!text(paper.fingerprint, 64) || !/^[a-f0-9]{64}$/.test(paper.fingerprint)))) return fail()
    ids.add(paper.id)
    return { id: paper.id, name: paper.name, path: paper.path, addedAt: paper.addedAt, lastOpenedAt: paper.lastOpenedAt, page: paper.page as number, ...(paper.source ? { source: paper.source } : {}), ...(paper.zoteroKey ? { zoteroKey: paper.zoteroKey as string } : {}), ...(paper.collectionKeys ? { collectionKeys: paper.collectionKeys as string[] } : {}), ...(paper.fingerprint ? { fingerprint: paper.fingerprint as string } : {}) }
  })
  const collectionIds = new Set<string>()
  const collections: ZoteroCollection[] = value.collections.map((entry) => {
    if (!record(entry) || !text(entry.key, 200) || !entry.key || collectionIds.has(entry.key) || !text(entry.name) || (entry.parentKey !== null && !text(entry.parentKey, 200))) return fail()
    collectionIds.add(entry.key)
    return { key: entry.key, name: entry.name, parentKey: entry.parentKey }
  })
  const collectionMap = new Map(collections.map((entry) => [entry.key, entry]))
  for (const entry of collections) {
    const visited = new Set<string>([entry.key])
    let parent = entry.parentKey
    while (parent) { if (visited.has(parent) || visited.size > 100) return fail(); visited.add(parent); parent = collectionMap.get(parent)?.parentKey ?? null }
  }
  const annotations: Record<string, SelectionThread[]> = Object.fromEntries(Object.entries(value.annotations).map(([id, notes]) => {
    if (!ids.has(id) || !Array.isArray(notes) || notes.length > 10000 || Buffer.byteLength(JSON.stringify(notes)) > 5000000) return fail()
    const seen = new Set<string>()
    for (const note of notes) { validateAnnotation(note); if (seen.has(note.id) || !Number.isFinite(Date.parse(note.updatedAt))) return fail(); seen.add(note.id) }
    return [id, notes]
  }))
  const translations = Object.fromEntries(Object.entries(value.translations).map(([id, cache]) => {
    if (!ids.has(id) || Buffer.byteLength(JSON.stringify(cache)) > 40000000) return fail()
    validateTranslationCache(cache as TranslationCache)
    const checked = cache as TranslationCache
    if (new Set(checked.entries.map((entry) => entry.page)).size !== checked.entries.length) return fail()
    return [id, checked]
  }))
  return { format: 'PaperGlim', version: 1, appVersion: value.appVersion, createdAt: value.createdAt, papers, collections, annotations, translations, preferences: backupPreferences(value.preferences) }
}

export function mergeBackup(current: BackupData, incoming: BackupData) {
  const merged: BackupData = structuredClone(current)
  const skipped = new Set<string>()
  let addedDocuments = 0, conflicts = 0, explanations = 0, translationPages = 0
  for (const paper of incoming.papers) {
    const same = merged.papers.find((entry) => entry.id === paper.id)
    const collision = merged.papers.find((entry) => entry.id !== paper.id && (entry.path === paper.path || (paper.zoteroKey && entry.zoteroKey === paper.zoteroKey)))
    if (collision || (same?.fingerprint && paper.fingerprint && same.fingerprint !== paper.fingerprint)) { skipped.add(paper.id); conflicts++; continue }
    if (!same) { merged.papers.push(paper); addedDocuments++ }
    const existing = merged.annotations[paper.id] ?? []
    const notes = incoming.annotations[paper.id] ?? []
    for (const note of notes) {
      if (existing.some((entry) => entry.id === note.id)) continue
      existing.push(note); explanations++
    }
    if (existing.length) merged.annotations[paper.id] = existing
    const cache = incoming.translations[paper.id]
    const previous = merged.translations[paper.id]
    if (!cache) continue
    if (previous && previous.fingerprint !== cache.fingerprint) { conflicts++; continue }
    const combined = previous ?? { ...cache, entries: [], visible: [] }
    for (const entry of cache.entries) if (!combined.entries.some((old) => old.page === entry.page)) { combined.entries.push(entry); translationPages++ }
    combined.visible = [...new Set([...combined.visible, ...cache.visible])].sort((a, b) => a - b)
    merged.translations[paper.id] = combined
  }
  const usedCollections = new Set(incoming.papers.filter((paper) => !skipped.has(paper.id)).flatMap((paper) => paper.collectionKeys ?? []))
  for (const entry of incoming.collections) if (!merged.collections.some((old) => old.key === entry.key) && (usedCollections.has(entry.key) || incoming.collections.some((child) => child.parentKey === entry.key))) merged.collections.push(entry)
  validateBackup(merged)
  return { data: merged, addedDocuments, conflicts, explanations, translationPages }
}

async function optionalJson(path: string, fallback: unknown) {
  try { const info = await stat(path); if (info.size > MAX_BYTES) throw new Error('자료 파일이 너무 커. 번역 캐시를 제외하고 다시 시도해 줘.'); return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error }
}

export class BackupStore {
  requiresRecovery = false
  constructor(directory: string, version: string) { this.directory = directory; this.version = version }
  private directory: string
  private version: string
  async snapshot(preferences: unknown, includeTranslations = true, recordIds?: Set<string>) {
    const papers = await optionalJson(join(this.directory, 'library.json'), []) as StoredPaper[]
    if (!Array.isArray(papers) || papers.length > 10000) return fail()
    let bytes = Buffer.byteLength(JSON.stringify(papers))
    const annotations: Record<string, SelectionThread[]> = {}, translations: Record<string, TranslationCache> = {}
    for (const paper of papers) {
      if (recordIds && !recordIds.has(paper.id)) continue
      const name = `${encodeURIComponent(paper.id)}.json`
      const notes = await optionalJson(join(this.directory, 'annotations', name), []) as SelectionThread[]
      if (notes.length) annotations[paper.id] = notes
      bytes += Buffer.byteLength(JSON.stringify(notes))
      if (includeTranslations) {
        const cache = await optionalJson(join(this.directory, 'translations', name), null) as TranslationCache | null
        if (cache && (!paper.fingerprint || cache.fingerprint === paper.fingerprint)) translations[paper.id] = cache
        if (cache) bytes += Buffer.byteLength(JSON.stringify(cache))
      }
      if (bytes > MAX_BYTES) throw new Error('자료가 256MB를 넘어. 번역 캐시를 제외하고 다시 시도해 줘.')
    }
    return validateBackup({ format: 'PaperGlim', version: 1, appVersion: this.version, createdAt: new Date().toISOString(), papers, collections: await optionalJson(join(this.directory, 'zotero-collections.json'), []), annotations, translations, preferences: backupPreferences(preferences) })
  }
  async export(path: string, preferences: unknown, includeTranslations: boolean) {
    if (resolve(path).startsWith(resolve(this.directory) + sep)) throw new Error('앱 자료 폴더 밖에 백업을 저장해 줘.')
    const data = await this.snapshot(preferences, includeTranslations)
    const json = JSON.stringify(data)
    if (Buffer.byteLength(json) > MAX_BYTES) throw new Error('백업이 256MB를 넘어. 번역 캐시를 제외하고 다시 시도해 줘.')
    await this.write(path, json)
  }
  async prepare(path: string, preferences: unknown) {
    if ((await stat(path)).size > MAX_BYTES) throw new Error('256MB 이하의 백업 파일을 선택해 줘.')
    let parsed: unknown
    try { parsed = JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error instanceof SyntaxError) return fail(); throw error }
    const incoming = validateBackup(parsed)
    const current = await this.snapshot(preferences, true, new Set(incoming.papers.map((paper) => paper.id)))
    const merged = mergeBackup(current, incoming)
    return { incoming, base: digest({ ...current, createdAt: '' }), summary: { createdAt: incoming.createdAt, documents: incoming.papers.length, settings: Object.keys(incoming.preferences).length, addedDocuments: merged.addedDocuments, conflicts: merged.conflicts, explanations: merged.explanations, translationPages: merged.translationPages } }
  }
  async restore(plan: Awaited<ReturnType<BackupStore['prepare']>>, preferences: unknown, restoreSettings: boolean) {
    const current = await this.snapshot(preferences, true, new Set(plan.incoming.papers.map((paper) => paper.id)))
    if (plan.base !== digest({ ...current, createdAt: '' })) throw new Error('미리보기 이후 자료가 바뀌었어. 백업 파일을 다시 선택해 줘. 현재 자료는 변경하지 않았어.')
    const merged = mergeBackup(current, plan.incoming).data
    const files = new Map<string, string>([['library.json', JSON.stringify(merged.papers)], ['zotero-collections.json', JSON.stringify(merged.collections)]])
    for (const [id, notes] of Object.entries(merged.annotations)) files.set(`annotations/${encodeURIComponent(id)}.json`, JSON.stringify(notes))
    for (const [id, cache] of Object.entries(merged.translations)) files.set(`translations/${encodeURIComponent(id)}.json`, JSON.stringify(cache))
    files.set('restored-preferences.json', JSON.stringify({ revision: randomUUID(), preferences: restoreSettings ? plan.incoming.preferences : {} }))
    await this.transaction(files)
  }
  async write(path: string, content: string) {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    try { await writeFile(temporary, content, { mode: 0o600, flag: 'wx' }); await rename(temporary, path) }
    finally { await rm(temporary, { force: true }) }
  }
  async transaction(files: Map<string, string>) {
    const id = randomUUID(), directory = join(this.directory, `restore-${id}`)
    await mkdir(directory, { recursive: true })
    const journal = { id, status: 'pending', files: [] as { path: string; existed: boolean }[] }
    try {
      for (const [path] of files) {
        if (!allowedFile(path)) throw new Error('복원할 파일 경로가 올바르지 않아.')
        const target = join(this.directory, path)
        if (path.includes('/')) { try { if ((await lstat(dirname(target))).isSymbolicLink()) throw new Error('자료 폴더의 연결 경로를 확인해 줘.') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error } }
        let existed = false
        try { const info = await lstat(target); if (!info.isFile() || info.isSymbolicLink()) throw new Error('자료 파일의 연결 경로를 확인해 줘.'); await copyFile(target, join(directory, String(journal.files.length))); existed = true }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        journal.files.push({ path, existed })
      }
      await this.write(join(this.directory, 'restore-journal.json'), JSON.stringify(journal))
      for (const [path, content] of files) await this.write(join(this.directory, path), content)
      await this.write(join(this.directory, 'restore-journal.json'), JSON.stringify({ ...journal, status: 'committed' }))
      await this.recover()
    } catch (error) {
      try { await this.recover() } catch { this.requiresRecovery = true; throw new Error('복원을 마무리하지 못했어. 앱을 다시 실행하면 기존 자료 복구를 다시 시도해.') }
      throw error
    } finally {
      try { await lstat(join(this.directory, 'restore-journal.json')) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') await rm(directory, { recursive: true, force: true }) }
    }
  }
  async recover() {
    const path = join(this.directory, 'restore-journal.json')
    const journal = await optionalJson(path, null) as { id: string; status: string; files: { path: string; existed: boolean }[] } | null
    if (!journal) return
    if (!/^[a-f0-9-]{36}$/.test(journal.id) || !['pending', 'committed'].includes(journal.status) || !Array.isArray(journal.files) || journal.files.length > 30000 || !journal.files.every((file) => typeof file.path === 'string' && allowedFile(file.path) && typeof file.existed === 'boolean')) throw new Error('복원 복구 기록을 확인할 수 없어. 자료를 변경하지 않았어.')
    const directory = join(this.directory, `restore-${journal.id}`)
    if (journal.status === 'committed') {
      try { await rm(directory, { recursive: true, force: true }); await rm(path) } catch { /* Committed data remains usable if cleanup needs another launch. */ }
      return
    }
    if (journal.status === 'pending') for (const [index, file] of journal.files.entries()) {
      const target = join(this.directory, file.path)
      if (file.existed) { await mkdir(dirname(target), { recursive: true }); await copyFile(join(directory, String(index)), `${target}.restore-tmp`); await rename(`${target}.restore-tmp`, target) }
      else await rm(target, { force: true })
    }
    await rm(path)
    await rm(directory, { recursive: true, force: true })
    this.requiresRecovery = false
  }
  async restoredPreferences() {
    const value = await optionalJson(join(this.directory, 'restored-preferences.json'), null) as { revision: string; preferences: unknown } | null
    if (!value) return null
    if (typeof value.revision !== 'string') throw new Error('복원된 설정 정보를 읽지 못했어.')
    return { revision: value.revision, preferences: backupPreferences(value.preferences) }
  }
}
