import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import { appScales } from '../shared/appearance'
import type { DesktopBridge, Paper } from '../shared/types'

const bridge: DesktopBridge = {
  createBackup: (preferences, translations) => ipcRenderer.invoke('backup:create', preferences, translations),
  prepareRestore: (preferences) => ipcRenderer.invoke('backup:prepare', preferences),
  applyRestore: (token, preferences, settings) => ipcRenderer.invoke('backup:restore', token, preferences, settings),
  discardRestore: () => ipcRenderer.invoke('backup:discard'),
  restoredPreferences: () => ipcRenderer.invoke('backup:preferences'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getUpdateState: () => ipcRenderer.invoke('app:update-state'),
  checkAppUpdate: () => ipcRenderer.invoke('app:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('app:update-download'),
  installUpdate: () => ipcRenderer.invoke('app:update-install'),
  cancelUpdate: () => ipcRenderer.invoke('app:update-cancel'),
  acknowledgeUpdateLock: (revision, blocked) => ipcRenderer.send('app:update-locked', revision, blocked),
  setUpdateBlocked: (blocked) => ipcRenderer.send('app:update-blocked', blocked),
  onAppUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => callback(state)
    ipcRenderer.on('app:update-state', listener)
    return () => ipcRenderer.removeListener('app:update-state', listener)
  },
  checkUpdate: () => ipcRenderer.invoke('app:update'),
  openReleases: () => ipcRenderer.invoke('app:releases'),
  relinkPaper: (id) => ipcRenderer.invoke('papers:relink', id),
  undoRemovePaper: () => ipcRenderer.invoke('papers:undo-remove'),
  exportMarkdown: (id, text, kind) => ipcRenderer.invoke('papers:export', id, text, kind),
  onCommand: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, command: Parameters<typeof callback>[0]) => callback(command)
    ipcRenderer.on('app:command', listener)
    return () => ipcRenderer.removeListener('app:command', listener)
  },
  setAppScale: (scale) => {
    if (!appScales.includes(scale)) throw new Error('지원하지 않는 앱 화면 크기야.')
    webFrame.setZoomFactor(scale)
  },
  getTranslations: (id, fingerprint) => ipcRenderer.invoke('translations:get', id, fingerprint),
  saveTranslations: (id, cache) => ipcRenderer.invoke('translations:put', id, cache),
  getAnnotations: (id) => ipcRenderer.invoke('notes:get', id),
  saveAnnotation: (id, thread) => ipcRenderer.invoke('notes:put', id, thread),
  removeAnnotation: (id, threadId) => ipcRenderer.invoke('notes:remove', id, threadId),
  listPapers: () => ipcRenderer.invoke('papers:list'),
  choosePdfs: () => ipcRenderer.invoke('papers:choose'),
  openExample: () => ipcRenderer.invoke('papers:example'),
  getZotero: () => ipcRenderer.invoke('zotero:list'),
  syncZotero: () => ipcRenderer.invoke('zotero:sync'),
  getZoteroCollections: () => ipcRenderer.invoke('zotero:collections'),
  importZotero: (key) => ipcRenderer.invoke('zotero:import', key),
  openZoteroHelp: () => ipcRenderer.invoke('zotero:help'),
  dropPdfs: (files) => ipcRenderer.invoke('papers:drop', files.map((file) => webUtils.getPathForFile(file)).filter(Boolean)),
  previewPdf: (id) => ipcRenderer.invoke('papers:preview', id),
  readPdf: (id) => ipcRenderer.invoke('papers:read', id),
  updatePage: (id, page) => ipcRenderer.invoke('papers:page', id, page),
  removePaper: (id) => ipcRenderer.invoke('papers:remove', id),
  getProviderUsage: (force = false) => ipcRenderer.invoke('providers:usage', force),
  onUsageChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('providers:usage-changed', listener)
    return () => ipcRenderer.removeListener('providers:usage-changed', listener)
  },
  getProviders: () => ipcRenderer.invoke('providers:list'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  askAI: (provider, prompt, model, fast = false, requestId, image) => ipcRenderer.invoke('ai:ask', provider, prompt, model, fast, requestId, image),
  cancelAI: (requestId) => ipcRenderer.invoke('ai:cancel', requestId),
  onOpenPaper: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, papers: Paper[]) => callback(papers)
    ipcRenderer.on('papers:opened', listener)
    return () => ipcRenderer.removeListener('papers:opened', listener)
  }
}
contextBridge.exposeInMainWorld('paperglim', bridge)
