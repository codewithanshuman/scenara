import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Aperture, Boxes, FileImage, Filter, Focus, GitCompareArrows, MessageSquareText, Minus, Network, Plus, RotateCcw, Search, Sparkles } from 'lucide-react'
import type { SceneGraph, SceneGraphNode } from '../../shared/domain'
import { Badge, IconButton } from '../components/ui'
import { confidence, titleCase } from '../utils/format'
import './views.css'

interface PositionedNode extends SceneGraphNode { x: number; y: number }
const nodeTypes: SceneGraphNode['type'][] = ['asset', 'observation', 'entity', 'change', 'transcript', 'scenario']
const nodeColors: Record<SceneGraphNode['type'], string> = { scene: '#3448C5', asset: '#23436A', entity: '#3448C5', observation: '#0D9AFF', change: '#1B295D', transcript: '#23436A', scenario: '#3448C5' }

function nodeIcon(type: SceneGraphNode['type']) {
  return { scene: Aperture, asset: FileImage, entity: Boxes, observation: Focus, change: GitCompareArrows, transcript: MessageSquareText, scenario: Sparkles }[type]
}

function layoutGraph(graph: SceneGraph): { nodes: PositionedNode[]; height: number } {
  const columns: SceneGraphNode['type'][][] = [['asset', 'transcript'], ['observation'], ['entity'], ['change', 'scenario']]
  const groups = columns.map(types => graph.nodes.filter(node => types.includes(node.type)))
  const height = Math.max(520, ...groups.map(group => group.length * 86 + 176))
  const nodes: PositionedNode[] = graph.nodes.filter(node => node.type === 'scene').map(node => ({ ...node, x: 500, y: 55 }))
  groups.forEach((group, column) => group.forEach((node, index) => nodes.push({ ...node, x: 120 + column * 253, y: 164 + index * 86 + (height - 176 - group.length * 86) / 2 })))
  return { nodes, height }
}

