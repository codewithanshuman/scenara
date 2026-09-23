import { Activity, CalendarRange, CheckCircle2, CircleDot, GitBranch, Image, Layers3, ListTree, MapPin, Network, ScanLine, ShieldAlert, SlidersHorizontal, Sparkles, SplitSquareVertical } from 'lucide-react'
import type { LensId } from '../../shared/domain'
import type { SceneWorkspace } from '../api/client'
import { Badge, Button, Segmented } from '../components/ui'
import { formatDateTime } from '../utils/format'
import type { WorkbenchMode } from '../hooks/useSceneWorkspace'

const lensOptions: Array<{ value: LensId; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'safety', label: 'Safety' },
  { value: 'accessibility', label: 'Access' },
  { value: 'environment', label: 'Environment' },
]

export function WorkbenchToolbar({ scene, lensId, mode, compare, onLens, onMode, onCompare, onScenario }: {
  scene: SceneWorkspace
  lensId: LensId
  mode: WorkbenchMode
  compare: boolean
  onLens(value: LensId): void
  onMode(value: WorkbenchMode): void
  onCompare(): void
  onScenario(): void
}) {
  return <div className="workbench-toolbar">
    <div className="scene-identity">
      <div className="scene-kicker"><span>SCENE {String(scene.sequence).padStart(3, '0')}</span><i/><span>{formatDateTime(scene.captureEnd).toUpperCase()}</span></div>
      <div className="scene-title-row"><h1>{scene.title}</h1><Badge tone={scene.status === 'review' ? 'amber' : 'green'}><CircleDot size={8}/>{scene.status}</Badge></div>
      <div className="scene-subtitle"><span><MapPin size={12}/>{scene.locationLabel}</span><span><CalendarRange size={12}/>{formatDateTime(scene.captureStart, { month: 'short', day: '2-digit' })} → {formatDateTime(scene.captureEnd, { month: 'short', day: '2-digit' })}</span><span><CheckCircle2 size={12}/>Originals preserved</span></div>
    </div>
    <div className="workbench-controls">
      <label className="lens-switch"><small>Analysis lens</small><Segmented value={lensId} options={lensOptions} onChange={onLens} label="Analysis lens"/></label>
      <div className="workbench-mode-switch"><small>Workspace mode</small><Segmented value={mode} onChange={onMode} label="Workspace mode" options={[
        { value: 'canvas', label: 'Canvas', icon: <ScanLine size={13}/> },
        { value: 'graph', label: 'Graph', icon: <Network size={13}/> },
        { value: 'timeline', label: 'Timeline', icon: <Activity size={13}/> },
        { value: 'trace', label: 'Trace', icon: <GitBranch size={13}/> },
      ]}/></div>
      <div className="toolbar-buttons"><Button variant={compare ? 'accent' : 'secondary'} size="sm" onClick={onCompare}><SplitSquareVertical size={14}/>{compare ? 'Exit compare' : 'Compare'}</Button><Button variant="accent" size="sm" onClick={onScenario}><Sparkles size={14}/>Scenario</Button></div>
    </div>
  </div>
}
