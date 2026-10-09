// 知識ライブラリ画面の表示文字（UI 言語ごと）。
import type { Locale } from '../../types';
import type { KnowledgeKind, LevelRange, PartOfSpeech, ReviewState } from '../../v3/types';

const zh = {
  wordsTitle: '单词', grammarTitle: '语法', search: '搜索写法、读音、罗马音、释义或编号', allWordbooks: '全部单词本', allLevels: '全部等级', allStatuses: '全部状态',
  allKinds: '全部类别', due: '待复习', sortRecent: '最近添加', sortCode: '编号', sortExpression: '读音', sortDue: '复习时间', total: (n: number) => `共 ${n} 条`,
  empty: '没有符合条件的知识点', loading: '读取中…', previous: '上一页', next: '下一页', page: (a: number, b: number) => `${a} / ${b}`,
  manageWordbooks: '管理单词本', back: '返回列表', wordbooks: '单词本', newWordbook: '新单词本名称', create: '新建', rename: '改名', save: '保存', cancel: '取消', remove: '删除',
  confirmRemove: (title: string) => `删除单词本「${title}」？`, statsTotal: '总数', statsWords: '单词', statsGrammar: '语法', statsNames: '人名', statsDue: '待复习', statsNew: '未学', statsMastered: '已掌握',
  meaning: '释义', meaningJa: '日语释义', paraphrase: '言い換え', explanation: '说明', examples: '例句', patterns: '句型', memoryPoints: '记忆要点', notes: '补充', comparisons: '辨析',
  conjugations: '活用', alternateForms: '其他写法', relatedWords: '相关词', sources: '出处', tags: '标签', questions: '相关题目', sourceSentence: '遇到的句子', review: '复习',
  memoryImage: '记忆图', fallback: (lang: string) => `暂无当前语言，显示 ${lang}`, exception: '例外', reviewCount: (n: number) => `已复习 ${n} 次`, dueAt: '下次复习', interval: (d: number) => `间隔 ${d} 天`,
  wordbook: '单词本', level: '等级', pos: '词性', transitivity: { transitive: '他动词', intransitive: '自动词', both: '自他两用' }, suruNoun: 'する名词',
  register: { written: '书面语', spoken: '口语', formal: '正式', both: '书面口语皆可' }, noteKind: { register: '语体', exam_tip: '考点', key_point: '要点', other: '补充' },
  comparisonKind: { synonym: '近义', everyday: '日常说法' }, loadError: '读取失败', retry: '重试',
};
type Text = typeof zh;
const ja: Text = {
  ...zh, wordsTitle: '単語', grammarTitle: '文法', search: '表記・読み・ローマ字・意味・番号で検索', allWordbooks: 'すべての単語帳', allLevels: 'すべてのレベル', allStatuses: 'すべての状態',
  allKinds: 'すべての種類', due: '復習待ち', sortRecent: '追加順', sortCode: '番号順', sortExpression: '読み順', sortDue: '復習日順', total: (n) => `${n} 件`,
  empty: '条件に合う項目はありません', loading: '読み込み中…', previous: '前へ', next: '次へ', manageWordbooks: '単語帳の管理', back: '一覧に戻る', wordbooks: '単語帳',
  newWordbook: '新しい単語帳の名前', create: '作成', rename: '名前を変更', save: '保存', cancel: 'キャンセル', remove: '削除', confirmRemove: (title) => `単語帳「${title}」を削除しますか？`,
  statsTotal: '合計', statsWords: '単語', statsGrammar: '文法', statsNames: '人名', statsDue: '復習待ち', statsNew: '未学習', statsMastered: '習得済み',
  meaning: '意味', meaningJa: '日本語の意味', explanation: '解説', examples: '例文', patterns: '文型', memoryPoints: '覚え方', notes: '補足', comparisons: '使い分け', conjugations: '活用',
  alternateForms: '別表記', relatedWords: '関連語', sources: '出典', tags: 'タグ', questions: '関連問題', sourceSentence: '出会った文', review: '復習', memoryImage: '記憶イメージ',
  fallback: (lang) => `この言語の文はまだありません（${lang} を表示）`, exception: '例外', reviewCount: (n) => `${n} 回復習`, dueAt: '次の復習', interval: (d) => `間隔 ${d} 日`,
  wordbook: '単語帳', level: 'レベル', pos: '品詞', transitivity: { transitive: '他動詞', intransitive: '自動詞', both: '自他両用' }, suruNoun: 'サ変名詞',
  register: { written: '書き言葉', spoken: '話し言葉', formal: '改まった表現', both: '書き言葉・話し言葉' }, noteKind: { register: '文体', exam_tip: '試験のポイント', key_point: '要点', other: '補足' },
  comparisonKind: { synonym: '類義語', everyday: '日常表現' }, loadError: '読み込みに失敗しました', retry: '再試行',
};
const en: Text = {
  ...zh, wordsTitle: 'Words', grammarTitle: 'Grammar', search: 'Search spelling, reading, romaji, meaning or code', allWordbooks: 'All wordbooks', allLevels: 'All levels', allStatuses: 'All states',
  allKinds: 'All kinds', due: 'Due', sortRecent: 'Recently added', sortCode: 'Code', sortExpression: 'Reading', sortDue: 'Due date', total: (n) => `${n} items`,
  empty: 'Nothing matches these filters', loading: 'Loading…', previous: 'Previous', next: 'Next', manageWordbooks: 'Manage wordbooks', back: 'Back to list', wordbooks: 'Wordbooks',
  newWordbook: 'New wordbook name', create: 'Create', rename: 'Rename', save: 'Save', cancel: 'Cancel', remove: 'Delete', confirmRemove: (title) => `Delete the wordbook “${title}”?`,
  statsTotal: 'Total', statsWords: 'Words', statsGrammar: 'Grammar', statsNames: 'Names', statsDue: 'Due', statsNew: 'New', statsMastered: 'Mastered',
  meaning: 'Meaning', meaningJa: 'Japanese definition', paraphrase: 'Paraphrase', explanation: 'Explanation', examples: 'Examples', patterns: 'Patterns', memoryPoints: 'Memory points',
  notes: 'Notes', comparisons: 'Compare', conjugations: 'Conjugation', alternateForms: 'Other spellings', relatedWords: 'Related words', sources: 'Sources', tags: 'Tags',
  questions: 'Linked questions', sourceSentence: 'Where you met it', review: 'Review', memoryImage: 'Memory image', fallback: (lang) => `Not available in this language yet; showing ${lang}`,
  exception: 'Exception', reviewCount: (n) => `Reviewed ${n} times`, dueAt: 'Next review', interval: (d) => `Interval ${d} days`, wordbook: 'Wordbook', level: 'Level', pos: 'Part of speech',
  transitivity: { transitive: 'Transitive', intransitive: 'Intransitive', both: 'Transitive and intransitive' }, suruNoun: 'Takes する',
  register: { written: 'Written', spoken: 'Spoken', formal: 'Formal', both: 'Written and spoken' }, noteKind: { register: 'Register', exam_tip: 'Exam tip', key_point: 'Key point', other: 'Note' },
  comparisonKind: { synonym: 'Synonym', everyday: 'Everyday wording' }, loadError: 'Could not load', retry: 'Retry',
};
export const libraryText = (locale: Locale): Text => (locale === 'ja' ? ja : locale === 'en' ? en : zh);

