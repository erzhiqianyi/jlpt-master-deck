import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['scripts/native/questions-entry.ts'],
  outfile: 'apple/Resources/ItemQuestions.js',
  bundle: true,
  format: 'iife',
  globalName: 'JLPTItemQuestions',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
});
