import type { ReactNode } from 'react';
import type { RubyTerm } from '../types';

/** Render only explicitly supplied readings; never infer pronunciations from kanji. */
export function RubyText({ text, terms = [], enabled = false }: { text: string; terms?: RubyTerm[]; enabled?: boolean }) {
  if (!enabled || !terms.length) return <>{text}</>;
  const candidates = terms.filter((term) => term.text && term.reading).toSorted((a, b) => b.text.length - a.text.length);
  const parts: ReactNode[] = [];
  let position = 0;
  let plain = '';
  while (position < text.length) {
    const term = candidates.find((candidate) => text.startsWith(candidate.text, position));
    if (!term) { plain += text[position++]; continue; }
    if (plain) { parts.push(plain); plain = ''; }
    parts.push(<ruby key={position}>{term.text}<rp>(</rp><rt>{term.reading}</rt><rp>)</rp></ruby>);
    position += term.text.length;
  }
  if (plain) parts.push(plain);
  return <>{parts}</>;
}
