import assert from 'node:assert/strict'
import {generateKeyPairSync,sign,randomUUID,createHash} from 'node:crypto'
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {createServer} from 'node:http'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {buildUpdater,sparkleSDK,xml} from './build-updater.mjs'
const run=promisify(execFile),root=await mkdtemp(join(tmpdir(),'paperglim-update-')),bundleID=`io.github.iontail.paperglim.updatetest.${randomUUID().toLowerCase()}`
console.log('Isolated native update fixture:',root)
const sdk=await sparkleSDK(),key=generateKeyPairSync('ed25519'),publicKey=Buffer.from(key.publicKey.export({format:'jwk'}).x,'base64url').toString('base64'),seed=Buffer.from(key.privateKey.export({format:'jwk'}).d,'base64url').toString('base64')
const secret=join(root,'key');await writeFile(secret,seed,{mode:0o600})
let feed='',archive=Buffer.alloc(0),requests=[]
const server=createServer((req,res)=>{requests.push(req.url);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',req.url==='/appcast.xml'?'application/rss+xml':'application/zip');res.end(req.url==='/appcast.xml'?feed:archive)})
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`
const profile=join(root,'profile');await mkdir(profile);await writeFile(join(profile,'saved-data.json'),'local paper, annotation and preferences remain');const saved=createHash('sha256').update(await readFile(join(profile,'saved-data.json'))).digest('hex')
const helper=await buildUpdater({output:join(root,'helper.app'),bundleID,test:true})
const hostSource=`#import <Cocoa/Cocoa.h>\nint main(){@autoreleasepool{[NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];NSBundle*b=NSBundle.mainBundle;NSString*p=[b objectForInfoDictionaryKey:@"TestProfile"];[[NSProcessInfo.processInfo.environment objectForKey:@"PAPERGLIM_PROFILE_DIR"] ?: @"missing" writeToFile:[p stringByAppendingPathComponent:@"launched-env"] atomically:YES encoding:NSUTF8StringEncoding error:nil];[[b objectForInfoDictionaryKey:@"CFBundleShortVersionString"] writeToFile:[p stringByAppendingPathComponent:@"launched-version"] atomically:YES encoding:NSUTF8StringEncoding error:nil];[NSApp run];}return 0;}`
await writeFile(join(root,'host.m'),hostSource)
const hosts=[]
for(const version of ['0.0.1','0.0.2']){
 const host=join(root,version,'PaperGlim Update Test.app');hosts.push(host);await mkdir(join(host,'Contents','MacOS'),{recursive:true});await mkdir(join(host,'Contents','Resources'),{recursive:true})
 await run('/usr/bin/ditto',[helper,join(host,'Contents','Resources','PaperGlimUpdater.app')])
 const info={CFBundleIdentifier:bundleID,CFBundleName:'PaperGlim Update Test',CFBundleExecutable:'Fixture',CFBundlePackageType:'APPL',CFBundleVersion:version,CFBundleShortVersionString:version,LSMinimumSystemVersion:'13.0',SUFeedURL:`${origin}/appcast.xml`,SUPublicEDKey:publicKey,TestProfile:profile}
 const flags=['SUEnableAutomaticChecks','SUAutomaticallyUpdate','SUEnableSystemProfiling']
 const plist=`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>${Object.entries(info).map(([k,v])=>`<key>${k}</key><string>${xml(v)}</string>`).join('')}${flags.map(k=>`<key>${k}</key><false/>`).join('')}<key>SURequireSignedFeed</key><true/><key>SUVerifyUpdateBeforeExtraction</key><true/></dict></plist>`
 await writeFile(join(host,'Contents','Info.plist'),plist)
 await run('/usr/bin/xcrun',['clang','-fobjc-arc','-mmacosx-version-min=13.0','-framework','Cocoa',join(root,'host.m'),'-o',join(host,'Contents','MacOS','Fixture')]);await run('/usr/bin/codesign',['--force','--deep','--sign','-',host])
}
const zip=join(root,'update.zip');await run('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',hosts[1],zip]);archive=await readFile(zip);const validArchive=archive
const signature=sign(null,archive,key.privateKey).toString('base64')
const appcast=`<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>Native update test</title><item><title>0.0.2</title><sparkle:version>0.0.2</sparkle:version><sparkle:shortVersionString>0.0.2</sparkle:shortVersionString><sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion><enclosure url="${origin}/update.zip" length="${archive.length}" type="application/octet-stream" sparkle:edSignature="${signature}"/></item></channel></rss>`
const feedFile=join(root,'appcast.xml');await writeFile(feedFile,appcast);await run(join(sdk,'bin','sign_update'),['--ed-key-file',secret,feedFile]);const validFeed=await readFile(feedFile,'utf8');feed=validFeed
async function waitFor(test,message,timeout=30000){const limit=Date.now()+timeout;while(Date.now()<limit){if(await test())return;await new Promise(done=>setTimeout(done,100))}throw Error(message)}
let old,helperProcess
const preserveProfile=false
const events=[],logs=[]
function start(probe=false){events.length=0;logs.length=0;helperProcess=spawn(join(hosts[0],'Contents','Resources','PaperGlimUpdater.app','Contents','MacOS','PaperGlimUpdater'),probe?['--probe']:[],{stdio:['pipe','pipe','pipe'],env:{...process.env,...preserveProfile?{PAPERGLIM_PROFILE_DIR:profile}:{}}});let buffer='';helperProcess.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const event=JSON.parse(line);events.push(event);console.log('Native',event.phase,event.code??'');if(event.phase==='installing'&&preserveProfile)old?.kill('SIGTERM')}catch{}}});helperProcess.stderr.on('data',chunk=>logs.push(String(chunk)));helperProcess.on('error',error=>events.push({phase:'error',message:error.message}));return helperProcess}
try{
 old=spawn(join(hosts[0],'Contents','MacOS','Fixture'),[],{stdio:'ignore',env:{...process.env,...preserveProfile?{PAPERGLIM_PROFILE_DIR:profile}:{}}});await waitFor(async()=>await readFile(join(profile,'launched-version'),'utf8').catch(()=>null)==='0.0.1','Old fixture did not launch')
 start(true);await waitFor(()=>events.some(e=>e.phase==='available'||e.phase==='error'),'Probe did not finish');assert.ok(events.some(e=>e.phase==='available'),logs.join(''));await new Promise(done=>helperProcess.exitCode!==null?done():helperProcess.on('close',done));assert.ok(!requests.includes('/update.zip'),'Probe must not download executable code')
 feed=validFeed.replace('Native update test','tampered feed');start(true);await waitFor(()=>events.some(e=>e.phase==='error'),'Modified signed feed accepted');await new Promise(done=>helperProcess.exitCode!==null?done():helperProcess.on('close',done));feed=validFeed
 archive=Buffer.from(validArchive);archive[Math.floor(archive.length/2)]^=1;start();await waitFor(()=>events.some(e=>e.phase==='error'),'Modified archive was accepted');assert.ok(!events.some(e=>e.phase==='ready'));await new Promise(done=>helperProcess.exitCode!==null?done():helperProcess.on('close',done));archive=validArchive
 start();await waitFor(()=>events.some(e=>e.phase==='ready'||e.phase==='error'),'No cancellable ready event',60000);assert.ok(events.some(e=>e.phase==='ready'));helperProcess.stdin.write('cancel\n');await new Promise(done=>helperProcess.exitCode!==null?done():helperProcess.on('close',done));assert.ok(events.some(e=>e.phase==='cancelled'));assert.equal(old.exitCode,null);const stopped=old;stopped.kill('SIGTERM');await new Promise(done=>stopped.exitCode!==null?done():stopped.on('close',done));await new Promise(done=>setTimeout(done,600));const {stdout:versionAfterCancel}=await run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleVersion',join(hosts[0],'Contents','Info.plist')]);assert.equal(versionAfterCancel.trim(),'0.0.1','Cancelled update must not install when the app quits');await writeFile(join(profile,'launched-version'),'restarting');old=spawn(join(hosts[0],'Contents','MacOS','Fixture'),[],{stdio:'ignore'});await waitFor(async()=>await readFile(join(profile,'launched-version'),'utf8')==='0.0.1','Old fixture did not reopen after cancellation')
 start();await waitFor(()=>events.some(e=>e.phase==='ready'||e.phase==='error'),'No ready event',60000);assert.ok(events.some(e=>e.phase==='ready'),logs.join(''));await new Promise(done=>setTimeout(done,600));assert.equal(await readFile(join(profile,'launched-version'),'utf8'),'0.0.1');assert.equal(old.exitCode,null,'Do not restart before user approval')
 helperProcess.stdin.write('install\n');await waitFor(async()=>await readFile(join(profile,'launched-version'),'utf8').catch(()=>null)==='0.0.2','Updated application was not relaunched',60000)
 assert.equal(createHash('sha256').update(await readFile(join(profile,'saved-data.json'))).digest('hex'),saved)
 assert.equal(await readFile(join(profile,'launched-env'),'utf8'),preserveProfile?profile:'missing');console.log('Relaunch environment continuity passed')
 console.log('Passed native signed-feed probe, modified feed/archive rejection, cancel then quit without installing, user-gated install, relaunch and unchanged external profile.')
 await mkdir('artifacts/updater-v21',{recursive:true});await writeFile('artifacts/updater-v21/native-result.json',JSON.stringify({passed:true,root,bundleID,events},null,2))
}finally{
 helperProcess?.stdin.end();helperProcess?.kill();old?.kill();await run('/usr/bin/pkill',['-f',join(hosts[0],'Contents','MacOS','Fixture')]).catch(()=>{});await run('/usr/bin/defaults',['delete',bundleID]).catch(()=>{});await new Promise(done=>server.close(done))
}
