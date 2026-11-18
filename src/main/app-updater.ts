import {spawn} from 'node:child_process'
import type {ChildProcess} from 'node:child_process'
import type {AppUpdateState} from '../shared/types'

export function updaterMessage(code: number) {
  if ([1,2,3,4,5,6,7,5000].includes(code)) return '업데이트 설정을 확인하지 못했어요. 공식 릴리스에서 앱을 다시 설치해 주세요.'
  if ([1003,1005].includes(code)) return '앱을 ‘응용 프로그램’ 폴더로 옮긴 뒤 다시 시도해 주세요.'
  if ([3001,3002,4005,4009].includes(code)) return '업데이트 파일의 검증에 실패했어요. 다시 확인하거나 공식 릴리스에서 새 버전을 받아 주세요.'
  if ([4000,4001,4007,4008,4012].includes(code)) return '앱을 교체할 권한이 없어요. 설치 위치의 권한을 확인한 뒤 다시 시도해 주세요.'
  if (code === 4004) return '업데이트 후 앱을 다시 열지 못했어요. ‘응용 프로그램’ 폴더에서 Pagecove를 열어 주세요.'
  return '업데이트 정보를 불러오지 못했어요. 인터넷 연결과 공식 릴리스 페이지를 확인해 주세요.'
}

type Options = {
  supported: boolean
  launch: (probe: boolean) => ChildProcess
  prepare: (revision: number) => Promise<void>
  quit?: () => void
  changed: (state: AppUpdateState) => void
  timeout?: number
}
export class AppUpdater {
  state: AppUpdateState
  private worker: ChildProcess | null = null
  private approved = false
  private quitRequested = false
  private probe: Promise<AppUpdateState> | null = null
  private options: Options
  constructor(options: Options) { this.options=options;this.state = {phase:'idle',supported:options.supported,revision:0} }
  private update(patch: Partial<AppUpdateState>) {
    this.state = {...this.state,...patch,revision:this.state.revision+1};this.options.changed(this.state)
  }
  check() {
    if(this.probe)return this.probe
    if(this.worker||!this.options.supported)return Promise.resolve(this.state)
    this.probe=this.start(true).finally(()=>{this.probe=null});return this.probe
  }
  download() {
    if(!this.options.supported)throw Error('설치한 macOS 앱에서 업데이트할 수 있어요.')
    if(this.worker)return this.state
    void this.start(false);return this.state
  }
  async install() {
    if(this.state.phase!=='ready'||!this.worker)throw Error('업데이트 파일이 준비되면 다시 시도해 주세요.')
    const worker=this.worker
    this.update({phase:'preparing',message:undefined})
    try{await this.options.prepare(this.state.revision)}catch(error){if((this.state as AppUpdateState).phase==='preparing')this.update({phase:'ready'});throw error}
    if((this.state as AppUpdateState).phase!=='preparing'||this.worker!==worker)throw Error('업데이트가 중단됐어요. 새 버전을 다시 확인해 주세요.')
    this.approved=true;this.update({phase:'installing',message:undefined});worker.stdin?.write('install\n')
  }
  cancel() {
    if(['preparing','installing'].includes(this.state.phase))throw Error('업데이트를 적용하고 있어요. 잠시 기다려 주세요.')
    const worker=this.worker;worker?.stdin?.write('cancel\n')
    if(!worker)return Promise.resolve()
    return new Promise<void>(resolve=>{
      const timer=setTimeout(()=>{if(this.worker===worker)worker.kill('SIGTERM')},5000);timer.unref()
      worker.once('close',()=>{clearTimeout(timer);resolve()})
    })
  }
  static native(executable: string) {
    return (probe: boolean)=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;return spawn(executable,probe?['--probe']:[],{detached:true,stdio:['pipe','pipe','pipe'],env})}
  }
  private start(probe: boolean): Promise<AppUpdateState> {
    this.approved=false;this.quitRequested=false;this.update({phase:'checking',message:undefined,percent:undefined})
    return new Promise(resolve=>{
      let worker: ChildProcess
      try{worker=this.options.launch(probe)}catch{this.update({phase:'error',message:updaterMessage(0)});resolve(this.state);return}
      this.worker=worker
      let buffer='',ended=false,terminal=false,timer:ReturnType<typeof setTimeout>
      const fail=(message: string)=>{if(ended||terminal)return;terminal=true;this.update({phase:'error',message});worker.stdin?.write('cancel\n')}
      const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>{fail('업데이트 응답 시간이 초과됐어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');worker.kill('SIGTERM')},this.options.timeout??(probe?30000:120000))}
      reset()
      worker.stderr?.resume();worker.stdin?.on('error',()=>{})
      worker.on('error',()=>{fail(updaterMessage(0));finish()})
      const finish=()=>{
        if(ended)return;ended=true;clearTimeout(timer)
        if(this.worker===worker)this.worker=null
        if(!terminal)this.update({phase:'error',message:updaterMessage(0)})
        resolve(this.state)
      }
      worker.on('close',finish)
      worker.stdout?.on('data',chunk=>{
        if(ended||terminal)return
        buffer+=chunk.toString();if(buffer.length>16384){fail(updaterMessage(0));return}
        let index: number
        while((index=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,index);buffer=buffer.slice(index+1)
          let event
          try{event=JSON.parse(line)}catch{continue}
          if(!event||typeof event!=='object')continue
          reset()
          if(['found','available'].includes(event.phase)) {
            if(typeof event.version!=='string'||!/^\d+\.\d+\.\d+$/.test(event.version)){fail(updaterMessage(0));return}
            this.update({version:event.version,...event.phase==='available'?{phase:'available' as const}:{}})
            if(probe&&event.phase==='available')terminal=true
          } else if(event.phase==='current'){terminal=true;this.update({phase:'current',version:undefined,message:undefined})}
          else if(event.phase==='error'){terminal=true;this.update({phase:'error',message:updaterMessage(typeof event.code==='number'?event.code:0)})}
          else if(event.phase==='cancelled'){terminal=true;this.update({phase:this.state.version?'available':'idle',percent:undefined,message:undefined})}
          else if(!probe&&['downloading','verifying','ready','installing'].includes(event.phase)){
            const phase=event.phase as AppUpdateState['phase'];const percent=typeof event.percent==='number'&&Number.isFinite(event.percent)&&event.percent>=0&&event.percent<=100?Math.floor(event.percent):undefined
            if(phase==='installing'&&!this.approved){fail(updaterMessage(5000));return}
            this.update({phase,percent});if(phase==='ready'||phase==='installing')clearTimeout(timer)
            if(phase==='installing'&&this.approved&&!this.quitRequested){this.quitRequested=true;this.options.quit?.()}
          }else if(event.phase==='installed'){terminal=true;this.update({phase:'installing'})}
        }
      })
    })
  }
}
