import {createServer} from 'node:http'
import {readFile,realpath} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'}
export function siteServer(directory=resolve('website')){
 return createServer(async(request,response)=>{
  try{
   const path=decodeURIComponent(new URL(request.url,'http://localhost').pathname)
   const name=path==='/'?'/index.html':path
   if(!['/index.html','/style.css','/script.js'].includes(name)&&!name.startsWith('/assets/')){response.writeHead(404).end();return}
   const file=await realpath(resolve(directory,'.'+name)),root=await realpath(directory),type=types[extname(file)]
   if(!file.startsWith(root+sep)||!type){response.writeHead(404).end();return}
   const body=await readFile(file);response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(request.method==='HEAD'?undefined:body)
  }catch{response.writeHead(404).end()}
 })
}
