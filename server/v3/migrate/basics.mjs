// 设置、朗读设置、媒体文件、单词本、收集箱。
import { json, array, str, iso } from './context.mjs';
import { typeIdFor } from './normalize.mjs';

const FONT_SIZE_SCALE = { small: 0.9, standard: 1, large: 1.2 };
const CARD_AUTO = new Set(['off', 'front', 'back']);
const RATINGS = new Set(['forgot', 'hard', 'remembered', 'easy']);
const POS_STYLES = new Set(['noun', 'verb', 'particle', 'adjective']);
const STYLE_MODES = new Set(['none', 'underline', 'text']);
const LANGUAGES = new Set(['ja', 'zh-Hans', 'en', 'zh-Hant', 'ko', 'vi', 'id', 'th', 'my', 'ne', 'es', 'fr']);
const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const SETTINGS_KEYS = ['locale', 'explanationLanguage', 'fontSize', 'fontScale', 'feedbackMode', 'practiceNavigation', 'practiceAutoAdvanceSeconds',
  'memoryCardWordSpacing', 'showReviewRuby', 'showExplanationRuby', 'showRomaji', 'requireJlptVocabularyQuestions', 'memoryCardFieldsVersion',
  'ttsProvider', 'jlptVocabularyQuestionKinds', 'memoryCardFrontFields', 'memoryCardBackFields', 'questionTypeTips', 'customQuestionTypeTips',
  'dailyPracticeSources', 'japaneseDisplay', 'speech'];

