import { exportReviewDataBackup, reviewItemById, upsertReviewItem } from '../server/storage.mjs';

const userId = Number(process.env.JLPT_USER_ID);
if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Set JLPT_USER_ID to the account to repair');

const vaguePartOfSpeech = '語句';

const nounIds = new Set([
  'd01-002', 'd01-003', 'd01-004', 'd01-005', 'd01-006', 'd01-008', 'd01-009', 'd01-022',
  'd02-001', 'd02-002', 'd02-003', 'd02-004', 'd02-005', 'd02-006', 'd02-007', 'd02-008',
  'd02-010', 'd02-011', 'd02-012', 'd02-019', 'd02-034', 'd02-035',
  'd03-003',
  'd04-001', 'd04-002', 'd04-003', 'd04-004', 'd04-005', 'd04-006', 'd04-007',
  'd05-006', 'd05-007', 'd05-008', 'd05-009', 'd05-010',
  'd06-018', 'd06-026',
].map((suffix) => `n2-textbook-week2-${suffix}`));

const nounPhraseIds = new Set([
  'd01-021', 'd02-021', 'd04-028', 'd06-010',
].map((suffix) => `n2-textbook-week2-${suffix}`));

const suruNounIds = new Set([
  'd05-001', 'd05-003', 'd05-005',
].map((suffix) => `n2-textbook-week2-${suffix}`));

const iAdjectiveIds = new Set([
  'd02-023', 'd02-025', 'd02-033', 'd03-024',
].map((suffix) => `n2-textbook-week2-${suffix}`));

const singleVerbIds = new Set([
  'd01-013', 'd03-017', 'd05-032', 'd05-034', 'd05-035',
].map((suffix) => `n2-textbook-week2-${suffix}`));

const specialBaseForms = new Map([
  ['n2-textbook-week2-d02-024', '体がもつ'],
  ['n2-textbook-week2-d02-026', 'やる気が出る'],
  ['n2-textbook-week2-d05-002', '名前をつけて保存する'],
]);

const forcedIchidanIds = new Set([
  'd02-026', 'd04-021',
].map((suffix) => `n2-textbook-week2-${suffix}`));

function godanForms(base) {
  const ending = base.at(-1);
  const stem = base.slice(0, -1);
  const endings = {
    う: ['います', 'わない', 'った'],
    く: ['きます', 'かない', 'いた'],
    ぐ: ['ぎます', 'がない', 'いだ'],
    す: ['します', 'さない', 'した'],
    つ: ['ちます', 'たない', 'った'],
    ぬ: ['にます', 'なない', 'んだ'],
    ぶ: ['びます', 'ばない', 'んだ'],
    む: ['みます', 'まない', 'んだ'],
    る: ['ります', 'らない', 'った'],
  };
  const forms = endings[ending];
  if (!forms) throw new Error(`Unsupported godan ending: ${base}`);
  return [base, ...forms.map((form) => `${stem}${form}`)];
}

function verbInflection(base, forcedClass) {
  let inflectionClass;
  let forms;
  if (base.endsWith('する')) {
    const stem = base.slice(0, -2);
    inflectionClass = 'suru';
    forms = [base, `${stem}します`, `${stem}しない`, `${stem}した`];
  } else if (forcedClass === 'ichidan' || base.endsWith('される') || base.endsWith('える') || base.endsWith('ける') || base.endsWith('げる') || base.endsWith('てる') || base.endsWith('でる') || base.endsWith('ねる') || base.endsWith('べる') || base.endsWith('める') || base.endsWith('せる') || base.endsWith('れる') || base.endsWith('いる')) {
    const stem = base.slice(0, -1);
    inflectionClass = 'ichidan';
    forms = [base, `${stem}ます`, `${stem}ない`, `${stem}た`];
  } else {
    inflectionClass = 'godan';
    forms = godanForms(base);
  }
  return {
    inflection_class: inflectionClass,
    base_form: base,
    conjugations: ['dictionary', 'polite', 'negative', 'past'].map((kind, index) => ({ kind, form: forms[index] })),
  };
}

function adjectiveInflection(original) {
  const stem = original.slice(0, -1);
  return {
    inflection_class: 'i_adjective',
    base_form: original,
    conjugations: [
      { kind: 'dictionary', form: original },
      { kind: 'polite', form: `${original}です` },
      { kind: 'past', form: `${stem}かった` },
      { kind: 'te', form: `${stem}くて` },
    ],
  };
}

function correctedItem(item) {
  if (nounIds.has(item.id)) {
    return { ...item, part_of_speech: '名詞', inflection_class: undefined, base_form: undefined, conjugations: [] };
  }
  if (nounPhraseIds.has(item.id)) {
    return { ...item, part_of_speech: '名詞句', inflection_class: undefined, base_form: undefined, conjugations: [] };
  }
  if (suruNounIds.has(item.id)) {
    return { ...item, part_of_speech: '名詞・サ変動詞', ...verbInflection(`${item.original}する`) };
  }
  if (item.id === 'n2-textbook-week2-d03-008') {
    return {
      ...item,
      part_of_speech: 'ナ形容詞',
      inflection_class: 'na_adjective',
      base_form: '抽象的だ',
      conjugations: [
        { kind: 'dictionary', form: '抽象的だ' },
        { kind: 'polite', form: '抽象的です' },
        { kind: 'negative', form: '抽象的ではない' },
        { kind: 'past', form: '抽象的だった' },
      ],
    };
  }
  if (iAdjectiveIds.has(item.id)) {
    return { ...item, part_of_speech: item.original.includes('が') || item.original.includes('間') ? 'イ形容詞句' : 'イ形容詞', ...adjectiveInflection(item.original) };
  }
  if (item.id === 'n2-textbook-week2-d02-022') {
    return { ...item, part_of_speech: '名詞述語句', inflection_class: undefined, base_form: undefined, conjugations: [] };
  }
  const base = specialBaseForms.get(item.id) ?? item.original;
  return { ...item, part_of_speech: singleVerbIds.has(item.id) ? '動詞' : '動詞句', ...verbInflection(base, forcedIchidanIds.has(item.id) ? 'ichidan' : undefined) };
}

const ids = [];
for (let day = 1; day <= 6; day += 1) {
  for (let number = 1; number <= 40; number += 1) {
    ids.push(`n2-textbook-week2-d${String(day).padStart(2, '0')}-${String(number).padStart(3, '0')}`);
  }
}

const targets = ids.map((id) => reviewItemById(id, userId)).filter((item) => item?.part_of_speech === vaguePartOfSpeech);
if (![0, 104].includes(targets.length)) {
  throw new Error(`Expected either 104 uncorrected entries or 0 after migration, found ${targets.length}`);
}
if (targets.length === 0) {
  console.log(JSON.stringify({ corrected: 0, message: 'N2 week 2 parts of speech are already corrected.' }, null, 2));
  process.exit(0);
}

const corrected = targets.map((item) => upsertReviewItem(correctedItem(item), { source: 'mcp:part-of-speech-correction', userId }));
const remaining = corrected.filter((item) => item.part_of_speech === vaguePartOfSpeech);
if (remaining.length) throw new Error(`Correction left ${remaining.length} vague entries`);

const exported = exportReviewDataBackup(userId);
const counts = corrected.reduce((result, item) => {
  result[item.part_of_speech] = (result[item.part_of_speech] ?? 0) + 1;
  return result;
}, {});

console.log(JSON.stringify({ corrected: corrected.length, counts, exported }, null, 2));
