export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`scenara-brand ${compact ? 'compact' : ''}`} aria-label="Scenara">
    <span className="scenara-glyph"><i/><i/><i/><b/></span>
    {!compact && <span className="scenara-word">SCENARA<sup>β</sup></span>}
  </span>
}
