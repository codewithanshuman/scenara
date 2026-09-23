import { Activity, AlertCircle, ArrowRight, Check, ChevronRight, CircleDot, Cloud, Database, Eye, FileCheck2, GitBranch, Image, Layers3, LoaderCircle, Play, RefreshCcw, ScanLine, Search, ServerCog, ShieldCheck, Sparkles, UploadCloud, X, Zap } from 'lucide-react'
import type { PipelineJob } from '../../shared/domain'
import type { HealthStatus } from '../api/client'
import { Badge, Dialog, DialogHeader, IconButton, Progress } from '../components/ui'
import { formatRelative, titleCase } from '../utils/format'

const stages = [
  { id:'ingest',title:'Evidence ingest',subtitle:'Upload API · originals',icon:UploadCloud,tone:'blue' },
  { id:'analyze',title:'Visual analysis',subtitle:'Analyze API · AI Vision',icon:Eye,tone:'violet' },
  { id:'structure',title:'Graph assembly',subtitle:'Entities · relationships',icon:GitBranch,tone:'cyan' },
  { id:'index',title:'Evidence index',subtitle:'Search · metadata',icon:Database,tone:'green' },
  { id:'deliver',title:'Media delivery',subtitle:'Dynamic transformations',icon:Zap,tone:'amber' },
]

export function PipelinePanel({ open, health, jobs, onClose }: { open:boolean; health?:HealthStatus; jobs:PipelineJob[]; onClose():void }) {
  if(!open)return null
  const active=jobs.filter(job=>job.status==='queued'||job.status==='running')
  return <Dialog label="Pipeline inspector" onClose={onClose} className="pipeline-dialog">
    <DialogHeader eyebrow="LIVE PIPELINE INSPECTOR" title="Every conclusion has a media trail." description="Cloudinary is the scene engine—from preserved original to structured evidence delivery." onClose={onClose}/>
    <div className="pipeline-overview"><div><span className={`provider-state ${health?.mode==='cloudinary'?'live':'local'}`}><Cloud size={16}/></span><span><small>PROVIDER MODE</small><b>{health?.mode==='cloudinary'?'Cloudinary connected':'Local deterministic adapter'}</b></span></div><div><span><Activity size={15}/></span><span><small>ACTIVE OPERATIONS</small><b>{active.length} running · {jobs.length} recorded</b></span></div><div><span><ShieldCheck size={15}/></span><span><small>PROVENANCE</small><b>SHA-256 chain enforced</b></span></div></div>
    <div className="pipeline-stages">{stages.map((stage,index)=><div className="stage-wrap" key={stage.id}><div className={`stage-card tone-${stage.tone}`}><span>{String(index+1).padStart(2,'0')}</span><stage.icon size={21}/><b>{stage.title}</b><small>{stage.subtitle}</small><Badge tone={stage.tone as never}>{index<4?<><Check size={9}/>Ready</>:<>q_auto · f_auto</>}</Badge></div>{index<stages.length-1&&<div className="stage-arrow"><ChevronRight size={15}/><i/></div>}</div>)}</div>
    <div className="pipeline-runtime"><header><span><ServerCog size={14}/>Runtime activity</span><Badge tone={active.length?'violet':'green'}>{active.length?'Processing':'Idle · ready'}</Badge></header><div className="job-list">{jobs.slice(0,8).map(job=><div key={job.id} className={`job-row status-${job.status}`}><span className="job-state">{job.status==='running'?<LoaderCircle size={14} className="spin"/>:job.status==='succeeded'?<Check size={14}/>:job.status==='failed'?<AlertCircle size={14}/>:<CircleDot size={14}/>}</span><span><b>{titleCase(job.kind)}</b><small>{job.stage} · attempt {job.attempt}/{job.maxAttempts}</small></span><div><Progress value={job.progress} tone={job.status==='failed'?'red':job.status==='succeeded'?'green':'violet'}/><small>{job.progress}%</small></div><time>{formatRelative(job.updatedAt)}</time></div>)}{!jobs.length&&<div className="empty-jobs"><Activity size={17}/><span><b>No pipeline jobs yet</b><small>Ingest or analyze media to see live operations.</small></span></div>}</div></div>
    <div className="pipeline-request"><span className="live-pulse"/><code>GET /api/scenes/:id/graph</code><span>revision {health?.revision??'—'}</span><Badge tone="green">200 · persisted</Badge></div>
  </Dialog>
}
