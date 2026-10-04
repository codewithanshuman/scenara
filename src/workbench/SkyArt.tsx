import { useId } from 'react'
import sky from '../../assets/landing-page-0.png'
import clouds from '../../assets/landing-page-1.png'
import flight from '../../assets/landing-page-footer.png'

const artwork = { sky: { src: sky, width: 1672, height: 941 }, clouds: { src: clouds, width: 1536, height: 1024 }, flight: { src: flight, width: 1677, height: 938 } }

/** Preserve supplied artwork while mapping its ink to the workspace palette. */
export function SkyArt({ kind = 'sky', className = '' }: { kind?: keyof typeof artwork; className?: string }) {
  const filter = useId().replace(/:/g, '')
  const art = artwork[kind]
  return <svg className={'sky-art ' + className} viewBox={'0 0 ' + art.width + ' ' + art.height} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><filter id={filter} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/>
      <feComponentTransfer>
        <feFuncR type="discrete" tableValues=".105882 .137255 .203922 .050980 .890196"/>
        <feFuncG type="discrete" tableValues=".160784 .262745 .282353 .603922 .913725"/>
        <feFuncB type="discrete" tableValues=".364706 .415686 .772549 1 .937255"/>
      </feComponentTransfer>
    </filter></defs>
    <image href={art.src} width={art.width} height={art.height} filter={'url(#' + filter + ')'}/>
  </svg>
}
