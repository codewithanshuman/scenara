import { useEffect, useRef, useState } from 'react'
import { Activity, Aperture, ArrowRight, Boxes, CheckCircle2, CircleDot, Clock3, Command, FileImage, FileSearch, GitCompareArrows, Image, LoaderCircle, MessageSquareText, Network, Search, ShieldAlert, Sparkles, X } from 'lucide-react'
import type { SearchHit, SearchResult } from '../../shared/domain'
import { Badge, Dialog, IconButton, Key } from '../components/ui'
import { confidence, titleCase } from '../utils/format'

const suggestions = [
  'Show evidence that requires human review',
  'What changed between the first and latest capture?',
  'Find accessibility observations near the curb',
  'Jump to transcript moments mentioning the barrier',
]

function resultIcon(type: SearchHit['type']) {
  const icons = { scene: Aperture, asset: FileImage, entity: Boxes, observation: FileSearch, change: GitCompareArrows, transcript_segment: MessageSquareText }
  return icons[type]
}

export function CommandPalette({ open, result, onClose, onSearch, onSelect }: {
  open: boolean
  result?: SearchResult
  onClose(): void
  onSearch(query: string): Promise<SearchResult>
  onSelect(hit: SearchHit): void
}) {
  const [query,setQuery] = useState('')
  const [loading,setLoading] = useState(false)
  const [selected,setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(),0); else { setQuery(''); setSelected(0) } }, [open])
  useEffect(() => {
    if (!open || query.trim().length < 2) return
    const timer = setTimeout(() => { setLoading(true); onSearch(query).finally(() => setLoading(false)) },220)
    return () => clearTimeout(timer)
  },[query,open])
  if (!open) return null
  const hits = result?.hits ?? []

  function choose(hit: SearchHit) { onSelect(hit); onClose() }
  return <Dialog label="Search evidence" onClose={onClose} className="command-dialog">
    <div className="command-search"><Search size={18}/><input ref={inputRef} value={query} onChange={event => {setQuery(event.target.value);setSelected(0)}} placeholder="Ask the scene or search any evidence…" onKeyDown={event => {
      if (event.key==='ArrowDown') { event.preventDefault(); setSelected(value=>Math.min(hits.length-1,value+1)) }
      if (event.key==='ArrowUp') { event.preventDefault(); setSelected(value=>Math.max(0,value-1)) }
      if (event.key==='Enter' && hits[selected]) choose(hits[selected])
    }}/>{loading ? <LoaderCircle size={16} className="spin"/> : <Key>ESC</Key>}
    </div>
    {!query && <div className="command-suggestions"><header><span><Sparkles size={12}/>Ask the evidence graph</span><small>Natural language + structured filters</small></header>{suggestions.map(item=><button key={item} onClick={()=>setQuery(item)}><span><Command size={13}/></span><b>{item}</b><ArrowRight size={13}/></button>)}</div>}
    {query && <div className="command-results">
      <header><span>{loading ? 'Searching scene graph…' : result ? `${result.total} linked results in ${result.elapsedMs} ms` : 'Type to search'}</span>{result && <div>{Object.entries(result.facets.types).map(([key,value])=><Badge key={key}>{titleCase(key)} {value}</Badge>)}</div>}</header>
      {hits.map((hit,index)=>{const Icon=resultIcon(hit.type);return <button key={hit.id} className={index===selected?'selected':''} onMouseEnter={()=>setSelected(index)} onClick={()=>choose(hit)}><span className={`result-icon type-${hit.type}`}><Icon size={15}/></span><span><small>{titleCase(hit.type)} · {hit.matchedFields.join(', ') || 'semantic match'}</small><b>{hit.title}</b><p>{hit.excerpt}</p></span><span className="result-meta"><b>{hit.score.toFixed(1)}</b><small>score</small>{hit.evidenceAssetIds.length>0&&<Badge tone="blue">{hit.evidenceAssetIds.length} source{hit.evidenceAssetIds.length===1?'':'s'}</Badge>}</span><ArrowRight size={14}/></button>})}
      {!loading && result && !hits.length && <div className="command-no-results"><FileSearch size={22}/><b>No evidence matched</b><p>Try a physical entity, condition, date, or review state.</p></div>}
    </div>}
    <footer className="command-footer"><span><Key>↑</Key><Key>↓</Key>Navigate</span><span><Key>↵</Key>Open result</span><span><Key>⌘ K</Key>Toggle</span><em>Searches media, entities, observations, changes, and transcripts</em></footer>
  </Dialog>
}
