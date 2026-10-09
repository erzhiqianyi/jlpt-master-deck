// 知识点及其子表。题目（practice_questions）交给题库步骤，这里只登记来源。
import { json, array, str, iso } from './context.mjs';
import { kindOf, typeTag, convertPartOfSpeech, convertLevel, typeIdFor } from './normalize.mjs';
import { wordbookFor } from './basics.mjs';
import { romajiColumns } from '../romaji.mjs';

const ITEM_KEYS = ['id', 'deck', 'wordbook_id', 'wordbook_ids', 'type', 'original', 'reading', 'part_of_speech', 'inflection_class', 'base_form',
  'jlpt_level', 'level_confidence', 'meaning_zh', 'meaning', 'meaning_ja', 'paraphrase_ja', 'explanation_zh', 'core_memory', 'examples',
  'conjugations', 'patterns', 'points', 'comparisons', 'register', 'source', 'images', 'tags', 'question_kinds', 'question_distractors',
  'practice_questions', 'practice_question_count', 'practice_mode', 'captured_on', 'input_at', 'reference', 'parent_reference', 'reference_note',
  'sub_items', 'reference_sources', 'alternate_forms', 'related_words', 'ruby_terms', 'mnemonic_image', 'content_origin', 'verification_status',
  'japanese_annotations', 'localizations'];
const REGISTER = { written: 'written', spoken: 'spoken', formal: 'formal', both: 'both', 書き言葉: 'written', 話し言葉: 'spoken' };
const textbookSource = (text) => /[課頁編]|写真/.test(text) || !/[。！？!?]/.test(text);

/** 读出全部旧知识点（自己的 + 市场导入的），按用户分组。 */
export function loadItems(ctx) {
  const byUser = new Map();
  const push = (userId, item, meta) => {
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId).push(Object.assign(item, { __meta: meta }));
  };
  for (const r of ctx.rows('owned_review_items', 'ORDER BY created_at')) {
    const item = json(r.item_json, null);
    if (!item) { ctx.warn('knowledge.invalid_json', { id: r.id }); continue; }
    push(r.user_id, item, { id: r.id, source: r.source, createdAt: iso(r.created_at, ctx.now), updatedAt: iso(r.updated_at, ctx.now), imported: false });
  }
  for (const r of ctx.rows('user_review_items')) {
    const item = json(r.item_json, null);
    if (!item) continue;
    push(r.user_id, item, { id: r.id, createdAt: ctx.now, updatedAt: ctx.now, imported: true });
  }
  if (ctx.hasLegacy('review_items')) ctx.warn('knowledge.global_sample_not_migrated', { count: ctx.rows('review_items').length });
  return byUser;
}