export function migrateUsersSettings(ctx) {
  const { now } = ctx;
  const users = ctx.target.prepare('SELECT id FROM users ORDER BY id').all().map((r) => r.id);
  const settingsByUser = new Map(ctx.rows('user_settings').map((r) => [r.user_id, { value: json(r.settings_json, {}), updatedAt: iso(r.updated_at, now) }]));
  for (const userId of users) {
    const { value: s = {}, updatedAt = now } = settingsByUser.get(userId) ?? {};
    ctx.unknown('settings_json', s, SETTINGS_KEYS);
    const locale = ['zh-CN', 'ja', 'en'].includes(s.locale) ? s.locale : 'zh-CN';
    const explanation = LANGUAGES.has(s.explanationLanguage) ? s.explanationLanguage : ({ ja: 'ja', en: 'en' }[locale] ?? 'zh-Hans');
    const daily = s.dailyPracticeSources ?? {};
    ctx.insert('user_preferences', {
      user_id: userId,
      ui_language: locale,
      explanation_language: explanation,
      font_scale: clamp(s.fontScale, 0.8, 2, FONT_SIZE_SCALE[s.fontSize] ?? 1),
      feedback_mode: s.feedbackMode === 'batch' ? 'batch' : 'immediate',
      practice_navigation: s.practiceNavigation === 'manual' ? 'manual' : 'auto',
      auto_advance_seconds: Math.round(clamp(s.practiceAutoAdvanceSeconds, 0, 10, 0.5) * 10) / 10,
      show_review_ruby: s.showReviewRuby !== false,
      show_explanation_ruby: s.showExplanationRuby !== false,
      show_romaji: s.showRomaji !== false,
      card_word_spacing: s.memoryCardWordSpacing !== false,
      segmented_display: s.japaneseDisplay?.segmented === true,
      daily_source_answers: daily.answers !== false,
      daily_source_card_reviews: daily.cardReviews !== false,
      daily_source_window: str(daily.window),
      daily_source_hours: Number.isFinite(Number(daily.hours)) && daily.hours !== null ? Number(daily.hours) : null,
      daily_source_time_zone: str(daily.timeZone),
      daily_source_run_at: str(daily.runAt),
      created_at: updatedAt, updated_at: updatedAt,
    });
    for (const rating of new Set(array(daily.ratings))) {
      if (RATINGS.has(rating)) ctx.insert('user_daily_source_ratings', { user_id: userId, rating });
    }
    // 旧形式：requireJlptVocabularyQuestions だけが true で種類の指定がないものは、六種類すべてを選んだ扱い
    const legacyAllKinds = s.requireJlptVocabularyQuestions === true && !Array.isArray(s.jlptVocabularyQuestionKinds)
      ? ['kanji_to_kana', 'kana_to_kanji', 'word_formation', 'moji_goi', 'meaning', 'usage'] : [];
    for (const kind of new Set([...array(s.jlptVocabularyQuestionKinds), ...legacyAllKinds])) {
      const typeId = typeIdFor({ kind });
      if (typeId) ctx.insert('user_question_kinds', { user_id: userId, type_id: typeId });
      else ctx.warn('settings.unknown_question_kind', { userId, kind });
    }
    for (const [pos, style] of Object.entries(s.japaneseDisplay?.styles ?? {})) {
      if (!POS_STYLES.has(pos) || !style) continue;
      ctx.insert('user_pos_styles', { user_id: userId, pos, mode: STYLE_MODES.has(style.mode) ? style.mode : 'none', color: str(style.color) ?? '#326B9C' });
    }
    for (const [kind, tip] of Object.entries(s.questionTypeTips ?? {})) {
      const typeId = typeIdFor({ kind });
      if (typeId && str(tip)) ctx.insert('user_question_type_tips', { user_id: userId, type_id: typeId, tip: str(tip), created_at: updatedAt, updated_at: updatedAt });
      else if (str(tip)) ctx.warn('settings.unknown_tip_type', { userId, kind });
    }
    for (const tip of array(s.customQuestionTypeTips)) {
      if (!str(tip?.title) || !str(tip?.tip)) continue;
      ctx.insert('user_custom_tips', {
        user_id: userId, section: str(tip.section) ?? 'vocabulary', title: str(tip.title), description: str(tip.description), tip: str(tip.tip),
        created_at: iso(tip.createdAt, updatedAt), updated_at: iso(tip.updatedAt, updatedAt),
      });
    }
    const speech = s.speech ?? {};
    ctx.insert('user_speech_settings', {
      user_id: userId,
      provider: str(s.ttsProvider) ?? 'browser',
      rate: clamp(speech.rate, 0.5, 1.5, 1),
      card_auto: CARD_AUTO.has(speech.cardAuto) ? speech.cardAuto : 'off',
      grammar_auto: speech.grammarAuto === true,
      include_example: speech.includeExample === true,
      created_at: updatedAt, updated_at: updatedAt,
    });
    for (const [provider, voice] of Object.entries(speech.voices ?? {})) {
      if (!str(voice?.voice)) continue; // 只迁移实际选过的声音
      ctx.insert('user_speech_voices', { user_id: userId, provider, voice: str(voice.voice), style: str(voice.style), role: str(voice.role), created_at: updatedAt, updated_at: updatedAt });
    }
  }
}

/** 图片、音频文件。返回 legacy 文件 ID → media rid。 */
export function migrateMedia(ctx) {
  for (const r of ctx.rows('item_images')) {
    const rid = ctx.insert('media_files', {
      user_id: r.user_id, kind: 'image', file_name: null, mime: r.mime, size: r.size ?? 0, sha256: r.sha256 ?? '',
      storage_path: r.image_path, created_at: iso(r.created_at, ctx.now), updated_at: iso(r.created_at, ctx.now),
    });
    ctx.remember('image', r.user_id, r.id, rid);
  }
  for (const r of ctx.rows('listening_audio_assets')) {
    const rid = ctx.insert('media_files', {
      user_id: r.user_id, kind: 'audio', file_name: str(r.file_name), mime: r.mime, size: r.size ?? 0, sha256: r.sha256 ?? '',
      storage_path: r.audio_path, created_at: iso(r.created_at, ctx.now), updated_at: iso(r.created_at, ctx.now),
    });
    ctx.remember('audio', r.user_id, r.id, rid);
  }
}

