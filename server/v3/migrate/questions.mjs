// 题库：收集所有来源的题目副本 → 按“题型 + 规范化题干 + 素材”去重 → 建题组、素材、小题、选项、标记、解析、证据。
// 每份旧副本都映射到新题目（以及选项编号），供作答记录、练习、草稿关联使用。
import { createHash } from 'node:crypto';
import { array, str, json } from './context.mjs';
import { typeIdFor, questionPrefix, detectLanguage, normalizePrompt, normalizeChoice, CUSTOM_KINDS, expectedTextOf } from './normalize.mjs';

const QUESTION_KEYS = ['id', 'kind', 'questionTypeId', 'type', 'title', 'instruction', 'prompt', 'question', 'promptTarget', 'target', 'tested',
  'tested_expression', 'grammar_point', 'context', 'choices', 'choiceAnalysis', 'distractor_notes', 'answer', 'answerIndex', 'correctReason',
  'explanation_zh', 'explanation', 'memoryPoint', 'translationZh', 'translation_zh', 'learningObjective', 'source_origin', 'source_reference',
  'source', 'source_kind', 'content_origin', 'verification_status', 'official_jlpt_question', 'order', 'full_order', 'target_blank_index',
  'supplemental', 'generated_from', 'target_reason', 'canonicalQuestionId', 'questionRevision', 'japaneseAnnotations', 'japanese_annotations',
  'sourceQuestionId', 'sourceDraftId', 'source_draft_id', 'itemId', 'item_id', 'form_analysis_zh', 'study_source', 'validation_sources',
  'passage', 'choiceExplanations', 'sourceUrl', 'sourceLabel', 'audioUrl', 'transcript', 'scoringReady', 'materialRefs', 'presentation'];
const SOURCE_PRIORITY = { practice: 6, mock: 5, snapshot: 4, reading: 4, listening: 4, item: 3, draft: 2 };
const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

export function createBank(ctx) {
  const copies = [];
  return {
    copies,
    /** 登记一份题目副本。question 为旧 JSON；extra 提供素材、来源、关联信息。 */
    add({ source, userId, question, updatedAt, ...extra }) {
      if (!question || typeof question !== 'object') return null;
      ctx.unknown(`question(${source})`, question, QUESTION_KEYS);
      const typeId = extra.typeId ?? typeIdFor(question, { source });
      const prompt = str(question.prompt ?? question.question);
      const copy = { source, userId, question, updatedAt: updatedAt ?? ctx.now, typeId, prompt, ...extra };
      if (CUSTOM_KINDS[question.kind]) ctx.warn('question.custom_kind_mapped', { source, userId, id: question.id, kind: question.kind, typeId });
      if (!typeId) { ctx.warn('question.unknown_type', { source, userId, id: question.id, kind: question.kind }); copy.skipped = true; }
      else if (!prompt && !extra.allowEmptyPrompt) { ctx.warn('question.missing_prompt', { source, userId, id: question.id }); copy.skipped = true; }
      copies.push(copy);
      return copy;
    },
    materialize: () => materialize(ctx, copies),
  };
}

function resolveAnswer(ctx, copy, choices) {
  const q = copy.question;
  if (copy.answerIndex !== undefined) return copy.answerIndex >= 0 && copy.answerIndex < choices.length ? copy.answerIndex : null;
  if (Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < choices.length) return q.answerIndex;
  if (q.answer !== undefined && q.answer !== null) {
    const matches = choices.flatMap((c, i) => (normalizeChoice(c) === normalizeChoice(q.answer) ? [i] : []));
    if (matches.length === 1) return matches[0];
    // 答案是卷面上的选项号（1–4），且没有选项文字等于它
    const number = /^[1-9]$/.test(normalizeChoice(q.answer)) ? Number(normalizeChoice(q.answer)) : null;
    if (number && number <= choices.length && !matches.length) {
      ctx.warn('question.answer_number_one_based', { id: q.id, answer: q.answer });
      return number - 1;
    }
  }
  return null;
}

/** 解析的各个部分（按副本的旧字段）。 */
function explanationParts(copy) {
  const q = copy.question;
  const basisText = str(q.correctReason) ?? str(q.explanation_zh) ?? str(q.explanation);
  const basisLanguage = str(q.explanation_zh) && !str(q.correctReason) ? 'zh-Hans' : detectLanguage(basisText);
  const fullOrder = Array.isArray(q.full_order) ? q.full_order.join('') : str(q.full_order);
  return {
    basis: basisText ? { text: basisText, language: basisLanguage } : null,
    tip: str(q.memoryPoint),
    objective: str(q.learningObjective),
    fullAnswer: fullOrder,
    steps: copy.steps ?? [],
    translation: str(q.translationZh) ?? str(q.translation_zh),
    formAnalysis: str(q.form_analysis_zh),
  };
}

