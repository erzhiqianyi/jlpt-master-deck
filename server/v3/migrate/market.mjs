// 市場の分享：旧形式（v1：旧条目 JSON と旧練習題 JSON）を v2（v3 の入力と同じ形）に変換して market_* に書く。
// 旧の聴解分享（音声つき）は v1 形式ではないので、報告に記録して移さない。
import { array, str, json, iso } from './context.mjs';
import { kindOf, typeTag, convertPartOfSpeech, convertLevel, typeIdFor } from './normalize.mjs';
import { detectStarSlots, detectBlank, markTarget } from '../../../src/domain/questionEditing.mjs';
import { createHash } from 'node:crypto';

const TARGET_MARKING = {
  'vocabulary-kanji-reading': 'underline', 'vocabulary-orthography': 'underline', 'vocabulary-paraphrase': 'underline',
  'vocabulary-word-formation': 'blank', 'vocabulary-context': 'blank', 'grammar-form': 'blank', 'grammar-composition': 'star',
};

/** 旧条目 → 知識項目の入力。 */
export function knowledgeFromItem(item) {
  const kind = kindOf(item);
  const expression = str(item.original);
  const pos = convertPartOfSpeech({ partOfSpeech: item.part_of_speech, inflectionClass: item.inflection_class, kind, expression, baseForm: item.base_form });
  const level = convertLevel(item.jlpt_level);
  const tags = new Set(array(item.tags).map(str).filter(Boolean));
  if (typeTag[item.type]) tags.add(typeTag[item.type]);
  if (level.tag) tags.add(level.tag);
  for (const tag of pos.tags) tags.add(tag);
  return {
    kind, expression, reading: str(item.reading) ?? undefined, pos: kind === 'word' ? pos.pos ?? undefined : undefined, transitivity: kind === 'word' ? pos.transitivity ?? undefined : undefined,
    isSuruNoun: pos.isSuruNoun || undefined, baseForm: str(item.base_form) ?? undefined, jlptLevel: level.min ? { min: level.min, max: level.max } : undefined,
    paraphrase: str(item.paraphrase_ja) ?? undefined, meaning: str(item.meaning_zh) ?? str(item.meaning) ?? undefined, meaningJa: str(item.meaning_ja) ?? undefined,
    explanation: str(item.explanation_zh) ?? undefined,
    examples: array(item.examples).filter((e) => str(e?.ja)).map((e) => ({ sentence: str(e.ja), translation: str(e.zh) ?? undefined, analysis: str(e.analysis_zh) ?? undefined })),
    memoryPoints: array(item.core_memory).map(str).filter(Boolean),
    patterns: array(item.patterns).filter((p) => str(p?.pattern)).map((p) => ({ pattern: str(p.pattern), example: str(p.example) ?? undefined, connection: str(p.connection_zh) ?? undefined,
      meaning: str(p.meaning_zh) ?? undefined, exampleTranslation: str(p.example_zh) ?? undefined })),
    comparisons: array(item.comparisons).filter((c) => str(c?.target)).map((c) => ({ target: str(c.target), kind: c.kind === 'everyday' ? 'everyday' : 'synonym', difference: str(c.difference_zh) ?? undefined })),
    tags: [...tags],
  };
}

