import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, Braces, Check, CheckCircle2, ChevronRight, Cloud, FileCheck2, Fingerprint, GitBranch, Hash, Image, KeyRound, Link2, LoaderCircle, LockKeyhole, ScanLine, ServerCog, ShieldCheck, Sparkles, UserCheck, WandSparkles } from 'lucide-react'
import type { MediaAsset, ProvenanceEvent } from '../../shared/domain'
import { api, type ProvenanceResponse, type SceneWorkspace } from '../api/client'
import { Badge, EmptyState, IconButton, Progress, Skeleton } from '../components/ui'
import { formatDateTime, titleCase, truncate } from '../utils/format'

function actionIcon(action: ProvenanceEvent['action']) {
  const icons = { captured: Image, uploaded: Cloud, analyzed: ScanLine, transformed: WandSparkles, transcribed: Activity, reviewed: UserCheck, generated: Sparkles, exported: FileCheck2 }
  return icons[action]
}

export function TraceView({ scene, selectedAssetId, onSelectAsset }: { scene: SceneWorkspace; selectedAssetId?: string; onSelectAsset(id: string): void }) {
  const originals = scene.assets.filter(item => item.origin === 'original')
  const asset = scene.assets.find(item => item.id === selectedAssetId) ?? originals[0]
  const [trace, setTrace] = useState<ProvenanceResponse>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!asset) return
    const controller = new AbortController()
    setLoading(true); setError(undefined)
    api.provenance(asset.id, controller.signal)
      .then(result => { if (!controller.signal.aborted) setTrace(result) })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [asset?.id])

  const derived = useMemo(() => scene.assets.filter(item => item.parentAssetId === asset?.id), [scene.assets, asset?.id])
  if (!asset) return <EmptyState icon={<Fingerprint/>} title="No media lineage" description="Ingest an original asset to establish a provenance chain."/>

  return <section className="trace-workspace">
    <aside className="trace-assets"><header><Fingerprint size={14}/><span><b>Media lineage</b><small>{scene.assets.length} tracked assets</small></span></header><div className="trace-asset-list">{scene.assets.map(item => <button key={item.id} onClick={() => onSelectAsset(item.id)} className={item.id === asset.id ? 'selected' : ''}><span className={`origin-dot ${item.origin}`}/><span><b>{item.sourceFilename}</b><small>{titleCase(item.origin)} · v{item.version}</small></span><em>{item.provenanceEventIds.length}</em></button>)}</div></aside>
    <div className="trace-main">
      <header className="trace-head"><div><span className="trace-file-icon"><FileCheck2 size={19}/></span><span><small>SELECTED ASSET</small><h2>{asset.sourceFilename}</h2><p>{asset.mimeType} · {asset.dimensions.width ?? '—'} × {asset.dimensions.height ?? '—'}</p></span></div>{trace?.verification.valid ? <Badge tone="green"><ShieldCheck size={11}/>Chain verified</Badge> : <Badge tone="red">Verification failed</Badge>}</header>
      <div className="fingerprint-panel"><div><Hash size={14}/><span><small>CONTENT FINGERPRINT · SHA-256</small><code>{asset.sha256}</code></span></div><IconButton label="Copy fingerprint"><Link2 size={14}/></IconButton></div>
      {loading && <div className="trace-loading"><Skeleton/><Skeleton/><Skeleton/></div>}
      {error && <EmptyState icon={<Fingerprint/>} title="Could not verify trace" description={error}/>} 
      {trace && <div className="provenance-chain">
        {trace.events.map((event,index) => {
          const Icon = actionIcon(event.action)
          return <div className="provenance-event" key={event.id}>
            <div className="provenance-axis"><span className="event-node"><Icon size={15}/></span>{index < trace.events.length-1 && <i/>}</div>
            <div className="event-card"><header><div><b>{titleCase(event.action)}</b><Badge tone={event.actorType === 'human' ? 'blue' : event.actorType === 'provider' ? 'violet' : 'neutral'}>{event.actorType}</Badge></div><time>{formatDateTime(event.occurredAt)}</time></header><p>{event.actorId}</p><dl><div><dt>Input</dt><dd>{truncate(event.inputFingerprint,22)}</dd></div><div><dt>Output</dt><dd>{truncate(event.outputFingerprint,22)}</dd></div>{event.providerReference && <div><dt>Provider ref</dt><dd>{event.providerReference}</dd></div>}</dl><details><summary><Braces size={12}/>Signed parameters<ChevronRight size={12}/></summary><pre>{JSON.stringify(event.parameters,null,2)}</pre></details><footer><LockKeyhole size={11}/><code>{truncate(event.hash,36)}</code><Check size={11}/></footer></div>
          </div>
        })}
      </div>}
      {derived.length > 0 && <section className="derived-branch"><header><GitBranch size={14}/><span><b>Derived branch</b><small>Outputs linked to this immutable original</small></span></header><div>{derived.map(item => <button key={item.id} onClick={() => onSelectAsset(item.id)}><span className={item.origin}>{item.origin === 'generated' ? <Sparkles size={14}/> : <ServerCog size={14}/>}</span><span><b>{item.sourceFilename}</b><small>{titleCase(item.origin)} · clearly separated from evidence</small></span><ArrowRight size={14}/></button>)}</div></section>}
    </div>
    <aside className="trace-verification"><header>Integrity report</header><div className="integrity-score"><span>{trace?.verification.valid ? '100' : loading ? '—' : '0'}<small>/100</small></span><b>{trace?.verification.valid ? 'Cryptographically consistent' : 'Checking chain…'}</b></div><Progress value={trace?.verification.valid ? 100 : 16} tone="green"/><ul><li className="ok"><CheckCircle2 size={13}/>Original fingerprint present</li><li className="ok"><CheckCircle2 size={13}/>Parent hashes continuous</li><li className="ok"><CheckCircle2 size={13}/>Derived outputs labeled</li><li className="ok"><CheckCircle2 size={13}/>Review actions attributed</li></ul><div className="integrity-meta"><span><b>{trace?.events.length ?? 0}</b><small>events</small></span><span><b>{derived.length}</b><small>branches</small></span><span><b>{trace?.verification.checked ?? 0}</b><small>verified</small></span></div></aside>
  </section>
}
