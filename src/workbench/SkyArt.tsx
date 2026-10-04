import sky from '../../assets/landing-page-0.png'
import clouds from '../../assets/landing-page-1.png'
import flight from '../../assets/landing-page-footer.png'

const artwork = { sky, clouds, flight }

/** Render supplied artwork directly. No filters, color mapping, or asset mutation. */
export function SkyArt({ kind = 'sky', className = '' }: { kind?: keyof typeof artwork; className?: string }) {
  return <img className={`sky-art ${className}`} src={artwork[kind]} alt="" aria-hidden="true"/>
}
