import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { transaction } from './platform.mjs';
import { ensureQuestionBankSchema, adaptQuestionSource, saveQuestionSource, linkQuestionAlias, readQuestionVersion } from './question-bank.mjs';
const question = { id: 'old-1', kind: 'meaning', prompt: '規制', choices: ['制限','発展','予測','転換'], answer: '制限' };
test('source migration is repeatable, preserves versions, isolates owner and never merges same stem', () => {
  const db = new DatabaseSync(':memory:'); ensureQuestionBankSchema(db);
  try {
    const source={kind:'draft',id:'DR947',questionId:'old-1'};
    const adapted=adaptQuestionSource(1,source,question);
    const first=transaction(db,()=>saveQuestionSource(db,adapted));
    assert.deepEqual(saveQuestionSource(db,adapted),first);
    const revised=saveQuestionSource(db,adaptQuestionSource(1,source,{...question,answer:'転換'}));
    assert.equal(revised.id,first.id);assert.equal(revised.revision,2);
    assert.equal(readQuestionVersion(db,1,first).answer.optionId,'option-0');
    assert.equal(readQuestionVersion(db,1,revised).answer.optionId,'option-3');
    assert.equal(readQuestionVersion(db,2,first),null);
    assert.notEqual(saveQuestionSource(db,adaptQuestionSource(1,{...source,questionId:'independent'},question)).id,first.id);
    linkQuestionAlias(db,1,{kind:'practice',id:'PR1',questionId:'instance-1'},first);
    assert.throws(()=>linkQuestionAlias(db,1,{kind:'practice',id:'PR1',questionId:'instance-1'}, {id:'missing',revision:1}),/conflict/);
    assert.equal(db.prepare('SELECT count(*) n FROM bank_question_versions').get().n,3);
  } finally { db.close(); }
});
test('legacy snapshot order and stable answers survive source adaptation', () => {
  const draft=adaptQuestionSource(1,{kind:'draft',id:'DR947',questionId:'q1'},{...question,answer:0},{numericAnswerBase:0});
  assert.deepEqual(draft.payload.legacy.choices,question.choices);
  assert.equal(draft.payload.answer.optionId,'option-0');
  assert.throws(()=>adaptQuestionSource(1,draft.source,{...question,answer:0}),/explicit source base/);
});
