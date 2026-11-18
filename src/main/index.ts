import { createHash, randomUUID } from 'node:crypto'
import { BackupStore } from './backup'
import { TranslationCacheStore } from './translation-cache'
import { AIRequests } from './ai-requests'
import { AnnotationStore } from './annotations'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, screen, shell, Notification } from 'electron'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { buildNumber } from '../../package.json'
import { releaseUpdate } from './app-info'
import type { AppCommand } from '../shared/types'
import { PaperLibrary } from './library'
import { askProvider, getProviders } from './providers'
import { AppUpdater } from './app-updater'
import { getProviderUsage } from './provider-usage'
import { ZoteroClient } from './zotero'

app.setName('Pagecove')
app.setPath('userData', process.env.PAPERGLIM_PROFILE_DIR || join(app.getPath('appData'), 'PaperGlim'))

let window: BrowserWindow | null = null
let library: PaperLibrary
const pendingFiles: string[] = []
const zotero = new ZoteroClient()
const aiRequests = new AIRequests()
let maintaining = false
let activeWrites = 0
let rendererUpdateBlocked = true
let updateInstallLock = false
let appUpdater: AppUpdater | null = null
let maintenance: Promise<void> | null = null
async function withData<T>(task: () => Promise<T>) {
  if (maintaining) throw new Error('백업 또는 복원 중이에요. 작업이 끝나면 다시 시도해 주세요.')
  activeWrites++
  try { return await task() } finally { activeWrites-- }
}