const BUILT_IN = { n1_vocab: 'N1/N2 词汇', name_reading: '补充・人名读法', grammar_expression: '语法・句型' };

/** 单词本：自建单词本 + 实际挂了条目的旧内置词库。 */
export function migrateWordbooks(ctx, itemsByUser) {
  const overrides = new Map(ctx.rows('wordbook_title_overrides').map((r) => [`${r.user_id}\u0000${r.wordbook_id}`, r.title]));
  const titlesTaken = new Map();
  const create = (userId, legacyId, title, createdAt, updatedAt) => {
    const taken = titlesTaken.get(userId) ?? new Set();
    let unique = title;
    for (let n = 2; taken.has(unique); n += 1) unique = `${title} (${n})`;
    if (unique !== title) ctx.warn('wordbook.renamed_duplicate_title', { userId, legacyId, title, renamedTo: unique });
    taken.add(unique);
    titlesTaken.set(userId, taken);
    const { code } = ctx.code(userId, 'WB');
    const rid = ctx.insert('wordbooks', { user_id: userId, code, title: unique, created_at: createdAt, updated_at: updatedAt });
    ctx.remember('wordbook', userId, legacyId, rid, code);
    return rid;
  };
  for (const r of ctx.rows('wordbooks', 'ORDER BY created_at')) {
    const title = overrides.get(`${r.user_id}\u0000${r.id}`) ?? str(r.title) ?? r.id;
    create(r.user_id, r.id, title, iso(r.created_at, ctx.now), iso(r.updated_at, ctx.now));
  }
  // 旧内置词库：用户的条目挂在上面（wordbook_id 为空或等于内置 ID）时才建
  for (const [userId, items] of itemsByUser) {
    const needed = new Set();
    for (const item of items) {
      const target = str(item.wordbook_id) ?? str(array(item.wordbook_ids)[0]);
      if (target && ctx.lookup('wordbook', userId, target)) continue;
      needed.add(target && BUILT_IN[target] ? target : BUILT_IN[item.deck] ? item.deck : 'n1_vocab');
    }
    for (const deck of ['n1_vocab', 'grammar_expression', 'name_reading']) {
      if (!needed.has(deck)) continue;
      create(userId, deck, overrides.get(`${userId}\u0000${deck}`) ?? BUILT_IN[deck], ctx.now, ctx.now);
    }
  }
}

/** 知识点所属单词本的 rid。 */
export function wordbookFor(ctx, userId, item) {
  const target = str(item.wordbook_id) ?? str(array(item.wordbook_ids)[0]);
  return (target && ctx.lookup('wordbook', userId, target))
    ?? ctx.lookup('wordbook', userId, BUILT_IN[target] ? target : BUILT_IN[item.deck] ? item.deck : 'n1_vocab');
}

const CAPTURE_CATEGORIES = new Set(['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure']);
const CAPTURE_STATUS = new Set(['inbox', 'processed', 'archived']);

export function migrateCaptures(ctx) {
  for (const r of ctx.rows('learning_captures', 'ORDER BY created_at')) {
    const { code } = ctx.code(r.user_id, 'IN');
    const target = str(r.target_wordbook_id) ?? str(r.target_deck);
    const rid = ctx.insert('inbox_captures', {
      user_id: r.user_id, code, body: str(r.body) ?? '',
      category: CAPTURE_CATEGORIES.has(r.category) ? r.category : 'unsure',
      context: str(r.context),
      target_wordbook_rid: target ? ctx.lookup('wordbook', r.user_id, target) : null,
      status: CAPTURE_STATUS.has(r.status) ? r.status : 'inbox',
      created_at: iso(r.created_at, ctx.now), updated_at: iso(r.updated_at, ctx.now),
    });
    ctx.remember('capture', r.user_id, r.id, rid, code);
  }
}
