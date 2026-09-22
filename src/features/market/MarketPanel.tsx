import { loadDiscoveryShares } from '../../lib/discovery';
import { Undo2 } from 'lucide-react';
import { PracticePanel, PracticeReviewPanel } from "../practice/StudyPanels";
import type { Question, AnswerState, DisplaySettings, Locale } from "../../types";
import { LearningList, LearningListFrame, LearningListHeader, LearningListPagination, LearningListRow, LearningListSearch, LearningListSelect } from "../../components/LearningList";
import { useMobileList } from "../../hooks/useMobileList";
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

type SharedContent = {
  format: "jlpt-share";
  version: 1;
  kind: "practice" | "wordbook";
  title: string;
  description: string;
  questions?: {
    prompt: string;
    choices: string[];
    answer: string;
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

  }
  const filtered = shares.filter((s) => (kind === "all" || s.kind === kind) && (tab !== "mine" || s.mine) &&
    `${s.title} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const mobileList = useMobileList(filtered.length, `${tab}:${kind}:${query}`, 8);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleShares = mobileList.mobile ? filtered.slice(0, mobileList.visible) : filtered.slice(currentPage * 8, currentPage * 8 + 8);
  return (
    <section className="discovery-panel">
      <header className="discovery-heading"><h1>发现</h1></header>
      {error && <p role="alert" className="market-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!preview && <LearningListFrame className="learning-catalog topic-library" label="分享列表">
        <LearningListHeader title="分享" count={`${filtered.length} ${kind === "all" ? "项" : kind === "practice" ? "套" : "本"}`} search={<LearningListSearch value={query} onChange={(value) => { setQuery(value); setPage(0); }} label="搜索分享" placeholder="搜索分享"/>}>
          <LearningListSelect label="分享范围" hideLabel value={tab} onChange={(value) => { setTab(value as "market" | "mine"); setPage(0); }}>
            <option value="market">全部分享</option><option value="mine">我的分享</option>
          </LearningListSelect>
          <div className="list-tools" aria-label="内容分类">
            {([["all", "全部"], ["wordbook", "单词"], ["practice", "专项练习"]] as const).map(([value, label]) =>
              <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setPage(0); }}>{label}</button>
            )}
          </div>
        </LearningListHeader>
        {busy ? <p role="status" className="list-empty">加载中…</p> :
          !error && <LearningList hasActions columnLabels={["分享内容", "内容简介", "类型"]}>{visibleShares.map((s) =>
            <LearningListRow key={s.id} title={s.title} status={s.kind === "practice" ? "练习" : "单词本"}
              description={`${s.count} ${s.kind === "practice" ? "题" : "词"}${s.description ? " · " + s.description : ""}`}
              onOpen={() => void run(async () => { clearPreview(); setPreview(await getContent(s.id)); setPreviewId(s.id); })}
              inlineActions secondary={s.mine && <button type="button" aria-label="撤回分享" title="撤回分享" className="cute-button-secondary px-3 py-2" disabled={busy} onClick={() => void run(async () => {
                await request(`/api/market/${s.id}`, "DELETE");
                await refresh(); setNotice("已撤回");
              })}><Undo2 size={20} aria-hidden="true" /></button>} />
          )}</LearningList>}
        {mobileList.mobile && filtered.length ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobileList.visible >= filtered.length ? "已经到底了" : null}</div> : null}
        {!mobileList.mobile && pageCount > 1 ? <LearningListPagination page={currentPage} pages={pageCount} onChange={setPage} summary={`${currentPage * 8 + 1}-${Math.min(currentPage * 8 + 8, filtered.length)} / ${filtered.length}`}/> : null}
      </LearningListFrame>}
      {preview && (
        <section className="market-preview" aria-label="分享内容预览">
          <button className="cute-button-secondary px-3 py-2" onClick={clearPreview}>返回列表</button>
          <h2>{preview.title}</h2>
          {preview.description && <p>{preview.description}</p>}
          <button type="button" className="cute-button px-4 py-2" disabled={busy} onClick={() => void run(async () => {
            const result = await request<{ alreadyImported?: boolean }>("/api/market/import", "POST", { shareId: previewId });
            setNotice(result.alreadyImported ? "这份内容已在你的内容中" : `已添加到我的${preview.kind === "wordbook" ? "单词本" : "专项练习"}`);
            try {
              await onAdded();
            } catch {
              throw new Error("内容已添加，但列表刷新失败，请刷新页面查看");
            }
          })}>{busy ? "添加中…" : "添加到我的内容"}</button>
          {preview.questions && <SharedPractice content={preview} labels={labels} settings={settings} locale={locale} onBack={clearPreview} />}
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
    ...q, id: `shared-${i}`, itemId: `shared-${i}`, kind: q.kind ?? 'meaning',
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
