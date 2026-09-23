import { StudyText } from '../../components/StudyText';
import { ArrowLeft, CheckCircle2, Eye, RotateCcw, Target, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ItemImage } from '../../components/ItemImage';
import { distinctReading, itemExplanation, itemMeaning, itemMemory } from '../../domain/items';
import { memoryCardFieldLabels, type MemoryCardField } from '../../domain/memoryCards';
import type { Locale, VocabItem } from '../../types';

export type MemoryRating = 'forgot' | 'hard' | 'remembered' | 'easy';

export function FocusedMemoryReview({ items, locale, token, frontFields, backFields, onExit, onRate }: {
  items: VocabItem[];
  locale: Locale;
  token?: string;
  frontFields: MemoryCardField[];
  backFields: MemoryCardField[];
  onExit: () => void;
  onRate: (item: VocabItem, rating: MemoryRating) => Promise<void>;
}) {
  // Keep the session queue stable. Rating a card changes its due date in the
  // parent, which must not remove it from this array before we advance once.
  const [queue] = useState(() => items);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const item = queue[index];

  async function rate(rating: MemoryRating) {
    if (!item || saving) return;
    setSaving(true);
    try {
      await onRate(item, rating);
      setIndex((current) => current + 1);
      setRevealed(false);
    } finally {
      setSaving(false);
    }
  }

  if (!queue.length || index >= queue.length) {
    return (
      <main className="ledger-focus-review">
        <header className="ledger-focus-topbar"><button type="button" onClick={onExit}><ArrowLeft size={20} />返回今天</button><strong>记忆卡复习</strong><span>{queue.length} / {queue.length}</span></header>
        <section className="ledger-review-complete"><CheckCircle2 size={46} /><h1>今日复习完成</h1><p>{queue.length ? `${queue.length} 张记忆卡已更新下次复习日期。` : '今天没有到期的记忆卡。'}</p><button type="button" onClick={onExit}>返回今天</button></section>
      </main>
    );
  }

  const reviewed = index;

  return (
    <main className="ledger-focus-review">
      <header className="ledger-focus-topbar">
        <button type="button" onClick={onExit} aria-label="退出复习">
          <ArrowLeft size={20} />
          <span className="ledger-exit-label ledger-exit-label-long">退出复习</span>
          <span className="ledger-exit-label ledger-exit-label-short">退出</span>
        </button>
        <strong>记忆卡复习</strong>
        <span>{reviewed + 1} / {queue.length}</span>
      </header>
      <div className="ledger-focus-progress" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={reviewed}><i style={{ width: `${(reviewed / queue.length) * 100}%` }} /></div>
      <section
        className={`ledger-focus-stage ${revealed ? 'has-ratings' : 'can-reveal'}`}
        onClick={!revealed ? () => setRevealed(true) : undefined}
      >
        <div
          className={`ledger-memory-flip ${revealed ? 'is-flipped' : ''}`}
          onKeyDown={!revealed ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setRevealed(true);
            }
          } : undefined}
          role={!revealed ? 'button' : undefined}
          tabIndex={!revealed ? 0 : undefined}
          aria-label={!revealed ? `显示「${item.original}」的答案` : undefined}
        >
          <div className="ledger-memory-flip-inner">
            <article className="ledger-memory-card ledger-memory-face ledger-memory-front" aria-hidden={revealed}>
              <div className="ledger-memory-content">
                <ConfiguredMemoryCardContent item={item} locale={locale} token={token} fields={frontFields} revealed={false} />
              </div>
            </article>
            <article className="ledger-memory-card ledger-memory-face ledger-memory-back" aria-hidden={!revealed}>
              <div className="ledger-memory-content">
                <ConfiguredMemoryCardContent item={item} locale={locale} token={token} fields={backFields} revealed />
              </div>
            </article>
          </div>
        </div>
        {!revealed ? (
          <button type="button" className="ledger-primary-action" onClick={() => setRevealed(true)}><Eye size={18} />显示答案</button>
        ) : (
          <div className="ledger-memory-ratings" aria-label="记忆程度">
            <button type="button" disabled={saving} onClick={() => rate('forgot')}><RotateCcw size={20} /><strong>忘记</strong><small>10 分钟</small></button>
            <button type="button" disabled={saving} onClick={() => rate('hard')}><TriangleAlert size={20} /><strong>困难</strong><small>1 天</small></button>
            <button type="button" disabled={saving} onClick={() => rate('remembered')}><CheckCircle2 size={20} /><strong>记得</strong><small>3 天</small></button>
            <button type="button" disabled={saving} onClick={() => rate('easy')}><Target size={20} /><strong>简单</strong><small>7 天</small></button>
          </div>
        )}
      </section>
    </main>
  );
}

