import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/domain/listeningReadAlong.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { colorReadAlongTokens, listeningTranscriptForPractice, mergeReadAlongClips, splitReadAlongLines } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('read-along uses shared transcript and falls back to legacy transcript', () => {
  assert.equal(listeningTranscriptForPractice({ transcript: '新しい原文', explanation: '【听力原文】\n古い原文' }), '新しい原文');
  assert.equal(listeningTranscriptForPractice({ transcript: '', explanation: '【题型】\n概要理解\n\n【听力原文】\n古い原文\n\n【全文翻译】\n旧翻译' }), '古い原文');
});

test('sentences keep speaker on the first line and word colors distinguish particles', () => {
  assert.deepEqual(splitReadAlongLines('女：今日は学校へ行きます。明日は休みです。\n男：そうですか？'), [
    '女：今日は学校へ行きます。', '明日は休みです。', '男：そうですか？',
  ]);
  assert.ok(colorReadAlongTokens('学校へ行きます。').some((token) => token.text === 'へ' && token.kind === 'particle'));
});

test('merged sentence audio is one valid PCM WAV with a pause between clips', async () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = class {
    async decodeAudioData() { return { duration: 0.001, sampleRate: 16000, length: 16, numberOfChannels: 1, getChannelData: () => new Float32Array(16).fill(0.5) }; }
    async close() {}
  };
  try {
    const blob = await mergeReadAlongClips([new Blob(['a']), new Blob(['b'])]);
    const bytes = await blob.arrayBuffer();
    const view = new DataView(bytes);
    assert.equal(blob.type, 'audio/wav');
    assert.equal(Buffer.from(bytes, 0, 4).toString(), 'RIFF');
    assert.equal(Buffer.from(bytes, 8, 4).toString(), 'WAVE');
    assert.equal(view.getUint32(24, true), 16000);
    assert.equal(view.getUint32(40, true), (16 + 3200 + 16) * 2);
  } finally {
    globalThis.AudioContext = previous;
  }
});
