import assert from 'node:assert/strict'
import {chromium,_electron} from 'playwright'
import {extractAll,createPackage} from '@electron/asar'
import {mkdtemp,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {createServer} from 'node:http'
import {createServer as socketServer} from 'node:net'
import {generateKeyPairSync,sign,randomUUID,createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {buildUpdater,sparkleSDK,xml} from './build-updater.mjs'
const run=promisify(execFile),root=await mkdtemp(join(tmpdir(),'paperglim-electron-update-')),profile=join(root,'profile'),source=resolve(process.argv[2]||'release/mac-arm64/Pagecove.app'),bundleID=`io.github.iontail.paperglim.electrontest.${randomUUID().toLowerCase()}`
console.log('Isolated Electron update fixture:',root)
const socket=socketServer();await new Promise(done=>socket.listen(0,'127.0.0.1',done));const debugPort=socket.address().port;await new Promise(done=>socket.close(done))
let feed='',archive=Buffer.alloc(0),downloads=0
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');if(req.url==='/appcast.xml'){res.setHeader('Content-Type','application/rss+xml');res.end(feed)}else{downloads++;res.end(archive)}})
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`
const key=generateKeyPairSync('ed25519'),pub=Buffer.from(key.publicKey.export({format:'jwk'}).x,'base64url').toString('base64'),seed=Buffer.from(key.privateKey.export({format:'jwk'}).d,'base64url').toString('base64'),secret=join(root,'key');await writeFile(secret,seed,{mode:0o600})
const helper=await buildUpdater({output:join(root,'helper.app'),bundleID,test:true}),sdk=await sparkleSDK()
const unpacked=join(root,'unpacked');extractAll(join(source,'Contents','Resources','app.asar'),unpacked)
await run('/usr/bin/ditto',[resolve('out'),join(unpacked,'out')])
const mainFile=join(unpacked,'out','main','index.js'),main=await readFile(mainFile,'utf8');assert.ok(main.includes('electron.app.setName("Pagecove");'))
await writeFile(mainFile,main.replace("process.env.PAPERGLIM_PROFILE_DIR ||", `${JSON.stringify(profile)} ||`).replace('electron.app.setName("Pagecove");',`electron.app.setName("PaperGlim Update Test");electron.app.commandLine.appendSwitch("remote-debugging-port",${JSON.stringify(String(debugPort))});`))
const hosts=[]
for(const version of ['0.0.1','0.0.2']){
 const host=join(root,version,'Pagecove.app');hosts.push(host);await mkdir(join(root,version),{recursive:true});await run('/usr/bin/ditto',[source,host]);await run('/usr/bin/ditto',[helper,join(host,'Contents','Resources','PaperGlimUpdater.app')])
 const pkg=JSON.parse(await readFile(join(unpacked,'package.json'),'utf8'));pkg.version=version;await writeFile(join(unpacked,'package.json'),JSON.stringify(pkg));await createPackage(unpacked,join(host,'Contents','Resources','app.asar'))
 const plist=join(host,'Contents','Info.plist');for(const [name,value] of Object.entries({CFBundleIdentifier:bundleID,CFBundleVersion:version,CFBundleShortVersionString:version,SUFeedURL:`${origin}/appcast.xml`,SUPublicEDKey:pub}))await run('/usr/libexec/PlistBuddy',['-c',`Set :${name} ${value}`,plist])
 await run('/usr/bin/codesign',['--force','--deep','--sign','-',host])
}
const zip=join(root,'update.zip');await run('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',hosts[1],zip]);archive=await readFile(zip)
const signature=sign(null,archive,key.privateKey).toString('base64'),feedFile=join(root,'appcast.xml');await writeFile(feedFile,`<?xml version="1.0"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>Electron fixture</title><item><title>0.0.2</title><sparkle:version>0.0.2</sparkle:version><sparkle:shortVersionString>0.0.2</sparkle:shortVersionString><sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion><enclosure url="${origin}/update.zip" length="${archive.length}" type="application/octet-stream" sparkle:edSignature="${signature}"/></item></channel></rss>`);await run(join(sdk,'bin','sign_update'),['--ed-key-file',secret,feedFile]);feed=await readFile(feedFile,'utf8')
await mkdir(profile);const pdf=join(root,'paper.pdf');await copyFile('resources/ResNet.pdf',pdf);const fingerprint=createHash('sha256').update(await readFile(pdf)).digest('hex')
await writeFile(join(profile,'library.json'),JSON.stringify([{id:'preserved-paper',name:'ResNet fixture',path:pdf,page:4,addedAt:'2026-11-18T00:00:00Z',lastOpenedAt:'',fingerprint}]))
await mkdir(join(profile,'annotations'));await mkdir(join(profile,'translations'))
await writeFile(join(profile,'annotations','preserved-paper.json'),JSON.stringify([{id:'saved-explanation',page:1,text:'Selected text',ranges:[{itemIndex:0,start:0,end:8}],rects:[{x:.1,y:.2,width:.3,height:.02}],messages:[{role:'assistant',text:'Saved explanation [p. 1]'}],updatedAt:'2026-11-18T00:00:00Z'}]))
await writeFile(join(profile,'translations','preserved-paper.json'),JSON.stringify({version:1,fingerprint,entries:[{page:1,included:[],results:[],selected:true}],visible:[]}))
const files=['library.json','annotations/preserved-paper.json','translations/preserved-paper.json'],before=await Promise.all(files.map(file=>readFile(join(profile,file),'utf8')))
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;delete env.PAPERGLIM_PROFILE_DIR;delete env.PAPERGLIM_BACKGROUND
let app,browser
try{
 app=await _electron.launch({executablePath:join(hosts[0],'Contents','MacOS','Pagecove'),env});let page=await app.firstWindow();page.setDefaultTimeout(20000)
 await page.evaluate(()=>{localStorage.setItem('paperglim:guide-seen:v1','true');localStorage.setItem('paperglim:theme','dark');localStorage.setItem('paperglim:palette','cream');localStorage.setItem('paperglim:view','home')});await page.reload();await page.locator('.shelf-upload').waitFor()
 assert.equal((await page.evaluate(()=>window.paperglim.getAppInfo())).version,'0.0.1');assert.equal((await page.evaluate(()=>window.paperglim.getUpdateState())).supported,true)
 await page.evaluate(()=>window.paperglim.checkAppUpdate());assert.equal(downloads,0);await page.locator('.update-notice').click();await page.getByRole('button',{name:'업데이트 다운로드',exact:true}).click()
 await page.getByRole('button',{name:'재시작해서 업데이트',exact:true}).waitFor({timeout:60000});assert.ok(downloads>0);assert.equal((await page.evaluate(()=>window.paperglim.getAppInfo())).version,'0.0.1')
 assert.deepEqual(await Promise.all(files.map(file=>readFile(join(profile,file),'utf8'))),before)
 await page.getByRole('button',{name:'재시작해서 업데이트',exact:true}).click();await app.waitForEvent('close',{timeout:30000});app=null
 const limit=Date.now()+60000;while(!browser&&Date.now()<limit){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)}catch{await new Promise(done=>setTimeout(done,300))}}
 assert.ok(browser,'Updated Electron application did not relaunch');page=browser.contexts()[0].pages()[0];await page.locator('.shelf-upload').waitFor();assert.equal((await page.evaluate(()=>window.paperglim.getAppInfo())).version,'0.0.2')
 assert.deepEqual(await Promise.all(files.map(file=>readFile(join(profile,file),'utf8'))),before);assert.equal(await page.evaluate(()=>localStorage.getItem('paperglim:palette')),'cream');assert.equal(await page.evaluate(()=>localStorage.getItem('paperglim:theme')),'dark')
 console.log('Passed actual Electron signed update 0.0.1 → 0.0.2: manual download, renderer lock, save flush, graceful quit, in-place replacement, relaunch, identical library/annotations/translations and theme preferences.')
 await mkdir('artifacts/updater-v21',{recursive:true});await writeFile('artifacts/updater-v21/electron-result.json',JSON.stringify({passed:true,root,bundleID},null,2))
}finally{
 if(browser){await browser.contexts()[0].pages()[0]?.evaluate(()=>window.close()).catch(()=>{});await browser.close()}
 if(app)await app.close();await run('/usr/bin/pkill',['-f',join(hosts[0],'Contents','MacOS','Pagecove')]).catch(()=>{});await run('/usr/bin/defaults',['delete',bundleID]).catch(()=>{});await new Promise(done=>server.close(done))
}
