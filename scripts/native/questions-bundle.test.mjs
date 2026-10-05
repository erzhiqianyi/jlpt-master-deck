import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('the shipped native question engine matches current web question sources', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = await build({
    absWorkingDir: root, entryPoints: ['scripts/native/questions-entry.ts'],
    outfile: 'apple/Resources/ItemQuestions.js', bundle: true, format: 'iife',
    globalName: 'JLPTItemQuestions', target: 'es2020', minify: true,
    legalComments: 'none', write: false,
  });
  const shipped = await readFile(new URL('../../apple/Resources/ItemQuestions.js', import.meta.url), 'utf8');
  assert.equal(shipped, result.outputFiles[0].text, 'Run npm run build:native-questions after changing question sources');
});
