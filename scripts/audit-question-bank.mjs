// Explicit JSON inventory only: never opens the application database or a remote API.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { adaptQuestionSource } from '../server/question-bank.mjs';
export function auditQuestionSources(records) {
  if (!Array.isArray(records)) throw new Error('Inventory requires records array');
  const accepted=[], rejected=[], fingerprints=new Map();
  for (const [index,record] of records.entries()) {
    try {
      const result=adaptQuestionSource(record.owner,record.source,record.question,record.options);
      accepted.push({index,id:result.id,source:result.source,status:result.status,fingerprint:result.fingerprint,answer:result.payload.answer});
      const key=`${record.owner}:${result.fingerprint}`;
      fingerprints.set(key,[...(fingerprints.get(key)??[]),index]);
    } catch(error) { rejected.push({index,source:record.source,error:error.message}); }
  }
  return {schemaVersion:1,dryRun:true,total:records.length,accepted,rejected,
    duplicateCandidates:[...fingerprints.values()].filter(indices=>indices.length>1).map(indices=>({indices,action:'review-source-links; never merge by stem'}))};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/audit-question-bank.mjs explicit-inventory.json');
  const inventory=JSON.parse(readFileSync(process.argv[2],'utf8'));
  process.stdout.write(JSON.stringify(auditQuestionSources(inventory.records),null,2)+'\n');
}
