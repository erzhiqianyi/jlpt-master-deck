import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Question, Locale } from '../types';

/** A stable reference is metadata, independent of the current list position. */
export function RecordReference({ reference, locale = 'zh-CN' }: { reference?: string; locale?: Locale }) {
  const [copied, setCopied] = useState('');
  const [failed, setFailed] = useState('');
  if (!reference) return null;
  const label = locale === 'ja' ? '参照番号をコピー' : locale === 'en' ? 'Copy reference' : '复制编号';
  const done = locale === 'ja' ? 'コピー済み' : locale === 'en' ? 'Copied' : '已复制';
  return <span className="my-1 inline-flex max-w-full items-center gap-2 text-xs text-[#82747b]">
    <button type="button" className="inline-flex min-h-8 items-center gap-1.5 rounded px-1.5 hover:bg-[#fff0f5] focus-visible:outline-2 focus-visible:outline-[#a84269]" title={label} aria-label={`${label} ${reference}`} onClick={async () => {
      try { await navigator.clipboard.writeText(reference); setCopied(reference); setFailed(''); }
      catch { setFailed(reference); }
    }}>
      <span className="font-mono select-text">{reference}</span>
      {copied === reference ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
    <span role="status">{failed === reference ? (locale === 'ja' ? '番号を選択してコピーしてください' : locale === 'en' ? 'Select the reference to copy it' : '请选中编号手动复制') : copied === reference ? done : ''}</span>
  </span>;
}


export function QuestionReference({ question, token, locale }: { question?: Question; token?: string; locale: Locale }) {
  const [saved, setSaved] = useState<{ question: Question; reference: string } | null>(null);
  useEffect(() => {
    if (!question || question.reference || !token) return;
    let cancelled = false;
    apiRequest<{ reference: string }>('/api/references/question', { method: 'POST', token, body: question })
      .then(result => { if (!cancelled) setSaved({ question, reference: result.reference }); })
      .catch(() => { /* A failed registration must not show a guessed or stale reference. */ });
    return () => { cancelled = true; };
  }, [question, token]);
  return <RecordReference reference={question?.reference ?? (saved?.question === question ? saved?.reference : undefined)} locale={locale} />;
}
