import { ArrowUpRight, ChevronRight, Search, Workflow } from 'lucide-react'
import type { HealthStatus, SceneWorkspace } from '../api/client'
import { Button, Key } from '../components/ui'

export function AppHeader({ scene, health, overview, onHome, onCommand, onIngest, onPipeline }: {
  scene?: SceneWorkspace; health?: HealthStatus; overview: boolean
  onHome(): void; onCommand(): void; onIngest(): void; onPipeline(): void
}) {
  return <header className="app-header">
    <div className="app-header-crumbs"><button onClick={onHome}>Workspace</button><ChevronRight size={14}/><span>{overview ? 'Overview' : scene?.title ?? 'Scene'}</span></div>
    <div className="app-header-actions">
      <button className="global-command" onClick={onCommand} aria-label="Search scene evidence"><Search size={17}/><span>Search evidence</span><Key>Ctrl K</Key></button>
      <button className="connection-state" onClick={onPipeline} title="View processing activity"><span className="live-dot"/><span>{health?.mode === 'cloudinary' ? 'Cloud connected' : 'Local workspace'}</span><Workflow size={15}/></button>
      <Button variant="primary" onClick={onIngest}>Add media<ArrowUpRight size={16}/></Button>
    </div>
  </header>
}
