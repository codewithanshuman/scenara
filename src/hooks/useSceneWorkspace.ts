import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { LensId, Observation, PipelineJob, SceneGraph, SearchResult } from '../../shared/domain'
import { api, type HealthStatus, type ReviewInput, type SceneSummary, type SceneWorkspace } from '../api/client'

export type WorkbenchMode = 'canvas' | 'graph' | 'timeline' | 'trace'

export interface WorkspaceState {
  health?: HealthStatus
  scenes: SceneSummary[]
  scene?: SceneWorkspace
  graph?: SceneGraph
  jobs: PipelineJob[]
  selectedSceneId: string
  selectedObservationId?: string
  selectedAssetId?: string
  selectedEntityId?: string
  lensId: LensId
  mode: WorkbenchMode
  inspectorTab: 'evidence' | 'review' | 'data'
  compare: { enabled: boolean; beforeAssetId?: string; afterAssetId?: string; position: number }
  search?: SearchResult
  loading: boolean
  error?: string
  commandOpen: boolean
  ingestOpen: boolean
  pipelineOpen: boolean
  scenarioOpen: boolean
  revision: number
}

type WorkspaceAction =
  | { type: 'BOOT_START' }
  | { type: 'BOOT_SUCCESS'; health: HealthStatus; scenes: SceneSummary[]; scene: SceneWorkspace; graph: SceneGraph }
  | { type: 'BOOT_ERROR'; message: string }
  | { type: 'SELECT_SCENE'; sceneId: string }
  | { type: 'SCENE_LOADED'; scene: SceneWorkspace; graph: SceneGraph }
  | { type: 'SELECT_OBSERVATION'; observationId: string; assetId?: string; entityId?: string }
  | { type: 'SELECT_ASSET'; assetId: string }
  | { type: 'SELECT_ENTITY'; entityId: string }
  | { type: 'SET_LENS'; lensId: LensId }
  | { type: 'SET_MODE'; mode: WorkbenchMode }
  | { type: 'SET_INSPECTOR_TAB'; tab: WorkspaceState['inspectorTab'] }
  | { type: 'SET_COMPARE'; patch: Partial<WorkspaceState['compare']> }
  | { type: 'SET_SEARCH'; result?: SearchResult }
  | { type: 'SET_JOBS'; jobs: PipelineJob[] }
  | { type: 'PATCH_OBSERVATION'; observation: Observation }
  | { type: 'TOGGLE_OVERLAY'; overlay: 'commandOpen' | 'ingestOpen' | 'pipelineOpen' | 'scenarioOpen'; value?: boolean }
  | { type: 'CLEAR_ERROR' }

const initialState: WorkspaceState = {
  scenes: [], jobs: [], selectedSceneId: 'scene_north_canal_018', lensId: 'general', mode: 'canvas',
  inspectorTab: 'evidence', compare: { enabled: false, position: 52 }, loading: true,
  commandOpen: false, ingestOpen: false, pipelineOpen: false, scenarioOpen: false, revision: 0,
}

function reducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'BOOT_START': return { ...state, loading: true, error: undefined }
    case 'BOOT_SUCCESS': {
      const initialObservation = action.scene.observations.find(item => item.requiresReview) ?? action.scene.observations[0]
      const initialAsset = action.scene.assets.find(item => item.id === action.scene.coverAssetId) ?? action.scene.assets[0]
      return {
        ...state, loading: false, health: action.health, scenes: action.scenes, scene: action.scene, graph: action.graph,
        selectedSceneId: action.scene.id, selectedObservationId: initialObservation?.id, selectedAssetId: initialAsset?.id,
        selectedEntityId: initialObservation?.entityId, jobs: action.scene.jobs, revision: action.health.revision,
      }
    }
    case 'BOOT_ERROR': return { ...state, loading: false, error: action.message }
    case 'SELECT_SCENE': return { ...state, selectedSceneId: action.sceneId, loading: true, search: undefined }
    case 'SCENE_LOADED': {
      const selectedStillExists = action.scene.observations.some(item => item.id === state.selectedObservationId)
      const selected = selectedStillExists
        ? action.scene.observations.find(item => item.id === state.selectedObservationId)
        : action.scene.observations.find(item => item.requiresReview) ?? action.scene.observations[0]
      return { ...state, scene: action.scene, graph: action.graph, jobs: action.scene.jobs, loading: false,
        selectedObservationId: selected?.id, selectedEntityId: selected?.entityId,
        selectedAssetId: state.selectedAssetId && action.scene.assets.some(item => item.id === state.selectedAssetId)
          ? state.selectedAssetId : action.scene.coverAssetId ?? action.scene.assets[0]?.id }
    }
    case 'SELECT_OBSERVATION': return { ...state, selectedObservationId: action.observationId,
      selectedAssetId: action.assetId ?? state.selectedAssetId, selectedEntityId: action.entityId,
      inspectorTab: 'evidence' }
    case 'SELECT_ASSET': return { ...state, selectedAssetId: action.assetId }
    case 'SELECT_ENTITY': return { ...state, selectedEntityId: action.entityId }
    case 'SET_LENS': return { ...state, lensId: action.lensId }
    case 'SET_MODE': return { ...state, mode: action.mode }
    case 'SET_INSPECTOR_TAB': return { ...state, inspectorTab: action.tab }
    case 'SET_COMPARE': return { ...state, compare: { ...state.compare, ...action.patch } }
    case 'SET_SEARCH': return { ...state, search: action.result }
    case 'SET_JOBS': return { ...state, jobs: action.jobs }
    case 'PATCH_OBSERVATION': return state.scene ? {
      ...state,
      scene: { ...state.scene, observations: state.scene.observations.map(item => item.id === action.observation.id ? action.observation : item),
        reviewCount: state.scene.observations.filter(item => (item.id === action.observation.id ? action.observation : item).requiresReview).length },
    } : state
    case 'TOGGLE_OVERLAY': return { ...state, [action.overlay]: action.value ?? !state[action.overlay] }
    case 'CLEAR_ERROR': return { ...state, error: undefined }
    default: return state
  }
}

