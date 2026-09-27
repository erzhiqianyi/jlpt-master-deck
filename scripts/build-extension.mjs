import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const outDir = 'dist-extension';

export async function buildExtension() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: {
      background: 'extension/background.ts',
      content: 'extension/content.ts',
      popup: 'extension/popup.ts',
      manage: 'extension/manage.ts',
    },
    outdir: outDir,
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify: false,
  });
  cpSync('extension/manifest.json', `${outDir}/manifest.json`);
  cpSync('extension/popup.html', `${outDir}/popup.html`);
  cpSync('extension/manage.html', `${outDir}/manage.html`);
  cpSync('extension/manage.css', `${outDir}/manage.css`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildExtension();
  console.log(`Extension built into ${outDir}/. Load it via chrome://extensions → 开发者模式 → 加载已解压的扩展程序。`);
}
