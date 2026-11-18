import {createPrivateKey,createPublicKey,generateKeyPairSync,createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises'
import {homedir} from 'node:os'
import {dirname,join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
export const signingKeyPath=join(homedir(),'.config','PaperGlim','update-signing-key')
export function keyPair(seed){
 const bytes=Buffer.from(seed.trim(),'base64');if(bytes.length!==32||bytes.toString('base64')!==seed.trim())throw Error('Invalid Ed25519 signing seed')
 const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),bytes]),format:'der',type:'pkcs8'})
 return {privateKey,publicKey:Buffer.from(createPublicKey(privateKey).export({format:'jwk'}).x,'base64url').toString('base64')}
}
export async function releaseKey(){
 const seed=(process.env.PAPERGLIM_UPDATE_PRIVATE_KEY||await readFile(signingKeyPath,'utf8')).trim(),key=keyPair(seed)
 const pinned=(await readFile('resources/update-public-key.txt','utf8')).trim();if(key.publicKey!==pinned)throw Error('Signing key does not match the public key embedded in the app')
 return {...key,seed}
}
async function initialize(){
 let seed
 try{if(!(await lstat(signingKeyPath)).isFile())throw Error('Signing key must be a regular file');seed=await readFile(signingKeyPath,'utf8')}
 catch(error){if(error.code!=='ENOENT')throw error;await mkdir(dirname(signingKeyPath),{recursive:true,mode:0o700});const pair=generateKeyPairSync('ed25519');seed=Buffer.from(pair.privateKey.export({format:'jwk'}).d,'base64url').toString('base64');await writeFile(signingKeyPath,seed+'\n',{flag:'wx',mode:0o600})}
 const {publicKey}=keyPair(seed)
 try{const current=(await readFile('resources/update-public-key.txt','utf8')).trim();if(current!==publicKey)throw Error('Existing public key differs; refusing to replace update identity')}
 catch(error){if(error.code!=='ENOENT')throw error;await writeFile('resources/update-public-key.txt',publicKey+'\n',{flag:'wx'})}
 console.log('Release signing key stored outside the repository:',signingKeyPath)
 console.log('Public key fingerprint:',createHash('sha256').update(Buffer.from(publicKey,'base64')).digest('hex'))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await initialize()