async function openFiles(paths: string[]) {
  try {
    const papers = await withData(() => library.add(paths))
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
  return result.canceled ? [] : withData(() => library.add(result.filePaths))
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  window = new BrowserWindow({
    width: Math.min(1420, width - 40), height: Math.min(930, height - 40),
    minWidth: Math.min(1040, width - 40), minHeight: Math.min(680, height - 40),
    title: 'Pagecove', titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 }, backgroundColor: '#18191b',
    show: !process.env.PAPERGLIM_BACKGROUND,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: !process.env.PAPERGLIM_BACKGROUND
    }
  })
  const owner = window.webContents.id
  window.webContents.on('did-start-loading', () => { rendererUpdateBlocked = true; aiRequests.cancelOwner(owner) })
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
  library = new PaperLibrary(app.getPath('userData'), join(app.getAppPath(), 'resources', 'ResNet.pdf'))
  const backups = new BackupStore(app.getPath('userData'), app.getVersion())
  try { await backups.recover(); await library.load() }
  catch (error) {
    dialog.showErrorBox('논문 목록을 불러올 수 없어', error instanceof Error ? error.message : String(error))
    app.quit()
    return
  }
  const translations = new TranslationCacheStore(join(app.getPath('userData'), 'translations'))
  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    if (appUpdater?.state.phase === 'preparing') { event.preventDefault(); return }
    event.preventDefault(); quitting = true
    const cancelledUpdate = appUpdater?.state.phase !== 'installing' ? appUpdater?.cancel() : undefined
    for (const window of BrowserWindow.getAllWindows()) aiRequests.cancelOwner(window.webContents.id)
    void Promise.allSettled([translations.flush(), annotations.flush(), library.flush(), maintenance, cancelledUpdate]).finally(() => app.quit())
  })
  const annotations = new AnnotationStore(join(app.getPath('userData'), 'annotations'))
  let pendingRestore: { token: string; owner: number; plan: Awaited<ReturnType<BackupStore['prepare']>> } | null = null
  async function maintain(task: () => Promise<void>) {
    if (maintaining || activeWrites || aiRequests.running) throw new Error('실행 중인 작업이 있어요. AI 요청이나 동기화가 끝나면 다시 시도해 주세요.')
    maintaining = true
    maintenance = (async () => { await Promise.all([library.flush(), annotations.flush(), translations.flush()]); await task() })()
    try { await maintenance } finally { maintenance = null; maintaining = backups.requiresRecovery }
  }
  let notifiedVersion = ''
  const showUpdates = () => {
    if (updateInstallLock) return
    if (!window) createWindow()
    const target = window!
    target.show(); target.focus()
    if (target.webContents.isLoading()) target.webContents.once('did-finish-load', () => target.webContents.send('app:command', 'updates'))
    else target.webContents.send('app:command', 'updates')
  }
  let updateLock: {owner: number; revision: number; resolve: (blocked: boolean) => void} | null = null
  appUpdater = new AppUpdater({
    supported: app.isPackaged && process.platform === 'darwin' && process.arch === 'arm64' && !process.env.PAPERGLIM_PROFILE_DIR,
    launch: AppUpdater.native(join(process.resourcesPath, 'PaperGlimUpdater.app', 'Contents', 'MacOS', 'PaperGlimUpdater')),
    quit: () => app.quit(),
    prepare: async (revision) => {
      if (rendererUpdateBlocked || aiRequests.running || maintaining || activeWrites) throw new Error('진행 중인 작업을 마치고 초안을 정리한 뒤 업데이트하세요.')
      maintaining = true; updateInstallLock = true
      try {
        const blocked = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => { updateLock = null; resolve(true) }, 5000)
          updateLock = {owner: window?.webContents.id ?? -1, revision, resolve: (value) => { clearTimeout(timer); updateLock = null; resolve(value) }}
        })
        if (blocked || rendererUpdateBlocked || aiRequests.running) throw new Error('Update UI is not ready')
        await Promise.all([library.flush(), annotations.flush(), translations.flush()])
        if (rendererUpdateBlocked || aiRequests.running || activeWrites) throw new Error('Work started while preparing update')
      }
      catch { maintaining = false; updateInstallLock = false; throw new Error('저장이 끝나지 않아 업데이트를 보류했어요. 저장 상태를 확인해 주세요.') }
    },
    changed: (state) => {
      window?.webContents.send('app:update-state', state)
      if (updateInstallLock && state.phase === 'error') { updateInstallLock = false; maintaining = backups.requiresRecovery }
      if (state.phase === 'available' && state.version && state.version !== notifiedVersion) {
        notifiedVersion = state.version
        if (Notification.isSupported()) {
          const notification = new Notification({title: 'Pagecove 업데이트', body: `${state.version} 버전을 사용할 수 있어. 앱에서 업데이트할 수 있어.`, silent: true})
          notification.on('click', showUpdates)
          notification.show()
        }
      }
    }
  })
  ipcMain.handle('app:update-state', () => appUpdater!.state)
  ipcMain.handle('app:update-check', () => appUpdater!.check())
  ipcMain.handle('app:update-download', () => appUpdater!.download())
  ipcMain.handle('app:update-install', async () => {
    try { await appUpdater!.install() }
    catch (error) { if (updateInstallLock) { updateInstallLock = false; maintaining = backups.requiresRecovery }; throw error }
  })
  ipcMain.handle('app:update-cancel', () => appUpdater!.cancel())
  ipcMain.on('app:update-locked', (event, revision, blocked) => { if (updateLock?.owner === event.sender.id && updateLock.revision === revision && typeof blocked === 'boolean') updateLock.resolve(blocked) })
  ipcMain.on('app:update-blocked', (event, blocked) => { if (window?.webContents.id === event.sender.id && typeof blocked === 'boolean') rendererUpdateBlocked = blocked })
  if (appUpdater.state.supported) {
    const initial = setTimeout(() => void appUpdater?.check(), 30000); initial.unref()
    const periodic = setInterval(() => void appUpdater?.check(), 6 * 60 * 60 * 1000); periodic.unref()
    app.on('will-quit', () => { clearTimeout(initial); clearInterval(periodic) })
  }
  ipcMain.handle('backup:preferences', () => backups.restoredPreferences())
  ipcMain.handle('backup:discard', () => { pendingRestore = null })
  ipcMain.handle('backup:create', async (_event, preferences, includeTranslations) => {
    if (!window || typeof includeTranslations !== 'boolean') return false
    const result = await dialog.showSaveDialog(window, { title: 'Pagecove 백업 저장', defaultPath: `Pagecove-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'Pagecove 백업', extensions: ['json'] }] })
    if (result.canceled || !result.filePath) return false
    await maintain(() => backups.export(result.filePath!, preferences, includeTranslations))
    return true
  })
  ipcMain.handle('backup:prepare', async (event, preferences) => {
    pendingRestore = null
    if (!window) return null
    const result = await dialog.showOpenDialog(window, { title: '복원할 Pagecove 백업 선택', properties: ['openFile'], filters: [{ name: 'Pagecove 백업', extensions: ['json'] }] })
    if (result.canceled || !result.filePaths.length) return null
    let plan!: Awaited<ReturnType<BackupStore['prepare']>>
    await maintain(async () => { plan = await backups.prepare(result.filePaths[0], preferences) })
    const token = randomUUID()
    pendingRestore = { token, owner: event.sender.id, plan }
    return { token, ...plan.summary }
  })
  ipcMain.handle('backup:restore', async (event, token, preferences, settings) => {
    const pending = pendingRestore
    if (!pending || pending.owner !== event.sender.id || token !== pending.token || typeof settings !== 'boolean') throw new Error('백업 파일을 다시 선택해 주세요. 기존 자료는 그대로예요.')
    await maintain(async () => { await backups.restore(pending.plan, preferences, settings); await library.load() })
    pendingRestore = null
    maintaining = true
    event.sender.once('did-finish-load', () => { maintaining = false })
    setImmediate(() => { if (!event.sender.isDestroyed()) event.sender.reload(); else maintaining = false })
  })
  const checkPaper = (id: string) => { if (!library.list().some((paper) => paper.id === id)) throw new Error('서재에 등록된 논문을 찾지 못했어요.') }
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), build: buildNumber, packaged: app.isPackaged }))
  ipcMain.handle('app:update', async () => {
    const response = await fetch('https://api.github.com/repos/iontail/Pagecove/releases?per_page=30', { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000), redirect: 'error' })
    if (!response.ok) throw new Error('업데이트를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
    return releaseUpdate(await response.json(), app.getVersion())
  })
  ipcMain.handle('app:releases', () => shell.openExternal('https://github.com/iontail/Pagecove/releases'))
  ipcMain.handle('papers:undo-remove', () => withData(() => library.undoRemove()))
  ipcMain.handle('papers:relink', async (_event, id: string) => {
    checkPaper(id)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, { title: '같은 PDF의 새 위치 지정', properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (result.canceled || !result.filePaths.length) return null
    try { return await withData(() => library.relink(id, result.filePaths[0])) }
    catch (error) {
      if ((error as { code?: string }).code !== 'UNVERIFIED_PDF') throw error
      const answer = await dialog.showMessageBox(window, { type: 'warning', message: '원래 PDF와 같은 파일인지 확인해 주세요.', detail: '이전 버전에서 등록한 PDF라 내용이 같은지 확인할 수 없어요. 다른 파일을 선택하면 저장한 설명과 읽던 위치가 잘못 연결될 수 있어요.', buttons: ['취소', '같은 PDF로 연결'], defaultId: 0, cancelId: 0 })
      return answer.response === 1 ? withData(() => library.relink(id, result.filePaths[0], true)) : null
    }
  })
  ipcMain.handle('papers:export', async (_event, id: string, text: string, kind: string) => {
    checkPaper(id)
    if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 2 * 1024 * 1024 || !['답변', '요약', '선택 영역 설명'].includes(kind)) throw new Error('내보낼 내용을 확인해 주세요.')
    if (!window) return false
    const paper = library.list().find((entry) => entry.id === id)!
    const result = await dialog.showSaveDialog(window, { title: 'Markdown으로 내보내기', defaultPath: `${paper.name.replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 100)}-${kind}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, `# ${paper.name.replace(/[\r\n]/g, ' ')}\n\n## ${kind}\n\n${text.trim()}\n`, { mode: 0o600 })
    return true
  })
  ipcMain.handle('translations:get', (_event, id: string, fingerprint: string) => { checkPaper(id); return translations.get(id, fingerprint) })
  ipcMain.handle('translations:put', (_event, id, cache) => { checkPaper(id); return withData(() => translations.put(id, cache)) })
  ipcMain.handle('notes:get', (_event, id: string) => { checkPaper(id); return annotations.get(id) })
  ipcMain.handle('notes:put', (_event, id, thread) => { checkPaper(id); return withData(() => annotations.put(id, thread)) })
  ipcMain.handle('notes:remove', (_event, id, threadId) => { checkPaper(id); return withData(() => annotations.put(id, null, threadId)) })
  ipcMain.handle('papers:list', () => library.list())
  ipcMain.handle('papers:choose', () => choosePdfs())
  ipcMain.handle('papers:example', () => withData(() => library.add([join(app.getAppPath(), 'resources', 'ResNet.pdf')])))
  ipcMain.handle('zotero:list', async () => {
    const catalog = await zotero.catalog()
    const legacy = library.unlinkedZotero()
    const paths = new Map<string, string>()
    for (const entry of catalog.papers.filter((paper) => legacy.some((old) => old.name === paper.title))) {
      try { const file = await zotero.resolvePdf(entry.key); paths.set(file.path, entry.key) }
      catch { /* Missing local PDFs can be linked again after downloading. */ }
    }
    await withData(() => library.syncZotero(catalog, paths))
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
    await withData(() => library.syncZotero(catalog, new Map(files.map((file) => [file.path, file.paper.key]))))
    const result = await withData(() => library.importZotero(files))
    return { catalog, available: result.available, unavailable: result.unavailable + missing }
  })
  ipcMain.handle('zotero:import', async (_event, key: string) => { const file = await zotero.resolvePdf(key); return withData(() => library.add([file.path], file.paper)) })
  ipcMain.handle('zotero:help', () => shell.openExternal('https://www.zotero.org/support/dev/web_api/v3/local_api'))
  ipcMain.handle('papers:drop', (_event, paths: string[]) => withData(() => library.add(paths)))
  ipcMain.handle('papers:preview', (_event, id: string) => withData(() => library.read(id, false)))
  ipcMain.handle('papers:read', async (_event, id: string) => { const data = await withData(() => library.read(id)); return { data, fingerprint: createHash('sha256').update(data).digest('hex') } })
  ipcMain.handle('papers:page', (_event, id: string, page: number) => withData(() => library.updatePage(id, page)))
  ipcMain.handle('papers:remove', (_event, id: string) => withData(() => library.remove(id)))
  ipcMain.handle('providers:usage', (_event, force) => getProviderUsage(force === true))
  ipcMain.handle('providers:list', () => getProviders())
  ipcMain.handle('ai:ask', (event, provider, prompt, model, fast, requestId?: string, image?: string, task?: 'summary') => { if (maintaining) throw new Error('자료를 복원하고 있어요. 복원이 끝나면 다시 요청해 주세요.'); return aiRequests.run(event.sender.id, requestId, (signal) => askProvider(provider, prompt, model, fast, signal, image, task)).finally(() => { if (!event.sender.isDestroyed()) event.sender.send('providers:usage-changed') }) })
  ipcMain.handle('ai:cancel', (event, requestId: string) => aiRequests.cancel(event.sender.id, requestId))
  ipcMain.handle('clipboard:write', (_event, text: string) => {
    if (typeof text !== 'string') throw new Error('복사할 텍스트를 선택해 주세요.')
    clipboard.writeText(text)
  })
  const command = (action: AppCommand) => () => { if (!updateInstallLock) window?.webContents.send('app:command', action) }
  app.setAboutPanelOptions({ applicationName: 'Pagecove', applicationVersion: app.getVersion(), version: buildNumber })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Pagecove', submenu: [{ role: 'about' }, { label: '업데이트 확인…', click: () => { showUpdates(); void appUpdater?.check() } }, { label: '설정…', accelerator: 'CmdOrCtrl+,', click: command('settings') }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '파일', submenu: [{ label: 'PDF 열기…', accelerator: 'CmdOrCtrl+O', click: async () => {
      try { window?.webContents.send('papers:opened', await choosePdfs()) }
      catch (error) { dialog.showErrorBox('PDF를 열 수 없어', String(error)) }
    } }, { role: 'close' }] },
    { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '보기', submenu: [{ label: 'PDF 확대', accelerator: 'CmdOrCtrl+=', click: command('zoomIn') }, { label: 'PDF 축소', accelerator: 'CmdOrCtrl+-', click: command('zoomOut') }, { label: 'PDF 기본 배율', accelerator: 'CmdOrCtrl+0', click: command('resetZoom') }, { type: 'separator' }, { label: '본문 검색', accelerator: 'CmdOrCtrl+F', click: command('find') }, { label: '문서 목차', click: command('outline') }, { label: 'AI 패널 열기·닫기', click: command('toggleAssistant') }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(!app.isPackaged ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }] : [])] },
    { label: '이동', submenu: [{ label: '이전 읽기 위치', accelerator: 'CmdOrCtrl+[', click: command('back') }, { label: '다음 읽기 위치', accelerator: 'CmdOrCtrl+]', click: command('forward') }] },
    { label: '윈도우', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
    { label: '도움말', submenu: [{ label: '사용 가이드', click: command('guide') }, { type: 'separator' }, { label: '릴리스·다운로드', click: () => void shell.openExternal('https://github.com/iontail/Pagecove/releases') }] }
  ]))
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
