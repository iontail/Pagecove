import {siteServer} from './site-server.mjs'
const server=siteServer()
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'4174 포트를 사용 중이야. 기존 미리보기를 확인하거나 종료해 줘.':'사이트 미리보기를 열지 못했어.');process.exitCode=1})
server.listen(4174,'127.0.0.1',()=>console.log('Pagecove 웹사이트 미리보기: http://127.0.0.1:4174'))
