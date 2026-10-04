import { ArrowLeft, GitBranch, MapPin, Network, PanelRightOpen, ScanLine, SlidersHorizontal, Sparkles, SplitSquareVertical, Waves } from 'lucide-react'
import type { LensId } from '../../shared/domain'
import type { SceneWorkspace } from '../api/client'
import { Badge, Button, IconButton, Segmented } from '../components/ui'
import type { WorkbenchMode } from '../hooks/useSceneWorkspace'

export function WorkbenchToolbar({ scene, lensId, mode, compare, inspectorVisible, onHome, onInspector, onLens, onMode, onCompare, onScenario }: {
  scene: SceneWorkspace; lensId: LensId; mode: WorkbenchMode; compare: boolean; inspectorVisible: boolean
  onHome(): void; onInspector(): void; onLens(value: LensId): void; onMode(value: WorkbenchMode): void; onCompare(): void; onScenario(): void
}) {
  return <div className="workbench-toolbar">
    <div className="scene-heading"><div className="scene-identity"><button className="back-link" onClick={onHome}><ArrowLeft size={14}/>All scenes</button><div className="scene-title-row"><h1>{scene.title}</h1><Badge tone="blue">{scene.reviewCount ? scene.reviewCount + ' to review' : 'Up to date'}</Badge></div><span className="scene-location"><MapPin size={13}/>{scene.locationLabel}</span></div><Button variant="primary" onClick={onScenario}><Sparkles size={16}/>Explore a scenario</Button></div>
    <div className="workbench-controls"><Segmented value={mode} onChange={onMode} label="Scene view" options={[
      {value:'canvas',label:'Canvas',icon:<ScanLine size={16}/>}, {value:'graph',label:'Graph',icon:<Network size={16}/>}, {value:'timeline',label:'Timeline',icon:<Waves size={16}/>}, {value:'trace',label:'History',icon:<GitBranch size={16}/>},
    ]}/><div className="toolbar-buttons"><label className="lens-select"><SlidersHorizontal size={15}/><select aria-label="Analysis lens" value={lensId} onChange={event => onLens(event.target.value as LensId)}><option value="general">All findings</option><option value="safety">Safety</option><option value="accessibility">Accessibility</option><option value="environment">Environment</option></select></label>{mode === 'canvas' && <Button variant={compare ? 'accent' : 'secondary'} onClick={onCompare}><SplitSquareVertical size={15}/>{compare ? 'Close compare' : 'Compare'}</Button>}{!inspectorVisible && <IconButton label="Show evidence inspector" onClick={onInspector}><PanelRightOpen size={18}/></IconButton>}</div></div>
  </div>
}
