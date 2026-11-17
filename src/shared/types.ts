import type { TranslationCache } from './translation-cache'
import type { SelectionThread } from './paper-harness'
import type { RestoreSummary } from './backup'
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
export type AppCommand = 'settings' | 'guide' | 'zoomIn' | 'zoomOut' | 'resetZoom' | 'find' | 'back' | 'forward' | 'outline' | 'toggleAssistant'
export type AppInfo = { version: string; build: string; packaged: boolean }
export type AppUpdate = { version: string; available: boolean; ahead: boolean; url: string; notes: string }

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
  createBackup: (preferences: Record<string, string>, translations: boolean) => Promise<boolean>
  prepareRestore: (preferences: Record<string, string>) => Promise<RestoreSummary | null>
  applyRestore: (token: string, preferences: Record<string, string>, settings: boolean) => Promise<void>
  discardRestore: () => Promise<void>
  restoredPreferences: () => Promise<{ revision: string; preferences: Record<string, string> } | null>
  setAppScale: (scale: number) => void
  getAppInfo: () => Promise<AppInfo>
  checkUpdate: () => Promise<AppUpdate>
  openReleases: () => Promise<void>
  onCommand: (callback: (command: AppCommand) => void) => () => void
  relinkPaper: (id: string) => Promise<Paper | null>
  undoRemovePaper: () => Promise<Paper>
  exportMarkdown: (id: string, text: string, kind: '답변' | '요약' | '선택 영역 설명') => Promise<boolean>
  getTranslations: (id: string, fingerprint: string) => Promise<TranslationCache | null>
  saveTranslations: (id: string, cache: TranslationCache) => Promise<void>
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
  readPdf: (id: string) => Promise<{ data: Uint8Array; fingerprint: string }>
  updatePage: (id: string, page: number) => Promise<void>
  removePaper: (id: string) => Promise<void>
  getProviders: () => Promise<ProviderStatus[]>
  copyText: (text: string) => Promise<void>
  askAI: (provider: 'codex' | 'claude', prompt: string, model?: string, fast?: boolean, requestId?: string, image?: string) => Promise<string>
  cancelAI: (requestId: string) => Promise<void>
  onOpenPaper: (callback: (papers: Paper[]) => void) => () => void
}
