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
        headers: { 'Zotero-API-Version': '3', 'Zotero-Allowed-Request': 'true', 'User-Agent': 'Pagecove', ...(matchServer && this.serverId ? { 'Zotero-Server-ID': this.serverId } : {}) },
        signal: AbortSignal.timeout(6000), redirect: 'error'
      })
    } catch { throw new Error('Zotero에 연결하지 못했어요. Zotero를 실행하고 고급 설정에서 다른 앱과의 통신을 허용했는지 확인해 주세요.') }
    if (response.status === 403) throw new Error('Zotero와 통신할 권한이 없어요. Zotero의 ‘설정 → 고급’에서 다른 앱과의 통신을 허용해 주세요.')
    if (response.status === 412) { this.papers.clear(); throw new Error('Zotero 라이브러리가 바뀌었어요. 목록을 새로고침한 뒤 다시 선택해 주세요.') }
    if (response.status === 404) throw Object.assign(new Error('Zotero 항목이나 이 Mac에 저장된 PDF를 찾지 못했어요. Zotero에서 PDF를 내려받은 뒤 다시 시도해 주세요.'), { code: 'ZOTERO_MISSING' })
    if (!response.ok) throw new Error(`Zotero에서 응답 오류가 발생했어요 (${response.status}). Zotero 버전과 연결 설정을 확인해 주세요.`)
    return response
  }

  async catalog(): Promise<ZoteroCatalog> {
    this.papers.clear()
    const response = await this.request('users/0/items?format=json&limit=100&start=0')
    this.serverId = response.headers.get('Zotero-Server-ID') ?? ''
    const items: Item[] = []
    let batch = await response.json()
    for (let start = 0; ; start += 100) {
      if (!Array.isArray(batch) || !batch.every((item) => typeof item.key === 'string' && item.data && typeof item.data === 'object')) throw new Error('Zotero 항목을 읽을 수 없어요.')
      items.push(...batch)
      if (batch.length < 100) break
      if (start >= 99900) throw new Error('한 번에 가져올 수 있는 Zotero 항목 수를 초과했어요.')
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
    if (!Array.isArray(collections) || !collections.every((entry) => typeof entry.key === 'string' && typeof entry.data?.name === 'string')) throw new Error('Zotero 컬렉션을 읽을 수 없어요.')
    return { papers: [...this.papers.values()], collections: collections.map((entry) => ({ key: entry.key, name: entry.data.name, parentKey: typeof entry.data.parentCollection === 'string' ? entry.data.parentCollection : null })) }
  }

  async resolvePdf(key: string) {
    const paper = this.papers.get(key)
    if (!paper || !/^[A-Z0-9]{8}$/.test(key)) throw new Error('목록을 새로고침한 뒤 PDF를 선택해 주세요.')
    const response = await this.request(`users/0/items/${key}/file/view/url`, true)
    let url: URL
    try { url = new URL((await response.text()).trim()) }
    catch { throw Object.assign(new Error('이 Mac에 PDF가 없어요. Zotero에서 PDF를 내려받은 뒤 다시 동기화해 주세요.'), { code: 'ZOTERO_MISSING' }) }
    if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) throw Object.assign(new Error('Zotero가 로컬 PDF 경로를 반환하지 않았어.'), { code: 'ZOTERO_MISSING' })
    return { path: fileURLToPath(url), paper }
  }
}
