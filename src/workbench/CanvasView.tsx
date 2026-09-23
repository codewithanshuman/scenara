import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Box, Check, ChevronLeft, ChevronRight, CircleDot, Crosshair, Eye, Film, Focus, Image as ImageIcon, Layers3, LockKeyhole, Maximize2, MousePointer2, Move3D, Pause, Play, ScanLine, SlidersHorizontal, Sparkles, SplitSquareVertical, Video, Volume2, ZoomIn, ZoomOut } from 'lucide-react'
import type { MediaAsset, Observation } from '../../shared/domain'
import type { SceneWorkspace } from '../api/client'
import { Badge, IconButton } from '../components/ui'
import { confidence, formatClock, formatShortDate, titleCase } from '../utils/format'

function mediaUrl(asset: MediaAsset | undefined): string {
  return asset?.cloudinary?.secureUrl ?? asset?.localUrl ?? asset?.posterUrl ?? ''
}

function observationPosition(observation: Observation): { left: string; top: string } | undefined {
  const region = observation.evidence.find(item => item.region)?.region
  if (!region) return undefined
  return { left: `${(region.x + region.width / 2) * 100}%`, top: `${(region.y + region.height / 2) * 100}%` }
}

function tone(observation: Observation): 'amber' | 'green' | 'red' | 'violet' | 'blue' {
  if (observation.severity === 'critical' || observation.severity === 'high') return 'red'
  if (observation.requiresReview) return 'amber'
  if (observation.lensId === 'environment') return 'green'
  if (observation.lensId === 'accessibility') return 'violet'
  return 'blue'
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
  const chronological = useMemo(() => scene.assets.filter(item => item.kind === 'image' && item.origin === 'original').sort((a,b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)), [scene.assets])
  const before = scene.assets.find(item => item.id === compare.beforeAssetId) ?? chronological[0]
  const after = scene.assets.find(item => item.id === compare.afterAssetId) ?? chronological.at(-1)
  const observations = scene.observations.filter(item => item.lensId === lensId || lensId === 'general').filter(item => item.state !== 'dismissed')
  const [zoom, setZoom] = useState(1)
  const [annotations, setAnnotations] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState(14)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setZoom(1) }, [currentAsset?.id, compare.enabled])
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setFrame(value => value >= 112 ? 0 : value + 1), 1_000)
    return () => clearInterval(timer)
  }, [playing])

  return <section className="canvas-workspace">
    <div className="canvas-stage" ref={stageRef}>
      <div className="canvas-media" style={{ transform: `scale(${zoom})` }}>
        {mediaUrl(compare.enabled ? after : currentAsset)
          ? <img src={mediaUrl(compare.enabled ? after : currentAsset)} alt={currentAsset?.sourceFilename ?? scene.title}/>
          : <div className="media-placeholder"><ImageIcon size={28}/><span>Preview is generated after media processing</span></div>}
        {compare.enabled && before && after && <>
          <div className="compare-before" style={{ width: `${compare.position}%` }}><img src={mediaUrl(before)} alt={before.sourceFilename}/></div>
          <div className="compare-divider" style={{ left: `${compare.position}%` }}><span><ChevronLeft size={13}/><ChevronRight size={13}/></span></div>
          <input aria-label="Before and after position" type="range" min="4" max="96" value={compare.position} onChange={event => onCompare({ position: Number(event.target.value) })}/>
          <span className="compare-label before"><b>{formatShortDate(before.capturedAt)}</b><small>BASELINE · {formatClock(before.capturedAt)}</small></span>
          <span className="compare-label after"><b>{formatShortDate(after.capturedAt)}</b><small>CURRENT · {formatClock(after.capturedAt)}</small></span>
        </>}
        {!compare.enabled && annotations && observations.map((observation, index) => {
          const position = observationPosition(observation)
          if (!position) return null
          const selected = observation.id === selectedObservationId
          const markerTone = tone(observation)
          return <motion.button layout key={observation.id} className={`evidence-marker tone-${markerTone} ${selected ? 'selected' : ''}`} style={position} onClick={() => onSelectObservation(observation.id)} initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * .045 }}>
            <i/><span>{String(index + 1).padStart(2, '0')}</span>
            <AnimatePresence>{selected && <motion.em initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}><b>{observation.label}</b><small>{confidence(observation.confidence)} · {titleCase(observation.state)}</small></motion.em>}</AnimatePresence>
          </motion.button>
        })}
      </div>

      <div className="canvas-source"><Badge tone={currentAsset?.origin === 'original' ? 'blue' : 'violet'}>{currentAsset?.origin === 'original' ? <LockKeyhole size={10}/> : <Sparkles size={10}/>} {currentAsset?.origin?.toUpperCase()}</Badge><span>{currentAsset?.sourceFilename}</span><i/> <span>SHA {currentAsset?.sha256.slice(0,8)}</span></div>
      <div className="canvas-tools">
        <IconButton label="Select"><MousePointer2 size={15}/></IconButton>
        <IconButton label="Focus observation"><Crosshair size={15}/></IconButton>
        <IconButton label="Toggle annotations" className={annotations ? 'active' : ''} onClick={() => setAnnotations(!annotations)}><Layers3 size={15}/></IconButton>
        <span/>
        <IconButton label="Zoom out" onClick={() => setZoom(value => Math.max(1, value - .15))}><ZoomOut size={15}/></IconButton>
        <b>{Math.round(zoom * 100)}%</b>
        <IconButton label="Zoom in" onClick={() => setZoom(value => Math.min(2, value + .15))}><ZoomIn size={15}/></IconButton>
        <IconButton label="Fit view" onClick={() => setZoom(1)}><Maximize2 size={15}/></IconButton>
      </div>
      {!compare.enabled && <div className="canvas-ready"><span/><ScanLine size={12}/>Scene graph synchronized <b>{observations.length} visible anchors</b></div>}
      {compare.enabled && <div className="compare-summary"><SplitSquareVertical size={14}/><span><b>{scene.changes.length} changes between captures</b><small>{scene.changes.filter(item => item.significance === 'meaningful' || item.significance === 'critical').length} meaningful · {scene.changes.filter(item => item.requiresReview).length} require review</small></span></div>}
    </div>

    <div className="filmstrip-panel">
      <div className="filmstrip-head"><span><Film size={13}/>Evidence sequence</span><small>{scene.assets.length} media · {scene.transcripts.length} transcripts</small><div><button>All media</button><button>Originals</button><button>Linked</button></div></div>
      <div className="filmstrip">
        {scene.assets.filter(item => item.origin === 'original').map(asset => <button key={asset.id} className={asset.id === currentAsset?.id ? 'selected' : ''} onClick={() => onSelectAsset(asset.id)}>
          <span className="film-thumb">{asset.kind === 'image' && mediaUrl(asset)
            ? <img src={mediaUrl(asset)} alt=""/>
            : <>{(asset.posterUrl || asset.localUrl || asset.cloudinary?.secureUrl) ? <img src={asset.posterUrl || asset.localUrl || asset.cloudinary?.secureUrl} alt=""/> : <span className="media-empty"><ImageIcon size={15}/></span>}<span className="media-kind">{asset.kind === 'video' ? <Video size={11}/> : <Volume2 size={11}/>}</span></>}</span>
          <span><b>{asset.sourceFilename}</b><small>{formatShortDate(asset.capturedAt)} · {formatClock(asset.capturedAt)}</small></span>
          <em>{asset.observationIds.length}</em>
        </button>)}
      </div>
      {currentAsset?.kind === 'video' && <div className="video-transport"><button onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button><span>{Math.floor(frame/60)}:{String(frame%60).padStart(2,'0')}</span><input type="range" min="0" max="112" value={frame} onChange={event => setFrame(Number(event.target.value))}/><span>1:52</span><button><Volume2 size={14}/></button></div>}
    </div>
  </section>
}
