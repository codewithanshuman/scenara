import { useId } from 'react'
import logo from '../../assets/logo.png'

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const filter = useId().replace(/:/g, '')
  return <span className={'scenara-brand ' + (compact ? 'compact' : '')} aria-label="Scenara">
    <svg className="brand-cloud" viewBox="240 200 1080 710" aria-hidden="true">
      <defs><filter id={filter} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 .203922 0 0 0 0 .282353 0 0 0 0 .772549 .2126 .7152 .0722 0 0"/></filter></defs>
      <image href={logo} width="1536" height="1024" filter={'url(#' + filter + ')'}/>
    </svg>
    {!compact && <span className="scenara-word">scenara<span>®</span></span>}
  </span>
}
