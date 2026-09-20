import { ArrowRight, Bot, CalendarDays, ClipboardList, Flame, LogOut, Target, TrendingDown, TrendingUp, UserRound } from 'lucide-react';
import { useMemo } from 'react';
import type { AuthUser, LearningCapture, Locale, PracticeAttempt, ProgressState, QuestionKind, StudyPlanDocument } from '../../types';

type T = (zh: string, ja: string, en: string) => string;

const kinds: QuestionKind[] = ['grammar', 'moji_goi', 'meaning', 'kana_to_kanji', 'kanji_to_kana'];

/** Account page reached from the home greeting: what the learner has done, what stands out, and sign out. */
export function UserProfilePanel({ user, locale, attempts, captures, progress, plan, itemCount, onLogout }: {
  user: AuthUser;
  locale: Locale;
  attempts: PracticeAttempt[];
  captures: LearningCapture[];
  progress: ProgressState;
  plan: StudyPlanDocument;
  itemCount: number;
  onLogout: () => void;
}) {
  const t: T = (zh, ja, en) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  const stats = useMemo(() => summarize(attempts, captures, progress, plan), [attempts, captures, progress, plan]);
  const kindLabel = (kind: QuestionKind) => ({
    grammar: t('语法', '文法', 'Grammar'),
    moji_goi: t('文字词汇', '文字・語彙', 'Moji·goi'),
    meaning: t('释义', '意味', 'Meaning'),
    kana_to_kanji: t('假名→汉字', 'かな→漢字', 'Kana→kanji'),
    kanji_to_kana: t('汉字→假名', '漢字→かな', 'Kanji→kana'),
  })[kind];
  const insights = buildInsights(stats, t, kindLabel);
  const examDays = daysUntil(plan.profile.examDate);

  return (
    <section className="user-profile min-w-0">
      <header className="user-profile-hero">
        <span className="user-profile-avatar" aria-hidden="true"><UserRound size={34} /></span>
        <div className="min-w-0">
          <h1>{user.username}</h1>
          <p>{t(`JLPT ${plan.profile.level} · 距考试 ${examDays > 0 ? `${examDays} 天` : examDays === 0 ? '就是今天' : '已结束'}`, `JLPT ${plan.profile.level} · 試験まで ${examDays > 0 ? `${examDays} 日` : examDays === 0 ? '今日' : '終了'}`, `JLPT ${plan.profile.level} · ${examDays > 0 ? `${examDays} days to the exam` : examDays === 0 ? 'exam day' : 'exam passed'}`)}</p>
        </div>
      </header>

      <section className="user-profile-stats" aria-label={t('学习统计', '学習統計', 'Study statistics')}>
        <Stat label={t('累计答题', '累計解答', 'Questions answered')} value={String(stats.answered)} />
        <Stat label={t('总正确率', '正答率', 'Accuracy')} value={stats.answered ? `${Math.round(stats.accuracy * 100)}%` : '—'} />
        <Stat label={t('练习次数', '練習回数', 'Practice sessions')} value={String(stats.sessions)} />
        <Stat label={t('累计练习', '練習時間', 'Practice time')} value={t(`${stats.minutes} 分钟`, `${stats.minutes} 分`, `${stats.minutes} min`)} />
        <Stat label={t('连续学习', '連続学習', 'Streak')} value={t(`${stats.streak} 天`, `${stats.streak} 日`, `${stats.streak} d`)} icon={Flame} />
        <Stat label={t('最近 7 天', '直近 7 日', 'Last 7 days')} value={stats.recent.answered ? `${stats.recent.answered} · ${Math.round(stats.recent.accuracy * 100)}%` : '—'} />
        <Stat label={t('词条', '項目', 'Entries')} value={String(itemCount)} />
        <Stat label={t('已掌握', '習得済み', 'Mastered')} value={String(stats.mastered)} />
        <Stat label={t('待整理记录', '未整理メモ', 'Pending captures')} value={`${stats.pendingCaptures} / ${captures.length}`} icon={ClipboardList} />
        <Stat label={t('计划完成', '計画の完了', 'Plan done')} value={plan.tasks.length ? `${stats.planDone} / ${plan.tasks.length}` : '—'} icon={CalendarDays} />
      </section>

      <section className="user-profile-card" aria-label={t('各题型正确率', '種別ごとの正答率', 'Accuracy by question kind')}>
        <h2><Target size={20} aria-hidden="true" />{t('各题型正确率', '種別ごとの正答率', 'Accuracy by question kind')}</h2>
        {stats.byKind.length ? (
          <ul className="user-profile-kinds">
            {stats.byKind.map((row) => (
              <li key={row.kind}>
                <span className="user-profile-kind-label">{kindLabel(row.kind)}</span>
                <span className="user-profile-kind-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.accuracy * 100)} aria-label={kindLabel(row.kind)}><span style={{ width: `${Math.round(row.accuracy * 100)}%` }} className={row.accuracy < 0.6 ? 'is-low' : ''} /></span>
                <span className="user-profile-kind-value">{Math.round(row.accuracy * 100)}% <small>· {row.total}</small></span>
              </li>
            ))}
          </ul>
        ) : <p className="user-profile-empty">{t('还没有答题记录，做完第一组练习后这里会有数据。', 'まだ解答記録がありません。最初の練習を終えるとここに表示されます。', 'No answers yet — finish a first practice set and this fills in.')}</p>}
      </section>

      <section className="user-profile-card" aria-label={t('个性化分析', 'パーソナル分析', 'Personal analysis')}>
        <h2><TrendingUp size={20} aria-hidden="true" />{t('个性化分析', 'パーソナル分析', 'Personal analysis')}</h2>
        <ul className="user-profile-insights">
          {insights.map((insight) => {
            const Icon = insight.tone === 'down' ? TrendingDown : insight.tone === 'up' ? TrendingUp : Target;
            return <li key={insight.text} className={`is-${insight.tone}`}><Icon size={18} aria-hidden="true" /><span>{insight.text}</span></li>;
          })}
        </ul>
        <a href="#/about" className="user-profile-ai"><Bot size={18} aria-hidden="true" />{t('让接入的 AI 做更深入的分析', '接続した AI に詳しく分析してもらう', 'Ask a connected AI for a deeper analysis')}<ArrowRight size={16} aria-hidden="true" /></a>
      </section>

      <div className="user-profile-actions">
        <a href="#/settings" className="user-profile-link">{t('显示、练习和记忆卡设置', '表示・練習・記憶カードの設定', 'Display, practice and card settings')}<ArrowRight size={16} aria-hidden="true" /></a>
        <button type="button" onClick={onLogout} className="settings-logout-button"><LogOut size={18} />{t('退出登录', 'ログアウト', 'Log out')}</button>
      </div>
    </section>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Flame }) {
  return (
    <div className="user-profile-stat">
      <span>{Icon ? <Icon size={14} aria-hidden="true" /> : null}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type KindRow = { kind: QuestionKind; total: number; correct: number; accuracy: number };
type Stats = {
  answered: number; correct: number; accuracy: number; sessions: number; minutes: number; streak: number;
  recent: { answered: number; accuracy: number }; previous: { answered: number; accuracy: number };
  byKind: KindRow[]; mastered: number; pendingCaptures: number; planDone: number; planMissed: number;
};

function summarize(attempts: PracticeAttempt[], captures: LearningCapture[], progress: ProgressState, plan: StudyPlanDocument): Stats {
  const done = attempts.filter((attempt) => attempt.completedAt);
  const now = Date.now();
  const week = 7 * 86_400_000;
  let answered = 0; let correct = 0; let minutes = 0;
  const recent = { answered: 0, correct: 0 };
  const previous = { answered: 0, correct: 0 };
  const byKind = new Map<QuestionKind, { total: number; correct: number }>();
  const days = new Set<string>();
  for (const attempt of done) {
    const total = attempt.summary?.total ?? attempt.answers.length;
    const right = attempt.summary?.correct ?? attempt.answers.filter((answer) => answer.correct).length;
    answered += total; correct += right;
    minutes += Math.round((attempt.summary?.elapsedMs ?? attempt.answers.reduce((sum, answer) => sum + answer.elapsedMs, 0)) / 60_000);
    const age = now - new Date(attempt.completedAt!).getTime();
    if (age <= week) { recent.answered += total; recent.correct += right; } else if (age <= 2 * week) { previous.answered += total; previous.correct += right; }
    days.add(dayKey(attempt.completedAt!));
    for (const answer of attempt.answers) {
      const row = byKind.get(answer.kind) ?? { total: 0, correct: 0 };
      row.total += 1; if (answer.correct) row.correct += 1;
      byKind.set(answer.kind, row);
    }
  }
  let streak = 0;
  for (let offset = 0; ; offset += 1) {
    const key = dayKey(new Date(now - offset * 86_400_000).toISOString());
    if (days.has(key)) streak += 1;
    else if (offset === 0) continue; // today may still be ahead
    else break;
  }
  return {
    answered, correct, accuracy: answered ? correct / answered : 0, sessions: done.length, minutes, streak,
    recent: { answered: recent.answered, accuracy: recent.answered ? recent.correct / recent.answered : 0 },
    previous: { answered: previous.answered, accuracy: previous.answered ? previous.correct / previous.answered : 0 },
    byKind: kinds.filter((kind) => byKind.has(kind)).map((kind) => { const row = byKind.get(kind)!; return { kind, ...row, accuracy: row.total ? row.correct / row.total : 0 }; }),
    mastered: Object.values(progress).filter((entry) => entry.status === 'mastered').length,
    pendingCaptures: captures.filter((capture) => capture.status === 'inbox').length,
    planDone: plan.tasks.filter((task) => task.status === 'completed').length,
    planMissed: plan.tasks.filter((task) => task.status === 'missed').length,
  };
}

function buildInsights(stats: Stats, t: T, kindLabel: (kind: QuestionKind) => string) {
  const insights: { text: string; tone: 'up' | 'down' | 'flat' }[] = [];
  if (!stats.answered) {
    insights.push({ tone: 'flat', text: t('先完成一组今日练习，这里就会开始给出针对你的分析。', 'まず今日の練習を 1 セット終えると、ここにあなた向けの分析が出ます。', 'Finish one practice set and this starts giving analysis tailored to you.') });
    return insights;
  }
  const weakest = [...stats.byKind].filter((row) => row.total >= 5).sort((a, b) => a.accuracy - b.accuracy)[0];
  const strongest = [...stats.byKind].filter((row) => row.total >= 5).sort((a, b) => b.accuracy - a.accuracy)[0];
  if (weakest && weakest.accuracy < 0.75) {
    insights.push({ tone: 'down', text: t(`${kindLabel(weakest.kind)}是目前最薄弱的题型（${Math.round(weakest.accuracy * 100)}%，${weakest.total} 题），建议下一组练习专门练它。`, `${kindLabel(weakest.kind)}が現在いちばん弱い種別です（${Math.round(weakest.accuracy * 100)}%・${weakest.total} 問）。次の練習はこれに絞るのがおすすめ。`, `${kindLabel(weakest.kind)} is your weakest kind right now (${Math.round(weakest.accuracy * 100)}% over ${weakest.total}) — make the next set about it.`) });
  }
  if (strongest && strongest.kind !== weakest?.kind && strongest.accuracy >= 0.85) {
    insights.push({ tone: 'up', text: t(`${kindLabel(strongest.kind)}已经很稳（${Math.round(strongest.accuracy * 100)}%），可以少排一些时间。`, `${kindLabel(strongest.kind)}は安定しています（${Math.round(strongest.accuracy * 100)}%）。時間配分を減らしても大丈夫。`, `${kindLabel(strongest.kind)} is solid (${Math.round(strongest.accuracy * 100)}%) — you can give it less time.`) });
  }
  if (stats.recent.answered >= 10 && stats.previous.answered >= 10) {
    const delta = Math.round((stats.recent.accuracy - stats.previous.accuracy) * 100);
    if (Math.abs(delta) >= 5) {
      insights.push({ tone: delta > 0 ? 'up' : 'down', text: delta > 0
        ? t(`最近 7 天正确率比前一周高了 ${delta} 个百分点，保持这个节奏。`, `直近 7 日の正答率は前週より ${delta} ポイント上がりました。このペースを維持。`, `Accuracy over the last 7 days is up ${delta} points on the week before — keep the pace.`)
        : t(`最近 7 天正确率比前一周低了 ${-delta} 个百分点，看看是不是换了更难的范围。`, `直近 7 日の正答率は前週より ${-delta} ポイント下がりました。範囲が難しくなっていないか確認を。`, `Accuracy over the last 7 days is down ${-delta} points on the week before — check whether the material got harder.`) });
    }
  }
  if (stats.recent.answered === 0) {
    insights.push({ tone: 'down', text: t('最近 7 天没有练习记录，先从一组 10 题的今日练习开始。', '直近 7 日は練習記録がありません。まず 10 問の今日の練習から。', 'No practice in the last 7 days — start with a 10-question set today.') });
  } else if (stats.streak >= 3) {
    insights.push({ tone: 'up', text: t(`已经连续学习 ${stats.streak} 天了。`, `${stats.streak} 日連続で学習中です。`, `You are on a ${stats.streak}-day streak.`) });
  }
  if (stats.pendingCaptures >= 5) {
    insights.push({ tone: 'flat', text: t(`有 ${stats.pendingCaptures} 条记录还没整理成词条，可以让 AI 一次补齐。`, `${stats.pendingCaptures} 件のメモが未整理です。AI にまとめて仕上げてもらえます。`, `${stats.pendingCaptures} captures are still unprocessed — a connected AI can expand them in one go.`) });
  }
  if (stats.planMissed > 0) {
    insights.push({ tone: 'flat', text: t(`计划里有 ${stats.planMissed} 项没完成，到「计划」里重排一下。`, `計画に未完了が ${stats.planMissed} 件あります。「計画」で組み直しを。`, `${stats.planMissed} plan tasks were missed — re-plan under Plan.`) });
  }
  if (!insights.length) {
    insights.push({ tone: 'up', text: t('各题型都比较均衡，继续按计划推进。', '各種別ともバランスが取れています。計画どおりに進めましょう。', 'All kinds look balanced — keep following the plan.') });
  }
  return insights;
}

function dayKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function daysUntil(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const today = new Date();
  return Math.ceil((new Date(year, month - 1, day).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
}
