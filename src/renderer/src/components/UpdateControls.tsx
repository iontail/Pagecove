import {useState} from 'react'
import {Download,RefreshCw,RotateCw,Loader2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {useAppUpdate} from '@/lib/use-app-update'
import {useUpdateBlockReason} from '@/lib/update-safety'

export default function UpdateControls(){
 const state=useAppUpdate(),blocked=useUpdateBlockReason()
 const [error,setError]=useState('')
 const busy=['checking','downloading','verifying','preparing','installing'].includes(state.phase)
 async function run(task:()=>Promise<unknown>){setError('');try{await task()}catch(cause){setError((cause instanceof Error?cause.message:'업데이트를 완료하지 못했어요.').replace(/^Error invoking remote method '[^']+': Error: /,''))}}
 const status=state.phase==='available'?`${state.version} 버전을 설치할 수 있어요.`:state.phase==='downloading'?state.percent===undefined?'업데이트 다운로드 중…':`업데이트 다운로드 · ${state.percent}%`:state.phase==='verifying'?'업데이트 파일을 확인하고 있어요.':state.phase==='ready'?`${state.version} 업데이트를 설치할 준비가 됐어요.`:state.phase==='preparing'?'자료 저장 중…':state.phase==='installing'?'업데이트 설치 중…':state.phase==='current'?'새 업데이트가 없어요.':state.phase==='checking'?'새 버전 확인 중…':state.phase==='error'?state.message:!state.supported?'설치한 Apple Silicon용 앱에서 업데이트할 수 있어요.':'새 버전이 나오면 알려 드려요.'
 return <section className="update-controls" aria-label="앱 업데이트"><h3 className="settings-subtitle">앱 업데이트</h3><p className="settings-note" role="status">{status}</p>
  {state.phase==='downloading'&&<progress className="update-progress" max={100} value={state.percent} aria-label="업데이트 다운로드 진행률" />}
  <div className="update-actions">
   {state.phase==='available'?<Button size="sm" onClick={()=>void run(()=>window.paperglim.downloadUpdate())}><Download />업데이트 다운로드</Button>:state.phase==='ready'?<Button size="sm" disabled={!!blocked} onClick={()=>void run(()=>window.paperglim.installUpdate())}><RotateCw />재시작해서 업데이트</Button>:<Button variant="outline" size="sm" disabled={busy||!state.supported} onClick={()=>void run(()=>window.paperglim.checkAppUpdate())}>{state.phase==='checking'?<Loader2 className="animate-spin" />:<RefreshCw />}업데이트 확인</Button>}
   {['checking','downloading','ready'].includes(state.phase)&&<Button variant="ghost" size="sm" onClick={()=>void run(()=>window.paperglim.cancelUpdate())}>취소</Button>}
   <Button variant="ghost" size="sm" disabled={['preparing','installing'].includes(state.phase)} onClick={()=>void run(()=>window.paperglim.openReleases())}>릴리스 보기</Button>
  </div>
  {state.phase==='ready'&&blocked&&<p className="settings-note update-blocked">{blocked}</p>}
  {error&&<p className="text-destructive text-xs" role="alert">{error}</p>}
  <p className="settings-note">앱이 실행 중일 때 새 버전을 확인해요. 다운로드는 버튼을 눌렀을 때 시작돼요. 앱이 다시 열려도 논문, 번역, 설명, 설정은 남아요. 임시 대화는 종료돼요.</p>
 </section>
}