const POS_LABELS: Record<Locale, Record<PartOfSpeech, string>> = {
  'zh-CN': { verb_1: '一类动词（五段）', verb_2: '二类动词（一段）', verb_3_suru: '三类动词（する）', verb_3_kuru: '三类动词（来る）', i_adjective: 'い形容词', na_adjective: 'な形容词',
    noun: '名词', adverb: '副词', conjunction: '接续词', adnominal: '连体词', interjection: '感叹词', prefix: '前缀', suffix: '后缀', phrase: '词组', idiom: '惯用语' },
  ja: { verb_1: '動詞Ⅰ（五段）', verb_2: '動詞Ⅱ（一段）', verb_3_suru: '動詞Ⅲ（する）', verb_3_kuru: '動詞Ⅲ（来る）', i_adjective: 'イ形容詞', na_adjective: 'ナ形容詞',
    noun: '名詞', adverb: '副詞', conjunction: '接続詞', adnominal: '連体詞', interjection: '感動詞', prefix: '接頭辞', suffix: '接尾辞', phrase: '連語', idiom: '慣用句' },
  en: { verb_1: 'Group 1 verb (godan)', verb_2: 'Group 2 verb (ichidan)', verb_3_suru: 'Group 3 verb (する)', verb_3_kuru: 'Group 3 verb (来る)', i_adjective: 'i-adjective',
    na_adjective: 'na-adjective', noun: 'Noun', adverb: 'Adverb', conjunction: 'Conjunction', adnominal: 'Adnominal', interjection: 'Interjection', prefix: 'Prefix', suffix: 'Suffix',
    phrase: 'Phrase', idiom: 'Idiom' },
};
export const posLabel = (locale: Locale, pos: PartOfSpeech | null) => (pos ? POS_LABELS[locale][pos] : '');

const KIND_LABELS: Record<Locale, Record<KnowledgeKind, string>> = {
  'zh-CN': { word: '单词', grammar: '语法', name: '人名' }, ja: { word: '単語', grammar: '文法', name: '人名' }, en: { word: 'Word', grammar: 'Grammar', name: 'Name' },
};
export const kindLabel = (locale: Locale, kind: KnowledgeKind) => KIND_LABELS[locale][kind];

const STATUS_LABELS: Record<Locale, Record<ReviewState, string>> = {
  'zh-CN': { new: '未学', learning: '学习中', review: '复习中', mastered: '已掌握' }, ja: { new: '未学習', learning: '学習中', review: '復習中', mastered: '習得済み' },
  en: { new: 'New', learning: 'Learning', review: 'Reviewing', mastered: 'Mastered' },
};
export const statusLabel = (locale: Locale, status: ReviewState) => STATUS_LABELS[locale][status];

export const levelLabel = (level: LevelRange | null) => (!level ? '' : level.min === level.max ? level.max : `${level.min}–${level.max}`);

const LANGUAGE_NAMES: Record<string, string> = { ja: '日本語', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', en: 'English', ko: '한국어', vi: 'Tiếng Việt', id: 'Bahasa Indonesia',
  th: 'ไทย', my: 'မြန်မာ', ne: 'नेपाली', es: 'Español', fr: 'Français' };
export const languageName = (code: string) => LANGUAGE_NAMES[code] ?? code;