function materialize(ctx, copies) {
  const types = new Map(ctx.target.prepare('SELECT type_id, target_marking FROM question_types').all().map((r) => [r.type_id, r.target_marking]));
  const groups = new Map(); // 去重键 → 副本列表
  for (const copy of copies) {
    if (copy.skipped) continue;
    const key = [copy.userId, copy.typeId, normalizePrompt(copy.prompt ?? ''), copy.materialKey ?? ''].join('\u0000');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(copy);
  }
  const groupRids = new Map(); // 素材分组键 → 题组 rid（阅读、听力同一素材的小题归入同一题组）
  const groupPositions = new Map();
  const materials = new Map(); // 素材键 → material rid
  const stats = { copies: copies.length, questions: 0, groups: 0, merged: 0, conflicts: 0, answerUnresolved: 0, markMissing: 0, titlesDropped: 0, furiganaDropped: 0 };
  const linkPositions = new Map();

  // 题目按最早出现的时间编号
  const ordered = [...groups.values()].sort((a, b) => String(a[0].updatedAt).localeCompare(String(b[0].updatedAt)));
  for (const list of ordered) {
    list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0));
    const main = list[0];
    const userId = main.userId;
    const q = main.question;
    const choices = array(q.choices).map((c) => String(c ?? '').trim());
    // 内容不同的副本：取最近修改的一份，差异写进报告
    for (const other of list.slice(1)) {
      const otherChoices = array(other.question.choices).map((c) => String(c ?? '').trim());
      if (otherChoices.join('\u0000') !== choices.join('\u0000') || resolveAnswer(ctx, other, otherChoices) !== resolveAnswer(ctx, main, choices)) {
        stats.conflicts += 1;
        ctx.warn('question.merged_copies_differ', { userId, typeId: main.typeId, prompt: main.prompt?.slice(0, 60), kept: `${main.source}:${q.id}`, other: `${other.source}:${other.question.id}` });
      }
    }
    stats.merged += list.length - 1;

    // 题组：同一素材的阅读、听力小题共用题组；其他题一题一组
    const groupKey = main.materialKey ? `${userId}\u0000${main.typeId}\u0000${main.materialKey}` : null;
    let groupRid = groupKey ? groupRids.get(groupKey) : null;
    if (!groupRid) {
      const { code } = ctx.code(userId, 'QS');
      const ready = list.some((c) => c.source !== 'draft');
      groupRid = ctx.insert('question_groups', {
        user_id: userId, code, type_id: main.typeId, status: ready ? 'ready' : 'draft',
        official: list.some((c) => c.question.official_jlpt_question === true),
        level: null, instruction: str(q.instruction), context: str(q.context),
        shuffle_options: !choices.some((c) => /[1-4１-４]\s*と\s*[1-4１-４]|両方|すべて/.test(c)) && !list.some((c) => c.question.official_jlpt_question === true),
        source_reference: list.map((c) => str(c.question.source_reference) ?? str(typeof c.question.source === 'string' ? c.question.source : null)).find(Boolean) ?? null,
        created_at: main.updatedAt, updated_at: main.updatedAt,
      });
      stats.groups += 1;
      if (groupKey) groupRids.set(groupKey, groupRid);
      // 素材
      for (const [position, material] of (main.materials ?? []).entries()) {
        let materialRid = materials.get(material.key);
        if (!materialRid) {
          const { code: materialCode } = ctx.code(userId, 'MT');
          materialRid = ctx.insert('materials', {
            user_id: userId, code: materialCode, kind: material.kind, body: material.body ?? null, media_rid: material.mediaRid ?? null,
            transcript: material.transcript ?? null, created_at: main.updatedAt, updated_at: main.updatedAt,
          });
          materials.set(material.key, materialRid);
          ctx.text('materials', materialRid, 'title', 'zh-Hans', material.title);
          ctx.text('materials', materialRid, 'body_translation', 'zh-Hans', material.bodyTranslation);
          ctx.text('materials', materialRid, 'summary', 'zh-Hans', material.summary);
          ctx.text('materials', materialRid, 'structure', 'zh-Hans', material.structure);
          ctx.text('materials', materialRid, 'transcript_translation', 'zh-Hans', material.transcriptTranslation);
          const keySentences = new Set(array(material.keySentences).map(normalizeChoice));
          array(material.sentences).forEach((sentence, i) => {
            if (!str(sentence?.ja)) return;
            const sentenceRid = ctx.insert('material_sentences', { material_rid: materialRid, position: i, sentence: str(sentence.ja), is_key: keySentences.has(normalizeChoice(sentence.ja)) });
            ctx.text('material_sentences', sentenceRid, 'translation', 'zh-Hans', sentence.zh);
          });
        }
        ctx.insert('question_group_materials', { group_rid: groupRid, position, material_rid: materialRid, role: material.role });
        material.rid = materialRid;
      }
    }
    const position = groupPositions.get(groupRid) ?? 0;
    groupPositions.set(groupRid, position + 1);

    // 小题
    const { code } = ctx.code(userId, questionPrefix(main.typeId));
    const questionRid = ctx.insert('questions', {
      user_id: userId, code, group_rid: groupRid, position, prompt: main.prompt ?? null,
      prompt_media_rid: main.prompt ? null : main.materials?.find((m) => m.mediaRid)?.mediaRid ?? null,
      expected_text: main.typeId === 'listening-basic-dictation' ? expectedTextOf(main.question) : null, created_at: main.updatedAt, updated_at: main.updatedAt,
    });
    stats.questions += 1;
    const parts = explanationParts(main);
    // 其他副本补充 main 缺少的解析部分（不覆盖）
    for (const other of list.slice(1)) {
      const p = explanationParts(other);
      parts.basis ??= p.basis; parts.tip ??= p.tip; parts.objective ??= p.objective; parts.fullAnswer ??= p.fullAnswer; parts.translation ??= p.translation; parts.formAnalysis ??= p.formAnalysis;
      if (!parts.steps.length) parts.steps = p.steps;
    }
    ctx.text('questions', questionRid, 'translation', 'zh-Hans', parts.translation);
    // 没有正确答案的题型（跟读、自由回答）：旧解析作为参考说明
    const noAnswer = main.typeId === 'listening-basic-free' || main.typeId === 'listening-basic-shadowing';
    const sections = [
      ...(parts.basis ? [{ kind: noAnswer ? 'step' : 'basis', title: noAnswer ? '参考说明' : '正确依据', body: parts.basis.text, language: parts.basis.language }] : []),
      ...parts.steps.map((s) => ({ kind: 'step', title: s.title, body: s.body, language: 'zh-Hans' })),
      // 接续判断（旧 form_analysis_zh）：正确依据里已经写了的不重复
      ...(parts.formAnalysis && !parts.basis?.text.includes(parts.formAnalysis) ? [{ kind: 'step', title: '接续判断', body: parts.formAnalysis, language: 'zh-Hans' }] : []),
      ...(parts.fullAnswer ? [{ kind: 'full_answer', title: '完整答案', body: parts.fullAnswer, language: 'ja' }] : []),
      ...(parts.tip ? [{ kind: 'tip', title: '技巧', body: parts.tip, language: detectLanguage(parts.tip) }] : []),
      ...(parts.objective ? [{ kind: 'objective', title: '学习目标', body: parts.objective, language: detectLanguage(parts.objective) }] : []),
    ];
    sections.forEach((section, i) => {
      const sectionRid = ctx.insert('question_explanation_sections', { question_rid: questionRid, position: i, kind: section.kind });
      ctx.text('question_explanation_sections', sectionRid, 'title', 'zh-Hans', section.title);
      ctx.text('question_explanation_sections', sectionRid, 'body', section.language, section.body);
    });

    // 标记
    const marking = types.get(main.typeId);
    if (main.prompt && marking === 'star') {
      // 文の組み立て：每个（　）是一个空位，（★）是★空位
      const slots = [...main.prompt.matchAll(/[（(]\s*★?\s*[)）]|＿+★?＿*/g)];
      if (!slots.some((m) => m[0].includes('★'))) { stats.markMissing += 1; ctx.warn('question.mark_not_found', { code, typeId: main.typeId, prompt: main.prompt.slice(0, 60) }); }
      slots.forEach((m, i) => ctx.insert('question_marks', {
        question_rid: questionRid, position: i, kind: m[0].includes('★') ? 'star_slot' : 'slot', material_rid: null,
        start_offset: m.index, end_offset: m.index + m[0].length, label: m[0].includes('★') ? '★' : null,
      }));
    }
    if (main.prompt && (marking === 'underline' || marking === 'blank')) {
      let start = -1;
      let end = -1;
      if (marking === 'underline') {
        const target = [q.promptTarget, q.target, q.tested, q.tested_expression].map(str).find((t) => t && main.prompt.includes(t));
        if (target) { start = main.prompt.indexOf(target); end = start + target.length; }
        else if (main.prompt.length <= 30 && !/[。！？]/.test(main.prompt)) { start = 0; end = main.prompt.length; } // 题干就是考查对象本身（言い換え 等）
        else {
          const quoted = /「([^「」]{1,20})」/.exec(main.prompt); // 「規制」の読み方として…
          if (quoted) { start = quoted.index + 1; end = start + quoted[1].length; }
        }
      } else {
        const blank = /（\s*）|\(\s*\)|＿{2,}|_{2,}/.exec(main.prompt);
        if (blank) { start = blank.index; end = start + blank[0].length; }
        else {
          const target = [q.promptTarget, q.target].map(str).find((t) => t && main.prompt.includes(t));
          if (target) { start = main.prompt.indexOf(target); end = start + target.length; }
        }
      }
      if (start >= 0) ctx.insert('question_marks', { question_rid: questionRid, position: 0, kind: marking === 'underline' ? 'target' : 'blank', material_rid: null, start_offset: start, end_offset: end, label: null });
      else { stats.markMissing += 1; ctx.warn('question.mark_not_found', { code, typeId: main.typeId, prompt: main.prompt.slice(0, 60), target: str(q.promptTarget ?? q.target) }); }
    }

    // 选项
    const answerIndex = resolveAnswer(ctx, main, choices);
    const answerMode = main.typeId === 'listening-basic-free' ? 'none' : main.typeId === 'listening-basic-dictation' ? 'text_input' : 'choice';
    if (answerMode === 'choice' && answerIndex === null) { stats.answerUnresolved += 1; ctx.warn('question.answer_unresolved', { code, answer: q.answer, answerIndex: q.answerIndex, choices }); }
    const analysisByChoice = new Map();
    const collectAnalysis = (copy) => {
      for (const [i, entry] of array(copy.question.choiceAnalysis).entries()) {
        const key = normalizeChoice(entry?.choice ?? choices[i]);
        if (str(entry?.explanation) && !analysisByChoice.has(key)) analysisByChoice.set(key, str(entry.explanation));
      }
      for (const [choice, note] of Object.entries(copy.question.distractor_notes ?? {})) {
        const key = normalizeChoice(choice);
        if (str(note) && !analysisByChoice.has(key)) analysisByChoice.set(key, str(note));
      }
    };
    list.forEach(collectAnalysis);
    const optionRids = [];
    const optionsByText = new Map();
    let evidencePosition = 0;
    choices.forEach((text, i) => {
      const detail = main.optionDetails?.[i] ?? {};
      const optionRid = ctx.insert('question_options', {
        question_rid: questionRid, position: i, text: str(text), media_rid: null, is_correct: i === answerIndex,
        distractor_type: i === answerIndex ? null : str(detail.errorType),
      });
      optionRids.push(optionRid);
      optionsByText.set(normalizeChoice(text), optionRid);
      // 旧“证据”多是带「」引文的说明：原文里逐字找得到的引文作为证据（带位置），整段说明并入选项理由
      const evidence = str(detail.evidence);
      const material = main.materials?.find((m) => m.body);
      const quotes = !evidence ? [] : material?.body.includes(evidence) ? [evidence]
        : [...evidence.matchAll(/「((?:[^「」]|「[^「」]*」)+)」/g)].map((m) => m[1]).filter((quote) => material?.body.includes(quote));
      const analysis = str(detail.analysis) ?? analysisByChoice.get(normalizeChoice(text));
      const note = evidence && !(quotes.length === 1 && quotes[0] === evidence) ? `依据：${evidence}` : null;
      ctx.text('question_options', optionRid, 'analysis', 'zh-Hans', [analysis, note].filter(Boolean).join('\n') || null);
      ctx.text('question_options', optionRid, 'translation', 'zh-Hans', detail.translation);
      for (const quote of quotes) {
        const offset = material.body.indexOf(quote);
        ctx.insert('question_evidence', {
          question_rid: questionRid, option_rid: optionRid, position: evidencePosition++, material_rid: material.rid, source: 'body',
          start_offset: offset, end_offset: offset + quote.length, quote,
        });
      }
      if (evidence && !quotes.length) stats.evidenceAsNote = (stats.evidenceAsNote ?? 0) + 1;
    });
    for (const tag of new Set(array(main.tags).map(str).filter(Boolean))) ctx.insert('question_tags', { question_rid: questionRid, tag });

    // 知识关联
    const points = new Set();
    for (const copy of list) {
      if (copy.pointRid) points.add(copy.pointRid);
      const itemId = copy.question.itemId ?? copy.question.item_id;
      const pointRid = itemId ? ctx.lookup('item', userId, itemId) : null;
      if (pointRid) points.add(pointRid);
    }
    for (const pointRid of points) {
      const n = linkPositions.get(pointRid) ?? 0;
      linkPositions.set(pointRid, n + 1);
      ctx.insert('knowledge_point_questions', { point_rid: pointRid, question_rid: questionRid, relation: 'target', position: n });
    }

    // 每份副本 → 新题目
    const resolved = { questionRid, code, groupRid, optionRids, optionsByText, correctText: answerIndex === null ? null : choices[answerIndex] };
    for (const copy of list) {
      copy.resolved = resolved;
      if (str(copy.question.title)) stats.titlesDropped += 1;
      if (array(copy.question.japaneseAnnotations ?? copy.question.japanese_annotations).length) stats.furiganaDropped += 1;
      const id = copy.question.id;
      if (id != null) ctx.remember('question', userId, id, questionRid, code);
    }
  }
  ctx.report.questions = stats;
}

