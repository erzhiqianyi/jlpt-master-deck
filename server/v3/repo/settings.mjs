// 设置：显示与练习设置、朗读设置、记忆卡模板选择。
import { SUPPORTED_LANGUAGES, pickTexts } from '../i18n.mjs';
import { InputError, nowIso, oneOf, bool, number, text, list } from './common.mjs';

const RATINGS = ['forgot', 'hard', 'remembered', 'easy'];
const POS = ['noun', 'verb', 'particle', 'adjective'];
const KINDS = ['word', 'grammar', 'name'];

export function getSettings(db, userId) {
  const p = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) ?? {};
  const s = db.prepare('SELECT * FROM user_speech_settings WHERE user_id = ?').get(userId) ?? {};
  const templates = Object.fromEntries(KINDS.map((kind) => [kind, null]));
  for (const row of db.prepare('SELECT t.kind, t.code FROM card_templates t WHERE t.is_default = 1').all()) templates[row.kind] = row.code;
  for (const row of db.prepare('SELECT u.kind, t.code FROM user_card_templates u JOIN card_templates t ON t.rid = u.template_rid WHERE u.user_id = ?').all(userId)) templates[row.kind] = row.code;
  return {
    uiLanguage: p.ui_language ?? 'zh-CN',
    explanationLanguage: p.explanation_language ?? 'zh-Hans',
    fontScale: p.font_scale ?? 1,
    feedbackMode: p.feedback_mode ?? 'immediate',
    practiceNavigation: p.practice_navigation ?? 'auto',
    autoAdvanceSeconds: p.auto_advance_seconds ?? 0.5,
    showReviewRuby: p.show_review_ruby !== 0,
    showExplanationRuby: p.show_explanation_ruby !== 0,
    showRomaji: p.show_romaji !== 0,
    cardWordSpacing: p.card_word_spacing !== 0,
    segmentedDisplay: p.segmented_display === 1,
    dailySource: {
      answers: p.daily_source_answers !== 0, cardReviews: p.daily_source_card_reviews !== 0, window: p.daily_source_window ?? null,
      hours: p.daily_source_hours ?? null, timeZone: p.daily_source_time_zone ?? null, runAt: p.daily_source_run_at ?? null,
      ratings: db.prepare('SELECT rating FROM user_daily_source_ratings WHERE user_id = ?').all(userId).map((r) => r.rating),
    },
    questionKinds: db.prepare('SELECT type_id FROM user_question_kinds WHERE user_id = ? ORDER BY type_id').all(userId).map((r) => r.type_id),
    posStyles: Object.fromEntries(db.prepare('SELECT pos, mode, color FROM user_pos_styles WHERE user_id = ?').all(userId).map((r) => [r.pos, { mode: r.mode, color: r.color }])),
    questionTypeTips: Object.fromEntries(db.prepare('SELECT type_id, tip FROM user_question_type_tips WHERE user_id = ?').all(userId).map((r) => [r.type_id, r.tip])),
    customTips: db.prepare('SELECT rid, section, title, description, tip, created_at, updated_at FROM user_custom_tips WHERE user_id = ? ORDER BY rid').all(userId)
      .map((r) => ({ id: r.rid, section: r.section, title: r.title, description: r.description, tip: r.tip, createdAt: r.created_at, updatedAt: r.updated_at })),
    speech: {
      provider: s.provider ?? 'browser', rate: s.rate ?? 1, cardAuto: s.card_auto ?? 'off', grammarAuto: s.grammar_auto === 1, includeExample: s.include_example === 1,
      voices: Object.fromEntries(db.prepare('SELECT provider, voice, style, role FROM user_speech_voices WHERE user_id = ?').all(userId).map((r) => [r.provider, { voice: r.voice, style: r.style, role: r.role }])),
    },
    cardTemplates: templates,
  };
}