// Fields with their own slot on the card; everything else is listed in configured order.
const summaryCardFields: MemoryCardField[] = ['reading', 'jlpt_level', 'part_of_speech'];
const featuredCardFields: MemoryCardField[] = ['original', 'images', 'patterns', 'meaning', 'core_memory'];

function ConfiguredMemoryCardContent({ item, locale, token, fields, revealed }: {
  item: VocabItem;
  locale: Locale;
  token?: string;
  fields: MemoryCardField[];
  revealed: boolean;
}) {
  const labels = memoryCardFieldLabels[locale];
  const entries = fields
    .map((field) => ({ field, content: memoryFieldContent(item, locale, field) }))
    .filter((entry): entry is { field: MemoryCardField; content: ReactNode } => entry.content !== null);
  const entry = (field: MemoryCardField) => entries.find((candidate) => candidate.field === field);
  const original = entry('original');
  const patterns = entry('patterns');
  const meaning = entry('meaning');
  const coreMemory = entry('core_memory');
  const images = fields.includes('images') ? item.images ?? [] : [];
  const summaryFields = revealed ? entries.filter((candidate) => summaryCardFields.includes(candidate.field)) : [];
  const details = entries.filter((candidate) => !featuredCardFields.includes(candidate.field) && !summaryFields.includes(candidate));
  return (
    <>
      {revealed && (original || summaryFields.length) ? (
        <div className="ledger-memory-back-summary">
          {original ? <h1 lang="ja">{original.content}</h1> : null}
          {summaryFields.length ? (
            <dl>
              {summaryFields.map(({ field, content }) => (
                <div key={field} className={`ledger-memory-summary-field ledger-memory-summary-field--${field}`}>
                  <dt>{labels[field]}</dt>
                  <dd>{content}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : original ? <h1 lang="ja">{original.content}</h1> : null}
      {images.length ? (
        <div className={`ledger-memory-images ${images.length > 1 ? 'is-multiple' : ''}`}>
          {images.map((image) => (
            <figure key={image.id ?? image.url}>
              <ItemImage image={image} token={token} alt={image.caption || `${item.original} ${labels.images}`} />
              {image.caption ? <figcaption>{image.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : null}
      {patterns || meaning || details.length || coreMemory ? (
        <div className={`ledger-memory-answer ${revealed ? '' : 'is-front'}`}>
          {patterns ? <div className="ledger-memory-featured">{patterns.content}</div> : null}
          {meaning ? <p className="ledger-memory-configured-meaning">{meaning.content}</p> : null}
          <dl>
            {details.map(({ field, content }) => (
              <div key={field} className={`ledger-memory-field ledger-memory-field--${memoryFieldPresentation(field)}`}>
                <dt>{labels[field]}</dt>
                <dd>{content}</dd>
              </div>
            ))}
            {coreMemory ? (
              <div className="ledger-memory-field ledger-memory-field--memory">
                <dt>{labels.core_memory}</dt>
                <dd>{coreMemory.content}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : !revealed && !images.length ? <span className="ledger-memory-rule" /> : null}
    </>
  );
}

function memoryFieldPresentation(field: MemoryCardField) {
  if (field === 'reading') return 'cue';
  if (['jlpt_level', 'part_of_speech', 'tags'].includes(field)) return 'meta';
  return 'narrative';
}

function isMetaLearningExample(value: string) {
  return /教材(?:の第\d+週)?では[「『].+[」』]という表現を学んだ/u.test(value);
}

const joined = (parts: (string | undefined)[], separator = '：') => parts.map((part) => part?.trim()).filter(Boolean).join(separator);

function memoryFieldContent(item: VocabItem, locale: Locale, field: MemoryCardField): ReactNode | null {
  const scalar = (value: unknown, lang?: string) => typeof value === 'string' && value.trim() ? <span lang={lang}>{value}</span> : null;
  const lines = (values: string[], lang?: string) => {
    const kept = values.filter(Boolean);
    return kept.length ? <span className="ledger-memory-lines" lang={lang}>{kept.map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}</span> : null;
  };
  switch (field) {
    case 'original': return scalar(item.original, 'ja');
    // A reading identical to the entry (common for kana grammar) adds nothing.
    case 'reading': return scalar(distinctReading(item), 'ja');
    case 'jlpt_level': return scalar(item.jlpt_level);
    case 'part_of_speech': return scalar(item.part_of_speech);
    // Rendered as figures in their own slot.
    case 'images': return null;
    case 'meaning': return scalar(itemMeaning(item, locale));
    case 'meaning_ja': return scalar(item.meaning_ja, 'ja');
    case 'core_memory': return itemMemory(item, locale) ? <StudyText text={itemMemory(item, locale) ?? ''} /> : null;
    case 'explanation': return itemExplanation(item, locale) ? <StudyText text={itemExplanation(item, locale) ?? ''} /> : null;
    case 'patterns': return lines((item.patterns ?? []).map((entry) => joined([entry.pattern, entry.connection_zh, entry.meaning_zh])));
    case 'points': return lines((item.points ?? []).map((entry) => joined([entry.label, entry.detail_zh])));
    case 'comparisons': return lines((item.comparisons ?? []).map((entry) => joined([entry.kind === 'everyday' ? `〔日常〕${entry.target ?? ''}` : entry.target, entry.difference_zh])));
    case 'register': return scalar(joined([item.register?.note_zh, item.register?.exam_tip_zh], ' · '));
    case 'conjugations': return item.conjugations?.length ? <ConjugationPattern item={item} /> : null;
    case 'examples': {
      const example = item.examples?.find((candidate) => !isMetaLearningExample(candidate.ja));
      return example ? <><span lang="ja">{example.ja}</span><small>{example.zh}</small></> : null;
    }
    case 'notes': return lines(item.notes ?? []);
    case 'tags': return item.tags?.length ? <span>{item.tags.join(' · ')}</span> : null;
    case 'source': return scalar(joined([item.source?.sentence, item.source?.chat_summary], ' — '));
    default: return null;
  }
}

function ConjugationPattern({ item }: { item: VocabItem }) {
  const baseForm = item.base_form?.trim() || item.original.trim();
  const rule = conjugationRule(baseForm, item.inflection_class);

  return (
    <section className="ledger-conjugation-pattern" aria-label="活用变化规则">
      <header>
        <strong>{rule.typeLabel}</strong>
        <span>{rule.ruleLabel}</span>
      </header>
      <ul>
        {item.conjugations?.map((entry) => {
          const form = entry.form.trim();
          const hasStem = Boolean(rule.stem) && form.startsWith(rule.stem);
          const ending = hasStem ? form.slice(rule.stem.length) : form;

          return (
            <li key={`${entry.kind}-${entry.form}`}>
              <small>{conjugationKindLabel(entry.kind)}</small>
              <span lang="ja">
                {hasStem ? <i>{rule.stem}</i> : null}
                <b>{ending}</b>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function conjugationRule(baseForm: string, inflectionClass?: VocabItem['inflection_class']) {
  switch (inflectionClass) {
    case 'suru':
      return {
        stem: baseForm.endsWith('する') ? baseForm.slice(0, -2) : '',
        typeLabel: 'サ变动词',
        ruleLabel: '词干 ＋「する」型变化',
      };
    case 'kuru':
      return {
        stem: baseForm.endsWith('くる') ? baseForm.slice(0, -2) : baseForm.endsWith('来る') ? baseForm.slice(0, -1) : '',
        typeLabel: 'カ变动词',
        ruleLabel: '「くる」的不规则变化',
      };
    case 'ichidan':
      return {
        stem: baseForm.endsWith('る') ? baseForm.slice(0, -1) : baseForm,
        typeLabel: '一段动词',
        ruleLabel: '去掉「る」后接活用词尾',
      };
    case 'godan':
      return {
        stem: Array.from(baseForm).slice(0, -1).join(''),
        typeLabel: '五段动词',
        ruleLabel: '末尾假名按同行变化',
      };
    case 'i_adjective':
      return {
        stem: baseForm.endsWith('い') ? baseForm.slice(0, -1) : baseForm,
        typeLabel: 'い形容词',
        ruleLabel: '词干 ＋ 活用词尾',
      };
    case 'na_adjective':
      return {
        stem: baseForm.endsWith('だ') ? baseForm.slice(0, -1) : baseForm,
        typeLabel: 'な形容词',
        ruleLabel: '词干 ＋「だ」型变化',
      };
    default:
      return { stem: '', typeLabel: '活用', ruleLabel: '按形式查看变化' };
  }
}

function conjugationKindLabel(kind: string) {
  const labels: Record<string, string> = {
    dictionary: '辞书形',
    polite: 'ます形',
    negative: 'ない形',
    past: 'た形',
    te: 'て形',
    conditional: '条件形',
    potential: '可能形',
    passive: '被动形',
    causative: '使役形',
    adverbial: '连用形',
  };
  return labels[kind] ?? kind;
}
