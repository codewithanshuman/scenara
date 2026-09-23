import { useMemo, useState } from 'react'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, ChevronDown, CircleDot, Eye, Film, Filter, GitCompareArrows, Image, Layers3, MoreHorizontal, Play, Search, ShieldAlert, Sparkles, Video } from 'lucide-react'
import type { MediaAsset, Observation, SceneChange, SceneEntity } from '../../shared/domain'
import type { SceneWorkspace } from '../api/client'
import { Badge, IconButton } from '../components/ui'
import { confidence, formatClock, formatDateTime, formatShortDate, titleCase } from '../utils/format'

interface CaptureGroup {
  day: string
  label: string
  assets: MediaAsset[]
  observations: Observation[]
}

function captureGroups(scene: SceneWorkspace): CaptureGroup[] {
  const groups = new Map<string, CaptureGroup>()
  for (const asset of scene.assets.filter(item => item.origin === 'original')) {
    const day = asset.capturedAt.slice(0, 10)
    const group = groups.get(day) ?? { day, label: formatShortDate(asset.capturedAt), assets: [], observations: [] }
    group.assets.push(asset)
    groups.set(day, group)
  }
  for (const observation of scene.observations) {
    const day = observation.capturedAt.slice(0, 10)
    const group = groups.get(day)
    if (group) group.observations.push(observation)
  }
  return [...groups.values()].sort((a,b) => a.day.localeCompare(b.day))
}

function entityObservation(entity: SceneEntity, group: CaptureGroup): Observation | undefined {
  return group.observations.find(item => entity.observationIds.includes(item.id))
}

function cellState(observation: Observation | undefined): string {
  if (!observation) return 'absent'
  if (observation.requiresReview) return 'review'
  if (observation.severity === 'critical' || observation.severity === 'high') return 'critical'
  if (observation.condition?.includes('stable') || observation.condition === 'clear') return 'stable'
  return 'observed'
}

export function TimelineView({ scene, selectedObservationId, onSelectObservation }: { scene: SceneWorkspace; selectedObservationId?: string; onSelectObservation(id: string): void }) {
  const groups = useMemo(() => captureGroups(scene), [scene])
  const [entityFilter, setEntityFilter] = useState('')
  const [changesOnly, setChangesOnly] = useState(false)
  const changedEntities = new Set(scene.changes.map(item => item.entityId).filter(Boolean))
  const entities = scene.entities.filter(item => (!changesOnly || changedEntities.has(item.id)) && (!entityFilter || `${item.displayName} ${item.aliases.join(' ')}`.toLowerCase().includes(entityFilter.toLowerCase())))

  return <section className="timeline-workspace">
    <header className="timeline-toolbar"><div><CalendarDays size={15}/><span><b>Temporal evidence matrix</b><small>Track each entity across capture events</small></span></div><label><Search size={13}/><input value={entityFilter} onChange={event => setEntityFilter(event.target.value)} placeholder="Filter entities…"/></label><button className={changesOnly ? 'active' : ''} onClick={() => setChangesOnly(!changesOnly)}><GitCompareArrows size={13}/>Changes only</button><IconButton label="Timeline filters"><Filter size={14}/></IconButton></header>
    <div className="temporal-matrix" style={{ '--capture-columns': groups.length } as React.CSSProperties}>
      <div className="matrix-header entity-col"><span>Tracked entity</span><small>{entities.length} entities</small></div>
      {groups.map((group,index) => <div className="matrix-header" key={group.day}><span>{group.label}</span><small>{group.assets.length} media · {group.observations.length} findings</small>{index === groups.length-1 && <Badge tone="green">Current</Badge>}</div>)}
      {entities.map(entity => <div className="matrix-row" key={entity.id}>
        <div className="entity-col matrix-entity"><span className="entity-symbol"><Layers3 size={14}/></span><span><b>{entity.displayName}</b><small>{entity.canonicalLabel.replaceAll('_',' ')}</small></span><em>{entity.observationIds.length}</em></div>
        {groups.map(group => {
          const observation = entityObservation(entity,group), state = cellState(observation)
          return <button disabled={!observation} key={group.day} className={`matrix-cell state-${state} ${observation?.id === selectedObservationId ? 'selected' : ''}`} onClick={() => observation && onSelectObservation(observation.id)}>
            {observation ? <><span className="matrix-state"><i/>{titleCase(state)}</span><b>{observation.condition ?? observation.label}</b><small>{confidence(observation.confidence)} confidence</small><span className="cell-evidence"><Image size={10}/>{observation.evidence.length} source{observation.evidence.length === 1 ? '' : 's'}</span></> : <><span className="empty-dash">—</span><small>No observation</small></>}
          </button>
        })}
      </div>)}
    </div>
    <div className="change-ledger">
      <header><div><Activity size={14}/><span><b>Change ledger</b><small>Materialized comparisons across linked observations</small></span></div><Badge tone="amber">{scene.changes.length} detected</Badge></header>
      <div className="change-list">{scene.changes.map(change => <button key={change.id} onClick={() => change.afterObservationId && onSelectObservation(change.afterObservationId)}>
        <span className={`change-icon ${change.kind}`}>{change.kind === 'appeared' ? <ArrowUpRight size={15}/> : change.kind === 'disappeared' ? <ArrowDownRight size={15}/> : <GitCompareArrows size={15}/>}</span>
        <span><b>{change.title}</b><small>{change.description}</small></span>
        <Badge tone={change.significance === 'critical' ? 'red' : change.significance === 'meaningful' ? 'amber' : 'neutral'}>{change.significance}</Badge>
        <span className="change-confidence">{confidence(change.confidence)}<small>{change.evidenceAssetIds.length} sources</small></span><ArrowRight size={14}/>
      </button>)}</div>
    </div>
  </section>
}
