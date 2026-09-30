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
      setError(e instanceof Error ? e.message : "操作失败，请重试");
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
      setNotice(result.alreadyImported ? '这份内容已在你的内容中' : `已添加到我的${shareKind === 'wordbook' ? '单词本' : shareKind === 'listening' ? '听力题库' : '专项练习'}`);
      try { await onAdded(); }
      catch { throw new Error('内容已添加，但列表刷新失败，请刷新页面查看'); }
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
    { key: "import", icon: <Plus size={16} aria-hidden="true" />, label: "添加到我的内容", appliesTo: (id) => !mineIds.has(id),
      run: (id) => request("/api/market/import", "POST", { shareId: id }), after: onAdded },
    { key: "withdraw", danger: true, icon: <Undo2 size={16} aria-hidden="true" />, label: "撤回分享", appliesTo: (id) => mineIds.has(id),
      confirm: (count) => `将撤回你的 ${count} 份分享，其他人将无法再看到。`,
      run: (id) => request(`/api/market/${id}`, "DELETE"), after: refresh },
  ];
  const visibleShares = mobileList.mobile ? filtered.slice(0, mobileList.visible) : filtered.slice(currentPage * 8, currentPage * 8 + 8);
  return (
    <section className="discovery-panel">
      <header className="discovery-heading"><h1>发现</h1></header>
      {error && <p role="alert" className="market-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!preview && <LearningListFrame className="learning-catalog topic-library" label="分享列表">
        <LearningListHeader title="分享" count={`${filtered.length} ${kind === "all" ? "项" : kind === "practice" ? "套" : kind === "listening" ? "段" : "本"}`} search={<LearningListSearch value={query} onChange={(value) => { setQuery(value); setPage(0); }} label="搜索分享" placeholder="搜索分享"/>}>
          <LearningListSelect label="分享范围" hideLabel value={tab} onChange={(value) => { setTab(value as "market" | "mine"); setPage(0); }}>
            <option value="market">全部分享</option><option value="mine">我的分享</option>
          </LearningListSelect>
          <div className="list-tools" aria-label="内容分类">
            {([["all", "全部"], ["wordbook", "单词"], ["practice", "专项练习"], ["listening", "听力"]] as const).map(([value, label]) =>
              <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setPage(0); }}>{label}</button>
            )}
          </div>
          <div className="list-tools"><BatchManageButton batch={batch} /></div>
        </LearningListHeader>
        <BatchActionBar batch={batch} actions={batchActions} />
        {busy ? <p role="status" className="list-empty">加载中…</p> :
          !error && <LearningList hasActions selection={batch.selection} columnLabels={["分享内容", "内容简介", "类型"]}>{visibleShares.map((s) =>
            <LearningListRow key={s.id} selectId={s.id} title={s.title} status={s.kind === "practice" ? "练习" : s.kind === "listening" ? "听力" : "单词本"}
              description={`${s.count} ${s.kind === "wordbook" ? "词" : "题"}${s.description ? " · " + s.description : ""}`}
              onOpen={() => { window.location.hash = `#/market/${encodeURIComponent(s.id)}`; }}
              inlineActions secondary={<div className="market-row-actions">
                <button type="button" aria-label={`添加${s.title}到我的内容`} title="添加到我的内容" className="market-row-add" disabled={busy} onClick={() => void addShare(s.id, s.kind)}><Plus size={18} aria-hidden="true"/><span>加入</span></button>
                {s.mine && <button type="button" aria-label="撤回分享" title="撤回分享" className="market-row-withdraw" disabled={busy} onClick={() => void run(async () => {
                await request(`/api/market/${s.id}`, "DELETE");
                await refresh(); setNotice("已撤回");
              })}><Undo2 size={18} aria-hidden="true" /></button>}
              </div>} />
          )}</LearningList>}
        {mobileList.mobile && filtered.length ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobileList.visible >= filtered.length ? "已经到底了" : null}</div> : null}
        {!mobileList.mobile && pageCount > 1 ? <LearningListPagination page={currentPage} pages={pageCount} onChange={setPage} summary={`${currentPage * 8 + 1}-${Math.min(currentPage * 8 + 8, filtered.length)} / ${filtered.length}`}/> : null}
      </LearningListFrame>}
      {preview && (
        <section className="market-preview" aria-label="分享内容预览">
          <h2>{preview.title}</h2>
          {preview.description && <p>{preview.description}</p>}
          <button type="button" className="cute-button px-4 py-2" disabled={busy} onClick={() => void addShare(previewId!, preview.kind)}>{busy ? "添加中…" : "添加到我的内容"}</button>
          {preview.kind === 'listening' && previewId ? <SharedListening content={preview} shareId={previewId} token={token} /> : null}
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

function SharedListening({ content, shareId, token }: { content: SharedContent; shareId: string; token: string }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setAudioUrl(''); setError('');
    void fetch(`/api/market/${encodeURIComponent(shareId)}/audio`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('分享音频暂时无法播放');
        return response.blob();
      })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); if (active) setAudioUrl(objectUrl); else URL.revokeObjectURL(objectUrl); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '音频加载失败'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [shareId, token]);
  return <div className="mt-5 space-y-4">
    <p className="text-sm text-[#31564c]">{content.audioFileName} · {content.questions?.length ?? 0} 题</p>
    {audioUrl ? <audio controls src={audioUrl} className="w-full" aria-label="分享听力音频" /> : <p role={error ? 'alert' : 'status'}>{error || '正在加载音频…'}</p>}
    <ol className="space-y-3">{content.questions?.map((question, index) => <li key={index} className="rounded-lg border p-3">
      <strong>{index + 1}. {question.title || question.question}</strong>
      {question.title && question.question && question.title !== question.question ? <p>{question.question}</p> : null}
      {question.choices.length ? <ol className="ml-5 list-decimal">{question.choices.map((choice, i) => <li key={i}>{choice}</li>)}</ol> : null}
    </li>)}</ol>
    {content.transcript ? <details><summary>听力原文</summary><p className="whitespace-pre-wrap">{content.transcript}</p></details> : null}
    {content.transcriptTranslation ? <details><summary>原文翻译</summary><p className="whitespace-pre-wrap">{content.transcriptTranslation}</p></details> : null}
  </div>;
}
