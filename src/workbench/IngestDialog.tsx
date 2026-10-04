import { useRef, useState } from 'react'
import { AudioLines, Check, CheckCircle2, Cloud, FileAudio, FileImage, FileVideo, Film, FolderUp, Image, LoaderCircle, Fingerprint, UploadCloud, X } from 'lucide-react'
import type { AssetKind } from '../../shared/domain'
import { api, type SceneWorkspace } from '../api/client'
import { Badge, Button, Dialog, DialogHeader, Progress } from '../components/ui'
import { formatBytes, titleCase } from '../utils/format'
import './panels.css'

interface PendingFile { id:string; file:File; kind:AssetKind; status:'ready'|'signing'|'uploading'|'registered'|'failed'; progress:number; error?:string }

function fileKind(file:File):AssetKind { if(file.type.startsWith('image/'))return'image';if(file.type.startsWith('video/'))return'video';if(file.type.startsWith('audio/'))return'audio';return'document' }
function icon(kind:AssetKind){return kind==='image'?FileImage:kind==='video'?FileVideo:kind==='audio'?FileAudio:FolderUp}
async function digest(file:File):Promise<string>{const buffer=await file.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',buffer);return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('')}

export function IngestDialog({open,scene,onClose,onComplete}:{open:boolean;scene?:SceneWorkspace;onClose():void;onComplete():void}){
  const [files,setFiles]=useState<PendingFile[]>([])
  const [dragging,setDragging]=useState(false)
  const [running,setRunning]=useState(false)
  const input=useRef<HTMLInputElement>(null)
  if(!open||!scene)return null
  const activeScene=scene
  function add(list:FileList|null){if(!list||running)return;setFiles(current=>[...current,...[...list].filter(file=>!current.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified)).map(file=>({id:crypto.randomUUID(),file,kind:fileKind(file),status:'ready' as const,progress:0}))]);if(input.current)input.current.value=''}
  function patch(id:string,update:Partial<PendingFile>){setFiles(current=>current.map(item=>item.id===id?{...item,...update}:item))}
  async function ingest(){
    setRunning(true)
    for(const item of files.filter(candidate=>candidate.status==='ready'||candidate.status==='failed')){
      try{
        patch(item.id,{status:'signing',progress:8,error:undefined})
        const resourceType=item.kind==='video'||item.kind==='audio'?'video':item.kind==='image'?'image':'raw'
        const signature=await api.signature({
          sceneId:activeScene.id,
          resourceType,
          filename:item.file.name,
          eager:item.kind==='image'?['c_limit,w_1920,h_1080/q_auto/f_auto']:undefined,
        })
        let cloudinary:Record<string,unknown>|undefined
        let localUrl:string|undefined
        if(signature.mode==='cloudinary'&&signature.endpoint){
          patch(item.id,{status:'uploading',progress:28})
          const form=new FormData()
          form.set('file',item.file)
          form.set('api_key',signature.apiKey!)
          form.set('timestamp',String(signature.timestamp))
          form.set('signature',signature.signature!)
          form.set('folder',signature.folder)
          form.set('public_id',signature.publicId)
          if(signature.eager)form.set('eager',signature.eager)
          if(signature.context)form.set('context',signature.context)
          const response=await fetch(signature.endpoint,{method:'POST',body:form})
          if(!response.ok)throw new Error('Upload failed. Please try this file again.')
          const uploaded=await response.json()
          cloudinary={
            assetId:uploaded.asset_id,
            publicId:uploaded.public_id,
            version:uploaded.version,
            resourceType:uploaded.resource_type,
            deliveryType:uploaded.type,
            secureUrl:uploaded.secure_url,
            format:uploaded.format,
            bytes:uploaded.bytes,
            etag:uploaded.etag,
          }
          patch(item.id,{progress:78})
        }else{
          localUrl=URL.createObjectURL(item.file)
          patch(item.id,{status:'uploading',progress:62})
        }
        const sha256=await digest(item.file)
        await api.request('/assets',{
          method:'POST',
          body:{
            sceneId:activeScene.id,
            kind:item.kind,
            sourceFilename:item.file.name,
            mimeType:item.file.type||'application/octet-stream',
            sha256,
            byteLength:item.file.size,
            capturedAt:new Date(item.file.lastModified||Date.now()).toISOString(),
            dimensions:{},
            tags:['field-ingest'],
            ...(cloudinary?{cloudinary}:{localUrl}),
          },
        })
        patch(item.id,{status:'registered',progress:100})
      }catch(error){
        patch(item.id,{status:'failed',error:error instanceof Error?error.message:String(error)})
      }
    }
    setRunning(false)
    onComplete()
  }
  const complete=files.length>0&&files.every(item=>item.status==='registered')
  return (
    <Dialog label="Upload media" onClose={onClose} className="ingest-dialog">
      <DialogHeader
        eyebrow="ADD EVIDENCE"
        title="Bring your scene into focus."
        description={`Upload captures to ${scene.title}.`}
        onClose={onClose}
      />
      <div
        className={`ingest-drop ${dragging?'dragging':''}`}
        role="button"
        tabIndex={running?-1:0}
        aria-label="Choose media files to upload"
        aria-disabled={running}
        onKeyDown={event=>{if(!running&&(event.key==='Enter'||event.key===' ')){event.preventDefault();input.current?.click()}}}
        onDragEnter={event=>{event.preventDefault();setDragging(true)}}
        onDragOver={event=>event.preventDefault()}
        onDragLeave={()=>setDragging(false)}
        onDrop={event=>{event.preventDefault();setDragging(false);add(event.dataTransfer.files)}}
        onClick={()=>{if(!running)input.current?.click()}}
      >
        <input ref={input} type="file" multiple hidden disabled={running} accept="image/*,video/*,audio/*" onChange={event=>add(event.target.files)}/>
        <span className="drop-orbit"><UploadCloud size={24}/><i/><i/></span>
        <b>Drop your files here</b>
        <p>or choose files from your device</p>
        <div>
          <Badge><Image size={10}/>JPG · PNG · HEIC</Badge>
          <Badge><Film size={10}/>MP4 · MOV</Badge>
          <Badge><AudioLines size={10}/>WAV · M4A</Badge>
        </div>
      </div>
      {files.length>0&&(
        <div className="pending-files">
          <header>
            <span>Your files</span>
            <small>{files.length} files · {formatBytes(files.reduce((sum,item)=>sum+item.file.size,0))}</small>
          </header>
          {files.map(item=>{
            const Icon=icon(item.kind)
            return (
              <div className={`pending-file status-${item.status}`} key={item.id}>
                <span><Icon size={16}/></span>
                <span><b>{item.file.name}</b><small>{titleCase(item.kind)} · {formatBytes(item.file.size)}</small></span>
                <div aria-live="polite">
                  <Progress value={item.progress} tone={item.status==='failed'?'red':item.status==='registered'?'green':'blue'}/>
                  <small>{item.error??(item.status==='registered'?'Uploaded':item.status==='signing'?'Preparing':titleCase(item.status))}</small>
                </div>
                {item.status==='registered'?(
                  <CheckCircle2 size={15}/>
                ):item.status==='uploading'||item.status==='signing'?(
                  <LoaderCircle size={15} className="spin"/>
                ):(
                  <button type="button" disabled={running} aria-label={`Remove ${item.file.name}`} onClick={event=>{event.stopPropagation();setFiles(current=>current.filter(file=>file.id!==item.id))}}>
                    <X size={14}/>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <footer className="ingest-footer">
        <span><Fingerprint size={16}/>Originals preserved</span>
        <div>
          <Button variant="ghost" onClick={onClose}>{running?'Close':'Cancel'}</Button>
          {complete?(
            <Button variant="primary" onClick={onClose}><Check size={14}/>Done</Button>
          ):(
            <Button variant="primary" disabled={!files.length} loading={running} onClick={ingest}>
              <Cloud size={15}/>Upload {files.filter(item=>item.status!=='registered').length||''} {files.filter(item=>item.status!=='registered').length===1?'file':'files'}
            </Button>
          )}
        </div>
      </footer>
    </Dialog>
  )
}