/** 部分更新：只改传入的键；返回更新后的完整设置。 */
export function updateSettings(db, userId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('设置应为对象');
  const now = nowIso();
  db.prepare('INSERT OR IGNORE INTO user_preferences (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(userId, now, now);
  db.prepare('INSERT OR IGNORE INTO user_speech_settings (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(userId, now, now);
  const columns = {};
  const set = (column, value) => { if (value !== undefined) columns[column] = value; };
  if ('uiLanguage' in input) set('ui_language', oneOf(input.uiLanguage, ['zh-CN', 'ja', 'en'], 'uiLanguage'));
  if ('explanationLanguage' in input) set('explanation_language', oneOf(input.explanationLanguage, SUPPORTED_LANGUAGES, 'explanationLanguage'));
  if ('fontScale' in input) set('font_scale', number(input.fontScale, 'fontScale', { min: 0.8, max: 2, optional: false }));
  if ('feedbackMode' in input) set('feedback_mode', oneOf(input.feedbackMode, ['immediate', 'batch'], 'feedbackMode'));
  if ('practiceNavigation' in input) set('practice_navigation', oneOf(input.practiceNavigation, ['auto', 'manual'], 'practiceNavigation'));
  if ('autoAdvanceSeconds' in input) set('auto_advance_seconds', Math.round(number(input.autoAdvanceSeconds, 'autoAdvanceSeconds', { min: 0, max: 10, optional: false }) * 10) / 10);
  for (const [key, column] of [['showReviewRuby', 'show_review_ruby'], ['showExplanationRuby', 'show_explanation_ruby'], ['showRomaji', 'show_romaji'], ['cardWordSpacing', 'card_word_spacing'], ['segmentedDisplay', 'segmented_display']]) {
    if (key in input) set(column, bool(input[key], key) ? 1 : 0);
  }
  if (input.dailySource !== undefined) {
    const d = input.dailySource ?? {};
    if ('answers' in d) set('daily_source_answers', bool(d.answers, 'dailySource.answers') ? 1 : 0);
    if ('cardReviews' in d) set('daily_source_card_reviews', bool(d.cardReviews, 'dailySource.cardReviews') ? 1 : 0);
    if ('window' in d) set('daily_source_window', text(d.window, 'dailySource.window', { max: 40 }));
    if ('hours' in d) set('daily_source_hours', number(d.hours, 'dailySource.hours', { min: 1, max: 720, integer: true }));
    if ('timeZone' in d) set('daily_source_time_zone', text(d.timeZone, 'dailySource.timeZone', { max: 64 }));
    if ('runAt' in d) set('daily_source_run_at', text(d.runAt, 'dailySource.runAt', { max: 5 }));
    if ('ratings' in d) {
      db.prepare('DELETE FROM user_daily_source_ratings WHERE user_id = ?').run(userId);
      for (const rating of new Set(list(d.ratings, 'dailySource.ratings'))) db.prepare('INSERT INTO user_daily_source_ratings (user_id, rating) VALUES (?, ?)').run(userId, oneOf(rating, RATINGS, 'rating'));
    }
  }
  if (Object.keys(columns).length) {
    db.prepare(`UPDATE user_preferences SET ${Object.keys(columns).map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE user_id = ?`).run(...Object.values(columns), now, userId);
  }
  if ('questionKinds' in input) {
    const known = new Set(db.prepare('SELECT type_id FROM question_types').all().map((r) => r.type_id));
    db.prepare('DELETE FROM user_question_kinds WHERE user_id = ?').run(userId);
    for (const typeId of new Set(list(input.questionKinds, 'questionKinds'))) {
      if (!known.has(typeId)) throw new InputError(`未知题型：${typeId}`);
      db.prepare('INSERT INTO user_question_kinds (user_id, type_id) VALUES (?, ?)').run(userId, typeId);
    }
  }
  if (input.posStyles !== undefined) {
    for (const [pos, style] of Object.entries(input.posStyles ?? {})) {
      oneOf(pos, POS, 'posStyles 的词性');
      const mode = oneOf(style?.mode, ['none', 'underline', 'text'], `posStyles.${pos}.mode`);
      const color = text(style?.color, `posStyles.${pos}.color`, { optional: false, max: 16 });
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new InputError(`posStyles.${pos}.color 应为 #RRGGBB`);
      db.prepare('INSERT INTO user_pos_styles (user_id, pos, mode, color) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, pos) DO UPDATE SET mode = excluded.mode, color = excluded.color').run(userId, pos, mode, color);
    }
  }
  if (input.speech !== undefined) {
    const s = input.speech ?? {};
    const speech = {};
    if ('provider' in s) speech.provider = text(s.provider, 'speech.provider', { optional: false, max: 64 });
    if ('rate' in s) speech.rate = number(s.rate, 'speech.rate', { min: 0.5, max: 1.5, optional: false });
    if ('cardAuto' in s) speech.card_auto = oneOf(s.cardAuto, ['off', 'front', 'back'], 'speech.cardAuto');
    if ('grammarAuto' in s) speech.grammar_auto = bool(s.grammarAuto, 'speech.grammarAuto') ? 1 : 0;
    if ('includeExample' in s) speech.include_example = bool(s.includeExample, 'speech.includeExample') ? 1 : 0;
    if (Object.keys(speech).length) {
      db.prepare(`UPDATE user_speech_settings SET ${Object.keys(speech).map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE user_id = ?`).run(...Object.values(speech), now, userId);
    }
    for (const [provider, voice] of Object.entries(s.voices ?? {})) {
      const chosen = text(voice?.voice, `speech.voices.${provider}.voice`, { max: 160 });
      if (!chosen) { db.prepare('DELETE FROM user_speech_voices WHERE user_id = ? AND provider = ?').run(userId, provider); continue; }
      db.prepare(`INSERT INTO user_speech_voices (user_id, provider, voice, style, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, provider) DO UPDATE SET voice = excluded.voice, style = excluded.style, role = excluded.role, updated_at = excluded.updated_at`)
        .run(userId, provider, chosen, text(voice?.style, 'style', { max: 160 }), text(voice?.role, 'role', { max: 160 }), now, now);
    }
  }
  if (input.cardTemplates !== undefined) {
    for (const [kind, code] of Object.entries(input.cardTemplates ?? {})) {
      oneOf(kind, KINDS, 'cardTemplates 的类别');
      const template = db.prepare('SELECT rid FROM card_templates WHERE code = ? AND kind = ?').get(code, kind);
      if (!template) throw new InputError(`没有适用于 ${kind} 的模板：${code}`);
      db.prepare(`INSERT INTO user_card_templates (user_id, kind, template_rid, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, kind) DO UPDATE SET template_rid = excluded.template_rid, updated_at = excluded.updated_at`).run(userId, kind, template.rid, now);
    }
  }
  if (input.questionTypeTips !== undefined) {
    for (const [typeId, tip] of Object.entries(input.questionTypeTips ?? {})) {
      const value = text(tip, `questionTypeTips.${typeId}`, { max: 4000 });
      if (!value) { db.prepare('DELETE FROM user_question_type_tips WHERE user_id = ? AND type_id = ?').run(userId, typeId); continue; }
      if (!db.prepare('SELECT 1 FROM question_types WHERE type_id = ?').get(typeId)) throw new InputError(`未知题型：${typeId}`);
      db.prepare(`INSERT INTO user_question_type_tips (user_id, type_id, tip, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id, type_id) DO UPDATE SET tip = excluded.tip, updated_at = excluded.updated_at`).run(userId, typeId, value, now, now);
    }
  }
  if (input.customTips !== undefined) {
    // 渡したものが全部：id（rid）があれば更新、なければ追加、渡されなかったものは削除
    const keep = new Set();
    for (const [i, tip] of list(input.customTips, 'customTips').entries()) {
      const values = [text(tip?.section, `customTips[${i}].section`, { optional: false, max: 40 }), text(tip?.title, `customTips[${i}].title`, { optional: false, max: 200 }),
        text(tip?.description, `customTips[${i}].description`, { max: 2000 }), text(tip?.tip, `customTips[${i}].tip`, { optional: false, max: 4000 })];
      const rid = Number(tip?.id);
      const existing = Number.isInteger(rid) && db.prepare('SELECT rid FROM user_custom_tips WHERE rid = ? AND user_id = ?').get(rid, userId);
      if (existing) {
        db.prepare('UPDATE user_custom_tips SET section = ?, title = ?, description = ?, tip = ?, updated_at = ? WHERE rid = ?').run(...values, now, rid);
        keep.add(rid);
      } else {
        keep.add(Number(db.prepare('INSERT INTO user_custom_tips (user_id, section, title, description, tip, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(userId, ...values, typeof tip?.createdAt === 'string' ? tip.createdAt : now, now).lastInsertRowid));
      }
    }
    for (const row of db.prepare('SELECT rid FROM user_custom_tips WHERE user_id = ?').all(userId)) if (!keep.has(row.rid)) db.prepare('DELETE FROM user_custom_tips WHERE rid = ?').run(row.rid);
  }
  return getSettings(db, userId);
}

/** 记忆卡模板（按说明语言显示名称与说明）。 */
export function listCardTemplates(db, language) {
  const templates = db.prepare('SELECT rid, code, kind, is_default, sort_order FROM card_templates ORDER BY sort_order').all();
  const texts = pickTexts(db, templates.map((t) => ['card_templates', t.rid]), language);
  const fields = db.prepare('SELECT template_rid, side, position, field, max_items, with_translation FROM card_template_fields ORDER BY template_rid, side, position').all();
  return templates.map((t) => {
    const own = texts.get(`card_templates:${t.rid}`) ?? {};
    const sides = { front: [], back: [] };
    for (const f of fields.filter((x) => x.template_rid === t.rid)) sides[f.side].push({ field: f.field, maxItems: f.max_items, withTranslation: f.with_translation === 1 });
    return { code: t.code, kind: t.kind, isDefault: t.is_default === 1, name: own.name ?? null, description: own.description ?? null, ...sides };
  });
}

export function listLanguages(db) {
  return db.prepare('SELECT code, native_name, fallback_code FROM languages WHERE enabled = 1 ORDER BY sort_order').all()
    .map((r) => ({ code: r.code, nativeName: r.native_name, fallback: r.fallback_code }));
}
