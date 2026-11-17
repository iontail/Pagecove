import { useContext, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ReadingActions } from '@/lib/reading-actions'
import { requestFailure } from '../../../shared/failures'

export default function RecoveryNotice({ error, onRetry, disabled, scope = 'ai', onHelp }: { error: string; onRetry?: () => void; disabled?: boolean; scope?: 'ai' | 'zotero'; onHelp?: () => void }) {
  const actions = useContext(ReadingActions)
  const notice = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error && notice.current?.closest('.composer-area')) notice.current.scrollIntoView({ block: 'nearest' }) }, [error])
  if (!error) return null
  const failure = requestFailure(error, scope)
  const settings = ['install', 'auth', 'model', 'limit', 'fast'].includes(failure.kind)
  return <div ref={notice} className="recovery-notice" role="alert"><p>{failure.message}</p><div>
    {settings && actions && <Button variant="outline" size="sm" disabled={disabled} onClick={actions.openAISettings}>{failure.kind === 'model' || failure.kind === 'fast' ? '모델·연결 설정' : '연결 설정'}</Button>}
    {failure.kind === 'zotero' && onHelp && <Button variant="outline" size="sm" onClick={onHelp}>연결 방법 보기</Button>}
    {onRetry && <Button variant="ghost" size="sm" disabled={disabled} onClick={onRetry}>{failure.kind === 'zotero' ? '다시 동기화' : '다시 시도'}</Button>}
  </div></div>
}
