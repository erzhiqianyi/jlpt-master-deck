import { loadDiscoveryShares } from '../../lib/discovery';
import { Plus, Undo2 } from 'lucide-react';
import { PracticePanel, PracticeReviewPanel } from "../practice/StudyPanels";
import type { Question, AnswerState, DisplaySettings, Locale } from "../../types";
import { LearningList, LearningListFrame, LearningListHeader, LearningListPagination, LearningListRow, LearningListSearch, LearningListSelect } from "../../components/LearningList";
import { useMobileList } from "../../hooks/useMobileList";
import { BatchActionBar, BatchManageButton, useListBatch, type BatchAction } from "../../components/ListBatch";
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

type SharedContent = {
  format: "jlpt-share";
  version: 1;
  kind: "practice" | "wordbook" | "listening";
  title: string;
  description: string;
  questions?: {
    prompt?: string;
    choices: string[];
    answer?: string;
    title?: string;
    questionTypeId?: string;
    question?: string;
    choiceDetails?: { translation: string; explanation: string }[];
    explanation?: string;
    answerIndex?: number;
    correctReason?: string;
    kind?: Question["kind"];
    instruction?: string;
    promptTarget?: string;
    translationZh?: string;
    context?: string;
    memoryPoint?: string;
    choiceAnalysis?: Question["choiceAnalysis"];
  }[];
  items?: { original: string; reading?: string; meaning_zh?: string }[];
  audioFileName?: string;
  transcript?: string;
  transcriptTranslation?: string;
};
type Share = {
  id: string;
  title: string;
  kind: SharedContent["kind"];
  description: string;
  count: number;
  mine: boolean;
};
export function MarketPanel({
  token, initialShareId,
  labels, settings, locale, onAdded,
}: {
  token: string;
  onAdded: () => Promise<void>;
  initialShareId?: string;
  labels: Record<string, string>;
  settings: DisplaySettings;
  locale: Locale;
}) {
  const [tab, setTab] = useState<"market" | "mine">("market");
  const [kind, setKind] = useState<SharedContent["kind"] | "all">("all");
  const [shares, setShares] = useState<Share[]>([]);
  const [preview, setPreview] = useState<SharedContent | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const copy = marketCopy(locale);

  const request = <T,>(path: string, method = "GET", body?: unknown) =>
    apiRequest<T>(path, { token, method, body });
  async function refresh() {
    setShares(await loadDiscoveryShares(token));
  }
  async function getContent(id: string): Promise<SharedContent> {
    return (await request<{ package: SharedContent }>(`/api/market/${id}`)).package;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error && e.message === copy.addedRefreshFailed ? e.message : copy.failed);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void run(async () => {
      await refresh();
      if (initialShareId) {
        const content = await getContent(initialShareId);
        if (active) { setPreview(content); setPreviewId(initialShareId); }
      } else if (active) setPreview(null);
    });
    return () => { active = false; };
  }, [token, initialShareId]);
  function clearPreview() {
    setPreview(null);
    setPreviewId(null);
    if (window.location.hash.startsWith('#/market/')) window.location.hash = '#/market';
  }
  async function addShare(id: string, shareKind: SharedContent['kind']) {
    await run(async () => {
      const result = await request<{ alreadyImported?: boolean }>("/api/market/import", "POST", { shareId: id });
      setNotice(result.alreadyImported ? copy.alreadyAdded : `${copy.addedTo}${shareKind === 'wordbook' ? copy.wordbooks : shareKind === 'listening' ? copy.listeningBank : copy.topicPractice}`);
      try { await onAdded(); }
      catch { throw new Error(copy.addedRefreshFailed); }
    });
  }
  const filtered = shares.filter((s) => (kind === "all" || s.kind === kind) && (tab !== "mine" || s.mine) &&
    `${s.title} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const mobileList = useMobileList(filtered.length, `${tab}:${kind}:${query}`, 8);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pageCount - 1);
  const batch = useListBatch(filtered.map((s) => s.id));
  const mineIds = new Set(shares.filter((s) => s.mine).map((s) => s.id));
  const batchActions: BatchAction[] = [
    { key: "import", icon: <Plus size={16} aria-hidden="true" />, label: copy.addToMine, appliesTo: (id) => !mineIds.has(id),
      run: (id) => request("/api/market/import", "POST", { shareId: id }), after: onAdded },
    { key: "withdraw", danger: true, icon: <Undo2 size={16} aria-hidden="true" />, label: copy.withdraw, appliesTo: (id) => mineIds.has(id),
      confirm: (count) => copy.withdrawConfirm(count),
      run: (id) => request(`/api/market/${id}`, "DELETE"), after: refresh },
  ];
  const visibleShares = mobileList.mobile ? filtered.slice(0, mobileList.visible) : filtered.slice(currentPage * 8, currentPage * 8 + 8);
  return (
    <section className="discovery-panel">
      <header className="discovery-heading"><h1>{copy.discover}</h1></header>
      {error && <p role="alert" className="market-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!preview && <LearningListFrame className="learning-catalog topic-library" label={copy.shareList}>
        <LearningListHeader title={copy.shares} count={`${filtered.length} ${kind === "all" ? copy.items : kind === "practice" ? copy.sets : kind === "listening" ? copy.clips : copy.books}`} search={<LearningListSearch value={query} onChange={(value) => { setQuery(value); setPage(0); }} label={copy.search} placeholder={copy.search} locale={locale}/> }>
          <LearningListSelect label={copy.shareScope} hideLabel value={tab} onChange={(value) => { setTab(value as "market" | "mine"); setPage(0); }}>
            <option value="market">{copy.allShares}</option><option value="mine">{copy.myShares}</option>
          </LearningListSelect>
          <div className="list-tools" aria-label={copy.categories}>
            {([["all", copy.all], ["wordbook", copy.words], ["practice", copy.topicPractice], ["listening", copy.listening]] as const).map(([value, label]) =>
              <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setPage(0); }}>{label}</button>
            )}
          </div>
          <div className="list-tools"><BatchManageButton batch={batch} locale={locale} /></div>
        </LearningListHeader>
        <BatchActionBar batch={batch} actions={batchActions} locale={locale} />
        {busy ? <p role="status" className="list-empty">{copy.loading}</p> :
          !error && <LearningList hasActions selection={batch.selection} locale={locale} columnLabels={[copy.content, copy.description, copy.type]}>{visibleShares.map((s) =>
            <LearningListRow key={s.id} selectId={s.id} title={s.title} status={s.kind === "practice" ? copy.practice : s.kind === "listening" ? copy.listening : copy.wordbooks} locale={locale}
              description={`${s.count} ${s.kind === "wordbook" ? copy.wordUnit : copy.questionUnit}${s.description ? " · " + s.description : ""}`}
              onOpen={() => { window.location.hash = `#/market/${encodeURIComponent(s.id)}`; }}
              inlineActions secondary={<div className="market-row-actions">
                <button type="button" aria-label={`${copy.addToMine}: ${s.title}`} title={copy.addToMine} className="market-row-add" disabled={busy} onClick={() => void addShare(s.id, s.kind)}><Plus size={18} aria-hidden="true"/><span>{copy.add}</span></button>
                {s.mine && <button type="button" aria-label={copy.withdraw} title={copy.withdraw} className="market-row-withdraw" disabled={busy} onClick={() => void run(async () => {
                await request(`/api/market/${s.id}`, "DELETE");
                await refresh(); setNotice(copy.withdrawn);
              })}><Undo2 size={18} aria-hidden="true" /></button>}
              </div>} />
          )}</LearningList>}
        {mobileList.mobile && filtered.length ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobileList.visible >= filtered.length ? copy.endOfList : null}</div> : null}
        {!mobileList.mobile && pageCount > 1 ? <LearningListPagination page={currentPage} pages={pageCount} onChange={setPage} summary={`${currentPage * 8 + 1}-${Math.min(currentPage * 8 + 8, filtered.length)} / ${filtered.length}`} previous={copy.previous} next={copy.next}/> : null}
      </LearningListFrame>}
      {preview && (
        <section className="market-preview" aria-label={copy.preview}>
          <h2>{preview.title}</h2>
          {preview.description && <p>{preview.description}</p>}
          <button type="button" className="cute-button px-4 py-2" disabled={busy} onClick={() => void addShare(previewId!, preview.kind)}>{busy ? copy.adding : copy.addToMine}</button>
          {preview.kind === 'listening' && previewId ? <SharedListening content={preview} shareId={previewId} token={token} locale={locale} /> : null}
          {preview.kind === 'practice' && preview.questions && <SharedPractice content={preview} labels={labels} settings={settings} locale={locale} onBack={clearPreview} />}
          <ol>
            {preview.items?.map((item, i) => (
              <li key={i}>
                <strong>{item.original}</strong> {item.reading}
                <p>{item.meaning_zh}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}

function SharedPractice({ content, labels, settings, locale, onBack }: {
  content: SharedContent; labels: Record<string, string>; settings: DisplaySettings; locale: Locale; onBack: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [review, setReview] = useState(false);
  const questions: Question[] = (content.questions ?? []).map((q, i) => ({
    ...q, prompt: q.prompt ?? '', answer: q.answer ?? '', id: `shared-${i}`, itemId: `shared-${i}`, kind: q.kind ?? 'meaning',
    title: content.title, context: q.context ?? '', correctReason: q.correctReason ?? '',
    memoryPoint: q.memoryPoint ?? '', choiceAnalysis: q.choiceAnalysis ?? [],
  }));
  const restart = () => { setIndex(0); setAnswers({}); setReview(false); };
  if (review) return <PracticeReviewPanel questions={questions} answers={answers} items={[]} labels={labels}
    practiceTitle={content.title} locale={locale} showRuby={settings.showReviewRuby} onRestart={restart} onBackToPractice={() => setReview(false)} />;
  return <PracticePanel activeQuestion={questions[index]} questions={questions} questionsLength={questions.length}
    activeIndex={index} answeredCount={Object.keys(answers).length} complete={questions.length > 0 && Object.keys(answers).length === questions.length}
    feedbackMode="immediate" answers={answers} items={[]} labels={labels} questionTypeLabel={content.title} settings={settings}
    onAnswer={(q, selected) => setAnswers((previous) => ({ ...previous, [q.id]: { selected, correct: selected === q.answer } }))}
    onPrev={() => setIndex(Math.max(0, index - 1))} onNext={() => setIndex(Math.min(questions.length - 1, index + 1))}
    onJump={setIndex} onRestart={restart} onPracticeHome={onBack} onPrepareReview={async () => {}} onReview={() => setReview(true)}
    analysisStatus="idle" />;
}

function SharedListening({ content, shareId, token, locale }: { content: SharedContent; shareId: string; token: string; locale: Locale }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');
  const copy = marketCopy(locale);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setAudioUrl(''); setError('');
    void fetch(`/api/market/${encodeURIComponent(shareId)}/audio`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(copy.audioUnavailable);
        return response.blob();
      })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); if (active) setAudioUrl(objectUrl); else URL.revokeObjectURL(objectUrl); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : copy.audioFailed); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [shareId, token, locale]);
  return <div className="mt-5 space-y-4">
    <p className="text-sm text-[#31564c]">{content.audioFileName} · {content.questions?.length ?? 0} {copy.questionUnit}</p>
    {audioUrl ? <audio controls src={audioUrl} className="w-full" aria-label={copy.sharedAudio} /> : <p role={error ? 'alert' : 'status'}>{error || copy.audioLoading}</p>}
    <ol className="space-y-3">{content.questions?.map((question, index) => <li key={index} className="rounded-lg border p-3">
      <strong>{index + 1}. {question.title || question.question}</strong>
      {question.title && question.question && question.title !== question.question ? <p>{question.question}</p> : null}
      {question.choices.length ? <ol className="ml-5 list-decimal">{question.choices.map((choice, i) => <li key={i}>{choice}</li>)}</ol> : null}
    </li>)}</ol>
    {content.transcript ? <details><summary>{copy.transcript}</summary><p className="whitespace-pre-wrap">{content.transcript}</p></details> : null}
    {content.transcriptTranslation ? <details><summary>{copy.transcriptTranslation}</summary><p className="whitespace-pre-wrap">{content.transcriptTranslation}</p></details> : null}
  </div>;
}

function marketCopy(locale: Locale) {
  if (locale === 'ja') return {
    failed: '操作に失敗しました。もう一度お試しください', alreadyAdded: 'このコンテンツはすでに追加されています', addedTo: '追加先：', wordbooks: '単語帳', listeningBank: '聴解ライブラリ', topicPractice: '分野別練習', addedRefreshFailed: '追加しましたが、一覧を更新できませんでした。ページを再読み込みしてください',
    addToMine: '自分のコンテンツに追加', withdraw: '共有を取り消す', withdrawConfirm: (count: number) => `${count} 件の共有を取り消します。他のユーザーには表示されなくなります。`, withdrawn: '共有を取り消しました',
    discover: '発見', shareList: '共有コンテンツの一覧', shares: '共有コンテンツ', items: '件', sets: 'セット', clips: '件', books: '冊', search: '共有コンテンツを検索', shareScope: '共有範囲', allShares: 'すべての共有', myShares: '自分の共有', categories: 'コンテンツの種類', all: 'すべて', words: '単語', listening: '聴解',
    content: '共有コンテンツ', description: '概要', type: '種類', practice: '練習', wordUnit: '語', questionUnit: '問', add: '追加', loading: '読み込み中…', endOfList: '最後まで表示しました', previous: '前のページ', next: '次のページ', preview: '共有コンテンツのプレビュー', adding: '追加中…',
    audioUnavailable: '共有された音声を再生できません', audioFailed: '音声を読み込めませんでした', sharedAudio: '共有された聴解音声', audioLoading: '音声を読み込み中…', transcript: '聴解の全文', transcriptTranslation: '全文の翻訳',
  };
  if (locale === 'en') return {
    failed: 'Action failed. Please try again', alreadyAdded: 'This content is already in your library', addedTo: 'Added to ', wordbooks: 'wordbooks', listeningBank: 'listening library', topicPractice: 'topic practice', addedRefreshFailed: 'Added, but the list could not refresh. Reload the page to view it',
    addToMine: 'Add to my content', withdraw: 'Withdraw share', withdrawConfirm: (count: number) => `Withdraw ${count} shares? Others will no longer see them.`, withdrawn: 'Share withdrawn',
    discover: 'Discover', shareList: 'Shared content list', shares: 'Shared content', items: 'items', sets: 'sets', clips: 'clips', books: 'books', search: 'Search shared content', shareScope: 'Share scope', allShares: 'All shares', myShares: 'My shares', categories: 'Content types', all: 'All', words: 'Words', listening: 'Listening',
    content: 'Shared content', description: 'Description', type: 'Type', practice: 'Practice', wordUnit: 'words', questionUnit: 'questions', add: 'Add', loading: 'Loading…', endOfList: 'End of list', previous: 'Previous page', next: 'Next page', preview: 'Shared content preview', adding: 'Adding…',
    audioUnavailable: 'Shared audio is unavailable', audioFailed: 'Could not load audio', sharedAudio: 'Shared listening audio', audioLoading: 'Loading audio…', transcript: 'Full transcript', transcriptTranslation: 'Transcript translation',
  };
  return {
    failed: '操作失败，请重试', alreadyAdded: '这份内容已在你的内容中', addedTo: '已添加到我的', wordbooks: '单词本', listeningBank: '听力题库', topicPractice: '专项练习', addedRefreshFailed: '内容已添加，但列表刷新失败，请刷新页面查看',
    addToMine: '添加到我的内容', withdraw: '撤回分享', withdrawConfirm: (count: number) => `将撤回你的 ${count} 份分享，其他人将无法再看到。`, withdrawn: '已撤回',
    discover: '发现', shareList: '分享列表', shares: '分享', items: '项', sets: '套', clips: '段', books: '本', search: '搜索分享', shareScope: '分享范围', allShares: '全部分享', myShares: '我的分享', categories: '内容分类', all: '全部', words: '单词', listening: '听力',
    content: '分享内容', description: '内容简介', type: '类型', practice: '练习', wordUnit: '词', questionUnit: '题', add: '加入', loading: '加载中…', endOfList: '已经到底了', previous: '上一页', next: '下一页', preview: '分享内容预览', adding: '添加中…',
    audioUnavailable: '分享音频暂时无法播放', audioFailed: '音频加载失败', sharedAudio: '分享听力音频', audioLoading: '正在加载音频…', transcript: '听力原文', transcriptTranslation: '原文翻译',
  };
}
