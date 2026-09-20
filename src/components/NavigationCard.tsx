import { ArrowRight, Play } from 'lucide-react';
import type { ReactNode } from 'react';

/** Module navigation shares one layout; a direct practice action is optional. */
export function NavigationCard({ icon, title, description, href, onOpen, onStart, startLabel = '开始练习' }: {
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  onOpen?: () => void;
  onStart?: () => void;
  startLabel?: string;
}) {
  const content = <>
    <span className="navigation-card-icon" aria-hidden="true">{icon}</span>
    <span className="navigation-card-copy"><strong>{title}</strong><small>{description}</small></span>
    {!onStart && <ArrowRight size={18} aria-hidden="true" />}
  </>;
  return <article className={`navigation-card${onStart ? ' has-start' : ''}`}>
    {href ? <a className="navigation-card-open" href={href}>{content}</a>
      : <button type="button" className="navigation-card-open" onClick={onOpen}>{content}</button>}
    {onStart ? <button type="button" className="navigation-card-start" onClick={onStart} aria-label={`${title} · ${startLabel}`}><Play size={15} aria-hidden="true" />{startLabel}</button> : null}
  </article>;
}
