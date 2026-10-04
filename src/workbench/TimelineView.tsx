import { useMemo, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, GitCompareArrows, Image, Layers3, Search } from 'lucide-react'
import type { MediaAsset, Observation, SceneEntity } from '../../shared/domain'
import type { SceneWorkspace } from '../api/client'
import { Badge, EmptyState } from '../components/ui'
import { confidence, formatShortDate, titleCase } from '../utils/format'
import './views.css'

interface CaptureGroup { day: string; label: string; assets: MediaAsset[]; observations: Observation[] }

function captureGroups(scene: SceneWorkspace): CaptureGroup[] {
  const groups = new Map<string, CaptureGroup>()
  for (const asset of scene.assets.filter(item => item.origin === 'original')) {
    const day = asset.capturedAt.slice(0, 10)
    const group = groups.get(day) ?? { day, label: formatShortDate(asset.capturedAt), assets: [], observations: [] }
    group.assets.push(asset)
    groups.set(day, group)
  }
  for (const observation of scene.observations) groups.get(observation.capturedAt.slice(0, 10))?.observations.push(observation)
  return [...groups.values()].sort((a, b) => a.day.localeCompare(b.day))
}

function entityObservation(entity: SceneEntity, group: CaptureGroup): Observation | undefined {
  return group.observations.filter(item => entity.observationIds.includes(item.id)).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0]
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

  return <section className="sv-timeline">
    <header className="sv-view-heading"><div><span className="sv-icon-tile"><CalendarDays size={19}/></span><span><h2>Across time</h2><small>{groups.length} captures · {scene.entities.length} tracked entities</small></span></div><label className="sv-search"><Search size={16}/><input aria-label="Filter entities" value={entityFilter} onChange={event => setEntityFilter(event.target.value)} placeholder="Find an entity"/></label><button className={`sv-outline-button ${changesOnly ? 'is-active' : ''}`} aria-pressed={changesOnly} onClick={() => setChangesOnly(!changesOnly)}><GitCompareArrows size={16}/>Changes</button></header>

    <div className="sv-matrix-wrap">
      {entities.length > 0 && groups.length > 0 ? <div className="sv-matrix" style={{ '--capture-columns': groups.length } as CSSProperties}>
        <div className="sv-matrix-heading sv-entity-column"><b>Entity</b><small>{entities.length} in view</small></div>
        {groups.map((group, index) => <div className="sv-matrix-heading" key={group.day}><span className="sv-capture-number">{String(index + 1).padStart(2, '0')}</span><b>{group.label}</b><small>{group.assets.length} media · {group.observations.length} findings</small>{index === groups.length - 1 && <Badge tone="blue">Latest</Badge>}</div>)}
        {entities.map(entity => <div className="sv-matrix-row" key={entity.id}>
          <div className="sv-matrix-entity sv-entity-column"><span className="sv-icon-tile"><Layers3 size={17}/></span><span><b>{entity.displayName}</b><small>{entity.canonicalLabel.replaceAll('_', ' ')}</small></span></div>
          {groups.map(group => {
            const observation = entityObservation(entity, group), state = cellState(observation)
            return <button disabled={!observation} key={group.day} className={`sv-matrix-cell is-${state} ${observation?.id === selectedObservationId ? 'is-selected' : ''}`} aria-pressed={observation?.id === selectedObservationId} onClick={() => observation && onSelectObservation(observation.id)}>
              {observation ? <><span className="sv-cell-state"><i/>{titleCase(state)}</span><b>{observation.condition ?? observation.label}</b><span className="sv-cell-footer"><small>{confidence(observation.confidence)}</small><span><Image size={12}/>{observation.evidence.length}</span></span></> : <><span className="sv-empty-dash">—</span><small>No observation</small></>}
            </button>
          })}
        </div>)}
      </div> : <EmptyState icon={<CalendarDays size={28}/>} title={entityFilter || changesOnly ? 'No matching entities' : 'No captures yet'} description={entityFilter || changesOnly ? 'Adjust the filters to explore your evidence.' : 'Your capture history will appear here.'}/>}
    </div>

    <section className="sv-change-ledger"><header><div><span className="sv-icon-tile"><Activity size={18}/></span><h3>What changed</h3></div><Badge tone="blue">{scene.changes.length}</Badge></header>
      {scene.changes.length > 0 ? <div className="sv-change-list">{scene.changes.map((change, index) => <motion.button key={change.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * .035, .25) }} onClick={() => change.afterObservationId && onSelectObservation(change.afterObservationId)} disabled={!change.afterObservationId}>
        <span className="sv-change-icon">{change.kind === 'appeared' ? <ArrowUpRight size={19}/> : change.kind === 'disappeared' ? <ArrowDownRight size={19}/> : <GitCompareArrows size={19}/>}</span>
        <span className="sv-change-copy"><b>{change.title}</b><small>{change.description}</small></span><Badge tone="blue">{titleCase(change.significance)}</Badge><span className="sv-change-confidence">{confidence(change.confidence)}<small>{change.evidenceAssetIds.length} sources</small></span><ArrowRight size={16}/>
      </motion.button>)}</div> : <div className="sv-inline-empty">No changes detected between captures</div>}
    </section>
  </section>
}
