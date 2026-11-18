import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,access,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {pathToFileURL} from 'node:url'
const run=promisify(execFile)
export const sparkleVersion='2.10.1'
export const sparkleHash='1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27'
export const feedURL='https://github.com/iontail/Pagecove/releases/latest/download/appcast.xml'
export const xml=value=>String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]))
export async function sparkleSDK(){
 const cache=resolve('.cache/sparkle');await mkdir(cache,{recursive:true});const archive=join(cache,`Sparkle-${sparkleVersion}.tar.xz`)
 let data;try{data=await readFile(archive)}catch{}
 if(!data||createHash('sha256').update(data).digest('hex')!==sparkleHash){
  const response=await fetch(`https://github.com/sparkle-project/Sparkle/releases/download/${sparkleVersion}/Sparkle-${sparkleVersion}.tar.xz`,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Sparkle download failed')
  data=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(data).digest('hex')!==sparkleHash)throw Error('Sparkle checksum mismatch');await writeFile(archive,data)
 }
 const sdk=join(cache,'sdk');try{await access(join(sdk,'Sparkle.framework','Headers','Sparkle.h'))}catch{await mkdir(sdk,{recursive:true});await run('/usr/bin/tar',['-xf',archive,'-C',sdk])}
 return sdk
}
export async function buildUpdater({output=resolve('.cache/PaperGlimUpdater.app'),bundleID='io.github.iontail.paperglim',test=false}={}){
 const sdk=await sparkleSDK();await rm(output,{recursive:true,force:true});await mkdir(join(output,'Contents','MacOS'),{recursive:true});await mkdir(join(output,'Contents','Frameworks'),{recursive:true})
 await run('/usr/bin/ditto',[join(sdk,'Sparkle.framework'),join(output,'Contents','Frameworks','Sparkle.framework')])
 const plist=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${xml(bundleID)}.updater</string><key>CFBundleExecutable</key><string>PaperGlimUpdater</string><key>CFBundleName</key><string>PaperGlim Updater</string><key>CFBundleVersion</key><string>1</string><key>LSUIElement</key><true/><key>LSMinimumSystemVersion</key><string>13.0</string>${test?'<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>':''}</dict></plist>`
 await writeFile(join(output,'Contents','Info.plist'),plist)
 await run('/usr/bin/xcrun',['clang','-fobjc-arc','-mmacosx-version-min=13.0','-arch','arm64','-F',sdk,'-framework','Cocoa','-framework','Sparkle','-Wl,-rpath,@executable_path/../Frameworks',`-DHOST_BUNDLE_ID=@"${bundleID}"`,'native/updater/main.m','-o',join(output,'Contents','MacOS','PaperGlimUpdater')])
 await mkdir(join(output,'Contents','Resources'),{recursive:true});await writeFile(join(output,'Contents','Resources','Sparkle-LICENSE.txt'),await readFile(join(sdk,'LICENSE')))
 await run('/usr/bin/codesign',['--force','--deep','--sign','-',output]);return output
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){await buildUpdater();console.log(`Built arm64 Sparkle ${sparkleVersion} updater`)}
