// 题目编辑表单的辅助函数：按题型生成空题、自动检测标记、读取结果与写入输入互换。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyGroup, detectStarSlots, autoMarks, passageBlank, markText, groupToForm, formToInput } from '../src/domain/questionEditing.mjs';
import { validateQuestionGroup } from '../src/domain/questionValidation.mjs';

const rules = (entries) => Object.fromEntries(entries.map(([rule, requirement, value = null]) => [rule, { requirement, value }]));
const composition = { typeId: 'grammar-composition', module: 'grammar', targetMarking: 'star', optionMedia: 'text', materialKinds: 'none', drawWholeGroup: false, answerMode: 'choice', levels: ['N1'],
  rules: rules([['prompt', 'required'], ['options', 'required', 4], ['correct_option', 'required'], ['marks', 'required'], ['materials', 'forbidden'], ['basis', 'required'], ['option_analysis', 'required'], ['expected_text', 'forbidden']]) };
const dictation = { typeId: 'listening-basic-dictation', module: 'listening', targetMarking: 'none', optionMedia: 'none', materialKinds: 'audio', drawWholeGroup: true, answerMode: 'text_input', levels: [],
  rules: rules([['prompt', 'optional'], ['options', 'forbidden'], ['correct_option', 'forbidden'], ['expected_text', 'required'], ['materials', 'required'], ['basis', 'optional'], ['option_analysis', 'forbidden'], ['marks', 'forbidden']]) };

test('an empty group follows the type rules', () => {
  const group = emptyGroup(composition);
  assert.equal(group.questions[0].options.length, 4);
  assert.equal(group.questions[0].explanation[0].kind, 'basis');
  const listening = emptyGroup(dictation);
  assert.equal(listening.questions[0].options.length, 0);
  assert.equal(listening.questions[0].expectedText, '');
  assert.deepEqual(listening.materials.map((m) => m.role), ['audio']);
});

test('marks are detected from the prompt or passage with UTF-16 offsets', () => {
  const prompt = 'あの店は（　）（　）（★）（　）おいしい。';
  const slots = detectStarSlots(prompt);
  assert.deepEqual(slots.map((s) => s.kind), ['slot', 'slot', 'star_slot', 'slot']);
  assert.equal(prompt.slice(slots[2].start, slots[2].end), '（★）');
  assert.deepEqual(autoMarks({ targetMarking: 'underline' }, { prompt: '𠮷野家に遅刻した。' }, { target: '遅刻' }).map((m) => [m.start, m.end]), [[5, 7]], '𠮷 は UTF-16 で 2 単位');
  const body = '昔は（１）だった。今は（２）である。';
  const blank = passageBlank(body, 2);
  assert.equal(body.slice(blank[0].start, blank[0].end), '（２）');
  assert.equal(markText({ prompt: '' }, blank[0], [{ role: 'main', body }]), '（２）');
});

test('a form round-trips to valid input and edited shared materials are not overwritten', () => {
  const group = { typeId: 'grammar-composition', level: null, official: false, shuffleOptions: true, instruction: null, instructionTranslation: null, context: null, contextTranslation: null, sourceReference: null,
    materials: [{ role: 'main', material: 'MT1', kind: 'passage', body: '本文', transcript: null, mediaId: null }],
    questions: [{ code: 'QG1', prompt: 'あの店は（　）（　）（★）（　）おいしい。', promptMediaId: null, expectedText: null, translation: { text: '那家店…', language: 'zh-Hans' },
      marks: detectStarSlots('あの店は（　）（　）（★）（　）おいしい。'), evidence: [], tags: [], knowledge: [],
      options: ['安い', 'だけ', 'でなく', '量も多くて'].map((text, i) => ({ id: 10 + i, text, mediaId: null, correct: i === 2, distractorType: null, analysis: { text: `理由${i}`, language: 'zh-Hans' }, translation: null })),
      explanation: [{ kind: 'basis', title: null, body: { text: '依据', language: 'zh-Hans' } }] }] };
  const form = groupToForm(group);
  const input = formToInput(form, { originalMaterials: group.materials });
  assert.deepEqual(input.materials, [{ role: 'main', material: 'MT1' }], '没改的素材只引用');
  assert.deepEqual(input.questions[0].options.map((o) => o.id), [10, 11, 12, 13]);
  form.materials[0].body = '改过的本文';
  assert.equal(formToInput(form, { originalMaterials: group.materials }).materials[0].material, undefined, '改过的素材作为新素材提交');
  const { errors } = validateQuestionGroup({ ...input, materials: [] }, composition);
  assert.deepEqual(errors, []);
});
