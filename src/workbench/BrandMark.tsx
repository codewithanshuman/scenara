import logo from '../../assets/logo.png'

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`scenara-brand ${compact ? 'compact' : ''}`} aria-label="Scenara">
    <span className="brand-cloud"><img src={logo} alt=""/></span>
    {!compact && <span className="scenara-word">scenara<span>®</span></span>}
  </span>
}
