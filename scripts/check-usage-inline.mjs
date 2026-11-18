import assert from 'node:assert/strict'
import {_electron} from 'playwright'
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
const output=resolve('artifacts/usage-inline-v19');await mkdir(output,{recursive:true})
const env={...process.env,PAPERGLIM_PROFILE_DIR:await mkdtemp(join(tmpdir(),'paperglim-inline-usage-')),PAPERGLIM_BACKGROUND:''};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
const bundle=process.argv.find(arg=>arg.endsWith('.app'))
const app=await _electron.launch({...bundle?{executablePath:resolve(bundle,'Contents/MacOS/Pagecove')}:{args:[resolve('.')]},env})
const page=await app.firstWindow();page.setDefaultTimeout(15000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
async function capture(name){await page.waitForTimeout(150);const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],[width,height]=w.getContentSize();return(await w.capturePage()).resize({width,height}).toPNG()});await writeFile(join(output,name+'.png'),Buffer.from(png))}
async function assertLine(){const boxes=await page.locator('.usage-row,.usage-refresh').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,height:r.height}}));const section=await page.locator('.provider-usage').boundingBox();assert.equal(boxes.length,3);assert.ok(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))<=2);assert.ok(boxes.every(b=>b.x>=section.x-1&&b.right<=section.x+section.width+1),JSON.stringify({boxes,section}));assert.ok(await page.locator('.provider-usage').evaluate(el=>el.scrollWidth<=el.clientWidth));assert.equal(await page.locator('.usage-heading').count(),0);assert.ok(section.height<=27);assert.ok(await page.locator('.provider-usage').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight))}
try{
 await app.evaluate(({ipcMain})=>{globalThis.inlineUsageCount=0;ipcMain.removeHandler('providers:usage');ipcMain.handle('providers:usage',()=>{globalThis.inlineUsageCount++;return globalThis.inlineUsageValues??['codex','claude'].map(provider=>({provider,status:'ready',windows:[{remainingPercent:100,durationMins:300,resetsAt:Date.now()+3600000}],checkedAt:Date.now(),source:provider==='codex'?'live':'local',message:''}))})})
 await page.evaluate(()=>{localStorage.setItem('paperglim:panels',JSON.stringify({library:208,assistant:420}));localStorage.setItem('paperglim:guide-seen:v1','true')});await page.reload()
 await page.getByRole('group',{name:'Codex 남은 사용량: 5시간 · 100%',exact:true}).waitFor()
 assert.deepEqual(await page.locator('.usage-row strong').allTextContents(),['5시간 100%','5시간 100%'])
 const providerBefore=await page.evaluate(()=>localStorage.getItem('paperglim:provider'))
 await assertLine();await capture('desktop-light')
 await page.locator('.usage-row').first().focus();await page.getByRole('tooltip').filter({hasText:'Codex'}).waitFor();await capture('details-focus');await page.keyboard.press('Escape')
 const checks=await app.evaluate(()=>globalThis.inlineUsageCount);await page.getByRole('button',{name:'AI 사용량 새로고침'}).click();await page.waitForTimeout(100);assert.ok(await app.evaluate(()=>globalThis.inlineUsageCount)>checks)
 await page.getByRole('switch',{name:'다크 모드',exact:true}).click();await assertLine();await capture('desktop-dark')
 await page.evaluate(()=>{localStorage.setItem('paperglim:app-scale','1.5')});await page.reload();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,680))
 await page.locator('.usage-row strong').filter({hasText:'100%'}).first().waitFor()
 for(const palette of ['neutral','cream'])for(const theme of ['light','dark']){
  await page.getByRole('button',{name:'연결 설정 열기'}).click();await page.getByRole('radio',{name:palette==='neutral'?'차콜·오프화이트':'크림·네이비',exact:true}).check();await page.getByRole('radio',{name:theme==='light'?'라이트':'다크',exact:true}).check();await page.keyboard.press('Escape');await assertLine();await capture(`minimum-${palette}-${theme}`)
 }
 await app.evaluate(()=>{globalThis.inlineUsageValues=[{provider:'codex',status:'unavailable',windows:[],checkedAt:null,source:'live',message:'인터넷 연결을 확인해 줘.'},{provider:'claude',status:'not-installed',windows:[],checkedAt:null,source:'local',message:'Claude Code CLI를 설치하고 로그인해 줘.'}]});await page.getByRole('button',{name:'AI 사용량 새로고침'}).click();await page.getByRole('group',{name:'Codex 남은 사용량: 확인 불가',exact:true}).waitFor();assert.deepEqual(await page.locator('.usage-row strong').allTextContents(),['—','—']);await assertLine();await capture('unavailable')
 await page.locator('.usage-row').last().hover();await page.getByRole('tooltip').filter({hasText:'Claude Code CLI를 설치'}).waitFor();await capture('unavailable-details')
 assert.equal(await page.evaluate(()=>localStorage.getItem('paperglim:provider')),providerBefore);assert.deepEqual(errors,[])
 console.log('Passed: one compact line, both icons, truthful unavailable state, hover/focus details, refresh, 208px rail, 1040x680 at150%, both palettes/light-dark; no provider change.')
}finally{await app.close()}
