import { Activity, Aperture, Archive, ChevronDown, Database, FolderKanban, Gauge, Image, LayoutGrid, Map, MoreHorizontal, Network, PanelLeftClose, PanelLeftOpen, Plus, Search, ShieldCheck, Sparkles } from 'lucide-react'
import type { SceneSummary } from '../api/client'
import { Badge, IconButton, Progress } from '../components/ui'
import { formatRelative } from '../utils/format'

export function SceneRail({ scenes, selectedId, collapsed, onCollapse, onSelect, onNewScene }: {
  scenes: SceneSummary[]
  selectedId: string
  collapsed: boolean
  onCollapse(): void
  onSelect(sceneId: string): void
  onNewScene(): void
}) {
  const nav = [
    { label: 'Scenes', icon: Aperture, active: true },
    { label: 'Evidence graph', icon: Network },
    { label: 'Review queue', icon: ShieldCheck, count: scenes.reduce((sum, scene) => sum + scene.reviewCount, 0) },
    { label: 'Media library', icon: LayoutGrid },
    { label: 'Intelligence', icon: Sparkles },
  ]
  return <aside className={`scene-rail ${collapsed ? 'collapsed' : ''}`}>
    <div className="rail-workspace">
      <button><span className="workspace-avatar">SF</span>{!collapsed && <><span><b>Scenara Field Lab</b><small>Production workspace</small></span><ChevronDown size={13}/></>}</button>
    </div>
    <div className="rail-create"><button onClick={onNewScene}><Plus size={15}/>{!collapsed && <span>New field scene</span>}</button></div>
    <nav className="rail-nav" aria-label="Workspace">
      {nav.map(item => <button key={item.label} className={item.active ? 'active' : ''} title={collapsed ? item.label : undefined}><item.icon size={16}/>{!collapsed && <><span>{item.label}</span>{item.count ? <em>{item.count}</em> : null}</>}</button>)}
    </nav>
    {!collapsed && <section className="rail-scenes">
      <div className="rail-section-head"><span>Live scenes</span><div><IconButton label="Search scenes"><Search size={13}/></IconButton><IconButton label="Scene options"><MoreHorizontal size={13}/></IconButton></div></div>
      <div className="rail-scene-list">
        {scenes.map(scene => <button key={scene.id} className={scene.id === selectedId ? 'selected' : ''} onClick={() => onSelect(scene.id)}>
          <span className="rail-cover">{scene.coverUrl ? <img src={scene.coverUrl} alt=""/> : <Image size={14}/>}<i className={scene.status}/></span>
          <span className="rail-scene-copy"><b>{scene.title}</b><small>{scene.locationLabel}</small><span><i>{scene.assetCount} media</i><i>{scene.observationCount} findings</i></span></span>
          <span className="rail-scene-meta">{scene.reviewCount > 0 && <Badge tone="amber">{scene.reviewCount}</Badge>}<small>{formatRelative(scene.updatedAt)}</small></span>
        </button>)}
      </div>
    </section>}
    <div className="rail-spacer"/>
    {!collapsed && <section className="rail-usage"><div><span><Database size={13}/>Media operations</span><b>34%</b></div><Progress value={34} tone="violet"/><small>8.4 GB of 25 GB · resets Oct 01</small></section>}
    <div className="rail-user"><span className="user-avatar">AB</span>{!collapsed && <span><b>Anshuman</b><small>Owner · Field analyst</small></span>}<IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onCollapse}>{collapsed ? <PanelLeftOpen size={15}/> : <PanelLeftClose size={15}/>}</IconButton></div>
  </aside>
}
