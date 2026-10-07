import {createHash} from 'node:crypto';
import {readQuestionVersion} from './question-bank.mjs';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
export const learningEventSchemaVersion=1;
export function ensureLearningEventSchema(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS learning_events(owner INTEGER NOT NULL,event_id TEXT NOT NULL,event_type TEXT NOT NULL CHECK(event_type IN ('AnswerSubmitted','MemoryRated')),occurred_at TEXT NOT NULL,received_at TEXT NOT NULL,payload_hash TEXT NOT NULL,payload_json TEXT NOT NULL,schema_version INTEGER NOT NULL,PRIMARY KEY(owner,event_id));
 CREATE INDEX IF NOT EXISTS learning_events_owner_time ON learning_events(owner,occurred_at,event_type);`);
 for(const column of ['question_id','item_id']) if(!db.prepare('PRAGMA table_info(learning_events)').all().some(c=>c.name===column)) db.exec(`ALTER TABLE learning_events ADD COLUMN ${column} TEXT`);
 db.exec('CREATE INDEX IF NOT EXISTS learning_events_answer_version ON learning_events(owner,question_id,occurred_at)');
 if(db.prepare("SELECT name FROM sqlite_master WHERE name='answers'").get()&&!db.prepare('PRAGMA table_info(answers)').all().some(column=>column.name==='submission_state'))db.exec("ALTER TABLE answers ADD COLUMN submission_state TEXT NOT NULL DEFAULT 'legacy_submitted'");
 if(db.prepare("SELECT name FROM sqlite_master WHERE name='answers'").get())for(const column of ['answer_event_id','question_ref_json','question_kind'])if(!db.prepare('PRAGMA table_info(answers)').all().some(field=>field.name===column))db.exec(`ALTER TABLE answers ADD COLUMN ${column} TEXT`);
}
export function recordLearningEvent(db,owner,{eventId,type,occurredAt,payload}) {
 if(!Number.isSafeInteger(owner)||owner<1||typeof eventId!=='string'||!eventId||eventId.length>200||!['AnswerSubmitted','MemoryRated'].includes(type)||!Number.isFinite(Date.parse(occurredAt)))throw new Error('Invalid learning event identity or timestamp');
 if(type==='AnswerSubmitted'&&(typeof payload?.questionId!=='string'||!payload.questionId||typeof payload.selected!=='string'||!payload.selected.trim()||typeof payload.correct!=='boolean'))throw new Error('Submitted answers require an actual selection; unanswered is not an incorrect answer');
 if(type==='MemoryRated'&&(!payload?.itemId||!['forgot','hard','remembered','easy'].includes(payload.rating)))throw new Error('Invalid subjective rating');
 const time=new Date(occurredAt).toISOString();const normalized=stable(payload);
 const hash=createHash('sha256').update(JSON.stringify([type,time,normalized])).digest('hex');
 const existing=db.prepare('SELECT payload_hash FROM learning_events WHERE owner=? AND event_id=?').get(owner,eventId);
 if(existing){if(existing.payload_hash!==hash)throw Object.assign(new Error('Learning event ID conflicts with saved content'),{code:'event_conflict',fieldPath:['eventId']});return false;}
 db.prepare('INSERT INTO learning_events(owner,event_id,event_type,occurred_at,received_at,payload_hash,payload_json,schema_version,question_id,item_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner,eventId,type,time,new Date().toISOString(),hash,JSON.stringify(normalized),learningEventSchemaVersion,payload.questionId??null,payload.itemId??null);return true;
}
export function learningEventsInWindow(db,owner,{start,end,type}={}) {
 start=start==null?null:new Date(start).toISOString();end=end==null?null:new Date(end).toISOString();
 return db.prepare(`SELECT event_id AS eventId,event_type AS type,occurred_at AS occurredAt,payload_json AS payload,schema_version AS schemaVersion FROM learning_events WHERE owner=? AND (? IS NULL OR occurred_at>=?) AND (? IS NULL OR occurred_at<?) AND (? IS NULL OR event_type=?) ORDER BY occurred_at,event_id`).all(owner,start??null,start??null,end??null,end??null,type??null,type??null).map(e=>({...e,payload:JSON.parse(e.payload)}));
}
export function learningEventStats(events) {
 const answers=events.filter(e=>e.type==='AnswerSubmitted');const reviews=events.filter(e=>e.type==='MemoryRated');
 const correct=answers.filter(e=>e.payload.correct).length;
 return {objective:{answered:answers.length,correct,incorrect:answers.length-correct,accuracy:answers.length?correct/answers.length:0},subjective:{reviews:reviews.length,ratings:Object.fromEntries(['forgot','hard','remembered','easy'].map(r=>[r,reviews.filter(e=>e.payload.rating===r).length]))}};
}
export function validateFrozenAnswer(db,owner,{canonicalQuestionId,questionRevision,selected,correct}) {
 if(!canonicalQuestionId)return null;
 const snapshot=readQuestionVersion(db,owner,{id:canonicalQuestionId,revision:questionRevision});
 if(!snapshot||snapshot.answer?.type==='unscored')throw new Error('Owned scored question version required');
 const options=snapshot.options?.filter(option=>option.text===selected);
 if(options?.length!==1||correct!==(options[0].id===snapshot.answer.optionId))throw new Error('Answer must agree with the frozen question version');
 return snapshot;
}
export function recordAnswerSnapshot(db,owner,event) {
 const old=db.prepare('SELECT event_type,occurred_at,payload_json FROM learning_events WHERE owner=? AND event_id=?').get(owner,event.eventId);
 if(old){
  const payload=JSON.parse(old.payload_json);
  if(old.event_type!=='AnswerSubmitted'||Date.parse(old.occurred_at)!==Date.parse(event.occurredAt)||['questionId','itemId','selected','correct'].some(key=>payload[key]!==event.payload[key]))throw new Error('Answer snapshot conflicts with saved learning event');
  if(event.payload.questionRef && JSON.stringify(stable(payload.questionRef))!==JSON.stringify(stable(event.payload.questionRef)))throw new Error('Answer snapshot conflicts with saved question revision');
  return false;
 }
 validateFrozenAnswer(db,owner,{...event.payload,canonicalQuestionId:event.payload.questionRef?.id,questionRevision:event.payload.questionRef?.revision});
 return recordLearningEvent(db,owner,{...event,type:'AnswerSubmitted'});
}
