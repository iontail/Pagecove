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
  useEffect(() => () => { void window.paperglim.discardRestore() }, [])
  async function run(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await task() }
    catch (cause) { setError((cause instanceof Error ? cause.message : '백업 작업에 실패했어.').replace(/^Error invoking remote method '[^']+': Error: /, '')) }
    finally { setBusy(false) }
  }
  return <section className="backup-controls" aria-label="백업·복원">
    <h3 className="settings-subtitle">백업·복원</h3>
    <p className="settings-note">목록에 있는 논문과 읽던 위치, 저장 설명, 화면·AI 선택 설정을 백업해. PDF 원본, AI 인증 정보와 임시 대화는 포함하지 않아. 백업에는 기존 PDF의 파일 경로가 들어 있어.</p>
    <label className="backup-option"><input type="checkbox" checked={translations} disabled={busy} onChange={(event) => setTranslations(event.target.checked)} />저장된 번역 캐시도 백업에 포함</label>
    <div className="flex gap-2 flex-wrap"><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { if (await window.paperglim.createBackup(preferences(), translations)) setNotice('백업 파일을 저장했어.') })}>백업 저장</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { setPreview(null); setSettings(false); const next = await window.paperglim.prepareRestore(preferences()); setPreview(next) })}>복원할 백업 선택</Button></div>
    {preview && <div className="restore-preview" aria-label="복원 미리보기">
      <strong>복원 미리보기</strong><p>백업 날짜 {new Date(preview.createdAt).toLocaleDateString('ko-KR')} · 논문 {preview.documents}개</p>
      <p>추가될 논문 {preview.addedDocuments}개 · 설명 {preview.explanations}개 · 번역 {preview.translationPages}페이지{preview.conflicts ? ` · 충돌로 건너뛰는 항목 ${preview.conflicts}개` : ''}</p>
      <p>기존 논문 위치·읽기 기록과 겹치는 설명·번역은 현재 자료를 우선해. 다른 Mac의 PDF는 파일 위치를 다시 지정해야 할 수 있어.</p>
      <label className="backup-option"><input type="checkbox" checked={settings} disabled={busy || !preview.settings} onChange={(event) => setSettings(event.target.checked)} />백업의 화면·AI 선택 설정도 복원</label>
      <p>실행 중인 AI 작업은 먼저 마쳐 줘. 복원하면 화면을 다시 불러오며 임시 대화와 초안은 닫혀.</p>
      <div className="flex gap-2 flex-wrap"><Button size="sm" disabled={busy} onClick={() => void run(async () => { await window.paperglim.applyRestore(preview.token, preferences(), settings); setNotice('자료를 복원했어. 화면을 다시 불러오고 있어.') })}>확인한 자료 병합 복원</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setPreview(null); void window.paperglim.discardRestore() }}>취소</Button></div>
    </div>}
    {busy && <p className="settings-note" role="status">백업 자료를 확인하고 있어…</p>}
    {notice && <p className="settings-note" role="status">{notice}</p>}
    {error && <p className="backup-error" role="alert">{error}</p>}
  </section>
}
