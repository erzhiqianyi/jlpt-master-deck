import {createTestCopy,copyOwners,digest} from '../server/cloud-copy.mjs';
import {timingSafeEqual} from 'node:crypto';
/** No normal app auth, R2, KV, migrations or alarms. Cache holds immutable bytes only. */
export function createCopyExporter(db,storage,env,{now=()=>Date.now()}={}){
 let cached=null,lastCreate=-Infinity;const configured=env.COPY_EXPORT_TOKEN;
 const authorized=request=>{const token=/^Bearer (.+)$/.exec(request.headers.get('authorization')??'')?.[1]??'';return typeof configured==='string'&&configured.length>=32&&Buffer.byteLength(token)===Buffer.byteLength(configured)&&timingSafeEqual(Buffer.from(token),Buffer.from(configured));};
 return async request=>{
  if(!authorized(request))return new Response('Export authorization required',{status:403});
  try{const owners=copyOwners(JSON.parse(env.COPY_EXPORT_OWNERS??'null')),url=new URL(request.url);const headers={'cache-control':'no-store','content-type':'application/json'};
   if(url.pathname==='/__test-copy/snapshot'&&request.method==='POST'){
    if(request.headers.get('content-length')&&Number(request.headers.get('content-length'))>4096)return new Response('Request too large',{status:413});
    const body=await request.text();if(body.length>4096)return new Response('Request too large',{status:413});const input=body?JSON.parse(body):{};
    if(Object.keys(input).some(k=>k!=='owners')||JSON.stringify(copyOwners(input.owners))!==JSON.stringify(owners))return new Response('Owner scope mismatch',{status:403});
    if(now()-lastCreate<60000)return new Response('Export rate limited',{status:429});lastCreate=now();
    const exported=storage.transactionSync(()=>createTestCopy(db,{owners,now}));const bytes=Buffer.from(exported.text);const chunks=[];for(let i=0;i<bytes.length;i+=256*1024)chunks.push(bytes.subarray(i,i+256*1024));cached={id:exported.id,chunks,expiresAt:now()+10*60000};
    return Response.json({format:'jlpt-test-copy-chunks',version:1,snapshotId:cached.id,bytes:bytes.length,expiresAt:cached.expiresAt,chunks:chunks.map((chunk,index)=>({index,bytes:chunk.length,sha256:digest(chunk)}))},{headers});
   }
   const match=/^\/__test-copy\/snapshots\/([a-f0-9]{64})\/chunks\/(0|[1-9]\d*)$/.exec(url.pathname);
   if(match&&request.method==='GET'&&cached&&now()<cached.expiresAt&&match[1]===cached.id&&Number(match[2])<cached.chunks.length)return new Response(cached.chunks[Number(match[2])],{headers:{'content-type':'application/octet-stream','cache-control':'no-store','x-snapshot-id':cached.id}});
   return new Response('Snapshot absent/expired or unsupported export route',{status:404});
  }catch{return new Response('Snapshot rejected; inspect schema/budget/scope offline',{status:422});}
 };
}
