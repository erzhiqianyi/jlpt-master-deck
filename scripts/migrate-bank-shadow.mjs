import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {legacyInventory,migrateBankShadow} from '../server/bank-shadow-migration.mjs';
const args=process.argv.slice(2);const value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--source'))throw new Error('Explicit --source SQLite path required; no production/default database is selected');
const source=realpathSync(resolve(value('--source')));
const db=new DatabaseSync(source,{readOnly:true});
try {
 if(!args.includes('--execute'))console.log(JSON.stringify({dryRun:true,source,inventory:legacyInventory(db)},null,2));
 else {
  if(!args.includes('--target'))throw new Error('Explicit new --target path required');
  const target=resolve(value('--target'));
  const resume=args.includes('--resume');
  if(target===source||(existsSync(target)&&realpathSync(target)===source))throw new Error('Source database cannot be used as target');
  if(resume&&!existsSync(target))throw new Error('Resume requires an existing shadow target');
  if(!resume&&existsSync(target))throw new Error('Target must be new; explicit --resume required for a shadow checkpoint');
  if(!resume)await backup(db,target);
  const shadow=new DatabaseSync(target);
  try {
   if(resume) {
    if(!shadow.prepare("SELECT name FROM sqlite_master WHERE name='bank_shadow_checkpoint'").get())throw new Error('Target has no shadow checkpoint');
    if(JSON.stringify(legacyInventory(shadow))!==JSON.stringify(legacyInventory(db)))throw new Error('Source and shadow legacy data differ; take a new shadow');
   }
   const report=migrateBankShadow(shadow);
   writeFileSync(target+'.migration-report-'+Date.now()+'.json',JSON.stringify(report,null,2),{flag:'wx'});
   console.log(JSON.stringify({target,report},null,2));
  }finally{shadow.close();}
 }
}finally{db.close();}
