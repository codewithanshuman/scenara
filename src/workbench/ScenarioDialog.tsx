import { useEffect, useState } from 'react'
import { AlertCircle, ArrowUpRight, Check, Eraser, Fingerprint, Leaf, Paintbrush, Sparkles, Trees, WandSparkles } from 'lucide-react'
import type { SceneWorkspace } from '../api/client'
import { api } from '../api/client'
import { Badge, Button, Dialog, DialogHeader } from '../components/ui'
import './panels.css'

const options = [
  { id: 'remove', title: 'Clear a route', description: 'Remove an obstruction', icon: Eraser, prompt: 'Remove the temporary barrier and cones while preserving all permanent infrastructure.', parameters: { target: 'temporary barrier and traffic cones' } },
  { id: 'replace', title: 'Create shade', description: 'Explore a canopy', icon: Trees, prompt: 'Add a realistic lightweight shade canopy above the sidewalk without changing the curb or building.', parameters: { target: 'open air above the sidewalk', replacement: 'a realistic lightweight shade canopy' } },
  { id: 'fill', title: 'More greenery', description: 'Extend the landscape', icon: Leaf, prompt: 'Expand the planted rain garden within the existing curb zone while preserving accessible circulation.', parameters: { aspectRatio: '16:9', fillPrompt: 'continue the existing streetscape and planted rain garden naturally' } },
  { id: 'recolor', title: 'Refresh a crossing', description: 'Renew road markings', icon: Paintbrush, prompt: 'Restore the existing crosswalk paint to a newly maintained state without changing its geometry.', parameters: { target: 'crosswalk road markings', color: 'E3E9EF' } },
] as const

function editablePrompt(option: typeof options[number]) {
  if (option.id === 'replace') return option.parameters.replacement
  if (option.id === 'fill') return option.parameters.fillPrompt
  return option.parameters.target
}

export function ScenarioDialog({ open, scene, onClose, onCreated }: { open: boolean; scene?: SceneWorkspace; onClose(): void; onCreated(): void }) {
  const [selected, setSelected] = useState<typeof options[number]['id']>('remove')
  const [sourceId, setSourceId] = useState<string>()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string>()
  const [prompt, setPrompt] = useState<string>(editablePrompt(options[0]))
  useEffect(() => { if (open) setError(undefined) }, [open])
  if (!open || !scene) return null
  const activeScene = scene
  const sources = activeScene.assets.filter(item => item.origin === 'original' && item.kind === 'image')
  const source = sources.find(item => item.id === sourceId) ?? sources.find(item => item.id === activeScene.coverAssetId) ?? sources[0]
  const sourceUrl = source?.cloudinary?.secureUrl ?? source?.localUrl ?? source?.posterUrl
  const choice = options.find(item => item.id === selected)!

  async function create() {
    if (!source || !prompt.trim() || working) return
    setWorking(true); setError(undefined)
    try {
      const customized = choice.id === 'replace' ? { replacement: prompt.trim() } : choice.id === 'fill' ? { fillPrompt: prompt.trim() } : { target: prompt.trim() }
      await api.createScenario({ sceneId: activeScene.id, sourceAssetId: source.id, title: choice.title, prompt: `${choice.title}: ${prompt.trim()}`, transformation: choice.id, parameters: { ...choice.parameters, ...customized, preserve_source: true, label_output: 'SIMULATED' } })
      onCreated(); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The scenario could not be created. Please try again.') }
    finally { setWorking(false) }
  }

  return <Dialog label="Create scenario" onClose={onClose} className="scenario-dialog">
    <DialogHeader eyebrow="SCENARIO STUDIO" title="Make room for what’s possible." description="Explore a change, starting with your original capture." onClose={onClose}/>
    <div className="scenario-body"><div className="scenario-source"><div className="scenario-source-preview">{sourceUrl ? <img src={sourceUrl} alt={`Original capture: ${source.sourceFilename}`}/> : <span><Sparkles size={28}/>Add an original image to get started</span>}<Badge>Original</Badge></div><label><span>Source capture</span><select aria-label="Source capture" value={source?.id ?? ''} disabled={working || !sources.length} onChange={event => setSourceId(event.target.value)}>{sources.length ? sources.map(item => <option key={item.id} value={item.id}>{item.sourceFilename}</option>) : <option value="">No original images</option>}</select></label><p><Fingerprint size={15}/>Your source stays preserved.</p></div>
      <div className="scenario-configuration"><div className="scenario-options" role="group" aria-label="Choose a transformation">{options.map(item => <button type="button" key={item.id} disabled={working} className={item.id === selected ? 'selected' : ''} aria-pressed={item.id === selected} onClick={() => { setSelected(item.id); setPrompt(editablePrompt(item)); setError(undefined) }}><span className="scenario-option-icon"><item.icon size={20}/></span><span><b>{item.title}</b><small>{item.description}</small></span><i>{item.id === selected ? <Check size={13}/> : <ArrowUpRight size={13}/>}</i></button>)}</div><label className="scenario-prompt"><span>{choice.id === 'remove' ? 'What should disappear?' : choice.id === 'replace' ? 'Describe the new element' : choice.id === 'fill' ? 'Describe the extension' : 'What should be recolored?'}</span><textarea value={prompt} disabled={working} maxLength={4000} onChange={event => setPrompt(event.target.value)}/></label></div></div>
    {error && <p className="dialog-error panel-message is-error" role="alert"><AlertCircle size={16}/>{error}</p>}
    <footer className="scenario-footer"><span><Sparkles size={15}/>Outputs are labeled “Simulated”.</span><div><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={working} disabled={!source || !prompt.trim()} onClick={create}><WandSparkles size={16}/>Create scenario</Button></div></footer>
  </Dialog>
}
