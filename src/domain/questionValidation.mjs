// 題目の校驗（v3）。題型ごとの規則データ（question_type_rules）で動き、サーバーの書き込み・MCP・Web のフォームが同じこの関数を使う。
// データベースは見ない：既存素材の本文は呼び出し側が materialTexts で渡す。データベースが要る自動檢查（他の題との選項重複、知識項目との照合）はサーバー側。
//
// 入力（題組）：
//   { typeId, level?, materials?: [{ role, material?: 'MT3' | kind, body?, transcript?, mediaId?, sentences? }],
//     questions: [{ prompt?, promptMediaId?, expectedText?, marks?: [{ kind, start, end, label?, material?: role }],
//                   options?: [{ text?, mediaId?, correct?, analysis? }], explanation?: [{ kind, title?, body }],
//                   evidence?: [{ option?: 選項の番号(0 始まり), material?: role, source, start?, end?, quote }] }] }
// 題型：{ typeId, module, targetMarking, optionMedia, materialKinds, answerMode, levels: ['N1', …], rules: { rule: { requirement, value } } }
// 返り値：{ errors: [{ path, code, message }], warnings: [{ path, code, message }] }。errors があれば書き込まない。
// 位置（start、end）は JavaScript の文字列と同じ UTF-16 の位置（text.slice(start, end)）。

const KANJI = /[㐀-鿿豈-﫿々〆ヶ]/u;
const KANA_ONLY = /^[぀-ヿーー・\s]+$/u;
// 翻訳の値は文字列か { text, language }
const blank = (value) => { const v = value && typeof value === 'object' ? value.text : value; return typeof v !== 'string' || !v.trim(); };

/** 素材の役割ごとに必要な組み合わせ。 */
const MATERIAL_ROLES = {
  passage: [['main', ['passage']]],
  passage_pair: [['passage_a', ['passage']], ['passage_b', ['passage']]],
  notice: [['notice', ['notice', 'passage']]],
  audio: [['audio', ['audio']]],
  audio_image: [['audio', ['audio']], ['scene_image', ['image']]],
};
/** 題型の標記方法 → 必要な標記の種類。 */
const MARK_KINDS = { underline: ['target'], blank: ['blank'], star: ['slot', 'star_slot'], passage_blank: ['blank'] };

