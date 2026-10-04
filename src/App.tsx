import { useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { AlertTriangle, LoaderCircle, RefreshCcw, ServerOff } from 'lucide-react'
import type { Observation, SearchHit, SceneGraphNode } from '../shared/domain'
import { Button, EmptyState } from './components/ui'
import { useSceneWorkspace, type WorkbenchMode } from './hooks/useSceneWorkspace'
import { BrandMark } from './workbench/BrandMark'
import { Overview } from './workbench/Overview'
import { AppHeader } from './workbench/AppHeader'
import { SceneRail } from './workbench/SceneRail'
import { WorkbenchToolbar } from './workbench/WorkbenchToolbar'
import { CanvasView } from './workbench/CanvasView'
import { GraphView } from './workbench/GraphView'
import { TimelineView } from './workbench/TimelineView'
import { TraceView } from './workbench/TraceView'
import { EvidenceInspector } from './workbench/EvidenceInspector'
import { CommandPalette } from './workbench/CommandPalette'
import { PipelinePanel } from './workbench/PipelinePanel'
import { IngestDialog } from './workbench/IngestDialog'
import { ScenarioDialog } from './workbench/ScenarioDialog'
import { ReviewDesk } from './workbench/ReviewDesk'
import './workbench/workbench.css'

export default function App() {
  const { state, actions, selection } = useSceneWorkspace()
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [inspectorVisible, setInspectorVisible] = useState(true)
  const [overview, setOverview] = useState(true)
  const [reviewMode, setReviewMode] = useState(false)
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string>()

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || state.commandOpen || state.ingestOpen || state.pipelineOpen || state.scenarioOpen) return
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (['1','2','3','4'].includes(event.key)) { setOverview(false); setReviewMode(false) }
    }
    addEventListener('keydown', navigate)
    return () => removeEventListener('keydown', navigate)
  }, [state.commandOpen, state.ingestOpen, state.pipelineOpen, state.scenarioOpen])

  if (state.loading && !state.scene) {
    return <div className="app-loading"><BrandMark/><LoaderCircle className="spin" size={22}/><b>Finding your perspective…</b></div>
  }

  if (state.error && !state.scene) {
    return <div className="app-fatal"><BrandMark/><EmptyState icon={<ServerOff/>} title="We couldn't reach your workspace" description={state.error} action={<Button variant="primary" onClick={actions.bootstrap}><RefreshCcw size={16}/>Try again</Button>}/></div>
  }

  const scene = state.scene!

  function navigate(mode: WorkbenchMode | 'overview') {
    setOverview(mode === 'overview')
    setReviewMode(false)
    if (mode !== 'overview') actions.setMode(mode)
  }

  function selectScene(id: string) {
    setOverview(false)
    setReviewMode(false)
    setSelectedGraphNodeId(undefined)
    actions.setMode('canvas')
    if (id !== state.selectedSceneId) actions.selectScene(id)
  }

  function openReview(observation?: Observation) {
    const finding = observation ?? scene.observations.find(item => item.requiresReview) ?? scene.observations[0]
    setOverview(false)
    setReviewMode(true)
    actions.setLens('general')
    if (finding) actions.selectObservation(finding.id)
    actions.setInspectorTab('review')
    setInspectorVisible(true)
  }

  function selectGraphNode(node: SceneGraphNode) {
    setSelectedGraphNodeId(node.id)
    if (node.type === 'observation') { actions.selectObservation(node.id); setInspectorVisible(true) }
    else if (node.type === 'asset') {
      const related = scene.observations.find(item => item.evidence.some(evidence => evidence.assetId === node.id))
      if (related) actions.selectObservation(related.id)
      actions.selectAsset(node.id); setInspectorVisible(Boolean(related))
    }
    else if (node.type === 'entity') {
      const related = scene.observations.find(item => item.entityId === node.id)
      if (related) actions.selectObservation(related.id)
      actions.selectEntity(node.id); setInspectorVisible(Boolean(related))
    }
    else if (node.type === 'change') {
      const change = scene.changes.find(item => item.id === node.id)
      if (change?.afterObservationId) actions.selectObservation(change.afterObservationId)
      setInspectorVisible(true)
    }
  }

  function selectSearchHit(hit: SearchHit) {
    setOverview(false)
    setSelectedGraphNodeId(hit.id)
    if (hit.type === 'observation') { actions.selectObservation(hit.id); actions.setMode('canvas'); setInspectorVisible(true); return }
    if (hit.type === 'asset') { actions.selectAsset(hit.id); actions.setMode('canvas'); return }
    if (hit.type === 'entity') { actions.selectEntity(hit.id); actions.setMode('graph'); return }
    if (hit.type === 'change') {
      const change = scene.changes.find(item => item.id === hit.id)
      if (change?.afterObservationId) actions.selectObservation(change.afterObservationId)
      actions.setMode('timeline'); return
    }
    if (hit.type === 'transcript_segment') {
      const observationId = (hit.metadata.linkedObservationIds as string[] | undefined)?.[0]
      if (observationId) actions.selectObservation(observationId)
      const assetId = hit.metadata.assetId as string | undefined
      if (assetId) actions.selectAsset(assetId)
      actions.setMode('canvas')
    }
  }

  return <MotionConfig reducedMotion="user"><div className={`scenara-app ${railCollapsed ? 'rail-collapsed' : ''} ${!inspectorVisible ? 'inspector-hidden' : ''} ${overview ? 'is-overview' : ''} ${reviewMode ? 'is-review' : ''}`}>
    <AppHeader scene={scene} health={state.health} overview={overview} section={reviewMode ? 'Review desk' : undefined} onHome={() => { setOverview(true); setReviewMode(false) }} onCommand={() => actions.toggle('commandOpen',true)} onIngest={() => actions.toggle('ingestOpen',true)} onPipeline={() => actions.toggle('pipelineOpen',true)}/>
    <SceneRail scenes={state.scenes} selectedId={state.selectedSceneId} collapsed={railCollapsed} overview={overview} reviewMode={reviewMode} mode={state.mode} onCollapse={() => setRailCollapsed(!railCollapsed)} onSelect={selectScene} onNavigate={navigate} onReview={() => openReview()} onIngest={() => actions.toggle('ingestOpen',true)}/>
    <main className="evidence-workbench" id="main-content">
      {overview ? <Overview scenes={state.scenes} scene={scene} onSelect={selectScene} onOpen={() => navigate('canvas')} onIngest={() => actions.toggle('ingestOpen',true)} onReview={openReview} onGraph={() => navigate('graph')}/> : reviewMode ? <ReviewDesk scene={scene} selectedId={state.selectedObservationId} onSelect={actions.selectObservation} onReview={actions.review} onBack={() => { setOverview(true); setReviewMode(false) }} onOpenCanvas={() => { setReviewMode(false); actions.setMode('canvas'); setInspectorVisible(true) }} onOpenHistory={assetId => { actions.selectAsset(assetId); actions.setMode('trace'); setReviewMode(false); setInspectorVisible(false) }}/> : <>
      <WorkbenchToolbar scene={scene} lensId={state.lensId} mode={state.mode} compare={state.compare.enabled} inspectorVisible={inspectorVisible} onHome={() => setOverview(true)} onInspector={() => setInspectorVisible(true)} onLens={actions.setLens} onMode={actions.setMode} onCompare={() => actions.setCompare({enabled:!state.compare.enabled})} onScenario={() => actions.toggle('scenarioOpen',true)}/>
      {state.error && <div className="soft-error"><AlertTriangle size={13}/><span>{state.error}</span><button onClick={actions.refresh}>Refresh scene</button></div>}
      <div className="workbench-body" aria-busy={state.loading}>
        {state.loading && <div className="workspace-loading"><LoaderCircle className="spin" size={22}/><span>Loading scene…</span></div>}
        <div className="workbench-view">
          {state.mode === 'canvas' && <CanvasView scene={scene} lensId={state.lensId} selectedObservationId={state.selectedObservationId} selectedAssetId={state.selectedAssetId} compare={state.compare} onCompare={actions.setCompare} onSelectObservation={id => { actions.selectObservation(id); setInspectorVisible(true) }} onSelectAsset={actions.selectAsset}/>} 
          {state.mode === 'graph' && state.graph && <GraphView graph={state.graph} selectedNodeId={selectedGraphNodeId ?? state.selectedObservationId ?? state.selectedEntityId ?? state.selectedAssetId} onSelect={selectGraphNode}/>}
          {state.mode === 'timeline' && <TimelineView scene={scene} selectedObservationId={state.selectedObservationId} onSelectObservation={id => { actions.selectObservation(id); setInspectorVisible(true) }}/>} 
          {state.mode === 'trace' && <TraceView scene={scene} selectedAssetId={state.selectedAssetId} onSelectAsset={actions.selectAsset}/>} 
        </div>
        {inspectorVisible && <EvidenceInspector scene={scene} observation={selection.observation} tab={state.inspectorTab} onTab={actions.setInspectorTab} onReview={actions.review} onClose={() => setInspectorVisible(false)}/>} 
      </div>
      </>}
    </main>
    <CommandPalette open={state.commandOpen} result={state.search} onClose={() => actions.toggle('commandOpen',false)} onSearch={actions.search} onSelect={selectSearchHit}/>
    <PipelinePanel open={state.pipelineOpen} health={state.health} jobs={state.jobs} onClose={() => actions.toggle('pipelineOpen',false)}/>
    <IngestDialog open={state.ingestOpen} scene={scene} onClose={() => actions.toggle('ingestOpen',false)} onComplete={actions.refresh}/>
    <ScenarioDialog open={state.scenarioOpen} scene={scene} onClose={() => actions.toggle('scenarioOpen',false)} onCreated={actions.refresh}/>
  </div></MotionConfig>
}
