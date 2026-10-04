import { ArrowRight, AudioLines, Braces, Check, Fingerprint, GitCompareArrows, Image, Network, Play, ScanSearch, ShieldCheck, Sparkles, Video } from 'lucide-react'
import landingHero from '../../assets/landing-page-0.png'
import landingEvidence from '../../assets/landing-page-1.png'
import landingFooter from '../../assets/landing-page-footer.png'
import { BrandMark } from '../workbench/BrandMark'
import './landing.css'

const stages = [
  ['01', 'Ingest', 'Images, video and audio enter with hashes, capture context and an immutable source record.'],
  ['02', 'Interpret', 'Lens-aware analysis turns media into structured observations, entities and policy decisions.'],
  ['03', 'Corroborate', 'Evidence links across captures, transcripts, time and location instead of standing alone.'],
  ['04', 'Review', 'Every uncertain claim reaches a human queue with confidence reasoning and source context.'],
  ['05', 'Decide', 'Verified findings become searchable evidence, temporal change and reversible scenarios.'],
]

const capabilities = [
  { icon: ScanSearch, title: 'Evidence, not detections', copy: 'Every finding carries regions, timestamps, confidence, policy adjustments and its exact source.' },
  { icon: Network, title: 'A scene that remembers', copy: 'Entities persist across captures. The graph connects observations, changes, media and human decisions.' },
  { icon: GitCompareArrows, title: 'Change you can explain', copy: 'Compare moments, identify what appeared or moved, and keep the before/after evidence together.' },
  { icon: ShieldCheck, title: 'Human authority built in', copy: 'Verify, correct, defer or dismiss—with optimistic locking and a durable review history.' },
  { icon: Fingerprint, title: 'Tamper-evident lineage', copy: 'SHA-256 identity and chained provenance make every capture and transformation auditable.' },
  { icon: Sparkles, title: 'Safe scenario exploration', copy: 'Create reversible visual branches while the original remains preserved and outputs stay labeled.' },
]

export function LandingPage({ connected, onEnter }: { connected: boolean; onEnter(): void }) {
  return <div className="landing-page">
    <header className="landing-nav">
      <a href="#top" className="landing-logo" aria-label="Scenara home"><BrandMark/></a>
      <nav aria-label="Primary navigation"><a href="#system">System</a><a href="#evidence">Evidence</a><a href="#trust">Trust</a></nav>
      <button className="landing-enter mini" onClick={onEnter}><span className={connected ? 'is-live' : ''}/>{connected ? 'System live' : 'Open system'}<ArrowRight size={15}/></button>
    </header>

    <main id="top">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-kicker"><span>REAL-WORLD INTELLIGENCE</span><i>01</i></div>
          <h1 id="landing-title">See the scene.<br/><em>Prove the insight.</em></h1>
          <p>Scenara turns real-world media into structured, traceable evidence—so teams can understand what changed, why it matters, and what to do next.</p>
          <div className="landing-actions"><button className="landing-enter" onClick={onEnter}>Enter evidence workspace<ArrowRight size={17}/></button><a href="#system"><Play size={14}/>See how it works</a></div>
          <div className="landing-signal"><span><Check size={12}/>Immutable provenance</span><span><Check size={12}/>Human review</span><span><Check size={12}/>Temporal reasoning</span></div>
        </div>
        <div className="landing-hero-visual">
          <img src={landingHero} alt="Scenara visualizing a real-world scene as connected evidence"/>
          <div className="landing-floating-card"><span>SCENE 018</span><b>Evidence graph active</b><small><i/>Source integrity verified</small></div>
          <span className="landing-coordinate">19.0760° N<br/>72.8777° E</span>
        </div>
      </section>

      <section className="landing-media-strip" aria-label="Supported evidence formats">
        <span>ONE SCENE · EVERY SIGNAL</span>
        <div><i><Image size={17}/>Images</i><i><Video size={17}/>Video</i><i><AudioLines size={17}/>Audio</i><i><Braces size={17}/>Structured context</i></div>
      </section>

      <section className="landing-system" id="system">
        <header><span>THE EVIDENCE COMPILER</span><h2>From raw capture to<br/>defensible decision.</h2><p>Not a gallery. Not a chatbot. A full evidence pipeline where every machine conclusion remains connected to the reality that produced it.</p></header>
        <ol>{stages.map(([number,title,copy]) => <li key={number}><span>{number}</span><div><b>{title}</b><p>{copy}</p></div></li>)}</ol>
      </section>

      <section className="landing-evidence" id="evidence">
        <div className="landing-evidence-visual"><img src={landingEvidence} alt="Cloud-shaped evidence layers converging into one understanding"/><span>Many signals.<br/><b>One accountable scene.</b></span></div>
        <div className="landing-evidence-copy"><span className="section-index">02 / DEPTH</span><h2>Context is the feature.</h2><p>A finding is only useful when you can inspect its source, understand its uncertainty, compare it over time and challenge the machine.</p><dl><div><dt>86</dt><dd>concepts in the domain knowledge layer</dd></div><div><dt>688</dt><dd>policy variants across lenses and risk profiles</dd></div><div><dt>07</dt><dd>typed node families in the scene graph</dd></div><div><dt>SHA-256</dt><dd>identity carried through the provenance chain</dd></div></dl></div>
      </section>

      <section className="landing-capabilities" id="trust">
        <header><span>BUILT PAST THE DEMO</span><h2>Depth where decisions need it.</h2></header>
        <div>{capabilities.map(item => <article key={item.title}><span><item.icon size={21}/></span><h3>{item.title}</h3><p>{item.copy}</p><i><ArrowRight size={15}/></i></article>)}</div>
      </section>

      <section className="landing-cta">
        <div><span>READY WHEN THE WORLD CHANGES</span><h2>Build a record<br/>reality can stand behind.</h2><button className="landing-enter" onClick={onEnter}>Open Scenara<ArrowRight size={17}/></button></div>
        <figure><img src={landingFooter} alt="Aircraft moving through a clear blue sky"/><figcaption><i/>Evidence pipeline operational</figcaption></figure>
      </section>
    </main>
    <footer className="landing-footer"><BrandMark compact/><p>Real-world intelligence with a chain of evidence.</p><span>SCENARA / 2026</span></footer>
  </div>
}
