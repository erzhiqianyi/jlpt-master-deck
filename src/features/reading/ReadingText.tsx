import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { RubyText } from '../../components/RubyText';
import type { RubyTerm } from '../../types';
import { LookupText } from '../review/WordLookup';

const ReadingRubyContext = createContext<{ terms: RubyTerm[]; enabled: boolean }>({ terms: [], enabled: false });
export function ReadingRubyProvider({ terms, enabled, children }: { terms: RubyTerm[]; enabled: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ terms, enabled }), [terms, enabled]);
  return <ReadingRubyContext.Provider value={value}>{children}</ReadingRubyContext.Provider>;
}
export function ReadingText({ text, lookup = false, source }: { text: string; lookup?: boolean; source?: string }) {
  const { terms, enabled } = useContext(ReadingRubyContext);
  const forms = useMemo(() => terms.map((term) => term.text), [terms]);
  const renderText = (part: string) => <RubyText text={part} terms={terms} enabled={enabled} />;
  return lookup ? <LookupText text={text} source={source} additionalForms={enabled ? forms : undefined} renderText={renderText} /> : renderText(text);
}
