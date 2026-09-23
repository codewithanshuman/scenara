import { Bell, ChevronRight, Cloud, Command, GitBranch, HelpCircle, Plus, Search, Settings2 } from 'lucide-react'
import type { HealthStatus, SceneWorkspace } from '../api/client'
import { Badge, Button, IconButton, Key } from '../components/ui'
import { BrandMark } from './BrandMark'

export function AppHeader({ scene, health, onCommand, onIngest, onPipeline }: {
  scene?: SceneWorkspace
  health?: HealthStatus
  onCommand(): void
  onIngest(): void
  onPipeline(): void
}) {
  return <header className="app-header">
    <div className="app-header-brand"><BrandMark/></div>
    <div className="app-header-crumbs"><span>Field lab</span><ChevronRight size={12}/><b>{scene?.title ?? 'Loading scene…'}</b>{scene && <Badge tone={scene.status === 'review' ? 'amber' : 'green'}>{scene.status === 'review' ? `${scene.reviewCount} awaiting review` : scene.status}</Badge>}</div>
    <button className="global-command" onClick={onCommand}><Search size={14}/><span>Ask evidence, find media, jump to entity…</span><Key>⌘ K</Key></button>
    <div className="app-header-actions">
      <div className={`connection-state ${health?.mode === 'cloudinary' ? 'live' : 'local'}`} title={health?.mode === 'cloudinary' ? 'Live Cloudinary connection' : 'Local adapter mode'}><Cloud size={14}/><span>{health?.mode === 'cloudinary' ? 'Cloudinary live' : 'Local adapter'}</span></div>
      <Button variant="ghost" size="sm" onClick={onPipeline}><GitBranch size={14}/>Pipeline</Button>
      <Button variant="primary" size="sm" onClick={onIngest}><Plus size={14}/>Ingest media</Button>
      <IconButton label="Notifications"><Bell size={15}/><i className="notification-dot"/></IconButton>
      <IconButton label="Help"><HelpCircle size={15}/></IconButton>
      <IconButton label="Settings"><Settings2 size={15}/></IconButton>
    </div>
  </header>
}
