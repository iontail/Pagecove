import { useUpdateBlocker } from '@/lib/update-safety'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { backupPreferences } from '../../../shared/backup'
import type { RestoreSummary } from '../../../shared/backup'

const preferences = () => backupPreferences(Object.fromEntries(Object.entries(localStorage)))
export default function BackupControls() {
  const [translations, setTranslations] = useState(false)
  const [settings, setSettings] = useState(false)
  const [preview, setPreview] = useState<RestoreSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  useUpdateBlocker(busy, '백업이나 복원이 끝나면 업데이트할 수 있어요.')
  useEffect(() => () => { void window.paperglim.discardRestore() }, [])
  async function run(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await task() }
    catch (cause) { setError((cause instanceof Error ? cause.message : '백업 작업을 완료하지 못했어요.').replace(/^Error invoking remote method '[^']+': Error: /, '')) }
    finally { setBusy(false) }
  }
  return <section className="backup-controls" aria-label="백업·복원">
    <h3 className="settings-subtitle">백업·복원</h3>
    <p className="settings-note">논문 목록, 읽던 위치, 저장한 설명, 화면·AI 설정을 백업해요. PDF는 파일 위치만 기록해요. AI 로그인 정보와 임시 대화는 백업에 포함되지 않아요.</p>
    <label className="backup-option"><input type="checkbox" checked={translations} disabled={busy} onChange={(event) => setTranslations(event.target.checked)} />저장한 번역도 백업에 포함</label>
    <div className="flex gap-2 flex-wrap"><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { if (await window.paperglim.createBackup(preferences(), translations)) setNotice('백업 파일을 저장했어요.') })}>백업 저장</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { setPreview(null); setSettings(false); const next = await window.paperglim.prepareRestore(preferences()); setPreview(next) })}>복원할 백업 선택</Button></div>
    {preview && <div className="restore-preview" aria-label="복원 미리보기">
      <strong>복원 미리보기</strong><p>백업 날짜 {new Date(preview.createdAt).toLocaleDateString('ko-KR')} · 논문 {preview.documents}개</p>
      <p>추가될 논문 {preview.addedDocuments}개 · 설명 {preview.explanations}개 · 번역 {preview.translationPages}페이지{preview.conflicts ? ` · 충돌로 건너뛰는 항목 ${preview.conflicts}개` : ''}</p>
      <p>현재 앱에 있는 파일 위치와 읽기 기록을 우선해요. 설명과 번역이 겹치면 기존 내용을 사용해요. 다른 Mac에서 백업했다면 PDF 위치를 다시 지정해야 할 수 있어요.</p>
      <label className="backup-option"><input type="checkbox" checked={settings} disabled={busy || !preview.settings} onChange={(event) => setSettings(event.target.checked)} />백업의 화면·AI 선택 설정도 복원</label>
      <p>진행 중인 AI 작업을 먼저 마쳐 주세요. 복원하면 화면이 다시 열리고 임시 대화와 초안은 사라져요.</p>
      <div className="flex gap-2 flex-wrap"><Button size="sm" disabled={busy} onClick={() => void run(async () => { await window.paperglim.applyRestore(preview.token, preferences(), settings); setNotice('자료를 복원했어요. 화면을 다시 불러오는 중이에요.') })}>백업 자료 추가</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setPreview(null); void window.paperglim.discardRestore() }}>취소</Button></div>
    </div>}
    {busy && <p className="settings-note" role="status">백업 확인 중…</p>}
    {notice && <p className="settings-note" role="status">{notice}</p>}
    {error && <p className="backup-error" role="alert">{error}</p>}
  </section>
}
