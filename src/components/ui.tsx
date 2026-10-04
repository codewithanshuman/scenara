import { useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { LoaderCircle, X } from 'lucide-react'

export type Tone = 'neutral' | 'blue' | 'cyan' | 'violet' | 'green' | 'amber' | 'red'

export function Badge({ children, tone = 'neutral', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={`ui-badge tone-${tone} ${className}`} {...props}>{children}</span>
}

export function IconButton({ label, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={`ui-icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>
}

export function Button({ variant = 'secondary', size = 'md', className = '', children, loading, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return <button type="button" className={`ui-button variant-${variant} size-${size} ${className}`} {...props} disabled={loading || props.disabled} aria-busy={loading || undefined}>
    {loading && <LoaderCircle size={14} className="spin"/>}{children}
  </button>
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: Array<{ value: T; label: string; icon?: ReactNode; count?: number }>
  onChange(value: T): void
  label: string
}) {
  return <div className="ui-segmented" role="tablist" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" role="tab" aria-selected={option.value === value} className={option.value === value ? 'active' : ''} onClick={() => onChange(option.value)}>
      {option.icon}<span>{option.label}</span>{option.count !== undefined && <em>{option.count}</em>}
    </button>)}
  </div>
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="ui-empty"><span className="ui-empty-icon">{icon}</span><h3>{title}</h3><p>{description}</p>{action}</div>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`ui-skeleton ${className}`}/>
}

export function Progress({ value, tone = 'blue', label }: { value: number; tone?: Tone; label?: string }) {
  const safe = Math.max(0, Math.min(100, value))
  return <div className="ui-progress" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe} role="progressbar">
    <span className={`tone-${tone}`} style={{ width: `${safe}%` }}/>
  </div>
}

export function Dialog({ children, onClose, className = '', label }: { children: ReactNode; onClose(): void; className?: string; label: string }) {
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = panel.current
    if (!element) return
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(item => item.getClientRects().length > 0)
    const first = focusable().find(item => item.hasAttribute('autofocus')) ?? focusable()[0] ?? element
    first.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); element.focus(); return }
      const current = items.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && current <= 0) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && (current === items.length - 1 || current === -1)) { event.preventDefault(); items[0].focus() }
    }
    element.addEventListener('keydown', keyboard)
    return () => { element.removeEventListener('keydown', keyboard); previous?.focus() }
  }, [])
  return <div className="ui-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section ref={panel} tabIndex={-1} className={`ui-dialog ${className}`} role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </section>
  </div>
}

export function DialogHeader({ eyebrow, title, description, onClose }: { eyebrow?: string; title: string; description?: string; onClose(): void }) {
  return <header className="ui-dialog-header"><div>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2>{description && <p>{description}</p>}</div><IconButton label="Close" onClick={onClose}><X size={17}/></IconButton></header>
}

export function Key({ children }: { children: ReactNode }) {
  return <kbd className="ui-key">{children}</kbd>
}

export function Meter({ value, size = 44, stroke = 4, tone = 'blue', children }: { value: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode }) {
  const radius = (size - stroke) / 2
  const circumference = Math.PI * 2 * radius
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)))
  return <span className={`ui-meter tone-${tone}`} style={{ width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle className="track" cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth={stroke}/>
      <circle className="value" cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset}/>
    </svg><span>{children}</span>
  </span>
}
