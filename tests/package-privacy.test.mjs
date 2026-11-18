import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createPackage} from '@electron/asar'
import configureUpdater from '../scripts/configure-updater.cjs'
test('packaging rejects accidental private profile data and unapproved resources before configuring updates',async()=>{
 const root=await mkdtemp(join(tmpdir(),'paperglim-package-private-'))
 try{
  const source=join(root,'source'),resources=join(root,'PaperGlim.app','Contents','Resources');await mkdir(resources,{recursive:true});await mkdir(join(source,'resources'),{recursive:true})
  const context={appOutDir:root,electronPlatformName:'darwin',packager:{appInfo:{productFilename:'PaperGlim'}}}
  await writeFile(join(source,'resources','private-paper.pdf'),'%PDF harmless privacy canary');await createPackage(source,join(resources,'app.asar'));await assert.rejects(()=>configureUpdater(context),/unapproved/)
  await rm(join(source,'resources','private-paper.pdf'));await mkdir(join(source,'out','annotations'),{recursive:true});await writeFile(join(source,'out','annotations','canary.json'),'{}');await createPackage(source,join(resources,'app.asar'));await assert.rejects(()=>configureUpdater(context),/private/)
 }finally{await rm(root,{recursive:true,force:true})}
})
