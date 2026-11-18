import {sign} from 'node:crypto'
import {readFile,writeFile,mkdtemp,rm,stat} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {releaseKey} from './update-signing.mjs'
import {sparkleSDK,xml} from './build-updater.mjs'
const run=promisify(execFile),directory=resolve(process.argv[2]||'release'),pkg=JSON.parse(await readFile('package.json','utf8')),version=pkg.version
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Stable x.y.z release version required')
if(process.env.GITHUB_REF_TYPE==='tag'&&process.env.GITHUB_REF_NAME!==`v${version}`)throw Error('Git tag and package version differ')
const key=await releaseKey(),file=`Pagecove-${version}-mac-arm64.zip`,archive=await readFile(join(directory,file))
const {stdout:bundleVersion}=await run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleVersion',join(directory,'mac-arm64',`${pkg.productName}.app`,'Contents','Info.plist')]);if(bundleVersion.trim()!==version)throw Error('Bundle and release versions differ')
const signature=sign(null,archive,key.privateKey).toString('base64')
const feed=`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>Pagecove updates</title><link>https://github.com/iontail/Pagecove/releases</link><item><title>Pagecove ${version}</title><sparkle:version>${version}</sparkle:version><sparkle:shortVersionString>${version}</sparkle:shortVersionString><pubDate>${new Date().toUTCString()}</pubDate><sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion><enclosure url="https://github.com/iontail/Pagecove/releases/download/v${version}/${xml(file)}" length="${archive.length}" type="application/octet-stream" sparkle:edSignature="${signature}"/></item></channel></rss>\n`
const target=join(directory,'appcast.xml');await writeFile(target,feed)
const temporary=await mkdtemp(join(tmpdir(),'paperglim-sign-'))
try{const secret=join(temporary,'seed');await writeFile(secret,key.seed,{mode:0o600});const sdk=await sparkleSDK();await run(join(sdk,'bin','sign_update'),['--ed-key-file',secret,target]);await run(join(sdk,'bin','sign_update'),['--verify','--ed-key-file',secret,target]);console.log(`Signed and verified ${version} update archive and feed (${(await stat(target)).size} bytes)`)}finally{await rm(temporary,{recursive:true,force:true})}
