import { Activity, AlertCircle, Check, ChevronRight, CircleDot, Cloud, Database, Eye, GitBranch, LoaderCircle, UploadCloud } from 'lucide-react'
import type { PipelineJob } from '../../shared/domain'
import type { HealthStatus } from '../api/client'
import { Badge, Dialog, DialogHeader, Progress } from '../components/ui'
import { formatRelative, titleCase } from '../utils/format'
import './panels.css'

const stages = [{ title: 'Capture', icon: UploadCloud }, { title: 'Analyze', icon: Eye }, { title: 'Connect', icon: GitBranch }, { title: 'Index', icon: Database }]

export function PipelinePanel({ open, health, jobs, onClose }: { open: boolean; health?: HealthStatus; jobs: PipelineJob[]; onClose(): void }) {
  if (!open) return null
  const active = jobs.filter(job => job.status === 'queued' || job.status === 'running')
  const completed = jobs.filter(job => job.status === 'succeeded')
  const failed = jobs.filter(job => job.status === 'failed')
  return <Dialog label="Processing activity" onClose={onClose} className="pipeline-dialog">
    <DialogHeader eyebrow="ACTIVITY" title="Behind the scene." description="Follow your media from capture to connected evidence." onClose={onClose}/>
    <div className="pipeline-overview"><div><span className="pipeline-stat-icon"><Activity size={19}/></span><span><small>In progress</small><b>{active.length}</b></span></div><div><span className="pipeline-stat-icon"><Check size={19}/></span><span><small>Completed</small><b>{completed.length}</b></span></div><div><span className="pipeline-stat-icon"><AlertCircle size={19}/></span><span><small>Needs attention</small><b>{failed.length}</b></span></div></div>
    <div className="pipeline-stages">{stages.map((stage, index) => <div className="stage-wrap" key={stage.title}><div className="stage-card"><span>{String(index + 1).padStart(2, '0')}</span><stage.icon size={23}/><b>{stage.title}</b></div>{index < stages.length - 1 && <ChevronRight size={17} className="stage-arrow"/>}</div>)}</div>
    <section className="pipeline-runtime"><header><span>Recent operations</span><Badge tone="blue">{active.length ? 'Processing' : 'Up to date'}</Badge></header><div className="job-list">{jobs.slice(0, 12).map(job => <div key={job.id} className={`job-row status-${job.status}`}><span className="job-state">{job.status === 'running' ? <LoaderCircle size={18} className="spin"/> : job.status === 'succeeded' ? <Check size={18}/> : job.status === 'failed' ? <AlertCircle size={18}/> : <CircleDot size={18}/>}</span><span className="job-copy"><b>{titleCase(job.kind)}</b><small>{job.error?.message ?? titleCase(job.stage)}</small></span><div className="job-progress"><Progress value={job.progress} label={`${titleCase(job.kind)} progress`}/><small>{job.status === 'succeeded' ? 'Complete' : job.status === 'failed' ? 'Failed' : `${job.progress}%`}</small></div><time>{formatRelative(job.updatedAt)}</time></div>)}{!jobs.length && <div className="empty-jobs"><Activity size={24}/><b>No operations yet</b><p>Upload media or run an analysis to get started.</p></div>}</div></section>
    <footer className="pipeline-footer"><span><Cloud size={16}/>{health?.mode === 'cloudinary' ? 'Cloudinary connected' : health?.mode === 'local-adapter' ? 'Local workspace' : 'Connection unavailable'}</span><span>{jobs.length} operations</span></footer>
  </Dialog>
}
