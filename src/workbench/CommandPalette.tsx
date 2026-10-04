import { useEffect, useRef, useState } from 'react'
import { Aperture, ArrowDownLeft, ArrowRight, Boxes, FileImage, FileSearch, GitCompareArrows, LoaderCircle, MessageSquareText, Search, Sparkles, X } from 'lucide-react'
import type { SearchHit, SearchResult } from '../../shared/domain'
import { Badge, Dialog, IconButton, Key } from '../components/ui'
import { titleCase } from '../utils/format'
import './panels.css'

const suggestions = ['Evidence needing review', 'Changes since the first capture', 'Accessibility near the curb', 'Transcript mentions of the barrier']
function resultIcon(type: SearchHit['type']) { return { scene: Aperture, asset: FileImage, entity: Boxes, observation: FileSearch, change: GitCompareArrows, transcript_segment: MessageSquareText }[type] }

export function CommandPalette({ open, result, onClose, onSearch, onSelect }: { open: boolean; result?: SearchResult; onClose(): void; onSearch(query: string): Promise<SearchResult>; onSelect(hit: SearchHit): void }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const [searchResult, setSearchResult] = useState<SearchResult>()
  const [error, setError] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef(onSearch)
  searchRef.current = onSearch

  useEffect(() => {
    if (open) { const timer = setTimeout(() => inputRef.current?.focus(), 0); return () => clearTimeout(timer) }
    setQuery(''); setSelected(0); setSearchResult(undefined); setError(undefined)
  }, [open])
  useEffect(() => {
    if (!open || query.trim().length < 2) { setSearchResult(undefined); setLoading(false); return }
    let active = true
    setLoading(true); setError(undefined); setSearchResult(undefined)
    const timer = setTimeout(() => {
      searchRef.current(query.trim()).then(value => { if (active) { setSearchResult(value); setSelected(0) } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Search could not complete.') }).finally(() => { if (active) setLoading(false) })
    }, 220)
    return () => { active = false; clearTimeout(timer) }
  }, [query, open])
  useEffect(() => { document.getElementById(`search-hit-${selected}`)?.scrollIntoView({ block: 'nearest' }) }, [selected])
  if (!open) return null
  const currentResult = searchResult ?? (result?.query.text === query.trim() ? result : undefined)
  const hits = currentResult?.hits ?? []
  function choose(hit: SearchHit) { onSelect(hit); onClose() }

  return <Dialog label="Search evidence" onClose={onClose} className="command-dialog">
    <div className="command-search"><Search size={21}/><input ref={inputRef} value={query} role="combobox" aria-label="Search evidence" aria-expanded={!!hits.length} aria-controls="evidence-search-results" aria-activedescendant={hits[selected] ? `search-hit-${selected}` : undefined} autoComplete="off" onChange={event => { setQuery(event.target.value); setSelected(0) }} placeholder="Search your scene…" onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(value => Math.min(Math.max(0, hits.length - 1), value + 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(value => Math.max(0, value - 1)) }
      if (event.key === 'Enter' && hits[selected]) { event.preventDefault(); choose(hits[selected]) }
    }}/>{loading && <LoaderCircle size={18} className="spin"/>}<IconButton label="Close search" onClick={onClose}><X size={18}/></IconButton></div>
    {!query && <div className="command-suggestions"><header><Sparkles size={14}/><span>Start with a question</span></header>{suggestions.map(item => <button type="button" key={item} onClick={() => setQuery(item)}><span className="suggestion-icon"><ArrowDownLeft size={16}/></span><b>{item}</b><ArrowRight size={16}/></button>)}</div>}
    {query && <div className="command-results"><header aria-live="polite"><span>{loading ? 'Searching…' : error ? 'Search unavailable' : currentResult ? `${currentResult.total} results` : 'Type at least 2 characters'}</span>{currentResult && <small>{currentResult.elapsedMs} ms</small>}</header>{error && <p className="panel-message is-error" role="alert">{error}</p>}<div id="evidence-search-results" role="listbox" aria-label="Search results">{hits.map((hit, index) => { const Icon = resultIcon(hit.type); return <button type="button" role="option" aria-selected={index === selected} id={`search-hit-${index}`} key={hit.id} className={index === selected ? 'selected' : ''} onMouseEnter={() => setSelected(index)} onClick={() => choose(hit)}><span className="result-icon"><Icon size={19}/></span><span className="result-copy"><small>{titleCase(hit.type)}</small><b>{hit.title}</b><p>{hit.excerpt}</p></span>{hit.evidenceAssetIds.length > 0 && <Badge>{hit.evidenceAssetIds.length} sources</Badge>}<ArrowRight size={16}/></button> })}</div>{!loading && currentResult && !hits.length && <div className="command-no-results"><FileSearch size={28}/><b>No matching evidence</b><p>Try an object, condition, or review status.</p></div>}</div>}
    <footer className="command-footer"><span><Key>↑</Key><Key>↓</Key>Navigate</span><span><Key>↵</Key>Open</span><span><Key>esc</Key>Close</span><em>Across all scene evidence</em></footer>
  </Dialog>
}