export function migrateKnowledge(ctx, itemsByUser, bank) {
  const stats = { points: 0, conjugationsSkipped: 0, rubyDropped: 0 };
  for (const [userId, items] of itemsByUser) {
    // 编号按录入时间先后
    const sorted = [...items].sort((a, b) => String(a.input_at ?? a.__meta.createdAt).localeCompare(String(b.input_at ?? b.__meta.createdAt)));
    for (const item of sorted) {
      const meta = item.__meta;
      ctx.unknown('item_json', item, [...ITEM_KEYS, '__meta']);
      const kind = kindOf(item);
      const expression = str(item.original);
      if (!expression) { ctx.warn('knowledge.missing_original', { userId, id: meta.id }); continue; }
      const reading = str(item.reading);
      let romaji = { romaji: null, romaji_key: null };
      try { if (reading) romaji = romajiColumns(reading); } catch { romaji = { romaji: null, romaji_key: null }; }
      const pos = convertPartOfSpeech({ partOfSpeech: item.part_of_speech, inflectionClass: item.inflection_class, kind, expression, baseForm: item.base_form });
      if (pos.unresolved) ctx.warn('knowledge.part_of_speech_unresolved', { userId, id: meta.id, expression, partOfSpeech: item.part_of_speech, inflectionClass: item.inflection_class });
      const level = convertLevel(item.jlpt_level);
      const sourceSentence = str(item.source?.sentence);
      const capturedAt = iso(item.input_at, null) ?? iso(item.captured_on, null) ?? meta.createdAt;
      const prefix = { word: 'W', grammar: 'G', name: 'N' }[kind];
      const { code } = ctx.code(userId, prefix);
      const wordbook = wordbookFor(ctx, userId, item);
      const rid = ctx.insert('knowledge_points', {
        user_id: userId, code, wordbook_rid: wordbook, kind, expression, reading,
        romaji: romaji.romaji, romaji_key: romaji.romaji_key,
        pos: pos.pos, transitivity: pos.transitivity, is_suru_noun: pos.isSuruNoun,
        base_form: str(item.base_form),
        jlpt_level_min: level.min, jlpt_level_max: level.max,
        register_level: REGISTER[str(item.register?.level)] ?? null,
        paraphrase: str(item.paraphrase_ja),
        source_sentence: sourceSentence && !textbookSource(sourceSentence) ? sourceSentence : null,
        compile_note: str(item.source?.chat_summary),
        source_capture_rid: item.source?.capture_id ? ctx.lookup('capture', userId, item.source.capture_id) : null,
        market_share_id: null,
        captured_at: capturedAt, created_at: meta.createdAt, updated_at: meta.updatedAt,
      });
      ctx.remember('item', userId, meta.id, rid, code);
      if (item.id && item.id !== meta.id) ctx.remember('item', userId, item.id, rid, code);
      stats.points += 1;
      const t = (owner, ownerRid, field, language, text) => ctx.text(owner, ownerRid, field, language, text);
      t('knowledge_points', rid, 'meaning', 'zh-Hans', str(item.meaning_zh) ?? str(item.meaning));
      t('knowledge_points', rid, 'meaning', 'ja', item.meaning_ja);
      t('knowledge_points', rid, 'explanation', 'zh-Hans', item.explanation_zh);
      if (str(item.meaning) && str(item.meaning_zh) && str(item.meaning) !== str(item.meaning_zh)) ctx.warn('knowledge.meaning_alt_dropped', { userId, id: meta.id });

      // 标签：旧标签、细分类型、等级里的非等级值、词性里的补充说明
      const tags = new Set(array(item.tags).map(str).filter(Boolean));
      if (typeTag[item.type]) tags.add(typeTag[item.type]);
      if (level.tag) tags.add(level.tag);
      for (const tag of pos.tags) tags.add(tag);
      for (const tag of tags) ctx.insert('knowledge_tags', { point_rid: rid, tag, created_at: meta.createdAt });

      array(item.examples).forEach((example, position) => {
        if (!str(example?.ja)) return;
        ctx.unknown('item_json.examples[]', example, ['ja', 'reading', 'zh', 'spoken_ja', 'spoken_zh', 'analysis_zh', 'form_analysis_zh', 'target_reading']);
        const exampleRid = ctx.insert('knowledge_examples', {
          point_rid: rid, position, sentence: str(example.ja), sentence_reading: str(example.reading), spoken_sentence: str(example.spoken_ja),
          target_reading: str(example.target_reading), created_at: meta.createdAt, updated_at: meta.updatedAt,
        });
        t('knowledge_examples', exampleRid, 'translation', 'zh-Hans', example.zh);
        t('knowledge_examples', exampleRid, 'spoken_translation', 'zh-Hans', example.spoken_zh);
        t('knowledge_examples', exampleRid, 'analysis', 'zh-Hans', example.analysis_zh);
        t('knowledge_examples', exampleRid, 'form_analysis', 'zh-Hans', example.form_analysis_zh);
      });
      array(item.core_memory).map(str).filter(Boolean).forEach((content, position) => {
        const memoryRid = ctx.insert('knowledge_memory_points', { point_rid: rid, position, created_at: meta.createdAt, updated_at: meta.updatedAt });
        t('knowledge_memory_points', memoryRid, 'content', 'zh-Hans', content);
      });
      array(item.patterns).filter((p) => str(p?.pattern)).forEach((pattern, position) => {
        const patternRid = ctx.insert('knowledge_patterns', { point_rid: rid, position, pattern: str(pattern.pattern), example: str(pattern.example), created_at: meta.createdAt, updated_at: meta.updatedAt });
        t('knowledge_patterns', patternRid, 'connection', 'zh-Hans', pattern.connection_zh);
        t('knowledge_patterns', patternRid, 'meaning', 'zh-Hans', pattern.meaning_zh);
        t('knowledge_patterns', patternRid, 'example_translation', 'zh-Hans', pattern.example_zh);
      });
      // 补充说明：要点 + 语体说明 + 考试提示
      const notes = [
        ...array(item.points).filter((p) => str(p?.label) || str(p?.detail_zh)).map((p) => ({ kind: 'key_point', title: p.label, body: p.detail_zh })),
        ...(str(item.register?.note_zh) ? [{ kind: 'register', title: '语体', body: item.register.note_zh }] : []),
        ...(str(item.register?.exam_tip_zh) ? [{ kind: 'exam_tip', title: '考试提示', body: item.register.exam_tip_zh }] : []),
      ];
      notes.forEach((note, position) => {
        const noteRid = ctx.insert('knowledge_notes', { point_rid: rid, position, kind: note.kind, created_at: meta.createdAt, updated_at: meta.updatedAt });
        t('knowledge_notes', noteRid, 'title', 'zh-Hans', note.title);
        t('knowledge_notes', noteRid, 'body', 'zh-Hans', note.body);
      });
      array(item.comparisons).filter((c) => str(c?.target)).forEach((comparison, position) => {
        const comparisonRid = ctx.insert('knowledge_comparisons', {
          point_rid: rid, position, target: str(comparison.target), kind: comparison.kind === 'everyday' ? 'everyday' : 'synonym',
          created_at: meta.createdAt, updated_at: meta.updatedAt,
        });
        t('knowledge_comparisons', comparisonRid, 'difference', 'zh-Hans', comparison.difference_zh);
      });
      array(item.alternate_forms).map(str).filter(Boolean).forEach((form, position) => ctx.insert('knowledge_alternate_forms', { point_rid: rid, position, form, created_at: meta.createdAt }));
      array(item.related_words).map(str).filter(Boolean).forEach((word, position) => ctx.insert('knowledge_related_words', { point_rid: rid, position, word, created_at: meta.createdAt }));
      const sources = array(item.reference_sources).filter((s) => str(s?.title)).map((s) => ({ title: str(s.title), url: str(s.url) }));
      if (sourceSentence && textbookSource(sourceSentence)) sources.push({ title: sourceSentence, url: null });
      sources.forEach((source, position) => ctx.insert('knowledge_sources', { point_rid: rid, position, ...source, created_at: meta.createdAt }));

      // 记忆图片：旧数据都是中文，记为 zh-Hans；每个知识点每种语言一行，多张图只保留第一张
      const images = array(item.images);
      const mnemonic = item.mnemonic_image;
      if (images.length || str(mnemonic?.prompt)) {
        const image = images[0] ?? {};
        ctx.insert('knowledge_memory_images', {
          point_rid: rid, language: 'zh-Hans', concept: str(mnemonic?.concept), prompt: str(mnemonic?.prompt),
          status: images.length ? 'approved' : 'prompt_ready', // 旧图片都是学习者确认后上传的
          media_rid: image.id ? ctx.lookup('image', userId, image.id) : null, url: str(image.url), caption: str(image.caption),
          created_at: meta.createdAt, updated_at: meta.updatedAt,
        });
        if (images.length > 1) ctx.warn('knowledge.extra_images_dropped', { userId, id: meta.id, count: images.length - 1 });
      }
      for (const kindName of new Set(array(item.question_kinds))) {
        const typeId = typeIdFor({ kind: kindName });
        if (typeId) ctx.insert('knowledge_question_kinds', { point_rid: rid, type_id: typeId });
      }
      for (const [kindName, choices] of Object.entries(item.question_distractors ?? {})) {
        const typeId = typeIdFor({ kind: kindName });
        if (!typeId) continue;
        array(choices).map(str).filter(Boolean).forEach((choice, position) => ctx.insert('knowledge_distractors', { point_rid: rid, type_id: typeId, position, choice }));
      }
      if (array(item.conjugations).length) stats.conjugationsSkipped += 1;
      if (array(item.ruby_terms).length || array(item.japanese_annotations).length) {
        stats.rubyDropped += 1;
        ctx.warn('knowledge.legacy_furigana_dropped', { userId, code, expression });
      }
      // 来源草稿在草稿迁移后登记；题目交给题库
      item.__rid = rid;
      item.__code = code;
      item.__userId = userId;
      array(item.practice_questions).forEach((question, position) => bank.add({ source: 'item', userId, question, pointRid: rid, position, updatedAt: meta.updatedAt, itemId: meta.id }));
    }
  }
  ctx.report.knowledge = stats;
}

/** 草稿迁移之后：登记知识点的来源草稿。 */
export function linkSourceDrafts(ctx, itemsByUser) {
  for (const [userId, items] of itemsByUser) {
    for (const item of items) {
      if (!item.__rid) continue;
      for (const draftId of new Set(array(item.source?.draft_ids))) {
        const draftRid = ctx.lookup('draft', userId, draftId);
        if (draftRid) ctx.insert('knowledge_source_drafts', { point_rid: item.__rid, draft_rid: draftRid });
        else ctx.warn('knowledge.source_draft_missing', { userId, code: item.__code, draftId });
      }
    }
  }
}