/** 阅读题（旧 reading_questions）→ 题目副本。 */
export function addReadingQuestions(ctx, bank) {
  for (const r of ctx.rows('reading_questions', 'ORDER BY created_at')) {
    const passage = str(r.passage) ?? '';
    const analysis = json(r.reading_analysis_json, {}) ?? {};
    const choices = array(json(r.choices_json, []));
    bank.add({
      source: 'reading', userId: r.user_id, updatedAt: r.created_at ?? ctx.now,
      question: { id: r.id, question: r.question, choices, answerIndex: r.answer_index, explanation: r.explanation },
      steps: array(json(r.explanation_nodes_json, [])).map((n) => ({ title: n?.title, body: n?.body })).filter((n) => str(n.body) || str(n.title)),
      optionDetails: array(json(r.choice_explanations_json, [])),
      tags: array(json(r.tags_json, [])),
      materialKey: `passage:${sha(passage)}`,
      materials: [{
        key: `passage:${r.user_id}:${sha(passage)}`, kind: 'passage', role: 'main', body: passage, title: r.title,
        bodyTranslation: r.passage_translation, summary: analysis?.summary, structure: analysis?.structure, keySentences: analysis?.keySentences,
        sentences: array(json(r.translation_lines_json, [])),
      }],
    });
    if (array(json(r.ruby_terms_json, [])).length || array(json(r.japanese_annotations_json, [])).length) ctx.warn('question.legacy_furigana_dropped', { source: 'reading', id: r.id });
  }
}

