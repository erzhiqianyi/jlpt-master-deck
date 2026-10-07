import { createHash } from 'node:crypto';
import { adaptQuestionSource, saveQuestionSource } from './question-bank.mjs';
import { validateQuestionPayload,questionRegistrySchemaVersion } from '../src/domain/questionPayload.mjs';
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])])) : value;
const fingerprint = payload => createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
const ownerRequired = owner => { if (!Number.isSafeInteger(owner)||owner<1) throw new Error('Authenticated owner required'); };
export function ensureBankMaterialSchema(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS bank_materials(owner INTEGER NOT NULL,id TEXT NOT NULL,latest_revision INTEGER NOT NULL,PRIMARY KEY(owner,id));
 CREATE TABLE IF NOT EXISTS bank_material_versions(owner INTEGER NOT NULL,material_id TEXT NOT NULL,revision INTEGER NOT NULL,fingerprint TEXT NOT NULL,payload_json TEXT NOT NULL,audio_asset_id TEXT,PRIMARY KEY(owner,material_id,revision),UNIQUE(owner,material_id,fingerprint));
 CREATE INDEX IF NOT EXISTS bank_material_asset_refs ON bank_material_versions(owner,audio_asset_id);
 CREATE TABLE IF NOT EXISTS bank_material_groups(owner INTEGER NOT NULL,id TEXT NOT NULL,latest_revision INTEGER NOT NULL,PRIMARY KEY(owner,id));
 CREATE TABLE IF NOT EXISTS bank_material_group_versions(owner INTEGER NOT NULL,group_id TEXT NOT NULL,revision INTEGER NOT NULL,fingerprint TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(owner,group_id,revision),UNIQUE(owner,group_id,fingerprint));`);
}
export function saveMaterial(db,owner,id,payload) {
 ownerRequired(owner);
 if (!id || !['article','audio','image','table'].includes(payload.type)) throw new Error('Material identity and type required');
 if (payload.type==='audio'&&!payload.audioAssetId&&!payload.externalUrl) throw new Error('Audio material requires existing asset identity');
 const hash=fingerprint(payload);
 const same=db.prepare('SELECT revision FROM bank_material_versions WHERE owner=? AND material_id=? AND fingerprint=?').get(owner,id,hash);
 const current=db.prepare('SELECT latest_revision FROM bank_materials WHERE owner=? AND id=?').get(owner,id);
 const revision=same?.revision??(current?.latest_revision??0)+1;
 if (!same) db.prepare('INSERT INTO bank_material_versions VALUES(?,?,?,?,?,?)').run(owner,id,revision,hash,JSON.stringify(stable(payload)),payload.audioAssetId??null);
 db.prepare(`INSERT INTO bank_materials VALUES(?,?,?) ON CONFLICT(owner,id) DO UPDATE SET latest_revision=MAX(bank_materials.latest_revision,excluded.latest_revision)`).run(owner,id,revision);
 return {id,revision};
}
export function readMaterialVersion(db,owner,ref) {
 ownerRequired(owner);
 const row=db.prepare('SELECT payload_json FROM bank_material_versions WHERE owner=? AND material_id=? AND revision=?').get(owner,ref.id,ref.revision);
 return row?JSON.parse(row.payload_json):null;
}
export function saveMaterialGroup(db,owner,id,payload) {
 ownerRequired(owner);
 for (const ref of payload.materialRefs??[]) if (!readMaterialVersion(db,owner,ref)) throw new Error('Owned material revision required');
 for (const ref of payload.questionRefs??[]) {
  if (!db.prepare('SELECT revision FROM bank_question_versions WHERE owner=? AND question_id=? AND revision=?').get(owner,ref.id,ref.revision)) throw new Error('Owned question revision required');
 }
 const hash=fingerprint(payload);
 const same=db.prepare('SELECT revision FROM bank_material_group_versions WHERE owner=? AND group_id=? AND fingerprint=?').get(owner,id,hash);
 const current=db.prepare('SELECT latest_revision FROM bank_material_groups WHERE owner=? AND id=?').get(owner,id);
 const revision=same?.revision??(current?.latest_revision??0)+1;
 if (!same) db.prepare('INSERT INTO bank_material_group_versions VALUES(?,?,?,?,?)').run(owner,id,revision,hash,JSON.stringify(stable(payload)));
 db.prepare('INSERT INTO bank_material_groups VALUES(?,?,?) ON CONFLICT(owner,id) DO UPDATE SET latest_revision=MAX(bank_material_groups.latest_revision,excluded.latest_revision)').run(owner,id,revision);
 return {id,revision};
}
export function persistLibraryQuestion(db,owner,source,question,{materialRefs=[],knowledgeIds=[],groupId=null,status='ready',unscored=false}={}) {
 ownerRequired(owner);
 for (const ref of materialRefs) if (!readMaterialVersion(db,owner,ref)) throw new Error('Owned material revision required');
 const validation=validateQuestionPayload({...question,materialRefs},{strict:question.validationMode==='strict',materialPayloads:materialRefs.map(ref=>readMaterialVersion(db,owner,ref))});
 if(question.validationMode==='strict'&&!validation.valid) throw Object.assign(new Error('Question payload failed type-specific validation'),{code:'question_validation_failed',issues:validation.errors});
 const content={...question};
 for (const key of ['canonicalQuestionId','questionRevision','materialRefs','materialGroupId','reference','audioReference','createdAt','libraryNumber']) delete content[key];
 let adapted;
 if (unscored) {
  const id='bank-'+fingerprint([owner,source.kind,source.id,source.questionId]).slice(0,32);
  adapted={owner,source,id,status,payload:{schemaVersion:1,questionTypeId:content.questionTypeId??null,legacy:content,answer:{type:'unscored'}}};
 } else adapted=adaptQuestionSource(owner,source,content,{status});
 if (question.canonicalQuestionId) {
  const previous=db.prepare('SELECT question_id FROM bank_question_aliases WHERE owner=? AND source_kind=? AND source_id=? AND source_question_id=?').get(owner,source.kind,source.id,source.questionId);
  if (previous && previous.question_id!==question.canonicalQuestionId) throw new Error('Question source identity conflict');
  const owned=db.prepare('SELECT revision FROM bank_question_versions WHERE owner=? AND question_id=? AND revision=?').get(owner,question.canonicalQuestionId,question.questionRevision);
  if (!owned) throw new Error('Owned canonical revision required');
  adapted.id=question.canonicalQuestionId;
 }
 adapted.payload={...adapted.payload,materialRefs,knowledgeIds,materialGroupId:groupId,registrySchemaVersion:questionRegistrySchemaVersion,strictExamEligible:question.validationMode==='strict'&&status==='ready'&&validation.strictExamEligible};
 adapted.fingerprint=fingerprint(adapted.payload);
 return saveQuestionSource(db,adapted);
}
export function questionBankMetadata(db,owner,source) {
 ownerRequired(owner);
 const row=db.prepare(`SELECT a.question_id,a.revision,v.payload_json FROM bank_question_aliases a JOIN bank_question_versions v ON v.owner=a.owner AND v.question_id=a.question_id AND v.revision=a.revision WHERE a.owner=? AND a.source_kind=? AND a.source_id=? AND a.source_question_id=?`).get(owner,source.kind,source.id,source.questionId);
 if (!row) return {};
 const payload=JSON.parse(row.payload_json);
 return {canonicalQuestionId:row.question_id,questionRevision:row.revision,...(payload.questionTypeId?{questionTypeId:payload.questionTypeId}:{}),materialRefs:payload.materialRefs??[],materialGroupId:payload.materialGroupId??null,
  ...(source.kind==='reading'?{questionTypeId:payload.questionTypeId??'reading-basic-training',level:payload.legacy.level??null,materialRef:payload.materialRefs?.[0]??null}: {})};
}
export function bankAudioHasHistory(db,owner,assetId) {
 return !!db.prepare('SELECT revision FROM bank_material_versions WHERE owner=? AND audio_asset_id=? LIMIT 1').get(owner,assetId);
}
export function retireLibraryQuestion(db,owner,source) {
 const meta=questionBankMetadata(db,owner,source);
 if (meta.canonicalQuestionId) db.prepare("UPDATE bank_questions SET status='retired' WHERE owner=? AND id=?").run(owner,meta.canonicalQuestionId);
}

export function persistItemSeeds(db,owner,item) {
 for (const [index,seed] of (item.practice_questions??[]).entries()) {
  const source={kind:'item-seed',id:item.id,questionId:String(seed.id??`seed-${index+1}`)};
  let ready=true;
  try { adaptQuestionSource(owner,source,seed); } catch {ready=false;}
  persistLibraryQuestion(db,owner,source,seed,{knowledgeIds:[item.id],status:ready?'ready':'needs_review',unscored:!ready});
 }
}
export function attachPracticeReferences(db,owner,practice,{status='ready',sourcePracticeId}={}) {
 const practiceId=sourcePracticeId??practice.id;
 if (!practiceId) throw new Error('Practice identity required');
 for (const [index,q] of (practice.questions??[]).entries()) {
  const source=q.sourceDraftId&&q.sourceQuestionId?{kind:'draft',id:q.sourceDraftId,questionId:q.sourceQuestionId}:{kind:'practice',id:practiceId,questionId:String(q.sourceQuestionId??q.id??index)};
  const materialRefs=[...(q.materialRefs??[])];
  const existingMaterials=materialRefs.map(ref=>readMaterialVersion(db,owner,ref));
  if(existingMaterials.some(material=>!material))throw new Error('Owned material revision required');
  if (q.passage&&!existingMaterials.some(material=>['article','table'].includes(material.type))) materialRefs.push(saveMaterial(db,owner,`source:${source.kind}:${source.id}:${source.questionId}:article`,{type:'article',blocks:[{id:'legacy-text',type:'paragraph',text:q.passage}],translation:q.translation}));
  if (q.audioUrl&&!existingMaterials.some(material=>material.type==='audio')) materialRefs.push(saveMaterial(db,owner,`source:${source.kind}:${source.id}:${source.questionId}:audio`,{type:'audio',externalUrl:q.audioUrl,offlinePlayable:false,transcript:q.transcript}));
  const ref=persistLibraryQuestion(db,owner,source,q,{materialRefs:materialRefs.length?materialRefs:q.materialRefs??[],knowledgeIds:q.knowledgeIds??(q.itemId?[q.itemId]:[]),status});
  q.canonicalQuestionId=ref.id;q.questionRevision=ref.revision;
  const row=db.prepare('SELECT question_id FROM bank_question_aliases WHERE owner=? AND source_kind=? AND source_id=? AND source_question_id=?').get(owner,'practice',practiceId,q.id);
  if (row && row.question_id!==ref.id) throw new Error('Practice source identity conflict');
  // persistLibraryQuestion already linked the primary source. Keep the legacy instance alias too.
  db.prepare(`INSERT INTO bank_question_aliases VALUES(?,?,?,?,?,?) ON CONFLICT(owner,source_kind,source_id,source_question_id) DO UPDATE SET revision=excluded.revision`).run(owner,'practice',practiceId,q.id,ref.id,ref.revision);
  q.materialRefs=materialRefs.length?materialRefs:q.materialRefs??[];
 }
 return practice;
}
