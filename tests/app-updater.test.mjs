import {test} from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {AppUpdater,updaterMessage} from '../src/main/app-updater.ts'
const fixture=(prepare=async()=>{},extra={})=>{
 const workers=[],states=[],commands=[];let quits=0
 const updater=new AppUpdater({supported:true,prepare,changed:state=>states.push(state),quit:()=>quits++,launch:probe=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('data',chunk=>commands.push(String(chunk)));child.kill=()=>{child.emit('close',1);return true};child.probe=probe;workers.push(child);return child
 },...extra})
 const event=(value,index=workers.length-1)=>workers[index].stdout.write(JSON.stringify(value)+'\n')
 return {updater,workers,states,commands,event,get quits(){return quits}}
}
test('checks coalesce, accept chunked valid versions and never start a download',async()=>{
 const f=fixture(),first=f.updater.check(),second=f.updater.check();assert.equal(first,second);assert.equal(f.workers.length,1);assert.equal(f.workers[0].probe,true)
 f.workers[0].stdout.write('null\n{"phase":"available","version":"0.1.');f.workers[0].stdout.write('22"}\n');f.workers[0].emit('close',0)
 assert.equal((await first).phase,'available');assert.equal(f.updater.state.version,'0.1.22');assert.deepEqual(f.commands,[])
})
test('download progress is genuine, signed preparation is explicit, and quit waits for a native acknowledgement',async()=>{
 let release,prepared=false
 const f=fixture(()=>new Promise(resolve=>{release=()=>{prepared=true;resolve()}}))
 f.updater.download();f.event({phase:'found',version:'0.1.22'});f.event({phase:'downloading',percent:42});assert.equal(f.updater.state.percent,42)
 f.event({phase:'downloading',percent:-1});assert.equal(f.updater.state.percent,undefined)
 f.event({phase:'verifying'});await assert.rejects(()=>f.updater.install(),/준비/);assert.equal(prepared,false)
 f.event({phase:'ready'});const installing=f.updater.install();assert.equal(f.updater.state.phase,'preparing');assert.equal(f.quits,0);assert.deepEqual(f.commands,[])
 release();await installing;assert.equal(prepared,true);assert.equal(f.updater.state.phase,'installing');assert.deepEqual(f.commands,['install\n']);assert.equal(f.quits,0)
 f.event({phase:'installing'});f.event({phase:'installing'});assert.equal(f.quits,1);assert.throws(()=>f.updater.cancel(),/적용/);f.event({phase:'installed'});f.workers[0].emit('close',0)
})
test('an unsafe draft or failed flush keeps the ready update and never requests installation',async()=>{
 const f=fixture(async()=>{throw Error('draft or write failure')});f.updater.download();f.event({phase:'ready'})
 await assert.rejects(()=>f.updater.install(),/draft or write failure/);assert.equal(f.updater.state.phase,'ready');assert.deepEqual(f.commands,[]);assert.equal(f.quits,0)
 let cancelled=false;const cancellation=f.updater.cancel().then(()=>{cancelled=true});assert.deepEqual(f.commands,['cancel\n']);f.event({phase:'cancelled'});await Promise.resolve();assert.equal(cancelled,false,'App quit waits for installer cancellation');f.workers[0].emit('close',0);await cancellation;assert.equal(cancelled,true)
})
test('tampered/invalid metadata and unsolicited installation fail closed without invoking quit',async()=>{
 for(const event of [{phase:'available',version:'../../bad'},{phase:'available',version:'1.2'},{phase:'installing'}]){
  const f=fixture();const probe=event.phase==='available'?f.updater.check():null;if(!probe)f.updater.download();f.event(event);assert.equal(f.updater.state.phase,'error');assert.equal(f.quits,0);assert.ok(f.commands.includes('cancel\n'));f.workers[0].emit('close',1);if(probe)await probe
 }
 assert.match(updaterMessage(3001),/검증/);assert.match(updaterMessage(4012),/권한/);assert.match(updaterMessage(1003),/응용 프로그램/)
})
test('cancellation or worker exit during preparation cannot install a stale update',async()=>{
 let release
 const f=fixture(()=>new Promise(resolve=>{release=resolve}));f.updater.download();f.event({phase:'ready'});const pending=f.updater.install();f.event({phase:'error',code:4005});f.workers[0].emit('close',1);release();await assert.rejects(()=>pending,/중단/);assert.equal(f.updater.state.phase,'error');assert.deepEqual(f.commands,[]);assert.equal(f.quits,0)
})
test('unsupported builds do not spawn helpers, and a stalled helper is stopped',async()=>{
 const unsupported=fixture(async()=>{},{supported:false});assert.equal((await unsupported.updater.check()).supported,false);assert.throws(()=>unsupported.updater.download(),/macOS/);assert.equal(unsupported.workers.length,0)
 const f=fixture(async()=>{},{timeout:20});assert.equal((await f.updater.check()).phase,'error');assert.equal(f.quits,0);assert.deepEqual(f.commands,['cancel\n'])
})