/** 听力题（旧 listening_questions）→ 题目副本。 */
export function addListeningQuestions(ctx, bank) {
  const assets = new Map(ctx.rows('listening_audio_assets').map((a) => [a.id, a]));
  for (const r of ctx.rows('listening_questions', 'ORDER BY created_at')) {
    const choices = array(json(r.choices_json, []));
    const asset = assets.get(r.audio_asset_id);
    let mediaRid = r.audio_asset_id ? ctx.lookup('audio', r.user_id, r.audio_asset_id) : null;
    if (!mediaRid && str(r.audio_path)) {
      // 早期上传的音频没有 asset，直接用题目上的文件信息建媒体记录
      mediaRid = ctx.insert('media_files', {
        user_id: r.user_id, kind: 'audio', file_name: str(r.audio_file_name), mime: str(r.audio_mime) ?? 'audio/mpeg', size: r.audio_size ?? 0, sha256: '',
        storage_path: r.audio_path, created_at: r.created_at ?? ctx.now, updated_at: r.created_at ?? ctx.now,
      });
    }
    const question = { id: r.id, question_type_id: r.question_type_id, question: r.question, choices, explanation: r.explanation };
    const materialKey = `audio:${r.audio_asset_id ?? r.id}`;
    bank.add({
      source: 'listening', userId: r.user_id, updatedAt: r.created_at ?? ctx.now, question,
      typeId: typeIdFor(question), answerIndex: Number.isInteger(r.answer_index) ? r.answer_index : -1,
      optionDetails: array(json(r.choice_details_json, [])),
      materialKey,
      materials: mediaRid ? [{
        key: `audio:${r.user_id}:${r.audio_asset_id ?? r.id}`, kind: 'audio', role: 'audio', mediaRid, title: r.title,
        transcript: str(asset?.transcript), transcriptTranslation: asset?.transcript_translation,
      }] : [],
    });
    if (!mediaRid) ctx.warn('question.listening_audio_missing', { id: r.id, title: r.title, audioPath: r.audio_path });
  }
}
