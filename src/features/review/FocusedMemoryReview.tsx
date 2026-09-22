import { StudyText } from '../../components/StudyText';
import { ArrowLeft, CheckCircle2, Eye, RotateCcw, Target, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { itemAnalysis, itemMeaning, itemMemory } from '../../domain/items';
import type { MemoryCardField } from '../../domain/memoryCards';
import type { Locale, VocabItem } from '../../types';

export type MemoryRating = 'forgot' | 'hard' | 'remembered' | 'easy';

export function FocusedMemoryReview({ items, locale, frontFields, backFields, onExit, onRate }: {
  items: VocabItem[];
  locale: Locale;
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

  const example = item.examples?.find((candidate) => !isMetaLearningExample(candidate.ja));
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
                <ConfiguredMemoryCardContent item={item} locale={locale} fields={frontFields} revealed={false} />
              </div>
            </article>
            <article className="ledger-memory-card ledger-memory-face ledger-memory-back" aria-hidden={!revealed}>
              <div className="ledger-memory-content">
                <ConfiguredMemoryCardContent item={item} locale={locale} fields={backFields} example={example} revealed />
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

const memoryFieldLabels: Record<Locale, Record<MemoryCardField | 'example', string>> = {
  'zh-CN': {
    original: '原词 / 语法', reading: '读音', jlpt_level: 'JLPT 等级', part_of_speech: '词性',
    meaning: '释义', meaning_ja: '日文释义', paraphrase_ja: '日文换言', core_memory: '记忆点', explanation_zh: '详细解析',
    analysis: '补充分析', grammar_forms: '接续形式', grammar_features: '语法特征', base_form: '基本形', conjugations: '活用',
    collocations: '常用搭配', comparisons: '比较辨析', usage_register: '使用语域', exam_register_zh: '考试提示', everyday_alternatives: '日常替代表达',
    notes: '备注', tags: '标签', source_grammar_point: '来源语法点', source_chat_summary: '学习来源摘要', example: '例句',
  },
  ja: {
    original: '語句 / 文法', reading: '読み方', jlpt_level: 'JLPT レベル', part_of_speech: '品詞',
    meaning: '意味', meaning_ja: '日本語の意味', paraphrase_ja: '日本語の言い換え', core_memory: '記憶ポイント', explanation_zh: '詳しい解説',
    analysis: '補足分析', grammar_forms: '接続形式', grammar_features: '文法の特徴', base_form: '基本形', conjugations: '活用',
    collocations: 'よく使う組み合わせ', comparisons: '比較・使い分け', usage_register: '使用場面', exam_register_zh: '試験ポイント', everyday_alternatives: '日常表現',
    notes: 'メモ', tags: 'タグ', source_grammar_point: '出典文法項目', source_chat_summary: '学習元の要約', example: '例文',
  },
  en: {
    original: 'Word / grammar', reading: 'Reading', jlpt_level: 'JLPT level', part_of_speech: 'Part of speech',
    meaning: 'Meaning', meaning_ja: 'Japanese definition', paraphrase_ja: 'Japanese paraphrase', core_memory: 'Memory point', explanation_zh: 'Detailed explanation',
    analysis: 'Additional analysis', grammar_forms: 'Connection forms', grammar_features: 'Grammar features', base_form: 'Base form', conjugations: 'Conjugations',
    collocations: 'Collocations', comparisons: 'Comparisons', usage_register: 'Usage register', exam_register_zh: 'Exam tip', everyday_alternatives: 'Everyday alternatives',
    notes: 'Notes', tags: 'Tags', source_grammar_point: 'Source grammar point', source_chat_summary: 'Learning source summary', example: 'Example',
  },
};

function ConfiguredMemoryCardContent({ item, locale, fields, example, revealed }: {
  item: VocabItem;
  locale: Locale;
  fields: MemoryCardField[];
  example?: NonNullable<VocabItem['examples']>[number];
  revealed: boolean;
}) {
  const entries = fields
    .filter((field) => field !== 'paraphrase_ja')
    .map((field) => ({ field, content: memoryFieldContent(item, locale, field) }))
    .filter((entry): entry is { field: MemoryCardField; content: ReactNode } => entry.content !== null);
  const original = entries.find((entry) => entry.field === 'original');
  const grammarForms = entries.find((entry) => entry.field === 'grammar_forms');
  const meaning = entries.find((entry) => entry.field === 'meaning');
  const summaryFields = revealed
    ? entries.filter((entry) => ['reading', 'jlpt_level', 'part_of_speech'].includes(entry.field))
    : [];
  const details = entries.filter((entry) => (
    entry.field !== 'original'
    && entry.field !== 'grammar_forms'
    && entry.field !== 'meaning'
    && !summaryFields.some((summary) => summary.field === entry.field)
  ));
  const coreMemory = details.find((entry) => entry.field === 'core_memory');
  const supportingDetails = details.filter((entry) => entry.field !== 'core_memory');
  return (
    <>
      {revealed && (original || summaryFields.length) ? (
        <div className="ledger-memory-back-summary">
          {original ? <h1 lang="ja">{original.content}</h1> : null}
          {summaryFields.length ? (
            <dl>
              {summaryFields.map(({ field, content }) => (
                <div key={field} className={`ledger-memory-summary-field ledger-memory-summary-field--${field}`}>
                  <dt>{memoryFieldLabels[locale][field]}</dt>
                  <dd>{content}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : original ? <h1 lang="ja">{original.content}</h1> : null}
      {grammarForms || meaning || details.length || example ? (
        <div className={`ledger-memory-answer ${revealed ? '' : 'is-front'}`}>
          {grammarForms ? <div className="ledger-memory-featured">{grammarForms.content}</div> : null}
          {meaning ? <p className="ledger-memory-configured-meaning">{meaning.content}</p> : null}
          <dl>
            {supportingDetails.map(({ field, content }) => (
              <div key={field} className={`ledger-memory-field ledger-memory-field--${memoryFieldPresentation(field)}`}>
                <dt>{memoryFieldLabels[locale][field]}</dt>
                <dd>{content}</dd>
              </div>
            ))}
            {example ? <div className="ledger-memory-field ledger-memory-field--narrative"><dt>{memoryFieldLabels[locale].example}</dt><dd><span lang="ja">{example.ja}</span><small>{example.zh}</small></dd></div> : null}
            {coreMemory ? (
              <div className="ledger-memory-field ledger-memory-field--memory">
                <dt>{memoryFieldLabels[locale].core_memory}</dt>
                <dd>{coreMemory.content}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : !revealed ? <span className="ledger-memory-rule" /> : null}
    </>
  );
}

function memoryFieldPresentation(field: MemoryCardField) {
  if (['reading', 'base_form', 'source_grammar_point'].includes(field)) return 'cue';
  if (['jlpt_level', 'part_of_speech', 'usage_register', 'tags'].includes(field)) return 'meta';
  return 'narrative';
}

function isMetaLearningExample(value: string) {
  return /教材(?:の第\d+週)?では[「『].+[」』]という表現を学んだ/u.test(value);
}

function memoryFieldContent(item: VocabItem, locale: Locale, field: MemoryCardField): ReactNode | null {
  const scalar = (value: unknown, lang?: string) => typeof value === 'string' && value.trim() ? <span lang={lang}>{value}</span> : null;
  switch (field) {
    case 'original': return scalar(item.original, 'ja');
    case 'reading': return scalar(item.reading, 'ja');
    case 'jlpt_level': return scalar(item.jlpt_level);
    case 'part_of_speech': return scalar(item.part_of_speech);
    case 'meaning': return scalar(itemMeaning(item, locale));
    case 'meaning_ja': return scalar(item.meaning_ja, 'ja');
    case 'paraphrase_ja': return scalar(item.paraphrase_ja, 'ja');
    case 'core_memory': return itemMemory(item, locale) ? <StudyText text={itemMemory(item, locale) ?? ''} /> : null;
    case 'explanation_zh': return item.explanation_zh ? <StudyText text={item.explanation_zh ?? ''} /> : null;
    case 'analysis': return itemAnalysis(item, locale) ? <StudyText text={itemAnalysis(item, locale) ?? ''} /> : null;
    case 'base_form': return scalar(item.base_form, 'ja');
    case 'usage_register': return scalar(item.usage_register_zh ?? item.usage_register);
    case 'exam_register_zh': return scalar(item.exam_register_zh);
    case 'source_grammar_point': return scalar(item.source_grammar_point, 'ja');
    case 'source_chat_summary': return scalar(item.source_chat_summary);
    case 'collocations': return stringList(item.collocations, 'ja');
    case 'notes': return stringList(item.notes);
    case 'tags': return stringList(item.tags);
    case 'conjugations': return item.conjugations?.length ? <ConjugationPattern item={item} /> : null;
    case 'grammar_forms': return item.grammar_forms?.length ? <span>{item.grammar_forms.map((entry) => [entry.form, entry.connection_zh, entry.meaning_zh].filter(Boolean).join('：')).join(' · ')}</span> : null;
    case 'grammar_features': return item.grammar_features?.length ? <span>{item.grammar_features.map((entry) => [entry.feature, entry.detail_zh].filter(Boolean).join('：')).join(' · ')}</span> : null;
    case 'comparisons': {
      const comparisons = [
        ...(item.comparisons ?? []).map((entry) => [entry.target, entry.difference_zh].filter(Boolean).join('：')),
        ...(item.comparison_notes ?? []).map((entry) => [entry.target, entry.difference_zh].filter(Boolean).join('：')),
      ].filter(Boolean);
      return stringList(comparisons, 'ja');
    }
    case 'everyday_alternatives': return item.everyday_alternatives?.length ? <span>{item.everyday_alternatives.map((entry) => [entry.ja, entry.zh].filter(Boolean).join('：')).join(' · ')}</span> : null;
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

function stringList(values: string[] | undefined, lang?: string) {
  return values?.length ? <span lang={lang}>{values.join(' · ')}</span> : null;
}
