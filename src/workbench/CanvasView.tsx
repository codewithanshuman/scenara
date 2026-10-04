import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Film, Image as ImageIcon, Layers3, LockKeyhole, Maximize2, Pause, Play, ScanLine, Sparkles, SplitSquareVertical, Video, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react'
import type { MediaAsset, Observation } from '../../shared/domain'
import type { SceneWorkspace } from '../api/client'
import { Badge, IconButton } from '../components/ui'
import { confidence, formatClock, formatShortDate, titleCase } from '../utils/format'
import './views.css'

function mediaUrl(asset: MediaAsset | undefined): string {
  return asset?.cloudinary?.secureUrl ?? asset?.localUrl ?? asset?.posterUrl ?? ''
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function CanvasView({ scene, lensId, selectedObservationId, selectedAssetId, compare, onCompare, onSelectObservation, onSelectAsset }: {
  scene: SceneWorkspace
  lensId: Observation['lensId']
  selectedObservationId?: string
  selectedAssetId?: string
  compare: { enabled: boolean; beforeAssetId?: string; afterAssetId?: string; position: number }
  onCompare(patch: Partial<typeof compare>): void
  onSelectObservation(id: string): void
  onSelectAsset(id: string): void
}) {
  const currentAsset = scene.assets.find(item => item.id === selectedAssetId) ?? scene.assets.find(item => item.id === scene.coverAssetId) ?? scene.assets[0]
  const chronological = useMemo(() => scene.assets.filter(item => item.kind === 'image' && item.origin === 'original').sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)), [scene.assets])
  const before = scene.assets.find(item => item.id === compare.beforeAssetId) ?? chronological[0]
  const after = scene.assets.find(item => item.id === compare.afterAssetId) ?? chronological.at(-1)
  const displayAsset = compare.enabled ? after : currentAsset
  const observations = scene.observations.filter(item => (item.lensId === lensId || lensId === 'general') && item.state !== 'dismissed' && item.evidence.some(evidence => evidence.assetId === currentAsset?.id))
  const [zoom, setZoom] = useState(1)
  const [annotations, setAnnotations] = useState(true)
  const [mediaFilter, setMediaFilter] = useState<'all' | 'original' | 'linked'>('all')
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [mediaError, setMediaError] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const visibleAssets = scene.assets.filter(item => mediaFilter === 'all' || (mediaFilter === 'original' ? item.origin === 'original' : item.origin !== 'original'))

  useEffect(() => {
    setZoom(1); setPlaying(false); setCurrentTime(0); setDuration(currentAsset?.dimensions.durationSeconds ?? 0); setImageSize({ width: 0, height: 0 }); setMediaError(false)
  }, [currentAsset?.id, compare.enabled, displayAsset?.id])
  useEffect(() => {
    if (!stageRef.current) return
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(stageRef.current)
    return () => observer.disconnect()
  }, [])

  const sourceWidth = imageSize.width || displayAsset?.dimensions.width || 16
  const sourceHeight = imageSize.height || displayAsset?.dimensions.height || 9
  const fitScale = Math.min(stageSize.width / sourceWidth, stageSize.height / sourceHeight)
  const fitted = fitScale > 0 ? { width: sourceWidth * fitScale, height: sourceHeight * fitScale } : { width: '100%', height: '100%' }
  const isPlayable = !compare.enabled && (currentAsset?.kind === 'video' || currentAsset?.kind === 'audio')

  async function togglePlayback() {
    const player = playerRef.current
    if (!player) return
    if (player.paused) {
      try { await player.play() } catch { setMediaError(true) }
    } else player.pause()
  }

  return <section className="sv-canvas">
    <header className="sv-canvas-heading">
      <div className="sv-file-label"><span className="sv-icon-tile"><ImageIcon size={17}/></span><span><b>{compare.enabled ? 'Capture comparison' : currentAsset?.sourceFilename ?? 'Evidence canvas'}</b><small>{formatShortDate(displayAsset?.capturedAt ?? scene.captureStart)} · {observations.length} findings</small></span></div>
      <Badge tone="blue">{displayAsset?.origin === 'original' ? <LockKeyhole size={12}/> : <Sparkles size={12}/>} {titleCase(displayAsset?.origin ?? 'Evidence')}</Badge>
    </header>

    {compare.enabled && <div className="sv-compare-selectors">
      <label>Before<select aria-label="Before capture" value={before?.id ?? ''} onChange={event => onCompare({ beforeAssetId: event.target.value })}>{chronological.map(item => <option key={item.id} value={item.id}>{formatShortDate(item.capturedAt)} · {item.sourceFilename}</option>)}</select></label>
      <SplitSquareVertical size={17}/>
      <label>After<select aria-label="After capture" value={after?.id ?? ''} onChange={event => onCompare({ afterAssetId: event.target.value })}>{chronological.map(item => <option key={item.id} value={item.id}>{formatShortDate(item.capturedAt)} · {item.sourceFilename}</option>)}</select></label>
    </div>}

    <div className="sv-stage" ref={stageRef}>
      <div className="sv-media" style={{ ...fitted, transform: `scale(${zoom})` }}>
        {mediaError || !mediaUrl(displayAsset) ? <div className="sv-media-empty"><ImageIcon size={34}/><b>{mediaError ? 'Preview unavailable' : 'Preparing your preview'}</b><small>{displayAsset?.sourceFilename}</small></div>
          : displayAsset?.kind === 'video' && !compare.enabled ? <video key={displayAsset.id} ref={playerRef} src={mediaUrl(displayAsset)} poster={displayAsset.posterUrl} muted={muted} playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)} onLoadedMetadata={event => { setDuration(event.currentTarget.duration); setImageSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight }) }} onError={() => setMediaError(true)}/>
          : displayAsset?.kind === 'audio' && !compare.enabled ? <div className="sv-audio-preview"><Volume2 size={42}/><b>{displayAsset.sourceFilename}</b><div className={`sv-waveform ${playing ? 'is-playing' : ''}`}>{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ height: `${18 + Math.abs(Math.sin(index * 1.3)) * 42}px`, animationDelay: `${index * .04}s` }}/>)}</div><audio key={displayAsset.id} ref={playerRef} src={mediaUrl(displayAsset)} muted={muted} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onError={() => setMediaError(true)}/></div>
          : <img src={mediaUrl(displayAsset)} alt={displayAsset?.sourceFilename ?? scene.title} onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setMediaError(true)}/>}

        {compare.enabled && before && after && <>
          <div className="sv-compare-before" style={{ clipPath: `inset(0 ${100 - compare.position}% 0 0)` }}><img src={mediaUrl(before)} alt={before.sourceFilename}/></div>
          <div className="sv-compare-divider" style={{ left: `${compare.position}%` }}><span><ChevronLeft size={16}/><ChevronRight size={16}/></span></div>
          <input className="sv-compare-range" aria-label="Before and after position" type="range" min="4" max="96" value={compare.position} onChange={event => onCompare({ position: Number(event.target.value) })}/>
          <span className="sv-compare-label is-before">Before</span><span className="sv-compare-label is-after">After</span>
        </>}

        {!compare.enabled && annotations && observations.map((observation, index) => {
          const region = observation.evidence.find(item => item.assetId === currentAsset?.id && item.region)?.region
          if (!region) return null
          const selected = observation.id === selectedObservationId
          return <motion.button key={observation.id} className={`sv-anchor ${selected ? 'is-selected' : ''}`} aria-label={`${observation.label}, ${confidence(observation.confidence)} confidence`} aria-pressed={selected} style={{ left: `${(region.x + region.width / 2) * 100}%`, top: `${(region.y + region.height / 2) * 100}%` }} onClick={() => onSelectObservation(observation.id)} initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * .04 }}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <AnimatePresence>{selected && <motion.em className={region.x > .6 ? 'open-left' : ''} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}><b>{observation.label}</b><small>{confidence(observation.confidence)} · {titleCase(observation.state)}</small></motion.em>}</AnimatePresence>
          </motion.button>
        })}
      </div>
      <div className="sv-stage-tools">
        <IconButton label="Toggle annotations" aria-pressed={annotations} className={annotations ? 'active' : ''} onClick={() => setAnnotations(!annotations)}><Layers3 size={17}/></IconButton>
        <i/>
        <IconButton label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .15))}><ZoomOut size={17}/></IconButton>
        <span>{Math.round(zoom * 100)}%</span>
        <IconButton label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .15))}><ZoomIn size={17}/></IconButton>
        <IconButton label="Fit view" onClick={() => setZoom(1)}><Maximize2 size={17}/></IconButton>
      </div>
      <div className="sv-stage-status">{compare.enabled ? <><SplitSquareVertical size={14}/>{scene.changes.length} changes</> : <><ScanLine size={14}/>{observations.length} anchors</>}</div>
    </div>

    {isPlayable && <div className="sv-player"><IconButton label={playing ? 'Pause' : 'Play'} onClick={() => void togglePlayback()}>{playing ? <Pause size={17}/> : <Play size={17}/>}</IconButton><time>{clock(currentTime)}</time><input aria-label="Playback position" type="range" min="0" max={duration || 1} step="0.1" value={currentTime} onChange={event => { const value = Number(event.target.value); if (playerRef.current) playerRef.current.currentTime = value; setCurrentTime(value) }}/><time>{clock(duration)}</time><IconButton label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</IconButton></div>}

    <div className="sv-filmstrip-panel">
      <header><span><Film size={15}/>Captures <em>{scene.assets.length}</em></span><div className="sv-filter-tabs" aria-label="Media filter">{(['all', 'original', 'linked'] as const).map(filter => <button key={filter} className={mediaFilter === filter ? 'is-active' : ''} aria-pressed={mediaFilter === filter} onClick={() => setMediaFilter(filter)}>{filter === 'all' ? 'All' : filter === 'original' ? 'Originals' : 'Linked'}</button>)}</div></header>
      <div className="sv-filmstrip">{visibleAssets.map(asset => <button key={asset.id} className={asset.id === currentAsset?.id ? 'is-selected' : ''} aria-pressed={asset.id === currentAsset?.id} onClick={() => onSelectAsset(asset.id)}>
        <span className="sv-thumb">{asset.kind === 'image' && mediaUrl(asset) ? <img src={mediaUrl(asset)} alt=""/> : asset.posterUrl ? <img src={asset.posterUrl} alt=""/> : asset.kind === 'video' ? <Video size={22}/> : <Volume2 size={22}/>}<em>{asset.observationIds.length}</em></span>
        <span><b title={asset.sourceFilename}>{asset.sourceFilename}</b><small>{formatShortDate(asset.capturedAt)} · {formatClock(asset.capturedAt)}</small></span>
      </button>)}{visibleAssets.length === 0 && <div className="sv-inline-empty">No linked captures yet</div>}</div>
    </div>
  </section>
}
