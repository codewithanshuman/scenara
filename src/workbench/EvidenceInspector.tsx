import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Braces, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDot, Clock3, FileImage, Film, Fingerprint, Flag, Focus, GitBranch, Image, Info, Layers3, MapPin, MessageSquareText, MoreHorizontal, PencilLine, Play, RotateCcw, ScanLine, ShieldCheck, Sparkles, Trash2, UserCheck, Video, X } from 'lucide-react'
import type { Observation } from '../../shared/domain'
import type { ReviewInput, SceneWorkspace } from '../api/client'
import { Badge, Button, IconButton, Meter, Progress, Segmented } from '../components/ui'
import { confidence, formatDateTime, formatDuration, titleCase } from '../utils/format'

export function EvidenceInspector({ scene, observation, tab, onTab, onReview, onClose }: {
  scene: SceneWorkspace
  observation?: Observation
  tab: 'evidence' | 'review' | 'data'
  onTab(tab: 'evidence' | 'review' | 'data'): void
  onReview(observationId: string, input: ReviewInput): Promise<unknown>
  onClose(): void
}) {
  const [rationale, setRationale] = useState('')
  const [working, setWorking] = useState<string>()
  const [editMode, setEditMode] = useState(false)
  const evidence = useMemo(() => observation?.evidence.map(item => ({ ...item, asset: scene.assets.find(asset => asset.id === item.assetId), transcript: item.transcriptSegmentId ? scene.transcripts.flatMap(item => item.segments).find(segment => segment.id === item.transcriptSegmentId) : undefined })) ?? [], [observation,scene])
  if (!observation) return <aside className="evidence-inspector empty"><Focus size={24}/><h3>Select graph evidence</h3><p>Choose an anchor, entity, or relationship to inspect its supporting media and review state.</p></aside>

  const stateTone = observation.state === 'verified' ? 'green' : observation.state === 'dismissed' ? 'red' : observation.requiresReview ? 'amber' : 'blue'
  async function decide(decision: ReviewInput['decision']) {
    setWorking(decision)
    try { await onReview(observation!.id,{ decision, expectedVersion: observation!.version, ...(rationale ? { rationale } : {}) }); setRationale('') }
    finally { setWorking(undefined) }
  }

  return <aside className="evidence-inspector">
    <header className="inspector-top"><span>Evidence inspector</span><div><IconButton label="More options"><MoreHorizontal size={15}/></IconButton><IconButton label="Close inspector" onClick={onClose}><X size={15}/></IconButton></div></header>
    <div className="inspector-tabs"><Segmented value={tab} onChange={onTab} label="Inspector section" options={[{value:'evidence',label:'Evidence',count:evidence.length},{value:'review',label:'Review',count:observation.requiresReview?1:0},{value:'data',label:'Data'}]}/></div>
    <div className="inspector-scroll">
      <section className="finding-title"><div className={`finding-symbol tone-${stateTone}`}><ScanLine size={18}/></div><div><small>{titleCase(observation.lensId)} lens · {titleCase(observation.state)}</small><h2>{observation.label}</h2><div><Badge tone={stateTone}>{observation.requiresReview ? <AlertTriangle size={9}/> : <ShieldCheck size={9}/>} {titleCase(observation.state)}</Badge>{observation.severity && <Badge tone={observation.severity === 'high' || observation.severity === 'critical' ? 'red' : observation.severity === 'medium' ? 'amber' : 'neutral'}>{observation.severity}</Badge>}</div></div></section>
      <section className="confidence-card"><div><span><small>MODEL CONFIDENCE</small><b>{confidence(observation.confidence)}</b></span><Meter value={observation.confidence} tone={observation.confidence<.8?'amber':'cyan'} size={48}>{Math.round(observation.confidence*100)}</Meter></div><Progress value={observation.confidence*100} tone={observation.confidence<.8?'amber':'cyan'}/><footer><span>{observation.sourceModel}</span><span>v{observation.version}</span></footer></section>

      {tab === 'evidence' && <>
        <section className="finding-description"><header><span>Observation</span><IconButton label="Edit observation" onClick={() => setEditMode(!editMode)}><PencilLine size={13}/></IconButton></header>{editMode ? <textarea defaultValue={observation.description}/> : <p>{observation.description}</p>}<dl><div><dt>Condition</dt><dd>{observation.condition ?? 'Not specified'}</dd></div><div><dt>Captured</dt><dd>{formatDateTime(observation.capturedAt)}</dd></div></dl></section>
        <section className="supporting-evidence"><header><span>Supporting evidence</span><small>{evidence.length} linked sources</small></header>{evidence.map((item,index) => <button key={`${item.assetId}-${index}`}>
          <span className="evidence-preview">{item.asset?.posterUrl || item.asset?.localUrl ? <img src={item.asset.posterUrl ?? item.asset.localUrl} alt=""/> : <FileImage size={16}/>} {item.frameTimeSeconds !== undefined && <i><Play size={9}/>{formatDuration(item.frameTimeSeconds)}</i>}</span><span><b>{item.asset?.sourceFilename ?? item.assetId}</b><small>{titleCase(item.asset?.kind ?? 'media')} · {item.note ?? (item.region ? 'Exact evidence region' : 'Linked source')}</small></span><Badge tone="blue">{index === 0 ? 'Primary' : 'Support'}</Badge><ChevronRight size={13}/>
        </button>)}</section>
        <button className="provenance-link"><span className="link-icon"><Fingerprint size={16}/></span><span><b>Open provenance chain</b><small>Original → analysis → review → derived output</small></span><ArrowRight size={14}/></button>
      </>}

      {tab === 'review' && <section className="review-workspace"><div className="review-context"><UserCheck size={17}/><span><b>Human verification required</b><p>Confirm whether the observation accurately describes what the linked source media visibly supports.</p></span></div><label><span>Reviewer note <small>Optional</small></span><textarea value={rationale} onChange={event => setRationale(event.target.value)} placeholder="Record why this finding is accepted, corrected, or dismissed…"/></label><div className="review-actions"><Button variant="primary" loading={working==='verified'} onClick={() => decide('verified')}><Check size={14}/>Verify finding</Button><Button variant="secondary" loading={working==='corrected'} onClick={() => decide('corrected')}><PencilLine size={14}/>Correct</Button><Button variant="danger" loading={working==='dismissed'} onClick={() => decide('dismissed')}><X size={14}/>Dismiss</Button><Button variant="ghost" loading={working==='deferred'} onClick={() => decide('deferred')}><Clock3 size={14}/>Defer</Button></div><div className="review-history"><header><span>Review history</span><small>Immutable audit trail</small></header><div><span className="history-node"><CircleDot size={11}/></span><span><b>AI observation created</b><small>{formatDateTime(observation.createdAt)} · {observation.sourceModel}</small></span></div>{observation.reviewedAt && <div><span className="history-node verified"><Check size={11}/></span><span><b>{titleCase(observation.state)} by reviewer</b><small>{formatDateTime(observation.reviewedAt)} · {observation.reviewedBy}</small></span></div>}</div></section>}

      {tab === 'data' && <section className="structured-data"><header><span><Braces size={13}/>Structured result</span><Badge tone="green">Schema valid</Badge></header><div className="data-grid"><div><span>observation_id</span><code>{observation.id}</code></div><div><span>canonical_label</span><code>{observation.canonicalLabel}</code></div><div><span>entity_id</span><code>{observation.entityId ?? 'null'}</code></div><div><span>confidence</span><code>{observation.confidence}</code></div><div><span>requires_review</span><code>{String(observation.requiresReview)}</code></div><div><span>source_analysis_id</span><code>{observation.sourceAnalysisId ?? 'seed'}</code></div></div><header className="attribute-head"><span>Attributes</span><small>{Object.keys(observation.attributes).length} fields</small></header><pre>{JSON.stringify(observation.attributes,null,2)}</pre><header className="attribute-head"><span>Evidence regions</span><small>{observation.evidence.length} bindings</small></header><pre>{JSON.stringify(observation.evidence,null,2)}</pre></section>}
    </div>
  </aside>
}
