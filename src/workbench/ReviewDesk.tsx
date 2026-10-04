import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Clock3, FileImage, Filter, Fingerprint, Layers3, ListFilter, PencilLine, Play, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { LensId, Observation, ObservationEvidence } from '../../shared/domain'
import type { ReviewInput, SceneWorkspace } from '../api/client'
import { Badge, Button, Progress } from '../components/ui'
import { confidence, formatDateTime, formatDuration, titleCase } from '../utils/format'
import './review.css'

type QueueView = 'pending' | 'high-risk' | 'all'
type QueueSort = 'priority' | 'confidence' | 'oldest'

function riskScore(observation: Observation): number {
  const severity = { none: 0, low: 10, medium: 24, high: 45, critical: 65 }[observation.severity ?? 'none']
  const policy = observation.policy
  return Math.min(100, Math.round(
    severity +
    (observation.requiresReview ? 12 : 0) +
    (1 - observation.confidence) * 38 +
    (policy?.hasContradiction ? 28 : 0) +
    (policy?.missingRequiredFields.length ?? 0) * 7 +
    (observation.evidence.length < 2 ? 9 : 0),
  ))
}

function riskLabel(value: number): string {
  if (value >= 65) return 'Urgent'
  if (value >= 36) return 'High attention'
  if (value >= 28) return 'Review'
  return 'Routine'
}

function evidenceSource(scene: SceneWorkspace, evidence: ObservationEvidence | undefined) {
  const asset = scene.assets.find(item => item.id === evidence?.assetId)
  const source = asset?.cloudinary?.secureUrl ?? asset?.localUrl
  const preview = evidence?.cropUrl ?? asset?.posterUrl ?? source
  return { asset, source, preview }
}

