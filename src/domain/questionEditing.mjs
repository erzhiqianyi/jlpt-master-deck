// 題目編集フォームの補助（純粋関数）：題型に合わせた空の題組、標記の自動検出、読み取り結果 → 書き込み入力。
// 位置はすべて UTF-16（text.slice(start, end)）。

/** 題型が必要とする素材の役割と種類。 */
export const MATERIAL_SLOTS = {
  none: [],
  passage: [{ role: 'main', kind: 'passage' }],
  passage_pair: [{ role: 'passage_a', kind: 'passage' }, { role: 'passage_b', kind: 'passage' }],
  notice: [{ role: 'notice', kind: 'notice' }],
  audio: [{ role: 'audio', kind: 'audio' }],
  audio_image: [{ role: 'audio', kind: 'audio' }, { role: 'scene_image', kind: 'image' }],
};

const requirement = (type, rule) => type?.rules?.[rule]?.requirement ?? 'optional';

/** 題型の規則に合わせた空の小題。 */
export function emptyQuestion(type) {
  const optionRule = type?.rules?.options;
  const count = requirement(type, 'options') === 'forbidden' ? 0 : optionRule?.value ?? (requirement(type, 'options') === 'required' ? 4 : 0);
  return {
    prompt: '', expectedText: requirement(type, 'expected_text') === 'required' ? '' : null, translation: null, marks: [],
    options: Array.from({ length: count }, (_, i) => ({ id: null, text: '', correct: i === 0 && requirement(type, 'correct_option') === 'required', analysis: '', distractorType: null })),
    explanation: requirement(type, 'basis') === 'required' ? [{ kind: 'basis', title: null, body: '' }] : [],
    evidence: [], tags: [], knowledge: [],
  };
}

/** 題型の規則に合わせた空の題組。 */
export function emptyGroup(type) {
  return {
    typeId: type.typeId, level: null, instruction: '', context: '', sourceReference: '',
    materials: (MATERIAL_SLOTS[type.materialKinds] ?? []).map((slot) => ({ role: slot.role, kind: slot.kind, body: '', transcript: '', mediaId: null })),
    questions: [emptyQuestion(type)],
  };
}

/** 文の組み立て：（　）が空位、（★）が★空位。 */
export function detectStarSlots(prompt) {
  return [...String(prompt ?? '').matchAll(/[（(][\s　]*★?[\s　]*[)）]|＿+★?＿*/g)].map((m) => ({
    kind: m[0].includes('★') ? 'star_slot' : 'slot', start: m.index, end: m.index + m[0].length, label: m[0].includes('★') ? '★' : null, material: null,
  }));
}

/** 括弧の空位（語形成・文脈規定・文法形式）。 */
export function detectBlank(prompt) {
  const match = /（[\s　]*）|\([\s　]*\)|＿{2,}|_{2,}/.exec(String(prompt ?? ''));
  return match ? [{ kind: 'blank', start: match.index, end: match.index + match[0].length, label: null, material: null }] : [];
}

/** 下線の考查对象：題干の中の target 文字列（最初に出てくる位置）。 */
export function markTarget(prompt, target, kind = 'target') {
  const text = String(prompt ?? '');
  const word = String(target ?? '');
  if (!word) return [];
  const start = text.indexOf(word);
  return start < 0 ? [] : [{ kind, start, end: start + word.length, label: null, material: null }];
}

/** 文章の文法：本文の（１）（２）…のうち n 番目（1 始まり）の空位。 */
export function passageBlank(body, number, role = 'main') {
  const digits = String(number).replace(/[0-9]/g, (d) => String.fromCharCode(0xff10 + Number(d)));
  const text = String(body ?? '');
  for (const label of [`（${digits}）`, `(${number})`, `（${number}）`]) {
    const start = text.indexOf(label);
    if (start >= 0) return [{ kind: 'blank', start, end: start + label.length, label: digits, material: role }];
  }
  return [];
}

/** 標記の文字（下線・空位に入っている文字）。 */
export function markText(question, mark, materials = []) {
  const source = mark.material ? materials.find((m) => m.role === mark.material)?.body : question.prompt;
  return source ? source.slice(mark.start, mark.end) : '';
}

