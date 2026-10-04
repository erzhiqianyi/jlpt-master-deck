import { SpeechControls, useSpeech } from '../../components/SpeechControls';
import '../practice/practice-layout.css';
import { conjugationReading } from '../../domain/conjugationReading';
import { LookupText } from './WordLookup';
import { RecordReference } from '../../components/RecordReference';
import { StudyText } from '../../components/StudyText';
import { ArrowLeft, CheckCircle2, Eye, RotateCcw, Target, TriangleAlert } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { ItemImage } from '../../components/ItemImage';
import { distinctReading, itemExplanation, itemMeaning, itemMemoryPoints } from '../../domain/items';
import { memoryCardFieldLabels, type MemoryCardField } from '../../domain/memoryCards';
import type { Locale, VocabItem } from '../../types';

export type MemoryRating = 'forgot' | 'hard' | 'remembered' | 'easy';

export function FocusedMemoryReview({ items, locale, token, wordSpacing, frontFields, backFields, onExit, onRate }: {
  items: VocabItem[];
  locale: Locale;
  token?: string;
  wordSpacing: boolean;
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
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const t = (zh: string, ja: string, en: string) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  const item = queue[index];
  const speech = useSpeech()?.settings.speech;
  const grammar = item?.type === 'grammar' || item?.deck?.includes('grammar');
  const auto = speech?.cardAuto && speech.cardAuto !== 'off' && (!grammar || speech.grammarAuto) && (speech.cardAuto === 'front' || revealed);
  const speechText = item ? [item.reading || item.original, ...(auto && speech?.includeExample ? [item.examples?.find((example) => !isMetaLearningExample(example.ja))?.ja ?? ''] : [])].filter(Boolean).join('。') : '';

  async function rate(rating: MemoryRating) {
    if (!item || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onRate(item, rating);
      setIndex((current) => current + 1);
      setRevealed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : locale === 'zh-CN' ? '未能保存，请重试。' : locale === 'ja' ? '保存できませんでした。再試行してください。' : 'Could not save. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!queue.length || index >= queue.length) {
    return (
      <main className="ledger-focus-review study-memory-review">
        <header className="ledger-focus-topbar"><button type="button" onClick={onExit}><ArrowLeft size={20} />{t('返回今天', '今日に戻る', 'Back to Today')}</button><strong>{t('记忆卡复习', '単語カード復習', 'Flashcard review')}</strong><span>{queue.length} / {queue.length}</span></header>
        <section className="ledger-review-complete"><CheckCircle2 size={46} /><h1>{t('今日复习完成', '今日の復習が完了しました', 'Review complete')}</h1><p>{queue.length ? t(`${queue.length} 张记忆卡已更新下次复习日期。`, `${queue.length} 枚のカードの次回復習日を更新しました。`, `Updated the next review dates for ${queue.length} flashcards.`) : t('今天没有到期的记忆卡。', '今日は復習期限のカードがありません。', 'No flashcards are due today.')}</p><button type="button" onClick={onExit}>{t('返回今天', '今日に戻る', 'Back to Today')}</button></section>
      </main>
    );
  }

  const reviewed = index;

  return (
    <main className="ledger-focus-review study-memory-review">
      <header className="ledger-focus-topbar">
        <button type="button" onClick={onExit} aria-label={t('退出复习', '復習を終了', 'Exit review')}>
          <ArrowLeft size={20} />
          <span className="ledger-exit-label ledger-exit-label-long">{t('退出复习', '復習を終了', 'Exit review')}</span>
          <span className="ledger-exit-label ledger-exit-label-short">{t('退出', '終了', 'Exit')}</span>
        </button>
        <strong>{t('记忆卡复习', '単語カード復習', 'Flashcard review')}</strong>
        <span>{reviewed + 1} / {queue.length}</span>
      </header>
      <div className="ledger-focus-progress" role="progressbar" aria-label={t('复习进度', '復習の進捗', 'Review progress')} aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={reviewed}><i style={{ width: `${(reviewed / queue.length) * 100}%` }} /></div>
      <div className="memory-review-speech"><SpeechControls iconOnly key={item.id} text={speechText} auto={Boolean(auto)} /></div>
      <section
        className={`ledger-focus-stage ${wordSpacing ? 'has-word-spacing' : ''} ${revealed ? 'has-ratings' : 'can-reveal'}`}
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
          aria-label={!revealed ? t(`显示「${item.original}」的答案`, `「${item.original}」の答えを表示`, `Show answer for ${item.original}`) : undefined}
        >
          <div className="ledger-memory-flip-inner">
            <article className="ledger-memory-card ledger-memory-face ledger-memory-front" aria-hidden={revealed} inert={revealed}>
              <div className="ledger-memory-content">
                <ConfiguredMemoryCardContent item={item} locale={locale} token={token} fields={frontFields} revealed={false} />
              </div>
            </article>
            <article className="ledger-memory-card ledger-memory-face ledger-memory-back" aria-hidden={!revealed} inert={!revealed}>
              <div className="ledger-memory-content">
                <ConfiguredMemoryCardContent item={item} locale={locale} token={token} fields={backFields} revealed />
                {item.reference ? (
                  <div className="ledger-memory-tracking-id">
                    <RecordReference key={item.id} reference={item.reference} locale={locale} />
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </div>
        {error ? <p className="study-memory-save-error" role="alert">{error}</p> : null}
        {!revealed ? (
          <button type="button" className="ledger-primary-action" onClick={() => setRevealed(true)}><Eye size={18} />{t('显示答案', '答えを表示', 'Show answer')}</button>
        ) : (
          <div className="ledger-memory-ratings" aria-label={t('记忆程度', '記憶の度合い', 'Recall rating')}>
            <button type="button" disabled={saving} data-rating="forgot" onClick={() => rate('forgot')}><RotateCcw size={20} /><strong>{t('忘记', '忘れた', 'Forgot')}</strong><small>{t('10 分钟', '10分', '10 minutes')}</small></button>
            <button type="button" disabled={saving} data-rating="hard" onClick={() => rate('hard')}><TriangleAlert size={20} /><strong>{t('困难', '難しい', 'Hard')}</strong><small>{t('1 天', '1日', '1 day')}</small></button>
            <button type="button" disabled={saving} data-rating="remembered" onClick={() => rate('remembered')}><CheckCircle2 size={20} /><strong>{t('记得', '覚えている', 'Remembered')}</strong><small>{t('3 天', '3日', '3 days')}</small></button>
            <button type="button" disabled={saving} data-rating="easy" onClick={() => rate('easy')}><Target size={20} /><strong>{t('简单', '簡単', 'Easy')}</strong><small>{t('7 天', '7日', '7 days')}</small></button>
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

// In mixed Chinese/Japanese notes, only tokenize runs containing kana.
function MemoryLookupText({ text }: { text: string }) {
  return <>{text.split(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+)/u).map((part, index) =>
    /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(part)
      ? <LookupText key={index} text={part} source={text} />
      : part)}</>;
}

function memoryFieldContent(item: VocabItem, locale: Locale, field: MemoryCardField): ReactNode | null {
  const scalar = (value: unknown, lang?: string) => typeof value === 'string' && value.trim() ? <span lang={lang}>{lang === 'ja' ? <LookupText text={value} /> : <MemoryLookupText text={value} />}</span> : null;
  const lines = (values: string[], lang?: string) => {
    const kept = values.filter(Boolean);
    return kept.length ? <span className="ledger-memory-lines" lang={lang}>{kept.map((value, index) => <span key={`${value}-${index}`}><MemoryLookupText text={value} /></span>)}</span> : null;
  };
  switch (field) {
    case 'original': return scalar(item.original, 'ja');
    // A reading identical to the entry (common for kana grammar) adds nothing.
    case 'reading': return scalar(distinctReading(item), 'ja');
    case 'jlpt_level': return scalar(item.jlpt_level);
    case 'part_of_speech': return scalar(item.part_of_speech);
    // Rendered as figures in their own slot.
    case 'images': return null;
    case 'meaning': return scalar(itemMeaning(item, locale), locale === 'ja' ? 'ja' : undefined);
    case 'meaning_ja': return scalar(item.meaning_ja, 'ja');
    case 'core_memory': {
      const points = itemMemoryPoints(item, locale);
      return points.length ? <ul className="list-disc space-y-2 pl-5">{points.map((point, index) => <li key={`${index}-${point}`}><MemoryLookupText text={point} /></li>)}</ul> : null;
    }
    case 'explanation': return itemExplanation(item, locale) ? <StudyText text={itemExplanation(item, locale) ?? ''} renderText={(text) => <MemoryLookupText text={text} />} /> : null;
    case 'patterns': return lines((item.patterns ?? []).map((entry) => joined([entry.pattern, entry.connection_zh, entry.meaning_zh])));
    case 'points': return lines((item.points ?? []).map((entry) => joined([entry.label, entry.detail_zh])));
    case 'comparisons': return lines((item.comparisons ?? []).map((entry) => joined([entry.kind === 'everyday' ? `〔日常〕${entry.target ?? ''}` : entry.target, entry.difference_zh])));
    case 'register': return scalar(joined([item.register?.note_zh, item.register?.exam_tip_zh], ' · '));
    case 'conjugations': return item.conjugations?.length ? <ConjugationPattern item={item} locale={locale} /> : null;
    case 'examples': {
      const example = item.examples?.find((candidate) => !isMetaLearningExample(candidate.ja));
      return example ? <><span lang="ja"><LookupText text={example.ja} /> <SpeechControls iconOnly text={example.ja} /></span><small>{example.zh}</small></> : null;
    }
    case 'notes': return lines(item.notes ?? []);
    case 'tags': return item.tags?.length ? <span>{item.tags.join(' · ')}</span> : null;
    case 'source': return scalar(joined([item.source?.sentence, item.source?.chat_summary], ' — '));
    default: return null;
  }
}

function ConjugationPattern({ item, locale }: { item: VocabItem; locale: Locale }) {
  const baseForm = item.base_form?.trim() || item.original.trim();
  const rule = conjugationRule(baseForm, item.inflection_class);
  const translate = (text: string) => {
    const entries: Record<string, [string, string]> = {
      '活用变化规则': ['活用の規則', 'Conjugation rules'], 'サ变动词': ['サ変動詞', 'Suru verb'], '词干 ＋「する」型变化': ['語幹 ＋「する」の活用', 'Stem + suru conjugation'],
      'カ变动词': ['カ変動詞', 'Kuru verb'], '「くる」的不规则变化': ['「くる」の不規則活用', 'Irregular kuru conjugation'], '一段动词': ['一段動詞', 'Ichidan verb'], '去掉「る」后接活用词尾': ['「る」を取って活用語尾を付ける', 'Drop ru and add the ending'],
      '五段动词': ['五段動詞', 'Godan verb'], '末尾假名按同行变化': ['語尾を同じ行で変化させる', 'Change the final kana within its row'], 'い形容词': ['イ形容詞', 'I-adjective'], '词干 ＋ 活用词尾': ['語幹 ＋ 活用語尾', 'Stem + ending'], 'な形容词': ['ナ形容詞', 'Na-adjective'], '词干 ＋「だ」型变化': ['語幹 ＋「だ」の活用', 'Stem + da conjugation'],
      '活用': ['活用', 'Conjugation'], '按形式查看变化': ['形ごとに活用を確認', 'Review each conjugated form'], '辞书形': ['辞書形', 'Dictionary'], 'ます形': ['ます形', 'Polite'], 'ない形': ['ない形', 'Negative'], 'た形': ['た形', 'Past'], 'て形': ['て形', 'Te-form'], '条件形': ['条件形', 'Conditional'], '可能形': ['可能形', 'Potential'], '被动形': ['受身形', 'Passive'], '使役形': ['使役形', 'Causative'], '连用形': ['連用形', 'Adverbial'],
    };
    return locale === 'zh-CN' ? text : entries[text]?.[locale === 'ja' ? 0 : 1] ?? text;
  };

  return (
    <section className="ledger-conjugation-pattern" aria-label={translate("活用变化规则")}>
      <header>
        <strong>{translate(rule.typeLabel)}</strong>
        <span>{translate(rule.ruleLabel)}</span>
      </header>
      <ul>
        {item.conjugations?.map((entry) => {
          const form = entry.form.trim();
          const hasStem = Boolean(rule.stem) && form.startsWith(rule.stem);
          const ending = hasStem ? form.slice(rule.stem.length) : form;
          const reading = conjugationReading(item, entry);
          const surface = <>{hasStem ? <i>{rule.stem}</i> : null}<b>{ending}</b></>;

          return (
            <li key={`${entry.kind}-${entry.form}`}>
              <small>{translate(conjugationKindLabel(entry.kind))}</small>
              <span lang="ja">
                {reading && reading !== form ? <ruby>{surface}<rp>(</rp><rt>{reading}</rt><rp>)</rp></ruby> : surface}
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
