import { useState } from 'react'
import { AlertTriangle, Database, LoaderCircle, RefreshCcw, ServerOff } from 'lucide-react'
import type { SearchHit, SceneGraphNode } from '../shared/domain'
import { Button, EmptyState } from './components/ui'
import { useSceneWorkspace } from './hooks/useSceneWorkspace'
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
import './workbench/workbench.css'

export default function App() {
  const { state, actions, selection } = useSceneWorkspace()
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [inspectorVisible, setInspectorVisible] = useState(true)

  if (state.loading && !state.scene) {
    return <div className="app-loading"><span className="loading-mark"><i/><i/><i/></span><LoaderCircle className="spin" size={20}/><b>Building the evidence workspace</b><small>Loading persisted scene graph, media lineage, and review state…</small></div>
  }

  if (state.error && !state.scene) {
    return <div className="app-fatal"><EmptyState icon={<ServerOff/>} title="Scenara API is unavailable" description={state.error} action={<Button variant="primary" onClick={actions.bootstrap}><RefreshCcw size={14}/>Retry connection</Button>}/><p>Start the backend with <code>pnpm api</code> and the web client with <code>pnpm dev</code>.</p></div>
  }

  const scene = state.scene!

  function selectGraphNode(node: SceneGraphNode) {
    if (node.type === 'observation') { actions.selectObservation(node.id); setInspectorVisible(true) }
    else if (node.type === 'asset') { actions.selectAsset(node.id); setInspectorVisible(true) }
    else if (node.type === 'entity') { actions.selectEntity(node.id); setInspectorVisible(true) }
    else if (node.type === 'change') {
      const change = scene.changes.find(item => item.id === node.id)
      if (change?.afterObservationId) actions.selectObservation(change.afterObservationId)
      setInspectorVisible(true)
    }
  }

  function selectSearchHit(hit: SearchHit) {
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

  return <div className={`scenara-app ${railCollapsed ? 'rail-collapsed' : ''} ${!inspectorVisible ? 'inspector-hidden' : ''}`}>
    <AppHeader scene={scene} health={state.health} onCommand={() => actions.toggle('commandOpen',true)} onIngest={() => actions.toggle('ingestOpen',true)} onPipeline={() => actions.toggle('pipelineOpen',true)}/>
    <SceneRail scenes={state.scenes} selectedId={state.selectedSceneId} collapsed={railCollapsed} onCollapse={() => setRailCollapsed(!railCollapsed)} onSelect={actions.selectScene} onNewScene={() => actions.toggle('ingestOpen',true)}/>
    <main className="evidence-workbench">
      <WorkbenchToolbar scene={scene} lensId={state.lensId} mode={state.mode} compare={state.compare.enabled} onLens={actions.setLens} onMode={actions.setMode} onCompare={() => actions.setCompare({enabled:!state.compare.enabled})} onScenario={() => actions.toggle('scenarioOpen',true)}/>
      {state.error && <div className="soft-error"><AlertTriangle size={13}/><span>{state.error}</span><button onClick={actions.refresh}>Refresh scene</button></div>}
      <div className="workbench-body">
        <div className="workbench-view">
          {state.mode === 'canvas' && <CanvasView scene={scene} lensId={state.lensId} selectedObservationId={state.selectedObservationId} selectedAssetId={state.selectedAssetId} compare={state.compare} onCompare={actions.setCompare} onSelectObservation={id => { actions.selectObservation(id); setInspectorVisible(true) }} onSelectAsset={actions.selectAsset}/>} 
          {state.mode === 'graph' && state.graph && <GraphView graph={state.graph} selectedNodeId={state.selectedObservationId ?? state.selectedEntityId ?? state.selectedAssetId} onSelect={selectGraphNode}/>} 
          {state.mode === 'timeline' && <TimelineView scene={scene} selectedObservationId={state.selectedObservationId} onSelectObservation={id => { actions.selectObservation(id); setInspectorVisible(true) }}/>} 
          {state.mode === 'trace' && <TraceView scene={scene} selectedAssetId={state.selectedAssetId} onSelectAsset={actions.selectAsset}/>} 
        </div>
        {inspectorVisible && <EvidenceInspector scene={scene} observation={selection.observation} tab={state.inspectorTab} onTab={actions.setInspectorTab} onReview={actions.review} onClose={() => setInspectorVisible(false)}/>} 
      </div>
    </main>
    <CommandPalette open={state.commandOpen} result={state.search} onClose={() => actions.toggle('commandOpen',false)} onSearch={actions.search} onSelect={selectSearchHit}/>
    <PipelinePanel open={state.pipelineOpen} health={state.health} jobs={state.jobs} onClose={() => actions.toggle('pipelineOpen',false)}/>
    <IngestDialog open={state.ingestOpen} scene={scene} onClose={() => actions.toggle('ingestOpen',false)} onComplete={actions.refresh}/>
    <ScenarioDialog open={state.scenarioOpen} scene={scene} onClose={() => actions.toggle('scenarioOpen',false)} onCreated={actions.refresh}/>
  </div>
}
