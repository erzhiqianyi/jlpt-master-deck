// Run with the same credentials as deployment. Never log the credential or API payloads.
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) throw new Error('Missing Cloudflare deployment credentials');
const headers={authorization:`Bearer ${token}`};
async function check(label,path,summarize) {
  const response=await fetch(`https://api.cloudflare.com/client/v4${path}`,{headers,signal:AbortSignal.timeout(30000)});
  const body=await response.json();
  console.log(JSON.stringify({check:label,status:response.status,success:body.success,...(body.success?summarize?.(body.result):{errorCodes:body.errors?.map(e=>e.code)})}));
  return response.ok && body.success;
}
await check('Token identity','/user/tokens/verify',r=>({tokenId:r.id,tokenStatus:r.status}));
await check('Account access',`/accounts/${account}`,r=>({accountId:r.id}));
await check('Worker list',`/accounts/${account}/workers/scripts`,r=>({targetWorkerVisible:r.some(w=>w.id==='jlpt-api')}));
const service=await check('jlpt-api service access',`/accounts/${account}/workers/services/jlpt-api`,()=>({targetWorker:'jlpt-api'}));
if(!service){
  console.error('The deployment credential cannot read jlpt-api service metadata. Compare the Token identity and account scope with the intended Cloudflare token; deployment has not been attempted.');
  process.exitCode=1;
}
