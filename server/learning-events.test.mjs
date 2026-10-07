import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {ensureLearningEventSchema,recordLearningEvent,learningEventsInWindow,learningEventStats} from './learning-events.mjs';
test('stable event identity separates subjective ratings from objective accuracy and rejects unanswered/conflicting payloads',()=>{
 const db=new DatabaseSync(':memory:');try{ensureLearningEventSchema(db);
 const answer={eventId:'answer-1',type:'AnswerSubmitted',occurredAt:'2026-10-07T00:00:00Z',payload:{questionId:'Q1',selected:'A',correct:true,questionRef:{id:'bank-Q1',revision:1}}};
 assert.equal(recordLearningEvent(db,1,answer),true);assert.equal(recordLearningEvent(db,1,answer),false);
 assert.throws(()=>recordLearningEvent(db,1,{...answer,payload:{...answer.payload,correct:false}}),/conflicts/);
 assert.throws(()=>recordLearningEvent(db,1,{...answer,eventId:'unanswered',payload:{...answer.payload,selected:''}}),/actual selection/);
 recordLearningEvent(db,1,{eventId:'rating-1',type:'MemoryRated',occurredAt:'2026-10-07T01:00:00Z',payload:{itemId:'IT1',rating:'forgot'}});
 assert.deepEqual(learningEventStats(learningEventsInWindow(db,1)),{objective:{answered:1,correct:1,incorrect:0,accuracy:1},subjective:{reviews:1,ratings:{forgot:1,hard:0,remembered:0,easy:0}}});
 assert.deepEqual(learningEventsInWindow(db,2),[]);
 assert.equal(learningEventsInWindow(db,1,{start:'2026-10-07T01:00:00Z',end:'2026-10-07T02:00:00Z'}).length,1);
 }finally{db.close();}
});
