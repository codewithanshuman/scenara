import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, Check, ChevronRight, Clock3, FileImage, Fingerprint, Focus, LoaderCircle, PencilLine, Play, ScanLine, ShieldCheck, X } from 'lucide-react'
import type { Observation } from '../../shared/domain'
import { api, type ProvenanceResponse, type ReviewInput, type SceneWorkspace } from '../api/client'
import { Badge, Button, IconButton, Progress, Segmented } from '../components/ui'
import { confidence, formatDateTime, formatDuration, titleCase } from '../utils/format'
import './panels.css'

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
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [editMode, setEditMode] = useState(false)
  const [correction, setCorrection] = useState({ label: '', description: '', condition: '', severity: 'none' as NonNullable<Observation['severity']> })
  const [sourceIndex, setSourceIndex] = useState(0)
  const [provenance, setProvenance] = useState<ProvenanceResponse>()
  const [provenanceOpen, setProvenanceOpen] = useState(false)
  const [provenanceBusy, setProvenanceBusy] = useState(false)
  const evidence = useMemo(() => observation?.evidence.map(item => ({ ...item, asset: scene.assets.find(asset => asset.id === item.assetId), transcript: item.transcriptSegmentId ? scene.transcripts.flatMap(transcript => transcript.segments).find(segment => segment.id === item.transcriptSegmentId) : undefined })) ?? [], [observation, scene])

  useEffect(() => {
    setRationale(''); setError(undefined); setNotice(undefined); setEditMode(false); setSourceIndex(0); setProvenance(undefined); setProvenanceOpen(false)
    if (observation) setCorrection({ label: observation.label, description: observation.description, condition: observation.condition ?? '', severity: observation.severity ?? 'none' })
  }, [observation?.id])

  if (!observation) return <aside className="evidence-inspector empty"><Focus size={28}/><h3>A closer look</h3><p>Select an observation to explore its evidence.</p><Button size="sm" variant="ghost" onClick={onClose}>Close inspector</Button></aside>

  const current = evidence[sourceIndex] ?? evidence[0]
  const source = current?.asset
  const sourceUrl = source?.cloudinary?.secureUrl ?? source?.localUrl
  const mediaUrl = source?.kind === 'video' && /\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(sourceUrl ?? '') ? undefined : sourceUrl
  const previewUrl = current?.cropUrl ?? source?.posterUrl ?? (source?.kind === 'image' ? mediaUrl : undefined)
  const stateLabel = observation.state === 'ai_observation' ? 'AI observation' : titleCase(observation.state)

  async function decide(decision: ReviewInput['decision']) {
    if (!observation || working) return
    if (decision === 'corrected' && (!correction.label.trim() || !correction.description.trim())) { setError('Add a title and description before saving.'); return }
    setWorking(decision); setError(undefined); setNotice(undefined)
    try {
      await onReview(observation.id, { decision, expectedVersion: observation.version, ...(rationale.trim() ? { rationale: rationale.trim() } : {}), ...(decision === 'corrected' ? { correction: { ...correction, label: correction.label.trim(), description: correction.description.trim(), condition: correction.condition.trim() } } : {}) })
      setRationale(''); setEditMode(false); setNotice(decision === 'corrected' ? 'Correction saved.' : decision === 'verified' ? 'Observation verified.' : decision === 'dismissed' ? 'Observation dismissed.' : 'Review deferred.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Review could not be saved. Try again.') }
    finally { setWorking(undefined) }
  }

  async function inspectProvenance() {
    if (!source) return
    if (provenanceOpen) { setProvenanceOpen(false); return }
    setProvenanceBusy(true); setError(undefined)
    try { setProvenance(await api.provenance(source.id)); setProvenanceOpen(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Source history could not be loaded.') }
    finally { setProvenanceBusy(false) }
  }

  return <aside className="evidence-inspector">
    <header className="inspector-top"><span><ScanLine size={16}/>Observation</span><IconButton label="Close inspector" onClick={onClose}><X size={16}/></IconButton></header>
    <div className="inspector-tabs"><Segmented value={tab} onChange={onTab} label="Inspector section" options={[{ value: 'evidence', label: 'Evidence', count: evidence.length }, { value: 'review', label: 'Review' }, { value: 'data', label: 'Details' }]}/></div>
    <div className="inspector-scroll">
      <section className="finding-title"><div className="finding-kicker"><span>{titleCase(observation.lensId)}</span><span>#{String(scene.observations.findIndex(item => item.id === observation.id) + 1).padStart(2, '0')}</span></div><h2>{observation.label}</h2><div className="finding-badges"><Badge tone="blue">{observation.state === 'verified' ? <ShieldCheck size={11}/> : <ScanLine size={11}/>} {stateLabel}</Badge>{observation.severity && observation.severity !== 'none' && <Badge>{titleCase(observation.severity)} priority</Badge>}</div></section>
      <section className="confidence-card"><div><span>Confidence</span><b>{confidence(observation.confidence)}</b></div><Progress value={observation.confidence * 100} label="Observation confidence"/><footer><span>{observation.policy ? `${observation.policy.corroboratingSources} supporting source${observation.policy.corroboratingSources === 1 ? '' : 's'}` : `${evidence.length} linked source${evidence.length === 1 ? '' : 's'}`}</span><span>Version {observation.version}</span></footer></section>
      {error && <p className="panel-message is-error" role="alert"><AlertCircle size={15}/>{error}</p>}
      {notice && <p className="panel-message" role="status"><Check size={15}/>{notice}</p>}

      {tab === 'evidence' && <>
        <section className="finding-description"><header><span>What was observed</span><IconButton label="Correct observation" onClick={() => { setEditMode(true); onTab('review') }}><PencilLine size={14}/></IconButton></header><p>{observation.description}</p><dl><div><dt>Condition</dt><dd>{observation.condition ?? 'Unspecified'}</dd></div><div><dt>Captured</dt><dd>{formatDateTime(observation.capturedAt)}</dd></div></dl></section>
        {current && <section className="inspector-source"><div className="inspector-source-media">{source?.kind === 'video' && mediaUrl ? <video key={mediaUrl} src={`${mediaUrl}${current.frameTimeSeconds !== undefined ? `#t=${current.frameTimeSeconds}` : ''}`} poster={source.posterUrl} controls preload="metadata"/> : source?.kind === 'audio' && mediaUrl ? <audio src={mediaUrl} controls preload="metadata"/> : previewUrl ? <img src={previewUrl} alt={current.note ?? `Source for ${observation.label}`}/> : <div className="source-placeholder"><FileImage size={28}/><span>Preview unavailable</span></div>}<span className="source-origin">{titleCase(source?.origin ?? 'original')}</span></div>{current.transcript && <blockquote>“{current.transcript.text}”</blockquote>}<footer><span>{source?.sourceFilename ?? 'Source media'}</span>{mediaUrl && <a href={mediaUrl} target="_blank" rel="noreferrer" aria-label="Open original source"><ArrowRight size={15}/></a>}</footer></section>}
        <section className="supporting-evidence"><header><span>Linked sources</span><small>{evidence.length}</small></header>{evidence.map((item, index) => {
          const thumbnail = item.cropUrl ?? item.asset?.posterUrl ?? (item.asset?.kind === 'image' ? item.asset?.cloudinary?.secureUrl ?? item.asset?.localUrl : undefined)
          return <button type="button" key={`${item.assetId}-${index}`} className={sourceIndex === index ? 'selected' : ''} aria-pressed={sourceIndex === index} onClick={() => { setSourceIndex(index); setProvenanceOpen(false); setProvenance(undefined) }}><span className="evidence-preview">{thumbnail ? <img src={thumbnail} alt=""/> : <FileImage size={18}/>}</span><span><b>{item.asset?.sourceFilename ?? 'Source media'}</b><small>{item.frameTimeSeconds !== undefined ? <><Play size={10}/>{formatDuration(item.frameTimeSeconds)} · </> : null}{item.note ?? titleCase(item.asset?.kind ?? 'media')}</small></span><ChevronRight size={14}/></button>
        })}</section>
        {source && <><button type="button" className="provenance-link" aria-expanded={provenanceOpen} onClick={inspectProvenance} disabled={provenanceBusy}><Fingerprint size={19}/><span><b>Source history</b><small>Capture, analysis & review</small></span>{provenanceBusy ? <LoaderCircle size={15} className="spin"/> : <ChevronRight size={15} className={provenanceOpen ? 'rotated' : ''}/>}</button>{provenanceOpen && provenance && <section className="source-history"><header><span>{provenance.verification.valid ? 'History verified' : 'History needs attention'}</span><Badge>{provenance.events.length} events</Badge></header><ol>{provenance.events.map(event => <li key={event.id}><span className="history-dot"/><div><b>{titleCase(event.action)}</b><small>{formatDateTime(event.occurredAt)}</small></div></li>)}</ol></section>}</>}
      </>}

      {tab === 'review' && <section className="review-workspace"><div className="review-context"><ShieldCheck size={21}/><div><b>{observation.requiresReview ? 'Ready for your review' : 'Review this observation'}</b><p>Check the sources, then record your decision.</p></div></div>
        {editMode && <fieldset className="correction-form"><legend>Correct observation</legend><label><span>Title</span><input value={correction.label} maxLength={160} onChange={event => setCorrection(value => ({ ...value, label: event.target.value }))}/></label><label><span>Description</span><textarea value={correction.description} maxLength={4000} onChange={event => setCorrection(value => ({ ...value, description: event.target.value }))}/></label><label><span>Condition</span><input value={correction.condition} maxLength={160} onChange={event => setCorrection(value => ({ ...value, condition: event.target.value }))}/></label><label><span>Priority</span><select value={correction.severity} onChange={event => setCorrection(value => ({ ...value, severity: event.target.value as typeof value.severity }))}>{['none', 'low', 'medium', 'high', 'critical'].map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label></fieldset>}
        <label className="review-note"><span>Note <small>Optional</small></span><textarea value={rationale} maxLength={4000} onChange={event => setRationale(event.target.value)} placeholder="What informed your decision?"/></label>
        {editMode ? <div className="review-actions"><Button variant="primary" disabled={!!working} loading={working === 'corrected'} onClick={() => decide('corrected')}><Check size={14}/>Save correction</Button><Button disabled={!!working} onClick={() => setEditMode(false)}>Cancel edit</Button></div> : <div className="review-actions"><Button variant="primary" disabled={!!working} loading={working === 'verified'} onClick={() => decide('verified')}><Check size={15}/>Verify</Button><Button disabled={!!working} onClick={() => setEditMode(true)}><PencilLine size={14}/>Correct</Button><Button variant="ghost" disabled={!!working} loading={working === 'dismissed'} onClick={() => decide('dismissed')}><X size={14}/>Dismiss</Button><Button variant="ghost" disabled={!!working} loading={working === 'deferred'} onClick={() => decide('deferred')}><Clock3 size={14}/>Defer</Button></div>}
        <div className="review-history"><header>Latest activity</header><div><span className="history-dot"/><span><b>Observation created</b><small>{formatDateTime(observation.createdAt)}</small></span></div>{observation.reviewedAt && <div><span className="history-dot"/><span><b>{stateLabel}</b><small>{formatDateTime(observation.reviewedAt)}</small></span></div>}</div>
      </section>}

      {tab === 'data' && <section className="structured-data"><header><span>Observation details</span><Badge>v{observation.version}</Badge></header><dl className="data-grid"><div><dt>Observation</dt><dd>{observation.id}</dd></div><div><dt>Label</dt><dd>{observation.canonicalLabel}</dd></div><div><dt>Entity</dt><dd>{observation.entityId ?? 'Unlinked'}</dd></div><div><dt>Model</dt><dd>{observation.sourceModel}</dd></div></dl>{observation.policy && <details className="policy-assessment" open><summary><ShieldCheck size={14}/>Confidence assessment<ChevronRight size={14}/></summary><div className="policy-score"><span><small>Initial</small><b>{confidence(observation.policy.modelConfidence)}</b></span><ArrowRight size={16}/><span><small>Adjusted</small><b>{confidence(observation.policy.adjustedConfidence)}</b></span><Badge>{titleCase(observation.policy.decision)}</Badge></div><ul>{observation.policy.reviewReasons.map(reason => <li key={reason}>{reason}</li>)}{observation.policy.appliedAdjustments.map((adjustment, index) => <li key={index}>{adjustment.explanation}</li>)}</ul></details>}<details open><summary>Attributes<Badge>{Object.keys(observation.attributes).length}</Badge></summary><pre>{JSON.stringify(observation.attributes, null, 2)}</pre></details><details><summary>Evidence coordinates<Badge>{observation.evidence.length}</Badge></summary><pre>{JSON.stringify(observation.evidence, null, 2)}</pre></details></section>}
    </div>
  </aside>
}
