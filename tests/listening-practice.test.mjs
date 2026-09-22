import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/domain/listeningPractice.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { listeningPracticeKey, recordListeningPractice } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('questions from the same audio share a count, including legacy files', () => {
  assert.equal(listeningPracticeKey({ id: 'a', audioAssetId: 'audio-1' }), listeningPracticeKey({ id: 'b', audioAssetId: 'audio-1' }));
  assert.equal(listeningPracticeKey({ id: 'a', audioFileName: 'audio.mp3', audioSize: 100 }), listeningPracticeKey({ id: 'b', audioFileName: 'audio.mp3', audioSize: 100 }));
  assert.notEqual(listeningPracticeKey({ audioAssetId: 'audio-1' }), listeningPracticeKey({ audioAssetId: 'audio-2' }));
});

test('one audio session counts once despite multiple answers and retries; a new session increments', () => {
  const first = recordListeningPractice(undefined, 'session-1', '2026-09-22T01:00:00Z');
  assert.equal(first.reviewCount, 1);
  assert.equal(recordListeningPractice(first, 'session-1', '2026-09-22T01:01:00Z'), first);
  const restored = JSON.parse(JSON.stringify(first));
  assert.equal(recordListeningPractice(restored, 'session-1', '2026-09-22T01:02:00Z').reviewCount, 1);
  assert.equal(recordListeningPractice(restored, 'session-2', '2026-09-22T02:00:00Z').reviewCount, 2);
  assert.equal(first.reviewCount, 1);
});
