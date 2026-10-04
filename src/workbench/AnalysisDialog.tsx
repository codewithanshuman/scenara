import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, AudioLines, BrainCircuit, Check, Clock3, File, Fingerprint, Gauge, Image, Layers3, LoaderCircle, RefreshCcw, ShieldCheck, Video } from 'lucide-react'
import type { AnalysisRun, MediaAsset, PipelineJob } from '../../shared/domain'
import type { AnalyzeAssetInput, HealthStatus, SceneWorkspace } from '../api/client'
import { Badge, Button, Dialog, DialogHeader, Progress } from '../components/ui'
import './panels.css'

type AnalysisResult = { analysis: AnalysisRun; job: PipelineJob }
type PolicyProfile = NonNullable<AnalyzeAssetInput['policyProfile']>
type TemporalMode = NonNullable<AnalyzeAssetInput['temporalMode']>

const profiles: Array<{ id: PolicyProfile; title: string; note: string }> = [
  { id: 'balanced', title: 'Balanced', note: 'General evidence work' },
  { id: 'risk_sensitive', title: 'Risk sensitive', note: 'Escalate uncertain risks' },
  { id: 'high_precision', title: 'High precision', note: 'Suppress weak findings' },
  { id: 'rapid_screen', title: 'Rapid screen', note: 'Broader first pass' },
]

const lensOptions: Array<{ id: AnalyzeAssetInput['lensId']; title: string; note: string }> = [
  { id: 'general', title: 'General', note: 'Objects, conditions and context' },
  { id: 'safety', title: 'Safety', note: 'Hazards, severity and exposure' },
  { id: 'accessibility', title: 'Accessibility', note: 'Routes, barriers and usability' },
  { id: 'environment', title: 'Environment', note: 'Ecology, water and materials' },
  { id: 'inventory', title: 'Inventory', note: 'Assets, quantities and condition' },
]

function AssetIcon({ asset }: { asset: MediaAsset }) {
  const Icon = asset.kind === 'image' ? Image : asset.kind === 'video' ? Video : asset.kind === 'audio' ? AudioLines : File
  return <Icon size={17}/>
}

