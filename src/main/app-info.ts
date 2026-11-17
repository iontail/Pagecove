export function releaseUpdate(releases: unknown, current: string) {
  if (!Array.isArray(releases)) throw new Error('업데이트 정보를 읽을 수 없어.')
  const parts = (tag: string) => /^v?\d+\.\d+\.\d+$/.test(tag) ? tag.replace(/^v/, '').split('.').map(Number) : null
  const compare = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  const currentVersion = parts(current)
  if (!currentVersion) throw new Error('현재 앱 버전을 확인할 수 없어.')
  const candidates = releases.filter((entry) => entry && !entry.draft && typeof entry.tag_name === 'string' && parts(entry.tag_name) && Array.isArray(entry.assets) && entry.assets.some((asset: { name?: string }) => asset.name === `PaperGlim-${entry.tag_name.replace(/^v/, '')}-mac-arm64.dmg`))
    .sort((a, b) => compare(parts(b.tag_name)!, parts(a.tag_name)!))
  const latest = candidates[0]
  if (!latest) throw new Error('공개된 설치 버전을 찾지 못했어.')
  const order = compare(parts(latest.tag_name)!, currentVersion)
  return { version: latest.tag_name.replace(/^v/, ''), available: order > 0, ahead: order < 0, url: `https://github.com/iontail/PaperGlim/releases/tag/${encodeURIComponent(latest.tag_name)}`, notes: typeof latest.body === 'string' ? latest.body.slice(0, 4000) : '' }
}
