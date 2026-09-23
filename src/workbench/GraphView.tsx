import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Activity, Aperture, ArrowRight, Boxes, ChevronDown, CircleDot, FileImage, Filter, Focus, GitCompareArrows, Image, Layers3, LocateFixed, Maximize2, MessageSquareText, Minus, Network, Plus, RotateCcw, Search, SlidersHorizontal, Sparkles, Waypoints } from 'lucide-react'
import type { SceneGraph, SceneGraphEdge, SceneGraphNode } from '../../shared/domain'
import { Badge, IconButton } from '../components/ui'
import { confidence, titleCase } from '../utils/format'

interface PositionedNode extends SceneGraphNode { x: number; y: number; radius: number }

function nodeIcon(type: SceneGraphNode['type']) {
  const icons = { scene: Aperture, asset: FileImage, entity: Boxes, observation: Focus, change: GitCompareArrows, transcript: MessageSquareText, scenario: Sparkles }
  return icons[type]
}

function nodeTone(node: SceneGraphNode): string {
  if (node.type === 'scene') return '#68e0ff'
  if (node.type === 'asset') return '#6ea8ff'
  if (node.type === 'entity') return '#9c87ff'
  if (node.type === 'change') return node.state === 'critical' ? '#ff6f7d' : '#ffbd66'
  if (node.type === 'transcript') return '#67d4a0'
  if (node.type === 'scenario') return '#d090ff'
  return node.state === 'review' ? '#ffbd66' : '#aab2c0'
}

function layoutGraph(graph: SceneGraph, width: number, height: number): PositionedNode[] {
  const center = graph.nodes.find(node => node.type === 'scene') ?? graph.nodes[0]
  const groups = new Map<SceneGraphNode['type'], SceneGraphNode[]>()
  for (const node of graph.nodes.filter(node => node.id !== center?.id)) {
    groups.set(node.type, [...(groups.get(node.type) ?? []), node])
  }
  const ringFor: Record<SceneGraphNode['type'], number> = { scene: 0, entity: .27, observation: .46, change: .62, asset: .78, transcript: .86, scenario: .72 }
  const positioned: PositionedNode[] = []
  if (center) positioned.push({ ...center, x: width/2, y: height/2, radius: 34 })
  for (const [type, nodes] of groups) {
    const radius = Math.min(width, height) * ringFor[type]
    const offset = type === 'asset' ? .3 : type === 'observation' ? -.5 : type === 'change' ? 1.2 : 0
    nodes.forEach((node, index) => {
      const angle = offset + Math.PI * 2 * index / Math.max(1, nodes.length)
      positioned.push({ ...node, x: width/2 + Math.cos(angle) * radius, y: height/2 + Math.sin(angle) * radius * .58, radius: type === 'entity' ? 24 : type === 'asset' ? 19 : 16 })
    })
  }
  return positioned
}

function edgePath(source: PositionedNode, target: PositionedNode): string {
  const mx = (source.x + target.x) / 2
  const my = (source.y + target.y) / 2 - Math.min(35, Math.abs(source.x - target.x) * .08)
  return `M ${source.x} ${source.y} Q ${mx} ${my} ${target.x} ${target.y}`
}