export function AnalysisDialog({ open, scene, health, selectedAssetId, onClose, onAnalyze, onPipeline }: {
  open: boolean; scene?: SceneWorkspace; health?: HealthStatus; selectedAssetId?: string
  onClose(): void; onAnalyze(input: AnalyzeAssetInput): Promise<AnalysisResult>; onPipeline(): void
}) {
  const [assetId, setAssetId] = useState('')
  const [lensId, setLensId] = useState<AnalyzeAssetInput['lensId']>('general')
  const [profile, setProfile] = useState<PolicyProfile>('balanced')
  const [temporalMode, setTemporalMode] = useState<TemporalMode>('change_detection')
  const [force, setForce] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<AnalysisResult>()
  const eligible = useMemo(() => scene?.assets.filter(asset => asset.origin !== 'generated') ?? [], [scene])

  useEffect(() => {
    if (!open) return
    setAssetId(eligible.some(asset => asset.id === selectedAssetId) ? selectedAssetId! : eligible[0]?.id ?? '')
    setError(undefined); setResult(undefined); setForce(false)
  }, [open, scene?.id])

  if (!open || !scene) return null
  const asset = eligible.find(item => item.id === assetId) ?? eligible[0]
  const preview = asset?.cloudinary?.secureUrl ?? asset?.localUrl ?? asset?.posterUrl
  const previous = asset ? scene.jobs.filter(job => job.kind === 'analyze' && job.assetId === asset.id) : []

  async function run() {
    if (!asset || working) return
    setWorking(true); setError(undefined); setResult(undefined)
    try {
      const next = await onAnalyze({ assetId: asset.id, lensId, policyProfile: profile, temporalMode, force, async: true })
      setResult(next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Analysis could not be started.') }
    finally { setWorking(false) }
  }

  if (result) return <Dialog label="Analysis result" onClose={onClose} className="analysis-dialog">
    <DialogHeader eyebrow="ANALYSIS STUDIO" title={result.job.status === 'failed' ? 'The run needs attention.' : 'The evidence compiler is running.'} description="This is a durable pipeline job. You can leave this screen without interrupting it." onClose={onClose}/>
    <div className="analysis-result">
      <span className={`analysis-result-icon ${result.job.status}`}>
        {result.job.status === 'succeeded' ? <Check size={25}/> : result.job.status === 'failed' ? <AlertCircle size={25}/> : <LoaderCircle className="spin" size={25}/>}</span>
      <div><Badge tone="blue">{result.job.status}</Badge><h3>{result.job.stage.replaceAll('_',' ')}</h3><p>{result.job.status === 'succeeded' ? `${result.analysis.observationIds.length} structured findings are connected to this source.` : result.job.error?.message ?? 'The source is being interpreted, evaluated and linked.'}</p><Progress value={result.job.progress}/><small>{result.job.progress}% · attempt {result.job.attempt} of {result.job.maxAttempts}</small></div>
    </div>
    <footer className="analysis-footer"><span><Fingerprint size={15}/>Run ID {result.analysis.id.slice(-10)}</span><div><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" onClick={() => { onClose(); onPipeline() }}>View pipeline<ArrowRight size={15}/></Button></div></footer>
  </Dialog>

  return <Dialog label="Analyze capture" onClose={onClose} className="analysis-dialog">
    <DialogHeader eyebrow="ANALYSIS STUDIO" title="Compile a capture into evidence." description="Choose how Scenara should interpret, challenge and connect this source. Every option changes the actual analysis contract." onClose={onClose}/>
    <div className="analysis-layout">
      <section className="analysis-source">
        <div className="analysis-preview">{preview && asset?.kind === 'image' ? <img src={preview} alt="Selected capture"/> : preview && asset?.kind === 'video' ? <video src={preview} muted/> : <span>{asset && <AssetIcon asset={asset}/>}<b>{asset?.kind ?? 'No source'}</b></span>}<Badge>{asset?.origin}</Badge></div>
        <label><span>Source capture</span><select value={asset?.id ?? ''} onChange={event => setAssetId(event.target.value)} disabled={working}>{eligible.map(item => <option value={item.id} key={item.id}>{item.sourceFilename}</option>)}</select></label>
        {asset && <dl><div><dt>Identity</dt><dd>{asset.sha256.slice(0,12)}…</dd></div><div><dt>Existing findings</dt><dd>{asset.observationIds.length}</dd></div><div><dt>Previous runs</dt><dd>{previous.length}</dd></div><div><dt>Runtime</dt><dd>{health?.mode === 'cloudinary' ? 'Cloud AI Vision' : 'Local adapter'}</dd></div></dl>}
      </section>
      <section className="analysis-config">
        <fieldset><legend><BrainCircuit size={16}/>Analysis lens</legend><div className="analysis-choice-grid lens-grid">{lensOptions.map(item => <button type="button" className={lensId === item.id ? 'selected' : ''} aria-pressed={lensId === item.id} onClick={() => setLensId(item.id)} key={item.id}><span><b>{item.title}</b><small>{item.note}</small></span>{lensId === item.id && <Check size={14}/>}</button>)}</div></fieldset>
        <fieldset><legend><ShieldCheck size={16}/>Decision policy</legend><div className="analysis-choice-grid">{profiles.map(item => <button type="button" className={profile === item.id ? 'selected' : ''} aria-pressed={profile === item.id} onClick={() => setProfile(item.id)} key={item.id}><span><b>{item.title}</b><small>{item.note}</small></span>{profile === item.id && <Check size={14}/>}</button>)}</div></fieldset>
        <fieldset><legend><Layers3 size={16}/>Temporal reasoning</legend><div className="analysis-temporal"><button type="button" className={temporalMode === 'change_detection' ? 'selected' : ''} onClick={() => setTemporalMode('change_detection')}><Clock3 size={17}/><span><b>Detect change</b><small>Link against earlier captures</small></span></button><button type="button" className={temporalMode === 'single_capture' ? 'selected' : ''} onClick={() => setTemporalMode('single_capture')}><Gauge size={17}/><span><b>Single capture</b><small>Interpret this moment alone</small></span></button></div></fieldset>
        <label className="analysis-force"><input type="checkbox" checked={force} onChange={event => setForce(event.target.checked)}/><span><b><RefreshCcw size={14}/>Force a fresh run</b><small>Ignore an identical request fingerprint and recompute.</small></span></label>
      </section>
    </div>
    {error && <p className="dialog-error panel-message is-error" role="alert"><AlertCircle size={16}/>{error}</p>}
    <footer className="analysis-footer"><span><Fingerprint size={15}/>Source stays immutable. Findings remain reviewable.</span><div><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={working} disabled={!asset} onClick={run}><BrainCircuit size={16}/>Run analysis</Button></div></footer>
  </Dialog>
}