export function ReviewDesk({ scene, selectedId, onSelect, onReview, onBack, onOpenCanvas, onOpenHistory }: {
  scene: SceneWorkspace
  selectedId?: string
  onSelect(id: string): void
  onReview(observationId: string, input: ReviewInput): Promise<unknown>
  onBack(): void
  onOpenCanvas(): void
  onOpenHistory(assetId: string): void
}) {
  const [view, setView] = useState<QueueView>('pending')
  const [sort, setSort] = useState<QueueSort>('priority')
  const [lens, setLens] = useState<'all' | LensId>('all')
  const [query, setQuery] = useState('')
  const [sourceIndex, setSourceIndex] = useState(0)
  const [rationale, setRationale] = useState('')
  const [editing, setEditing] = useState(false)
  const [working, setWorking] = useState<ReviewInput['decision']>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [correction, setCorrection] = useState({ label: '', description: '', condition: '', severity: 'none' as NonNullable<Observation['severity']> })

  const queue = useMemo(() => scene.observations
    .filter(item => view === 'all' || (view === 'pending' ? item.requiresReview : item.requiresReview && riskScore(item) >= 36))
    .filter(item => lens === 'all' || item.lensId === lens)
    .filter(item => !query || `${item.label} ${item.description} ${item.condition ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'priority'
      ? riskScore(b) - riskScore(a) || b.confidence - a.confidence
      : sort === 'confidence' ? a.confidence - b.confidence : Date.parse(a.capturedAt) - Date.parse(b.capturedAt)),
  [scene.observations, view, sort, lens, query])

  const selected = queue.find(item => item.id === selectedId) ?? queue[0]
  const selectedIndex = selected ? queue.findIndex(item => item.id === selected.id) : -1
  const evidence = selected?.evidence ?? []
  const currentEvidence = evidence[sourceIndex] ?? evidence[0]
  const currentSource = evidenceSource(scene, currentEvidence)
  const pending = scene.observations.filter(item => item.requiresReview)
  const completed = scene.observations.length - pending.length
  const completion = scene.observations.length ? completed / scene.observations.length * 100 : 100
  const highRisk = pending.filter(item => riskScore(item) >= 36).length
  const contradicted = pending.filter(item => item.policy?.hasContradiction).length

  useEffect(() => {
    if (!selected) return
    setSourceIndex(0); setRationale(''); setEditing(false); setError(undefined); setNotice(undefined)
    setCorrection({ label: selected.label, description: selected.description, condition: selected.condition ?? '', severity: selected.severity ?? 'none' })
  }, [selected?.id])

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]') || !queue.length) return
      if (event.key.toLowerCase() === 'j' || event.key === 'ArrowDown') {
        event.preventDefault(); onSelect(queue[Math.min(queue.length - 1, selectedIndex + 1)]?.id ?? queue[0].id)
      }
      if (event.key.toLowerCase() === 'k' || event.key === 'ArrowUp') {
        event.preventDefault(); onSelect(queue[Math.max(0, selectedIndex - 1)]?.id ?? queue[0].id)
      }
    }
    addEventListener('keydown', navigate)
    return () => removeEventListener('keydown', navigate)
  }, [queue, selectedIndex, onSelect])

  async function decide(decision: ReviewInput['decision']) {
    if (!selected || working) return
    if (decision === 'corrected' && (!correction.label.trim() || !correction.description.trim())) { setError('A correction needs a title and description.'); return }
    const next = queue[selectedIndex + 1] ?? queue[selectedIndex - 1]
    setWorking(decision); setError(undefined); setNotice(undefined)
    try {
      await onReview(selected.id, {
        decision, expectedVersion: selected.version,
        ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
        ...(decision === 'corrected' ? { correction: { ...correction, label: correction.label.trim(), description: correction.description.trim(), condition: correction.condition.trim() } } : {}),
      })
      setNotice(decision === 'verified' ? 'Verified and saved.' : decision === 'corrected' ? 'Correction saved.' : decision === 'deferred' ? 'Deferred for another pass.' : 'Dismissed from the evidence set.')
      setRationale(''); setEditing(false)
      if (next) onSelect(next.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The review decision could not be saved.') }
    finally { setWorking(undefined) }
  }

  return <section className="review-desk">
    <header className="review-desk-header">
      <div><button className="back-link" onClick={onBack}><ArrowLeft size={14}/>Overview</button><div className="review-desk-title"><span className="review-desk-icon"><ShieldCheck size={23}/></span><span><small>HUMAN REVIEW DESK</small><h1>Make every finding defensible.</h1></span></div></div>
      <div className="review-progress"><span><b>{completed}</b><small>of {scene.observations.length} reviewed</small></span><Progress value={completion} label="Review completion"/><strong>{Math.round(completion)}%</strong></div>
    </header>

    <div className="review-metrics">
      <button className={view === 'pending' ? 'active' : ''} onClick={() => setView('pending')}><span><ShieldAlert size={18}/></span><small>Pending</small><b>{pending.length}</b></button>
      <button className={view === 'high-risk' ? 'active' : ''} onClick={() => setView('high-risk')}><span><Sparkles size={18}/></span><small>High attention</small><b>{highRisk}</b></button>
      <div><span><AlertCircle size={18}/></span><small>Contradictions</small><b>{contradicted}</b></div>
      <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}><span><CheckCircle2 size={18}/></span><small>All findings</small><b>{scene.observations.length}</b></button>
    </div>

    <div className="review-desk-body">
      <aside className="review-queue">
        <div className="review-queue-tools"><label className="review-search"><ListFilter size={15}/><input aria-label="Filter review queue" value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter findings"/></label><div><label><Filter size={13}/><select aria-label="Filter by lens" value={lens} onChange={event => setLens(event.target.value as typeof lens)}><option value="all">Every lens</option><option value="general">General</option><option value="safety">Safety</option><option value="accessibility">Accessibility</option><option value="environment">Environment</option></select></label><label><select aria-label="Sort queue" value={sort} onChange={event => setSort(event.target.value as QueueSort)}><option value="priority">Priority first</option><option value="confidence">Lowest confidence</option><option value="oldest">Oldest capture</option></select><ChevronDown size={12}/></label></div></div>
        <div className="review-queue-label"><span>{queue.length} findings</span><span><kbd>J</kbd><kbd>K</kbd> navigate</span></div>
        <div className="review-queue-list">{queue.map((item, index) => {
          const score = riskScore(item)
          return <button key={item.id} className={item.id === selected?.id ? 'selected' : ''} onClick={() => onSelect(item.id)}><span className="review-queue-index">{String(index + 1).padStart(2, '0')}</span><span className="review-queue-copy"><small>{titleCase(item.lensId)} · {confidence(item.confidence)}</small><b>{item.label}</b><span>{item.evidence.length} sources · {titleCase(item.severity ?? 'none')}</span></span><span className={`risk-score risk-${riskLabel(score).toLowerCase().replaceAll(' ', '-')}`}><b>{score}</b><small>{riskLabel(score)}</small></span></button>
        })}{queue.length === 0 && <div className="review-queue-empty"><CheckCircle2 size={31}/><b>Queue clear</b><span>Nothing matches these filters.</span></div>}</div>
      </aside>

      {selected ? <main className="review-evidence">
        <header><div><span>{titleCase(selected.lensId)}</span><Badge tone="blue">{riskLabel(riskScore(selected))}</Badge></div><h2>{selected.label}</h2><p>{selected.description}</p></header>
        <section className="review-media-stage">
          {currentSource.asset?.kind === 'video' && currentSource.source ? <video src={currentSource.source} poster={currentSource.asset.posterUrl} controls preload="metadata"/> : currentSource.asset?.kind === 'audio' && currentSource.source ? <div className="review-audio"><Play size={26}/><audio src={currentSource.source} controls preload="metadata"/></div> : currentSource.preview ? <img src={currentSource.preview} alt={currentEvidence?.note ?? selected.label}/> : <div className="review-no-preview"><FileImage size={32}/><span>Preview unavailable</span></div>}
          <div className="review-media-meta"><span><b>{currentSource.asset?.sourceFilename ?? 'Evidence source'}</b><small>{currentEvidence?.frameTimeSeconds !== undefined ? `${formatDuration(currentEvidence.frameTimeSeconds)} · ` : ''}{currentEvidence?.note ?? titleCase(currentSource.asset?.kind ?? 'media')}</small></span>{currentSource.asset && <button onClick={() => onOpenHistory(currentSource.asset!.id)}><Fingerprint size={15}/>Verify history</button>}</div>
        </section>
        <div className="review-source-strip">{evidence.map((item, index) => {
          const source = evidenceSource(scene, item)
          return <button key={`${item.assetId}-${index}`} className={index === sourceIndex ? 'selected' : ''} onClick={() => setSourceIndex(index)}><span>{source.preview && source.asset?.kind === 'image' ? <img src={source.preview} alt=""/> : source.asset?.kind === 'video' ? <Play size={16}/> : <FileImage size={16}/>}</span><span><b>{source.asset?.sourceFilename ?? 'Source'}</b><small>{item.note ?? titleCase(source.asset?.kind ?? 'media')}</small></span></button>
        })}</div>
        <section className="review-assessment"><header><span><Layers3 size={16}/>Assessment trail</span><Badge>{selected.policy?.profile ? titleCase(selected.policy.profile) : 'No policy'}</Badge></header><div className="assessment-scores"><span><small>Model</small><b>{confidence(selected.policy?.modelConfidence ?? selected.confidence)}</b></span><ArrowRight size={17}/><span><small>Adjusted</small><b>{confidence(selected.policy?.adjustedConfidence ?? selected.confidence)}</b></span><span><small>Sources</small><b>{selected.policy?.corroboratingSources ?? selected.evidence.length}</b></span><span><small>Temporal agreement</small><b>{selected.policy?.temporalAgreement ? 'Yes' : 'No'}</b></span></div>{selected.policy && <div className="assessment-reasons">{selected.policy.reviewReasons.map(reason => <span key={reason}><AlertCircle size={13}/>{reason}</span>)}{selected.policy.appliedAdjustments.map((item, index) => <span key={index}><Sparkles size={13}/>{item.explanation}</span>)}</div>}</section>
      </main> : <main className="review-evidence review-complete"><CheckCircle2 size={48}/><h2>Review queue complete.</h2><p>Every visible finding has a recorded decision.</p><Button onClick={onOpenCanvas}>Return to scene<ArrowRight size={16}/></Button></main>}

      <aside className="review-decision">
        {selected ? <><header><small>DECISION</small><h3>Record your judgment</h3><p>Version {selected.version} · captured {formatDateTime(selected.capturedAt)}</p></header>
          {error && <p className="review-alert is-error" role="alert"><AlertCircle size={15}/>{error}</p>}{notice && <p className="review-alert" role="status"><Check size={15}/>{notice}</p>}
          <div className="decision-facts"><span><small>Condition</small><b>{selected.condition ?? 'Unspecified'}</b></span><span><small>Priority</small><b>{titleCase(selected.severity ?? 'none')}</b></span><span><small>Confidence</small><b>{confidence(selected.confidence)}</b></span></div>
          {editing ? <fieldset className="review-correction"><legend>Correct finding</legend><label>Title<input value={correction.label} onChange={event => setCorrection(value => ({...value, label:event.target.value}))}/></label><label>Description<textarea value={correction.description} onChange={event => setCorrection(value => ({...value, description:event.target.value}))}/></label><label>Condition<input value={correction.condition} onChange={event => setCorrection(value => ({...value, condition:event.target.value}))}/></label><label>Priority<select value={correction.severity} onChange={event => setCorrection(value => ({...value, severity:event.target.value as typeof value.severity}))}>{['none','low','medium','high','critical'].map(value => <option key={value}>{value}</option>)}</select></label></fieldset> : <label className="decision-note"><span>Reviewer note <small>Optional</small></span><textarea value={rationale} maxLength={4000} onChange={event => setRationale(event.target.value)} placeholder="Why are you making this decision?"/></label>}
          {editing ? <div className="decision-actions"><Button variant="primary" loading={working === 'corrected'} disabled={!!working} onClick={() => void decide('corrected')}><Check size={15}/>Save correction</Button><Button disabled={!!working} onClick={() => setEditing(false)}>Cancel</Button></div> : <div className="decision-actions"><Button variant="primary" loading={working === 'verified'} disabled={!!working} onClick={() => void decide('verified')}><ShieldCheck size={16}/>Verify finding</Button><Button disabled={!!working} onClick={() => setEditing(true)}><PencilLine size={15}/>Correct evidence</Button><div><Button variant="ghost" loading={working === 'deferred'} disabled={!!working} onClick={() => void decide('deferred')}><Clock3 size={14}/>Defer</Button><Button variant="ghost" loading={working === 'dismissed'} disabled={!!working} onClick={() => void decide('dismissed')}><X size={14}/>Dismiss</Button></div></div>}
          <footer><span>Next finding</span><div><button disabled={selectedIndex <= 0} onClick={() => onSelect(queue[selectedIndex - 1].id)}>K</button><button disabled={selectedIndex < 0 || selectedIndex >= queue.length - 1} onClick={() => onSelect(queue[selectedIndex + 1].id)}>J</button></div></footer>
        </> : <div className="decision-done"><ShieldCheck size={31}/><b>No action needed</b><span>Adjust the filters to inspect completed findings.</span></div>}
      </aside>
    </div>
  </section>
}