export function GraphView({ graph, selectedNodeId, onSelect }: { graph: SceneGraph; selectedNodeId?: string; onSelect(node: SceneGraphNode): void }) {
  const [scale, setScale] = useState(1)
  const [filters, setFilters] = useState<Set<SceneGraphNode['type']>>(new Set(['scene','asset','entity','observation','change','transcript','scenario']))
  const [showLabels, setShowLabels] = useState(true)
  const width = 1000, height = 610
  const visibleGraph = useMemo(() => ({ ...graph, nodes: graph.nodes.filter(node => filters.has(node.type)), edges: graph.edges }), [graph, filters])
  const nodes = useMemo(() => layoutGraph(visibleGraph, width, height), [visibleGraph])
  const byId = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes])
  const edges = visibleGraph.edges.filter(edge => byId.has(edge.source) && byId.has(edge.target))

  function toggleFilter(type: SceneGraphNode['type']) {
    setFilters(current => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next })
  }

  return <section className="graph-workspace">
    <div className="graph-sidebar">
      <div className="graph-sidebar-head"><span><Filter size={13}/>Graph layers</span><Badge tone="blue">{nodes.length} nodes</Badge></div>
      {(['entity','observation','asset','change','transcript','scenario'] as SceneGraphNode['type'][]).map(type => {
        const Icon = nodeIcon(type)
        const count = graph.nodes.filter(node => node.type === type).length
        return <button className={filters.has(type) ? 'active' : ''} key={type} onClick={() => toggleFilter(type)}><span style={{ color: nodeTone({ type } as SceneGraphNode) }}><Icon size={14}/></span><b>{titleCase(type)}</b><em>{count}</em><i/></button>
      })}
      <div className="graph-sidebar-section"><span>Relationship strength</span><label><input type="range" min="0" max="100" defaultValue="32"/><small>Show edges ≥ 0.32</small></label></div>
      <div className="graph-sidebar-section"><span>Display</span><label className="check-row"><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)}/><i/><small>Node labels</small></label><label className="check-row"><input type="checkbox" defaultChecked/><i/><small>Confidence halos</small></label><label className="check-row"><input type="checkbox" defaultChecked/><i/><small>Change direction</small></label></div>
    </div>
    <div className="graph-canvas">
      <div className="graph-grid"/>
      <svg viewBox={`0 0 ${width} ${height}`} aria-label="Evidence relationship graph" style={{ transform: `scale(${scale})` }}>
        <defs><filter id="graphGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#47505d"/></marker></defs>
        <g className="graph-edges">{edges.map((edge,index) => {
          const source = byId.get(edge.source)!, target = byId.get(edge.target)!
          const connected = selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId)
          return <path key={`${edge.id}-${edge.source}-${edge.target}-${index}`} d={edgePath(source,target)} className={connected ? 'connected' : ''} data-type={edge.type} markerEnd={['supports','changes','derived_from','mentions'].includes(edge.type) ? 'url(#arrow)' : undefined}/>
        })}</g>
        <g className="graph-nodes">{nodes.map(node => {
          const Icon = nodeIcon(node.type), selected = node.id === selectedNodeId, fill = nodeTone(node)
          return <g key={node.id} className={`graph-node type-${node.type} ${selected ? 'selected' : ''}`} transform={`translate(${node.x} ${node.y})`} onClick={() => onSelect(node)} role="button" tabIndex={0}>
            {node.confidence !== undefined && <circle className="confidence-halo" r={node.radius + 7} strokeDasharray={`${node.confidence * 100} 100`} pathLength="100"/>}
            <circle className="node-disc" r={node.radius} fill={`${fill}1a`} stroke={fill}/>
            <foreignObject x={-node.radius/2} y={-node.radius/2} width={node.radius} height={node.radius}><span style={{ color: fill }}><Icon size={Math.max(13,node.radius*.65)}/></span></foreignObject>
            {showLabels && <g className="node-label" transform={`translate(0 ${node.radius + 13})`}><rect x={-Math.min(74,node.label.length*4.2)} y={-9} width={Math.min(148,node.label.length*8.4)} height={18} rx="5"/><text textAnchor="middle" dominantBaseline="middle">{node.label.slice(0,30)}</text></g>}
          </g>
        })}</g>
      </svg>
      <div className="graph-tools"><IconButton label="Zoom in" onClick={() => setScale(value => Math.min(1.6,value+.1))}><Plus size={14}/></IconButton><IconButton label="Zoom out" onClick={() => setScale(value => Math.max(.7,value-.1))}><Minus size={14}/></IconButton><IconButton label="Reset view" onClick={() => setScale(1)}><RotateCcw size={14}/></IconButton><span/><IconButton label="Fit selection"><LocateFixed size={14}/></IconButton><IconButton label="Fullscreen"><Maximize2 size={14}/></IconButton></div>
      <div className="graph-legend"><span><i className="entity"/>Entity</span><span><i className="observation"/>Observation</span><span><i className="asset"/>Media</span><span><i className="change"/>Change</span><span><i className="transcript"/>Transcript</span></div>
      <div className="graph-status"><span/>Graph built from persisted evidence <b>{edges.length} verified relationships</b></div>
    </div>
  </section>
}
