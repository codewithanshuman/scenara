import { ArrowUpRight, Compass, GitBranch, Layers3, LayoutGrid, Network, PanelLeftClose, PanelLeftOpen, ShieldCheck, Waves } from 'lucide-react'
import type { SceneSummary } from '../api/client'
import type { WorkbenchMode } from '../hooks/useSceneWorkspace'
import { IconButton } from '../components/ui'
import { BrandMark } from './BrandMark'
import { SkyArt } from './SkyArt'

export function SceneRail({ scenes, selectedId, collapsed, overview, reviewMode, mode, onCollapse, onSelect, onNavigate, onReview, onIngest }: {
  scenes: SceneSummary[]; selectedId: string; collapsed: boolean; overview: boolean; reviewMode: boolean; mode: WorkbenchMode
  onCollapse(): void; onSelect(sceneId: string): void; onNavigate(mode: WorkbenchMode | 'overview'): void; onReview(): void; onIngest(): void
}) {
  const nav = [
    { label: 'Overview', icon: LayoutGrid, value: 'overview' as const },
    { label: 'Scene canvas', icon: Compass, value: 'canvas' as const },
    { label: 'Connections', icon: Network, value: 'graph' as const },
    { label: 'Timeline', icon: Waves, value: 'timeline' as const },
    { label: 'Source history', icon: GitBranch, value: 'trace' as const },
  ]
  const reviews = scenes.reduce((sum, scene) => sum + scene.reviewCount, 0)
  return <aside className={'scene-rail ' + (collapsed ? 'collapsed' : '')}>
    <button className="brand-home" onClick={() => onNavigate('overview')} aria-label="Scenara home"><BrandMark compact={collapsed}/></button>
    <div className="rail-space-label">YOUR WORKSPACE</div>
    <nav className="rail-nav" aria-label="Workspace">
      {nav.map(item => {
        const active = !reviewMode && (overview ? item.value === 'overview' : item.value === mode)
        return <button key={item.value} className={active ? 'active' : ''} title={item.label} onClick={() => onNavigate(item.value)}><item.icon size={19}/><span>{item.label}</span>{active && <i/>}</button>
      })}
      <button className={reviewMode ? 'active' : ''} onClick={onReview} title="Review findings"><ShieldCheck size={19}/><span>Review queue</span>{reviews > 0 && <em>{reviews}</em>}{reviewMode && <i/>}</button>
    </nav>
    <section className="rail-scenes">
      <div className="rail-section-head"><span>YOUR SCENES</span><Layers3 size={14}/></div>
      <div className="rail-scene-list">{scenes.map((scene, index) => <button title={scene.title} key={scene.id} className={!overview && scene.id === selectedId ? 'selected' : ''} onClick={() => onSelect(scene.id)}><span className="rail-scene-number">{String(index + 1).padStart(2, '0')}</span><span><b>{scene.title}</b><small>{scene.assetCount} media · {scene.observationCount} findings</small></span></button>)}</div>
    </section>
    <div className="rail-spacer"/>
    <button className="rail-art-card" onClick={onIngest}><SkyArt kind="clouds"/><span>A fresh perspective.<ArrowUpRight size={18}/></span></button>
    <div className="rail-footer"><span className="workspace-monogram">S</span><span><b>Scenara workspace</b><small>Visual intelligence</small></span><IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onCollapse}>{collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</IconButton></div>
  </aside>
}
