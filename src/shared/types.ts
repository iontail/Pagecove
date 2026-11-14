import type { SelectionThread } from './paper-harness'
export type Paper = {
  id: string
  name: string
  page: number
  addedAt: string
  lastOpenedAt: string
  source?: 'zotero'
  zoteroKey?: string
  collectionKeys?: string[]
}

export type ZoteroCollection = { key: string; name: string; parentKey: string | null }
export type ZoteroPaper = { key: string; title: string; filename: string; authors: string; year: string; collections: string[] }
export type ZoteroCatalog = { papers: ZoteroPaper[]; collections: ZoteroCollection[] }
export type ZoteroSyncResult = { catalog: ZoteroCatalog; available: number; unavailable: number }

export type AIModel = { id: string; name: string; supportsFast?: boolean }

export type ProviderStatus = {
  id: 'codex' | 'claude'
  name: string
  installed: boolean
  version: string | null
  models?: AIModel[]
  fastMode?: boolean
  fastModeNote?: string
}

export type DesktopBridge = {
  getAnnotations: (id: string) => Promise<SelectionThread[]>
  saveAnnotation: (id: string, thread: SelectionThread) => Promise<void>
  removeAnnotation: (id: string, threadId: string) => Promise<void>
  listPapers: () => Promise<Paper[]>
  choosePdfs: () => Promise<Paper[]>
  openExample: () => Promise<Paper[]>
  getZotero: () => Promise<ZoteroCatalog>
  syncZotero: () => Promise<ZoteroSyncResult>
  getZoteroCollections: () => Promise<ZoteroCollection[]>
  importZotero: (key: string) => Promise<Paper[]>
  openZoteroHelp: () => Promise<void>
  dropPdfs: (files: File[]) => Promise<Paper[]>
  readPdf: (id: string) => Promise<Uint8Array>
  updatePage: (id: string, page: number) => Promise<void>
  removePaper: (id: string) => Promise<void>
  getProviders: () => Promise<ProviderStatus[]>
  copyText: (text: string) => Promise<void>
  askAI: (provider: 'codex' | 'claude', prompt: string, model?: string, fast?: boolean) => Promise<string>
  onOpenPaper: (callback: (papers: Paper[]) => void) => () => void
}
