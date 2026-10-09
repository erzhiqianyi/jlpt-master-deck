// AI 草稿、练习、模拟考试、快照、练习记录、作答、学习事件、复习、自评、学习计划、每日总结、跟读录音。
import { json, array, str, iso } from './context.mjs';
import { normalizeChoice, typeIdFor } from './normalize.mjs';

const DRAFT_STATUS = new Set(['draft', 'needs_revision', 'approved', 'archived']);
const DRAFT_KINDS = new Set(['daily_review_pack', 'grammar_practice']);
const STRATEGIES = new Set(['approved_draft_full_set', 'agent_topic', 'targeted_by_history']);
const LEVELS = new Set(['N1', 'N2', 'N3', 'N4', 'N5']);
const level = (value) => (LEVELS.has(str(value)) ? str(value) : null);

/** 草稿：先建草稿本身、分区、目标、批注；题目登记到题库，物化后再关联。 */
export function migrateDrafts(ctx, bank) {
  const links = [];
  for (const r of ctx.rows('review_pack_drafts', 'ORDER BY created_at')) {
    const content = json(r.content_json, {}) ?? {};
    ctx.unknown('review_pack_drafts.content_json', content, ['description', 'kind', 'strategy', 'target_level', 'practice_date', 'estimated_minutes', 'minutes',
      'generated_at', 'next_step', 'learning_objectives', 'sections', 'quiz', 'generated_practice', 'title']);
    const createdAt = iso(r.created_at, ctx.now);
    const updatedAt = iso(r.updated_at, createdAt);
    const { code } = ctx.code(r.user_id, 'DR');
    const rid = ctx.insert('ai_drafts', {
      user_id: r.user_id, code, status: DRAFT_STATUS.has(r.status) ? r.status : 'draft',
      kind: DRAFT_KINDS.has(content.kind) ? content.kind : null,
      strategy: ['targeted_by_history', 'agent_topic'].includes(content.strategy) ? content.strategy : null,
      target_level: level(content.target_level), practice_date: str(content.practice_date),
      minutes: Number.isFinite(Number(content.estimated_minutes ?? content.minutes)) && (content.estimated_minutes ?? content.minutes) !== null ? Number(content.estimated_minutes ?? content.minutes) : null,
      generated_at: iso(content.generated_at, null), created_at: createdAt, updated_at: updatedAt,
    });
    ctx.remember('draft', r.user_id, r.id, rid, code);
    ctx.text('ai_drafts', rid, 'title', 'zh-Hans', r.title ?? content.title);
    ctx.text('ai_drafts', rid, 'description', 'zh-Hans', content.description);
    ctx.text('ai_drafts', rid, 'next_step', 'zh-Hans', content.next_step);
    array(content.learning_objectives).map(str).filter(Boolean).forEach((objective, position) => {
      const objectiveRid = ctx.insert('ai_draft_objectives', { draft_rid: rid, position });
      ctx.text('ai_draft_objectives', objectiveRid, 'objective', 'zh-Hans', objective);
    });
    array(content.sections).forEach((section, position) => {
      const sectionRid = ctx.insert('ai_draft_sections', { draft_rid: rid, position, instruction: str(section?.instruction) });
      ctx.text('ai_draft_sections', sectionRid, 'title', 'zh-Hans', section?.title);
      ctx.text('ai_draft_sections', sectionRid, 'body', 'zh-Hans', section?.body);
      array(section?.questions).forEach((question, i) => {
        const copy = bank.add({ source: 'draft', userId: r.user_id, question, updatedAt });
        if (copy) links.push({ copy, draftRid: rid, sectionRid, role: 'section', position: i });
      });
    });
    for (const [role, key] of [['quiz', 'quiz'], ['generated', 'generated_practice']]) {
      array(content[key]).forEach((question, i) => {
        const copy = bank.add({ source: 'draft', userId: r.user_id, question, updatedAt });
        if (copy) links.push({ copy, draftRid: rid, sectionRid: null, role, position: i });
      });
    }
    array(json(r.annotations_json, [])).forEach((comment) => {
      if (!str(comment?.body)) return;
      const { code: commentCode } = ctx.code(r.user_id, 'DC');
      const at = iso(comment.created_at, updatedAt);
      ctx.insert('ai_draft_comments', { draft_rid: rid, code: commentCode, body: str(comment.body), created_at: at, updated_at: at });
    });
  }
  return () => {
    const seen = new Set();
    for (const link of links) {
      if (!link.copy.resolved) continue;
      const key = `${link.draftRid}\u0000${link.role}\u0000${link.sectionRid}\u0000${link.position}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ctx.insert('ai_draft_questions', { draft_rid: link.draftRid, section_rid: link.sectionRid, role: link.role, position: link.position, question_rid: link.copy.resolved.questionRid });
    }
  };
}

/** 每日练习、专项练习（daily_practices）与模拟考试（mock_exams）。 */
export function migratePracticeSets(ctx, bank) {
  const pending = [];
  for (const r of ctx.rows('daily_practices', 'ORDER BY created_at')) {
    const p = json(r.practice_json, {}) ?? {};
    ctx.unknown('daily_practices.practice_json', p, ['id', 'date', 'version', 'title', 'minutes', 'strategy', 'sourceDraftId', 'description', 'content_origin',
      'verification_status', 'generated_at', 'disclaimer', 'sourceSummary', 'source_title', 'sections', 'questions', 'filters']);
    const kind = p.strategy === 'agent_topic' ? 'topic' : p.filters ? 'mixed' : 'daily';
    const { code } = ctx.code(r.user_id, kind === 'daily' ? 'DP' : 'TP');
    const createdAt = iso(r.created_at, ctx.now);
    const updatedAt = iso(r.updated_at, createdAt);
    const rid = ctx.insert('practice_sets', {
      user_id: r.user_id, code, kind, practice_date: str(r.practice_date) ?? str(p.date), version: r.version ?? p.version ?? 1,
      minutes: r.minutes ?? p.minutes ?? null, strategy: STRATEGIES.has(p.strategy) ? p.strategy : null, level: null,
      source_draft_rid: p.sourceDraftId ? ctx.lookup('draft', r.user_id, p.sourceDraftId) : null,
      generated_at: iso(p.generated_at, null), created_at: createdAt, updated_at: updatedAt,
    });
    ctx.remember('practice', r.user_id, r.id, rid, code);
    ctx.text('practice_sets', rid, 'title', 'zh-Hans', p.title ?? r.title);
    ctx.text('practice_sets', rid, 'description', 'zh-Hans', p.description);
    ctx.text('practice_sets', rid, 'disclaimer', 'zh-Hans', p.disclaimer);
    ctx.text('practice_sets', rid, 'source_summary', 'zh-Hans', p.sourceSummary ?? p.source_title);
    if (p.filters) {
      const f = p.filters;
      ctx.insert('practice_set_filters', {
        set_rid: rid, wordbook_rid: f.wordbookId ? ctx.lookup('wordbook', r.user_id, f.wordbookId) : null, jlpt_level: level(f.jlptLevel),
        only_due: f.onlyDue === true, question_count: Number.isFinite(Number(f.count)) && f.count !== null ? Number(f.count) : null,
      });
      pending.push({ filterKinds: { rid, kinds: array(f.kinds), statuses: array(f.statuses) } });
    }
    // 分区：按 questionCount 依次分配题目
    const sections = array(p.sections).map((section, position) => {
      const sectionRid = ctx.insert('practice_sections', { set_rid: rid, position, instruction: str(section?.instruction), scheduled_date: null, duration_minutes: null });
      ctx.text('practice_sections', sectionRid, 'title', 'zh-Hans', section?.title);
      return { rid: sectionRid, count: Number(section?.questionCount) || 0 };
    });
    let sectionIndex = 0;
    let used = 0;
    array(p.questions).forEach((question, position) => {
      while (sections[sectionIndex] && sections[sectionIndex].count && used >= sections[sectionIndex].count && sectionIndex < sections.length - 1) { sectionIndex += 1; used = 0; }
      const copy = bank.add({ source: 'practice', userId: r.user_id, question, updatedAt });
      used += 1;
      if (copy) pending.push({ entry: { setRid: rid, sectionRid: sections[sectionIndex]?.rid ?? null, position, copy } });
    });
  }
  for (const r of ctx.rows('mock_exams', 'ORDER BY created_at')) {
    const content = json(r.content_json, {}) ?? {};
    const { code } = ctx.code(r.user_id, 'MX');
    const createdAt = iso(r.created_at, ctx.now);
    const updatedAt = iso(r.updated_at, createdAt);
    const rid = ctx.insert('practice_sets', {
      user_id: r.user_id, code, kind: 'mock', practice_date: null, version: 1, minutes: null, strategy: null, level: level(content.level),
      source_draft_rid: null, generated_at: null, created_at: createdAt, updated_at: updatedAt,
    });
    ctx.remember('practice', r.user_id, r.id, rid, code);
    ctx.text('practice_sets', rid, 'title', 'zh-Hans', content.title);
    ctx.text('practice_sets', rid, 'description', 'zh-Hans', content.description);
    let position = 0;
    array(content.sessions).forEach((session, sectionPosition) => {
      const sectionRid = ctx.insert('practice_sections', {
        set_rid: rid, position: sectionPosition, instruction: null, scheduled_date: str(session?.scheduledDate),
        duration_minutes: Number.isFinite(Number(session?.durationMinutes)) && session?.durationMinutes !== null ? Number(session.durationMinutes) : null,
      });
      ctx.text('practice_sections', sectionRid, 'title', 'zh-Hans', session?.title);
      ctx.text('practice_sections', sectionRid, 'description', 'zh-Hans', session?.description);
      array(session?.questions).forEach((question) => {
        const copy = bank.add({ source: 'mock', userId: r.user_id, question: { ...question, prompt: question.prompt ?? question.passage }, updatedAt });
        if (copy) pending.push({ entry: { setRid: rid, sectionRid, position: position++, copy } });
      });
    });
  }
  return (typeIdFor) => {
    for (const item of pending) {
      if (item.filterKinds) {
        for (const kind of new Set(item.filterKinds.kinds)) {
          const typeId = typeIdFor({ kind });
          if (typeId) ctx.insert('practice_set_filter_types', { set_rid: item.filterKinds.rid, type_id: typeId });
        }
        for (const status of new Set(item.filterKinds.statuses)) {
          if (['new', 'learning', 'review', 'mastered'].includes(status)) ctx.insert('practice_set_filter_statuses', { set_rid: item.filterKinds.rid, status });
        }
        continue;
      }
      const { setRid, sectionRid, position, copy } = item.entry;
      if (!copy.resolved) { ctx.warn('practice.entry_question_missing', { setRid, position, id: copy.question.id }); continue; }
      ctx.insert('practice_set_entries', { set_rid: setRid, section_rid: sectionRid, position, question_rid: copy.resolved.questionRid });
    }
  };
}

/** 题目快照（旧 question_reference_snapshots）：只作为题目副本参与去重。 */
export function addSnapshots(ctx, bank) {
  for (const r of ctx.rows('question_reference_snapshots')) {
    const question = json(r.question_json, null);
    if (question) bank.add({ source: 'snapshot', userId: r.user_id, question: { ...question, id: question.id ?? r.id }, updatedAt: ctx.now });
  }
}

const ATTEMPT_KIND = { 'daily-practice': 'daily', vocabulary: 'vocabulary', grammar: 'grammar', reading: 'reading', listening: 'listening', mixed: 'mixed', 'mock-exams': 'mock' };

/** 作答时所选、正确选项的文字与编号。 */
function answerFor(ctx, userId, questionId, selected, questionsByRid) {
  const questionRid = ctx.lookup('question', userId, questionId);
  if (!questionRid) return { questionRid: null };
  const info = questionsByRid.get(questionRid);
  const optionRid = info?.optionsByText.get(normalizeChoice(selected)) ?? null;
  return { questionRid, optionRid, correctText: info?.correctText ?? null };
}

/** 练习记录（practice_state）、作答状态（answers）、学习事件、复习、自评。 */
export function migrateActivity(ctx, questionsByRid) {
  const stats = { attempts: 0, answers: 0, answersUnmatched: 0, schedulesSkipped: {} };
  for (const r of ctx.rows('practice_state')) {
    const history = array(json(r.attempt_history_json, []));
    const active = json(r.active_attempt_json, null);
    const attempts = [...history.map((a) => ({ a, active: false })), ...(active ? [{ a: active, active: true }] : [])];
    attempts.sort((x, y) => String(x.a.startedAt ?? '').localeCompare(String(y.a.startedAt ?? '')));
    for (const { a, active: isActive } of attempts) {
      if (!a || typeof a !== 'object') continue;
      ctx.unknown('practice_state.attempt', a, ['id', 'deck', 'view', 'title', 'practiceId', 'startedAt', 'completedAt', 'analysisStatus', 'analysisStartedAt',
        'analysisCompletedAt', 'questionIds', 'answers', 'questionManifest', 'summary']);
      const { code } = ctx.code(r.user_id, 'AT');
      const startedAt = iso(a.startedAt, iso(r.updated_at, ctx.now));
      const attemptRid = ctx.insert('practice_attempts', {
        user_id: r.user_id, code, set_rid: a.practiceId ? ctx.lookup('practice', r.user_id, a.practiceId) : null,
        kind: ATTEMPT_KIND[a.view] ?? 'mixed', is_active: isActive && !a.completedAt,
        started_at: startedAt, completed_at: iso(a.completedAt, null),
        analysis_status: ['idle', 'running', 'completed', 'failed'].includes(a.analysisStatus) ? a.analysisStatus : 'idle',
        analysis_started_at: iso(a.analysisStartedAt, null), analysis_completed_at: iso(a.analysisCompletedAt, null),
        created_at: startedAt, updated_at: iso(a.completedAt, startedAt),
      });
      ctx.remember('attempt', r.user_id, a.id, attemptRid, code);
      ctx.text('practice_attempts', attemptRid, 'title', 'zh-Hans', a.title);
      stats.attempts += 1;
      const answers = new Map(array(a.answers).map((x) => [x?.questionId, x]));
      const manifest = new Map(array(a.questionManifest).map((m) => [m?.instanceId, m]));
      const ids = array(a.questionIds).length ? array(a.questionIds) : [...answers.keys()];
      ids.forEach((questionId, position) => {
        const answer = answers.get(questionId);
        const resolved = answerFor(ctx, r.user_id, questionId, answer?.selected, questionsByRid);
        const missing = !resolved.questionRid || manifest.get(questionId)?.status === 'missingOriginal' && !resolved.questionRid;
        if (answer && !resolved.optionRid && resolved.questionRid) stats.answersUnmatched += 1;
        ctx.insert('attempt_answers', {
          attempt_rid: attemptRid, position, entry_rid: null, question_rid: resolved.questionRid,
          status: missing ? 'missing_original' : answer ? 'answered' : 'presented',
          selected_option_rid: resolved.optionRid ?? null, selected_text: str(answer?.selected), correct_text: resolved.correctText ?? null,
          correct: answer ? Boolean(answer.correct) : null, answer_text: null, recording_rid: null,
          started_at: iso(answer?.startedAt, null), answered_at: iso(answer?.answeredAt, null),
          elapsed_ms: Number.isFinite(Number(answer?.elapsedMs)) && answer?.elapsedMs !== null ? Number(answer.elapsedMs) : null,
        });
        stats.answers += 1;
      });
    }
  }
  // 每道题的最新作答
  const latest = new Map();
  for (const r of ctx.rows('answers', 'ORDER BY answered_at')) {
    const resolved = answerFor(ctx, r.user_id, r.question_id, r.selected, questionsByRid);
    if (!resolved.questionRid) { ctx.warn('answers.question_missing', { userId: r.user_id, questionId: r.question_id }); continue; }
    latest.set(`${r.user_id}\u0000${resolved.questionRid}`, { r, resolved });
  }
  for (const { r, resolved } of latest.values()) {
    ctx.insert('question_answer_states', {
      user_id: r.user_id, question_rid: resolved.questionRid, selected_option_rid: resolved.optionRid ?? null, selected_text: str(r.selected),
      correct: r.correct === null ? null : Boolean(r.correct), answered_at: iso(r.answered_at, ctx.now),
      submission_state: r.submission_state === 'draft' ? 'draft' : 'submitted', event_id: str(r.answer_event_id),
    });
  }
  const SOURCES = new Set(['ios', 'web', 'app', 'mcp']);
  for (const r of ctx.rows('learning_events')) {
    const payload = json(r.payload_json, {}) ?? {};
    const userId = r.owner ?? r.user_id;
    const resolved = payload.questionId ? answerFor(ctx, userId, payload.questionId, payload.selected, questionsByRid) : { questionRid: null };
    ctx.insert('learning_events', {
      user_id: userId, event_id: r.event_id, event_type: r.event_type === 'MemoryRated' ? 'MemoryRated' : 'AnswerSubmitted',
      occurred_at: iso(r.occurred_at, ctx.now), received_at: iso(r.received_at, ctx.now), payload_hash: r.payload_hash ?? '',
      question_rid: resolved.questionRid, point_rid: payload.itemId ? ctx.lookup('item', userId, payload.itemId) : null,
      selected_option_rid: resolved.optionRid ?? null, selected_text: str(payload.selected),
      correct: typeof payload.correct === 'boolean' ? payload.correct : null, type_id: null,
      rating: ['forgot', 'hard', 'remembered', 'easy'].includes(payload.rating) ? payload.rating : null,
      source: SOURCES.has(payload.source) ? payload.source : null, count_outcome: str(payload.countOutcome),
    });
  }
  const schedule = (tableName, r) => {
    const p = json(r.progress_json, {}) ?? {};
    const pointRid = ctx.lookup('item', r.user_id, r.item_id);
    if (!pointRid) { ctx.warn(`${tableName}.item_missing`, { userId: r.user_id, itemId: r.item_id }); return; }
    if (!['learning', 'review', 'mastered'].includes(p.status)) { stats.schedulesSkipped[tableName] = (stats.schedulesSkipped[tableName] ?? 0) + 1; return; } // 未开始学习（new）不建进度
    ctx.insert(tableName, {
      user_id: r.user_id, point_rid: pointRid, status: p.status, review_count: Number(p.reviewCount) || 0,
      ease: Math.min(3, Math.max(1.3, Number(p.ease) || 2.5)), interval_days: Number(p.intervalDays) || 0,
      due_at: iso(p.nextReviewAt, null), first_seen_at: iso(p.firstSeenAt, null), last_reviewed_at: iso(p.lastReviewedAt, null),
      last_attempt_rid: p.lastPracticeSessionId ? ctx.lookup('attempt', r.user_id, p.lastPracticeSessionId) : null,
      updated_at: iso(r.updated_at, ctx.now),
    });
  };
  for (const r of ctx.rows('progress')) schedule('review_schedules', r);
  for (const r of ctx.rows('card_review_sync_baselines')) schedule('review_schedule_baselines', r);
  for (const r of ctx.rows('card_reviews', 'ORDER BY reviewed_at')) {
    const pointRid = ctx.lookup('item', r.user_id, r.item_id);
    if (!pointRid || !['forgot', 'hard', 'remembered', 'easy'].includes(r.rating)) { ctx.warn('card_reviews.skipped', { userId: r.user_id, itemId: r.item_id, rating: r.rating }); continue; }
    ctx.insert('memory_ratings', {
      user_id: r.user_id, event_id: r.event_id, point_rid: pointRid, rating: r.rating, reviewed_at: iso(r.reviewed_at, ctx.now),
      source: SOURCES.has(r.source) ? r.source : 'app',
    });
  }
  ctx.report.activity = stats;
}

/** 学习计划、每日总结、跟读录音。 */
export function migratePlansReports(ctx) {
  for (const r of ctx.rows('study_plans')) {
    const plan = json(r.plan_json, {}) ?? {};
    const profile = plan.profile ?? {};
    const updatedAt = iso(r.updated_at, ctx.now);
    ctx.insert('learning_plans', {
      user_id: r.user_id, exam_name: str(profile.examName), level: level(profile.level), start_date: str(profile.startDate), exam_date: str(profile.examDate),
      study_days_per_week: Number(profile.studyDaysPerWeek) >= 1 && Number(profile.studyDaysPerWeek) <= 7 ? Number(profile.studyDaysPerWeek) : null,
      daily_minutes: Number.isFinite(Number(profile.dailyMinutes)) && profile.dailyMinutes !== null ? Number(profile.dailyMinutes) : null,
      material_start_status: str(profile.materialStartStatus),
      status: ['profile_only', 'ready', 'needs_refresh'].includes(plan.status) ? plan.status : 'profile_only',
      generated_at: iso(plan.generatedAt, null), created_at: updatedAt, updated_at: updatedAt,
    });
    const owner = r.user_id; // 计划一用户一份，译文以 user_id 为 owner_rid
    for (const field of ['fixed_schedule', 'supplemental_needs', 'phase_strategy', 'post_material_strategy', 'goal']) {
      const key = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      ctx.text('learning_plans', owner, field, 'zh-Hans', profile[key]);
    }
    const materials = new Map();
    array(profile.materials).forEach((m, position) => {
      const rid = ctx.insert('learning_plan_materials', { user_id: owner, position, module: ['vocabulary', 'grammar', 'reading', 'listening'].includes(m?.module) ? m.module : 'other' });
      ctx.text('learning_plan_materials', rid, 'title', 'zh-Hans', m?.title);
      ctx.text('learning_plan_materials', rid, 'current_position', 'zh-Hans', m?.currentPosition);
      if (m?.id) materials.set(m.id, rid);
    });
    array(plan.tasks).sort((a, b) => String(a?.date).localeCompare(String(b?.date))).forEach((task) => {
      if (!str(task?.date)) return;
      const { code } = ctx.code(owner, 'TK');
      const rid = ctx.insert('learning_plan_tasks', {
        user_id: owner, code, scheduled_date: task.date,
        module: ['vocabulary', 'grammar', 'reading', 'listening'].includes(task.module) ? task.module : 'other',
        minutes: Number(task.minutes) || null, material_rid: task.materialId ? materials.get(task.materialId) ?? null : null,
        workload_kind: str(task.workloadKind),
        status: ['pending', 'completed', 'skipped', 'missed'].includes(task.status) ? task.status : 'pending',
        completed_at: iso(task.completedAt, null), created_at: updatedAt, updated_at: updatedAt,
      });
      ctx.text('learning_plan_tasks', rid, 'title', 'zh-Hans', task.title);
      ctx.text('learning_plan_tasks', rid, 'detail', 'zh-Hans', task.detail);
      ctx.text('learning_plan_tasks', rid, 'source_label', 'zh-Hans', task.sourceLabel);
    });
    array(plan.phases).forEach((phase, position) => {
      if (!str(phase?.startDate) || !str(phase?.endDate)) return;
      const rid = ctx.insert('learning_plan_phases', { user_id: owner, position, start_date: phase.startDate, end_date: phase.endDate });
      ctx.text('learning_plan_phases', rid, 'focus', 'zh-Hans', phase.focus);
      ctx.text('learning_plan_phases', rid, 'goal', 'zh-Hans', phase.goal);
      array(phase.points).map(str).filter(Boolean).forEach((point, i) => {
        const pointRid = ctx.insert('learning_plan_phase_points', { phase_rid: rid, position: i });
        ctx.text('learning_plan_phase_points', pointRid, 'point', 'zh-Hans', point);
      });
    });
  }
  for (const r of ctx.rows('daily_summaries', 'ORDER BY date')) {
    const stats = json(r.stats_json, {}) ?? {};
    const at = iso(r.updated_at, ctx.now);
    const rid = ctx.insert('daily_reports', {
      user_id: r.user_id, summary_date: r.date, time_zone: str(r.time_zone) ?? 'Asia/Tokyo', total_questions: r.total_questions ?? 0,
      correct_count: r.correct_count ?? 0, incorrect_count: r.incorrect_count ?? 0, accuracy: r.accuracy ?? null,
      unique_items: stats.uniqueItems ?? null, generated_at: iso(r.generated_at, null), created_at: at, updated_at: at,
    });
    ctx.text('daily_reports', rid, 'summary', 'zh-Hans', r.summary_zh);
    for (const [kindName, entries] of [['strength', json(r.strengths_json, [])], ['weakness', json(r.weaknesses_json, [])]]) {
      array(entries).forEach((entry, position) => {
        const pointRid = ctx.insert('daily_report_points', { report_rid: rid, kind: kindName, position });
        ctx.text('daily_report_points', pointRid, 'label', 'zh-Hans', entry?.label);
        ctx.text('daily_report_points', pointRid, 'detail', 'zh-Hans', entry?.detail);
      });
    }
    array(json(r.confusion_groups_json, [])).forEach((group, position) => {
      const confusionRid = ctx.insert('daily_report_confusions', { report_rid: rid, position });
      ctx.text('daily_report_confusions', confusionRid, 'topic', 'zh-Hans', group?.topic);
      for (const itemId of new Set(array(group?.items))) {
        const pointRid = ctx.lookup('item', r.user_id, itemId);
        if (pointRid) ctx.insert('daily_report_confusion_points', { confusion_rid: confusionRid, point_rid: pointRid });
      }
      for (const questionId of new Set(array(group?.evidenceQuestionIds))) {
        const questionRid = ctx.lookup('question', r.user_id, questionId);
        if (questionRid) ctx.insert('daily_report_confusion_questions', { confusion_rid: confusionRid, question_rid: questionRid });
      }
    });
    array(json(r.recommendations_json, [])).forEach((rec, position) => {
      const recRid = ctx.insert('daily_report_recommendations', { report_rid: rid, position, type: ['review', 'practice', 'quality', 'priority', 'card_review'].includes(rec?.type) ? rec.type : 'practice' });
      ctx.text('daily_report_recommendations', recRid, 'title', 'zh-Hans', rec?.title);
      ctx.text('daily_report_recommendations', recRid, 'detail', 'zh-Hans', rec?.detail);
    });
    // 按题型统计：旧题型名换算后同一题型合并
    const typeStats = new Map();
    for (const s of array(stats.byKind)) {
      const typeId = typeIdFor({ kind: s?.kind });
      if (!typeId) { ctx.warn('daily_reports.unknown_kind', { date: r.date, kind: s?.kind }); continue; }
      const sum = typeStats.get(typeId) ?? { total: 0, correct: 0, incorrect: 0 };
      sum.total += Number(s.total) || 0; sum.correct += Number(s.correct) || 0; sum.incorrect += Number(s.incorrect) || 0;
      typeStats.set(typeId, sum);
    }
    for (const [typeId, sum] of typeStats) {
      ctx.insert('daily_report_type_stats', { report_rid: rid, type_id: typeId, ...sum, accuracy: sum.total ? sum.correct / sum.total : null });
    }
    array(json(r.wrong_questions_json, [])).forEach((w, position) => {
      ctx.insert('daily_report_wrong_answers', {
        report_rid: rid, position, question_rid: w?.questionId ? ctx.lookup('question', r.user_id, w.questionId) : null,
        point_rid: w?.itemId ? ctx.lookup('item', r.user_id, w.itemId) : null, selected: str(w?.selected), correct_answer: str(w?.correctAnswer),
      });
    });
  }
  for (const r of ctx.rows('listening_recordings', 'ORDER BY created_at')) {
    const analysis = json(r.analysis_json, {}) ?? {};
    const at = iso(r.created_at, ctx.now);
    const mediaRid = ctx.insert('media_files', { user_id: r.user_id, kind: 'audio', file_name: null, mime: str(r.audio_mime) ?? 'audio/mp4', size: r.audio_size ?? 0, sha256: '', storage_path: r.audio_path ?? '', created_at: at, updated_at: at });
    const { code } = ctx.code(r.user_id, 'RC');
    const rid = ctx.insert('speaking_recordings', {
      user_id: r.user_id, code, question_rid: r.listening_question_id ? ctx.lookup('question', r.user_id, r.listening_question_id) : null,
      audio_media_rid: mediaRid, status: ['pending', 'analyzing', 'completed', 'failed'].includes(r.status) ? r.status : 'pending',
      transcript: str(analysis.transcript), reference_transcript: str(analysis.referenceTranscript), created_at: at, updated_at: iso(r.updated_at, at),
    });
    ctx.remember('recording', r.user_id, r.id, rid, code);
    ctx.text('speaking_recordings', rid, 'summary', 'zh-Hans', analysis.summary);
    ctx.text('speaking_recordings', rid, 'next_practice', 'zh-Hans', analysis.nextPractice);
    for (const [kindName, notes] of [['strength', analysis.strengths], ['improvement', analysis.improvements]]) {
      array(notes).map(str).filter(Boolean).forEach((note, position) => {
        const noteRid = ctx.insert('speaking_recording_notes', { recording_rid: rid, kind: kindName, position });
        ctx.text('speaking_recording_notes', noteRid, 'note', 'zh-Hans', note);
      });
    }
  }
}