/** 題型に合わせて小題の標記を作り直す（考查对象の文字は target で渡す）。 */
export function autoMarks(type, question, { target, index = 0, materials = [] } = {}) {
  if (type.targetMarking === 'star') return detectStarSlots(question.prompt);
  if (type.targetMarking === 'blank') return detectBlank(question.prompt).length ? detectBlank(question.prompt) : markTarget(question.prompt, target, 'blank');
  if (type.targetMarking === 'underline') return markTarget(question.prompt, target);
  if (type.targetMarking === 'passage_blank') {
    const main = materials.find((m) => m.role === 'main');
    return passageBlank(main?.body, index + 1);
  }
  return [];
}

const textOf = (value) => (value && typeof value === 'object' ? value.text ?? '' : value ?? '');

/** 読み取った題組（getQuestionGroup）を編集フォームの値にする：翻訳は言語ごと保持し、表示は文字列。 */
export function groupToForm(group) {
  return {
    typeId: group.typeId, level: group.level, official: group.official, shuffleOptions: group.shuffleOptions,
    instruction: group.instruction ?? '', instructionTranslation: group.instructionTranslation ?? null, context: group.context ?? '', contextTranslation: group.contextTranslation ?? null,
    sourceReference: group.sourceReference ?? '',
    materials: group.materials.map((m) => ({ role: m.role, material: m.material, kind: m.kind, body: m.body ?? '', transcript: m.transcript ?? '', mediaId: m.mediaId ?? null })),
    questions: group.questions.map((q) => ({
      code: q.code, prompt: q.prompt ?? '', promptMediaId: q.promptMediaId ?? null, expectedText: q.expectedText, translation: q.translation ?? null,
      marks: q.marks.map((m) => ({ ...m })), evidence: q.evidence.map((e) => ({ ...e })), tags: [...q.tags],
      knowledge: q.knowledge.map((k) => ({ code: k.code, relation: k.relation })),
      options: q.options.map((o) => ({ id: o.id, text: o.text ?? '', mediaId: o.mediaId ?? null, correct: o.correct, distractorType: o.distractorType ?? null,
        analysis: o.analysis ?? null, translation: o.translation ?? null })),
      explanation: q.explanation.map((s) => ({ kind: s.kind, title: s.title ?? null, body: s.body ?? null })),
    })),
  };
}

/**
 * フォームの値 → 書き込み入力。既存素材を本文ごと編集した場合は参照をやめて新しい素材として送る（共有素材を勝手に変えない）。
 * originalMaterials：読み込んだときの素材（本文の比較用）。
 */
export function formToInput(form, { originalMaterials = [] } = {}) {
  const blankToNull = (v) => (typeof v === 'string' ? (v.trim() ? v : null) : v ?? null);
  return {
    typeId: form.typeId, level: form.level || null, official: form.official ?? false, ...(form.shuffleOptions === undefined ? {} : { shuffleOptions: form.shuffleOptions }),
    instruction: blankToNull(form.instruction), instructionTranslation: form.instructionTranslation ?? undefined,
    context: blankToNull(form.context), contextTranslation: form.contextTranslation ?? undefined, sourceReference: blankToNull(form.sourceReference),
    materials: form.materials.map((m) => {
      const original = m.material ? originalMaterials.find((o) => o.material === m.material) : null;
      const unchanged = original && (original.body ?? '') === (m.body ?? '') && (original.transcript ?? '') === (m.transcript ?? '') && (original.mediaId ?? null) === (m.mediaId ?? null);
      if (unchanged) return { role: m.role, material: m.material };
      return { role: m.role, kind: m.kind, body: blankToNull(m.body), transcript: blankToNull(m.transcript), ...(m.mediaId ? { mediaId: m.mediaId } : {}) };
    }),
    questions: form.questions.map((q) => ({
      prompt: blankToNull(q.prompt), ...(q.promptMediaId ? { promptMediaId: q.promptMediaId } : {}), expectedText: blankToNull(q.expectedText), translation: q.translation ?? undefined,
      marks: q.marks, evidence: q.evidence, tags: q.tags, knowledge: q.knowledge,
      options: q.options.map((o) => ({ id: o.id ?? null, text: blankToNull(o.text), mediaId: o.mediaId ?? null, correct: o.correct === true, distractorType: blankToNull(o.distractorType),
        analysis: typeof o.analysis === 'object' ? o.analysis : blankToNull(o.analysis), translation: typeof o.translation === 'object' ? o.translation : blankToNull(o.translation) })),
      explanation: q.explanation.filter((s) => textOf(s.body).trim()).map((s) => ({ kind: s.kind, title: s.title ?? null, body: s.body })),
    })),
  };
}