export function GraphView({ graph, selectedNodeId, onSelect }: { graph: SceneGraph; selectedNodeId?: string; onSelect(node: SceneGraphNode): void }) {
  const [scale, setScale] = useState(1)
  const [filters, setFilters] = useState<Set<SceneGraphNode['type']>>(new Set(['scene', ...nodeTypes]))
  const [showLabels, setShowLabels] = useState(true)
  const [showConfidence, setShowConfidence] = useState(true)
  const [strength, setStrength] = useState(0)
  const [query, setQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const visibleGraph = useMemo(() => ({ ...graph, nodes: graph.nodes.filter(node => filters.has(node.type)) }), [graph, filters])
  const { nodes, height } = useMemo(() => layoutGraph(visibleGraph), [visibleGraph])
  const byId = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes])
  const edges = graph.edges.filter(edge => byId.has(edge.source) && byId.has(edge.target) && edge.weight >= strength / 100)
  const selected = byId.get(selectedNodeId ?? '')
  const selectedEdges = edges.filter(edge => edge.source === selectedNodeId || edge.target === selectedNodeId)

  function toggleFilter(type: SceneGraphNode['type']) {
    setFilters(current => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next })
  }

  return <section className="sv-graph">
    <header className="sv-view-heading"><div><span className="sv-icon-tile"><Network size={19}/></span><span><h2>Connected evidence</h2><small>{nodes.length} nodes · {edges.length} relationships</small></span></div><label className="sv-search"><Search size={16}/><input aria-label="Find a graph node" placeholder="Find a node" value={query} onChange={event => setQuery(event.target.value)}/></label><button className={`sv-outline-button ${showFilters ? 'is-active' : ''}`} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><Filter size={16}/>Display</button></header>
    <div className="sv-graph-layers">{nodeTypes.map(type => {
      const Icon = nodeIcon(type)
      return <button key={type} className={filters.has(type) ? 'is-active' : ''} aria-pressed={filters.has(type)} onClick={() => toggleFilter(type)}><Icon size={14}/>{titleCase(type)}<em>{graph.nodes.filter(node => node.type === type).length}</em></button>
    })}</div>
    {showFilters && <motion.div className="sv-graph-settings" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}><label>Edge strength <b>{strength}%</b><input aria-label="Minimum relationship strength" type="range" min="0" max="100" value={strength} onChange={event => setStrength(Number(event.target.value))}/></label><label><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)}/>Labels</label><label><input type="checkbox" checked={showConfidence} onChange={event => setShowConfidence(event.target.checked)}/>Confidence</label></motion.div>}
    <div className="sv-graph-stage">
      <div className="sv-graph-scroll"><svg viewBox={`0 0 1000 ${height}`} role="group" aria-label="Evidence relationship graph" style={{ width: `${scale * 100}%`, minWidth: `${scale * 720}px`, minHeight: `${height * .7}px` }}>
        <defs><marker id="sv-graph-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#3448C5"/></marker></defs>
        <g className="sv-graph-columns">{['Sources', 'Findings', 'Entities', 'Changes'].map((label, index) => <g key={label}><text x={120 + index * 253} y="118" textAnchor="middle">{label}</text><line x1={index * 253 + 5} y1="132" x2={index * 253 + 5} y2={height - 15}/></g>)}</g>
        <g className="sv-graph-edges">{edges.map((edge, index) => {
          const source = byId.get(edge.source)!, target = byId.get(edge.target)!
          const connected = selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId)
          const d = source.type === 'scene' || target.type === 'scene' ? `M ${source.x} ${source.y} Q ${(source.x + target.x) / 2} ${Math.min(source.y, target.y)} ${target.x} ${target.y}` : `M ${source.x} ${source.y} C ${(source.x + target.x) / 2} ${source.y}, ${(source.x + target.x) / 2} ${target.y}, ${target.x} ${target.y}`
          return <path key={`${edge.id}-${index}`} d={d} className={connected ? 'is-connected' : ''} markerEnd={connected ? 'url(#sv-graph-arrow)' : undefined}><title>{titleCase(edge.type)} · {Math.round(edge.weight * 100)}%</title></path>
        })}</g>
        <g className="sv-graph-nodes">{nodes.map((node, index) => {
          const Icon = nodeIcon(node.type), isSelected = node.id === selectedNodeId
          const matched = !query || `${node.label} ${node.subtitle ?? ''}`.toLowerCase().includes(query.toLowerCase())
          return <motion.g key={node.id} className={`sv-graph-node ${isSelected ? 'is-selected' : ''} ${node.type === 'scene' ? 'is-scene' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: matched ? 1 : .2 }} transition={{ delay: Math.min(index * .012, .25) }} transform={`translate(${node.x} ${node.y})`} onClick={() => onSelect(node)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node) } }} role="button" tabIndex={0} aria-label={`${node.label}, ${titleCase(node.type)}`} aria-pressed={isSelected}>
            <rect className="sv-node-card" x="-99" y="-29" width="198" height="58" rx="16"/>
            <rect className="sv-node-icon-bg" x="-87" y="-17" width="34" height="34" rx="10"/>
            <foreignObject x="-79" y="-9" width="18" height="18"><span style={{ color: nodeColors[node.type] }}><Icon size={18}/></span></foreignObject>
            {showLabels && <text className="sv-node-title" x="-42" y={showConfidence && node.confidence !== undefined ? '-3' : '4'}>{node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label}</text>}
            {showConfidence && node.confidence !== undefined && <text className="sv-node-meta" x="-42" y="15">{confidence(node.confidence)} confidence</text>}
            {!showLabels && <text className="sv-node-title" x="-42" y={showConfidence && node.confidence !== undefined ? '-3' : '4'}>{titleCase(node.type)}</text>}
          </motion.g>
        })}</g>
      </svg></div>
      <div className="sv-graph-tools"><IconButton label="Zoom out" onClick={() => setScale(value => Math.max(.7, value - .1))}><Minus size={17}/></IconButton><span>{Math.round(scale * 100)}%</span><IconButton label="Zoom in" onClick={() => setScale(value => Math.min(1.8, value + .1))}><Plus size={17}/></IconButton><i/><IconButton label="Reset view" onClick={() => setScale(1)}><RotateCcw size={16}/></IconButton></div>
    </div>
    {selected && <motion.footer className="sv-graph-selection" key={selected.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}><span className="sv-icon-tile"><Focus size={17}/></span><span><b>{selected.label}</b><small>{selectedEdges.length} connected relationships</small></span><Badge tone="blue">{titleCase(selected.type)}</Badge></motion.footer>}
  </section>
}
