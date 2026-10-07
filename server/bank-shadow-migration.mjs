import {createHash} from 'node:crypto';
import {ensureQuestionBankSchema,archiveDraftQuestions} from './question-bank.mjs';
import {ensureBankMaterialSchema,attachPracticeReferences,persistItemSeeds,saveMaterial,saveMaterialGroup,persistLibraryQuestion} from './bank-materials.mjs';
import {questionStrategy} from '../src/domain/questionContract.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
/** Hash every pre-existing non-bank table, including history and old answer bytes. */
export function legacyInventory(db) {
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name).filter(name=>!name.startsWith('bank_'));
 return Object.fromEntries(tables.map(name=>{
  const rows=db.prepare(`SELECT * FROM ${quote(name)}`).all().map(row=>JSON.stringify(row,(_,value)=>typeof value==='bigint'?String(value):value)).sort();
  return [name,{count:rows.length,hash:hash(rows)}];
 }));
}
export function migrateBankShadow(db,{batchSize=100,maxBatches=Infinity}={}) {
 if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>1000)throw new Error('Invalid batch size');
 const before=legacyInventory(db);const inputHash=hash(before);
 ensureQuestionBankSchema(db);ensureBankMaterialSchema(db);
 db.exec('CREATE TABLE IF NOT EXISTS bank_shadow_checkpoint(input_hash TEXT PRIMARY KEY,next_index INTEGER NOT NULL,report_json TEXT NOT NULL)');
 const previous=db.prepare('SELECT * FROM bank_shadow_checkpoint WHERE input_hash=?').get(inputHash);
 const report=previous?JSON.parse(previous.report_json):{inputHash,processed:0,errors:[],unsupported:[],complete:false};
 const jobs=[];
 for(const table of ['review_pack_drafts','daily_practices','mock_exams','owned_review_items','user_review_items','reading_questions','listening_audio_assets']) {
  if(!before[table])continue;
  const rows=db.prepare(`SELECT * FROM ${quote(table)} ORDER BY user_id,id`).all();
  for(const row of rows)jobs.push({table,row});
 }
 // These sources require their dedicated material adapters; never silently claim a full backfill.
 if(before.review_items?.count)report.unsupported.push({table:'review_items',count:before.review_items.count,reason:'Global rows have no owner; explicit ownership required'});
 if(before.listening_questions?.count) {
  const columns=db.prepare('PRAGMA table_info(listening_questions)').all();
  const orphanCount=columns.some(column=>column.name==='audio_asset_id')&&before.listening_audio_assets?db.prepare('SELECT COUNT(*) AS n FROM listening_questions q WHERE NOT EXISTS(SELECT 1 FROM listening_audio_assets a WHERE a.id=q.audio_asset_id AND a.user_id=q.user_id)').get().n:before.listening_questions.count;
  if(orphanCount)report.unsupported.push({table:'listening_questions',count:orphanCount,reason:'Missing owned AU identity; media migration must resolve explicitly'});
 }
 report.unsupported=[...new Map(report.unsupported.map(entry=>[entry.table,entry])).values()];
 let index=previous?.next_index??0;let batches=0;
 while(index<jobs.length&&batches++<maxBatches) {
  db.exec('BEGIN IMMEDIATE');
  try {
   const end=Math.min(index+batchSize,jobs.length);
   for(;index<end;index++) {
    const {table,row}=jobs[index];
    db.exec('SAVEPOINT bank_row');
    try {
     if(table==='review_pack_drafts')archiveDraftQuestions(db,row.user_id,{id:row.id,content:JSON.parse(row.content_json)});
     else if(table==='daily_practices')attachPracticeReferences(db,row.user_id,{...JSON.parse(row.practice_json),id:row.id});
     else if(table==='mock_exams')for(const session of JSON.parse(row.content_json).sessions??[])attachPracticeReferences(db,row.user_id,{id:`mock:${row.id}:${session.id}`,questions:session.questions});
     else if(table==='reading_questions') {
      const tags=JSON.parse(row.tags_json??'[]');
      const questionTypeId=tags.find(tag=>questionStrategy(tag)?.module==='reading')??'reading-basic-training';
      const materialRef=saveMaterial(db,row.user_id,`reading:${row.id}`,{type:'article',blocks:[{id:'legacy-text',type:'paragraph',text:row.passage}],translation:row.passage_translation??undefined,translationLines:JSON.parse(row.translation_lines_json??'[]'),readingAnalysis:JSON.parse(row.reading_analysis_json??'null')??undefined,rubyTerms:JSON.parse(row.ruby_terms_json??'[]'),japaneseAnnotations:JSON.parse(row.japanese_annotations_json??'[]')});
      const groupId=`reading:${materialRef.id}@${materialRef.revision}`;
      const question={id:row.id,title:row.title,prompt:row.question,question:row.question,passage:row.passage,choices:JSON.parse(row.choices_json),answerIndex:row.answer_index,explanation:row.explanation,tags,questionTypeId};
      const ref=persistLibraryQuestion(db,row.user_id,{kind:'reading',id:row.id,questionId:row.id},question,{materialRefs:[materialRef],groupId});
      saveMaterialGroup(db,row.user_id,groupId,{materialRefs:[materialRef],questionRefs:[ref],extraction:'whole-group'});
     } else if(table==='listening_audio_assets') {
      const materialRef=saveMaterial(db,row.user_id,`audio:${row.id}`,{type:'audio',audioAssetId:row.id,fileName:row.file_name,mime:row.mime,sha256:row.sha256,transcript:row.transcript??'',transcriptTranslation:row.transcript_translation??''});
      const refs=[];const groupId=`audio:${row.id}`;
      const questions=before.listening_questions?db.prepare('SELECT * FROM listening_questions WHERE user_id=? AND audio_asset_id=? ORDER BY id').all(row.user_id,row.id):[];
      for(const q of questions)refs.push(persistLibraryQuestion(db,row.user_id,{kind:'listening',id:q.id,questionId:q.id},{id:q.id,title:q.title,prompt:q.question,question:q.question,questionTypeId:q.question_type_id??'listening-task',choices:JSON.parse(q.choices_json),answerIndex:q.answer_index,explanation:q.explanation,choiceDetails:JSON.parse(q.choice_details_json??'[]')},{materialRefs:[materialRef],groupId,unscored:q.answer_index===-1}));
      saveMaterialGroup(db,row.user_id,groupId,{materialRefs:[materialRef],questionRefs:refs,extraction:'whole-group'});
     } else persistItemSeeds(db,row.user_id,{...JSON.parse(row.item_json),id:row.id});
     report.processed++;
     db.exec('RELEASE bank_row');
    }catch(error){db.exec('ROLLBACK TO bank_row');db.exec('RELEASE bank_row');report.errors.push({table,id:row.id,owner:row.user_id,message:error.message});}
   }
   report.complete=index===jobs.length&&report.errors.length===0&&report.unsupported.length===0;
   db.prepare('INSERT INTO bank_shadow_checkpoint VALUES(?,?,?) ON CONFLICT(input_hash) DO UPDATE SET next_index=excluded.next_index,report_json=excluded.report_json').run(inputHash,index,JSON.stringify(report));
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 const after=legacyInventory(db);
 if(hash(after)!==inputHash)throw new Error('Legacy data changed during shadow migration; reject this target');
 return {...report,nextIndex:index,totalJobs:jobs.length,legacyUnchanged:true,inventory:after,identityReport:shadowIdentityReport(db)};
}

/** Reconcile identities without rewriting history or inventing an original revision. */
export function shadowIdentityReport(db) {
 const inventory=legacyInventory(db);
 const aliases=db.prepare('SELECT owner,source_kind,source_id,source_question_id,question_id,revision FROM bank_question_aliases ORDER BY owner,source_kind,source_id,source_question_id').all();
 const materials=db.prepare('SELECT owner,material_id,revision,audio_asset_id FROM bank_material_versions ORDER BY owner,material_id,revision').all();
 const retained=[];const attempts=[];
 for(const table of Object.keys(inventory)) {
  const columns=db.prepare(`PRAGMA table_info(${quote(table)})`).all();
  const keys=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
  const identities=keys.length?keys:columns.map(c=>c.name).filter(name=>['id','user_id','question_id','item_id'].includes(name));
  if(!identities.length)continue;
  for(const row of db.prepare(`SELECT * FROM ${quote(table)}`).all()) {
   retained.push({table,identity:Object.fromEntries(identities.map(key=>[key,row[key]])),status:'legacyRetained',rowHash:hash(row)});
   if(table==='practice_state')for(const attempt of JSON.parse(row.attempt_history_json??'[]')) {
    const manifest=attempt.questionManifest;
    attempts.push({owner:row.user_id,id:attempt.id,questionIds:attempt.questionIds??[],status:manifest?.length===attempt.questionIds?.length&&manifest.every(entry=>entry.status==='frozen'&&entry.snapshot)?'frozen':'missingOriginal',scoreHash:hash({answers:attempt.answers,summary:attempt.summary}),missingOriginal:(attempt.questionIds??[]).filter(id=>!manifest?.some(entry=>entry.instanceId===id&&entry.status==='frozen'&&entry.snapshot))});
   }
  }
 }
 return {aliases,materials,retained,attempts,counts:{canonicalAliases:aliases.length,materialVersions:materials.length,legacyIdentities:retained.length,frozenAttempts:attempts.filter(a=>a.status==='frozen').length,missingOriginalAttempts:attempts.filter(a=>a.status==='missingOriginal').length},policy:'legacyRetained is not canonical mapping; missingOriginal is quarantined from replay, never regraded'};
}
