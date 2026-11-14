import { fileURLToPath } from 'node:url'
import type { ZoteroCatalog, ZoteroPaper } from '../shared/types'

type Item = { key: string; data: { itemType?: string; contentType?: string; title?: string; filename?: string; parentItem?: string; date?: string; collections?: string[]; creators?: { firstName?: string; lastName?: string; name?: string }[] } }

export class ZoteroClient {
  private serverId = ''
  private papers = new Map<string, ZoteroPaper>()
  constructor(privateUrl = 'http://127.0.0.1:23119/api/') { this.base = privateUrl }
  private base: string

  private async request(path: string, matchServer = false) {
    let response: Response
    try {
      response = await fetch(new URL(path, this.base), {
        headers: { 'Zotero-API-Version': '3', 'Zotero-Allowed-Request': 'true', 'User-Agent': 'PaperGlim', ...(matchServer && this.serverId ? { 'Zotero-Server-ID': this.serverId } : {}) },
        signal: AbortSignal.timeout(6000), redirect: 'error'
      })
    } catch { throw new Error('Zotero에 연결할 수 없어. Zotero를 실행하고 고급 설정의 앱 통신 허용을 확인해 줘.') }
    if (response.status === 403) throw new Error('Zotero 통신이 허용되지 않았어. 설정 → 고급에서 다른 애플리케이션과 통신 허용을 켜 줘.')
    if (response.status === 412) { this.papers.clear(); throw new Error('Zotero 라이브러리가 바뀌었어. 새로고침한 뒤 다시 선택해 줘.') }
    if (response.status === 404) throw Object.assign(new Error('항목 또는 로컬 PDF가 없어. Zotero에서 PDF를 먼저 열어 다운로드하고 다시 시도해 줘.'), { code: 'ZOTERO_MISSING' })
    if (!response.ok) throw new Error(`Zotero 요청 실패 (${response.status}). Zotero 버전과 연결 설정을 확인해 줘.`)
    return response
  }

  async catalog(): Promise<ZoteroCatalog> {
    this.papers.clear()
    const response = await this.request('users/0/items?format=json&limit=100&start=0')
    this.serverId = response.headers.get('Zotero-Server-ID') ?? ''
    const items: Item[] = []
    let batch = await response.json()
    for (let start = 0; ; start += 100) {
      if (!Array.isArray(batch) || !batch.every((item) => typeof item.key === 'string' && item.data && typeof item.data === 'object')) throw new Error('Zotero 항목 응답 형식이 올바르지 않아.')
      items.push(...batch)
      if (batch.length < 100) break
      if (start >= 99900) throw new Error('현재 버전의 라이브러리 조회 한도를 초과했어.')
      batch = await (await this.request(`users/0/items?format=json&limit=100&start=${start + 100}`, true)).json()
    }
    const parents = new Map(items.map((item) => [item.key, item.data]))
    for (const item of items) {
      if (item.data.itemType !== 'attachment' || item.data.contentType !== 'application/pdf') continue
      const parent = parents.get(item.data.parentItem ?? '')
      const paper = { key: item.key, title: parent?.title || item.data.title || item.data.filename || '제목 없는 PDF', filename: item.data.filename ?? '', authors: (parent?.creators ?? []).map((author) => author.name || [author.firstName, author.lastName].filter(Boolean).join(' ')).join(', '), year: parent?.date?.match(/\d{4}/)?.[0] ?? '', collections: parent?.collections ?? item.data.collections ?? [] }
      this.papers.set(item.key, paper)
    }
    const collections = await (await this.request('users/0/collections?format=json', true)).json()
    if (!Array.isArray(collections) || !collections.every((entry) => typeof entry.key === 'string' && typeof entry.data?.name === 'string')) throw new Error('Zotero 컬렉션 응답 형식이 올바르지 않아.')
    return { papers: [...this.papers.values()], collections: collections.map((entry) => ({ key: entry.key, name: entry.data.name, parentKey: typeof entry.data.parentCollection === 'string' ? entry.data.parentCollection : null })) }
  }

  async resolvePdf(key: string) {
    const paper = this.papers.get(key)
    if (!paper || !/^[A-Z0-9]{8}$/.test(key)) throw new Error('목록을 새로고침한 뒤 PDF를 선택해 줘.')
    const response = await this.request(`users/0/items/${key}/file/view/url`, true)
    let url: URL
    try { url = new URL((await response.text()).trim()) }
    catch { throw Object.assign(new Error('로컬 PDF가 없어. Zotero에서 먼저 다운로드한 뒤 동기화해 줘.'), { code: 'ZOTERO_MISSING' }) }
    if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) throw Object.assign(new Error('Zotero가 로컬 PDF 경로를 반환하지 않았어.'), { code: 'ZOTERO_MISSING' })
    return { path: fileURLToPath(url), paper }
  }
}
