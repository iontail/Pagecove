import { createHash } from 'node:crypto'
import { TranslationCacheStore } from './translation-cache'
import { AIRequests } from './ai-requests'
import { AnnotationStore } from './annotations'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, screen, shell } from 'electron'
import { join } from 'node:path'
import { PaperLibrary } from './library'
import { askProvider, getProviders } from './providers'
import { ZoteroClient } from './zotero'

app.setName('PaperGlim')
if (process.env.PAPERGLIM_PROFILE_DIR) app.setPath('userData', process.env.PAPERGLIM_PROFILE_DIR)

let window: BrowserWindow | null = null
let library: PaperLibrary
const pendingFiles: string[] = []
const zotero = new ZoteroClient()
const aiRequests = new AIRequests()

async function openFiles(paths: string[]) {
  try {
    const papers = await library.add(paths)
    window?.webContents.send('papers:opened', papers)
  } catch (error) {
    dialog.showErrorBox('PDF를 열 수 없어', error instanceof Error ? error.message : String(error))
  }
}

app.on('open-file', (event, path) => {
  event.preventDefault()
  if (library && window && !window.webContents.isLoading()) void openFiles([path])
  else pendingFiles.push(path)
})

async function choosePdfs() {
  if (!window) return []
  const result = await dialog.showOpenDialog(window, {
    title: '논문 PDF 열기', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  return result.canceled ? [] : library.add(result.filePaths)
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  window = new BrowserWindow({
    width: Math.min(1420, width - 40), height: Math.min(930, height - 40),
    minWidth: Math.min(1040, width - 40), minHeight: Math.min(680, height - 40),
    title: 'PaperGlim', titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 }, backgroundColor: '#18191b',
    show: !process.env.PAPERGLIM_BACKGROUND,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: !process.env.PAPERGLIM_BACKGROUND
    }
  })
  const owner = window.webContents.id
  window.webContents.on('did-start-loading', () => aiRequests.cancelOwner(owner))
  window.webContents.on('destroyed', () => aiRequests.cancelOwner(owner))
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(() => dialog.showErrorBox('링크를 열 수 없어', '기본 브라우저 설정을 확인해 줘.'))
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.once('did-finish-load', () => {
    if (pendingFiles.length) void openFiles(pendingFiles.splice(0))
  })
  window.on('closed', () => { window = null })
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'resources', 'icon.png'))
  library = new PaperLibrary(app.getPath('userData'))
  try { await library.load() }
  catch (error) {
    dialog.showErrorBox('논문 목록을 불러올 수 없어', error instanceof Error ? error.message : String(error))
    app.quit()
    return
  }
  const translations = new TranslationCacheStore(join(app.getPath('userData'), 'translations'))
  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault(); quitting = true
    for (const window of BrowserWindow.getAllWindows()) aiRequests.cancelOwner(window.webContents.id)
    void translations.flush().finally(() => app.quit())
  })
  const annotations = new AnnotationStore(join(app.getPath('userData'), 'annotations'))
  const checkPaper = (id: string) => { if (!library.list().some((paper) => paper.id === id)) throw new Error('등록된 논문을 찾을 수 없어.') }
  ipcMain.handle('translations:get', (_event, id: string, fingerprint: string) => { checkPaper(id); return translations.get(id, fingerprint) })
  ipcMain.handle('translations:put', (_event, id, cache) => { checkPaper(id); return translations.put(id, cache) })
  ipcMain.handle('notes:get', (_event, id: string) => { checkPaper(id); return annotations.get(id) })
  ipcMain.handle('notes:put', (_event, id, thread) => { checkPaper(id); return annotations.put(id, thread) })
  ipcMain.handle('notes:remove', (_event, id, threadId) => { checkPaper(id); return annotations.put(id, null, threadId) })
  ipcMain.handle('papers:list', () => library.list())
  ipcMain.handle('papers:choose', () => choosePdfs())
  ipcMain.handle('papers:example', () => library.add([join(app.getAppPath(), 'resources', 'ResNet.pdf')]))
  ipcMain.handle('zotero:list', async () => {
    const catalog = await zotero.catalog()
    const legacy = library.unlinkedZotero()
    const paths = new Map<string, string>()
    for (const entry of catalog.papers.filter((paper) => legacy.some((old) => old.name === paper.title))) {
      try { const file = await zotero.resolvePdf(entry.key); paths.set(file.path, entry.key) }
      catch { /* Missing local PDFs can be linked again after downloading. */ }
    }
    await library.syncZotero(catalog, paths)
    return catalog
  })
  ipcMain.handle('zotero:collections', () => library.getCollections())
  ipcMain.handle('zotero:sync', async () => {
    const catalog = await zotero.catalog()
    const files: Awaited<ReturnType<typeof zotero.resolvePdf>>[] = []
    let missing = 0
    for (const entry of catalog.papers) {
      try { files.push(await zotero.resolvePdf(entry.key)) }
      catch (error) { if ((error as { code?: string }).code === 'ZOTERO_MISSING') missing++; else throw error }
    }
    await library.syncZotero(catalog, new Map(files.map((file) => [file.path, file.paper.key])))
    const result = await library.importZotero(files)
    return { catalog, available: result.available, unavailable: result.unavailable + missing }
  })
  ipcMain.handle('zotero:import', async (_event, key: string) => { const file = await zotero.resolvePdf(key); return library.add([file.path], file.paper) })
  ipcMain.handle('zotero:help', () => shell.openExternal('https://www.zotero.org/support/dev/web_api/v3/local_api'))
  ipcMain.handle('papers:drop', (_event, paths: string[]) => library.add(paths))
  ipcMain.handle('papers:read', async (_event, id: string) => { const data = await library.read(id); return { data, fingerprint: createHash('sha256').update(data).digest('hex') } })
  ipcMain.handle('papers:page', (_event, id: string, page: number) => library.updatePage(id, page))
  ipcMain.handle('papers:remove', (_event, id: string) => library.remove(id))
  ipcMain.handle('providers:list', () => getProviders())
  ipcMain.handle('ai:ask', (event, provider, prompt, model, fast, requestId?: string) => aiRequests.run(event.sender.id, requestId, (signal) => askProvider(provider, prompt, model, fast, signal)))
  ipcMain.handle('ai:cancel', (event, requestId: string) => aiRequests.cancel(event.sender.id, requestId))
  ipcMain.handle('clipboard:write', (_event, text: string) => {
    if (typeof text !== 'string') throw new Error('복사할 텍스트가 필요해.')
    clipboard.writeText(text)
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'PaperGlim', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '파일', submenu: [{ label: 'PDF 열기…', accelerator: 'CmdOrCtrl+O', click: async () => {
      try { window?.webContents.send('papers:opened', await choosePdfs()) }
      catch (error) { dialog.showErrorBox('PDF를 열 수 없어', String(error)) }
    } }, { role: 'close' }] },
    { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '보기', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
    { label: '윈도우', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] }
  ]))
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