export function validateQuestionGroup(group, type, { materialTexts = {} } = {}) {
  const errors = [];
  const warnings = [];
  const error = (path, code, message) => errors.push({ path, code, message });
  const warn = (path, code, message) => warnings.push({ path, code, message });
  if (!type) { error('typeId', 'unknown_type', `未知题型：${group?.typeId}`); return { errors, warnings }; }
  const rule = (name) => type.rules?.[name] ?? { requirement: 'optional', value: null };
  const is = (name, requirement) => rule(name).requirement === requirement;

  // ---- 题组 ----
  if (group.level && type.levels?.length && !type.levels.includes(group.level)) {
    error('level', 'level_not_applicable', `${type.typeId} 不用于 ${group.level}（适用：${type.levels.join('、')}）`);
  }
  const materials = Array.isArray(group.materials) ? group.materials : [];
  const textOf = (role, source) => {
    const entry = materials.find((m) => m.role === role);
    if (!entry) return null;
    const known = typeof entry.material === 'string' ? materialTexts[entry.material] : null;
    if (source === 'transcript') return entry.transcript ?? known?.transcript ?? null;
    return entry.body ?? known?.body ?? null;
  };
  if (is('materials', 'required')) {
    if (!materials.length) error('materials', 'materials_required', `${type.typeId} 需要素材（${type.materialKinds}）`);
    for (const [role, kinds] of MATERIAL_ROLES[type.materialKinds] ?? []) {
      const entry = materials.find((m) => m.role === role);
      if (!entry) { error('materials', 'material_role_missing', `缺少素材：${role}（${kinds.join(' / ')}）`); continue; }
      const kind = typeof entry.material === 'string' ? materialTexts[entry.material]?.kind : entry.kind;
      if (kind && !kinds.includes(kind)) error(`materials.${role}`, 'material_kind', `素材 ${role} 应为 ${kinds.join(' / ')}，实际是 ${kind}`);
    }
  } else if (is('materials', 'forbidden') && materials.length) {
    error('materials', 'materials_forbidden', `${type.typeId} 不使用素材`);
  }
  const roles = new Set();
  materials.forEach((m, i) => {
    if (roles.has(m.role)) error(`materials[${i}].role`, 'material_role_duplicate', `素材角色重复：${m.role}`);
    roles.add(m.role);
    if (typeof m.material === 'string') {
      if (!materialTexts[m.material]) error(`materials[${i}].material`, 'material_not_found', `找不到素材：${m.material}`);
      return;
    }
    if (!['passage', 'notice', 'image', 'audio'].includes(m.kind)) { error(`materials[${i}].kind`, 'material_kind', '素材 kind 应为 passage / notice / image / audio，或用 material 引用已有素材'); return; }
    if (['passage', 'notice'].includes(m.kind) && blank(m.body)) error(`materials[${i}].body`, 'material_body_required', '文章、公告需要正文 body');
    if (['image', 'audio'].includes(m.kind) && !m.mediaId) error(`materials[${i}].mediaId`, 'material_media_required', '图片、音频素材需要文件 mediaId（先上传）');
  });

  // ---- 小题 ----
  const questions = Array.isArray(group.questions) ? group.questions : [];
  if (!questions.length) error('questions', 'questions_required', '至少需要一道小题');
  if (!type.drawWholeGroup && questions.length > 1) error('questions', 'single_question_type', `${type.typeId} 每组只有一道小题`);
  questions.forEach((q, qi) => {
    const at = (field) => `questions[${qi}]${field ? `.${field}` : ''}`;
    // 题干
    if (is('prompt', 'required') && blank(q.prompt)) error(at('prompt'), 'prompt_required', '需要题干');
    // 参考答案
    if (is('expected_text', 'required') && blank(q.expectedText)) error(at('expectedText'), 'expected_text_required', '听写题需要参考答案 expectedText');
    if (is('expected_text', 'forbidden') && !blank(q.expectedText)) error(at('expectedText'), 'expected_text_forbidden', `${type.typeId} 没有参考答案（expectedText）`);

    // 选项
    const options = Array.isArray(q.options) ? q.options : [];
    const optionRule = rule('options');
    if (optionRule.requirement === 'forbidden' && options.length) error(at('options'), 'options_forbidden', `${type.typeId} 没有选项`);
    if (optionRule.requirement === 'required' || options.length) {
      if (optionRule.value != null && options.length !== optionRule.value) error(at('options'), 'options_count', `需要正好 ${optionRule.value} 个选项（现在 ${options.length} 个）`);
      else if (optionRule.value == null && options.length < 2 && optionRule.requirement !== 'forbidden') error(at('options'), 'options_count', '至少需要 2 个选项');
    }
    const texts = new Map();
    options.forEach((o, oi) => {
      const path = at(`options[${oi}]`);
      const hasText = !blank(o.text);
      // 音频选项（即時応答等）在题组音频里读出，可以既无文字也无文件
      const spoken = type.optionMedia === 'audio' || type.optionMedia === 'mixed';
      if (type.optionMedia === 'text' && !hasText) error(path, 'option_text_required', '选项需要文字');
      else if (!spoken && !hasText && !o.mediaId) error(path, 'option_empty', '选项需要文字或文件');
      if (hasText) {
        const key = o.text.normalize('NFKC').trim();
        if (texts.has(key)) error(path, 'option_duplicate', `选项文字与第 ${texts.get(key) + 1} 个相同`);
        else texts.set(key, oi);
      }
      if (is('option_analysis', 'required') && blank(o.analysis)) error(`${path}.analysis`, 'option_analysis_required', '每个选项都需要说明为什么对或错（analysis）');
      if (is('option_analysis', 'forbidden') && !blank(o.analysis)) error(`${path}.analysis`, 'option_analysis_forbidden', `${type.typeId} 的选项没有理由说明`);
    });
    const correct = options.filter((o) => o.correct === true).length;
    if (is('correct_option', 'required') && options.length && correct !== 1) error(at('options'), 'correct_option_count', `需要正好一个正确选项（现在 ${correct} 个）`);
    if (is('correct_option', 'forbidden') && correct) error(at('options'), 'correct_option_forbidden', `${type.typeId} 没有正确选项`);

    // 标记
    const marks = Array.isArray(q.marks) ? q.marks : [];
    if (is('marks', 'forbidden') && marks.length) error(at('marks'), 'marks_forbidden', `${type.typeId} 不标记题干`);
    if (is('marks', 'required')) {
      const kinds = MARK_KINDS[type.targetMarking] ?? [];
      if (!marks.some((m) => kinds.includes(m.kind))) error(at('marks'), 'marks_required', `需要标记：${kinds.join(' / ')}`);
      if (type.targetMarking === 'star' && marks.filter((m) => m.kind === 'star_slot').length !== 1) error(at('marks'), 'star_slot_count', '排列题需要正好一个★空位（star_slot）');
      if (type.targetMarking === 'passage_blank' && marks.some((m) => m.kind === 'blank' && !m.material)) error(at('marks'), 'mark_material_required', '文章の文法的空位标在文章正文里（material 填素材角色）');
    }
    marks.forEach((m, mi) => {
      const path = at(`marks[${mi}]`);
      if (!['target', 'blank', 'slot', 'star_slot'].includes(m.kind)) { error(path, 'mark_kind', '标记 kind 应为 target / blank / slot / star_slot'); return; }
      const source = m.material ? textOf(m.material, 'body') : q.prompt;
      if (!Number.isInteger(m.start) || !Number.isInteger(m.end) || m.start < 0 || m.end < m.start) { error(path, 'mark_range', '标记的 start、end 应为从 0 开始的字符位置，end ≥ start'); return; }
      if (source == null) { error(path, 'mark_source', m.material ? `找不到素材 ${m.material} 的正文` : '标记在题干上，但没有题干'); return; }
      if (m.end > source.length) error(path, 'mark_range', `标记超出文字范围（长度 ${source.length}）`);
    });
    // 考查对象不唯一
    if (is('target_not_unique', 'warn') && q.prompt) {
      for (const m of marks.filter((x) => x.kind === 'target' && !x.material)) {
        const target = q.prompt.slice(m.start, m.end);
        if (target && q.prompt.split(target).length > 2) warn(at('marks'), 'target_not_unique', `考查对象「${target}」在题干中出现多次`);
      }
    }

    // 解析
    const sections = Array.isArray(q.explanation) ? q.explanation : [];
    sections.forEach((s, si) => {
      if (!['basis', 'step', 'full_answer', 'tip', 'objective'].includes(s.kind)) error(at(`explanation[${si}].kind`), 'section_kind', '解析段落 kind 应为 basis / step / full_answer / tip / objective');
      if (blank(s.body)) error(at(`explanation[${si}].body`), 'section_body_required', '解析段落需要内容 body');
    });
    const hasBasis = sections.some((s) => s.kind === 'basis' && !blank(s.body));
    if (is('basis', 'required') && !hasBasis) error(at('explanation'), 'basis_required', '需要正确依据（explanation 中 kind 为 basis 的段落）');
    if (is('basis', 'forbidden') && sections.some((s) => s.kind === 'basis')) error(at('explanation'), 'basis_forbidden', `${type.typeId} 没有正确答案，不写正确依据（basis）；参考说明用 step 或 tip`);

    // 证据
    const evidence = Array.isArray(q.evidence) ? q.evidence : [];
    if (is('evidence', 'warn') && !evidence.length) warn(at('evidence'), 'evidence_missing', '建议标出答案依据在原文中的位置（evidence）');
    evidence.forEach((e, ei) => {
      const path = at(`evidence[${ei}]`);
      if (!['prompt', 'body', 'transcript'].includes(e.source)) { error(path, 'evidence_source', '证据 source 应为 prompt / body / transcript'); return; }
      if (blank(e.quote)) { error(`${path}.quote`, 'evidence_quote_required', '证据需要原文摘录 quote'); return; }
      if (e.option != null && !(Number.isInteger(e.option) && e.option >= 0 && e.option < options.length)) error(`${path}.option`, 'evidence_option', '证据的 option 应为选项序号（从 0 开始）');
      const text = e.source === 'prompt' ? q.prompt : textOf(e.material ?? materials[0]?.role, e.source);
      if (text == null) { error(path, 'evidence_text_missing', '找不到证据所在的原文'); return; }
      if (e.start != null || e.end != null) {
        if (!Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.end > text.length || e.end < e.start) error(path, 'evidence_range', '证据位置超出原文范围');
        else if (text.slice(e.start, e.end) !== e.quote) error(path, 'evidence_quote_mismatch', '证据摘录与原文该位置的文字不一致');
      } else if (!text.includes(e.quote)) error(path, 'evidence_quote_not_found', '原文中找不到这段摘录');
    });

    // 自动检查（只警告）
    const optionTexts = options.map((o) => o.text ?? '').filter(Boolean);
    if (is('option_length_skew', 'warn') && options.length >= 3 && correct === 1) {
      const right = options.find((o) => o.correct)?.text ?? '';
      const others = options.filter((o) => !o.correct).map((o) => [...(o.text ?? '')].length);
      const average = others.reduce((a, b) => a + b, 0) / (others.length || 1);
      const length = [...right].length;
      if (average && (length > average * 1.6 || length < average * 0.5) && (length > Math.max(...others) || length < Math.min(...others))) {
        warn(at('options'), 'option_length_skew', '正确选项明显比其他选项长或短，容易被猜中');
      }
    }
    if (is('reading_options_form', 'warn') && optionTexts.length) {
      if (type.typeId === 'vocabulary-kanji-reading' && optionTexts.some((t) => !KANA_ONLY.test(t))) warn(at('options'), 'reading_options_form', '读音题的选项应全部是假名');
      if (type.typeId === 'vocabulary-orthography' && optionTexts.some((t) => !KANJI.test(t))) warn(at('options'), 'reading_options_form', '表記题的选项应全部含汉字');
    }
  });
  return { errors, warnings };
}

/** 服务器返回的题型（GET /api/v3/question-types）里取出给 validateQuestionGroup 的形式。 */
export function typeForValidation(entry) {
  return entry && {
    typeId: entry.typeId, module: entry.module, targetMarking: entry.targetMarking, optionMedia: entry.optionMedia, materialKinds: entry.materialKinds,
    answerMode: entry.answerMode, drawWholeGroup: entry.drawWholeGroup, levels: entry.levels, rules: entry.rules,
  };
}
