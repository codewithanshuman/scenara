import { useState } from 'react'
import { Accessibility, ArrowRight, Boxes, Check, Cloud, Eraser, Image, Leaf, LoaderCircle, LockKeyhole, Paintbrush, ShieldCheck, Sparkles, Trees, WandSparkles } from 'lucide-react'
import type { SceneWorkspace } from '../api/client'
import { api } from '../api/client'
import { Badge, Button, Dialog, DialogHeader } from '../components/ui'

const options=[
  {id:'remove',title:'Remove obstruction',description:'Visualize a clear pedestrian route',icon:Eraser,prompt:'Remove the temporary orange barrier and cones while preserving all permanent infrastructure.',parameters:{target:'temporary orange barrier and traffic cones'}},
  {id:'replace',title:'Add shade canopy',description:'Study a lightweight shade intervention',icon:Trees,prompt:'Add a realistic lightweight shade canopy above the sidewalk without changing the curb or building.',parameters:{target:'open air above the sidewalk',replacement:'a realistic lightweight shade canopy'}},
  {id:'fill',title:'Expand rain garden',description:'Explore additional planted capacity',icon:Leaf,prompt:'Expand the planted rain garden within the existing curb zone while preserving accessible circulation.',parameters:{aspectRatio:'16:9',fillPrompt:'continue the existing streetscape and planted rain garden naturally'}},
  {id:'recolor',title:'Refresh crossing',description:'Visualize renewed road markings',icon:Paintbrush,prompt:'Restore the existing crosswalk paint to a newly maintained state without changing its geometry.',parameters:{target:'crosswalk road markings',color:'white'}},
] as const

export function ScenarioDialog({open,scene,onClose,onCreated}:{open:boolean;scene?:SceneWorkspace;onClose():void;onCreated():void}){
  const [selected,setSelected]=useState<typeof options[number]['id']>('remove');const[working,setWorking]=useState(false);const[error,setError]=useState<string>();if(!open||!scene)return null
  const activeScene=scene
  const choice=options.find(item=>item.id===selected)!;const source=activeScene.assets.find(item=>item.id===activeScene.coverAssetId&&item.origin==='original')??activeScene.assets.find(item=>item.origin==='original'&&item.kind==='image')
  async function create(){if(!source)return;setWorking(true);setError(undefined);try{await api.createScenario({sceneId:activeScene.id,sourceAssetId:source.id,title:choice.title,prompt:choice.prompt,transformation:choice.id,parameters:{...choice.parameters,preserve_source:true,label_output:'SIMULATED'}});onCreated();onClose()}catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setWorking(false)}}
  return <Dialog label="Scenario lab" onClose={onClose} className="scenario-dialog"><DialogHeader eyebrow="SCENARIO BRANCH" title="Explore an intervention without rewriting reality." description="Every generated output branches from an immutable original and remains visibly marked as simulated." onClose={onClose}/><div className="scenario-guardrail"><LockKeyhole size={15}/><span><b>Evidence-safe generation</b><small>The source asset, analysis, and review history remain unchanged.</small></span><Badge tone="green"><ShieldCheck size={9}/>Enforced</Badge></div><div className="scenario-options">{options.map(item=><button key={item.id} className={item.id===selected?'selected':''} onClick={()=>setSelected(item.id)}><span><item.icon size={17}/></span><span><b>{item.title}</b><small>{item.description}</small></span><i>{item.id===selected&&<Check size={10}/>}</i></button>)}</div><div className="scenario-prompt"><header><span>Transformation plan</span><Badge tone="violet">Cloudinary generative AI</Badge></header><p>{choice.prompt}</p><div><code>{choice.id}</code><code>preserve_source:true</code><code>origin:generated</code></div></div>{error&&<p className="dialog-error">{error}</p>}<footer className="scenario-footer"><span><Sparkles size={13}/>Output will be watermarked and excluded from evidence counts.</span><div><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="accent" loading={working} disabled={!source} onClick={create}><WandSparkles size={14}/>Create traceable scenario</Button></div></footer></Dialog>
}

function titleCase(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase())}
