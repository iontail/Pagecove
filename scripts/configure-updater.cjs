const {readFile}=require('node:fs/promises')
const {join}=require('node:path')
const {execFile}=require('node:child_process')
const {promisify}=require('node:util')
const run=promisify(execFile)
module.exports=async({appOutDir,electronPlatformName,packager})=>{
 if(electronPlatformName!=='darwin')return
 const {listPackage}=await import('@electron/asar')
 const entries=listPackage(join(appOutDir,packager.appInfo.productFilename+'.app','Contents','Resources','app.asar'))
 const publicResources=new Set(['ResNet.pdf','icon.icns','icon.png','icon.svg','update-public-key.txt'])
 const unsafe=entries.find(path=>/^\/resources\//.test(path)&&!publicResources.has(path.slice('/resources/'.length))||/(?:^|\/)(?:auth\.json|credentials\.json|library\.json|update-signing-key|\.env(?:\..*)?|annotations|translations|artifacts|\.codex|\.claude|Local Storage)(?:\/|$)/i.test(path))
 if(unsafe)throw Error('Unexpected private or unapproved file in application package')
 const key=(await readFile('resources/update-public-key.txt','utf8')).trim()
 if(!/^[A-Za-z0-9+/]{43}=$/.test(key))throw Error('Missing or invalid update public key')
 const plist=join(appOutDir,packager.appInfo.productFilename+'.app','Contents','Info.plist')
 const values={SUFeedURL:['string','https://github.com/iontail/Pagecove/releases/latest/download/appcast.xml'],SUPublicEDKey:['string',key],SURequireSignedFeed:['bool','true'],SUVerifyUpdateBeforeExtraction:['bool','true'],SUEnableAutomaticChecks:['bool','false'],SUAutomaticallyUpdate:['bool','false'],SUEnableSystemProfiling:['bool','false']}
 for(const [name,[type,value]] of Object.entries(values))await run('/usr/libexec/PlistBuddy',['-c',`Add :${name} ${type} ${value}`,plist])
}
