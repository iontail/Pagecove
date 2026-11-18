import assert from 'node:assert/strict'
import {_electron} from 'playwright'
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
const directory=resolve('artifacts/updater-v21/screens');await mkdir(directory,{recursive:true})
const env={...process.env,PAPERGLIM_PROFILE_DIR:await mkdtemp(join(tmpdir(),'paperglim-updater-ui-')),PAPERGLIM_BACKGROUND:''};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
const bundle=process.argv.find(arg=>arg.endsWith('.app'))
const app=await _electron.launch({...bundle?{executablePath:resolve(bundle,'Contents/MacOS/Pagecove')}:{args:[resolve('.')]},env})
let page;const errors=[]
async function state(patch){await app.evaluate(({BrowserWindow},patch)=>{globalThis.updateFixture={...globalThis.updateFixture,...patch,revision:globalThis.updateFixture.revision+1};BrowserWindow.getAllWindows()[0].webContents.send('app:update-state',globalThis.updateFixture)},patch);await page.waitForTimeout(100)}
async function capture(name){await page.waitForTimeout(200);const bytes=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],[width,height]=w.getContentSize();return(await w.capturePage()).resize({width,height}).toPNG()});await writeFile(join(directory,name+'.png'),Buffer.from(bytes))}
async function settings(){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('app:command','updates'));await page.getByRole('heading',{name:'앱 업데이트',exact:true}).waitFor()}
try{
 page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 await app.evaluate(({ipcMain})=>{
  globalThis.updateFixture={phase:'idle',supported:true,revision:0};globalThis.updateBlocked=true;globalThis.updateLocked=[];globalThis.updateCalls=[]
  ipcMain.removeHandler('providers:list');ipcMain.handle('providers:list',()=>[]);ipcMain.removeHandler('providers:usage');ipcMain.handle('providers:usage',()=>[])
  ipcMain.removeAllListeners('app:update-blocked');ipcMain.on('app:update-blocked',(_e,blocked)=>{globalThis.updateBlocked=blocked})
  ipcMain.removeAllListeners('app:update-locked');ipcMain.on('app:update-locked',(_e,revision,blocked)=>{globalThis.updateLocked.push({revision,blocked})})
  for(const [channel,result] of [['app:update-state',()=>globalThis.updateFixture],['app:update-check',()=>{globalThis.updateCalls.push('check');return globalThis.updateFixture}],['app:update-download',()=>{globalThis.updateCalls.push('download');return globalThis.updateFixture}],['app:update-install',()=>{globalThis.updateCalls.push('install')}],['app:update-cancel',()=>{globalThis.updateCalls.push('cancel')}]]){ipcMain.removeHandler(channel);ipcMain.handle(channel,result)}
 })
 await page.evaluate(()=>localStorage.setItem('paperglim:guide-seen:v1','true'));await page.reload();await page.locator('.shelf-upload').waitFor()
 assert.equal(await page.locator('.update-notice').count(),0);await state({phase:'available',version:'0.1.22'});await page.locator('.update-notice').waitFor();await capture('home-available');await settings()
 await page.getByRole('button',{name:'업데이트 다운로드',exact:true}).click();assert.deepEqual(await app.evaluate(()=>globalThis.updateCalls),['download'])
 await state({phase:'downloading',percent:37});assert.equal(await page.getByRole('progressbar').getAttribute('value'),'37');await capture('downloading')
 await state({percent:undefined});assert.equal(await page.getByRole('progressbar').getAttribute('value'),null)
 await state({phase:'verifying'});assert.equal(await page.getByRole('progressbar').count(),0)
 await state({phase:'ready'});await page.getByRole('button',{name:'재시작해서 업데이트',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'재시작해서 업데이트',exact:true}).isEnabled(),true);await capture('ready-neutral-light')
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'ResNet 예제 열기'}).click();await page.locator('[data-reading-page="1"] canvas').waitFor();await page.getByRole('textbox',{name:'논문에 대한 질문'}).fill('저장하지 않은 질문 초안');await settings()
 await page.waitForFunction(()=>document.querySelector('.update-controls button')?.disabled);assert.equal(await app.evaluate(()=>globalThis.updateBlocked),true);await capture('draft-blocked')
 await page.keyboard.press('Escape');await page.getByRole('textbox',{name:'논문에 대한 질문'}).fill('');await settings();await page.getByRole('button',{name:'재시작해서 업데이트',exact:true}).click();assert.ok((await app.evaluate(()=>globalThis.updateCalls)).includes('install'))
 await state({phase:'preparing'});await page.locator('#update-install-status').waitFor();assert.equal(await page.evaluate(()=>document.querySelector('#root').inert),true);await page.waitForFunction(()=>true);const lock=await app.evaluate(()=>globalThis.updateLocked.at(-1));assert.equal(lock.blocked,false);await capture('preparing')
 await state({phase:'error',message:'업데이트 파일을 검증하지 못해서 설치하지 않았어. 다시 확인하거나 공식 릴리스를 확인해 줘.'});assert.equal(await page.evaluate(()=>document.querySelector('#root').inert),false);assert.equal(await page.locator('#update-install-status').count(),0);await page.getByRole('button',{name:'업데이트 확인',exact:true}).click();assert.ok((await app.evaluate(()=>globalThis.updateCalls)).includes('check'));await capture('error-retry')
 await page.keyboard.press('Escape')
 for(const [palette,theme] of [['neutral','dark'],['cream','light'],['cream','dark']]){
  await page.getByRole('button',{name:'연결 설정 열기'}).click();await page.getByRole('tab',{name:'화면·읽기'}).click();await page.getByRole('radio',{name:palette==='neutral'?'차콜·오프화이트':'크림·네이비',exact:true}).check();await page.getByRole('radio',{name:theme==='light'?'라이트':'다크',exact:true}).check();await page.keyboard.press('Escape');await state({phase:'ready'});await settings();await capture(`ready-${palette}-${theme}`);await page.keyboard.press('Escape')
 }
 await page.getByRole('button',{name:'연결 설정 열기'}).click();await page.getByRole('tab',{name:'화면·읽기'}).click();for(let i=0;i<3;i++)await page.getByRole('button',{name:'앱 화면 확대',exact:true}).click();await page.keyboard.press('Escape');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,680));await capture('minimum-150-chip');await settings();await page.getByRole('button',{name:'재시작해서 업데이트',exact:true}).scrollIntoViewIfNeeded();await capture('minimum-150-settings')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const control=await page.getByRole('button',{name:'재시작해서 업데이트',exact:true}).boundingBox();assert.ok(control.x>=0&&control.x+control.width<=1040/1.5+1)
 await state({phase:'current',version:undefined});assert.equal(await page.locator('.update-notice').count(),0)
 assert.deepEqual(errors,[]);console.log('Passed updater UI: quiet notification, manual download, genuine/unknown progress, draft guard, inert lock acknowledgement, error recovery, four themes, minimum 150% layout.')
}finally{await app.close()}
