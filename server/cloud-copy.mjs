import {createHash} from 'node:crypto';
import schema from './cloud-copy-schema.json' with {type:'json'};
export const COPY_SCHEMA=schema;
const q=name=>'"'+name+'"'; // Only fixed-policy identifiers reach SQL.
export const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const digest=value=>createHash('sha256').update(typeof value==='string'||value instanceof Uint8Array?value:canonical(value)).digest('hex');
const fail=message=>{throw new Error(message);};
export function copyOwners(owners){if(!Array.isArray(owners)||!owners.length||owners.length>50||owners.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(owners).size!==owners.length)fail('Invalid explicit owner allowlist');return [...owners].sort((a,b)=>a-b);}
export function mediaKey(path){
 const roots=[['/jlpt/.local/listening-audio/','listening-audio/'],['/jlpt/.local/listening-recordings/','listening-recordings/'],['/jlpt/.local/item-images/','item-images/']];
 if(typeof path!=='string'||path.length>1024||/[\\\x00-\x20%?#]/.test(path))fail('Unsafe media path');
 const entry=roots.find(([prefix])=>path.startsWith(prefix));if(!entry)fail('Unsupported media path');const suffix=path.slice(entry[0].length);
 if(!suffix||suffix.split('/').some(s=>!s||s==='.'||s==='..'||!/^[-\w.]+$/.test(s)))fail('Unsafe media key');return entry[1]+suffix;
}
const rowOwner=(tables,name,row)=>schema.tables[name].parentOwner?(tables.market_shares?.rows??[]).find(r=>r.id===row.share_id)?.user_id:row[schema.tables[name].owner];
export function mediaManifest(tables){
 const entries=new Map();const add=(owner,path,sha256=null,size=null)=>{const key=mediaKey(path);if(sha256!==null&&!/^[a-f0-9]{64}$/.test(sha256))fail('Invalid media SHA256');if(size!==null&&(!Number.isSafeInteger(size)||size<0))fail('Invalid media size');const id=owner+':'+key,existing=entries.get(id);if(existing&&((sha256&&existing.sha256&&sha256!==existing.sha256)||(size!==null&&existing.size!==null&&size!==existing.size)))fail('Conflicting media metadata');entries.set(id,{owner,key,sourcePath:path,sha256:sha256??existing?.sha256??null,size:size??existing?.size??null});};
 const walk=(value,owner)=>{if(!value||typeof value!=='object')return;for(const [key,v]of Object.entries(value)){if(['audio_path','image_path','audioPath','imagePath'].includes(key)&&typeof v==='string')add(owner,v);else if(typeof v==='object')walk(v,owner);}};
 for(const [name,table] of Object.entries(tables))for(const row of table.rows){const owner=rowOwner(tables,name,row);for(const field of ['audio_path','image_path'])if(row[field])add(owner,row[field],row.sha256??null,row.audio_size??row.size??null);for(const [key,v]of Object.entries(row))if(key.endsWith('_json')&&typeof v==='string')walk(JSON.parse(v),owner);}
 return [...entries.values()].sort((a,b)=>a.owner-b.owner||a.key.localeCompare(b.key));
}
/** Call within one transactionSync / BEGIN read transaction. No await, ensure or writes. */
export function createTestCopy(db,{owners,maxRows=100000,maxBytes=32*1024*1024,maxMilliseconds=5000,now=()=>Date.now()}={}){
 owners=copyOwners(owners);for(const [name,n,limit]of [['rows',maxRows,100000],['bytes',maxBytes,32*1024*1024],['milliseconds',maxMilliseconds,5000]])if(!Number.isSafeInteger(n)||n<1||n>limit)fail('Invalid '+name+' budget');
 const start=now(),tables={},source=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);let rowsRead=0,bytes=0;
 const budget=()=>{if(now()-start>maxMilliseconds)fail('Snapshot time budget exceeded');};
 for(const [name,policy]of Object.entries(schema.tables)){budget();if(!source.includes(name))continue;
  const sourceCols=db.prepare(`PRAGMA table_info(${q(name)})`).all().map(r=>r.name),allowed=policy.columns.map(c=>c.name);
  const unknown=sourceCols.filter(c=>!allowed.includes(c)&&!(name==='users'&&schema.excludedFields.includes('users.'+c)));if(unknown.length)fail('Unreviewed schema columns: '+name);
  const columns=policy.columns.filter(c=>sourceCols.includes(c.name));if(!columns.some(c=>c.name===(policy.parentOwner?'share_id':policy.owner)))fail('Missing owner column: '+name);
  const predicate=policy.parentOwner?`share_id IN (SELECT id FROM market_shares WHERE user_id IN (${owners.map(()=>'?')}))`:`${q(policy.owner)} IN (${owners.map(()=>'?')})`;
  const sizes=db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(${columns.map(c=>`COALESCE(length(CAST(${q(c.name)} AS BLOB)),0)`).join('+')}),0) AS bytes FROM ${q(name)} WHERE ${predicate}`).get(...owners);
  if(sizes.n>maxRows-rowsRead||sizes.bytes>maxBytes-bytes)fail('Snapshot preflight budget exceeded');budget();
  let rows;if(name==='users')rows=db.prepare(`SELECT id FROM users WHERE id IN (${owners.map(()=>'?')})`).all(...owners).map(r=>({id:r.id,username:'test-owner-'+r.id,created_at:'2000-01-01T00:00:00.000Z'}));
  else rows=db.prepare(`SELECT ${columns.map(c=>q(c.name)).join(',')} FROM ${q(name)} WHERE ${predicate} LIMIT ?`).all(...owners,maxRows-rowsRead+1);
  rowsRead+=rows.length;if(rowsRead>maxRows)fail('Snapshot row budget exceeded');
  rows=rows.map(r=>Object.fromEntries(columns.map(c=>{const v=r[c.name];if(v!==null&&((c.type==='INTEGER'&&!Number.isSafeInteger(v))||(c.type==='REAL'&&(typeof v!=='number'||!Number.isFinite(v)))||(c.type==='TEXT'&&typeof v!=='string')))fail('Unsupported scalar type/precision');return [c.name,v];})));rows.sort((a,b)=>canonical(a).localeCompare(canonical(b)));
  bytes+=Buffer.byteLength(canonical(rows));if(bytes>maxBytes)fail('Snapshot byte budget exceeded');tables[name]={columns:columns.map(c=>c.name),rows,count:rows.length,hash:digest(rows)};
 }
 if(!tables.users||tables.users.rows.length!==owners.length)fail('Owner identity not found');
 const snapshot={format:'jlpt-test-copy',version:1,owners,tables,media:mediaManifest(tables),audit:{excludedTables:source.filter(name=>!Object.hasOwn(schema.tables,name)).sort(),excludedFields:schema.excludedFields,replacedFields:schema.replacedFields,notDisasterRecovery:true,freeTextMayContainPrivateData:true},consistency:'single-synchronous-sqlite-transaction; media-not-atomic'};
 budget();const text=canonical(snapshot);if(Buffer.byteLength(text)>maxBytes)fail('Snapshot byte budget exceeded');return {snapshot,id:digest(text),text};
}
export function auditTestCopy(snapshot){
 if(!snapshot||snapshot.format!=='jlpt-test-copy'||snapshot.version!==1||!snapshot.tables||typeof snapshot.tables!=='object'||Array.isArray(snapshot.tables))fail('Unsupported snapshot');const owners=copyOwners(snapshot.owners);let total=0;
 for(const [name,table]of Object.entries(snapshot.tables)){const policy=schema.tables[name];if(!policy)fail('Unapproved table');if(!Array.isArray(table.columns)||!table.columns.length||new Set(table.columns).size!==table.columns.length||table.columns.some(c=>!policy.columns.some(p=>p.name===c))||!table.columns.includes(policy.parentOwner?'share_id':policy.owner))fail('Unapproved columns');if(!Array.isArray(table.rows)||table.count!==table.rows.length||table.hash!==digest(table.rows))fail('Row count/hash mismatch');total+=table.rows.length;if(total>100000)fail('Too many rows');
  for(const row of table.rows){if(!row||Object.keys(row).length!==table.columns.length||Object.keys(row).some(c=>!table.columns.includes(c))||!owners.includes(rowOwner(snapshot.tables,name,row))||table.columns.some(name=>{const v=row[name],type=policy.columns.find(c=>c.name===name).type;return v!==null&&((type==='INTEGER'&&!Number.isSafeInteger(v))||(type==='REAL'&&(typeof v!=='number'||!Number.isFinite(v)))||(type==='TEXT'&&typeof v!=='string'));}))fail('Invalid row/owner');if(name==='users'&&(row.username!=='test-owner-'+row.id||row.created_at!=='2000-01-01T00:00:00.000Z'))fail('Unredacted identity');}
 }
 if(!snapshot.tables.users||canonical(snapshot.tables.users.rows.map(r=>r.id).sort((a,b)=>a-b))!==canonical(owners))fail('Owner identity closure failed');
 const media=mediaManifest(snapshot.tables);if(canonical(media)!==canonical(snapshot.media))fail('Media manifest mismatch');
 const references=[];const versions=snapshot.tables.bank_question_versions?.rows??[],materials=snapshot.tables.bank_material_versions?.rows??[];
 const questionRef=(owner,id,revision)=>{if(!versions.some(v=>v.owner===owner&&v.question_id===id&&v.revision===revision))references.push({owner,questionId:id,revision,status:'missingOriginal'});};
 const materialRef=(owner,id,revision)=>{if(!materials.some(m=>m.owner===owner&&m.material_id===id&&m.revision===revision))references.push({owner,materialId:id,revision,status:'missingMaterial'});};
 for(const row of snapshot.tables.bank_questions?.rows??[])questionRef(row.owner,row.id,row.latest_revision);
 for(const row of snapshot.tables.bank_materials?.rows??[])materialRef(row.owner,row.id,row.latest_revision);
 for(const row of snapshot.tables.bank_material_group_versions?.rows??[]){const payload=JSON.parse(row.payload_json);for(const ref of payload.questionRefs??[])questionRef(row.owner,ref.id,ref.revision);for(const ref of payload.materialRefs??[])materialRef(row.owner,ref.id,ref.revision);}
 for(const row of snapshot.tables.listening_questions?.rows??[])if(row.audio_asset_id&&!(snapshot.tables.listening_audio_assets?.rows??[]).some(a=>a.user_id===row.user_id&&a.id===row.audio_asset_id))references.push({owner:row.user_id,audioAssetId:row.audio_asset_id,status:'missingAudioAsset'});
 for(const row of snapshot.tables.bank_question_aliases?.rows??[])if(!versions.some(v=>v.owner===row.owner&&v.question_id===row.question_id&&v.revision===row.revision))references.push({owner:row.owner,questionId:row.question_id,revision:row.revision,status:'missingOriginal'});
 for(const row of versions){const payload=JSON.parse(row.payload_json);for(const ref of payload.materialRefs??[])if(!materials.some(m=>m.owner===row.owner&&m.material_id===ref.id&&m.revision===ref.revision))references.push({owner:row.owner,materialId:ref.id,revision:ref.revision,status:'missingMaterial'});}
 const attempts=[];for(const row of snapshot.tables.practice_state?.rows??[])for(const a of JSON.parse(row.attempt_history_json)){const manifest=a.questionManifest??[];attempts.push({owner:row.user_id,id:a.id,status:Array.isArray(a.questionIds)&&a.questionIds.length>0&&a.questionIds.every(id=>manifest.some(e=>e.instanceId===id&&e.status==='frozen'&&e.snapshot))?'frozen':'missingOriginal',preservedScoreOrderStateHash:digest(a)});}
 return {valid:true,snapshotId:digest(snapshot),counts:Object.fromEntries(Object.entries(snapshot.tables).map(([n,t])=>[n,t.count])),hashes:Object.fromEntries(Object.entries(snapshot.tables).map(([n,t])=>[n,t.hash])),references,attempts,mediaObjects:media.length,excludedFields:schema.excludedFields,replacedFields:schema.replacedFields};
}
export function restoreRows(db,snapshot){const audit=auditTestCopy(snapshot);db.exec('BEGIN IMMEDIATE');try{for(const [name,table]of Object.entries(snapshot.tables)){const policy=schema.tables[name],cols=policy.columns.filter(c=>table.columns.includes(c.name)),pk=cols.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk);db.exec(`CREATE TABLE ${q(name)} (${cols.map(c=>q(c.name)+' '+c.type).join(',')}${pk.length?', PRIMARY KEY('+pk.map(c=>q(c.name)).join(',')+')':''})`);const insert=db.prepare(`INSERT INTO ${q(name)} (${table.columns.map(q).join(',')}) VALUES (${table.columns.map(()=>'?').join(',')})`);for(const row of table.rows)insert.run(...table.columns.map(c=>row[c]));const rows=db.prepare(`SELECT ${table.columns.map(q).join(',')} FROM ${q(name)}`).all().sort((a,b)=>canonical(a).localeCompare(canonical(b)));if(digest(rows)!==table.hash)fail('Restore reconciliation failed');}db.exec('COMMIT');return audit;}catch(e){db.exec('ROLLBACK');throw e;}}