/** 旧練習題 → 題組の入力（1 題 1 組）。 */
export function groupFromQuestion(q) {
  const typeId = typeIdFor(q);
  if (!typeId) return null;
  const prompt = str(q.prompt);
  const marking = TARGET_MARKING[typeId];
  const target = str(q.promptTarget) ?? str(q.target);
  let marks = [];
  if (prompt && marking === 'star') marks = detectStarSlots(prompt);
  else if (prompt && marking === 'blank') marks = detectBlank(prompt).length ? detectBlank(prompt) : markTarget(prompt, target, 'blank');
  else if (prompt && marking === 'underline') {
    marks = markTarget(prompt, target);
    if (!marks.length) { const quoted = /「([^「」]{1,20})」/.exec(prompt); if (quoted) marks = markTarget(prompt, quoted[1]); }
    if (!marks.length && prompt.length <= 30 && !/[。！？]/.test(prompt)) marks = [{ kind: 'target', start: 0, end: prompt.length, label: null, material: null }];
  }
  const choices = array(q.choices).map((c) => String(c));
  const answerIndex = Number.isInteger(q.answerIndex) && q.answerIndex >= 0 ? q.answerIndex : choices.indexOf(String(q.answer));
  const analysis = new Map(array(q.choiceAnalysis).map((a) => [String(a?.choice), str(a?.explanation)]));
  const basis = str(q.correctReason) ?? str(q.explanation);
  return {
    typeId,
    group: {
      typeId, instruction: str(q.instruction) ?? undefined, context: str(q.context) ?? undefined,
      materials: [],
      questions: [{
        prompt: prompt ?? undefined, translation: str(q.translationZh) ?? undefined, marks,
        options: choices.map((text, i) => ({ text, correct: i === answerIndex, analysis: analysis.get(text) ?? undefined })),
        explanation: [...(basis ? [{ kind: 'basis', body: basis }] : []), ...(str(q.memoryPoint) ? [{ kind: 'tip', body: str(q.memoryPoint) }] : [])],
        evidence: [], tags: [],
        knowledge: Number.isInteger(q.sourceItemIndex) ? [{ index: q.sourceItemIndex, relation: 'target' }] : [],
      }],
    },
  };
}

/** v1 分享包 → v2 分享包。 */
export function convertPackage(v1) {
  const items = v1.kind === 'wordbook' ? array(v1.items) : array(v1.items);
  const knowledge = items.map(knowledgeFromItem).filter((k) => k.expression);
  const groups = v1.kind === 'practice' ? array(v1.questions).map(groupFromQuestion).filter(Boolean).map((g) => g.group) : [];
  return { format: 'jlpt-share', version: 2, kind: v1.kind, title: str(v1.title) ?? '分享', description: str(v1.description) ?? '', language: 'zh-Hans', knowledge, groups, media: [], mediaIds: [] };
}

const fingerprint = (pkg) => { const { mediaIds: _m, ...rest } = pkg; return createHash('sha256').update(JSON.stringify(rest)).digest('hex'); };

export function migrateMarket(ctx) {
  const stats = { shares: 0, versions: 0, skipped: 0 };
  for (const r of ctx.rows('market_shares')) {
    const v1 = json(r.package_json, null);
    if (!v1 || v1.format !== 'jlpt-share' || v1.version !== 1 || !['wordbook', 'practice'].includes(v1.kind)) {
      stats.skipped += 1;
      ctx.warn('market.share_not_converted', { id: r.id, kind: r.kind, reason: '不是 v1 单词本或练习分享包（如听力分享）' });
      continue;
    }
    const pkg = convertPackage(v1);
    const source = ctx.lookup(v1.kind === 'wordbook' ? 'wordbook' : 'practice', r.user_id, r.source_id);
    const sourceCode = source ? ctx.target.prepare(`SELECT code FROM ${v1.kind === 'wordbook' ? 'wordbooks' : 'practice_sets'} WHERE rid = ?`).get(source)?.code : null;
    const created = iso(r.created_at, ctx.now);
    ctx.insert('market_shares', { id: r.id, user_id: r.user_id, source_id: sourceCode ?? String(r.source_id ?? ''), kind: v1.kind, package_json: JSON.stringify(pkg), created_at: created, withdrawn: r.withdrawn ? 1 : 0 });
    stats.shares += 1;
    const versions = ctx.rows('market_share_versions').filter((v) => v.share_id === r.id);
    const list = versions.length ? versions : [{ revision: 1, package_json: r.package_json, created_at: r.created_at }];
    for (const v of list) {
      const converted = convertPackage(json(v.package_json, v1));
      ctx.insert('market_share_versions', { share_id: r.id, revision: v.revision, package_json: JSON.stringify(converted), fingerprint: fingerprint(converted), created_at: iso(v.created_at, created) });
      stats.versions += 1;
    }
    if (!str(sourceCode)) ctx.warn('market.source_not_found', { id: r.id, source: r.source_id });
  }
  // 旧の取り込み記録は旧形式の結果なので移さない（同じ分享をもう一度取り込める）
  const imports = ctx.rows('market_imports').length;
  if (imports) ctx.warn('market.imports_dropped', { count: imports });
  ctx.report.market = stats;
}
