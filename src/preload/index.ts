import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DesktopBridge, Paper } from '../shared/types'

const bridge: DesktopBridge = {
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
  readPdf: (id) => ipcRenderer.invoke('papers:read', id),
  updatePage: (id, page) => ipcRenderer.invoke('papers:page', id, page),
  removePaper: (id) => ipcRenderer.invoke('papers:remove', id),
  getProviders: () => ipcRenderer.invoke('providers:list'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  askAI: (provider, prompt, model, fast = false, requestId) => ipcRenderer.invoke('ai:ask', provider, prompt, model, fast, requestId),
  cancelAI: (requestId) => ipcRenderer.invoke('ai:cancel', requestId),
  onOpenPaper: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, papers: Paper[]) => callback(papers)
    ipcRenderer.on('papers:opened', listener)
    return () => ipcRenderer.removeListener('papers:opened', listener)
  }
}
contextBridge.exposeInMainWorld('paperglim', bridge)
