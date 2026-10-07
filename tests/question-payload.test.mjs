import {test} from 'node:test';import assert from 'node:assert/strict';
import {questionStrategies} from '../src/domain/questionContract.mjs';
import {questionSpecifications,validateQuestionPayload} from '../src/domain/questionPayload.mjs';
const base={level:'N1',prompt:'条件を保存する。',choices:['A','B','C','D'],answerIndex:0,explanation:'本文から判断。'};
test('each registered type has concrete content, explanation steps, tips and knowledge guidance',()=>{
 assert.deepEqual(Object.keys(questionSpecifications).sort(),Object.keys(questionStrategies).sort());
 for(const spec of Object.values(questionSpecifications)){assert.ok(spec.requiredContent.length);assert.ok(spec.explanationSteps.length>=2);assert.ok(spec.reviewChecks&&spec.tip&&spec.knowledgeTopics.length);}
});
test('star composition validates a full permutation and frozen star answer, rather than only four options',()=>{
 const q={...base,questionTypeId:'grammar-composition',assembly:{correctOrder:['option-1','option-0','option-3','option-2'],starSlot:1}};
 assert.ok(validateQuestionPayload(q).valid);assert.equal(validateQuestionPayload(q).strictExamEligible,false);
 assert.equal(validateQuestionPayload({...q,reviewStatus:'approved'}).strictExamEligible,true);
 assert.ok(!validateQuestionPayload({...q,assembly:{...q.assembly,starSlot:0}}).valid);
 assert.ok(!validateQuestionPayload({...q,assembly:{...q.assembly,correctOrder:['option-0','option-0','option-2','option-3']}}).valid);
});
test('integrated reading requires both articles, search conditions persist and supplementary training is never official',()=>{
 const a={type:'article',blocks:[{text:'本文【1】。'}]};
 assert.ok(!validateQuestionPayload({...base,questionTypeId:'reading-integrated'},{materialPayloads:[a]}).valid);
 assert.ok(!validateQuestionPayload({...base,questionTypeId:'reading-integrated'},{materialPayloads:[a,a]}).valid);
 const materialRefs=[{id:'article-A',revision:1},{id:'article-B',revision:1}];
 assert.ok(validateQuestionPayload({...base,questionTypeId:'reading-integrated',materialRefs},{materialPayloads:[a,a]}).valid);
 assert.ok(!validateQuestionPayload({...base,questionTypeId:'reading-integrated',materialRefs:[materialRefs[0],materialRefs[0]]},{materialPayloads:[a,a]}).valid);
 assert.ok(!validateQuestionPayload({...base,questionTypeId:'reading-information'},{materialPayloads:[a]}).valid);
 assert.ok(!validateQuestionPayload({...base,questionTypeId:'grammar-text',blankId:'【2】'},{materialPayloads:[a]}).valid);
 assert.ok(!validateQuestionPayload({...base,questionTypeId:'vocabulary-word-formation'}).valid);
 assert.equal(validateQuestionPayload({...base,questionTypeId:'listening-basic-training',choices:[],answerIndex:-1},{materialPayloads:[{type:'audio'}]}).strictExamEligible,false);
});
