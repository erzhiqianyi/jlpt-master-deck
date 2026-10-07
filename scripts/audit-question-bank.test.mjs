import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditQuestionSources } from './audit-question-bank.mjs';
test('dry-run accounts for all sources, does not guess numeric bases or auto-merge duplicates',()=>{
 const q={kind:'meaning',prompt:'同じ題干',choices:['a','b'],answer:'a'};
 const record=id=>({owner:1,source:{kind:'draft',id:'DR947',questionId:id},question:q});
 const records=[record('a'),record('b'),{...record('numeric'),question:{...q,answer:0}}];
 const result=auditQuestionSources(records);
 assert.equal(result.total,3);assert.equal(result.accepted.length,2);assert.equal(result.rejected.length,1);
 assert.notEqual(result.accepted[0].id,result.accepted[1].id);
 assert.equal(result.duplicateCandidates.length,1);
 assert.deepEqual(auditQuestionSources(records),result);
});