export function useSceneWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const sceneRequest = useRef<AbortController | undefined>(undefined)

  const loadScene = useCallback(async (sceneId: string) => {
    sceneRequest.current?.abort()
    const controller = new AbortController()
    sceneRequest.current = controller
    try {
      const [scene, graph] = await Promise.all([api.scene(sceneId, controller.signal), api.graph(sceneId, { signal: controller.signal })])
      if (!controller.signal.aborted) dispatch({ type: 'SCENE_LOADED', scene, graph })
    } catch (error) {
      if (!controller.signal.aborted) dispatch({ type: 'BOOT_ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [])

  const bootstrap = useCallback(async () => {
    dispatch({ type: 'BOOT_START' })
    try {
      const [health, scenes] = await Promise.all([api.health(), api.scenes()])
      const selected = scenes.find(item => item.id === state.selectedSceneId) ?? scenes[0]
      if (!selected) throw new Error('No scenes are available')
      const [scene, graph] = await Promise.all([api.scene(selected.id), api.graph(selected.id)])
      dispatch({ type: 'BOOT_SUCCESS', health, scenes, scene, graph })
    } catch (error) {
      dispatch({ type: 'BOOT_ERROR', message: error instanceof Error ? error.message : String(error) })
    }
  }, [state.selectedSceneId])

  useEffect(() => { void bootstrap(); return () => sceneRequest.current?.abort() }, []) // bootstrap once

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); dispatch({ type: 'TOGGLE_OVERLAY', overlay: 'commandOpen', value: true }) }
      if (event.key === 'Escape') {
        for (const overlay of ['commandOpen', 'ingestOpen', 'pipelineOpen', 'scenarioOpen'] as const) dispatch({ type: 'TOGGLE_OVERLAY', overlay, value: false })
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !isEditable(event.target)) {
        if (event.key === '1') dispatch({ type: 'SET_MODE', mode: 'canvas' })
        if (event.key === '2') dispatch({ type: 'SET_MODE', mode: 'graph' })
        if (event.key === '3') dispatch({ type: 'SET_MODE', mode: 'timeline' })
        if (event.key === '4') dispatch({ type: 'SET_MODE', mode: 'trace' })
      }
    }
    addEventListener('keydown', listener)
    return () => removeEventListener('keydown', listener)
  }, [])

  useEffect(() => {
    if (!state.jobs.some(item => item.status === 'queued' || item.status === 'running')) return
    const timer = setInterval(async () => {
      const jobs = await api.jobs(state.selectedSceneId).catch(() => state.jobs)
      dispatch({ type: 'SET_JOBS', jobs })
      if (jobs.some(item => item.status === 'succeeded' && !state.jobs.some(old => old.id === item.id && old.status === 'succeeded'))) {
        void loadScene(state.selectedSceneId)
      }
    }, 1_500)
    return () => clearInterval(timer)
  }, [state.jobs, state.selectedSceneId, loadScene])

  const actions = useMemo(() => ({
    selectScene(sceneId: string) { dispatch({ type: 'SELECT_SCENE', sceneId }); void loadScene(sceneId) },
    selectObservation(observationId: string) {
      const observation = state.scene?.observations.find(item => item.id === observationId)
      dispatch({ type: 'SELECT_OBSERVATION', observationId, assetId: observation?.evidence[0]?.assetId, entityId: observation?.entityId })
    },
    selectAsset(assetId: string) { dispatch({ type: 'SELECT_ASSET', assetId }) },
    selectEntity(entityId: string) { dispatch({ type: 'SELECT_ENTITY', entityId }) },
    setLens(lensId: LensId) { dispatch({ type: 'SET_LENS', lensId }) },
    setMode(mode: WorkbenchMode) { dispatch({ type: 'SET_MODE', mode }) },
    setInspectorTab(tab: WorkspaceState['inspectorTab']) { dispatch({ type: 'SET_INSPECTOR_TAB', tab }) },
    setCompare(patch: Partial<WorkspaceState['compare']>) { dispatch({ type: 'SET_COMPARE', patch }) },
    toggle(overlay: 'commandOpen' | 'ingestOpen' | 'pipelineOpen' | 'scenarioOpen', value?: boolean) { dispatch({ type: 'TOGGLE_OVERLAY', overlay, value }) },
    async search(text: string) {
      const result = await api.search({ text, sceneIds: [state.selectedSceneId], limit: 40 })
      dispatch({ type: 'SET_SEARCH', result }); return result
    },
    clearSearch() { dispatch({ type: 'SET_SEARCH', result: undefined }) },
    async review(observationId: string, input: ReviewInput) {
      const result = await api.review(observationId, input)
      dispatch({ type: 'PATCH_OBSERVATION', observation: result.observation })
      return result
    },
    async analyze(assetId: string, lensId: LensId, force = false) {
      const result = await api.analyze({ assetId, lensId, force })
      dispatch({ type: 'SET_JOBS', jobs: [result.job, ...state.jobs.filter(item => item.id !== result.job.id)] })
      return result
    },
    refresh() { return loadScene(state.selectedSceneId) },
    bootstrap,
  }), [state.scene, state.selectedSceneId, state.jobs, loadScene, bootstrap])

  const selection = useMemo(() => ({
    observation: state.scene?.observations.find(item => item.id === state.selectedObservationId),
    asset: state.scene?.assets.find(item => item.id === state.selectedAssetId),
    entity: state.scene?.entities.find(item => item.id === state.selectedEntityId),
  }), [state.scene, state.selectedObservationId, state.selectedAssetId, state.selectedEntityId])

  return { state, actions, selection }
}

function isEditable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'))
}
