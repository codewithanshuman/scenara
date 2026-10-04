import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Activity, ArrowRight, Braces, Check, ChevronRight, Cloud, Copy, FileCheck2, Fingerprint, GitBranch, Hash, Image, LoaderCircle, LockKeyhole, ScanLine, ServerCog, ShieldCheck, ShieldX, Sparkles, UserCheck, WandSparkles } from 'lucide-react'
import type { ProvenanceEvent } from '../../shared/domain'
import { api, type ProvenanceResponse, type SceneWorkspace } from '../api/client'
import { Badge, EmptyState, IconButton, Skeleton } from '../components/ui'
import { formatDateTime, titleCase, truncate } from '../utils/format'
import './views.css'

function actionIcon(action: ProvenanceEvent['action']) {
  return { captured: Image, uploaded: Cloud, analyzed: ScanLine, transformed: WandSparkles, transcribed: Activity, reviewed: UserCheck, generated: Sparkles, exported: FileCheck2 }[action]
}

export function TraceView({ scene, selectedAssetId, onSelectAsset }: { scene: SceneWorkspace; selectedAssetId?: string; onSelectAsset(id: string): void }) {
  const asset = scene.assets.find(item => item.id === selectedAssetId) ?? scene.assets.find(item => item.origin === 'original') ?? scene.assets[0]
  const [trace, setTrace] = useState<ProvenanceResponse>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  useEffect(() => {
    if (!asset) return
    const controller = new AbortController()
    setLoading(true); setError(undefined); setTrace(undefined); setCopied(false); setCopyError(false)
    api.provenance(asset.id, controller.signal)
      .then(result => { if (!controller.signal.aborted) setTrace(result) })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [asset?.id, asset?.version, asset?.provenanceEventIds.length])

  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), 2500); return () => window.clearTimeout(timer) }, [copied])
  const derived = useMemo(() => scene.assets.filter(item => item.parentAssetId === asset?.id), [scene.assets, asset?.id])
  if (!asset) return <EmptyState icon={<Fingerprint/>} title="No media lineage" description="Add an original capture to see its history."/>

  async function copyFingerprint() {
    try { await navigator.clipboard.writeText(asset.sha256); setCopied(true); setCopyError(false) } catch { setCopyError(true) }
  }

  return <section className="sv-trace">
    <header className="sv-view-heading"><div><span className="sv-icon-tile"><Fingerprint size={20}/></span><span><h2>Every step, accounted for</h2><small>{scene.assets.length} assets with provenance</small></span></div></header>
    <div className="sv-trace-layout">
      <aside className="sv-trace-assets"><header>Media</header>{scene.assets.map(item => <button key={item.id} onClick={() => onSelectAsset(item.id)} className={item.id === asset.id ? 'is-selected' : ''} aria-pressed={item.id === asset.id}><span className="sv-trace-asset-icon">{item.origin === 'original' ? <Image size={17}/> : item.origin === 'generated' ? <Sparkles size={17}/> : <GitBranch size={17}/>}</span><span><b title={item.sourceFilename}>{item.sourceFilename}</b><small>{titleCase(item.origin)} · v{item.version}</small></span><ChevronRight size={14}/></button>)}</aside>

      <main className="sv-trace-main">
        <header className="sv-trace-file"><span className="sv-file-symbol"><FileCheck2 size={25}/></span><div><h3>{asset.sourceFilename}</h3><small>{asset.mimeType}{asset.dimensions.width && asset.dimensions.height ? ` · ${asset.dimensions.width} × ${asset.dimensions.height}` : ''}</small></div></header>
        <div className={`sv-integrity-banner ${trace?.verification.valid === false ? 'is-invalid' : ''}`}>
          {loading ? <LoaderCircle size={21} className="spin"/> : trace?.verification.valid ? <ShieldCheck size={23}/> : <ShieldX size={23}/>}<span><b>{loading ? 'Verifying chain' : trace?.verification.valid ? 'Integrity verified' : error ? 'Verification unavailable' : 'Chain needs attention'}</b><small>{trace ? `${trace.verification.checked} events checked${trace.verification.reason ? ` · ${trace.verification.reason}` : ''}` : loading ? 'Checking recorded event hashes' : error ?? 'Select a capture to verify'}</small></span>{trace?.verification.valid && <Badge tone="blue"><Check size={12}/>Verified</Badge>}
        </div>
        <div className="sv-fingerprint"><Hash size={18}/><span><small>SHA-256</small><code>{asset.sha256}</code>{copyError && <small role="status">Select the fingerprint to copy it manually.</small>}</span><IconButton label={copied ? 'Fingerprint copied' : 'Copy fingerprint'} onClick={() => void copyFingerprint()}>{copied ? <Check size={17}/> : <Copy size={17}/>}</IconButton></div>

        {loading && <div className="sv-trace-loading"><Skeleton/><Skeleton/><Skeleton/></div>}
        {!loading && error && <EmptyState icon={<Fingerprint/>} title="Could not verify trace" description={error}/>}
        {trace && <div className="sv-provenance-chain">{trace.events.map((event, index) => {
          const Icon = actionIcon(event.action)
          return <motion.div className="sv-provenance-event" key={event.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * .04, .3) }}>
            <div className="sv-provenance-axis"><span><Icon size={18}/></span>{index < trace.events.length - 1 && <i/>}</div>
            <article className="sv-event-card"><header><div><b>{titleCase(event.action)}</b><Badge tone="blue">{event.actorType}</Badge></div><time>{formatDateTime(event.occurredAt)}</time></header><p>{event.actorId}</p><dl><div><dt>Input</dt><dd title={event.inputFingerprint}>{truncate(event.inputFingerprint, 22)}</dd></div><div><dt>Output</dt><dd title={event.outputFingerprint}>{truncate(event.outputFingerprint, 22)}</dd></div>{event.providerReference && <div><dt>Provider</dt><dd>{event.providerReference}</dd></div>}</dl><details><summary><Braces size={14}/>Parameters<ChevronRight size={14}/></summary><pre>{JSON.stringify(event.parameters, null, 2)}</pre></details><footer><LockKeyhole size={13}/><code title={event.hash}>{truncate(event.hash, 36)}</code></footer></article>
          </motion.div>
        })}{trace.events.length === 0 && <div className="sv-inline-empty">No events recorded for this asset</div>}</div>}

        {derived.length > 0 && <section className="sv-derived"><header><GitBranch size={17}/><h3>Linked outputs</h3><Badge tone="blue">{derived.length}</Badge></header>{derived.map(item => <button key={item.id} onClick={() => onSelectAsset(item.id)}><span className="sv-icon-tile">{item.origin === 'generated' ? <Sparkles size={17}/> : <ServerCog size={17}/>}</span><span><b>{item.sourceFilename}</b><small>{titleCase(item.origin)}</small></span><ArrowRight size={16}/></button>)}</section>}
      </main>
    </div>
  </section>
}
