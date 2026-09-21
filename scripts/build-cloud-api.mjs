import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { practiceViewHtml } from '../server/mcp-ui.mjs';
export async function buildCloudApi(entry='cloudflare/api-worker.mjs', outfile='.local/cloud-api-build/worker.mjs') {
mkdirSync('.local/cloud-api-build',{recursive:true});
await build({
  entryPoints:[entry], outfile,
  bundle:true,format:'esm',platform:'neutral',target:'es2022',conditions:['workerd','worker','browser'],
  mainFields:['module','main'],external:['node:*','cloudflare:*'],loader:{'.sql':'text'},
  define:{'import.meta.url':JSON.stringify('file:///jlpt/server/module.mjs')},
  plugins:[{
    name:'cloud-platform',setup(api){
      api.onResolve({filter:/firebase-auth\.mjs$/},()=>({path:resolve('cloudflare/firebase-auth.mjs')}));
      api.onResolve({filter:/^jlpt:practice-html$/},()=>({path:'practice-html',namespace:'jlpt'}));
      api.onLoad({filter:/.*/,namespace:'jlpt'},()=>({contents:practiceViewHtml(),loader:'text'}));
    },
  }],
});
// node:sqlite is a Workers stub. getDb() always receives the Durable Object adapter;
// the local DatabaseSync branch is never invoked in the cloud bundle.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildCloudApi();
  console.log('Cloud API bundled without local files or Firebase Admin.');
}
